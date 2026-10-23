/* Ponte com o Control Hub, de ponta a ponta: carrega a extensão de verdade no Chromium, com um Onvio simulado e um "Hub"
 * simulado no claude.ai (só o protocolo: aviso "ola", lote com código de pareamento, confirmação).
 * Precisa do Playwright:  node testes/ponte-hub.js
 * Para não esbarrar no pedido de permissão do Chrome, o teste usa uma CÓPIA da extensão com o claude.ai já nas permissões. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const copia = fs.mkdtempSync(path.join(os.tmpdir(), 'controlonvio-ext-'));
  fs.cpSync(path.join(__dirname, '..', 'extensao'), copia, { recursive: true });
  const mf = JSON.parse(fs.readFileSync(path.join(copia, 'manifest.json'), 'utf8'));
  mf.host_permissions.push('https://claude.ai/*');
  fs.writeFileSync(path.join(copia, 'manifest.json'), JSON.stringify(mf));
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'controlonvio-')), {
    headless: false, channel: 'chromium',
    args: ['--headless=new', '--disable-extensions-except=' + copia, '--load-extension=' + copia, '--no-sandbox']
  });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const id = new URL(sw.url()).host;
  const iso = n => new Date(Date.now() - n * 864e5).toISOString().replace(/\.\d+Z$/, '');
  const itens = { 'tickets/generic': [
    { id: 'g1', identifier: 900, genericStatus: 1, created: iso(30), lastUpdated: iso(30), subject: 'Férias do João Silva', clientExpanded: { name: 'ACME COMERCIO', nickname: 'ACME' }, staffResponsibleExpanded: null },
    { id: 'g2', identifier: 901, genericStatus: 1, created: iso(3), lastUpdated: iso(2), subject: 'Assunto secreto', clientExpanded: { name: 'BETA' }, staffResponsibleExpanded: { name: 'Ana Teste' } }] };
  await ctx.route('https://onvio.com.br/**', r => {
    const u = new URL(r.request().url());
    if (u.pathname.endsWith('/security/v1/session-and-bindings')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ UdsSession: { FirstName: 'Ana', LastName: 'Teste', EmailAddress: 'ana@teste.com' } }) });
    if (u.pathname.endsWith('/topics')) return r.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    if (u.pathname.startsWith('/api/')) {
      const k = Object.keys(itens).find(x => u.pathname.endsWith('/' + x));
      let items = k ? itens[k] : [];
      if (u.searchParams.get('assignedtome') === 'true') items = items.filter(i => i.staffResponsibleExpanded);
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items, totalPages: 1, totalItems: items.length }) });
    }
    return r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>onvio</title>' });
  });
  const TOKEN = 'TESTE1234567890TESTE1234';
  const hubFalso = `<!doctype html><title>hub</title><script>
    window.lotes = [];
    const avisar = () => top.postMessage({ ctlhub: 1, de: 'hub', tipo: 'ola' }, '*');
    avisar(); setInterval(avisar, 1000);
    addEventListener('message', e => { const d = e.data; if (!d || d.ctlhub !== 1) return;
      if (d.de === 'ponte' && d.tipo === 'busca') return avisar();
      if (d.de !== 'ext' || d.tipo !== 'lote') return;
      const ok = d.token === ${JSON.stringify(TOKEN)}; if (ok) window.lotes.push(d);
      e.source.postMessage({ ctlhub: 1, de: 'hub', tipo: 'ack', id: d.id, ok, motivo: ok ? '' : 'token', aceitos: d.nLinhas }, '*'); });
  <\/script>`;
  await ctx.route('https://claude.ai/**', r => {
    const u = new URL(r.request().url());
    const html = u.pathname === '/viewer' ? '<!doctype html><title>viewer</title><iframe src="/hub" style="width:600px;height:300px"></iframe>' : u.pathname === '/hub' ? hubFalso : '';
    return r.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
  });
  await (await ctx.newPage()).goto('https://onvio.com.br/br-portal-do-cliente/home');
  const hub = await ctx.newPage(); await hub.goto('https://claude.ai/viewer'); await sleep(800);
  const opc = await ctx.newPage(); await opc.goto('chrome-extension://' + id + '/options.html');
  const msg = cmd => opc.evaluate(c => new Promise(res => chrome.runtime.sendMessage({ cmd: c }, res)), cmd);

  // sem código nem permissão registrada: nada sai
  assert.equal((await msg('hubEnviar')).motivo, 'sem-codigo');
  // conecta
  await opc.fill('#hubCodigo', TOKEN); await opc.click('#hub-conectar'); await sleep(800);
  assert.match(await opc.textContent('#hub-estado'), /Hub aberto e respondendo/);
  // a leitura do Onvio envia sozinha o resumo
  assert.ok((await msg('atualizar')).ok);
  await sleep(1200);
  const lotes = await hub.frames().find(f => /\/hub$/.test(f.url())).evaluate(() => window.lotes);
  assert.equal(lotes.length, 1, 'um lote entregue');
  const l = lotes[0];
  assert.equal(l.fonte, 'onvio'); assert.equal(l.nLinhas, 2); assert.equal(l.usuario, 'Ana Teste');
  assert.deepEqual(l.colunas.slice(0, 3), ['Lista', 'Nº', 'Situação']);
  assert.doesNotMatch(JSON.stringify(l), /João Silva|secreto|ana@teste\.com/, 'só o resumo: sem assunto, nome de empregado nem e-mail');
  // a mesma leitura de novo não reenvia
  await msg('atualizar'); await sleep(900);
  assert.equal((await hub.frames().find(f => /\/hub$/.test(f.url())).evaluate(() => window.lotes)).length, 1, 'automático só envia o que mudou');
  // código errado
  await opc.fill('#hubCodigo', 'CODIGOERRADO000000000000'); await opc.dispatchEvent('#hubCodigo', 'change');
  const e1 = await msg('hubEnviar'); assert.equal(e1.ok, false); assert.equal(e1.motivo, 'token');
  // Hub fechado
  await opc.fill('#hubCodigo', TOKEN); await opc.dispatchEvent('#hubCodigo', 'change');
  await hub.close(); await sleep(300);
  assert.equal((await msg('hubEnviar')).motivo, 'sem-hub');
  // caminho de reserva: o resumo copiável não leva o código de pareamento
  const r = await msg('hubLote'); assert.ok(r.ok && !('token' in r.lote));
  // desconectar tira o script e a permissão
  await msg('hubDesconectar');
  console.log('ponte com o Control Hub: ok');
  await ctx.close();
})().catch(e => { console.error('FALHOU:', e.message); process.exit(1); });

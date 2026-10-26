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
    // como o Hub real: em segundo plano (aba escondida) não avisa; as mensagens continuam chegando
    // (o Hub publicado em 26/10/2026, versão 267: o aviso periódico só com a aba visível; o pedido "busca" da ponte responde sempre)
    if (location.search.includes('oculto')) window.__oculto = true;
    const anunciar = () => top.postMessage({ ctlhub: 1, de: 'hub', tipo: 'ola' }, '*');
    const avisar = () => { if (window.__oculto) return; anunciar(); };
    avisar(); setInterval(avisar, 1000);
    addEventListener('message', e => { const d = e.data; if (!d || d.ctlhub !== 1) return;
      if (d.de === 'ponte' && d.tipo === 'busca') return anunciar();
      if (d.de !== 'ext' || d.tipo !== 'lote') return;
      const ok = d.token === ${JSON.stringify(TOKEN)}; if (ok) window.lotes.push(d);
      e.source.postMessage({ ctlhub: 1, de: 'hub', tipo: 'ack', id: d.id, ok, motivo: ok ? '' : 'token', aceitos: d.nLinhas }, '*'); });
  <\/script>`;
  await ctx.route('https://claude.ai/**', r => {
    const u = new URL(r.request().url());
    const html = u.pathname === '/viewer' ? '<!doctype html><title>viewer</title><iframe src="/hub' + u.search + '" style="width:600px;height:300px"></iframe>' : u.pathname === '/hub' ? hubFalso : '';
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
  // Hub em segundo plano (aba escondida: para de avisar "ola"): passado o prazo do aviso, o envio ainda chega
  await hub.frames().find(f => /\/hub$/.test(f.url())).evaluate(() => { window.__oculto = true; });
  await sleep(38000);                                       // além do prazo em que o aviso conta como fresco (35 s)
  await msg('hubEnviar');                                   // manual: manda o resumo mesmo sem mudança
  assert.equal((await hub.frames().find(f => /\/hub$/.test(f.url())).evaluate(() => window.lotes)).length, 2, 'Hub em segundo plano recebe do mesmo jeito');
  const stBg = await msg('hubStatus');
  assert.equal(stBg.hubAberto, true); assert.equal(stBg.hubSegundoPlano, true, 'o estado diz "em segundo plano"');
  await opc.reload(); await sleep(500);
  assert.match(await opc.textContent('#hub-estado'), /Hub aberto em segundo plano/);
  // código errado
  await opc.fill('#hubCodigo', 'CODIGOERRADO000000000000'); await opc.dispatchEvent('#hubCodigo', 'change');
  const e1 = await msg('hubEnviar'); assert.equal(e1.ok, false); assert.equal(e1.motivo, 'token');
  // Hub fechado
  await opc.fill('#hubCodigo', TOKEN); await opc.dispatchEvent('#hubCodigo', 'change');
  await hub.close(); await sleep(300);
  assert.equal((await msg('hubEnviar')).motivo, 'sem-hub');
  // o Hub aparece depois de um envio que falhou por falta de Hub: o resumo sai na hora, sem esperar a próxima leitura
  assert.equal((await opc.evaluate(() => chrome.storage.local.get('hubUltimo'))).hubUltimo.ok, false);
  const hub2 = await ctx.newPage(); await hub2.goto('https://claude.ai/viewer');
  await opc.bringToFront();
  let chegou = 0;
  for (let i = 0; i < 20 && !chegou; i++) { await sleep(500); const fr = hub2.frames().find(f => /\/hub$/.test(f.url())); chegou = fr ? await fr.evaluate(() => window.lotes.length).catch(() => 0) : 0; }
  assert.equal(chegou, 1, 'ao abrir o Hub, o resumo chega sozinho');
  assert.equal((await opc.evaluate(() => chrome.storage.local.get('hubUltimo'))).hubUltimo.ok, true);
  // Hub que nasce escondido (aba restaurada em segundo plano): nunca avisou sozinho, mas responde ao pedido da ponte
  await hub2.close();
  const hub3 = await ctx.newPage(); await hub3.goto('https://claude.ai/viewer?oculto=1'); await sleep(1500);
  const f3 = () => hub3.frames().find(f => /\/hub/.test(f.url()));
  assert.equal(await f3().evaluate(() => window.__oculto), true);
  const r3 = await msg('hubEnviar');
  assert.ok(r3.ok, 'Hub escondido desde o início também recebe (responde ao "busca"): ' + JSON.stringify(r3));
  assert.equal((await f3().evaluate(() => window.lotes)).length, 1);
  // caminho de reserva: o resumo copiável não leva o código de pareamento
  const r = await msg('hubLote'); assert.ok(r.ok && !('token' in r.lote));
  // desconectar tira o script e a permissão
  await msg('hubDesconectar');
  console.log('ponte com o Control Hub: ok');
  await ctx.close();
})().catch(e => { console.error('FALHOU:', e.message); process.exit(1); });

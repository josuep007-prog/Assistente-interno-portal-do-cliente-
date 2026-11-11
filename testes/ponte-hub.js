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
  mf.host_permissions.push('https://claude.ai/*', 'https://mediador.trabalho.gov.br/*', 'https://www3.mte.gov.br/*', 'http://www3.mte.gov.br/*');      // 0.95.0: o Mediador já permitido
  fs.writeFileSync(path.join(copia, 'manifest.json'), JSON.stringify(mf));
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'controlonvio-')), {
    headless: false, channel: 'chromium',
    // nada sai para a rede de verdade: o que não é simulado não resolve (0.92.0: as abas que a extensão abre sozinha carregam a 1ª vez
    // sem a simulação do Playwright, então caem no erro e o vigia abaixo recarrega, já simulado)
    args: ['--headless=new', '--disable-extensions-except=' + copia, '--load-extension=' + copia, '--no-sandbox', '--host-resolver-rules=MAP claude.ai 0.0.0.0, MAP app.gestta.com.br 0.0.0.0, MAP api.gestta.com.br 0.0.0.0, MAP onvio.com.br 0.0.0.0, MAP mediador.trabalho.gov.br 0.0.0.0, MAP www3.mte.gov.br 0.0.0.0']
  });
  const recarregadas = new WeakSet();
  const vigia = setInterval(() => { for (const p of ctx.pages()) { const u = p.url(); if (recarregadas.has(p) || !/^https:\/\/(app\.gestta\.com\.br|claude\.ai\/artifact|mediador\.trabalho\.gov\.br)\//.test(u)) continue;
    p.evaluate(() => document.title).then(t => { if (!/hub|viewer|Gestta|Mediador/i.test(t || '') && !recarregadas.has(p)) { recarregadas.add(p); p.reload().catch(() => {}); } }).catch(() => {}); } }, 600);
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
    window.lotes = []; window.progresso = []; window.acks = {}; window.conectado = null;
    window.pedir = (acao, alvo) => new Promise(ok => { const id = 'p' + Math.random().toString(36).slice(2); window.acks[id] = ok; top.postMessage(Object.assign({ ctlhub: 1, de: 'hub', tipo: 'pedido', id, acao }, alvo ? { alvo } : {}), '*'); setTimeout(() => ok({ ok: false, motivo: 'sem-extensao' }), 4000); });
    // como o Hub real: em segundo plano (aba escondida) não avisa; as mensagens continuam chegando
    // (o Hub publicado em 26/10/2026, versão 267: o aviso periódico só com a aba visível; o pedido "busca" da ponte responde sempre)
    if (location.search.includes('oculto')) window.__oculto = true;
    // como o Hub real (versão 278): responde ao desafio da ponte com HMAC-SHA256(token, nonce)
    const hex = b => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
    const prova = async nonce => { const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(${JSON.stringify(TOKEN)}), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(nonce))); };
    const anunciar = async nonce => top.postMessage(Object.assign({ ctlhub: 1, de: 'hub', tipo: 'ola' }, nonce ? { nonce, prova: await prova(nonce) } : {}), '*');
    const avisar = () => { if (window.__oculto) return; anunciar(); };
    avisar(); setInterval(avisar, 1000);
    addEventListener('message', e => { const d = e.data; if (!d || d.ctlhub !== 1) return;
      if (d.de === 'ponte' && d.tipo === 'busca') return anunciar(d.nonce);
      if (d.de === 'ext' && d.tipo === 'progresso') { if (d.token === ${JSON.stringify(TOKEN)}) window.progresso.push(d.envio); return; }
      if (d.de === 'ext' && d.tipo === 'conectado') { window.conectado = d.versao; return; }
      if (d.de === 'ext' && d.tipo === 'pedidoAck') { const f = window.acks[d.id]; if (f) { delete window.acks[d.id]; f(d); } return; }
      if (d.de !== 'ext' || d.tipo !== 'lote') return;
      const ok = d.token === ${JSON.stringify(TOKEN)}; if (ok) window.lotes.push(d);
      e.source.postMessage({ ctlhub: 1, de: 'hub', tipo: 'ack', id: d.id, ok, motivo: ok ? '' : 'token', aceitos: d.nLinhas }, '*'); });
  <\/script>`;
  // outra janela da página que se faz passar pelo Hub (outro artefato): diz "ola" sem saber o token e guarda tudo o que recebe
  const impostor = `<!doctype html><title>impostor</title><script>
    window.recebido = [];
    setInterval(() => top.postMessage({ ctlhub: 1, de: 'hub', tipo: 'ola' }, '*'), 300);
    addEventListener('message', e => { const d = e.data; if (!d || d.ctlhub !== 1) return; window.recebido.push(d.tipo + (d.token ? ':COM-TOKEN' : ''));
      if (d.tipo === 'busca') top.postMessage({ ctlhub: 1, de: 'hub', tipo: 'ola', nonce: d.nonce, prova: '0'.repeat(64) }, '*'); });
    setInterval(() => top.postMessage({ ctlhub: 1, de: 'hub', tipo: 'pedido', id: 'x' + Date.now(), acao: 'atualizar' }, '*'), 700);
  <\/script>`;
  await ctx.route('https://claude.ai/**', r => {
    const u = new URL(r.request().url());
    const html = (u.pathname === '/viewer' || u.pathname === '/artifact/HUBTESTE01') ? '<!doctype html><title>viewer</title><iframe src="/impostor" style="width:300px;height:100px"></iframe><iframe src="/hub' + u.search + '" style="width:600px;height:300px"></iframe>' : u.pathname === '/impostor' ? impostor : u.pathname === '/hub' ? hubFalso : '';
    return r.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
  });
  const GT_TOKEN = 'JWT eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ exp: 1893456000 })).toString('base64url') + '.SEGREDO-GESTTA';
  const GCORS = { 'access-control-allow-origin': 'https://app.gestta.com.br', 'access-control-allow-headers': 'authorization,content-type,accept', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
  let gPapel = 'ROLE_ADMIN', gFalhar = 0; const gPedidos = [];
  await ctx.route('https://app.gestta.com.br/**', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Gestta</title><body>Gestta</body>' }));
  await ctx.route('https://api.gestta.com.br/**', async r => {
    const q = r.request(), u = new URL(q.url()), p = u.pathname;
    if (q.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: GCORS });
    gPedidos.push(q.method() + ' ' + p.replace(/[0-9a-f]{24}/g, '{id}'));
    const json = o => r.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'application/json' }, GCORS), body: JSON.stringify(o) });
    const id = n => String(n).padStart(24, 'c');
    if (p === '/core/company/user/me') return json({ _id: id(1), name: 'Coordenação Ficticia', role: gPapel, email: 'coord@exemplo.com' });
    if (p === '/core/customer/task/report') { const c = JSON.parse(q.postData() || '{}'); return json([{ id: id(7), name: 'DAS', status: 'OPEN', type: 'RECURRENT', 'company_department.name': 'Fiscal', 'owner.name': 'Ana', _due_date: c.dates.startDate, 'customer.name': 'GAMA GESTTA LTDA', 'customer.code': '10', value: 999, 'customer.monthly_payment': 777 }, { id: id(8), name: 'DAS', status: 'OPEN', 'customer.name': 'CONTROLTAX CONSULTORIA' }]); }
    if (p === '/core/customer/task/search') { const c = JSON.parse(q.postData() || '{}'); const k = c.start_date.slice(0, 7);         // 0.86.0: a competência das tarefas
      return json({ docs: c.date_type === 'COMPETENCE_DATE' ? [{ _id: id(7), name: 'DAS', status: 'OPEN', competence_date: k + '-01T03:00:00.000Z', due_date: k + '-20T03:00:00.000Z', customer: { _id: id(2), name: 'GAMA GESTTA LTDA' } }] : [], total: 1, pages: 1, page: 1 }); }
    if (p === '/admin/customer') return json({ docs: [{ _id: id(2), code: '10', name: 'GAMA GESTTA LTDA', cnpj: '11.111.111/0001-11', active: true, monthly_payment: 777, phone: '(27) 90000-0000' }], totalDocs: 1, totalPages: 1 });
    if (p === '/admin/company/user') return json({ docs: [{ _id: id(3), name: 'Ana', role: 'ROLE_USER', active: true, email: 'ana@exemplo.com', phone_number: '(27) 91111-1111', permissions: ['X'], last_login: '2026-11-05' }], totalDocs: 1, totalPages: 1 });
    if (p === '/admin/company/department') { if (gFalhar > 0) { gFalhar--; return r.fulfill({ status: 500, headers: GCORS, body: '{}' }); } return json([{ _id: id(4), name: 'Fiscal' }]); }
    if (p === '/es/file/onvio') return json({ docs: [{ _id: id(5), status: 'ERROR', error: 'Pasta de destino não configurada', customer_task: { _id: id(7), name: 'DAS', customer: { _id: id(2), name: 'GAMA GESTTA LTDA', cnpj: '1' } } }], totalDocs: 1 });
    if (p === '/admin/company/document') return json({ docs: [{ _id: id(6), name: 'RECIBO', documents_integration: { pathName: [] } }], totalDocs: 1, totalPages: 1 });
    if (/^\/admin\/customer\/c+2\/responsible$/.test(p)) return json([{ company_department: { _id: id(4), name: 'Fiscal' }, company_user: { _id: id(3), name: 'Ana', phone_number: '9' } }]);
    if (/^\/admin\/customer\/c+2\/accountable$/.test(p)) return json([{ company_department: { _id: id(4), name: 'Fiscal' }, customer_user: { _id: id(9), name: 'Contato Ficticio', email: 'contato.ficticio@exemplo.com', active: true, notify_whatsapp: true, phone_number: '(27) 92222-2222' } }]);
    return r.fulfill({ status: 404, headers: GCORS, body: '{}' });
  });
  // 0.92.0: o Gestta logado neste Chrome (o token fica no armazenamento da página), mas fechado: o envio único abre sozinho e fecha no fim
  { const g0 = await ctx.newPage(); await g0.goto('https://app.gestta.com.br/#/sidebar/task/list'); await g0.evaluate(t => localStorage.setItem('ngStorage-jwt', JSON.stringify(t)), GT_TOKEN); await g0.close(); }
  await (await ctx.newPage()).goto('https://onvio.com.br/br-portal-do-cliente/home');
  const hub = await ctx.newPage(); await hub.goto('https://claude.ai/viewer'); await sleep(800);
  const opc = await ctx.newPage(); await opc.goto('chrome-extension://' + id + '/options.html');
  const msg = cmd => opc.evaluate(c => new Promise(res => chrome.runtime.sendMessage(typeof c === 'string' ? { cmd: c } : c, res)), cmd);

  // sem código nem permissão registrada: nada sai
  assert.equal((await msg('hubEnviar')).motivo, 'sem-codigo');
  // conecta
  await opc.fill('#hubCodigo', TOKEN); await opc.uncheck('#hubSyncAuto'); await opc.click('#hub-conectar'); await sleep(800);      // sem o envio completo automático nesta parte do teste
  assert.match(await opc.textContent('#hub-estado'), /Hub aberto e respondendo/);
  // a leitura do Onvio envia sozinha o resumo
  assert.ok((await msg('atualizar')).ok);
  await sleep(1200);
  const lotes = await hub.frames().find(f => /\/hub$/.test(f.url())).evaluate(() => window.lotes);
  assert.equal(lotes.length, 1, 'um lote entregue');
  // a janela que se fez passar pelo Hub foi desafiada e nunca recebeu lote nem token
  const impo = await hub.frames().find(f => /\/impostor$/.test(f.url())).evaluate(() => window.recebido);
  assert.ok(impo.includes('busca'), 'foi desafiada');
  assert.ok(!impo.includes('lote') && !impo.some(x => /COM-TOKEN/.test(x)), 'nada de lote nem de token para o impostor: ' + JSON.stringify(impo));
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
  // ---- envio completo em partes (0.52.0) ----
  const lotesHub3 = () => f3().evaluate(() => window.lotes);
  const envioParado = async () => { const x = await opc.evaluate(() => chrome.storage.local.get(['hubEnvio', 'hubSync', 'hubSyncGestta'])); return (!x.hubEnvio || !['preparando', 'enviando'].includes(x.hubEnvio.estado)) && !(x.hubSync && x.hubSync.estado === 'enviando') && !(x.hubSyncGestta && x.hubSyncGestta.estado === 'enviando') ? x : null; };
  const esperarSync = async () => { await sleep(300); for (let i = 0; i < 240; i++) { await sleep(500); const x = await envioParado(); if (x && x.hubSync && x.hubSync.terminouEm) return x.hubSync; } throw new Error('envio completo não terminou'); };
  // a tela mostra as 7 categorias; a de dados pessoais vem desligada
  await opc.reload(); await sleep(600);
  assert.equal(await opc.locator('#hub-cats input[data-cat]').count(), 7);
  assert.equal(await opc.locator('#hub-cats input[data-cat="pessoais"]').isChecked(), false);
  assert.equal(await opc.locator('#hub-cats input[data-cat="listas"]').isChecked(), true);
  const antes = (await lotesHub3()).length;
  assert.equal((await msg('hubSincronizar')).ok, true);
  const h1 = await esperarSync();
  assert.ok(['ok', 'parcial'].includes(h1.estado), 'envio completo terminou: ' + JSON.stringify(h1).slice(0, 300));
  const novos = (await lotesHub3()).slice(antes).filter(x => x.fonte === 'onvio' && x.partes != null);
  const doGestta = (await lotesHub3()).slice(antes).filter(x => x.fonte === 'gestta');
  assert.ok(doGestta.length >= 8, '0.92.0: o Gestta vai junto no mesmo envio (' + doGestta.length + ')');
  const ev1 = (await opc.evaluate(() => chrome.storage.local.get('hubEnvio'))).hubEnvio;
  assert.equal(ev1.abas.gestta, 'abriu', 'o Gestta fechado abriu em segundo plano: ' + JSON.stringify(ev1));
  assert.equal(ev1.abas.hub, 'aberta'); assert.equal(ev1.abas.onvio, 'aberta');
  assert.equal(ctx.pages().filter(p => p.url().startsWith('https://app.gestta.com.br/')).length, 0, 'e fechou no fim');
  assert.ok(novos.length >= 20, 'várias partes entregues (' + novos.length + ')');
  assert.ok(novos.every(x => x.partes >= 1 && x.parte >= 0 && x.parte < x.partes && /^c[a-z0-9]+$/.test(x.ciclo) && x.categoria && x.token === TOKEN));
  assert.ok(novos.every(x => x.categoria !== 'pessoais'), 'sem a categoria pessoal, nada pessoal');
  assert.doesNotMatch(JSON.stringify(novos), /João Silva|Assunto secreto|ana@teste\.com|SeamlessAuthenticationToken/, 'nem assunto, nem nome de empregado, nem e-mail, nem sessão');
  const geral = novos.find(x => x.tipoDado === 'lista-geral');
  assert.ok(geral && geral.colunas.includes('Cliente') && geral.nLinhasTotal === 2);
  // dados pessoais: aviso e confirmação antes de ligar
  await opc.locator('#hub-cats input[data-cat="pessoais"]').click();
  assert.equal(await opc.locator('#hub-pessoais-aviso').isVisible(), true);
  assert.equal(await opc.locator('#hub-cats input[data-cat="pessoais"]').isChecked(), false, 'continua desligado até confirmar');
  await opc.click('#hub-pessoais-sim'); await sleep(300);
  assert.equal((await opc.evaluate(() => chrome.storage.local.get('hubCfg'))).hubCfg.envio.pessoais, true);
  const antes2 = (await lotesHub3()).length;
  await msg('hubSincronizar'); await esperarSync();
  const novos2 = (await lotesHub3()).slice(antes2).filter(x => x.fonte === 'onvio');
  const pessoais = novos2.filter(x => x.categoria === 'pessoais');
  assert.ok(pessoais.length >= 10, 'com a confirmação, os conjuntos pessoais vão (' + pessoais.length + ')');
  assert.match(JSON.stringify(pessoais), /Férias do João Silva/, 'o assunto vai na categoria pessoal');
  // sem mudança desde o último envio completo: o automático não reenvia o que já foi aceito (manual envia sempre)
  const hs = (await opc.evaluate(() => chrome.storage.local.get('hubSyncHash'))).hubSyncHash;
  assert.ok(hs && Object.keys(hs).length >= 20 && Object.values(hs).every(v => typeof v.h === 'string' && typeof v.em === 'number'), 'só números guardados');
  // automático: com o envio completo automático ligado, ao abrir o Hub (e nunca antes de passar o intervalo) sai tudo sozinho
  await opc.check('#hubSyncAuto'); await sleep(300);
  assert.equal((await opc.evaluate(() => chrome.storage.local.get('hubCfg'))).hubCfg.syncAuto, true);
  await opc.evaluate(() => chrome.storage.local.remove(['hubSync', 'hubSyncHash', 'hubEnvio']));
  await hub3.close();
  const hub4 = await ctx.newPage(); await hub4.goto('https://claude.ai/viewer'); await opc.bringToFront();
  const f4 = () => hub4.frames().find(f => /\/hub/.test(f.url()));
  let auto = 0;
  for (let i = 0; i < 60 && auto < 20; i++) { await sleep(500); auto = f4() ? await f4().evaluate(() => window.lotes.length).catch(() => 0) : 0; }
  assert.ok(auto >= 20, 'ao abrir o Hub o envio completo sai sozinho (' + auto + ')');
  await esperarSync();
  const emPartes = () => f4().evaluate(() => window.lotes.filter(x => x.partes != null).length);
  const ant = await emPartes(); await msg('hubAbriu'); await sleep(6000);
  assert.equal(await emPartes(), ant, 'dentro do intervalo não envia de novo o envio completo');
  // 0.84.0: "Reenviar o que deu erro" refaz só o que falhou e junta ao resultado do envio anterior
  const hOk = (await opc.evaluate(() => chrome.storage.local.get('hubSync'))).hubSync;
  await opc.evaluate(h => chrome.storage.local.set({ hubSync: h }), Object.assign({}, hOk, { resultados: hOk.resultados.map(r => Object.assign({}, r, { ok: true })) }));
  assert.equal((await msg({ cmd: 'hubSincronizar', reenviar: true })).motivo, 'nada-reenviar', 'sem erro, nada a reenviar');
  const comErro = Object.assign({}, hOk, { estado: 'parcial', resultados: hOk.resultados.map(r => r.id === 'clientes-cnd' ? Object.assign({}, r, { ok: false, motivo: 'sem-resposta' }) : r) });
  assert.ok(comErro.resultados.some(r => !r.ok), 'o envio tinha clientes-cnd');
  await opc.evaluate(h => chrome.storage.local.set({ hubSync: h }), comErro);
  const antR = (await f4().evaluate(() => window.lotes)).length;
  const rr = await msg({ cmd: 'hubSincronizar', reenviar: true });
  const falhasAntes = new Set(comErro.resultados.filter(r => !r.ok).map(r => r.id));          // a folha sem extrato no Onvio simulado também conta
  assert.equal(rr.ok, true); assert.equal(rr.n, falhasAntes.size);
  const hR = await esperarSync();
  const soNovos = (await f4().evaluate(() => window.lotes)).slice(antR);
  assert.deepEqual([...new Set(soNovos.map(x => x.tipoDado))], ['clientes-cnd'], 'só o que deu erro foi reenviado');
  assert.equal(hR.reenvio, true); assert.ok(hR.resultados.find(r => r.id === 'clientes-cnd').ok, 'o que falhou agora foi aceito');
  assert.equal(hR.resultados.length, hOk.resultados.length, 'o resto do envio anterior continua no resultado');
  assert.equal(hR.completoAnterior, hOk.completoAnterior || hOk.terminouEm, 'o reenvio não conta como envio completo para o automático');
  console.log('reenviar o que deu erro (Onvio): ok');
  // ---- Gestta no Hub (0.79.0): conjuntos lidos na aba do Gestta, fonte "gestta", só com acesso de coordenação ----
  const gAba = await ctx.newPage(); await gAba.goto('https://app.gestta.com.br/#/sidebar/task/list');
  await gAba.evaluate(t => localStorage.setItem('ngStorage-jwt', JSON.stringify(t)), GT_TOKEN);
  await opc.bringToFront();
  const esperarGestta = async () => { await sleep(300); for (let i = 0; i < 240; i++) { await sleep(500); const x = await envioParado(); if (x && x.hubSyncGestta && x.hubSyncGestta.terminouEm) return x.hubSyncGestta; } throw new Error('envio do Gestta não terminou'); };
  const lotesG = async () => (await f4().evaluate(() => window.lotes)).filter(x => x.fonte === 'gestta');
  await opc.evaluate(() => chrome.storage.local.remove('gesttaCartelaEm'));          // o envio único anterior já leu a cartela (Hub em outra aba)
  assert.equal((await msg('gesttaHubSync')).ok, true);
  const hg = await esperarGestta();
  assert.equal(hg.estado, 'ok', 'envio do Gestta: ' + JSON.stringify(hg).slice(0, 400));
  const lg = await lotesG();
  assert.deepEqual([...new Set(lg.map(x => x.tipoDado))].sort(), ['gestta-cartela', 'gestta-clientes', 'gestta-contatos', 'gestta-empresas-ativas', 'gestta-envios-onvio-erro', 'gestta-equipe', 'gestta-setores', 'gestta-tarefas', 'gestta-templates-sem-pasta']);
  assert.deepEqual([...new Set(lg.map(x => x.categoria))].sort(), ['alertas', 'cadastros', 'tarefas']);
  assert.ok(lg.every(x => x.token === TOKEN && /^g[a-z0-9]+$/.test(x.ciclo) && x.versaoExt), 'mesmo protocolo em partes');
  const gtxt = JSON.stringify(lg).replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '');      // sem os carimbos de hora (".777Z" não é o valor simulado)
  for (const sx of ['SEGREDO-GESTTA', 'eyJ', 'coord@exemplo', 'ana@exemplo', '(27)', '777', '999', 'CONTROLTAX', 'last_login', 'permissions']) assert.ok(!gtxt.includes(sx), 'não vai ao Hub: ' + sx);
  assert.match(lg.find(x => x.tipoDado === 'gestta-contatos').tabela, /\tFiscal\t[^\t]*\tContato Ficticio\tcontato\.ficticio@exemplo\.com\tsim\t/, '0.88.0: quem do cliente recebe cada setor, com o e-mail');
  const tg = lg.find(x => x.tipoDado === 'gestta-tarefas');
  assert.ok(tg.tabela.split('\n').length >= 2 && !/CONTROLTAX/.test(tg.tabela), 'mês anterior e atual (e as metas das competências em outro mês), sem a empresa do escritório');
  assert.equal(gPedidos.filter(x => x === 'POST /core/customer/task/report').length >= 2, true, 'um relatório por mês de meta');
  assert.ok(gPedidos.every(x => /^GET |^POST \/core\/customer\/task\/(report|search)$/.test(x)), 'só GET, a busca e o relatório: ' + gPedidos.join(', '));
  assert.match(tg.tabela, /\t20\d\d-\d\d$/m, '0.86.0: a tarefa vai com a competência');
  const guardado = JSON.stringify(await opc.evaluate(() => chrome.storage.local.get(null)));
  for (const sx of ['GAMA GESTTA', 'SEGREDO', 'Pasta de destino']) assert.ok(!guardado.includes(sx), 'nada do Gestta no armazenamento: ' + sx + ' em ' + guardado.slice(Math.max(0, guardado.indexOf(sx) - 300), guardado.indexOf(sx) + 100));
  assert.ok((await opc.evaluate(() => chrome.storage.local.get('gesttaCartelaEm'))).gesttaCartelaEm > 0, 'a hora da cartela');
  // de novo no mesmo dia: a cartela não é relida
  gPedidos.length = 0;
  await msg('gesttaHubSync'); await sleep(400); await esperarGestta();
  assert.ok(!gPedidos.some(x => /responsible|accountable/.test(x)), 'cartela e contatos no máximo 1 vez por dia');
  // 0.84.0: reenviar só o que deu erro no Gestta
  const hgOk = (await opc.evaluate(() => chrome.storage.local.get('hubSyncGestta'))).hubSyncGestta;
  await opc.evaluate(h => chrome.storage.local.set({ hubSyncGestta: h }), Object.assign({}, hgOk, { estado: 'parcial', resultados: hgOk.resultados.map(r => r.id === 'gestta-setores' ? Object.assign({}, r, { ok: false, motivo: 'sem-resposta' }) : r) }));
  const nG = (await lotesG()).length; gPedidos.length = 0;
  assert.equal((await msg({ cmd: 'gesttaHubSync', reenviar: true })).n, 1);
  await sleep(400); const hgR = await esperarGestta();
  assert.deepEqual([...new Set((await lotesG()).slice(nG).map(x => x.tipoDado))].sort(), ['gestta-equipe', 'gestta-setores'], 'só a etapa que falhou');
  assert.ok(!gPedidos.some(x => /report|\/admin\/customer$/.test(x)), 'sem reler tarefas nem clientes: ' + gPedidos.join(', '));
  assert.equal(hgR.estado, 'ok'); assert.equal(hgR.resultados.length, hgOk.resultados.length);
  // login de analista: nada sai
  gPapel = 'ROLE_USER'; const nAntes = (await lotesG()).length;
  await msg('gesttaHubSync'); await sleep(400);
  const ha = await esperarGestta();
  assert.equal(ha.estado, 'erro'); assert.equal(ha.motivo, 'acesso-parcial');
  assert.equal((await lotesG()).length, nAntes, 'com acesso de analista nada vai ao Hub');
  gPapel = 'ROLE_ADMIN';
  console.log('Gestta no Hub: 9 conjuntos (com os contatos do cliente por setor), só GET e o relatório, sem token, telefone, valor nem empresa do escritório; analista não envia');
  // ---- 0.92.0: envio único pedido pelo Hub, andamento no Hub, Hub fechado aberto pela extensão ----
  await hub4.close();
  const hub5 = await ctx.newPage(); await hub5.goto('https://claude.ai/artifact/HUBTESTE01'); await opc.bringToFront();
  const f5 = () => hub5.frames().find(f => /\/hub/.test(f.url()));
  let con = null; for (let i = 0; i < 20 && !con; i++) { await sleep(400); con = await f5().evaluate(() => window.conectado).catch(() => null); }
  assert.equal(con, (await opc.evaluate(() => chrome.runtime.getManifest().version)), 'a extensão avisa o Hub que está conectada, com a versão');
  assert.equal((await opc.evaluate(() => chrome.storage.local.get('hubCfg'))).hubCfg.hubUrl, 'https://claude.ai/artifact/HUBTESTE01', 'aprende o endereço do Hub (sem querystring)');
  const est = await f5().evaluate(() => window.pedir('estado'));
  assert.equal(est.ok, true); assert.equal(est.envio.rodando, false); assert.deepEqual(est.envio.fontes.map(f => f.id), ['onvio', 'gestta']);
  assert.equal((await f5().evaluate(() => window.pedir('cancelar'))).motivo, 'nada-rodando');
  // o impostor da página pede "atualizar" a cada 0,7 s desde o começo: nunca vale (a ponte só aceita a janela que provou o código)
  const evAntes = (await opc.evaluate(() => chrome.storage.local.get('hubEnvio'))).hubEnvio;
  await sleep(2500);
  assert.equal((await opc.evaluate(() => chrome.storage.local.get('hubEnvio'))).hubEnvio.id, evAntes.id, 'pedido do impostor não começa envio');
  const nProg = (await f5().evaluate(() => window.progresso)).length;
  const pa = await f5().evaluate(() => window.pedir('atualizar'));
  assert.equal(pa.ok, true); assert.equal(pa.iniciado, true);
  assert.equal((await f5().evaluate(() => window.pedir('atualizar'))).jaRodando, true, 'um envio por vez');
  await esperarSync();
  await sleep(1800);
  const prog = (await f5().evaluate(() => window.progresso)).slice(nProg);
  assert.ok(prog.length >= 3, 'o andamento chega ao Hub (' + prog.length + ')');
  assert.ok(['preparando', 'enviando'].includes(prog[0].estado), 'o começo do envio chega ao Hub (no simulado o envio todo leva ~1 s; o andamento sai no máximo a cada 1,5 s)');
  const fimP = prog[prog.length - 1];
  assert.equal(fimP.origem, 'hub'); assert.ok(['ok', 'parcial'].includes(fimP.estado), JSON.stringify(fimP).slice(0, 300));
  assert.ok(fimP.fontes.every(f => f.conjuntos.length > 0), 'cada fonte com os conjuntos');
  assert.doesNotMatch(JSON.stringify(prog), /João Silva|Assunto secreto|GAMA GESTTA|ACME|SEGREDO|TESTE1234567890TESTE1234/, 'o andamento não leva dado lido nem o código');
  // Hub fechado: a extensão abre pelo endereço aprendido, em segundo plano, e fecha no fim
  await hub5.close(); await sleep(300);
  const ra = await msg('hubAtualizar'); assert.equal(ra.ok, true, JSON.stringify(ra));
  await esperarSync();
  const evH = (await opc.evaluate(() => chrome.storage.local.get('hubEnvio'))).hubEnvio;
  assert.equal(evH.abas.hub, 'abriu', JSON.stringify(evH)); assert.ok(['ok', 'parcial'].includes(evH.estado), JSON.stringify(evH).slice(0, 300));
  assert.equal(ctx.pages().filter(p => p.url().includes('/artifact/HUBTESTE01')).length, 0, 'a aba do Hub aberta pela extensão fechou no fim');
  console.log('envio único: o Hub pede e acompanha, o impostor não começa nada, Hub e Gestta fechados abrem e fecham sozinhos');
  // ---- 0.94.0: o que deu erro é reenviado sozinho; o que continua com erro traz o diagnóstico; o Hub pede só o que falta ----
  const hub6 = await ctx.newPage(); await hub6.goto('https://claude.ai/artifact/HUBTESTE01'); await opc.bringToFront();
  const f6 = () => hub6.frames().find(f => /\/hub/.test(f.url()));
  for (let i = 0; i < 20 && !(await f6().evaluate(() => window.conectado).catch(() => null)); i++) await sleep(400);
  const esperarEnvio = async () => { await sleep(500); for (let i = 0; i < 300; i++) { await sleep(500); const x = await envioParado(); if (x && x.hubEnvio && x.hubEnvio.terminouEm) return x.hubEnvio; } throw new Error('envio não terminou'); };
  // um erro passageiro (os setores do Gestta falham 1 vez): o reenvio automático resolve, sem ninguém clicar
  gFalhar = 1;
  assert.equal((await f6().evaluate(() => window.pedir('atualizar'))).iniciado, true);
  const evR = await esperarEnvio();
  const hsR = (await opc.evaluate(() => chrome.storage.local.get('hubSync'))).hubSync;
  assert.equal(evR.reenvios.gestta, 1, 'um reenvio automático no Gestta: ' + JSON.stringify(evR).slice(0, 300) + ' · Onvio com erro: ' + JSON.stringify(hsR.resultados.filter(r => !r.ok).map(r => [r.id, r.motivo])));
  const hgR2 = (await opc.evaluate(() => chrome.storage.local.get('hubSyncGestta'))).hubSyncGestta;
  assert.ok(hgR2.resultados.find(r => r.id === 'gestta-setores').ok, 'depois do reenvio os setores chegaram');
  assert.ok(['ok', 'parcial'].includes(evR.estado));
  // um erro que continua (3 falhas): 2 reenvios, e o fim do envio no Hub traz o diagnóstico e o que o conjunto alimenta
  gFalhar = 3;
  const nP = (await f6().evaluate(() => window.progresso)).length;
  assert.equal((await f6().evaluate(() => window.pedir('atualizar'))).iniciado, true);
  const evP = await esperarEnvio(); await sleep(1800);
  assert.equal(evP.reenvios.gestta, 2, 'no máximo 2 reenvios'); assert.equal(evP.tentativas, 2); assert.equal(evP.estado, 'parcial');
  const fimD = (await f6().evaluate(() => window.progresso)).slice(nP).pop();
  assert.equal(fimD.tentativas, 2);
  const cs = fimD.fontes.find(f => f.id === 'gestta').conjuntos.find(c => c.id === 'gestta-setores');
  assert.equal(cs.ok, false); assert.ok(cs.alimenta && cs.alimenta.length > 5, 'diz o que o conjunto alimenta');
  assert.match(fimD.diagnostico, /diagnóstico do envio ao Hub[\s\S]*reenvios automáticos: 2[\s\S]*gestta-setores/);
  assert.doesNotMatch(fimD.diagnostico, /GAMA GESTTA|ACME|João|SEGREDO|TESTE1234567890TESTE1234|eyJ/, 'o diagnóstico não leva dado lido, código nem token');
  // o Hub pede só o que falta: só esses conjuntos saem, sem o resto do Onvio nem do Gestta
  gFalhar = 0;
  const nL = (await f6().evaluate(() => window.lotes)).length;
  assert.equal((await f6().evaluate(() => window.pedir('atualizar', { onvio: ['clientes-cnd'], gestta: ['gestta-setores'] }))).iniciado, true);
  const evA = await esperarEnvio();
  assert.ok(evA.alvo, 'o envio sabe que é só o que falta'); assert.equal(evA.reenvios.gestta, 0);
  const soA = [...new Set((await f6().evaluate(() => window.lotes)).slice(nL).map(x => x.tipoDado || 'resumo'))].sort();
  assert.deepEqual(soA, ['clientes-cnd', 'gestta-equipe', 'gestta-setores'], 'só o que foi pedido (a etapa do Gestta lê equipe e setores juntos): ' + soA);
  assert.equal((await f6().evaluate(() => window.pedir('atualizar', { onvio: ['<x>'], gestta: ['outra'] }))).motivo, 'nada-reenviar', 'pedido sem conjunto conhecido não começa nada');
  // 0.95.0: o Mediador do MTE (simulado). O Hub manda os CNPJs, pede a busca; a extensão abre o Mediador numa aba, faz a busca pela página,
  // lê a exportação e o texto da convenção vigente e entrega ao Hub com a fonte "mediador"; texto antigo e anexo vêm na hora pelo pedido.
  const MED_CONSULTA = `<!doctype html><title>Mediador</title><input type="checkbox" id="chkNRCNPJ"><input id="txtNRCNPJ"><select id="cboTPRequerimento"><option value="convencao">C</option><option value="termoAditivoConvecao">A</option></select><select id="cboSTVigencia"><option value="1">V</option><option value="2">T</option></select><input type="button" value="Pesquisar" id="b"><script>
    document.getElementById('b').onclick = () => setTimeout(() => { const x = new XMLHttpRequest(); x.open('POST', '/sistemas/mediador/ConsultarInstColetivo/getConsultaAvancada'); x.send('nrCnpj=' + document.getElementById('txtNRCNPJ').value + '&tpRequerimento=' + document.getElementById('cboTPRequerimento').value + '&recaptchaToken=t'); }, 100);<\/script>`;
  let medTipo = '';
  const medLinha = (reg, sol, tipo, ini, fim) => `<tr><td>${reg}</td><td>10000.000001/2026-11</td><td>${sol}</td><td>${tipo}</td><td>${ini} a ${fim}</td><td>11.222.333/0001-81</td><td>SINDICATO EXEMPLO DOS EMPREGADOS</td><td>11.444.777/0001-61</td><td>SINDICATO EXEMPLO PATRONAL</td><td>1</td><td>1</td></tr>`;
  const medCab = '<tr><td>Nº do Registro</td><td>Nº do Processo</td><td>Nº da Solicitação</td><td>Tipo de Instrumento Coletivo</td><td>Vigência</td><td>CNPJ Trabalhador</td><td>Trabalhador</td><td>CNPJ Empregador</td><td>Empregador</td><td>a</td><td>b</td></tr>';
  const medPedidos = [];
  await ctx.route('https://mediador.trabalho.gov.br/**', async r => {
    const u = new URL(r.request().url());
    if (u.pathname === '/sistemas/mediador/ConsultarInstColetivo') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: MED_CONSULTA });
    if (u.pathname.endsWith('/getConsultaAvancada')) { const corpo = r.request().postData() || ''; medPedidos.push(corpo); medTipo = (corpo.match(/tpRequerimento=(\w+)/) || [])[1] || ''; return r.fulfill({ contentType: 'text/html', body: '<p>ok</p>' }); }
    if (u.pathname.endsWith('/exportarConsultaAvancada')) {
      const linhas = medTipo === 'convencao' ? medLinha('XX000111/2024', 'MR000111/2024', 'Convenção Coletiva', '01/05/2024', '30/04/2025') + medLinha('XX000333/2026', 'MR000333/2026', 'Convenção Coletiva', '01/05/2026', '30/04/2027') : medLinha('XX000444/2026', 'MR000444/2026', 'Termo Aditivo de Convenção Coletiva', '01/08/2026', '30/04/2027');
      return r.fulfill({ headers: { 'content-type': 'application/ms-excel; charset=iso-8859-1' }, body: Buffer.from('<table>' + medCab + linhas + '</table>', 'latin1') });
    }
    if (u.pathname.endsWith('/resumoVisualizarSalvarMsWordDoc')) { const n = u.searchParams.get('NrSolicitacao'); return r.fulfill({ headers: { 'content-type': 'application/msword; charset=windows-1252' }, body: Buffer.from(`<label class="textogrupo">Salários</label><label class="tituloClausula"><b>CLÁUSULA PRIMEIRA - PISO ${n}</b></label><label class="descricaoClausula">Piso de R$ 1.000,00.</label><label class="tituloClausula"><b>CLÁUSULA SEGUNDA - DATA-BASE</b></label><label class="descricaoClausula">Data-base em 1º de maio.</label>`, 'latin1') }); }
    return r.fulfill({ status: 404, body: '' });
  });
  const pedirMed = (acao, extra, ms) => f6().evaluate(([a, x, t]) => new Promise(ok => { const id = 'm' + Math.random().toString(36).slice(2); window.acks[id] = ok; top.postMessage(Object.assign({ ctlhub: 1, de: 'hub', tipo: 'pedido', id, acao: a }, x), '*'); setTimeout(() => ok({ ok: false, motivo: 'sem-extensao' }), t); }), [acao, extra, ms || 4000]);
  assert.equal((await pedirMed('mediadorCnpjs', { cnpjs: ['11.222.333/0001-81', '123', '<x>'] })).ok, true);
  assert.deepEqual((await opc.evaluate(() => chrome.storage.local.get('mediadorCfg'))).mediadorCfg.cnpjs, ['11222333000181'], 'só CNPJs válidos ficam guardados');
  const nM = (await f6().evaluate(() => window.lotes)).length;
  const rM = await pedirMed('mediador', { cnpjs: ['11222333000181'] });
  assert.equal(rM.iniciado, true, JSON.stringify(rM));
  let medFim = null;
  for (let i = 0; i < 160 && !medFim; i++) { await sleep(500); const x = (await opc.evaluate(() => chrome.storage.local.get('mediadorEnvio'))).mediadorEnvio; if (x && x.terminouEm) medFim = x; }
  assert.ok(medFim, 'a busca no Mediador terminou');
  assert.equal(medFim.estado, 'ok', JSON.stringify(medFim));
  assert.equal(medPedidos.length, 2, 'uma busca por tipo, feita pela página: ' + medPedidos.join(' | '));
  assert.ok(medPedidos.every(c => /nrCnpj=11222333000181/.test(c) && /recaptchaToken=t/.test(c)));
  const lm = (await f6().evaluate(() => window.lotes)).slice(nM).filter(l => l.fonte === 'mediador');
  const ins = lm.find(l => l.tipoDado === 'mediador-instrumentos'), cl = lm.find(l => l.tipoDado === 'mediador-clausulas');
  assert.ok(ins && cl, 'os dois conjuntos foram ao Hub');
  assert.equal(ins.categoria, 'convencoes'); assert.equal(ins.nLinhas, 3);
  assert.match(ins.tabela, /XX000333\/2026\tMR000333\/2026|XX000333\/2026\t10000/);
  assert.match(cl.tabela, /PISO MR000333_2026/); assert.match(cl.tabela, /PISO MR000444_2026/, 'o aditivo da vigente também');
  assert.doesNotMatch(cl.tabela, /MR000111/, 'a convenção antiga não ocupa o banco');
  assert.match(cl.tabela, /\tMaio\t/, 'a data-base sai da cláusula');
  // texto antigo e anexo: na hora, pelo pedido (nada guardado)
  const tx = await pedirMed('mediadorTexto', { solicitacao: 'MR000111/2024' }, 60000);
  assert.equal(tx.ok, true, JSON.stringify(tx).slice(0, 300)); assert.match(tx.clausulas[0].titulo, /PISO MR000111_2024/);
  assert.equal((await pedirMed('mediadorTexto', { solicitacao: 'MR1&x=2' })).motivo, 'solicitacao');
  assert.equal((await pedirMed('mediadorAnexo', { url: 'https://exemplo.com/a.pdf' })).motivo, 'recusado', 'anexo só do endereço do MTE');
  const guardadoMed = JSON.stringify(await opc.evaluate(() => chrome.storage.local.get(null)));
  assert.doesNotMatch(guardadoMed, /PISO|SINDICATO EXEMPLO|XX000333/, 'a extensão não guarda nada lido do Mediador');
  console.log('Mediador (0.95.0): busca pela página, exportação, texto da vigente ao Hub, texto antigo na hora: ok');
  await hub6.close();
  console.log('reenvio automático do que deu erro, diagnóstico no fim e "só o que falta" pedido pelo Hub: ok');
  // caminho de reserva: o resumo copiável não leva o código de pareamento
  const r = await msg('hubLote'); assert.ok(r.ok && !('token' in r.lote));
  // desconectar tira o script e a permissão
  await msg('hubDesconectar');
  const depois = await opc.evaluate(() => chrome.storage.local.get(['hubCfg', 'hubSync', 'hubSyncHash', 'hubUltimo']));
  assert.equal(depois.hubCfg.token, '', 'desconectar apaga o código de pareamento do armazenamento');
  assert.equal(depois.hubCfg.envioConfirmado, false);
  assert.ok(!depois.hubSync && !depois.hubSyncHash && !depois.hubUltimo, 'e o andamento');
  assert.equal((await msg('hubEnviar')).motivo, 'sem-codigo', 'sem código nada sai');
  // envio "preso" (o service worker morreu no meio) vira interrompido ao reiniciar
  await opc.evaluate(() => chrome.storage.local.set({ hubSync: { estado: 'enviando', etapa: 'x', feito: 3, total: 9, pulso: Date.now() - 600000 } }));
  await msg('hubReiniciar');
  assert.equal((await opc.evaluate(() => chrome.storage.local.get('hubSync'))).hubSync.estado, 'interrompido');
  console.log('ponte com o Control Hub: ok');
  clearInterval(vigia);
  await ctx.close();
})().catch(e => { console.error('FALHOU:', e.message); process.exit(1); });

/* Testes em navegador com páginas simuladas do Onvio (grade, guias e painel lateral).
 * Precisam do Playwright:  npm i -D playwright   (ou NODE_PATH apontando para uma instalação global)
 * Rodar:  node testes/navegador.js
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const EXT = path.join(__dirname, '..', 'extensao') + path.sep;
const lerExt = f => fs.readFileSync(EXT + f, 'utf8');

// chrome simulado (storage em memória + onChanged)
const STUB = `
(() => {
  const mem = {}; const carregar = () => { Object.keys(mem).forEach(k => delete mem[k]); Object.assign(mem, JSON.parse(localStorage.getItem('__mem') || '{}')); };
  const ouvintes = [];
  const salvar = () => localStorage.setItem('__mem', JSON.stringify(mem));
  const pick = k => { if (k == null) return {...mem}; const ks = typeof k === 'string' ? [k] : Array.isArray(k) ? k : Object.keys(k); const o = {}; ks.forEach(x => { if (x in mem) o[x] = mem[x]; }); return o; };
  window.chrome = { storage: { local: {
      get(k, cb) { carregar(); const r = pick(k); if (cb) { cb(r); return; } return Promise.resolve(r); },
      set(o, cb) { carregar(); const ch = {}; for (const [k, v] of Object.entries(o)) { ch[k] = { oldValue: mem[k], newValue: v }; mem[k] = v; } salvar(); ouvintes.forEach(f => f(ch, 'local')); if (cb) cb(); return Promise.resolve(); },
      remove(k) { (window.__removidos ||= []).push(k); carregar(); delete mem[k]; salvar(); return Promise.resolve(); }
    }, onChanged: { addListener(f) { ouvintes.push(f); } } },
    runtime: { id: 'teste', getURL: p => 'https://onvio.com.br/__ext__/' + p, onMessage: { addListener(f) { (window.__ouvintes ||= []).push(f); } }, sendMessage(m, cb) { (window.__msgs ||= []).push(m); const r = (window.__respostas && window.__respostas[m.cmd]) || { ok: true, proximoEmSeg: 60 }; if (cb) setTimeout(() => cb(r), 0); return Promise.resolve(r); }, lastError: null, openOptionsPage() {}, lastErrorX: null, getManifest: () => ({ version: '0.2.0' }) },
    tabs: { create(o) { (window.__tabs ||= []).push(o); } } };
})();`;

(async () => {
const navegador = await chromium.launch();
const falhas = [];
const passo = async (nome, fn) => { try { await fn(); console.log('ok   ' + nome); } catch (e) { falhas.push(nome); console.log('FALHA ' + nome + '\n     ' + String(e.message).split('\n').slice(0, 5).join(' | ')); } };

async function pagina(url, html, semStub) {
  const ctx = await navegador.newContext();
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', e => erros.push(String(e)));
  await p.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith('https://onvio.com.br/__ext__/')) {          // arquivos da extensão (iframe do painel, fontes, ícones)
      const f = path.join(EXT, new URL(u).pathname.replace('/__ext__/', ''));
      const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
      return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: tipos[path.extname(f)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' });
    }
    if (u === url || u.startsWith(url.split('#')[0])) return r.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
    if (/\/api\//.test(u)) return r.fulfill({ status: 404, body: '{}' });
    return r.abort();
  });
  if (!semStub) { await p.addInitScript('window.__EXT = ' + JSON.stringify(EXT) + ';'); await p.addInitScript(STUB); }
  p.erros = erros;
  return p;
}

const snapshot = {
  fetchedAt: new Date().toISOString(), user: { nome: 'Ana' },
  items: [
    { k: 'calcFerias:a', type: 'calcFerias', typeLabel: 'Cálculo de férias', id: 'a', num: 101, status: 'Em análise', lado: 'esc', nivel: 2, grav: 2, parado: 6, motivos: [{ n: 2, m: 'Aberta há 6 d.u. (limite 5)' }], resp: 'Ana', mine: true, apelido: 'ACME', detalhe: 'Fulano', ptUteis: 2 },
    { k: 'calcFerias:b', type: 'calcFerias', typeLabel: 'Cálculo de férias', id: 'b', num: 102, status: 'Respondido', lado: 'cli', nivel: 2, grav: 3, parado: 26, prescreveEm: 4, motivos: [{ n: 2, m: 'Prescreve em 4 dia(s)' }], resp: '', mine: false, apelido: 'BETA', detalhe: 'Ciclano' },
    { k: 'geral:c', type: 'geral', typeLabel: 'Geral', id: 'c', num: 500, status: 'Situação desconhecida (código 77)', lado: 'desc', desconhecido: true, nivel: 1, grav: 1, parado: 1, motivos: [{ n: 1, m: 'x' }], resp: 'Bia', mine: false, abaProvavel: { tipo: 'avisoFerias', label: 'Aviso de férias', palavra: 'ferias' } }
  ],
  porTipo: { calcFerias: 2, geral: 1 }, erros: [], desconhecidos: { geral: { 77: 1 } }, tramites: { lidos: 1, falhas: 0 }
};
const semear = (p, extra) => p.addInitScript(`localStorage.setItem('__mem', ${JSON.stringify(JSON.stringify(Object.assign({ snapshot }, extra || {})))});`);

/* ---------- grade Wijmo ---------- */
const URL_FERIAS = 'https://onvio.com.br/br-portal-do-cliente/service-requesting/vacation/calculation';
const celula = (x, y, t) => `<div class="wj-cell" style="position:absolute;left:${x}px;top:${y}px;width:100px;height:30px">${t}</div>`;
const WIJMO = `<!doctype html><body><div class="wj-flexgrid"><div wj-part="root">
  <div class="wj-colheaders" wj-part="ch">${celula(0,0,'ID')}${celula(100,0,'Ações')}${celula(200,0,'Situação')}${celula(300,0,'Último Trâmite')}${celula(400,0,'Cliente')}</div>
  <div class="wj-cells" wj-part="cells">
    ${celula(0,0,'101')}${celula(100,0,'i')}${celula(200,0,'Em análise')}${celula(300,0,'10/10/2026 09:00')}${celula(400,0,'ACME')}
    ${celula(0,32,'102')}${celula(100,32,'i')}${celula(200,32,'Respondido')}${celula(300,32,'18/09/2026 09:00')}${celula(400,32,'BETA')}
    ${celula(0,64,'103')}${celula(100,64,'i')}${celula(200,64,'Concluído')}${celula(300,64,'01/10/2026 09:00')}${celula(400,64,'GAMA')}
  </div></div></div></body>`;

await passo('grade Wijmo: marca só as pendentes, na célula Último Trâmite, e refaz após redesenho', async () => {
  const p = await pagina(URL_FERIAS, WIJMO);
  await semear(p);
  await p.goto(URL_FERIAS);
  await p.addScriptTag({ content: lerExt('core.js') });
  await p.addScriptTag({ content: lerExt('grade.js') });
  await p.waitForSelector('.controlonvio-marca', { timeout: 4000 });
  const marcas = await p.$$eval('.controlonvio-marca', els => els.map(e => ({ t: e.textContent, linha: e.parentElement.style.top, col: e.parentElement.style.left, titulo: e.title })));
  assert.equal(marcas.length, 2);
  assert.deepEqual(marcas.map(m => m.col), ['300px', '300px']);
  assert.equal(marcas[0].t, '6d parada');
  assert.equal(marcas[1].t, '26d parada · prescreve em 4d');
  assert.match(marcas[0].titulo, /Aberta há 6 d\.u\./);
  // simula o Wijmo redesenhando a célula ao rolar
  await p.$eval('.wj-cells .wj-cell[style*="left:300px"][style*="top:0px"]', e => { e.textContent = '10/10/2026 09:00'; });
  await p.waitForFunction(() => document.querySelectorAll('.controlonvio-marca').length === 2, null, { timeout: 4000 });
  // não duplica
  await p.waitForTimeout(700);
  assert.equal(await p.$$eval('.controlonvio-marca', e => e.length), 2);
  assert.deepEqual(p.erros, []);
  const diag = await p.evaluate(() => { document.dispatchEvent(new CustomEvent('controlonvio-diagnosticar')); return null; });
});

/* ---------- tabela comum ---------- */
const TABELA = `<!doctype html><body><table><thead><tr><th>ID</th><th>Situação</th><th>Último Trâmite</th></tr></thead><tbody>
  <tr><td>101</td><td>Em análise</td><td>10/10</td></tr><tr><td>999</td><td>Concluído</td><td>01/10</td></tr></tbody></table></body>`;
await passo('grade em <table>: marca a linha pendente e ignora as demais', async () => {
  const p = await pagina(URL_FERIAS, TABELA);
  await semear(p);
  await p.goto(URL_FERIAS);
  await p.addScriptTag({ content: lerExt('core.js') });
  await p.addScriptTag({ content: lerExt('grade.js') });
  await p.waitForSelector('.controlonvio-marca', { timeout: 4000 });
  assert.equal(await p.$$eval('.controlonvio-marca', e => e.length), 1);
  assert.equal(await p.$eval('tbody tr:first-child td:nth-child(3) .controlonvio-marca', e => e.textContent), '6d parada');
});

await passo('grade: em outra rota ou sem grade reconhecida não quebra nem marca', async () => {
  const p = await pagina('https://onvio.com.br/br-portal-do-cliente/service-requesting/general', '<!doctype html><body><div>nada</div></body>');
  await semear(p);
  await p.goto('https://onvio.com.br/br-portal-do-cliente/service-requesting/general');
  await p.addScriptTag({ content: lerExt('core.js') });
  await p.addScriptTag({ content: lerExt('grade.js') });
  await p.waitForTimeout(800);
  assert.equal(await p.$$eval('.controlonvio-marca', e => e.length), 0);
  assert.deepEqual(p.erros, []);
});

await passo('grade: com a extensão atualizada (script órfão) as marcas somem e aparece o aviso para recarregar', async () => {
  const p = await pagina(URL_FERIAS, TABELA);
  await semear(p);
  await p.goto(URL_FERIAS);
  await p.addScriptTag({ content: lerExt('core.js') });
  await p.addScriptTag({ content: lerExt('grade.js') });
  await p.waitForSelector('.controlonvio-marca', { timeout: 4000 });
  await p.evaluate(() => { window.chrome.runtime.id = undefined; });   // o Chrome faz isso quando a extensão é recarregada
  await p.waitForFunction(() => !document.querySelector('.controlonvio-marca') && /foi atualizado/.test(document.body.textContent), null, { timeout: 4000 });
  assert.deepEqual(p.erros, []);
});

/* ---------- shell: botão flutuante e painel encaixado ---------- */
const URL_PORTAL = 'https://onvio.com.br/br-portal-do-cliente/service-requesting/general';
const temPainel = p => p.frames().some(f => /painel\.html$/.test(f.url()));
const esperar = async (cond, ms = 4000) => { const fim = Date.now() + ms; while (Date.now() < fim) { if (await cond()) return; await new Promise(r => setTimeout(r, 50)); } throw new Error('tempo esgotado esperando: ' + cond); };


/* ---------- tempo real: ciclo do shell e aviso de ação na página ---------- */
const ticks = p => p.evaluate(() => (window.__msgs || []).filter(m => m.cmd === 'tick'));
await passo('tempo real: o shell pede verificação ao abrir, e logo depois de uma ação da página (junta várias)', async () => {
  const p = await pagina(URL_PORTAL, '<!doctype html><body>Onvio</body>');
  await p.addInitScript(lerExt('acao-hook.js'));                       // o hook roda no mundo da página, antes do resto
  await semear(p);
  await p.route('**/api/service-requesting/**', r => r.fulfill({ status: r.request().url().includes('falha') ? 500 : 200, contentType: 'application/json', body: '{}' }));
  await p.goto(URL_PORTAL);
  await p.addScriptTag({ content: lerExt('shell.js') });
  await esperar(async () => (await ticks(p)).length >= 1);
  assert.equal((await ticks(p))[0].forcar, false, 'a primeira é uma verificação comum');
  const antes = (await ticks(p)).length;
  // GET não é ação; POST com erro também não
  await p.evaluate(() => fetch('/api/service-requesting/v1/tickets/generic'));
  await p.evaluate(() => fetch('/api/service-requesting/v1/falha', { method: 'POST' }));
  await p.waitForTimeout(2200);
  assert.equal((await ticks(p)).length, antes, 'leitura e ação que falhou não disparam nada');
  // vários POST/PUT seguidos (fetch e XHR) viram uma verificação forçada só
  await p.evaluate(() => { fetch('/api/service-requesting/v1/tickets/generic/1/topics', { method: 'POST' }); fetch('/api/br-payroll-sr/v1/vacation-calculations/2/assign-staff', { method: 'PUT' }); const x = new XMLHttpRequest(); x.open('PATCH', '/api/br-payroll-sr/v1/employee-leave/3'); x.send(); });
  await esperar(async () => (await ticks(p)).length > antes, 5000);
  await p.waitForTimeout(500);
  const novos = (await ticks(p)).slice(antes);
  assert.equal(novos.length, 1, 'uma verificação só, e não três');
  assert.equal(novos[0].forcar, true);
  assert.deepEqual(p.erros, []);
});

await passo('tempo real: aba escondida não verifica; ao voltar para a aba, verifica', async () => {
  const p = await pagina(URL_PORTAL, '<!doctype html><body>Onvio</body>');
  await p.addInitScript(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__oculta ? 'hidden' : 'visible' }); window.__oculta = true; });
  await semear(p);
  await p.goto(URL_PORTAL);
  await p.addScriptTag({ content: lerExt('shell.js') });
  await p.waitForTimeout(700);
  assert.equal((await ticks(p)).length, 0, 'escondida: nada');
  await p.evaluate(() => { window.__oculta = false; document.dispatchEvent(new Event('visibilitychange')); });
  await esperar(async () => (await ticks(p)).length === 1);
});

await passo('tempo real: script órfão (extensão atualizada) para de verificar', async () => {
  const p = await pagina(URL_PORTAL, '<!doctype html><body>Onvio</body>');
  await semear(p);
  await p.goto(URL_PORTAL);
  await p.addScriptTag({ content: lerExt('shell.js') });
  await esperar(async () => (await ticks(p)).length === 1);
  await p.evaluate(() => { window.chrome.runtime.id = undefined; document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(600);
  assert.equal((await ticks(p)).length, 1);
  assert.deepEqual(p.erros, []);
});

/* ---------- modo aprender: formato das chamadas, nunca valores ---------- */
await passo('aprender: registra método, caminho e formato (sem valores); desligado ou vencido não registra nada', async () => {
  const montar = async aprender => {
    const p = await pagina(URL_PORTAL, '<!doctype html><body>Onvio</body>');
    await p.addInitScript(lerExt('acao-hook.js'));
    await semear(p, aprender ? { aprender } : {});
    await p.route('**/api/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: 'abc', nome: 'Fulano de Tal', cpf: '123.456.789-00', itens: [{ valor: 2500.5 }] }) }));
    await p.goto(URL_PORTAL);
    await p.addScriptTag({ content: lerExt('shell.js') });
    await p.waitForTimeout(300);
    await p.evaluate(async () => {
      const guid = '0f8fad5b-d9cb-469f-a165-70867728950e';
      // XHR com JSON (como o Angular do Onvio faz)
      await new Promise(res => { const x = new XMLHttpRequest(); x.open('POST', '/api/br-payroll-sr/v1/vacation-calculations/' + guid + '/topics'); x.setRequestHeader('Content-Type', 'application/json'); x.onload = res; x.send(JSON.stringify({ description: 'Prezado cliente, segue o cálculo do João', status: 4, dueDate: '2026-10-20T00:00:00', staffId: guid })); });
      // de novo a mesma chamada: conta 2x
      await new Promise(res => { const x = new XMLHttpRequest(); x.open('POST', '/api/br-payroll-sr/v1/vacation-calculations/' + guid + '/topics'); x.setRequestHeader('Content-Type', 'application/json'); x.onload = res; x.send(JSON.stringify({ description: 'Outro texto', status: 2, dueDate: '2026-10-21T00:00:00', staffId: guid })); });
      // anexo em multipart
      const fd = new FormData(); fd.append('file', new File(['%PDF-1.4 conteudo'], 'atestado-joao.pdf', { type: 'application/pdf' })); fd.append('description', 'Atestado do João');
      await fetch('/api/br-payroll-sr/v1/employee-leave/123/attachments', { method: 'POST', body: fd });
      // leitura com query (expand fica; busca e filtro com dados não)
      await fetch('/api/service-requesting/v1/tickets/generic?expand=clientExpanded&searchText=Fulano&filter=' + encodeURIComponent(JSON.stringify({ groups: [{ items: [{ by: 'clientName', op: 'CT', value: 'ACME' }] }] })));
      // fora da API de solicitações: ignorado
      await fetch('/api/storage/v2/Folders/1/children');
    });
    await p.waitForTimeout(600);
    return { p, mem: await p.evaluate(() => JSON.parse(localStorage.getItem('__mem'))) };
  };

  const { p, mem } = await montar({ ligado: true, desde: Date.now() });
  const ap = mem.aprendizado || [];
  const txt = JSON.stringify(ap);
  assert.equal(ap.length, 3, 'POST de trâmite (deduplicado), anexo e leitura: ' + ap.map(a => a.metodo + ' ' + a.caminho).join(' | '));
  const tramite = ap.find(a => /topics$/.test(a.caminho));
  assert.equal(tramite.caminho, '/api/br-payroll-sr/v1/vacation-calculations/{id}/topics');
  assert.equal(tramite.vezes, 2);
  assert.equal(tramite.contentTypePedido, 'application/json');
  assert.deepEqual(tramite.corpo, { json: { description: 'texto', status: 'number', dueDate: 'texto:data-hora', staffId: 'texto:guid' } });
  assert.deepEqual(tramite.resposta, { json: { id: 'texto', nome: 'texto', cpf: 'texto', itens: [{ valor: 'number' }] } });
  assert.deepEqual(tramite.rotas, ['/br-portal-do-cliente/service-requesting/general']);
  const anexo = ap.find(a => /attachments$/.test(a.caminho));
  assert.equal(anexo.caminho, '/api/br-payroll-sr/v1/employee-leave/{id}/attachments');
  assert.deepEqual(anexo.corpo, { multipart: { file: 'arquivo(application/pdf)', description: 'texto' } });
  const leitura = ap.find(a => a.metodo === 'GET');
  assert.deepEqual(leitura.query, { expand: 'clientExpanded', searchText: '…', filter: [['clientName CT']] });
  for (const proibido of ['Fulano', 'João', '123.456', 'ACME', 'atestado-joao', 'Prezado', '2026-10-20', '0f8fad5b', '2500']) assert.ok(!txt.includes(proibido), 'vazou um valor: ' + proibido);
  assert.deepEqual(p.erros, []);

  assert.equal((await montar(null)).mem.aprendizado, undefined, 'desligado: nada');
  assert.equal((await montar({ ligado: true, desde: Date.now() - 3 * 3600 * 1000 })).mem.aprendizado, undefined, 'ligado há mais de 2 h: desligou sozinho');
});



/* ---------- shell: camada em tela cheia por cima do Onvio ---------- */
const appFrame = p => p.frames().find(f => /\/app\/app\.html$/.test(f.url()));
const cheia = p => p.evaluate(() => document.documentElement.classList.contains('controlonvio-cheia'));
await passo('shell: ao entrar no Onvio o app cobre a tela inteira; "Ver Onvio" esconde e o botão volta; lembra na aba', async () => {
  const p = await pagina(URL_PORTAL, '<!doctype html><body style="height:3000px">Onvio</body>');
  await p.setViewportSize({ width: 1360, height: 800 });
  await semear(p);
  await p.goto(URL_PORTAL);
  await p.addScriptTag({ content: lerExt('shell.js') });
  await esperar(() => appFrame(p));
  assert.equal(await cheia(p), true);
  const caixa = await (await appFrame(p).frameElement()).boundingBox();
  assert.deepEqual([caixa.x, caixa.y, caixa.width, caixa.height], [0, 0, 1360, 800], 'cobre a tela toda');
  assert.equal(await p.evaluate(() => getComputedStyle(document.documentElement).overflow), 'hidden', 'a página do Onvio por trás não rola');
  await p.evaluate(() => window.__ouvintes.forEach(f => f({ type: 'fechar' })));       // "Ver Onvio"
  await p.waitForFunction(() => !document.documentElement.classList.contains('controlonvio-cheia'));
  await p.waitForTimeout(300);                                                            // fim da animação de saída
  await p.mouse.click(1220, 755);                                                         // botão "Voltar ao Control Onvio"
  await p.waitForFunction(() => document.documentElement.classList.contains('controlonvio-cheia'));
  await p.evaluate(() => window.__ouvintes.forEach(f => f({ type: 'fechar' })));
  await p.reload();
  await p.addScriptTag({ content: lerExt('shell.js') });
  await p.waitForTimeout(500);
  assert.equal(await cheia(p), false, 'nesta aba a pessoa escolheu ver o Onvio');
  await p.evaluate(() => window.__ouvintes.forEach(f => f({ type: 'alternar' })));
  await p.waitForFunction(() => document.documentElement.classList.contains('controlonvio-cheia'));
  assert.deepEqual(p.erros, []);
});

await passo('shell: "Abrir no Onvio" chega com a camada escondida; desligar "abrir ao entrar" respeita; pedido do ícone abre', async () => {
  const caso = async extra => {
    const p = await pagina(URL_PORTAL, '<!doctype html><body>Onvio</body>');
    await semear(p, extra);
    await p.goto(URL_PORTAL);
    await p.addScriptTag({ content: lerExt('shell.js') });
    await p.waitForTimeout(500);
    return cheia(p);
  };
  assert.equal(await caso({ verOnvioAoCarregar: Date.now() }), false);
  assert.equal(await caso({ settings: { abrirAoEntrar: false } }), false);
  assert.equal(await caso({ settings: { abrirAoEntrar: false }, abrirPainelAoCarregar: Date.now() }), true);
  assert.equal(await caso({ verOnvioAoCarregar: Date.now() - 10 * 60000 }), true, 'pedido antigo não vale');
  assert.equal(await caso({ status: { estado: 'visao_cliente' } }), false, 'acesso de cliente: não abre sozinho');
  assert.equal(await caso({ status: { estado: 'visao_cliente' }, abrirPainelAoCarregar: Date.now() }), true, 'pelo ícone abre (para mostrar o aviso)');
});

/* ---------- app: telas com dados simulados ---------- */
const URL_APP = 'https://onvio.com.br/__ext__/app/app.html';
const agoraIso = (d = 0) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 19);
const ITENS_APP = [
  { k: 'calcFerias:a', type: 'calcFerias', typeLabel: 'Cálculo de férias', id: 'a', num: 101, status: 'Em análise', lado: 'esc', nivel: 2, grav: 3, parado: 31, motivos: [{ n: 2, m: 'Parada há 31 dias' }], resp: 'Ana Teste', mine: true, apelido: 'ACME', cliente: 'ACME LTDA', detalhe: 'Fulano', created: agoraIso(40), last: agoraIso(31) },
  { k: 'geral:b', type: 'geral', typeLabel: 'Geral', id: 'b', num: 102, status: 'Aguardando resposta', lado: 'esc', nivel: 1, grav: 1, parado: 2, motivos: [{ n: 1, m: 'Prazo de conclusão vence hoje' }], resp: 'Ana Teste', mine: true, apelido: 'BETA', cliente: 'BETA SA', detalhe: 'Férias do João', abaProvavel: { tipo: 'avisoFerias', label: 'Aviso de férias', palavra: 'ferias' }, created: agoraIso(3), last: agoraIso(2) },
  { k: 'avisoRescisao:c', type: 'avisoRescisao', typeLabel: 'Aviso de rescisão', id: 'c', num: 103, status: 'Respondido', lado: 'cli', nivel: 2, grav: 3, parado: 26, prescreveEm: 4, motivos: [{ n: 2, m: 'Prescreve em 4 dia(s)' }], resp: '', mine: false, apelido: 'GAMA', cliente: 'GAMA ME', detalhe: 'Ciclano', created: agoraIso(30), last: agoraIso(26) },
  { k: 'rubricas:d', type: 'rubricas', typeLabel: 'Lançamento de rubricas', id: 'd', num: 104, status: 'Sem análise', lado: 'esc', nivel: 0, grav: 0, parado: 0, motivos: [], resp: 'Bia', mine: false, apelido: 'ACME', cliente: 'ACME LTDA', detalhe: '09/2026 · Mensal', created: agoraIso(0), last: agoraIso(0), ptUteis: 1 }
];
const hojeK = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
const ESTADO_APP = {
  snapshot: { fetchedAt: new Date().toISOString(), user: { nome: 'Ana Teste' }, items: ITENS_APP, porTipo: {}, erros: [], desconhecidos: {} },
  status: { estado: 'ok' }, ultimaVerificacao: new Date().toISOString(),
  eventos: [{ id: 'e1', tipo: 'respondeu', titulo: 'Cliente respondeu', k: 'geral:b', type: 'geral', num: '102', typeLabel: 'Geral', cliente: 'BETA', mine: true, em: new Date().toISOString() }],
  lembretes: [{ id: 'l1', texto: 'Cobrar o BETA', quando: new Date(Date.now() - 3600e3).toISOString(), criadoEm: new Date().toISOString(), feito: false, disparado: true, k: 'geral:b', type: 'geral', num: '102', cliente: 'BETA' }],
  serie: { [hojeK]: { entradas: 3, saidas: 1, horas: { '08': 3, '09': 4, '10': 4 } } }
};
async function abrirApp(rota, extra) {
  const p = await pagina(URL_APP, '');
  await p.setViewportSize({ width: 1360, height: 860 });
  await semear(p, Object.assign({}, ESTADO_APP, extra || {}));
  await p.goto(URL_APP + (rota || ''));
  await p.waitForFunction(() => document.querySelector('#vista').children.length > 0, null, { timeout: 5000 });
  return p;
}
const linhas = (p, sel) => p.$$eval(sel || '#corpo [data-k]', e => e.map(x => x.dataset.k));

await passo('app · Hoje (analista): saudação, números, semana, colunas "para fazer agora", agenda com lembrete atrasado e atividade', async () => {
  const p = await abrirApp('#/inicio');
  assert.equal(await p.textContent('#titulo'), 'Hoje');
  assert.match(await p.textContent('.ht-saud'), /, Ana$/);
  const kpis = await p.$$eval('.ht-cont .kpi', e => e.map(x => x.querySelector('.rot').textContent + '=' + x.querySelector('.val').textContent));
  assert.deepEqual(kpis, ['Com ação minha=2', 'Fora do prazo=1', 'Vencem hoje=1', 'Cliente respondeu=1', 'Lembretes hoje=1']);
  assert.deepEqual(await linhas(p, '#agora [data-k]'), ['calcFerias:a', 'geral:b', 'geral:b'], 'fora do prazo, vence hoje e cliente respondeu');
  assert.match(await p.textContent('#agenda'), /Cobrar o BETA/);
  assert.match(await p.textContent('#ativ'), /Cliente respondeu/);
  // barra viva: todas as pendências da equipe em ordem de prioridade, só com a bolinha (sem "Ao vivo")
  assert.deepEqual(await p.$$eval('#fita .ft-grupo:first-child [data-k]', e => e.map(x => x.dataset.k)), ['calcFerias:a', 'avisoRescisao:c', 'geral:b', 'rubricas:d']);
  assert.equal(await p.getAttribute('#fita', 'class'), 'fita ok');
  assert.doesNotMatch(await p.textContent('#fita'), /ao vivo/i);
  // solicitações por analista: "Sem analista" primeiro; o seletor de vez redesenha
  assert.deepEqual(await p.$$eval('#g-analistas text.rot-forte', e => e.map(x => x.textContent)), ['Sem analista', 'Ana Teste', 'Bia']);
  await p.click('[data-vez="esc"]');
  assert.deepEqual(await p.$$eval('#g-analistas text.rot-forte', e => e.map(x => x.textContent)), ['Ana Teste', 'Bia'], 'só a vez do escritório');
  await p.click('[data-vez=""]');
  // placar do dia, mapa de calor, prescrição e distribuição
  assert.match(await p.textContent('#placar'), /Entraram3Saíram1Saldo▲ 2/);
  assert.match(await p.textContent('#l-presc'), /4dias[\s\S]*GAMA/);
  assert.match(await p.textContent('#distribuicao'), /GAMA[\s\S]*sugerido: Bia/);
  assert.equal(await p.$$eval('#mapa-idade .mc-v:not(:disabled)', e => e.length), 4);
  assert.equal(await p.$$eval('.semana .sm-dia', e => e.length), 9, 'atrasados, 7 dias e "novo lembrete"');
  await p.click('.sm-atr');
  assert.match(await p.textContent('#agenda'), /Cobrar o BETA[\s\S]*Parada há 31 dias/, 'atrasados: lembrete e fora do prazo');
  // a área de conteúdo rola (antes o .app em grade do ui.css esticava a tela e cortava o fim)
  const rol = await p.evaluate(() => { const v = document.querySelector('#vista'); v.scrollTop = 400; return [v.scrollHeight > v.clientHeight, v.scrollTop > 0, Math.round(v.getBoundingClientRect().bottom) <= innerHeight]; });
  assert.deepEqual(rol, [true, true, true], 'Hoje rola dentro da janela');
  await p.evaluate(() => { document.querySelector('#vista').scrollTop = 0; });
  assert.equal(await p.textContent('#n-fila'), '2');
  assert.equal(await p.textContent('#sino-cont'), '1');
  assert.match(await p.textContent('#aovivo-tx'), /^Ao vivo · \d\d:\d\d:\d\d$/);
  await p.click('.ht-cont [data-kpi="atraso"]');
  await p.waitForFunction(() => location.hash === '#/fila?kpi=atraso');
  // mapa de calor → fila da pessoa naquela faixa de dias parada, com a etiqueta que sai com um clique
  await p.goto(URL_APP + '#/inicio'); await p.waitForSelector('#mapa-idade .mc-v');
  await p.click('#mapa-idade .mc-v[data-id="Ana Teste"][data-col="31-"]');
  await p.waitForFunction(() => location.hash.startsWith('#/fila?analista=Ana+Teste&idade=31-') && document.querySelector('#ativos .chip-f'));
  assert.deepEqual(await linhas(p), ['calcFerias:a']);
  assert.match(await p.textContent('#ativos'), /Parada há 31\+ dias/);
  // clique na fita abre o detalhe; clique em "Sem analista" leva à fila sem responsável
  await p.goto(URL_APP + '#/inicio'); await p.waitForSelector('#fita [data-k]');
  await p.hover('#fita .ft-janela');                                  // a fita para ao passar o mouse
  await p.click('#fita .ft-grupo:first-child [data-k="geral:b"]');
  await p.waitForSelector('#gaveta:not([hidden])');
  assert.match(await p.textContent('#gaveta h2'), /BETA/);
  await p.keyboard.press('Escape');
  await p.click('#g-analistas [data-id="(sem responsável)"]');
  await p.waitForFunction(() => location.hash === '#/fila?escopo=semresp');
  assert.deepEqual(p.erros, []);
});

await passo('app · Fila: abas Minhas/Equipe/Sem responsável, filtros e chips, ordenação, cartões, ↑↓ e Enter', async () => {
  const p = await abrirApp('#/fila');
  assert.equal(await p.textContent('#titulo'), 'Minha fila');
  assert.deepEqual(await p.$$eval('#abas .aba', e => e.map(x => x.textContent)), ['Minhas2', 'Equipe toda4', 'Sem responsável1']);
  assert.equal((await linhas(p)).length, 2);
  await p.goto(URL_APP + '#/fila?kpi=atraso'); await p.waitForSelector('#corpo [data-k]');
  assert.deepEqual(await linhas(p), ['calcFerias:a']);
  assert.match(await p.textContent('#ativos'), /Só: Fora do prazo/);
  await p.click('#ativos [data-tira="kpi"]');
  await p.waitForFunction(() => location.hash === '#/fila');
  await p.click('#abas [data-aba="equipe"]'); await p.waitForFunction(() => document.querySelectorAll('#corpo [data-k]').length === 4);
  await p.fill('#f-texto', 'acme');
  assert.equal((await linhas(p)).length, 2);
  await p.fill('#f-texto', '');
  await p.click('[data-lado="cli"]');
  assert.deepEqual(await linhas(p), ['avisoRescisao:c']);
  await p.click('[data-lado=""]');
  await p.click('#b-filtros'); await p.selectOption('#f-resp', 'Bia');
  assert.deepEqual(await linhas(p), ['rubricas:d']);
  assert.equal(await p.textContent('#n-filtros'), '1');
  await p.click('#f-limpar');
  assert.equal((await linhas(p)).length, 4);
  await p.click('#vista .lh [data-col="num"]');
  assert.deepEqual(await linhas(p), ['rubricas:d', 'avisoRescisao:c', 'geral:b', 'calcFerias:a'], 'ID, mais nova primeiro');
  await p.click('[data-vis="cartoes"]');
  assert.equal(await p.$$eval('#corpo .sc', e => e.length), 4);
  await p.click('[data-vis="lista"]');
  await p.focus('#corpo [data-k="rubricas:d"]'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter');
  await p.waitForSelector('#gaveta .dlg-nav');
  assert.match(await p.textContent('#gaveta .dlg-nav'), /2 de 4/);
  assert.match(await p.textContent('#gaveta h2'), /GAMA/);
  await p.keyboard.press('ArrowRight');
  await p.waitForFunction(() => /BETA/.test(document.querySelector('#gaveta h2').textContent));
  await p.keyboard.press('Escape');
  await p.goto(URL_APP + '#/fila?escopo=semresp'); await p.waitForSelector('#corpo [data-k]');
  assert.equal(await p.textContent('#titulo'), 'Sem responsável');
  assert.deepEqual(p.erros, []);
});

await passo('app · Equipe (gestor): números, 4 gráficos com dicas; aba Responsáveis leva à fila da pessoa', async () => {
  const p = await abrirApp('#/equipe');
  const kpis = await p.$$eval('.kpi', e => e.map(x => x.querySelector('.rot').textContent + '=' + x.querySelector('.val').textContent));
  assert.deepEqual(kpis, ['Pendências=4', 'Sem responsável=1', 'Fora do prazo=2', 'Prescrevem em 5 dias=1', '1º trâmite (média)=1', 'Hoje=3 / 1']);
  for (const id of ['#g-carga', '#g-dias', '#g-horas', '#g-tipo']) assert.ok(await p.$(id + ' svg'), 'gráfico ' + id);
  assert.match(await p.textContent('#g-carga .legenda-viz'), /Em dia.*G1 atenção.*G2 fora do prazo.*G3 crítica/);
  await p.hover('#g-carga [data-tip]');
  assert.equal(await p.isVisible('#dica'), true, 'dica ao passar o mouse');
  await p.click('#abas [data-aba="resp"]');
  await p.waitForSelector('tr[data-resp="Ana Teste"]');
  await p.click('tr[data-resp="Ana Teste"]');
  await p.waitForFunction(() => location.hash.startsWith('#/fila?analista=') && document.querySelectorAll('#corpo [data-k]').length > 0);
  assert.equal((await linhas(p)).length, 2);
  assert.deepEqual(p.erros, []);
});

await passo('app · Clientes: painel com ranking e mais tempo sem responder; empresas em cartões e lista levam às pendências', async () => {
  const p = await abrirApp('#/clientes');
  assert.ok(await p.$('#g-top svg'));
  assert.match(await p.textContent('#l-lentos'), /GAMA/);
  await p.click('#abas [data-aba="empresas"]');
  await p.waitForSelector('#corpo [data-cli]');
  assert.equal(await p.$$eval('#corpo .sc[data-cli]', e => e.length), 3);
  await p.click('[data-vis="lista"]');
  assert.equal(await p.$$eval('#corpo tr[data-cli]', e => e.length), 3);
  await p.fill('#f', 'beta');
  assert.equal(await p.$$eval('#corpo tr[data-cli]', e => e.length), 1);
  await p.click('#corpo tr[data-cli]');
  await p.waitForFunction(() => location.hash.startsWith('#/fila?cliente=') && document.querySelectorAll('#corpo [data-k]').length > 0);
  assert.equal((await linhas(p)).length, 1);
  assert.deepEqual(p.erros, []);
});

await passo('app · detalhe: janela com dados e trâmites lidos na hora; lembrete ligado à solicitação aparece na aba Lembretes', async () => {
  const p = await abrirApp('#/fila', {});
  await p.evaluate(() => { window.__respostas = { detalhe: { ok: true, item: { assunto: 'Férias do João', descricao: '<p>Segue <b>pedido</b></p>', meio: 'WEB' }, tramites: [{ n: 1, em: '2026-10-10T10:00:00', situacao: 'Sem análise', autor: 'Cliente BETA', texto: 'Abertura', anexos: ['aviso.pdf'] }, { n: 2, em: '2026-10-12T10:00:00', situacao: 'Aguardando resposta', autor: 'Cliente BETA', texto: 'Alguma novidade?', anexos: [] }] } }; });
  await p.click('#corpo [data-k="geral:b"]');
  await p.waitForSelector('#gaveta .tl-item');
  assert.equal(await p.$$eval('#gaveta .tl-item', e => e.length), 2);
  assert.match(await p.textContent('#gaveta .dlg-head h2'), /BETA/);
  assert.match(await p.textContent('#gaveta'), /aviso\.pdf/);
  assert.match(await p.textContent('#gaveta [data-aba="tramites"]'), /Trâmites2/);
  const pedido = await p.evaluate(() => window.__msgs.find(m => m.cmd === 'detalhe'));
  assert.deepEqual([pedido.type, String(pedido.num)], ['geral', '102']);
  await p.click('#gaveta [data-aba="dados"]');
  assert.match(await p.textContent('#g-corpo'), /Segue pedido/, 'HTML do Onvio vira texto puro');
  await p.click('#g-lembrete');
  await p.fill('#lt', 'Ligar para o João');
  await p.selectOption('#lr', 'semanal');
  await p.click('#ls');
  await p.waitForFunction(() => JSON.parse(localStorage.getItem('__mem')).lembretes.length === 2);
  const l = await p.evaluate(() => JSON.parse(localStorage.getItem('__mem')).lembretes[1]);
  assert.deepEqual([l.texto, l.type, l.num, l.rep], ['Ligar para o João', 'geral', '102', 'semanal']);
  assert.equal(await p.isHidden('#dlg-lembrete'), true);
  await p.click('#gaveta [data-aba="lembretes"]');
  await p.waitForFunction(() => /Ligar para o João/.test(document.querySelector('#g-corpo').textContent) && /Cobrar o BETA/.test(document.querySelector('#g-corpo').textContent));
  await p.click('#g-onvio');
  assert.ok(await p.evaluate(() => window.__msgs.some(m => m.cmd === 'abrir' && m.item.num === '102')));
  await p.keyboard.press('Escape');
  assert.equal(await p.isHidden('#gaveta'), true);
  assert.deepEqual(p.erros, []);
});

await passo('app · Solicitações e busca (janela central) consultam o Onvio na hora; Agenda e lembretes; sino; Ver Onvio', async () => {
  const p = await abrirApp('#/solicitacoes');
  await p.evaluate(() => { window.__respostas = { consultar: { ok: true, total: 1, paginas: 1, itens: [{ k: 'geral:z', type: 'geral', typeLabel: 'Geral', num: 900, status: 'Concluído', lado: 'fim', nivel: 0, cliente: 'ZETA', apelido: 'ZETA', detalhe: 'Antiga', resp: 'Ana', last: '2026-01-02T10:00:00' }] }, buscar: { ok: true, itens: [] } }; });
  await p.click('#abas [data-aba="rubricas"]');
  await p.waitForSelector('#corpo [data-k="geral:z"]');
  const c = await p.evaluate(() => window.__msgs.filter(m => m.cmd === 'consultar').pop());
  assert.deepEqual([c.type, c.filtro, c.page], ['rubricas', 'pendentes', 1]);
  await p.click('[data-f="todas"]');
  await p.waitForFunction(() => window.__msgs.filter(m => m.cmd === 'consultar').pop().filtro === 'todas');
  // busca: "/" abre a janela; o que já foi lido aparece na hora; Enter busca nas 10 listas
  await p.keyboard.press('/');
  await p.waitForSelector('#cmdk:not([hidden])');
  await p.fill('#busca-q', 'joão');
  assert.match(await p.textContent('#cmdk-res'), /Buscar “joão” no Onvio[\s\S]*#102 · BETA/);
  await p.press('#busca-q', 'Enter');
  await p.waitForFunction(() => window.__msgs.some(m => m.cmd === 'buscar' && m.q === 'joão'));
  assert.equal(await p.textContent('#titulo'), 'Busca');
  await p.keyboard.press('Control+k');
  await p.fill('#busca-q', '101');
  await p.press('#busca-q', 'Enter');
  await p.waitForSelector('#gaveta:not([hidden])');
  assert.match(await p.textContent('#gaveta h2'), /ACME/, 'ID exato abre a solicitação');
  await p.keyboard.press('Escape');
  // agenda do mês e lista
  await p.goto(URL_APP + '#/lembretes'); await p.waitForSelector('.cal .cal-d.hoje');
  assert.match(await p.textContent('#ag-dia'), /Cobrar o BETA/, 'hoje mostra o lembrete atrasado');
  await p.click('#novo-lembrete');
  await p.fill('#lt', 'Revisar folha'); await p.click('#ls');
  await p.waitForFunction(() => JSON.parse(localStorage.getItem('__mem')).lembretes.length === 2);
  await p.click('#abas [data-aba="lista"]'); await p.waitForSelector('[data-l="l1"]');
  await p.click('[data-l="l1"] [data-a="amanha"]');
  await p.waitForFunction(() => JSON.parse(localStorage.getItem('__mem')).lembretes.find(x => x.id === 'l1').disparado === false);
  await p.click('[data-l="l1"] [data-a="feito"]');
  await p.waitForFunction(() => JSON.parse(localStorage.getItem('__mem')).lembretes.find(x => x.id === 'l1').feito === true);
  await p.click('#btn-sino');
  assert.match(await p.textContent('#sino-painel'), /Cliente respondeu/);
  await p.waitForFunction(() => !!JSON.parse(localStorage.getItem('__mem')).alertasVistosEm);
  await p.click('#btn-ver-onvio');
  assert.ok(await p.evaluate(() => window.__msgs.some(m => m.cmd === 'fecharPainel')));
  assert.deepEqual(p.erros, []);
});

await passo('app · acesso de cliente: só o aviso, sem menu, busca nem dados; "Já entrei com o login do escritório" pede nova leitura', async () => {
  const p = await abrirApp('#/fila?escopo=equipe', { status: { estado: 'visao_cliente', msg: 'O Onvio está aberto com um acesso de cliente (sessão do Onvio).' } });
  await p.waitForSelector('#bloqueio');
  assert.match(await p.textContent('#bloqueio'), /Este é um acesso de cliente[\s\S]*sessão do Onvio/);
  assert.equal(await p.$$eval('#vista [data-k]', e => e.length), 0, 'nenhuma solicitação aparece');
  assert.equal(await p.isHidden('.trilho [data-rota="fila"]'), true);
  assert.equal(await p.isHidden('#btn-busca'), true);
  assert.equal(await p.textContent('#aovivo-tx'), 'Acesso de cliente');
  await p.keyboard.press('/');
  assert.equal(await p.isHidden('#cmdk'), true, 'a busca não abre');
  await p.click('#bl-tentar');
  assert.ok(await p.evaluate(() => window.__msgs.some(m => m.cmd === 'atualizar')));
  assert.deepEqual(p.erros, []);
});

await passo('app · sem sessão: faixa no topo com "Tentar de novo" e o indicador fica vermelho', async () => {
  const p = await abrirApp('#/inicio', { status: { estado: 'sem_sessao', msg: 'Tentativas: página do Onvio: HTTP 401' } });
  assert.match(await p.textContent('#aviso-sessao'), /Sem sessão no Onvio\. Tentativas: página do Onvio: HTTP 401/);
  assert.equal(await p.getAttribute('#aovivo', 'class'), 'aovivo erro');
  await p.click('#av-tentar');
  assert.ok(await p.evaluate(() => window.__msgs.some(m => m.cmd === 'atualizar')));
});

await navegador.close();
console.log(falhas.length ? '\nFALHARAM: ' + falhas.join(' | ') : '\ntodos os testes de navegador passaram');
process.exit(falhas.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

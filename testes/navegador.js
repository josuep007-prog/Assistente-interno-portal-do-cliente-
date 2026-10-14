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
    runtime: { id: 'teste', getURL: p => 'https://onvio.com.br/__ext__/' + p, onMessage: { addListener(f) { (window.__ouvintes ||= []).push(f); } }, sendMessage(m, cb) { (window.__msgs ||= []).push(m); if (cb) cb({ ok: true }); return Promise.resolve({ ok: true, proximoEmSeg: 60 }); }, lastError: null, openOptionsPage() {}, getManifest: () => ({ version: '0.2.0' }) },
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
await passo('shell: botão abre o painel (iframe) e encolhe a página; fechar e reabrir após recarregar', async () => {
  const p = await pagina(URL_PORTAL, '<!doctype html><body><main id="m" style="width:100%">Onvio</main></body>');
  await p.setViewportSize({ width: 1360, height: 800 });
  await semear(p);
  await p.goto(URL_PORTAL);
  await p.addScriptTag({ content: lerExt('shell.js') });
  assert.equal(temPainel(p), false, 'fechado: nada carregado a mais na página');
  await p.mouse.click(1255, 755);                       // botão flutuante, canto inferior direito
  await p.waitForFunction(() => document.documentElement.classList.contains('controlonvio-docked'), null, { timeout: 4000 });
  assert.equal(temPainel(p), true);
  await p.waitForFunction(() => getComputedStyle(document.documentElement).marginRight === '420px', null, { timeout: 4000 });   // espera a animação
  // fechar (o service worker manda 'fechar' à aba) e o estado fica na sessão da aba
  await p.evaluate(() => window.__ouvintes.forEach(f => f({ type: 'fechar' })));
  await p.waitForFunction(() => !document.documentElement.classList.contains('controlonvio-docked'));
  await p.evaluate(() => window.__ouvintes.forEach(f => f({ type: 'alternar' })));
  await p.waitForFunction(() => document.documentElement.classList.contains('controlonvio-docked'));
  await p.reload();
  await p.addScriptTag({ content: lerExt('shell.js') });
  await p.waitForFunction(() => document.documentElement.classList.contains('controlonvio-docked'), null, { timeout: 4000 });
  assert.deepEqual(p.erros, []);
});

await passo('shell: em tela estreita o painel cobre em vez de empurrar; o pedido do ícone abre ao carregar', async () => {
  const p = await pagina(URL_PORTAL, '<!doctype html><body>Onvio</body>');
  await p.setViewportSize({ width: 800, height: 700 });
  await semear(p, { abrirPainelAoCarregar: Date.now() });
  await p.goto(URL_PORTAL);
  await p.addScriptTag({ content: lerExt('shell.js') });
  await esperar(() => temPainel(p));
  assert.equal(await p.evaluate(() => document.documentElement.classList.contains('controlonvio-docked')), false);
  assert.ok((await p.evaluate(() => window.__removidos || [])).includes('abrirPainelAoCarregar'), 'o pedido é consumido');
  // pedido antigo (mais de 2 minutos) não abre nada
  const q = await pagina(URL_PORTAL, '<!doctype html><body>Onvio</body>');
  await semear(q, { abrirPainelAoCarregar: Date.now() - 5 * 60 * 1000 });
  await q.goto(URL_PORTAL);
  await q.addScriptTag({ content: lerExt('shell.js') });
  await q.waitForTimeout(600);
  assert.equal(temPainel(q), false);
});

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

/* ---------- guias: hook + ponte + aviso ---------- */
const URL_DOCS = 'https://onvio.com.br/staff/';
const hoje = new Date(); const d = n => { const x = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
const FILHOS = { data: { hasMore: false, items: [
  { id: 'd1', name: 'DARF 09-2026.pdf', mimeType: 'application/pdf', isReadByClientUser: false, customFields: { dueDate: d(1), clientId: 'cli-111' }, staffCenterViewPath: '/staff/#/documents/view/d1' },
  { id: 'd2', name: 'GPS.pdf', isReadByClientUser: true, customFields: { dueDate: d(1), clientId: 'cli-111' } },
  { id: 'd3', name: 'FGTS.pdf', isReadByClientUser: false, customFields: { dueDate: d(30), clientId: 'cli-111' } },
  { id: 'd4', name: 'Sem vencimento.pdf', isReadByClientUser: false, customFields: {} },
  { id: 'd5', name: 'Vencida.pdf', isReadByClientUser: false, customFields: { dueDate: d(-2), clientId: 'cli-222' }, staffCenterViewPath: 'https://evil.example.com/x' },
  { id: 'p1', name: 'Subpasta', isReadByClientUser: false, documentCount: 4, hasFiles: true, customFields: { dueDate: d(0) } }
] } };
const CLIENTES = { items: [{ id: 'cli-111', nickname: 'ACME LTDA' }, { id: 'cli-222', name: 'BETA SA' }] };
const PAGINA_DOCS = `<!doctype html><body><div id="app">Documentos</div></body>`;

await passo('guias: capta fetch e XHR, guarda só não lidas com vencimento, mostra o aviso', async () => {
  const p = await pagina(URL_DOCS, PAGINA_DOCS);
  await p.route('**/api/storage/v2/Folders/*/children*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(FILHOS) }));
  await p.route('**/api/core/v3/companies/*/clients/search*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(CLIENTES) }));
  await p.addInitScript(lerExt('docs-hook.js'));
  await p.goto(URL_DOCS);
  await p.addScriptTag({ content: lerExt('core.js') });
  await p.addScriptTag({ content: lerExt('docs-ponte.js') });
  await p.evaluate(() => fetch('/api/core/v3/companies/9/clients/search?x=1').then(r => r.json()));
  // a página usa XHR (AngularJS)
  await p.evaluate(() => new Promise(res => { const x = new XMLHttpRequest(); x.open('GET', '/api/storage/v2/Folders/pasta-1/children?from=0&pageSize=50'); x.onload = res; x.send(); }));
  await p.waitForSelector('#controlonvio-guias', { timeout: 4000 });
  const mem = await p.evaluate(() => JSON.parse(localStorage.getItem('__mem')));
  const docs = mem.guias['pasta-1'].docs;
  assert.deepEqual(docs.map(x => x.id).sort(), ['d1', 'd3', 'd5'], 'guarda não lidas com vencimento; descarta lida, sem vencimento e pasta');
  assert.equal(docs.find(x => x.id === 'd1').link, 'https://onvio.com.br/staff/#/documents/view/d1');
  assert.equal(docs.find(x => x.id === 'd5').link, '', 'link de outro domínio é descartado');
  assert.equal(mem.clientes['cli-111'], 'ACME LTDA');
  assert.equal(mem.clientes['cli-222'], 'BETA SA');
  const aviso = await p.$eval('#controlonvio-guias', e => e.textContent);
  assert.match(aviso, /^2 guia\(s\) sem visualização do cliente perto do vencimento · 2 urgente\(s\)/);
  assert.match(aviso, /Vence amanhã/); assert.match(aviso, /Venceu há 2 dia\(s\)/);
  assert.doesNotMatch(aviso, /FGTS/, 'd3 vence em 30 dias: fica guardada, mas sem alerta');
  assert.deepEqual(p.erros, []);
  // reabrir a pasta com o DARF já lido: ele sai da lista
  await p.unroute('**/api/storage/v2/Folders/*/children*');
  const lido = JSON.parse(JSON.stringify(FILHOS)); lido.data.items[0].isReadByClientUser = true;
  await p.route('**/api/storage/v2/Folders/*/children*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(lido) }));
  await p.evaluate(() => fetch('/api/storage/v2/Folders/pasta-1/children?from=0').then(r => r.json()));
  await p.waitForFunction(() => !/Vence amanhã/.test(document.getElementById('controlonvio-guias')?.textContent || ''), null, { timeout: 4000 });
  const mem2 = await p.evaluate(() => JSON.parse(localStorage.getItem('__mem')));
  assert.deepEqual(mem2.guias['pasta-1'].docs.map(x => x.id).sort(), ['d3', 'd5']);
});

await passo('guias: segunda página da mesma pasta (from>0) soma, não substitui', async () => {
  const p = await pagina(URL_DOCS, PAGINA_DOCS);
  const pag = n => ({ data: { hasMore: n === 0, items: [{ id: 'q' + n, name: 'arq' + n, isReadByClientUser: false, customFields: { dueDate: d(2), clientId: 'c' } }] } });
  await p.route('**/api/storage/v2/Folders/*/children*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(pag(new URL(r.request().url()).searchParams.get('from') === '0' ? 0 : 1)) }));
  await p.addInitScript(lerExt('docs-hook.js'));
  await p.goto(URL_DOCS);
  await p.addScriptTag({ content: lerExt('core.js') });
  await p.addScriptTag({ content: lerExt('docs-ponte.js') });
  await p.evaluate(() => fetch('/api/storage/v2/Folders/pz/children?from=0').then(r => r.json()));
  await p.evaluate(() => fetch('/api/storage/v2/Folders/pz/children?from=50').then(r => r.json()));
  await p.waitForFunction(() => (JSON.parse(localStorage.getItem('__mem') || '{}').guias?.pz?.docs || []).length === 2, null, { timeout: 4000 });
});

await passo('guias: mensagens forjadas pela página são ignoradas se mal formadas e não quebram', async () => {
  const p = await pagina(URL_DOCS, PAGINA_DOCS);
  await p.goto(URL_DOCS);
  await p.addScriptTag({ content: lerExt('core.js') });
  await p.addScriptTag({ content: lerExt('docs-ponte.js') });
  await p.evaluate(() => { window.postMessage({ src: 'controlonvio', tipo: 'filhos', pasta: 'x', docs: [{ id: 'z', nome: 'a'.repeat(5000), lido: false, due: '2999-01-01', link: 'javascript:alert(1)' }] }, location.origin); window.postMessage({ src: 'outro' }, location.origin); window.postMessage('texto', location.origin); });
  await p.waitForFunction(() => JSON.parse(localStorage.getItem('__mem') || '{}').guias?.x, null, { timeout: 4000 });
  const g = await p.evaluate(() => JSON.parse(localStorage.getItem('__mem')).guias.x.docs[0]);
  assert.equal(g.nome.length, 200);
  assert.equal(g.link, '');
  assert.deepEqual(p.erros, []);
});

/* ---------- painel lateral ---------- */
const SP = 'file://' + EXT + 'painel.html';
await passo('painel: abas Analistas (G1/G2/G3, 1º trâmite) e Guias, aviso de código desconhecido', async () => {
  const ctx = await navegador.newContext();
  const p = await ctx.newPage();
  const erros = []; p.on('pageerror', e => erros.push(String(e)));
  await p.route(/^https?:/, r => r.abort());
  await p.addInitScript(STUB);
  await p.addInitScript(`localStorage.setItem('__mem', ${JSON.stringify(JSON.stringify({
    snapshot, status: { estado: 'ok', erros: [] },
    guias: { pz: { ts: Date.now(), docs: [
      { id: 'a', nome: 'DARF.pdf', due: '${d(1)}', clientId: 'cli-111', link: 'https://onvio.com.br/staff/#/x' },
      { id: 'b', nome: 'Vencida.pdf', due: '${d(-3)}', clientId: 'zzzzzzzz-9', link: '' },
      { id: 'c', nome: 'Longe.pdf', due: '${d(40)}', clientId: 'cli-111', link: '' } ] } },
    clientes: { 'cli-111': 'ACME LTDA' }
  }).replace(/\$\{d\((-?\d+)\)\}/g, (_, n) => d(Number(n))))});`.replace(/\$\{d\((-?\d+)\)\}/g, (_, n) => d(Number(n))));
  await p.goto(SP);
  await p.waitForSelector('#kpis .kpi-card');
  const aviso = await p.$eval('#aviso', e => e.textContent);
  assert.match(aviso, /Situação que a extensão não conhece/);
  assert.match(aviso, /Geral: código 77 \(1\)/);
  assert.equal(await p.$eval('#b-guias', e => e.textContent), '2');
  await p.click('[data-aba="analistas"]');
  const linhas = await p.$$eval('#tbl-an tbody tr', trs => trs.map(tr => [...tr.children].map(td => td.textContent)));
  const ana = linhas.find(l => l[0] === 'Ana');
  assert.deepEqual(ana, ['Ana', '1', '0', '0', '1', '0', '0', '2']);
  const sem = linhas.find(l => l[0] === '(sem responsável)');
  assert.deepEqual(sem.slice(0, 6), ['(sem responsável)', '0', '1', '0', '0', '1']);
  await p.click('[data-aba="guias"]');
  await p.waitForSelector('#lista-guias .row');
  const guias = await p.$$eval('#lista-guias .row, #lista-guias .grupo', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  assert.equal(guias.length, 4, '2 grupos + 2 guias (a de 40 dias fica de fora)');
  assert.match(guias[0], /^Cliente zzzzzzzz/); // vencida primeiro, cliente sem nome conhecido
  assert.match(guias.join('|'), /ACME LTDA/);
  assert.match(guias.join('|'), /Venceu há 3 dia\(s\)/);
  await p.fill('#f-guia', 'acme');
  assert.equal(await p.$$eval('#lista-guias .row', e => e.length), 1);
  // clicar numa guia com link abre aba; sem link avisa
  await p.click('#lista-guias .row');
  assert.equal(await p.evaluate(() => (window.__tabs || []).length), 1);
  assert.equal(await p.evaluate(() => window.__tabs[0].url), 'https://onvio.com.br/staff/#/x');
  // aba Equipe: G3 aparece na linha
  await p.click('[data-aba="equipe"]');
  assert.ok((await p.$$eval('#lista .pill-late', e => e.map(x => x.textContent))).includes('G3'));
  assert.ok((await p.$$eval('#lista .pill-muted', e => e.map(x => x.textContent))).includes('Pode ser: Aviso de férias'), 'sugestão de aba certa na lista Geral');
  // fontes empacotadas: carregam do disco, sem serviço externo
  await p.evaluate(() => document.fonts.ready);
  const fontes = await p.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/"/g, '')));
  assert.ok(fontes.includes('Archivo') && fontes.includes('IBM Plex Sans'), 'fontes locais carregadas: ' + fontes);
  assert.deepEqual(erros, []);
});

await navegador.close();
console.log(falhas.length ? '\nFALHARAM: ' + falhas.join(' | ') : '\ntodos os testes de navegador passaram');
process.exit(falhas.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

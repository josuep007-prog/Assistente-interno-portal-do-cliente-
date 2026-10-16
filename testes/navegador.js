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
      // outra API do Onvio (os trâmites de algumas listas podem vir daqui): também entra, só o formato
      await fetch('/api/storage/v2/Folders/1/children');
      // fora de /api/: ignorado
      await fetch('/br-portal-do-cliente/assets/i18n/pt.json').catch(() => {});
    });
    await p.waitForTimeout(600);
    return { p, mem: await p.evaluate(() => JSON.parse(localStorage.getItem('__mem'))) };
  };

  const { p, mem } = await montar({ ligado: true, desde: Date.now() });
  const ap = mem.aprendizado || [];
  const txt = JSON.stringify(ap);
  assert.equal(ap.length, 4, 'POST de trâmite (deduplicado), anexo, leitura e outra API: ' + ap.map(a => a.metodo + ' ' + a.caminho).join(' | '));
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
  assert.ok(ap.some(a => a.caminho === '/api/storage/v2/Folders/{id}/children'), 'outra API do Onvio');
  const leitura = ap.find(a => a.metodo === 'GET' && /generic/.test(a.caminho));
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
const OC_ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
async function abrirApp(rota, extra) {
  const p = await pagina(URL_APP, '');
  await p.setViewportSize({ width: 1360, height: 860 });
  await semear(p, Object.assign({}, ESTADO_APP, extra || {}));
  await p.goto(URL_APP + (rota || ''));
  await p.waitForFunction(() => document.querySelector('#vista').children.length > 0, null, { timeout: 5000 });
  return p;
}
const linhas = (p, sel) => p.$$eval(sel || '#corpo [data-k]', e => e.map(x => x.dataset.k));

await passo('app · Hoje (analista): destaque com rosca, carrossel e próximos passos; painéis de vencimentos, avisos, sugestões, uso e previsão; sem cartões de situação', async () => {
  const p = await abrirApp('#/inicio');
  await p.evaluate(() => { window.__respostas = Object.assign(window.__respostas || {}, { previsao: { ok: true, dias: 28, total: 12, prox30: 13, erros: [], empresas: [{ cliente: 'ACME LTDA', apelido: 'ACME', total: 8, porSemana: 2, prox7: 3, prox30: 11, tendencia: 'sobe', tipos: [{ tipo: 'Geral', n: 5 }, { tipo: 'Cálculo de férias', n: 3 }] }] } }); });
  assert.equal(await p.textContent('#titulo'), 'Hoje');
  assert.match(await p.textContent('#subtitulo'), /, Ana · /);
  for (const sel of ['.painel-ctrl', '#fita', '#g-radar', '#g-pulso', '.mosaico', '.semana', '#mapa-idade', '.hj-sits', '.hj-card', '.hj-sec', '#hj-busca']) assert.equal(await p.$(sel), null, sel + ' saiu do Hoje');
  // carteira: abre na sua
  assert.equal(await p.$eval('#hj-carteira', s => s.value), '__minha');
  assert.deepEqual(await p.$$eval('#hj-carteira option', o => o.map(x => x.textContent)), ['Minha carteira (2)', 'Equipe toda (4)', 'Ana Teste (2)', 'Bia (1)', 'Sem analista (1)']);
  // destaque: rosca, título, resumo e legenda
  await p.waitForFunction(() => document.querySelector('.hj-donut .an-total').textContent === '0%' && document.querySelector('#hj-titulo em').textContent === '2');
  assert.match(await p.textContent('#hj-titulo'), /^2 solicitações pedem sua atenção$/);
  assert.match(await p.textContent('.hj-hero-tx p'), /^2 pendências · 2 com o escritório · 0 com o cliente$/);
  assert.match(await p.textContent('.hj-legenda'), /Fora do prazo 1.*Vence hoje 1/);
  // carrossel e próximos passos
  assert.equal(await p.getAttribute('#hj-tick', 'class'), 'hj-tick ok');
  assert.deepEqual(await p.$$eval('.hj-tk', e => e.map(x => x.querySelector('.hj-tk-tag').textContent)), ['Lembrete atrasado', 'Urgente', 'Atenção']);
  assert.deepEqual(await p.$$eval('#hj-passos .hj-step b', e => e.map(x => x.textContent)), ['Cobrar o BETA', 'Fora do prazo · parada há 31 dias', 'Concluir hoje · o prazo vence hoje']);
  // painéis
  assert.deepEqual(await p.$$eval('.hj-paineis > section', e => e.map(x => x.id)), ['hj-venc', 'hj-semcalc-v', 'hj-sug', 'hj-uso', 'hj-prev']);
  assert.match(await p.textContent('#hj-sug'), /Comece pelas críticas \(G3\)[\s\S]*Responda quem já respondeu[\s\S]*Oriente os clientes que abriram na lista Geral/);
  assert.equal(await p.getAttribute('#hj-sug a', 'href'), '#/fila?escopo=minhas&kpi=g3');
  assert.match(await p.textContent('#hj-uso'), /BETA1 na lista Geral com aba própria/);
  // previsão por empresa: pedida sozinha ao abrir, mostrada em tabela
  await p.waitForFunction(() => window.__msgs.some(m => m.cmd === 'previsao'));
  await p.click('#hj-prev-ler');                         // a 1ª leitura saiu antes da resposta simulada: recalcula
  await p.waitForSelector('#hj-prev table');
  assert.match(await p.textContent('#hj-prev'), /Escritório: 12 abertas em 4 semanas · estimativa de 13 nos próximos 30 dias[\s\S]*ACME2311 ▲Geral, Cálculo de férias/);
  // clique na rosca leva às Solicitações com o motivo, na mesma carteira
  // a rosca entra animada: o clique só vale depois que os arcos chegam ao lugar
  await p.waitForFunction(() => !document.querySelector('#vista').classList.contains('hj-anim'));
  await p.waitForTimeout(250);
  const ponto = await p.evaluate(() => { const r = document.querySelector('.hj-donut .an-svg').getBoundingClientRect(), k = r.width / 150; return [r.left + (75 + 64) * k, r.top + 75 * k]; });
  await p.mouse.click(ponto[0], ponto[1]);
  await p.waitForFunction(() => location.hash === '#/fila?motivo=atraso');
  assert.equal(await p.textContent('#titulo'), 'Solicitações');
  await p.evaluate(() => { location.hash = '#/inicio'; });
  await p.waitForSelector('#hj-passos');
  // passo e carrossel abrem o detalhe; lembrete "Feito" sai dos próximos passos
  await p.click('#hj-passos [data-k="calcFerias:a"]');
  await p.waitForFunction(() => /ACME/.test(document.querySelector('#gaveta h2').textContent));
  await p.keyboard.press('Escape');
  await p.waitForSelector('#gaveta', { state: 'hidden' });
  await p.click('#hj-passos [data-feito]');
  await p.waitForFunction(() => !/Cobrar o BETA/.test(document.querySelector('#hj-passos').textContent));
  // carteira Equipe toda
  await p.selectOption('#hj-carteira', '__equipe');
  await p.waitForFunction(() => document.querySelector('.hj-donut .an-total').textContent === '25%');
  assert.match(await p.textContent('.hj-hero-tx p'), /4 pendências · 3 com o escritório · 1 com o cliente · 1 sem analista/);
  assert.match(await p.textContent('#hj-sug'), /Distribua as solicitações sem responsável/);
  await p.selectOption('#hj-carteira', 'Bia');
  await p.waitForFunction(() => /Tudo em dia/.test(document.querySelector('#hj-titulo').textContent));
  await p.reload(); await p.waitForSelector('#hj-carteira');
  assert.equal(await p.$eval('#hj-carteira', s => s.value), 'Bia');
  await p.selectOption('#hj-carteira', '__minha');
  assert.equal(await p.textContent('#n-fila'), '2');
  assert.match(await p.textContent('#aovivo-tx'), /^Ao vivo · \d\d:\d\d:\d\d$/);
  assert.match(await p.textContent('.trilho [data-rota="fila"]'), /Solicitações/);
  assert.match(await p.textContent('.trilho [data-rota="solicitacoes"]'), /Consultar no Onvio/);
  assert.deepEqual(p.erros, []);
});

await passo('app · Hoje: admissões sem trâmite do escritório em faixa recolhível abaixo do destaque; vencimentos legais em painel', async () => {
  const itens = ITENS_APP.concat([
    { k: 'cadEmpregado:e1', type: 'cadEmpregado', typeLabel: 'Cadastro empregado', id: 'e1', num: 301, code: 2, status: 'Enviado para o escritório', lado: 'esc', nivel: 2, grav: 2, parado: 1, motivos: [{ n: 2, m: 'Admissão retroativa' }], resp: 'Ana Teste', mine: true, apelido: 'DELTA', cliente: 'DELTA', detalhe: 'Fulano', created: agoraIso(1), last: agoraIso(1), admissao: '2026-10-10', admissaoAlerta: { data: '2026-10-10', faltam: -4, retro: true } },
    { k: 'cadEmpregado:e2', type: 'cadEmpregado', typeLabel: 'Cadastro empregado', id: 'e2', num: 302, code: 1, status: 'Sem análise', lado: 'esc', nivel: 1, grav: 1, parado: 0, motivos: [], resp: 'Ana Teste', mine: true, apelido: 'ÔMEGA', cliente: 'ÔMEGA', detalhe: 'Joana', created: agoraIso(0), last: agoraIso(0), admissao: '2026-10-20', admissaoAlerta: { data: '2026-10-20', faltam: 2, retro: false } },
    { k: 'cadEmpregado:e3', type: 'cadEmpregado', typeLabel: 'Cadastro empregado', id: 'e3', num: 303, code: 3, status: 'Aguardando o cliente', lado: 'cli', nivel: 2, grav: 2, parado: 1, motivos: [], resp: 'Ana Teste', mine: true, apelido: 'SIGMA', cliente: 'SIGMA', detalhe: 'Pedro', created: agoraIso(3), last: agoraIso(1), admissao: '2026-10-10', admissaoAlerta: { data: '2026-10-10', faltam: -4, retro: true } },
    { k: 'cadEmpregado:e4', type: 'cadEmpregado', typeLabel: 'Cadastro empregado', id: 'e4', num: 304, code: 4, status: 'Respondido pelo cliente', lado: 'esc', nivel: 2, grav: 2, parado: 1, motivos: [], resp: 'Ana Teste', mine: true, apelido: 'TAU', cliente: 'TAU', detalhe: 'Rui', created: agoraIso(3), last: agoraIso(1), primeiroTramite: agoraIso(2), admissao: '2026-10-12', admissaoAlerta: { data: '2026-10-12', faltam: -2, retro: false } },
    { k: 'calcFerias:f9', type: 'calcFerias', typeLabel: 'Cálculo de férias', id: 'f9', num: 401, code: 2, status: 'Em análise', lado: 'esc', nivel: 1, grav: 1, parado: 0, motivos: [], resp: 'Ana Teste', mine: true, apelido: 'ZETA', cliente: 'ZETA', detalhe: 'Beltrano', created: agoraIso(2), last: agoraIso(0), pagamentoAte: { alvo: OC_ymd(new Date()), ref: 'início das férias em 20/10' } }
  ]);
  const p = await abrirApp('#/inicio', { snapshot: Object.assign({}, ESTADO_APP.snapshot, { items: itens }) });
  await p.waitForSelector('#hj-admissao');
  const ordem = await p.evaluate(() => [...document.querySelector('#vista').children].map(x => x.id || x.className.split(' ')[0]));
  assert.ok(ordem.indexOf('hj-admissao') === ordem.indexOf('hj-hero') + 1, 'logo abaixo do destaque: ' + ordem.join());
  assert.match(await p.textContent('#hj-admissao h3'), /2 admissões pedem prioridade 1 retroativa · próxima em 20\/10/, 'as que o escritório já tramitou (situação do escritório ou trâmite lido) ficam de fora');
  const l = await p.$$eval('#hj-admissao .hj-adm', e => e.map(x => x.textContent));
  assert.match(l[0], /^10\/10retroativa#301 DELTA · Fulano/);
  assert.match(l[1], /^20\/10em 2 dias úteis#302 ÔMEGA · Joana/);
  assert.match(await p.textContent('#hj-venc'), /hoje.*ZETA · Beltrano.*Cálculo de férias · início das férias em 20\/10/);
  assert.ok(!/Priorize as admissões em destaque/.test(await p.textContent('#hj-sug')), 'sugestão não repete o que já tem faixa própria');
  await p.click('#hj-admissao [data-k="cadEmpregado:e2"]');
  await p.waitForFunction(() => (window.__msgs || []).some(m => m.cmd === 'detalhe' && String(m.num) === '302'));
  await p.keyboard.press('Escape');
  await p.waitForSelector('#gaveta', { state: 'hidden' });
  // recolhe e lembra
  await p.click('#hj-adm-toggle');
  assert.equal(await p.isHidden('#hj-adm-l'), true);
  assert.match(await p.textContent('#hj-adm-toggle'), /Mostrar$/);
  await p.reload(); await p.waitForSelector('#hj-admissao');
  assert.equal(await p.isHidden('#hj-adm-l'), true, 'continua recolhida');
  assert.match(await p.textContent('#hj-admissao h3'), /2 admissões pedem prioridade/, 'recolhida, o resumo continua à vista');
  await p.click('#hj-adm-toggle');
  assert.equal(await p.isHidden('#hj-adm-l'), false);
  // Solicitações com kpi=admissao: o mesmo critério
  await p.evaluate(() => { location.hash = '#/fila?escopo=equipe&kpi=admissao'; });
  await p.waitForFunction(() => document.querySelectorAll('#corpo [data-k]').length === 2);
  assert.deepEqual((await linhas(p)).sort(), ['cadEmpregado:e1', 'cadEmpregado:e2']);
  assert.deepEqual(p.erros, []);
});

await passo('app · Hoje sem nada com você: abre na equipe toda e a frase explica; leitura vazia avisa', async () => {
  const semMinhas = ITENS_APP.map(i => Object.assign({}, i, { mine: false }));
  const p = await abrirApp('#/inicio', { snapshot: Object.assign({}, ESTADO_APP.snapshot, { items: semMinhas }) });
  assert.equal(await p.$eval('#hj-carteira', s => s.value), '__equipe');
  assert.match(await p.textContent('#ht-resumo'), /Nenhuma pendência está com você como responsável.*equipe toda \(4 pendências\)/);
  await p.waitForFunction(() => document.querySelector('#hj-titulo em') && document.querySelector('#hj-titulo em').textContent === '3');
  await p.selectOption('#hj-carteira', '__minha');
  await p.waitForFunction(() => /Nada pendente nesta carteira/.test(document.querySelector('#hj-titulo').textContent));
  assert.equal(await p.$('#ht-resumo'), null, 'escolheu: sem a frase');
  const vazio = await abrirApp('#/inicio', { snapshot: Object.assign({}, ESTADO_APP.snapshot, { items: [] }) });
  assert.match(await vazio.textContent('#ht-resumo'), /não trouxe nenhuma pendência em nenhuma das 10 listas.*Testar a leitura/);
  assert.deepEqual(p.erros.concat(vazio.erros), []);
});

await passo('app · Fila: abas Minhas/Equipe/Sem responsável, filtros e chips, ordenação, cartões, ↑↓ e Enter', async () => {
  const p = await abrirApp('#/fila');
  assert.equal(await p.textContent('#titulo'), 'Solicitações');
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
  assert.equal(await p.textContent('#titulo'), 'Solicitações');
  assert.match(await p.textContent('#subtitulo'), /^Sem responsável/);
  assert.deepEqual(p.erros, []);
});

await passo('app · Equipe (gestor): números, 4 gráficos com dicas, prescrição e distribuição; Responsáveis com mapa de calor e fila da pessoa', async () => {
  const p = await abrirApp('#/equipe');
  const kpis = await p.$$eval('.kpi', e => e.map(x => x.querySelector('.rot').textContent + '=' + x.querySelector('.val').textContent));
  assert.deepEqual(kpis, ['Pendências=4', 'Sem responsável=1', 'Fora do prazo=2', 'Prescrevem em 5 dias=1', '1º trâmite (média)=1', 'Hoje=3 / 1']);
  for (const id of ['#g-carga', '#g-dias', '#g-horas', '#g-tipo']) assert.ok(await p.$(id + ' svg'), 'gráfico ' + id);
  assert.match(await p.textContent('#g-carga .legenda-viz'), /Em dia.*G1 atenção.*G2 fora do prazo.*G3 crítica/);
  await p.hover('#g-carga [data-tip]');
  assert.equal(await p.isVisible('#dica'), true, 'dica ao passar o mouse');
  // distribuição e prescrição (saíram do Hoje) no Painel
  assert.match(await p.textContent('#l-presc'), /4dias[\s\S]*GAMA/);
  assert.match(await p.textContent('#distribuicao'), /GAMA[\s\S]*sugerido: Bia/);
  await p.click('#abas [data-aba="resp"]');
  await p.waitForSelector('tr[data-resp="Ana Teste"]');
  // mapa de calor de idade na aba Responsáveis → fila da pessoa naquela faixa, com a etiqueta que sai com um clique
  assert.equal(await p.$$eval('#mapa-idade .mc-v:not(:disabled)', e => e.length), 4);
  await p.click('#mapa-idade .mc-v[data-id="Ana Teste"][data-col="31-"]');
  await p.waitForFunction(() => location.hash.startsWith('#/fila?analista=Ana+Teste&idade=31-') && document.querySelector('#ativos .chip-f'));
  assert.deepEqual(await linhas(p), ['calcFerias:a']);
  assert.match(await p.textContent('#ativos'), /Parada há 31\+ dias/);
  await p.goto(URL_APP + '#/equipe');
  await p.waitForSelector('#abas [data-aba="resp"]');
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

await passo('app · detalhe: aba Dados com a solicitação completa em grupos e anexos; "Para o cliente" com avisos e copiar com um clique', async () => {
  const p = await abrirApp('#/fila', {});
  await p.evaluate(() => {
    window.__copiado = null;
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async t => { window.__copiado = t; } }, configurable: true });
    const em = new Date(); em.setDate(em.getDate() + 12);
    const ymd = em.getFullYear() + '-' + String(em.getMonth() + 1).padStart(2, '0') + '-' + String(em.getDate()).padStart(2, '0');
    window.__respostas = { detalhe: { ok: true, item: { assunto: 'Férias', type: 'avisoFerias', created: new Date().toISOString().slice(0, 19) }, tramites: [], datas: { inicio: ymd },
      grupos: [{ titulo: 'Solicitação', campos: [{ k: 'Início das férias', v: '27/10/2026' }, { k: 'Dias de férias', v: '30' }, { k: 'Descrição', v: '<p>Pedido do cliente</p>', longo: true }] }, { titulo: 'Empregado', campos: [{ k: 'Nome', v: 'Fulano' }, { k: 'Cargo', v: 'Auxiliar' }, { k: 'Matrícula', v: '12' }] }],
      anexos: ['aviso-assinado.pdf'] } };
  });
  await p.click('#corpo [data-k="geral:b"]');
  await p.waitForSelector('#gaveta [data-aba="cliente"]');
  await p.click('#gaveta [data-aba="dados"]');
  const t = await p.textContent('#g-corpo');
  assert.match(t, /^Solicitação.*Início das férias27\/10\/2026.*Dias de férias30/, 'sem o bloco "Controle" repetindo o topo');
  assert.ok(!/Controle|Dias parada|1º trâmite/.test(t));
  assert.match(await p.textContent('.dp-last'), /Responsável: .*Aberta em /, 'abertura no topo da janela');
  assert.match(t, /Empregado.*NomeFulano.*CargoAuxiliar/);
  assert.match(t, /Pedido do cliente/);
  assert.match(t, /Anexos da solicitação.*aviso-assinado\.pdf/);
  assert.match(await p.textContent('#gaveta [data-aba="dados"]'), /1 anexo/);
  // Para o cliente: aviso calculado (menos de 30 dias) marcado com "!" na aba
  assert.match(await p.textContent('#gaveta [data-aba="cliente"]'), /Para o cliente!/);
  await p.click('#gaveta [data-aba="cliente"]');
  const obs = await p.$$eval('#g-obs .obs', e => e.map(x => x.textContent));
  assert.match(obs[0], /^Atenção: faltam 12 dias para o início das férias/);
  assert.ok(obs.some(x => /O aviso precisa ser entregue ao empregado com pelo menos 30 dias/.test(x)));
  // tira uma observação: o texto que será copiado acompanha
  await p.click('#g-obs .obs:last-child input');
  assert.ok(!/abono pecuniário/.test(await p.textContent('#g-obs-texto')));
  await p.click('#g-copiar-obs2');
  await p.waitForFunction(() => window.__copiado);
  const cop = await p.evaluate(() => window.__copiado);
  assert.match(cop, /^Observações importantes:\n• Atenção: faltam 12 dias/);
  assert.ok(!/abono pecuniário/.test(cop));
  assert.deepEqual(p.erros, []);
});

await passo('app · Hoje: avisos sem cálculo com Férias e Rescisões separadas; menu com responder no aviso, já avisei e desconsiderar', async () => {
  const itens = ITENS_APP.concat([
    { k: 'avisoFerias:f1', type: 'avisoFerias', typeLabel: 'Aviso de férias', id: 'f1', num: 201, code: 1, status: 'Sem análise', lado: 'esc', nivel: 0, grav: 0, parado: 1, motivos: [], resp: 'Ana Teste', mine: true, apelido: 'DELTA', cliente: 'DELTA', detalhe: 'Fulano', created: agoraIso(2), last: agoraIso(1), semCalculo: { alvo: '2026-10-30', faltam: 3, ref: 'início das férias em 03/11/2026', calculo: 'Cálculo de férias' } },
    { k: 'avisoRescisao:r1', type: 'avisoRescisao', typeLabel: 'Aviso de rescisão', id: 'r1', num: 202, code: 2, status: 'Em análise', lado: 'esc', nivel: 0, grav: 0, parado: 1, motivos: [], resp: 'Ana Teste', mine: true, apelido: 'ÔMEGA', cliente: 'ÔMEGA', detalhe: 'Joana', created: agoraIso(2), last: agoraIso(1), semCalculo: { alvo: '2026-10-14', faltam: -1, ref: 'aviso em 04/10/2026', calculo: 'Cálculo de rescisão' } }
  ]);
  const p = await abrirApp('#/inicio', { snapshot: Object.assign({}, ESTADO_APP.snapshot, { items: itens }) });
  await p.waitForSelector('#hj-semcalc .sc-cols');
  const grupo = (tipo, g) => p.$$eval('#hj-semcalc [data-tipo="' + tipo + '"] [data-grupo="' + g + '"] .sc-abre', e => e.map(x => x.dataset.k));
  const menu = async (tipo, sel) => { await p.click('#hj-semcalc [data-tipo="' + tipo + '"] [data-grupo="avisar"] .sc-mais summary'); await p.click('#hj-semcalc [data-tipo="' + tipo + '"] .sc-mais[open] ' + sel); };
  assert.equal(await p.$('.hj-paineis #hj-semcalc'), null, 'o painel fica acima dos outros, em largura total');
  assert.deepEqual(await p.$$eval('#hj-semcalc .sc-col h4', e => e.map(x => x.textContent)), ['Férias 1', 'Rescisões 1'], 'férias e rescisões separadas');
  assert.deepEqual(await grupo('avisoFerias', 'avisar'), ['avisoFerias:f1']);
  assert.deepEqual(await grupo('avisoRescisao', 'avisar'), ['avisoRescisao:r1']);
  assert.match(await p.textContent('#hj-semcalc [data-tipo="avisoRescisao"] .sc-l'), /14\/10venceu há 1 d\.u\.#202 ÔMEGA · Joana.*Sem cálculo de rescisão · pagamento até 14\/10/);
  assert.match(await p.textContent('#hj-semcalc [data-tipo="avisoFerias"] .sc-l'), /30\/10vence em 3 d\.u\.#201 DELTA · Fulano/);
  assert.equal(await p.$eval('#hj-semcalc [data-tipo="avisoRescisao"] .sc-tx b', b => getComputedStyle(b).color) === await p.$eval('#hj-semcalc [data-tipo="avisoFerias"] .sc-tx b', b => getComputedStyle(b).color), true, 'título com a mesma cor, vencido ou não');
  assert.equal(await p.isVisible('#hj-semcalc [data-sc-marca="desconsiderado"]'), false, 'ações secundárias no menu');
  // "Já avisei" passa para a 2ª coluna; "Voltar" devolve
  await menu('avisoFerias', '[data-sc-marca="avisado"]');
  await p.waitForFunction(() => document.querySelectorAll('#hj-semcalc [data-tipo="avisoFerias"] [data-grupo="avisados"] .sc-l').length === 1);
  assert.deepEqual(await grupo('avisoFerias', 'avisados'), ['avisoFerias:f1']);
  assert.match(await p.textContent('#hj-semcalc [data-tipo="avisoFerias"] [data-grupo="avisados"]'), /avisado \d{2}\/\d{2} \d{2}:\d{2}/);
  assert.match(await p.textContent('#hj-semcalc [data-tipo="avisoFerias"] h4'), /Férias 01 avisado/);
  const marcas = await p.evaluate(() => JSON.parse(localStorage.getItem('__mem')).semCalculoMarcas);
  assert.deepEqual(Object.keys(marcas), ['avisoFerias:f1']);
  assert.deepEqual(Object.keys(marcas['avisoFerias:f1']).sort(), ['em', 'st'], 'guarda só a coluna e quando');
  await p.click('#hj-semcalc [data-grupo="avisados"] [data-sc-marca=""]');
  await p.waitForFunction(() => document.querySelectorAll('#hj-semcalc [data-grupo="avisar"] .sc-l').length === 2);
  // desconsiderar tira do quadro (fica na lista de desconsiderados, de onde pode voltar)
  await menu('avisoRescisao', '[data-sc-marca="desconsiderado"]');
  await p.waitForFunction(() => document.querySelectorAll('#hj-semcalc [data-grupo="avisar"] .sc-l').length === 1);
  assert.match(await p.textContent('#hj-semcalc [data-tipo="avisoRescisao"] .sc-vazio'), /Nenhum aviso de rescisão sem cálculo/);
  assert.match(await p.textContent('#hj-semcalc .sc-desc summary'), /1 desconsiderado/);
  assert.match(await p.textContent('#hj-sc-total'), /^1$/);
  // avisar o cliente: abre o detalhe já no formulário de trâmite, com texto e situação sugeridos; só envia depois de confirmar
  await p.evaluate(() => { window.__respostas = Object.assign(window.__respostas || {}, { acao: { ok: true, acao: 'tramite', anexos: 0 }, detalhe: { ok: true, item: { assunto: 'Férias' }, tramites: [], datas: {} } }); });
  await menu('avisoFerias', '[data-sc-avisar]');
  await p.waitForSelector('#gaveta #a-texto');
  assert.equal(await p.$eval('#a-situacao', s => s.value), '4', 'Respondido: a vez passa ao cliente');
  const txt = await p.$eval('#a-texto', t => t.value);
  assert.match(txt, /^Recebemos o aviso de férias de Fulano, mas ainda não há a solicitação de cálculo de férias desse empregado\. Para o pagamento sair dentro do prazo legal \(até 30\/10\/2026, início das férias em 03\/11\/2026\)/);
  assert.equal(await p.evaluate(() => window.__msgs.some(m => m.cmd === 'acao')), false, 'abrir o formulário não envia');
  await p.click('#a-revisar');
  await p.waitForSelector('#a-enviar');
  assert.equal(await p.evaluate(() => window.__msgs.some(m => m.cmd === 'acao')), false, 'revisar não envia');
  await p.click('#a-enviar');
  await p.waitForFunction(() => window.__msgs.some(m => m.cmd === 'acao'));
  const m = await p.evaluate(() => window.__msgs.find(x => x.cmd === 'acao'));
  assert.deepEqual([m.acao, m.type, m.num, m.situacao], ['tramite', 'avisoFerias', '201', '4']);
  await p.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('__mem')).semCalculoMarcas['avisoFerias:f1'].st === 'avisado'; } catch (e) { return false; } });
  await p.keyboard.press('Escape');
  await p.waitForSelector('#gaveta', { state: 'hidden' });
  await p.waitForFunction(() => document.querySelectorAll('#hj-semcalc [data-grupo="avisados"] .sc-l').length === 1, null, { timeout: 4000 });
  assert.ok(!/semCalculo|Fulano/.test(JSON.stringify(await p.evaluate(() => JSON.parse(localStorage.getItem('__mem')).semCalculoMarcas))), 'texto e nome não são guardados');
  // o cartão abre o detalhe
  await p.click('#hj-semcalc .sc-abre[data-k="avisoFerias:f1"]');
  await p.waitForFunction(() => (window.__msgs || []).filter(m => m.cmd === 'detalhe' && String(m.num) === '201').length >= 2);
  assert.deepEqual(p.erros, []);
});

await passo('app · Nova solicitação (Geral): do quadro de avisos, das Solicitações e do detalhe; revisa, confirma, cria e abre a nova', async () => {
  const itens = ITENS_APP.concat([
    { k: 'avisoFerias:f1', type: 'avisoFerias', typeLabel: 'Aviso de férias', id: 'f1', num: 201, code: 1, status: 'Sem análise', lado: 'esc', nivel: 0, grav: 0, parado: 1, motivos: [], resp: 'Ana Teste', mine: true, apelido: 'DELTA', cliente: 'DELTA COMERCIO', detalhe: 'Fulano', created: agoraIso(2), last: agoraIso(1), semCalculo: { alvo: '2026-10-30', faltam: 3, ref: 'início das férias em 03/11/2026', calculo: 'Cálculo de férias' } }
  ]);
  const p = await abrirApp('#/inicio', { snapshot: Object.assign({}, ESTADO_APP.snapshot, { items: itens }) });
  await p.evaluate(() => { window.__respostas = Object.assign(window.__respostas || {}, { criar: { ok: true, criada: true, num: '1501', id: 'n1', tramite: true, erroTramite: null }, detalhe: { ok: true, item: { assunto: 'x' }, tramites: [], datas: {} } }); });
  // do quadro: já vem com cliente travado, assunto, texto e "passar a vez"
  await p.click('#hj-semcalc [data-sc-criar="avisoFerias:f1"]');
  await p.waitForSelector('#dlg-nova #nv-assunto');
  assert.match(await p.textContent('#dlg-nova .vinculo'), /Cliente: DELTA · DELTA COMERCIO/);
  assert.equal(await p.$eval('#nv-assunto', x => x.value), 'Cálculo de férias pendente · Fulano');
  assert.match(await p.$eval('#nv-desc', x => x.value), /^Recebemos o aviso de férias de Fulano/);
  assert.equal(await p.$eval('#nv-vez', x => x.checked), true);
  await p.fill('#nv-assunto', '');
  await p.click('#nv-revisar');
  assert.match(await p.textContent('#dlg-nova .faixa'), /Escreva o assunto/);
  await p.fill('#nv-assunto', 'Cálculo de férias pendente · Fulano');
  await p.click('#nv-revisar');
  await p.waitForSelector('#nv-conf');
  assert.match(await p.textContent('#nv-conf'), /Cliente: DELTA · DELTA COMERCIO.*Assunto: "Cálculo de férias pendente · Fulano".*trâmite "Respondido"/);
  assert.equal(await p.evaluate(() => window.__msgs.some(m => m.cmd === 'criar')), false, 'revisar não cria');
  await p.click('#nv-criar');
  await p.waitForFunction(() => window.__msgs.some(m => m.cmd === 'criar'));
  const m = await p.evaluate(() => window.__msgs.find(x => x.cmd === 'criar'));
  assert.deepEqual([m.origem.type, m.origem.num, m.assunto, m.passarVez], ['avisoFerias', '201', 'Cálculo de férias pendente · Fulano', true]);
  await p.waitForSelector('#dlg-nova', { state: 'hidden' });
  await p.waitForFunction(() => (window.__msgs || []).some(x => x.cmd === 'detalhe' && x.type === 'geral' && String(x.num) === '1501'), null, { timeout: 4000 });
  assert.match(await p.textContent('#toast'), /Solicitação #1501 criada no Onvio · a vez passou ao cliente/);
  await p.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('__mem')).semCalculoMarcas['avisoFerias:f1'].st === 'avisado'; } catch (e) { return false; } });
  // do detalhe: "Nova para o cliente" trava o cliente da solicitação aberta
  await p.click('#g-nova');
  await p.waitForSelector('#dlg-nova #nv-assunto');
  assert.equal(await p.$('#nv-cliente'), null);
  await p.keyboard.press('Escape');
  await p.waitForSelector('#dlg-nova', { state: 'hidden' });
  assert.equal(await p.isHidden('#gaveta'), false, 'Esc fecha só a janela de cima');
  await p.keyboard.press('Escape');
  // das Solicitações: escolhe o cliente; erro do Onvio aparece e nada é dado como criado
  await p.evaluate(() => { location.hash = '#/fila?escopo=equipe'; window.__respostas.criar = { ok: false, erro: 'o Onvio não aceitou (HTTP 400)' }; });
  await p.waitForSelector('#f-nova');
  await p.click('#f-nova');
  await p.waitForSelector('#nv-cliente');
  const ops = await p.$$eval('#nv-cliente option', o => o.map(x => x.value).filter(Boolean));
  assert.ok(ops.includes('DELTA COMERCIO') && ops.includes('ACME LTDA'), ops.join());
  await p.click('#nv-revisar');
  assert.match(await p.textContent('#dlg-nova .faixa'), /Escolha o cliente/);
  await p.selectOption('#nv-cliente', 'ACME LTDA');
  await p.fill('#nv-assunto', 'Documentos pendentes');
  await p.fill('#nv-desc', 'Envie os documentos.');
  await p.click('#nv-revisar');
  await p.click('#nv-criar');
  await p.waitForFunction(() => /Não foi criada: o Onvio não aceitou \(HTTP 400\)/.test(document.querySelector('#dlg-nova').textContent));
  const m2 = await p.evaluate(() => window.__msgs.filter(x => x.cmd === 'criar').pop());
  assert.deepEqual([m2.assunto, m2.descricao, m2.passarVez, !!m2.origem.num], ['Documentos pendentes', 'Envie os documentos.', false, true]);
  assert.equal(await p.$eval('#nv-assunto', x => x.value), 'Documentos pendentes', 'volta ao formulário com o que foi escrito');
  assert.deepEqual(p.erros, []);
});

await passo('app · detalhe: abas inteiras (não achatadas) mesmo com muito conteúdo e janela baixa', async () => {
  const p = await abrirApp('#/fila', {});
  await p.setViewportSize({ width: 1100, height: 560 });
  await p.evaluate(() => { window.__respostas = { detalhe: { ok: true, item: { assunto: 'Férias' }, tramites: Array.from({ length: 30 }, (x, n) => ({ n: n + 1, em: '2026-10-10T10:00:00', situacao: 'Em análise', autor: 'Ana', texto: 'Texto '.repeat(40), anexos: [] })), datas: {}, grupos: [], anexos: [] } }; });
  await p.click('#corpo [data-k="geral:b"]');
  await p.waitForFunction(() => document.querySelectorAll('#g-corpo .tl-item').length === 30);
  const m = await p.$eval('#gaveta .dtabs', e => ({ h: e.clientHeight, s: e.scrollHeight, tab: e.querySelector('.dtab').getBoundingClientRect().height }));
  assert.ok(m.h >= m.s - 1 && m.h >= 40 && m.tab >= 30, 'abas com a altura toda: ' + JSON.stringify(m));
  const corpo = await p.$eval('#g-corpo', e => ({ h: e.clientHeight, s: e.scrollHeight }));
  assert.ok(corpo.s > corpo.h, 'quem rola é o corpo');
  assert.deepEqual(p.erros, []);
});

await passo('app · Fila: cartões por tipo filtram (de novo tira); ordem por prioridade, empresa (agrupada) e mais recente', async () => {
  const p = await abrirApp('#/fila?escopo=equipe');
  const tipos = await p.$$eval('#tipos .tipo-c', e => e.map(x => x.dataset.tipo + '=' + x.querySelector('b').textContent));
  assert.equal(tipos.length, 11);
  assert.ok(tipos.includes('=4') && tipos.includes('calcFerias=1') && tipos.includes('afastamento=0'));
  assert.match(await p.textContent('#tipos [data-tipo="calcFerias"]'), /1 fora do prazo/);
  await p.click('#tipos [data-tipo="geral"]');
  assert.deepEqual(await linhas(p), ['geral:b']);
  await p.click('#tipos [data-tipo="geral"]');
  assert.equal((await linhas(p)).length, 4, 'clicar de novo volta a todos');
  // prioridade (padrão): a mesma ordem do Hoje
  assert.equal(await p.getAttribute('#f-ord [data-ord="prio"]', 'class'), 'on');
  assert.equal((await linhas(p))[0], 'calcFerias:a');
  await p.click('#f-ord [data-ord="cliente"]');
  assert.deepEqual(await p.$$eval('#corpo .emp-cab b', e => e.map(x => x.textContent)), ['ACME', 'BETA', 'GAMA']);
  assert.deepEqual(await linhas(p), ['calcFerias:a', 'rubricas:d', 'geral:b', 'avisoRescisao:c']);
  await p.click('#f-ord [data-ord="recente"]');
  assert.equal((await linhas(p))[0], 'rubricas:d');
  assert.equal(await p.evaluate(() => localStorage.getItem('controlonvio-fila-ord')), 'recente', 'a ordem escolhida fica lembrada');
  assert.deepEqual(p.erros, []);
});

await passo('app · Distribuir: mostra para quem vai cada sem responsável, com o porquê; Atribuir confirma e define no Onvio', async () => {
  const p = await abrirApp('#/fila', {});
  await p.evaluate(() => { window.__respostas = Object.assign(window.__respostas || {}, { acao: { ok: true, acao: 'responsavel', anexos: 0 }, distribuicao: { ok: true, dias: 7, movimentadas: 40, erros: [], sugestoes: [
    { item: { k: 'avisoRescisao:c', type: 'avisoRescisao', typeLabel: 'Aviso de rescisão', num: 103, code: 4, status: 'Respondido', lado: 'cli', apelido: 'GAMA', detalhe: 'Ciclano', parado: 26, nivel: 2, resp: '' }, resp: 'Bia', respId: 'id-bia', n: 3, motivo: 'atendeu 3 de 4 solicitações desta empresa na última semana', alternativas: [{ resp: 'Ana Teste', n: 1, respId: 'id-ana' }] },
    { item: { k: 'rubricas:z', type: 'rubricas', typeLabel: 'Lançamento de rubricas', num: 105, code: 1, status: 'Sem análise', lado: 'esc', apelido: 'ZETA', detalhe: '10/2026', parado: 1, nivel: 0, resp: '' }, resp: 'Bia', respId: 'id-bia', n: 1, motivo: 'atendeu 1 de 1 solicitações desta empresa na última semana', alternativas: [] }
  ] } }); });
  await p.evaluate(() => { location.hash = '#/distribuir'; });
  await p.waitForSelector('.dist-l');
  assert.equal(await p.textContent('#titulo'), 'Distribuir');
  assert.equal((await p.evaluate(() => window.__msgs.find(m => m.cmd === 'distribuicao'))).dias, 7);
  assert.match(await p.textContent('.dist-l'), /#103GAMA.*Aviso de rescisão · Ciclano.*atendeu 3 de 4 solicitações desta empresa na última semana · depois: Ana Teste \(1\)/);
  assert.equal(await p.$eval('.dist-l select', s => s.value), 'id-bia');
  assert.match(await p.textContent('#d-todas'), /Atribuir todas \(1\)/, 'Rubricas fica de fora (não mapeado)');
  assert.equal(await p.$eval('[data-atr="rubricas:z"]', b => b.disabled), true);
  // troca a sugestão e atribui uma, com confirmação
  await p.selectOption('[data-esc="avisoRescisao:c"]', 'id-ana');
  await p.click('[data-atr="avisoRescisao:c"]');
  assert.equal(await p.evaluate(() => window.__msgs.some(m => m.cmd === 'acao')), false, 'sem confirmar não envia');
  await p.click('[data-conf-k="avisoRescisao:c"]');
  await p.waitForSelector('.dist-l .ok-t');
  const m = await p.evaluate(() => window.__msgs.find(x => x.cmd === 'acao'));
  assert.deepEqual([m.acao, m.type, m.num, m.analista], ['responsavel', 'avisoRescisao', '103', 'id-ana']);
  assert.match(await p.textContent('#d-todas'), /Atribuir todas \(0\)/);
  await p.click('[data-dias="14"]');
  await p.waitForFunction(() => window.__msgs.some(x => x.cmd === 'distribuicao' && x.dias === 14));
  assert.deepEqual(p.erros, []);
});

await passo('app · detalhe: Responder com situação, observações e anexo; revisa, confirma e envia; listas não mapeadas ficam bloqueadas', async () => {
  const p = await abrirApp('#/fila', {});
  await p.evaluate(() => { window.__respostas = { acao: { ok: true, acao: 'tramite', anexos: 1 }, detalhe: { ok: true, item: { assunto: 'Férias' }, tramites: [], datas: {} } }; });
  await p.click('#corpo [data-k="geral:b"]');
  await p.waitForSelector('#gaveta [data-acao="tramite"]:not([disabled])');
  assert.equal(await p.$eval('#gaveta [data-acao="expectativa"]', b => b.disabled), false);
  await p.click('#gaveta [data-acao="tramite"]');
  assert.deepEqual(await p.$$eval('#a-situacao option', o => o.map(x => x.textContent)), ['Escolha…', 'Em análise', 'Em análise interna', 'Respondido', 'Concluído']);
  await p.click('#a-revisar');
  assert.match(await p.textContent('#g-corpo'), /Escolha a situação do trâmite/);
  await p.selectOption('#a-situacao', '4');
  await p.fill('#a-texto', 'Bom dia, segue o retorno.');
  await p.click('#a-obs');
  assert.match(await p.inputValue('#a-texto'), /^Bom dia, segue o retorno\.\n\nObservações importantes:\n• Prazo de conclusão/);
  await p.setInputFiles('#a-arquivos', { name: 'recibo.txt', mimeType: 'text/plain', buffer: Buffer.from('ola') });
  assert.match(await p.textContent('.acao-anexos'), /recibo\.txt · 3 B/);
  await p.click('#a-revisar');
  assert.match(await p.textContent('#a-conf'), /Trâmite com a situação "Respondido"[\s\S]*1 anexo\(s\): recibo\.txt/);
  assert.equal(await p.evaluate(() => window.__msgs.some(m => m.cmd === 'acao')), false, 'revisar não envia');
  await p.click('#a-enviar');
  await p.waitForFunction(() => window.__msgs.some(m => m.cmd === 'acao'));
  const m = await p.evaluate(() => window.__msgs.find(x => x.cmd === 'acao'));
  assert.deepEqual([m.acao, m.type, m.num, m.situacao, m.arquivos.length, m.arquivos[0].nome, m.arquivos[0].b64], ['tramite', 'geral', '102', '4', 1, 'recibo.txt', 'b2xh']);
  await p.waitForFunction(() => /Trâmite enviado ao Onvio com 1 anexo/.test(document.querySelector('#toast').textContent));
  await p.waitForFunction(() => window.__msgs.filter(x => x.cmd === 'detalhe').length >= 2, null, { timeout: 3000 });
  // erro do Onvio aparece e nada se perde
  await p.evaluate(() => { window.__respostas.acao = { ok: false, erro: 'o Onvio recusou a ação (HTTP 403)' }; });
  await p.click('#gaveta [data-acao="tramite"]');
  await p.selectOption('#a-situacao', '5'); await p.fill('#a-texto', 'Concluído.');
  await p.click('#a-revisar'); await p.click('#a-enviar');
  await p.waitForFunction(() => /Não foi enviado: o Onvio recusou a ação \(HTTP 403\)/.test(document.querySelector('#g-corpo').textContent));
  assert.equal(await p.inputValue('#a-texto'), 'Concluído.');
  // Rubricas: não mapeado
  await p.click('#g-fechar');
  await p.evaluate(() => { location.hash = '#/fila?escopo=equipe'; });
  await p.click('#corpo [data-k="rubricas:d"]');
  await p.waitForSelector('#gaveta [data-acao="tramite"]');
  await p.waitForFunction(() => { const b = document.querySelector('#gaveta [data-acao="tramite"]'); return b && b.title && b.title !== 'carregando'; });
  assert.equal(await p.$eval('#gaveta [data-acao="tramite"]', b => b.disabled), true);
  assert.match(await p.getAttribute('#gaveta [data-acao="tramite"]', 'title'), /ainda não mapeada/);
  assert.deepEqual(p.erros, []);
});

await passo('app · detalhe: trâmites que falham mostram o erro e o caminho do Onvio', async () => {
  const p = await abrirApp('#/fila', {});
  await p.evaluate(() => { window.__respostas = { detalhe: { ok: true, item: { assunto: 'Férias' }, tramites: null, erroTramites: 'HTTP 500', lista: 'Geral' } }; });
  await p.click('#corpo [data-k="geral:b"]');
  await p.waitForSelector('#gaveta .faixa.warn');
  assert.match(await p.textContent('#gaveta .faixa.warn'), /Não foi possível ler os trâmites \(HTTP 500\)\. Use "Abrir no Onvio"/);
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

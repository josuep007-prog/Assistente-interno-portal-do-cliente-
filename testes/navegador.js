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
const passo = async (nome, fn) => { if (process.env.SO && !nome.includes(process.env.SO)) return; try { await fn(); console.log('ok   ' + nome); } catch (e) { falhas.push(nome); console.log('FALHA ' + nome + '\n     ' + String(e.message).split('\n').slice(0, 5).join(' | ') + (process.env.PILHA ? '\n' + e.stack : '')); } };

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
  await p.emulateMedia({ reducedMotion: 'reduce' });                                     // sem transição: o clique no botão não depende do tempo
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
  await p.evaluate(() => { window.__respostas = Object.assign(window.__respostas || {}, { casos: { ok: true, analises: {}, lidas: 2 }, detalhe: { ok: true, item: {}, tramites: [] }, previsao: { ok: true, dias: 28, total: 12, prox30: 13, erros: [], empresas: [{ cliente: 'ACME LTDA', apelido: 'ACME', total: 8, porSemana: 2, prox7: 3, prox30: 11, tendencia: 'sobe', tipos: [{ tipo: 'Geral', n: 5 }, { tipo: 'Cálculo de férias', n: 3 }] }] } }); });
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
  assert.deepEqual(await p.$$eval('.hj-paineis > section', e => e.map(x => x.id)), ['hj-venc', 'hj-semcalc-v', 'hj-uso', 'hj-prev']);
  // sugestões de ação: casos específicos, cada um com a ação pronta (trâmite preenchido, revisar e confirmar)
  await p.waitForFunction(() => window.__msgs.some(m => m.cmd === 'casos'));
  await p.click('#hj-sug-ler');                          // a 1ª leitura saiu antes da resposta simulada: confere de novo
  await p.waitForFunction(() => /Trâmites conferidos às/.test(document.querySelector('#hj-sug').textContent));
  if (process.env.CAP) { await p.$eval('#hj-sug', e => e.scrollIntoView()); await p.screenshot({ path: process.env.CAP + '/sugestoes.png' }); }
  const cs = await p.$$eval('#hj-sug .cs-l', e => e.map(x => x.textContent));
  assert.equal(cs.length, 2);
  assert.match(cs[0], /^Resolvida fora do portal\?#101 ACME · FulanoSem resposta do escritório há 31 dias: provavelmente resolvida fora do portal · Cálculo de fériasConcluir/);
  assert.match(cs[1], /^Lista errada#102 BETA · Férias do JoãoAberta na lista Geral, mas tem aba própria: Aviso de férias.*Orientar e concluir/);
  assert.match(await p.textContent('#hj-sug .cs-resumo'), /Resolvida fora do portal\? 1Lista errada 1/);
  await p.click('#hj-sug [data-cs-acao="calcFerias:a"]');
  await p.waitForSelector('#a-texto');
  assert.match(await p.$eval('#a-texto', t => t.value), /já foi resolvida fora do portal/);
  assert.equal(await p.$eval('#gaveta .cmp-int.on', x => x.dataset.sit), '5', 'concluir');
  await p.keyboard.press('Escape');
  await p.waitForSelector('#gaveta', { state: 'hidden' });
  await p.click('#hj-sug .cs-abaErrada summary');
  await p.click('#hj-sug [data-cs-ignorar="geral:b"]');
  await p.waitForFunction(() => document.querySelectorAll('#hj-sug .cs-l').length === 1);
  assert.equal(await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('__mem')).sugestoesIgnoradas || {}).join()), 'geral:b', 'só o k (e a última movimentação) fica');
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
  await p.waitForFunction(() => document.querySelector('#titulo').textContent === 'Solicitações', null, { timeout: 3000 }).catch(() => {});
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
  await p.selectOption('#hj-carteira', 'Bia');
  await p.waitForFunction(() => /Tudo em dia/.test(document.querySelector('#hj-titulo').textContent));
  await p.reload(); await p.waitForSelector('#hj-carteira');
  assert.equal(await p.$eval('#hj-carteira', s => s.value), 'Bia');
  await p.selectOption('#hj-carteira', '__minha');
  assert.equal(await p.textContent('#n-fila'), '2');
  assert.match(await p.textContent('#aovivo-tx'), /^Ao vivo · \d\d:\d\d:\d\d$/);
  assert.match(await p.textContent('.trilho [data-rota="fila"]'), /Solicitações/);
  assert.equal(await p.$('.trilho [data-rota="solicitacoes"]'), null, 'Consultar no Onvio saiu');
  assert.equal(await p.$('.trilho [data-rota="clientes"]'), null, 'Clientes saiu');
  assert.deepEqual(p.erros, []);
});

await passo('app · Hoje: admissões sem trâmite do escritório em faixa recolhível abaixo do destaque; vencimentos legais em painel', async () => {
  const itens = ITENS_APP.concat([
    { k: 'cadEmpregado:e1', type: 'cadEmpregado', typeLabel: 'Cadastro empregado', id: 'e1', num: 301, code: 2, status: 'Enviado para o escritório', lado: 'esc', nivel: 2, grav: 2, parado: 1, motivos: [{ n: 2, m: 'Admissão retroativa' }], resp: 'Ana Teste', mine: true, apelido: 'DELTA', cliente: 'DELTA', detalhe: 'Fulano', created: agoraIso(1), last: agoraIso(1), admissao: '2026-10-10', admissaoAlerta: { data: '2026-10-10', faltam: -4, retro: true } },
    { k: 'cadEmpregado:e2', type: 'cadEmpregado', typeLabel: 'Cadastro empregado', id: 'e2', num: 302, code: 1, status: 'Sem análise', lado: 'esc', nivel: 1, grav: 1, parado: 0, motivos: [], resp: 'Ana Teste', mine: true, apelido: 'ÔMEGA', cliente: 'ÔMEGA', detalhe: 'Joana', created: agoraIso(0), last: agoraIso(0), admissao: '2026-10-20', admissaoAlerta: { data: '2026-10-20', faltam: 2, retro: false } },
    { k: 'cadEstagiario:s1', type: 'cadEstagiario', typeLabel: 'Cadastro estagiário', id: 's1', num: 305, code: 2, status: 'Enviado para o escritório', lado: 'esc', nivel: 1, grav: 1, parado: 0, motivos: [], resp: 'Ana Teste', mine: true, apelido: 'KAPPA', cliente: 'KAPPA', detalhe: 'Lia', created: agoraIso(0), last: agoraIso(0), admissao: '2026-10-07', admissaoAlerta: { data: '2026-10-07', prazo: '2026-10-22', faltam: 2, retro: false, estagio: true } },
    { k: 'cadEmpregado:e3', type: 'cadEmpregado', typeLabel: 'Cadastro empregado', id: 'e3', num: 303, code: 3, status: 'Aguardando o cliente', lado: 'cli', nivel: 2, grav: 2, parado: 1, motivos: [], resp: 'Ana Teste', mine: true, apelido: 'SIGMA', cliente: 'SIGMA', detalhe: 'Pedro', created: agoraIso(3), last: agoraIso(1), admissao: '2026-10-10', admissaoAlerta: { data: '2026-10-10', faltam: -4, retro: true } },
    { k: 'cadEmpregado:e4', type: 'cadEmpregado', typeLabel: 'Cadastro empregado', id: 'e4', num: 304, code: 4, status: 'Respondido pelo cliente', lado: 'esc', nivel: 2, grav: 2, parado: 1, motivos: [], resp: 'Ana Teste', mine: true, apelido: 'TAU', cliente: 'TAU', detalhe: 'Rui', created: agoraIso(3), last: agoraIso(1), primeiroTramite: agoraIso(2), admissao: '2026-10-12', admissaoAlerta: { data: '2026-10-12', faltam: -2, retro: false } },
    { k: 'calcFerias:f9', type: 'calcFerias', typeLabel: 'Cálculo de férias', id: 'f9', num: 401, code: 2, status: 'Em análise', lado: 'esc', nivel: 1, grav: 1, parado: 0, motivos: [], resp: 'Ana Teste', mine: true, apelido: 'ZETA', cliente: 'ZETA', detalhe: 'Beltrano', created: agoraIso(2), last: agoraIso(0), pagamentoAte: { alvo: OC_ymd(new Date()), ref: 'início das férias em 20/10' } }
  ]);
  const p = await abrirApp('#/inicio', { snapshot: Object.assign({}, ESTADO_APP.snapshot, { items: itens }) });
  await p.waitForSelector('#hj-admissao');
  const ordem = await p.evaluate(() => [...document.querySelector('#vista').children].map(x => x.id || x.className.split(' ')[0]));
  assert.ok(ordem.indexOf('hj-admissao') === ordem.indexOf('hj-hero') + 1, 'logo abaixo do destaque: ' + ordem.join());
  assert.match(await p.textContent('#hj-admissao h3'), /3 admissões pedem prioridade/, 'as que o escritório já tramitou (situação do escritório ou trâmite lido) ficam de fora');
  assert.equal(await p.textContent('#hj-admissao .hj-adm-resumo'), '1 retroativa · próxima em 20/10');
  const l = await p.$$eval('#hj-admissao .hj-adm', e => e.map(x => x.textContent));
  assert.match(l[0], /^10\/10retroativa#301 DELTA · Fulano/);
  assert.match(l[1], /^20\/10em 2 dias úteis#302 ÔMEGA · Joana/);
  assert.match(l[2], /^22\/10prazo · em 2 dias úteis#305 KAPPA · Lia.*Cadastro estagiário · início em 07\/10/, 'estagiário: a data é o prazo do eSocial (15 dias após o início)');
  assert.match(await p.textContent('#hj-adm-l .hj-adm-nota'), /Estagiário: até 15 dias depois do início/);
  assert.match(await p.textContent('#hj-venc'), /hoje.*ZETA · Beltrano.*Cálculo de férias · início das férias em 20\/10/);
  await p.click('#hj-admissao [data-k="cadEmpregado:e2"]');
  await p.waitForFunction(() => (window.__msgs || []).some(m => m.cmd === 'detalhe' && String(m.num) === '302'));
  await p.keyboard.press('Escape');
  await p.waitForSelector('#gaveta', { state: 'hidden' });
  // recolhe e lembra
  await p.click('#hj-adm-toggle');
  assert.equal(await p.isHidden('#hj-adm-l'), true);
  assert.equal(await p.getAttribute('#hj-adm-toggle', 'aria-expanded'), 'false');
  assert.equal(await p.$eval('#hj-adm-toggle', b => b.parentElement.firstElementChild === b && b.getBoundingClientRect().width > b.parentElement.getBoundingClientRect().width * 0.95), true, 'a barra de cabeçalho inteira recolhe, não um botão no canto');
  await p.reload(); await p.waitForSelector('#hj-admissao');
  assert.equal(await p.isHidden('#hj-adm-l'), true, 'continua recolhida');
  assert.match(await p.textContent('#hj-adm-toggle'), /3 admissões pedem prioridade.*1 retroativa/, 'recolhida, o resumo continua à vista');
  await p.click('#hj-adm-toggle');
  assert.equal(await p.isHidden('#hj-adm-l'), false);
  // vencimento: leva às Solicitações com a solicitação piscando em vermelho (mesmo com um filtro de texto que a esconderia)
  await p.evaluate(() => { location.hash = '#/fila'; });
  await p.waitForSelector('#corpo [data-k]');
  await p.fill('#f-texto', 'delta');
  await p.evaluate(() => { location.hash = '#/inicio'; });
  await p.waitForSelector('#hj-venc [data-k="calcFerias:f9"]');
  await p.click('#hj-venc [data-k="calcFerias:f9"]');
  await p.waitForSelector('#corpo .foco-pisca[data-k="calcFerias:f9"]');
  assert.equal(await p.inputValue('#f-texto'), '', 'o filtro que a escondia sai');
  assert.ok(!/foco=/.test(await p.evaluate(() => location.hash)), 'o foco sai do endereço (uma leitura nova não pisca de novo): ' + await p.evaluate(() => location.hash));
  assert.match(await p.$eval('#corpo .foco-pisca', r => getComputedStyle(r).outlineStyle), /solid/);
  await p.waitForFunction(() => !document.querySelector('.foco-pisca'), null, { timeout: 6000 });
  // Solicitações com kpi=admissao: o mesmo critério
  await p.evaluate(() => { location.hash = '#/fila?escopo=equipe&kpi=admissao'; });
  await p.waitForFunction(() => document.querySelectorAll('#corpo [data-k]').length === 3);
  assert.deepEqual((await linhas(p)).sort(), ['cadEmpregado:e1', 'cadEmpregado:e2', 'cadEstagiario:s1']);
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

await passo('app · Fila: A responder por padrão, Aguardando o cliente como filtro secundário, filtros e chips, ordenação, cartões, ↑↓ e Enter', async () => {
  const p = await abrirApp('#/fila');
  assert.equal(await p.textContent('#titulo'), 'Solicitações');
  assert.deepEqual(await p.$$eval('#abas .aba', e => e.map(x => x.textContent)), ['Minhas2', 'Equipe toda4', 'Sem responsável1', 'Resolvidas']);
  assert.equal((await linhas(p)).length, 2);
  await p.goto(URL_APP + '#/fila?kpi=atraso'); await p.waitForSelector('#corpo [data-k]');
  assert.deepEqual(await linhas(p), ['calcFerias:a']);
  assert.match(await p.textContent('#ativos'), /Só: Fora do prazo/);
  await p.click('#ativos [data-tira="kpi"]');
  await p.waitForFunction(() => location.hash === '#/fila');
  // padrão: só o que espera o escritório, sem o seletor Todas/Escritório/Cliente
  await p.click('#abas [data-aba="equipe"]'); await p.waitForFunction(() => document.querySelectorAll('#corpo [data-k]').length === 3);
  assert.equal(await p.$('[data-lado]'), null, 'sem o seletor de vez antigo');
  assert.match(await p.textContent('#vez-tit'), /^A responder/);
  assert.match(await p.textContent('#f-vez'), /Aguardando o cliente\s*1/);
  assert.deepEqual((await linhas(p)).sort(), ['calcFerias:a', 'geral:b', 'rubricas:d']);
  // grupos por urgência (ordem de prioridade)
  assert.deepEqual(await p.$$eval('#corpo .emp-cab b', e => e.map(x => x.textContent)), ['Fora do prazo', 'Vence hoje', 'Em dia']);
  await p.fill('#f-texto', 'acme');
  assert.equal((await linhas(p)).length, 2);
  await p.fill('#f-texto', '');
  // filtro secundário: aguardando o cliente
  await p.click('#f-vez');
  assert.deepEqual(await linhas(p), ['avisoRescisao:c']);
  assert.match(await p.textContent('#vez-tit'), /Aguardando o cliente voltar para a responder \(3\)/);
  await p.click('#vez-tit [data-vez="esc"]');
  assert.equal((await linhas(p)).length, 3);
  await p.click('#b-filtros'); await p.selectOption('#f-resp', 'Bia');
  assert.deepEqual(await linhas(p), ['rubricas:d']);
  assert.equal(await p.textContent('#n-filtros'), '1');
  await p.click('#f-limpar');
  assert.equal((await linhas(p)).length, 3);
  await p.click('#vista .lh [data-col="num"]');
  assert.deepEqual(await linhas(p), ['rubricas:d', 'geral:b', 'calcFerias:a'], 'ID, mais nova primeiro');
  await p.click('[data-vis="cartoes"]');
  assert.equal(await p.$$eval('#corpo .sc', e => e.length), 3);
  await p.click('[data-vis="lista"]');
  await p.focus('#corpo [data-k="rubricas:d"]'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter');
  await p.waitForSelector('#gaveta .dlg-nav');
  assert.match(await p.textContent('#gaveta .dlg-nav'), /2 de 3/);
  assert.match(await p.textContent('#gaveta h2'), /BETA/);
  await p.keyboard.press('ArrowRight');
  await p.waitForFunction(() => /ACME/.test(document.querySelector('#gaveta h2').textContent));
  await p.keyboard.press('Escape');
  // atalho de outra tela escolhe a vez: prescrição é do lado do cliente
  await p.goto(URL_APP + '#/fila?escopo=equipe&kpi=prescreve'); await p.waitForSelector('#corpo [data-k]');
  assert.deepEqual(await linhas(p), ['avisoRescisao:c']);
  await p.goto(URL_APP + '#/fila?escopo=semresp'); await p.waitForSelector('#corpo [data-k]');
  assert.equal(await p.textContent('#titulo'), 'Solicitações');
  assert.match(await p.textContent('#subtitulo'), /^Sem responsável/);
  assert.deepEqual(p.erros, []);
});

await passo('app · Equipe (área do gestor): pede a senha; Desempenho com nota, ranking em tabela, entregas no prazo × fora e detalhe; Carga e Responsáveis', async () => {
  const p = await abrirApp('#/equipe');
  // trava: sem a senha certa não mostra nada da equipe
  await p.waitForSelector('#g-trava');
  assert.equal(await p.$('.av-hero'), null);
  await p.fill('#g-senha', 'errada');
  await p.click('#g-entrar');
  await p.waitForSelector('#g-erro:not([hidden])');
  assert.equal(await p.$('.av-hero'), null, 'senha errada: continua travada');
  assert.equal(await p.inputValue('#g-senha'), '', 'o campo é limpo');
  // entregas simuladas do período (o service worker leria no Onvio)
  await p.evaluate(() => {
    const d = n => { const x = new Date(); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };
    const fim = (k, resp, criada, concl, extra) => Object.assign({ k, type: 'geral', resp, lado: 'fim', status: 'Concluído', created: d(criada) + 'T09:00:00', last: d(concl) + 'T15:00:00' }, extra || {});
    const mov = [fim('f1', 'Ana Teste', 3, 2), fim('f2', 'Ana Teste', 2, 1), fim('f3', 'Ana Teste', 20, 1), fim('f4', 'Bia', 2, 1), fim('f5', 'Bia', 9, 8),
      fim('f6', 'Ana Teste', 2, 1), fim('f7', 'Ana Teste', 2, 1), fim('f8', 'Ana Teste', 2, 1)];
    // trâmites lidos pelo service worker: f3 ficou 2 d.u. com o escritório (o resto foi espera pelo cliente); f2 foi
    // concluída pela Bia, embora a responsável seja a Ana
    const a = (k, e, quem) => ({ l: mov.find(x => x.k === k).last, e, p: 1, a: quem, c: false });
    const analises = { f1: a('f1', 1, 'Ana Teste'), f2: a('f2', 1, 'Bia'), f3: a('f3', 2, 'Ana Teste'), f4: a('f4', 1, 'Bia'), f6: a('f6', 1, 'Ana Teste'), f7: a('f7', 1, 'Ana Teste'), f8: a('f8', 1, 'Ana Teste') };
    window.__caio = { k: 'geral:z', type: 'geral', resp: 'Caio', lado: 'esc', nivel: 0, grav: 0, parado: 1 };
    window.__respostas = { desempenho: { ok: true, erros: [], dias: 30, agora: new Date().toISOString(), movimentadas: mov.length, entregas: mov, analises, semLeitura: 1 } };
  });
  await p.evaluate(async () => { const { snapshot } = await chrome.storage.local.get('snapshot'); await chrome.storage.local.set({ snapshot: Object.assign({}, snapshot, { items: snapshot.items.concat(window.__caio) }) }); });
  await p.fill('#g-senha', 'gestor@987654321');
  await p.press('#g-senha', 'Enter');
  await p.waitForSelector('.av-hero');
  assert.ok(await p.evaluate(() => window.__msgs.some(m => m.cmd === 'desempenho' && m.dias === 30)), 'pediu as entregas de 30 dias');
  assert.equal(await p.$('#av-periodo [data-dias]'), null, 'período fixo em 30 dias, sem 7 e 14');
  assert.match(await p.textContent('#titulo'), /Equipe/);
  assert.deepEqual(await p.$$eval('#abas .aba', e => e.map(x => x.dataset.aba)), ['desempenho', 'carga', 'resp']);
  // números da equipe
  await p.waitForFunction(() => document.querySelector('#av-k-entregas .av-kpi-val').textContent === '8');
  assert.match(await p.textContent('#av-k-prazo'), /100%/, 'só o tempo com o escritório conta: a de 20 dias ficou 2 d.u. com o escritório');
  assert.ok(!/sem a leitura dos trâmites/.test(await p.textContent('#vista')), 'sem o aviso de leitura incompleta');
  assert.ok(await p.$('#av-k-entregas .mb-svg rect'), 'entregas por dia');
  // ranking: tabela compacta, uma linha por analista, com nota, faixa e os 4 itens; o cabeçalho ordena
  const rank = await p.$$eval('#av-rank .av-lin', e => e.map(x => x.dataset.resp));
  assert.deepEqual(rank, ['Ana Teste', 'Bia', 'Caio'], 'quem tem poucos dados vem depois');
  assert.equal(await p.$$eval('#av-rank .av-lin:first-child .av-mini', e => e.length), 5);
  assert.match(await p.textContent('#av-rank .av-lin:first-child .av-chip'), /Excelente|Bom|Atenção|Precisa de apoio/);
  assert.deepEqual(await p.$$eval('#av-rank .av-pos', e => e.map(x => x.textContent)), ['1º', '–', '–'], 'menos de 5 entregas: sem posição');
  assert.match(await p.textContent('#av-rank [data-resp="Bia"]'), /Poucos dados/);
  const alt = await p.$eval('#av-rank .av-lin', r => r.getBoundingClientRect().height);
  assert.ok(alt <= 40, 'linha fina: ' + alt);
  await p.click('#av-rank [data-ord="concluidas"]');
  assert.deepEqual(await p.$$eval('#av-rank .av-lin', e => e.map(x => x.dataset.resp)), ['Ana Teste', 'Bia', 'Caio'], 'mais entregas primeiro');
  await p.click('#av-rank [data-ord="concluidas"]');
  assert.deepEqual(await p.$$eval('#av-rank .av-lin', e => e.map(x => x.dataset.resp)), ['Caio', 'Bia', 'Ana Teste']);
  // entregas no período: barra no prazo × fora do prazo por pessoa; sem entregas não vira 0%
  assert.match(await p.textContent('#av-barras'), /No prazo.*Fora do prazo/s);
  assert.match(await p.textContent('#av-barras'), /Ana Teste5 · 100% no prazo/);
  assert.match(await p.textContent('#av-barras'), /Bia3 · 100% no prazo/, 'a f2 conta para a Bia, que a concluiu');
  assert.match(await p.textContent('#av-barras'), /Caio.*sem entregas no período/s);
  assert.doesNotMatch(await p.textContent('#av-barras'), /Caio[^A-Z]*\b0%/, 'quem não entregou não aparece com 0%');
  assert.equal(await p.$('#av-disp'), null, 'a dispersão saiu');
  await p.click('#av-barras text[data-id="Ana Teste"]');
  // a pessoa abre numa janela por cima (não numa lista embaixo)
  await p.waitForSelector('#dlg-pessoa:not([hidden])');
  assert.equal(await p.$('#av-det .av-det'), null, 'sem o detalhe embaixo da tela');
  assert.match(await p.textContent('#dlg-pessoa h2'), /Ana Teste/);
  assert.match(await p.textContent('#dlg-pessoa .dlg-l1'), /1º no ranking/);
  assert.equal(await p.$eval('#av-rank .av-lin.ativo', r => r.dataset.resp), 'Ana Teste');
  assert.equal(await p.$$eval('#dlg-pessoa .pp-comp', e => e.length), 5, 'os 5 itens da nota');
  assert.match(await p.textContent('#dlg-pessoa .pp-resumo'), /O que mais puxa a nota para baixo/);
  // abre no item que mais pesa; clicar num item troca os casos
  const focoIni = await p.$eval('#dlg-pessoa .pp-comp.on', b => b.dataset.comp);
  assert.ok(focoIni, 'um item em foco ao abrir');
  await p.click('#dlg-pessoa [data-comp="cuidado"]');
  assert.equal(await p.$eval('#dlg-pessoa .pp-comp.on', b => b.dataset.comp), 'cuidado');
  assert.match(await p.textContent('#pp-lista'), /Crítica \(G3\)[\s\S]*#101 ACME[\s\S]*parada há 31 dias, o dobro do limite de 15/, 'caso que pesa, com o porquê');
  // o caso abre a solicitação por cima da janela; Esc fecha só a de cima
  await p.click('#pp-lista [data-k="calcFerias:a"]');
  await p.waitForSelector('#gaveta:not([hidden])');
  await p.keyboard.press('Escape');
  await p.waitForSelector('#gaveta', { state: 'hidden' });
  assert.equal(await p.isHidden('#dlg-pessoa'), false, 'a janela da pessoa continua');
  // ← → passam para a próxima pessoa
  await p.keyboard.press('ArrowRight');
  await p.waitForFunction(() => /Bia/.test(document.querySelector('#dlg-pessoa h2').textContent));
  assert.match(await p.textContent('#dlg-pessoa .dlg-l1'), /Poucos dados/);
  await p.keyboard.press('ArrowLeft');
  await p.waitForFunction(() => /Ana Teste/.test(document.querySelector('#dlg-pessoa h2').textContent));
  // "Não contar": o gestor tira o caso da conta e a janela se atualiza
  await p.click('#dlg-pessoa [data-comp="cuidado"]');
  const antes = await p.$eval('#av-rank [data-resp="Ana Teste"] .av-nota-tag', e => Number(e.textContent));
  await p.click('#pp-lista [data-exc="calcFerias:a"]');
  await p.waitForSelector('.av-exc');
  assert.match(await p.textContent('.av-exc'), /1 caso fora da conta/);
  assert.ok(await p.$eval('#av-rank [data-resp="Ana Teste"] .av-nota-tag', e => Number(e.textContent)) > antes, 'sem o caso, a nota sobe');
  assert.equal(await p.$('#pp-lista [data-k="calcFerias:a"]'), null, 'o caso sai da janela');
  assert.deepEqual(Object.keys(await p.evaluate(() => JSON.parse(localStorage.getItem('__mem')).avaliacaoExcecoes)), ['calcFerias:a'], 'guarda só o k');
  if (process.env.CAP) await p.screenshot({ path: process.env.CAP + '/pessoa.png' });
  await p.keyboard.press('Escape');
  await p.waitForSelector('#dlg-pessoa', { state: 'hidden' });
  assert.equal(await p.$('#av-rank .av-lin.ativo'), null);
  await p.click('#av-exc-limpar');
  await p.waitForFunction(() => !document.querySelector('.av-exc'));
  await p.click('#av-como');
  assert.match(await p.textContent('#av-como-txt'), /Pontualidade · peso 30[\s\S]*Ritmo · peso 10[\s\S]*só o tempo em que a vez era do escritório/);
  // período: troca e pede de novo
  // Carga de hoje: os gráficos da fila (a sugestão "quem tem menos" saiu)
  await p.click('#abas [data-aba="carga"]');
  await p.waitForSelector('#g-carga svg');
  const kpis = await p.$$eval('.kpi', e => e.map(x => x.querySelector('.rot').textContent + '=' + x.querySelector('.val').textContent));
  assert.deepEqual(kpis, ['Pendências=5', 'Sem responsável=1', 'Fora do prazo=2', 'Prescrevem em 5 dias=1', '1º trâmite (média)=1', 'Hoje=3 / 1']);
  for (const id of ['#g-carga', '#g-dias', '#g-horas', '#g-tipo']) assert.ok(await p.$(id + ' svg'), 'gráfico ' + id);
  assert.match(await p.textContent('#l-presc'), /4dias[\s\S]*GAMA/);
  assert.equal(await p.$('#distribuicao'), null, 'sem a sugestão por quem tem menos pendências');
  await p.hover('#g-carga [data-tip]');
  assert.equal(await p.isVisible('#dica'), true, 'dica ao passar o mouse');
  // Responsáveis: mapa de calor e a fila da pessoa
  await p.click('#abas [data-aba="resp"]');
  await p.waitForSelector('tr[data-resp="Ana Teste"]');
  assert.equal(await p.$$eval('#mapa-idade .mc-v:not(:disabled)', e => e.length), 5, 'com o Caio');
  await p.click('#mapa-idade .mc-v[data-id="Ana Teste"][data-col="31-"]');
  await p.waitForFunction(() => location.hash.startsWith('#/fila?analista=Ana+Teste&idade=31-') && document.querySelector('#ativos .chip-f'));
  assert.deepEqual(await linhas(p), ['calcFerias:a']);
  // liberada uma vez, continua liberada na visita; "Bloquear" trava de novo
  await p.evaluate(() => { location.hash = '#/equipe?aba=resp'; });
  await p.waitForSelector('tr[data-resp="Ana Teste"]');
  await p.click('#av-bloquear');
  await p.waitForSelector('#g-trava');
  assert.deepEqual(p.erros, []);
});

await passo('app · Solicitações > Resolvidas: vez do cliente sem retorno e sem pedido; detalhe explica; pendente com pedido também', async () => {
  const resolvidas = [{ k: 'avisoFerias:r1', type: 'avisoFerias', typeLabel: 'Aviso de férias', id: 'r1', num: 801, status: 'Respondido', lado: 'cli', resp: 'Ana Teste', mine: true, apelido: 'OMEGA', cliente: 'OMEGA LTDA', detalhe: 'Beltrano', created: agoraIso(9), last: agoraIso(6), semRetorno: 4 },
    { k: 'geral:r2', type: 'geral', typeLabel: 'Geral', id: 'r2', num: 802, status: 'Respondido', lado: 'cli', resp: 'Bia', mine: false, apelido: 'SIGMA', cliente: 'SIGMA SA', detalhe: 'Dúvida', created: agoraIso(12), last: agoraIso(8), semRetorno: 5 }];
  const itens = ITENS_APP.map(i => i.k === 'avisoRescisao:c' ? Object.assign({}, i, { pedidoAoCliente: 'aguardamos' }) : i);
  const p = await abrirApp('#/fila?escopo=resolvidas', { snapshot: Object.assign({}, ESTADO_APP.snapshot, { items: itens, resolvidas }) });
  await p.waitForSelector('.nota-regra');
  assert.match(await p.textContent('.nota-regra'), /mais de 3 dias úteis/);
  assert.match(await p.textContent('#abas'), /Resolvidas\s*2/);
  assert.deepEqual(await linhas(p, '.list-card [data-k]'), ['avisoFerias:r1', 'geral:r2']);
  await p.click('[data-de="minhas"]');
  assert.deepEqual(await linhas(p, '.list-card [data-k]'), ['avisoFerias:r1']);
  await p.evaluate(() => { window.__respostas = { detalhe: { ok: true, item: { assunto: 'Aviso' }, tramites: [] } }; });
  await p.click('.list-card [data-k="avisoFerias:r1"]');
  await p.waitForSelector('#gaveta .dlg-resolvida');
  assert.match(await p.textContent('#gaveta .dlg-resolvida'), /Considerada resolvida.*4 dias úteis/);
  await p.keyboard.press('Escape');
  // pendente com pedido ao cliente: o detalhe diz por que continua na fila
  await p.evaluate(() => { location.hash = '#/fila?escopo=equipe&vez=cli'; });
  await p.waitForSelector('#corpo [data-k="avisoRescisao:c"]');
  await p.click('#corpo [data-k="avisoRescisao:c"]');
  await p.waitForSelector('#gaveta .dlg-resolvida.pede');
  assert.match(await p.textContent('#gaveta .dlg-resolvida'), /Continua pendente.*“aguardamos”/);
  assert.deepEqual(p.erros, []);
});

await passo('app · Configurações: prazos com efeito na fila antes de salvar, origem de cada valor, leitura, feriados e palavras', async () => {
  const p = await abrirApp('#/config', { regrasEscritorio: { url: 'https://exemplo.com/r.json', versao: 't1', regras: { versao: 't1', config: { conclusaoCalculo: 4 }, feriados: ['2099-01-02'], abaErrada: [] } }, settings: { __v: 2, parada: 20 } });
  await p.waitForSelector('#cf-imp .cfg-imp');
  assert.equal(await p.textContent('#titulo'), 'Configurações');
  assert.deepEqual(await p.$$eval('#abas .aba', e => e.map(x => x.textContent)), ['Prazos', 'Leitura e avisos', 'Feriados', 'Palavras', 'Avançado']);
  const orig = k => p.textContent('[data-campo="' + k + '"] .orig');
  assert.equal(await orig('conclusaoCalculo'), 'escritório');
  assert.equal(await orig('parada'), 'seu ajuste');
  assert.equal(await orig('primeiroTramite'), 'padrão');
  assert.match(await p.textContent('[data-campo="parada"] .cfg-volta'), /15/, 'voltar mostra o valor do escritório');
  assert.equal(await p.isDisabled('#cf-salvar'), true);
  assert.match(await p.textContent('#cf-imp'), /Fora do prazo\s*\d/);
  // muda um número: vira "não salvo" e o efeito é recalculado com as pendências lidas
  await p.click('[data-mais="conclusaoSimples"]');
  assert.equal(await orig('conclusaoSimples'), 'não salvo');
  assert.match(await p.textContent('#cf-imp-nota'), /ainda não salvos/);
  await p.fill('#cf-conclusaoSimples', '1');
  assert.equal(await p.$$eval('#cf-imp em', e => e.length), 5);
  assert.match(await p.textContent('#cf-salvar'), /Salvar 1 ajuste/);
  await p.click('#cf-salvar');
  await p.waitForFunction(() => JSON.parse(localStorage.getItem('__mem')).settings.conclusaoSimples === 1);
  assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('__mem')).settings), { __v: 2, parada: 20, conclusaoSimples: 1 }, 'grava só o que difere do padrão em vigor');
  assert.ok(await p.evaluate(() => window.__msgs.some(m => m.cmd === 'atualizar')), 'pede leitura nova');
  await p.waitForFunction(() => document.querySelector('[data-campo="conclusaoSimples"] .orig').textContent === 'seu ajuste');
  // voltar ao valor do escritório tira só aquele ajuste
  await p.click('[data-campo="parada"] .cfg-volta');
  await p.waitForFunction(() => !('parada' in JSON.parse(localStorage.getItem('__mem')).settings));
  // leitura: carga explicada; feriados: próximos e local; palavras da regra de resolvida
  await p.click('#abas .aba:has-text("Leitura e avisos")');
  await p.waitForSelector('#cf-carga');
  await p.fill('#cf-tempoRealSeg', '60');
  assert.match(await p.textContent('#cf-carga'), /até 60 verificações por hora/);
  // feriados: calendário de 12 meses; clicar num dia leva ao quadro do feriado local
  await p.click('#abas .aba:has-text("Feriados")');
  await p.waitForSelector('.fa-ano');
  const ano = new Date().getFullYear();
  assert.equal(await p.$$eval('.fa-mes', e => e.length), 12, '12 meses');
  assert.match(await p.textContent('.fa-cab h3'), new RegExp('Feriados de ' + ano));
  assert.equal(await p.$eval('[data-dia="' + ano + '-12-25"]', b => b.classList.contains('fer-padrao')), true, 'Natal como feriado nacional');
  await p.click('[data-dia="' + ano + '-12-28"]');
  await p.waitForSelector('#cf-fer-add');
  await p.click('#cf-fer-add');
  await p.waitForFunction(d => (JSON.parse(localStorage.getItem('__mem')).settings.feriados || []).includes(d), ano + '-12-28');
  await p.waitForSelector('[data-dia="' + ano + '-12-28"].fer-seu');
  await p.click('[data-dia="' + ano + '-12-28"]');
  await p.click('[data-dia="' + ano + '-12-28"]');
  await p.waitForSelector('#cf-fer-tira');
  await p.click('#fa-prox');
  assert.match(await p.textContent('.fa-cab h3'), new RegExp('Feriados de ' + (ano + 1)));
  await p.click('#fa-hoje');
  await p.click('#abas .aba:has-text("Palavras")');
  await p.waitForSelector('.cfg-chips');
  assert.match(await p.textContent('#vista'), /aguardamos.*favor/s);
  await p.click('#abas .aba:has-text("Avançado")');
  await p.waitForSelector('iframe.cfg-frame');
  assert.deepEqual(p.erros, []);
});

await passo('app · gravidade com o porquê (lista, detalhe) e cantos quadrados em botões, etiquetas e janelas', async () => {
  const p = await abrirApp('#/fila?escopo=equipe', {});
  await p.waitForSelector('#corpo [data-k="calcFerias:a"]');
  assert.match(await p.textContent('#corpo [data-k="calcFerias:a"] .c-porque'), /G3: parada 2× o limite/);
  assert.match(await p.getAttribute('#corpo [data-k="calcFerias:a"] .c-prazo', 'title'), /Crítica \(G3\) porque parada há 31 dias, o dobro do limite de 15/);
  await p.evaluate(() => { window.__respostas = { detalhe: { ok: true, item: {}, tramites: [] } }; });
  await p.click('#corpo [data-k="calcFerias:a"]');
  await p.waitForSelector('#gaveta .grav-porque');
  assert.equal(await p.textContent('#gaveta .grav-porque'), 'Por que é crítica (G3): parada há 31 dias, o dobro do limite de 15.');
  assert.match(await p.textContent('#gaveta .motivos'), /Crítica \(G3\)/);
  // cantos: até 4 px em botões, etiquetas, chips e janelas; iniciais continuam redondas
  const raio = sel => p.$eval(sel, e => parseFloat(getComputedStyle(e).borderTopLeftRadius));
  // a janela é redesenhada quando a leitura chega: mede depois que ela parou de mudar
  for (const sel of ['#gaveta', '#gaveta .pill', '#gaveta .btn', '#gaveta .dtab']) await p.waitForFunction(s => { const e = document.querySelector(s); return e && e.isConnected && parseFloat(getComputedStyle(e).borderTopLeftRadius) <= 4; }, sel, { timeout: 3000 }).catch(async () => assert.fail(sel + ': ' + await raio(sel)));
  await p.keyboard.press('Escape');
  await p.evaluate(() => { const x = document.createElement('div'); x.innerHTML = '<span class="pr-tag" id="t1">x</span><span class="chip-f" id="t2">x</span><span class="sc-n" id="t3">1</span><span class="orig" id="t4">x</span><span class="tr-av" id="t5">AT</span>'; document.body.appendChild(x); });
  for (const sel of ['#t1', '#t2', '#t3', '#t4']) assert.ok(await raio(sel) <= 4, sel + ': ' + await raio(sel));
  assert.equal(await p.$eval('#t5', e => getComputedStyle(e).borderTopLeftRadius), '50%', 'iniciais redondas');
  assert.deepEqual(p.erros, []);
});

await passo('app · detalhe: janela com dados e trâmites lidos na hora; lembrete ligado à solicitação aparece na aba Lembretes', async () => {
  const p = await abrirApp('#/fila', {});
  await p.evaluate(() => { window.__respostas = { detalhe: { ok: true, item: { assunto: 'Férias do João', descricao: '<p>Segue <b>pedido</b></p>', meio: 'WEB' }, tramites: [{ n: 1, em: '2026-10-10T10:00:00', situacao: 'Sem análise', autor: 'Cliente BETA', texto: 'Abertura', anexos: ['aviso.pdf'] }, { n: 2, em: '2026-10-12T10:00:00', situacao: 'Aguardando resposta', autor: 'Cliente BETA', texto: 'Alguma novidade?', anexos: [] }] } }; });
  await p.click('#corpo [data-k="geral:b"]');
  await p.waitForSelector('#gaveta .tr-item');
  assert.equal(await p.$$eval('#gaveta .tr-item', e => e.length), 2);
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
  const p = await abrirApp('#/inicio', { snapshot: Object.assign({}, ESTADO_APP.snapshot, { items: itens }), settings: { __v: 2, desfazerSeg: 0 } });
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
  assert.equal(await p.$eval('#gaveta .cmp-int.on', x => x.dataset.sit), '4', 'Respondido: a vez passa ao cliente');
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
  await p.click('#g-mais summary');
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

await passo('app · detalhe: destaques sutis; trâmites como conversa (filtro, ordem, ver tudo); Anexos num botão só com escolha do que baixar', async () => {
  const p = await abrirApp('#/fila', {});
  await p.evaluate(() => { window.__respostas = { detalhe: { ok: true, item: { assunto: 'Férias' }, datas: {},
    grupos: [{ titulo: 'Solicitação', campos: [{ k: 'Início das férias', v: '03/11/2026', destaque: true }, { k: 'Meio', v: 'Portal' }, { k: 'Dias de férias', v: '30', destaque: true }] }],
    anexos: ['pedido.pdf'], arquivos: [{ id: 'a0', nome: 'pedido.pdf' }],
    tramites: [
      { n: 1, id: 't1', em: '2026-10-01T10:00:00', situacao: 'Sem análise', lado: 'cli', autor: 'Cliente BETA', texto: 'Abertura', anexos: ['ponto.xlsx'], arquivos: [{ id: 'a1', nome: 'ponto.xlsx' }] },
      { n: 2, id: 't2', em: '2026-10-06T10:00:00', situacao: 'Respondido', lado: 'esc', autor: 'Ana Teste', texto: 'Linha\n'.repeat(30), anexos: ['aviso.pdf', 'recibo.pdf'], arquivos: [{ id: 'a2', nome: 'aviso.pdf' }, { id: 'a3', nome: 'recibo.pdf' }] },
      { n: 3, id: 't3', em: '2026-10-07T10:00:00', situacao: 'Aguardando resposta', lado: 'cli', autor: 'Cliente BETA', texto: 'Ok', anexos: [], arquivos: [] }] },
    baixarAnexos: { ok: true, baixados: 2, falhas: [], semRota: 0 } }; });
  await p.click('#corpo [data-k="geral:b"]');
  await p.waitForSelector('#gaveta .tr-item');
  // destaques: só os campos marcados, no topo
  assert.deepEqual(await p.$$eval('#gaveta .dlg-destaques .dq small', e => e.map(x => x.textContent)), ['Início das férias', 'Dias de férias']);
  // conversa: sempre na ordem em que aconteceu, sem filtros nem troca de ordem; escritório à direita; tempo entre
  // trâmites; último marcado; a janela já chega no fim da conversa
  assert.deepEqual(await p.$$eval('#g-corpo .tr-item', e => e.map(x => x.querySelector('.tr-quando').textContent.slice(0, 3))), ['#01', '#02', '#03']);
  assert.match(await p.textContent('#g-corpo .tr-item'), /Abertura/, 'começa pela abertura');
  assert.deepEqual(await p.$$eval('#g-corpo .tr-item', e => e.map(x => x.classList.contains('esc') ? 'esc' : 'cli')), ['cli', 'esc', 'cli']);
  assert.match(await p.textContent('#g-corpo .tr-item.ultimo'), /Ok/);
  // "Responder" ao lado da última mensagem do cliente (e só dela)
  assert.equal(await p.$$eval('#g-corpo .tr-responder', e => e.length), 1);
  assert.equal(await p.$eval('#g-corpo .tr-responder', b => b.closest('.tr-item').classList.contains('ultimo')), true);
  const [bolha, botao] = await p.$eval('#g-corpo .tr-item.ultimo', e => [e.querySelector('.tr-bolha').getBoundingClientRect(), e.querySelector('.tr-responder').getBoundingClientRect()].map(r => ({ x: r.left, d: r.right })));
  assert.ok(botao.x >= bolha.d, 'ao lado da bolha');
  assert.match(await p.textContent('#g-corpo .tr-lista'), /5 dias depois/);
  assert.equal(await p.$('[data-tr-filtro], [data-tr-ordem], .tr-barra'), null, 'sem filtros por cliente, escritório ou anexo');
  assert.ok(await p.$eval('#g-corpo', c => c.scrollHeight <= c.clientHeight || c.scrollTop + c.clientHeight >= c.scrollHeight - 2), 'mostra o fim da conversa ' + await p.$eval('#g-corpo', c => [c.scrollTop, c.clientHeight, c.scrollHeight].join()));
  const ladoEsc = await p.$eval('#g-corpo .tr-item.esc', e => getComputedStyle(e).flexDirection);
  assert.equal(ladoEsc, 'row-reverse');
  await p.waitForSelector('#g-corpo .tr-bolha.longo .tr-mais');
  await p.click('#g-corpo .tr-bolha.longo .tr-mais');
  assert.equal(await p.$eval('#g-corpo .tr-bolha.longo', e => e.classList.contains('aberto')), true, 'Ver tudo abre o texto longo');
  if (process.env.CAP) await p.screenshot({ path: process.env.CAP + '/detalhe-tramites.png' });
  await p.click('#g-corpo .tr-responder');
  assert.equal(await p.evaluate(() => document.activeElement && document.activeElement.id), 'a-texto', 'Responder leva o cursor para a caixa de resposta, que já está embaixo da conversa');
  assert.equal(await p.$eval('#cmp', c => c.closest('#g-corpo') === null), true, 'a caixa fica fora da área que rola: a conversa continua visível');
  // um botão só para os anexos: abre a escolha com todos marcados
  assert.match(await p.textContent('#g-anexos'), /Baixar anexos\s*4/);
  await p.click('#g-anexos');
  await p.waitForSelector('#dlg-anexos [data-ax]');
  assert.equal(await p.$$eval('#dlg-anexos [data-ax]:checked', e => e.length), 4);
  assert.match(await p.textContent('#dlg-anexos'), /Na abertura da solicitação.*Trâmite #01 · cliente.*Trâmite #02 · escritório/s);
  await p.click('#ax-todos');
  assert.equal(await p.isDisabled('#ax-baixar'), true, 'nada marcado, nada a baixar');
  await p.click('#dlg-anexos .ax-arq:has-text("aviso.pdf")');
  await p.click('#dlg-anexos .ax-arq:has-text("pedido.pdf")');
  assert.match(await p.textContent('#ax-cont'), /2 de 4/);
  if (process.env.CAP) await p.screenshot({ path: process.env.CAP + '/anexos.png' });
  assert.equal(await p.$eval('#ax-todos', e => e.indeterminate), true);
  await p.click('#ax-baixar');
  await p.waitForSelector('#dlg-anexos', { state: 'hidden' });
  const m = await p.evaluate(() => window.__msgs.find(x => x.cmd === 'baixarAnexos'));
  assert.deepEqual([m.type, m.num, JSON.stringify(m.anexos)], ['geral', '102', JSON.stringify([{ id: 'a0', topico: null, nome: 'pedido.pdf' }, { id: 'a2', topico: 't2', nome: 'aviso.pdf' }])]);
  assert.equal(await p.isHidden('#gaveta'), false, 'o detalhe continua aberto');
  // clicar num anexo do trâmite abre a escolha só com ele marcado; sem caminho conhecido, explica como ensinar
  await p.evaluate(() => { window.__respostas.baixarAnexos = { ok: true, baixados: 0, falhas: [], semRota: 1 }; });
  await p.click('#g-corpo .tr-arq:has-text("recibo.pdf")');
  await p.waitForSelector('#dlg-anexos [data-ax]');
  assert.deepEqual(await p.$$eval('#dlg-anexos [data-ax]:checked', e => e.map(x => x.closest('label').textContent)), ['PDFrecibo.pdf']);
  await p.click('#ax-baixar');
  await p.waitForSelector('#ax-onvio');
  assert.match(await p.textContent('#ax-msg'), /Ainda não sei como o Onvio baixa/);
  await p.keyboard.press('Escape');
  assert.equal(await p.isHidden('#dlg-anexos'), true);
  assert.equal(await p.isHidden('#gaveta'), false, 'Esc fecha só a janela de anexos');
  // aba Dados: o campo em destaque tem marca própria
  await p.click('#gaveta [data-aba="dados"]');
  assert.equal(await p.$$eval('#g-corpo .campo.dq-campo', e => e.length), 2);
  assert.deepEqual(p.erros, []);
});

await passo('app · detalhe: abas inteiras (não achatadas) mesmo com muito conteúdo e janela baixa', async () => {
  const p = await abrirApp('#/fila', {});
  await p.setViewportSize({ width: 1100, height: 560 });
  await p.evaluate(() => { window.__respostas = { detalhe: { ok: true, item: { assunto: 'Férias' }, tramites: Array.from({ length: 30 }, (x, n) => ({ n: n + 1, em: '2026-10-10T10:00:00', situacao: 'Em análise', autor: 'Ana', texto: 'Texto '.repeat(40), anexos: [] })), datas: {}, grupos: [], anexos: [] } }; });
  await p.click('#corpo [data-k="geral:b"]');
  await p.waitForFunction(() => document.querySelectorAll('#g-corpo .tr-item').length === 30);
  const m = await p.$eval('#gaveta .dtabs', e => ({ h: e.clientHeight, s: e.scrollHeight, tab: e.querySelector('.dtab').getBoundingClientRect().height }));
  assert.ok(m.h >= m.s - 1 && m.h >= 40 && m.tab >= 30, 'abas com a altura toda: ' + JSON.stringify(m));
  const corpo = await p.$eval('#g-corpo', e => ({ h: e.clientHeight, s: e.scrollHeight }));
  assert.ok(corpo.s > corpo.h, 'quem rola é o corpo');
  assert.deepEqual(p.erros, []);
});

await passo('app · Fila: cartões por tipo (todos, enxutos; de novo tira); ordem por prioridade, empresa (agrupada) e mais recente', async () => {
  const p = await abrirApp('#/fila?escopo=equipe');
  const tipos = await p.$$eval('#tipos .tipo-c', e => e.map(x => x.dataset.tipo + '=' + x.querySelector('b').textContent));
  assert.equal(tipos.length, 11, 'todos os tipos, como antes');
  assert.ok(tipos.includes('=3') && tipos.includes('calcFerias=1') && tipos.includes('afastamento=0'), tipos.join());
  assert.match(await p.textContent('#tipos [data-tipo="calcFerias"]'), /1 fora do prazo/);
  assert.equal(await p.$eval('#tipos [data-tipo="afastamento"]', b => b.classList.contains('zero')), true);
  const alt = await p.$eval('#tipos .tipo-c', b => b.getBoundingClientRect().height);
  assert.ok(alt >= 70 && alt <= 100, 'tamanho de cartão: ' + alt);
  await p.click('#tipos [data-tipo="geral"]');
  assert.deepEqual(await linhas(p), ['geral:b']);
  await p.click('#tipos [data-tipo="geral"]');
  assert.equal((await linhas(p)).length, 3, 'clicar de novo volta a todos');
  // prioridade (padrão): a mesma ordem do Hoje
  assert.equal(await p.$eval('#f-ord', s => s.value), 'prio');
  assert.equal((await linhas(p))[0], 'calcFerias:a');
  await p.selectOption('#f-ord', 'cliente');
  assert.deepEqual(await p.$$eval('#corpo .emp-cab b', e => e.map(x => x.textContent)), ['ACME', 'BETA']);
  assert.deepEqual(await linhas(p), ['calcFerias:a', 'rubricas:d', 'geral:b']);
  await p.selectOption('#f-ord', 'recente');
  assert.equal((await linhas(p))[0], 'rubricas:d');
  assert.equal(await p.evaluate(() => localStorage.getItem('controlonvio-fila-ord')), 'recente', 'a ordem escolhida fica lembrada');
  assert.deepEqual(p.erros, []);
});

await passo('app · Distribuir: mostra para quem vai cada sem responsável, com o porquê; Atribuir confirma e define no Onvio', async () => {
  const p = await abrirApp('#/fila', {});
  await p.evaluate(() => { window.__respostas = Object.assign(window.__respostas || {}, { acao: { ok: true, acao: 'responsavel', anexos: 0 }, distribuicao: { ok: true, dias: 30, movimentadas: 40, erros: [], sugestoes: [
    { item: { k: 'avisoRescisao:c', type: 'avisoRescisao', typeLabel: 'Aviso de rescisão', num: 103, code: 4, status: 'Respondido', lado: 'cli', apelido: 'GAMA', detalhe: 'Ciclano', parado: 26, nivel: 2, resp: '' }, resp: 'Bia', respId: 'id-bia', n: 3, motivo: 'atendeu 3 de 4 solicitações desta empresa nos últimos 30 dias', alternativas: [{ resp: 'Ana Teste', n: 1, respId: 'id-ana' }] },
    { item: { k: 'rubricas:z', type: 'rubricas', typeLabel: 'Lançamento de rubricas', num: 105, code: 1, status: 'Sem análise', lado: 'esc', apelido: 'ZETA', detalhe: '10/2026', parado: 1, nivel: 0, resp: '' }, resp: 'Bia', respId: 'id-bia', n: 1, motivo: 'atendeu 1 de 1 solicitações desta empresa nos últimos 30 dias', alternativas: [] }
  ] } }); });
  await p.evaluate(() => { location.hash = '#/distribuir'; });
  await p.waitForSelector('.dist-l');
  assert.equal(await p.textContent('#titulo'), 'Distribuir');
  assert.equal((await p.evaluate(() => window.__msgs.find(m => m.cmd === 'distribuicao'))).dias, 30);
  assert.match(await p.textContent('#subtitulo'), /nos últimos 30 dias/);
  assert.equal(await p.$('[data-dias]'), null, 'só 30 dias: 7 e 14 saíram');
  assert.match(await p.textContent('.dist-l'), /#103GAMA.*Aviso de rescisão · Ciclano.*atendeu 3 de 4 solicitações desta empresa nos últimos 30 dias · depois: Ana Teste \(1\)/);
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
  assert.deepEqual(p.erros, []);
});

await passo('app · Tramitação: caixa de resposta fixa; intenção e efeito; modelos e variáveis; avisos; rascunho na conversa; envio com anexo; erro mantém o texto; lista não mapeada', async () => {
  const p = await abrirApp('#/fila', { settings: { __v: 2, desfazerSeg: 0 } });
  await p.evaluate(() => { window.__respostas = { acao: { ok: true, acao: 'tramite', anexos: 1 }, detalhe: { ok: true, item: { assunto: 'Férias' }, tramites: [], datas: {} } }; });
  await p.click('#corpo [data-k="geral:b"]');
  await p.waitForSelector('#cmp #a-texto');
  assert.equal(await p.$eval('#cmp', c => c.closest('#g-corpo') === null), true, 'a caixa fica fora da área que rola');
  assert.deepEqual(await p.$$eval('.cmp-int', e => e.map(x => x.textContent)), ['Respondido · aguarda o cliente', 'Em análise', 'Em análise interna', 'Concluído · encerra']);
  if (process.env.CAP) await p.screenshot({ path: process.env.CAP + '/tram-fechada.png' });
  assert.equal(await p.isVisible('.cmp-int[data-sit="4"]'), true, 'Respondido já está à vista, sem precisar clicar na caixa');
  assert.equal(await p.isVisible('.cmp-modelo'), true, 'e os modelos também');
  // de outra aba, o Responder do rodapé leva à caixa
  await p.click('#gaveta [data-aba="dados"]');
  assert.equal(await p.$('#cmp'), null, 'a caixa é da aba Trâmites');
  assert.equal(await p.$eval('#g-responder', b => b.disabled), false);
  await p.click('#g-responder');
  await p.waitForSelector('#cmp #a-texto');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'a-texto');
  // revisar sem texto: o aviso diz o que falta, sem sair da tela (a caixa abre ao clicar nela)
  await p.click('#a-texto');
  await p.click('#a-revisar');
  assert.match(await p.textContent('.cmp-erro'), /Escreva o texto da resposta/);
  // o texto pede algo ao cliente: sugere "Respondido"; "Concluído" avisa do conflito
  await p.fill('#a-texto', 'Pode enviar o RG do empregado?');
  assert.equal(await p.$eval('.cmp-int.sug', b => b.dataset.sit), '4');
  await p.click('.cmp-int[data-sit="5"]');
  assert.equal(await p.textContent('#cmp-efeito'), 'Depois do envio: Encerra a solicitação: ela sai da fila.');
  assert.match(await p.textContent('#cmp-avisos'), /pede algo ao cliente, mas "Concluído" encerra/);
  await p.click('.cmp-int[data-sit="4"]');
  assert.match(await p.textContent('#cmp-efeito'), /A vez passa ao cliente; sem retorno, prescreve em 30 dias/);
  assert.equal(await p.textContent('#cmp-avisos'), '');
  // modelo com variável: a saudação vem pelo horário e o cursor já cai no que falta preencher
  await p.fill('#a-texto', '');
  await p.click('.cmp-modelo:has-text("Falta informação")');
  assert.match(await p.inputValue('#a-texto'), /^(Bom dia|Boa tarde|Boa noite)! Para seguirmos com a solicitação, precisamos de mais informações: \(descreva o que falta\)\./);
  assert.equal(await p.evaluate(() => { const t = document.querySelector('#a-texto'); return t.value.slice(t.selectionStart, t.selectionEnd); }), '(descreva o que falta)');
  assert.equal(await p.$eval('.cmp-int.on', b => b.dataset.sit), '4', 'o modelo escolhe o que acontece depois');
  assert.match(await p.textContent('#cmp-avisos'), /Falta preencher: \(descreva o que falta\)/);
  await p.click('#a-revisar');
  assert.match(await p.textContent('.cmp-erro'), /Falta preencher/);
  assert.equal(await p.$('#a-enviar'), null, 'com marcador sobrando não chega à revisão');
  await p.keyboard.type('a guia do FGTS de setembro');       // escreve por cima do trecho marcado
  assert.equal(await p.textContent('#cmp-avisos'), '');
  if (process.env.CAP) await p.screenshot({ path: process.env.CAP + '/tram-editar.png' });
  await p.click('#a-obs');
  assert.match(await p.inputValue('#a-texto'), /a guia do FGTS de setembro\. Pode complementar por aqui, por favor\?\n\nObservações importantes:\n• Prazo de conclusão/);
  await p.setInputFiles('#a-arquivos', { name: 'recibo.txt', mimeType: 'text/plain', buffer: Buffer.from('ola') });
  assert.match(await p.textContent('.cmp-arqs'), /recibo\.txt · 3 B/);
  // revisar: o rascunho aparece na conversa, tracejado, e nada é enviado
  await p.click('#a-revisar');
  await p.waitForSelector('#a-enviar');
  if (process.env.CAP) await p.screenshot({ path: process.env.CAP + '/tram-revisar.png' });
  assert.match(await p.textContent('#tr-rascunho'), /rascunho.*Respondido.*a guia do FGTS de setembro.*recibo\.txt/s);
  assert.equal(await p.$eval('#tr-rascunho', e => e.closest('#g-corpo') !== null), true);
  assert.match(await p.textContent('#a-conf'), /Respondido \(a vez passa ao cliente.*\)[\s\S]*1 anexo\(s\): recibo\.txt/);
  assert.equal(await p.evaluate(() => window.__msgs.some(m => m.cmd === 'acao')), false, 'revisar não envia');
  await p.click('#a-voltar');
  assert.match(await p.inputValue('#a-texto'), /a guia do FGTS de setembro/, 'voltar e editar mantém o texto');
  assert.match(await p.textContent('.cmp-arqs'), /recibo\.txt/, 'e o anexo');
  await p.click('#a-revisar');
  await p.click('#a-enviar');
  await p.waitForFunction(() => window.__msgs.some(m => m.cmd === 'acao'));
  const m = await p.evaluate(() => window.__msgs.find(x => x.cmd === 'acao'));
  assert.deepEqual([m.acao, m.type, m.num, m.situacao, m.arquivos.length, m.arquivos[0].nome, m.arquivos[0].b64], ['tramite', 'geral', '102', '4', 1, 'recibo.txt', 'b2xh']);
  await p.waitForFunction(() => /Trâmite enviado ao Onvio com 1 anexo/.test(document.querySelector('#toast').textContent));
  await p.waitForFunction(() => window.__msgs.filter(x => x.cmd === 'detalhe').length >= 2, null, { timeout: 3000 });
  await p.waitForSelector('.cmp-ok');
  assert.match(await p.textContent('.cmp-ok'), /Trâmite enviado às \d\d:\d\d/);
  assert.equal(await p.$('#tr-rascunho'), null, 'depois de enviado, o rascunho sai da conversa');
  // erro do Onvio aparece e nada se perde
  await p.evaluate(() => { window.__respostas.acao = { ok: false, erro: 'o Onvio recusou a ação (HTTP 403)' }; });
  await p.fill('#a-texto', 'Concluído.');
  await p.click('.cmp-int[data-sit="5"]');
  await p.click('#a-revisar'); await p.click('#a-enviar');
  await p.waitForFunction(() => /Não foi enviado: o Onvio recusou a ação \(HTTP 403\)/.test(document.querySelector('.cmp-erro') ? document.querySelector('.cmp-erro').textContent : ''));
  assert.equal(await p.inputValue('#a-texto'), 'Concluído.');
  // Rubricas: não mapeado
  await p.click('#g-fechar');
  await p.evaluate(() => { location.hash = '#/fila?escopo=equipe'; });
  await p.click('#corpo [data-k="rubricas:d"]');
  await p.waitForSelector('#gaveta .cmp-nota');
  assert.match(await p.textContent('#gaveta .cmp-nota'), /ainda não está mapeado/);
  assert.equal(await p.$eval('#g-responder', b => b.disabled), true, 'Responder do rodapé desativado, com o motivo');
  assert.match(await p.getAttribute('#g-responder', 'title'), /ainda não mapeada/);
  assert.equal(await p.$('#a-texto'), null);
  assert.deepEqual(p.erros, []);
});

await passo('app · Tramitação: 5 s para desfazer; enviar e ir para a próxima; rascunho só na memória; atalho R e Ctrl+Enter; situação como linha na conversa', async () => {
  const p = await abrirApp('#/fila?escopo=equipe', { settings: { __v: 2, desfazerSeg: 3 } });
  await p.evaluate(() => { window.__respostas = { acao: { ok: true, acao: 'tramite', anexos: 0 }, detalhe: { ok: true, item: { assunto: 'Férias' }, datas: {}, tramites: [
    { n: 1, em: '2026-10-01T10:00:00', situacao: 'Sem análise', lado: 'cli', autor: 'Cliente BETA', texto: 'Abertura', anexos: [] },
    { n: 2, em: '2026-10-02T10:00:00', situacao: 'Em análise', lado: 'esc', autor: 'Ana Teste', texto: 'Vamos ver.', anexos: [] },
    { n: 3, em: '2026-10-02T11:00:00', situacao: 'Em análise', lado: 'esc', autor: 'Ana Teste', texto: 'Ainda vendo.', anexos: [] },
    { n: 4, em: '2026-10-03T10:00:00', situacao: 'Aguardando resposta', lado: 'esc', autor: 'Ana Teste', texto: 'Falta o RG.', anexos: [] }] } }; });
  await p.click('#corpo [data-k="geral:b"]');
  await p.waitForSelector('#g-corpo .tr-item');
  // a situação vira uma linha quando muda (não uma etiqueta em cada bolha)
  assert.deepEqual(await p.$$eval('#g-corpo .tr-sit span', e => e.map(x => x.textContent)), ['Situação passou a: Em análise', 'Situação passou a: Aguardando resposta']);
  assert.equal(await p.$$eval('#g-corpo .tr-bolha .pill', e => e.length), 1, 'só o "último" fica como etiqueta');
  // atalho R leva o cursor à caixa; Ctrl+Enter revisa
  await p.keyboard.press('r');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'a-texto');
  await p.keyboard.type('Rascunho que não pode se perder');
  await p.click('.cmp-int[data-sit="4"]');
  const nav0 = await p.textContent('.dlg-nav span');
  await p.click('#g-prox');
  await p.waitForFunction(n => document.querySelector('.dlg-nav span').textContent !== n, nav0);
  assert.equal(await p.evaluate(() => (document.querySelector('#a-texto') || { value: '' }).value), '', 'outra solicitação, outra caixa');
  await p.click('#g-ant');
  await p.waitForFunction(() => document.querySelector('#a-texto') && /Rascunho que não/.test(document.querySelector('#a-texto').value));
  assert.equal(await p.$eval('.cmp-int.on', b => b.dataset.sit), '4', 'o rascunho volta com a escolha');
  assert.equal(await p.evaluate(() => /Rascunho que não/.test(localStorage.getItem('__mem'))), false, 'o rascunho nunca é gravado');
  await p.focus('#a-texto');
  await p.keyboard.press('Control+Enter');
  await p.waitForSelector('#a-enviar');
  assert.equal(await p.$('#a-desfazer'), null, 'um Ctrl+Enter só revisa, nunca envia');
  // enviar espera alguns segundos: dá para desfazer e nada vai ao Onvio
  await p.click('#a-enviar');
  await p.waitForSelector('#a-desfazer');
  assert.match(await p.textContent('#cmp-conta-tx'), /Enviando em [123] s/);
  await p.click('#a-desfazer');
  await p.waitForSelector('#a-enviar');
  await p.waitForTimeout(3500);
  assert.equal(await p.evaluate(() => window.__msgs.some(m => m.cmd === 'acao')), false, 'desfeito: nada foi enviado');
  assert.ok(await p.$('#tr-rascunho'), 'o rascunho continua na conversa');
  // fechar a janela durante a contagem cancela o envio
  await p.click('#a-enviar');
  await p.waitForSelector('#a-desfazer');
  await p.keyboard.press('Escape');
  await p.waitForSelector('#gaveta', { state: 'hidden' });
  await p.waitForTimeout(3500);
  assert.equal(await p.evaluate(() => window.__msgs.some(m => m.cmd === 'acao')), false, 'janela fechada: o envio foi cancelado');
  // enviar e ir para a próxima: manda depois da contagem e abre a seguinte da lista
  await p.click('#corpo [data-k="geral:b"]');
  await p.waitForSelector('#a-enviar-prox');                  // o rascunho voltou na revisão, sem ter sido enviado
  const posAntes = await p.textContent('.dlg-nav span');
  await p.click('#a-enviar-prox');
  await p.waitForFunction(() => window.__msgs.some(m => m.cmd === 'acao'), null, { timeout: 8000 });
  await p.waitForFunction(n => document.querySelector('.dlg-nav span') && document.querySelector('.dlg-nav span').textContent !== n, posAntes, { timeout: 8000 });
  assert.equal(await p.evaluate(() => window.__msgs.filter(m => m.cmd === 'acao').length), 1);
  assert.deepEqual(p.erros, []);
});

await passo('app · Tramitação: modelo pessoal sem dado de cliente; passar para outro analista; Mais ações com o motivo na linha', async () => {
  const itens = ITENS_APP.map(i => Object.assign({}, i, i.resp === 'Ana Teste' ? { respId: 'id-ana' } : i.resp === 'Bia' ? { respId: 'id-bia' } : {}));
  const p = await abrirApp('#/fila?escopo=equipe', { snapshot: Object.assign({}, ESTADO_APP.snapshot, { items: itens }), settings: { __v: 2, desfazerSeg: 0 } });
  await p.evaluate(() => { window.__respostas = { acao: { ok: true, acao: 'tramite', anexos: 0 }, detalhe: { ok: true, item: { assunto: 'Férias' }, datas: {}, tramites: [] } }; });
  await p.click('#corpo [data-k="geral:b"]');
  await p.waitForSelector('#a-texto');
  // guardar como modelo: os dados desta solicitação voltam a ser {variáveis}
  await p.fill('#a-texto', 'Olá, BETA! Enviamos o documento de hoje.');
  await p.click('#a-guardar');
  assert.equal(await p.inputValue('#mg-texto'), 'Olá, {cliente}! Enviamos o documento de hoje.');
  await p.fill('#mg-rot', 'Meu aviso');
  await p.click('#mg-salvar');
  await p.waitForSelector('.cmp-modelo:has-text("Meu aviso")');
  const guardado = await p.evaluate(() => JSON.parse(localStorage.getItem('__mem')).modelosPessoais);
  assert.deepEqual([guardado.length, guardado[0].rot, guardado[0].texto], [1, 'Meu aviso', 'Olá, {cliente}! Enviamos o documento de hoje.']);
  assert.equal(JSON.stringify(guardado).includes('BETA'), false, 'o modelo guardado não leva o nome do cliente');
  await p.fill('#a-texto', '');
  await p.click('.cmp-modelo:has-text("Meu aviso")');
  assert.equal(await p.inputValue('#a-texto'), 'Olá, BETA! Enviamos o documento de hoje.', 'ao usar, a variável vira o cliente da vez');
  await p.click('.cmp-m-tira');
  await p.waitForFunction(() => !document.querySelector('.cmp-m-tira'));
  // Mais ações: passar para outro analista (encaminhar com comentário)
  await p.click('#g-mais summary');
  assert.equal(await p.$eval('[data-acao="passar"]', b => b.disabled), false);
  await p.click('[data-acao="passar"]');
  await p.waitForSelector('.acao-ops');
  assert.deepEqual(await p.$$eval('#a-analista option', o => o.map(x => x.textContent)), ['Escolha…', 'Bia'], 'ao encaminhar, não oferece o responsável de agora');
  await p.selectOption('#a-analista', 'id-bia');
  await p.fill('#a-texto', 'Pode assumir?');
  await p.click('#a-revisar');
  assert.match(await p.textContent('#a-conf'), /Encaminhar para Bia[\s\S]*Pode assumir\?/);
  await p.click('#a-enviar');
  await p.waitForFunction(() => window.__msgs.some(m => m.cmd === 'acao'));
  const e = await p.evaluate(() => window.__msgs.find(x => x.cmd === 'acao'));
  assert.deepEqual([e.acao, e.encaminharPara, e.texto], ['tramite', 'id-bia', 'Pode assumir?']);
  await p.waitForSelector('#cmp #a-texto');
  // trocar o responsável é a outra opção do mesmo formulário
  await p.click('#g-mais summary'); await p.click('[data-acao="passar"]');
  await p.click('input[name="a-modo"][value="responsavel"]');
  await p.waitForSelector('#a-analista');
  assert.equal(await p.$('#a-texto'), null, 'sem comentário ao trocar o responsável');
  await p.selectOption('#a-analista', 'id-bia');
  await p.click('#a-revisar'); await p.click('#a-enviar');
  await p.waitForFunction(() => window.__msgs.filter(m => m.cmd === 'acao').length === 2);
  assert.deepEqual(await p.evaluate(() => { const x = window.__msgs.filter(m => m.cmd === 'acao')[1]; return [x.acao, x.analista]; }), ['responsavel', 'id-bia']);
  // o motivo aparece na própria linha (não só no mouse)
  await p.click('#g-fechar');
  await p.click('#corpo [data-k="calcFerias:a"]');
  await p.waitForSelector('#a-texto');
  await p.click('#g-mais summary'); await p.click('[data-acao="passar"]');
  await p.waitForSelector('.acao-op.off');
  assert.match(await p.textContent('.acao-op.off'), /só permite definir responsável quando ainda não há um/);
  assert.equal(await p.$eval('input[name="a-modo"][value="responsavel"]', i => i.disabled), true);
  await p.click('#a-cancelar');
  await p.click('#g-fechar');
  await p.click('#corpo [data-k="rubricas:d"]');
  await p.waitForSelector('#g-mais');
  await p.click('#g-mais summary');
  assert.equal(await p.$eval('[data-acao="passar"]', b => b.disabled), true);
  assert.match(await p.textContent('[data-acao="passar"] .mi-motivo'), /ainda não mapeada/);
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

await passo('app · busca (janela central) consulta o Onvio na hora; Clientes e Consultar no Onvio saíram; Agenda e lembretes; sino; Ver Onvio', async () => {
  const p = await abrirApp('#/fila');
  await p.evaluate(() => { window.__respostas = { buscar: { ok: true, itens: [{ k: 'geral:z', type: 'geral', typeLabel: 'Geral', num: 900, status: 'Concluído', lado: 'fim', nivel: 0, cliente: 'ZETA', apelido: 'ZETA', detalhe: 'Antiga', resp: 'Ana', last: '2026-01-02T10:00:00' }] } }; });
  // rotas que saíram voltam ao Hoje
  for (const r of ['#/clientes', '#/solicitacoes']) { await p.evaluate(h => { location.hash = h; }, r); await p.waitForFunction(() => document.querySelector('#titulo').textContent === 'Hoje'); }
  await p.evaluate(() => { location.hash = '#/fila'; });
  await p.waitForSelector('#corpo [data-k]');
  // busca: "/" abre a janela; o que já foi lido aparece na hora; Enter busca nas 10 listas
  await p.keyboard.press('/');
  await p.waitForSelector('#cmdk:not([hidden])');
  await p.fill('#busca-q', 'joão');
  assert.match(await p.textContent('#cmdk-res'), /Buscar “joão” no Onvio[\s\S]*#102 · BETA/);
  await p.press('#busca-q', 'Enter');
  await p.waitForFunction(() => window.__msgs.some(m => m.cmd === 'buscar' && m.q === 'joão'));
  assert.equal(await p.textContent('#titulo'), 'Busca');
  await p.waitForSelector('#corpo [data-k="geral:z"]');
  assert.doesNotMatch(await p.textContent('#subtitulo'), /ver as listas/);
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

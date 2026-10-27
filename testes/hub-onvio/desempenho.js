/* Medição de desempenho do Hub com muitos dados do Onvio (dados FICTÍCIOS, gerados aqui): quantas empresas, solicitações e empregados
 * o Hub aguenta sem travar. Gera NCLI clientes (padrão 1200: ~14 mil solicitações, ~21 mil empregados, ~9 MB de texto), abre o DP,
 * entrega tudo de uma vez e mede cada tela, o perfil de CPU (tempo próprio por função) e as tarefas longas.
 *
 *   HUB_DIR=<pasta com hub.js, hub.css, tema.js, fontes.html e index.fonte.html> NODE_PATH=$(npm root -g) node testes/hub-onvio/desempenho.js
 *   NCLI=400        quantidade de clientes (as empresas do DP são 85% deles)
 *   NOONVIO=1       não entrega os dados do Onvio (linha de base: só o DP)
 *   LOOP=1          perfil de 5 ciclos de desenho do DP (Painel, Funcionários, Agenda)
 *   FONTES=1        perfil da Entrada de dados (mudanças de dados, busca e abas)
 * O banco é simulado em memória: o tempo de rede para ler as partes no banco de verdade não entra na conta. */
const assert = require('node:assert/strict'); const fs = require('node:fs'); const http = require('node:http'); const path = require('node:path');
const { chromium } = require('playwright');
const D = require('./dados.js');
const OC = D.OC;
const HUB = process.env.HUB_DIR;
const TIPOS_MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.png': 'image/png' };

const servidor = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/index.html' || u === '/') {
    const fonte = fs.readFileSync(path.join(HUB, 'index.fonte.html'), 'utf8');
    res.writeHead(200, { 'content-type': TIPOS_MIME['.html'] });
    return res.end('<!doctype html><html><head><meta charset="utf8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + fonte);
  }
  if (['/auth.js', '/extras.js', '/assistente.js'].includes(u)) { res.writeHead(200, { 'content-type': TIPOS_MIME['.js'] }); return res.end(''); }
  const f = path.join(HUB, path.basename(u));
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TIPOS_MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});

// banco do artefato simulado: doc/collection com get, set, update, delete e onSnapshot
const BANCO = `(() => {
  const store = new Map(), docL = new Map(), colL = new Map();
  const clone = (o) => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
  const colDe = (p) => p.split('/').slice(0, -1).join('/');
  const snapDoc = (p) => ({ id: p.split('/').pop(), exists: store.has(p), data: () => clone(store.get(p)) });
  const snapCol = (c) => { const docs = [...store.keys()].filter(k => colDe(k) === c).sort().map(k => ({ id: k.split('/').pop(), data: () => clone(store.get(k)) })); return { docs, size: docs.length, empty: !docs.length, forEach: (f) => docs.forEach(f) }; };
  const avisa = (p) => { (docL.get(p) || []).forEach(cb => cb(snapDoc(p))); (colL.get(colDe(p)) || []).forEach(cb => cb(snapCol(colDe(p)))); };
  const poe = (m, k, cb) => { if (!m.has(k)) m.set(k, []); m.get(k).push(cb); };
  const doc = (p) => ({ id: p.split('/').pop(), path: p,
    get: async () => snapDoc(p),
    set: async (d) => { store.set(p, clone(d)); window.__gravacoes.push(['set', p]); avisa(p); },
    update: async (d) => { store.set(p, Object.assign({}, store.get(p) || {}, clone(d))); window.__gravacoes.push(['update', p]); avisa(p); },
    delete: async () => { store.delete(p); avisa(p); },
    onSnapshot: (cb) => { poe(docL, p, cb); setTimeout(() => cb(snapDoc(p)), 0); return () => {}; },
    collection: (n) => col(p + '/' + n) });
  const col = (p) => ({ path: p, doc: (id) => doc(p + '/' + id), get: async () => snapCol(p), onSnapshot: (cb) => { poe(colL, p, cb); setTimeout(() => cb(snapCol(p)), 0); return () => {}; } });
  window.__gravacoes = [];
  window.__db = { listar: (c) => [...store.keys()].filter(k => colDe(k) === c).map(k => Object.assign({ id: k.split('/').pop() }, clone(store.get(k)))), semear: (p, d) => { store.set(p, clone(d)); avisa(p); }, ler: (p) => clone(store.get(p)), existe: (p) => store.has(p) };
  window.claude = { use: async (n) => n === 'db' ? { doc, collection: col } : n === 'downloads' ? { save: async () => {} } : n === 'user' ? { id: async () => 'u-teste', can: async () => true, profiles: async () => ({}) } : null };
})();`;


// ---------- dados sintéticos do tamanho de produção ----------
const NCLI = +(process.env.NCLI || 1200), NEMPDP = Math.floor(NCLI * 0.85), POR_CLI_SOL = 12, FUNC_POR = 15;
const dia = D.dia, iso = (n) => dia(n) + 'T10:00:00';
const cnpj = (i) => String(10000000000000 + i * 137).slice(0, 14);
const cli = (i) => ({ id: 'c' + i, code: String(1000 + i), name: 'EMPRESA ' + i + ' COMERCIO LTDA', nickname: 'E' + i, isOnvio: true, sendingEsocial: false, allowEmployeeRegistration: true });
const ANA = { id: 'u1', name: 'Ana Teste' };
const nomeFunc = (i, j) => 'Funcionario ' + i + ' Numero ' + j;
const emp = (i, j, adm) => ({ name: nomeFunc(i, j), cpf: '11122233344', hireDate: adm, status: 'ACTIVE', gender: 'F', jobPosition: 'A1', employeeWorkload: '220', integrationCode: String(i * 100 + j) });
function itens() {
  const out = { geral: [], avisoFerias: [], calcFerias: [], calcRescisao: [], afastamento: [], cadEmpregado: [], rubricas: [] };
  const sts = [1, 2, 4, 5];
  for (let i = 0; i < NCLI; i++) {
    for (let k = 0; k < POR_CLI_SOL; k++) {
      const tipo = ['geral', 'avisoFerias', 'calcFerias', 'calcRescisao', 'afastamento', 'cadEmpregado', 'rubricas'][k % 7], st = sts[(i + k) % 4];
      const b = { id: tipo + '-' + i + '-' + k, identifier: i * 20 + k, genericStatus: st, created: iso(-(k + 2)), changed: iso(-1), lastUpdated: iso(-2), requestWay: 'PORTAL', clientExpanded: cli(i), staffResponsibleExpanded: ANA, departmentId: 'd1', subject: 'Assunto ' + k, description: 'Descrição longa do pedido '.repeat(6), requesterExpanded: { name: 'Contato ' + i } };
      if (tipo === 'avisoFerias' || tipo === 'calcFerias') Object.assign(b, { vacationStartDate: dia(10 + k), vacationDays: 30, clientEmployeeExpanded: emp(i, k % FUNC_POR, '2022-01-01') });
      else if (tipo === 'calcRescisao') Object.assign(b, { resignationDate: dia(-k), terminationReasonId: 'm1', terminationType: 'WORKED', clientEmployeeExpanded: emp(i, k % FUNC_POR, '2022-01-01') });
      else if (tipo === 'afastamento') Object.assign(b, { leaveDate: dia(-k), employeeLeaveTypeId: '3', clientEmployeeExpanded: emp(i, k % FUNC_POR, '2022-01-01') });
      else if (tipo === 'cadEmpregado') Object.assign(b, { admissionDate: dia(k), name: nomeFunc(i, 90 + k), nationalIdentity: '11122233344', wage: 2000 });
      out[tipo].push(b);
    }
  }
  return out;
}
async function tabelas() {
  const T = {}, it = itens();
  for (const [k, lista] of Object.entries(it)) { const t = OC.TYPE_BY_KEY[k], slug = OC.slugHub(k); T['lista-' + slug] = { categoria: 'listas', ...OC.tabelaLista(t, lista) }; T['pessoais-' + slug] = { categoria: 'pessoais', ...OC.tabelaPessoais(t, lista) }; }
  for (const k of Object.keys(OC.TYPE_BY_KEY)) { const slug = OC.slugHub(k); if (!T['lista-' + slug]) { T['lista-' + slug] = { categoria: 'listas', ...OC.tabelaLista(OC.TYPE_BY_KEY[k], []) }; T['pessoais-' + slug] = { categoria: 'pessoais', ...OC.tabelaPessoais(OC.TYPE_BY_KEY[k], []) }; } }
  T['clientes-cnd'] = { categoria: 'clientes', ...OC.tabelaCnd(Array.from({ length: NCLI }, (_, i) => ({ id: 'c' + i, code: String(1000 + i), clientName: 'EMPRESA ' + i + ' COMERCIO LTDA', clientStatus: 'ACTIVE', nationalIdentity: cnpj(i), municipalInscription: '1', stateInscription: '2', stateInitials: 'SP', cityIbgeIdentifier: '1', documentType: 'CNPJ', isOnvio: true }))) };
  T['clientes-nfe'] = { categoria: 'clientes', ...OC.tabelaNfe(Array.from({ length: NCLI }, (_, i) => ({ id: 'c' + i, code: String(1000 + i), name: 'EMPRESA ' + i + ' COMERCIO LTDA', nickname: 'E' + i, active: true, clientStatus: 'ACTIVE', nationalIdentity: cnpj(i), uf: 'SP', isOnvio: true, certificateExpanded: {} }))) };
  T['escritorio-tabelas'] = { categoria: 'escritorio', colunas: ['Tabela', 'Código', 'Descrição', 'Detalhes'], linhas: ['Tipos de afastamento\t3\tDoença\tx', 'Motivos de rescisão\tm1\tPedido\tx'] };
  const cols = ['Id do cliente', 'Código do cliente', 'Cliente', 'Id', 'Nome', 'CPF', 'Admissão', 'Situação', 'Sexo', 'Cargo (código)', 'Carga horária', 'Código do empregado', 'Vínculo'];
  const linhas = []; for (let i = 0; i < NCLI; i++) for (let j = 0; j < FUNC_POR + 3; j++) linhas.push(['c' + i, 1000 + i, 'EMPRESA ' + i + ' COMERCIO LTDA', 'x' + i + '-' + j, nomeFunc(i, j), '11122233344', '2022-01-01', j > FUNC_POR ? 'INACTIVE' : 'ACTIVE', 'F', 'A1', '220', i * 100 + j, 'EMPLOYEE'].join('\t'));
  T['pessoais-empregados'] = { categoria: 'pessoais', colunas: cols, linhas };
  return T;
}
function empresasDP() {
  const f = (id, nome, codigo, adm) => ({ id, nome, cargo: 'Auxiliar', codigo, admissao: adm, status: 'Ativo', aquisitivo: '', feriasInicio: '', feriasFim: '', rescisao: '', salario: '', obs: '' });
  return Array.from({ length: NEMPDP }, (_, i) => ({ id: 'e' + i, cod: String(i), nome: 'EMPRESA ' + i + ' COMERCIO LTDA', cnpj: cnpj(i).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'), codigoDominio: String(1000 + i), tributacao: 'Simples Nacional', responsavel: i % 2 ? 'Ana Teste' : 'Bruno Teste', situacao: 'Ativa', uf: 'São Paulo/SP',
    funcionarios: Array.from({ length: 8 }, (_, j) => f('f' + i + '-' + j, nomeFunc(i, j), '', '2022-01-01')), historico: [], lembretes: [], prazos: [] }));
}

const seed = async (page, docs) => { for (let i = 0; i < docs.length; i += 200) await page.evaluate((d) => d.forEach(([p, x]) => window.__db.semear(p, x)), docs.slice(i, i + 200)); };
(async () => {
  await new Promise(r => servidor.listen(0, r));
  const url = `http://localhost:${servidor.address().port}/index.html`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, locale: 'pt-BR' });
  await ctx.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  await page.addInitScript(BANCO);
  await page.addInitScript(() => { try { localStorage.setItem('controlhub-theme', 'light'); } catch (e) {} window.__longs = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__longs.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] }); } catch (e) {} });
  await page.goto(url);
  await page.waitForFunction(() => window.__hubApi && window.__db);
  const t0 = Date.now(); console.log('gerando dados…');
  const T = await tabelas();
  const docs = []; let bytes = 0;
  for (const [tipo, c] of Object.entries(T)) {
    const partes = OC.partirTabela(c.linhas, 140000); bytes += c.linhas.join('\n').length;
    partes.forEach((tabela, i) => docs.push([`ing_partes/onvio~${tipo}~a${i}`, { ciclo: 'c1', parte: i, tabela }]));
    docs.push([`ing_dados/onvio~${tipo}`, { fonte: 'onvio', tipoDado: tipo, categoria: c.categoria, titulo: tipo, colunas: c.colunas, nLinhas: c.linhas.length, totalNaOrigem: c.linhas.length, cortado: false, partes: partes.length, slot: 'a', ciclo: 'c1', recebidoEm: Date.now(), extraidoEm: new Date().toISOString(), usuario: 'Ana', por: 'u', versaoExt: '0.53.0' }]);
  }
  console.log('conjuntos', Object.keys(T).length, 'docs', docs.length, 'MB', (bytes / 1e6).toFixed(1), 'gerado em', Date.now() - t0, 'ms');
  const emps = empresasDP();
  await seed(page, emps.map(e => { const { id, ...c } = e; return ['dp_empresas/' + id, c]; }));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 300 });
  if (!process.env.LOOP) await cdp.send('Profiler.start');
  const t1 = Date.now();
  await page.evaluate(() => window.__hubApi.abrirModulo('dp'));
  if (!process.env.NOONVIO) await seed(page, docs);                                       // chega tudo de uma vez (snapshots)
  const t2 = Date.now();
  // espera as cargas
  if (!process.env.NOONVIO) await page.waitForFunction(() => { const a = window.__hubApi.api('onvio'); try { return a.temListas() && a.temEmpregados() && a.solicitacoes().todas.length > 0; } catch (e) { return false; } }, null, { timeout: 180000 }).catch(() => console.log('timeout esperando cargas'));
  const t3 = Date.now();
  console.log('seed', t2 - t1, 'ms · até tudo lido', t3 - t2, 'ms');
  await page.waitForTimeout(3000);
  if (process.env.LOOP) { await page.evaluate(() => { window.__hubApi.api('dp').irPara('painel'); }); await page.waitForTimeout(1500); await cdp.send('Profiler.start'); const t = Date.now(); for (let i = 0; i < 5; i++) await page.evaluate(() => { window.__hubApi.abrirModulo('dp'); window.__hubApi.api('dp').irPara('funcionarios'); window.__hubApi.api('dp').irPara('agenda'); window.__hubApi.api('dp').irPara('painel'); }); console.log('5 ciclos (4 renders cada):', Date.now() - t, 'ms'); const { profile } = await cdp.send('Profiler.stop'); const nos = new Map(profile.nodes.map(n => [n.id, n])), auto = new Map(); const dt = profile.timeDeltas; profile.samples.forEach((id, i) => { const cf = nos.get(id).callFrame, k = (cf.functionName || '(anon)') + ' ' + cf.url.split('/').pop() + ':' + (cf.lineNumber + 1); auto.set(k, (auto.get(k) || 0) + (dt[i] || 0)); }); [...auto.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, v]) => console.log(String(Math.round(v / 1000)).padStart(7), k)); await browser.close(); servidor.close(); return; }
  if (process.env.FONTES) {
    await page.evaluate(() => window.__hubApi.abrirModulo('fontes'));
    const fr = () => page.frames().find(f => /fontes/.test(f.url()) || f.name() === 'fontes-frame') || page.frames()[1];
    await page.waitForFunction(() => { const f = document.querySelector('#fontes-frame'); return f && f.contentDocument && f.contentDocument.querySelector('#cadro') && f.contentDocument.querySelector('#cadro').innerHTML.length > 100; }, null, { timeout: 120000 }).catch(() => console.log('cadro não apareceu'));
    await page.waitForTimeout(2500);
    await cdp.send('Profiler.start');
    const f = page.frameLocator('#fontes-frame');
    let t = Date.now();
    for (let i = 0; i < 3; i++) { await page.evaluate((i) => window.__db.semear('dp_ov_ignorar/e' + i, { chaves: ['x' + i] }), i); await page.waitForTimeout(700); }
    console.log('3 mudanças de dados com a Entrada de dados aberta:', Date.now() - t, 'ms (inclui 3×700 de espera)');
    t = Date.now(); await f.locator('#cBusca').fill('empresa 77'); await page.waitForTimeout(300); console.log('digitar na busca:', Date.now() - t, 'ms');
    t = Date.now(); await f.locator('[data-aba-btn="recebido"]').click(); await page.waitForTimeout(300); console.log('aba O que chegou:', Date.now() - t, 'ms');
    const { profile } = await cdp.send('Profiler.stop'); const nos = new Map(profile.nodes.map(n => [n.id, n])), auto = new Map(); const dt = profile.timeDeltas; profile.samples.forEach((id, i) => { const cf = nos.get(id).callFrame, k = (cf.functionName || '(anon)') + ' ' + cf.url.split('/').pop() + ':' + (cf.lineNumber + 1); auto.set(k, (auto.get(k) || 0) + (dt[i] || 0)); });
    [...auto.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16).forEach(([k, v]) => console.log(String(Math.round(v / 1000)).padStart(7), k));
    console.log('DOM do quadro', await page.evaluate(() => document.querySelector('#fontes-frame').contentDocument.querySelectorAll('*').length));
    await browser.close(); servidor.close(); return;
  }
  const med = async (nome, fn) => { const t = Date.now(); const r = await page.evaluate(fn); const dom = await page.evaluate(() => document.querySelectorAll('*').length); console.log(nome.padEnd(34), String(Date.now() - t).padStart(6), 'ms', r === undefined ? '' : '→ ' + r, '· DOM', dom); };
  await med('onvio.difs()', () => window.__hubApi.api('onvio').difs().length);
  await med('onvio.difs() (2ª vez)', () => window.__hubApi.api('onvio').difs().length);
  await med('onvio.semVinculo()', () => window.__hubApi.api('onvio').semVinculo().length);
  await med('onvio.solicitacoes()', () => window.__hubApi.api('onvio').solicitacoes().todas.length);
  await med('abrirModulo(dp) de novo', () => { window.__hubApi.abrirModulo('dp'); });
  await med('dp.irPara(funcionarios)', () => { window.__hubApi.api('dp').irPara('funcionarios'); });
  await med('dp.irPara(cartela)', () => { window.__hubApi.api('dp').irPara('cartela'); });
  await med('dp.irPara(agenda)', () => { window.__hubApi.api('dp').irPara('agenda'); });
  if (process.env.LIMPAR) await med('esvazia #ct-pane-cartela', () => { document.querySelector('#ct-pane-cartela').innerHTML = ''; });
  if (process.env.CV) await med('content-visibility nas linhas', () => { const st = document.createElement('style'); st.textContent = '.ct-table tbody tr,.dp-row,.list-card tr{content-visibility:auto;contain-intrinsic-size:auto 44px}'; document.head.appendChild(st); });
  await med('abrirEmpresa(e1, onvio)', () => { window.__hubApi.api('dp').abrirEmpresa('e1', 'onvio'); });
  const longs = await page.evaluate(() => window.__longs);
  console.log('tarefas longas (ms):', longs.length, 'soma', longs.reduce((a, b) => a + b, 0), 'maiores', longs.sort((a, b) => b - a).slice(0, 8).join(','));
  const { profile } = await cdp.send('Profiler.stop');
  // tempo próprio por função
  const nos = new Map(profile.nodes.map(n => [n.id, n])), auto = new Map();
  const dt = profile.timeDeltas; profile.samples.forEach((id, i) => { const n = nos.get(id), cf = n.callFrame, k = (cf.functionName || '(anon)') + ' ' + cf.url.split('/').pop() + ':' + (cf.lineNumber + 1); auto.set(k, (auto.get(k) || 0) + (dt[i] || 0)); });
  const topo = [...auto.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22);
  console.log('\nmais tempo próprio (ms):'); topo.forEach(([k, v]) => console.log(String(Math.round(v / 1000)).padStart(7), k));
  if (erros.length) console.log('erros', erros.slice(0, 3));
  await browser.close(); servidor.close();
})().catch(e => { console.error(e); process.exit(1); });

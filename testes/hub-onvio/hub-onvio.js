/* Teste de navegador do Control Hub com os dados do Onvio (fase 1, DP): ficha da empresa (aba Onvio), agenda e alertas, painel,
 * e a Entrada de dados, onde fica toda a decisão (Aplicar, Ignorar, Ligar), com a permissão por carteira. Dados FICTÍCIOS (dados.js), banco do artefato simulado em memória.
 *
 *   HUB_DIR=<pasta com hub.js, hub.css, tema.js, fontes.html e index.fonte.html> NODE_PATH=$(npm root -g) node testes/hub-onvio/hub-onvio.js
 *   CAP=<pasta> grava capturas de tela (claro e escuro).
 *
 * O Hub é um artefato do claude.ai: baixe os arquivos com a ferramenta Artifact (read, paths) para HUB_DIR. Sem HUB_DIR o teste não roda. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const D = require('./dados.js');

const HUB = process.env.HUB_DIR;
if (!HUB || !fs.existsSync(path.join(HUB, 'hub.js'))) { console.log('HUB_DIR não definido (pasta com hub.js, hub.css, tema.js, fontes.html e index.fonte.html): teste do Hub pulado.'); process.exit(0); }
const CAP = process.env.CAP || '';
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
    get: async () => { (window.__gets = window.__gets || []).push(p); return snapDoc(p); },
    set: async (d) => { store.set(p, clone(d)); window.__gravacoes.push(['set', p]); avisa(p); },
    update: async (d) => { store.set(p, Object.assign({}, store.get(p) || {}, clone(d))); window.__gravacoes.push(['update', p]); avisa(p); },
    delete: async () => { store.delete(p); avisa(p); },
    onSnapshot: (cb) => { poe(docL, p, cb); setTimeout(() => cb(snapDoc(p)), 0); return () => {}; },
    collection: (n) => col(p + '/' + n) });
  const col = (p) => ({ path: p, doc: (id) => doc(p + '/' + id), get: async () => snapCol(p), onSnapshot: (cb) => { poe(colL, p, cb); setTimeout(() => cb(snapCol(p)), 0); return () => {}; } });
  window.__gravacoes = [];
  window.__db = { listar: (c) => [...store.keys()].filter(k => colDe(k) === c).map(k => Object.assign({ id: k.split('/').pop() }, clone(store.get(k)))), semear: (p, d) => { store.set(p, clone(d)); avisa(p); }, silencioso: (p, d) => { store.set(p, clone(d)); }, ler: (p) => clone(store.get(p)), existe: (p) => store.has(p) };
  window.claude = { use: async (n) => n === 'db' ? { doc, collection: col } : n === 'downloads' ? { save: async () => {} } : n === 'user' ? { id: async () => 'u-teste', can: async () => true, canEdit: async () => window.__canEdit !== false, profiles: async () => ({}) } : null };
})();`;

// A regra é: só é ativo quem está na lista de empregados do Onvio. A base do teste traz a lista só com quem aparece nas solicitações; o resto chega nos passos que testam a lista.
let ROSTER_BASE = null;
function montarBanco() {
  const docs = [], T = Object.assign({}, D.tabelas(), ROSTER_BASE ? { 'pessoais-empregados': ROSTER_BASE } : {}), agora = Date.now();
  for (const [tipo, c] of Object.entries(T)) {
    const partes = D.OC.partirTabela(c.linhas, 900);                // limite pequeno de propósito: força várias partes
    partes.forEach((tabela, i) => docs.push({ path: `ing_partes/onvio~${tipo}~a${i}`, data: { ciclo: 'c1', parte: i, tabela } }));
    docs.push({ path: `ing_dados/onvio~${tipo}`, data: { fonte: 'onvio', tipoDado: tipo, categoria: c.categoria, titulo: tipo, colunas: c.colunas, nLinhas: c.linhas.length, totalNaOrigem: c.linhas.length, cortado: false, partes: partes.length, slot: 'a', ciclo: 'c1', recebidoEm: agora, extraidoEm: new Date(agora).toISOString(), usuario: 'Ana Teste', por: 'u-teste', versaoExt: '0.52.0' } });
  }
  return docs;
}

let falhas = 0;
async function passo(nome, fn) { try { await fn(); console.log('ok   ' + nome); } catch (e) { falhas++; console.log('FALHA ' + nome + '\n     ' + String(e && e.message || e).split('\n').slice(0, 6).join('\n     ')); } }
const num = (s) => parseInt(String(s).replace(/^\D+/, ''), 10);

(async () => {
  ROSTER_BASE = await D.empregados(['Maria Souza', 'Beltrano Silva', 'Joao Lima']);
  ROSTER_BASE.linhas.push(['c-vega', '901', 'VEGA SERVICOS ME', 'v9', 'Novo Funcionario', '0', D.dia(3), 'ACTIVE', 'F', 'A1', '220', '777', 'EMPLOYEE'].join('\t'));     // o que antes vinha só da solicitação de admissão agora precisa estar na lista
  await new Promise(r => servidor.listen(0, r));
  const url = `http://localhost:${servidor.address().port}/index.html`;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, locale: 'pt-BR' });
  await ctx.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e && e.message || e)));
  await page.addInitScript(BANCO);
  await page.addInitScript(() => { try { localStorage.setItem('controlhub-theme', 'light'); } catch (e) {} });
  await page.goto(url);
  await page.waitForFunction(() => window.__hubApi && window.__db);
  // empresas do DP e dados do Onvio (a leitura é por snapshot: chegam depois da abertura, como na vida real)
  for (const e of D.empresas().concat([{ id: 'e-zeta', cod: '57', nome: 'TRANSPORTES ZETA', cnpj: '99.999.999/0001-99', codigoDominio: '57', tributacao: 'Lucro Presumido', responsavel: 'Ana Teste', situacao: 'Ativa', funcionarios: [], historico: [], lembretes: [], prazos: [] }])) {
    const { id, ...corpo } = e; await page.evaluate(([p, d]) => window.__db.semear(p, d), ['dp_empresas/' + id, corpo]);
  }
  for (const d of montarBanco()) await page.evaluate(([p, x]) => window.__db.semear(p, x), [d.path, d.data]);
  await page.evaluate(() => window.__hubApi.abrirModulo('dp'));
  await page.waitForSelector('#dp-painel-grid .pn-card');
  const hoje = D.dia(0);

  await passo('base: manifestos e partes lidos (várias partes por conjunto), listas ligadas às empresas pelo CNPJ e pelo nome', async () => {
    const api = () => page.evaluate(async () => {
      const a = window.__hubApi.api('onvio'), r = await a.tabela('lista-aviso-ferias'), s = a.solicitacoes();
      return { n: r.length, c: Object.keys(a.manifestos()).length, porEmp: [...s.porEmp.entries()].map(([id, l]) => [id, l.length]).sort(), sem: s.semVinc.map(g => g.cli), cli: a.clientes().size };
    });
    await page.waitForFunction(() => window.__hubApi.api('onvio').solicitacoes().todas.length >= 7, null, { timeout: 8000 });
    const r = await api();
    assert.equal(r.n, 2, 'duas solicitações de aviso de férias');
    assert.ok(r.c >= 20, 'manifestos: ' + r.c);
    assert.deepEqual(r.porEmp, [['e-lira', 1], ['e-orion', 4], ['e-vega', 2]], 'LIRA 1 (ligada pelo nome), ORION 4 (inclui a concluída), VEGA 2');
    assert.deepEqual(r.sem, ['ZETA TRANSPORTES LTDA', 'OMEGA SERVICOS LTDA'], 'ZETA e OMEGA ficam sem vínculo');
    assert.equal(r.cli, 5, 'clientes de CND e NF-e, por código');
  });

  await passo('Painel do DP: cartão Onvio com pendentes, vez do escritório e prazos legais em 7 dias; alertas de pessoal ganham os prazos do Onvio', async () => {
    await page.waitForFunction(() => [...document.querySelectorAll('#dp-painel-grid .pn-card')].some(c => /^\s*Onvio/.test(c.textContent) && /6\s*Pendentes/.test(c.textContent) && /5\s*Vez do escritório/.test(c.textContent)), null, { timeout: 8000 });
    const t = await page.$eval('#dp-painel-grid', e => [...e.querySelectorAll('.pn-card')].map(c => c.textContent.replace(/\s+/g, ' ')).find(x => /^\s*Onvio/.test(x)));
    assert.match(t, /6\s*Pendentes/); assert.match(t, /5\s*Vez do escritório/); assert.match(t, /2\s*Prazos legais em 7 dias/);
    assert.match(await page.textContent('#dp-painel-kpis'), /Alertas de pessoal.*|2/s);
    const al = await page.evaluate(() => window.__hubApi.api('dp').consultar('atrasos', {}));
    assert.ok(al && al.linhas !== undefined);
    if (CAP) await page.screenshot({ path: path.join(CAP, 'painel-claro.png') });
  });

  await passo('Agenda: o tipo Onvio entra com pagar rescisão, eSocial da admissão e pagar férias, sem repetir o que o cadastro já tem', async () => {
    const q = (de, ate) => page.evaluate(([a, b]) => window.__hubApi.api('dp').consultar('vencimentos', { de: a, ate: b }), [de, ate]);
    const r = await q(hoje, D.dia(40));
    const ts = r.linhas.map(l => l.t);
    assert.ok(ts.some(t => /Beltrano Silva · Pagar a rescisão e entregar os documentos \(10 dias\)/.test(t)), ts.join(' | '));
    assert.ok(ts.some(t => /Novo Funcionario · eSocial da admissão/.test(t)));
    assert.ok(ts.some(t => /Maria Souza · Pagar férias \(início/.test(t)));
    assert.ok(!ts.some(t => /Joao Lima · Pagar férias/.test(t)), 'solicitação na vez do cliente não gera prazo');
    assert.ok(r.linhas.find(l => /Pagar a rescisão/.test(l.t)).abrir.aba === 'onvio');
    await page.evaluate(() => window.__hubApi.api('dp').irPara('agenda'));
    await page.click('#dp-view-agenda [data-ag-tipo="onvio"], #dp-view-agenda button:has-text("Onvio")').catch(() => {});
  });

  await passo('Ficha da empresa: aba Onvio com o cliente (CNPJ, inscrições, certificado), números e a tabela de solicitações (pendentes e todas)', async () => {
    await page.evaluate(() => window.__hubApi.api('dp').abrirEmpresa('e-orion', 'onvio'));
    await page.waitForSelector('#dp-section-onvio .ov-tab');
    const topo = await page.textContent('#dp-section-onvio .ov-top');
    assert.match(topo, /Usa o Onvio\s*sim/); assert.match(topo, /Envia eSocial\s*não/); assert.match(topo, /11222333000181/); assert.match(topo, /12345/); assert.match(topo, /Certificado digital\s*tem · vale até/);
    const kp = await page.$$eval('#dp-section-onvio .ct-ov-kp div', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
    assert.equal(num(kp[0]), 3); assert.equal(num(kp[1]), 3); assert.equal(num(kp[2]), 1, 'uma concluída nos últimos 90 dias');
    assert.equal(await page.$$eval('#dp-section-onvio tr.ov-r', e => e.length), 3, 'pendentes');
    assert.equal((await page.textContent('#dp-dtab-n-onvio')).trim(), '3');
    await page.click('#dp-section-onvio [data-ov-f="todas"]');
    assert.equal(await page.$$eval('#dp-section-onvio tr.ov-r', e => e.length), 4, 'todas');
    await page.click('#dp-section-onvio [data-ov-f="pend"]');
    const ana = await page.textContent('#dp-section-onvio tr.ov-r:has-text("701") .ov-ana');
    assert.match(ana, /G2/); assert.match(ana, /prazo legal/); assert.match(ana, /prometido até/);
    assert.equal(await page.$$eval('#dp-section-onvio .ov-ana', e => e.length), 1, 'só a que a extensão analisou leva o selo');
    // abre a solicitação 701: dados completos e conversa das pendentes
    await page.click('#dp-section-onvio tr.ov-r:has-text("701")');
    await page.waitForFunction(() => /Recebido, vamos calcular\./.test((document.querySelector('#dp-section-onvio .ov-det') || {}).textContent || ''), null, { timeout: 8000 });
    const det = await page.textContent('#dp-section-onvio .ov-det');
    assert.match(det, /Dias de abono/); assert.match(det, /Recebido, vamos calcular\./); assert.match(det, /Contato da ORION/);
    if (CAP) await page.screenshot({ path: path.join(CAP, 'ficha-onvio-claro.png') });
  });

  await passo('Ficha da empresa, Funcionários: cada linha só com nome, admissão e código do Domínio; desligados atrás de um botão no cabeçalho; a origem da lista e o aviso de que pode não ser 100% fiel', async () => {
    await page.evaluate(() => { const e = window.__db.ler('dp_empresas/e-orion'); e.funcionarios.push({ id: 'f-desl-ficha', nome: 'Ficha Desligada', cargo: 'X', codigo: '777', admissao: '2020-05-05', status: 'Desligado', aquisitivo: '', feriasInicio: '', feriasFim: '', rescisao: '2026-01-10', salario: '', obs: 'Criado a partir do Onvio' }); window.__db.semear('dp_empresas/e-orion', e); });
    await page.evaluate(() => window.__hubApi.api('dp').abrirEmpresa('e-orion', 'funcionarios'));
    await page.waitForSelector('#dp-section-funcionarios .dp-section-row.fn-lin');
    const sec = page.locator('#dp-section-funcionarios');
    const txt = (await sec.textContent()).replace(/\s+/g, ' ');
    assert.match(txt, /De onde vem esta lista/); assert.match(txt, /lista de empregados do Onvio/); assert.match(txt, /Pode não representar a realidade 100%/);
    assert.doesNotMatch(txt, /Os alertas usam estas datas/); assert.doesNotMatch(await sec.locator('.dp-section-row.fn-lin').first().textContent(), /Agora|Situação|Observação|Cargo|Salário|Férias/);
    const rotulos = await sec.locator('.dp-section-row.fn-lin').first().locator('.dp-section-cell-label').allTextContents();
    assert.deepEqual(rotulos.map(t => t.trim()), ['Nome', 'Admissão', 'Cód. Domínio'], 'só nome, admissão e código do Domínio');
    assert.equal(await sec.locator('.dp-section-row.fn-lin').count(), 2, 'só os ativos (Maria e Beltrano)');
    assert.equal(await sec.locator('.dp-section-row.fn-lin .icon-btn').count(), 0, 'sem lápis e sem lixeira na linha do funcionário');
    // clicar na linha abre os dados
    await sec.locator('.dp-section-row.fn-lin:has-text("Maria Souza")').click();
    await page.waitForSelector('#dp-section-funcionarios .dp-section-row.editing');
    assert.ok(await sec.locator('.dp-section-row.editing [data-field="status"]').count() >= 1, 'abre todos os dados (situação, cargo…)');
    await sec.locator('[data-sec-cancel="funcionarios"]').click();
    await page.waitForSelector('#dp-section-funcionarios .dp-section-row.fn-lin');
    await page.keyboard.press('Tab').catch(() => {});
    assert.doesNotMatch(await sec.textContent(), /Ficha Desligada/);
    const btn = sec.locator('[data-ficha-desl]'); assert.match(await btn.textContent(), /Desligados \(1\)/);
    assert.equal(await sec.locator('.fn-pop').count(), 0, 'o balão começa fechado');
    await btn.click();
    await page.waitForSelector('#dp-section-funcionarios .fn-pop');
    assert.match(await sec.locator('.fn-pop').textContent(), /Ficha Desligada/, 'os desligados abrem num balão por cima');
    assert.equal(await sec.locator(':scope > .dp-section-rows > .fn-lin').count(), 2, 'a lista de ativos continua por baixo');
    assert.equal(await sec.locator('.fn-pop').evaluate(el => getComputedStyle(el).position), 'absolute');
    if (CAP) { await page.waitForTimeout(300); await page.screenshot({ path: path.join(CAP, 'ficha-funcionarios-desligados-claro.png') }); }
    await page.keyboard.press('Escape');
    await page.waitForSelector('#dp-section-funcionarios .fn-pop', { state: 'detached' });
    assert.equal(await page.locator('#dlg-dp-detail').evaluate(d => d.open), true, 'Esc fecha só o balão, não a ficha');
    await btn.click(); await page.waitForSelector('#dp-section-funcionarios .fn-pop');
    await sec.locator('.fn-cab > span:first-child').click();
    await page.waitForSelector('#dp-section-funcionarios .fn-pop', { state: 'detached' });
    await btn.click(); await page.waitForSelector('#dp-section-funcionarios .fn-pop');
    await sec.locator('.fn-pop .fn-lin:has-text("Ficha Desligada")').click();
    await page.waitForSelector('#dp-section-funcionarios .dp-section-row.editing');
    assert.equal(await sec.locator('.fn-pop').count(), 0, 'abrir os dados fecha o balão');
    await sec.locator('[data-sec-cancel="funcionarios"]').click();
    await page.waitForSelector('#dp-section-funcionarios .dp-section-row.fn-lin');
    // busca: filtra ativos e desligados por nome ou código, sem perder o foco
    const busca = page.locator('#fn-busca'); assert.equal(await busca.count(), 1, 'a ficha tem barra de pesquisa');
    await busca.click(); await page.keyboard.type('beltr');
    assert.equal(await sec.locator(':scope > .dp-section-rows > .fn-lin:visible').count(), 1, 'só o Beltrano');
    assert.match(await sec.locator('.fn-busca-n').textContent(), /1 de 2/);
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'fn-busca', 'o foco continua no campo');
    await busca.fill('101'); assert.equal(await sec.locator(':scope > .dp-section-rows > .fn-lin:visible').count(), 1, 'pelo código do Domínio'); assert.match(await sec.locator(':scope > .dp-section-rows > .fn-lin:visible').textContent(), /Maria/);
    await busca.fill('zzz'); assert.match(await sec.locator(':scope > .dp-section-rows').textContent(), /Nenhum funcionário encontrado/);
    await btn.click(); await page.waitForSelector('#dp-section-funcionarios .fn-pop');
    assert.equal(await busca.inputValue(), 'zzz', 'a busca continua ao abrir o balão'); assert.match(await sec.locator('.fn-pop').textContent(), /Nenhum funcionário encontrado/);
    await busca.fill('ficha desl'); assert.equal(await sec.locator('.fn-pop .fn-lin:visible').count(), 1, 'o balão também filtra');
    await page.keyboard.press('Escape'); await page.waitForSelector('#dp-section-funcionarios .fn-pop', { state: 'detached' });
    await busca.fill(''); assert.equal(await sec.locator(':scope > .dp-section-rows > .fn-lin:visible').count(), 2);
    // janela baixa: o cabeçalho e as abas da ficha não são espremidos
    const vp = page.viewportSize(); await page.setViewportSize({ width: vp.width, height: 420 }); await page.waitForTimeout(200);
    const hAbas = await page.locator('#dp-dtabs').evaluate(el => el.getBoundingClientRect().height), hCab = await page.locator('#dlg-dp-detail > .dlg-head').evaluate(el => el.getBoundingClientRect().height);
    assert.ok(hAbas >= 28 && hCab >= 30, `abas e cabeçalho mantêm a altura em janela baixa (${hAbas}, ${hCab})`);
    await page.setViewportSize(vp); await page.waitForTimeout(150);
    if (CAP) { await page.screenshot({ path: path.join(CAP, 'ficha-funcionarios-claro.png') }); }
    await page.evaluate(() => { const e = window.__db.ler('dp_empresas/e-orion'); e.funcionarios = e.funcionarios.filter(f => f.id !== 'f-desl-ficha'); window.__db.semear('dp_empresas/e-orion', e); });
  });

  await passo('Nomes das empresas: o apelido do Onvio, resumido, sempre terminado em " | final do CNPJ"; o nome inteiro fica na dica', async () => {
    const r = await page.evaluate(() => { const a = window.__hubApi; const cur = (e) => a.nomeEmpresa(e);
      return { orion: cur('e-orion'), sem: cur({ nome: 'ALFA COMERCIO E SERVICOS LTDA', cnpj: '' }), filial: cur({ nome: 'BETA TRADING FILIAL (0007-22)', cnpj: '11.222.333/0007-22' }), apel: cur({ nome: 'GAMA S/A', cnpj: '11222333000299' }), cpf: cur({ nome: 'JOAO ME', cnpj: '123.456.789-09' }),
        html: a.nomeEmpresa('e-orion', true) }; });
    assert.equal(r.orion, 'ORION | 0001-81', 'apelido do Onvio (clientes-nfe) + final do CNPJ');
    assert.equal(r.sem, 'ALFA COMERCIO E SERVICOS | sem CNPJ', 'sem apelido: tira LTDA; sem CNPJ avisa');
    assert.equal(r.filial, 'BETA TRADING | 0007-22', 'a filial mostra a ordem do CNPJ e não repete o final que o nome já trazia');
    assert.equal(r.apel, 'GAMA | 0002-99'); assert.equal(r.cpf, 'JOAO | CPF');
    assert.match(r.html, /title="ORION COMERCIO LTDA"/, 'o nome inteiro na dica');
    // a Entrada de dados (fontes.html) usa estes nomes: empresas, diferenças, parecidas e clientes sem empresa vêm no mesmo padrão
    const o = await page.evaluate(() => { const a = window.__hubApi.api('onvio'); return { emp: a.empresas().find(e => e.id === 'e-orion'), difs: [...new Set(a.difs().map(d => d.empNome))], sem: a.semVinculo().map(g => ({ cli: g.cli, par: g.parecidas.map(p => p.nome) })) }; });
    assert.equal(o.emp.nome, 'ORION | 0001-81'); assert.equal(o.emp.nomeCompleto, 'ORION COMERCIO LTDA');
    assert.ok(o.difs.length >= 1 && o.difs.every(n => / \| (\d{4}-\d{2}|CPF|sem CNPJ)$/.test(n)), 'diferenças por empresa no padrão: ' + o.difs.join(' / '));
    assert.ok(o.sem.length >= 1 && o.sem.every(g => / \| (\d{4}-\d{2}|CPF|sem CNPJ)$/.test(g.cli) && g.par.every(n => / \| /.test(n))), 'clientes sem empresa e parecidas no padrão: ' + JSON.stringify(o.sem));
  });

  await passo('DP: as diferenças só aparecem como aviso (ficha e tela Funcionários), sem nenhum botão de decisão, e o link abre a Entrada de dados', async () => {
    await page.click('#dp-dtabs [data-dtab="funcionarios"]');
    await page.waitForSelector('#dp-ov-dif:not([hidden]) .ov-aviso');
    assert.match(await page.textContent('#dp-ov-dif'), /5 diferenças com o Onvio desta empresa aguardam decisão na Entrada de dados/);
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__hubApi.api('dp').irPara('funcionarios'));
    await page.waitForSelector('#dp-func-cards .fn-card');
    assert.equal(await page.locator('#dp-func-ovdif').isVisible(), false, 'a aba Funcionários não mostra avisos nem alertas: só a quantidade de ativos e a evolução');
    // a ficha da empresa sem ligação também só informa
    await page.evaluate(() => window.__hubApi.api('dp').abrirEmpresa('e-zeta', 'onvio'));
    await page.waitForSelector('#dp-section-onvio .dp-empty');
    assert.match(await page.textContent('#dp-section-onvio'), /não está ligada a nenhum cliente do Onvio/);
    assert.match(await page.textContent('#dp-section-onvio'), /Entrada de dados/);
    await page.keyboard.press('Escape');
    const botoes = await page.evaluate(() => document.querySelectorAll('[data-ov-aplicar],[data-ov-ignorar],[data-ov-vinc-btn],[data-ov-vinc-sel]').length);
    assert.equal(botoes, 0, 'nenhum botão de decisão no DP');
    await page.evaluate(() => window.__hubApi.api('dp').abrirEmpresa('e-orion', 'funcionarios'));
    await page.waitForSelector('#dp-ov-dif:not([hidden]) [data-ov-fontes]');
    await page.click('#dp-ov-dif [data-ov-fontes]');
    await page.waitForSelector('#fontes-frame', { state: 'visible' });
  });

  const fr = page.frameLocator('#fontes-frame');
  const aplicarNoQuadro = async (linha, botao) => { await fr.locator(`#cadro tr[data-emp]:has-text("${linha}") ${botao}`).click(); await fr.locator('#dlgConf[open]').waitFor(); };

  await passo('Funcionários do DP: cartões por empresa (sem lista completa), busca pelo nome, só ativos, sem alertas, evolução e abrir a empresa', async () => {
    await page.evaluate(() => window.__hubApi.abrirModulo('dp'));
    await page.evaluate(() => window.__hubApi.api('dp').irPara('funcionarios'));
    await page.waitForSelector('#dp-func-cards .fn-card');
    assert.equal(await page.locator('#dp-func-listcard').isVisible(), false, 'a lista completa não aparece');
    assert.equal(await page.locator('#dp-func-list .dp-row').count(), 0, 'nenhuma linha de funcionário sem busca');
    const card = page.locator('#dp-func-cards .fn-card:has-text("ORION")');
    assert.equal(await card.count(), 1);
    assert.match(await card.textContent(), /2\s*ativos/); assert.doesNotMatch(await card.textContent(), /alerta|desligad|férias/i, 'o cartão só mostra a quantidade de ativos');
    assert.equal(await card.locator('.fn-bar').count(), 0, 'sem barra de situações');
    assert.match(await page.locator('#dp-func-resumo').textContent(), /funcionários ativos em/); assert.doesNotMatch(await page.locator('#dp-func-resumo').textContent(), /alerta|desligad|férias|afastad/i);
    assert.equal(await page.locator('#dp-badge-func').isVisible(), false, 'sem selo de alertas na aba Funcionários');
    assert.deepEqual((await page.locator('#dp-func-chips .dp-chip').allTextContents()).map(t => t.replace(/\s+\d+$/, '').trim()), ['Ativos', 'Desligados'], 'só ativos e desligados (sem filtro de alerta)');
    assert.equal(await page.locator('[data-func-modo="lista"]').count(), 0, 'sem o modo Lista');
    if (CAP) { await page.waitForTimeout(400); await page.screenshot({ path: path.join(CAP, 'funcionarios-cartoes-claro.png') }); }
    // uma letra não busca; duas ou mais, sim, pelo nome
    await page.fill('#dp-func-search', 'm'); await page.waitForTimeout(400);
    assert.equal(await page.locator('#dp-func-list .dp-row').count(), 0);
    await page.fill('#dp-func-search', 'maria');
    await page.waitForSelector('#dp-func-list .dp-row');
    assert.equal(await page.locator('#dp-func-list .dp-row').count(), 1);
    assert.match(await page.locator('#dp-func-list').textContent(), /Maria Souza/);
    assert.equal(await page.locator('#dp-func-cards').isVisible(), false, 'na busca só o resultado');
    if (CAP) { await page.waitForTimeout(300); await page.screenshot({ path: path.join(CAP, 'funcionarios-busca-claro.png') }); }
    await page.fill('#dp-func-search', 'zzzzz'); await page.waitForSelector('#dp-func-list .dp-empty');
    // desligados: só para consulta
    await page.fill('#dp-func-search', '');
    await page.waitForSelector('#dp-func-cards .fn-card');
    await page.click('#dp-func-chips [data-f="Desligado"]');
    await page.waitForSelector('#dp-func-cards .dp-empty, #dp-func-cards .fn-card');
    await page.click('#dp-func-chips [data-f=""]');
    await page.waitForSelector('#dp-func-cards .fn-card:has-text("ORION")');
    // evolução da quantidade de ativos
    await page.click('[data-func-modo="tempo"]');
    await page.waitForSelector('#dp-func-cards .fe-svg');
    assert.match(await page.locator('#dp-func-cards').textContent(), /ativos hoje/); assert.doesNotMatch(await page.locator('#dp-func-cards').textContent(), /alerta/i);
    assert.ok(await page.locator('#dp-func-cards .fe-svg circle').count() >= 24, 'um ponto por mês');
    assert.ok(await page.locator('#dp-func-cards .dp-row:has-text("ORION")').count() >= 1, 'a empresa aparece com ativos hoje e a variação');
    if (CAP) { await page.waitForTimeout(500); await page.screenshot({ path: path.join(CAP, 'funcionarios-evolucao-claro.png') }); }
    assert.equal(await page.locator('#dp-func-tl').isVisible(), false);
    await page.click('[data-func-modo="empresas"]');
    await page.waitForSelector('#dp-func-cards .fn-card');
    // o cartão abre a empresa na aba Funcionários
    await page.click('#dp-func-cards .fn-card:has-text("ORION")');
    await page.waitForSelector('#dlg-dp-detail[open]');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#dlg-dp-detail[open]'), null, { timeout: 5000 }).catch(() => { throw new Error('a ficha não fechou com Esc'); });
    await page.evaluate(() => window.__hubApi.abrirModulo('fontes'));                     // os próximos passos continuam na Entrada de dados
    await page.waitForFunction(() => { const f = document.querySelector('#fontes-frame'); return f && f.contentDocument && f.contentDocument.querySelector('#cadro tr[data-emp]'); }, null, { timeout: 10000 });
  });

  await passo('Entrada de dados: separa complementar, corrigir e cadastro novo; clientes sem empresa; nada é gravado antes de confirmar', async () => {
    await fr.locator('#cadro tr[data-emp]').first().waitFor({ timeout: 10000 });
    assert.equal(await fr.locator('#cadro tr[data-emp]').count(), 9, 'ORION 5 + VEGA 2 + LIRA 2');
    assert.match(await fr.locator('#cadSub').textContent(), /9 diferenças · 2 clientes sem empresa/);
    assert.match(await fr.locator('#vincro').textContent(), /ZETA TRANSPORTES \| 0001-03/); assert.match(await fr.locator('#vincro').textContent(), /OMEGA SERVICOS \| 0001-05/);
    assert.match(await fr.locator('#resumoTopo').textContent(), /11\s*para decidir/);
    // chips por ação: complementar 4 (código, férias, rescisão, CNPJ), corrigir 3 (admissão, afastamento, UF), novo 2
    const chips = await fr.locator('.chips.acoes .chipf').allTextContents();
    assert.deepEqual(chips.map(t => t.replace(/\s+/g, ' ').trim()), ['Todas 9', 'Complementar 4', 'Corrigir 3', 'Cadastro novo 2'], chips.join('|'));
    assert.match(await fr.locator('#cadro tr[data-emp]:has-text("Código Domínio vazio")').textContent(), /Complementar/);
    assert.match(await fr.locator('#cadro tr[data-emp]:has-text("Admissão diferente")').textContent(), /Corrigir/);
    assert.match(await fr.locator('#cadro tr[data-emp]:has-text("Está na lista de empregados do Onvio")').first().textContent(), /Cadastrar/);
    assert.match(await fr.locator('#cadro tr[data-emp]:has-text("CNPJ ou CPF vazio")').textContent(), /LIRA|Dados da empresa/);
    if (CAP) { await fr.locator('#secCadastro').scrollIntoViewIfNeeded(); await fr.locator('#secCadastro h2').evaluate(e => e.scrollIntoView({ block: 'start' })); await page.waitForTimeout(500); await page.screenshot({ path: path.join(CAP, 'entrada-dados-claro.png') }); }
    const g0 = await page.evaluate(() => window.__gravacoes.length);
    await aplicarNoQuadro('Código Domínio vazio', '[data-cad-aplicar]');
    assert.match(await fr.locator('#confTxt').textContent(), /Beltrano Silva: Código Domínio vazio\.[\s\S]*Complementar o cadastro do DP\? Fica registrado no histórico/);
    assert.equal(await page.evaluate(() => window.__gravacoes.length), g0, 'nada é gravado antes de confirmar');
    await fr.locator('#confNao').click();
    assert.equal(await page.evaluate(() => window.__gravacoes.length), g0, 'cancelar não grava');
    assert.equal(await fr.locator('#cadro tr[data-emp]').count(), 9);
  });

  await passo('Entrada de dados: Complementar e Corrigir gravam só o campo e registram o verbo certo no histórico; as férias não repetem o pagamento na agenda', async () => {
    await aplicarNoQuadro('Código Domínio vazio', '[data-cad-aplicar]');
    await fr.locator('#confSim').click();
    await page.waitForFunction(() => (window.__db.ler('dp_empresas/e-orion').funcionarios.find(f => f.nome === 'Beltrano Silva') || {}).codigo === '202', null, { timeout: 5000 });
    let e = await page.evaluate(() => window.__db.ler('dp_empresas/e-orion'));
    assert.match(e.historico[0].alteracao, /^Complementado a partir do Onvio \(Entrada de dados\): Beltrano Silva · Código Domínio vazio/);
    const b = e.funcionarios.find(f => f.nome === 'Beltrano Silva');
    assert.equal(b.admissao, '2022-02-02', 'complementar o código não mexe na admissão que o Hub já tinha');
    await fr.locator('#cadro tr[data-emp]').nth(7).waitFor();
    assert.equal(await fr.locator('#cadro tr[data-emp]').count(), 8);
    await aplicarNoQuadro('Férias no Onvio', '[data-cad-aplicar]');
    await fr.locator('#confSim').click();
    await page.waitForFunction(() => (window.__db.ler('dp_empresas/e-orion').funcionarios.find(f => f.nome === 'Maria Souza') || {}).feriasInicio, null, { timeout: 5000 });
    const f = await page.evaluate(() => window.__db.ler('dp_empresas/e-orion').funcionarios.find(f => f.nome === 'Maria Souza'));
    assert.equal(f.feriasInicio, D.dia(10)); assert.equal(f.feriasFim, D.dia(29), '20 dias de férias a partir do início');
    const r = await page.evaluate(([a, c]) => window.__hubApi.api('dp').consultar('vencimentos', { de: a, ate: c }), [hoje, D.dia(40)]);
    const pagar = r.linhas.filter(l => /Maria Souza · Pagar férias/.test(l.t));
    assert.equal(pagar.length, 1, 'um só pagamento de férias: ' + pagar.map(l => l.t).join(' | '));
    // dados da empresa: LIRA sem CNPJ (complementar) e com a UF do Onvio diferente (corrigir, só o estado)
    await aplicarNoQuadro('CNPJ ou CPF vazio', '[data-cad-aplicar]');
    await fr.locator('#confSim').click();
    await aplicarNoQuadro('UF diferente', '[data-cad-aplicar]');
    assert.match(await fr.locator('#confTxt').textContent(), /Corrigir o cadastro do DP com o valor do Onvio\?/);
    await fr.locator('#confSim').click();
    await page.waitForFunction(() => { const l = window.__db.ler('dp_empresas/e-lira'); return l.cnpj === '44.555.666/0001-04' && l.uf === 'Campinas/SP'; }, null, { timeout: 5000 });
    const l = await page.evaluate(() => window.__db.ler('dp_empresas/e-lira'));
    assert.match(l.historico[0].alteracao, /^Corrigido a partir do Onvio/); assert.match(l.historico[1].alteracao, /^Complementado a partir do Onvio.*CNPJ ou CPF vazio/);
  });

  await passo('Entrada de dados: Ignorar guarda a decisão e a diferença some', async () => {
    await aplicarNoQuadro('Joao Lima', '[data-cad-ignorar]');
    await fr.locator('#confSim').click();
    await page.waitForFunction(() => !!window.__db.existe('dp_ov_ignorar/e-vega'), null, { timeout: 5000 });
    const ign = await page.evaluate(() => window.__db.ler('dp_ov_ignorar/e-vega'));
    assert.equal(ign.chaves.length, 1); assert.match(ign.chaves[0], /^novo\|joao lima\|/);
    await page.waitForFunction(() => document.querySelector('#fontes-frame').contentDocument.querySelectorAll('#cadro tr[data-emp]').length === 4);
  });

  await passo('Permissão: o analista só decide nas empresas da carteira dele; a coordenação decide em qualquer uma (inclusive cadastrar empresa)', async () => {
    await page.evaluate(() => { window.__auth = { nivel: () => 'analista', analista: () => 'Bruno Teste', podeVer: () => true, ehAdmin: () => false, usuario: () => ({ nome: 'Bruno', id: 'u-bruno', prefs: {} }) }; });
    const dif = await page.evaluate(() => window.__hubApi.api('onvio').difs().map(d => [d.empId, d.tipo, d.pode]));
    assert.deepEqual(dif.filter(d => d[0] === 'e-orion').map(d => d[2]), [false, false, false], 'ORION é da Ana');
    assert.deepEqual(dif.filter(d => d[0] === 'e-vega').map(d => d[2]), [true], 'VEGA é do Bruno');
    const recusa = await page.evaluate(async () => { const a = window.__hubApi.api('onvio'), d = a.difs().find(x => x.empId === 'e-orion'); return [await a.aplicar(d.empId, d.chave), await a.ignorar(d.empId, d.chave), await a.ligar('qualquer', 'e-orion'), await a.criarEmpresa(a.semVinculo()[0].k)]; });
    assert.deepEqual(recusa.map(r => r.ok), [false, false, false, false]);
    assert.match(recusa[0].erro, /carteira/); assert.match(recusa[2].erro, /coordenação/); assert.match(recusa[3].erro, /coordenação/);
    assert.equal(await page.evaluate(() => window.__db.ler('dp_empresas/e-orion').funcionarios.find(f => f.nome === 'Beltrano Silva').rescisao), '', 'a rescisão do ORION não foi aplicada');
    assert.equal(await page.evaluate(() => window.__db.listar('dp_empresas').filter(e => !/controltax|dynexa/i.test(e.nome)).length), 4, 'nenhuma empresa foi cadastrada (as 2 do escritório só ficam escondidas)');
    await page.evaluate(() => { delete window.__auth; });
  });

  await passo('Entrada de dados em lote: filtra por ação e tipo, marca só os complementos, uma confirmação (cancelar não grava) e o resultado de cada uma', async () => {
    await fr.locator('[data-cad-acao="complementar"]').click();
    assert.equal(await fr.locator('#cadro tr[data-emp]').count(), 1, 'só a rescisão do Beltrano ainda é complemento');
    await fr.locator('[data-cad-acao=""]').click();
    await fr.locator('[data-cad-tipo="afastamento"]').click();
    assert.equal(await fr.locator('#cadro tr[data-emp]').count(), 1);
    await fr.locator('[data-cad-tipo=""]').click();
    assert.equal(await fr.locator('#cadro tr[data-emp]').count(), 4);
    // marca as três do ORION pelo cabeçalho da empresa: complementar + corrigir + corrigir
    await fr.locator('[data-sel-emp="e-orion"]').check();
    assert.match(await fr.locator('#cSelBar').textContent(), /3 selecionadas/);
    assert.equal(await fr.locator('#cAplicarSel').textContent(), 'Aplicar 3', 'verbos misturados: Aplicar');
    const g0 = await page.evaluate(() => window.__gravacoes.length);
    await fr.locator('#cAplicarSel').click();
    await fr.locator('#dlgLote[open]').waitFor();
    assert.match(await fr.locator('#loteTit').textContent(), /Aplicar 3 diferenças/);
    assert.equal(await fr.locator('#loteLista li').count(), 3);
    assert.match(await fr.locator('#loteResumo').textContent(), /Complementar 1/); assert.match(await fr.locator('#loteResumo').textContent(), /Corrigir 2/);
    if (CAP) { await page.waitForTimeout(300); await page.screenshot({ path: path.join(CAP, 'entrada-dados-lote-claro.png') }); }
    await fr.locator('#loteNao').click();
    assert.equal(await page.evaluate(() => window.__gravacoes.length), g0, 'cancelar o lote não grava nada');
    await fr.locator('#cAplicarSel').click();
    await fr.locator('#dlgLote[open]').waitFor();
    await fr.locator('#loteSim').click();
    await page.waitForFunction(() => /3 feitas/.test(document.querySelector('#fontes-frame').contentDocument.querySelector('#loteCont').textContent), null, { timeout: 8000 });
    const e = await page.evaluate(() => window.__db.ler('dp_empresas/e-orion'));
    const bel = e.funcionarios.find(f => f.nome === 'Beltrano Silva');
    assert.equal(bel.rescisao, D.dia(-3)); assert.equal(bel.admissao, '2022-02-01', 'corrigida pelo Onvio');
    assert.equal(e.funcionarios.find(f => f.nome === 'Maria Souza').status, 'Afastado');
    assert.equal(e.historico.filter(h => /Entrada de dados/.test(h.alteracao)).length, 5, 'código, férias e as três do lote no histórico');
    assert.equal(await fr.locator('#loteLista li.ok').count(), 3);
    if (CAP) { await page.waitForTimeout(300); await page.screenshot({ path: path.join(CAP, 'entrada-dados-lote-feito-claro.png') }); }
    await fr.locator('#loteNao').click();
    await page.waitForFunction(() => document.querySelector('#fontes-frame').contentDocument.querySelectorAll('#cadro tr[data-emp]').length === 1);
  });

  await passo('Entrada de dados: abas O que chegou (conjuntos por categoria) e Conexão (pareamento), lembrando a escolha', async () => {
    await fr.locator('[data-aba-btn="recebido"]').click();
    await fr.locator('#dados details.grupo-d').first().waitFor();
    assert.ok(await fr.locator('#dados details.grupo-d').count() >= 4, 'listas, pessoais, clientes e escritório');
    assert.equal(await fr.locator('#cadro').isVisible(), false);
    if (CAP) { await page.waitForTimeout(300); await page.screenshot({ path: path.join(CAP, 'entrada-dados-recebido-claro.png') }); }
    await fr.locator('[data-aba-btn="conexao"]').click();
    assert.equal(await fr.locator('#codigo').isVisible(), true);
    assert.equal(await fr.locator('[data-aba="conexao"]').evaluate(() => localStorage.getItem('controlhub-fontes-aba')), 'conexao');
    await fr.locator('[data-aba-btn="decidir"]').click();
    assert.equal(await fr.locator('#cadro').isVisible(), true);
  });

  await passo('Entrada de dados: cadastrar o funcionário que só existe no Onvio; cadastrar o cliente do portal como empresa nova (em lote) e ligar o outro a uma empresa existente', async () => {
    await aplicarNoQuadro('Está na lista de empregados do Onvio', '[data-cad-aplicar]');
    assert.match(await fr.locator('#confTxt').textContent(), /Cadastrar no DP como novo\?/);
    await fr.locator('#confSim').click();
    await page.waitForFunction(() => ((window.__db.ler('dp_empresas/e-vega') || {}).funcionarios || []).length === 1, null, { timeout: 5000 });
    const novo = await page.evaluate(() => window.__db.ler('dp_empresas/e-vega').funcionarios[0]);
    assert.equal(novo.nome, 'Novo Funcionario'); assert.equal(novo.admissao, D.dia(3)); assert.equal(novo.status, 'Ativo'); assert.match(novo.obs, /Onvio/);
    assert.ok(novo.id && novo.id.length > 5);
    assert.match((await page.evaluate(() => window.__db.ler('dp_empresas/e-vega'))).historico[0].alteracao, /^Cadastrado a partir do Onvio/);
    // OMEGA não existe no DP: cadastrar como empresa nova, em lote
    await fr.locator('tr[data-k]:has-text("OMEGA") [data-sel-v]').check();
    assert.equal(await fr.locator('#vCriarSel').textContent(), 'Cadastrar 1 como novas');
    await fr.locator('#vCriarSel').click();
    await fr.locator('#dlgLote[open]').waitFor();
    assert.match(await fr.locator('#loteTit').textContent(), /Cadastrar 1 empresa nova/);
    await fr.locator('#loteSim').click();
    await page.waitForFunction(() => /1 feita/.test(document.querySelector('#fontes-frame').contentDocument.querySelector('#loteCont').textContent), null, { timeout: 8000 });
    const omega = await page.evaluate(() => window.__db.listar('dp_empresas').find(e => /OMEGA/.test(e.nome)));
    assert.ok(omega, 'a empresa foi cadastrada'); assert.equal(omega.cnpj, '55.666.777/0001-05'); assert.equal(omega.uf, 'RJ'); assert.equal(omega.situacao, 'Ativa');
    assert.match(omega.observacoes, /Cadastrada a partir do Onvio/); assert.match(omega.observacoes, /Código do cliente no Onvio: 904/); assert.match(omega.observacoes, /Inscrição municipal: 888/);
    assert.match(omega.historico[0].alteracao, /^Empresa cadastrada a partir do Onvio/);
    assert.equal(await page.evaluate((id) => (window.__hubApi.api('onvio').solicitacoes().porEmp.get(id) || []).length, omega.id), 1, 'a solicitação 709 já é da empresa nova (pelo CNPJ)');
    await fr.locator('#loteNao').click();
    // ZETA: ligar a uma empresa que já existe com outro nome
    await fr.locator('tr[data-k] [data-cad-emp]').focus();                       // a lista completa de empresas só entra quando a pessoa abre o seletor
    await fr.locator('tr[data-k] [data-cad-emp]').selectOption('e-zeta');
    await fr.locator('tr[data-k] [data-cad-ligar]').click();
    await fr.locator('#dlgConf[open]').waitFor();
    assert.match(await fr.locator('#confTxt').textContent(), /ZETA TRANSPORTES \| 0001-03[\s\S]*TRANSPORTES ZETA \| 0001-99/);
    await fr.locator('#confSim').click();
    await page.waitForFunction(() => { const c = window.__db.ler('dp_config/onvio'); return c && Object.values(c.vinc || {}).includes('e-zeta'); }, null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => (window.__hubApi.api('onvio').solicitacoes().porEmp.get('e-zeta') || []).length), 1, 'a solicitação 706 agora é da empresa');
    assert.match(await fr.locator('#vincro').textContent(), /Todos os clientes do Onvio estão ligados/);
    // e a empresa ligada ganha sugestões: o CNPJ do Onvio é outro (corrigir) e a UF falta (complementar)
    await fr.locator('#cadro tr.grp:has-text("TRANSPORTES ZETA")').first().waitFor();
    assert.match(await fr.locator('#cadro').textContent(), /CNPJ ou CPF diferente/); assert.match(await fr.locator('#cadro').textContent(), /Cidade \/ UF vazio/);
    if (CAP) { await fr.locator('#secCadastro h2').evaluate(e => e.scrollIntoView({ block: 'start' })); await page.waitForTimeout(500); await page.screenshot({ path: path.join(CAP, 'entrada-dados-depois-claro.png') }); }
    if (CAP) {
      await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); document.querySelector('#fontes-frame').contentDocument.documentElement.setAttribute('data-theme', 'dark'); });
      await page.waitForTimeout(400); await page.screenshot({ path: path.join(CAP, 'entrada-dados-depois-escuro.png') });
      await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'light'); });
    }
  });

  // chegada de um conjunto novo (como o envio da extensão: partes e depois o manifesto, num ciclo novo)
  const semearConjunto = async (tipo, c, ciclo) => {
    const partes = D.OC.partirTabela(c.linhas, 900);
    for (let i = 0; i < partes.length; i++) await page.evaluate(([p, d]) => window.__db.semear(p, d), [`ing_partes/onvio~${tipo}~b${i}`, { ciclo, parte: i, tabela: partes[i] }]);
    await page.evaluate(([p, d]) => window.__db.semear(p, d), [`ing_dados/onvio~${tipo}`, { fonte: 'onvio', tipoDado: tipo, categoria: c.categoria, titulo: tipo, colunas: c.colunas, nLinhas: c.linhas.length, totalNaOrigem: c.linhas.length, cortado: false, partes: partes.length, slot: 'b', ciclo, recebidoEm: Date.now(), extraidoEm: new Date().toISOString(), usuario: 'Ana Teste', por: 'u-teste', versaoExt: '0.53.0' }]);
  };
  const difsOnvio = () => page.evaluate(() => window.__hubApi.api('onvio').difs().map(d => ({ emp: d.empNome, nome: d.nome, acao: d.acao, tipo: d.tipo, txt: d.txt, confirmar: d.confirmar })));

  await passo('Ponte: o Hub só prova ser o Hub com o código de pareamento (HMAC do desafio); o recebimento reserva o conjunto e recusa o segundo emissor', async () => {
    const cfg = await page.evaluate(() => window.__db.ler('ing_config/cfg')); assert.ok(cfg && cfg.token, 'o Hub gerou o código');
    await page.evaluate(() => { window.__msgs = []; window.addEventListener('message', (e) => { if (e.data && e.data.ctlhub === 1 && e.data.de === 'hub') window.__msgs.push(e.data); }); });
    await page.evaluate(() => window.postMessage({ ctlhub: 1, de: 'ponte', tipo: 'busca', nonce: 'desafio-123' }, '*'));
    await page.waitForFunction(() => window.__msgs.some(m => m.tipo === 'ola' && m.nonce === 'desafio-123'), null, { timeout: 5000 });
    const ola = await page.evaluate(() => window.__msgs.find(m => m.tipo === 'ola' && m.nonce === 'desafio-123'));
    const esperado = require('node:crypto').createHmac('sha256', cfg.token).update('desafio-123').digest('hex');
    assert.equal(ola.prova, esperado, 'prova = HMAC-SHA256(token, nonce)');
    assert.ok(!JSON.stringify(ola).includes(cfg.token), 'o token nunca vai na mensagem');
    await page.evaluate(() => { window.__msgs.length = 0; window.postMessage({ ctlhub: 1, de: 'ponte', tipo: 'busca' }, '*'); });
    await page.waitForFunction(() => window.__msgs.some(m => m.tipo === 'ola'), null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => window.__msgs.find(m => m.tipo === 'ola').prova), undefined, 'sem desafio, sem prova');
    // dois emissores no mesmo conjunto: o segundo espera
    const lote = (id, ciclo, parte) => ({ ctlhub: 1, de: 'ext', tipo: 'lote', id, token: cfg.token, fonte: 'onvio', tipoDado: 'noticias-artigos', categoria: 'noticias', titulo: 't', colunas: ['Id'], tabela: 'x' + parte, nLinhas: 1, nLinhasTotal: 2, totalNaOrigem: 2, cortado: false, partes: 2, parte, ciclo, porTipo: {}, versaoExt: '0.54.0' });
    const envia = async (l) => { await page.evaluate((l) => { window.__msgs.length = 0; window.postMessage(l, '*'); }, l); await page.waitForFunction((id) => window.__msgs.some(m => m.tipo === 'ack' && m.id === id), l.id, { timeout: 5000 }); return page.evaluate((id) => window.__msgs.find(m => m.tipo === 'ack' && m.id === id), l.id); };
    assert.equal((await envia(lote('a0', 'cA', 0))).ok, true);
    const b = await envia(lote('b0', 'cB', 0)); assert.equal(b.ok, false); assert.equal(b.motivo, 'ocupado');
    assert.equal((await envia(lote('a1', 'cA', 1))).ok, true);
    const man = await page.evaluate(() => window.__db.ler('ing_dados/onvio~noticias-artigos')); assert.equal(man.ciclo, 'cA'); assert.equal(man.partes, 2);
    assert.equal(await page.evaluate(() => window.__db.existe('ing_reservas/onvio~noticias-artigos')), false, 'reserva liberada ao publicar');
    assert.equal((await envia(lote('b0b', 'cB', 0))).ok, true, 'liberado, o segundo pode enviar');
    const errado = lote('c0', 'cC', 0); errado.token = 'OUTRO'; assert.equal((await envia(errado)).motivo, 'token');
    // toda categoria que a extensão envia (OC.HUB_CATEGORIAS) tem de ser aceita pelo recebimento real do Hub
    for (const c of D.OC.HUB_CATEGORIAS) {
      const l = { ...lote('cat-' + c.id, 'cK', 0), tipoDado: (c.id === 'analise' ? 'analise-solicitacoes' : 'categoria-' + c.id), categoria: c.id, partes: 1, nLinhasTotal: 1, totalNaOrigem: 1 };
      const r = await envia(l); assert.equal(r.ok, true, 'categoria ' + c.id + ' aceita (' + (r.motivo || '') + ')');
    }
  });

  await passo('Folha inteira de cada empresa: quem nunca teve solicitação vira cadastro novo; desligado sem solicitação não; cliente só da folha aparece para cadastrar', async () => {
    await page.evaluate(() => { const d = window.__db.ler('dp_empresas/e-vega'); d.funcionarios.push({ id: 'f-antiga', nome: 'Antiga Colega', cargo: '', codigo: '', admissao: '2020-02-02', status: 'Ativo', aquisitivo: '', feriasInicio: '', feriasFim: '', rescisao: '', salario: '', obs: '' }); window.__db.semear('dp_empresas/e-vega', d); });
    await semearConjunto('pessoais-empregados', await D.empregados(), 'c2');
    await page.waitForFunction(() => window.__hubApi.api('onvio').difs().some(d => d.nome === 'Carlos Sem Pedido'), null, { timeout: 8000 });
    const d = await difsOnvio();
    const de = (n) => d.filter(x => x.nome === n);
    assert.equal(de('Carlos Sem Pedido').length, 1); assert.equal(de('Carlos Sem Pedido')[0].acao, 'novo'); assert.match(de('Carlos Sem Pedido')[0].txt, /Está na lista de empregados do Onvio/);
    assert.equal(de('Lira Funcionaria')[0].acao, 'novo'); assert.equal(de('Lira Funcionaria')[0].emp, 'LIRA PADARIA | 0001-04');
    // regra absoluta: quem está na lista do Onvio é ativo (e entra como cadastro novo, sem "conferir antes")
    assert.equal(de('Carlos Sem Pedido')[0].confirmar, false); assert.equal(de('Lira Funcionaria')[0].confirmar, false);
    assert.equal(de('Dona Antiga').length, 0, 'desligado que nunca teve solicitação não entra');
    assert.equal(de('Antiga Colega')[0].acao, 'corrigir'); assert.match(de('Antiga Colega')[0].txt, /Desligado na folha/);
    const sem = await page.evaluate(() => window.__hubApi.api('onvio').semVinculo().map(g => ({ cli: g.cli, n: g.n, nEmp: g.nEmp })));
    const nova = sem.find(g => /NOVA CLIENTE/.test(g.cli));
    assert.ok(nova, 'cliente que só existe na folha'); assert.equal(nova.n, 0); assert.equal(nova.nEmp, 2);
    await fr.locator('#vincro tr[data-k]:has-text("NOVA CLIENTE |")').waitFor({ timeout: 8000 });
    assert.match(await fr.locator('#vincro').textContent(), /NOVA CLIENTE \| sem CNPJ/); assert.match(await fr.locator('#vincro').textContent(), /2 empregados ativos/);
    assert.equal(await fr.locator('#autoBox .auto-bloco').count(), 1);
    assert.equal(await fr.locator('#autoLigar').isChecked(), false, 'vem desligado');
    if (CAP) { await fr.locator('#secCadastro h2').evaluate(e => e.scrollIntoView({ block: 'start' })); await page.waitForTimeout(400); await page.screenshot({ path: path.join(CAP, 'entrada-dados-auto-desligado-claro.png') }); }
  });

  await passo('Regras de diferença: contribuinte autônomo não vira funcionário; as férias comparadas são as em curso (não uma de 2027); "Desligado" converge; cobertura da folha à vista', async () => {
    const it = D.itens(), base = (id, n, cli, extra) => Object.assign({ id, identifier: n, genericStatus: 1, created: D.dia(-3) + 'T10:00:00', changed: D.dia(-1) + 'T10:00:00', lastUpdated: D.dia(-1) + 'T10:00:00', requestWay: 'PORTAL', clientExpanded: cli, staffResponsibleExpanded: { id: 'u-ana', name: 'Ana Teste' }, departmentId: 'dep-1', requesterExpanded: { name: 'Contato' } }, extra);
    it.cadContribuinte = [base('cc1', 720, D.CLI.lira, { admissionDate: D.dia(5), name: 'Autonomo Teste', clientEmployeeExpanded: undefined, subject: 'Contribuinte' })];
    it.avisoFerias.push(
      base('fe1', 721, D.CLI.lira, { vacationStartDate: D.dia(-2), vacationDays: 20, clientEmployeeExpanded: D.emp('Erica Teste', '26', '2024-06-06'), subject: 'Férias em curso' }),
      base('fe2', 722, D.CLI.lira, { vacationStartDate: '2027-03-01', vacationDays: 20, clientEmployeeExpanded: D.emp('Erica Teste', '26', '2024-06-06'), subject: 'Férias de 2027' }),
      base('fe3', 724, D.CLI.lira, { vacationStartDate: D.dia(15), vacationDays: 20, clientEmployeeExpanded: D.emp('Saiu Da Lista', '410', '2022-01-10'), subject: 'Férias de quem já saiu' }));
    it.calcRescisao.push(base('rx1', 725, D.CLI.lira, { resignationDate: D.dia(-20), terminationReasonId: 'm1', terminationType: 'WORKED', clientEmployeeExpanded: D.emp('Rescindida Fora', '411', '2021-01-10'), subject: 'Rescisão que já saiu da lista' }));
    for (const k of ['cadContribuinte', 'avisoFerias', 'calcRescisao']) {
      const t = D.OC.TYPE_BY_KEY[k], slug = D.OC.slugHub(k);
      await semearConjunto('lista-' + slug, { categoria: 'listas', ...D.OC.tabelaLista(t, it[k]) }, 'cF');
      await semearConjunto('pessoais-' + slug, { categoria: 'pessoais', ...D.OC.tabelaPessoais(t, it[k]) }, 'cF');
    }
    await page.waitForFunction(() => window.__hubApi.api('onvio').difs().some(d => d.nome === 'Erica Teste' && d.tipo === 'ferias'), null, { timeout: 10000 });
    const d = await page.evaluate(() => window.__hubApi.api('onvio').difs().map(x => ({ nome: x.nome, tipo: x.tipo, depois: x.depois })));
    assert.ok(!d.some(x => x.nome === 'Autonomo Teste'), 'contribuinte (autônomo) não é funcionário');
    // o Onvio retira da lista quem o Domínio desligou (conferido em 27/10): com a lista da empresa presente, quem só aparece nas solicitações NÃO vira cadastro novo
    const sai = await page.evaluate(() => window.__hubApi.api('onvio').difs().filter(x => x.nome === 'Saiu Da Lista').map(x => ({ acao: x.acao, confirmar: x.confirmar, txt: x.txt })));
    assert.equal(sai.length, 0, 'aparece só nas solicitações e não está na lista: desconsiderado');
    assert.ok(!d.some(x => x.nome === 'Rescindida Fora'), 'com rescisão e fora da lista: desligado, nada a cadastrar');
    // recontratação: a mesma pessoa com dois registros na lista (um antigo, depois um novo): vale a admissão mais recente, qualquer que seja a ordem das linhas
    const tdup = await D.empregados();
    tdup.linhas.push(['c-lira', '903', 'LIRA PADARIA LTDA', 'l9', 'Diego Teste', '0', '2018-01-01', 'ACTIVE', 'F', 'A1', '220', '9', 'EMPLOYEE'].join('\t'));
    await semearConjunto('pessoais-empregados', tdup, 'cH');
    await page.waitForTimeout(1500);
    assert.ok(!(await page.evaluate(() => window.__hubApi.api('onvio').difs().some(x => x.nome === 'Diego Teste' && x.tipo === 'admissao' && /2018/.test(x.depois)))), 'o registro antigo da recontratação não vira correção');
    // quem está ativo no DP e sumiu da lista do Onvio (empresa com lista): sugestão de "Desligado" a conferir, nunca automática; cadastro de menos de uma semana ainda pode não ter chegado
    await page.evaluate(() => { const e = window.__db.ler('dp_empresas/e-lira'); const f = (id, nome, adm) => ({ id, nome, cargo: '', codigo: '', admissao: adm, status: 'Ativo', aquisitivo: '', feriasInicio: '', feriasFim: '', rescisao: '', salario: '', obs: 'Criado a partir do Onvio' });
      e.funcionarios.push(f('f-ex', 'Ex Colega Sumido', '2020-03-03'), f('f-rec', 'Recem Cadastrado', new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10))); window.__db.semear('dp_empresas/e-lira', e); });
    await page.waitForFunction(() => window.__hubApi.api('onvio').difs().some(x => x.nome === 'Ex Colega Sumido'), null, { timeout: 10000 });
    const sumido = await page.evaluate(() => window.__hubApi.api('onvio').difs().filter(x => /Sumido|Recem Cadastrado|Lira Funcionaria/.test(x.nome)).map(x => ({ nome: x.nome, tipo: x.tipo, acao: x.acao, confirmar: x.confirmar, depois: x.depois, txt: x.txt })));
    const ex = sumido.filter(x => x.nome === 'Ex Colega Sumido'); assert.equal(ex.length, 1); assert.equal(ex[0].tipo, 'situacao'); assert.equal(ex[0].depois, 'Desligado'); assert.equal(ex[0].confirmar, false, 'sumiu da lista: desligado, sem conferir antes'); assert.match(ex[0].txt, /Não consta na lista de empregados do Onvio/);
    assert.ok(!sumido.some(x => x.nome === 'Recem Cadastrado'), 'cadastro de menos de uma semana não é sugerido');
    assert.ok(!sumido.some(x => x.nome === 'Lira Funcionaria' && x.tipo === 'situacao'), 'quem está na lista não é sugerido');
    const fer = d.find(x => x.nome === 'Erica Teste' && x.tipo === 'ferias');
    assert.ok(fer && !/2027/.test(fer.depois), 'as férias em curso, não a de 2027: ' + JSON.stringify(fer));
    // "Desligado" com férias cobrindo hoje: depois de aplicar a diferença some (antes voltava a cada visita)
    await page.evaluate(() => { const e = window.__db.ler('dp_empresas/e-vega'); e.funcionarios.forEach(f => { if (f.nome === 'Antiga Colega') { f.feriasInicio = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10); f.feriasFim = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10); f.status = 'Ativo'; } }); window.__db.semear('dp_empresas/e-vega', e); });
    const ds = await page.evaluate(() => window.__hubApi.api('onvio').difs().find(x => x.nome === 'Antiga Colega' && x.tipo === 'situacao'));
    assert.ok(ds, 'desligado na folha e ativo/de férias no DP: sugestão');
    const rs = await page.evaluate(([e, c]) => window.__hubApi.api('onvio').aplicar(e, c), [ds.empId, ds.chave]);
    assert.equal(rs.ok, true);
    assert.ok(!(await page.evaluate(() => window.__hubApi.api('onvio').difs().some(x => x.nome === 'Antiga Colega' && x.tipo === 'situacao'))), 'convergiu');
    // cobertura da folha: quantos clientes têm empregados e quantos ativos
    const cob = await page.evaluate(() => window.__hubApi.api('onvio').cobertura());
    assert.equal(cob.empregados, 12); assert.equal(cob.ativos, 10); assert.equal(cob.clientesComEmpregados, 4);
    await fr.locator('#cadro .cad-aviso.cob').waitFor({ timeout: 8000 });
    assert.match(await fr.locator('#cadro .cad-aviso.cob').textContent(), /10 empregados ativos.*4 de/);
  });

  await passo('Cache por ciclo: reabrir o Hub não baixa de novo as partes (só dos conjuntos sem dados pessoais)', async () => {
    const outra = await ctx.newPage(); await outra.addInitScript(BANCO); await outra.addInitScript(() => { try { localStorage.setItem('controlhub-theme', 'light'); } catch (e) {} });
    await outra.goto(url); await outra.waitForFunction(() => window.__hubApi && window.__db);
    for (const e of D.empresas()) { const { id, ...corpo } = e; await outra.evaluate(([p, d]) => window.__db.semear(p, d), ['dp_empresas/' + id, corpo]); }
    // os mesmos conjuntos, no mesmo ciclo ('c1' = os do início do teste), numa janela nova do mesmo navegador
    for (const d of montarBanco()) await outra.evaluate(([p, x]) => window.__db.semear(p, x), [d.path, d.data]);
    await outra.evaluate(() => window.__hubApi.abrirModulo('dp'));
    await outra.waitForFunction(() => { const a = window.__hubApi.api('onvio'); try { return a.solicitacoes().todas.length > 0; } catch (e) { return false; } }, null, { timeout: 10000 });
    await outra.waitForTimeout(800);
    const gets = await outra.evaluate(() => (window.__gets || []).filter(p => /^ing_partes\//.test(p)));
    const baixadas = gets.filter(p => !/lista-aviso-ferias|lista-cad-contribuinte|lista-calc-rescisao/.test(p) && /~lista-|~clientes-|~escritorio-/.test(p));
    assert.deepEqual(baixadas, [], 'listas, clientes e escritório vieram do cache');
    assert.ok(gets.some(p => /~pessoais-/.test(p)), 'dados pessoais nunca ficam no cache do navegador');
    await outra.close();
  });

  await passo('Escrita segura: o Hub relê a empresa antes de gravar (não perde o que outro navegador gravou) e recusa documento grande demais', async () => {
    const dif = () => page.evaluate(() => window.__hubApi.api('onvio').difs().find(d => d.empId === 'e-lira' && d.acao !== 'novo' && d.pode));
    // um funcionário gravado "por fora" que o desenho local ainda não conhece
    await page.evaluate(() => { const d = window.__db.ler('dp_empresas/e-lira'); d.funcionarios.push({ id: 'f-concorrente', nome: 'Concorrente Silencioso', cargo: '', codigo: '', admissao: '2020-01-01', status: 'Ativo', aquisitivo: '', feriasInicio: '', feriasFim: '', rescisao: '', salario: '', obs: '' }); window.__db.silencioso('dp_empresas/e-lira', d); });
    const d1 = await dif(); assert.ok(d1, 'há uma diferença da LIRA para aplicar');
    const r = await page.evaluate(([e, c]) => window.__hubApi.api('onvio').aplicar(e, c), [d1.empId, d1.chave]);
    assert.equal(r.ok, true, JSON.stringify(r));
    const lira = await page.evaluate(() => window.__db.ler('dp_empresas/e-lira'));
    assert.ok(lira.funcionarios.some(f => f.nome === 'Concorrente Silencioso'), 'o funcionário gravado por fora continua lá');
    assert.ok(lira.historico.some(h => /a partir do Onvio/.test(h.alteracao)));
    // documento grande: não grava e não muda o que está na tela
    await page.evaluate(() => { const d = window.__db.ler('dp_empresas/e-lira'); d.observacoes = 'x'.repeat(245000); window.__db.silencioso('dp_empresas/e-lira', d); });
    const d2 = await dif(); assert.ok(d2, 'ainda há diferença da LIRA');
    const antes = await page.evaluate(() => window.__db.ler('dp_empresas/e-lira').historico.length);
    const rl = await page.evaluate(([e, c]) => window.__hubApi.api('onvio').aplicar(e, c), [d2.empId, d2.chave]);
    assert.equal(rl.ok, false); assert.match(rl.erro, /grande demais/);
    assert.equal(await page.evaluate(() => window.__db.ler('dp_empresas/e-lira').historico.length), antes, 'nada foi gravado');
    await page.evaluate(() => { const d = window.__db.ler('dp_empresas/e-lira'); d.observacoes = ''; d.funcionarios = d.funcionarios.filter(f => f.id !== 'f-concorrente'); window.__db.semear('dp_empresas/e-lira', d); });
  });

  await passo('Permissões: o código de pareamento só aparece para quem edita o Hub; dados pessoais do Onvio só para coordenação e analista do DP', async () => {
    const outra = await ctx.newPage(); await outra.addInitScript(BANCO); await outra.addInitScript(() => { window.__canEdit = false; try { localStorage.setItem('controlhub-theme', 'light'); } catch (e) {} });
    await outra.goto(url); await outra.waitForFunction(() => window.__hubApi && window.__db);
    await outra.evaluate(() => window.__db.semear('ing_config/cfg', { token: 'SEGREDO1234567890ABCDEF', criadoEm: Date.now() }));
    await outra.evaluate(() => window.__hubApi.abrirModulo('fontes'));
    await outra.waitForFunction(() => { const f = document.querySelector('#fontes-frame'); return f && f.contentDocument && f.contentDocument.querySelector('#codigo') && f.contentDocument.querySelector('#codigo').textContent !== '…'; }, null, { timeout: 8000 });
    assert.equal(await outra.evaluate(() => document.querySelector('#fontes-frame').contentDocument.querySelector('#codigo').textContent), 'peça a quem edita o Hub', 'sem o código para quem não edita');
    await outra.close();
    // com acesso de consulta, o Hub não lê os conjuntos pessoais do Onvio
    const antes = await page.evaluate(() => window.__hubApi.api('onvio').ler('pessoais-aviso-ferias').length);
    assert.ok(antes > 0, 'a coordenação lê');
    await page.evaluate(() => { window.__auth = { nivel: () => 'consulta', analista: () => '', podeVer: () => true, ehAdmin: () => false, usuario: () => ({ nome: 'Carla', id: 'u-carla', prefs: {} }) }; });
    assert.equal(await page.evaluate(() => window.__hubApi.api('onvio').ler('pessoais-aviso-ferias').length), 0, 'consulta não lê dados pessoais');
    assert.equal(await page.evaluate(() => window.__hubApi.api('onvio').ler('lista-aviso-ferias').length > 0), true, 'as listas sem dados pessoais continuam');
    await page.evaluate(() => { delete window.__auth; });
  });

  await passo('Aplicação automática: liga com confirmação, aplica sozinho sem perguntar, registra "automaticamente" no histórico e só cadastra empresas se for escolhido', async () => {
    const antes = await page.evaluate(() => window.__db.listar('dp_empresas').length);
    await page.evaluate(() => window.__hubApi.api('onvio').garantir());                    // depois do passo da consulta, relê os conjuntos (sem isso o interruptor espera o próximo ciclo da tela)
    await fr.locator('#autoLigar:not([disabled])').waitFor({ timeout: 20000 });          // o interruptor só habilita depois que todos os conjuntos carregam
    await fr.locator('#autoLigar').check();
    await fr.locator('#dlgConf[open]').waitFor();
    assert.match(await fr.locator('#confTxt').textContent(), /sem pedir confirmação/); assert.match(await fr.locator('#confTxt').textContent(), /Pendente agora: \d+ complemento/);
    await fr.locator('#confSim').click();
    // dois empregados do Onvio com datas trocadas em relação ao DP e um código repetido: cada um é corrigido no seu próprio funcionário e fica assim
    await page.waitForFunction(() => { const l = window.__db.ler('dp_empresas/e-lira').funcionarios, g = (n) => l.find(f => f.nome === n); return g('Erica Teste').admissao === '2025-02-03' && g('Diego Teste').admissao === '2024-06-06'; }, null, { timeout: 15000 });
    await page.waitForTimeout(3500);
    const lira = await page.evaluate(() => window.__db.ler('dp_empresas/e-lira'));
    assert.equal(lira.funcionarios.find(f => f.nome === 'Erica Teste').admissao, '2025-02-03'); assert.equal(lira.funcionarios.find(f => f.nome === 'Diego Teste').admissao, '2024-06-06');
    assert.equal(lira.funcionarios.filter(f => /Teste/.test(f.nome)).length, 2, 'ninguém duplicado');
    assert.equal(lira.funcionarios.find(f => f.nome === 'Ex Colega Sumido').status, 'Desligado', 'regra absoluta: quem sumiu da lista do Onvio não é mais ativo, e o automático aplica');
    assert.equal(lira.historico.filter(h => /Admissão diferente/.test(h.alteracao) && /Teste/.test(h.alteracao)).length, 2, 'uma correção de admissão para cada um, sem vaivém');
    assert.ok(lira.historico.some(h => /automaticamente a partir do Onvio/.test(h.alteracao) && /Teste/.test(h.alteracao)), 'o automático registra "automaticamente"');
    // regra absoluta: quem está na lista de empregados do Onvio é ativo, então o automático cadastra
    await page.waitForFunction(() => window.__db.ler('dp_empresas/e-orion').funcionarios.some(f => f.nome === 'Carlos Sem Pedido') && window.__db.ler('dp_empresas/e-lira').funcionarios.some(f => f.nome === 'Lira Funcionaria'), null, { timeout: 15000 });
    const orion = await page.evaluate(() => window.__db.ler('dp_empresas/e-orion'));
    assert.ok(orion.historico.some(h => /automaticamente a partir do Onvio/.test(h.alteracao) && /Carlos Sem Pedido/.test(h.alteracao)));
    const carlos = orion.funcionarios.find(f => f.nome === 'Carlos Sem Pedido'); assert.equal(carlos.admissao, '2021-06-01'); assert.equal(carlos.codigo, '105'); assert.equal(carlos.status, 'Ativo');
    assert.ok(!orion.funcionarios.some(f => f.nome === 'Dona Antiga'));
    await page.waitForFunction(() => window.__db.ler('dp_empresas/e-vega').funcionarios.find(f => f.nome === 'Antiga Colega').status === 'Desligado', null, { timeout: 8000 });
    assert.equal(await page.evaluate(() => window.__db.listar('dp_empresas').length), antes, 'sem a opção de empresas novas, nenhuma empresa é cadastrada');
    const c = await page.evaluate(() => window.__db.ler('dp_config/onvio')); assert.equal(c.auto.ligada, true); assert.ok(c.auto.ultima && c.auto.ultima.n >= 3, 'última aplicação guardada');
    await page.waitForFunction(() => window.__hubApi.api('onvio').difs().length === 0 || window.__hubApi.api('onvio').difs().every(d => d.acao === 'x'), null, { timeout: 8000 }).catch(() => {});
    const resto = await difsOnvio(); assert.deepEqual(resto.filter(d => (d.acao === 'novo' || d.acao === 'complementar') && !d.confirmar), [], 'nada de novo ou complemento pendente: ' + JSON.stringify(resto));
    await fr.locator('#autoBox').getByText('Última aplicação automática').waitFor({ timeout: 8000 });                // a tela espera os dados assentarem antes de redesenhar
    assert.match(await fr.locator('#autoBox').textContent(), /Última aplicação automática/);
    if (CAP) { await fr.locator('#secCadastro h2').evaluate(e => e.scrollIntoView({ block: 'start' })); await page.waitForTimeout(500); await page.screenshot({ path: path.join(CAP, 'entrada-dados-auto-ligado-claro.png') }); }
    // empresas novas: só depois de escolher a opção (com confirmação)
    await fr.locator('[data-auto-tipo="empresa"]').check();
    await fr.locator('#dlgConf[open]').waitFor();
    assert.match(await fr.locator('#confTxt').textContent(), /Cadastrar empresas novas automaticamente/);
    await fr.locator('#confSim').click();
    // sem CNPJ completo no Onvio o automático não cadastra a empresa (decisão manual); depois do cadastro manual, os funcionários entram sozinhos
    await page.waitForTimeout(4000);
    assert.ok(!(await page.evaluate(() => window.__db.listar('dp_empresas').some(e => /NOVA CLIENTE/.test(e.nome)))), 'cliente sem CNPJ: o automático não cria a empresa');
    const k = await page.evaluate(() => window.__hubApi.api('onvio').semVinculo().find(g => /NOVA CLIENTE/.test(g.cli)).k);
    assert.equal((await page.evaluate((k) => window.__hubApi.api('onvio').criarEmpresa(k), k)).ok, true);
    await page.waitForFunction(() => window.__db.listar('dp_empresas').some(e => /NOVA CLIENTE/.test(e.nome)), null, { timeout: 15000 });
    const nova = await page.evaluate(() => window.__db.listar('dp_empresas').find(e => /NOVA CLIENTE/.test(e.nome)));
    await page.waitForFunction((id) => (window.__db.ler('dp_empresas/' + id).funcionarios || []).length === 2, nova.id, { timeout: 15000 });
    assert.deepEqual((await page.evaluate((id) => window.__db.ler('dp_empresas/' + id).funcionarios.map(f => f.nome).sort(), nova.id)), ['Nova Dois', 'Nova Um']);
    assert.equal(await page.evaluate(() => window.__db.listar('dp_empresas').filter(e => /NOVA CLIENTE/.test(e.nome)).length), 1, 'só uma empresa, sem duplicar');
  });

  // quem já está no cadastro do DP e muda no Onvio (aqui, o código Domínio) é o que o automático aplica; quem só consta na lista do Onvio fica para conferir
  const trocaCodigo = (t, nome, cod) => ({ ...t, linhas: t.linhas.map(l => { const c = l.split('\t'); if (c[4] === nome) c[11] = cod; return c.join('\t'); }) });

  await passo('Aplicação automática: desligar para; o que foi ignorado continua ignorado; "Aplicar agora" sem nada pendente não muda nada', async () => {
    await fr.locator('#autoLigar').uncheck();
    await page.waitForFunction(() => window.__db.ler('dp_config/onvio').auto.ligada === false, null, { timeout: 5000 });
    // o código de uma funcionária muda no Onvio: desligado, nada acontece
    await semearConjunto('pessoais-empregados', trocaCodigo(await D.empregados(), 'Carlos Sem Pedido', '111'), 'c3');
    await page.waitForFunction(() => window.__hubApi.api('onvio').difs().some(d => d.nome === 'Carlos Sem Pedido' && d.tipo === 'codigo'), null, { timeout: 8000 });
    await page.waitForTimeout(3500);
    assert.equal(await page.evaluate(() => window.__db.ler('dp_empresas/e-orion').funcionarios.find(f => f.nome === 'Carlos Sem Pedido').codigo), '105', 'desligado: nada aplicado sozinho');
    // ligar de novo: aplica
    await fr.locator('#autoLigar').check(); await fr.locator('#dlgConf[open]').waitFor(); await fr.locator('#confSim').click();
    await page.waitForFunction(() => window.__db.ler('dp_empresas/e-orion').funcionarios.find(f => f.nome === 'Carlos Sem Pedido').codigo === '111', null, { timeout: 15000 });
    await fr.locator('#autoLigar').uncheck();
    await page.waitForFunction(() => window.__db.ler('dp_config/onvio').auto.ligada === false, null, { timeout: 5000 });
  });

  await passo('Aplicação automática: o analista com o Hub aberto só aplica onde pode (carteira dele) e não cadastra empresas', async () => {
    const t = trocaCodigo(trocaCodigo(await D.empregados(), 'Carlos Sem Pedido', '112'), 'Antiga Colega', '303');
    await page.evaluate(() => { window.__auth = { nivel: () => 'analista', analista: () => 'Bruno Teste', podeVer: () => true, ehAdmin: () => false, usuario: () => ({ nome: 'Bruno', id: 'u-bruno', prefs: {} }) }; });
    // outro executor (a coordenação, em outro navegador) tem o lease: este navegador não aplica nada
    await page.evaluate(() => window.__db.semear('ing_auto/lease', { por: 'u-coordenacao', nivel: 2, ate: Date.now() + 120000 }));
    await page.evaluate(() => { const c = window.__db.ler('dp_config/onvio'); c.auto.ligada = true; c.auto.tipos.empresa = true; window.__db.semear('dp_config/onvio', c); });
    await semearConjunto('pessoais-empregados', t, 'c4');
    await page.waitForFunction(() => window.__hubApi.api('onvio').difs().some(d => d.nome === 'Antiga Colega' && d.tipo === 'codigo'), null, { timeout: 8000 });
    await page.waitForTimeout(4000);
    const cod = (emp, n) => page.evaluate(([e, n]) => window.__db.ler('dp_empresas/' + e).funcionarios.find(f => f.nome === n).codigo, [emp, n]);
    assert.equal(await cod('e-vega', 'Antiga Colega'), '302', 'com outro executor ativo, este navegador espera');
    assert.equal((await page.evaluate(() => window.__hubApi.api('onvio').autoAgora())).motivo, 'outro-executor');
    await page.evaluate(() => window.__db.semear('ing_auto/lease', { por: 'u-coordenacao', nivel: 2, ate: Date.now() - 1000 }));          // o lease venceu
    await page.evaluate(() => window.__hubApi.api('onvio').autoAgora());
    await page.waitForFunction(() => window.__db.ler('dp_empresas/e-vega').funcionarios.find(f => f.nome === 'Antiga Colega').codigo === '303', null, { timeout: 15000 });
    await page.waitForTimeout(3500);
    assert.equal(await cod('e-orion', 'Carlos Sem Pedido'), '111', 'ORION é da Ana: o analista não aplica');
    assert.ok((await page.evaluate(() => window.__db.ler('dp_empresas/e-vega').historico[0].alteracao)).includes('automaticamente'));
    await page.evaluate(() => { delete window.__auth; });
    // de volta como coordenação, com o automático ligado: a pendência da Ana é aplicada
    await page.evaluate(() => window.__hubApi.api('onvio').autoAgora());
    await page.waitForFunction(() => window.__db.ler('dp_empresas/e-orion').funcionarios.find(f => f.nome === 'Carlos Sem Pedido').codigo === '112', null, { timeout: 15000 });
    await page.evaluate(() => { const c = window.__db.ler('dp_config/onvio'); c.auto.ligada = false; window.__db.semear('dp_config/onvio', c); });
  });

  await passo('Aplicação automática: pausa com conjunto cortado ou velho demais (decidir à mão continua possível)', async () => {
    await page.evaluate(() => { const c = window.__db.ler('dp_config/onvio'); c.auto.ligada = true; window.__db.semear('dp_config/onvio', c); });
    await page.evaluate(() => { const m = window.__db.ler('ing_dados/onvio~clientes-nfe'); m.cortado = true; window.__db.semear('ing_dados/onvio~clientes-nfe', m); });
    await page.waitForFunction(() => /cortado/.test(window.__hubApi.api('onvio').auto().bloqueio || ''), null, { timeout: 8000 });
    const r = await page.evaluate(() => window.__hubApi.api('onvio').autoAgora());
    assert.equal(r.motivo, 'incompleto'); assert.match(r.detalhe, /cortado/);
    await page.evaluate(() => { const m = window.__db.ler('ing_dados/onvio~clientes-nfe'); m.cortado = false; m.recebidoEm = Date.now() - 72 * 3600e3; window.__db.semear('ing_dados/onvio~clientes-nfe', m); });
    await page.waitForFunction(() => /48 h/.test(window.__hubApi.api('onvio').auto().bloqueio || ''), null, { timeout: 8000 });
    await page.evaluate(() => { const m = window.__db.ler('ing_dados/onvio~clientes-nfe'); m.recebidoEm = Date.now(); window.__db.semear('ing_dados/onvio~clientes-nfe', m); const c = window.__db.ler('dp_config/onvio'); c.auto.ligada = false; window.__db.semear('dp_config/onvio', c); });
    await page.waitForFunction(() => !window.__hubApi.api('onvio').auto().bloqueio, null, { timeout: 8000 });
  });

  await passo('Empresa do escritório: a equipe ativa do escritório vale como lista de ativos (a lista do Onvio não acompanha desligamentos dela); detectada pela sobreposição de nomes', async () => {
    const t = await D.empregados();
    [['Ana Alfa Silva', 'a1'], ['Bruno Beta Souza', 'a2'], ['Carla Gama Lima', 'a3'], ['Davi Delta Rocha', 'a4'], ['Eva Epsilon Dias', 'a5'], ['Fabio Zeta Melo', 'a6'], ['Gina Eta Costa', 'a7']]
      .forEach(([n, i]) => t.linhas.push(['c-lira', '903', 'LIRA PADARIA LTDA', i, n, '0', '2023-01-01', 'ACTIVE', 'F', 'A1', '220', i.slice(1), 'EMPLOYEE'].join('\t')));
    await semearConjunto('pessoais-empregados', t, 'cE1');
    await page.evaluate(() => { const e = window.__db.ler('dp_empresas/e-lira'); const f = (id, nome) => ({ id, nome, cargo: '', codigo: '', admissao: '2023-01-01', status: 'Ativo', aquisitivo: '', feriasInicio: '', feriasFim: '', rescisao: '', salario: '', obs: 'Criado a partir do Onvio' });
      e.funcionarios.push(f('f-ana', 'Ana Alfa Silva'), f('f-fab', 'Fabio Zeta Melo')); window.__db.semear('dp_empresas/e-lira', e); });
    // sem a equipe do escritório, a regra não existe: quem sumiu da equipe não é tratado como desligado automático
    assert.ok(!(await page.evaluate(() => window.__hubApi.api('onvio').difs().some(x => x.nome === 'Fabio Zeta Melo' && x.tipo === 'situacao'))), 'Fabio está na lista do Onvio: nada sem a equipe');
    // a equipe ativa vem com nomes abreviados (primeiro e último nome)
    const eq = { categoria: 'escritorio', colunas: ['Id', 'Contato (id)', 'Nome'], linhas: ['Ana Silva', 'Bruno Souza', 'Carla Lima', 'Davi Rocha', 'Eva Dias', 'Lira Funcionaria', 'Erica Teste', 'Diego Teste', 'Maria Souza', 'Joao Lima', 'Carlos Sem Pedido'].map((n, i) => ['id' + i, 'c' + i, n].join('\t')) };
    await semearConjunto('escritorio-funcionarios', eq, 'cE1');
    await page.waitForFunction(() => window.__hubApi.api('onvio').difs().some(x => x.nome === 'Fabio Zeta Melo' && x.tipo === 'situacao'), null, { timeout: 10000 });
    const d = await page.evaluate(() => window.__hubApi.api('onvio').difs().map(x => ({ nome: x.nome, tipo: x.tipo, acao: x.acao, confirmar: x.confirmar, depois: x.depois, txt: x.txt })));
    const fab = d.filter(x => x.nome === 'Fabio Zeta Melo' && x.tipo === 'situacao');
    assert.equal(fab.length, 1); assert.equal(fab[0].depois, 'Desligado'); assert.equal(fab[0].confirmar, false, 'a equipe ativa é autoridade: sem "conferir antes"'); assert.match(fab[0].txt, /equipe ativa do escritório/);
    assert.ok(!d.some(x => x.nome === 'Ana Alfa Silva' && x.tipo === 'situacao'), 'quem está na equipe ativa segue ativo');
    assert.ok(!d.some(x => x.nome === 'Gina Eta Costa'), 'só consta na lista do Onvio e não na equipe: nem é cadastro novo');
    // empresa comum (poucos empregados na lista, sem sobreposição): a equipe não vale
    assert.ok(!d.some(x => x.empId === 'e-orion' && /equipe ativa/.test(x.txt || '')), 'outras empresas não são afetadas');
    // equipe incompleta (cortada): a regra some
    await page.evaluate(() => { const m = window.__db.ler('ing_dados/onvio~escritorio-funcionarios'); m.cortado = true; window.__db.semear('ing_dados/onvio~escritorio-funcionarios', m); });
    await page.waitForFunction(() => !window.__hubApi.api('onvio').difs().some(x => x.nome === 'Fabio Zeta Melo' && x.tipo === 'situacao'), null, { timeout: 10000 });
    // volta ao estado anterior
    await semearConjunto('pessoais-empregados', await D.empregados(), 'cE2');
    await semearConjunto('escritorio-funcionarios', { categoria: 'escritorio', colunas: eq.colunas, linhas: [] }, 'cE2');
  });

  await passo('Cartela → Onvio (resumo antigo) continua igual e ganha o CNPJ completo dos clientes de CND/NF-e', async () => {
    const cols = ['Lista', 'Nº', 'Situação', 'Vez', 'Cliente', 'Responsável', 'Aberta em', 'Última movimentação', 'Dias parado', 'Gravidade'];
    // o cliente do resumo tem outro nome que o do DP, mas o final do CNPJ (0001-81) e o nome do cadastro de CND batem
    await page.evaluate(([c]) => window.__db.semear('ing_lotes/onvio~solicitacoes', { fonte: 'onvio', tipoDado: 'solicitacoes', colunas: c, tabela: ['Geral\t901\tSem análise\tescritório\tORION COMERCIO LTDA | 0001-81\tAna Teste\t2026-10-20\t2026-10-20\t5\t1'].join('\n'), nLinhas: 1, totalNaOrigem: 1, cortado: false, recebidoEm: Date.now(), usuario: 'Ana Teste' }), [cols]);
    await page.evaluate(() => window.__hubApi.abrirModulo('dp'));
    await page.evaluate(() => window.__hubApi.api('dp').irPara('cartela'));
    await page.click('#ct-modo [data-ct-modo="onvio"]');
    await page.waitForSelector('#ct-pane-onvio .ct-ov-tab tbody tr');
    assert.match(await page.textContent('#ct-pane-onvio .ct-ov-tab'), /ORION \| 0001-81/);
    assert.match(await page.textContent('#ct-pane-onvio .ct-ov-tab'), /901/);
  });

  await passo('Empresas do escritório (ControlTax, Dynexa, Oficina, Diskcontador): não aparecem em nada no Hub, nem as já cadastradas no DP nem as que vêm do Onvio', async () => {
    assert.ok(await page.evaluate(() => !!window.__db.ler('dp_empresas/e-ct') && !!window.__db.ler('dp_empresas/e-dyn')), 'elas estão no banco (nada é apagado)');
    const r = await page.evaluate(() => { const o = window.__hubApi.api('onvio'); return { emps: o.empresas().map(e => e.nome), clientes: [...o.clientes().values()].map(c => c.nome + ' ' + c.apelido), semVinculo: JSON.stringify(o.semVinculo()), manCli: !!window.__db.ler('ing_dados/onvio~clientes-nfe') }; });
    assert.ok(r.manCli);
    assert.ok(r.emps.length >= 3 && !r.emps.some(n => /controltax|dynexa/i.test(n)), 'a lista de empresas do DP esconde as do escritório: ' + r.emps.join(' / '));
    assert.ok(r.clientes.length >= 1 && !r.clientes.some(n => /controltax|dynexa|oficina|diskcontador/i.test(n)), 'os clientes do Onvio também: ' + r.clientes.join(' / '));
    assert.doesNotMatch(r.semVinculo, /controltax|dynexa|oficina business|diskcontador/i, 'nem na lista de clientes sem empresa');
    await page.evaluate(() => window.__hubApi.api('dp').irPara('funcionarios')); await page.waitForSelector('#dp-func-cards .fn-card');
    assert.doesNotMatch(await page.textContent('#dp-func-cards'), /CONTROLTAX|DYNEXA/i, 'nem nos cartões de Funcionários');
    assert.doesNotMatch(await page.textContent('#dp-func-resumo'), /CONTROLTAX|DYNEXA/i);
  });

  await passo('Filiais com o mesmo nome (Mercocamp): cada cliente vai para a empresa do seu CNPJ, cadastro antigo de empresa inativada é ignorado, quem é de outra filial não vira desligado sem conferir e muitos de uma vez ficam para decisão', async () => {
    const lerLinhas = (tipo) => page.evaluate((tp) => { const m = window.__db.ler('ing_dados/onvio~' + tp); let x = []; for (let i = 0; i < m.partes; i++) x.push(window.__db.ler(`ing_partes/onvio~${tp}~${m.slot}${i}`).tabela); return { colunas: m.colunas, categoria: m.categoria, linhas: x.join('\n').split('\n').filter(Boolean) }; }, tipo);
    const NOME = 'MERCOCAMP COMERCIO INTERNACIONAL S/A';
    const cnd = await lerLinhas('clientes-cnd'), nfe = await lerLinhas('clientes-nfe');
    const novoCliente = (cod, cnpj) => ({ id: 'c-m' + cod, code: cod, clientName: NOME, name: NOME, nickname: 'MERCOCAMP', active: true, clientStatus: 'ACTIVE', nationalIdentity: cnpj, uf: 'ES', stateInitials: 'ES', isOnvio: true });
    const cli = [novoCliente('992', '05521163001024'), novoCliente('986', '05521163000133')];
    await semearConjunto('clientes-cnd', { ...cnd, linhas: cnd.linhas.concat(D.OC.tabelaCnd(cli).linhas) }, 'cM1');
    await semearConjunto('clientes-nfe', { ...nfe, linhas: nfe.linhas.concat(D.OC.tabelaNfe(cli).linhas) }, 'cM1');
    const emp = await lerLinhas('pessoais-empregados');
    const lin = (cod, nome, cd) => [`id-${cod}`, cod, NOME, `e-${cod}-${nome.replace(/\W/g, '')}`, nome, '', '2020-01-01', 'ACTIVE', '', '', '', cd, 'EMPLOYEE', '2020-01-01 10:00'].join('\t');
    const intrusos = ['Intruso Um Filial', 'Intruso Dois Filial', 'Intruso Tres Filial', 'Intruso Quatro Filial', 'Intruso Cinco Filial', 'Intruso Seis Filial'];
    await semearConjunto('pessoais-empregados', { ...emp, linhas: emp.linhas.concat([lin('992', 'Ana Propria Mercocamp', '1'), ...intrusos.map((n, i) => lin('986', n, String(10 + i))), lin('986', 'Novo Da Filial', '30'), lin('160', 'Antigo Um Legado', '40'), lin('160', 'Antigo Dois Legado', '41')]) }, 'cM1');
    await page.evaluate(([nome, intr]) => {
      const f = (id, n, adm, extra) => Object.assign({ id, nome: n, cargo: '', codigo: '', admissao: adm, status: 'Ativo', aquisitivo: '', feriasInicio: '', feriasFim: '', rescisao: '', salario: '', obs: '' }, extra || {});
      const base = { cod: '', tributacao: 'Lucro Presumido', responsavel: 'Ana Teste', situacao: 'Ativa', uf: 'Espírito Santo', historico: [], lembretes: [], prazos: [] };
      window.__db.semear('dp_empresas/e-mc10', { ...base, id: 'e-mc10', nome, cnpj: '05.521.163/0010-24', codigoDominio: '992', funcionarios: [f('f-propria', 'Ana Propria Mercocamp', '2020-01-01', { codigo: '1' }), f('f-sumido', 'Sumido Da Empresa', '2019-05-05'), ...intr.map((n, i) => f('f-i' + i, n, '2021-0' + (i + 1) + '-01'))] });
      window.__db.semear('dp_empresas/e-mc01', { ...base, id: 'e-mc01', nome: 'MERCOCAMP COMERCIO', cnpj: '05.521.163/0001-33', codigoDominio: '986', funcionarios: [] });
      const c = window.__db.ler('dp_config/onvio') || {}; c.vinc = { ...(c.vinc || {}), 'mercocamp comercio internacional s a': 'e-mc10' };   // o vínculo pelo nome que juntava todas as filiais numa empresa só
      window.__db.semear('dp_config/onvio', c);
    }, [NOME, intrusos]);
    await page.waitForFunction(() => window.__hubApi.api('onvio').difs().some(d => d.empId === 'e-mc01' && /Novo Da Filial/.test(d.nome)), null, { timeout: 15000 });
    const dif = () => page.evaluate(() => window.__hubApi.api('onvio').difs().filter(d => /^e-mc/.test(d.empId)).map(d => ({ emp: d.empId, nome: d.nome, tipo: d.tipo, acao: d.acao, txt: d.txt, confirmar: d.confirmar, chave: d.chave })));
    let d = await dif();
    const cob = await page.evaluate(() => window.__hubApi.api('onvio').cobertura());
    assert.ok(cob.clientesAntigos >= 1, 'o cliente 160 (fora de CND e NF-e) é cadastro antigo');
    assert.ok(!d.some(x => /Antigo (Um|Dois) Legado/.test(x.nome)), 'ninguém do cadastro antigo vira cadastro novo');
    assert.deepEqual(d.filter(x => x.emp === 'e-mc01' && x.tipo === 'novo').map(x => x.nome).sort(), ['Intruso Cinco Filial', 'Intruso Dois Filial', 'Intruso Quatro Filial', 'Intruso Seis Filial', 'Intruso Tres Filial', 'Intruso Um Filial', 'Novo Da Filial'], 'os empregados da filial 0001-33 vão para a empresa dela');
    assert.ok(!d.some(x => x.emp === 'e-mc10' && x.tipo === 'novo'), 'a empresa 0010-24 só recebe a lista do cliente 992');
    const mc10 = d.filter(x => x.emp === 'e-mc10' && x.tipo === 'situacao');
    assert.equal(mc10.length, 7, 'os 6 de outra filial e o que sumiu viram sugestão de saída');
    assert.ok(mc10.every(x => x.confirmar === true && /Muitos de uma vez \(7 de 8\)/.test(x.txt)), 'muitos de uma vez: o automático não aplica, fica para conferir');
    assert.ok(mc10.filter(x => /Intruso/.test(x.nome)).every(x => /consta na de outra \(MERCOCAMP/.test(x.txt)), 'diz que a pessoa está na lista de outra filial');
    // poucos: sem trava, e a saída de quem é de outra filial não inventa um desligamento (a data de saída é a admissão)
    await page.evaluate(() => { const e = window.__db.ler('dp_empresas/e-mc10'); e.funcionarios = e.funcionarios.filter(f => !/^f-i[1-5]$/.test(f.id)); window.__db.semear('dp_empresas/e-mc10', e); });
    await page.waitForFunction(() => window.__hubApi.api('onvio').difs().filter(d => d.empId === 'e-mc10' && d.tipo === 'situacao').length === 2, null, { timeout: 15000 });
    d = (await dif()).filter(x => x.emp === 'e-mc10' && x.tipo === 'situacao');
    assert.ok(d.every(x => x.confirmar === false), 'só 2 (menos de 5): sem trava');
    const ch = d.find(x => /Intruso/.test(x.nome)).chave;
    assert.equal((await page.evaluate(([id, c]) => window.__hubApi.api('onvio').aplicar(id, c), ['e-mc10', ch])).ok, true);
    assert.equal(await page.evaluate(() => window.__db.ler('dp_empresas/e-mc10').funcionarios.find(f => f.id === 'f-i0').saidaEm), '2021-01-01', 'quem era de outra filial não ganha data de saída falsa (a saída é a própria admissão)');
    await page.evaluate(() => { for (const id of ['e-mc10', 'e-mc01']) window.__db.apagar ? window.__db.apagar('dp_empresas/' + id) : null; });
  });

  await passo('Cadastro único de empresas: relatório sem gravar, backup antes de gerar, base nos clientes do Onvio, duplicadas e sem CNPJ só propostas, escritório fora, nome pelo cadastro e vínculos entre módulos', async () => {
    await page.evaluate(() => {
      const base = { ativo: true, exemplo: false, setoresDemanda: { contabil: true, fiscal: false, pessoal: true }, habilitacao: { status: 'concluido' } };
      window.__db.semear('empresas/orion-comercio-ltda', { ...base, nome: 'ORION COMERCIO LTDA', cnpj: '11.222.333/0001-81' });
      window.__db.semear('empresas/zeta-transportes', { ...base, nome: 'ZETA TRANSPORTES LTDA', cnpj: '33.444.555/0001-03' });
      window.__db.semear('empresas/so-no-portal', { ...base, nome: 'EMPRESA SO NO PORTAL', cnpj: '12.345.678/0001-95' });
      window.__db.semear('empresas/controltax-x', { ...base, nome: 'CONTROLTAX CONSULTORIA E NEGOCIOS LTDA', cnpj: '10.870.633/0001-04' });
      window.__db.semear('ctb_emp/b0', { c11222333000181: { id: 'c11222333000181', nome: 'ORION', cnpj: '11.222.333/0001-81', sit: 'ativa', analista: 'Ana Teste', excluida: false }, nrazac: { id: 'nrazac', nome: 'RAZAC TRADING', cnpj: '', sit: 'ativa' } });
      const dup = window.__db.ler('dp_empresas/e-orion'); window.__db.semear('dp_empresas/e-orion-dup', { ...dup, id: 'e-orion-dup', funcionarios: [] });
      window.__db.semear('dp_empresas/domestica-teste', { id: 'domestica-teste', nome: 'DOMESTICA - MARIA TESTE', cnpj: '', funcionarios: [], historico: [], lembretes: [], prazos: [] });
    });
    const gravacoes = () => page.evaluate(() => window.__gravacoes.length);
    const g0 = await gravacoes();
    const r = await page.evaluate(() => window.__hubApi.api('cadastro').relatorio());
    assert.equal(r.ok, true); assert.equal(await gravacoes(), g0, 'o relatório não grava nada');
    const rel = r.relatorio;
    assert.ok(rel.duplicadas.some(d => d.cnpj === '11.222.333/0001-81' && d.modulo === 'DP' && /e-orion/.test(d.sugestao)), 'duplicada do DP proposta, com a que tem funcionários como sugestão: ' + JSON.stringify(rel.duplicadas));
    assert.ok(rel.semCnpj.some(d => /RAZAC/.test(d.nome) && d.modulo === 'Contábil'), 'Contábil sem CNPJ listado');
    assert.ok(rel.domesticas.some(d => /MARIA TESTE/.test(d.nome)), 'doméstica à parte');
    assert.ok(rel.foraDoOnvio.some(d => /SO NO PORTAL/.test(d.nome) && d.modulos.includes('Portal do Cliente')), 'empresa do Portal que o Onvio não tem');
    assert.ok(rel.escritorio.some(n => /CONTROLTAX/.test(n)), 'o escritório fica de fora');
    // gerar exige backup
    const semBkp = await page.evaluate(() => window.__hubApi.api('cadastro').gerar()); assert.equal(semBkp.ok, false); assert.match(semBkp.erro, /backup/i);
    const bk = await page.evaluate(() => window.__hubApi.api('cadastro').backup());
    assert.equal(bk.ok, true, JSON.stringify(bk)); assert.ok(bk.meta.itens >= 8 && bk.meta.pacotes >= 1);
    assert.ok(await page.evaluate(() => !!window.__db.ler('cad_backup/_meta') && !!window.__db.ler('cad_backup/p0')), 'o backup está no banco');
    const ger = await page.evaluate(() => window.__hubApi.api('cadastro').gerar());
    assert.equal(ger.ok, true, JSON.stringify(ger)); assert.ok(ger.mudou >= 5);
    const m = await page.evaluate(() => { const a = window.__hubApi.api('cadastro'); return { orion: a.get('11.222.333/0001-81'), so: a.get('12345678000195'), ct: a.get('10.870.633/0001-04'), n: a.todos().length, nome: window.__hubApi.nomeEmpresa('e-orion') }; });
    assert.ok(m.orion && m.orion.origem === 'onvio' && m.orion.situacao === 'ativa' && m.orion.apelido === 'ORION', 'cliente do Onvio na base');
    assert.deepEqual(m.orion.vinculos.dp, ['e-orion', 'e-orion-dup'], 'DP: a empresa com funcionários vem primeiro'); assert.deepEqual(m.orion.vinculos.ctb, ['c11222333000181']); assert.deepEqual(m.orion.vinculos.portal, ['orion-comercio-ltda']);
    assert.ok(m.so && m.so.origem === 'hub' && m.so.situacao === 'fora-do-onvio'); assert.equal(m.ct, null, 'ControlTax não entra');
    assert.equal(m.nome, 'ORION | 0001-81');
    // nada dos módulos foi alterado
    assert.equal(await page.evaluate(() => window.__db.ler('empresas/orion-comercio-ltda').nome), 'ORION COMERCIO LTDA');
    assert.equal(await page.evaluate(() => Object.keys(window.__db.ler('ctb_emp/b0')).length), 2);
    // segunda geração: nada mudou, nada gravado
    const g1 = await gravacoes(); const ger2 = await page.evaluate(() => window.__hubApi.api('cadastro').gerar()); assert.equal(ger2.mudou, 0, 'gerar de novo não regrava'); assert.equal(await gravacoes(), g1);
    // empresa nova de qualquer módulo entra no cadastro
    const rg = await page.evaluate(() => window.__cadastro.registrar({ cnpj: '98.765.432/0001-98', nome: 'NOVA PELO CONTABIL LTDA', modulo: 'ctb', id: 'c98765432000198' }));
    assert.equal(rg.ok, true); assert.deepEqual(await page.evaluate(() => window.__cadastro.vinculos('98765432000198').ctb), ['c98765432000198']);
    assert.equal(await page.evaluate(() => window.__cadastro.nome('98765432000198')), 'NOVA PELO CONTABIL | 0001-98');
    // ficha do DP mostra o cadastro único e onde mais a empresa está
    await page.evaluate(() => window.__hubApi.api('dp').abrirEmpresa('e-orion', 'dados'));
    await page.waitForSelector('#dp-section-cadunico .cad-box');
    const ficha = await page.textContent('#dp-section-cadunico'); assert.match(ficha, /Razão social[\s\S]*ORION COMERCIO LTDA/); assert.match(ficha, /Contábil/); assert.match(ficha, /Portal do Cliente/);
    assert.equal(await page.locator('#dp-section-cadunico [data-cad-abrir="ctb"]').count(), 1, 'atalho para abrir no Contábil');
    await page.keyboard.press('Escape');
    // a aba da Entrada de dados
    await page.evaluate(() => window.__hubApi.abrirModulo('fontes'));
    await fr.locator('[data-aba-btn="empresas"]').click();
    await fr.locator('#cuBox .cu-cards').first().waitFor({ timeout: 10000 });
    assert.match(await fr.locator('#cuBox').textContent(), /no cadastro único/);
    await fr.locator('#cuRel').click(); await fr.locator('#cuBox .cu-det').first().waitFor({ timeout: 15000 });
    assert.match(await fr.locator('#cuBox').textContent(), /Duplicadas no mesmo módulo[\s\S]*Sem CNPJ completo/);
    if (CAP) { await page.waitForTimeout(300); await page.screenshot({ path: path.join(CAP, 'cadastro-unico-claro.png') }); }
  });

  await passo('Tema escuro e tela estreita: ficha e diferenças legíveis, sem rolagem horizontal', async () => {
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.evaluate(() => window.__hubApi.api('dp').abrirEmpresa('e-orion', 'onvio'));
    await page.waitForSelector('#dp-section-onvio .ov-tab');
    if (CAP) await page.screenshot({ path: path.join(CAP, 'ficha-onvio-escuro.png') });
    await page.setViewportSize({ width: 820, height: 760 });
    const sw = await page.$eval('#dlg-dp-detail', e => e.scrollWidth > e.clientWidth + 2);
    assert.equal(sw, false, 'a ficha não rola na horizontal em 820 px');
    if (CAP) await page.screenshot({ path: path.join(CAP, 'ficha-onvio-estreita-escuro.png') });
    await page.keyboard.press('Escape');
  });

  await passo('sem erros de página', async () => { assert.deepEqual(erros, []); });

  await browser.close(); servidor.close();
  if (falhas) { console.log('\nFALHARAM: ' + falhas); process.exit(1); }
  console.log('\ntodos os testes do Hub passaram');
})().catch(e => { console.error(e); process.exit(1); });

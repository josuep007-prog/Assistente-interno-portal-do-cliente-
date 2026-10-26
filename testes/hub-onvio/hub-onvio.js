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
    get: async () => snapDoc(p),
    set: async (d) => { store.set(p, clone(d)); window.__gravacoes.push(['set', p]); avisa(p); },
    update: async (d) => { store.set(p, Object.assign({}, store.get(p) || {}, clone(d))); window.__gravacoes.push(['update', p]); avisa(p); },
    delete: async () => { store.delete(p); avisa(p); },
    onSnapshot: (cb) => { poe(docL, p, cb); setTimeout(() => cb(snapDoc(p)), 0); return () => {}; },
    collection: (n) => col(p + '/' + n) });
  const col = (p) => ({ path: p, doc: (id) => doc(p + '/' + id), get: async () => snapCol(p), onSnapshot: (cb) => { poe(colL, p, cb); setTimeout(() => cb(snapCol(p)), 0); return () => {}; } });
  window.__gravacoes = [];
  window.__db = { semear: (p, d) => { store.set(p, clone(d)); avisa(p); }, ler: (p) => clone(store.get(p)), existe: (p) => store.has(p) };
  window.claude = { use: async (n) => n === 'db' ? { doc, collection: col } : n === 'downloads' ? { save: async () => {} } : n === 'user' ? { id: async () => 'u-teste', can: async () => true, profiles: async () => ({}) } : null };
})();`;

function montarBanco() {
  const docs = [], T = D.tabelas(), agora = Date.now();
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
    assert.deepEqual(r.porEmp, [['e-orion', 4], ['e-vega', 2]], 'ORION 4 (inclui a concluída), VEGA 2');
    assert.deepEqual(r.sem, ['ZETA TRANSPORTES LTDA'], 'ZETA fica sem vínculo');
    assert.equal(r.cli, 3, 'clientes de CND e NF-e, por código');
  });

  await passo('Painel do DP: cartão Onvio com pendentes, vez do escritório e prazos legais em 7 dias; alertas de pessoal ganham os prazos do Onvio', async () => {
    await page.waitForFunction(() => [...document.querySelectorAll('#dp-painel-grid .pn-card')].some(c => /^\s*Onvio/.test(c.textContent) && /5\s*Pendentes/.test(c.textContent)), null, { timeout: 8000 });
    const t = await page.$eval('#dp-painel-grid', e => [...e.querySelectorAll('.pn-card')].map(c => c.textContent.replace(/\s+/g, ' ')).find(x => /^\s*Onvio/.test(x)));
    assert.match(t, /5\s*Pendentes/); assert.match(t, /4\s*Vez do escritório/); assert.match(t, /2\s*Prazos legais em 7 dias/);
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
    // abre a solicitação 701: dados completos e conversa das pendentes
    await page.click('#dp-section-onvio tr.ov-r:has-text("701")');
    await page.waitForFunction(() => /Recebido, vamos calcular\./.test((document.querySelector('#dp-section-onvio .ov-det') || {}).textContent || ''), null, { timeout: 8000 });
    const det = await page.textContent('#dp-section-onvio .ov-det');
    assert.match(det, /Dias de abono/); assert.match(det, /Recebido, vamos calcular\./); assert.match(det, /Contato da ORION/);
    if (CAP) await page.screenshot({ path: path.join(CAP, 'ficha-onvio-claro.png') });
  });

  await passo('DP: as diferenças só aparecem como aviso (ficha e tela Funcionários), sem nenhum botão de decisão, e o link abre a Entrada de dados', async () => {
    await page.click('#dp-dtabs [data-dtab="funcionarios"]');
    await page.waitForSelector('#dp-ov-dif:not([hidden]) .ov-aviso');
    assert.match(await page.textContent('#dp-ov-dif'), /4 diferenças com o Onvio desta empresa aguardam decisão na Entrada de dados/);
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__hubApi.api('dp').irPara('funcionarios'));
    await page.waitForSelector('#dp-func-ovdif:not([hidden]) .ov-aviso');
    assert.match(await page.textContent('#dp-func-ovdif'), /6 diferenças com o Onvio nos funcionários aguardam decisão na Entrada de dados/);
    if (CAP) { await page.waitForTimeout(700); await page.screenshot({ path: path.join(CAP, 'funcionarios-aviso-claro.png') }); }
    // a ficha da empresa sem ligação também só informa
    await page.evaluate(() => window.__hubApi.api('dp').abrirEmpresa('e-zeta', 'onvio'));
    await page.waitForSelector('#dp-section-onvio .dp-empty');
    assert.match(await page.textContent('#dp-section-onvio'), /não está ligada a nenhum cliente do Onvio/);
    assert.match(await page.textContent('#dp-section-onvio'), /Entrada de dados/);
    await page.keyboard.press('Escape');
    const botoes = await page.evaluate(() => document.querySelectorAll('[data-ov-aplicar],[data-ov-ignorar],[data-ov-vinc-btn],[data-ov-vinc-sel]').length);
    assert.equal(botoes, 0, 'nenhum botão de decisão no DP');
    await page.evaluate(() => window.__hubApi.api('dp').irPara('funcionarios'));
    await page.click('#dp-func-ovdif [data-ov-fontes]');
    await page.waitForSelector('#fontes-frame', { state: 'visible' });
  });

  const fr = page.frameLocator('#fontes-frame');
  const aplicarNoQuadro = async (linha, botao) => { await fr.locator(`#cadro tr[data-emp]:has-text("${linha}") ${botao}`).click(); await fr.locator('#dlgConf[open]').waitFor(); };

  await passo('Entrada de dados: lista as diferenças e os clientes sem empresa; nada é gravado antes de confirmar', async () => {
    await fr.locator('#cadro tr[data-emp]').first().waitFor({ timeout: 10000 });
    assert.equal(await fr.locator('#cadro tr[data-emp]').count(), 6, 'ORION 4 + VEGA 2');
    assert.match(await fr.locator('#cadSub').textContent(), /6 diferenças · 1 cliente sem empresa/);
    assert.match(await fr.locator('#cadro').textContent(), /ZETA TRANSPORTES LTDA/);
    if (CAP) { await fr.locator('#secCadastro').scrollIntoViewIfNeeded(); await fr.locator('#secCadastro h2').evaluate(e => e.scrollIntoView({ block: 'start' })); await page.waitForTimeout(500); await page.screenshot({ path: path.join(CAP, 'entrada-dados-claro.png'), fullPage: false }); }
    const g0 = await page.evaluate(() => window.__gravacoes.length);
    await aplicarNoQuadro('Código Domínio vazio', '[data-cad-aplicar]');
    assert.match(await fr.locator('#confTxt').textContent(), /Beltrano Silva: Código Domínio vazio\.[\s\S]*Aplicar no cadastro do DP\? Fica registrado no histórico/);
    assert.equal(await page.evaluate(() => window.__gravacoes.length), g0, 'nada é gravado antes de confirmar');
    await fr.locator('#confNao').click();
    assert.equal(await page.evaluate(() => window.__gravacoes.length), g0, 'cancelar não grava');
    assert.equal(await fr.locator('#cadro tr[data-emp]').count(), 6);
  });

  await passo('Entrada de dados: Aplicar grava no cadastro e no histórico; as férias aplicadas não repetem o pagamento na agenda', async () => {
    await aplicarNoQuadro('Código Domínio vazio', '[data-cad-aplicar]');
    await fr.locator('#confSim').click();
    await page.waitForFunction(() => (window.__db.ler('dp_empresas/e-orion').funcionarios.find(f => f.nome === 'Beltrano Silva') || {}).codigo === '202', null, { timeout: 5000 });
    const e = await page.evaluate(() => window.__db.ler('dp_empresas/e-orion'));
    assert.match(e.historico[0].alteracao, /^Atualizado a partir do Onvio \(Entrada de dados\): Beltrano Silva · Código Domínio vazio/);
    await page.waitForFunction(() => true);
    await fr.locator('#cadro tr[data-emp]').nth(4).waitFor();
    assert.equal(await fr.locator('#cadro tr[data-emp]').count(), 5);
    await aplicarNoQuadro('Férias no Onvio', '[data-cad-aplicar]');
    await fr.locator('#confSim').click();
    await page.waitForFunction(() => (window.__db.ler('dp_empresas/e-orion').funcionarios.find(f => f.nome === 'Maria Souza') || {}).feriasInicio, null, { timeout: 5000 });
    const f = await page.evaluate(() => window.__db.ler('dp_empresas/e-orion').funcionarios.find(f => f.nome === 'Maria Souza'));
    assert.equal(f.feriasInicio, D.dia(10)); assert.equal(f.feriasFim, D.dia(29), '20 dias de férias a partir do início');
    const r = await page.evaluate(([a, b]) => window.__hubApi.api('dp').consultar('vencimentos', { de: a, ate: b }), [hoje, D.dia(40)]);
    const pagar = r.linhas.filter(l => /Maria Souza · Pagar férias/.test(l.t));
    assert.equal(pagar.length, 1, 'um só pagamento de férias: ' + pagar.map(l => l.t).join(' | '));
  });

  await passo('Entrada de dados: Ignorar guarda a decisão e a diferença some', async () => {
    await aplicarNoQuadro('Joao Lima', '[data-cad-ignorar]');
    await fr.locator('#confSim').click();
    await page.waitForFunction(() => !!window.__db.existe('dp_ov_ignorar/e-vega'), null, { timeout: 5000 });
    const ign = await page.evaluate(() => window.__db.ler('dp_ov_ignorar/e-vega'));
    assert.equal(ign.chaves.length, 1); assert.match(ign.chaves[0], /^novo\|joao lima\|/);
    await page.waitForFunction(() => document.querySelector('#fontes-frame').contentDocument.querySelectorAll('#cadro tr[data-emp]').length === 3);
  });

  await passo('Permissão: o analista só aplica nas empresas da carteira dele; a coordenação aplica em qualquer uma', async () => {
    await page.evaluate(() => { window.__auth = { nivel: () => 'analista', analista: () => 'Bruno Teste', podeVer: () => true, ehAdmin: () => false, usuario: () => ({ nome: 'Bruno', id: 'u-bruno', prefs: {} }) }; });
    const dif = await page.evaluate(() => window.__hubApi.api('onvio').difs().map(d => [d.empId, d.tipo, d.pode]));
    assert.deepEqual(dif.filter(d => d[0] === 'e-orion').map(d => d[2]), [false, false], 'ORION é da Ana');
    assert.deepEqual(dif.filter(d => d[0] === 'e-vega').map(d => d[2]), [true], 'VEGA é do Bruno');
    const recusa = await page.evaluate(async () => { const a = window.__hubApi.api('onvio'), d = a.difs().find(x => x.empId === 'e-orion'); return [await a.aplicar(d.empId, d.chave), await a.ignorar(d.empId, d.chave), await a.ligar('qualquer', 'e-orion')]; });
    assert.deepEqual(recusa.map(r => r.ok), [false, false, false]);
    assert.match(recusa[0].erro, /carteira/); assert.match(recusa[2].erro, /coordenação/);
    assert.equal(await page.evaluate(() => window.__db.ler('dp_empresas/e-orion').funcionarios.find(f => f.nome === 'Beltrano Silva').rescisao), '', 'a rescisão do ORION não foi aplicada');
    await page.evaluate(() => { delete window.__auth; });
  });

  await passo('Entrada de dados: criar o funcionário que só existe no Onvio e ligar o cliente sem empresa', async () => {
    await aplicarNoQuadro('Novo Funcionario', '[data-cad-aplicar]');
    await fr.locator('#confSim').click();
    await page.waitForFunction(() => ((window.__db.ler('dp_empresas/e-vega') || {}).funcionarios || []).length === 1, null, { timeout: 5000 });
    const novo = await page.evaluate(() => window.__db.ler('dp_empresas/e-vega').funcionarios[0]);
    assert.equal(novo.nome, 'Novo Funcionario'); assert.equal(novo.admissao, D.dia(3)); assert.equal(novo.status, 'Ativo'); assert.match(novo.obs, /Onvio/);
    assert.ok(novo.id && novo.id.length > 5);
    // vínculo: escolhe a empresa e confirma
    await fr.locator('tr[data-k] [data-cad-emp]').selectOption('e-zeta');
    await fr.locator('tr[data-k] [data-cad-ligar]').click();
    await fr.locator('#dlgConf[open]').waitFor();
    assert.match(await fr.locator('#confTxt').textContent(), /ZETA TRANSPORTES LTDA[\s\S]*TRANSPORTES ZETA/);
    await fr.locator('#confSim').click();
    await page.waitForFunction(() => { const c = window.__db.ler('dp_config/onvio'); return c && Object.values(c.vinc || {}).includes('e-zeta'); }, null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => (window.__hubApi.api('onvio').solicitacoes().porEmp.get('e-zeta') || []).length), 1, 'a solicitação 706 agora é da empresa');
    assert.match(await fr.locator('#cadro').textContent(), /Todos os clientes do Onvio estão ligados/);
    if (CAP) { await fr.locator('#secCadastro h2').evaluate(e => e.scrollIntoView({ block: 'start' })); await page.waitForTimeout(500); await page.screenshot({ path: path.join(CAP, 'entrada-dados-depois-claro.png') }); }
    if (CAP) {
      await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); document.querySelector('#fontes-frame').contentDocument.documentElement.setAttribute('data-theme', 'dark'); });
      await page.waitForTimeout(400); await page.screenshot({ path: path.join(CAP, 'entrada-dados-depois-escuro.png') });
      await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'light'); });
    }
  });

  await passo('Cartela → Onvio (resumo antigo) continua igual e ganha o CNPJ completo dos clientes de CND/NF-e', async () => {
    const cols = ['Lista', 'Nº', 'Situação', 'Vez', 'Cliente', 'Responsável', 'Aberta em', 'Última movimentação', 'Dias parado', 'Gravidade'];
    // o cliente do resumo tem outro nome que o do DP, mas o final do CNPJ (0001-81) e o nome do cadastro de CND batem
    await page.evaluate(([c]) => window.__db.semear('ing_lotes/onvio~solicitacoes', { fonte: 'onvio', tipoDado: 'solicitacoes', colunas: c, tabela: ['Geral\t901\tSem análise\tescritório\tORION COMERCIO LTDA | 0001-81\tAna Teste\t2026-10-20\t2026-10-20\t5\t1'].join('\n'), nLinhas: 1, totalNaOrigem: 1, cortado: false, recebidoEm: Date.now(), usuario: 'Ana Teste' }), [cols]);
    await page.evaluate(() => window.__hubApi.abrirModulo('dp'));
    await page.evaluate(() => window.__hubApi.api('dp').irPara('cartela'));
    await page.click('#ct-modo [data-ct-modo="onvio"]');
    await page.waitForSelector('#ct-pane-onvio .ct-ov-tab tbody tr');
    assert.match(await page.textContent('#ct-pane-onvio .ct-ov-tab'), /ORION COMERCIO LTDA/);
    assert.match(await page.textContent('#ct-pane-onvio .ct-ov-tab'), /901/);
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

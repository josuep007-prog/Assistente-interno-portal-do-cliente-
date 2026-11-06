/* Teste de navegador do Control Hub com os dados do Gestta (Hub 316): a Entrada de dados compara a cartela por setor, o regime e as
 * inscrições do Gestta com os cadastros do DP, Contábil, Fiscal e Portal do Cliente e aplica só com a decisão da pessoa.
 * Dados FICTÍCIOS, banco do artefato simulado em memória (o mesmo de hub-onvio.js).
 *
 *   HUB_DIR=<pasta com hub.js, hub.css, tema.js, fontes.html e index.fonte.html> NODE_PATH=$(npm root -g) node testes/hub-onvio/hub-gestta.js
 *   CAP=<pasta> grava capturas de tela (claro e escuro). */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const HUB = process.env.HUB_DIR;
if (!HUB || !fs.existsSync(path.join(HUB, 'hub.js'))) { console.log('HUB_DIR não definido: teste do Gestta no Hub pulado.'); process.exit(0); }
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
const BANCO = fs.readFileSync(path.join(__dirname, 'hub-onvio.js'), 'utf8').match(/const BANCO = `([\s\S]*?)`;/)[1];

// Gestta fictício: 4 clientes ativos + 1 inativo + 1 do escritório
const C = { alfa: '11111111000101', beta: '22222222000102', gama: '33333333000103', delta: '44444444000104', inat: '55555555000105', esc: '66666666000106' };
const tab = (linhas) => linhas.map(l => l.join('\t')).join('\n');
const CLIENTES = { colunas: ['Id', 'Código', 'Nome', 'Nome fantasia', 'CNPJ', 'Ativo', 'Regime', 'Inscrição estadual', 'UF', 'Cidade', 'Id externo', 'Usa o portal do Onvio'], linhas: [
  ['g1', '1', 'ALFA COMERCIO LTDA', 'ALFA', C.alfa, 'sim', 'Simples Nacional', '123.456.789', 'SP', 'Campinas', '', 'sim'],
  ['g2', '2', 'BETA SERVICOS LTDA', 'BETA', C.beta, 'sim', 'Lucro Presumido', '', 'MG', 'Uberlândia', '', 'não'],
  ['g3', '3', 'GAMA INDUSTRIA LTDA', '', C.gama, 'sim', 'Lucro Real', 'ISENTO', 'PR', 'Curitiba', '', 'não'],
  ['g4', '4', 'DELTA MEI', '', C.delta, 'sim', 'MEI', '', 'SP', 'Santos', '', 'não'],
  ['g5', '5', 'EPSILON INATIVA LTDA', '', C.inat, 'não', 'Simples Nacional', '', 'SP', 'Santos', '', 'não'],
  ['g6', '6', 'CONTROLTAX CONTABILIDADE', '', C.esc, 'sim', 'Simples Nacional', '', 'SP', 'Santos', '', 'não']] };
const CARTELA = { colunas: ['Id do cliente', 'Código do cliente', 'Cliente', 'CNPJ', 'Setor', 'Id do setor', 'Responsável', 'Id do responsável'], linhas: [
  ['g1', '1', 'ALFA COMERCIO LTDA', C.alfa, 'Departamento Pessoal', 's1', 'Carla Mendes Souza', 'u1'],
  ['g1', '1', 'ALFA COMERCIO LTDA', C.alfa, 'Contábil', 's2', 'Rui Teixeira', 'u2'],
  ['g1', '1', 'ALFA COMERCIO LTDA', C.alfa, 'Fiscal', 's3', 'Paula Nunes', 'u3'],
  ['g2', '2', 'BETA SERVICOS LTDA', C.beta, 'Departamento Pessoal', 's1', 'Carla Mendes Souza', 'u1'],
  ['g2', '2', 'BETA SERVICOS LTDA', C.beta, 'Fiscal', 's3', '', ''],
  ['g3', '3', 'GAMA INDUSTRIA LTDA', C.gama, 'Fiscal', 's3', 'Paula Nunes', 'u3'],
  ['g3', '3', 'GAMA INDUSTRIA LTDA', C.gama, 'Legalização', 's4', 'Rui Teixeira', 'u2'],
  ['g4', '4', 'DELTA MEI', C.delta, 'Contábil', 's2', 'Zélia Desconhecida', 'u9'],
  ['g6', '6', 'CONTROLTAX CONTABILIDADE', C.esc, 'Departamento Pessoal', 's1', 'Carla Mendes Souza', 'u1']] };
const SETORES = { colunas: ['Id', 'Setor'], linhas: [['s1', 'Departamento Pessoal'], ['s2', 'Contábil'], ['s3', 'Fiscal'], ['s4', 'Legalização']] };
const TAREFAS = { colunas: ['Mês', 'Id', 'Tarefa', 'Setor', 'Responsável', 'Situação', 'CNPJ', 'Cliente'], linhas: [
  ['2026-11', 't1', 'DCTFWeb', 'Fiscal', '', 'Aberta', C.beta, 'BETA SERVICOS LTDA']] };
const GT = { 'gestta-clientes': CLIENTES, 'gestta-cartela': CARTELA, 'gestta-setores': SETORES, 'gestta-tarefas': TAREFAS };

const balde = (id, n) => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return h % n; };
const fmt = (c) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

let falhas = 0;
async function passo(nome, fn) { if (process.env.SO && !nome.startsWith(process.env.SO) && nome !== 'sem erros de página') return; try { await fn(); console.log('ok   ' + nome); } catch (e) { falhas++; console.log('FALHA ' + nome + '\n     ' + String(e && e.message || e).split('\n').slice(0, 6).join('\n     ')); } }

(async () => {
  await new Promise(r => servidor.listen(0, r));
  const url = `http://localhost:${servidor.address().port}/index.html`;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'pt-BR' });
  await ctx.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e && e.message || e)));
  await page.addInitScript(BANCO);
  await page.addInitScript(() => { try { localStorage.setItem('controlhub-theme', 'light'); } catch (e) {} });
  await page.goto(url);
  await page.waitForFunction(() => window.__hubApi && window.__db);
  const semear = (p, d) => page.evaluate(([a, b]) => window.__db.semear(a, b), [p, d]);
  // DP: ALFA sem analista e com tributação diferente; BETA com o nome curto da analista
  await semear('dp_empresas/e-alfa', { nome: 'ALFA COMERCIO LTDA', cnpj: fmt(C.alfa), tributacao: 'LUCRO PRESUMIDO', responsavel: '', situacao: 'Ativa', funcionarios: [], historico: [] });
  await semear('dp_empresas/e-beta', { nome: 'BETA SERVICOS LTDA', cnpj: fmt(C.beta), tributacao: 'LUCRO PRESUMIDO', responsavel: 'Carla Souza', situacao: 'Ativa', funcionarios: [], historico: [] });
  await semear('dp_config/equipe', { lista: ['Carla Souza'] });
  // Contábil: ALFA com outro analista e Presumido (o Gestta diz Simples)
  await semear('ctb_emp/b' + balde('c' + C.alfa, 8), { ['c' + C.alfa]: { id: 'c' + C.alfa, nome: 'ALFA COMERCIO LTDA', cnpj: fmt(C.alfa), trib: 'presumido', analista: 'Marcos Lima', sit: 'ativa' } });
  // Portal: ALFA com as frentes Pessoal e Fiscal (sem analista); equipe do Portal com Carla e Paula
  await semear('empresas/p-alfa', { nome: 'ALFA COMERCIO LTDA', cnpj: fmt(C.alfa) });
  await semear('empresaSetores/p-alfa_pessoal', { empresaId: 'p-alfa', empresaNome: 'ALFA', setor: 'pessoal', analistaId: '', analistaNome: '', etapas: {} });
  await semear('empresaSetores/p-alfa_contabil', { empresaId: 'p-alfa', empresaNome: 'ALFA', setor: 'contabil', analistaId: '', analistaNome: '', etapas: {} });
  await semear('funcionarios/f1', { nome: 'Carla Souza' });
  await semear('funcionarios/f2', { nome: 'Paula Nunes' });
  // Gestta
  for (const [tipo, c] of Object.entries(GT)) {
    const linhas = c.linhas, metade = Math.ceil(linhas.length / 2), partes = [tab(linhas.slice(0, metade)), tab(linhas.slice(metade))].filter(Boolean);
    for (let i = 0; i < partes.length; i++) await semear(`ing_partes/gestta~${tipo}~a${i}`, { ciclo: 'g1', parte: i, tabela: partes[i] });
    await semear(`ing_dados/gestta~${tipo}`, { fonte: 'gestta', tipoDado: tipo, categoria: 'cadastros', titulo: tipo, colunas: c.colunas, nLinhas: linhas.length, totalNaOrigem: linhas.length, cortado: false, partes: partes.length, slot: 'a', ciclo: 'g1', recebidoEm: Date.now(), versaoExt: '0.80.0' });
  }
  const api = (fn, arg) => page.evaluate(([f, a]) => { const g = window.__hubApi.api('gestta'); return new Function('g', 'a', 'return (' + f + ')(g, a)')(g, a); }, [fn.toString(), arg]);
  const difs = () => api((g) => g.difs().map(d => [d.mod, d.k.slice(0, 2), d.campo, d.acao, d.antes, d.depois, !!d.confirmar, d.pode]));
  const esperar = async () => { await api((g) => g.garantir(true)); await page.waitForFunction(() => { const g = window.__hubApi.api('gestta'); return g && !g.carregando(); }, null, { timeout: 10000 }); };

  await passo('Diferenças: analista de cada setor, tributação, inscrições e empresas com demanda; inativo e escritório ficam fora', async () => {
    await esperar();
    const d = await difs(), s = d.map(x => x.slice(0, 6).join(' ')).sort();
    // DP
    assert.ok(s.includes('dp 11 responsavel complementar — Carla Souza'), 'ALFA: complementar o analista do DP pelo nome do Hub (primeiro e último nome): ' + s.join(' | '));
    assert.ok(s.includes('dp 11 tributacao corrigir LUCRO PRESUMIDO SIMPLES NACIONAL'));
    assert.ok(!s.some(x => /^dp 22 responsavel/.test(x)), 'BETA: "Carla Mendes Souza" e "Carla Souza" são a mesma pessoa');
    assert.ok(!d.some(x => x[0] === 'dp' && x[1] === '33'), 'GAMA não tem demanda no Pessoal');
    // Contábil
    assert.ok(s.includes('contabil 11 analista corrigir Marcos Lima Rui Teixeira'));
    assert.ok(s.includes('contabil 11 trib corrigir Lucro Presumido Simples Nacional'));
    const delta = d.find(x => x[0] === 'contabil' && x[1] === '44');
    assert.ok(delta && delta[3] === 'novo' && delta[6] === true, 'DELTA: empresa nova no Contábil, "conferir antes" (analista sem par no Hub)');
    // Fiscal: tudo novo (o módulo está vazio, em modo exemplo); BETA tem demanda pela tarefa, sem responsável
    assert.deepEqual(d.filter(x => x[0] === 'fiscal').map(x => x[1] + ' ' + x[3]).sort(), ['11 novo', '22 novo', '33 novo']);
    // Portal: só as frentes que existem; Contábil sem a pessoa na equipe do Portal não pode ser aplicado
    const pt = d.filter(x => x[0] === 'portal').map(x => [x[2], x[5], x[7]]);
    assert.deepEqual(pt.sort(), [['analista-contabil', 'Rui Teixeira', false], ['analista-pessoal', 'Carla Souza', true]]);
    assert.ok(!d.some(x => x[1] === '55' || x[1] === '66'), 'inativo e empresa do escritório nunca entram');
    assert.ok(!d.some(x => x[2] === 'empresa' && x[0] === 'dp' && x[1] === '33'), 'Legalização não é módulo do Hub');
  });

  await passo('Entrada de dados: a seção do Gestta mostra as diferenças por empresa, filtra por módulo e nada é gravado antes de confirmar', async () => {
    await page.evaluate(() => window.__hubApi.abrirModulo('fontes'));
    const fr = page.frameLocator('#fontes-frame');
    await fr.locator('#gtDifs tr[data-gt-k]').first().waitFor({ timeout: 10000 });
    const n = await fr.locator('#gtDifs tr[data-gt-k]').count();
    assert.equal(n, (await difs()).length);
    assert.match(await fr.locator('#gtSub').textContent(), new RegExp(n + ' diferenças'));
    await fr.locator('[data-gt-mod="fiscal"]').click();
    assert.equal(await fr.locator('#gtDifs tr[data-gt-k]').count(), 3);
    await fr.locator('[data-gt-mod=""]').click();
    const antes = await page.evaluate(() => window.__gravacoes.length);
    await fr.locator('#gtDifs tr[data-gt-k][data-gt-chave^="dp|responsavel"] [data-gt-aplicar]').click();
    await fr.locator('#dlgConf[open]').waitFor();
    await fr.locator('#dlgConf [value="cancel"], #dlgConf #confNao').first().click().catch(async () => { await page.keyboard.press('Escape'); });
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__gravacoes.length), antes, 'cancelar não grava');
    if (CAP) { await fr.locator('#secGestta').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(CAP, 'gestta-entrada-claro.png') }); }
  });

  await passo('Aplicar: complementa o DP com histórico, corrige o Contábil e o Portal pelo id da pessoa, e registra em gt_hist', async () => {
    const fr = page.frameLocator('#fontes-frame');
    await fr.locator('#gtDifs tr[data-gt-k][data-gt-chave^="dp|responsavel"] [data-gt-aplicar]').click();
    await fr.locator('#dlgConf[open]').waitFor(); await fr.locator('#confSim').click();
    await page.waitForFunction(() => (window.__db.ler('dp_empresas/e-alfa') || {}).responsavel === 'Carla Souza', null, { timeout: 5000 });
    const e = await page.evaluate(() => window.__db.ler('dp_empresas/e-alfa'));
    assert.match(e.historico[0].alteracao, /Complementado pelo Gestta: Analista do Pessoal: — → Carla Souza/);
    assert.equal(e.tributacao, 'LUCRO PRESUMIDO', 'só o campo aplicado muda');
    const r1 = await api((g) => { const d = g.difs().find(x => x.mod === 'contabil' && x.campo === 'trib'); return g.aplicar(d.k, d.chave); });
    assert.ok(r1.ok, JSON.stringify(r1));
    const ctb = await page.evaluate((p) => window.__db.ler(p), 'ctb_emp/b' + balde('c' + C.alfa, 8));
    assert.equal(ctb['c' + C.alfa].trib, 'simples'); assert.equal(ctb['c' + C.alfa].analista, 'Marcos Lima');
    const r2 = await api((g) => { const d = g.difs().find(x => x.mod === 'portal' && x.campo === 'analista-pessoal'); return g.aplicar(d.k, d.chave); });
    assert.ok(r2.ok);
    const fr2 = await page.evaluate(() => window.__db.ler('empresaSetores/p-alfa_pessoal'));
    assert.deepEqual([fr2.analistaId, fr2.analistaNome], ['f1', 'Carla Souza']);
    const r3 = await api((g) => { const d = g.difs().find(x => x.mod === 'portal' && x.campo === 'analista-contabil'); return g.aplicar(d.k, d.chave); });
    assert.equal(r3.ok, false, 'sem a pessoa na equipe do Portal não grava');
    const hist = await page.evaluate(() => window.__db.listar('gt_hist'));
    assert.equal(hist.length, 3); assert.ok(hist.every(h => !h.auto && h.cnpj === '11111111000101'));
    const d = await difs();
    assert.ok(!d.some(x => x[0] === 'dp' && x[2] === 'responsavel' && x[1] === '11'), 'a diferença aplicada some');
  });

  await passo('Fiscal real: cadastrar pelo Gestta cria a empresa com regime, inscrição, UF e município, e o módulo sai do modo exemplo', async () => {
    const r = await api((g) => { const d = g.difs().find(x => x.mod === 'fiscal' && x.k.startsWith('11')); return g.aplicar(d.k, d.chave); });
    assert.ok(r.ok, JSON.stringify(r));
    const m = await page.evaluate((p) => window.__db.ler(p), 'fis_emp/b' + balde('c' + C.alfa, 8));
    const e = m['c' + C.alfa];
    assert.deepEqual([e.nome, e.regime, e.ie, e.uf, e.municipio, e.analista, e.sit], ['ALFA COMERCIO LTDA', 'simples', '123.456.789', 'SP', 'Campinas', 'Paula Nunes', 'ativa']);
    assert.match(e.hist[0].t, /Cadastrada a partir do Gestta/);
    const r2 = await api((g) => { const d = g.difs().find(x => x.mod === 'fiscal' && x.k.startsWith('33')); return g.aplicar(d.k, d.chave); });
    assert.ok(r2.ok);
    assert.equal((await page.evaluate((p) => window.__db.ler(p), 'fis_emp/b' + balde('c' + C.gama, 8)))['c' + C.gama].regime, 'real');
    // o Fiscal sai do modo exemplo quando fis_emp tem uma empresa não excluída (aplicarFonte em fiscal.js); o quadro não abre aqui sem o login (auth.js)
    const reais = await page.evaluate(() => window.__db.listar('fis_emp').flatMap(d => Object.keys(d).filter(k => k !== 'id').map(k => d[k])).filter(e => e && !e.excluida).length);
    assert.equal(reais, 2, 'duas empresas reais no Fiscal');
  });

  await passo('Ignorar guarda a decisão por empresa e a diferença some; valor novo do Gestta volta a aparecer', async () => {
    const r = await api((g) => { const d = g.difs().find(x => x.mod === 'contabil' && x.campo === 'analista'); return g.ignorar(d.k, d.chave); });
    assert.ok(r.ok);
    const ig = await page.evaluate(() => window.__db.ler('gt_ignorar/11111111000101'));
    assert.deepEqual(ig.chaves, ['contabil|analista|rui teixeira']);
    assert.ok(!(await difs()).some(x => x[0] === 'contabil' && x[2] === 'analista' && x[1] === '11'));
  });

  await passo('Setores e analistas: a coordenação troca o módulo de um setor e liga um nome do Gestta a um nome do Hub', async () => {
    const s = await api((g) => g.setores().map(x => [x.nome, x.mod]));
    assert.deepEqual(s, [['Contábil', 'contabil'], ['Departamento Pessoal', 'dp'], ['Fiscal', 'fiscal'], ['Legalização', '']]);
    const fr = page.frameLocator('#fontes-frame');
    await fr.locator('details[data-gt-det="setores"] summary').click();
    await fr.locator('select[data-gt-setor="legalizacao"]').selectOption('contabil');
    await page.waitForFunction(() => (window.__db.ler('gt_config/cfg') || { setores: {} }).setores.legalizacao === 'contabil', null, { timeout: 5000 });
    await page.waitForFunction(() => window.__hubApi.api('gestta').difs().some(d => d.mod === 'contabil' && d.k.startsWith('33') && d.acao === 'novo'), null, { timeout: 5000 });
    // Zélia (sem par) ligada a um nome do Hub: deixa de ser "conferir antes"
    const r = await api((g) => g.salvarCfg(c => { c.analistas['zelia desconhecida'] = 'Marcos Lima'; }));
    assert.ok(r.ok);
    await page.waitForFunction(() => { const d = window.__hubApi.api('gestta').difs().find(x => x.mod === 'contabil' && x.k.startsWith('44')); return d && !d.confirmar && d.valor.analista === 'Marcos Lima'; }, null, { timeout: 5000 });
  });

  await passo('Automático: desligado de fábrica; ligado só complementa sozinho (o "conferir antes" fica), com "automaticamente" no histórico', async () => {
    assert.equal(await api((g) => g.auto().ligada), false);
    const antes = (await page.evaluate(() => window.__db.listar('gt_hist'))).length;
    // alguém apagou o analista do DP da ALFA: há de novo o que complementar
    await page.evaluate(() => { const e = window.__db.ler('dp_empresas/e-alfa'); e.responsavel = ''; window.__db.semear('dp_empresas/e-alfa', e); });
    await page.waitForFunction(() => window.__hubApi.api('gestta').difs().some(d => d.mod === 'dp' && d.campo === 'responsavel' && d.acao === 'complementar'), null, { timeout: 5000 });
    await api((g) => g.salvarCfg(c => { c.auto.ligada = true; }));
    await page.waitForFunction((n) => window.__db.listar('gt_hist').length > n, antes, { timeout: 8000 });
    await page.waitForFunction(() => !window.__hubApi.api('gestta').auto().rodando, null, { timeout: 8000 });
    const novos = (await page.evaluate(() => window.__db.listar('gt_hist'))).slice(antes);
    assert.ok(novos.length >= 1 && novos.every(h => h.auto && h.acao === 'complementar'), JSON.stringify(novos.map(h => [h.mod, h.acao])));
    const d = await difs();
    assert.ok(!d.some(x => x[3] === 'complementar' && x[7] && !x[6]), 'nada para complementar sobrou');
    assert.ok(d.some(x => x[3] === 'corrigir'), 'corrigir continua para decidir');
    await api((g) => g.salvarCfg(c => { c.auto.ligada = false; }));
  });

  await passo('Tema escuro e tela estreita: a seção do Gestta legível, sem rolagem horizontal', async () => {
    await page.setViewportSize({ width: 760, height: 900 });
    await page.evaluate(() => { localStorage.setItem('controlhub-theme', 'dark'); document.documentElement.setAttribute('data-theme', 'dark'); const f = document.querySelector('#fontes-frame'); if (f && f.contentDocument) f.contentDocument.documentElement.setAttribute('data-theme', 'dark'); });
    const fr = page.frameLocator('#fontes-frame');
    await fr.locator('#secGestta').scrollIntoViewIfNeeded();
    const larg = await page.evaluate(() => { const d = document.querySelector('#fontes-frame').contentDocument; return [d.documentElement.scrollWidth, d.documentElement.clientWidth]; });
    assert.ok(larg[0] <= larg[1] + 1, 'sem rolagem horizontal: ' + larg.join(' > '));
    if (CAP) await page.screenshot({ path: path.join(CAP, 'gestta-entrada-escuro-estreita.png') });
  });

  await passo('sem erros de página', async () => { assert.deepEqual(erros, []); });
  await browser.close(); servidor.close();
  console.log(falhas ? 'FALHARAM: ' + falhas : 'tudo ok');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

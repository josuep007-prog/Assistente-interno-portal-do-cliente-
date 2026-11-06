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
const C = { alfa: '11111111000101', beta: '22222222000102', gama: '33333333000103', delta: '44444444000104', inat: '55555555000105', esc: '66666666000106', velha: '77777777000107' };
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
const EQUIPE = { colunas: ['Id', 'Nome', 'Papel', 'Ativo', 'Setores', 'Tem tarefas atreladas'], linhas: [
  ['u1', 'Carla Mendes Souza', 'Analista', 'sim', 'Departamento Pessoal', 'sim'], ['u2', 'Rui Teixeira', 'Analista', 'sim', 'Contábil | Legalização', 'sim'],
  ['u3', 'Paula Nunes', 'Analista', 'sim', 'Fiscal', 'sim'], ['u9', 'Zélia Desconhecida', 'Analista', 'sim', 'Contábil', 'sim'], ['u7', 'Marcos Lima', 'Analista', 'não', 'Contábil', 'não']] };
// empresas com tarefa no mês atual ou anterior (extensão 0.81.0): a VELHA não está
const ATIVAS = { colunas: ['CNPJ', 'Cliente', 'Tarefas', 'Último mês'], linhas: [[C.alfa, 'ALFA COMERCIO LTDA', 30, '2026-11'], [C.beta, 'BETA SERVICOS LTDA', 12, '2026-11'], [C.gama, 'GAMA INDUSTRIA LTDA', 8, '2026-10'], [C.delta, 'DELTA MEI', 2, '2026-11']] };
const GT = { 'gestta-clientes': CLIENTES, 'gestta-cartela': CARTELA, 'gestta-setores': SETORES, 'gestta-tarefas': TAREFAS, 'gestta-equipe': EQUIPE, 'gestta-empresas-ativas': ATIVAS };

const balde = (id, n) => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return h % n; };
const fmt = (c) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

let falhas = 0;
const window_docs_ok = (docs) => docs.length === 1 && Array.isArray(docs[0].itens) && /^h\d{4}-\d{2}~/.test(docs[0].id);
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
  await semear('dp_empresas/e-velha', { nome: 'VELHA SEM TAREFA LTDA', cnpj: fmt(C.velha), tributacao: 'SIMPLES NACIONAL', responsavel: 'Carla Souza', situacao: 'Ativa', funcionarios: [], historico: [] });
  await semear('dp_empresas/e-delta', { nome: 'DELTA MEI', cnpj: fmt(C.delta), tributacao: 'MEI', responsavel: 'Marcos Lima', situacao: 'Ativa', funcionarios: [], historico: [] });
  await semear('ctb_emp/b' + balde('c' + C.velha, 8), { ['c' + C.velha]: { id: 'c' + C.velha, nome: 'VELHA SEM TAREFA LTDA', cnpj: fmt(C.velha), trib: 'simples', analista: 'Rui Teixeira', sit: 'ativa' } });
  await semear('empresas/p-velha', { nome: 'VELHA SEM TAREFA LTDA', cnpj: fmt(C.velha) });
  await semear('funcionarios/f3', { nome: 'R. Teixeira' });
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
    assert.ok(s.includes('dp 11 responsavel complementar — Carla Mendes Souza'), 'ALFA: complementar o analista do DP com o nome do Gestta (a referência): ' + s.join(' | '));
    assert.ok(s.includes('dp 11 tributacao corrigir LUCRO PRESUMIDO SIMPLES NACIONAL'));
    assert.ok(s.includes('dp 22 responsavel corrigir Carla Souza Carla Mendes Souza'), 'BETA: o nome do Hub vira o do Gestta');
    assert.ok(!d.some(x => x[1] === '77'), 'VELHA não tem tarefa no Gestta: nada dela');
    assert.ok(!d.some(x => x[0] === 'dp' && x[1] === '33'), 'GAMA não tem demanda no Pessoal');
    // Contábil
    assert.ok(s.includes('contabil 11 analista corrigir Marcos Lima Rui Teixeira'));
    assert.ok(s.includes('contabil 11 trib corrigir Lucro Presumido Simples Nacional'));
    const delta = d.find(x => x[0] === 'contabil' && x[1] === '44');
    assert.ok(delta && delta[3] === 'novo' && delta[6] === false && delta[5] === 'DELTA MEI', 'DELTA: empresa nova no Contábil, com o analista do Gestta');
    // Fiscal: tudo novo (o módulo está vazio, em modo exemplo); BETA tem demanda pela tarefa, sem responsável
    assert.deepEqual(d.filter(x => x[0] === 'fiscal').map(x => x[1] + ' ' + x[3]).sort(), ['11 novo', '22 novo', '33 novo']);
    // Portal: só as frentes que existem; Contábil sem a pessoa na equipe do Portal não pode ser aplicado
    const pt = d.filter(x => x[0] === 'portal').map(x => [x[2], x[5], x[7]]);
    assert.deepEqual(pt.sort(), [['analista-contabil', 'Rui Teixeira', false], ['analista-pessoal', 'Carla Souza', true]]);
    assert.ok(!d.some(x => x[1] === '55' || x[1] === '66'), 'inativo e empresa do escritório nunca entram');
    assert.ok(!d.some(x => x[2] === 'empresa' && x[0] === 'dp' && x[1] === '33'), 'Legalização não é módulo do Hub');
  });

  await passo('Referência absoluta: empresa sem tarefa no Gestta some do DP, do Contábil, do Portal e do cadastro; analista fora da equipe sai da carteira; a lista do Gestta faltando não esconde nada', async () => {
    const dp = () => page.evaluate(() => window.__hubApi.api('dp').listar().map(e => [e.nome, e.analista]).sort());
    await page.waitForFunction(() => !window.__hubApi.api('dp').listar().some(e => /VELHA/.test(e.nome)), null, { timeout: 8000 });
    assert.deepEqual(await dp(), [['ALFA COMERCIO LTDA', ''], ['BETA SERVICOS LTDA', 'Carla Souza'], ['DELTA MEI', '']], 'VELHA escondida; Marcos Lima (inativo no Gestta) sai da DELTA');
    assert.deepEqual(await page.evaluate(() => window.__hubApi.cfg.dp.equipe()), ['Carla Mendes Souza'], 'a equipe do DP é a do Gestta');
    const cad = await page.evaluate(([v, a]) => [window.__cadastro.ativa('ctb', 'c' + v, v), window.__cadastro.ativa('ctb', 'c' + a, a), window.__cadastro.ativa('portal', 'p-velha', v), window.__cadastro.analistaAtivo('Marcos Lima'), window.__cadastro.analistaAtivo('Carla Souza'), window.__cadastro.analistaGestta('Carla Souza'), window.__cadastro.analistas('ctb')], [C.velha, C.alfa]);
    assert.deepEqual(cad, [false, true, false, false, true, 'Carla Mendes Souza', ['Rui Teixeira', 'Zélia Desconhecida']]);
    assert.equal(await page.evaluate(() => window.__db.ler('dp_empresas/e-velha').nome), 'VELHA SEM TAREFA LTDA', 'nada é apagado');
    assert.equal(await page.evaluate(() => window.__db.ler('dp_empresas/e-delta').responsavel), 'Marcos Lima', 'o nome gravado fica');
    await esperar();
    const ref = await api((g) => g.referencia());
    assert.deepEqual([ref.empresas.ok, ref.empresas.n, ref.analistas.ok, ref.fora.dp, ref.fora.contabil, ref.fora.portal], [true, 4, true, ['VELHA SEM TAREFA LTDA'], ['VELHA SEM TAREFA LTDA'], ['VELHA SEM TAREFA LTDA']]);
    assert.ok(ref.analistasFora.some(a => a.nome === 'Marcos Lima'), JSON.stringify(ref.analistasFora));
    // trava: lista velha (mais de 72 h) não esconde nada
    const man = await page.evaluate(() => window.__db.ler('ing_dados/gestta~gestta-empresas-ativas'));
    await semear('ing_dados/gestta~gestta-empresas-ativas', Object.assign({}, man, { recebidoEm: Date.now() - 80 * 3600e3 }));
    await page.waitForFunction(() => window.__hubApi.api('dp').listar().some(e => /VELHA/.test(e.nome)), null, { timeout: 8000 });
    assert.equal(await page.evaluate((v) => window.__cadastro.ativa('ctb', 'c' + v, v), C.velha), true);
    await semear('ing_dados/gestta~gestta-empresas-ativas', man);
    await page.waitForFunction(() => !window.__hubApi.api('dp').listar().some(e => /VELHA/.test(e.nome)), null, { timeout: 8000 });
  });

  await passo('Entrada de dados: a seção do Gestta mostra as diferenças por empresa, filtra por módulo e nada é gravado antes de confirmar', async () => {
    await page.evaluate(() => window.__hubApi.abrirModulo('fontes'));
    const fr = page.frameLocator('#fontes-frame');
    await fr.locator('#gtDifs tr[data-gt-k]').first().waitFor({ timeout: 10000 });
    // Para decidir: Onvio e Gestta uma de cada vez; sem nada do Onvio, abre no Gestta; o topo conta os dois
    assert.equal(await fr.locator('#secCadastro').isVisible(), false); assert.equal(await fr.locator('#secGestta').isVisible(), true);
    assert.match(await fr.locator('[data-dec="gestta"]').textContent(), /Gestta\s*\d+/);
    assert.match(await fr.locator('#resumoTopo').textContent(), /Gestta: \d+ diferenças/);
    await fr.locator('[data-dec="onvio"]').click();
    assert.equal(await fr.locator('#secCadastro').isVisible(), true); assert.equal(await fr.locator('#secGestta').isVisible(), false);
    await fr.locator('[data-dec="gestta"]').click();
    assert.match(await fr.locator('#gtRef').textContent(), /4 empresas em atividade no Gestta/);
    assert.match(await fr.locator('#gtRef').textContent(), /4 analistas ativos no Gestta/);
    const n = await fr.locator('#gtDifs tr[data-gt-k]').count();
    assert.equal(n, (await difs()).length);
    assert.match(await fr.locator('#gtSub').textContent(), new RegExp(n + ' diferenças'));
    await fr.locator('[data-gt-mod="fiscal"]').click();
    assert.equal(await fr.locator('#gtDifs tr[data-gt-k]').count(), 3);
    await fr.locator('[data-gt-mod=""]').click();
    const antes = await page.evaluate(() => window.__gravacoes.length);
    await fr.locator('#gtDifs tr[data-gt-k="11111111000101"][data-gt-chave^="dp|responsavel"] [data-gt-aplicar]').click();
    await fr.locator('#dlgConf[open]').waitFor();
    await fr.locator('#dlgConf [value="cancel"], #dlgConf #confNao').first().click().catch(async () => { await page.keyboard.press('Escape'); });
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__gravacoes.length), antes, 'cancelar não grava');
    if (CAP) { await fr.locator('#secGestta').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(CAP, 'gestta-entrada-claro.png') }); }
  });

  await passo('Aplicar: complementa o DP com histórico, corrige o Contábil e o Portal pelo id da pessoa, e registra em gt_hist', async () => {
    const fr = page.frameLocator('#fontes-frame');
    await fr.locator('#gtDifs tr[data-gt-k="11111111000101"][data-gt-chave^="dp|responsavel"] [data-gt-aplicar]').click();
    await fr.locator('#dlgConf[open]').waitFor(); await fr.locator('#confSim').click();
    await page.waitForFunction(() => (window.__db.ler('dp_empresas/e-alfa') || {}).responsavel === 'Carla Mendes Souza', null, { timeout: 5000 });
    const e = await page.evaluate(() => window.__db.ler('dp_empresas/e-alfa'));
    assert.match(e.historico[0].alteracao, /Complementado pelo Gestta: Analista do Pessoal: — → Carla Mendes Souza/);
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
    await page.waitForFunction(() => window.__db.listar('gt_hist').flatMap(d => Array.isArray(d.itens) ? d.itens : [d]).length === 3, null, { timeout: 5000 });
    const hist = await page.evaluate(() => window.__db.listar('gt_hist').flatMap(d => Array.isArray(d.itens) ? d.itens : [d]));
    assert.ok(window_docs_ok(await page.evaluate(() => window.__db.listar('gt_hist'))), 'histórico num documento por mês e pessoa, não um por aplicação');
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
    // Rui (sem par na equipe do Portal) ligado à pessoa do Portal "R. Teixeira": a frente do Contábil passa a poder ser aplicada, e "R. Teixeira" conta como ativo
    assert.equal(await page.evaluate(() => window.__cadastro.analistaAtivo('R. Teixeira')), false);
    const r = await api((g) => g.salvarCfg(c => { c.analistas['rui teixeira'] = 'R. Teixeira'; }));
    assert.ok(r.ok);
    await page.waitForFunction(() => { const d = window.__hubApi.api('gestta').difs().find(x => x.mod === 'portal' && x.campo === 'analista-contabil'); return d && d.pode && d.depois === 'R. Teixeira'; }, null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => window.__cadastro.analistaAtivo('R. Teixeira')), true);
  });

  await passo('Automático: desligado de fábrica; ligado só complementa sozinho (o "conferir antes" fica), com "automaticamente" no histórico', async () => {
    assert.equal(await api((g) => g.auto().ligada), false);
    const antes = (await page.evaluate(() => window.__db.listar('gt_hist').flatMap(d => Array.isArray(d.itens) ? d.itens : [d]))).length;
    // alguém apagou o analista do DP da ALFA: há de novo o que complementar
    await page.evaluate(() => { const e = window.__db.ler('dp_empresas/e-alfa'); e.responsavel = ''; window.__db.semear('dp_empresas/e-alfa', e); });
    await page.waitForFunction(() => window.__hubApi.api('gestta').difs().some(d => d.mod === 'dp' && d.campo === 'responsavel' && d.acao === 'complementar'), null, { timeout: 5000 });
    await api((g) => g.salvarCfg(c => { c.auto.ligada = true; }));
    await page.waitForFunction((n) => window.__db.listar('gt_hist').flatMap(d => Array.isArray(d.itens) ? d.itens : [d]).length > n, antes, { timeout: 8000 });
    await page.waitForFunction(() => !window.__hubApi.api('gestta').auto().rodando, null, { timeout: 8000 });
    const novos = (await page.evaluate(() => window.__db.listar('gt_hist').flatMap(d => Array.isArray(d.itens) ? d.itens : [d]))).slice(antes);
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

  await passo('Módulos: o Contábil e o Portal do Cliente escondem a empresa sem tarefa no Gestta e tiram da carteira o analista inativo; ao salvar, o nome escondido não é apagado', async () => {
    await page.setViewportSize({ width: 1360, height: 900 });
    // os módulos só abrem com o login do Hub (auth.js): aqui um login simulado de coordenação
    await page.evaluate(() => { window.__auth = { nivel: () => 'coord', podeVer: () => true, ehAdmin: () => true, usuario: () => ({ id: 'u-teste', nome: 'Ana Teste' }), analista: () => '', perfis: () => Promise.resolve({}), aguardar: () => Promise.resolve(), onPendentes: () => {} }; });
    // Contábil: a VELHA some; a ALFA continua; Marcos Lima (inativo) sai da ALFA
    await page.evaluate(() => window.__hubApi.abrirModulo('contabil'));
    const ctbApi = () => page.evaluate(() => { const a = window.__hubApi.api('contabil'); return a && a.pronto && a.pronto() ? a.listar().map(e => [e.nome, e.analista]) : null; });
    for (let i = 0; i < 60 && !(await ctbApi()); i++) await page.waitForTimeout(250);
    await page.waitForFunction(() => { const a = window.__hubApi.api('contabil'); return a && a.listar().length === 1; }, null, { timeout: 8000 });
    assert.deepEqual(await ctbApi(), [['ALFA COMERCIO LTDA', '']], 'VELHA escondida; Marcos Lima (inativo) fora da carteira da ALFA');
    const c = page.frames().find(x => /contabil\.html/.test(x.url()));
    const txt = await c.evaluate(() => document.body.innerText);
    assert.ok(/Zélia Desconhecida/.test(txt) && !/Marcos Lima/.test(txt), 'a lista de analistas é a equipe do Contábil no Gestta');
    // salvar a ficha da ALFA por outro motivo (uma observação) não apaga o Marcos Lima gravado
    await page.evaluate(() => window.__hubApi.api('contabil').abrirEmpresa('c11111111000101'));
    await c.waitForSelector('#dlgFicha[open] #fForm');
    assert.equal(await c.$eval('#fForm [name="analista"]', el => el.value), '', 'na ficha a ALFA aparece sem analista');
    await c.fill('#fForm [name="obs"]', 'nota de teste');
    await c.click('#fSalvar');
    if (await c.locator('#dlgConf[open]').count()) await c.click('#confSim');          // o CNPJ fictício não confere o dígito
    await page.waitForFunction((p) => ((window.__db.ler(p) || {})['c11111111000101'] || {}).obs === 'nota de teste', 'ctb_emp/b' + balde('c' + C.alfa, 8), { timeout: 5000 });
    const gravado = await page.evaluate((p) => window.__db.ler(p)['c11111111000101'], 'ctb_emp/b' + balde('c' + C.alfa, 8));
    assert.deepEqual([gravado.analista, 'foraGestta' in gravado, Object.keys(gravado).some(k => /Oculto/.test(k))], ['Marcos Lima', false, false], 'o nome gravado fica; nada de campo interno no banco');
    // Portal: a VELHA some; a frente do Contábil sem a pessoa ativa fica vazia; "R. Teixeira" (ligado ao Rui) conta como da equipe
    await page.evaluate(() => window.__hubApi.abrirModulo('portal'));
    let fp = null; for (let i = 0; i < 60 && !fp; i++) { fp = page.frames().find(x => /portal\.html/.test(x.url())) || null; if (!fp) await page.waitForTimeout(250); }
    assert.ok(fp, 'o Portal abriu');
    // a frente Pessoal da ALFA tem a Carla (aplicada antes); deixo também a do Contábil com o Marcos Lima (inativo): ela some da frente
    await semear('empresaSetores/p-alfa_contabil', { empresaId: 'p-alfa', empresaNome: 'ALFA', setor: 'contabil', analistaId: 'fx', analistaNome: 'Marcos Lima', etapas: {} });
    await page.waitForFunction(() => { const a = window.__hubApi.api('portal'); return a && a.pronto && a.pronto() && a.empresas().length > 0; }, null, { timeout: 10000 });
    await page.waitForTimeout(600);
    const pt = await page.evaluate(() => { const a = window.__hubApi.api('portal'); return { emps: a.empresas().map(e => e.nome), ana: a.analistas() }; });
    assert.ok(!pt.emps.some(n => /VELHA/.test(n)) && pt.emps.some(n => /ALFA/.test(n)), 'VELHA fora do Portal: ' + pt.emps.join(', '));
    assert.deepEqual(pt.ana, ['Carla Souza'], 'Marcos Lima (inativo) sai da frente do Contábil; Carla segue na do Pessoal');
    assert.equal(await page.evaluate(() => window.__db.ler('empresaSetores/p-alfa_contabil').analistaNome), 'Marcos Lima', 'o gravado não muda');
    if (CAP) { await page.waitForTimeout(500); await page.screenshot({ path: path.join(CAP, 'portal-referencia.png') }); }
  });

  await passo('Hub 319: quem está no Portal só pelo primeiro nome casa com o nome do Gestta; o mesmo CNPJ duas vezes no Gestta não duplica diferenças', async () => {
    // Portal: a frente Contábil da DELTA com "Zélia" (só o primeiro nome); no Gestta é "Zélia Desconhecida", única com esse nome
    await semear('funcionarios/f5', { nome: 'Zélia' });
    await semear('empresas/p-delta', { nome: 'DELTA MEI', cnpj: fmt(C.delta) });
    await semear('empresaSetores/p-delta_contabil', { empresaId: 'p-delta', empresaNome: 'DELTA', setor: 'contabil', analistaId: 'f5', analistaNome: 'Zélia', etapas: {} });
    // Gestta: a DELTA cadastrada duas vezes (outro id, mesmo CNPJ)
    const linhas = CLIENTES.linhas.concat([['g4b', '4b', 'DELTA MEI', '', C.delta, 'sim', 'MEI', '', 'SP', 'Santos', '', 'não']]);
    await semear('ing_partes/gestta~gestta-clientes~a0', { ciclo: 'g2', parte: 0, tabela: tab(linhas) });
    const man = await page.evaluate(() => window.__db.ler('ing_dados/gestta~gestta-clientes'));
    await semear('ing_dados/gestta~gestta-clientes', Object.assign({}, man, { ciclo: 'g2', partes: 1, nLinhas: linhas.length, totalNaOrigem: linhas.length }));
    const cart = CARTELA.linhas.concat([['g4b', '4b', 'DELTA MEI', C.delta, 'Contábil', 's2', 'Zélia Desconhecida', 'u9']]);
    await semear('ing_partes/gestta~gestta-cartela~a0', { ciclo: 'g2', parte: 0, tabela: tab(cart) });
    const manC = await page.evaluate(() => window.__db.ler('ing_dados/gestta~gestta-cartela'));
    await semear('ing_dados/gestta~gestta-cartela', Object.assign({}, manC, { ciclo: 'g2', partes: 1, nLinhas: cart.length, totalNaOrigem: cart.length }));
    await esperar();
    await page.waitForFunction(() => { const g = window.__hubApi.api('gestta'); return !g.carregando() && g.difs().length > 0; }, null, { timeout: 8000 });
    const d = await api((g) => g.difs().map(x => x.k + '|' + x.chave));
    assert.equal(new Set(d).size, d.length, 'nenhuma diferença repetida: ' + d.join(' · '));
    const delta = await api((g, k) => g.difs().filter(x => x.k === k).map(x => x.mod + ' ' + x.campo), C.delta);
    assert.ok(!delta.some(x => x.startsWith('portal')), 'Zélia = Zélia Desconhecida: nada a corrigir no Portal: ' + delta.join(', '));
    assert.equal(delta.filter(x => x === 'contabil empresa').length, 1, 'DELTA nova no Contábil uma vez só');
    const ana = await api((g) => g.analistas().find(a => a.nome === 'Zélia Desconhecida').noHub.map(r => r.mod + ':' + r.casou));
    assert.ok(ana.length >= 1);
  });

  await passo('Hub 320: o histórico antigo (um documento por aplicação) é compactado em lotes e libera o banco, sem perder nem repetir registro', async () => {
    const antes = await page.evaluate(() => window.__db.listar('gt_hist').flatMap(d => Array.isArray(d.itens) ? d.itens : [d]).length);
    for (let i = 0; i < 7; i++) await semear('gt_hist/velho' + i, { em: '2026-10-0' + (i + 1) + 'T10:00:00.000Z', por: 'u', porNome: 'Teste', mod: 'dp', cnpj: '11111111000101', empresa: 'ALFA', campo: 'responsavel', acao: 'corrigir', antes: 'a', depois: 'b', auto: true });
    // um resto de compactação interrompida: já está no lote e ficou solto
    await semear('gt_hist/lote-out', { mes: '2026-09', compactado: true, ids: ['lote-out', 'resto1'], itens: [{ em: '2026-09-01T10:00:00.000Z', acao: 'corrigir' }, { em: '2026-09-02T10:00:00.000Z', acao: 'corrigir' }] });
    await semear('gt_hist/resto1', { em: '2026-09-02T10:00:00.000Z', acao: 'corrigir', mod: 'dp' });
    const r = await page.evaluate(() => window.__hubApi.api('gestta').compactarHistorico());
    assert.ok(r.ok, JSON.stringify(r));
    const docs = await page.evaluate(() => window.__db.listar('gt_hist'));
    assert.ok(!docs.some(d => !Array.isArray(d.itens)), 'nenhum registro solto: ' + docs.map(d => d.id).join(', '));
    const itens = docs.flatMap(d => d.itens);
    assert.equal(itens.length, antes + 7 + 2, 'todos os registros ficaram, sem repetir');
    assert.equal(r.apagados, 7, '6 do lote de outubro + o resto já compactado');
  });

  await passo('Uso do banco mede também o histórico do Gestta e o login', async () => {
    const cols = await page.evaluate(() => window.__hubApi.usoColecoes ? window.__hubApi.usoColecoes().map(c => c.path) : null);
    if (cols) assert.ok(['gt_hist', 'auth_log', 'hub_log'].every(c => cols.includes(c)), cols.join(', '));
  });

  await passo('sem erros de página', async () => { assert.deepEqual(erros, []); });
  await browser.close(); servidor.close();
  console.log(falhas ? 'FALHARAM: ' + falhas : 'tudo ok');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

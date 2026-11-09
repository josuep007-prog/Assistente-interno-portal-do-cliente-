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
const ATIVAS = { colunas: ['CNPJ', 'Cliente', 'Tarefas', 'Último mês'], linhas: [[C.alfa, 'ALFA COMERCIO LTDA', 30, '2026-11'], [C.beta, 'BETA SERVICOS LTDA', 12, '2026-11'], [C.gama, 'GAMA INDUSTRIA LTDA', 8, '2026-10'], [C.delta, 'DELTA MEI', 2, '2026-11'], ['', 'MARIA EMPREGADORA DOMESTICA', 3, '2026-11']] };
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
  // Hub 323 ("várias empresas sumiram do DP"): filial de cliente do Gestta, empresa sem CNPJ, CNPJ diferente do Gestta e empregador doméstico (sem CNPJ no Gestta) ficam
  await semear('dp_empresas/e-filial', { nome: 'ALFA COMERCIO LTDA FILIAL', cnpj: fmt('11111111000282'), situacao: 'Ativa', funcionarios: [], historico: [] });
  await semear('dp_empresas/e-semcnpj', { nome: 'GAMA INDUSTRIA', cnpj: '', situacao: 'Ativa', funcionarios: [], historico: [] });
  await semear('dp_empresas/e-cnpjdif', { nome: 'DELTA MEI', cnpj: fmt('99999999000199'), situacao: 'Ativa', funcionarios: [], historico: [] });
  await semear('dp_empresas/e-domestica', { nome: 'MARIA EMPREGADORA DOMESTICA', cnpj: '123.456.789-09', situacao: 'Ativa', funcionarios: [], historico: [] });
  await semear('dp_empresas/e-folha', { nome: 'ZULU COM FOLHA LTDA', cnpj: fmt('88888888000108'), situacao: 'Ativa', funcionarios: [{ id: 'z1', nome: 'Empregado Ativo', admissao: '2024-01-02', situacao: 'Ativo' }], historico: [] });
  await semear('dp_empresas/e-sumiu', { nome: 'OUTRA SEM CNPJ NEM TAREFA', cnpj: '', situacao: 'Ativa', funcionarios: [], historico: [] });
  await semear('dp_empresas/e-delta', { nome: 'DELTA MEI', cnpj: fmt(C.delta), tributacao: 'MEI', responsavel: 'Marcos Lima', situacao: 'Ativa', funcionarios: [], historico: [] });
  await semear('ctb_emp/b' + balde('c' + C.velha, 8), { ['c' + C.velha]: { id: 'c' + C.velha, nome: 'VELHA SEM TAREFA LTDA', cnpj: fmt(C.velha), trib: 'simples', analista: 'Rui Teixeira', sit: 'ativa' } });
  await semear('empresas/p-velha', { nome: 'VELHA SEM TAREFA LTDA', cnpj: fmt(C.velha) });
  await semear('funcionarios/f3', { nome: 'R. Teixeira' });
  // Contábil: ALFA com outro analista e Presumido (o Gestta diz Simples)
  await semear('ctb_emp/b' + balde('c' + C.alfa, 8), { ['c' + C.alfa]: { id: 'c' + C.alfa, nome: 'ALFA COMERCIO LTDA', cnpj: fmt(C.alfa), trib: 'presumido', analista: 'Marcos Lima', sit: 'ativa' } });
  // Portal: ALFA com as frentes Pessoal e Fiscal (sem analista); equipe do Portal com Carla e Paula
  await semear('empresas/p-alfa', { nome: 'ALFA COMERCIO LTDA', cnpj: fmt(C.alfa), setoresDemanda: { pessoal: true, contabil: true } });
  await semear('empresaSetores/p-alfa_pessoal', { empresaId: 'p-alfa', empresaNome: 'ALFA', setor: 'pessoal', analistaId: '', analistaNome: '', etapas: {} });
  await semear('empresaSetores/p-alfa_contabil', { empresaId: 'p-alfa', empresaNome: 'ALFA', setor: 'contabil', analistaId: '', analistaNome: '', etapas: {} });
  await semear('funcionarios/f1', { nome: 'Carla Souza' });
  await semear('funcionarios/f2', { nome: 'Paula Nunes' });
  // Hub 326: o Portal pelo Gestta vem ligado de fábrica; os passos antigos conferem as diferenças à mão (ele é ligado no passo do Hub 326)
  await semear('gt_config/cfg', { portal: false });
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
    // Portal: só as frentes que existem; Contábil sem a pessoa na equipe do Portal também pode ser aplicado (Hub 324: a pessoa entra na equipe)
    const pt = d.filter(x => x[0] === 'portal').map(x => [x[2], x[5], x[7]]);
    assert.deepEqual(pt.filter(x => /^analista/.test(x[0])).sort(), [['analista-contabil', 'Rui Teixeira', true], ['analista-pessoal', 'Carla Souza', true]]);
    // Hub 326: a demanda do Fiscal da ALFA liga; BETA, GAMA e DELTA entram no Portal com os setores que têm demanda no Gestta
    assert.deepEqual(d.filter(x => x[0] === 'portal' && !/^analista/.test(x[2])).map(x => x[1] + ' ' + x[2] + ' ' + x[3] + ' ' + x[5]).sort(),
      ['11 demanda-fiscal novo com demanda', '22 empresa novo BETA SERVICOS LTDA', '33 empresa novo GAMA INDUSTRIA LTDA', '44 empresa novo DELTA MEI'], 'portal: ' + JSON.stringify(pt));
    assert.ok(!d.some(x => x[1] === '55' || x[1] === '66'), 'inativo e empresa do escritório nunca entram');
    assert.ok(!d.some(x => x[2] === 'empresa' && x[0] === 'dp' && x[1] === '33'), 'Legalização não é módulo do Hub');
  });

  await passo('Referência absoluta: empresa sem tarefa no Gestta some do DP, do Contábil, do Portal e do cadastro; analista fora da equipe sai da carteira; a lista do Gestta faltando não esconde nada', async () => {
    const dp = () => page.evaluate(() => window.__hubApi.api('dp').listar().map(e => [e.nome, e.analista]).sort());
    await page.waitForFunction(() => !window.__hubApi.api('dp').listar().some(e => /VELHA/.test(e.nome)), null, { timeout: 8000 });
    assert.deepEqual(await dp(), [['ALFA COMERCIO LTDA FILIAL', ''], ['ALFA COMERCIO LTDA', ''], ['BETA SERVICOS LTDA', 'Carla Souza'], ['DELTA MEI', ''], ['DELTA MEI', ''], ['GAMA INDUSTRIA', ''], ['MARIA EMPREGADORA DOMESTICA', ''], ['ZULU COM FOLHA LTDA', '']], 'VELHA e a sem CNPJ nem tarefa escondidas; filial, sem CNPJ, CNPJ diferente, doméstica e a com empregado ativo (sem tarefa no Gestta) ficam; Marcos Lima (inativo no Gestta) sai da DELTA');
    assert.deepEqual(await page.evaluate(() => window.__hubApi.cfg.dp.equipe()), ['Carla Mendes Souza'], 'a equipe do DP é a do Gestta');
    const cad = await page.evaluate(([v, a]) => [window.__cadastro.ativa('ctb', 'c' + v, v), window.__cadastro.ativa('ctb', 'c' + a, a), window.__cadastro.ativa('portal', 'p-velha', v), window.__cadastro.analistaAtivo('Marcos Lima'), window.__cadastro.analistaAtivo('Carla Souza'), window.__cadastro.analistaGestta('Carla Souza'), window.__cadastro.analistas('ctb')], [C.velha, C.alfa]);
    assert.deepEqual(cad, [false, true, false, false, true, 'Carla Mendes Souza', ['Rui Teixeira', 'Zélia Desconhecida']]);
    assert.equal(await page.evaluate(() => window.__db.ler('dp_empresas/e-velha').nome), 'VELHA SEM TAREFA LTDA', 'nada é apagado');
    assert.equal(await page.evaluate(() => window.__db.ler('dp_empresas/e-delta').responsavel), 'Marcos Lima', 'o nome gravado fica');
    await esperar();
    const ref = await api((g) => g.referencia());
    assert.deepEqual([ref.empresas.ok, ref.empresas.n, ref.analistas.ok, ref.fora.dp, ref.fora.contabil, ref.fora.portal], [true, 5, true, ['OUTRA SEM CNPJ NEM TAREFA · sem CNPJ e o nome não está no Gestta', 'VELHA SEM TAREFA LTDA · 77.777.777/0001-07 · CNPJ sem tarefa no Gestta'], ['VELHA SEM TAREFA LTDA · 77.777.777/0001-07 · CNPJ sem tarefa no Gestta'], ['VELHA SEM TAREFA LTDA · 77.777.777/0001-07 · CNPJ sem tarefa no Gestta']]);
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
    assert.match(await fr.locator('#gtRef').textContent(), /5 empresas em atividade no Gestta/);
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
    assert.ok(r3.ok, 'Hub 324: a pessoa que falta entra na equipe do Portal e a frente fica com ela: ' + JSON.stringify(r3));
    const ruis = await page.evaluate(() => window.__db.listar('funcionarios').filter(f => f.nome === 'Rui Teixeira'));
    assert.equal(ruis.length, 1, 'cadastrada uma vez');
    assert.equal(ruis[0].setor, 'contabil'); assert.equal(ruis[0].cargo, 'Analista');
    const fr3 = await page.evaluate(() => window.__db.listar('empresaSetores').find(x => /_contabil$/.test(x.__id || '') || x.analistaNome === 'Rui Teixeira'));
    assert.ok(fr3 && fr3.analistaNome === 'Rui Teixeira' && fr3.analistaId, 'a frente aponta para a pessoa nova');
    await page.waitForFunction(() => window.__db.listar('gt_hist').flatMap(d => Array.isArray(d.itens) ? d.itens : [d]).length === 4, null, { timeout: 5000 });
    const hist = await page.evaluate(() => window.__db.listar('gt_hist').flatMap(d => Array.isArray(d.itens) ? d.itens : [d]));
    assert.ok(window_docs_ok(await page.evaluate(() => window.__db.listar('gt_hist'))), 'histórico num documento por mês e pessoa, não um por aplicação');
    assert.equal(hist.length, 4); assert.ok(hist.every(h => !h.auto && h.cnpj === '11111111000101'));
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
    const ligouEm = await page.evaluate(() => Date.now());
    await api((g) => g.salvarCfg(c => { c.auto.ligada = true; }));
    await page.waitForFunction((n) => window.__db.listar('gt_hist').flatMap(d => Array.isArray(d.itens) ? d.itens : [d]).length > n, antes, { timeout: 8000 });
    await page.waitForFunction(() => !window.__hubApi.api('gestta').auto().rodando, null, { timeout: 8000 });
    const novos = (await page.evaluate(() => window.__db.listar('gt_hist').flatMap(d => Array.isArray(d.itens) ? d.itens : [d]))).slice(antes);
    assert.ok(novos.length >= 1 && novos.every(h => h.auto && h.acao === 'complementar'), JSON.stringify(novos.map(h => [h.mod, h.acao])));
    await page.waitForTimeout(2500);
    { const rs = await page.evaluate((t) => window.__db.listar('hub_restauro').filter(d => d.em >= t).map(d => d.path + ' ' + d.t), ligouEm); assert.deepEqual(rs, [], 'a aplicação automática não cria ponto de restauração'); }
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
    await semear('empresas/p-delta', { nome: 'DELTA MEI', cnpj: fmt(C.delta), setoresDemanda: { contabil: true } });
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

  await passo('Hub 321: pontos de restauração ficam nos 150 mais novos e em até 3 dias; a aplicação automática não cria ponto', async () => {
    const agora = Date.now();
    for (let i = 0; i < 160; i++) await page.evaluate(([i, t]) => window.__db.silencioso('hub_restauro/r' + i, { path: 'dp_empresas/x', em: t - i * 1000, u: 'Teste', t: 'teste', antes: '{}' }), [i, agora]);
    await semear('hub_restauro/velho', { path: 'dp_empresas/x', em: agora - 4 * 864e5, u: 'Teste', t: 'velho', antes: '{}' });
    const r = await page.evaluate(() => window.__hubApi.api('gestta').podarRestauro());
    assert.ok(r.ok, JSON.stringify(r));
    const ids = await page.evaluate(() => window.__db.listar('hub_restauro').map(d => d.id));
    assert.ok(ids.length <= 150 && !ids.includes('velho') && ids.includes('r0'), ids.length + ' pontos');
  });

  await passo('Hub 322: analista ativa sem setor no cadastro do Gestta entra no módulo pelo setor da cartela', async () => {
    const eq = EQUIPE.linhas.concat([['u10', 'Thais Exemplo', 'Analista', 'sim', '', 'sim'], ['u11', 'Sem Cartela', 'Analista', 'sim', '', 'sim']]);
    await semear('ing_partes/gestta~gestta-equipe~a0', { ciclo: 'g3', parte: 0, tabela: tab(eq) });
    const manE = await page.evaluate(() => window.__db.ler('ing_dados/gestta~gestta-equipe'));
    await semear('ing_dados/gestta~gestta-equipe', Object.assign({}, manE, { ciclo: 'g3', partes: 1, nLinhas: eq.length, totalNaOrigem: eq.length }));
    const cart = CARTELA.linhas.concat([['g3', '3', 'GAMA INDUSTRIA LTDA', C.gama, 'Contábil', 's2', 'Thais Exemplo', 'u10']]);
    await semear('ing_partes/gestta~gestta-cartela~a0', { ciclo: 'g3', parte: 0, tabela: tab(cart) });
    const manC = await page.evaluate(() => window.__db.ler('ing_dados/gestta~gestta-cartela'));
    await semear('ing_dados/gestta~gestta-cartela', Object.assign({}, manC, { ciclo: 'g3', partes: 1, nLinhas: cart.length, totalNaOrigem: cart.length }));
    await page.waitForFunction(() => (window.__cadastro.analistas('ctb') || []).includes('Thais Exemplo'), null, { timeout: 10000 });
    const ana = await page.evaluate(() => [window.__cadastro.analistas('ctb'), window.__cadastro.analistaAtivo('Thais Exemplo'), window.__cadastro.analistaAtivo('Sem Cartela')]);
    assert.ok(ana[0].includes('Thais Exemplo') && !ana[0].includes('Sem Cartela'), JSON.stringify(ana[0]));
    assert.deepEqual(ana.slice(1), [true, true], 'as duas continuam ativas no Gestta');
  });

  await passo('Hub 325: Fiscal e Contábil pelo Gestta: tarefa concluída marca sozinha a obrigação e a etapa vazias, a manual fica, desfazer não volta, a atrasada aparece e dado velho não marca', async () => {
    const d1 = new Date(); d1.setDate(1); d1.setMonth(d1.getMonth() - 1);
    const CP = d1.getFullYear() + '-' + String(d1.getMonth() + 1).padStart(2, '0');        // a competência em fechamento (o Fiscal mostra a dela)
    const cols = ['Mês', 'Id', 'Tarefa', 'Setor', 'Responsável', 'Situação', 'Meta', 'Concluída em', 'Concluída com atraso', 'Gerando multa', 'CNPJ', 'Cliente', 'Competência'];
    const linhas = [
      ['2026-10', 't10', 'DCTFWeb', 'Fiscal', 'Paula Nunes', 'Concluída', '2026-10-15', '2026-10-14 13:00', 'não', 'não', C.alfa, 'ALFA COMERCIO LTDA', CP],
      ['2026-10', 't11', 'EFD-Reinf', 'Fiscal', 'Paula Nunes', 'Concluída', '2026-10-15', '2026-10-15 12:00', 'não', 'não', C.alfa, 'ALFA COMERCIO LTDA', CP],
      ['2026-10', 't12', 'PGDAS-D', 'Fiscal', 'Paula Nunes', 'Aberta', '2026-10-20', '', 'não', 'não', C.gama, 'GAMA INDUSTRIA LTDA', CP],
      ['2026-10', 't13', 'Conciliação bancária', 'Contábil', 'Rui Teixeira', 'Concluída', '2026-10-25', '2026-10-28 15:00', 'sim', 'não', C.alfa, 'ALFA COMERCIO LTDA', CP],
      ['2026-10', 't14', 'Tarefa esquisita XYZ', 'Fiscal', 'Paula Nunes', 'Concluída', '2026-10-25', '2026-10-25 10:00', 'não', 'não', C.alfa, 'ALFA COMERCIO LTDA', CP],
      ['2026-10', 't15', 'DCTFWeb', 'Fiscal', 'Paula Nunes', 'Concluída', '2026-10-15', '2026-10-15 10:00', 'não', 'não', C.esc, 'CONTROLTAX CONTABILIDADE', CP]];
    const fisDoc = 'fis_comp/' + CP + '~' + balde('c' + C.alfa, 4), ctbDoc = 'ctb_comp/' + CP + '~' + balde('c' + C.alfa, 4);
    await semear(fisDoc, { ['c' + C.alfa]: { ob: { reinf: ['r', '2026-10-10', 'u-manual'] } } });       // marcação manual: o Gestta não troca
    await semear('ing_partes/gestta~gestta-tarefas~a0', { ciclo: 'g9', parte: 0, tabela: tab(linhas) });
    const man = await page.evaluate(() => window.__db.ler('ing_dados/gestta~gestta-tarefas'));
    await semear('ing_dados/gestta~gestta-tarefas', Object.assign({}, man, { colunas: cols, ciclo: 'g9', partes: 1, nLinhas: linhas.length, totalNaOrigem: linhas.length, recebidoEm: Date.now(), cortado: false }));
    await page.waitForFunction((cp) => { const t = window.__cadastro.tarefa('fis', '', '33333333000103', cp, 'pgdas'); return !!t; }, CP, { timeout: 10000 });
    assert.equal((await page.evaluate((cp) => window.__cadastro.tarefa('fis', '', '33333333000103', cp, 'pgdas'), CP)).estado, 'atrasada', 'aberta com a meta vencida');
    await page.evaluate(() => window.__cadastro.marcarAgora());
    await page.waitForFunction((p) => { const d = window.__db.ler(p); return d && Object.values(d).some(e => e && e.ob && e.ob.dctfweb); }, fisDoc, { timeout: 10000 });
    const fis = (await page.evaluate((p) => window.__db.ler(p), fisDoc))['c' + C.alfa];
    assert.deepEqual(fis.ob.dctfweb, ['c', '2026-10-14', 'gestta'], 'a data da conclusão (local) e a origem');
    assert.deepEqual(fis.ob.reinf, ['r', '2026-10-10', 'u-manual'], 'a marcação manual fica');
    assert.equal(Object.keys(fis.ob).length, 2, 'a tarefa que não é obrigação não marca nada');
    await page.waitForFunction((p) => !!window.__db.ler(p), ctbDoc, { timeout: 10000 });
    const ctb = (await page.evaluate((p) => window.__db.ler(p), ctbDoc))['c' + C.alfa];
    assert.deepEqual(ctb.e.conc, ['c', '2026-10-28', 'gestta']); assert.ok(!ctb.fechadaEm, 'só uma etapa: não fecha a competência');
    assert.ok(!(await page.evaluate(() => window.__db.listar('fis_comp'))).some(d => JSON.stringify(d).includes('66666666')), 'empresa do escritório nunca');
    // não reconhecidas e a régua da equipe
    assert.deepEqual(await api((g) => g.tarefasMapa('fiscal').filter(x => !x.chave).map(x => x.nome)), ['Tarefa esquisita XYZ']);
    const eq = await page.evaluate((cp) => window.__cadastro.tarefasEquipe('fis', cp), CP);
    assert.deepEqual(eq.map(x => [x.nome, x.atrasadas, x.feitas]), [['Paula Nunes', 1, 3]]);
    // desfazer (coordenação): a marca sai e não volta na próxima marcação
    assert.ok((await page.evaluate(([c, cp]) => window.__cadastro.desfazerMarca('fis', 'c' + c, c, cp, 'dctfweb'), [C.alfa, CP])).ok);
    const d0 = await page.evaluate((p) => window.__db.ler(p), fisDoc); delete d0['c' + C.alfa].ob.dctfweb; delete d0.id;
    await semear(fisDoc, d0);
    await page.evaluate(() => window.__cadastro.marcarAgora()); await page.waitForTimeout(600);
    assert.ok(!(await page.evaluate((p) => window.__db.ler(p), fisDoc))['c' + C.alfa].ob.dctfweb, 'desfeita não volta');
    // a coordenação liga um nome de tarefa a uma obrigação: passa a marcar
    assert.ok((await api((g) => g.salvarCfg(c => { c.mapa = { fiscal: [{ p: 'Tarefa esquisita XYZ', k: 'iss' }] }; }))).ok);
    await page.evaluate(() => window.__cadastro.marcarAgora());
    await page.waitForFunction((p) => { const d = window.__db.ler(p); return d && Object.values(d).some(e => e && e.ob && e.ob.iss); }, fisDoc, { timeout: 10000 });
    // dado velho: nada aparece nem é marcado
    const man9 = await page.evaluate(() => window.__db.ler('ing_dados/gestta~gestta-tarefas'));
    await semear('ing_dados/gestta~gestta-tarefas', Object.assign({}, man9, { recebidoEm: Date.now() - 80 * 3600e3 }));
    await page.waitForFunction(() => !!window.__cadastro.tarefasMotivo(), null, { timeout: 10000 });
    assert.equal(await page.evaluate((cp) => window.__cadastro.tarefa('fis', '', '33333333000103', cp, 'pgdas'), CP), null);
    assert.match(await page.evaluate(() => window.__cadastro.tarefasMotivo()), /mais de 72 horas/);
    await semear('ing_dados/gestta~gestta-tarefas', man9);
    // o Fiscal mostra a marca "pelo Gestta" e o quadro das tarefas por responsável
    await page.evaluate(() => window.__hubApi.abrirModulo('fiscal'));
    let fr = null; for (let i = 0; i < 60 && !fr; i++) { fr = page.frames().find(x => /fiscal\.html/.test(x.url())); if (!fr) await page.waitForTimeout(200); }
    await fr.waitForFunction(() => /Pelo Gestta/.test((document.querySelector('#pnGrid') || {}).textContent || ''), null, { timeout: 15000 });
    await fr.waitForFunction(() => /Responsável/.test((document.querySelector('#pnGrid') || {}).textContent || ''), null, { timeout: 15000 });
    assert.match(await fr.textContent('#pnGrid'), /Pelo Gestta.*Paula Nunes/s, 'a tabela das tarefas por responsável da competência em fechamento');
    if (CAP) {
      await fr.evaluate(() => { const l = document.querySelectorAll('#pnGrid .pn-card'); l[l.length - 1].scrollIntoView(); });
      await page.screenshot({ path: path.join(CAP, 'hub325-fiscal-claro.png') });
      await fr.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await page.waitForTimeout(1200);
      await fr.evaluate(() => { const l = document.querySelectorAll('#pnGrid .pn-card'); l[l.length - 1].scrollIntoView(); });
      await page.screenshot({ path: path.join(CAP, 'hub325-fiscal-escuro.png') });
      await fr.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    }
  });

  await passo('Hub 326: o Portal segue o Gestta sozinho: empresa nova com a frente e o analista, demanda que liga e desliga, mudança à mão respeitada, e-mail completado e os contatos do Gestta na tela', async () => {
    // contatos de quem recebe cada setor (extensão 0.88.0), dados fictícios; o inativo no Gestta não entra
    const colsC = ['Id do cliente', 'Código do cliente', 'Cliente', 'CNPJ', 'Setor', 'Id do setor', 'Contato', 'E-mail', 'Ativo', 'Id do contato'];
    const lc = [['g1', '1', 'ALFA COMERCIO LTDA', C.alfa, 'Departamento Pessoal', 's1', 'Joana Cliente', 'joana@exemplo.com', 'sim', 'k1'],
      ['g1', '1', 'ALFA COMERCIO LTDA', C.alfa, 'Departamento Pessoal', 's1', 'Pedro Novo', 'pedro.novo@exemplo.com', 'sim', 'k2'],
      ['g1', '1', 'ALFA COMERCIO LTDA', C.alfa, 'Fiscal', 's3', 'Fora Cliente', 'fora@exemplo.com', 'não', 'k3']];
    await semear('ing_partes/gestta~gestta-contatos~a0', { ciclo: 'c1', parte: 0, tabela: tab(lc) });
    await semear('ing_dados/gestta~gestta-contatos', { fonte: 'gestta', tipoDado: 'gestta-contatos', categoria: 'cadastros', titulo: 'Contatos', colunas: colsC, nLinhas: lc.length, totalNaOrigem: 1, cortado: false, partes: 1, slot: 'a', ciclo: 'c1', recebidoEm: Date.now(), versaoExt: '0.88.0' });
    // Portal: contato da ALFA sem e-mail (ganha o do Gestta) e outro que não está no Gestta; DELTA com demanda no Pessoal que o Gestta não tem
    await semear('contatos/ct-joana', { nome: 'Joana Cliente', email: '', empresaId: 'p-alfa', empresaNome: 'ALFA', setores: ['pessoal'], statusTreinamento: 'pendente' });
    await semear('contatos/ct-antigo', { nome: 'Contato Antigo', email: 'antigo@exemplo.com', empresaId: 'p-alfa', empresaNome: 'ALFA', setores: ['pessoal'], statusTreinamento: 'pendente' });
    await semear('empresas/p-delta', { nome: 'DELTA MEI', cnpj: fmt(C.delta), setoresDemanda: { contabil: true, pessoal: true } });
    const nAntes = await page.evaluate(() => window.__db.listar('contatos').length);
    // a coordenação liga (vem ligado de fábrica; os passos antigos desligaram) e o Hub aplica sozinho
    assert.ok((await api((g) => g.salvarCfg(c => { c.portal = true; }))).ok);
    await page.waitForFunction((k) => { const e = window.__db.ler('empresas/gt' + k); return !!e; }, C.gama, { timeout: 20000 });
    await page.waitForFunction(() => { const g = window.__hubApi.api('gestta'); return g && g.portal().ultima && !g.portal().rodando; }, null, { timeout: 20000 });
    const gama = await page.evaluate((k) => window.__db.ler('empresas/gt' + k), C.gama);
    assert.deepEqual([gama.nome, gama.cnpj, gama.setoresDemanda.fiscal, gama.gtDem.fiscal, gama.setoresDemanda.pessoal, /Gestta/.test(gama.origem)], ['GAMA INDUSTRIA LTDA', fmt(C.gama), true, true, false, true], 'empresa nova com a demanda do Gestta');
    const frG = await page.evaluate((k) => window.__db.ler('empresaSetores/gt' + k + '_fiscal'), C.gama);
    assert.deepEqual([frG.analistaNome, frG.gtAnalista, !!frG.analistaId], ['Paula Nunes', 'Paula Nunes', true], 'a frente com o analista da cartela');
    // ALFA: a demanda do Fiscal liga, com a frente e a analista
    const alfa = await page.evaluate(() => window.__db.ler('empresas/p-alfa'));
    assert.deepEqual([alfa.setoresDemanda.fiscal, alfa.gtDem.fiscal], [true, true]);
    assert.equal((await page.evaluate(() => window.__db.ler('empresaSetores/p-alfa_fiscal'))).analistaNome, 'Paula Nunes');
    // DELTA: o Pessoal sem demanda no Gestta sai (nada é apagado: só a marca da demanda)
    const delta = await page.evaluate(() => window.__db.ler('empresas/p-delta'));
    assert.deepEqual([delta.setoresDemanda.pessoal, delta.setoresDemanda.contabil, delta.gtDem.pessoal], [false, true, false]);
    // e-mail: o contato sem e-mail ganha o do Gestta; nenhum contato novo é criado sozinho (o banco tem 5.000 documentos)
    assert.equal((await page.evaluate(() => window.__db.ler('contatos/ct-joana'))).email, 'joana@exemplo.com');
    assert.equal(await page.evaluate(() => window.__db.listar('contatos').length), nAntes, 'nenhum contato criado');
    // histórico "automaticamente"
    const hist = await page.evaluate(() => window.__db.listar('gt_hist').flatMap(d => d.itens || []).filter(x => x.mod === 'portal' && x.auto));
    assert.ok(hist.some(x => x.campo === 'empresa') && hist.some(x => /^demanda-/.test(x.campo)) && hist.some(x => /^email-/.test(x.campo)), 'histórico: ' + hist.map(x => x.campo).join(', '));
    // nada do Portal sobra para decidir (salvo o "conferir antes")
    assert.deepEqual(await api((g) => g.difs().filter(d => d.mod === 'portal' && !d.confirmar).map(d => d.campo)), []);
    // mudança à mão: a coordenação desliga o Fiscal da ALFA no Portal; o Gestta não religa enquanto ele mesmo não mudar
    const a2 = await page.evaluate(() => window.__db.ler('empresas/p-alfa')); a2.setoresDemanda.fiscal = false; delete a2.id;
    await semear('empresas/p-alfa', a2);
    await api((g) => g.garantir(true)); await page.waitForTimeout(300);
    await api((g) => g.portalAgora()); await page.waitForTimeout(500);
    assert.equal((await page.evaluate(() => window.__db.ler('empresas/p-alfa'))).setoresDemanda.fiscal, false, 'a mudança à mão vale');
    assert.ok(!(await api((g) => g.difs().some(d => d.mod === 'portal' && d.campo === 'demanda-fiscal'))), 'e não vira diferença');
    // os contatos do Gestta para o Portal: os ativos, por setor
    assert.deepEqual(await page.evaluate((k) => window.__cadastro.contatosGestta('portal', 'p-alfa', k).map(x => x.setor + ' ' + x.nome + ' ' + x.email), C.alfa), ['pessoal Joana Cliente joana@exemplo.com', 'pessoal Pedro Novo pedro.novo@exemplo.com']);
    // a tela do Portal: a busca acha a empresa pelo e-mail do Gestta; a frente mostra quem falta, com Copiar e Incluir no Portal, e o aviso do contato fora do Gestta
    await page.evaluate(() => window.__hubApi.abrirModulo('portal'));
    let fp = null; for (let i = 0; i < 60 && !fp; i++) { fp = page.frames().find(x => /portal\.html/.test(x.url())) || null; if (!fp) await page.waitForTimeout(250); }
    await page.waitForFunction(() => { const a = window.__hubApi.api('portal'); return a && a.pronto && a.pronto() && a.empresas().length > 0; }, null, { timeout: 15000 });
    await page.evaluate(() => window.__hubApi.api('portal').irPara('progresso'));
    await fp.fill('#empresaSearch', 'pedro.novo');
    await fp.waitForFunction(() => document.querySelectorAll('#progressoList .erow, .erow').length === 1, null, { timeout: 10000 });
    await fp.click('.erow[data-id="p-alfa"] .erow-main');
    await fp.waitForSelector('.erow[data-id="p-alfa"] .gt-contatos', { timeout: 10000 });
    const txt = await fp.textContent('.erow[data-id="p-alfa"]');
    assert.match(txt, /No Gestta, recebem Pessoal.*Pedro Novo.*pedro\.novo@exemplo\.com.*Incluir no Portal/s);
    assert.ok(!/Fora Cliente/.test(txt), 'inativo no Gestta não aparece');
    assert.match(txt, /Contato Antigo.*não está no Gestta/s, 'o contato do Portal que não recebe o setor no Gestta');
    assert.ok(await fp.$('.erow[data-id="p-alfa"] .gt-copiar[data-email="joana@exemplo.com"]'), 'copiar o e-mail do contato');
    if (CAP) { await fp.evaluate(() => document.querySelector('.erow[data-id="p-alfa"] .gt-contatos').scrollIntoView({ block: 'center' })); await page.waitForTimeout(400); await page.screenshot({ path: path.join(CAP, 'hub326-portal-claro.png') });
      await fp.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await page.waitForTimeout(800); await page.screenshot({ path: path.join(CAP, 'hub326-portal-escuro.png') }); await fp.evaluate(() => document.documentElement.setAttribute('data-theme', 'light')); }
    // Incluir no Portal cria o contato (é a pessoa que pede)
    await fp.click('.erow[data-id="p-alfa"] [data-action="gt-contato-incluir"][data-email="pedro.novo@exemplo.com"]');
    await page.waitForFunction(() => window.__db.listar('contatos').some(c => c.email === 'pedro.novo@exemplo.com' && c.empresaId === 'p-alfa'), null, { timeout: 10000 });
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

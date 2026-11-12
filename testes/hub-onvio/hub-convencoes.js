/* Teste de navegador do Control Hub, módulo Convenções (Hub 351, Josué 12/11/2026): a convenção acompanhada.
 * O analista cadastra a convenção pelo CNPJ dos dois sindicatos (laboral e patronal, obrigatórios), liga as empresas e busca no Mediador:
 * a convenção mais recente do par e os aditivos dela entram no módulo; as empresas passam a ter a convenção pelo vínculo direto (o código
 * do sindicato não liga mais); da data-base em diante a busca é diária e a nova achada sozinha espera o analista salvar.
 * Dados FICTÍCIOS, banco simulado (o mesmo de hub-onvio.js), extensão simulada respondendo ao pedido mediadorConvencao.
 *   HUB_DIR=<pasta com hub.js, hub.css, tema.js e index.fonte.html> NODE_PATH=$(npm root -g) node testes/hub-onvio/hub-convencoes.js
 *   CAP=<pasta> grava capturas (claro e escuro). */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const HUB = process.env.HUB_DIR;
if (!HUB || !fs.existsSync(path.join(HUB, 'hub.js'))) { console.log('HUB_DIR não definido: teste das convenções pulado.'); process.exit(0); }
const CAP = process.env.CAP || '';
const TIPOS_MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8' };
const servidor = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/index.html' || u === '/') { res.writeHead(200, { 'content-type': TIPOS_MIME['.html'] }); return res.end('<!doctype html><html><head><meta charset="utf8"></head><body>' + fs.readFileSync(path.join(HUB, 'index.fonte.html'), 'utf8')); }
  if (['/auth.js', '/extras.js', '/assistente.js'].includes(u)) { res.writeHead(200, { 'content-type': TIPOS_MIME['.js'] }); return res.end(''); }
  const f = path.join(HUB, path.basename(u));
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TIPOS_MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
const BANCO = fs.readFileSync(path.join(__dirname, 'hub-onvio.js'), 'utf8').match(/const BANCO = `([\s\S]*?)`;/)[1];
const LAB = '11222333000181', PAT = '11444777000161', OUTRO = '22333444000172';      // CNPJs válidos de exemplo (não são de cliente)
const fmt = (c) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
const ano = new Date().getFullYear(), mesAt = new Date().getMonth();
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
// a convenção vigente começou no mês atual do ano passado (data-base = mês atual): a janela da nova já está aberta
const ymd = (a, m, d) => `${a}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const fimDe = (a, m) => { const d = new Date(a + 1, m, 0); return ymd(d.getFullYear(), d.getMonth(), d.getDate()); };
const inst = (sol, reg, aditivo, ini, fim) => ({ solicitacao: sol, registro: reg, processo: '10000.0000' + sol.slice(2, 6), tipo: aditivo ? 'Termo Aditivo de Convenção Coletiva' : 'Convenção Coletiva', aditivo, vigIni: ini, vigFim: fim,
  cnpjTrab: LAB, trabalhador: 'SINDICATO EXEMPLO DOS EMPREGADOS', cnpjEmp: PAT, empregador: 'SINDICATO EXEMPLO PATRONAL' });
const texto = (sol, reg) => ({ solicitacao: sol, registro: reg, dataBase: MESES[mesAt], anexos: [], clausulas: [{ grupo: 'Salários, Reajustes e Pagamento', subgrupo: 'Reajustes', titulo: 'CLÁUSULA TERCEIRA - REAJUSTE', texto: 'Os salários serão reajustados em 5,5% a partir da data-base.' }] });
let falhas = 0;
async function passo(nome, fn) { try { await fn(); console.log('ok   ' + nome); } catch (e) { falhas++; console.log('FALHA ' + nome + '\n     ' + String(e && e.message || e).split('\n').slice(0, 6).join(' | ')); } }

(async () => {
  await new Promise(r => servidor.listen(0, r));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'pt-BR' });
  await ctx.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e && e.message || e)));
  await page.addInitScript(BANCO);
  await page.addInitScript(() => { try { localStorage.setItem('controlhub-theme', 'light'); } catch (e) {} });
  await page.goto(`http://localhost:${servidor.address().port}/index.html`);
  await page.waitForFunction(() => window.__hubApi && window.__db);
  const semear = (p, d) => page.evaluate(([a, b]) => window.__db.semear(a, b), [p, d]);
  // DP: três empresas ativas; a ALFA tem o código de um sindicato no estabelecimento (que não liga mais à convenção)
  for (const [id, nome, cnpj] of [['e-alfa', 'ALFA COMERCIO LTDA', '11111111000191'], ['e-beta', 'BETA SERVICOS LTDA', '22222222000191'], ['e-gama', 'GAMA INDUSTRIA LTDA', '33333333000191']])
    await semear('dp_empresas/' + id, { nome, cnpj: fmt(cnpj), situacao: 'Ativa', funcionarios: [{ id: 'f' + id, nome: 'Empregado Ficticio', admissao: '2024-01-02', situacao: 'Ativo', status: 'Ativo' }], historico: [], estabelecimentos: [{ id: 'x' + id, tipo: 'Matriz', cnpj: fmt(cnpj), codSind: '901' }] });
  await semear('dp_config/sindicatos', { itens: [{ id: 'sd-901', cod: '901', nome: 'SINDICATO EXEMPLO DOS EMPREGADOS', apelido: 'Sind. Exemplo', cnpj: fmt(LAB) }] });
  // a extensão simulada: responde ao mediadorConvencao (e registra os pedidos)
  const ext = { resposta: null };
  await page.exposeFunction('__medConv', () => ext.resposta);
  await page.evaluate(() => {
    window.__medPed = [];
    const orig = window.postMessage.bind(window);
    window.postMessage = function (m) { if (m && m.tipo === 'pedidoAck' && String(m.id).startsWith('m') && !m.__med) return; return orig.apply(window, arguments); };
    window.addEventListener('message', async (e) => { const d = e.data; if (!d || d.ctlhub !== 1 || d.de !== 'hub' || d.tipo !== 'pedido' || !String(d.acao).startsWith('mediador')) return; window.__medPed.push(d);
      const r = d.acao === 'mediadorConvencao' ? await window.__medConv() : d.acao === 'mediadorTexto' ? { ok: true, clausulas: [{ grupo: '', subgrupo: '', titulo: 'CLÁUSULA', texto: 'Lido na hora.' }], dataBase: '', anexos: [] } : { ok: true };
      setTimeout(() => orig(Object.assign({ ctlhub: 1, de: 'ext', tipo: 'pedidoAck', id: d.id, __med: 1 }, r), '*'), 50); });
    // a extensão "conectada" (o Hub só pede com ela): um pedidoAck qualquer marca ing.ext
    orig({ ctlhub: 1, de: 'ext', tipo: 'pedidoAck', id: 'x-inicio', ok: true, __med: 1 }, '*');
  });
  await page.evaluate(() => window.__hubApi.abrirModulo('dp'));
  await page.evaluate(() => window.__hubApi.api('dp').irPara('sindicatos'));
  const conv = () => page.evaluate(() => window.__db.ler('dp_config/ccts') ? window.__db.ler('dp_config/ccts').itens : []);
  const acomp = () => page.evaluate(() => (window.__db.ler('dp_config/cvAcomp') || {}).itens || []);
  const ESQ = ymd(ano - 2, mesAt, 1), ESQF = fimDe(ano - 2, mesAt), VIG = ymd(ano - 1, mesAt, 1), VIGF = fimDe(ano - 1, mesAt), NOVA = ymd(ano, mesAt, 1), NOVAF = fimDe(ano, mesAt);

  await passo('a aba Acompanhar abre primeiro; a nova convenção pede os dois CNPJs válidos e diferentes', async () => {
    await page.waitForSelector('#cv-abas [data-cv-aba-mod="acomp"].on', { timeout: 8000 });
    assert.match(await page.textContent('#cv-nova'), /Nenhuma convenção acompanhada/);
    await page.click('[data-cva-nova]');
    await page.fill('#cva-form [name="lab"]', fmt(LAB)); await page.fill('#cva-form [name="pat"]', fmt(LAB));
    await page.click('#cva-form button[type="submit"]');
    assert.match(await page.textContent('#cva-erro'), /iguais/);
    await page.fill('#cva-form [name="pat"]', '11.444.777/0001-00');
    await page.click('#cva-form button[type="submit"]');
    assert.match(await page.textContent('#cva-erro'), /patronal não é válido/);
    assert.equal((await acomp()).length, 0, 'nada gravado');
  });
  await passo('Salvar e buscar: só o par pedido, a mais recente e os aditivos dela entram no módulo; as empresas escolhidas passam a ter a convenção', async () => {
    ext.resposta = { ok: true, instrumentos: [inst('MR000100/' + (ano - 2), 'XX000100/' + (ano - 2), false, ESQ, ESQF), inst('MR000200/' + (ano - 1), 'XX000200/' + (ano - 1), false, VIG, VIGF), inst('MR000300/' + (ano - 1), 'XX000300/' + (ano - 1), true, ymd(ano - 1, mesAt, 15), VIGF)],
      cct: 'MR000200/' + (ano - 1), aditivos: ['MR000300/' + (ano - 1)], textos: [texto('MR000200/' + (ano - 1), 'XX000200/' + (ano - 1)), texto('MR000300/' + (ano - 1), 'XX000300/' + (ano - 1))] };
    await page.fill('#cva-form [name="pat"]', fmt(PAT));
    await page.fill('#cva-emp-q', 'alfa'); await page.check('[data-cva-emp="e-alfa"]');
    await page.fill('#cva-emp-q', 'beta'); await page.check('[data-cva-emp="e-beta"]');
    assert.equal(await page.textContent('#cva-n'), '2');
    await page.click('#cva-form button[type="submit"]');
    await page.waitForFunction(() => (window.__medPed || []).some(p => p.acao === 'mediadorConvencao'));
    const ped = await page.evaluate(() => window.__medPed.find(p => p.acao === 'mediadorConvencao'));
    assert.deepEqual([ped.laboral, ped.patronal], [LAB, PAT], 'a extensão busca o par, não os sindicatos isolados');
    await page.waitForFunction(() => ((window.__db.ler('dp_config/ccts') || {}).itens || []).length === 2, null, { timeout: 8000 });
    const cs = await conv();
    assert.deepEqual(cs.map(c => [c.registro, c.tipo, c.origem]).sort(), [['XX000200/' + (ano - 1), 'cct', 'mediador'], ['XX000300/' + (ano - 1), 'aditivo', 'mediador']], 'a de dois anos atrás não entra');
    const cct = cs.find(c => c.tipo === 'cct'), ad = cs.find(c => c.tipo === 'aditivo');
    assert.equal(ad.mae, cct.id, 'o aditivo liga à convenção-mãe'); assert.equal(cct.dataBase, MESES[mesAt], 'a data-base vem do texto');
    assert.equal(cs.filter(c => (c.partes || []).some(p => p.papel === 'patronal')).length, 2);
    const a = (await acomp())[0];
    assert.deepEqual(a.empresas.sort(), ['e-alfa', 'e-beta']); assert.equal(a.busca.estado, 'ok'); assert.equal(a.achada, null);
    assert.ok(await page.evaluate(() => window.__db.existe('cv_texto/MR000200_' + (new Date().getFullYear() - 1))), 'o texto fica no Hub');
  });
  await passo('as empresas ligadas têm a convenção pelo vínculo direto; a GAMA, com o mesmo código de sindicato, não (começa do zero)', async () => {
    await page.click('#cv-abas [data-cv-aba-mod="empresas"]');
    await page.waitForSelector('.cvs-row');
    const linhas = await page.$$eval('.cvs-row:not(.cvs-head)', l => l.map(r => r.textContent.replace(/\s+/g, ' ')));
    const de = (n) => linhas.find(t => new RegExp(n, 'i').test(t)) || '';
    assert.match(de('alfa'), /XX000200/); assert.match(de('beta'), /XX000200/);
    assert.match(de('gama'), /Não está ligada a nenhuma convenção acompanhada/);
    await page.click('#cv-abas [data-cv-aba-mod="acomp"]');
  });
  await passo('na data-base a busca diária roda sozinha uma vez por dia; a nova achada espera o analista (nada salvo sozinho)', async () => {
    ext.resposta = { ok: true, instrumentos: [inst('MR000200/' + (ano - 1), 'XX000200/' + (ano - 1), false, VIG, VIGF), inst('MR000400/' + ano, 'XX000400/' + ano, false, NOVA, NOVAF)],
      cct: 'MR000400/' + ano, aditivos: [], textos: [texto('MR000400/' + ano, 'XX000400/' + ano)] };
    // ontem já buscou? não: o dia da última busca é hoje (a do botão); a diária só roda num dia novo. Simula a busca de ontem:
    await page.evaluate(() => { const d = window.__db.ler('dp_config/cvAcomp'); d.itens[0].busca.dia = '2000-01-01'; window.__db.semear('dp_config/cvAcomp', d); });
    await page.waitForFunction(() => { const a = ((window.__db.ler('dp_config/cvAcomp') || {}).itens || [])[0]; return a && a.achada; }, null, { timeout: 15000 });
    const a = (await acomp())[0];
    assert.deepEqual(a.achada.sols, ['MR000400/' + ano]); assert.equal(a.busca.auto, true);
    assert.equal((await conv()).length, 2, 'a nova não entra sozinha');
    await page.waitForSelector('.cva-achada');
    assert.match(await page.textContent('.cva-card'), /Nova encontrada.*XX000400/s);
    if (CAP) for (const tm of ['light', 'dark']) { await page.evaluate((x) => { document.documentElement.dataset.theme = x; }, tm); await page.waitForTimeout(200); await page.screenshot({ path: path.join(CAP, 'convencao-acompanhada-' + tm + '.png') }); }
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    const pedidos = await page.evaluate(() => window.__medPed.filter(p => p.acao === 'mediadorConvencao').length);
    await page.evaluate(() => window.__hubApi && 0);
    assert.equal(pedidos, 2, 'uma busca do botão e uma diária');
  });
  await passo('Salvar no módulo grava a nova; daí a busca diária para até a próxima data-base', async () => {
    await page.click('[data-cva-salvar]');
    await page.waitForFunction(() => ((window.__db.ler('dp_config/ccts') || {}).itens || []).length === 3, null, { timeout: 8000 });
    const a = (await acomp())[0];
    assert.equal(a.achada, null);
    await page.waitForFunction(() => /Em dia/.test(document.querySelector('.cva-card').textContent));
    assert.match(await page.textContent('.cva-card'), /Próxima busca\s*a partir de/);
  });
  await passo('Buscar no Mediador vale fora de época: pelo botão, salva na hora o que o módulo não tem', async () => {
    ext.resposta = { ok: true, instrumentos: [inst('MR000400/' + ano, 'XX000400/' + ano, false, NOVA, NOVAF), inst('MR000500/' + ano, 'XX000500/' + ano, true, ymd(ano, mesAt, 20), NOVAF)],
      cct: 'MR000400/' + ano, aditivos: ['MR000500/' + ano], textos: [texto('MR000400/' + ano, 'XX000400/' + ano), texto('MR000500/' + ano, 'XX000500/' + ano)] };
    await page.click('[data-cva-buscar]');
    await page.waitForFunction(() => ((window.__db.ler('dp_config/ccts') || {}).itens || []).length === 4, null, { timeout: 8000 });
    assert.ok((await conv()).some(c => c.registro === 'XX000500/' + ano && c.tipo === 'aditivo'));
  });
  await passo('erro da extensão aparece no cartão (nunca "não achou" em silêncio)', async () => {
    ext.resposta = { ok: false, motivo: 'formato', mensagem: 'a tela de consulta do Mediador mudou' };
    await page.click('[data-cva-buscar]');
    await page.waitForFunction(() => /Erro na última busca/.test((document.querySelector('.cva-card') || {}).textContent || ''), null, { timeout: 8000 });
    assert.match(await page.textContent('.cva-card'), /A tela do Mediador mudou/);
  });
  await passo('Editar empresas e Parar de acompanhar (com confirmação); as convenções salvas ficam', async () => {
    await page.click('[data-cva-editar]'); await page.fill('#cva-emp-q', 'gama'); await page.check('[data-cva-emp="e-gama"]');
    await page.click('#cva-form button[type="submit"]');
    await page.waitForFunction(() => (((window.__db.ler('dp_config/cvAcomp') || {}).itens || [])[0] || {}).empresas.length === 3);
    await page.click('[data-cva-remover]'); await page.click('#ask-actions [data-i="1"]');
    await page.waitForFunction(() => !((window.__db.ler('dp_config/cvAcomp') || {}).itens || []).length);
    assert.equal((await conv()).length, 4);
  });
  await passo('Hub 352: sem aba Sindicatos nem busca por sindicato; só convenções são cadastradas e acompanhadas', async () => {
    const abas = await page.$$eval('#cv-abas [data-cv-aba-mod]', bs => bs.map(b => b.dataset.cvAbaMod));
    assert.ok(!abas.includes('sindicatos'), abas.join());
    await page.click('#cv-abas [data-cv-aba-mod="novidades"]');
    assert.ok(await page.$eval('#cv-med', el => el.hidden), 'o bloco do Mediador por sindicato não aparece');
    assert.doesNotMatch(await page.textContent('#cv-nova'), /Entraram sozinhas/);
  });
  await passo('sem erros de página', async () => { assert.deepEqual(erros, []); });
  await browser.close(); servidor.close();
  console.log(falhas ? 'FALHARAM: ' + falhas : 'tudo ok');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

/* Teste das planilhas do Departamento Pessoal do Control Hub (Relatórios, Empresas e Funcionários em Excel, com o visual do Hub).
 * Abre o Hub com o banco simulado e dados FICTÍCIOS, gera cada planilha pela própria tela e confere o arquivo:
 * as abas (Resumo, Dados e a Base oculta dos gráficos), até 4 indicadores e 2 gráficos nativos no Resumo, links entre Resumo e Dados,
 * filtro e cabeçalho travado na aba Dados, datas como data de verdade, que os números dos gráficos batem com a tabela da base,
 * o relatório "Ativos em uma data" (conferido contra os dados fictícios) e o período por datas exatas.
 *
 *   HUB_DIR=<pasta com hub.js, hub.css, tema.js, planilha.js e index.fonte.html> NODE_PATH=$(npm root -g) node testes/hub-onvio/planilhas.js
 *   SAIDA=<pasta> guarda as planilhas geradas (para abrir no Excel ou converter no LibreOffice).
 * Precisa do Python com openpyxl para ler as planilhas. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const HUB = process.env.HUB_DIR;
if (!HUB || !fs.existsSync(path.join(HUB, 'planilha.js'))) { console.log('HUB_DIR não definido (pasta com hub.js, hub.css, tema.js, planilha.js e index.fonte.html): teste pulado.'); process.exit(0); }
const SAIDA = process.env.SAIDA || fs.mkdtempSync(path.join(os.tmpdir(), 'planilhas-'));
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8' };

const servidor = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/index.html' || u === '/') {
    res.writeHead(200, { 'content-type': MIME['.html'] });
    return res.end('<!doctype html><html><head><meta charset="utf8"></head><body>' + fs.readFileSync(path.join(HUB, 'index.fonte.html'), 'utf8'));
  }
  if (['/auth.js', '/extras.js', '/assistente.js'].includes(u)) { res.writeHead(200, { 'content-type': MIME['.js'] }); return res.end(''); }
  const f = path.join(HUB, path.basename(u));
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});

// banco do artefato simulado (o mínimo que o DP usa) e downloads capturados em window.__baixados
const BANCO = `(() => {
  const store = new Map(), docL = new Map(), colL = new Map();
  const clone = (o) => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
  const colDe = (p) => p.split('/').slice(0, -1).join('/');
  const snapDoc = (p) => ({ id: p.split('/').pop(), exists: store.has(p), data: () => clone(store.get(p)) });
  const snapCol = (c) => { const docs = [...store.keys()].filter(k => colDe(k) === c).sort().map(k => ({ id: k.split('/').pop(), data: () => clone(store.get(k)) })); return { docs, size: docs.length, empty: !docs.length, forEach: (f) => docs.forEach(f) }; };
  const avisa = (p) => { (docL.get(p) || []).forEach(cb => cb(snapDoc(p))); (colL.get(colDe(p)) || []).forEach(cb => cb(snapCol(colDe(p)))); };
  const poe = (m, k, cb) => { if (!m.has(k)) m.set(k, []); m.get(k).push(cb); };
  const doc = (p) => ({ id: p.split('/').pop(), path: p, get: async () => snapDoc(p), set: async (d) => { store.set(p, clone(d)); avisa(p); }, update: async (d) => { store.set(p, Object.assign({}, store.get(p) || {}, clone(d))); avisa(p); }, delete: async () => { store.delete(p); avisa(p); },
    onSnapshot: (cb) => { poe(docL, p, cb); setTimeout(() => cb(snapDoc(p)), 0); return () => {}; }, collection: (n) => col(p + '/' + n) });
  const col = (p) => ({ path: p, doc: (id) => doc(p + '/' + id), get: async () => snapCol(p), onSnapshot: (cb) => { poe(colL, p, cb); setTimeout(() => cb(snapCol(p)), 0); return () => {}; } });
  window.__baixados = [];
  window.__db = { semear: (p, d) => { store.set(p, clone(d)); avisa(p); } };
  window.claude = { use: async (n) => n === 'db' ? { doc, collection: col } : n === 'downloads' ? { save: async (o) => { window.__baixados.push({ nome: o.filename, dados: Array.from(o.data instanceof Uint8Array ? o.data : new Uint8Array(await new Blob([o.data]).arrayBuffer())) }); } } : n === 'user' ? { id: async () => 'u-teste', can: async () => true, canEdit: async () => true, profiles: async () => ({}) } : null };
})();`;

// empresas e funcionários fictícios, espalhados por dois anos (admissões, desligamentos, férias e cargos variados)
function empresasFicticias() {
  const hoje = new Date(), ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dia = (n) => { const d = new Date(hoje); d.setDate(d.getDate() + n); return ymd(d); };
  const resp = ['Ana Teste', 'Bruno Teste', 'Carla Teste', ''], trib = ['Simples Nacional', 'Lucro Presumido', 'Lucro Real', ''], cargos = ['Auxiliar administrativo', 'Vendedor', 'Motorista', 'Analista', 'Operador de caixa', ''];
  const out = [];
  for (let i = 0; i < 14; i++) {
    const funcionarios = [];
    for (let k = 0; k < 4 + (i * 7) % 23; k++) {
      const adm = -((k * 37 + i * 11) % 720) - 5, f = { id: `f-${i}-${k}`, nome: `Pessoa Ficticia ${i}-${k}`, cargo: cargos[(i + k) % cargos.length], admissao: dia(adm), status: 'Ativo' };
      if ((k + i) % 6 === 0) f.rescisao = dia(Math.min(-1, adm + 40 + (k * 13) % 300));
      else if ((k + i) % 9 === 0) { f.feriasInicio = dia(-3); f.feriasFim = dia(20); }
      else if ((k + i) % 11 === 0) { f.feriasInicio = dia(25 + k); f.feriasFim = dia(54 + k); }
      if (k === 0) f.vinculo = 'Pró-labore';                                  // Hub 313: um sócio com pró-labore e, em algumas, um RPA
      else if (k === 1 && i % 3 === 0) f.vinculo = 'RPA/autônomo';
      funcionarios.push(f);
    }
    out.push({ id: `e-fic-${i}`, cod: String(100 + i), nome: `EMPRESA FICTICIA ${String.fromCharCode(65 + i)} LTDA`, cnpj: i % 5 === 4 ? '' : `${String(10 + i).padStart(2, '0')}.111.222/0001-${String(10 + i).padStart(2, '0')}`, codigoDominio: i % 4 === 3 ? '' : String(100 + i),
      tributacao: trib[i % trib.length], responsavel: resp[i % resp.length], situacao: i === 13 ? 'Inativa' : i === 12 ? 'Sem movimento' : 'Ativa', uf: 'Vitória/ES', dataBase: ['Janeiro', 'Maio', 'Setembro', 'Novembro'][i % 4],
      funcionarios, historico: [], lembretes: [], prazos: [] });
  }
  return out;
}

let falhas = 0;
async function passo(nome, fn) { try { await fn(); console.log('ok   ' + nome); } catch (e) { falhas++; console.log('FALHA ' + nome + '\n     ' + String(e && e.message || e).split('\n').slice(0, 8).join('\n     ')); } }

// lê a planilha com o openpyxl e devolve o que interessa conferir
function lerPlanilha(arq) {
  const py = `
import json, sys, openpyxl
wb = openpyxl.load_workbook(sys.argv[1])
o = {'abas': wb.sheetnames, 'estado': {ws.title: ws.sheet_state for ws in wb}}
for ws in wb:
    o[ws.title] = {'graficos': len(ws._charts), 'filtro': ws.auto_filter.ref, 'congela': ws.freeze_panes, 'linhas': ws.max_row, 'colunas': ws.max_column,
                   'links': [(c.coordinate, c.hyperlink.location) for r in ws.iter_rows(max_row=30) for c in r if c.hyperlink]}
d = wb['Dados']
o['cab'] = [c.value for c in d[4]]
o['primeira'] = [str(c.value) if c.value is not None else None for c in d[5]]
o['tipos'] = [type(c.value).__name__ for c in d[5]]
o['colunas'] = [[str(c.value) if c.value is not None else None for c in col] for col in d.iter_cols(min_row=5, max_row=d.max_row)]
p = wb['Resumo']
o['kpi'] = [p.cell(r, c).value for r in range(6, 10) for c in range(1, 13) if isinstance(p.cell(r, c).value, (int, float))]
o['titulo'] = p['A4'].value
o['sub'] = p['A5'].value
b = wb['Base'] if 'Base' in wb.sheetnames else None
o['base'] = [[c.value for c in r] for r in b.iter_rows(min_row=1, max_row=min(b.max_row, 60), max_col=4)] if b else []
print(json.dumps(o, default=str))`;
  return JSON.parse(execFileSync('python3', ['-c', py, arq], { encoding: 'utf8' }));
}

(async () => {
  await new Promise(r => servidor.listen(0, r));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--lang=pt-BR'] });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'pt-BR' });
  await ctx.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e && e.message || e)));
  await page.addInitScript(BANCO);
  await page.addInitScript(() => { try { localStorage.setItem('controlhub-theme', 'light'); } catch (e) {} });
  await page.goto(`http://localhost:${servidor.address().port}/index.html`);
  await page.waitForFunction(() => window.__hubApi && window.__db);
  for (const e of empresasFicticias()) { const { id, ...corpo } = e; await page.evaluate(([p, d]) => window.__db.semear(p, d), ['dp_empresas/' + id, corpo]); }
  await page.evaluate(() => window.__hubApi.abrirModulo('dp'));
  await page.waitForTimeout(400);
  // clique pelo DOM: a tela dos relatórios redesenha a cada mudança e o clique do Playwright esperaria a área ficar parada
  const clicar = (sel) => page.evaluate((q) => { const el = document.querySelector(q); if (!el) throw new Error('não achei ' + q); el.click(); }, sel);
  const baixar = async (clicar) => {
    const n0 = await page.evaluate(() => window.__baixados.length);
    await clicar();
    await page.waitForFunction((n) => window.__baixados.length > n, n0, { timeout: 15000 });
    const b = await page.evaluate(() => window.__baixados[window.__baixados.length - 1]);
    const arq = path.join(SAIDA, b.nome); fs.writeFileSync(arq, Buffer.from(b.dados)); return arq;
  };

  // formato enxuto: Resumo (até 4 números e 2 gráficos, link para a lista), Dados (link de volta, cabeçalho travado e filtro) e Base oculta
  const conferirFormato = (x) => {
    assert.deepEqual(x.abas.slice(0, 2), ['Resumo', 'Dados']);
    if (x.Resumo.graficos) { assert.deepEqual(x.abas, ['Resumo', 'Dados', 'Base']); assert.equal(x.estado.Base, 'hidden', 'a base dos gráficos fica oculta'); } else assert.deepEqual(x.abas, ['Resumo', 'Dados']);
    assert.ok(x.Resumo.graficos <= 2, 'no máximo 2 gráficos: ' + x.Resumo.graficos);
    assert.ok(x.kpi.length >= 1 && x.kpi.length <= 4, 'de 1 a 4 indicadores: ' + JSON.stringify(x.kpi));
    assert.ok(x.titulo && x.titulo.length > 3, 'título no Resumo');
    assert.deepEqual(x.Dados.links, [['A2', "'Resumo'!A1"]], 'link de volta ao resumo');
    if (x.primeira.some(v => v)) {
      assert.ok(x.Resumo.links.some(l => l[1] === "'Dados'!A1"), 'link do resumo para a lista');
      assert.equal(x.Dados.congela, 'A5', 'cabeçalho da lista travado');
      assert.match(String(x.Dados.filtro), /^A4:/, 'filtro no cabeçalho da lista');
    }
  };
  const mudar = (sel, v) => page.evaluate(([q, val]) => { const el = document.querySelector(q); if (!el) throw new Error('não achei ' + q); el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); }, [sel, v]);
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dmy = (s) => s.split('-').reverse().join('/');
  const diasAtras = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n); return d; };

  const tipos = ['ativos', 'quadro', 'movimento', 'ferias', 'contratos', 'agenda', 'carteira', 'convencoes', 'pendencias'];
  for (const t of tipos) {
    await passo(`Relatório "${t}" em Excel: Resumo com números e gráficos, Dados com a lista e filtro, links entre as duas`, async () => {
      await page.evaluate((x) => { window.__hubApi.abrirModulo('dp'); document.querySelector('.dp-tab[data-dp-view="relatorios"]')?.click(); }, t);
      await page.waitForSelector('#dp-rel-root .rel-tipos');
      await clicar(`[data-rel-tipo="${t}"]`);
      if (['ferias', 'contratos', 'agenda', 'convencoes'].includes(t)) await clicar('[data-rel-atalho="ano"]');
      await page.waitForSelector('#dp-rel-root .rel-res');
      const arq = await baixar(() => clicar('[data-rel-baixar="xlsx"]'));
      const x = lerPlanilha(arq);
      conferirFormato(x);
      assert.ok(x.Resumo.graficos >= 1, 'gráficos no Resumo: ' + x.Resumo.graficos);
      assert.ok(!x.cab.includes('CNPJ') || ['ativos', 'carteira', 'pendencias'].includes(t), 'CNPJ só onde ajuda: ' + x.cab.join(', '));
      const datas = x.cab.map((c, i) => /^(Data|Admissão|Início das férias|Fim das férias|Fim do concessivo)$/.test(c || '') && x.primeira[i] ? x.tipos[i] : null).filter(Boolean);
      datas.forEach(tp => assert.equal(tp, 'datetime', 'datas viram data de verdade'));
      assert.ok(x.base.length > 2, 'base dos gráficos preenchida');
    });
  }

  await passo('Ativos em uma data: a quantidade de cada empresa bate com as datas de admissão e rescisão', async () => {
    await clicar('[data-rel-tipo="ativos"]');
    const alvo = ymd(diasAtras(200));
    await mudar('[data-rel="data"]', alvo);
    const tela = await page.evaluate(() => [...document.querySelectorAll('#dp-rel-root .rel-tab tbody tr')].map(tr => [tr.dataset.openEmp, Number(tr.lastElementChild.textContent.replace(/\./g, ''))]));
    const emps = new Map(empresasFicticias().map(e => [e.id, e]));
    assert.ok(tela.length > 3, 'empresas na lista: ' + tela.length);
    for (const [id, n] of tela) {
      const esperado = emps.get(id).funcionarios.filter(f => f.admissao <= alvo && !(f.rescisao && f.rescisao <= alvo)).length;
      assert.equal(n, esperado, `ativos de ${id} em ${alvo}`);
    }
    if (process.env.SAIDA) { await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); await page.screenshot({ path: path.join(SAIDA, 'tela-ativos.png'), fullPage: false }); }
    const arq = await baixar(() => clicar('[data-rel-baixar="xlsx"]'));
    const x = lerPlanilha(arq);
    conferirFormato(x);
    assert.match(x.titulo, new RegExp('Ativos em ' + dmy(alvo)));
    assert.deepEqual(x.cab, ['Empresa', 'CNPJ', 'Responsável', 'Funcionários', 'Pró-labore', 'RPA', 'Total em ' + dmy(alvo)]);
    const soma = tela.reduce((s, r) => s + r[1], 0);
    assert.equal(x.kpi[0], soma, 'o primeiro número é o total de ativos na data');
    assert.ok(path.basename(arq).includes(alvo), 'nome do arquivo leva a data: ' + path.basename(arq));
  });

  await passo('Funcionários, pró-labore e RPA separados (Hub 313): colunas, indicadores e o filtro "Quem conta"', async () => {
    await clicar('[data-rel-tipo="ativos"]');
    const alvo = ymd(diasAtras(0)); await mudar('[data-rel="data"]', alvo);
    const ativo = (f) => f.admissao <= alvo && !(f.rescisao && f.rescisao <= alvo), grupo = (f) => /pró-labore/i.test(f.vinculo || '') ? 'pl' : /rpa/i.test(f.vinculo || '') ? 'rpa' : 'func';
    const emps = new Map(empresasFicticias().map(e => [e.id, e]));
    const tela = await page.evaluate(() => [...document.querySelectorAll('#dp-rel-root .rel-tab tbody tr')].map(tr => [tr.dataset.openEmp, ...[...tr.children].slice(3).map(td => Number(td.textContent.replace(/\./g, '')))]));
    let tot = { func: 0, pl: 0, rpa: 0 };
    for (const [id, nf, npl, nrpa, ntot] of tela) {
      const fs = emps.get(id).funcionarios.filter(ativo), c = (g) => fs.filter(f => grupo(f) === g).length;
      assert.deepEqual([nf, npl, nrpa, ntot], [c('func'), c('pl'), c('rpa'), fs.length], 'grupos de ' + id);
      tot.func += nf; tot.pl += npl; tot.rpa += nrpa;
    }
    assert.ok(tot.pl > 0 && tot.rpa > 0, 'os dados fictícios têm pró-labore e RPA');
    const kpis = await page.evaluate(() => [...document.querySelectorAll('#dp-rel-root .ev-kpi')].map(k => k.textContent));
    assert.ok(kpis.some(k => k.startsWith(String(tot.pl)) && /pró-labore/.test(k)) && kpis.some(k => k.startsWith(String(tot.rpa)) && /RPA/.test(k)), JSON.stringify(kpis));
    // "Quem conta: Pró-labore": só os sócios
    await clicar('[data-rel-set="vinc"][data-v="prolabore"]');
    const soPl = await page.evaluate(() => [...document.querySelectorAll('#dp-rel-root .rel-tab tbody tr')].map(tr => [...tr.children].slice(3).map(td => Number(td.textContent.replace(/\./g, '')))));
    assert.equal(soPl.reduce((s, r) => s + r[3], 0), tot.pl); assert.ok(soPl.every(r => r[0] === 0 && r[2] === 0), 'só pró-labore');
    assert.match(await page.textContent('#dp-rel-root .rel-res h3'), /só pró-labore/);
    await clicar('[data-rel-set="vinc"][data-v="todos"]');
    // carteira também separa; férias só de funcionários
    await clicar('[data-rel-tipo="carteira"]');
    const cab = await page.evaluate(() => [...document.querySelectorAll('#dp-rel-root .rel-tab thead th')].map(th => th.textContent));
    assert.deepEqual(cab.slice(-4), ['Funcionários', 'Pró-labore', 'RPA', 'Total de ativos']);
    await clicar('[data-rel-tipo="ferias"]');
    const nomes = await page.evaluate(() => [...document.querySelectorAll('#dp-rel-root .rel-tab tbody tr')].map(tr => tr.children[0].textContent));
    const plNomes = new Set(empresasFicticias().flatMap(e => e.funcionarios.filter(f => grupo(f) !== 'func').map(f => f.nome)));
    assert.ok(!nomes.some(n => plNomes.has(n)), 'pró-labore e RPA fora do relatório de férias');
    await clicar('[data-rel-tipo="ativos"]');
  });

  await passo('Período por datas exatas: só entram os movimentos entre as duas datas', async () => {
    await clicar('[data-rel-tipo="movimento"]');
    const de = ymd(diasAtras(250)), ate = ymd(diasAtras(40));
    await mudar('[data-rel="de"]', de); await mudar('[data-rel="ate"]', ate);
    const tipo = await page.evaluate(() => document.querySelector('[data-rel="de"]').type);
    assert.equal(tipo, 'date', 'o período se escolhe por data, não por mês');
    const arq = await baixar(() => clicar('[data-rel-baixar="xlsx"]'));
    const x = lerPlanilha(arq);
    conferirFormato(x);
    assert.match(String(x.sub), new RegExp(dmy(de) + ' a ' + dmy(ate)), 'o período aparece no resumo');
    const datas = x.colunas[0].filter(Boolean).map(v => v.slice(0, 10));
    assert.ok(datas.length > 3, 'movimentos no período: ' + datas.length);
    datas.forEach(d => assert.ok(d >= de && d <= ate, `${d} dentro de ${de} a ${ate}`));
    // e o mesmo filtro de datas aplicado nos dados fictícios dá a mesma contagem
    let esperado = 0; empresasFicticias().filter(e => e.situacao !== 'Inativa').forEach(e => e.funcionarios.forEach(f => { if (f.admissao >= de && f.admissao <= ate) esperado++; if (f.rescisao && f.rescisao >= de && f.rescisao <= ate) esperado++; }));
    assert.equal(datas.length, esperado, 'mesma contagem dos dados fictícios');
  });

  await passo('Data digitada à mão: o campo não se redesenha nem perde o foco no meio da digitação, e a data só vale completa', async () => {
    await clicar('[data-rel-tipo="quadro"]'); await clicar('[data-rel-atalho="12m"]');
    await page.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); document.querySelector('[data-rel="de"]').__marca = 1; });
    const antes = await page.evaluate(() => document.querySelector('#dp-rel-res h3').textContent);
    await page.click('[data-rel="de"]', { position: { x: 14, y: 12 } });   // clica no primeiro pedaço da data, como a pessoa
    for (const ch of '15032025') {
      await page.keyboard.type(ch);
      const [ok, sub] = await page.evaluate(() => { const el = document.querySelector('[data-rel="de"]'); return [el.__marca === 1 && document.activeElement === el, (document.querySelector('#dp-rel-res .dp-cell-sub') || {}).textContent || '']; });
      assert.ok(ok, 'o campo continua o mesmo e com o foco depois de digitar ' + ch);
      assert.ok(!/\/0\d{3}\b/.test(sub), 'ano incompleto não vira relatório: ' + sub);
    }
    const v = await page.evaluate(() => document.querySelector('[data-rel="de"]').value);
    assert.match(v, /^2025-\d{2}-\d{2}$/, 'data completa no campo: ' + v);
    await page.waitForFunction((d) => (document.querySelector('#dp-rel-res .dp-cell-sub') || {}).textContent.startsWith(d), v.split('-').reverse().join('/'));
    assert.ok(antes, 'relatório na tela antes');
    const atalhoOn = await page.evaluate(() => [...document.querySelectorAll('.rel-chip.on')].map(b => b.dataset.relAtalho));
    assert.deepEqual(atalhoOn, [], 'com a data digitada, nenhum atalho fica marcado');
    await page.keyboard.press('Enter');
    await clicar('[data-rel-atalho="ano"]');
    const on = await page.evaluate(() => [...document.querySelectorAll('.rel-chip.on')].map(b => b.dataset.relAtalho));
    assert.deepEqual(on, ['ano'], 'o atalho em uso fica marcado');
    if (process.env.SAIDA) for (const tema of ['light', 'dark']) {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), tema);
      const f = await page.$('#dp-rel-root .rel-form'); await f.screenshot({ path: path.join(SAIDA, `form-${tema}.png`) });
    }
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  });

  await passo('Quadro: os números do gráfico de admissões batem com o indicador do relatório', async () => {
    await clicar('[data-rel-tipo="quadro"]'); await clicar('[data-rel-atalho="12m"]');
    const tela = await page.evaluate(() => [...document.querySelectorAll('#dp-rel-root .ev-kpi')].map(k => [k.querySelector('span').textContent, k.querySelector('b').textContent]));
    const arq = await baixar(() => clicar('[data-rel-baixar="xlsx"]'));
    const x = lerPlanilha(arq);
    const i0 = x.base.findIndex(r => r[0] === 'Admissões × desligamentos por período'), cab = x.base[i0 + 1];
    assert.ok(i0 >= 0, 'gráfico de admissões × desligamentos na base');
    const soma = x.base.slice(i0 + 2).filter(r => r[0] && typeof r[1] === 'number').slice(0, 12).reduce((s, r) => s + r[cab.indexOf('Admissões')], 0);
    const kAd = Number((tela.find(k => k[0] === 'admissões') || [])[1]);
    assert.equal(soma, kAd, 'admissões no gráfico = admissões no indicador');
    if (process.env.SAIDA) fs.copyFileSync(arq, path.join(SAIDA, 'amostra-quadro.xlsx'));
  });

  await passo('Empresas e Funcionários: botão "Excel" ao lado do CSV, com o mesmo visual (indicadores, gráficos e a lista)', async () => {
    await clicar('.dp-tab[data-dp-view="empresas"]');
    await clicar('#dp-filtros-menu ~ details summary, .dp-toolbar details.menu:not(#dp-filtros-menu) > summary');
    const a1 = await baixar(() => clicar('#dp-btn-xlsx'));
    const e = lerPlanilha(a1);
    conferirFormato(e);
    assert.equal(e.Resumo.graficos, 2, 'gráficos das empresas: ' + e.Resumo.graficos);
    assert.deepEqual(e.cab, ['Código', 'Empresa', 'CNPJ', 'Tributação', 'Responsável', 'Situação', 'Funcionários ativos']); assert.ok(e.Dados.linhas >= 4 + 14, 'todas as empresas da tela');
    await clicar('.dp-tab[data-dp-view="funcionarios"]');
    const a2 = await baixar(() => clicar('#dp-btn-func-xlsx'));
    const f = lerPlanilha(a2);
    conferirFormato(f);
    assert.equal(f.Resumo.graficos, 2, 'gráficos dos funcionários: ' + f.Resumo.graficos);
    assert.deepEqual(f.cab, ['Funcionário', 'Cargo', 'Empresa', 'Admissão', 'Situação', 'Rescisão']);
    assert.equal(f.tipos[3], 'datetime', 'admissão como data');
  });

  await passo('sem erros de página', async () => { assert.deepEqual(erros, []); });
  await browser.close(); servidor.close();
  console.log(falhas ? `\n${falhas} passo(s) falharam` : `\ntodos os passos das planilhas passaram (arquivos em ${SAIDA})`);
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

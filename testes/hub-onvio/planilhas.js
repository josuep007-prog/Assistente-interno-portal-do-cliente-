/* Teste das planilhas do Departamento Pessoal do Control Hub (Relatórios, Empresas e Funcionários em Excel, com o visual do Hub).
 * Abre o Hub com o banco simulado e dados FICTÍCIOS, gera cada planilha pela própria tela e confere o arquivo:
 * as quatro abas (Painel, Dados, Base dos gráficos, Sobre), gráficos nativos no Painel, filtro e congelamento na aba Dados,
 * datas como data de verdade e que os números dos gráficos batem com a tabela da base.
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
o = {'abas': wb.sheetnames}
for ws in wb:
    o[ws.title] = {'graficos': len(ws._charts), 'filtro': ws.auto_filter.ref, 'congela': ws.freeze_panes, 'linhas': ws.max_row, 'colunas': ws.max_column}
d = wb['Dados']
o['cab'] = [c.value for c in d[7]]
o['primeira'] = [str(c.value) if c.value is not None else None for c in d[8]]
o['tipos'] = [type(c.value).__name__ for c in d[8]]
p = wb['Painel']
o['kpi'] = [p.cell(7, c).value for c in range(1, 13)]
o['titulo'] = p['A4'].value
b = wb['Base dos gráficos']
o['base'] = [[c.value for c in r] for r in b.iter_rows(min_row=6, max_row=min(b.max_row, 60), max_col=4)]
print(json.dumps(o, default=str))`;
  return JSON.parse(execFileSync('python3', ['-c', py, arq], { encoding: 'utf8' }));
}

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

  const tipos = ['quadro', 'movimento', 'ferias', 'contratos', 'agenda', 'carteira', 'convencoes', 'pendencias'];
  for (const t of tipos) {
    await passo(`Relatório "${t}" em Excel: Painel com indicadores e gráficos nativos, Dados com filtro, Base dos gráficos e Sobre`, async () => {
      await page.evaluate((x) => { window.__hubApi.abrirModulo('dp'); document.querySelector('.dp-tab[data-dp-view="relatorios"]')?.click(); }, t);
      await page.waitForSelector('#dp-rel-root .rel-tipos');
      await clicar(`[data-rel-tipo="${t}"]`);
      if (['ferias', 'contratos', 'agenda', 'convencoes'].includes(t)) await clicar('[data-rel-atalho="ano"]');
      await page.waitForSelector('#dp-rel-root .rel-res');
      const arq = await baixar(() => clicar('[data-rel-baixar="xlsx"]'));
      const x = lerPlanilha(arq);
      assert.deepEqual(x.abas, ['Painel', 'Dados', 'Base dos gráficos', 'Sobre']);
      assert.ok(x.Painel.graficos >= 2, 'gráficos no Painel: ' + x.Painel.graficos);
      assert.ok(x.titulo && x.titulo.length > 3, 'título no Painel');
      assert.ok(x.kpi.some(v => v !== null && v !== ''), 'indicadores no Painel');
      assert.equal(x.Dados.congela, 'B8', 'cabeçalho e primeira coluna congelados');
      if (x.Dados.linhas > 7 && x.primeira.some(v => v)) assert.match(String(x.Dados.filtro), /^A7:/, 'filtro no cabeçalho da lista');
      const datas = x.cab.map((c, i) => /^(Data|Admissão|Início das férias|Fim das férias|Fim do concessivo)$/.test(c || '') && x.primeira[i] ? x.tipos[i] : null).filter(Boolean);
      datas.forEach(tp => assert.equal(tp, 'datetime', 'datas viram data de verdade'));
      assert.ok(x.base.length > 2, 'base dos gráficos preenchida');
    });
  }

  await passo('Quadro: os números do gráfico de admissões batem com o indicador do relatório', async () => {
    await clicar('[data-rel-tipo="quadro"]'); await clicar('[data-rel-atalho="12m"]');
    const tela = await page.evaluate(() => [...document.querySelectorAll('#dp-rel-root .ev-kpi')].map(k => [k.querySelector('span').textContent, k.querySelector('b').textContent]));
    const arq = await baixar(() => clicar('[data-rel-baixar="xlsx"]'));
    const x = lerPlanilha(arq);
    const i0 = x.base.findIndex(r => r[0] === 'Admissões × desligamentos por período'), cab = x.base[i0 + 1];
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
    assert.deepEqual(e.abas, ['Painel', 'Dados', 'Base dos gráficos', 'Sobre']);
    assert.ok(e.Painel.graficos >= 4, 'gráficos das empresas: ' + e.Painel.graficos);
    assert.equal(e.cab[1], 'Empresa'); assert.ok(e.Dados.linhas >= 7 + 14, 'todas as empresas da tela');
    await clicar('.dp-tab[data-dp-view="funcionarios"]');
    const a2 = await baixar(() => clicar('#dp-btn-func-xlsx'));
    const f = lerPlanilha(a2);
    assert.ok(f.Painel.graficos >= 4, 'gráficos dos funcionários: ' + f.Painel.graficos);
    assert.deepEqual(f.cab, ['Funcionário', 'Cargo', 'Empresa', 'Admissão', 'Situação', 'Rescisão']);
    assert.equal(f.tipos[3], 'datetime', 'admissão como data');
  });

  await passo('sem erros de página', async () => { assert.deepEqual(erros, []); });
  await browser.close(); servidor.close();
  console.log(falhas ? `\n${falhas} passo(s) falharam` : `\ntodos os passos das planilhas passaram (arquivos em ${SAIDA})`);
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

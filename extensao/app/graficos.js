/* Control Onvio · gráficos em SVG (sem bibliotecas)
 * Regras seguidas (skill dataviz): marcas finas, 2 px de espaço entre segmentos, eixos discretos,
 * uma escala só, legenda sempre que há 2 séries ou mais, valores com tinta de texto (nunca a cor da série),
 * dica ao passar o mouse em cada marca. Cores: --viz-* em app.css (paleta validada, claro e escuro). */
import { esc, num } from './util.js';

const COR = { s1: 'var(--viz-s1)', s2: 'var(--viz-s2)', ok: 'var(--viz-ok)', warn: 'var(--viz-warn)', serious: 'var(--viz-serious)', crit: 'var(--viz-crit)' };
export const cor = k => COR[k] || k;

// Escala "bonita" para o eixo: 0..max com 3 a 5 marcas.
function escala(max) {
  if (max <= 0) return { topo: 1, passo: 1 };
  const bruto = max / 4, mag = Math.pow(10, Math.floor(Math.log10(bruto)));
  const passo = [1, 2, 5, 10].map(m => m * mag).find(p => p >= bruto) || mag * 10;
  return { topo: Math.ceil(max / passo) * passo, passo: Math.max(1, passo) };
}

export function legenda(series) {
  if (series.length < 2) return '';
  return '<div class="legenda-viz">' + series.map(s => '<span><i style="background:' + cor(s.cor) + '"></i>' + esc(s.nome) + '</span>').join('') + '</div>';
}

// Barras horizontais empilhadas: uma linha por categoria (ex.: analista), segmentos por série (ex.: G1/G2/G3).
// dados: [{ rotulo, valores: { chave: n }, id? }]  series: [{ chave, nome, cor }]
// o.destaque: ids com rótulo em negrito (ex.: a própria pessoa); o.fixo: id com rótulo de alerta (ex.: sem analista).
export function barrasEmpilhadas(dados, series, o) {
  o = Object.assign({ largura: 560, rotuloL: 150, linha: 26, barra: 16 }, o || {});
  if (!dados.length) return '<div class="vazio">Sem dados.</div>';
  const total = d => series.reduce((s, x) => s + (d.valores[x.chave] || 0), 0);
  const max = Math.max(1, ...dados.map(total));
  const area = o.largura - o.rotuloL - 40;
  const alt = dados.length * o.linha + 6;
  let svg = '<svg class="viz" viewBox="0 0 ' + o.largura + ' ' + alt + '" width="100%" role="img" aria-label="' + esc(o.titulo || 'gráfico de barras') + '">';
  dados.forEach((d, i) => {
    const y = i * o.linha + 4;
    const cls = d.id != null && o.fixo === d.id ? 'rot-forte rot-alerta' : d.id != null && (o.destaque || []).includes(d.id) ? 'rot-forte rot-destaque' : 'rot-forte';
    svg += '<text x="' + (o.rotuloL - 8) + '" y="' + (y + o.barra / 2 + 4) + '" text-anchor="end" class="' + cls + '"' + (d.id ? ' data-id="' + esc(d.id) + '"' : '') + '>' + esc(d.rotulo.length > 22 ? d.rotulo.slice(0, 21) + '…' : d.rotulo) + '</text>';
    let x = o.rotuloL;
    const segs = series.filter(s => (d.valores[s.chave] || 0) > 0);
    segs.forEach((s, j) => {
      const v = d.valores[s.chave] || 0;
      const w = Math.max(2, v / max * area - (j < segs.length - 1 ? 2 : 0));
      const r = j === segs.length - 1 ? 3 : 0;                    // ponta arredondada só no fim da barra
      svg += '<g class="hov" data-tip="' + esc(d.rotulo + '\n' + s.nome + ': ' + num(v)) + '"' + (d.id ? ' data-id="' + esc(d.id) + '"' : '') + '>' +
        '<rect class="seg" x="' + x.toFixed(1) + '" y="' + y + '" width="' + w.toFixed(1) + '" height="' + o.barra + '" rx="' + r + '" fill="' + cor(s.cor) + '"/></g>';
      x += w + (j < segs.length - 1 ? 2 : 0);
    });
    svg += '<text x="' + (x + 6).toFixed(1) + '" y="' + (y + o.barra / 2 + 4) + '" class="valor">' + num(total(d)) + '</text>';
  });
  return legenda(series) + svg + '</svg>';
}

// Barras verticais agrupadas por categoria do eixo x (ex.: dias), uma barra por série.
// dados: [{ rotulo, valores: { chave: n } }]
export function barrasAgrupadas(dados, series, o) {
  o = Object.assign({ largura: 560, altura: 190, esq: 30, base: 22 }, o || {});
  if (!dados.length) return '<div class="vazio">Sem dados ainda: o gráfico enche a cada leitura do dia.</div>';
  const max = Math.max(1, ...dados.flatMap(d => series.map(s => d.valores[s.chave] || 0)));
  const { topo, passo } = escala(max);
  const area = o.altura - o.base - 8, larg = o.largura - o.esq - 4;
  const grupo = larg / dados.length, barraW = Math.max(3, Math.min(16, (grupo - 6) / series.length - 2));
  let svg = '<svg class="viz" viewBox="0 0 ' + o.largura + ' ' + o.altura + '" width="100%" role="img" aria-label="' + esc(o.titulo || 'gráfico de barras') + '">';
  for (let v = 0; v <= topo; v += passo) {
    const y = 8 + area - v / topo * area;
    svg += '<line class="' + (v === 0 ? 'base' : 'grid') + '" x1="' + o.esq + '" x2="' + (o.largura - 4) + '" y1="' + y + '" y2="' + y + '"/>' +
      '<text x="' + (o.esq - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + num(v) + '</text>';
  }
  dados.forEach((d, i) => {
    const gx = o.esq + i * grupo + (grupo - series.length * (barraW + 2)) / 2;
    series.forEach((s, j) => {
      const v = d.valores[s.chave] || 0;
      const h = v / topo * area;
      const x = gx + j * (barraW + 2), y = 8 + area - h;
      if (h > 0) svg += '<path d="M' + x + ',' + (8 + area) + 'V' + (y + 3) + 'q0,-3 3,-3h' + (barraW - 6) + 'q3,0 3,3V' + (8 + area) + 'Z" fill="' + cor(s.cor) + '"/>';
    });
    svg += '<rect class="alvo" x="' + (o.esq + i * grupo) + '" y="8" width="' + grupo + '" height="' + area + '" data-tip="' + esc(d.rotulo + '\n' + series.map(s => s.nome + ': ' + num(d.valores[s.chave] || 0)).join('\n')) + '"/>';
    if (dados.length <= 16 || i % 2 === 0) svg += '<text x="' + (o.esq + i * grupo + grupo / 2) + '" y="' + (o.altura - 6) + '" text-anchor="middle">' + esc(d.rotulo) + '</text>';
  });
  return legenda(series) + svg + '</svg>';
}

// Linha de uma série ao longo das horas do dia (ex.: pendências por hora). pontos: [{ x: 0..23, y }]
export function linhaDoDia(pontos, o) {
  o = Object.assign({ largura: 560, altura: 170, esq: 34, base: 22, cor: 's1', nome: 'Pendências' }, o || {});
  if (!pontos.length) return '<div class="vazio">Sem dados ainda: a linha aparece conforme as leituras do dia.</div>';
  const max = Math.max(1, ...pontos.map(p => p.y));
  const { topo, passo } = escala(max);
  const area = o.altura - o.base - 8, larg = o.largura - o.esq - 8;
  const X = h => o.esq + (h - 6) / 15 * larg;                     // eixo de 6h a 21h
  const Y = v => 8 + area - v / topo * area;
  let svg = '<svg class="viz" viewBox="0 0 ' + o.largura + ' ' + o.altura + '" width="100%" role="img" aria-label="' + esc(o.titulo || 'gráfico de linha') + '">';
  for (let v = 0; v <= topo; v += passo) svg += '<line class="' + (v === 0 ? 'base' : 'grid') + '" x1="' + o.esq + '" x2="' + (o.largura - 4) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text x="' + (o.esq - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + num(v) + '</text>';
  for (let h = 6; h <= 21; h += 3) svg += '<text x="' + X(h) + '" y="' + (o.altura - 6) + '" text-anchor="middle">' + h + 'h</text>';
  const pts = pontos.filter(p => p.x >= 6 && p.x <= 21).sort((a, b) => a.x - b.x);
  if (pts.length > 1) svg += '<polyline fill="none" stroke="' + cor(o.cor) + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="' + pts.map(p => X(p.x).toFixed(1) + ',' + Y(p.y).toFixed(1)).join(' ') + '"/>';
  pts.forEach(p => {
    svg += '<circle cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="4" fill="' + cor(o.cor) + '" stroke="var(--surface)" stroke-width="2"/>' +
      '<rect class="alvo" x="' + (X(p.x) - larg / 32).toFixed(1) + '" y="8" width="' + (larg / 16).toFixed(1) + '" height="' + area + '" data-tip="' + esc(p.x + 'h · ' + o.nome + ': ' + num(p.y)) + '"/>';
  });
  return svg + '</svg>';
}

// Mapa de calor (grade linha × coluna) com o número dentro da célula. Cor sequencial de um só tom
// (--viz-seq-1..5, do claro ao escuro; zero fica neutro), tinta do texto conforme o fundo (--viz-seq-ink-*).
// linhas: [{ id, rotulo, valores: [n...] }]  colunas: [{ id, rotulo }]
export function mapaDeCalor(linhas, colunas, o) {
  o = o || {};
  if (!linhas.length) return '<div class="vazio">Sem dados.</div>';
  const max = Math.max(1, ...linhas.flatMap(l => l.valores));
  const passo = v => (v > 0 ? Math.max(1, Math.ceil(v / max * 5)) : 0);
  const cab = '<div class="mc-c mc-h"></div>' + colunas.map(c => '<div class="mc-c mc-h">' + esc(c.rotulo) + '</div>').join('') + '<div class="mc-c mc-h mc-t">Total</div>';
  const corpo = linhas.map(l => '<div class="mc-c mc-r' + (o.fixo === l.id ? ' rot-alerta' : (o.destaque || []).includes(l.id) ? ' rot-destaque' : '') + '" title="' + esc(l.rotulo) + '">' + esc(l.rotulo) + '</div>' +
    l.valores.map((v, j) => '<button type="button" class="mc-c mc-v s' + passo(v) + '"' + (v ? '' : ' disabled') + ' data-id="' + esc(l.id) + '" data-col="' + esc(colunas[j].id) + '" data-tip="' + esc(l.rotulo + ' · ' + colunas[j].rotulo + '\n' + num(v) + (v === 1 ? ' solicitação' : ' solicitações')) + '">' + (v ? num(v) : '') + '</button>').join('') +
    '<div class="mc-c mc-t">' + num(l.valores.reduce((a, b) => a + b, 0)) + '</div>').join('');
  return '<div class="mapa-calor" role="table" aria-label="' + esc(o.titulo || 'mapa de calor') + '" style="--mc-cols:' + colunas.length + '">' + cab + corpo + '</div>' +
    '<div class="mc-leg"><span>menos</span>' + [1, 2, 3, 4, 5].map(i => '<i class="s' + i + '"></i>').join('') + '<span>mais</span></div>';
}

/* ---------- painel do Hoje: anel, radar, pulso e mosaico ---------- */
const calmo = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Números que sobem do valor anterior ao novo: <b data-conta="42" data-de="38">42</b>
export function animarNumeros(raiz) {
  if (calmo()) return;
  raiz.querySelectorAll('[data-conta]').forEach(el => {
    const ate = Number(el.dataset.conta), de = Number(el.dataset.de || 0);
    if (!isFinite(ate) || de === ate) return;
    const t0 = performance.now(), dur = 700;
    const passo = t => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = num(Math.round(de + (ate - de) * e)) + (el.dataset.suf || ''); if (p < 1) requestAnimationFrame(passo); };
    requestAnimationFrame(passo);
  });
}

// Anel (rosca) de partes de um todo. fatias: [{ k, rot, n, cor }]
// o: { ativo, rotulo, anima, de, deFatias, titulo, centro: { n, de, suf }, semLegenda, tam, esp }
export function anel(fatias, o) {
  o = Object.assign({ tam: 168, esp: 14 }, o || {});
  const total = fatias.reduce((a, f) => a + f.n, 0);
  const r = (o.tam - o.esp) / 2 - 4, c = 2 * Math.PI * r, cx = o.tam / 2;
  const usadas = fatias.filter(f => f.n > 0);
  let acum = 0, svg = '';
  usadas.forEach(f => {
    const comp = f.n / total * c, d = Math.max(0.5, comp - (usadas.length > 1 ? 2 : 0));
    svg += '<circle class="an-f' + (o.ativo === f.k ? ' ativo' : o.ativo ? ' apagado' : '') + (o.anima ? ' entra' : '') + '" data-motivo="' + esc(f.k) + '" data-tip="' + esc(f.rot + ': ' + num(f.n) + ' (' + Math.round(f.n / total * 100) + '%)') + '" cx="' + cx + '" cy="' + cx + '" r="' + r.toFixed(2) + '" fill="none" stroke="' + cor(f.cor) + '" stroke-width="' + o.esp + '" stroke-dasharray="' + d.toFixed(2) + ' ' + (c - d).toFixed(2) + '" stroke-dashoffset="' + (-acum).toFixed(2) + '" style="--c:' + c.toFixed(2) + '" transform="rotate(-90 ' + cx + ' ' + cx + ')"/>';
    acum += comp;
  });
  if (!usadas.length) svg += '<circle cx="' + cx + '" cy="' + cx + '" r="' + r.toFixed(2) + '" fill="none" stroke="var(--rule)" stroke-width="' + o.esp + '"/>';
  const cv = o.centro || { n: total, de: o.de != null ? o.de : total, suf: '' };
  const centro = '<text x="' + cx + '" y="' + (cx + 4) + '" text-anchor="middle" class="an-total"><tspan data-conta="' + cv.n + '" data-de="' + (cv.de != null ? cv.de : cv.n) + '"' + (cv.suf ? ' data-suf="' + cv.suf + '"' : '') + '>' + num(cv.n) + (cv.suf || '') + '</tspan></text>' +
    '<text x="' + cx + '" y="' + (cx + 24) + '" text-anchor="middle" class="an-rot">' + esc(o.rotulo || 'pendências') + '</text>';
  return '<div class="anel"><svg class="viz an-svg" viewBox="0 0 ' + o.tam + ' ' + o.tam + '" width="' + o.tam + '" height="' + o.tam + '" role="img" aria-label="' + esc(o.titulo || 'pendências por motivo') + '">' + svg + centro + '</svg>' +
    (o.semLegenda ? '</div>' : '<div class="an-leg" role="group" aria-label="Filtrar por motivo">' + fatias.map(f => '<button type="button" class="an-l' + (o.ativo === f.k ? ' ativo' : '') + '" data-motivo="' + esc(f.k) + '"' + (f.n ? '' : ' disabled') + ' aria-pressed="' + (o.ativo === f.k) + '"><i style="background:' + cor(f.cor) + '"></i><span>' + esc(f.rot) + '</span><b data-conta="' + f.n + '" data-de="' + ((o.deFatias || {})[f.k] != null ? o.deFatias[f.k] : f.n) + '">' + num(f.n) + '</b></button>').join('') + '</div></div>');
}

// Anel pequeno de progresso (cartões do Hoje): pct 0..100 e o conteúdo do centro em HTML.
export function anelProgresso(pct, centro, o) {
  o = Object.assign({ tam: 58 }, o || {});
  return '<span class="ap" style="--sz:' + o.tam + 'px"><svg class="ap-svg" viewBox="0 0 36 36" aria-hidden="true"><circle class="bg" cx="18" cy="18" r="15.9" pathLength="100"/>' +
    (pct == null ? '' : '<circle class="fg" cx="18" cy="18" r="15.9" pathLength="100" style="stroke-dasharray:' + Math.max(0.01, pct).toFixed(1) + ' 100"/>') +
    '</svg><span class="ap-c">' + centro + '</span></span>';
}

/* ---------- dica (tooltip) compartilhada ---------- */
export function ligarDicas(raiz) {
  const dica = document.getElementById('dica');
  raiz.addEventListener('mousemove', e => {
    const alvo = e.target.closest && e.target.closest('[data-tip]');
    if (!alvo) { dica.hidden = true; return; }
    dica.textContent = alvo.getAttribute('data-tip');
    dica.hidden = false;
    const w = dica.offsetWidth, h = dica.offsetHeight;
    dica.style.left = Math.min(innerWidth - w - 8, e.clientX + 14) + 'px';
    dica.style.top = Math.max(8, e.clientY - h - 10) + 'px';
  });
  raiz.addEventListener('mouseleave', () => { dica.hidden = true; });
}

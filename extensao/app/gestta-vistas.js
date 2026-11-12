/* Control Onvio · Tarefas do Gestta (0.77.0): as visões de trabalho do analista.
 *  - Meu dia: a fila do dia (resolver agora, vence hoje, com impedimento, próximos 3 dias úteis) com o detalhe ao lado e atalhos.
 *  - Empresas: a lista de empresas (ordem por risco, progresso, próxima meta ou nome) e a ficha da empresa escolhida: progresso,
 *    situações, próxima meta, a trilha do mês com o nome de cada etapa (ou a linha do tempo) e as tarefas em colunas por situação.
 *  - Lista: uma tabela densa, agrupada por prazo, por empresa ou sem grupo, ordenada pelo cabeçalho.
 *  - Obrigações: a grade empresa × obrigação do mês, com a marca da situação e o dia em cada célula.
 * Tudo sai das tarefas já lidas (cmd gesttaTarefas): nada é guardado; abrir só navega no próprio Gestta. */
import { $, $$, esc, num, plural, lerPref, gravarPref } from './util.js';
import { abrirPainel, aoPassarPainel, abrirNoGestta, trilhaTempo, cabecalhoTempo, linhaDoHoje } from './gestta-trilha.js';
import { LOTE, caixaLinha, caixaCab, barraLote, ligarLote } from './gestta-lote.js';
const G = window.OCG;
const MARCA = { feita: '✓', multa: '!', atrasada: '!', impedimento: '', hoje: '', afazer: '' };
const EST = { feita: 'feita', multa: 'multa', atrasada: 'atrasada', impedimento: 'impedimento', hoje: 'hoje', proximas: 'afazer', depois: 'afazer' };
const COR = { multa: 'multa', atrasada: 'atraso', impedimento: 'imped', hoje: 'hoje', proximas: 'prox', depois: 'depois', feita: 'feita' };
const TIPO = { RECURRENT: 'Recorrente', SERVICE_ORDER: 'OS', ACCOUNTING: 'Contábil' };
const ddmm = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '';
const dataDe = t => { const d = G.diaLocal(t && t.due_date); return d ? G.ymd(d) : ''; };
export const estadoDe = (t, hoje) => EST[G.grupoTarefa(t, hoje)] || 'afazer';
export const marca = est => '<i class="gt-et gt-et-p gt-e-' + est + '" aria-hidden="true"><span class="gt-et-mk">' + MARCA[est] + '</span></i>';
const cliHtml = c => (c && c.code ? '<span class="gt-cod">' + esc(c.code) + '</span>' : '') + esc((c && c.name) || 'Sem cliente');
const etapasMini = t => Number(t.total_step) > 0 ? '<span class="gt-etapas" title="' + num(t.done_step || 0) + ' de ' + num(t.total_step) + ' etapas"><i style="--p:' + Math.round((t.done_step || 0) / t.total_step * 100) + '%"></i>' + num(t.done_step || 0) + '/' + num(t.total_step) + '</span>' : '';
function anel(pct, tam, esp) {
  const e = esp || 8, r = (tam - e) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, pct));
  return '<svg class="gt-anel" width="' + tam + '" height="' + tam + '" viewBox="0 0 ' + tam + ' ' + tam + '" aria-hidden="true"><circle cx="' + tam / 2 + '" cy="' + tam / 2 + '" r="' + r + '" class="gt-anel-fundo" style="stroke-width:' + e + '"/><circle cx="' + tam / 2 + '" cy="' + tam / 2 + '" r="' + r + '" class="gt-anel-valor" style="stroke-width:' + e + '" stroke-dasharray="' + (c * v / 100).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 ' + tam / 2 + ' ' + tam / 2 + ')"/></svg>';
}
// Desenha uma lista longa em blocos à medida que rola (sem "ver mais", regra do Josué)
function emBlocos(corpo, partes, bloco) {
  let n = 0;
  const fim = document.createElement('div'); fim.className = 'gt-fim-bloco'; fim.setAttribute('aria-hidden', 'true');
  corpo.after(fim);
  const mais = () => { const ate = Math.min(partes.length, n + bloco); corpo.insertAdjacentHTML('beforeend', partes.slice(n, ate).join('')); n = ate; fim.hidden = n >= partes.length; };
  mais();
  if (n < partes.length && 'IntersectionObserver' in window) { const io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { mais(); if (n >= partes.length) io.disconnect(); } }, { rootMargin: '600px' }); io.observe(fim); }
}

/* ======================= Meu dia ======================= */
const D = { sel: null };
export function vistaDia(el, x) {
  const md = G.meuDia(x.itens, x.hoje, 3), fila = md.fila.concat(md.adiante || []);
  const pctHoje = md.totalHoje ? Math.round(md.feitasHoje / md.totalHoje * 100) : 100;
  const dataTx = x.hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const blocos = [
    ['agora', 'Resolver agora', 'gerando multa ou com a meta vencida', md.agora, 'multa'],
    ['hoje', 'Vencem hoje', 'a meta é hoje', md.hoje, 'hoje'],
    ['imped', 'Com impedimento', 'paradas esperando algo do cliente ou de outro setor', md.impedimento, 'imped'],
    ['prox', 'Próximos 3 dias úteis', 'para adiantar', md.proximos, 'prox']
  ];
  let n = 0;
  const linha = t => { n++; const est = estadoDe(t, x.hoje); return '<li class="gd-it gt-c-' + COR[G.grupoTarefa(t, x.hoje)] + '" role="option" tabindex="-1" data-id="' + esc(t._id) + '" aria-selected="false"><span class="gd-num">' + n + '</span>' + marca(est) +
    '<span class="gd-tx"><b>' + esc(t.name || 'Tarefa sem nome') + '</b><span>' + cliHtml(t.customer) + '</span></span><span class="gd-prazo' + (est === 'multa' || est === 'atrasada' ? ' alerta' : '') + '">' + esc(G.prazoTexto(t, x.hoje)) + '</span>' +
    '<button type="button" class="icon-btn gd-abrir" data-abrir="' + esc(t._id) + '" tabindex="-1" title="Abrir no Gestta" aria-label="Abrir no Gestta"><svg class="ic ic-sm"><use href="#i-ext"/></svg></button></li>'; };
  const bloco = b => '<section class="gd-bloco gt-c-' + b[4] + (b[0] === 'adiante' ? ' gd-adiante' : '') + '"><h3><i class="gt-ponto"></i>' + esc(b[1]) + '<span class="gt-n">' + b[3].length + '</span><small>' + esc(b[2]) + '</small></h3><ol class="gd-ol" role="listbox" aria-label="' + esc(b[1]) + '">' + b[3].map(linha).join('') + '</ol></section>';
  const principal = blocos.filter(b => b[3].length).map(bloco).join('');                        // antes, para a numeração seguir a ordem
  const adiante = (md.adiante || []).length ? bloco(['adiante', 'Mais adiante', 'as próximas metas depois disso', md.adiante, 'depois']) : '';
  // 0.87.0: com a fila vazia, o dia livre comemora e mostra o que vem depois (para adiantar)
  const lista = md.fila.length ? principal + adiante
    : '<div class="gd-livre"><span class="gd-livre-ic" aria-hidden="true">✓</span><b>Tudo em dia</b><span class="gd-livre-sub">Nada atrasado, nada vencendo hoje nem nos próximos 3 dias úteis' + (x.filtro ? ' com esses filtros' : '') + '.' + (adiante ? ' Se quiser adiantar, as próximas estão logo abaixo.' : '') + '</span></div>' + adiante;
  el.innerHTML = (x.mesAtual ? '' : '<p class="gt-outra">Você está vendo outro mês: o Meu dia conta a partir de hoje.</p>') +
    '<div class="gd">' +
      '<section class="gd-col">' +
        '<header class="gd-cab cfg-card"><div class="gd-anel">' + anel(pctHoje, 56, 7) + '<b>' + md.feitasHoje + '/' + md.totalHoje + '</b></div><div class="gd-cab-tx"><b>' + esc(dataTx.replace(/^./, c => c.toUpperCase())) + '</b><span>' +
          (md.totalHoje ? md.feitasHoje + ' de ' + md.totalHoje + ' com meta hoje concluídas' : 'Nenhuma tarefa com meta hoje') + '</span><small>' + plural(fila.length, 'tarefa', 'tarefas') + ' na fila' + (md.agora.length ? ' · ' + md.agora.length + ' para resolver agora' : '') + '</small></div>' +
          '<span class="gd-teclas ajuda" aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd> mudar · <kbd>Enter</kbd> abrir no Gestta</span></header>' +
        '<div class="gd-lista" id="gd-lista">' + lista + '</div></section>' +
      '<aside class="gd-det cfg-card" id="gd-det" aria-label="Detalhe da tarefa">' + (fila.length ? '' : '<p class="fraco gd-det-vazio">Escolha uma tarefa para ver o detalhe.</p>') + '</aside>' +
    '</div>';
  const escolher = (id, foco) => {
    const i = fila.findIndex(t => t._id === id); if (i < 0) return;
    D.sel = id;
    $$('.gd-it', el).forEach(li => { const on = li.dataset.id === id; li.classList.toggle('on', on); li.setAttribute('aria-selected', String(on)); li.tabIndex = on ? 0 : -1; if (on && foco) { li.focus({ preventScroll: true }); li.scrollIntoView({ block: 'nearest' }); } });
    abrirPainel(fila, i, x.paraPai, { alvo: $('#gd-det', el) });
    aoPassarPainel(d => mover(d, false));
  };
  const mover = (d, foco) => { const i = fila.findIndex(t => t._id === D.sel), j = Math.max(0, Math.min(fila.length - 1, i + d)); if (fila[j]) escolher(fila[j]._id, foco !== false); };
  $$('.gd-it', el).forEach(li => { li.onclick = e => { const a = e.target.closest('[data-abrir]'); if (a) { e.stopPropagation(); x.paraPai({ controlGestta: 'abrirTarefa', id: a.dataset.abrir }); return; } escolher(li.dataset.id, true); }; });
  if (fila.length) escolher(fila.some(t => t._id === D.sel) ? D.sel : fila[0]._id, false);
  x.teclas(e => {
    if (!fila.length) return false;
    if (e.key === 'ArrowDown' || e.key === 'j') { mover(1); return true; }
    if (e.key === 'ArrowUp' || e.key === 'k') { mover(-1); return true; }
    if (e.key === 'Enter') { abrirNoGestta(); return true; }
    if (e.key === 'o') { const u = G.urlTarefa(D.sel); if (u) window.open(u, '_blank', 'noopener'); return true; }
    return false;
  });
}

/* ======================= Empresas ======================= */
const EM = { sel: null, ordem: lerPref('gt.emp.ordem', 'risco'), trilha: lerPref('gt.trilha', 'seq') };
function barraEmpresa(e) {
  const al = e.multa + e.atrasada, af = e.abertas - al - e.impedimento;
  const seg = (cls, v, rot) => v ? '<i class="' + cls + '" style="flex:' + v + '" title="' + v + ' ' + rot + '"></i>' : '';
  return '<span class="ge-barra" aria-hidden="true">' + seg('b-feita', e.feitas, 'concluídas') + seg('b-alerta', al, 'com multa ou atraso') + seg('b-imped', e.impedimento, 'com impedimento') + seg('b-aberta', Math.max(0, af), 'a fazer') + '</span>';
}
function itemEmpresa(e) {
  const al = e.multa + e.atrasada, fechada = e.n && e.feitas === e.n;
  return '<li class="ge-emp" role="option" tabindex="-1" data-emp="' + esc(e.id) + '" aria-selected="false"><span class="ge-emp-top"><b title="' + esc(e.nome) + '">' + esc(e.nome) + '</b>' +
    (al ? '<span class="ge-alerta" title="' + al + ' com multa ou atraso">' + marca(e.multa ? 'multa' : 'atrasada') + al + '</span>' : fechada ? '<span class="ge-ok" title="Competência fechada">✓</span>' : '') + '</span>' +
    '<span class="ge-emp-sub">' + (e.codigo ? '<span class="gt-cod">' + esc(e.codigo) + '</span>' : '') + num(e.feitas) + '/' + num(e.n) + (e.proxima && e.abertas ? ' · próxima ' + ddmm(e.proxima) : '') + '</span>' + barraEmpresa(e) + '</li>';
}
function stepper(tr, k) {
  if (!tr.total) return '<p class="fraco">Sem tarefas com esses filtros.</p>';
  return '<ol class="gf-step">' + tr.etapas.map((e, i) => {
    const dica = [e.t.name || 'Tarefa', G.ESTADOS[e.estado], e.prazo, G.setorDe(e.t), G.respDe(e.t)].filter(Boolean).join(' · ');
    return '<li class="gf-st' + (i <= tr.cheiaAte ? ' cheia' : '') + (i === tr.proxima ? ' proxima' : '') + '"><button type="button" class="gf-st-btn" data-et="' + esc(e.t._id) + '" data-emp="' + esc(k) + '" title="' + esc(dica) + '" aria-label="' + esc(dica) + '">' +
      '<span class="gt-et gt-e-' + e.estado + '"><span class="gt-et-mk" aria-hidden="true">' + MARCA[e.estado] + '</span></span><span class="gf-st-nome">' + esc(e.t.name || 'Tarefa') + '</span><span class="gf-st-dia">' + esc(ddmm(e.data) || 'sem meta') + '</span></button></li>';
  }).join('') + '</ol>';
}
const COLUNAS_KANBAN = [
  ['resolver', 'Resolver agora', ['multa', 'atrasada'], 'multa'],
  ['afazer', 'A fazer', ['hoje', 'proximas', 'depois'], 'prox'],
  ['imped', 'Com impedimento', ['impedimento'], 'imped'],
  ['feita', 'Concluídas', ['feita'], 'feita']
];
function cartao(t, hoje, k) {
  const g = G.grupoTarefa(t, hoje), est = EST[g];
  return '<button type="button" class="gk-c gt-c-' + COR[g] + '" data-et="' + esc(t._id) + '" data-emp="' + esc(k) + '">' + '<span class="gk-c-top">' + marca(est) + '<b>' + esc(t.name || 'Tarefa') + '</b></span>' +
    '<span class="gk-c-pe"><span class="gk-prazo' + (est === 'multa' || est === 'atrasada' ? ' alerta' : '') + '">' + esc(G.prazoTexto(t, hoje)) + '</span>' + etapasMini(t) + '</span>' +
    (G.setorDe(t) || G.respDe(t) ? '<span class="gk-c-sub">' + esc([G.setorDe(t), G.respDe(t)].filter(Boolean).join(' · ')) + '</span>' : '') + '</button>';
}
function fichaHtml(e, x) {
  const tr = G.trilhaDaEmpresa(e.tarefas, x.hoje), k = e.id;
  const prox = tr.proxima >= 0 ? tr.etapas[tr.proxima] : null;
  // 0.87.0: só as situações que existem (o zero não diz nada e ocupa espaço)
  const stat = (est, n, rot) => n ? '<span class="gf-stat">' + marca(est) + '<b>' + num(n) + '</b>' + rot + '</span>' : '';
  const setores = [...new Set(e.tarefas.map(t => G.setorDe(t)).filter(Boolean))];
  const porSetor = setores.length > 1 ? '<div class="gf-setores">' + setores.sort((a, b) => a.localeCompare(b, 'pt-BR')).map(s => { const l = e.tarefas.filter(t => G.setorDe(t) === s && G.grupoTarefa(t, x.hoje)), f = l.filter(t => G.grupoTarefa(t, x.hoje) === 'feita').length; return '<span class="gf-setor"><span>' + esc(s) + '</span><span class="gt-bar-trilho"><i style="width:' + (l.length ? Math.round(f / l.length * 100) : 0) + '%"></i></span><b>' + f + '/' + l.length + '</b></span>'; }).join('') + '</div>' : '';
  // 0.87.0: as colunas vazias saem, e as que ficam dividem a largura
  const colsK = COLUNAS_KANBAN.map(([ck, rot, grupos, cor]) => [rot, cor, tr.etapas.filter(et => grupos.includes(et.grupo)).map(et => et.t)]).filter(c => c[2].length);
  const kanban = colsK.map(([rot, cor, l]) => '<section class="gk-col gt-c-' + cor + '"><h4><i class="gt-ponto"></i>' + rot + '<span class="gt-n">' + l.length + '</span></h4>' + l.map(t => cartao(t, x.hoje, k)).join('') + '</section>').join('');
  const modo = (m, ic, rot) => '<button type="button" class="' + (EM.trilha === m ? 'on' : '') + '" data-gf-trilha="' + m + '" aria-pressed="' + (EM.trilha === m) + '"><svg class="ic ic-sm"><use href="#' + ic + '"/></svg>' + rot + '</button>';
  return '<header class="gf-cab"><div class="gf-tit"><h2>' + esc(e.nome) + '</h2><p>' + (e.codigo ? '<span class="gt-cod">' + esc(e.codigo) + '</span>' : '') + plural(e.n, 'tarefa', 'tarefas') + ' na competência' + (setores.length ? ' · ' + esc(setores.join(', ')) : '') + '</p></div>' +
      '<div class="gf-prog">' + anel(tr.pct, 64, 8) + '<div><b>' + tr.pct + '%</b><span>' + num(tr.feitas) + ' de ' + num(tr.total) + ' concluídas</span></div></div></header>' +
    '<div class="gf-stats">' + stat('multa', e.multa, 'gerando multa') + stat('atrasada', e.atrasada, 'atrasadas') + stat('impedimento', e.impedimento, 'impedimento') + stat('hoje', e.hoje, 'vencem hoje') + stat('afazer', Math.max(0, e.abertas - e.multa - e.atrasada - e.impedimento - e.hoje), 'a fazer') + stat('feita', e.feitas, 'concluídas') + '</div>' +
    (prox ? '<button type="button" class="gf-prox gt-c-' + COR[prox.grupo] + '" data-et="' + esc(prox.t._id) + '" data-emp="' + esc(k) + '"><span class="gf-prox-rot">Próxima etapa</span>' + marca(prox.estado) + '<b>' + esc(prox.t.name || 'Tarefa') + '</b><span>' + esc(prox.prazo) + '</span><svg class="ic ic-sm"><use href="#i-chev-r"/></svg></button>'
      : tr.total ? '<div class="gf-prox gf-fechado"><span class="ge-ok" aria-hidden="true">✓</span><b>Competência fechada</b><span>todas as tarefas concluídas</span></div>' : '') +
    porSetor +
    '<section class="gf-sec"><div class="gf-sec-cab"><h3>Trilha da competência</h3><div class="seg gt-modos" role="group" aria-label="Como desenhar as etapas">' + modo('seq', 'i-repeat', 'Trilha') + modo('tempo', 'i-calendar', 'Linha do tempo') + '</div></div>' +
      (EM.trilha === 'tempo' ? '<div class="gf-tempo">' + cabecalhoTempo(x.ano, x.mes) + '<div class="gt-tr-trilha tempo">' + trilhaTempo(tr, k, x.ano, x.mes) + linhaDoHoje(x.ano, x.mes) + '</div></div>' : stepper(tr, k)) + '</section>' +
    (colsK.length ? '<section class="gf-sec"><h3>Tarefas por situação</h3><div class="gk' + (colsK.length === 1 ? ' gk-1' : '') + '" style="--gk-n:' + colsK.length + '">' + kanban + '</div></section>' : '');
}
export function vistaEmpresas(el, x) {
  const emps = G.ordenarEmpresas(G.porEmpresa(x.itens, x.hoje).filter(e => !x.soPend || e.abertas), EM.ordem);
  const mapa = new Map(emps.map(e => [e.id, e]));
  if (!emps.length) { el.innerHTML = x.vazio(); return; }
  if (!mapa.has(EM.sel)) EM.sel = emps[0].id;
  el.innerHTML = '<div class="ge">' +
    '<aside class="ge-col cfg-card"><div class="ge-col-cab"><b>' + plural(emps.length, 'empresa', 'empresas') + '</b><label class="gt-sel"><span>Ordem</span><select id="ge-ordem">' + Object.entries(G.ORDENS_EMPRESA).map(([k, r]) => '<option value="' + k + '"' + (EM.ordem === k ? ' selected' : '') + '>' + r + '</option>').join('') + '</select></label></div>' +
      '<ol class="ge-lista" id="ge-lista" role="listbox" aria-label="Empresas"></ol></aside>' +
    '<section class="ge-ficha cfg-card" id="ge-ficha" aria-live="polite"></section></div>';
  const ol = $('#ge-lista', el);
  emBlocos(ol, emps.map(itemEmpresa), 150);
  const ficha = () => {
    const e = mapa.get(EM.sel); if (!e) return;
    $('#ge-ficha', el).innerHTML = fichaHtml(e, x);
    $$('.ge-emp', el).forEach(li => { const on = li.dataset.emp === EM.sel; li.classList.toggle('on', on); li.setAttribute('aria-selected', String(on)); li.tabIndex = on ? 0 : -1; });
    $$('[data-gf-trilha]', el).forEach(b => b.onclick = () => { EM.trilha = b.dataset.gfTrilha; gravarPref('gt.trilha', EM.trilha); ficha(); });
    requestAnimationFrame(() => { const st = $('.gf-step', el), p = st && st.querySelector('.proxima'); if (p && st.scrollWidth > st.clientWidth) st.scrollLeft = Math.max(0, p.offsetLeft - 60); });
  };
  const escolher = (id, foco) => { EM.sel = id; ficha(); if (foco) { const li = $$('.ge-emp', el).find(l => l.dataset.emp === id); if (li) { li.focus({ preventScroll: true }); li.scrollIntoView({ block: 'nearest' }); } } };
  ol.addEventListener('click', e => { const li = e.target.closest('.ge-emp'); if (li) escolher(li.dataset.emp, true); });
  $('#ge-ordem', el).onchange = e => { EM.ordem = e.target.value; gravarPref('gt.emp.ordem', EM.ordem); vistaEmpresas(el, x); };
  ficha();
  x.ligarEtapas(el, id => (mapa.get(id) || {}).tarefas || []);
  x.teclas(e => {
    if (!e.target.closest || !e.target.closest('.ge-lista')) return false;
    const i = emps.findIndex(z => z.id === EM.sel);
    if (e.key === 'ArrowDown' || e.key === 'j') { if (emps[i + 1]) escolher(emps[i + 1].id, true); return true; }
    if (e.key === 'ArrowUp' || e.key === 'k') { if (emps[i - 1]) escolher(emps[i - 1].id, true); return true; }
    return false;
  });
}

/* ======================= Lista densa ======================= */
const L = { agrupar: lerPref('gt.lista.grupo', 'prazo'), col: '', desc: false };
const COLS = [
  { k: 'tarefa', rot: 'Tarefa', v: t => String(t.name || '') },
  { k: 'empresa', rot: 'Empresa', v: t => String((t.customer || {}).name || '') },
  { k: 'meta', rot: 'Meta', v: t => String(t.due_date || '9') },
  { k: 'situacao', rot: 'Situação', v: (t, h) => G.GRUPOS.findIndex(gr => gr.k === G.grupoTarefa(t, h)) },
  { k: 'setor', rot: 'Setor', v: t => G.setorDe(t) },
  { k: 'tipo', rot: 'Tipo', v: t => TIPO[t.type] || '' },
  { k: 'etapas', rot: 'Etapas', v: t => Number(t.total_step) ? (t.done_step || 0) / t.total_step : -1 }
];
export function vistaLista(el, x) {
  // 0.87.0: só as colunas que dizem algo: sem empresa quando já agrupa por empresa, sem etapas quando nenhuma tem,
  // sem tipo quando todas são do mesmo tipo, sem setor quando não há setor
  const tem = { setor: x.itens.some(t => G.setorDe(t)), etapas: x.itens.some(t => Number(t.total_step) > 0), tipo: new Set(x.itens.map(t => TIPO[t.type] || '')).size > 1, empresa: L.agrupar !== 'empresa' };
  const cols = COLS.filter(c => tem[c.k] !== false);
  const col = cols.find(c => c.k === L.col);
  const ord = col ? x.itens.slice().sort((a, b) => { const p = col.v(a, x.hoje), q = col.v(b, x.hoje); const r = p < q ? -1 : p > q ? 1 : 0; return L.desc ? -r : r; }) : x.itens;
  const linha = t => {
    const g = G.grupoTarefa(t, x.hoje), est = EST[g];
    const cel = {
      tarefa: '<span class="gl-c gl-nome" role="cell">' + marca(est) + '<b>' + esc(t.name || 'Tarefa sem nome') + '</b></span>',
      empresa: '<span class="gl-c gl-emp" role="cell">' + cliHtml(t.customer) + '</span>',
      meta: '<span class="gl-c gl-meta" role="cell">' + esc(ddmm(dataDe(t)) || '—') + '</span>',
      situacao: '<span class="gl-c gl-sit' + (est === 'multa' || est === 'atrasada' ? ' alerta' : '') + '" role="cell">' + esc(est === 'feita' ? 'Concluída' : G.prazoTexto(t, x.hoje).replace(/ \(\d\d\/\d\d\)$/, '')) + '</span>',
      setor: '<span class="gl-c gl-setor" role="cell">' + esc(G.setorDe(t) || '—') + '</span>',
      tipo: '<span class="gl-c gl-tipo" role="cell">' + esc(TIPO[t.type] || '') + '</span>',
      etapas: '<span class="gl-c gl-et" role="cell">' + (etapasMini(t) || '<span class="fraco">—</span>') + '</span>'
    };
    return '<div class="gl-r gt-c-' + COR[g] + (LOTE.sel.has(t._id) ? ' gl-marcada' : '') + '" role="row" tabindex="0" data-id="' + esc(t._id) + '">' + caixaLinha(t) + cols.map(c => cel[c.k]).join('') +
      '<span class="gl-c gl-ac" role="cell"><button type="button" class="icon-btn" data-abrir="' + esc(t._id) + '" title="Abrir no Gestta" aria-label="Abrir no Gestta"><svg class="ic ic-sm"><use href="#i-ext"/></svg></button></span></div>';
  };
  // grupos: por prazo (na ordem de urgência), por empresa (na ordem de risco) ou nenhum
  let partes = [], seq = [];
  const cabGrupo = (rot, n, cls, extra) => '<div class="gl-g ' + (cls || '') + '" role="row"><span role="cell"><i class="gt-ponto"></i><b>' + esc(rot) + '</b><span class="gt-n">' + num(n) + '</span>' + (extra || '') + '</span></div>';
  if (L.agrupar === 'prazo') G.GRUPOS.forEach(gr => { const l = ord.filter(t => G.grupoTarefa(t, x.hoje) === gr.k); if (!l.length) return; partes.push(cabGrupo(gr.rot, l.length, 'gt-c-' + COR[gr.k])); l.forEach(t => { partes.push(linha(t)); seq.push(t); }); });
  else if (L.agrupar === 'empresa') G.porEmpresa(ord, x.hoje).forEach(e => { const l = ord.filter(t => e.tarefas.includes(t)); partes.push(cabGrupo(e.nome, l.length, 'gl-g-emp', '<small>' + num(e.feitas) + '/' + num(e.n) + ' concluídas' + (e.multa + e.atrasada ? ' · ' + (e.multa + e.atrasada) + ' com multa ou atraso' : '') + '</small>' + barraEmpresa(e))); l.forEach(t => { partes.push(linha(t)); seq.push(t); }); });
  else ord.forEach(t => { partes.push(linha(t)); seq.push(t); });
  if (!seq.length) { el.innerHTML = x.vazio(); return; }
  const grid = '34px ' + cols.map(c => ({ tarefa: 'minmax(220px,2.2fr)', empresa: 'minmax(180px,1.6fr)', meta: '62px', situacao: 'minmax(130px,1fr)', setor: 'minmax(90px,.8fr)', tipo: '84px', etapas: '96px' })[c.k]).join(' ') + ' 40px';
  el.innerHTML = '<div class="gl-barra"><div class="seg gt-modos" role="group" aria-label="Agrupar">' + [['prazo', 'Por prazo'], ['empresa', 'Por empresa'], ['nada', 'Sem grupo']].map(([k, r]) => '<button type="button" class="' + (L.agrupar === k ? 'on' : '') + '" data-gl-grupo="' + k + '" aria-pressed="' + (L.agrupar === k) + '">' + r + '</button>').join('') + '</div><span class="gt-cont">' + plural(seq.length, 'tarefa', 'tarefas') + '</span></div>' +
    '<div id="gl-lote-host">' + barraLote(seq) + '</div>' +
    '<div class="gl cfg-card" role="table" aria-label="Tarefas" style="--gl-cols:' + grid + '"><div class="gl-h" role="row">' + caixaCab(seq) +
      cols.map(c => '<button type="button" role="columnheader" class="' + (L.col === c.k ? 'on' + (L.desc ? ' desc' : '') : '') + '" data-gl-col="' + c.k + '" aria-sort="' + (L.col === c.k ? (L.desc ? 'descending' : 'ascending') : 'none') + '">' + c.rot + '</button>').join('') + '<span></span></div>' +
      '<div class="gl-corpo" id="gl-corpo"></div></div>';
  emBlocos($('#gl-corpo', el), partes, 250);
  $$('[data-gl-grupo]', el).forEach(b => b.onclick = () => { L.agrupar = b.dataset.glGrupo; gravarPref('gt.lista.grupo', L.agrupar); vistaLista(el, x); });
  $$('[data-gl-col]', el).forEach(b => b.onclick = () => { if (L.col === b.dataset.glCol) { if (L.desc) { L.col = ''; L.desc = false; } else L.desc = true; } else { L.col = b.dataset.glCol; L.desc = false; } vistaLista(el, x); });
  // 0.99.0: marcar tarefas e agir em lote (gestta-lote.js); a seleção some quando a tarefa sai da lista
  for (const id of [...LOTE.sel]) if (!seq.some(t => t._id === id)) LOTE.sel.delete(id);
  ligarLote(el, seq, () => vistaLista(el, x));
  const abrir = r => { const i = seq.findIndex(t => t._id === r.dataset.id); if (i >= 0) abrirPainel(seq, i, x.paraPai); };
  const corpo = $('#gl-corpo', el);
  corpo.addEventListener('click', e => { if (e.target.closest('.gl-sel')) return; const a = e.target.closest('[data-abrir]'); if (a) { e.stopPropagation(); x.paraPai({ controlGestta: 'abrirTarefa', id: a.dataset.abrir }); return; } const r = e.target.closest('.gl-r'); if (r) abrir(r); });
  corpo.addEventListener('keydown', e => {
    const r = e.target.closest('.gl-r'); if (!r) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(r); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const rs = $$('.gl-r', corpo), j = rs.indexOf(r) + (e.key === 'ArrowDown' ? 1 : -1); if (rs[j]) rs[j].focus(); }
  });
}

/* ======================= Quadro de obrigações ======================= */
const Q = { col: '' };
export function vistaQuadro(el, x) {
  const ob = G.obrigacoes(x.itens, x.hoje);
  let linhas = ob.linhas.filter(l => !x.soPend || l.empresa.abertas);
  if (Q.col && !ob.colunas.some(c => c.nome === Q.col)) Q.col = '';
  if (Q.col) linhas = linhas.filter(l => (l.celulas.get(Q.col) || []).some(e => e.estado !== 'feita'));
  if (!ob.colunas.length || !linhas.length) { el.innerHTML = x.vazio(); return; }
  // 0.87.0: as obrigações que pedem atenção primeiro (com alerta, depois as mais pendentes, depois o nome)
  ob.colunas = ob.colunas.slice().sort((a, b) => (b.alerta || 0) - (a.alerta || 0) || ((b.total - b.feitas) - (a.total - a.feitas)) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const empMap = new Map(ob.linhas.map(l => [l.empresa.id, l.empresa]));
  const th = c => '<th scope="col" class="gq-h' + (Q.col === c.nome ? ' on' : '') + '"><button type="button" data-gq-col="' + esc(c.nome) + '" aria-pressed="' + (Q.col === c.nome) + '" title="' + esc(c.nome + ': ' + c.feitas + ' de ' + c.total + ' concluídas' + (c.alerta ? ', ' + c.alerta + ' com multa ou atraso' : '') + '. Clique para ver só as empresas com esta obrigação pendente.') + '">' +
    '<span class="gq-h-nome">' + esc(G.nomeLegivel(c.nome)) + '</span><span class="gq-h-n">' + num(c.feitas) + '/' + num(c.total) + (c.alerta ? ' <em>!' + c.alerta + '</em>' : '') + '</span><span class="gq-h-bar" aria-hidden="true"><i style="width:' + Math.round(c.feitas / c.total * 100) + '%"></i></span></button></th>';
  const linha = l => {
    const e = l.empresa;
    return '<tr><th scope="row" class="gq-emp"><b title="' + esc(e.nome) + '">' + esc(e.nome) + '</b><small>' + (e.codigo ? esc(e.codigo) + ' · ' : '') + num(e.feitas) + '/' + num(e.n) + '</small></th>' + ob.colunas.map(c => {
      const ets = l.celulas.get(c.nome);
      if (!ets) return '<td class="gq-c gq-vazio' + (Q.col === c.nome ? ' on' : '') + '"><span aria-label="não tem">·</span></td>';
      const pri = ets.find(z => z.estado !== 'feita') || ets[0];
      const dica = ets.map(z => [z.t.name, G.ESTADOS[z.estado], z.prazo].join(' · ')).join('\n');
      return '<td class="gq-c' + (Q.col === c.nome ? ' on' : '') + '"><button type="button" class="gq-b gq-e-' + pri.estado + '" data-et="' + esc(pri.t._id) + '" data-emp="' + esc(e.id) + '" title="' + esc(dica) + '" aria-label="' + esc(e.nome + ', ' + c.nome + ': ' + G.ESTADOS[pri.estado] + ', ' + pri.prazo) + '">' +
        marca(pri.estado) + '<span class="gq-dia">' + esc(ddmm(pri.data) || '—') + '</span>' + (ets.length > 1 ? '<span class="gq-mais">+' + (ets.length - 1) + '</span>' : '') + '</button></td>';
    }).join('') + '</tr>';
  };
  el.innerHTML = '<div class="gq-barra"><p class="gt-leg" aria-hidden="true"><span>' + marca('feita') + 'concluída</span><span>' + marca('multa') + 'multa ou atraso</span><span>' + marca('impedimento') + 'impedimento</span><span>' + marca('hoje') + 'vence hoje</span><span>' + marca('afazer') + 'a fazer</span><span>· não tem</span></p>' +
      '<span class="gt-cont">' + plural(ob.colunas.length, 'obrigação', 'obrigações') + ' · ' + plural(linhas.length, 'empresa', 'empresas') + (Q.col ? ' com ' + esc(Q.col) + ' pendente <button type="button" class="linkish" id="gq-tudo">ver todas</button>' : '') + '</span></div>' +
    '<div class="gq-wrap cfg-card"><table class="gq"><thead><tr><th scope="col" class="gq-emp gq-canto">Empresa</th>' + ob.colunas.map(th).join('') + '</tr></thead><tbody id="gq-corpo"></tbody></table></div>';
  emBlocos($('#gq-corpo', el), linhas.map(linha), 120);
  $$('[data-gq-col]', el).forEach(b => b.onclick = () => { Q.col = Q.col === b.dataset.gqCol ? '' : b.dataset.gqCol; vistaQuadro(el, x); });
  const tudo = $('#gq-tudo', el); if (tudo) tudo.onclick = () => { Q.col = ''; vistaQuadro(el, x); };
  x.ligarEtapas(el, id => (empMap.get(id) || {}).tarefas || []);
}

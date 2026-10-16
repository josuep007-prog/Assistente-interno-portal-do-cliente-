/* Consultar no Onvio · as 10 listas do Onvio (inclusive concluídas), consultadas na hora, e a busca universal.
 * Cada lista é uma aba do cabeçalho; a consulta vai ao service worker, que lê pela aba do Onvio. */
import { enviar } from '../estado.js';
import { esc, pillSituacao, ligarItens, fmtDataHora, fmtData, $, $$ } from '../util.js';
const OC = window.OC;

const est = { tipo: 'geral', filtro: 'pendentes', busca: '', pagina: 1, por: 50 };
let pedido = 0;
const COLS = '64px 168px 112px minmax(0,1.1fr) minmax(0,1.4fr) 140px 120px';

export function render(el, ctx, params) {
  params = params || {};
  if (params.q != null) return renderBusca(el, ctx, params.q);
  if (params.tipo && OC.TYPE_BY_KEY[params.tipo]) est.tipo = params.tipo;

  const { abas } = ctx.cab({
    titulo: 'Consultar no Onvio', sub: 'As listas do Onvio, consultadas na hora (inclusive as concluídas)',
    abas: OC.TYPES.map(t => ({ id: t.key, rot: t.label })), aba: est.tipo
  });
  el.innerHTML =
    '<div class="barra">' +
      '<div class="seg" role="group" aria-label="Situação">' + [['pendentes', 'Pendentes'], ['todas', 'Todas, inclusive concluídas']].map(([v, r]) => '<button data-f="' + v + '"' + (est.filtro === v ? ' class="on"' : '') + '>' + r + '</button>').join('') + '</div>' +
      '<input type="search" id="b" placeholder="Buscar nesta lista (ID, cliente, empregado, assunto)… Enter para buscar" value="' + esc(est.busca) + '" aria-label="Buscar nesta lista">' +
      '<span class="count" id="cont"></span>' +
    '</div>' +
    '<div class="list-card" style="--cols:' + COLS + '"><div class="lh"><span>ID</span><span>Situação</span><span>Último trâmite</span><span>Cliente</span><span>Empregado / assunto</span><span>Responsável</span><span>Expectativa</span></div><div id="corpo"><div class="vazio">Carregando…</div></div></div>' +
    '<div class="paginacao" id="pag"></div>';

  $$('[data-aba]', abas).forEach(b => b.addEventListener('click', () => { est.tipo = b.dataset.aba; est.pagina = 1; $$('[data-aba]', abas).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', String(x === b)); }); carregar(); }));
  $$('[data-f]', el).forEach(b => b.addEventListener('click', () => { est.filtro = b.dataset.f; est.pagina = 1; $$('[data-f]', el).forEach(x => x.classList.toggle('on', x === b)); carregar(); }));
  $('#b', el).addEventListener('keydown', e => { if (e.key === 'Enter') { est.busca = e.target.value.trim(); est.pagina = 1; carregar(); } });
  $('#b', el).addEventListener('search', e => { if (!e.target.value) { est.busca = ''; est.pagina = 1; carregar(); } });

  async function carregar() {
    const meu = ++pedido;
    $('#corpo', el).innerHTML = '<div class="vazio">Consultando o Onvio…</div>';
    $('#pag', el).innerHTML = '';
    $('#cont', el).textContent = '';
    const r = await enviar({ cmd: 'consultar', type: est.tipo, filtro: est.filtro, search: est.busca, page: est.pagina, per: est.por });
    if (meu !== pedido || !el.isConnected) return;                 // trocou de lista no meio do caminho
    if (!r.ok) { $('#corpo', el).innerHTML = '<div class="vazio"><b>Não foi possível consultar</b>' + esc(r.erro) + '</div>'; return; }
    r.itens = r.itens || []; r.total = r.total || 0;
    $('#cont', el).textContent = r.total + (r.total === 1 ? ' solicitação' : ' solicitações');
    $('#corpo', el).innerHTML = r.itens.length ? r.itens.map(i => linha(i)).join('') : '<div class="vazio"><b>Nada encontrado</b>' + (est.busca ? 'Tente outra busca ou "Todas, inclusive concluídas".' : '') + '</div>';
    ligarItens($('#corpo', el), r.itens, ctx.abrirDetalhe);
    const pags = Math.max(1, r.paginas || Math.ceil(r.total / est.por));
    $('#pag', el).innerHTML = pags > 1 ? '<button class="btn btn-sm" id="ant"' + (est.pagina <= 1 ? ' disabled' : '') + '><svg class="ic ic-sm"><use href="#i-chev-l"/></svg> Anterior</button><span>Página ' + est.pagina + ' de ' + pags + '</span><button class="btn btn-sm" id="prox"' + (est.pagina >= pags ? ' disabled' : '') + '>Próxima <svg class="ic ic-sm"><use href="#i-chev-r"/></svg></button>' : '';
    const ant = $('#ant', el), prox = $('#prox', el);
    if (ant) ant.onclick = () => { est.pagina--; carregar(); };
    if (prox) prox.onclick = () => { est.pagina++; carregar(); };
  }
  carregar();
}

async function renderBusca(el, ctx, q) {
  ctx.cab({ titulo: 'Busca', sub: '“' + esc(q) + '” nas 10 listas, inclusive concluídas · <a href="#/solicitacoes">ver as listas</a>' });
  el.innerHTML = '<div class="list-card" style="--cols:' + COLS.replace(/120px$/, '150px') + '"><div class="lh"><span>ID</span><span>Situação</span><span>Último trâmite</span><span>Cliente</span><span>Empregado / assunto</span><span>Responsável</span><span>Tipo</span></div><div id="corpo"><div class="vazio">Buscando nas 10 listas…</div></div></div>';
  if (q.trim().length < 2) { $('#corpo', el).innerHTML = '<div class="vazio">Digite ao menos 2 caracteres.</div>'; return; }
  const r = await enviar({ cmd: 'buscar', q });
  if (!el.isConnected) return;
  if (!r.ok) { $('#corpo', el).innerHTML = '<div class="vazio"><b>Não foi possível buscar</b>' + esc(r.erro) + '</div>'; return; }
  const l = r.itens || [];
  $('#corpo', el).innerHTML = l.length ? l.slice(0, 200).map(i => linha(i, true)).join('') : '<div class="vazio"><b>Nada encontrado para “' + esc(q) + '”</b>Confira a grafia ou busque pelo ID.</div>';
  ligarItens($('#corpo', el), l.slice(0, 200), ctx.abrirDetalhe);
}

function linha(i, comTipo) {
  return '<div class="lr lvl-' + (i.nivel || 0) + '" data-k="' + esc(i.k) + '" tabindex="0">' +
    '<span class="mono">#' + esc(i.num) + '</span><span>' + pillSituacao(i) + '</span><span class="c-sub">' + esc(fmtDataHora(i.last)) + '</span>' +
    '<span class="c-main" title="' + esc(i.cliente) + '">' + esc(i.apelido || i.cliente || '—') + '</span>' +
    '<span class="c-sub" style="color:var(--ink)" title="' + esc(i.detalhe) + '">' + esc(i.detalhe || '—') + '</span>' +
    '<span class="c-sub" style="color:var(--ink-2)">' + esc(i.resp || '—') + '</span>' +
    '<span class="c-sub">' + (comTipo ? esc(i.typeLabel) : (i.due ? esc(fmtData(i.due)) : '—')) + '</span></div>';
}

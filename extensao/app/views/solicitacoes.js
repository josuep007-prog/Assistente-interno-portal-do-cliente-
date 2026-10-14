/* Solicitações · as 10 listas do Onvio (inclusive concluídas), consultadas na hora, e a busca universal */
import { enviar } from '../estado.js';
import { esc, pillSituacao, ligarItens, fmtDataHora, fmtData, $ } from '../util.js';
const OC = window.OC;

const est = { tipo: 'geral', filtro: 'pendentes', busca: '', pagina: 1, por: 50 };
let pedido = 0;

export function render(el, ctx, params) {
  params = params || {};
  if (params.q != null) return renderBusca(el, ctx, params.q);
  if (params.tipo && OC.TYPE_BY_KEY[params.tipo]) est.tipo = params.tipo;

  el.innerHTML =
    '<div class="cab"><div><h1>Solicitações</h1><div class="sub">As listas do Onvio, consultadas na hora (inclusive as concluídas)</div></div></div>' +
    '<div class="pills" id="tipos">' + OC.TYPES.map(t => '<button data-t="' + t.key + '"' + (est.tipo === t.key ? ' class="on"' : '') + '>' + esc(t.label) + '</button>').join('') + '</div>' +
    '<div class="filtros">' +
      '<div class="seg" role="group" aria-label="Situação">' + [['pendentes', 'Pendentes'], ['todas', 'Todas']].map(([v, r]) => '<button data-f="' + v + '"' + (est.filtro === v ? ' class="on"' : '') + '>' + r + '</button>').join('') + '</div>' +
      '<input type="search" id="b" placeholder="Buscar nesta lista (ID, cliente, empregado, assunto)… Enter para buscar" value="' + esc(est.busca) + '">' +
      '<span class="count" id="cont"></span>' +
    '</div>' +
    '<div class="tabela-wrap"><table class="tabela"><thead><tr><th class="sem"></th><th>ID</th><th>Situação</th><th>Último trâmite</th><th>Cliente</th><th>Empregado / assunto</th><th>Responsável</th><th>Expectativa</th></tr></thead><tbody id="corpo"><tr><td colspan="8" class="vazio">Carregando…</td></tr></tbody></table></div>' +
    '<div class="paginacao" id="pag"></div>';

  el.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { est.tipo = b.dataset.t; est.pagina = 1; el.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('on', x === b)); carregar(); }));
  el.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => { est.filtro = b.dataset.f; est.pagina = 1; el.querySelectorAll('[data-f]').forEach(x => x.classList.toggle('on', x === b)); carregar(); }));
  $('#b', el).addEventListener('keydown', e => { if (e.key === 'Enter') { est.busca = e.target.value.trim(); est.pagina = 1; carregar(); } });
  $('#b', el).addEventListener('search', e => { if (!e.target.value) { est.busca = ''; est.pagina = 1; carregar(); } });

  async function carregar() {
    const meu = ++pedido;
    $('#corpo', el).innerHTML = '<tr><td colspan="8" class="vazio">Consultando o Onvio…</td></tr>';
    $('#pag', el).innerHTML = '';
    const r = await enviar({ cmd: 'consultar', type: est.tipo, filtro: est.filtro, search: est.busca, page: est.pagina, per: est.por });
    if (meu !== pedido || !el.isConnected) return;                 // trocou de lista no meio do caminho
    if (!r.ok) { $('#corpo', el).innerHTML = '<tr><td colspan="8" class="vazio">Não foi possível consultar: ' + esc(r.erro) + '</td></tr>'; return; }
    r.itens = r.itens || []; r.total = r.total || 0;
    $('#cont', el).textContent = r.total + (r.total === 1 ? ' solicitação' : ' solicitações');
    $('#corpo', el).innerHTML = r.itens.length ? r.itens.map(linha).join('') : '<tr><td colspan="8" class="vazio">Nada encontrado.</td></tr>';
    ligarItens($('#corpo', el), r.itens, ctx.abrirDetalhe);
    const pags = Math.max(1, r.paginas || Math.ceil(r.total / est.por));
    $('#pag', el).innerHTML = pags > 1 ? '<button class="btn btn-sm" id="ant"' + (est.pagina <= 1 ? ' disabled' : '') + '>Anterior</button><span>Página ' + est.pagina + ' de ' + pags + '</span><button class="btn btn-sm" id="prox"' + (est.pagina >= pags ? ' disabled' : '') + '>Próxima</button>' : '';
    const ant = $('#ant', el), prox = $('#prox', el);
    if (ant) ant.onclick = () => { est.pagina--; carregar(); };
    if (prox) prox.onclick = () => { est.pagina++; carregar(); };
  }
  carregar();
}

async function renderBusca(el, ctx, q) {
  el.innerHTML = '<div class="cab"><div><h1>Busca</h1><div class="sub">“' + esc(q) + '” nas 10 listas, inclusive concluídas</div></div></div>' +
    '<div class="tabela-wrap"><table class="tabela"><thead><tr><th class="sem"></th><th>ID</th><th>Situação</th><th>Último trâmite</th><th>Cliente</th><th>Empregado / assunto</th><th>Responsável</th><th>Tipo</th></tr></thead><tbody id="corpo"><tr><td colspan="8" class="vazio">Buscando nas 10 listas…</td></tr></tbody></table></div>';
  if (q.trim().length < 2) { $('#corpo', el).innerHTML = '<tr><td colspan="8" class="vazio">Digite ao menos 2 caracteres.</td></tr>'; return; }
  const r = await enviar({ cmd: 'buscar', q });
  if (!el.isConnected) return;
  if (!r.ok) { $('#corpo', el).innerHTML = '<tr><td colspan="8" class="vazio">Não foi possível buscar: ' + esc(r.erro) + '</td></tr>'; return; }
  const l = r.itens || [];
  $('#corpo', el).innerHTML = l.length ? l.slice(0, 200).map(i => linha(i, true)).join('') : '<tr><td colspan="8" class="vazio">Nada encontrado para “' + esc(q) + '”.</td></tr>';
  ligarItens($('#corpo', el), l, ctx.abrirDetalhe);
}

function linha(i, comTipo) {
  return '<tr data-k="' + esc(i.k) + '" tabindex="0"><td class="sem"><span class="lvl-c-' + (i.nivel || 0) + '"></span></td>' +
    '<td class="mono">#' + esc(i.num) + '</td><td>' + pillSituacao(i) + '</td><td>' + esc(fmtDataHora(i.last)) + '</td>' +
    '<td class="trunc" title="' + esc(i.cliente) + '">' + esc(i.apelido || i.cliente || '—') + '</td>' +
    '<td class="trunc" title="' + esc(i.detalhe) + '">' + esc(i.detalhe || '—') + '</td>' +
    '<td class="trunc">' + esc(i.resp || '—') + '</td>' +
    '<td>' + (comTipo ? esc(i.typeLabel) : (i.due ? esc(fmtData(i.due)) : '<span class="fraco">—</span>')) + '</td></tr>';
}

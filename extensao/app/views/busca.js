/* Busca universal (#/busca?q=): procura nas 10 listas do Onvio, inclusive concluídas, na hora, pelo service worker.
 * A tela "Consultar no Onvio" (as listas uma a uma) saiu na v0.19.0, a pedido do Josué. */
import { enviar } from '../estado.js';
import { esc, pillSituacao, ligarItens, fmtDataHora, fmtData, $ } from '../util.js';

const COLS = '64px 168px 112px minmax(0,1.1fr) minmax(0,1.4fr) 140px 120px';

export function render(el, ctx, params) {
  return renderBusca(el, ctx, (params && params.q) || '');
}

async function renderBusca(el, ctx, q) {
  ctx.cab({ titulo: 'Busca', sub: '“' + esc(q) + '” nas 10 listas, inclusive concluídas' });
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

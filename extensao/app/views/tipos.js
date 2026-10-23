/* Cartões dos tipos de solicitação (Solicitações e Hoje). Aviso e cálculo de férias, e de rescisão, formam um bloco só
 * (cor da família e o título). Os cartões são botões com data-tipo; quem usa liga o clique. */
import { esc, tipoVisual, tipoIcone } from '../util.js';
const OC = window.OC;

// Linha de apoio dos cartões (Hoje e Solicitações, iguais): o motivo mais urgente do tipo e quantas há no total.
export function subPorMotivo(xs) {
  if (!xs.length) return 'nenhuma';
  const mo = OC.MOTIVOS.map(m => [m, xs.filter(i => OC.motivoDe(i) === m.k).length]).find(([, n]) => n);
  return '<em class="m-' + mo[0].k + '">' + mo[1] + ' ' + esc(mo[0].rot.toLowerCase()) + '</em>' + (xs.length > mo[1] ? ' · ' + xs.length + ' no total' : '');
}

// Cartão de um tipo (k vazio = "Todos os tipos"). o.sub(xs): texto de apoio (HTML já escapado); sem ele, os prazos legais.
export function cartaoTipo(k, rot, xs, o) {
  o = o || {};
  const tot = xs.length;
  const sub = o.sub ? o.sub(xs) : (() => { const leg = xs.filter(i => OC.motivoDe(i) === 'legal').length; return leg ? '<em>' + leg + ' com prazo legal</em>' : tot ? 'sem prazo legal perto' : 'nenhuma'; })();
  return '<button type="button" class="tipo-c fam-' + tipoVisual(k).fam + (o.on === k ? ' on' : '') + (!tot ? ' zero' : '') + '" data-tipo="' + esc(k) + '" aria-pressed="' + (o.on === k) + '">' +
    '<span class="tipo-topo">' + (k ? tipoIcone(k, 'pq') : '<span class="tipo-ic pq"><svg class="ic"><use href="#i-list"/></svg></span>') + '<span class="tipo-rot">' + esc(rot) + '</span></span>' +
    '<b>' + tot + '</b><span class="tipo-sub">' + sub + '</span></button>';
}

const parHtml = (bl, c) => '<div class="tipo-par fam-' + tipoVisual(bl.keys[0]).fam + '" role="group" aria-label="' + esc(bl.rot) + ': aviso e cálculo"><div class="tipo-par-cab"><span>' + esc(bl.rot) + '</span></div>' +
  '<div class="tipo-par-in">' + c(bl.keys[0]) + c(bl.keys[1]) + '</div></div>';

// Todos os cartões: na ordem dos tipos ou, com o.prioridade, do bloco mais urgente para o menos. o.todos: cartão "Todos os tipos" no começo.
export function tiposHtml(items, o) {
  o = o || {};
  const c = k => cartaoTipo(k, OC.TYPE_BY_KEY[k].label, items.filter(i => i.type === k), o);
  const ordem = k => OC.TYPES.findIndex(t => t.key === k);
  const blocos = o.prioridade ? OC.ordenarTipos(items) : OC.ordenarTipos(items).sort((a, b) => ordem(a.keys[0]) - ordem(b.keys[0]));
  return (o.todos ? cartaoTipo('', 'Todos os tipos', items, o) : '') + blocos.map(bl => bl.keys.length === 2 ? parHtml(bl, c) : c(bl.keys[0])).join('');
}

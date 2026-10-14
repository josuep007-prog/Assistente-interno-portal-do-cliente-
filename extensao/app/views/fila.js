/* Fila · minhas, equipe, sem responsável, de um analista ou de um cliente (pendências lidas ao vivo) */
import { estado, itens, minhas, clienteRespondeu } from '../estado.js';
import { esc, pillSituacao, ligarItens, csvItens, fmtDataCurta, ladoTexto, $ } from '../util.js';
const OC = window.OC;

const KPI = {
  acao: { rot: 'com ação do escritório', f: i => i.lado === 'esc' },
  hoje: { rot: 'que vencem hoje', f: i => i.nivel === 1 },
  atraso: { rot: 'fora do prazo', f: i => i.nivel === 2 },
  g3: { rot: 'críticas (G3)', f: i => i.grav === 3 },
  respondeu: { rot: 'em que o cliente respondeu', f: clienteRespondeu },
  prescreve: { rot: 'que prescrevem em até 5 dias', f: i => i.prescreveEm != null && i.prescreveEm <= 5 },
  abaErrada: { rot: 'que podem estar na aba errada', f: i => !!i.abaProvavel },
  cli: { rot: 'na vez do cliente', f: i => i.lado === 'cli' }
};

const COLUNAS = [
  { k: 'num', rot: 'ID', v: i => Number(i.num) || 0 },
  { k: 'tipo', rot: 'Tipo', v: i => i.typeLabel },
  { k: 'status', rot: 'Situação', v: i => i.status },
  { k: 'cliente', rot: 'Cliente', v: i => (i.apelido || i.cliente || '').toLowerCase() },
  { k: 'detalhe', rot: 'Empregado / assunto', v: i => (i.detalhe || '').toLowerCase() },
  { k: 'resp', rot: 'Responsável', v: i => (i.resp || '').toLowerCase() },
  { k: 'parado', rot: 'Parada', v: i => i.parado || 0, num: true },
  { k: 'nivel', rot: 'Prazo', v: i => (i.nivel || 0) * 10 + (i.grav || 0) }
];

let ord = { k: 'nivel', desc: true };
let filtros = { texto: '', tipo: '', lado: '' };

export function render(el, ctx, params) {
  params = params || {};
  const escopo = params.escopo || 'minhas';
  let base = escopo === 'equipe' ? itens() : escopo === 'semresp' ? itens().filter(i => !i.resp) : minhas();
  let titulo = escopo === 'equipe' ? 'Fila da equipe' : escopo === 'semresp' ? 'Sem responsável' : 'Minha fila';
  if (params.analista) { base = itens().filter(i => (i.resp || '(sem responsável)') === params.analista); titulo = params.analista; }
  if (params.cliente) { base = itens().filter(i => (i.cliente || i.apelido || '(cliente não informado)') === params.cliente); titulo = params.cliente; }
  const kpi = KPI[params.kpi];
  if (kpi) base = base.filter(kpi.f);

  const filtrar = () => {
    const q = filtros.texto.trim().toLowerCase();
    let l = base.filter(i => (!filtros.tipo || i.type === filtros.tipo) && (!filtros.lado || i.lado === filtros.lado) &&
      (!q || [i.num, i.apelido, i.cliente, i.detalhe, i.resp, i.status, i.typeLabel].join(' ').toLowerCase().includes(q)));
    const col = COLUNAS.find(c => c.k === ord.k) || COLUNAS[COLUNAS.length - 1];
    l.sort((a, b) => { const x = col.v(a), y = col.v(b); const r = x < y ? -1 : x > y ? 1 : 0; return (ord.desc ? -r : r) || (b.parado - a.parado); });
    return l;
  };

  el.innerHTML =
    '<div class="cab"><div><h1>' + esc(titulo) + '</h1><div class="sub">' + (kpi ? 'Só as ' + esc(kpi.rot) + ' · <a href="#/fila' + (params.escopo ? '?escopo=' + encodeURIComponent(params.escopo) : '') + '">ver todas</a>' : 'Pendências lidas do Onvio, atualizadas ao vivo') + '</div></div>' +
      '<div class="acoes"><button class="btn btn-sm" id="csv"><svg class="ic ic-sm"><use href="#i-download"/></svg> Exportar CSV</button></div></div>' +
    '<div class="filtros">' +
      '<input type="search" id="f-texto" placeholder="Filtrar por ID, cliente, empregado, assunto ou responsável…" value="' + esc(filtros.texto) + '">' +
      '<select id="f-tipo" aria-label="Tipo"><option value="">Todos os tipos</option>' + OC.TYPES.map(t => '<option value="' + t.key + '"' + (filtros.tipo === t.key ? ' selected' : '') + '>' + esc(t.label) + '</option>').join('') + '</select>' +
      '<div class="seg" role="group" aria-label="De quem é a vez">' + [['', 'Todas'], ['esc', 'Escritório'], ['cli', 'Cliente']].map(([v, r]) => '<button data-lado="' + v + '"' + (filtros.lado === v ? ' class="on"' : '') + '>' + r + '</button>').join('') + '</div>' +
      '<span class="count" id="cont"></span>' +
    '</div>' +
    '<div class="tabela-wrap"><table class="tabela"><thead><tr><th class="sem" aria-label="Semáforo"></th>' +
      COLUNAS.map(c => '<th class="ord' + (c.num ? ' num' : '') + (ord.k === c.k ? ' on' + (ord.desc ? '' : ' asc') : '') + '" data-col="' + c.k + '">' + c.rot + '</th>').join('') +
    '</tr></thead><tbody id="corpo"></tbody></table></div>';

  const desenhar = () => {
    const l = filtrar();
    $('#cont', el).textContent = l.length + (l.length === 1 ? ' solicitação' : ' solicitações');
    $('#corpo', el).innerHTML = l.length ? l.map(linha).join('') : '<tr><td colspan="9" class="vazio">' + (estado.snap ? 'Nada aqui com esses filtros.' : 'Aguardando a primeira leitura do Onvio.') + '</td></tr>';
    ligarItens($('#corpo', el), l, ctx.abrirDetalhe);
  };
  $('#f-texto', el).addEventListener('input', e => { filtros.texto = e.target.value; desenhar(); });
  $('#f-tipo', el).addEventListener('change', e => { filtros.tipo = e.target.value; desenhar(); });
  el.querySelectorAll('[data-lado]').forEach(b => b.addEventListener('click', () => { filtros.lado = b.dataset.lado; el.querySelectorAll('[data-lado]').forEach(x => x.classList.toggle('on', x === b)); desenhar(); }));
  el.querySelectorAll('[data-col]').forEach(th => th.addEventListener('click', () => {
    ord = ord.k === th.dataset.col ? { k: ord.k, desc: !ord.desc } : { k: th.dataset.col, desc: th.dataset.col === 'nivel' || th.dataset.col === 'parado' };
    el.querySelectorAll('[data-col]').forEach(x => { x.classList.toggle('on', x.dataset.col === ord.k); x.classList.toggle('asc', x.dataset.col === ord.k && !ord.desc); });
    desenhar();
  }));
  $('#csv', el).addEventListener('click', () => { const d = new Date(); csvItens('onvio-' + (params.escopo || 'minhas') + '-' + OC.ymd(d) + '.csv', filtrar()); });
  desenhar();
}

function linha(i) {
  const prazo = (i.motivos || [])[0];
  return '<tr data-k="' + esc(i.k) + '" tabindex="0">' +
    '<td class="sem"><span class="lvl-c-' + (i.nivel || 0) + '"></span></td>' +
    '<td class="mono">#' + esc(i.num) + '</td>' +
    '<td>' + esc(i.typeLabel) + '</td>' +
    '<td>' + pillSituacao(i) + '<div class="fraco">vez: ' + ladoTexto(i) + '</div></td>' +
    '<td class="trunc" title="' + esc(i.cliente) + '">' + esc(i.apelido || i.cliente || '—') + '</td>' +
    '<td class="trunc" title="' + esc(i.detalhe) + '">' + esc(i.detalhe || '—') + (i.abaProvavel ? '<div class="fraco">pode ser: ' + esc(i.abaProvavel.label) + '</div>' : '') + '</td>' +
    '<td class="trunc">' + (i.resp ? esc(i.resp) : '<span class="today">sem responsável</span>') + '</td>' +
    '<td class="num">' + (i.parado || 0) + 'd<div class="fraco">' + (i.last ? fmtDataCurta(i.last) : '') + '</div></td>' +
    '<td>' + (prazo ? '<span class="' + (prazo.n === 2 ? 'late' : 'today') + '">' + (i.grav === 3 ? 'G3 · ' : '') + esc(prazo.m) + '</span>' : '<span class="fraco">em dia</span>') + '</td>' +
    '</tr>';
}

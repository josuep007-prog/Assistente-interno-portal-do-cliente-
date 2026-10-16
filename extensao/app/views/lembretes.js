/* Agenda e lembretes · pessoais, guardados no Chrome de cada um; o service worker avisa na hora marcada.
 * Aba Agenda: calendário do mês (como o do Departamento Pessoal) com lembretes e expectativas de conclusão
 * das suas solicitações; aba Lista: atrasados, hoje, próximos e concluídos. */
import { estado, minhas, salvarLembretes } from '../estado.js';
import { esc, fmtDataHora, plural, $, $$ } from '../util.js';
const OC = window.OC;
const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const nomeMes = d => { const m = d.toLocaleDateString('pt-BR', { month: 'long' }); return m[0].toUpperCase() + m.slice(1) + ' de ' + d.getFullYear(); };

let mes = null;      // primeiro dia do mês mostrado
let diaSel = null;   // AAAA-MM-DD

export function render(el, ctx, params) {
  params = params || {};
  const aba = params.aba === 'lista' ? 'lista' : 'agenda';
  const l = estado.lembretes || [];
  const pend = l.filter(x => !x.feito);
  const atrasados = pend.filter(x => OC.situacaoLembrete(x) === 'atrasado').length;
  ctx.cab({
    titulo: 'Agenda e lembretes', sub: 'Só seus · avisam na hora marcada, mesmo com o Onvio fechado',
    abas: [{ id: 'agenda', rot: 'Agenda', href: '#/lembretes' }, { id: 'lista', rot: 'Lista', href: '#/lembretes?aba=lista', n: pend.length, late: atrasados > 0 }],
    aba,
    extra: '<button class="btn btn-primary btn-sm" id="novo-lembrete"><svg class="ic ic-sm"><use href="#i-plus"/></svg> Novo lembrete</button>'
  });
  $('#novo-lembrete').onclick = () => ctx.abrirLembrete(aba === 'agenda' && diaSel ? { dia: new Date(diaSel + 'T12:00:00') } : {});
  if (aba === 'lista') lista(el, ctx, l); else agenda(el, ctx, l);
  ligarAcoes(el, ctx);
}

/* ---------- agenda do mês ---------- */
function agenda(el, ctx, l) {
  const hoje = new Date(), hojeK = OC.ymd(hoje);
  if (!mes) mes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  if (!diaSel) diaSel = hojeK;
  // prazos legais de pagamento (férias e rescisão) das suas solicitações; a expectativa do cliente não entra
  const m = minhas().filter(i => i.pagamentoAte);
  const hol = new Set(estado.settings.feriados || []);
  const doDia = k => ({ l: l.filter(x => OC.ymd(new Date(x.quando)) === k), i: m.filter(i => i.pagamentoAte.alvo === k) });
  const ini = new Date(mes); ini.setDate(1 - ini.getDay());
  let cal = SEMANA.map(s => '<span class="cal-sem">' + s + '</span>').join('');
  for (let n = 0; n < 42; n++) {
    const d = new Date(ini); d.setDate(ini.getDate() + n);
    if (n >= 35 && d.getMonth() !== mes.getMonth()) break;
    const k = OC.ymd(d), x = doDia(k);
    const pts = x.l.filter(y => !y.feito).map(y => OC.situacaoLembrete(y) === 'atrasado' ? 'late' : '').concat(x.i.map(i => i.nivel === 2 ? 'late' : 'today'));
    const q = pts.length;
    const cls = ['cal-d', d.getMonth() !== mes.getMonth() ? 'fora' : '', d.getDay() === 0 || d.getDay() === 6 ? 'fds' : '', hol.has(k) ? 'fer' : '', k === hojeK ? 'hoje' : '', k === diaSel ? 'sel' : '', q ? 'n' + Math.min(3, q) : ''].filter(Boolean).join(' ');
    cal += '<button class="' + cls + '" data-d="' + k + '"' + (hol.has(k) ? ' title="Feriado"' : '') + '>' + d.getDate() + '<span class="cal-pts">' + pts.slice(0, 4).map(c => '<i class="' + c + '"></i>').join('') + '</span></button>';
  }
  const x = doDia(diaSel);
  const dSel = new Date(diaSel + 'T12:00:00');
  const atrasadosAntes = diaSel === hojeK ? l.filter(y => !y.feito && OC.situacaoLembrete(y) === 'atrasado' && OC.ymd(new Date(y.quando)) < hojeK) : [];
  const linhas = atrasadosAntes.concat(x.l.sort((a, b) => a.quando.localeCompare(b.quando)));
  el.innerHTML = '<div class="ag-grade">' +
    '<section class="card"><div class="card-b" style="padding-top:14px">' +
      '<div class="cal-mes"><b>' + nomeMes(mes) + '</b><button class="btn btn-sm" id="cal-hoje">Hoje</button><button class="icon-btn" id="cal-ant" aria-label="Mês anterior"><svg class="ic"><use href="#i-chev-l"/></svg></button><button class="icon-btn" id="cal-prox" aria-label="Próximo mês"><svg class="ic"><use href="#i-chev-r"/></svg></button></div>' +
      '<div class="cal">' + cal + '</div>' +
      '<div class="cal-leg"><span><i></i>lembrete</span><span><i class="today"></i>pagamento (prazo legal)</span><span><i class="late"></i>atrasado / fora do prazo</span><span style="text-decoration:line-through">feriado</span></div>' +
    '</div></section>' +
    '<section class="card"><div class="card-h"><h3>' + esc(diaSel === hojeK ? 'Hoje, ' : '') + esc(dSel.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })) + '</h3><span class="sub">' + plural(linhas.length + x.i.length, 'item', 'itens') + '</span><button class="lk" id="ag-novo">+ Lembrete neste dia</button></div><div class="card-b" id="ag-dia">' +
      (linhas.length ? linhas.map(item).join('') : '') +
      x.i.map(i => '<div class="item-ag clicavel ' + (i.nivel === 2 ? 'late' : 'soon') + '" data-k="' + esc(i.k) + '"><svg class="ic"><use href="#i-alert"/></svg><div class="tx"><b>Pagamento (prazo legal) · #' + esc(i.num) + ' ' + esc(i.typeLabel) + '</b><small>' + esc(i.apelido || i.cliente) + (i.detalhe ? ' · ' + esc(i.detalhe) : '') + '</small></div></div>').join('') +
      (linhas.length + x.i.length ? '' : '<div class="vazio" style="padding:14px 0">Nada marcado para este dia.</div>') +
    '</div></section></div>';
  const ir = d => { mes = new Date(mes.getFullYear(), mes.getMonth() + d, 1); render(el, ctx, {}); };
  $('#cal-ant', el).onclick = () => ir(-1);
  $('#cal-prox', el).onclick = () => ir(1);
  $('#cal-hoje', el).onclick = () => { mes = null; diaSel = null; render(el, ctx, {}); };
  $$('[data-d]', el).forEach(b => b.onclick = () => { diaSel = b.dataset.d; const d = new Date(diaSel + 'T12:00:00'); if (d.getMonth() !== mes.getMonth()) mes = new Date(d.getFullYear(), d.getMonth(), 1); render(el, ctx, {}); });
  $('#ag-novo', el).onclick = () => ctx.abrirLembrete({ dia: dSel });
  $$('#ag-dia [data-k]', el).forEach(r => r.onclick = () => { const it = x.i.find(i => i.k === r.dataset.k); if (it) ctx.abrirDetalhe(it, x.i); });
}

/* ---------- lista ---------- */
function lista(el, ctx, l) {
  const grupo = s => l.filter(x => OC.situacaoLembrete(x) === s).sort((a, b) => a.quando.localeCompare(b.quando));
  const grupos = [['atrasado', 'Atrasados'], ['hoje', 'Hoje'], ['proximo', 'Próximos']];
  const feitos = l.filter(x => x.feito).sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 20);
  el.innerHTML =
    grupos.map(([s, rot]) => { const g = grupo(s); return g.length ? '<section class="card" style="margin-bottom:16px"><div class="card-h"><h3' + (s === 'atrasado' ? ' class="late"' : '') + '>' + rot + '</h3><span class="sub">' + g.length + '</span></div><div class="card-b">' + g.map(item).join('') + '</div></section>' : ''; }).join('') +
    (l.filter(x => !x.feito).length ? '' : '<div class="list-card" style="margin-bottom:16px"><div class="vazio"><b>Nenhum lembrete pendente</b>Crie um em "Novo lembrete" ou pelo botão "Lembrete" de uma solicitação.</div></div>') +
    (feitos.length ? '<section class="card"><div class="card-h"><h3>Concluídos recentemente</h3></div><div class="card-b">' + feitos.map(item).join('') + '</div></section>' : '');
}

function item(x) {
  const s = OC.situacaoLembrete(x);
  const cls = s === 'atrasado' ? 'late' : s === 'hoje' ? 'today' : '';
  return '<div class="item-ag clicavel ' + cls + '" data-l="' + esc(x.id) + '"><svg class="ic"><use href="#i-clock"/></svg>' +
    '<div class="tx"><b' + (x.feito ? ' class="feito-tx"' : '') + '>' + esc(x.texto) + '</b><small>' + esc(fmtDataHora(x.quando)) + (x.rep && x.rep !== 'nao' ? ' · <span class="rep"><svg class="ic"><use href="#i-repeat"/></svg>' + esc(OC.REPETICOES[x.rep]) + '</span>' : '') + (x.num ? ' · #' + esc(x.num) + (x.cliente ? ' ' + esc(x.cliente) : '') : '') + '</small></div>' +
    '<div class="acts">' + (x.feito
      ? '<button class="btn btn-sm" data-a="reabrir">Reabrir</button><button class="btn btn-sm" data-a="excluir" title="Excluir">Excluir</button>'
      : '<button class="btn btn-sm" data-a="feito" title="Marcar como feito"><svg class="ic ic-sm"><use href="#i-check"/></svg> Feito</button><button class="btn btn-sm" data-a="1h">+1 h</button><button class="btn btn-sm" data-a="amanha">Amanhã</button>' + (x.num ? '<button class="btn btn-sm" data-a="abrir" title="Abrir a solicitação">#' + esc(x.num) + '</button>' : '')) +
    '</div></div>';
}

function ligarAcoes(el, ctx) {
  $$('[data-l]', el).forEach(d => d.addEventListener('click', async e => {
    const l = estado.lembretes || [];
    const b = e.target.closest('[data-a]');
    const x = l.find(y => y.id === d.dataset.l);
    if (!x) return;
    if (!b) { ctx.abrirLembrete({ l: x }); return; }
    const a = b.dataset.a;
    if (a === 'abrir') { ctx.abrirDetalhe(x); return; }
    let nova = l;
    if (a === 'feito') nova = l.map(y => y.id === x.id ? OC.concluirLembrete(y, new Date(), estado.settings.feriados) : y);
    else if (a === 'reabrir') nova = l.map(y => y.id === x.id ? Object.assign({}, y, { feito: false, disparado: false }) : y);
    else if (a === '1h' || a === 'amanha') nova = l.map(y => y.id === x.id ? OC.adiarLembrete(y, a) : y);
    else if (a === 'excluir') nova = l.filter(y => y.id !== x.id);
    await salvarLembretes(nova);
  }));
}

export const contarPendentes = () => (estado.lembretes || []).filter(x => ['atrasado', 'hoje'].includes(OC.situacaoLembrete(x))).length;
export const descrever = n => plural(n, 'lembrete', 'lembretes');

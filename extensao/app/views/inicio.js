/* Início · visão do analista: o que fazer agora */
import { estado, minhas, clienteRespondeu, primeiroNome, salvarLembretes } from '../estado.js';
import { esc, plural, linhaItem, ligarItens, hojeExtenso, relativo, fmtDataHora, $ } from '../util.js';
const OC = window.OC;

export function render(el, ctx) {
  const m = minhas();
  const esc_ = m.filter(i => i.lado === 'esc');
  const hojeL = estado.lembretes.filter(l => ['hoje', 'atrasado'].includes(OC.situacaoLembrete(l)));
  const kpis = [
    { k: 'acao', rot: 'Com ação minha', val: esc_.length, det: 'vez do escritório', cls: 'soon' },
    { k: 'hoje', rot: 'Vencem hoje', val: m.filter(i => i.nivel === 1).length, det: 'atenção', cls: 'today' },
    { k: 'atraso', rot: 'Fora do prazo', val: m.filter(i => i.nivel === 2).length, det: plural(m.filter(i => i.grav === 3).length, 'crítica (G3)', 'críticas (G3)'), cls: 'late' },
    { k: 'respondeu', rot: 'Cliente respondeu', val: m.filter(clienteRespondeu).length, det: 'aguardando você', cls: 'soon' },
    { k: 'lembretes', rot: 'Lembretes hoje', val: hojeL.length, det: plural(hojeL.filter(l => OC.situacaoLembrete(l) === 'atrasado').length, 'atrasado', 'atrasados'), cls: hojeL.length ? 'today' : 'ok' }
  ];

  // prioridade: fora do prazo, crítica, mais tempo parada
  const prioridades = esc_.slice().sort((a, b) => (b.nivel - a.nivel) || ((b.grav || 0) - (a.grav || 0)) || (b.parado - a.parado)).slice(0, 12);

  // agenda do dia: lembretes, expectativas que vencem hoje e prescrições próximas (minhas)
  const ag = [];
  hojeL.sort((a, b) => a.quando.localeCompare(b.quando)).forEach(l => ag.push({ tipo: 'lembrete', l }));
  m.filter(i => i.due && OC.ymd(OC.parseDate(i.due)) === OC.ymd(new Date())).forEach(i => ag.push({ tipo: 'expectativa', i }));
  m.filter(i => i.prescreveEm != null && i.prescreveEm <= 3).forEach(i => ag.push({ tipo: 'prescreve', i }));

  const eventos = estado.eventos.filter(e => e.mine).slice(0, 8);
  const nome = primeiroNome();

  el.innerHTML =
    '<div class="cab"><div><h1>' + (nome ? 'Olá, ' + esc(nome) : 'Início') + '</h1><div class="sub">' + esc(hojeExtenso()) + ' · ' + plural(m.length, 'solicitação sua pendente', 'solicitações suas pendentes') + '</div></div></div>' +
    '<div class="grade g-kpi" style="margin-bottom:14px">' + kpis.map(k => '<button class="kpi ' + k.cls + '" data-kpi="' + k.k + '"><span class="rot">' + k.rot + '</span><span class="val">' + k.val + '</span><span class="det">' + esc(k.det) + '</span></button>').join('') + '</div>' +
    '<div class="grade g-2">' +
      '<section class="card flush"><h2><span class="tt">Prioridades agora</span><a class="ver-mais" href="#/fila">Ver minha fila</a></h2><div class="lista" id="prio">' +
        (prioridades.length ? prioridades.map(i => linhaItem(i, false)).join('') : '<div class="vazio">' + (estado.snap ? 'Nada pendente com ação sua. Bom trabalho.' : 'Aguardando a primeira leitura do Onvio.') + '</div>') + '</div></section>' +
      '<div class="grade">' +
        '<section class="card"><h2><span class="tt">Hoje</span><a class="ver-mais" href="#/lembretes">Lembretes</a></h2><div id="agenda">' +
          (ag.length ? ag.map(agendaItem).join('') : '<div class="vazio" style="padding:12px 0">Nada marcado para hoje.</div>') + '</div></section>' +
        '<section class="card"><h2>Atividade</h2><div id="ativ">' +
          (eventos.length ? eventos.map(e => '<div class="item-ag clicavel" data-ev="' + esc(e.id) + '"><svg class="ic"><use href="#i-bell"/></svg><div class="tx"><b>' + esc(e.titulo) + '</b><small>#' + esc(e.num) + ' ' + esc(e.typeLabel) + ' · ' + esc(e.cliente) + ' · ' + esc(relativo(e.em)) + '</small></div></div>').join('') : '<div class="vazio" style="padding:12px 0">As novidades das suas solicitações aparecem aqui.</div>') + '</div></section>' +
      '</div>' +
    '</div>';

  el.querySelectorAll('[data-kpi]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.kpi;
    if (k === 'lembretes') ctx.navegar('lembretes');
    else ctx.navegar('fila', { kpi: k });
  }));
  ligarItens($('#prio', el), prioridades, ctx.abrirDetalhe);
  el.querySelectorAll('[data-ev]').forEach(d => d.addEventListener('click', () => { const e = eventos.find(x => x.id === d.dataset.ev); if (e) ctx.abrirDetalhe(e); }));
  el.querySelectorAll('[data-ag]').forEach(d => d.addEventListener('click', ev => {
    const [tipo, id] = d.dataset.ag.split('|');
    if (ev.target.closest('[data-feito]')) {
      ev.stopPropagation();
      salvarLembretes(estado.lembretes.map(l => l.id === id ? Object.assign({}, l, { feito: true }) : l));
      return;
    }
    if (tipo === 'lembrete') { const l = estado.lembretes.find(x => x.id === id); if (l && l.type && l.num) ctx.abrirDetalhe(l); else ctx.navegar('lembretes'); }
    else { const it = m.find(x => x.k === id); if (it) ctx.abrirDetalhe(it); }
  }));
}

function agendaItem(a) {
  if (a.tipo === 'lembrete') {
    const l = a.l, atrasado = OC.situacaoLembrete(l) === 'atrasado';
    return '<div class="item-ag clicavel ' + (atrasado ? 'late' : 'today') + '" data-ag="lembrete|' + esc(l.id) + '"><svg class="ic"><use href="#i-clock"/></svg><div class="tx"><b>' + esc(l.texto) + '</b><small>' + (atrasado ? 'Atrasado · ' : '') + fmtDataHora(l.quando) + (l.num ? ' · #' + esc(l.num) + ' ' + esc(l.cliente) : '') + '</small></div><div class="acts"><button class="btn btn-sm" data-feito title="Marcar como feito"><svg class="ic ic-sm"><use href="#i-check"/></svg></button></div></div>';
  }
  const i = a.i;
  const t = a.tipo === 'prescreve' ? 'Prescreve em ' + i.prescreveEm + ' dia(s)' : 'Expectativa de conclusão vence hoje';
  return '<div class="item-ag clicavel ' + (a.tipo === 'prescreve' ? 'late' : 'today') + '" data-ag="item|' + esc(i.k) + '"><svg class="ic"><use href="#i-alert"/></svg><div class="tx"><b>' + esc(t) + '</b><small>#' + esc(i.num) + ' ' + esc(i.typeLabel) + ' · ' + esc(i.apelido || i.cliente) + '</small></div></div>';
}

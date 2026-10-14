/* Hoje (desenho do "Hoje" do Portal do Cliente no Control Hub): saudação e números, barra viva da equipe,
 * solicitações por analista e placar, a semana, "Para fazer agora", idade da fila e prescrição,
 * sugestão de distribuição, "Precisa de atenção", agenda e atividade. */
import { estado, itens, minhas, clienteRespondeu, primeiroNome, salvarLembretes } from '../estado.js';
import { esc, plural, miniItem, ligarItens, relativo, fmtDataHora, saudacao, dataExtensa, $, $$ } from '../util.js';
import { porPrioridade, fitaHtml, equipeHtml, filaEquipeHtml, distribuicaoHtml, ligarPainel, desenharGraficos } from './painel-equipe.js';
const OC = window.OC;
const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

let diaSel = null;   // 'atr' ou AAAA-MM-DD (padrão: hoje)

export function render(el, ctx) {
  const m = minhas();
  const hojeK = OC.ymd(new Date());
  if (!diaSel || (diaSel !== 'atr' && diaSel < hojeK)) diaSel = hojeK;
  const esc_ = m.filter(i => i.lado === 'esc');
  const lems = (estado.lembretes || []).filter(l => !l.feito);
  const sit = l => OC.situacaoLembrete(l);
  const hojeL = lems.filter(l => ['hoje', 'atrasado'].includes(sit(l)));
  const atraso = m.filter(i => i.nivel === 2);
  const venceHoje = m.filter(i => i.nivel === 1);
  const respondeu = m.filter(clienteRespondeu);
  const nome = primeiroNome();

  const kpis = [
    { k: 'acao', rot: 'Com ação minha', val: esc_.length, cls: '' },
    { k: 'atraso', rot: 'Fora do prazo', val: atraso.length, cls: atraso.length ? 'late' : '' },
    { k: 'hoje', rot: 'Vencem hoje', val: venceHoje.length, cls: venceHoje.length ? 'today' : '' },
    { k: 'respondeu', rot: 'Cliente respondeu', val: respondeu.length, cls: '' },
    { k: 'lembretes', rot: 'Lembretes hoje', val: hojeL.length, cls: hojeL.some(l => sit(l) === 'atrasado') ? 'today' : '' }
  ];
  const resumo = !estado.snap ? 'Aguardando a primeira leitura do Onvio.'
    : !esc_.length && !hojeL.length ? 'Nada pendente com ação sua. Tudo em dia.'
    : [plural(esc_.length, 'solicitação com ação sua', 'solicitações com ação sua'), atraso.length ? plural(atraso.length, 'fora do prazo', 'fora do prazo') : '', respondeu.length ? plural(respondeu.length, 'resposta de cliente', 'respostas de cliente') + ' para ver' : ''].filter(Boolean).join(' · ') + '.';

  // semana: atrasados, hoje e os próximos 6 dias (lembretes + expectativas de conclusão minhas)
  const doDia = k => ({
    l: lems.filter(l => OC.ymd(new Date(l.quando)) === k),
    i: m.filter(i => i.due && OC.ymd(OC.parseDate(i.due)) === k)
  });
  const dias = [];
  for (let n = 0; n < 7; n++) { const d = new Date(); d.setDate(d.getDate() + n); dias.push(d); }
  const atrasadosN = lems.filter(l => sit(l) === 'atrasado').length + atraso.length;
  const hol = new Set(estado.settings.feriados || []);
  const semana = '<div class="semana" role="tablist" aria-label="Semana">' +
    '<button class="sm-dia sm-atr' + (atrasadosN ? ' tem' : '') + (diaSel === 'atr' ? ' on' : '') + '" data-dia="atr"><span class="sm-sem">Atrasados</span><span class="sm-num">' + (atrasadosN ? '▼' : '✓') + '</span><span class="sm-cont">' + (atrasadosN ? '<b>' + atrasadosN + '</b> ' + (atrasadosN === 1 ? 'item' : 'itens') : 'nada') + '</span></button>' +
    dias.map((d, n) => {
      const k = OC.ymd(d), x = doDia(k), q = x.l.length + x.i.length;
      const fds = d.getDay() === 0 || d.getDay() === 6 || hol.has(k);
      return '<button class="sm-dia' + (fds ? ' fds' : '') + (diaSel === k ? ' on' : '') + '" data-dia="' + k + '"><span class="sm-sem">' + (n === 0 ? 'Hoje' : SEM[d.getDay()]) + '</span><span class="sm-num">' + d.getDate() + '<small>' + MES[d.getMonth()] + '</small></span><span class="sm-cont">' + (q ? '<b>' + q + '</b> ' + (q === 1 ? 'item' : 'itens') : 'livre') + '</span></button>';
    }).join('') +
    '<button class="sm-dia sm-add" id="sm-add"><svg class="ic"><use href="#i-plus"/></svg>Novo lembrete</button></div>';

  // agenda do dia escolhido
  const ag = [];
  if (diaSel === 'atr') {
    lems.filter(l => sit(l) === 'atrasado').sort((a, b) => a.quando.localeCompare(b.quando)).forEach(l => ag.push({ tipo: 'lembrete', l }));
    atraso.forEach(i => ag.push({ tipo: 'atraso', i }));
  } else {
    const x = doDia(diaSel);
    x.l.sort((a, b) => a.quando.localeCompare(b.quando)).forEach(l => ag.push({ tipo: 'lembrete', l }));
    x.i.forEach(i => ag.push({ tipo: 'expectativa', i }));
    if (diaSel === hojeK) m.filter(i => i.prescreveEm != null && i.prescreveEm <= 3).forEach(i => ag.push({ tipo: 'prescreve', i }));
  }
  const dSel = diaSel === 'atr' ? null : new Date(diaSel + 'T12:00:00');
  const tituloAg = diaSel === 'atr' ? 'Atrasados' : diaSel === hojeK ? 'Agenda de hoje' : 'Agenda de ' + dSel.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  // colunas
  const ord = l => l.slice().sort((a, b) => ((b.grav || 0) - (a.grav || 0)) || (b.parado - a.parado));
  const jaListadas = new Set(atraso.concat(venceHoje, respondeu).map(i => i.k));
  const paradas = esc_.filter(i => !jaListadas.has(i.k)).sort((a, b) => b.parado - a.parado);
  const aba = m.filter(i => i.abaProvavel);
  const listas = {};
  const col = (cls, tit, l, kpi, vazio, o) => { const id = 'c' + Object.keys(listas).length; listas[id] = l.slice(0, 5); return '<div class="col ' + cls + '" id="' + id + '"><div class="col-h"><h3>' + tit + '</h3><span class="q">' + l.length + '</span></div>' +
    (l.length ? l.slice(0, 5).map(i => miniItem(i, o)).join('') : '<div class="vazio">' + vazio + '</div>') +
    (l.length > 5 && kpi ? '<a class="ver" href="#/fila?kpi=' + kpi + '">Ver todas (' + l.length + ')</a>' : '') + '</div>'; };

  const evs = (estado.eventos || []).filter(e => e.mine).slice(0, 8);
  const fita = porPrioridade(itens());

  ctx.cab({ titulo: 'Hoje', sub: 'Seu dia no Portal do Cliente' });
  el.innerHTML =
    '<div class="hoje-topo"><div><div class="ht-saud">' + saudacao() + (nome ? ', ' + esc(nome) : '') + '</div><h2 class="ht-data" id="ht-data">' + esc(dataExtensa()) + '</h2><p class="ht-resumo">' + esc(resumo) + '</p></div>' +
      '<div class="ht-cont">' + kpis.map(k => '<button class="kpi ' + k.cls + '" data-kpi="' + k.k + '"><span class="rot">' + k.rot + '</span><span class="val">' + k.val + '</span></button>').join('') + '</div></div>' +
    fitaHtml(fita) +
    '<h2 class="sec-tit">Equipe agora <small>todas as pendências, por analista</small></h2>' +
    equipeHtml() +
    '<h2 class="sec-tit">Sua semana</h2>' +
    semana +
    '<h2 class="sec-tit">Para fazer agora</h2>' +
    '<div class="trio" id="agora">' +
      col('c-late', 'Fora do prazo', ord(atraso), 'atraso', 'Nada fora do prazo.') +
      col('c-today', 'Vencem hoje', ord(venceHoje), 'hoje', 'Nada vence hoje.') +
      col('c-soon', 'Cliente respondeu', ord(respondeu), 'respondeu', 'Nenhuma resposta esperando você.') +
    '</div>' +
    '<h2 class="sec-tit">Fila da equipe <small>idade e prescrição</small></h2>' +
    filaEquipeHtml() +
    '<div style="margin-top:16px">' + distribuicaoHtml() + '</div>' +
    '<h2 class="sec-tit">Precisa de atenção <small>suas solicitações</small></h2>' +
    '<div class="trio solto duo" id="atencao">' +
      col('', 'Paradas há mais tempo', paradas, null, 'Nada parado com você.') +
      col('', 'Possível aba errada', aba, 'abaErrada', 'Nenhuma suspeita de aba errada.') +
    '</div>' +
    '<div class="grade g-2" style="margin-top:26px">' +
      '<section class="card"><div class="card-h"><h3>' + esc(tituloAg) + '</h3><button class="lk" id="ag-novo">+ Lembrete</button><a href="#/lembretes">Agenda do mês</a></div><div class="card-b" id="agenda">' +
        (ag.length ? ag.map(agendaItem).join('') : '<div class="vazio" style="padding:10px 0">Nada marcado para este dia.</div>') + '</div></section>' +
      '<section class="card"><div class="card-h"><h3>Atividade</h3><span class="sub">suas solicitações</span></div><div class="card-b" id="ativ">' +
        (evs.length ? evs.map(e => '<div class="item-ag clicavel" data-ev="' + esc(e.id) + '"><svg class="ic"><use href="#i-bell"/></svg><div class="tx"><b>' + esc(e.titulo) + '</b><small>#' + esc(e.num) + ' ' + esc(e.typeLabel) + ' · ' + esc(e.cliente) + ' · ' + esc(relativo(e.em)) + '</small></div></div>').join('') : '<div class="vazio" style="padding:10px 0">As novidades das suas solicitações aparecem aqui.</div>') + '</div></section>' +
    '</div>';

  $$('[data-kpi]', el).forEach(b => b.addEventListener('click', () => { const k = b.dataset.kpi; if (k === 'lembretes') ctx.navegar('lembretes'); else ctx.navegar('fila', { kpi: k }); }));
  $$('[data-dia]', el).forEach(b => b.addEventListener('click', () => { diaSel = b.dataset.dia; render(el, ctx); }));
  const novo = () => ctx.abrirLembrete({ dia: diaSel === 'atr' ? null : new Date(diaSel + 'T12:00:00') });
  $('#sm-add', el).onclick = novo; $('#ag-novo', el).onclick = novo;
  for (const [id, l] of Object.entries(listas)) ligarItens($('#' + id, el), l, ctx.abrirDetalhe);
  ligarPainel(el, ctx, fita);
  desenharGraficos(el);
  ctx.aoRedimensionar(() => desenharGraficos(el));
  $$('[data-ev]', el).forEach(d => d.addEventListener('click', () => { const e = evs.find(x => x.id === d.dataset.ev); if (e) ctx.abrirDetalhe(e); }));
  $$('[data-ag]', el).forEach(d => d.addEventListener('click', ev => {
    const [tipo, id] = d.dataset.ag.split('|');
    if (tipo === 'lembrete') {
      const l = estado.lembretes.find(x => x.id === id);
      if (!l) return;
      if (ev.target.closest('[data-feito]')) { ev.stopPropagation(); salvarLembretes(estado.lembretes.map(x => x.id === id ? OC.concluirLembrete(x, new Date(), estado.settings.feriados) : x)); return; }
      if (l.type && l.num) ctx.abrirDetalhe(l); else ctx.abrirLembrete({ l });
    } else { const it = m.find(x => x.k === id); if (it) ctx.abrirDetalhe(it, m); }
  }));
}

function agendaItem(a) {
  if (a.tipo === 'lembrete') {
    const l = a.l, atrasado = OC.situacaoLembrete(l) === 'atrasado';
    const h = new Date(l.quando);
    return '<div class="item-ag clicavel ' + (atrasado ? 'late' : 'today') + '" data-ag="lembrete|' + esc(l.id) + '"><span class="hora">' + String(h.getHours()).padStart(2, '0') + ':' + String(h.getMinutes()).padStart(2, '0') + '</span><div class="tx"><b>' + esc(l.texto) + '</b><small>' + (atrasado ? 'Atrasado · ' + fmtDataHora(l.quando) : 'Lembrete') + (l.rep && l.rep !== 'nao' ? ' · ' + esc(OC.REPETICOES[l.rep]) : '') + (l.num ? ' · #' + esc(l.num) + ' ' + esc(l.cliente) : '') + '</small></div><div class="acts"><button class="btn btn-sm" data-feito title="Marcar como feito"><svg class="ic ic-sm"><use href="#i-check"/></svg> Feito</button></div></div>';
  }
  const i = a.i;
  const t = a.tipo === 'prescreve' ? 'Prescreve em ' + i.prescreveEm + ' dia(s)' : a.tipo === 'atraso' ? ((i.motivos || [])[0] || { m: 'Fora do prazo' }).m : 'Expectativa de conclusão';
  return '<div class="item-ag clicavel ' + (a.tipo === 'expectativa' ? 'soon' : 'late') + '" data-ag="item|' + esc(i.k) + '"><svg class="ic"><use href="#i-alert"/></svg><div class="tx"><b>' + esc(t) + '</b><small>#' + esc(i.num) + ' ' + esc(i.typeLabel) + ' · ' + esc(i.apelido || i.cliente) + '</small></div></div>';
}

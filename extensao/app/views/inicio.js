/* Hoje · painel de controle do analista ("o que eu faço agora?").
 * Em cima, um painel escuro: barra viva, anel de prioridades, radar da fila e pulso do dia.
 * Embaixo: a lista única de prioridades (filtrada pelo anel e pelo mosaico), o mosaico da equipe e a agenda de hoje.
 * O detalhe da equipe (mapa de calor, prescrição, distribuição) fica em Equipe; a semana em Agenda; a atividade no sino. */
import { estado, itens, minhas, primeiroNome, salvarLembretes } from '../estado.js';
import { esc, plural, num, ligarItens, fmtDataHora, saudacao, dataExtensa, $, $$ } from '../util.js';
import { anel, radar, pulso, mosaico, animarNumeros, ligarDicas } from '../graficos.js';
import { fitaHtml, blocosEquipe, porPrioridade } from './painel-equipe.js';
const OC = window.OC;
const SEM = '(sem responsável)';

let escopoKpi = null;    // 'minhas' | 'equipe'; sem escolha, vai para a equipe quando nada está com você
let filtroMotivo = null; // anel: 'atraso' | 'prescreve' | 'hoje' | 'respondeu' | 'emdia'
let filtroResp = null;   // mosaico: nome do analista ou '(sem responsável)'
let anteriores = null;   // números do último desenho, para subirem animados
let animou = false;

const corMotivo = Object.fromEntries(OC.MOTIVOS.map(m => [m.k, m.cor]));
const rotMotivo = Object.fromEntries(OC.MOTIVOS.map(m => [m.k, m.rot]));

export function render(el, ctx) {
  const m = minhas(), todas = itens();
  if (filtroResp) escopoKpi = 'equipe';
  const escopo = escopoKpi || (!m.length && todas.length ? 'equipe' : 'minhas');
  let base = escopo === 'equipe' ? todas : m;
  if (filtroResp) base = base.filter(i => (i.resp || SEM) === filtroResp);
  const s = estado.settings;
  const nome = primeiroNome();

  // dados do painel
  const cont = OC.contarMotivos(base);
  const total = base.length;
  const fatias = OC.MOTIVOS.map(mo => ({ k: mo.k, rot: mo.rot, n: cont[mo.k], cor: mo.cor }));
  const prio = OC.prioridades(base);
  const prioF = filtroMotivo ? prio.filter(p => p.motivo === filtroMotivo) : prio;
  const visiveis = prioF.slice(0, 10);
  const placar = OC.placarDoDia(estado.serie, todas);
  const horas = Object.entries(((estado.serie || {})[OC.ymd(new Date())] || {}).horas || {}).map(([h, v]) => ({ x: Number(h), y: v })).sort((a, b) => a.x - b.x);
  const delta = horas.length > 1 ? horas[horas.length - 1].y - horas[0].y : null;
  const fila = porPrioridade(todas);   // a barra viva passa todas as pendências da equipe

  // agenda de hoje (sempre sua)
  const lems = (estado.lembretes || []).filter(l => !l.feito && ['hoje', 'atrasado'].includes(OC.situacaoLembrete(l))).sort((a, b) => a.quando.localeCompare(b.quando));
  const hojeK = OC.ymd(new Date());
  const ag = lems.map(l => ({ tipo: 'lembrete', l })).concat(m.filter(i => i.due && OC.ymd(OC.parseDate(i.due)) === hojeK).map(i => ({ tipo: 'expectativa', i })));

  // aviso de uma linha, só quando preciso
  const aviso = estado.snap && !todas.length
    ? '<div class="aviso-linha late" id="ht-resumo"><svg class="ic"><use href="#i-alert"/></svg><span>A última leitura não trouxe nenhuma pendência em nenhuma das 10 listas. Se o Onvio mostra solicitações pendentes, abra <a href="#/config">Configurações</a> > Testar a leitura e envie o resultado.</span></div>'
    : !m.length && todas.length && !escopoKpi ? '<div class="aviso-linha" id="ht-resumo"><svg class="ic"><use href="#i-user"/></svg><span>Nenhuma pendência está com você como responsável no Onvio. Mostrando a equipe (' + plural(todas.length, 'pendência', 'pendências') + ').</span></div>' : '';

  const { extra } = ctx.cab({
    titulo: 'Hoje',
    sub: esc(saudacao() + (nome ? ', ' + nome : '') + ' · ' + dataExtensa()),
    extra: '<div class="seg seg-sm" role="group" aria-label="Números de quem" id="kpi-escopo">' + [['minhas', 'Minhas', m.length], ['equipe', 'Equipe', todas.length]].map(([v, r, n]) => '<button data-escopo="' + v + '"' + (escopo === v ? ' class="on"' : '') + '>' + r + ' · ' + n + '</button>').join('') + '</div>'
  });

  const chips = [filtroMotivo ? ['motivo', rotMotivo[filtroMotivo]] : null, filtroResp ? ['resp', filtroResp === SEM ? 'Sem analista' : filtroResp] : null].filter(Boolean);
  const paramsFila = Object.assign(escopo === 'equipe' ? { escopo: 'equipe' } : {}, filtroMotivo ? { motivo: filtroMotivo } : {}, filtroResp ? (filtroResp === SEM ? { escopo: 'semresp' } : { analista: filtroResp }) : {});

  el.innerHTML = aviso +
    '<section class="painel-ctrl" id="painel">' +
      fitaHtml(fila) +
      '<div class="pc-grade">' +
        '<div class="pc-cel" id="pc-anel"><h3>Prioridades <small>clique para filtrar</small></h3>' +
          anel(fatias, { ativo: filtroMotivo, rotulo: total === 1 ? 'pendência' : 'pendências', anima: !animou, de: anteriores ? anteriores.total : 0, deFatias: anteriores ? anteriores.fatias : Object.fromEntries(fatias.map(f => [f.k, 0])), titulo: 'Pendências por motivo' }) + '</div>' +
        '<div class="pc-cel"><h3>Radar da fila <small>cada ponto é uma solicitação · dias parada</small></h3><div id="g-radar"></div></div>' +
        '<div class="pc-cel"><h3>Pulso do dia <small>fila da equipe</small></h3>' +
          '<div class="ps-cab"><b class="mono" data-conta="' + placar.fila + '" data-de="' + (anteriores ? anteriores.fila : 0) + '">' + num(placar.fila) + '</b>' +
            (delta == null ? '<span class="fraco">pendências agora</span>' : '<span class="' + (delta > 0 ? 'sobe' : delta < 0 ? 'desce' : '') + '">' + (delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '= ') + num(delta) + ' desde ' + horas[0].x + 'h</span>') + '</div>' +
          '<div id="g-pulso"></div>' +
          '<div class="ps-pe"><span class="sobe">▲ ' + num(placar.entradas) + ' entraram</span><span class="desce">▼ ' + num(placar.saidas) + ' saíram</span></div></div>' +
      '</div>' +
    '</section>' +
    '<div class="hoje-baixo">' +
      '<section class="card" id="prio-card"><div class="card-h"><h3>Prioridades</h3>' +
        chips.map(([k, r]) => '<span class="chip-f">' + esc(r) + '<button data-tira="' + k + '" aria-label="Tirar filtro"><svg class="ic"><use href="#i-x"/></svg></button></span>').join('') +
        '<a href="#/fila' + (Object.keys(paramsFila).length ? '?' + new URLSearchParams(paramsFila) : '') + '" id="ver-fila">Ver fila completa (' + prioF.length + ')</a></div>' +
        '<div class="card-b flush" id="prio">' + (visiveis.length ? visiveis.map(p => linhaPrio(p, escopo === 'equipe')).join('') : '<div class="vazio">' + (!estado.snap ? 'Aguardando a primeira leitura do Onvio.' : chips.length ? 'Nada com esse filtro.' : 'Nada pendente aqui. Tudo em dia.') + '</div>') + '</div></section>' +
      '<div class="hoje-lado">' +
        '<section class="card"><div class="card-h"><h3>Equipe</h3><span class="sub">tamanho = pendências · cor = pior caso</span><a href="#/equipe">Ver equipe</a></div><div class="card-b">' +
          mosaico(blocosEquipe(todas), { ativo: filtroResp, titulo: 'Pendências por analista' }) +
          '<div class="mo-leg"><span><i class="mo-g3"></i>crítica</span><span><i class="mo-g2"></i>fora do prazo</span><span><i class="mo-g1"></i>atenção</span><span><i class="mo-ok"></i>em dia</span><span><i class="mo-sem"></i>sem analista</span></div></div></section>' +
        '<section class="card"><div class="card-h"><h3>Agenda de hoje</h3><button class="lk" id="ag-novo">+ Lembrete</button><a href="#/lembretes">Agenda do mês</a></div><div class="card-b" id="agenda">' +
          (ag.length ? ag.map(agendaItem).join('') : '<div class="vazio" style="padding:10px 0">Nada marcado para hoje.</div>') + '</div></section>' +
      '</div>' +
    '</div>';

  // gráficos que dependem da largura
  const desenhar = () => {
    const r = $('#g-radar', el);
    if (!r) return;
    r.innerHTML = radar(base.map(i => {
      const mo = OC.motivoDe(i);
      return { k: i.k, dias: i.parado || 0, faixa: i.lado === 'cli' ? 'cli' : 'esc', cor: corMotivo[mo], apagado: !!filtroMotivo && mo !== filtroMotivo,
        tip: '#' + i.num + ' · ' + (i.apelido || i.cliente || '—') + '\n' + i.typeLabel + ' · ' + (i.parado || 0) + ' d parada\n' + rotMotivo[mo] + (escopo === 'equipe' ? ' · ' + (i.resp || 'sem analista') : '') };
    }), { largura: Math.max(380, Math.round(r.clientWidth)), marcas: [{ faixa: 'esc', dias: s.parada, rot: 'parada ' + s.parada + ' d' }, { faixa: 'cli', dias: s.prescricaoAviso, rot: 'alerta ' + s.prescricaoAviso + ' d' }, { faixa: 'cli', dias: s.prescricaoDias, rot: 'prescreve' }], titulo: 'Radar da fila' });
    ligarItens(r, base, ctx.abrirDetalhe);
    const p = $('#g-pulso', el);
    p.innerHTML = pulso(horas, { largura: Math.max(220, Math.round(p.clientWidth)), titulo: 'Fila da equipe ao longo de hoje' });
  };
  desenhar();
  ctx.aoRedimensionar(desenhar);
  ligarDicas(el);
  animarNumeros(el);
  animou = true;
  anteriores = { total, fila: placar.fila, fatias: Object.fromEntries(fatias.map(f => [f.k, f.n])) };

  // interações: anel e legenda filtram; mosaico filtra por analista; seletor Minhas/Equipe
  $$('[data-motivo]', el).forEach(b => b.addEventListener('click', () => { const k = b.dataset.motivo; filtroMotivo = filtroMotivo === k ? null : k; render(el, ctx); }));
  $$('.mosaico [data-id]', el).forEach(b => b.addEventListener('click', () => { const id = b.dataset.id; filtroResp = filtroResp === id ? null : id; render(el, ctx); }));
  $$('[data-tira]', el).forEach(b => b.addEventListener('click', () => { if (b.dataset.tira === 'motivo') filtroMotivo = null; else filtroResp = null; render(el, ctx); }));
  $$('[data-escopo]', extra).forEach(b => b.addEventListener('click', () => { escopoKpi = b.dataset.escopo; if (escopoKpi === 'minhas') filtroResp = null; render(el, ctx); }));
  ligarItens($('#fita', el), fila, ctx.abrirDetalhe);
  ligarItens($('#prio', el), visiveis.map(p => p.item), ctx.abrirDetalhe);
  $('#ag-novo', el).onclick = () => ctx.abrirLembrete({ dia: new Date() });
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

function linhaPrio(p, comResp) {
  const i = p.item;
  const tag = p.motivo === 'prescreve' && i.prescreveEm != null ? 'Prescreve em ' + i.prescreveEm + ' d' : p.motivo === 'emdia' ? 'Parada há ' + (i.parado || 0) + ' d' : rotMotivo[p.motivo];
  return '<div class="prio m-' + p.motivo + '" tabindex="0" data-k="' + esc(i.k) + '">' +
    '<span class="pr-tag">' + esc(tag) + '</span>' +
    '<span class="mono pr-num">#' + esc(i.num) + '</span>' +
    '<span class="pr-tx"><b>' + esc(i.apelido || i.cliente || '—') + '</b><small>' + esc([i.typeLabel, i.detalhe].filter(Boolean).join(' · ')) + '</small></span>' +
    (comResp ? '<span class="pr-resp">' + (i.resp ? esc(i.resp) : '<span class="today">sem analista</span>') + '</span>' : '') +
    '<span class="mono pr-d">' + (i.parado || 0) + 'd' + (i.tend === 'piorou' ? ' <span class="sobe" title="Piorou desde a leitura anterior">▲</span>' : i.tend === 'nova' ? ' <span class="nova-t">NOVA</span>' : '') + '</span></div>';
}

function agendaItem(a) {
  if (a.tipo === 'lembrete') {
    const l = a.l, atrasado = OC.situacaoLembrete(l) === 'atrasado';
    const h = new Date(l.quando);
    return '<div class="item-ag clicavel ' + (atrasado ? 'late' : 'today') + '" data-ag="lembrete|' + esc(l.id) + '"><span class="hora">' + String(h.getHours()).padStart(2, '0') + ':' + String(h.getMinutes()).padStart(2, '0') + '</span><div class="tx"><b>' + esc(l.texto) + '</b><small>' + (atrasado ? 'Atrasado · ' + fmtDataHora(l.quando) : 'Lembrete') + (l.rep && l.rep !== 'nao' ? ' · ' + esc(OC.REPETICOES[l.rep]) : '') + (l.num ? ' · #' + esc(l.num) + ' ' + esc(l.cliente) : '') + '</small></div><div class="acts"><button class="btn btn-sm" data-feito title="Marcar como feito"><svg class="ic ic-sm"><use href="#i-check"/></svg> Feito</button></div></div>';
  }
  const i = a.i;
  return '<div class="item-ag clicavel soon" data-ag="item|' + esc(i.k) + '"><svg class="ic"><use href="#i-alert"/></svg><div class="tx"><b>Expectativa de conclusão</b><small>#' + esc(i.num) + ' ' + esc(i.typeLabel) + ' · ' + esc(i.apelido || i.cliente) + '</small></div></div>';
}

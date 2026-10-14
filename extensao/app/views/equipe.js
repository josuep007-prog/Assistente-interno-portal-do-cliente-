/* Equipe · visão do gestor (abas como no Departamento Pessoal):
 * Painel (números, gráficos, sem responsável e prescrições) e Responsáveis (carga de cada pessoa). */
import { estado, itens } from '../estado.js';
import { esc, plural, miniItem, ligarItens, fmtDataCurta, $, $$ } from '../util.js';
import { barrasEmpilhadas, barrasAgrupadas, linhaDoDia, ligarDicas } from '../graficos.js';
const OC = window.OC;

const GRAV = [
  { chave: 'g0', nome: 'Em dia', cor: 'ok' },
  { chave: 'g1', nome: 'G1 atenção', cor: 'warn' },
  { chave: 'g2', nome: 'G2 fora do prazo', cor: 'serious' },
  { chave: 'g3', nome: 'G3 crítica', cor: 'crit' }
];

export function render(el, ctx, params) {
  params = params || {};
  const aba = params.aba === 'resp' ? 'resp' : 'painel';
  const it = itens();
  const an = OC.porAnalista(it);
  const semResp = it.filter(i => !i.resp);
  ctx.cab({
    titulo: 'Equipe', sub: 'Visão do gestor · ' + plural(an.length, 'responsável', 'responsáveis') + ' · ao vivo',
    abas: [{ id: 'painel', rot: 'Painel', href: '#/equipe' }, { id: 'resp', rot: 'Responsáveis', href: '#/equipe?aba=resp', n: an.length }],
    aba,
    extra: '<a class="btn btn-sm" href="#/fila?escopo=equipe"><svg class="ic ic-sm"><use href="#i-inbox"/></svg> Fila da equipe</a>'
  });
  if (aba === 'resp') return responsaveis(el, ctx, an, it);

  const prescreve = it.filter(i => i.prescreveEm != null && i.prescreveEm <= 5).sort((a, b) => a.prescreveEm - b.prescreveEm);
  const pts = it.filter(i => i.ptUteis != null);
  const ptMedia = pts.length ? Math.round(pts.reduce((s, i) => s + i.ptUteis, 0) / pts.length * 10) / 10 : null;
  const hojeK = OC.ymd(new Date());
  const hoje = (estado.serie || {})[hojeK] || { entradas: 0, saidas: 0, horas: {} };

  const kpis = [
    { k: 'todas', rot: 'Pendências', val: it.length, det: plural(it.filter(i => i.lado === 'esc').length, 'com o escritório', 'com o escritório'), cls: '' },
    { k: 'semresp', rot: 'Sem responsável', val: semResp.length, det: 'para distribuir', cls: semResp.length ? 'today' : 'ok' },
    { k: 'atraso', rot: 'Fora do prazo', val: it.filter(i => i.nivel === 2).length, det: plural(it.filter(i => i.grav === 3).length, 'crítica (G3)', 'críticas (G3)'), cls: 'late' },
    { k: 'prescreve', rot: 'Prescrevem em 5 dias', val: prescreve.length, det: 'vez do cliente', cls: prescreve.length ? 'late' : 'ok' },
    { k: 'pt', rot: '1º trâmite (média)', val: ptMedia == null ? '–' : String(ptMedia).replace('.', ','), det: 'dias úteis · estimativa', cls: 'estatico' },
    { k: 'dia', rot: 'Hoje', val: hoje.entradas + ' / ' + hoje.saidas, det: 'entradas / saídas', cls: 'estatico' }
  ];

  const carga = an.map(r => ({ rotulo: r.resp, id: r.resp, valores: { g0: r.total - r.g1 - r.g2 - r.g3, g1: r.g1, g2: r.g2, g3: r.g3 } }));
  const dias = [];
  for (let n = 13; n >= 0; n--) {
    const d = new Date(); d.setDate(d.getDate() - n);
    const k = OC.ymd(d), v = (estado.serie || {})[k] || {};
    dias.push({ rotulo: fmtDataCurta(d), valores: { e: v.entradas || 0, s: v.saidas || 0 } });
  }
  const horas = Object.entries(hoje.horas || {}).map(([h, v]) => ({ x: Number(h), y: v }));
  const porTipo = OC.TYPES.map(t => ({ rotulo: t.label, valores: { esc: it.filter(i => i.type === t.key && i.lado === 'esc').length, cli: it.filter(i => i.type === t.key && i.lado === 'cli').length } })).filter(d => d.valores.esc + d.valores.cli > 0).sort((a, b) => (b.valores.esc + b.valores.cli) - (a.valores.esc + a.valores.cli));
  const card = (id, tit, sub, extra) => '<section class="card"><div class="card-h"><h3>' + tit + '</h3>' + (sub ? '<span class="sub">' + sub + '</span>' : '') + (extra || '') + '</div><div class="card-b"><div id="' + id + '" class="gr"></div></div></section>';

  el.innerHTML =
    '<div class="g-kpi">' + kpis.map(k => '<button class="kpi ' + k.cls + '" data-kpi="' + k.k + '"><span class="rot">' + k.rot + '</span><span class="val">' + k.val + '</span><span class="det">' + esc(k.det) + '</span></button>').join('') + '</div>' +
    '<div class="grade g-2i">' +
      card('g-carga', 'Carga por responsável', 'clique numa barra para ver a fila da pessoa') +
      card('g-dias', 'Entradas e saídas por dia', 'últimos 14 dias') +
      card('g-horas', 'Pendências ao longo de hoje', 'contagem a cada leitura') +
      card('g-tipo', 'Por tipo de solicitação', 'com o escritório × com o cliente') +
    '</div>' +
    '<div class="grade g-2i" style="margin-top:16px">' +
      '<section class="card"><div class="card-h"><h3>Sem responsável</h3><span class="sub">' + semResp.length + '</span><a href="#/fila?escopo=semresp">Distribuir</a></div><div class="card-b" id="l-semresp">' + (semResp.length ? semResp.slice().sort((a, b) => b.parado - a.parado).slice(0, 6).map(i => miniItem(i)).join('') : '<div class="vazio">Todas as pendências têm responsável.</div>') + '</div></section>' +
      '<section class="card"><div class="card-h"><h3>Prescrevem em breve</h3><span class="sub">' + prescreve.length + '</span><a href="#/fila?escopo=equipe&kpi=prescreve">Ver todas</a></div><div class="card-b" id="l-presc">' + (prescreve.length ? prescreve.slice(0, 6).map(i => miniItem(i, { resp: true, lado: 'prescreve' })).join('') : '<div class="vazio">Nenhuma perto de prescrever.</div>') + '</div></section>' +
    '</div>';

  const desenhar = () => {
    const w = id => Math.max(320, Math.round($(id, el).clientWidth));
    $('#g-carga', el).innerHTML = barrasEmpilhadas(carga.slice(0, 14), GRAV, { largura: w('#g-carga'), titulo: 'Carga por responsável e gravidade' });
    $('#g-dias', el).innerHTML = barrasAgrupadas(dias, [{ chave: 'e', nome: 'Entradas', cor: 's1' }, { chave: 's', nome: 'Saídas', cor: 's2' }], { largura: w('#g-dias'), titulo: 'Entradas e saídas por dia' });
    $('#g-horas', el).innerHTML = linhaDoDia(horas, { largura: w('#g-horas'), nome: 'Pendências', titulo: 'Pendências ao longo de hoje' });
    $('#g-tipo', el).innerHTML = barrasEmpilhadas(porTipo, [{ chave: 'esc', nome: 'Com o escritório', cor: 's1' }, { chave: 'cli', nome: 'Com o cliente', cor: 's2' }], { largura: w('#g-tipo'), rotuloL: 160, titulo: 'Pendências por tipo' });
  };
  desenhar();
  ctx.aoRedimensionar(desenhar);
  ligarDicas(el);

  $('#g-carga', el).addEventListener('click', e => { const g = e.target.closest('[data-id]'); if (g) ctx.navegar('fila', { analista: g.dataset.id }); });
  $$('[data-kpi]', el).forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.kpi;
    if (k === 'semresp') ctx.navegar('fila', { escopo: 'semresp' });
    else if (k === 'atraso' || k === 'prescreve') ctx.navegar('fila', { escopo: 'equipe', kpi: k });
    else if (k === 'todas') ctx.navegar('fila', { escopo: 'equipe' });
  }));
  ligarItens($('#l-semresp', el), semResp.slice().sort((a, b) => b.parado - a.parado).slice(0, 6), ctx.abrirDetalhe);
  ligarItens($('#l-presc', el), prescreve.slice(0, 6), ctx.abrirDetalhe);
}

function responsaveis(el, ctx, an, it) {
  const max = Math.max(1, ...an.map(r => r.total));
  const seg = (v, cor) => v ? '<i style="width:' + (v / max * 100) + '%;background:var(--viz-' + cor + ')"></i>' : '';
  el.innerHTML =
    '<div class="tabela-wrap"><table class="tabela"><thead><tr>' +
      '<th>Responsável</th><th>Carga</th><th class="num">Total</th><th class="num">Escritório</th><th class="num">Cliente</th><th class="num">G1</th><th class="num">G2</th><th class="num">G3</th><th class="num">Sem 1º trâmite</th><th class="num">1º trâmite (d.u.)</th></tr></thead><tbody>' +
      (an.length ? an.map(r => '<tr data-resp="' + esc(r.resp) + '" tabindex="0"><td><b>' + esc(r.resp) + '</b></td>' +
        '<td><div class="carga"><div class="barra-mini" title="Em dia, G1, G2 e G3">' + seg(r.total - r.g1 - r.g2 - r.g3, 'ok') + seg(r.g1, 'warn') + seg(r.g2, 'serious') + seg(r.g3, 'crit') + '</div></div></td>' +
        '<td class="num"><b>' + r.total + '</b></td><td class="num">' + r.esc + '</td><td class="num">' + r.cli + '</td><td class="num ' + (r.g1 ? 'today' : '') + '">' + r.g1 + '</td><td class="num ' + (r.g2 ? 'late' : '') + '">' + r.g2 + '</td><td class="num ' + (r.g3 ? 'late' : '') + '">' + r.g3 + '</td><td class="num">' + r.semPrimeiro + '</td><td class="num">' + (r.ptMedia == null ? '–' : String(r.ptMedia).replace('.', ',')) + '</td></tr>').join('') : '<tr><td colspan="10" class="vazio">Sem dados.</td></tr>') +
    '</tbody></table></div>' +
    '<div class="legenda-viz" style="margin-top:10px"><span><i style="background:var(--viz-ok)"></i>Em dia</span><span><i style="background:var(--viz-warn)"></i>G1 atenção</span><span><i style="background:var(--viz-serious)"></i>G2 fora do prazo</span><span><i style="background:var(--viz-crit)"></i>G3 crítica</span></div>' +
    '<p class="card-nota">Clique numa pessoa para ver a fila dela. "1º trâmite" é a média de dias úteis até a primeira resposta do escritório (estimativa).</p>';
  $$('[data-resp]', el).forEach(tr => {
    const go = () => ctx.navegar('fila', { analista: tr.dataset.resp });
    tr.addEventListener('click', go); tr.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  });
}

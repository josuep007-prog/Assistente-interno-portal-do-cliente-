/* Equipe · visão do gestor: carga, gravidade, entradas x saídas e o que está para estourar */
import { estado, itens } from '../estado.js';
import { esc, plural, linhaItem, ligarItens, fmtDataCurta, $ } from '../util.js';
import { barrasEmpilhadas, barrasAgrupadas, linhaDoDia, ligarDicas } from '../graficos.js';
const OC = window.OC;

const GRAV = [
  { chave: 'g0', nome: 'Em dia', cor: 'ok' },
  { chave: 'g1', nome: 'G1 atenção', cor: 'warn' },
  { chave: 'g2', nome: 'G2 fora do prazo', cor: 'serious' },
  { chave: 'g3', nome: 'G3 crítica', cor: 'crit' }
];

export function render(el, ctx) {
  const it = itens();
  const an = OC.porAnalista(it);
  const semResp = it.filter(i => !i.resp);
  const prescreve = it.filter(i => i.prescreveEm != null && i.prescreveEm <= 5).sort((a, b) => a.prescreveEm - b.prescreveEm);
  const pts = it.filter(i => i.ptUteis != null);
  const ptMedia = pts.length ? Math.round(pts.reduce((s, i) => s + i.ptUteis, 0) / pts.length * 10) / 10 : null;
  const hojeK = OC.ymd(new Date());
  const hoje = (estado.serie || {})[hojeK] || { entradas: 0, saidas: 0, horas: {} };

  const kpis = [
    { k: 'todas', rot: 'Pendências', val: it.length, det: plural(it.filter(i => i.lado === 'esc').length, 'com o escritório', 'com o escritório'), cls: 'soon' },
    { k: 'semresp', rot: 'Sem responsável', val: semResp.length, det: 'para distribuir', cls: semResp.length ? 'today' : 'ok' },
    { k: 'atraso', rot: 'Fora do prazo', val: it.filter(i => i.nivel === 2).length, det: plural(it.filter(i => i.grav === 3).length, 'crítica (G3)', 'críticas (G3)'), cls: 'late' },
    { k: 'prescreve', rot: 'Prescrevem em 5 dias', val: prescreve.length, det: 'vez do cliente', cls: prescreve.length ? 'late' : 'ok' },
    { k: 'pt', rot: '1º trâmite (média)', val: ptMedia == null ? '–' : String(ptMedia).replace('.', ','), det: 'dias úteis · estimativa', cls: 'soon estatico' },
    { k: 'dia', rot: 'Hoje', val: hoje.entradas + ' / ' + hoje.saidas, det: 'entradas / saídas', cls: 'soon estatico' }
  ];

  // carga por analista, empilhada por gravidade
  const carga = an.map(r => ({ rotulo: r.resp, id: r.resp, valores: { g0: r.total - r.g1 - r.g2 - r.g3, g1: r.g1, g2: r.g2, g3: r.g3 } }));
  // entradas x saídas: últimos 14 dias com leitura
  const dias = [];
  for (let n = 13; n >= 0; n--) {
    const d = new Date(); d.setDate(d.getDate() - n);
    const k = OC.ymd(d), v = (estado.serie || {})[k] || {};
    dias.push({ rotulo: fmtDataCurta(d), valores: { e: v.entradas || 0, s: v.saidas || 0 } });
  }
  const horas = Object.entries(hoje.horas || {}).map(([h, v]) => ({ x: Number(h), y: v }));
  // por tipo
  const porTipo = OC.TYPES.map(t => ({ rotulo: t.label, valores: { esc: it.filter(i => i.type === t.key && i.lado === 'esc').length, cli: it.filter(i => i.type === t.key && i.lado === 'cli').length } })).filter(d => d.valores.esc + d.valores.cli > 0).sort((a, b) => (b.valores.esc + b.valores.cli) - (a.valores.esc + a.valores.cli));

  el.innerHTML =
    '<div class="cab"><div><h1>Equipe</h1><div class="sub">Visão do gestor · ' + plural(an.length, 'responsável', 'responsáveis') + ' · tudo ao vivo</div></div>' +
      '<div class="acoes"><a class="btn btn-sm" href="#/fila?escopo=equipe">Ver todas as pendências</a></div></div>' +
    '<div class="grade g-kpi" style="margin-bottom:14px">' + kpis.map(k => '<button class="kpi ' + k.cls + '" data-kpi="' + k.k + '"><span class="rot">' + k.rot + '</span><span class="val">' + k.val + '</span><span class="det">' + esc(k.det) + '</span></button>').join('') + '</div>' +
    '<div class="grade g-2i" style="margin-bottom:14px">' +
      '<section class="card"><h2>Carga por responsável</h2><div id="g-carga" class="gr"></div><p class="fraco" style="margin:8px 0 0;font-size:12px;color:var(--ink-3)">Clique numa barra para ver a fila da pessoa.</p></section>' +
      '<section class="card"><h2>Entradas e saídas por dia</h2><div id="g-dias" class="gr"></div></section>' +
      '<section class="card"><h2>Pendências ao longo de hoje</h2><div id="g-horas" class="gr"></div></section>' +
      '<section class="card"><h2>Por tipo de solicitação</h2><div id="g-tipo" class="gr"></div></section>' +
    '</div>' +
    '<div class="grade g-2i" style="margin-bottom:14px">' +
      '<section class="card flush"><h2><span class="tt">Sem responsável</span><a class="ver-mais" href="#/fila?escopo=semresp">Ver todas</a></h2><div class="lista" id="l-semresp">' + (semResp.length ? semResp.slice().sort((a, b) => b.parado - a.parado).slice(0, 8).map(i => linhaItem(i, true)).join('') : '<div class="vazio">Todas as pendências têm responsável.</div>') + '</div></section>' +
      '<section class="card flush"><h2><span class="tt">Prescrevem em breve</span><a class="ver-mais" href="#/fila?escopo=equipe&kpi=prescreve">Ver todas</a></h2><div class="lista" id="l-presc">' + (prescreve.length ? prescreve.slice(0, 8).map(i => linhaItem(i, true)).join('') : '<div class="vazio">Nenhuma perto de prescrever.</div>') + '</div></section>' +
    '</div>' +
    '<section class="card flush"><h2>Responsáveis</h2><div class="tabela-wrap" style="border:0;border-top:1px solid var(--rule);border-radius:0 0 6px 6px;margin-top:12px"><table class="tabela"><thead><tr>' +
      '<th>Responsável</th><th class="num">Total</th><th class="num">Escritório</th><th class="num">Cliente</th><th class="num">G1</th><th class="num">G2</th><th class="num">G3</th><th class="num">Sem 1º trâmite</th><th class="num">1º trâmite (d.u.)</th></tr></thead><tbody>' +
      (an.length ? an.map(r => '<tr data-resp="' + esc(r.resp) + '"><td><b>' + esc(r.resp) + '</b></td><td class="num">' + r.total + '</td><td class="num">' + r.esc + '</td><td class="num">' + r.cli + '</td><td class="num ' + (r.g1 ? 'today' : '') + '">' + r.g1 + '</td><td class="num ' + (r.g2 ? 'late' : '') + '">' + r.g2 + '</td><td class="num ' + (r.g3 ? 'late' : '') + '">' + r.g3 + '</td><td class="num">' + r.semPrimeiro + '</td><td class="num">' + (r.ptMedia == null ? '–' : String(r.ptMedia).replace('.', ',')) + '</td></tr>').join('') : '<tr><td colspan="9" class="vazio">Sem dados.</td></tr>') +
    '</tbody></table></div></section>';

  // gráficos medem a largura real do cartão
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
  el.querySelectorAll('[data-resp]').forEach(tr => tr.addEventListener('click', () => ctx.navegar('fila', { analista: tr.dataset.resp })));
  el.querySelectorAll('[data-kpi]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.kpi;
    if (k === 'semresp') ctx.navegar('fila', { escopo: 'semresp' });
    else if (k === 'atraso' || k === 'prescreve') ctx.navegar('fila', { escopo: 'equipe', kpi: k });
    else if (k === 'todas') ctx.navegar('fila', { escopo: 'equipe' });
  }));
  ligarItens($('#l-semresp', el), semResp, ctx.abrirDetalhe);
  ligarItens($('#l-presc', el), prescreve, ctx.abrirDetalhe);
}

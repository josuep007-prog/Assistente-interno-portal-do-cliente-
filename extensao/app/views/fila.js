/* Fila · minhas, equipe, sem responsável, de um analista ou de um cliente (pendências lidas ao vivo).
 * Barra como a de Empresas no Departamento Pessoal: busca, vez, Filtros, Ordenar, Lista/Cartões e Mais. */
import { estado, itens, minhas, clienteRespondeu, enviar } from '../estado.js';
import { esc, pillSituacao, prazoHtml, cartaoItem, ligarItens, csvItens, fmtDataCurta, ladoTexto, normal, $, $$ } from '../util.js';
const OC = window.OC;

const KPI = {
  acao: { rot: 'Com ação do escritório', f: i => i.lado === 'esc' },
  hoje: { rot: 'Vencem hoje', f: i => i.nivel === 1 },
  atraso: { rot: 'Fora do prazo', f: i => i.nivel === 2 },
  g3: { rot: 'Críticas (G3)', f: i => i.grav === 3 },
  respondeu: { rot: 'Cliente respondeu', f: clienteRespondeu },
  prescreve: { rot: 'Prescrevem em até 5 dias', f: i => i.prescreveEm != null && i.prescreveEm <= 5 },
  abaErrada: { rot: 'Possível aba errada', f: i => !!i.abaProvavel },
  cli: { rot: 'Na vez do cliente', f: i => i.lado === 'cli' }
};

const COLUNAS = [
  { k: 'num', rot: 'ID', v: i => Number(i.num) || 0 },
  { k: 'tipo', rot: 'Tipo', v: i => i.typeLabel },
  { k: 'status', rot: 'Situação', v: i => i.status },
  { k: 'cliente', rot: 'Cliente', v: i => normal(i.apelido || i.cliente) },
  { k: 'detalhe', rot: 'Empregado / assunto', v: i => normal(i.detalhe) },
  { k: 'resp', rot: 'Responsável', v: i => normal(i.resp) },
  { k: 'parado', rot: 'Parada', v: i => i.parado || 0, num: true },
  { k: 'nivel', rot: 'Prazo', v: i => (i.nivel || 0) * 10 + (i.grav || 0) }
];
const COLS = '64px 132px 168px minmax(0,1.1fr) minmax(0,1.3fr) 130px 60px minmax(0,1.4fr)';
const ORDENS = [['nivel', 'Prazo (mais grave primeiro)'], ['parado', 'Mais tempo parada'], ['num', 'ID (mais nova primeiro)'], ['cliente', 'Cliente (A–Z)'], ['tipo', 'Tipo'], ['resp', 'Responsável']];

let ord = { k: 'nivel', desc: true };
let filtros = { texto: '', tipo: '', lado: '', grav: '', resp: '' };
let vis = (() => { try { return localStorage.getItem('controlonvio-fila-vis') || 'lista'; } catch (e) { return 'lista'; } })();

export function render(el, ctx, params) {
  params = params || {};
  const escopo = params.escopo || 'minhas';
  const todas = itens();
  let base = escopo === 'equipe' ? todas : escopo === 'semresp' ? todas.filter(i => !i.resp) : minhas();
  let titulo = escopo === 'equipe' ? 'Fila da equipe' : escopo === 'semresp' ? 'Sem responsável' : 'Minha fila';
  let sub = 'Pendências lidas do Onvio, ao vivo';
  if (params.analista) { base = todas.filter(i => (i.resp || '(sem responsável)') === params.analista); titulo = params.analista; sub = 'Fila do responsável · <a href="#/equipe">voltar à Equipe</a>'; }
  if (params.cliente) { base = todas.filter(i => (i.cliente || i.apelido || '(cliente não informado)') === params.cliente); titulo = params.cliente; sub = 'Pendências do cliente · <a href="#/clientes">voltar a Clientes</a>'; }
  const kpi = KPI[params.kpi];
  if (kpi) base = base.filter(kpi.f);
  // vindos do Hoje: faixa de dias parada (mapa de calor) e de quem é a vez (gráfico por analista)
  const idade = /^(\d+)-(\d*)$/.exec(params.idade || '');
  if (idade) base = base.filter(i => (i.parado || 0) >= Number(idade[1]) && (idade[2] === '' || (i.parado || 0) <= Number(idade[2])));
  if (params.vez === 'esc' || params.vez === 'cli') filtros.lado = params.vez;
  const umaPessoa = escopo === 'minhas' && !params.analista && !params.cliente;
  if (umaPessoa) filtros.resp = '';

  const n = { minhas: minhas().length, equipe: todas.length, semresp: todas.filter(i => !i.resp).length };
  const abaAtiva = params.analista || params.cliente ? '' : escopo;
  ctx.cab({
    titulo, sub,
    abas: [
      { id: 'minhas', rot: 'Minhas', href: '#/fila', n: n.minhas },
      { id: 'equipe', rot: 'Equipe toda', href: '#/fila?escopo=equipe', n: n.equipe },
      { id: 'semresp', rot: 'Sem responsável', href: '#/fila?escopo=semresp', n: n.semresp, late: n.semresp > 0 }
    ],
    aba: abaAtiva
  });

  const resps = [...new Set(base.map(i => i.resp || '(sem responsável)'))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const sel = (id, rot, ops, v) => '<label class="field">' + rot + '<select id="' + id + '">' + ops.map(([k, r]) => '<option value="' + esc(k) + '"' + (v === k ? ' selected' : '') + '>' + esc(r) + '</option>').join('') + '</select></label>';

  el.innerHTML =
    '<div class="barra">' +
      '<input type="search" id="f-texto" placeholder="Filtrar por ID, cliente, empregado, assunto ou responsável…" value="' + esc(filtros.texto) + '" aria-label="Filtrar">' +
      '<div class="seg" role="group" aria-label="De quem é a vez">' + [['', 'Todas'], ['esc', 'Escritório'], ['cli', 'Cliente']].map(([v, r]) => '<button data-lado="' + v + '"' + (filtros.lado === v ? ' class="on"' : '') + '>' + r + '</button>').join('') + '</div>' +
      '<details class="menu" id="m-filtros"><summary class="btn btn-sm" id="b-filtros"><svg class="ic ic-sm"><use href="#i-filter"/></svg> Filtros <span class="menu-n" id="n-filtros"></span></summary>' +
        '<div class="menu-list form">' +
          sel('f-tipo', 'Tipo de solicitação', [['', 'Todos os tipos']].concat(OC.TYPES.map(t => [t.key, t.label])), filtros.tipo) +
          sel('f-grav', 'Gravidade', [['', 'Todas'], ['2', 'Fora do prazo'], ['1', 'Atenção (vence hoje)'], ['0', 'Em dia'], ['g3', 'Só críticas (G3)']], filtros.grav) +
          (umaPessoa ? '' : sel('f-resp', 'Responsável', [['', 'Todos']].concat(resps.map(r => [r, r])), filtros.resp)) +
          '<div class="menu-pe"><button class="btn btn-sm" id="f-limpar">Limpar filtros</button><button class="btn btn-sm btn-primary" id="f-ok">Pronto</button></div>' +
        '</div></details>' +
      '<span class="rotulo">Ordenar</span><select id="f-ord" aria-label="Ordenar">' + ORDENS.map(([k, r]) => '<option value="' + k + '"' + (ord.k === k ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>' +
      '<span class="count" id="cont"></span>' +
      '<div class="seg" role="group" aria-label="Visualização"><button data-vis="lista"' + (vis === 'lista' ? ' class="on"' : '') + ' title="Lista"><svg class="ic"><use href="#i-list"/></svg> Lista</button><button data-vis="cartoes"' + (vis === 'cartoes' ? ' class="on"' : '') + ' title="Cartões"><svg class="ic"><use href="#i-grid"/></svg> Cartões</button></div>' +
      '<details class="menu"><summary class="btn btn-sm" aria-label="Mais"><svg class="ic ic-sm"><use href="#i-more"/></svg> Mais</summary><div class="menu-list"><button class="menu-item" id="csv"><svg class="ic"><use href="#i-download"/></svg> Exportar CSV (o que está na tela)</button><button class="menu-item" id="m-onvio"><svg class="ic"><use href="#i-eye"/></svg> Ver a lista no Onvio</button></div></details>' +
    '</div>' +
    '<div class="ativos" id="ativos"></div>' +
    '<div id="corpo"></div>';

  const filtrar = () => {
    const q = normal(filtros.texto.trim());
    const l = base.filter(i => (!filtros.tipo || i.type === filtros.tipo) && (!filtros.lado || i.lado === filtros.lado) &&
      (!filtros.grav || (filtros.grav === 'g3' ? i.grav === 3 : String(i.nivel || 0) === filtros.grav)) &&
      (!filtros.resp || (i.resp || '(sem responsável)') === filtros.resp) &&
      (!q || normal([i.num, i.apelido, i.cliente, i.detalhe, i.resp, i.status, i.typeLabel].join(' ')).includes(q)));
    const col = COLUNAS.find(c => c.k === ord.k) || COLUNAS[COLUNAS.length - 1];
    l.sort((a, b) => { const x = col.v(a), y = col.v(b); const r = x < y ? -1 : x > y ? 1 : 0; return (ord.desc ? -r : r) || (b.parado - a.parado); });
    return l;
  };
  const chips = () => {
    const c = [];
    if (kpi) c.push(['kpi', 'Só: ' + kpi.rot]);
    if (idade) c.push(['idade', 'Parada há ' + idade[1] + (idade[2] ? '–' + idade[2] : '+') + ' dias']);
    if (filtros.tipo) c.push(['tipo', OC.TYPE_BY_KEY[filtros.tipo].label]);
    if (filtros.grav) c.push(['grav', { 2: 'Fora do prazo', 1: 'Atenção', 0: 'Em dia', g3: 'Só G3' }[filtros.grav]]);
    if (filtros.resp) c.push(['resp', filtros.resp]);
    $('#ativos', el).innerHTML = c.map(([k, r]) => '<span class="chip-f">' + esc(r) + '<button data-tira="' + k + '" aria-label="Tirar filtro"><svg class="ic"><use href="#i-x"/></svg></button></span>').join('');
    const nf = ['tipo', 'grav', 'resp'].filter(k => filtros[k]).length;
    $('#n-filtros', el).textContent = nf || '';
    $('#b-filtros', el).classList.toggle('filtro-on', nf > 0);
    $$('[data-tira]', el).forEach(b => b.onclick = () => {
      if (b.dataset.tira === 'kpi' || b.dataset.tira === 'idade') { const p = Object.assign({}, params); delete p[b.dataset.tira]; delete p.vez; ctx.navegar('fila', p); return; }
      filtros[b.dataset.tira] = ''; const s = $('#f-' + b.dataset.tira, el); if (s) s.value = ''; desenhar();
    });
  };
  const desenhar = () => {
    const l = filtrar();
    chips();
    $('#cont', el).textContent = l.length + (l.length === 1 ? ' solicitação' : ' solicitações');
    const vazio = '<div class="vazio">' + (!estado.snap ? '<b>Aguardando a primeira leitura do Onvio</b>' : base.length ? '<b>Nada com esses filtros</b>Tire um filtro acima para ver mais.' : '<b>Nada pendente aqui</b>Quando chegar solicitação, ela aparece sozinha.') + '</div>';
    if (vis === 'cartoes') $('#corpo', el).innerHTML = l.length ? '<div class="cards">' + l.map(cartaoItem).join('') + '</div>' : '<div class="list-card">' + vazio + '</div>';
    else $('#corpo', el).innerHTML = '<div class="list-card" style="--cols:' + COLS + '"><div class="lh" role="row">' +
      COLUNAS.map(c => '<button data-col="' + c.k + '" class="' + (c.num ? 'num ' : '') + (ord.k === c.k ? 'on' + (ord.desc ? '' : ' asc') : '') + '">' + c.rot + '</button>').join('') + '</div>' +
      (l.length ? l.map(linha).join('') : vazio) + '</div>';
    ligarItens($('#corpo', el), l, ctx.abrirDetalhe);
    $$('[data-col]', el).forEach(b => b.addEventListener('click', () => {
      ord = ord.k === b.dataset.col ? { k: ord.k, desc: !ord.desc } : { k: b.dataset.col, desc: ['nivel', 'parado', 'num'].includes(b.dataset.col) };
      $('#f-ord', el).value = ord.k; desenhar();
    }));
  };
  $('#f-texto', el).addEventListener('input', e => { filtros.texto = e.target.value; desenhar(); });
  $('#f-texto', el).addEventListener('keydown', e => { if (e.key === 'ArrowDown') { const p = $('#corpo [data-k]', el); if (p) { e.preventDefault(); p.focus(); } } });
  for (const k of ['tipo', 'grav', 'resp']) { const s = $('#f-' + k, el); if (s) s.addEventListener('change', e => { filtros[k] = e.target.value; desenhar(); }); }
  $('#f-limpar', el).onclick = () => { filtros.tipo = filtros.grav = filtros.resp = ''; $$('.menu-list.form select', el).forEach(s => { s.value = ''; }); desenhar(); };
  $('#f-ok', el).onclick = () => { $('#m-filtros', el).open = false; };
  $('#f-ord', el).addEventListener('change', e => { ord = { k: e.target.value, desc: ['nivel', 'parado', 'num'].includes(e.target.value) }; desenhar(); });
  $$('[data-lado]', el).forEach(b => b.addEventListener('click', () => { filtros.lado = b.dataset.lado; $$('[data-lado]', el).forEach(x => x.classList.toggle('on', x === b)); desenhar(); }));
  $$('[data-vis]', el).forEach(b => b.addEventListener('click', () => {
    vis = b.dataset.vis; try { localStorage.setItem('controlonvio-fila-vis', vis); } catch (e) {}
    $$('[data-vis]', el).forEach(x => x.classList.toggle('on', x === b)); desenhar();
  }));
  $('#csv', el).addEventListener('click', () => { csvItens('onvio-' + (params.escopo || 'minhas') + '-' + OC.ymd(new Date()) + '.csv', filtrar()); });
  $('#m-onvio', el).addEventListener('click', () => enviar({ cmd: 'fecharPainel' }));
  desenhar();
}

function linha(i) {
  return '<div class="lr lvl-' + (i.nivel || 0) + '" tabindex="0" data-k="' + esc(i.k) + '" role="row">' +
    '<span class="mono">#' + esc(i.num) + '</span>' +
    '<span class="c-sub" style="color:var(--ink-2)">' + esc(i.typeLabel) + '</span>' +
    '<span>' + pillSituacao(i) + '<div class="c-sub">vez: ' + ladoTexto(i) + '</div></span>' +
    '<span><div class="c-main" title="' + esc(i.cliente) + '">' + esc(i.apelido || i.cliente || '—') + '</div>' + (i.apelido && i.cliente && i.apelido !== i.cliente ? '<div class="c-sub">' + esc(i.cliente) + '</div>' : '') + '</span>' +
    '<span><div class="c-sub" style="color:var(--ink)" title="' + esc(i.detalhe) + '">' + esc(i.detalhe || '—') + '</div>' + (i.abaProvavel ? '<div class="c-sub">pode ser: ' + esc(i.abaProvavel.label) + '</div>' : '') + '</span>' +
    '<span class="c-sub" style="color:var(--ink-2)">' + (i.resp ? esc(i.resp) : '<span class="today">sem responsável</span>') + '</span>' +
    '<span class="num"><b class="mono">' + (i.parado || 0) + 'd</b><div class="c-sub">' + (i.last ? fmtDataCurta(i.last) : '') + '</div></span>' +
    '<span>' + prazoHtml(i) + '</span></div>';
}

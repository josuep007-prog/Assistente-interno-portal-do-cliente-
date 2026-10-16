/* Solicitações (rota #/fila) · minhas, equipe, sem responsável, de um analista ou de um cliente (pendências lidas ao vivo).
 * Barra como a de Empresas no Departamento Pessoal: busca, vez, Filtros, Ordenar, Lista/Cartões e Mais. */
import { estado, itens, minhas, clienteRespondeu, enviar } from '../estado.js';
import { esc, pillSituacao, prazoHtml, cartaoItem, ligarItens, csvItens, fmtDataCurta, ladoTexto, normal, tipoVisual, tipoIcone, $, $$ } from '../util.js';
const OC = window.OC;

const KPI = {
  acao: { rot: 'Com ação do escritório', f: i => i.lado === 'esc' },
  hoje: { rot: 'Vencem hoje', f: i => i.nivel === 1 },
  atraso: { rot: 'Fora do prazo', f: i => i.nivel === 2 },
  g3: { rot: 'Críticas (G3)', f: i => i.grav === 3 },
  respondeu: { rot: 'Cliente respondeu', f: clienteRespondeu },
  prescreve: { rot: 'Prescrevem em até 5 dias', f: i => i.prescreveEm != null && i.prescreveEm <= 5 },
  abaErrada: { rot: 'Possível aba errada', f: i => !!i.abaProvavel },
  cli: { rot: 'Na vez do cliente', f: i => i.lado === 'cli' },
  admissao: { rot: 'Admissões em destaque', f: i => !!i.admissaoAlerta && !OC.escritorioTramitou(i) },
  pagamento: { rot: 'Pagamento vencendo em até 1 dia útil', f: i => !!i.prazoLegal && i.prazoLegal.faltam <= 1 },
  semcalc: { rot: 'Avisos sem cálculo', f: i => !!i.semCalculo }
};

// Colunas da lista. "Responsável" só aparece quando a lista não é só sua.
const COLUNAS = [
  { k: 'num', rot: 'ID', v: i => Number(i.num) || 0, w: '64px' },
  { k: 'tipo', rot: 'Tipo', v: i => i.typeLabel, w: '150px' },
  { k: 'cliente', rot: 'Cliente · assunto', v: i => normal(i.apelido || i.cliente), w: 'minmax(0,2fr)' },
  { k: 'status', rot: 'Situação', v: i => i.status, w: '150px' },
  { k: 'resp', rot: 'Responsável', v: i => normal(i.resp), w: '130px', equipe: true },
  { k: 'parado', rot: 'Parada', v: i => i.parado || 0, num: true, w: '64px' },
  { k: 'nivel', rot: 'Prazo', v: i => (i.nivel || 0) * 10 + (i.grav || 0), w: 'minmax(0,1.4fr)' }
];
// Ordem (lista suspensa); clicar no cabeçalho de uma coluna também ordena.
const ORDENS = [['prio', 'Prioridade', 'O que pede ação primeiro, em grupos (mesma ordem do Hoje)'], ['cliente', 'Empresa', 'Agrupado por empresa, de A a Z'], ['recente', 'Mais recente', 'Abertas mais recentemente primeiro'], ['parado', 'Mais parada', 'Mais dias sem movimentação primeiro']];
const DESC = ['nivel', 'parado', 'num', 'recente'];
// De quem é a vez. O padrão é o que espera o escritório ("A responder"); "Aguardando o cliente" é o filtro secundário.
// Atalhos de outras telas (kpi, motivo, idade) escolhem a vez que faz sentido para eles; '' mostra as duas.
const KPI_VEZ = { cli: 'cli', prescreve: 'cli', acao: 'esc', hoje: 'esc', respondeu: 'esc' };
let vezUser = 'esc';

let ord = (() => { try { const k = localStorage.getItem('controlonvio-fila-ord'); return ORDENS.some(o => o[0] === k) ? { k, desc: DESC.includes(k) } : { k: 'prio', desc: false }; } catch (e) { return { k: 'prio', desc: false }; } })();
let filtros = { texto: '', tipo: '', grav: '', resp: '' };
let vis = (() => { try { return localStorage.getItem('controlonvio-fila-vis') || 'lista'; } catch (e) { return 'lista'; } })();
const ROT_MOTIVO = Object.fromEntries(OC.MOTIVOS.map(m => [m.k, m.rot]));

export function render(el, ctx, params) {
  params = params || {};
  const escopo = params.escopo || 'minhas';
  const todas = itens();
  let base = escopo === 'equipe' ? todas : escopo === 'semresp' ? todas.filter(i => !i.resp) : minhas();
  let titulo = 'Solicitações';
  let sub = (escopo === 'equipe' ? 'Da equipe toda' : escopo === 'semresp' ? 'Sem responsável' : 'As suas') + ' · pendências lidas do Onvio, ao vivo';
  if (params.analista) { base = todas.filter(i => (i.resp || '(sem responsável)') === params.analista); titulo = params.analista; sub = 'Fila do responsável · <a href="#/equipe">voltar à Equipe</a>'; }
  if (params.cliente) { base = todas.filter(i => (i.cliente || i.apelido || '(cliente não informado)') === params.cliente); titulo = params.cliente; sub = 'Pendências do cliente · <a href="#/inicio">voltar ao Hoje</a>'; }
  const kpi = KPI[params.kpi];
  if (kpi) base = base.filter(kpi.f);
  const motivo = OC.MOTIVOS.find(x => x.k === params.motivo);          // vindo do anel do Hoje
  if (motivo) base = base.filter(i => OC.motivoDe(i) === motivo.k);
  // vindos do Hoje: faixa de dias parada (mapa de calor)
  const idade = /^(\d+)-(\d*)$/.exec(params.idade || '');
  if (idade) base = base.filter(i => (i.parado || 0) >= Number(idade[1]) && (idade[2] === '' || (i.parado || 0) <= Number(idade[2])));
  const derivada = params.vez === 'esc' || params.vez === 'cli' ? params.vez : kpi ? (KPI_VEZ[params.kpi] || '') : motivo ? (motivo.k === 'prescreve' ? 'cli' : '') : idade || params.cliente || escopo === 'semresp' ? '' : null;   // de um cliente ou sem responsável: as duas vezes
  let vez = derivada != null ? derivada : vezUser;
  const umaPessoa = escopo === 'minhas' && !params.analista && !params.cliente;
  if (umaPessoa) filtros.resp = '';
  const cols = COLUNAS.filter(c => !(c.equipe && umaPessoa));

  const resolvidas = (estado.snap && estado.snap.resolvidas) || [];
  const n = { minhas: minhas().length, equipe: todas.length, semresp: todas.filter(i => !i.resp).length, resolvidas: resolvidas.length };
  const abaAtiva = params.analista || params.cliente ? '' : escopo;
  ctx.cab({
    titulo, sub,
    abas: [
      { id: 'minhas', rot: 'Minhas', href: '#/fila', n: n.minhas },
      { id: 'equipe', rot: 'Equipe toda', href: '#/fila?escopo=equipe', n: n.equipe },
      { id: 'semresp', rot: 'Sem responsável', href: '#/fila?escopo=semresp', n: n.semresp, late: n.semresp > 0 },
      { id: 'resolvidas', rot: 'Resolvidas', href: '#/fila?escopo=resolvidas', n: n.resolvidas }
    ],
    aba: abaAtiva,
    extra: '<button type="button" class="btn btn-sm btn-primary" id="f-nova"><svg class="ic ic-sm"><use href="#i-plus"/></svg> Nova solicitação</button>'
  });
  $('#f-nova').onclick = () => { const o = params.cliente && todas.find(i => (i.cliente || i.apelido) === params.cliente); ctx.abrirNova(o ? { origem: o } : {}); };
  if (escopo === 'resolvidas') { renderResolvidas(el, ctx, resolvidas); return; }

  const resps = [...new Set(base.map(i => i.resp || '(sem responsável)'))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const sel = (id, rot, ops, v) => '<label class="field">' + rot + '<select id="' + id + '">' + ops.map(([k, r]) => '<option value="' + esc(k) + '"' + (v === k ? ' selected' : '') + '>' + esc(r) + '</option>').join('') + '</select></label>';

  el.innerHTML =
    '<div class="barra barra-fila">' +
      '<input type="search" id="f-texto" placeholder="Filtrar por ID, cliente, empregado, assunto ou responsável…" value="' + esc(filtros.texto) + '" aria-label="Filtrar">' +
      '<button type="button" class="chip-vez" id="f-vez" title="Mostrar só as que estão esperando o cliente responder"><svg class="ic ic-sm"><use href="#i-clock"/></svg> Aguardando o cliente <span class="n" id="n-cli"></span></button>' +
      '<details class="menu" id="m-filtros"><summary class="btn btn-sm" id="b-filtros"><svg class="ic ic-sm"><use href="#i-filter"/></svg> Filtros <span class="menu-n" id="n-filtros"></span></summary>' +
        '<div class="menu-list form">' +
          sel('f-tipo', 'Tipo de solicitação', [['', 'Todos os tipos']].concat(OC.TYPES.map(t => [t.key, t.label])), filtros.tipo) +
          sel('f-grav', 'Gravidade', [['', 'Todas'], ['2', 'Fora do prazo'], ['1', 'Atenção (vence hoje)'], ['0', 'Em dia'], ['g3', 'Só críticas (G3)']], filtros.grav) +
          (umaPessoa ? '' : sel('f-resp', 'Responsável', [['', 'Todos']].concat(resps.map(r => [r, r])), filtros.resp)) +
          '<div class="menu-pe"><button class="btn btn-sm" id="f-limpar">Limpar filtros</button><button class="btn btn-sm btn-primary" id="f-ok">Pronto</button></div>' +
        '</div></details>' +
      '<label class="ord-sel">Ordenar <select id="f-ord" aria-label="Ordenar">' + ORDENS.map(([k, r, d]) => '<option value="' + k + '" title="' + esc(d) + '"' + (ord.k === k ? ' selected' : '') + '>' + r + '</option>').join('') + (ORDENS.some(o => o[0] === ord.k) ? '' : '<option value="' + esc(ord.k) + '" selected>Coluna</option>') + '</select></label>' +
      '<span class="spacer"></span>' +
      '<div class="seg seg-ic" role="group" aria-label="Visualização"><button data-vis="lista"' + (vis === 'lista' ? ' class="on"' : '') + ' title="Lista" aria-label="Lista"><svg class="ic"><use href="#i-list"/></svg></button><button data-vis="cartoes"' + (vis === 'cartoes' ? ' class="on"' : '') + ' title="Cartões" aria-label="Cartões"><svg class="ic"><use href="#i-grid"/></svg></button></div>' +
      '<details class="menu"><summary class="btn btn-sm" aria-label="Mais" title="Mais"><svg class="ic ic-sm"><use href="#i-more"/></svg></summary><div class="menu-list"><button class="menu-item" id="csv"><svg class="ic"><use href="#i-download"/></svg> Exportar CSV (o que está na tela)</button><button class="menu-item" id="m-onvio"><svg class="ic"><use href="#i-eye"/></svg> Ver a lista no Onvio</button></div></details>' +
    '</div>' +
    '<div class="fila-cab"><h3 id="vez-tit"></h3><span class="count" id="cont"></span><div class="tipos-l" id="tipos" role="group" aria-label="Tipo de solicitação"></div></div>' +
    '<div class="ativos" id="ativos"></div>' +
    '<div id="corpo"></div>';

  const passa = (i, semTipo, semVez) => (semVez || !vez || i.lado === vez || (vez === 'esc' && i.lado !== 'cli' && i.lado !== 'fim')) &&
    (semTipo || !filtros.tipo || i.type === filtros.tipo) &&
    (!filtros.grav || (filtros.grav === 'g3' ? i.grav === 3 : String(i.nivel || 0) === filtros.grav)) &&
    (!filtros.resp || (i.resp || '(sem responsável)') === filtros.resp);
  const filtrar = (semTipo, semVez) => {
    const q = normal(filtros.texto.trim());
    const l = base.filter(i => passa(i, semTipo, semVez) && (!q || normal([i.num, i.apelido, i.cliente, i.detalhe, i.resp, i.status, i.typeLabel].join(' ')).includes(q)));
    if (ord.k === 'prio') { const rank = new Map(OC.prioridades(l).map((p, k) => [p.item.k, k])); l.sort((a, b) => (rank.get(a.k) ?? 1e6) - (rank.get(b.k) ?? 1e6) || (b.parado - a.parado)); return l; }
    const col = ord.k === 'recente' ? { v: i => String(i.created || '') } : COLUNAS.find(c => c.k === ord.k) || COLUNAS[COLUNAS.length - 1];
    const prio = new Map(OC.prioridades(l).map((p, k) => [p.item.k, k]));
    l.sort((a, b) => { const x = col.v(a), y = col.v(b); const r = x < y ? -1 : x > y ? 1 : 0; return (ord.desc ? -r : r) || ((prio.get(a.k) ?? 1e6) - (prio.get(b.k) ?? 1e6)); });
    return l;
  };
  // Tipos em chips compactos: só os que têm alguma (com os outros filtros e a vez aplicados), com quantas fora do prazo
  const tipos = () => {
    const l = filtrar(true);
    const chip = (k, rot, xs) => {
      const atr = xs.filter(i => i.nivel === 2).length;
      return '<button type="button" class="tipo-ch fam-' + tipoVisual(k).fam + (filtros.tipo === k ? ' on' : '') + '" data-tipo="' + esc(k) + '" aria-pressed="' + (filtros.tipo === k) + '"' + (atr ? ' title="' + atr + ' fora do prazo"' : '') + '>' +
        (k ? tipoIcone(k, 'pq') : '') + '<span>' + esc(rot) + '</span><b>' + xs.length + '</b>' + (atr ? '<em>' + atr + '</em>' : '') + '</button>';
    };
    const comAlguma = OC.TYPES.map(t => [t, l.filter(i => i.type === t.key)]).filter(([t, xs]) => xs.length || filtros.tipo === t.key);
    $('#tipos', el).innerHTML = comAlguma.length > 1 || filtros.tipo ? chip('', 'Todos', l) + comAlguma.map(([t, xs]) => chip(t.key, t.label, xs)).join('') : '';
    $$('[data-tipo]', el).forEach(b => b.onclick = () => { filtros.tipo = filtros.tipo === b.dataset.tipo ? '' : b.dataset.tipo; const s = $('#f-tipo', el); if (s) s.value = filtros.tipo; desenhar(); });
  };
  const chips = () => {
    const c = [];
    if (kpi) c.push(['kpi', 'Só: ' + kpi.rot]);
    if (motivo) c.push(['motivo', 'Só: ' + motivo.rot]);
    if (idade) c.push(['idade', 'Parada há ' + idade[1] + (idade[2] ? '–' + idade[2] : '+') + ' dias']);
    if (filtros.tipo) c.push(['tipo', OC.TYPE_BY_KEY[filtros.tipo].label]);
    if (filtros.grav) c.push(['grav', { 2: 'Fora do prazo', 1: 'Atenção', 0: 'Em dia', g3: 'Só G3' }[filtros.grav]]);
    if (filtros.resp) c.push(['resp', filtros.resp]);
    $('#ativos', el).innerHTML = c.map(([k, r]) => '<span class="chip-f">' + esc(r) + '<button data-tira="' + k + '" aria-label="Tirar filtro"><svg class="ic"><use href="#i-x"/></svg></button></span>').join('');
    const nf = ['tipo', 'grav', 'resp'].filter(k => filtros[k]).length;
    $('#n-filtros', el).textContent = nf || '';
    $('#b-filtros', el).classList.toggle('filtro-on', nf > 0);
    $$('[data-tira]', el).forEach(b => b.onclick = () => {
      if (b.dataset.tira === 'kpi' || b.dataset.tira === 'idade' || b.dataset.tira === 'motivo') { const p = Object.assign({}, params); delete p[b.dataset.tira]; delete p.vez; ctx.navegar('fila', p); return; }
      filtros[b.dataset.tira] = ''; const s = $('#f-' + b.dataset.tira, el); if (s) s.value = ''; desenhar();
    });
  };
  // Título da lista: "A responder" (padrão), "Aguardando o cliente" ou as duas (atalho de outra tela), com a troca
  const cabecalho = l => {
    const todasVezes = filtrar(false, true);
    const nCli = todasVezes.filter(i => i.lado === 'cli').length, nEsc = todasVezes.length - nCli;
    $('#vez-tit', el).innerHTML = vez === 'cli' ? 'Aguardando o cliente <button type="button" class="linkish" data-vez="esc">voltar para a responder (' + nEsc + ')</button>'
      : vez === 'esc' ? 'A responder' : 'Escritório e cliente <button type="button" class="linkish" data-vez="esc">só a responder (' + nEsc + ')</button>';
    $('#n-cli', el).textContent = nCli;
    $('#f-vez', el).classList.toggle('on', vez === 'cli');
    $('#f-vez', el).setAttribute('aria-pressed', String(vez === 'cli'));
    $('#cont', el).textContent = l.length + (l.length === 1 ? ' solicitação' : ' solicitações');
    $$('[data-vez]', el).forEach(b => b.onclick = () => trocarVez(b.dataset.vez));
  };
  const trocarVez = v => { vez = v; if (derivada == null || v === 'esc') vezUser = v === 'cli' ? 'cli' : 'esc'; desenhar(); };
  // Grupos: por urgência na ordem de prioridade (o que fazer primeiro) e por empresa na ordem por empresa
  const grupoDe = i => ord.k === 'prio' ? (i.lado === 'cli' && OC.motivoDe(i) === 'emdia' ? 'Aguardando o cliente' : ROT_MOTIVO[OC.motivoDe(i)]) : ord.k === 'cliente' ? (i.apelido || i.cliente || '—') : null;
  const desenhar = () => {
    const l = filtrar();
    tipos();
    chips();
    cabecalho(l);
    const vazio = '<div class="vazio">' + (!estado.snap ? '<b>Aguardando a primeira leitura do Onvio</b>' : base.length && l.length < base.length ? '<b>Nada aqui com esses filtros</b>' + (vez === 'esc' && base.some(i => i.lado === 'cli') ? 'Nada esperando o escritório. Veja as que aguardam o cliente no botão acima.' : 'Tire um filtro acima para ver mais.') : '<b>Nada pendente aqui</b>Quando chegar solicitação, ela aparece sozinha.') + '</div>';
    const nGrupo = l.reduce((m, i) => { const g = grupoDe(i); if (g) m[g] = (m[g] || 0) + 1; return m; }, {});
    const comGrupos = (fn, cls) => { let ant = null; return l.map(i => { const g = grupoDe(i); const h = g && g !== ant ? '<div class="' + cls + (ord.k === 'prio' ? ' grp-' + (i.lado === 'cli' && OC.motivoDe(i) === 'emdia' ? 'cli' : OC.motivoDe(i)) : '') + '"><b>' + esc(g) + '</b><span>' + nGrupo[g] + '</span></div>' : ''; ant = g; return h + fn(i); }).join(''); };
    const comCol = i => linha(i, cols);
    if (vis === 'cartoes') $('#corpo', el).innerHTML = l.length ? '<div class="cards-emp">' + comGrupos(cartaoItem, 'emp-cab') + '</div>' : '<div class="list-card">' + vazio + '</div>';
    else $('#corpo', el).innerHTML = '<div class="list-card" style="--cols:' + cols.map(c => c.w).join(' ') + '"><div class="lh" role="row">' +
      cols.map(c => '<button data-col="' + c.k + '" class="' + (c.num ? 'num ' : '') + (ord.k === c.k ? 'on' + (ord.desc ? '' : ' asc') : '') + '">' + c.rot + '</button>').join('') + '</div>' +
      (l.length ? comGrupos(comCol, 'emp-cab lr-emp') : vazio) + '</div>';
    ligarItens($('#corpo', el), l, ctx.abrirDetalhe);
    $$('[data-col]', el).forEach(b => b.addEventListener('click', () => {
      ord = ord.k === b.dataset.col ? { k: ord.k, desc: !ord.desc } : { k: b.dataset.col, desc: DESC.includes(b.dataset.col) };
      const s = $('#f-ord', el); if (s && ORDENS.some(o => o[0] === ord.k)) s.value = ord.k; desenhar();
    }));
  };
  $('#f-texto', el).addEventListener('input', e => { filtros.texto = e.target.value; desenhar(); });
  $('#f-texto', el).addEventListener('keydown', e => { if (e.key === 'ArrowDown') { const p = $('#corpo [data-k]', el); if (p) { e.preventDefault(); p.focus(); } } });
  for (const k of ['tipo', 'grav', 'resp']) { const s = $('#f-' + k, el); if (s) s.addEventListener('change', e => { filtros[k] = e.target.value; desenhar(); }); }
  $('#f-limpar', el).onclick = () => { filtros.tipo = filtros.grav = filtros.resp = ''; $$('.menu-list.form select', el).forEach(s => { s.value = ''; }); desenhar(); };
  $('#f-ok', el).onclick = () => { $('#m-filtros', el).open = false; };
  $('#f-vez', el).onclick = () => trocarVez(vez === 'cli' ? 'esc' : 'cli');
  $('#f-ord', el).addEventListener('change', e => {
    ord = { k: e.target.value, desc: DESC.includes(e.target.value) };
    try { localStorage.setItem('controlonvio-fila-ord', ord.k); } catch (er) {}
    desenhar();
  });
  $$('[data-vis]', el).forEach(b => b.addEventListener('click', () => {
    vis = b.dataset.vis; try { localStorage.setItem('controlonvio-fila-vis', vis); } catch (e) {}
    $$('[data-vis]', el).forEach(x => x.classList.toggle('on', x === b)); desenhar();
  }));
  $('#csv', el).addEventListener('click', () => { csvItens('onvio-' + (params.escopo || 'minhas') + '-' + OC.ymd(new Date()) + '.csv', filtrar()); });
  $('#m-onvio', el).addEventListener('click', () => enviar({ cmd: 'fecharPainel' }));
  desenhar();
  if (params.foco) focar(params.foco);

  // Vindo do Hoje com uma solicitação escolhida (foco=k): tira os filtros da tela e mostra a vez dela se ela estiver
  // escondida, rola até a linha e pisca um contorno vermelho. O foco sai do endereço, para não piscar de novo.
  function focar(k) {
    const achar = () => $$('#corpo [data-k]', el).find(r => r.dataset.k === k);
    if (!achar()) {
      const it = base.find(i => i.k === k);
      filtros = { texto: '', tipo: '', grav: '', resp: '' };
      if (it) vez = it.lado === 'cli' ? 'cli' : 'esc';
      $('#f-texto', el).value = ''; $$('.menu-list.form select', el).forEach(x => { x.value = ''; });
      desenhar();
    }
    try { history.replaceState(null, '', location.href.replace(/([?&])foco=[^&]*(&|$)/, (m, a, b) => (b ? a : '')).replace(/\?$/, '')); } catch (e) {}
    const r = achar();
    if (!r) return;
    r.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    r.classList.remove('foco-pisca'); void r.offsetWidth; r.classList.add('foco-pisca');
    setTimeout(() => r.classList.remove('foco-pisca'), 3400);
  }
}

// Vez do cliente sem retorno: o analista respondeu, não pediu nada e o cliente não falou mais (regra resolvidaClienteDias).
// Saem da fila, dos prazos e da prescrição; contam como entregues na avaliação da Equipe.
let resolvidasMinhas = false;
function renderResolvidas(el, ctx, todas) {
  const dias = estado.settings ? estado.settings.resolvidaClienteDias : OC.DEFAULTS.resolvidaClienteDias;
  const desenhar = () => {
    const l = (resolvidasMinhas ? todas.filter(i => i.mine) : todas).map(i => Object.assign({}, i, { lado: 'cli', resolvida: true }));
    el.innerHTML =
      '<div class="nota-regra"><svg class="ic"><use href="#i-check"/></svg><div><b>Consideradas resolvidas</b>' +
        'Aguardando o cliente há mais de ' + dias + ' dias úteis, e a última resposta do analista não pede nada ao cliente: entende-se que ele ficou satisfeito. ' +
        'Saem das pendências, dos prazos e da prescrição e contam como entregues na Equipe. Se a resposta pedir algo (envie, aguardamos, favor, uma pergunta…), a solicitação continua pendente. ' +
        'Nada muda no Onvio: para encerrar lá, conclua a solicitação.' + (dias ? '' : ' <b class="today">A regra está desligada nas Configurações.</b>') + '</div></div>' +
      '<div class="barra"><div class="seg" role="group" aria-label="De quem"><button data-de="todas"' + (!resolvidasMinhas ? ' class="on"' : '') + '>Equipe toda</button><button data-de="minhas"' + (resolvidasMinhas ? ' class="on"' : '') + '>Minhas</button></div>' +
        '<span class="count">' + l.length + (l.length === 1 ? ' resolvida' : ' resolvidas') + '</span></div>' +
      '<div class="list-card" style="--cols:64px 132px 168px minmax(0,1.1fr) minmax(0,1.3fr) 130px 110px"><div class="lh" role="row"><span>ID</span><span>Tipo</span><span>Situação no Onvio</span><span>Cliente</span><span>Empregado / assunto</span><span>Responsável</span><span class="num">Sem retorno</span></div>' +
      (l.length ? l.map(i => '<div class="lr resolvida" tabindex="0" data-k="' + esc(i.k) + '" role="row">' +
        '<span class="mono">#' + esc(i.num) + '</span>' +
        '<span class="c-sub c-tipo" style="color:var(--ink-2)">' + tipoIcone(i.type, 'pq') + esc(i.typeLabel) + '</span>' +
        '<span>' + pillSituacao(i) + '</span>' +
        '<span><div class="c-main" title="' + esc(i.cliente) + '">' + esc(i.apelido || i.cliente || '—') + '</div></span>' +
        '<span><div class="c-sub" style="color:var(--ink)" title="' + esc(i.detalhe) + '">' + esc(i.detalhe || '—') + '</div></span>' +
        '<span class="c-sub" style="color:var(--ink-2)">' + esc(i.resp || 'sem responsável') + '</span>' +
        '<span class="num"><b class="mono">' + (i.semRetorno == null ? '—' : i.semRetorno + ' d.u.') + '</b><div class="c-sub">desde ' + (i.last ? fmtDataCurta(i.last) : '—') + '</div></span></div>').join('')
        : '<div class="vazio"><b>Nenhuma por enquanto</b>Aparecem aqui as solicitações na vez do cliente que ficaram mais de ' + dias + ' dias úteis sem retorno depois de uma resposta que não pedia nada.</div>') +
      '</div>';
    ligarItens($('.list-card', el), l, ctx.abrirDetalhe);
    $$('[data-de]', el).forEach(b => b.onclick = () => { resolvidasMinhas = b.dataset.de === 'minhas'; desenhar(); });
  };
  desenhar();
}

// Uma linha da lista: cliente e assunto juntos, sem repetir a vez (o título da lista já diz de quem é)
function linha(i, cols) {
  const cel = {
    num: '<span class="mono">#' + esc(i.num) + '</span>',
    tipo: '<span class="c-sub c-tipo" style="color:var(--ink-2)">' + tipoIcone(i.type, 'pq') + '<span class="c-tipo-tx">' + esc(i.typeLabel) + '</span></span>',
    cliente: '<span><div class="c-main" title="' + esc(i.cliente) + '">' + esc(i.apelido || i.cliente || '—') + '</div><div class="c-sub" title="' + esc(i.detalhe) + '">' + esc(i.detalhe || '—') + (i.abaProvavel ? ' · pode ser: ' + esc(i.abaProvavel.label) : '') + '</div></span>',
    status: '<span>' + pillSituacao(i) + '</span>',
    resp: '<span class="c-sub" style="color:var(--ink-2)">' + (i.resp ? esc(i.resp) : '<span class="today">sem responsável</span>') + '</span>',
    parado: '<span class="num"><b class="mono">' + (i.parado || 0) + 'd</b><div class="c-sub">' + (i.last ? fmtDataCurta(i.last) : '') + '</div></span>',
    nivel: '<span>' + prazoHtml(i) + '</span>'
  };
  return '<div class="lr lvl-' + (i.nivel || 0) + '" tabindex="0" data-k="' + esc(i.k) + '" role="row">' + (cols || COLUNAS).map(c => cel[c.k]).join('') + '</div>';
}

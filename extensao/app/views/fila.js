/* Solicitações (rota #/fila) · Minhas, Todas e Respondidas (pendências lidas ao vivo).
 * Barra como a de Empresas no Departamento Pessoal: busca, Filtros, Ordenar, Lista/Cartões e Mais.
 * Minhas: as suas e as sem responsável, na vez do escritório. Todas: a equipe toda. Respondidas: as suas na vez do
 * cliente, com as "consideradas resolvidas" num grupo no fim. A ordem é por prioridade (OC.ordemFila): prazo legal,
 * sem análise, em análise, cliente respondeu, aguardando o cliente. Prazo interno e gravidade não aparecem aqui. */
import { estado, itens, minhas, clienteRespondeu, enviar } from '../estado.js';
import { esc, pillSituacao, prazoHtml, cartaoItem, ligarItens, csvItens, fmtDataCurta, normal, tipoVisual, tipoIcone, nivelLegal, respHtml, definirSugestoesResp, $, $$ } from '../util.js';
const OC = window.OC;

// Atalhos de outras telas (Equipe, Hoje); hoje/atraso/g3 só chegam da área do gestor
const KPI = {
  acao: { rot: 'Com ação do escritório', f: i => i.lado === 'esc' },
  hoje: { rot: 'Vencem hoje', f: i => i.nivel === 1 },
  atraso: { rot: 'Fora do prazo', f: i => i.nivel === 2 },
  g3: { rot: 'Críticas (G3)', f: i => i.grav === 3 },
  respondeu: { rot: 'Cliente respondeu', f: clienteRespondeu },
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
  { k: 'status', rot: 'Situação', v: i => i.status, w: '170px' },
  { k: 'resp', rot: 'Responsável', v: i => normal(i.resp), w: '130px', equipe: true },
  { k: 'parado', rot: 'Parada', v: i => i.parado || 0, num: true, w: '64px' },
  { k: 'prazo', rot: 'Prazo legal', v: i => nivelLegal(i) * 1000 + (i.parado || 0), w: 'minmax(0,1.4fr)' }
];
// Ordem (lista suspensa); clicar no cabeçalho de uma coluna também ordena.
const ORDENS = [['prio', 'Prioridade', 'O que pede ação primeiro, em grupos: prazo legal, sem análise, em análise, cliente respondeu e aguardando o cliente'], ['cliente', 'Empresa', 'Agrupado por empresa, de A a Z'], ['recente', 'Mais recente', 'Abertas mais recentemente primeiro'], ['parado', 'Mais parada', 'Mais dias sem movimentação primeiro']];
const DESC = ['prazo', 'parado', 'num', 'recente'];
const ROT_GRUPO = { legal: 'Prazo legal e admissões', sem: 'Sem análise', analise: 'Em análise', respondeu: 'Cliente respondeu', cliente: 'Aguardando o cliente' };

let ord = (() => { try { const k = localStorage.getItem('controlonvio-fila-ord'); return ORDENS.some(o => o[0] === k) ? { k, desc: DESC.includes(k) } : { k: 'prio', desc: false }; } catch (e) { return { k: 'prio', desc: false }; } })();
let filtros = { texto: '', tipo: '', legal: '', sit: '', resp: '' };
// Responsável sugerido para as sem responsável (cmd 'distribuicao', 30 dias): lido ao abrir, no máximo a cada 10 min, só na memória
let sugEm = 0, sugLendo = false, refazerFila = null, sugResp = new Map();
let vis = (() => { try { return localStorage.getItem('controlonvio-fila-vis') || 'cartoes'; } catch (e) { return 'cartoes'; } })();

// Que aba abre: a escolhida no endereço; atalhos antigos (equipe, semresp, resolvidas) caem nas novas
function abaDoEndereco(params, kpi, motivo, todas) {
  const e = params.escopo;
  if (e === 'respondidas' || e === 'resolvidas') return 'respondidas';
  if (e === 'todas' || e === 'equipe' || e === 'semresp') return 'todas';
  if (e === 'minhas') return 'minhas';
  if (motivo && motivo.k === 'cliente') return 'respondidas';
  if (kpi && params.kpi === 'cli') return 'respondidas';
  const f = params.foco && todas.find(i => i.k === params.foco);       // vindo do Hoje com uma solicitação escolhida
  if (f && f.lado === 'cli') return f.mine ? 'respondidas' : 'todas';
  if (f && !(f.mine || !f.resp)) return 'todas';
  return 'minhas';
}

export function render(el, ctx, params) {
  params = params || {};
  const todas = itens();
  const resolvidasMinhas = ((estado.snap && estado.snap.resolvidas) || []).filter(i => i.mine).map(i => Object.assign({}, i, { lado: 'cli', resolvida: true }));
  const kpi = KPI[params.kpi];
  const motivo = OC.MOTIVOS.find(x => x.k === params.motivo);          // vindo do anel do Hoje
  const porPessoa = !!(params.analista || params.cliente);
  let aba = porPessoa ? '' : abaDoEndereco(params, kpi, motivo, todas);
  if (estado.setor.fora && aba === 'todas') aba = 'minhas';              // fora do DP: sem a equipe toda
  const doMinhas = i => (i.mine || !i.resp) && i.lado !== 'cli';
  const doRespondidas = () => minhas().filter(i => i.lado === 'cli').concat(resolvidasMinhas);
  const n = { minhas: todas.filter(doMinhas).length, todas: todas.length, respondidas: doRespondidas().length };
  let base = aba === 'minhas' ? todas.filter(doMinhas) : aba === 'respondidas' ? doRespondidas() : todas;
  let titulo = 'Solicitações';
  let sub = (aba === 'minhas' ? 'As suas e as sem responsável' : aba === 'respondidas' ? 'As suas, esperando o cliente' : 'Da equipe toda') + ' · pendências lidas do Onvio, ao vivo';
  if (params.escopo === 'semresp') { base = base.filter(i => !i.resp); sub = 'Sem responsável · pendências lidas do Onvio, ao vivo'; }
  if (params.analista) { base = todas.filter(i => (i.resp || '(sem responsável)') === params.analista); titulo = params.analista; sub = 'Fila do responsável · <a href="#/equipe">voltar à Equipe</a>'; }
  if (params.cliente) { base = todas.filter(i => (i.cliente || i.apelido || '(cliente não informado)') === params.cliente); titulo = params.cliente; sub = 'Pendências do cliente · <a href="#/inicio">voltar ao Hoje</a>'; }
  if (kpi) base = base.filter(kpi.f);
  if (motivo) base = base.filter(i => OC.motivoDe(i) === motivo.k);
  // vindos do Hoje: faixa de dias parada (mapa de calor)
  const idade = /^(\d+)-(\d*)$/.exec(params.idade || '');
  if (idade) base = base.filter(i => (i.parado || 0) >= Number(idade[1]) && (idade[2] === '' || (i.parado || 0) <= Number(idade[2])));
  const umaPessoa = aba === 'minhas' || aba === 'respondidas';
  if (umaPessoa) filtros.resp = '';
  const cols = COLUNAS.filter(c => !(c.equipe && umaPessoa && !base.some(i => !i.resp)));      // com sem responsável na lista a coluna aparece, para a sugestão

  ctx.cab({
    titulo, sub,
    abas: [
      { id: 'minhas', rot: 'Minhas', href: '#/fila', n: n.minhas },
      ...(estado.setor.fora ? [] : [{ id: 'todas', rot: 'Todas', href: '#/fila?escopo=todas', n: n.todas }]),
      { id: 'respondidas', rot: 'Respondidas', href: '#/fila?escopo=respondidas', n: n.respondidas }
    ],
    aba,
    extra: '<button type="button" class="btn btn-sm btn-primary" id="f-nova"><svg class="ic ic-sm"><use href="#i-plus"/></svg> Nova solicitação</button>'
  });
  $('#f-nova').onclick = () => { const o = params.cliente && todas.find(i => (i.cliente || i.apelido) === params.cliente); ctx.abrirNova(o ? { origem: o } : {}); };

  const resps = [...new Set(base.map(i => i.resp || '(sem responsável)'))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const sel = (id, rot, ops, v) => '<label class="field">' + rot + '<select id="' + id + '">' + ops.map(([k, r]) => '<option value="' + esc(k) + '"' + (v === k ? ' selected' : '') + '>' + esc(r) + '</option>').join('') + '</select></label>';
  const tituloLista = aba === 'minhas' ? 'A responder' : aba === 'respondidas' ? 'Aguardando o cliente' : porPessoa ? 'Pendências' : 'Todas as pendências';

  el.innerHTML =
    '<div class="barra barra-fila">' +
      '<input type="search" id="f-texto" placeholder="Filtrar por ID, cliente, empregado, assunto ou responsável…" value="' + esc(filtros.texto) + '" aria-label="Filtrar">' +
      '<details class="menu" id="m-filtros"><summary class="btn btn-sm" id="b-filtros"><svg class="ic ic-sm"><use href="#i-filter"/></svg> Filtros <span class="menu-n" id="n-filtros"></span></summary>' +
        '<div class="menu-list form">' +
          sel('f-tipo', 'Tipo de solicitação', [['', 'Todos os tipos']].concat(OC.TYPES.map(t => [t.key, t.label])), filtros.tipo) +
          sel('f-legal', 'Prazo legal', [['', 'Todas'], ['1', 'Prazo legal perto']], filtros.legal) +
          (umaPessoa ? '' : sel('f-resp', 'Responsável', [['', 'Todos']].concat(resps.map(r => [r, r])), filtros.resp)) +
          '<div class="menu-pe"><button class="btn btn-sm" id="f-limpar">Limpar filtros</button><button class="btn btn-sm btn-primary" id="f-ok">Pronto</button></div>' +
        '</div></details>' +
      '<label class="ord-sel">Ordenar <select id="f-ord" aria-label="Ordenar">' + ORDENS.map(([k, r, d]) => '<option value="' + k + '" title="' + esc(d) + '"' + (ord.k === k ? ' selected' : '') + '>' + r + '</option>').join('') + (ORDENS.some(o => o[0] === ord.k) ? '' : '<option value="' + esc(ord.k) + '" selected>Coluna</option>') + '</select></label>' +
      '<span class="spacer"></span>' +
      '<div class="seg seg-ic" role="group" aria-label="Visualização"><button data-vis="lista"' + (vis === 'lista' ? ' class="on"' : '') + ' title="Lista" aria-label="Lista"><svg class="ic"><use href="#i-list"/></svg></button><button data-vis="cartoes"' + (vis === 'cartoes' ? ' class="on"' : '') + ' title="Cartões" aria-label="Cartões"><svg class="ic"><use href="#i-grid"/></svg></button></div>' +
      '<details class="menu"><summary class="btn btn-sm" aria-label="Mais" title="Mais"><svg class="ic ic-sm"><use href="#i-more"/></svg></summary><div class="menu-list"><button class="menu-item" id="csv"><svg class="ic"><use href="#i-download"/></svg> Exportar CSV (o que está na tela)</button><button class="menu-item" id="m-onvio"><svg class="ic"><use href="#i-eye"/></svg> Ver a lista no Onvio</button></div></details>' +
    '</div>' +
    '<div class="fila-cab"><h3 id="vez-tit">' + esc(tituloLista) + '</h3><span class="count" id="cont"></span></div>' +
    '<div class="tipos" id="tipos" role="group" aria-label="Tipo de solicitação"></div>' +
    '<div class="sits" id="sits" role="group" aria-label="Situação"></div>' +
    '<div class="ativos" id="ativos"></div>' +
    (aba === 'respondidas' ? '<div class="nota-regra nota-res" id="nota-res"><svg class="ic"><use href="#i-check"/></svg><div><b>Consideradas resolvidas</b>No fim da lista, o grupo das que o cliente deixou sem retorno depois de uma resposta que não pedia nada (mais de ' + (estado.settings ? estado.settings.resolvidaClienteDias : OC.DEFAULTS.resolvidaClienteDias) + ' dias úteis). Nada muda no Onvio: para encerrar lá, conclua a solicitação.</div></div>' : '') +
    '<div id="corpo"></div>';

  const passa = (i, o) => (o.semTipo || !filtros.tipo || i.type === filtros.tipo) &&
    (o.semSit || !filtros.sit || OC.grupoSituacao(i).k === filtros.sit) &&
    (!filtros.legal || OC.motivoDe(i) === 'legal') &&
    (!filtros.resp || (i.resp || '(sem responsável)') === filtros.resp);
  const filtrar = (o) => {
    o = o || {};
    const q = normal(filtros.texto.trim());
    const l = base.filter(i => passa(i, o) && (!q || normal([i.num, i.apelido, i.cliente, i.detalhe, i.resp, i.status, i.typeLabel].join(' ')).includes(q)));
    const rank = new Map(OC.ordemFila(l).map((p, k) => [p.item.k, k]));
    const r = i => rank.get(i.k) ?? 1e6;
    const resolv = l.filter(i => i.resolvida).sort((a, b) => (b.semRetorno || 0) - (a.semRetorno || 0));
    const resto = l.filter(i => !i.resolvida);
    if (ord.k === 'prio') resto.sort((a, b) => r(a) - r(b) || (b.parado - a.parado));
    else {
      const col = ord.k === 'recente' ? { v: i => String(i.created || '') } : COLUNAS.find(c => c.k === ord.k) || COLUNAS[COLUNAS.length - 1];
      resto.sort((a, b) => { const x = col.v(a), y = col.v(b); const c = x < y ? -1 : x > y ? 1 : 0; return (ord.desc ? -c : c) || (r(a) - r(b)); });
    }
    return resto.concat(resolv);
  };
  // Cartões dos tipos: quantas há em cada tipo (com os outros filtros aplicados) e quantas têm prazo legal perto.
  const tipos = () => {
    const l = filtrar({ semTipo: true });
    const cartao = (k, rot, xs) => {
      const leg = xs.filter(i => OC.motivoDe(i) === 'legal').length, tot = xs.length;
      return '<button type="button" class="tipo-c fam-' + tipoVisual(k).fam + (filtros.tipo === k ? ' on' : '') + (!tot ? ' zero' : '') + '" data-tipo="' + esc(k) + '" aria-pressed="' + (filtros.tipo === k) + '">' +
        '<span class="tipo-topo">' + (k ? tipoIcone(k, 'pq') : '<span class="tipo-ic pq"><svg class="ic"><use href="#i-list"/></svg></span>') + '<span class="tipo-rot">' + esc(rot) + '</span></span>' +
        '<b>' + tot + '</b><span class="tipo-sub">' + (leg ? '<em>' + leg + ' com prazo legal</em>' : tot ? 'sem prazo legal perto' : 'nenhuma') + '</span></button>';
    };
    const c = k => cartao(k, OC.TYPE_BY_KEY[k].label, l.filter(i => i.type === k));
    // aviso e cálculo andam juntos (férias e rescisão): um bloco só, com os dois cartões ligados por um elo
    const par = (a, b, rot) => '<div class="tipo-par fam-' + tipoVisual(a).fam + '" role="group" aria-label="' + esc(rot) + ': aviso e cálculo"><div class="tipo-par-cab"><span>' + esc(rot) + '</span><small>aviso + cálculo</small></div><div class="tipo-par-in">' + c(a) + '<span class="tipo-elo" aria-hidden="true"><svg class="ic"><use href="#i-elo"/></svg></span>' + c(b) + '</div></div>';
    $('#tipos', el).innerHTML = cartao('', 'Todos os tipos', l) + ['geral', 'cadEmpregado', 'cadContribuinte', 'cadEstagiario'].map(c).join('') +
      par('avisoFerias', 'calcFerias', 'Férias') + par('avisoRescisao', 'calcRescisao', 'Rescisão') + ['afastamento', 'rubricas'].map(c).join('');
    $$('[data-tipo]', el).forEach(b => b.onclick = () => { filtros.tipo = filtros.tipo === b.dataset.tipo ? '' : b.dataset.tipo; const s = $('#f-tipo', el); if (s) s.value = filtros.tipo; desenhar(); });
  };
  // Cartões de situação (cor própria por grupo): quantas há em cada situação, com os outros filtros aplicados
  const sits = () => {
    const l = filtrar({ semSit: true });
    $('#sits', el).innerHTML = OC.GRUPOS_SIT.map(g => {
      const tot = l.filter(i => OC.grupoSituacao(i).k === g.k).length;
      if (!tot && filtros.sit !== g.k && g.k === 'desconhecida') return '';
      return '<button type="button" class="sit-c g-' + g.k + (filtros.sit === g.k ? ' on' : '') + (!tot ? ' zero' : '') + '" data-sit="' + g.k + '" aria-pressed="' + (filtros.sit === g.k) + '"><i></i><span>' + esc(g.rot) + '</span><b>' + tot + '</b></button>';
    }).join('');
    $$('[data-sit]', el).forEach(b => b.onclick = () => { filtros.sit = filtros.sit === b.dataset.sit ? '' : b.dataset.sit; desenhar(); });
  };
  const chips = () => {
    const c = [];
    if (kpi) c.push(['kpi', 'Só: ' + kpi.rot]);
    if (motivo) c.push(['motivo', 'Só: ' + motivo.rot]);
    if (idade) c.push(['idade', 'Parada há ' + idade[1] + (idade[2] ? '–' + idade[2] : '+') + ' dias']);
    if (filtros.tipo) c.push(['tipo', OC.TYPE_BY_KEY[filtros.tipo].label]);
    if (filtros.sit) c.push(['sit', 'Situação: ' + OC.GRUPOS_SIT.find(g => g.k === filtros.sit).rot]);
    if (filtros.legal) c.push(['legal', 'Prazo legal perto']);
    if (filtros.resp) c.push(['resp', filtros.resp]);
    $('#ativos', el).innerHTML = c.map(([k, r]) => '<span class="chip-f">' + esc(r) + '<button data-tira="' + k + '" aria-label="Tirar filtro"><svg class="ic"><use href="#i-x"/></svg></button></span>').join('');
    const nf = ['tipo', 'legal', 'resp'].filter(k => filtros[k]).length;
    $('#n-filtros', el).textContent = nf || '';
    $('#b-filtros', el).classList.toggle('filtro-on', nf > 0);
    $$('[data-tira]', el).forEach(b => b.onclick = () => {
      if (b.dataset.tira === 'kpi' || b.dataset.tira === 'idade' || b.dataset.tira === 'motivo') { const p = Object.assign({}, params); delete p[b.dataset.tira]; ctx.navegar('fila', p); return; }
      filtros[b.dataset.tira] = ''; const s = $('#f-' + b.dataset.tira, el); if (s) s.value = ''; desenhar();
    });
  };
  // Grupos: por prioridade na ordem de prioridade e por empresa na ordem por empresa
  const grupoDe = i => ord.k === 'prio' ? (i.resolvida ? 'Consideradas resolvidas' : ROT_GRUPO[OC.motivoDe(i)]) : ord.k === 'cliente' ? (i.apelido || i.cliente || '—') : null;
  const desenhar = () => {
    const l = filtrar();
    tipos();
    sits();
    chips();
    $('#cont', el).textContent = l.length + (l.length === 1 ? ' solicitação' : ' solicitações');
    const vazio = '<div class="vazio">' + (!estado.snap ? '<b>Aguardando a primeira leitura do Onvio</b>' : base.length && l.length < base.length ? '<b>Nada aqui com esses filtros</b>Tire um filtro acima para ver mais.' : aba === 'respondidas' ? '<b>Nada esperando o cliente</b>Quando você responder e a vez passar ao cliente, a solicitação aparece aqui.' : '<b>Nada pendente aqui</b>Quando chegar solicitação, ela aparece sozinha.') + '</div>';
    const nGrupo = l.reduce((m, i) => { const g = grupoDe(i); if (g) m[g] = (m[g] || 0) + 1; return m; }, {});
    const comGrupos = (fn, cls) => { let ant = null; return l.map(i => { const g = grupoDe(i); const h = g && g !== ant ? '<div class="' + cls + (ord.k === 'prio' ? ' grp-' + (i.resolvida ? 'resolvida' : OC.motivoDe(i)) : '') + '"><b>' + esc(g) + '</b><span>' + nGrupo[g] + '</span></div>' : ''; ant = g; return h + fn(i); }).join(''); };
    const comCol = i => linha(i, cols);
    if (vis === 'cartoes') $('#corpo', el).innerHTML = l.length ? '<div class="cards-emp">' + comGrupos(cartaoItem, 'emp-cab') + '</div>' : '<div class="list-card">' + vazio + '</div>';
    else $('#corpo', el).innerHTML = '<div class="list-card" style="--cols:' + cols.map(c => c.w).join(' ') + '"><div class="lh" role="row">' +
      cols.map(c => '<button data-col="' + c.k + '" class="' + (c.num ? 'num ' : '') + (ord.k === c.k ? 'on' + (ord.desc ? '' : ' asc') : '') + '">' + c.rot + '</button>').join('') + '</div>' +
      (l.length ? comGrupos(comCol, 'emp-cab lr-emp') : vazio) + '</div>';
    ligarItens($('#corpo', el), l, ctx.abrirDetalhe);
    // responsável sugerido: abre a atribuição (você revisa e confirma), nunca atribui sozinho
    $$('[data-sug-resp]', el).forEach(b => {
      b.addEventListener('keydown', e => e.stopPropagation());
      b.addEventListener('click', e => {
        e.stopPropagation();
        const it = l.find(x => x.k === b.dataset.sugResp), s = sugResp.get(b.dataset.sugResp);
        if (it) ctx.abrirDetalhe(it, l, { acao: 'passar', preset: { modo: 'responsavel', analista: (s && s.respId) || '' } });
      });
    });
    $$('[data-col]', el).forEach(b => b.addEventListener('click', () => {
      ord = ord.k === b.dataset.col ? { k: ord.k, desc: !ord.desc } : { k: b.dataset.col, desc: DESC.includes(b.dataset.col) };
      const s = $('#f-ord', el); if (s && ORDENS.some(o => o[0] === ord.k)) s.value = ord.k; desenhar();
    }));
  };
  $('#f-texto', el).addEventListener('input', e => { filtros.texto = e.target.value; desenhar(); });
  $('#f-texto', el).addEventListener('keydown', e => { if (e.key === 'ArrowDown') { const p = $('#corpo [data-k]', el); if (p) { e.preventDefault(); p.focus(); } } });
  for (const k of ['tipo', 'legal', 'resp']) { const s = $('#f-' + k, el); if (s) s.addEventListener('change', e => { filtros[k] = e.target.value; desenhar(); }); }
  $('#f-limpar', el).onclick = () => { filtros.tipo = filtros.legal = filtros.sit = filtros.resp = ''; $$('.menu-list.form select', el).forEach(s => { s.value = ''; }); desenhar(); };
  $('#f-ok', el).onclick = () => { $('#m-filtros', el).open = false; };
  $('#f-ord', el).addEventListener('change', e => {
    ord = { k: e.target.value, desc: DESC.includes(e.target.value) };
    try { localStorage.setItem('controlonvio-fila-ord', ord.k); } catch (er) {}
    desenhar();
  });
  $$('[data-vis]', el).forEach(b => b.addEventListener('click', () => {
    vis = b.dataset.vis; try { localStorage.setItem('controlonvio-fila-vis', vis); } catch (e) {}
    $$('[data-vis]', el).forEach(x => x.classList.toggle('on', x === b)); desenhar();
  }));
  $('#csv', el).addEventListener('click', () => { csvItens('onvio-' + (aba || 'fila') + '-' + OC.ymd(new Date()) + '.csv', filtrar()); });
  $('#m-onvio', el).addEventListener('click', () => enviar({ cmd: 'fecharPainel' }));
  refazerFila = desenhar;
  desenhar();
  if (estado.snap && todas.some(i => !i.resp) && !sugLendo && Date.now() - sugEm > 10 * 60000) {
    sugLendo = true;
    enviar({ cmd: 'distribuicao', dias: 30 }).then(r => {
      sugLendo = false; sugEm = Date.now();
      if (r && r.ok && Array.isArray(r.sugestoes)) { sugResp = new Map(r.sugestoes.map(x => [x.item.k, x])); definirSugestoesResp(sugResp); }
      if (refazerFila && el.isConnected && location.hash.startsWith('#/fila')) refazerFila();
    });
  }
  if (params.foco) focar(params.foco);

  // Vindo do Hoje com uma solicitação escolhida (foco=k): tira os filtros da tela se ela estiver escondida, rola até a
  // linha e pisca um contorno vermelho. O foco sai do endereço, para não piscar de novo.
  function focar(k) {
    const achar = () => $$('#corpo [data-k]', el).find(r => r.dataset.k === k);
    if (!achar()) {
      filtros = { texto: '', tipo: '', legal: '', sit: '', resp: '' };
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

// Uma linha da lista: cliente e assunto juntos, sem repetir a vez (o título da lista já diz de quem é)
function linha(i, cols) {
  const cel = {
    num: '<span class="mono">#' + esc(i.num) + '</span>',
    tipo: '<span class="c-sub c-tipo" style="color:var(--ink-2)">' + tipoIcone(i.type, 'pq') + '<span class="c-tipo-tx">' + esc(i.typeLabel) + '</span></span>',
    cliente: '<span><div class="c-main" title="' + esc(i.cliente) + '">' + esc(i.apelido || i.cliente || '—') + '</div><div class="c-sub" title="' + esc(i.detalhe) + '">' + esc(i.detalhe || '—') + (i.abaProvavel ? ' · pode ser: ' + esc(i.abaProvavel.label) : '') + '</div></span>',
    status: '<span>' + pillSituacao(i) + '</span>',
    resp: '<span class="c-sub" style="color:var(--ink-2)">' + respHtml(i) + '</span>',
    parado: '<span class="num"><b class="mono">' + (i.parado || 0) + 'd</b><div class="c-sub">' + (i.last ? fmtDataCurta(i.last) : '') + '</div></span>',
    prazo: '<span>' + prazoHtml(i) + '</span>'
  };
  return '<div class="lr lvl-' + nivelLegal(i) + (i.resolvida ? ' resolvida' : '') + '" tabindex="0" data-k="' + esc(i.k) + '" role="row">' + (cols || COLUNAS).map(c => cel[c.k]).join('') + '</div>';
}

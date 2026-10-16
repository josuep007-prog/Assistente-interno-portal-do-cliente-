/* Hoje · no formato da tela Convenções do Departamento Pessoal (Control Hub).
 * Destaque: rosca "% em dia", quantas pedem atenção, carrossel (uma pendência por vez, com a bolinha da leitura ao vivo)
 * e "Próximos passos". Embaixo: situações (filtros) e cartões agrupados por situação. Carteira no cabeçalho.
 * A classificação é uma só (OC.motivoDe / OC.prioridades), para a rosca, as situações e os cartões baterem. */
import { estado, itens, minhas, primeiroNome, salvarLembretes } from '../estado.js';
import { esc, plural, num, ligarItens, fmtDataHora, saudacao, dataExtensa, normal, $, $$ } from '../util.js';
import { anel, anelProgresso, animarNumeros, ligarDicas, cor } from '../graficos.js';
import { estadoLeitura, dicaLeitura } from './painel-equipe.js';
const OC = window.OC;
const SEM = '(sem responsável)';
const MINHA = '__minha', EQUIPE = '__equipe';
const POR_GRUPO = 6;

let filtroSit = null;    // motivo escolhido nas situações ou na rosca; 'sem' = sem analista
let texto = '';
let vis = lerPref('hojeVis', 'cartoes');
let carteira = lerPref('hojeCarteira', '');

const corMotivo = Object.fromEntries(OC.MOTIVOS.map(m => [m.k, m.cor]));
const rotMotivo = Object.fromEntries(OC.MOTIVOS.map(m => [m.k, m.rot]));
const ICONE = { atraso: 'alert', prescreve: 'clock', hoje: 'clock', respondeu: 'chat', emdia: 'check', sem: 'user' };
const TAG = { atraso: 'Urgente', prescreve: 'Prescreve', hoje: 'Atenção', respondeu: 'Cliente respondeu', emdia: 'Em dia' };

function lerPref(k, padrao) { try { return localStorage.getItem('oc.' + k) || padrao; } catch { return padrao; } }
function gravarPref(k, v) { try { localStorage.setItem('oc.' + k, v); } catch { /* sem armazenamento: vale só nesta visita */ } }
const ic = (n, c) => '<svg class="ic' + (c ? ' ' + c : '') + '"><use href="#i-' + n + '"/></svg>';
const nomeCli = i => i.apelido || i.cliente || '—';

export function render(el, ctx) {
  const animar = !el.querySelector('.hj-hero');      // só ao chegar na tela, não a cada clique ou leitura
  const m = minhas(), todas = itens();
  const analistas = OC.porAnalista(todas).map(r => r.resp).filter(r => r !== SEM).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  // carteira: a escolhida (se ainda existe); sem escolha, a sua, ou a equipe quando nada está com você
  let cart = carteira;
  if (cart && cart !== MINHA && cart !== EQUIPE && cart !== SEM && !analistas.includes(cart)) cart = '';
  const automatica = !cart;
  if (!cart) cart = !m.length && todas.length ? EQUIPE : MINHA;
  const base = cart === MINHA ? m : cart === EQUIPE ? todas : todas.filter(i => (i.resp || SEM) === cart);
  const filtrar = qq => qq ? base.filter(i => normal([i.num, i.apelido, i.cliente, i.typeLabel, i.detalhe, i.resp, i.status].join(' ')).includes(qq)) : base;
  let q = normal(texto.trim()), naBusca = filtrar(q);
  const nome = primeiroNome();

  // números
  const cont = OC.contarMotivos(base);
  const total = base.length;
  const atencao = total - cont.emdia;
  const semN = base.filter(i => !i.resp).length;
  const pctDia = total ? Math.round(cont.emdia / total * 100) : 100;
  const fatias = OC.MOTIVOS.map(mo => ({ k: mo.k, rot: mo.rot, n: cont[mo.k], cor: mo.cor }));
  const prio = OC.prioridades(base);
  const lems = (estado.lembretes || []).filter(l => !l.feito && ['hoje', 'atrasado'].includes(OC.situacaoLembrete(l))).sort((a, b) => a.quando.localeCompare(b.quando));
  // aviso de férias/rescisão com o pagamento perto e sem o cálculo do mesmo empregado (OC.verificarAvisos)
  const semCalc = base.filter(i => i.semCalculo).sort((a, b) => a.semCalculo.faltam - b.semCalculo.faltam);

  const rotCart = cart === MINHA ? 'Minha carteira' + (nome ? ' · ' + nome : '') : cart === EQUIPE ? 'Equipe toda' : cart === SEM ? 'Sem analista' : 'Carteira de ' + cart;
  const opcoes = [[MINHA, 'Minha carteira (' + m.length + ')'], [EQUIPE, 'Equipe toda (' + todas.length + ')']]
    .concat(analistas.map(a => [a, a + ' (' + todas.filter(i => i.resp === a).length + ')']))
    .concat(todas.some(i => !i.resp) ? [[SEM, 'Sem analista (' + todas.filter(i => !i.resp).length + ')']] : []);
  const { extra } = ctx.cab({
    titulo: 'Hoje',
    sub: esc(saudacao() + (nome ? ', ' + nome : '') + ' · ' + dataExtensa()),
    extra: '<label class="hj-cart">Carteira <select id="hj-carteira" aria-label="Carteira">' + opcoes.map(([v, r]) => '<option value="' + esc(v) + '"' + (v === cart ? ' selected' : '') + '>' + esc(r) + '</option>').join('') + '</select></label>'
  });

  // aviso de uma linha, só quando preciso
  const aviso = estado.snap && !todas.length
    ? '<div class="aviso-linha late" id="ht-resumo">' + ic('alert') + '<span>A última leitura não trouxe nenhuma pendência em nenhuma das 10 listas. Se o Onvio mostra solicitações pendentes, abra <a href="#/config">Configurações</a> > Testar a leitura e envie o resultado.</span></div>'
    : automatica && cart === EQUIPE ? '<div class="aviso-linha" id="ht-resumo">' + ic('user') + '<span>Nenhuma pendência está com você como responsável no Onvio. Mostrando a equipe toda (' + plural(todas.length, 'pendência', 'pendências') + ').</span></div>' : '';

  el.innerHTML = aviso +
    '<div class="barra hj-barra">' +
      '<input type="search" id="hj-busca" placeholder="Buscar na carteira: ID, cliente, empregado, assunto…" value="' + esc(texto) + '" aria-label="Buscar na carteira">' +
      '<div class="seg" role="group" aria-label="Como mostrar"><button data-vis="cartoes"' + (vis === 'cartoes' ? ' class="on"' : '') + '>' + ic('grid') + ' Cartões</button><button data-vis="lista"' + (vis === 'lista' ? ' class="on"' : '') + '>' + ic('list') + ' Lista</button></div>' +
      '<span class="count fraco" id="hj-cont">' + plural(total, 'pendência', 'pendências') + (cart === EQUIPE && semN ? ' · ' + semN + ' sem analista' : '') + '</span>' +
      '<button class="btn btn-sm" id="ag-novo">' + ic('plus', 'ic-sm') + ' Lembrete</button>' +
    '</div>' +
    heroHtml() +
    semCalcHtml() +
    '<div class="hj-sits" role="group" aria-label="Filtrar por situação">' + sitsHtml() + '</div>' +
    '<div id="hj-cartoes">' + cartoesHtml() + '</div>';

  function heroHtml() {
    const slides = slidesDoCarrossel();
    const e = estadoLeitura(), dica = dicaLeitura(e);
    const titulo = !estado.snap ? 'Aguardando a primeira leitura do Onvio'
      : atencao ? '<em data-conta="' + atencao + '" data-de="0">' + num(atencao) + '</em> ' + (atencao === 1 ? 'solicitação pede' : 'solicitações pedem') + ' sua atenção'
      : total ? 'Tudo em dia ' + ic('check') : 'Nada pendente nesta carteira';
    const resumo = [plural(total, 'pendência', 'pendências'), base.filter(i => i.lado === 'esc').length + ' com o escritório', base.filter(i => i.lado === 'cli').length + ' com o cliente']
      .concat(semN && cart !== SEM ? ['<b class="t-sem">' + semN + ' sem analista</b>'] : []).join(' · ');
    return '<section class="hj-hero" style="--i:0">' +
      '<div class="hj-hero-g">' +
        '<div class="hj-donut" id="hj-donut">' + anel(fatias, { ativo: OC.MOTIVOS.some(x => x.k === filtroSit) ? filtroSit : null, rotulo: 'em dia', anima: animar, semLegenda: true, tam: 150, esp: 11, centro: { n: pctDia, de: animar ? 0 : pctDia, suf: '%' }, titulo: 'Pendências por situação (clique numa parte para filtrar)' }) + '</div>' +
        '<div class="hj-hero-tx">' +
          '<span class="hj-eyebrow">' + esc(rotCart) + (cart !== EQUIPE ? ' · <button type="button" class="linkish" data-cart="' + EQUIPE + '">ver equipe toda</button>' : '') + '</span>' +
          '<h2 id="hj-titulo">' + titulo + '</h2>' +
          '<p>' + resumo + '</p>' +
          '<div class="hj-tick ' + e + (slides.length < 2 ? ' uno' : '') + '" id="hj-tick" role="region" aria-label="Pendências, uma por vez" aria-live="off">' +
            '<span class="hj-bola" title="' + esc(dica) + '" aria-label="' + esc(dica) + '"></span>' +
            '<div class="hj-tick-palco">' + (slides.length ? slides.map((s, n) => '<button type="button" class="hj-tk n-' + s.n + (n === 0 ? ' on' : '') + '"' + (s.k ? ' data-k="' + esc(s.k) + '"' : ' data-lem="' + esc(s.lem) + '"') + (n ? ' tabindex="-1" aria-hidden="true"' : '') + ' style="--c:' + s.c + '"><span class="hj-tk-tag">' + esc(s.tag) + '</span><b>' + esc(s.txt) + '</b><small>' + esc(s.sub) + '</small></button>').join('') : '<span class="hj-tk on vazio"><b>' + (estado.snap ? 'Nenhuma pendência pedindo atenção agora.' : 'Aguardando a primeira leitura do Onvio.') + '</b></span>') + '</div>' +
            '<i class="hj-tick-relogio"><i></i></i>' +
          '</div>' +
          '<div class="hj-legenda">' + fatias.filter(f => f.n).map(f => '<span><i style="background:' + cor(f.cor) + '"></i>' + esc(f.rot) + ' <b>' + num(f.n) + '</b></span>').join('') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="hj-passos"><h3>Próximos passos</h3>' + passosHtml() + '</div>' +
    '</section>';
  }

  function semCalcHtml() {
    if (!semCalc.length) return '';
    const quando = f => f < 0 ? 'venceu há ' + plural(-f, 'dia útil', 'dias úteis') : f === 0 ? 'vence hoje' : 'vence em ' + plural(f, 'dia útil', 'dias úteis');
    const dt = ymd => ymd.slice(8, 10) + '/' + ymd.slice(5, 7);
    return '<section class="hj-semcalc" style="--i:1" aria-label="Avisos sem cálculo">' +
      '<h3>' + ic('alert', 'ic-sm') + ' Avisos sem cálculo <span>' + semCalc.length + '</span><small>Férias e rescisões com o pagamento perto e sem a solicitação de cálculo do mesmo empregado</small></h3>' +
      '<div class="hj-semcalc-l" id="hj-semcalc">' + semCalc.map(i => {
        const sc = i.semCalculo;
        return '<button type="button" class="hj-sc' + (sc.faltam <= 0 ? ' late' : '') + '" data-k="' + esc(i.k) + '">' +
          '<span class="hj-sc-quando"><b>' + esc(dt(sc.alvo)) + '</b><small>' + esc(quando(sc.faltam)) + '</small></span>' +
          '<span class="hj-sc-tx"><b>#' + esc(i.num) + ' ' + esc(nomeCli(i)) + ' · ' + esc(i.detalhe || i.typeLabel) + '</b>' +
          '<small>' + esc(i.typeLabel) + ' sem ' + esc(sc.calculo) + ' · pagamento até ' + esc(dt(sc.alvo)) + ' (' + esc(sc.ref) + ')' + (cart === MINHA ? '' : ' · ' + esc(i.resp || 'sem analista')) + '</small></span>' +
          ic('chev-r', 'ic-sm') + '</button>';
      }).join('') + '</div></section>';
  }

  function slidesDoCarrossel() {
    const out = [];
    lems.filter(l => OC.situacaoLembrete(l) === 'atrasado').forEach(l => out.push({ n: 'lem', tag: 'Lembrete atrasado', txt: l.texto, sub: fmtDataHora(l.quando) + (l.num ? ' · #' + l.num + ' ' + (l.cliente || '') : ''), lem: l.id, c: 'var(--late)' }));
    prio.filter(p => p.motivo !== 'emdia').slice(0, 12).forEach(p => {
      const i = p.item;
      out.push({ n: p.motivo, tag: TAG[p.motivo], txt: '#' + i.num + ' ' + nomeCli(i) + ': ' + OC.acaoDe(i, p.motivo).toLowerCase(), sub: [i.typeLabel, i.detalhe, cart === MINHA ? '' : (i.resp || 'sem analista')].filter(Boolean).join(' · '), k: i.k, c: cor(corMotivo[p.motivo]) });
    });
    lems.filter(l => OC.situacaoLembrete(l) === 'hoje').forEach(l => out.push({ n: 'lem', tag: 'Lembrete de hoje', txt: l.texto, sub: fmtDataHora(l.quando), lem: l.id, c: 'var(--blue-deep)' }));
    return out;
  }

  function passosHtml() {
    let n = 2;
    const li = [];
    lems.forEach(l => {
      const atr = OC.situacaoLembrete(l) === 'atrasado', h = new Date(l.quando);
      li.push('<li style="--i:' + (n++) + '"><div class="hj-step n-lem' + (atr ? ' late' : '') + '" tabindex="0" data-ag="lembrete|' + esc(l.id) + '"><i></i><span><b>' + esc(l.texto) + '</b><small>' + (atr ? 'Lembrete atrasado · ' + fmtDataHora(l.quando) : 'Lembrete · ' + String(h.getHours()).padStart(2, '0') + ':' + String(h.getMinutes()).padStart(2, '0')) + (l.rep && l.rep !== 'nao' ? ' · ' + esc(OC.REPETICOES[l.rep]) : '') + (l.num ? ' · #' + esc(l.num) + ' ' + esc(l.cliente) : '') + '</small></span><button class="btn btn-sm" data-feito title="Marcar como feito">' + ic('check', 'ic-sm') + ' Feito</button></div></li>');
    });
    prio.filter(p => p.motivo !== 'emdia').slice(0, 8).forEach(p => {
      const i = p.item;
      li.push('<li style="--i:' + (n++) + '"><div class="hj-step" tabindex="0" data-k="' + esc(i.k) + '" style="--c:' + cor(corMotivo[p.motivo]) + '"><i></i><span><b>' + esc(OC.acaoDe(i, p.motivo)) + '</b><small>#' + esc(i.num) + ' ' + esc(nomeCli(i)) + ' · ' + esc(i.typeLabel) + (cart === MINHA ? '' : ' · ' + esc(i.resp || 'sem analista')) + '</small></span>' + ic('chev-r', 'ic-sm') + '</div></li>');
    });
    return li.length ? '<ol class="hj-passos-l" id="hj-passos">' + li.join('') + '</ol>' : '<div class="hj-zen">' + ic('check') + '<span>Nenhuma ação pendente. Bom trabalho!</span></div>';
  }

  function sitsHtml() {
    const lista = OC.MOTIVOS.map(mo => ({ k: mo.k, rot: mo.rot, n: cont[mo.k], c: cor(mo.cor) }))
      .concat(cart === EQUIPE ? [{ k: 'sem', rot: 'Sem analista', n: semN, c: 'var(--ink-3)' }] : []);
    return lista.map((s, n) => '<button type="button" class="hj-sit' + (filtroSit === s.k ? ' on' : '') + (!s.n ? ' zero' : '') + (s.k === 'sem' ? ' s-sem' : '') + '" style="--i:' + (n + 1) + ';--c:' + s.c + '" data-sit="' + s.k + '" aria-pressed="' + (filtroSit === s.k) + '"><i class="hj-sit-dot"></i><span class="hj-sit-l">' + esc(s.rot) + '</span><b data-conta="' + s.n + '" data-de="' + (animar ? 0 : s.n) + '">' + num(s.n) + '</b></button>').join('');
  }

  // grupos de cartões: sem filtro, os que pedem atenção; com filtro, só o escolhido
  function grupos() {
    const comMotivo = naBusca.map(i => ({ item: i, motivo: OC.motivoDe(i) }));
    const ordem = OC.prioridades(naBusca).map(p => p.item.k);
    const pos = k => { const n = ordem.indexOf(k); return n < 0 ? 1e6 : n; };
    if (filtroSit === 'sem') return [{ k: 'sem', rot: 'Sem analista', c: 'var(--ink-3)', itens: comMotivo.filter(x => !x.item.resp).sort((a, b) => pos(a.item.k) - pos(b.item.k)) }];
    return OC.MOTIVOS.filter(mo => filtroSit ? mo.k === filtroSit : mo.k !== 'emdia').map(mo => ({
      k: mo.k, rot: mo.rot, c: cor(mo.cor),
      itens: comMotivo.filter(x => x.motivo === mo.k).sort((a, b) => pos(a.item.k) - pos(b.item.k) || (b.item.parado || 0) - (a.item.parado || 0))
    })).filter(g => g.itens.length);
  }
  function linkFila(k) {
    const p = {};
    if (cart === EQUIPE) p.escopo = 'equipe'; else if (cart === SEM) p.escopo = 'semresp'; else if (cart !== MINHA) p.analista = cart;
    if (k === 'sem') p.escopo = 'semresp'; else if (k) p.motivo = k;
    return '#/fila' + (Object.keys(p).length ? '?' + new URLSearchParams(p) : '');
  }
  function cartoesHtml() {
    const gs = grupos();
    if (!gs.length) {
      const msg = !estado.snap ? 'Aguardando a primeira leitura do Onvio.' : q || filtroSit ? 'Nada com esse filtro.' : total ? 'Nenhuma pendência pedindo atenção. As em dia estão em "Em dia", acima.' : 'Nada pendente nesta carteira.';
      return '<div class="hj-zen big">' + ic(q || filtroSit ? 'search' : 'check') + '<span>' + msg + '</span></div>';
    }
    let n = 7;
    return gs.map(g => '<section class="hj-sec" style="--c:' + g.c + '" data-grupo="' + g.k + '"><h3>' + ic(ICONE[g.k], 'ic-sm') + ' ' + esc(g.rot) + ' <span>' + g.itens.length + '</span>' +
      (g.itens.length > POR_GRUPO ? '<a class="hj-sec-mais" href="' + linkFila(g.k) + '">Ver todas as ' + g.itens.length + ' na fila ' + ic('chev-r', 'ic-sm') + '</a>' : '') + '</h3>' +
      (vis === 'lista'
        ? '<div class="card hj-lista">' + g.itens.slice(0, POR_GRUPO * 2).map(x => linhaHtml(x)).join('') + '</div>'
        : '<div class="hj-grade">' + g.itens.slice(0, POR_GRUPO).map(x => cartaoHtml(x, n++)).join('') + '</div>') +
      '</section>').join('');
  }
  function cartaoHtml(x, n) {
    const i = x.item, mo = x.motivo, pg = OC.progressoPrazo(i, estado.settings), c = cor(corMotivo[mo]);
    const tend = i.tend === 'nova' ? '<span class="nova-t">NOVA</span>' : i.tend === 'piorou' ? '<span class="sobe" title="Piorou desde a leitura anterior">▲</span>' : '';
    const terceira = i.lado === 'cli' && i.prescreveEm != null ? ['Prescreve em', plural(i.prescreveEm, 'dia', 'dias')] : ['Responsável', i.resp || 'sem analista'];
    return '<article class="hj-card" style="--i:' + n + ';--c:' + c + '" tabindex="0" data-k="' + esc(i.k) + '" aria-label="' + esc('#' + i.num + ' ' + nomeCli(i)) + '">' +
      '<header><span class="hj-chip">' + ic(ICONE[mo], 'ic-sm') + ' ' + esc(rotMotivo[mo]) + '</span>' + tend + '<span class="spacer"></span><span class="mono hj-num">#' + esc(i.num) + '</span></header>' +
      '<div class="hj-card-id">' + anelProgresso(pg.pct, '<b>' + pg.dias + '</b><small>' + (pg.dias === 1 ? 'dia' : 'dias') + '</small>') +
        '<div><h4 title="' + esc(i.cliente) + '">' + esc(nomeCli(i)) + '</h4><div class="hj-sub">' + esc([i.typeLabel, i.detalhe].filter(Boolean).join(' · ')) + '</div>' +
        '<div class="hj-lim">parada ' + pg.dias + ' de ' + pg.limite + ' d · ' + (i.lado === 'cli' ? 'prescrição' : 'limite de parada') + '</div></div></div>' +
      '<dl class="hj-stats"><div><dt>Situação</dt><dd>' + esc(i.status || '—') + '</dd></div><div><dt>Vez</dt><dd>' + (i.lado === 'esc' ? 'Escritório' : i.lado === 'cli' ? 'Cliente' : '—') + '</dd></div><div><dt>' + terceira[0] + '</dt><dd>' + esc(terceira[1]) + '</dd></div></dl>' +
      '<footer class="hj-cta">' + ic(mo === 'emdia' ? 'check' : 'chev-r', 'ic-sm') + '<span>' + esc(OC.acaoDe(i, mo)) + '</span></footer>' +
    '</article>';
  }
  function linhaHtml(x) {
    const i = x.item, mo = x.motivo;
    const tag = mo === 'prescreve' && i.prescreveEm != null ? 'Prescreve em ' + i.prescreveEm + ' d' : mo === 'emdia' ? 'Parada há ' + (i.parado || 0) + ' d' : rotMotivo[mo];
    return '<div class="prio m-' + mo + '" tabindex="0" data-k="' + esc(i.k) + '">' +
      '<span class="pr-tag">' + esc(tag) + '</span><span class="mono pr-num">#' + esc(i.num) + '</span>' +
      '<span class="pr-tx"><b>' + esc(nomeCli(i)) + '</b><small>' + esc([i.typeLabel, i.detalhe].filter(Boolean).join(' · ')) + '</small></span>' +
      '<span class="pr-resp">' + (i.resp ? esc(i.resp) : '<span class="today">sem analista</span>') + '</span>' +
      '<span class="mono pr-d">' + (i.parado || 0) + 'd' + (i.tend === 'piorou' ? ' <span class="sobe">▲</span>' : i.tend === 'nova' ? ' <span class="nova-t">NOVA</span>' : '') + '</span></div>';
  }

  // ---------- interações ----------
  const visiveis = () => $$('#hj-cartoes [data-k]', el).map(r => base.find(i => i.k === r.dataset.k)).filter(Boolean);
  const ligarCartoes = () => { const v = visiveis(); ligarItens($('#hj-cartoes', el), v, ctx.abrirDetalhe); };
  const redesenhar = () => render(el, ctx);
  ligarCartoes();
  ligarItens($('#hj-passos', el) || document.createElement('div'), prio.map(p => p.item), ctx.abrirDetalhe);
  ligarItens($('#hj-tick', el), base, ctx.abrirDetalhe);
  if ($('#hj-semcalc', el)) ligarItens($('#hj-semcalc', el), semCalc, ctx.abrirDetalhe);
  ligarDicas(el);
  if (animar) { el.classList.remove('hj-anim'); void el.offsetWidth; el.classList.add('hj-anim'); setTimeout(() => el.classList.remove('hj-anim'), 1600); animarNumeros(el); }
  iniciarCarrossel($('#hj-tick', el));
  marcarRolagem($('#hj-passos', el));

  $$('[data-motivo], [data-sit]', el).forEach(b => b.addEventListener('click', () => { const k = b.dataset.motivo || b.dataset.sit; filtroSit = filtroSit === k ? null : k; redesenhar(); }));
  $$('[data-cart]', el).forEach(b => b.addEventListener('click', () => trocarCarteira(b.dataset.cart)));
  $('#hj-carteira', extra).addEventListener('change', e => trocarCarteira(e.target.value));
  function trocarCarteira(v) { carteira = v; gravarPref('hojeCarteira', v); if (filtroSit === 'sem' && v !== EQUIPE) filtroSit = null; redesenhar(); }
  $('#hj-busca', el).addEventListener('input', e => {
    texto = e.target.value; q = normal(texto.trim()); naBusca = filtrar(q);
    $('#hj-cartoes', el).innerHTML = cartoesHtml();     // só os cartões mudam: a busca não perde o foco
    ligarCartoes();
  });
  $$('[data-vis]', el).forEach(b => b.addEventListener('click', () => { vis = b.dataset.vis; gravarPref('hojeVis', vis); redesenhar(); }));
  $('#ag-novo', el).onclick = () => ctx.abrirLembrete({ dia: new Date() });
  $$('[data-ag]', el).forEach(d => {
    const id = d.dataset.ag.split('|')[1];
    const abrir = ev => {
      const l = estado.lembretes.find(x => x.id === id);
      if (!l) return;
      if (ev.target.closest('[data-feito]')) { ev.stopPropagation(); salvarLembretes(estado.lembretes.map(x => x.id === id ? OC.concluirLembrete(x, new Date(), estado.settings.feriados) : x)); return; }
      if (l.type && l.num) ctx.abrirDetalhe(l); else ctx.abrirLembrete({ l });
    };
    d.addEventListener('click', abrir);
    d.addEventListener('keydown', e => { if (e.key === 'Enter') abrir(e); });
  });
  $$('[data-lem]', el).forEach(b => b.addEventListener('click', () => { const l = estado.lembretes.find(x => x.id === b.dataset.lem); if (l) (l.type && l.num ? ctx.abrirDetalhe(l) : ctx.abrirLembrete({ l })); }));
}

// Carrossel: uma pendência por vez. A barra invisível é o relógio (5 s por volta); passar o mouse ou focar pausa.
function iniciarCarrossel(raiz) {
  if (!raiz) return;
  const sl = $$('.hj-tk', raiz);
  if (sl.length < 2) return;
  const ir = () => {
    const at = sl.findIndex(x => x.classList.contains('on')), prox = (at + 1) % sl.length;
    sl.forEach((x, n) => { x.classList.toggle('on', n === prox); x.classList.toggle('sai', n === at); x.tabIndex = n === prox ? 0 : -1; x.setAttribute('aria-hidden', String(n !== prox)); });
  };
  $('.hj-tick-relogio i', raiz).addEventListener('animationiteration', () => { if (!document.hidden && raiz.isConnected) ir(); });
}
// Próximos passos: o esmaecido embaixo só aparece quando a lista passa da caixa.
function marcarRolagem(lst) {
  if (!lst) return;
  const marca = () => {
    const ult = lst.lastElementChild, conteudo = ult ? ult.offsetTop + ult.offsetHeight : 0, cab = lst.clientHeight;
    const passa = conteudo - cab > 2;
    lst.classList.toggle('rola', passa);
    lst.classList.toggle('fim', !passa || lst.scrollTop + cab >= conteudo - 2);
    lst.classList.toggle('topo', passa && lst.scrollTop > 2);
  };
  marca(); lst.addEventListener('scroll', marca, { passive: true }); setTimeout(marca, 1700);
}

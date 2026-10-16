/* Hoje · visão do dia (o trabalho com as solicitações em si fica em "Solicitações", #/fila).
 * Em cima, em destaque: admissões retroativas ou perto do início (o eSocial vence no dia anterior).
 * Destaque: rosca "% em dia" (clique leva às Solicitações com aquele motivo), carrossel e "Próximos passos".
 * Painéis: vencimentos de férias e rescisões (prazo legal), avisos sem cálculo, sugestões de ação, uso do portal
 * pelo cliente e previsão de solicitações por empresa (lida na hora, sob demanda). Carteira no cabeçalho. */
import { estado, itens, minhas, primeiroNome, salvarLembretes, enviar } from '../estado.js';
import { esc, plural, num, ligarItens, fmtDataHora, saudacao, dataExtensa, $, $$ } from '../util.js';
import { anel, anelProgresso, animarNumeros, ligarDicas, cor } from '../graficos.js';
import { estadoLeitura, dicaLeitura } from './painel-equipe.js';
const OC = window.OC;
const SEM = '(sem responsável)';
const MINHA = '__minha', EQUIPE = '__equipe';
let previsao = null, previsaoEm = 0, previsaoLendo = false;   // previsão por empresa: na memória por 30 min, nunca gravada
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

  const admissoes = OC.admissoesCriticas(base);
  const vencs = OC.vencimentosLegais(base, estado.settings, new Date());
  const uso = OC.malUso(base, estado.settings);
  const sugs = OC.sugestoesAcoes(base, { semCalculo: semCalc, admissoes, vencimentos: vencs });
  const linkFila = p => '#/fila?' + new URLSearchParams(Object.assign(cart === EQUIPE ? { escopo: 'equipe' } : cart === SEM ? { escopo: 'semresp' } : cart !== MINHA ? { analista: cart } : {}, p));

  el.innerHTML = aviso + admissoesHtml() + heroHtml() +
    '<div class="hj-paineis">' + vencHtml() + semCalcHtml() + sugHtml() + usoHtml() + prevHtml() + '</div>';

  // Admissões: faixa bem destacada no topo
  function admissoesHtml() {
    if (!admissoes.length) return '';
    const quando = a => a.retro ? 'retroativa' : a.faltam < 0 ? 'já passou' : a.faltam === 0 ? 'hoje' : a.faltam === 1 ? 'amanhã' : 'em ' + a.faltam + ' dias úteis';
    const dt = ymd => ymd.slice(8, 10) + '/' + ymd.slice(5, 7);
    return '<section class="hj-admissao" id="hj-admissao" role="alert">' +
      '<h3>' + ic('alert') + ' ' + plural(admissoes.length, 'admissão pede', 'admissões pedem') + ' prioridade <small>O eSocial precisa ser enviado até o dia anterior ao início. Admissão retroativa já está fora do prazo.</small></h3>' +
      '<div class="hj-adm-l">' + admissoes.map(i => { const a = i.admissaoAlerta; return '<button type="button" class="hj-adm' + (a.retro || a.faltam <= 0 ? ' late' : '') + '" data-k="' + esc(i.k) + '">' +
        '<span class="hj-adm-d"><b>' + esc(dt(a.data)) + '</b><small>' + esc(quando(a)) + '</small></span>' +
        '<span class="hj-adm-tx"><b>#' + esc(i.num) + ' ' + esc(nomeCli(i)) + ' · ' + esc(i.detalhe || i.typeLabel) + '</b><small>' + esc(i.typeLabel) + ' · ' + esc(i.status) + ' · ' + esc(i.resp || 'sem analista') + '</small></span>' + ic('chev-r', 'ic-sm') + '</button>'; }).join('') + '</div></section>';
  }

  function painel(id, titulo, sub, corpo, extra) {
    return '<section class="hj-painel" id="' + id + '"><header><h3>' + titulo + '</h3>' + (extra || '') + '</header>' + (sub ? '<p class="hj-painel-sub">' + sub + '</p>' : '') + corpo + '</section>';
  }
  function vazio(t) { return '<div class="hj-painel-vazio">' + ic('check', 'ic-sm') + ' ' + esc(t) + '</div>'; }
  function dtc(ymd) { return ymd.slice(8, 10) + '/' + ymd.slice(5, 7); }

  function vencHtml() {
    const quando = f => f < 0 ? 'venceu' : f === 0 ? 'hoje' : f === 1 ? 'amanhã' : 'em ' + f + ' d.u.';
    return painel('hj-venc', ic('calendar', 'ic-sm') + ' Vencimentos de férias e rescisões', 'Prazo legal de pagamento: férias até 2 dias antes do início; rescisão até 10 dias após o desligamento.',
      vencs.length ? '<div class="hj-mini-l">' + vencs.slice(0, 8).map(v => '<button type="button" class="hj-mini' + (v.faltam <= 1 ? ' late' : '') + '" data-k="' + esc(v.item.k) + '"><b class="hj-mini-q">' + esc(dtc(v.alvo)) + '<small>' + esc(quando(v.faltam)) + '</small></b><span><b>' + esc(nomeCli(v.item)) + ' · ' + esc(v.item.detalhe || '') + '</b><small>' + esc(v.item.typeLabel) + ' · ' + esc(v.ref || '') + '</small></span></button>').join('') + '</div>' +
        (vencs.length > 8 ? '<a class="hj-painel-mais" href="' + linkFila({ kpi: 'pagamento' }) + '">Ver as que vencem em até 1 dia útil</a>' : '')
        : vazio('Nenhum pagamento de férias ou rescisão vencendo nos próximos ' + (estado.settings.tempoOcupado || 5) * 2 + ' dias úteis.'));
  }

  function sugHtml() {
    return painel('hj-sug', ic('chat', 'ic-sm') + ' Sugestões de ação', '',
      sugs.length ? '<ol class="hj-sug-l">' + sugs.map(x => '<li><a href="' + esc(x.k === 'semresp' || x.k === 'semcalc' ? x.link : x.link.replace('escopo=equipe', cart === MINHA ? 'escopo=minhas' : 'escopo=equipe')) + '"><b>' + num(x.n) + '</b><span>' + esc(x.texto) + '</span>' + ic('chev-r', 'ic-sm') + '</a></li>').join('') + '</ol>'
        : vazio('Nada pedindo ação agora.'));
  }

  function usoHtml() {
    return painel('hj-uso', ic('building', 'ic-sm') + ' Uso do portal pelo cliente', 'Empresas com sinais de uso errado do portal: lista errada, pedido repetido, solicitação abandonada.',
      uso.length ? '<div class="hj-uso-l">' + uso.slice(0, 6).map(u => '<a class="hj-uso" href="' + esc('#/fila?' + new URLSearchParams({ escopo: 'equipe', cliente: u.cliente })) + '"><b>' + esc(u.apelido || u.cliente) + '</b><small>' + esc(u.motivos.join(' · ')) + '</small></a>').join('') + '</div>'
        : vazio('Nenhum sinal de uso errado nas pendências desta carteira.'));
  }

  function prevHtml() {
    const fresca = previsao && Date.now() - previsaoEm < 30 * 60000;
    const seta = t => t === 'sobe' ? '<span class="sobe" title="Mais pedidos nas 2 últimas semanas">▲</span>' : t === 'desce' ? '<span class="desce" title="Menos pedidos nas 2 últimas semanas">▼</span>' : '';
    let corpo;
    if (!fresca && !previsaoLendo) corpo = '<div class="hj-painel-vazio"><button class="btn btn-sm" id="hj-prev-ler">' + ic('refresh', 'ic-sm') + ' Calcular a previsão</button><small>Lê as solicitações abertas nas últimas 4 semanas (todas as listas).</small></div>';
    else if (!fresca) corpo = '<div class="hj-painel-vazio">Lendo as últimas 4 semanas no Onvio…</div>';
    else if (previsao.erro) corpo = '<div class="hj-painel-vazio">Não foi possível ler: ' + esc(previsao.erro) + '</div>';
    else corpo = '<p class="hj-prev-tot">Escritório: <b>' + num(previsao.total) + '</b> abertas em 4 semanas · estimativa de <b>' + num(previsao.prox30) + '</b> nos próximos 30 dias</p>' +
      '<table class="hj-prev"><thead><tr><th>Empresa</th><th>Por semana</th><th>Próx. 7 dias</th><th>Próx. 30 dias</th><th>Mais pedidos</th></tr></thead><tbody>' +
      previsao.empresas.slice(0, 10).map(e => '<tr><td>' + esc(e.apelido || e.cliente) + '</td><td class="num">' + String(e.porSemana).replace('.', ',') + '</td><td class="num">' + e.prox7 + '</td><td class="num"><b>' + e.prox30 + '</b> ' + seta(e.tendencia) + '</td><td class="fraco">' + esc(e.tipos.map(t => t.tipo).join(', ')) + '</td></tr>').join('') + '</tbody></table>';
    return painel('hj-prev', ic('list', 'ic-sm') + ' Previsão de solicitações por empresa', 'Estimativa simples pela média das últimas 4 semanas, pesando mais as 2 mais recentes.', corpo,
      fresca ? '<button class="icon-btn" id="hj-prev-ler" title="Recalcular" aria-label="Recalcular">' + ic('refresh', 'ic-sm') + '</button>' : '');
  }

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
        '<div class="hj-donut" id="hj-donut">' + anel(fatias, { ativo: null, rotulo: 'em dia', anima: animar, semLegenda: true, tam: 150, esp: 11, centro: { n: pctDia, de: animar ? 0 : pctDia, suf: '%' }, titulo: 'Pendências por situação (clique numa parte para ver em Solicitações)' }) + '</div>' +
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
      '<div class="hj-passos"><h3>Próximos passos <button class="btn btn-sm" id="ag-novo">' + ic('plus', 'ic-sm') + ' Lembrete</button></h3>' + passosHtml() + '</div>' +
    '</section>';
  }

  function semCalcHtml() {
    if (!semCalc.length) return painel('hj-semcalc-v', ic('alert', 'ic-sm') + ' Avisos sem cálculo', 'Férias e rescisões com o pagamento perto e sem a solicitação de cálculo do mesmo empregado.', vazio('Nenhum aviso de férias ou rescisão sem cálculo perto do prazo.'));
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

  // ---------- interações ----------
  const redesenhar = () => render(el, ctx);
  ligarItens($('#hj-passos', el) || document.createElement('div'), prio.map(p => p.item), ctx.abrirDetalhe);
  ligarItens($('#hj-tick', el), base, ctx.abrirDetalhe);
  if ($('#hj-semcalc', el)) ligarItens($('#hj-semcalc', el), semCalc, ctx.abrirDetalhe);
  if ($('#hj-admissao', el)) ligarItens($('#hj-admissao', el), admissoes, ctx.abrirDetalhe);
  if ($('#hj-venc .hj-mini-l', el)) ligarItens($('#hj-venc', el), vencs.map(v => v.item), ctx.abrirDetalhe);
  // previsão por empresa: calcula sozinha ao abrir (no máximo a cada 30 min); o botão recalcula
  // só o painel da previsão é trocado quando ela chega (o resto da tela e as faixas de aviso ficam)
  const trocarPrevisao = () => { const sec = $('#hj-prev', el); if (sec && el.isConnected) { sec.outerHTML = prevHtml(); ligarPrevisao(); } };
  const lerPrevisao = () => {
    previsaoLendo = true; previsao = null; previsaoEm = 0;
    enviar({ cmd: 'previsao' }).then(r => { previsaoLendo = false; previsao = r.ok && Array.isArray(r.empresas) ? r : { erro: r.erro || 'resposta inesperada do Control Onvio' }; previsaoEm = Date.now(); trocarPrevisao(); });
  };
  function ligarPrevisao() { if ($('#hj-prev-ler', el)) $('#hj-prev-ler', el).onclick = () => { lerPrevisao(); trocarPrevisao(); }; }
  ligarPrevisao();
  if (estado.snap && !previsaoLendo && (!previsao || Date.now() - previsaoEm > 30 * 60000)) { lerPrevisao(); const pv = $('#hj-prev .hj-painel-vazio', el); if (pv) pv.textContent = 'Lendo as últimas 4 semanas no Onvio…'; }
  ligarDicas(el);
  if (animar) { el.classList.remove('hj-anim'); void el.offsetWidth; el.classList.add('hj-anim'); setTimeout(() => el.classList.remove('hj-anim'), 1600); animarNumeros(el); }
  iniciarCarrossel($('#hj-tick', el));
  marcarRolagem($('#hj-passos', el));

  // rosca: leva às Solicitações com aquele motivo, na mesma carteira
  $$('[data-motivo]', el).forEach(b => b.addEventListener('click', () => { location.hash = linkFila({ motivo: b.dataset.motivo }); }));
  $$('[data-cart]', el).forEach(b => b.addEventListener('click', () => trocarCarteira(b.dataset.cart)));
  $('#hj-carteira', extra).addEventListener('change', e => trocarCarteira(e.target.value));
  function trocarCarteira(v) { carteira = v; gravarPref('hojeCarteira', v); redesenhar(); }
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

/* Hoje · visão do dia (o trabalho com as solicitações em si fica em "Solicitações", #/fila).
 * Destaque: rosca "% em dia" (clique leva às Solicitações com aquele motivo), carrossel e "Próximos passos".
 * Logo abaixo, recolhível: admissões retroativas ou perto do início sem nenhum trâmite do escritório (o eSocial
 * vence no dia anterior).
 * Sugestões de ação: solicitações específicas que parecem resolvidas fora do portal (vez do escritório sem resposta
 * há mais de 30 dias ou trâmite que diz isso), duplicadas, na lista errada ou com falta de informação; cada uma com o
 * trâmite já preenchido (revisar e confirmar) e "Não é o caso". Os trâmites são conferidos pelo cmd 'casos'.
 * Painel de previsão de solicitações por empresa (lida na hora, sob demanda). Os painéis de vencimentos e de uso do
 * portal saíram na 0.29.0 (o prazo legal já sobe na fila). O quadro de avisos sem cálculo saiu em 22/10/2026. Carteira no cabeçalho. */
import { estado, itens, minhas, primeiroNome, salvarLembretes, enviar, ignorarSugestao, resolvidas } from '../estado.js';
import { esc, plural, num, ligarItens, fmtDataHora, saudacao, dataExtensa, toast, $, $$ } from '../util.js';
import { anel, anelProgresso, animarNumeros, ligarDicas, cor } from '../graficos.js';
import { estadoLeitura, dicaLeitura } from './painel-equipe.js';
const OC = window.OC;
const SEM = '(sem responsável)';
const MINHA = '__minha', EQUIPE = '__equipe';
let previsao = null, previsaoEm = 0, previsaoLendo = false;   // previsão por empresa: na memória por 30 min, nunca gravada
let carteira = lerPref('hojeCarteira', '');
// Sugestões de ação: vereditos lidos nos trâmites (cmd 'casos'), na memória por 10 min; o texto nunca chega aqui
let casosLidos = null, casosEm = 0, casosLendo = false, casosErro = '', sugTodas = false;

const corMotivo = Object.fromEntries(OC.MOTIVOS.map(m => [m.k, m.cor]));
const rotMotivo = Object.fromEntries(OC.MOTIVOS.map(m => [m.k, m.rot]));
const ICONE = { legal: 'alert', sem: 'user', analise: 'clock', respondeu: 'chat', cliente: 'check' };
const TAG = { legal: 'Prazo legal', sem: 'Sem análise', analise: 'Em análise', respondeu: 'Cliente respondeu', cliente: 'Com o cliente' };

function lerPref(k, padrao) { try { return localStorage.getItem('oc.' + k) || padrao; } catch { return padrao; } }
function gravarPref(k, v) { try { localStorage.setItem('oc.' + k, v); } catch { /* sem armazenamento: vale só nesta visita */ } }
const ic = (n, c) => '<svg class="ic' + (c ? ' ' + c : '') + '"><use href="#i-' + n + '"/></svg>';
const nomeCli = i => i.apelido || i.cliente || '—';

// Quantas sugestões de ação há nas suas solicitações (com o que já foi lido nos trâmites; usado na bolinha do trilho)
export function contagemSugestoes() { return estado.snap ? OC.casosSugeridos(minhas().concat(resolvidas().filter(i => i.mine)), casosLidos, estado.settings, estado.sugIgnoradas).length : 0; }

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
  const atencao = total - cont.cliente;               // o que espera o escritório ou tem prazo legal
  const semN = base.filter(i => !i.resp).length;
  const pctDia = total ? Math.round((total - cont.legal) / total * 100) : 100;     // sem prazo legal em cima
  const fatias = OC.MOTIVOS.map(mo => ({ k: mo.k, rot: mo.rot, n: cont[mo.k], cor: mo.cor }));
  const prio = OC.prioridades(base);
  const lems = (estado.lembretes || []).filter(l => !l.feito && ['hoje', 'atrasado'].includes(OC.situacaoLembrete(l))).sort((a, b) => a.quando.localeCompare(b.quando));

  const rotCart = cart === MINHA ? 'Minha carteira' + (nome ? ' · ' + nome : '') : cart === EQUIPE ? 'Equipe toda' : cart === SEM ? 'Sem analista' : 'Carteira de ' + cart;
  const opcoes = [[MINHA, 'Minha carteira (' + m.length + ')'], [EQUIPE, 'Equipe toda (' + todas.length + ')']]
    .concat(analistas.map(a => [a, a + ' (' + todas.filter(i => i.resp === a).length + ')']))
    .concat(todas.some(i => !i.resp) ? [[SEM, 'Sem analista (' + todas.filter(i => !i.resp).length + ')']] : []);
  const { extra } = ctx.cab({
    titulo: 'Hoje',
    sub: esc(saudacao() + (nome ? ', ' + nome : '') + ' · ' + dataExtensa()),
    extra: '<button type="button" class="btn btn-sm btn-primary" id="hj-nova"><svg class="ic ic-sm"><use href="#i-plus"/></svg> Nova solicitação</button><label class="hj-cart">Carteira <select id="hj-carteira" aria-label="Carteira">' + opcoes.map(([v, r]) => '<option value="' + esc(v) + '"' + (v === cart ? ' selected' : '') + '>' + esc(r) + '</option>').join('') + '</select></label>'
  });

  // aviso de uma linha, só quando preciso
  const aviso = estado.snap && !todas.length
    ? '<div class="aviso-linha late" id="ht-resumo">' + ic('alert') + '<span>A última leitura não trouxe nenhuma pendência em nenhuma das 10 listas. Se o Onvio mostra solicitações pendentes, abra <a href="#/config">Configurações</a> > Testar a leitura e envie o resultado.</span></div>'
    : automatica && cart === EQUIPE ? '<div class="aviso-linha" id="ht-resumo">' + ic('user') + '<span>Nenhuma pendência está com você como responsável no Onvio. Mostrando a equipe toda (' + plural(todas.length, 'pendência', 'pendências') + ').</span></div>' : '';

  const admissoes = OC.admissoesCriticas(base);
  const resolvidasBase = resolvidas().filter(i => cart === MINHA ? i.mine : cart === EQUIPE ? true : (i.resp || SEM) === cart);
  const casos = OC.casosSugeridos(base.concat(resolvidasBase), casosLidos, estado.settings, estado.sugIgnoradas);
  const linkFila = p => '#/fila?' + new URLSearchParams(Object.assign(cart === EQUIPE ? { escopo: 'equipe' } : cart === SEM ? { escopo: 'semresp' } : cart !== MINHA ? { analista: cart } : {}, p));

  el.innerHTML = aviso + heroHtml() + admissoesHtml() +
    sugHtml() + '<div class="hj-paineis">' + prevHtml() + '</div>';

  // Admissões: faixa destacada logo abaixo do destaque, só as que o escritório ainda não tocou; recolhível (lembra a escolha)
  function admissoesHtml() {
    if (!admissoes.length) return '';
    // empregado: a data é o início (eSocial até o dia anterior); estagiário: a data é o prazo do eSocial (dias após o início)
    const quando = a => a.retro ? 'retroativa' : a.faltam < 0 ? 'já passou' : a.faltam === 0 ? 'hoje' : a.faltam === 1 ? 'amanhã' : 'em ' + a.faltam + ' dias úteis';
    const dt = ymd => ymd.slice(8, 10) + '/' + ymd.slice(5, 7);
    const dataDe = a => a.prazo || a.data;
    const recolhida = lerPref('hojeAdmRecolhida', '') === '1';
    const retro = admissoes.filter(i => i.admissaoAlerta.retro).length, passou = admissoes.filter(i => !i.admissaoAlerta.retro && i.admissaoAlerta.faltam < 0).length;
    const prox = admissoes.find(i => !i.admissaoAlerta.retro && i.admissaoAlerta.faltam >= 0);
    const resumo = [retro ? plural(retro, 'retroativa', 'retroativas') : '', passou ? passou + ' já ' + (passou === 1 ? 'passou' : 'passaram') : '', prox ? 'próxima em ' + dt(dataDe(prox.admissaoAlerta)) : ''].filter(Boolean).join(' · ');
    const estagio = admissoes.some(i => i.admissaoAlerta.estagio);
    return '<section class="hj-admissao' + (recolhida ? ' recolhida' : '') + '" id="hj-admissao" role="alert">' +
      // a barra de cabeçalho inteira recolhe e mostra (seta à esquerda, como nos painéis do Control Hub)
      '<button type="button" class="hj-adm-cab" id="hj-adm-toggle" aria-expanded="' + !recolhida + '" aria-controls="hj-adm-l" title="' + (recolhida ? 'Mostrar' : 'Recolher') + '">' +
        '<span class="hj-adm-seta">' + ic('chev-d', 'ic-sm') + '</span>' +
        '<h3>' + ic('alert') + ' ' + plural(admissoes.length, 'admissão pede', 'admissões pedem') + ' prioridade</h3>' +
        '<span class="hj-adm-resumo">' + esc(resumo) + '</span></button>' +
      '<div class="hj-adm-l" id="hj-adm-l"' + (recolhida ? ' hidden' : '') + '>' +
        '<p class="hj-adm-nota">Sem nenhum trâmite do escritório ainda. O eSocial do empregado precisa ser enviado até o dia anterior ao início; admissão retroativa já está fora do prazo.' + (estagio ? ' Estagiário: até ' + estado.settings.estagiarioPrazoDias + ' dias depois do início (a data no cartão é esse prazo).' : '') + '</p>' +
        '<div class="hj-adm-grade">' + admissoes.map(i => { const a = i.admissaoAlerta; return '<button type="button" class="hj-adm' + (a.retro || a.faltam <= 0 ? ' late' : '') + '" data-k="' + esc(i.k) + '">' +
        '<span class="hj-adm-d"><b>' + esc(dt(dataDe(a))) + '</b><small>' + esc((a.estagio ? 'prazo · ' : '') + quando(a)) + '</small></span>' +
        '<span class="hj-adm-tx"><b>#' + esc(i.num) + ' ' + esc(nomeCli(i)) + ' · ' + esc(i.detalhe || i.typeLabel) + '</b><small>' + esc(i.typeLabel) + (a.estagio ? ' · início em ' + dt(a.data) : '') + ' · ' + esc(i.status) + ' · ' + esc(i.resp || 'sem analista') + '</small></span>' + ic('chev-r', 'ic-sm') + '</button>'; }).join('') + '</div></div></section>';
  }

  function painel(id, titulo, sub, corpo, extra) {
    return '<section class="hj-painel" id="' + id + '"><header><h3>' + titulo + '</h3>' + (extra || '') + '</header>' + (sub ? '<p class="hj-painel-sub">' + sub + '</p>' : '') + corpo + '</section>';
  }
  function vazio(t) { return '<div class="hj-painel-vazio">' + ic('check', 'ic-sm') + ' ' + esc(t) + '</div>'; }
  function dtc(ymd) { return ymd.slice(8, 10) + '/' + ymd.slice(5, 7); }

  // Sugestões de ação: solicitações específicas que parecem resolvidas fora do portal, abertas errado ou com falta de
  // informação do cliente. Um botão abre o detalhe já no trâmite preenchido (revisar e confirmar); "⋯" tem "Não é o caso".
  function sugHtml() {
    const MAX = 6, lista = sugTodas ? casos : casos.slice(0, MAX);
    const porTipo = Object.keys(OC.CASOS).map(t => [t, casos.filter(c => c.tipo === t).length]).filter(([, n]) => n);
    const hora = casosEm ? new Date(casosEm).toTimeString().slice(0, 5) : '';
    const situacao = casosLendo ? 'Conferindo os trâmites…' : casosErro ? 'Não deu para ler os trâmites: ' + casosErro : hora ? 'Trâmites conferidos às ' + hora : '';
    const linha = c => {
      const i = c.item;
      return '<div class="cs-l cs-' + c.tipo + '">' +
        '<button type="button" class="cs-abre" data-k="' + esc(i.k) + '" title="' + esc(c.porque) + '"><span class="cs-tag">' + esc(c.rot) + '</span>' +
          '<span class="cs-tx"><b>#' + esc(i.num) + ' ' + esc(nomeCli(i)) + ' · ' + esc(i.detalhe || i.typeLabel) + '</b>' +
          '<small>' + esc(c.porque) + ' · ' + esc(i.typeLabel) + (cart === MINHA ? '' : ' · ' + esc(i.resp || 'sem analista')) + '</small></span></button>' +
        '<div class="cs-acoes">' + (c.pode.ok
          ? '<button type="button" class="btn btn-sm btn-primary" data-cs-acao="' + esc(i.k) + '" title="' + (c.acao.lembrete ? 'Cria um lembrete pessoal na Agenda (nada é enviado ao Onvio)' : 'Abre o trâmite já preenchido: você revisa e confirma') + '">' + esc(c.botao) + '</button>'
          : '<button type="button" class="btn btn-sm" data-k="' + esc(i.k) + '" title="' + esc(c.pode.motivo) + '">Abrir</button>') +
          '<details class="menu sc-mais"><summary class="icon-btn" aria-label="Mais ações" title="Mais ações">' + ic('more', 'ic-sm') + '</summary><div class="menu-list">' +
            '<button type="button" class="menu-item" data-k="' + esc(i.k) + '">' + ic('eye', 'ic-sm') + ' Ver a solicitação</button>' +
            '<button type="button" class="menu-item" data-cs-ignorar="' + esc(i.k) + '">' + ic('x', 'ic-sm') + ' Não é o caso</button></div></details>' +
        '</div></div>';
    };
    return painel('hj-sug', ic('chat', 'ic-sm') + ' Sugestões de ação' + (casos.length ? ' <span class="sc-n">' + casos.length + '</span>' : ''),
      'Solicitações que parecem resolvidas fora do portal, paradas com o cliente há mais de duas semanas, abertas errado, férias novas e avisos de rescisão trabalhados. A ação abre o trâmite já preenchido (você revisa e confirma) ou cria um lembrete seu.',
      (porTipo.length ? '<p class="cs-resumo">' + porTipo.map(([t, n]) => '<span class="cs-' + t + '"><i></i>' + esc(OC.CASOS[t].rot) + ' <b>' + n + '</b></span>').join('') + '</p>' : '') +
      (casos.length ? '<div class="cs-lista">' + lista.map(linha).join('') + '</div>' +
        (casos.length > MAX ? '<button type="button" class="hj-painel-mais linkish" id="hj-sug-mais">' + (sugTodas ? 'Mostrar menos' : 'Ver todas as ' + casos.length) + '</button>' : '')
        : vazio(casosLendo && !casosLidos ? 'Conferindo os trâmites das pendências…' : 'Nenhuma sugestão de ação por enquanto.')) +
      (situacao ? '<p class="hj-painel-nota" id="hj-sug-sit">' + esc(situacao) + '</p>' : ''),
      '<button class="icon-btn" id="hj-sug-ler" title="Conferir os trâmites de novo" aria-label="Conferir os trâmites de novo"' + (casosLendo ? ' disabled' : '') + '>' + ic('refresh', 'ic-sm') + '</button>');
  }

  function prevHtml() {
    const fresca = previsao && Date.now() - previsaoEm < 30 * 60000;
    const seta = t => t === 'sobe' ? '<span class="sobe" title="Mais pedidos nas 2 últimas semanas">▲</span>' : t === 'desce' ? '<span class="desce" title="Menos pedidos nas 2 últimas semanas">▼</span>' : '';
    let corpo;
    if (!fresca && !previsaoLendo) corpo = '<div class="hj-painel-vazio"><button class="btn btn-sm" id="hj-prev-ler">' + ic('refresh', 'ic-sm') + ' Calcular a previsão</button><small>Lê as solicitações abertas nas últimas 4 semanas (todas as listas).</small></div>';
    else if (!fresca) corpo = '<div class="hj-painel-vazio">Lendo as últimas 4 semanas no Onvio…</div>';
    else if (previsao.erro) corpo = '<div class="hj-painel-vazio">Não foi possível ler: ' + esc(previsao.erro) + '</div>';
    else corpo = '<p class="hj-prev-tot">Escritório: <b>' + num(previsao.total) + '</b> abertas em 4 semanas · estimativa de <b>' + num(previsao.prox30) + '</b> nos próximos 30 dias</p>' +
      '<table class="hj-prev"><thead><tr><th>Empresa</th><th class="num">Por semana</th><th class="num">Próx. 7 dias</th><th class="num">Próx. 30 dias</th><th>Mais pedidos</th></tr></thead><tbody>' +
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

  function slidesDoCarrossel() {
    const out = [];
    lems.filter(l => OC.situacaoLembrete(l) === 'atrasado').forEach(l => out.push({ n: 'lem', tag: 'Lembrete atrasado', txt: l.texto, sub: fmtDataHora(l.quando) + (l.num ? ' · #' + l.num + ' ' + (l.cliente || '') : ''), lem: l.id, c: 'var(--late)' }));
    prio.slice(0, 12).forEach(p => {
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
    prio.slice(0, 8).forEach(p => {
      const i = p.item;
      li.push('<li style="--i:' + (n++) + '"><div class="hj-step" tabindex="0" data-k="' + esc(i.k) + '" style="--c:' + cor(corMotivo[p.motivo]) + '"><i></i><span><b>' + esc(OC.acaoDe(i, p.motivo)) + '</b><small>#' + esc(i.num) + ' ' + esc(nomeCli(i)) + ' · ' + esc(i.typeLabel) + (cart === MINHA ? '' : ' · ' + esc(i.resp || 'sem analista')) + '</small></span>' + ic('chev-r', 'ic-sm') + '</div></li>');
    });
    return li.length ? '<ol class="hj-passos-l" id="hj-passos">' + li.join('') + '</ol>' : '<div class="hj-zen">' + ic('check') + '<span>Nenhuma ação pendente. Bom trabalho!</span></div>';
  }

  // ---------- interações ----------
  const redesenhar = () => render(el, ctx);
  ligarItens($('#hj-passos', el) || document.createElement('div'), prio.map(p => p.item), ctx.abrirDetalhe);
  ligarItens($('#hj-tick', el), base, ctx.abrirDetalhe);
  if ($('#hj-admissao', el)) ligarItens($('#hj-adm-l', el), admissoes, ctx.abrirDetalhe);
  if ($('#hj-adm-toggle', el)) $('#hj-adm-toggle', el).onclick = () => {
    const sec = $('#hj-admissao', el), rec = !sec.classList.contains('recolhida');
    gravarPref('hojeAdmRecolhida', rec ? '1' : '');
    sec.classList.toggle('recolhida', rec);
    $('#hj-adm-l', el).hidden = rec;
    $('#hj-adm-toggle', el).setAttribute('aria-expanded', String(!rec));
    $('#hj-adm-toggle', el).title = rec ? 'Mostrar' : 'Recolher';
  };
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
  // sugestões de ação: confere os trâmites sozinha ao abrir (no máximo a cada 10 min); só o painel é trocado na volta
  const trocarSug = () => { const sec = $('#hj-sug', el); if (sec && el.isConnected) { const casosNovos = OC.casosSugeridos(base.concat(resolvidasBase), casosLidos, estado.settings, estado.sugIgnoradas); casos.splice(0, casos.length, ...casosNovos); sec.outerHTML = sugHtml(); ligarSug(); } };
  const lerCasos = () => {
    casosLendo = true; casosErro = '';
    enviar({ cmd: 'casos' }).then(r => {
      casosLendo = false; casosEm = Date.now();
      if (r.ok && r.analises) casosLidos = r.analises; else casosErro = r.erro || 'resposta inesperada do Control Onvio';
      trocarSug();
    });
  };
  function ligarSug() {
    const sec = $('#hj-sug', el);
    if (!sec) return;
    ligarItens(sec, casos.map(c => c.item), ctx.abrirDetalhe);
    $$('.sc-mais', sec).forEach(d => d.addEventListener('click', e => e.stopPropagation()));
    $$('[data-cs-acao]', sec).forEach(b => b.addEventListener('click', async e => {
      e.stopPropagation();
      const c = casos.find(x => x.k === b.dataset.csAcao);
      if (!c) return;
      if (c.acao.lembrete) {                                       // aviso trabalhado: lembrete pessoal, sem escrever no Onvio
        const l = c.acao.lembrete;
        salvarLembretes((estado.lembretes || []).concat([OC.novoLembrete({ texto: l.texto, quando: l.quando, k: l.k, type: l.type, num: l.num, cliente: l.cliente }, new Date())]));
        await ignorarSugestao(c.k, c.item);
        toast('Lembrete criado para ' + l.dia + ' às 9h (veja na Agenda)');
        return;
      }
      ctx.abrirDetalhe(c.item, null, { acao: 'tramite', preset: { texto: c.acao.texto, situacao: c.acao.situacao, antes: c.acao.antes } });
    }));
    $$('[data-cs-ignorar]', sec).forEach(b => b.addEventListener('click', async e => {
      e.stopPropagation();
      const m = b.closest('details'); if (m) m.open = false;
      const c = casos.find(x => x.k === b.dataset.csIgnorar);
      if (!c) return;
      await ignorarSugestao(c.k, c.item);
      toast('Saiu das sugestões. Volta se a solicitação mexer.');
    }));
    if ($('#hj-sug-mais', sec)) $('#hj-sug-mais', sec).onclick = () => { sugTodas = !sugTodas; trocarSug(); };
    if ($('#hj-sug-ler', sec)) $('#hj-sug-ler', sec).onclick = () => { lerCasos(); trocarSug(); };
  }
  ligarSug();
  if (estado.snap && !casosLendo && (!casosLidos || Date.now() - casosEm > 10 * 60000)) { lerCasos(); trocarSug(); }
  ligarDicas(el);
  if (animar) { el.classList.remove('hj-anim'); void el.offsetWidth; el.classList.add('hj-anim'); setTimeout(() => el.classList.remove('hj-anim'), 1600); animarNumeros(el); }
  iniciarCarrossel($('#hj-tick', el));
  marcarRolagem($('#hj-passos', el));

  // rosca: leva às Solicitações com aquele motivo, na mesma carteira
  $$('[data-motivo]', el).forEach(b => b.addEventListener('click', () => { location.hash = linkFila({ motivo: b.dataset.motivo }); }));
  $$('[data-cart]', el).forEach(b => b.addEventListener('click', () => trocarCarteira(b.dataset.cart)));
  $('#hj-carteira', extra).addEventListener('change', e => trocarCarteira(e.target.value));
  $('#hj-nova', extra).onclick = () => ctx.abrirNova({});
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

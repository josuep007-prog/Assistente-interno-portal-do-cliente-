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
import { esc, plural, num, ligarItens, fmtDataHora, saudacao, dataExtensa, toast, toastAcao, $, $$, lerPref, gravarPref, simples } from '../util.js';
import { anel, anelProgresso, animarNumeros, ligarDicas, cor } from '../graficos.js';
import { estadoLeitura, dicaLeitura } from './painel-equipe.js';
import { tiposHtml, subPorMotivo } from './tipos.js';
import { abrirFoco } from './foco-sug.js';
import { abrirLote } from './lote-dlg.js';
const OC = window.OC;
const SEM = '(sem responsável)';
const MINHA = '__minha', EQUIPE = '__equipe';
let previsao = null, previsaoEm = 0, previsaoLendo = false;   // previsão por empresa: na memória por 30 min, nunca gravada
let carteira = lerPref('hojeCarteira', '');
// Sugestões de ação: vereditos lidos nos trâmites (cmd 'casos'), na memória por 10 min; o texto nunca chega aqui
let casosLidos = null, casosEm = 0, casosLendo = false, casosErro = '';

// Painéis do Hoje que se recolhem (Simplificado): a escolha fica neste navegador; a Previsão por empresa começa recolhida
const recolhidosLidos = () => { try { return JSON.parse(lerPref('hojeRecolhidos', '{}')); } catch { return {}; } };
const recolhido = id => { const r = recolhidosLidos(); return id in r ? !!r[id] : id === 'hj-prev'; };
const gravarRecolhido = (id, rec) => gravarPref('hojeRecolhidos', JSON.stringify(Object.assign(recolhidosLidos(), { [id]: rec })));

// Sugestões de ação: lista única com filtro por categoria (lembrado neste navegador) e rolagem (todas na lista, sem "Ver todas"); ordem do que depende do
// escritório (orientar, pôr em análise, pedir) para a limpeza (concluir sem retorno, resolvida fora)
let filtroSug = lerPref('hojeSugFiltro', '');
const PRIO_SUG = ['abaErrada', 'feriasNova', 'rescisaoNova', 'falta', 'anexo', 'duplicada', 'avisoTrabalhado', 'fora', 'semRetorno'];

let casosAtuais = [];      // as sugestões da última tela desenhada (o modo foco lê daqui, para saber o que já saiu)

const corMotivo = Object.fromEntries(OC.MOTIVOS.map(m => [m.k, m.cor]));
const rotMotivo = Object.fromEntries(OC.MOTIVOS.map(m => [m.k, m.rot]));
const ICONE = { legal: 'alert', sem: 'user', analise: 'clock', respondeu: 'chat', cliente: 'check' };
const TAG = { legal: 'Prazo legal', sem: 'Sem análise', analise: 'Em análise', respondeu: 'Cliente respondeu', cliente: 'Com o cliente' };

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
  casosAtuais = casos;
  const linkFila = p => '#/fila?' + new URLSearchParams(Object.assign(cart === EQUIPE ? { escopo: 'equipe' } : cart === SEM ? { escopo: 'semresp' } : cart !== MINHA ? { analista: cart } : {}, p));

  el.innerHTML = aviso + heroHtml() + admissoesHtml() + tiposPainel() +
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

  // Simplificado: o painel vira uma barra recolhível (como a das admissões), com a explicação na dica e a escolha lembrada neste navegador
  function painel(id, titulo, sub, corpo, extra, resumo) {
    if (simples()) {
      const rec = recolhido(id);
      return '<section class="hj-painel hj-rec' + (rec ? ' recolhida' : '') + '" id="' + id + '"><header class="hj-rec-cab">' +
        '<button type="button" class="hj-rec-tg" data-rec="' + id + '" aria-expanded="' + !rec + '" aria-controls="' + id + '-c" title="' + esc(sub || '') + '"><span class="hj-adm-seta">' + ic('chev-d', 'ic-sm') + '</span><h3>' + titulo + '</h3>' + (resumo ? '<span class="hj-adm-resumo">' + esc(resumo) + '</span>' : '') + '</button>' + (extra || '') + '</header>' +
        '<div class="hj-rec-corpo" id="' + id + '-c"' + (rec ? ' hidden' : '') + '>' + corpo + '</div></section>';
    }
    return '<section class="hj-painel" id="' + id + '"><header><h3>' + titulo + '</h3>' + (extra || '') + '</header>' + (sub ? '<p class="hj-painel-sub">' + sub + '</p>' : '') + corpo + '</section>';
  }
  function ligarRec(raiz) {
    $$('[data-rec]', raiz).forEach(b => b.onclick = () => {
      const sec = b.closest('.hj-rec'), rec = !sec.classList.contains('recolhida');
      gravarRecolhido(b.dataset.rec, rec);
      sec.classList.toggle('recolhida', rec); $('.hj-rec-corpo', sec).hidden = rec; b.setAttribute('aria-expanded', String(!rec));
    });
  }
  function vazio(t) { return '<div class="hj-painel-vazio">' + ic('check', 'ic-sm') + ' ' + esc(t) + '</div>'; }
  function dtc(ymd) { return ymd.slice(8, 10) + '/' + ymd.slice(5, 7); }

  // Sugestões de ação: solicitações específicas que parecem resolvidas fora do portal, abertas errado ou com falta de
  // informação do cliente. Um botão abre o detalhe já no trâmite preenchido (revisar e confirmar); "⋯" tem "Não é o caso".
  // O que o botão vai fazer, para mostrar antes do clique (dica do botão e modo foco): situação e texto do trâmite, ou o lembrete
  function previa(c, html) {
    if (c.acao.lembrete) return html ? '<div class="fo-prev"><div class="fo-prev-cab">Cria um lembrete pessoal na Agenda</div><div class="fo-prev-tx">' + esc(c.acao.lembrete.texto) + ' · ' + esc(c.acao.lembrete.dia) + ' às 9h</div><small>Nada é enviado ao Onvio.</small></div>'
      : 'Cria um lembrete pessoal na Agenda (' + c.acao.lembrete.dia + ' às 9h). Nada é enviado ao Onvio.';
    const sit = (OC.situacoesTramite(c.item).find(x => String(x.code) === String(c.acao.situacao)) || {}).rot || '';
    const texto = OC.preencherModelo(c.acao.texto, OC.variaveisTramite(c.item, null, estado.settings, new Date(), primeiroNome()));
    const passos = (c.acao.antes || []).length ? 'em ' + (c.acao.antes.length + 1) + ' passos (' + c.acao.antes.map(x => x.rot).join(', ') + ' e depois ' + (sit || 'a situação final') + ')' : '';
    if (!html) return 'Abre o trâmite já preenchido para você revisar e confirmar' + (sit ? '. Situação: ' + sit : '') + (passos ? ', ' + passos : '') + '. Texto: “' + (texto.length > 220 ? texto.slice(0, 220) + '…' : texto) + '”';
    return '<div class="fo-prev"><div class="fo-prev-cab">Vai enviar' + (sit ? ' · situação <b>' + esc(sit) + '</b>' : '') + (passos ? ' · ' + esc(passos) : '') + '</div>' +
      '<div class="fo-prev-tx">' + esc(texto) + '</div>' +
      '<small>' + (/\{\w+\}/.test(texto) ? 'Os campos entre chaves são preenchidos ao abrir, com os dados lidos no Onvio. ' : '') + 'Você revisa e confirma antes de enviar.</small></div>';
  }
  function ordemSug() { return casos.slice().sort((x, y) => (PRIO_SUG.indexOf(x.tipo) + 1 || 99) - (PRIO_SUG.indexOf(y.tipo) + 1 || 99) || (y.item.parado || 0) - (x.item.parado || 0)); }

  function sugHtml() {
    const grupos = OC.agruparSugestoes(casos);
    const cats = grupos.slice().sort((x, y) => (PRIO_SUG.indexOf(x.tipo) + 1 || 99) - (PRIO_SUG.indexOf(y.tipo) + 1 || 99));
    const f = cats.some(g => g.tipo === filtroSug) ? filtroSug : '';
    const hora = casosEm ? new Date(casosEm).toTimeString().slice(0, 5) : '';
    const situacao = casosLendo ? 'Conferindo os trâmites…' : casosErro ? 'Não deu para ler os trâmites: ' + casosErro : hora ? 'Trâmites conferidos às ' + hora : '';
    const lista = ordemSug().filter(c => !f || c.tipo === f);
    // filtro por categoria, com a contagem
    const chips = '<div class="sg-filtros" role="group" aria-label="Filtrar sugestões">' +
      '<button type="button" class="sg-chip' + (!f ? ' on' : '') + '" data-sg-f="" aria-pressed="' + !f + '">Todas <b>' + casos.length + '</b></button>' +
      cats.map(g => '<button type="button" class="sg-chip cs-' + g.tipo + (f === g.tipo ? ' on' : '') + '" data-sg-f="' + esc(g.tipo) + '" aria-pressed="' + (f === g.tipo) + '"><i></i>' + esc(g.rot) + ' <b>' + g.casos.length + '</b></button>').join('') + '</div>';
    // em lote: com uma categoria escolhida, uma ação por tipo de solicitação (você revisa a lista e confirma)
    const g = f && cats.find(x => x.tipo === f);
    const lotes = g ? g.porTipo.filter(t => t.lote.ok) : [];
    const barraLote = g ? '<div class="sg-lote">' + (lotes.length
      ? '<span>Fazer de uma vez:</span>' + lotes.map(t => '<button type="button" class="btn btn-sm btn-primary sug-lote" data-cs-lote="' + esc(g.tipo + '|' + t.type) + '" title="' + (g.lembrete ? 'Cria um lembrete para cada uma' : 'Abre a lista para você revisar e confirmar: um trâmite para cada solicitação marcada') + '">' + esc(g.botao) + ' · ' + esc(t.typeLabel) + ' (' + t.lote.n + ')</button>').join('')
      : '<span class="fraco">' + (g.casos.length > 1 ? 'Em lote indisponível: ' + esc((g.porTipo.find(t => t.casos.length > 1 && !t.lote.ok) || { lote: { motivo: 'uma de cada tipo' } }).lote.motivo || 'uma de cada tipo') : 'Só uma nesta categoria.') + '</span>') + '</div>'
      : cats.some(x => x.porTipo.some(t => t.lote.ok)) ? '<p class="sg-dica">Escolha uma categoria acima para fazer as de mesmo tipo de uma vez.</p>' : '';
    const linha = c => {
      const i = c.item;
      return '<div class="cs-l sg-l cs-' + c.tipo + '">' +
        '<i class="sg-pt" aria-hidden="true"></i>' +
        '<button type="button" class="cs-abre" data-k="' + esc(i.k) + '" title="' + esc(c.porque) + '">' +
          '<span class="cs-tx"><b>#' + esc(i.num) + ' ' + esc(nomeCli(i)) + ' · ' + esc(i.detalhe || i.typeLabel) + '</b>' +
          '<small><span class="sg-cat">' + esc(c.rot.replace(/\?$/, '')) + '</span> · ' + esc(i.typeLabel) + ' · ' + esc(c.curto || c.porque) + (cart === MINHA ? '' : ' · ' + esc(i.resp || 'sem analista')) + '</small></span></button>' +
        '<div class="cs-acoes">' + (c.pode.ok
          ? '<button type="button" class="btn btn-sm sg-fazer" data-cs-acao="' + esc(i.k) + '" title="' + esc(previa(c)) + '">' + esc(c.botao) + '</button>'
          : '<button type="button" class="btn btn-sm" data-k="' + esc(i.k) + '" title="' + esc(c.pode.motivo) + '">Abrir</button>') +
          '<button type="button" class="icon-btn sg-nao" data-cs-ignorar="' + esc(i.k) + '" title="Não é o caso (sai das sugestões; volta se a solicitação mexer)" aria-label="Não é o caso">' + ic('x', 'ic-sm') + '</button>' +
        '</div></div>';
    };
    return painel('hj-sug', ic('chat', 'ic-sm') + ' Sugestões de ação' + (casos.length ? ' <span class="sc-n">' + casos.length + '</span>' : ''),
      'Uma lista só, do que depende do escritório para a limpeza. Filtre por categoria para fazer as de mesmo tipo de uma vez, ou revise uma a uma. A ação abre o trâmite já preenchido (você revisa e confirma) ou cria um lembrete seu.',
      (casos.length ? chips + barraLote + '<div class="sg-lista">' + lista.map(linha).join('') + '</div>'
        : vazio(casosLendo && !casosLidos ? 'Conferindo os trâmites das pendências…' : 'Nenhuma sugestão de ação por enquanto.')) +
      (situacao && (!simples() || casosErro) ? '<p class="hj-painel-nota" id="hj-sug-sit">' + esc(situacao) + '</p>' : ''),
      (casos.length ? '<button type="button" class="btn btn-sm" id="hj-sug-foco" title="Uma sugestão por vez, com o que será enviado (← → para andar)">' + ic('eye', 'ic-sm') + ' Revisar uma a uma</button>' : '') +
      '<button class="icon-btn" id="hj-sug-ler" title="' + esc('Conferir os trâmites de novo' + (simples() && situacao ? ' · ' + situacao : '')) + '" aria-label="Conferir os trâmites de novo"' + (casosLendo ? ' disabled' : '') + '>' + ic('refresh', 'ic-sm') + '</button>');
  }

  function prevHtml() {
    const fresca = previsao && Date.now() - previsaoEm < 30 * 60000;
    const seta = t => t === 'sobe' ? '<span class="sobe" title="Mais pedidos nas 2 últimas semanas">▲</span>' : t === 'desce' ? '<span class="desce" title="Menos pedidos nas 2 últimas semanas">▼</span>' : '';
    let corpo;
    if (!fresca && !previsaoLendo) corpo = '<div class="hj-painel-vazio"><button class="btn btn-sm" id="hj-prev-ler">' + ic('refresh', 'ic-sm') + ' Calcular a previsão</button><small>Lê as solicitações abertas nas últimas 4 semanas (todas as listas).</small></div>';
    else if (!fresca) corpo = '<div class="hj-painel-vazio">Lendo as últimas 4 semanas no Onvio…</div>';
    else if (previsao.erro) corpo = '<div class="hj-painel-vazio">Não foi possível ler: ' + esc(previsao.erro) + '</div>';
    else corpo = '<p class="hj-prev-tot">Escritório: <b>' + num(previsao.total) + '</b> abertas em 4 semanas · estimativa de <b>' + num(previsao.prox30) + '</b> nos próximos 30 dias</p>' +
      '<div class="hj-prev-rola"><table class="hj-prev"><thead><tr><th>Empresa</th><th class="num">Por semana</th><th class="num">Próx. 7 dias</th><th class="num">Próx. 30 dias</th><th>Mais pedidos</th></tr></thead><tbody>' +
      previsao.empresas.map(e => '<tr><td>' + esc(e.apelido || e.cliente) + '</td><td class="num">' + String(e.porSemana).replace('.', ',') + '</td><td class="num">' + e.prox7 + '</td><td class="num"><b>' + e.prox30 + '</b> ' + seta(e.tendencia) + '</td><td class="fraco">' + esc(e.tipos.map(t => t.tipo).join(', ')) + '</td></tr>').join('') + '</tbody></table></div>';
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

  // Solicitações por tipo: os cartões das Solicitações, do tipo mais urgente para o menos urgente. O clique abre a lista
  // daquele tipo (na aba onde estão: Minhas, ou Respondidas quando só há solicitações na vez do cliente).
  function tiposPainel() {
    if (!base.length) return '';
    return painel('hj-tipos', ic('layers', 'ic-sm') + ' Solicitações por tipo', 'Da mais urgente para a menos urgente. Clique para abrir as Solicitações daquele tipo.',
      '<div class="tipos" id="hj-tipos-l" role="group" aria-label="Solicitações por tipo">' + tiposHtml(base, { prioridade: true, sub: subPorMotivo }) + '</div>', '',
      plural(new Set(base.map(i => i.type)).size, 'tipo com pendência', 'tipos com pendência'));
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
    prio.forEach(p => {
      const i = p.item;
      li.push('<li style="--i:' + (n++) + '"><div class="hj-step" tabindex="0" data-k="' + esc(i.k) + '" style="--c:' + cor(corMotivo[p.motivo]) + '"><i></i><span><b>' + esc(OC.acaoDe(i, p.motivo)) + '</b><small>#' + esc(i.num) + ' ' + esc(nomeCli(i)) + ' · ' + esc(i.typeLabel) + (cart === MINHA ? '' : ' · ' + esc(i.resp || 'sem analista')) + '</small></span>' + ic('chev-r', 'ic-sm') + '</div></li>');
    });
    return li.length ? '<ol class="hj-passos-l" id="hj-passos">' + li.join('') + '</ol>' : '<div class="hj-zen">' + ic('check') + '<span>Nenhuma ação pendente. Bom trabalho!</span></div>';
  }

  // ---------- interações ----------
  const redesenhar = () => render(el, ctx);
  ligarItens($('#hj-passos', el) || document.createElement('div'), prio.map(p => p.item), ctx.abrirDetalhe);
  ligarItens($('#hj-tick', el), base, ctx.abrirDetalhe);
  $$('#hj-tipos-l [data-tipo]', el).forEach(b => b.onclick = () => {
    const xs = base.filter(i => i.type === b.dataset.tipo);
    const soCliente = xs.length && xs.every(i => i.lado === 'cli');
    location.hash = linkFila(Object.assign({ tipo: b.dataset.tipo }, soCliente && cart === MINHA ? { escopo: 'respondidas' } : {}));
  });
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
  function ligarPrevisao() { ligarRec($('#hj-prev', el) || document.createElement('div')); if ($('#hj-prev-ler', el)) $('#hj-prev-ler', el).onclick = () => { lerPrevisao(); trocarPrevisao(); }; }
  ligarPrevisao();
  if (estado.snap && !previsaoLendo && (!previsao || Date.now() - previsaoEm > 30 * 60000)) { lerPrevisao(); const pv = $('#hj-prev .hj-painel-vazio', el); if (pv) pv.textContent = 'Lendo as últimas 4 semanas no Onvio…'; }
  // sugestões de ação: confere os trâmites sozinha ao abrir (no máximo a cada 10 min); só o painel é trocado na volta
  const trocarSug = (noTopo) => { const sec = $('#hj-sug', el); if (sec && el.isConnected) { const rol = noTopo ? 0 : ($('.sg-lista', sec) || {}).scrollTop || 0; const casosNovos = OC.casosSugeridos(base.concat(resolvidasBase), casosLidos, estado.settings, estado.sugIgnoradas); casos.splice(0, casos.length, ...casosNovos); sec.outerHTML = sugHtml(); ligarSug(); const nova = $('#hj-sug .sg-lista', el); if (nova) nova.scrollTop = rol; } };
  const lerCasos = () => {
    casosLendo = true; casosErro = '';
    enviar({ cmd: 'casos' }).then(r => {
      casosLendo = false; casosEm = Date.now();
      if (r.ok && r.analises) casosLidos = r.analises; else casosErro = r.erro || 'resposta inesperada do Control Onvio';
      trocarSug();
    });
  };
  // Sugestão em lote: uma só janela, uma confirmação; depois cada solicitação recebe o trâmite (ou o lembrete) uma de cada vez
  function abrirLoteDe(g, t) {
    const cs = t.lote.itens, porK = new Map(cs.map(c => [c.k, c]));
    // rótulo da situação como ela estará no momento do passo (depois do 1º passo a lista oferece outras situações)
    const rotSit = (c, cod) => { const ant = (c.acao.antes || []).slice(-1)[0], x = OC.situacoesTramite(ant ? Object.assign({}, c.item, { code: Number(ant.situacao) }) : c.item).find(y => String(y.code) === String(cod)); return x ? x.rot : 'situação ' + cod; };
    const c0 = cs[0];
    const textos = new Set(cs.map(c => c.acao.texto));
    let resumo;
    if (g.lembrete) resumo = '<p>Um lembrete pessoal na Agenda para cada solicitação marcada, no dia útil antes do aviso prévio (ou no próximo dia útil, quando a data do aviso não foi lida).</p>';
    else {
      const passos = (c0.acao.antes || []).map(a => '<li>1º passo, situação <b>' + esc(a.rot) + '</b>: “' + esc(a.texto) + '”</li>');
      passos.push('<li>' + (passos.length ? '2º passo' : 'Trâmite') + ', situação <b>' + esc(rotSit(c0, c0.acao.situacao)) + '</b>: “' + esc(c0.acao.texto) + '”</li>');
      resumo = '<p><b>O que será enviado a cada uma:</b></p><ul>' + passos.join('') + '</ul>' + (textos.size > 1 ? '<p class="fraco">O texto leva o número ou a aba de cada solicitação (o exemplo é o da primeira).</p>' : '');
    }
    const item = c => ({ k: c.k, rotulo: '#' + c.item.num + ' ' + nomeCli(c.item) + ' · ' + (c.item.detalhe || c.item.typeLabel), sub: c.porque });
    abrirLote({
      titulo: g.rot + ': ' + g.botao + ' em lote', tipo: t.typeLabel, resumo, itens: cs.map(item), local: g.lembrete,
      botao: g.lembrete ? 'Criar lembretes' : 'Enviar ao Onvio',
      executar: async k => {
        const c = porK.get(k);
        if (g.lembrete) {
          const l = c.acao.lembrete;
          await salvarLembretes((estado.lembretes || []).concat([OC.novoLembrete({ texto: l.texto, quando: l.quando, k: l.k, type: l.type, num: l.num, cliente: l.cliente }, new Date())]));
          return { ok: true };
        }
        const passos = (c.acao.antes || []).concat([{ situacao: c.acao.situacao, rot: 'conclusão', texto: c.acao.texto }]);
        for (let n = 0; n < passos.length; n++) {            // o service worker confere a situação de verdade antes de cada envio
          const r = await enviar({ cmd: 'acao', type: c.item.type, num: String(c.item.num), acao: 'tramite', texto: passos[n].texto, situacao: passos[n].situacao, analista: '', data: '', arquivos: [] });
          if (!r.ok) return { ok: false, erro: (passos.length > 1 ? 'passo ' + (n + 1) + ': ' : '') + (r.erro || 'o Onvio não aceitou'), parar: !!r.auth };
          if (n < passos.length - 1) await new Promise(ok => setTimeout(ok, 500));
        }
        return { ok: true };
      },
      aoTerminar: async feitas => { for (const k of feitas) { const c = porK.get(k); if (c && g.lembrete) await ignorarSugestao(c.k, c.item); } }
    });
  }
  // Fazer a sugestão: lembrete na hora (sem escrever no Onvio) ou o detalhe com o trâmite preenchido. antesDeAbrir: o modo foco some
  async function fazerSug(c, antesDeAbrir) {
    if (c.acao.lembrete) {
      const l = c.acao.lembrete;
      await salvarLembretes((estado.lembretes || []).concat([OC.novoLembrete({ texto: l.texto, quando: l.quando, k: l.k, type: l.type, num: l.num, cliente: l.cliente }, new Date())]));
      await ignorarSugestao(c.k, c.item);
      toast('Lembrete criado para ' + l.dia + ' às 9h (veja na Agenda)');
      return 'feito';
    }
    if (antesDeAbrir) antesDeAbrir();
    ctx.abrirDetalhe(c.item, null, { acao: 'tramite', preset: { texto: c.acao.texto, situacao: c.acao.situacao, antes: c.acao.antes } });
    return 'detalhe';
  }
  // "Não é o caso": sai na hora, com "Desfazer" no aviso
  async function ignorarSug(c) {
    await ignorarSugestao(c.k, c.item);
    toastAcao('Saiu das sugestões. Volta se a solicitação mexer.', 'Desfazer', () => ignorarSugestao(c.k, null));
  }
  function ligarSug() {
    const sec = $('#hj-sug', el);
    if (!sec) return;
    ligarRec(sec);
    ligarItens(sec, casos.map(c => c.item), ctx.abrirDetalhe);
    $$('[data-sg-f]', sec).forEach(b => b.onclick = () => { filtroSug = b.dataset.sgF; gravarPref('hojeSugFiltro', filtroSug); trocarSug(true); });
    $$('[data-cs-acao]', sec).forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      const c = casos.find(x => x.k === b.dataset.csAcao);
      if (c) fazerSug(c);
    }));
    $$('[data-cs-ignorar]', sec).forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      const c = casos.find(x => x.k === b.dataset.csIgnorar);
      if (c) ignorarSug(c);
    }));
    // em lote: as de mesmo tipo e mesma categoria, numa janela para revisar e confirmar
    $$('[data-cs-lote]', sec).forEach(b => b.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const [tipoCaso, tipoSol] = b.dataset.csLote.split('|');
      const g = OC.agruparSugestoes(casos).find(x => x.tipo === tipoCaso), t = g && g.porTipo.find(x => x.type === tipoSol);
      if (t && t.lote.ok) abrirLoteDe(g, t);
    }));
    // uma a uma: a fila na ordem da lista (com o filtro da tela), começando na primeira
    if ($('#hj-sug-foco', sec)) $('#hj-sug-foco', sec).onclick = e => {
      e.stopPropagation();
      const ks = ordemSug().filter(c => !filtroSug || c.tipo === filtroSug || !casos.some(x => x.tipo === filtroSug)).map(c => c.k);
      abrirFoco({ ks, inicio: ks[0], casos: () => casosAtuais, previa: c => previa(c, true), fazer: fazerSug, ignorar: ignorarSug, ver: c => ctx.abrirDetalhe(c.item) });
    };
    if ($('#hj-sug-ler', sec)) $('#hj-sug-ler', sec).onclick = e => { e.stopPropagation(); lerCasos(); trocarSug(); };
  }
  ligarSug();
  if (estado.snap && !casosLendo && (!casosLidos || Date.now() - casosEm > 10 * 60000)) { lerCasos(); trocarSug(); }
  ligarRec($('#hj-tipos', el) || document.createElement('div'));
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
    // só rola (e só então esmaece o fim) quando a fila é maior que a caixa; o scrollHeight é o do próprio quadro da lista
    // (o offsetTop do último item conta o título de cima e dava falso positivo com uma solicitação só)
    const conteudo = lst.scrollHeight, cab = lst.clientHeight;
    const passa = conteudo - cab > 2;
    lst.classList.toggle('rola', passa);
    lst.classList.toggle('fim', !passa || lst.scrollTop + cab >= conteudo - 2);
    lst.classList.toggle('topo', passa && lst.scrollTop > 2);
  };
  marca(); lst.addEventListener('scroll', marca, { passive: true }); setTimeout(marca, 1700);
}

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
let previsao = null, previsaoEm = 0, previsaoLendo = false, previsaoVisao = '';   // previsão por empresa: na memória por 30 min, nunca gravada
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

// 0.108.0: concluídas dos últimos 30 dias para o "Meu dia em números" (cmd 'concluidas', as suas ou as da equipe), só na memória, 10 min
const concDia = {}, concDiaLendo = {};
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
  const animar = !el.querySelector('.hj-meudia');      // só ao chegar na tela, não a cada clique ou leitura
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
  const semN = base.filter(i => !i.resp).length;
  const enxuto = !!estado.enxuto;                    // 0.89.0: Contábil/Fiscal (só a Geral): sem admissões, tipos nem prazo legal
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
    ? '<div class="aviso-linha late" id="ht-resumo">' + ic('alert') + '<span>A última leitura não trouxe nenhuma pendência ' + (enxuto ? 'na Geral do seu setor' : 'em nenhuma das 10 listas') + '. Se o Onvio mostra solicitações pendentes, abra <a href="#/config">Configurações</a> > Testar a leitura e envie o resultado.</span></div>'
    : automatica && cart === EQUIPE ? '<div class="aviso-linha" id="ht-resumo">' + ic('user') + '<span>Nenhuma pendência está com você como responsável no Onvio. Mostrando a equipe toda (' + plural(todas.length, 'pendência', 'pendências') + ').</span></div>' : '';

  const admissoes = enxuto ? [] : OC.admissoesCriticas(base);
  const resolvidasBase = resolvidas().filter(i => cart === MINHA ? i.mine : cart === EQUIPE ? true : (i.resp || SEM) === cart);
  const casos = OC.casosSugeridos(base.concat(resolvidasBase), casosLidos, estado.settings, estado.sugIgnoradas);
  casosAtuais = casos;
  const linkFila = p => ('#/fila?' + new URLSearchParams(Object.assign(cart === EQUIPE ? { escopo: 'equipe' } : cart === SEM ? { escopo: 'semresp' } : cart !== MINHA ? { analista: cart } : {}, p))).replace(/\?$/, '');

  el.innerHTML = aviso + meuDiaHtml() + admissoesHtml() + tiposPainel() +
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

  // 0.108.0 (Josué, 13/11/2026: o destaque "sem uso"; escolhido "Meu dia em números"; "ela escura assim também não tá legal"):
  // o dia da carteira em números, no tema da tela; cada número leva à lista certa. Concluídas: lidas na hora, 10 min na memória.
  function meuDiaHtml() {
    const esc2 = cart === MINHA ? 'mine' : cart === SEM ? '' : 'equipe';
    const cd = esc2 && concDia[esc2];
    const conc = !cd || !cd.itens ? null : esc2 === 'mine' || cart === EQUIPE ? cd.itens : cd.itens.filter(i => (i.resp || '') === cart);
    const md = OC.meuDia(base, conc, new Date(), estado.settings.feriados, 10);
    const lendo = esc2 && !cd;
    const vg = n => String(n).replace('.', ',');
    const conta = n => n == null ? '…' : '<b data-conta="' + n + '">' + num(n) + '</b>';
    const tile = (k, n, rot, sub, href, icone, tom, cls) => '<a class="hj-md-k tom-' + tom + (cls ? ' ' + cls : '') + '" href="' + esc(href) + '" data-md="' + k + '">' +
      '<span class="hj-md-ic">' + ic(icone) + '</span><span class="hj-md-tx">' + conta(n) + '<span>' + esc(rot) + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</span>' +
      '<span class="hj-md-ir">' + ic('chev-r', 'ic-sm') + '</span></a>';
    // destaque: as concluídas de hoje contra a média por dia útil (o anel enche ao chegar na média)
    const ch = md.concluidasHoje, med = md.media;
    const pct = ch == null ? null : med ? Math.min(100, ch / med * 100) : ch ? 100 : 0;
    const ritmo = esc2 ? (cd && cd.erro ? 'não deu para ler' : 'lendo no Onvio…') : 'sem analista: não se aplica';      // só enquanto não há número
    const destaque = '<a class="hj-md-k hj-md-dest" href="' + esc(linkFila({ escopo: 'concluidas' })) + '" data-md="concluidas">' +
      anelProgresso(pct, (ch == null ? '<b>…</b>' : '<b data-conta="' + ch + '">' + num(ch) + '</b>') + '<small>hoje</small>', { tam: 112 }) +
      '<span class="hj-md-tx"><span>concluídas hoje</span><small>' + (med != null ? 'média de ' + vg(med) + ' por dia útil' : '') + '</small>' + (ch == null ? '<small>' + ritmo + '</small>' : '') + '</span></a>';
    const total10 = md.serie ? md.serie.reduce((t, x) => t + x.n, 0) : null;
    return '<section class="hj-meudia" style="--i:0">' +
      '<header class="hj-md-cab"><div><span class="hj-eyebrow">' + esc(rotCart) + (cart !== EQUIPE ? ' · <button type="button" class="linkish" data-cart="' + EQUIPE + '">ver equipe toda</button>' : '') + '</span>' +
        '<h2 id="hj-titulo">Meu dia em números</h2><p>' + plural(total, 'pendência', 'pendências') + (semN && cart !== SEM ? ' · <b class="t-sem">' + semN + ' sem analista</b>' : '') + '</p></div>' +
        '<button class="btn btn-sm" id="ag-novo">' + ic('plus', 'ic-sm') + ' Lembrete</button></header>' +
      '<div class="hj-md-grade">' + destaque +
        '<div class="hj-md-ks">' +
          tile('chegaram', md.chegaram, 'chegaram hoje', 'novas na carteira', linkFila({}), 'inbox', 'a') +
          tile('respondidas', md.respondidas, 'respondidas hoje', 'a vez passou ao cliente', linkFila({ escopo: 'respondidas' }), 'chat', 'b') +
          tile('paradas', md.paradas, 'paradas há mais de 3 dias', 'de ' + num(md.comEscritorio) + ' com o escritório', linkFila({ idade: '4-' }), 'clock', 'c', md.paradas ? 'alerta' : '') +
          tile('lembretes', lems.length, lems.length === 1 ? 'lembrete para hoje' : 'lembretes para hoje', lems.some(l => OC.situacaoLembrete(l) === 'atrasado') ? 'tem atrasado' : 'nada atrasado', '#/lembretes', 'bell', 'd') +
        '</div>' +
        '<figure class="hj-md-graf" aria-label="Concluídas por dia útil"><figcaption><span>Concluídas por dia útil</span>' + (total10 != null ? '<b>' + num(total10) + ' em 10 dias' + (md.media ? ' · <i class="hj-md-leg" aria-hidden="true"></i>média ' + vg(md.media) : '') + '</b>' : '') + '</figcaption>' + (md.serie ? barrasDia(md.serie, md.media) : '<div class="hj-md-vazio">' + (lendo ? 'Lendo as concluídas no Onvio…' : cd && cd.erro ? 'Não deu para ler as concluídas: ' + esc(cd.erro) : 'Sem analista: as concluídas não se aplicam.') + '</div>') + '</figure>' +
      '</div></section>';
  }
  // barras finas com degradê, uma por dia útil; a de hoje cheia, com o número, e a linha tracejada da média
  function barrasDia(serie, media) {
    const W = 360, H = 132, pad = 4, max = Math.max(1, media || 0, ...serie.map(x => x.n)), bw = (W - pad * 2) / serie.length;
    const y = v => H - 20 - (v / max) * (H - 40);
    const hojeK = serie[serie.length - 1].dia, larg = Math.min(18, bw * 0.6);
    const barras = serie.map((x, n) => { const h = Math.max(x.n ? 3 : 2, (H - 20) - y(x.n)), cx = pad + n * bw + bw / 2, dd = x.dia.slice(8, 10) + '/' + x.dia.slice(5, 7), eh = x.dia === hojeK;
      return '<g><title>' + dd + ': ' + x.n + (x.n === 1 ? ' concluída' : ' concluídas') + '</title><rect x="' + (cx - larg / 2).toFixed(1) + '" y="' + ((H - 20) - h).toFixed(1) + '" width="' + larg.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3" class="' + (eh ? 'hoje' : x.n ? '' : 'zero') + '"/>' +
        (eh || (x.n && x.n === max) ? '<text x="' + cx.toFixed(1) + '" y="' + ((H - 20) - h - 5).toFixed(1) + '" text-anchor="middle" class="v">' + x.n + '</text>' : '') +
        '<text x="' + cx.toFixed(1) + '" y="' + (H - 5) + '" text-anchor="middle" class="d' + (eh ? ' h' : '') + '">' + (eh ? 'hoje' : dd.slice(0, 2)) + '</text></g>'; }).join('');
    const mv = String(media).replace('.', ',');
    const ym = media ? '<line x1="0" x2="' + W + '" y1="' + y(media).toFixed(1) + '" y2="' + y(media).toFixed(1) + '" class="media"/>' : '';
    return '<svg class="hj-md-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Concluídas por dia útil, média ' + mv + '"><defs><linearGradient id="hj-md-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="g1"/><stop offset="1" class="g2"/></linearGradient></defs>' +
      '<line x1="0" x2="' + W + '" y1="' + (H - 20) + '" y2="' + (H - 20) + '" class="base"/>' + barras + ym + '</svg>';
  }

  // Solicitações por tipo: os cartões das Solicitações, do tipo mais urgente para o menos urgente. O clique abre a lista
  // daquele tipo (na aba onde estão: Minhas, ou Respondidas quando só há solicitações na vez do cliente).
  function tiposPainel() {
    if (!base.length || enxuto) return '';          // só a Geral: um cartão só não ajuda
    return painel('hj-tipos', ic('layers', 'ic-sm') + ' Solicitações por tipo', 'Da mais urgente para a menos urgente. Clique para abrir as Solicitações daquele tipo.',
      '<div class="tipos" id="hj-tipos-l" role="group" aria-label="Solicitações por tipo">' + tiposHtml(base, { prioridade: true, sub: subPorMotivo }) + '</div>', '',
      plural(new Set(base.map(i => i.type)).size, 'tipo com pendência', 'tipos com pendência'));
  }





  // ---------- interações ----------
  const redesenhar = () => render(el, ctx);
  // 0.108.0: lê as concluídas dos últimos 30 dias para o Meu dia (uma leitura por vez, 10 min na memória)
  const escMd = cart === MINHA ? 'mine' : cart === SEM ? '' : 'equipe';
  if (escMd && estado.snap && !concDiaLendo[escMd] && (!concDia[escMd] || Date.now() - concDia[escMd].em > 10 * 60000)) {
    concDiaLendo[escMd] = true;
    enviar({ cmd: 'concluidas', equipe: escMd === 'equipe' }).then(r => {
      concDiaLendo[escMd] = false;
      concDia[escMd] = r && r.ok ? { itens: r.itens || [], em: Date.now() } : { itens: null, erro: (r && r.erro) || 'a leitura não respondeu', em: Date.now() };
      if (el.isConnected && location.hash.startsWith('#/inicio')) { const av = $('#aviso-sessao', el); render(el, ctx); if (av && !$('#aviso-sessao', el)) el.prepend(av); }      // a faixa de sessão fica
    });
  }
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
    previsaoLendo = true; previsao = null; previsaoEm = 0; previsaoVisao = estado.visao;
    enviar({ cmd: 'previsao', visao: estado.visao }).then(r => { previsaoLendo = false; previsao = r.ok && Array.isArray(r.empresas) ? r : { erro: r.erro || 'resposta inesperada do Control Onvio' }; previsaoEm = Date.now(); trocarPrevisao(); });
  };
  function ligarPrevisao() { ligarRec($('#hj-prev', el) || document.createElement('div')); if ($('#hj-prev-ler', el)) $('#hj-prev-ler', el).onclick = () => { lerPrevisao(); trocarPrevisao(); }; }
  ligarPrevisao();
  if (estado.snap && !previsaoLendo && (!previsao || previsaoVisao !== estado.visao || Date.now() - previsaoEm > 30 * 60000)) { lerPrevisao(); const pv = $('#hj-prev .hj-painel-vazio', el); if (pv) pv.textContent = 'Lendo as últimas 4 semanas no Onvio…'; }
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


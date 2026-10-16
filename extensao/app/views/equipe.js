/* Equipe · área do gestor, com senha: avaliação de desempenho e qualidade dos atendimentos.
 * Abas: Desempenho (nota de cada analista, entregas no período, pontualidade, ritmo, carteira em dia, cuidado e
 * agilidade, com a comparação ao período anterior), Carga (números e gráficos da fila de hoje) e Responsáveis.
 * As entregas e os trâmites de cada uma são lidos na hora pelo service worker (cmd 'desempenho'); a conta é feita aqui
 * (OC.avaliarEquipe), com o tempo com o escritório, o crédito a quem concluiu e os casos que o gestor tirou da conta
 * (estado.excecoes: só o k). A senha fica só como
 * resumo SHA-256 (settings.senhaGestorSha256): é uma trava leve, não segurança forte. */
import { estado, itens, enviar, marcarExcecao } from '../estado.js';
import { esc, plural, num, fmtDataCurta, toast, ligarItens, porqueGrav, $, $$ } from '../util.js';
import { barrasEmpilhadas, barrasAgrupadas, linhaDoDia, ligarDicas, anelProgresso, miniBarras, animarNumeros, cor } from '../graficos.js';
import { prescricaoHtml, mapaIdadeHtml, ligarEquipe } from './painel-equipe.js';
const OC = window.OC;

const GRAV = [
  { chave: 'g0', nome: 'Em dia', cor: 'ok' },
  { chave: 'g1', nome: 'G1 atenção', cor: 'warn' },
  { chave: 'g2', nome: 'G2 fora do prazo', cor: 'serious' },
  { chave: 'g3', nome: 'G3 crítica', cor: 'crit' }
];


/* ---------- trava da área do gestor ---------- */
let liberada = (() => { try { return sessionStorage.getItem('oc.gestor') === '1'; } catch (e) { return false; } })();
async function sha256(txt) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function travar(v) { liberada = v; try { v ? sessionStorage.setItem('oc.gestor', '1') : sessionStorage.removeItem('oc.gestor'); } catch (e) { /* vale só nesta visita */ } }

let digitada = '';   // o que está no campo da senha (só na memória), para um redesenho ao vivo não apagar
function telaSenha(el, ctx, params) {
  ctx.cab({ titulo: 'Equipe', sub: 'Área do gestor' });
  if ($('#g-trava', el)) return;   // leitura ao vivo redesenhando: não apaga o que a pessoa está digitando
  el.innerHTML = '<form class="gestor-trava" id="g-trava" autocomplete="off">' +
    '<span class="gt-ic"><svg class="ic"><use href="#i-lock"/></svg></span>' +
    '<h2>Área do gestor</h2>' +
    '<p>A avaliação de desempenho e qualidade da equipe é restrita. Digite a senha do gestor para continuar.</p>' +
    '<label class="field">Senha<input type="password" id="g-senha" autocomplete="off" spellcheck="false" required></label>' +
    '<p class="gt-erro" id="g-erro" role="alert" hidden>Senha incorreta. Tente de novo.</p>' +
    '<button class="btn btn-primary" id="g-entrar">Entrar</button></form>';
  const f = $('#g-trava', el), campo = $('#g-senha', el);
  campo.value = digitada;
  campo.addEventListener('input', () => { digitada = campo.value; });
  campo.focus();
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const ok = (await sha256(campo.value)) === String(estado.settings.senhaGestorSha256 || '').toLowerCase();
    campo.value = ''; digitada = '';
    if (ok) { travar(true); render(el, ctx, params); return; }
    $('#g-erro', el).hidden = false;
    f.classList.remove('treme'); void f.offsetWidth; f.classList.add('treme');
    campo.focus();
  });
}

export function render(el, ctx, params) {
  params = params || {};
  if (!liberada) return telaSenha(el, ctx, params);
  const aba = ['carga', 'resp'].includes(params.aba) ? params.aba : 'desempenho';
  const an = OC.porAnalista(itens());
  const { extra } = ctx.cab({
    titulo: 'Equipe', sub: 'Desempenho e qualidade dos atendimentos · área do gestor',
    abas: [{ id: 'desempenho', rot: 'Desempenho', href: '#/equipe' }, { id: 'carga', rot: 'Carga de hoje', href: '#/equipe?aba=carga' }, { id: 'resp', rot: 'Responsáveis', href: '#/equipe?aba=resp', n: an.length }],
    aba,
    extra: (aba === 'desempenho' ? '<div class="seg seg-sm" role="group" aria-label="Período" id="av-periodo">' + [7, 14, 30].map(d => '<button data-dias="' + d + '"' + (dias === d ? ' class="on"' : '') + '>' + (d === 7 ? '7 dias' : d + ' dias') + '</button>').join('') + '</div>' : '') +
      '<button class="btn btn-sm" id="av-bloquear" title="Bloquear a área do gestor"><svg class="ic ic-sm"><use href="#i-lock"/></svg> Bloquear</button>'
  });
  $('#av-bloquear', extra).onclick = () => { travar(false); resultado = null; render(el, ctx, params); };
  $$('[data-dias]', extra).forEach(b => b.onclick = () => { dias = Number(b.dataset.dias); resultado = null; aberto = null; render(el, ctx, params); });
  if (aba === 'carga') return carga(el, ctx);
  if (aba === 'resp') return responsaveis(el, ctx);
  return desempenho(el, ctx, params);
}

/* ---------- Desempenho ---------- */
let dias = 7;
let resultado = null;   // resposta do cmd 'desempenho' (lida na hora, só na memória)
let lendo = false;
let aberto = null;      // analista com o detalhe aberto
let ordRank = { k: 'pos', desc: false };   // ordem da tabela do ranking (clique no cabeçalho)
let animar = true;
const COR_FAIXA = { otimo: 'ok', bom: 's1', atencao: 'warn', critico: 'crit', sem: 'var(--ink-3)' };
const COMP = [
  ['pontualidade', 'Pontualidade', 'entregas dentro do prazo interno (3 d.u. simples, 5 cálculo), contando só os dias em que a vez era do escritório'],
  ['ritmo', 'Ritmo', 'tempo com o escritório de cada entrega comparado com o normal da equipe no mesmo tipo de solicitação (75 = no normal da equipe)'],
  ['emDia', 'Carteira em dia', 'pendências com o escritório sem atraso agora, sem contar atrasos de origem do cliente (pedido que já chegou tarde)'],
  ['cuidado', 'Cuidado', 'críticas (G3) na vez do escritório e prescritas sem nenhuma cobrança ao cliente, a cada 10 solicitações'],
  ['agilidade', 'Agilidade', 'dias úteis até o 1º trâmite do escritório, incluindo as que seguem sem resposta']
];
const CURTO = { pontualidade: 'Pontual.', ritmo: 'Ritmo', emDia: 'Em dia', cuidado: 'Cuidado', agilidade: 'Agilid.' };
// A conta é refeita a cada desenho: muda com as exceções do gestor e com a fila ao vivo, sem ler o Onvio de novo
function calcular() {
  if (!resultado || !resultado.entregas) return resultado;
  return Object.assign({ erros: resultado.erros, semLeitura: resultado.semLeitura || 0, falhas: resultado.falhasTramites || 0 },
    OC.avaliarEquipe(itens(), resultado.entregas, estado.settings, resultado.dias, new Date(resultado.agora), { analises: resultado.analises || {}, excecoes: estado.excecoes || {} }));
}
const fmt1 = v => (v == null ? '–' : String(v).replace('.', ','));
const pctTxt = v => (v == null ? '–' : v + '%');
function delta(v, unidade, melhorSobe) {
  if (v == null || v === 0) return '<span class="av-d">' + (v === 0 ? '= igual ao período anterior' : '') + '</span>';
  const bom = melhorSobe ? v > 0 : v < 0;
  return '<span class="av-d ' + (bom ? 'bom' : 'ruim') + '">' + (v > 0 ? '▲ +' : '▼ ') + fmt1(v) + (unidade || '') + ' vs. anterior</span>';
}

function desempenho(el, ctx, params) {
  if (!estado.snap) { el.innerHTML = '<div class="vazio"><b>Aguardando a primeira leitura do Onvio</b></div>'; return; }
  if (!resultado) {
    el.innerHTML = '<div class="av-carregando"><span class="av-pulso"></span><b>Lendo as entregas da equipe nos últimos ' + dias + ' dias…</b><small>Solicitações concluídas e prescritas no período e no anterior, lidas na hora no Onvio. Nada é guardado.</small></div>';
    if (!lendo) {
      lendo = true;
      const pedido = dias;
      enviar({ cmd: 'desempenho', dias }).then(r => {
        lendo = false;
        if (pedido !== dias) return;
        if (!r.ok) { toast('Não foi possível ler as entregas no Onvio: ' + (r.erro || ''), true); resultado = Object.assign({ erros: [r.erro || 'erro'] }, OC.avaliarEquipe(itens(), [], estado.settings, dias)); }
        else resultado = r;
        animar = true;
        if (location.hash.startsWith('#/equipe') && !/aba=/.test(location.hash)) render(el, ctx, params);
      });
    }
    return;
  }
  const r = calcular(), e = r.equipe, ans = r.analistas;
  const per = (d => d.slice(8, 10) + '/' + d.slice(5, 7));
  const kpi = (id, rot, val, det, extra) => '<div class="av-kpi" id="' + id + '"><span class="av-kpi-rot">' + rot + '</span><b class="av-kpi-val">' + val + '</b>' + (det || '') + (extra || '') + '</div>';
  el.innerHTML =
    (r.erros && r.erros.length ? '<div class="faixa warn"><svg class="ic"><use href="#i-alert"/></svg>Algumas listas não foram lidas: ' + esc(r.erros.join(' · ')) + '. A avaliação pode estar incompleta.</div>' : '') +
    '<section class="av-hero">' +
      '<div class="av-nota s-' + e.faixa.k + '" style="--c:' + cor(COR_FAIXA[e.faixa.k]) + '">' + anelProgresso(e.nota, '<b data-conta="' + (e.nota || 0) + '" data-de="0">' + (e.nota == null ? '–' : e.nota) + '</b><small>nota</small>', { tam: 132 }) +
        '<div><span class="av-eyebrow">Equipe · ' + per(r.de) + ' a ' + per(r.ate) + '</span><h2>' + esc(e.faixa.rot) + '</h2><p>' + plural(ans.filter(a => !a.poucosDados).length, 'analista no ranking', 'analistas no ranking') + (ans.some(a => a.poucosDados) ? ' · ' + ans.filter(a => a.poucosDados).length + ' com poucos dados' : '') + ' · nota de 0 a 100</p>' +
        (r.excluidas ? '<p class="av-exc">' + plural(r.excluidas, 'caso fora da conta', 'casos fora da conta') + ' · <button type="button" class="linkish" id="av-exc-limpar">voltar todos</button></p>' : '') +
        '<button type="button" class="linkish" id="av-como">Como a nota é calculada</button></div></div>' +
      '<div class="av-kpis">' +
        kpi('av-k-entregas', 'Entregas', '<span data-conta="' + e.concluidas + '" data-de="0">' + num(e.concluidas) + '</span>', delta(e.variacao.concluidas, '', true), miniBarras(e.porDia.map(d => ({ rot: per(d.dia), n: d.n })), { largura: 150, titulo: 'Entregas por dia' })) +
        kpi('av-k-prazo', 'No prazo', pctTxt(e.pctNoPrazo), delta(e.variacao.pctNoPrazo, ' p.p.', true), '<i class="av-barra"><i style="width:' + (e.pctNoPrazo || 0) + '%"></i></i>') +
        kpi('av-k-tempo', 'Tempo com o escritório', fmt1(e.tempoMedio) + '<small> d.u.</small>', '<span class="av-d">média por entrega, sem a espera pelo cliente</span>') +
        kpi('av-k-emdia', 'Carteira em dia', pctTxt(e.pctEmDia), '<span class="av-d">' + plural(e.esc, 'pendência', 'pendências') + ' com o escritório agora</span>', '<i class="av-barra"><i style="width:' + (e.pctEmDia || 0) + '%"></i></i>') +
        kpi('av-k-pt', '1º trâmite', fmt1(e.primeiroTramite) + '<small> d.u.</small>', '<span class="av-d">média · inclui as ainda sem resposta</span>') +
        kpi('av-k-qual', 'Alertas evitáveis', '<span class="' + (e.g3Esc + e.prescSemCobranca ? 'late' : '') + '">' + num(e.g3Esc + e.prescSemCobranca) + '</span>', '<span class="av-d">' + e.g3Esc + ' G3 na vez do escritório · ' + e.prescSemCobranca + ' prescritas sem cobrança</span>') +
      '</div>' +
    '</section>' +
    (r.semLeitura ? '<div class="faixa warn"><svg class="ic"><use href="#i-alert"/></svg>' + plural(r.semLeitura, 'entrega ficou', 'entregas ficaram') + ' sem a leitura dos trâmites: para elas o tempo conta da abertura à conclusão (estimado) e o crédito vai para o responsável. Abra a tela de novo mais tarde para completar.</div>' : '') +
    '<div class="av-como" id="av-como-txt" hidden><b>Como a nota é calculada (0 a 100)</b><ul>' + COMP.map(([k, rot, d]) => '<li><b>' + rot + ' · peso ' + r.pesos[k] + '</b> ' + esc(d) + '</li>').join('') + '</ul>' +
      '<p><b>Para ser justa:</b> o tempo que conta é só o tempo em que a vez era do escritório (lido nos trâmites de cada entrega); a entrega conta para quem a concluiu, não para o responsável atual; atrasos de origem do cliente não pesam; com poucas entregas, os percentuais são puxados para a média da equipe, e abaixo de ' + r.minEntregas + ' entregas no período a pessoa aparece sem posição ("poucos dados"); item sem dado recebe o valor da equipe. O gestor pode tirar um caso da conta ("Não contar", no detalhe de cada pessoa). Pesos e mínimo podem vir do arquivo de regras (avaliacao).</p>' +
      '<p>Faixas: 85+ Excelente · 70+ Bom · 50+ Atenção · abaixo, Precisa de apoio. É um retrato para conversar com a equipe, não um julgamento automático.</p></div>' +
    '<div class="av-grade">' +
      '<section class="card av-rank-card"><div class="card-h"><h3>Ranking de desempenho</h3><span class="sub">clique numa linha para ver o detalhe · no cabeçalho para ordenar</span></div><div class="card-b"><div class="av-rank" id="av-rank"></div></div></section>' +
      '<section class="card"><div class="card-h"><h3>Entregas no período</h3><span class="sub">no prazo × fora do prazo, por analista</span></div><div class="card-b"><div id="av-barras"></div></div></section>' +
    '</div>' +
    '<div id="av-det">' + (aberto ? detalheAnalista(ans.find(a => a.resp === aberto)) : '') + '</div>';

  const desenhar = () => {
    const box = $('#av-barras', el);
    if (!box) return;
    // da que mais entregou para a que menos; quem não entregou nada aparece sem barra (e não como 0% no prazo)
    const dados = ans.slice().sort((a, b) => (b.concluidas - a.concluidas) || a.resp.localeCompare(b.resp, 'pt-BR')).map(a => ({
      rotulo: a.resp, id: a.resp, valores: { prazo: a.noPrazo || 0, atraso: Math.max(0, (a.concluidas || 0) - (a.noPrazo || 0)) },
      fim: num(a.concluidas) + ' · ' + pctTxt(a.pctNoPrazo) + ' no prazo', vazio: a.concluidas ? null : 'sem entregas no período'
    }));
    box.innerHTML = ans.length ? barrasEmpilhadas(dados, [{ chave: 'prazo', nome: 'No prazo', cor: 'ok' }, { chave: 'atraso', nome: 'Fora do prazo', cor: 'serious' }],
      { largura: Math.max(360, Math.round(box.clientWidth)), rotuloL: 130, folga: 150, destaque: aberto ? [aberto] : [], titulo: 'Entregas no período por analista, no prazo e fora do prazo' }) : '<div class="vazio">Nenhuma entrega no período.</div>';
    $$('[data-id]', box).forEach(g => { g.classList.add('clicavel'); g.addEventListener('click', () => abrir(g.dataset.id)); });
  };
  const desenharRank = () => {
    const box = $('#av-rank', el);
    if (!box) return;
    box.innerHTML = ans.length ? rankHtml(ans) : '<div class="vazio">Nenhum analista com pendências ou entregas no período.</div>';
    $$('[data-resp]', box).forEach(c => { const ir = () => abrir(c.dataset.resp); c.addEventListener('click', ir); c.addEventListener('keydown', ev => { if (ev.key === 'Enter') ir(); }); });
    $$('[data-ord]', box).forEach(b => b.addEventListener('click', () => { ordRank = ordRank.k === b.dataset.ord ? { k: b.dataset.ord, desc: !ordRank.desc } : { k: b.dataset.ord, desc: b.dataset.ord !== 'pos' && b.dataset.ord !== 'resp' }; desenharRank(); }));
  };
  desenharRank();
  desenhar();
  ctx.aoRedimensionar(desenhar);
  ligarDicas(el);
  if (animar) { animar = false; el.classList.remove('av-anim'); void el.offsetWidth; el.classList.add('av-anim'); animarNumeros(el); }
  $('#av-como', el).onclick = () => { const t = $('#av-como-txt', el); t.hidden = !t.hidden; };
  if ($('#av-exc-limpar', el)) $('#av-exc-limpar', el).onclick = async () => { for (const k of Object.keys(estado.excecoes || {})) await marcarExcecao(k, false); toast('Todos os casos voltaram para a conta'); render(el, ctx, params); };
  ligarDetalhe();

  function abrir(resp) {
    aberto = aberto === resp ? null : resp;
    $$('#av-rank [data-resp]', el).forEach(c => c.classList.toggle('ativo', c.dataset.resp === aberto));
    $('#av-det', el).innerHTML = aberto ? detalheAnalista(ans.find(a => a.resp === aberto)) : '';
    desenhar(); ligarDetalhe();
    if (aberto) $('#av-det', el).scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  function ligarDetalhe() {
    const d = $('#av-det .av-det', el);
    if (!d) return;
    $('#av-det-fechar', el).onclick = () => abrir(aberto);
    $('#av-det-fila', el).onclick = () => ctx.navegar('fila', { analista: aberto });
    const a = ans.find(x => x.resp === aberto);
    if ($('#av-det-l', el)) ligarItens($('#av-det-l', el), a.atencao, ctx.abrirDetalhe);
    if ($('#av-det-fp', el)) ligarItens($('#av-det-fp', el), a.foraDoPrazo.map(x => x.item), ctx.abrirDetalhe);
    if ($('#av-det-ev', el)) ligarItens($('#av-det-ev', el), a.evitaveis.map(x => x.item), ctx.abrirDetalhe);
    $$('[data-exc]', d).forEach(b => b.addEventListener('click', async ev => {
      ev.stopPropagation();
      await marcarExcecao(b.dataset.exc, true);
      toast('Caso fora da conta (só para a avaliação; pode voltar no topo da tela)');
      render(el, ctx, params);
    }));
  }
}

// Ranking em tabela compacta: uma linha por pessoa, na ordem da nota (ou da coluna escolhida no cabeçalho).
function rankHtml(ans) {
  const pos = new Map(ans.map((a, n) => [a.resp, n + 1]));               // ans já vem ordenado (poucos dados por último)
  const val = (a, k) => k === 'pos' ? (a.pos == null ? null : a.pos) : k === 'resp' ? a.resp : k === 'nota' ? a.nota : k === 'concluidas' ? a.concluidas : a.componentes[k];
  const l = ans.slice().sort((a, b) => {
    const x = val(a, ordRank.k), y = val(b, ordRank.k);
    if (x == null && y == null) return pos.get(a.resp) - pos.get(b.resp);
    if (x == null) return 1; if (y == null) return -1;                      // sem valor sempre por último
    const r = typeof x === 'string' ? x.localeCompare(y, 'pt-BR') : x - y;
    return (ordRank.desc ? -r : r) || pos.get(a.resp) - pos.get(b.resp);
  });
  const th = (k, rot, cls, tit) => '<th class="' + (cls || '') + (ordRank.k === k ? ' on' + (ordRank.desc ? '' : ' asc') : '') + '"' + (tit ? ' title="' + esc(tit) + '"' : '') + '><button type="button" data-ord="' + k + '">' + rot + '</button></th>';
  return '<table class="av-tab"><thead><tr>' + th('pos', '#', 'num') + th('resp', 'Analista') + th('nota', 'Nota', 'num') + '<th>Faixa</th>' +
      COMP.map(([k, rot, d]) => th(k, CURTO[k], 'av-tc', rot + ': ' + d)).join('') + th('concluidas', 'Entregas', 'num') + '</tr></thead><tbody>' +
    l.map((a, n) => '<tr class="av-lin' + (aberto === a.resp ? ' ativo' : '') + (a.poucosDados ? ' av-pouco' : '') + '" tabindex="0" data-resp="' + esc(a.resp) + '" style="--c:' + cor(COR_FAIXA[a.faixa.k]) + ';--i:' + (n + 1) + '">' +
      '<td class="num av-pos">' + (a.pos == null ? '–' : a.pos + 'º') + '</td>' +
      '<td class="av-nome"><b>' + esc(a.resp) + '</b></td>' +
      '<td class="num"><span class="av-nota-tag">' + (a.nota == null ? '–' : a.nota) + '</span></td>' +
      '<td>' + (a.poucosDados ? '<span class="av-chip av-chip-pouco" title="Menos de ' + estado.settings.avaliacaoMinEntregas + ' entregas no período: a nota é só um indicativo e não entra no ranking">Poucos dados</span>' : '<span class="av-chip">' + esc(a.faixa.rot) + '</span>') + '</td>' +
      COMP.map(([k]) => { const v = a.componentes[k]; return '<td class="av-tc"><span class="av-mini"><i class="av-barra"><i style="width:' + (v == null ? 0 : v) + '%"></i></i><small>' + (v == null ? '–' : v) + '</small></span></td>'; }).join('') +
      '<td class="num av-ent"><b>' + num(a.concluidas) + '</b>' + setinha(a.variacao.concluidas) + '</td></tr>').join('') +
    '</tbody></table>';
}
const setinha = v => (v ? '<span class="av-d ' + (v > 0 ? 'bom' : 'ruim') + '" title="' + (v > 0 ? '+' : '') + fmt1(v) + ' vs. período anterior">' + (v > 0 ? '▲' : '▼') + '</span>' : '');

function detalheAnalista(a) {
  if (!a) return '';
  const lin = (rot, val, det) => '<div class="av-det-n"><span>' + rot + '</span><b>' + val + '</b>' + (det ? '<small>' + det + '</small>' : '') + '</div>';
  return '<section class="card av-det" style="--c:' + cor(COR_FAIXA[a.faixa.k]) + '"><div class="card-h"><h3>' + esc(a.resp) + ' · nota ' + (a.nota == null ? '–' : a.nota) + ' (' + esc(a.faixa.rot) + ')</h3>' +
    '<button class="lk" id="av-det-fila">Ver a fila da pessoa</button><button class="lk" id="av-det-fechar">Fechar</button></div><div class="card-b">' +
    '<div class="av-det-grade">' +
      lin('Entregas', num(a.concluidas), 'anterior: ' + num(a.anterior.concluidas)) +
      lin('No prazo', pctTxt(a.pctNoPrazo), a.noPrazo + ' de ' + a.concluidas + (a.anterior.pctNoPrazo != null ? ' · anterior: ' + a.anterior.pctNoPrazo + '%' : '')) +
      lin('Tempo com o escritório', fmt1(a.tempoMedio) + ' d.u.', 'média por entrega' + (a.ritmo != null ? ' · ritmo ' + fmt1(a.ritmo) + '× o normal da equipe' : '') + (a.estimadas ? ' · ' + a.estimadas + ' estimada(s)' : '')) +
      lin('Carteira', num(a.carteira), a.esc + ' com o escritório · ' + pctTxt(a.pctEmDia) + ' em dia (sem os atrasos do cliente)') +
      lin('1º trâmite', fmt1(a.primeiroTramite) + ' d.u.', 'média · inclui as sem resposta') +
      lin('Evitáveis', num(a.g3Esc + a.prescSemCobranca), a.g3Esc + ' G3 na vez do escritório · ' + a.prescSemCobranca + ' prescritas sem cobrança · ' + a.paradas + ' paradas · ' + a.respondeu + ' com resposta do cliente esperando') +
    '</div>' +
    (a.poucosDados ? '<p class="av-pouco-nota">Só ' + plural(a.concluidas, 'entrega', 'entregas') + ' no período: os percentuais foram puxados para a média da equipe e a pessoa fica sem posição no ranking.</p>' : '') +
    '<p class="av-pouco-nota">Componentes da nota: ' + COMP.map(([k, rot]) => rot + ' ' + (a.componentes[k] == null ? '–' : a.componentes[k]) + (a.brutos[k] != null && a.brutos[k] !== a.componentes[k] ? ' (próprio: ' + a.brutos[k] + ')' : a.brutos[k] == null ? ' (sem dado: valor da equipe)' : '')).join(' · ') + '</p>' +
    (a.foraDoPrazo.length ? '<h4 class="av-det-h">Entregas fora do prazo</h4><div class="av-det-l" id="av-det-fp">' + a.foraDoPrazo.map(x => itemExc(x.item, 'Fora do prazo', 'var(--viz-serious)', fmt1(x.tempo) + ' d.u. com o escritório (prazo ' + x.prazo + ')' + (x.estimado ? ' · estimado: sem leitura dos trâmites' : ''))).join('') + '</div>' : '') +
    (a.evitaveis.length ? '<h4 class="av-det-h">Alertas evitáveis</h4><div class="av-det-l" id="av-det-ev">' + a.evitaveis.map(x => itemExc(x.item, x.item.lado === 'fim' ? 'Prescrita' : 'Crítica (G3)', 'var(--viz-crit)', x.motivo)).join('') + '</div>' : '') +
    '<h4 class="av-det-h">Pontos de atenção agora</h4>' +
    (a.atencao.length ? '<div class="av-det-l" id="av-det-l">' + a.atencao.map(i => (() => { const pg = porqueGrav(i); const porque = i.grav === 3 && pg ? pg.texto.replace(/^Crítica \(G3\) porque /, '') : 'parada há ' + (i.parado || 0) + ' dias com o escritório (limite ' + estado.settings.parada + ')'; return '<div class="item-ag clicavel" tabindex="0" data-k="' + esc(i.k) + '"><span class="pr-tag" style="--pc:' + (i.grav === 3 ? 'var(--viz-crit)' : 'var(--viz-serious)') + '">' + (i.grav === 3 ? 'Crítica (G3)' : 'Parada') + '</span><div class="tx"><b>#' + esc(i.num) + ' ' + esc(i.apelido || i.cliente || '—') + '</b><small>' + esc([i.typeLabel, i.detalhe].filter(Boolean).join(' · ')) + '</small><small class="av-porque">Por quê: ' + esc(porque) + '</small></div></div>'; })()).join('') + '</div>'
      : '<div class="hj-zen">Nenhuma crítica nem parada na carteira agora.</div>') +
    '</div></section>';
}

// Linha de um caso que pesa na nota, com "Não contar" (o gestor tira da conta; fica só no Chrome dele)
function itemExc(i, tag, cor, porque) {
  return '<div class="item-ag clicavel" tabindex="0" data-k="' + esc(i.k) + '"><span class="pr-tag" style="--pc:' + cor + '">' + esc(tag) + '</span><div class="tx"><b>#' + esc(i.num) + ' ' + esc(i.apelido || i.cliente || '—') + '</b><small>' + esc([i.typeLabel, i.detalhe].filter(Boolean).join(' · ')) + '</small><small class="av-porque">' + esc(porque) + '</small></div>' +
    '<div class="acts"><button type="button" class="btn btn-sm" data-exc="' + esc(i.k) + '" title="Tira este caso da avaliação (por exemplo, um problema que não foi da pessoa)">Não contar</button></div></div>';
}

function carga(el, ctx) {
  const it = itens(), an = OC.porAnalista(it);
  const semResp = it.filter(i => !i.resp);

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

  const porResp = an.map(r => ({ rotulo: r.resp, id: r.resp, valores: { g0: r.total - r.g1 - r.g2 - r.g3, g1: r.g1, g2: r.g2, g3: r.g3 } }));
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
    '<div style="margin-top:16px">' + prescricaoHtml() + '</div>';

  const desenhar = () => {
    const w = id => Math.max(320, Math.round($(id, el).clientWidth));
    $('#g-carga', el).innerHTML = barrasEmpilhadas(porResp.slice(0, 14), GRAV, { largura: w('#g-carga'), titulo: 'Carga por responsável e gravidade' });
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
  ligarEquipe(el, ctx);
}

function responsaveis(el, ctx) {
  const it = itens(), an = OC.porAnalista(it);
  const max = Math.max(1, ...an.map(r => r.total));
  const seg = (v, cor) => v ? '<i style="width:' + (v / max * 100) + '%;background:var(--viz-' + cor + ')"></i>' : '';
  el.innerHTML = mapaIdadeHtml() +
    '<div class="tabela-wrap" style="margin-top:16px"><table class="tabela"><thead><tr>' +
      '<th>Responsável</th><th>Carga</th><th class="num">Total</th><th class="num">Escritório</th><th class="num">Cliente</th><th class="num">G1</th><th class="num">G2</th><th class="num">G3</th><th class="num">Sem 1º trâmite</th><th class="num">1º trâmite (d.u.)</th></tr></thead><tbody>' +
      (an.length ? an.map(r => '<tr data-resp="' + esc(r.resp) + '" tabindex="0"><td><b>' + esc(r.resp) + '</b></td>' +
        '<td><div class="carga"><div class="barra-mini" title="Em dia, G1, G2 e G3">' + seg(r.total - r.g1 - r.g2 - r.g3, 'ok') + seg(r.g1, 'warn') + seg(r.g2, 'serious') + seg(r.g3, 'crit') + '</div></div></td>' +
        '<td class="num"><b>' + r.total + '</b></td><td class="num">' + r.esc + '</td><td class="num">' + r.cli + '</td><td class="num ' + (r.g1 ? 'today' : '') + '">' + r.g1 + '</td><td class="num ' + (r.g2 ? 'late' : '') + '">' + r.g2 + '</td><td class="num ' + (r.g3 ? 'late' : '') + '">' + r.g3 + '</td><td class="num">' + r.semPrimeiro + '</td><td class="num">' + (r.ptMedia == null ? '–' : String(r.ptMedia).replace('.', ',')) + '</td></tr>').join('') : '<tr><td colspan="10" class="vazio">Sem dados.</td></tr>') +
    '</tbody></table></div>' +
    '<div class="legenda-viz" style="margin-top:10px"><span><i style="background:var(--viz-ok)"></i>Em dia</span><span><i style="background:var(--viz-warn)"></i>G1 atenção</span><span><i style="background:var(--viz-serious)"></i>G2 fora do prazo</span><span><i style="background:var(--viz-crit)"></i>G3 crítica</span></div>' +
    '<p class="card-nota">Clique numa pessoa para ver a fila dela. "1º trâmite" é a média de dias úteis até a primeira resposta do escritório (estimativa).</p>';
  ligarEquipe(el, ctx);
  $$('[data-resp]', el).forEach(tr => {
    const go = () => ctx.navegar('fila', { analista: tr.dataset.resp });
    tr.addEventListener('click', go); tr.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  });
}

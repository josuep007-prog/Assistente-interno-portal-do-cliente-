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
import { mapaIdadeHtml, ligarEquipe } from './painel-equipe.js';
import { detalheAberto } from './detalhe.js';
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
    extra: (aba === 'desempenho' ? '<span class="av-periodo" id="av-periodo">Últimos 30 dias</span>' : '') +
      '<button class="btn btn-sm" id="av-bloquear" title="Bloquear a área do gestor"><svg class="ic ic-sm"><use href="#i-lock"/></svg> Bloquear</button>'
  });
  $('#av-bloquear', extra).onclick = () => { travar(false); resultado = null; render(el, ctx, params); };
  if (aba === 'carga') return carga(el, ctx);
  if (aba === 'resp') return responsaveis(el, ctx);
  return desempenho(el, ctx, params);
}

/* ---------- Desempenho ---------- */
const dias = 30;          // período fixo: 7 e 14 dias dão amostra pequena demais para avaliar alguém
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
  ['cuidado', 'Cuidado', 'críticas (G3) na vez do escritório, a cada 10 solicitações'],
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
    el.innerHTML = '<div class="av-carregando"><span class="av-pulso"></span><b>Lendo as entregas da equipe nos últimos ' + dias + ' dias…</b><small>Solicitações concluídas e prescritas no período e no anterior, com os trâmites de cada uma, lidas na hora no Onvio. Da primeira vez demora mais; depois só lê o que mudou.</small></div>';
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
        kpi('av-k-qual', 'Alertas evitáveis', '<span class="' + (e.g3Esc ? 'late' : '') + '">' + num(e.g3Esc) + '</span>', '<span class="av-d">críticas (G3) na vez do escritório</span>') +
      '</div>' +
    '</section>' +
    '<div class="av-como" id="av-como-txt" hidden><b>Como a nota é calculada (0 a 100)</b><ul>' + COMP.map(([k, rot, d]) => '<li><b>' + rot + ' · peso ' + r.pesos[k] + '</b> ' + esc(d) + '</li>').join('') + '</ul>' +
      '<p><b>Para ser justa:</b> o tempo que conta é só o tempo em que a vez era do escritório (lido nos trâmites de cada entrega); a entrega conta para quem a concluiu, não para o responsável atual; atrasos de origem do cliente não pesam; com poucas entregas, os percentuais são puxados para a média da equipe, e abaixo de ' + r.minEntregas + ' entregas no período a pessoa aparece sem posição ("poucos dados"); item sem dado recebe o valor da equipe. O gestor pode tirar um caso da conta ("Não contar", no detalhe de cada pessoa). Pesos e mínimo podem vir do arquivo de regras (avaliacao).</p>' +
      '<p>Faixas: 85+ Excelente · 70+ Bom · 50+ Atenção · abaixo, Precisa de apoio. É um retrato para conversar com a equipe, não um julgamento automático.</p></div>' +
    '<div class="av-grade">' +
      '<section class="card av-rank-card"><div class="card-h"><h3>Classificação de desempenho</h3><span class="sub">clique numa linha para ver o detalhe · no cabeçalho para ordenar</span></div><div class="card-b"><div class="av-rank" id="av-rank"></div></div></section>' +
      '<section class="card"><div class="card-h"><h3>Entregas no período</h3><span class="sub">no prazo × fora do prazo, por analista</span></div><div class="card-b"><div id="av-barras"></div></div></section>' +
    '</div>' +
    '';

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

  function abrir(resp) {
    aberto = resp;
    $$('#av-rank [data-resp]', el).forEach(c => c.classList.toggle('ativo', c.dataset.resp === aberto));
    desenhar();
    abrirPessoa(resp, { ans, ctx, recalcular: () => render(el, ctx, params), fechou: () => { $$('#av-rank [data-resp]', el).forEach(c => c.classList.remove('ativo')); desenhar(); } });
  }
  // a janela da pessoa continua aberta numa leitura nova ou depois de "Não contar": atualiza com a conta nova
  if (aberto && pessoaAberta()) abrirPessoa(aberto, { ans, ctx, recalcular: () => render(el, ctx, params), fechou: () => { $$('#av-rank [data-resp]', el).forEach(c => c.classList.remove('ativo')); desenhar(); } }, true);
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

// Linha de um caso que pesa na nota, com "Não contar" (o gestor tira da conta; fica só no Chrome dele)
function itemExc(i, tag, cor, porque) {
  return '<div class="item-ag clicavel" tabindex="0" data-k="' + esc(i.k) + '"><span class="pr-tag" style="--pc:' + cor + '">' + esc(tag) + '</span><div class="tx"><b>#' + esc(i.num) + ' ' + esc(i.apelido || i.cliente || '—') + '</b><small>' + esc([i.typeLabel, i.detalhe].filter(Boolean).join(' · ')) + '</small><small class="av-porque">' + esc(porque) + '</small></div>' +
    '<div class="acts"><button type="button" class="btn btn-sm" data-exc="' + esc(i.k) + '" title="Tira este caso da avaliação (por exemplo, um problema que não foi da pessoa)">Não contar</button></div></div>';
}

/* ---------- janela da pessoa (por cima da tela) ----------
 * Nota e resumo no topo; os 5 itens da nota como abas: abre no que mais puxa a nota para baixo e mostra só os casos
 * que pesam naquele item (clicar abre a solicitação; "Não contar" tira da conta). ← → passam para a próxima pessoa. */
let foco = null;          // item da nota em foco na janela
let pessoaCtx = null;     // { ans, ctx, recalcular, fechou }
const pessoaAberta = () => { const d = document.getElementById('dlg-pessoa'); return !!d && !d.hidden; };
function garantirDlg() {
  if (document.getElementById('dlg-pessoa')) return;
  const f = document.createElement('div'); f.className = 'fundo'; f.id = 'fundo-pessoa'; f.hidden = true; f.style.zIndex = 48; f.onclick = fecharPessoa;
  const d = document.createElement('section'); d.className = 'dlg dlg-pessoa'; d.id = 'dlg-pessoa'; d.hidden = true; d.tabIndex = -1; d.style.zIndex = 49;
  d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', 'Desempenho da pessoa');
  document.body.append(f, d);
  addEventListener('hashchange', () => { if (pessoaAberta()) fecharPessoa(); });
  // antes do atalho geral do app: com a solicitação aberta por cima, quem fecha é ela
  addEventListener('keydown', e => {
    if (!pessoaAberta() || detalheAberto()) return;
    if (e.key === 'Escape') { e.stopImmediatePropagation(); fecharPessoa(); }
    else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.target.matches('input, select, textarea')) { e.preventDefault(); andarPessoa(e.key === 'ArrowLeft' ? -1 : 1); }
  }, true);
}
function fecharPessoa() {
  const d = document.getElementById('dlg-pessoa'); if (!d) return;
  d.hidden = true; d.innerHTML = ''; document.getElementById('fundo-pessoa').hidden = true;
  aberto = null; foco = null;
  if (pessoaCtx && pessoaCtx.fechou) pessoaCtx.fechou();
}
function andarPessoa(dlt) {
  const l = pessoaCtx.ans, p = l.findIndex(x => x.resp === aberto), prox = l[p + dlt];
  if (prox) { foco = null; aberto = prox.resp; abrirPessoa(prox.resp, pessoaCtx, true); }
}
// casos que pesam em cada item, com a frase de por quê
function casosDe(a, k) {
  const g = i => { const pg = i.grav === 3 ? porqueGrav(i) : null; return pg ? pg.texto.replace(/^Crítica \(G3\) porque /, 'crítica (G3): ') : ''; };
  if (k === 'pontualidade') return a.foraDoPrazo.map(x => ({ item: x.item, tag: 'Fora do prazo', cor: 'var(--viz-serious)', porque: fmt1(x.tempo) + ' d.u. com o escritório (prazo ' + x.prazo + ')' + (x.estimado ? ' · estimado: sem leitura dos trâmites' : '') }));
  if (k === 'ritmo') return a.lentas.map(x => ({ item: x.item, tag: 'Mais lenta', cor: 'var(--viz-warn)', porque: fmt1(x.tempo) + ' d.u. com o escritório; o normal da equipe neste tipo é ' + fmt1(x.normal) + ' d.u.' }));
  if (k === 'emDia') return a.atrasadas.map(x => ({ item: x.item, tag: x.item.nivel === 2 ? 'Fora do prazo' : 'Vence hoje', cor: x.item.nivel === 2 ? 'var(--viz-serious)' : 'var(--viz-warn)', porque: x.motivo }));
  if (k === 'cuidado') return a.evitaveis.map(x => ({ item: x.item, tag: x.item.lado === 'fim' ? 'Prescrita' : 'Crítica (G3)', cor: 'var(--viz-crit)', porque: x.item.lado === 'fim' ? x.motivo : (g(x.item) || x.motivo) }));
  return a.semResposta.map(x => ({ item: x.item, tag: 'Sem resposta', cor: 'var(--viz-warn)', porque: 'sem o 1º trâmite há ' + x.dias + ' d.u.' }));
}
function abrirPessoa(resp, c, atualizar) {
  garantirDlg();
  pessoaCtx = c;
  const l = c.ans, a = l.find(x => x.resp === resp);
  if (!a) { fecharPessoa(); return; }
  const pesos = Object.assign({}, OC.DEFAULTS.pesosNota, estado.settings.pesosNota || {});
  const ativos = COMP.filter(([k]) => (pesos[k] || 0) > 0);
  // abre no item que mais puxa a nota para baixo
  if (!foco || !ativos.some(([k]) => k === foco)) foco = ativos.slice().sort((x, y) => (a.componentes[x[0]] ?? 101) - (a.componentes[y[0]] ?? 101))[0][0];
  const p = l.findIndex(x => x.resp === resp);
  const menor = ativos.slice().sort((x, y) => (a.componentes[x[0]] ?? 101) - (a.componentes[y[0]] ?? 101))[0];
  const d = document.getElementById('dlg-pessoa');
  const n = (rot, val, det) => '<div class="pp-n"><span>' + rot + '</span><b>' + val + '</b>' + (det ? '<small>' + det + '</small>' : '') + '</div>';
  const per = dd => dd.slice(8, 10) + '/' + dd.slice(5, 7);
  d.innerHTML =
    '<div class="dlg-head"><div class="tt"><div class="dlg-l1"><span>' + (a.pos ? a.pos + 'º no ranking' : 'Poucos dados · sem posição') + '</span><span>últimos 30 dias</span></div><h2>' + esc(a.resp) + '</h2></div>' +
      '<div class="dlg-nav"><button class="icon-btn" id="pp-ant" title="Anterior (←)" aria-label="Anterior"' + (p <= 0 ? ' disabled' : '') + '><svg class="ic"><use href="#i-chev-l"/></svg></button><span>' + (p + 1) + ' de ' + l.length + '</span><button class="icon-btn" id="pp-prox" title="Próxima (→)" aria-label="Próxima"' + (p >= l.length - 1 ? ' disabled' : '') + '><svg class="ic"><use href="#i-chev-r"/></svg></button></div>' +
      '<button class="icon-btn" id="pp-fechar" aria-label="Fechar" title="Fechar (Esc)"><svg class="ic"><use href="#i-x"/></svg></button></div>' +
    '<div class="pp-hero" style="--c:' + cor(COR_FAIXA[a.faixa.k]) + '">' +
      anelProgresso(a.nota, '<b>' + (a.nota == null ? '–' : a.nota) + '</b><small>nota</small>', { tam: 92 }) +
      '<div class="pp-resumo"><span class="av-chip' + (a.poucosDados ? ' av-chip-pouco' : '') + '">' + (a.poucosDados ? 'Poucos dados' : esc(a.faixa.rot)) + '</span>' +
        '<p>' + (menor && a.componentes[menor[0]] != null && a.componentes[menor[0]] < 85 ? 'O que mais puxa a nota para baixo: <b>' + esc(menor[1].toLowerCase()) + '</b> (' + a.componentes[menor[0]] + ').' : 'Todos os itens acima de 85.') +
          (a.poucosDados ? ' Com só ' + plural(a.concluidas, 'entrega', 'entregas') + ', os números foram puxados para a média da equipe.' : '') + '</p>' +
        '<div class="pp-nums">' + n('Entregas', num(a.concluidas), setinha(a.variacao.concluidas) + ' anterior ' + num(a.anterior.concluidas)) + n('No prazo', pctTxt(a.pctNoPrazo), a.noPrazo + ' de ' + a.concluidas) +
          n('Com o escritório', fmt1(a.tempoMedio) + ' d.u.', 'média por entrega') + n('Carteira', num(a.carteira), a.esc + ' a responder') + '</div></div>' +
      '<div class="pp-dias" title="Entregas por dia">' + miniBarras(a.porDia.map(x => ({ rot: per(x.dia), n: x.n })), { largura: 180, altura: 40, titulo: 'Entregas por dia' }) + '<small>entregas por dia</small></div>' +
    '</div>' +
    '<div class="pp-comps" role="tablist">' + ativos.map(([k, rot]) => {
      const v = a.componentes[k], b = a.brutos[k], casos = casosDe(a, k).length;
      return '<button type="button" role="tab" class="pp-comp' + (foco === k ? ' on' : '') + '" data-comp="' + k + '" aria-selected="' + (foco === k) + '">' +
        '<span class="pp-comp-rot">' + rot + (casos ? '<em>' + casos + '</em>' : '') + '</span><b>' + (v == null ? '–' : v) + '</b><i class="av-barra"><i style="width:' + (v || 0) + '%"></i></i>' +
        '<small>' + (b == null ? 'sem dado: valor da equipe' : b !== v ? 'próprio ' + b + ' · ajustado' : 'peso ' + pesos[k]) + '</small></button>';
    }).join('') + '</div>' +
    '<div class="pp-painel" id="pp-painel">' + painelHtml(a) + '</div>' +
    '<div class="dlg-actions"><button class="btn btn-sm" id="pp-fila"><svg class="ic ic-sm"><use href="#i-list"/></svg> Ver a fila da pessoa</button><span class="spacer"></span><small class="fraco">Clique num caso para abrir a solicitação · "Não contar" tira o caso da avaliação</small></div>';
  d.hidden = false; document.getElementById('fundo-pessoa').hidden = false;
  if (!atualizar) { d.classList.remove('pp-entra'); void d.offsetWidth; d.classList.add('pp-entra'); d.focus(); }
  ligarPessoa(a);
}
function painelHtml(a) {
  const item = COMP.find(([k]) => k === foco);
  const casos = casosDe(a, foco);
  return '<p class="pp-expl">' + esc(item[2].charAt(0).toUpperCase() + item[2].slice(1)) + '.</p>' +
    (casos.length ? '<div class="av-det-l" id="pp-lista">' + casos.map(x => itemExc(x.item, x.tag, x.cor, x.porque)).join('') + '</div>'
      : '<div class="hj-zen">' + (foco === 'ritmo' && a.ritmo == null ? 'Sem entregas para comparar no período.' : 'Nada pesando neste item.') + '</div>');
}
function ligarPessoa(a) {
  const d = document.getElementById('dlg-pessoa'), c = pessoaCtx.ctx;
  d.querySelector('#pp-fechar').onclick = fecharPessoa;
  d.querySelector('#pp-ant').onclick = () => andarPessoa(-1);
  d.querySelector('#pp-prox').onclick = () => andarPessoa(1);
  d.querySelector('#pp-fila').onclick = () => { const r = a.resp; fecharPessoa(); c.navegar('fila', { analista: r }); };
  const ligarLista = () => {
    const box = d.querySelector('#pp-lista');
    if (!box) return;
    ligarItens(box, casosDe(a, foco).map(x => x.item), c.abrirDetalhe);
    box.querySelectorAll('[data-exc]').forEach(b => b.addEventListener('click', async ev => {
      ev.stopPropagation();
      await marcarExcecao(b.dataset.exc, true);
      toast('Caso fora da conta (só para a avaliação; pode voltar no topo da tela)');
      pessoaCtx.recalcular();
    }));
  };
  d.querySelectorAll('[data-comp]').forEach(b => b.onclick = () => {
    foco = b.dataset.comp;
    d.querySelectorAll('[data-comp]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', String(x === b)); });
    const pn = d.querySelector('#pp-painel');
    pn.innerHTML = painelHtml(a);
    pn.classList.remove('pp-troca'); void pn.offsetWidth; pn.classList.add('pp-troca');
    ligarLista();
  });
  ligarLista();
}

function carga(el, ctx) {
  const it = itens(), an = OC.porAnalista(it);
  const semResp = it.filter(i => !i.resp);

  const pts = it.filter(i => i.ptUteis != null);
  const ptMedia = pts.length ? Math.round(pts.reduce((s, i) => s + i.ptUteis, 0) / pts.length * 10) / 10 : null;
  const hojeK = OC.ymd(new Date());
  const hoje = (estado.serie || {})[hojeK] || { entradas: 0, saidas: 0, horas: {} };

  const kpis = [
    { k: 'todas', rot: 'Pendências', val: it.length, det: plural(it.filter(i => i.lado === 'esc').length, 'com o escritório', 'com o escritório'), cls: '' },
    { k: 'semresp', rot: 'Sem responsável', val: semResp.length, det: 'para distribuir', cls: semResp.length ? 'today' : 'ok' },
    { k: 'atraso', rot: 'Fora do prazo', val: it.filter(i => i.nivel === 2).length, det: plural(it.filter(i => i.grav === 3).length, 'crítica (G3)', 'críticas (G3)'), cls: 'late' },
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
    '';

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
    else if (k === 'atraso') ctx.navegar('fila', { escopo: 'equipe', kpi: k });
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

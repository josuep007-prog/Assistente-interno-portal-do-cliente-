/* Equipe · área do gestor, com senha: avaliação de desempenho e qualidade dos atendimentos.
 * Abas: Desempenho (nota de cada analista, entregas no período, pontualidade, carteira em dia, cuidado e agilidade,
 * com a comparação ao período anterior), Carga (números e gráficos da fila de hoje) e Responsáveis (idade da fila).
 * As entregas são lidas na hora pelo service worker (cmd 'desempenho'); nada é guardado. A senha fica só como
 * resumo SHA-256 (settings.senhaGestorSha256): é uma trava leve, não segurança forte. */
import { estado, itens, enviar } from '../estado.js';
import { esc, plural, num, fmtDataCurta, toast, ligarItens, $, $$ } from '../util.js';
import { barrasEmpilhadas, barrasAgrupadas, linhaDoDia, ligarDicas, anelProgresso, miniBarras, dispersao, animarNumeros, cor } from '../graficos.js';
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
  campo.focus();
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const ok = (await sha256(campo.value)) === String(estado.settings.senhaGestorSha256 || '').toLowerCase();
    campo.value = '';
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
let animar = true;
const COR_FAIXA = { otimo: 'ok', bom: 's1', atencao: 'warn', critico: 'crit', sem: 'var(--ink-3)' };
const COMP = [
  ['pontualidade', 'Pontualidade', 'entregas concluídas dentro do prazo interno (3 d.u. simples, 5 cálculo)'],
  ['emDia', 'Carteira em dia', 'pendências com o escritório sem atraso agora'],
  ['cuidado', 'Cuidado', 'sem críticas (G3) na carteira e sem solicitações prescritas no período'],
  ['agilidade', 'Agilidade', 'tempo até o 1º trâmite do escritório (estimativa)']
];
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
  const r = resultado, e = r.equipe, ans = r.analistas;
  const per = (d => d.slice(8, 10) + '/' + d.slice(5, 7));
  const kpi = (id, rot, val, det, extra) => '<div class="av-kpi" id="' + id + '"><span class="av-kpi-rot">' + rot + '</span><b class="av-kpi-val">' + val + '</b>' + (det || '') + (extra || '') + '</div>';
  el.innerHTML =
    (r.erros && r.erros.length ? '<div class="faixa warn"><svg class="ic"><use href="#i-alert"/></svg>Algumas listas não foram lidas: ' + esc(r.erros.join(' · ')) + '. A avaliação pode estar incompleta.</div>' : '') +
    '<section class="av-hero">' +
      '<div class="av-nota s-' + e.faixa.k + '" style="--c:' + cor(COR_FAIXA[e.faixa.k]) + '">' + anelProgresso(e.nota, '<b data-conta="' + (e.nota || 0) + '" data-de="0">' + (e.nota == null ? '–' : e.nota) + '</b><small>nota</small>', { tam: 132 }) +
        '<div><span class="av-eyebrow">Equipe · ' + per(r.de) + ' a ' + per(r.ate) + '</span><h2>' + esc(e.faixa.rot) + '</h2><p>' + plural(ans.length, 'analista avaliado', 'analistas avaliados') + ' · nota de 0 a 100</p>' +
        '<button type="button" class="linkish" id="av-como">Como a nota é calculada</button></div></div>' +
      '<div class="av-kpis">' +
        kpi('av-k-entregas', 'Entregas', '<span data-conta="' + e.concluidas + '" data-de="0">' + num(e.concluidas) + '</span>', delta(e.variacao.concluidas, '', true), miniBarras(e.porDia.map(d => ({ rot: per(d.dia), n: d.n })), { largura: 150, titulo: 'Entregas por dia' })) +
        kpi('av-k-prazo', 'No prazo', pctTxt(e.pctNoPrazo), delta(e.variacao.pctNoPrazo, ' p.p.', true), '<i class="av-barra"><i style="width:' + (e.pctNoPrazo || 0) + '%"></i></i>') +
        kpi('av-k-tempo', 'Tempo de conclusão', fmt1(e.tempoMedio) + '<small> d.u.</small>', '<span class="av-d">média da abertura à conclusão</span>') +
        kpi('av-k-emdia', 'Carteira em dia', pctTxt(e.pctEmDia), '<span class="av-d">' + plural(e.esc, 'pendência', 'pendências') + ' com o escritório agora</span>', '<i class="av-barra"><i style="width:' + (e.pctEmDia || 0) + '%"></i></i>') +
        kpi('av-k-pt', '1º trâmite', fmt1(e.primeiroTramite) + '<small> d.u.</small>', '<span class="av-d">média · estimativa</span>') +
        kpi('av-k-qual', 'Alertas de qualidade', '<span class="' + (e.g3 + e.prescritas ? 'late' : '') + '">' + num(e.g3 + e.prescritas) + '</span>', '<span class="av-d">' + e.g3 + ' críticas (G3) · ' + e.prescritas + ' prescritas no período</span>') +
      '</div>' +
    '</section>' +
    '<div class="av-como" id="av-como-txt" hidden><b>Como a nota é calculada (0 a 100)</b><ul>' + COMP.map(([k, rot, d]) => '<li><b>' + rot + ' · peso ' + r.pesos[k] + '</b> ' + esc(d) + '</li>').join('') + '</ul><p>Só entram os itens que a pessoa tem no período (sem entregas, a pontualidade fica de fora). Faixas: 85+ Excelente · 70+ Bom · 50+ Atenção · abaixo, Precisa de apoio. É um retrato para conversar com a equipe, não um julgamento automático.</p></div>' +
    '<div class="av-grade">' +
      '<section class="card av-rank-card"><div class="card-h"><h3>Ranking de desempenho</h3><span class="sub">clique numa pessoa para ver o detalhe</span></div><div class="card-b"><div class="av-rank" id="av-rank">' +
        (ans.length ? ans.map((a, n) => cartaoAnalista(a, n)).join('') : '<div class="vazio">Nenhum analista com pendências ou entregas no período.</div>') + '</div></div></section>' +
      '<section class="card"><div class="card-h"><h3>Volume × pontualidade</h3><span class="sub">cada bolinha é uma pessoa · linhas = mediana da equipe</span></div><div class="card-b"><div id="av-disp"></div>' +
        '<div class="legenda-viz">' + ['otimo', 'bom', 'atencao', 'critico'].map(k => '<span><i style="background:' + cor(COR_FAIXA[k]) + '"></i>' + OC.faixaNota({ otimo: 90, bom: 75, atencao: 60, critico: 10 }[k]).rot + '</span>').join('') + '</div></div></section>' +
    '</div>' +
    '<div id="av-det">' + (aberto ? detalheAnalista(ans.find(a => a.resp === aberto)) : '') + '</div>';

  const desenhar = () => {
    const box = $('#av-disp', el);
    if (!box) return;
    box.innerHTML = dispersao(ans.map(a => ({ id: a.resp, rot: a.resp.split(' ')[0], x: a.concluidas, y: a.pctNoPrazo, cor: COR_FAIXA[a.faixa.k], tip: a.resp + '\n' + num(a.concluidas) + ' entregas · ' + pctTxt(a.pctNoPrazo) + ' no prazo\nnota ' + (a.nota == null ? '–' : a.nota) + ' · ' + a.faixa.rot })),
      { largura: Math.max(360, Math.round(box.clientWidth)), altura: 300, rotX: 'Entregas no período', ativo: aberto, quadrantes: ['Referência', 'No prazo, pouco volume', 'Precisa de apoio', 'Volume com atraso'], titulo: 'Entregas × % no prazo por analista' });
    $$('.dp-p', box).forEach(g => { const ir = () => abrir(g.dataset.id); g.addEventListener('click', ir); g.addEventListener('keydown', ev => { if (ev.key === 'Enter') ir(); }); });
  };
  desenhar();
  ctx.aoRedimensionar(desenhar);
  ligarDicas(el);
  if (animar) { animar = false; el.classList.remove('av-anim'); void el.offsetWidth; el.classList.add('av-anim'); animarNumeros(el); }
  $('#av-como', el).onclick = () => { const t = $('#av-como-txt', el); t.hidden = !t.hidden; };
  $$('#av-rank [data-resp]', el).forEach(c => { const ir = () => abrir(c.dataset.resp); c.addEventListener('click', ir); c.addEventListener('keydown', ev => { if (ev.key === 'Enter') ir(); }); });
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
  }
}

function cartaoAnalista(a, n) {
  const c = cor(COR_FAIXA[a.faixa.k]);
  return '<article class="av-card' + (aberto === a.resp ? ' ativo' : '') + '" tabindex="0" role="button" data-resp="' + esc(a.resp) + '" style="--c:' + c + ';--i:' + (n + 1) + '">' +
    '<span class="av-pos">' + (n + 1) + 'º</span>' +
    anelProgresso(a.nota, '<b>' + (a.nota == null ? '–' : a.nota) + '</b>', { tam: 56 }) +
    '<div class="av-card-tx"><b>' + esc(a.resp) + '</b><span class="av-chip">' + esc(a.faixa.rot) + '</span>' +
      '<div class="av-comps">' + COMP.map(([k, rot, d]) => { const v = a.componentes[k]; return '<span class="av-comp" title="' + esc(rot + ': ' + d) + '"><em>' + rot + '</em><i class="av-barra"><i style="width:' + (v == null ? 0 : v) + '%"></i></i><small>' + (v == null ? '–' : v) + '</small></span>'; }).join('') + '</div></div>' +
    '<div class="av-card-pe"><b>' + num(a.concluidas) + '</b><small>entregas</small>' + delta(a.variacao.concluidas, '', true) + miniBarras(a.porDia.map(d => ({ rot: d.dia.slice(8, 10) + '/' + d.dia.slice(5, 7), n: d.n })), { largura: 96, altura: 22, titulo: 'Entregas por dia' }) + '</div>' +
  '</article>';
}

function detalheAnalista(a) {
  if (!a) return '';
  const lin = (rot, val, det) => '<div class="av-det-n"><span>' + rot + '</span><b>' + val + '</b>' + (det ? '<small>' + det + '</small>' : '') + '</div>';
  return '<section class="card av-det" style="--c:' + cor(COR_FAIXA[a.faixa.k]) + '"><div class="card-h"><h3>' + esc(a.resp) + ' · nota ' + (a.nota == null ? '–' : a.nota) + ' (' + esc(a.faixa.rot) + ')</h3>' +
    '<button class="lk" id="av-det-fila">Ver a fila da pessoa</button><button class="lk" id="av-det-fechar">Fechar</button></div><div class="card-b">' +
    '<div class="av-det-grade">' +
      lin('Entregas', num(a.concluidas), 'anterior: ' + num(a.anterior.concluidas)) +
      lin('No prazo', pctTxt(a.pctNoPrazo), a.noPrazo + ' de ' + a.concluidas + (a.anterior.pctNoPrazo != null ? ' · anterior: ' + a.anterior.pctNoPrazo + '%' : '')) +
      lin('Tempo de conclusão', fmt1(a.tempoMedio) + ' d.u.', 'da abertura à conclusão') +
      lin('Carteira', num(a.carteira), a.esc + ' com o escritório · ' + pctTxt(a.pctEmDia) + ' em dia') +
      lin('1º trâmite', fmt1(a.primeiroTramite) + ' d.u.', 'média · estimativa') +
      lin('Qualidade', num(a.g3 + a.prescritas), a.g3 + ' G3 · ' + a.prescritas + ' prescritas · ' + a.paradas + ' paradas · ' + a.respondeu + ' com resposta do cliente esperando') +
    '</div>' +
    '<h4 class="av-det-h">Pontos de atenção agora</h4>' +
    (a.atencao.length ? '<div class="av-det-l" id="av-det-l">' + a.atencao.map(i => '<div class="item-ag clicavel" tabindex="0" data-k="' + esc(i.k) + '"><span class="pr-tag" style="--pc:' + (i.grav === 3 ? 'var(--viz-crit)' : 'var(--viz-serious)') + '">' + (i.grav === 3 ? 'Crítica (G3)' : 'Parada há ' + (i.parado || 0) + ' d') + '</span><div class="tx"><b>#' + esc(i.num) + ' ' + esc(i.apelido || i.cliente || '—') + '</b><small>' + esc([i.typeLabel, i.detalhe].filter(Boolean).join(' · ')) + '</small></div></div>').join('') + '</div>'
      : '<div class="hj-zen">Nenhuma crítica nem parada na carteira agora.</div>') +
    '</div></section>';
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

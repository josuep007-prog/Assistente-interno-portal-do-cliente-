/* Configurações (rota #/config) · as regras em vigor em linguagem simples, com o efeito de cada ajuste na fila AGORA
 * (as pendências lidas são reavaliadas com os números novos antes de salvar). Abas: Prazos, Leitura e avisos,
 * Feriados, Palavras (como a extensão lê os textos) e Avançado (arquivo de regras, aprender ações, diagnóstico).
 * Grava só o que difere do padrão em vigor (__v: 2), como a página de opções. */
import { estado, itens, enviar, aoMudar } from '../estado.js';
import { $, $$, esc, toast } from '../util.js';
const OC = window.OC;

const GRUPOS = [
  { titulo: 'Vez do escritório', ic: 'i-briefcase', campos: [
    { k: 'primeiroTramite', rot: 'Primeiro trâmite', un: 'dias úteis', ajuda: 'Depois disso, solicitação sem resposta do escritório fica fora do prazo.' },
    { k: 'conclusaoSimples', rot: 'Concluir demanda simples', un: 'dias úteis', ajuda: 'O cliente é avisado do mesmo prazo pelo Assistente do Portal.' },
    { k: 'conclusaoCalculo', rot: 'Concluir cálculo', un: 'dias úteis', ajuda: 'Cálculo de férias e de rescisão.' },
    { k: 'parada', rot: 'Parada sem movimentação', un: 'dias corridos', ajuda: 'Na vez do escritório, sem nenhum trâmite nesse tempo.' },
    { k: 'foraDoPortalDias', rot: 'Provavelmente resolvida fora do portal', un: 'dias sem resposta', ajuda: 'Na vez do escritório e sem movimentação: vira sugestão de concluir no Hoje. 0 desliga.' }
  ] },
  { titulo: 'Vez do cliente', ic: 'i-user', campos: [
    { k: 'clienteSemRetorno', rot: 'Cliente sem retorno', un: 'dias úteis', ajuda: 'A partir daí a solicitação pede uma cobrança ao cliente.' },
    { k: 'resolvidaClienteDias', rot: 'Considerar resolvida depois de', un: 'dias úteis', ajuda: 'Se a última resposta do analista não pede nada ao cliente. 0 desliga.' },
    { k: 'prescricaoDias', rot: 'Prescrição no Onvio', un: 'dias', ajuda: 'Regra do Onvio, só informativa (a prescrição não gera alerta): só mude se o Onvio mudar.' }
  ] },
  { titulo: 'Respostas ao cliente', ic: 'i-chat', campos: [
    { k: 'desfazerSeg', rot: 'Tempo para desfazer o envio', un: 'segundos', ajuda: 'Depois de "Enviar", a extensão espera esse tempo antes de escrever no Onvio (trâmite não pode ser excluído). 0 desliga.' }
  ] },
  { titulo: 'Prazos legais e admissão', ic: 'i-calendar', campos: [
    { k: 'pagamentoFeriasAntes', rot: 'Pagar férias até', un: 'dias antes do início', ajuda: 'CLT, art. 145.' },
    { k: 'pagamentoRescisaoDias', rot: 'Pagar rescisão em até', un: 'dias após o término', ajuda: 'CLT, art. 477, §6º.' },
    { k: 'avisoFeriasDias', rot: 'Aviso de férias com', un: 'dias de antecedência', ajuda: 'CLT, art. 135.' },
    { k: 'tempoOcupado', rot: 'Tempo de atendimento num período cheio', un: 'dias úteis', ajuda: 'Prazo legal mais perto que isso já pede ação.' },
    { k: 'admissaoAviso', rot: 'Destacar admissão a partir de', un: 'dias úteis do prazo', ajuda: 'O eSocial do empregado vence no dia anterior ao início.' },
    { k: 'estagiarioPrazoDias', rot: 'eSocial do estagiário', un: 'dias após o início', ajuda: 'Prazo do cadastro do estagiário.' }
  ] }
];
const CAMPOS = GRUPOS.flatMap(g => g.campos);
const IMPACTO = [
  { k: 'fora', rot: 'Fora do prazo', f: i => i.nivel === 2, cor: 'late' },
  { k: 'hoje', rot: 'Pedem atenção', f: i => i.nivel === 1, cor: 'today' },
  { k: 'g3', rot: 'Críticas (G3)', f: i => i.grav === 3, cor: 'late' },
  { k: 'admissao', rot: 'Admissões em destaque', f: i => !!i.admissaoAlerta, cor: 'today' }
];

let rascunho = {};          // números alterados na tela e ainda não salvos
let desligar = null, redesenho = 0;       // ouvinte do estado (redesenha depois de salvar ou de uma leitura nova)

const base = () => OC.combinarSettings(estado.regras, {});           // padrão do código + regras do escritório
const regrasCfg = () => (estado.regras && estado.regras.regras && estado.regras.regras.config) || {};
const doUsuario = k => estado.usuario && k in estado.usuario && JSON.stringify(estado.usuario[k]) !== JSON.stringify(base()[k]);
function origem(k) {
  if (k in rascunho) return ['nao-salvo', 'não salvo'];
  if (doUsuario(k)) return ['seu', 'seu ajuste'];
  if (k in regrasCfg()) return ['esc', 'escritório'];
  return ['padrao', 'padrão'];
}
const valor = k => (k in rascunho ? rascunho[k] : estado.settings[k]);

// Grava o que difere do padrão em vigor; "novos" sobrepõe os ajustes atuais (null tira o ajuste).
async function gravar(novos) {
  const b = base(), todos = Object.assign({}, estado.usuario || {}, novos), out = { __v: 2 };
  for (const [k, v] of Object.entries(todos)) if (k !== '__v' && v !== null && JSON.stringify(v) !== JSON.stringify(b[k])) out[k] = v;
  await chrome.storage.local.set({ settings: out });
  enviar({ cmd: 'atualizar' });
}

// As pendências lidas, reavaliadas com um conjunto de regras (sem ler o Onvio de novo).
function reavaliar(s) {
  const agora = new Date();
  return itens().map(i => Object.assign({}, i, OC.evaluate(i, s, agora)));
}

export function render(el, ctx, params) {
  const aba = ['prazos', 'leitura', 'feriados', 'palavras', 'avancado'].includes(params && params.aba) ? params.aba : 'prazos';
  ctx.cab({
    titulo: 'Configurações', sub: 'As regras em vigor, em linguagem simples',
    abas: [['prazos', 'Prazos'], ['leitura', 'Leitura e avisos'], ['feriados', 'Feriados'], ['palavras', 'Palavras'], ['avancado', 'Avançado']].map(([id, rot]) => ({ id, rot, href: '#/config' + (id === 'prazos' ? '' : '?aba=' + id) })),
    aba
  });
  if (aba !== 'prazos') rascunho = {};
  ({ prazos, leitura, feriados, palavras, avancado })[aba](el);
  // Salvou (aqui ou na aba Avançado) ou chegou leitura nova: redesenha, a não ser no meio de uma edição ou no Avançado
  if (desligar) desligar();
  desligar = aoMudar(quais => {
    if (!/^#\/config/.test(location.hash) || !el.isConnected) { desligar(); desligar = null; return; }
    if (aba === 'avancado' || Object.keys(rascunho).length || el.contains(document.activeElement) && document.activeElement.matches('input')) return;
    // fora do laço dos ouvintes: redesenhar registra um ouvinte novo, que entraria no mesmo laço
    if (quais.some(q => ['usuario', 'regras', 'snap'].includes(q))) { clearTimeout(redesenho); redesenho = setTimeout(() => { if (el.isConnected && /^#\/config/.test(location.hash)) render(el, ctx, params); }, 0); }
  });
}

/* ---------- Prazos: editar e ver o efeito na fila antes de salvar ---------- */
function prazos(el) {
  const lim = k => OC.LIMITES[k] || [0, 365];
  el.innerHTML =
    '<div class="cfg-grade">' +
      '<div class="cfg-col">' + GRUPOS.map(g => '<section class="cfg-card"><h3><svg class="ic"><use href="#' + g.ic + '"/></svg>' + esc(g.titulo) + '</h3>' +
        g.campos.map(c => { const [cls, rot] = origem(c.k), [mn, mx] = lim(c.k); return '<div class="cfg-campo" data-campo="' + c.k + '">' +
          '<div class="cfg-tx"><label for="cf-' + c.k + '">' + esc(c.rot) + '</label><small>' + esc(c.ajuda) + '</small></div>' +
          '<div class="cfg-num"><button type="button" class="icon-btn" data-menos="' + c.k + '" aria-label="Menos">−</button><input type="number" id="cf-' + c.k + '" data-k="' + c.k + '" min="' + mn + '" max="' + mx + '" value="' + esc(valor(c.k)) + '"><button type="button" class="icon-btn" data-mais="' + c.k + '" aria-label="Mais">+</button></div>' +
          '<div class="cfg-un">' + esc(c.un) + '</div>' +
          '<div class="cfg-orig"><span class="orig orig-' + cls + '" title="De onde vem o valor em vigor">' + rot + '</span>' + (cls === 'seu' ? '<button type="button" class="cfg-volta" data-volta="' + c.k + '" title="Voltar ao valor do escritório (' + esc(base()[c.k]) + ')">↺ ' + esc(base()[c.k]) + '</button>' : '') + '</div>' +
          '</div>'; }).join('') + '</section>').join('') + '</div>' +
      '<aside class="cfg-col cfg-lado">' +
        '<section class="cfg-card cfg-impacto" aria-live="polite"><h3><svg class="ic"><use href="#i-pulso"/></svg>Efeito na fila agora</h3><p class="fraco" id="cf-imp-nota"></p><div id="cf-imp"></div></section>' +
        '<section class="cfg-card"><h3><svg class="ic"><use href="#i-check"/></svg>Resolvidas sem retorno</h3><p id="cf-resolvidas"></p></section>' +
        '<div class="cfg-acoes"><button type="button" class="btn btn-sm" id="cf-desfazer">Descartar</button><button type="button" class="btn btn-sm" id="cf-padrao" title="Tira todos os seus ajustes de prazo">Usar o padrão do escritório</button><button type="button" class="btn btn-primary btn-sm" id="cf-salvar">Salvar</button></div>' +
      '</aside>' +
    '</div>';
  const atualizar = () => {
    const atual = reavaliar(estado.settings), novo = reavaliar(Object.assign({}, estado.settings, rascunho));
    const n = Object.keys(rascunho).length;
    $('#cf-imp-nota', el).textContent = !itens().length ? 'Ainda sem pendências lidas do Onvio para medir.' : n ? 'Com os números alterados (ainda não salvos), comparado com o que vale hoje, nas ' + itens().length + ' pendências lidas.' : 'As ' + itens().length + ' pendências lidas, com as regras em vigor. Mude um número para ver o efeito antes de salvar.';
    $('#cf-imp', el).innerHTML = IMPACTO.map(x => {
      const a = atual.filter(x.f).length, b = novo.filter(x.f).length, d = b - a;
      return '<div class="cfg-imp"><span>' + esc(x.rot) + '</span><b class="' + (b ? x.cor : '') + '">' + b + '</b>' + (d ? '<em class="' + (d > 0 ? 'sobe' : 'desce') + '">' + (d > 0 ? '+' : '') + d + '</em>' : '<em class="igual">=</em>') + '</div>';
    }).join('');
    const nr = ((estado.snap && estado.snap.resolvidas) || []).length, dias = valor('resolvidaClienteDias');
    $('#cf-resolvidas', el).innerHTML = dias ? '<b>' + nr + '</b> na última leitura: vez do cliente há mais de <b>' + esc(dias) + '</b> dias úteis e a última resposta do analista não pedia nada. ' + ('resolvidaClienteDias' in rascunho ? 'O número novo vale na próxima leitura (os trâmites são lidos de novo).' : '<a href="#/fila?escopo=resolvidas">Ver as resolvidas</a>') : 'Regra desligada (0): nada sai da fila sozinho.';
    $$('.cfg-campo', el).forEach(r => { const [cls, rot] = origem(r.dataset.campo), o = $('.orig', r); o.className = 'orig orig-' + cls; o.textContent = rot; });
    $('#cf-salvar', el).disabled = !n; $('#cf-desfazer', el).disabled = !n;
    $('#cf-salvar', el).textContent = n ? 'Salvar ' + n + (n === 1 ? ' ajuste' : ' ajustes') : 'Salvar';
  };
  const mudar = (k, v) => {
    const [mn, mx] = lim(k);
    v = Math.round(Number(v));
    if (!Number.isFinite(v)) return;
    v = Math.min(mx, Math.max(mn, v));
    if (v === estado.settings[k]) delete rascunho[k]; else rascunho[k] = v;
    const inp = $('#cf-' + k, el); if (inp && Number(inp.value) !== v) inp.value = v;
    atualizar();
  };
  $$('[data-k]', el).forEach(i => i.addEventListener('input', () => { if (i.value !== '') mudar(i.dataset.k, i.value); }));
  $$('[data-menos]', el).forEach(b => b.onclick = () => mudar(b.dataset.menos, valor(b.dataset.menos) - 1));
  $$('[data-mais]', el).forEach(b => b.onclick = () => mudar(b.dataset.mais, valor(b.dataset.mais) + 1));
  $$('[data-volta]', el).forEach(b => b.onclick = async () => { delete rascunho[b.dataset.volta]; await gravar({ [b.dataset.volta]: null }); toast('Voltou ao valor do escritório'); });
  $('#cf-desfazer', el).onclick = () => { rascunho = {}; CAMPOS.forEach(c => { $('#cf-' + c.k, el).value = estado.settings[c.k]; }); atualizar(); };
  $('#cf-padrao', el).onclick = async () => { rascunho = {}; await gravar(Object.fromEntries(CAMPOS.map(c => [c.k, null]))); toast('Prazos de volta ao padrão do escritório'); };
  $('#cf-salvar', el).onclick = async () => { const n = Object.keys(rascunho).length; const r = rascunho; rascunho = {}; await gravar(r); toast(n + (n === 1 ? ' ajuste salvo' : ' ajustes salvos') + ': a fila já foi relida'); };
  atualizar();
}

/* ---------- Leitura e avisos ---------- */
function leitura(el) {
  const s = estado.settings;
  const sw = (k, rot, ajuda) => '<label class="cfg-sw"><input type="checkbox" data-b="' + k + '"' + (s[k] ? ' checked' : '') + '><span class="cfg-tx"><b>' + esc(rot) + '</b><small>' + esc(ajuda) + '</small></span></label>';
  el.innerHTML =
    '<div class="cfg-grade"><div class="cfg-col">' +
      '<section class="cfg-card"><h3><svg class="ic"><use href="#i-pulso"/></svg>Leitura do Onvio</h3>' +
        '<div class="cfg-campo"><div class="cfg-tx"><label for="cf-tempoRealSeg">Verificação ao vivo a cada</label><small>Só com o Onvio visível. 0 desliga; o mínimo é 15 s.</small></div><div class="cfg-num"><input type="number" id="cf-tempoRealSeg" min="0" max="600" value="' + esc(s.tempoRealSeg) + '"></div><div class="cfg-un">segundos</div><div></div></div>' +
        '<div class="cfg-campo"><div class="cfg-tx"><label for="cf-intervalo">Leitura completa a cada</label><small>Mesmo sem mudança detectada.</small></div><div class="cfg-num"><input type="number" id="cf-intervalo" min="1" max="120" value="' + esc(s.intervalo) + '"></div><div class="cfg-un">minutos</div><div></div></div>' +
        '<p class="cfg-carga" id="cf-carga"></p>' +
      '</section>' +
      '<section class="cfg-card"><h3><svg class="ic"><use href="#i-bell"/></svg>Avisos</h3>' +
        sw('abrirAoEntrar', 'Abrir o Control Onvio ao entrar no Onvio', 'Desligado, o Onvio abre normal e o Control Onvio fica no botão.') +
        sw('notificar', 'Notificações do Chrome', 'Nova solicitação para você, cliente respondeu, prazo legal perto e solicitação urgente.') +
        sw('modoGestor', 'Modo gestor', 'Avisa também as novas solicitações sem responsável.') +
      '</section>' +
      '<div class="cfg-acoes"><span class="spacer"></span><button type="button" class="btn btn-primary btn-sm" id="cf-salvar-l">Salvar</button></div>' +
    '</div></div>';
  const carga = () => {
    const t = Number($('#cf-tempoRealSeg', el).value) || 0, iv = Math.max(1, Number($('#cf-intervalo', el).value) || 1);
    const vivo = t > 0 ? Math.round(3600 / Math.max(15, t)) : 0;
    $('#cf-carga', el).textContent = (vivo ? 'Com o Onvio na tela: até ' + vivo + ' verificações por hora (10 chamadas leves cada) e ' : 'Sem verificação ao vivo: ') + Math.round(60 / iv) + ' leituras completas por hora. Cada pessoa com o Onvio aberto soma essa carga.';
  };
  $$('#cf-tempoRealSeg, #cf-intervalo', el).forEach(i => i.addEventListener('input', carga));
  carga();
  $('#cf-salvar-l', el).onclick = async () => {
    let t = Math.round(Number($('#cf-tempoRealSeg', el).value) || 0); if (t > 0) t = Math.min(600, Math.max(15, t));
    const novos = { tempoRealSeg: t, intervalo: Math.min(120, Math.max(1, Math.round(Number($('#cf-intervalo', el).value) || 5))) };
    $$('[data-b]', el).forEach(c => { novos[c.dataset.b] = c.checked; });
    await gravar(novos);
    enviar({ cmd: 'reagendar' });
    toast('Salvo');
  };
}

/* ---------- Feriados ---------- */
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
// Feriados num calendário de 12 meses (o ano escolhido). Nacionais vêm com a extensão, os do escritório do arquivo de
// regras e os locais são só seus. Clicar num dia leva a data para o quadro ao lado (incluir ou tirar um feriado local).
let anoFer = new Date().getFullYear(), selFer = '';
function feriados(el) {
  const lista = estado.settings.feriados || [];
  const todos = new Set(lista);
  const embutidos = new Set(OC.DEFAULTS.feriados), doEsc = new Set((estado.regras && estado.regras.regras && estado.regras.regras.feriados) || []);
  const hoje = OC.ymd(new Date());
  const orig = d => (embutidos.has(d) ? ['padrao', 'nacional'] : doEsc.has(d) ? ['esc', 'do escritório'] : ['seu', 'local (só seu)']);
  const seuExtra = d => todos.has(d) && !embutidos.has(d) && !doEsc.has(d);
  const p2 = n => String(n).padStart(2, '0');
  const nomeMes = m => { const s = new Date(anoFer, m, 1).toLocaleDateString('pt-BR', { month: 'long' }); return s[0].toUpperCase() + s.slice(1); };
  const mes = m => {
    const ini = new Date(anoFer, m, 1), dias = new Date(anoFer, m + 1, 0).getDate();
    let cel = '';
    for (let i = 0; i < ini.getDay(); i++) cel += '<span></span>';
    let n = 0;
    for (let d = 1; d <= dias; d++) {
      const k = anoFer + '-' + p2(m + 1) + '-' + p2(d), dt = new Date(anoFer, m, d), fds = dt.getDay() === 0 || dt.getDay() === 6;
      const f = todos.has(k) ? orig(k) : null;
      if (f) n++;
      cel += '<button type="button" class="fa-d' + (fds ? ' fds' : '') + (f ? ' fer fer-' + f[0] : '') + (k === hoje ? ' hoje' : '') + (k === selFer ? ' sel' : '') + '" data-dia="' + k + '" title="' + p2(d) + '/' + p2(m + 1) + (f ? ' · feriado ' + f[1] : fds ? ' · fim de semana' : '') + '">' + d + '</button>';
    }
    return '<div class="fa-mes"><h4>' + nomeMes(m) + (n ? ' <span>' + n + '</span>' : '') + '</h4><div class="fa-sem">' + ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(x => '<span>' + x + '</span>').join('') + '</div><div class="fa-dias">' + cel + '</div></div>';
  };
  const doAno = lista.filter(d => d.startsWith(anoFer + '-'));
  const prox = lista.filter(d => d >= hoje).sort().slice(0, 4);
  const selTx = selFer ? selFer.slice(8, 10) + '/' + selFer.slice(5, 7) + '/' + selFer.slice(0, 4) + ' (' + SEMANA[OC.diaDe(selFer).getDay()] + ')' : '';
  const quadro = !selFer ? '<p class="fraco">Clique num dia do calendário para incluir um feriado local (municipal, ponto facultativo, recesso) ou tirar um que você incluiu.</p>'
    : seuExtra(selFer) ? '<p><b>' + selTx + '</b> é um feriado local seu.</p><div class="cfg-acoes"><span class="spacer"></span><button type="button" class="btn btn-sm" id="cf-fer-tira">Tirar este feriado</button></div>'
    : todos.has(selFer) ? '<p><b>' + selTx + '</b> é feriado ' + orig(selFer)[1] + ': vale para todos e não sai por aqui.</p>'
    : '<p><b>' + selTx + '</b> é dia útil' + ([0, 6].includes(OC.diaDe(selFer).getDay()) ? ' (fim de semana já não conta)' : '') + '.</p><div class="cfg-acoes"><span class="spacer"></span><button type="button" class="btn btn-primary btn-sm" id="cf-fer-add">Marcar como feriado local</button></div>';
  el.innerHTML =
    '<div class="cfg-grade"><div class="cfg-col">' +
      '<section class="cfg-card"><div class="fa-cab"><h3><svg class="ic"><use href="#i-calendar"/></svg>Feriados de ' + anoFer + ' <span class="fraco">' + doAno.length + '</span></h3>' +
        '<div class="fa-nav"><button type="button" class="icon-btn" id="fa-ant" aria-label="Ano anterior" title="Ano anterior"><svg class="ic"><use href="#i-chev-l"/></svg></button><button type="button" class="btn btn-sm" id="fa-hoje">Este ano</button><button type="button" class="icon-btn" id="fa-prox" aria-label="Próximo ano" title="Próximo ano"><svg class="ic"><use href="#i-chev-r"/></svg></button></div></div>' +
        '<p class="fraco">Não contam como dia útil em nenhum prazo.</p>' +
        '<div class="fa-leg"><span><i class="fer-padrao"></i>nacional</span><span><i class="fer-esc"></i>do escritório</span><span><i class="fer-seu"></i>local (só seu)</span><span><i class="fds"></i>fim de semana</span></div>' +
        '<div class="fa-ano">' + Array.from({ length: 12 }, (_, m) => mes(m)).join('') + '</div>' +
      '</section></div>' +
      '<aside class="cfg-col cfg-lado"><section class="cfg-card" id="cf-fer-quadro"><h3><svg class="ic"><use href="#i-plus"/></svg>Feriado local</h3>' + quadro + '<p class="fraco" style="margin-top:8px">Vale só no seu Chrome. Para valer para todos, peça para incluir no arquivo de regras.</p></section>' +
        '<section class="cfg-card"><h3><svg class="ic"><use href="#i-clock"/></svg>Próximos</h3>' + (prox.length ? prox.map(d => { const [cls, rot] = orig(d); return '<div class="cfg-fer"><span class="mono">' + d.slice(8, 10) + '/' + d.slice(5, 7) + '</span><span class="fraco">' + SEMANA[OC.diaDe(d).getDay()] + '</span><span class="orig orig-' + cls + '">' + rot + '</span></div>'; }).join('') : '<div class="fraco">Nenhum feriado à frente.</div>') + '</section></aside>' +
    '</div>';
  const redesenhar = () => feriados(el);
  $('#fa-ant', el).onclick = () => { anoFer--; redesenhar(); };
  $('#fa-prox', el).onclick = () => { anoFer++; redesenhar(); };
  $('#fa-hoje', el).onclick = () => { anoFer = new Date().getFullYear(); redesenhar(); };
  $$('[data-dia]', el).forEach(b => b.onclick = () => { selFer = selFer === b.dataset.dia ? '' : b.dataset.dia; redesenhar(); });
  if ($('#cf-fer-add', el)) $('#cf-fer-add', el).onclick = async () => { const d = selFer; await gravar({ feriados: lista.concat(d).sort() }); toast('Feriado local incluído: ' + d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4)); };
  if ($('#cf-fer-tira', el)) $('#cf-fer-tira', el).onclick = async () => { const d = selFer; await gravar({ feriados: lista.filter(x => x !== d) }); toast('Feriado retirado'); };
}

/* ---------- Palavras: como a extensão lê os textos (só leitura; mudam pelo arquivo de regras) ---------- */
function palavras(el) {
  const s = estado.settings;
  const chips = l => '<div class="cfg-chips">' + (l || []).map(p => '<span>' + esc(p) + '</span>').join('') + '</div>';
  el.innerHTML =
    '<div class="cfg-grade"><div class="cfg-col">' +
      '<section class="cfg-card"><h3><svg class="ic"><use href="#i-chat"/></svg>A resposta do analista ainda pede algo ao cliente</h3><p class="fraco">Com qualquer uma destas palavras (ou uma pergunta) na última resposta, a solicitação na vez do cliente continua pendente e não conta como resolvida.</p>' + chips(s.pedidoAoCliente) + '</section>' +
      '<section class="cfg-card"><h3><svg class="ic"><use href="#i-check"/></svg>Frases de cortesia (não são pedido)</h3><p class="fraco">Tiradas do texto antes de procurar as palavras acima.</p>' + chips(s.cortesiaCliente) + '</section>' +
      '<section class="cfg-card"><h3><svg class="ic"><use href="#i-layers"/></svg>Possível aba errada (Geral)</h3><p class="fraco">Assunto da Geral com estas palavras sugere a lista específica.</p>' +
        (s.abaErrada || []).map(a => '<div class="cfg-aba"><b>' + esc((OC.TYPE_BY_KEY[a.tipo] || {}).label || a.tipo) + '</b>' + chips(a.palavras) + '</div>').join('') + '</section>' +
      '<p class="fraco">Essas listas vêm do arquivo de regras do escritório (aba Avançado), para valerem igual para todos.</p>' +
    '</div></div>';
}

/* ---------- Avançado: a página de opções completa (arquivo de regras, aprender ações, diagnóstico) ---------- */
// options.html precisa estar em web_accessible_resources: o app roda dentro da página do Onvio, e o Chrome bloqueia
// páginas da extensão em quadros desse contexto se não estiverem liberadas. "Abrir em outra aba" fica de reserva.
function avancado(el) {
  el.innerHTML = '<div class="cfg-frame-barra"><span class="fraco">Arquivo de regras do escritório, aprender ações e diagnóstico.</span><button type="button" class="btn btn-sm" id="cfg-aba"><svg class="ic ic-sm"><use href="#i-link"/></svg> Abrir em outra aba</button></div>' +
    '<iframe class="cfg-frame" src="../options.html" title="Configurações avançadas do Control Onvio"></iframe>';
  el.querySelector('#cfg-aba').onclick = () => { try { chrome.runtime.openOptionsPage(); } catch (e) { window.open('../options.html', '_blank'); } };
}

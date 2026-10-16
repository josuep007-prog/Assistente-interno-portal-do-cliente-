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
    { k: 'parada', rot: 'Parada sem movimentação', un: 'dias corridos', ajuda: 'Na vez do escritório, sem nenhum trâmite nesse tempo.' }
  ] },
  { titulo: 'Vez do cliente', ic: 'i-user', campos: [
    { k: 'clienteSemRetorno', rot: 'Cliente sem retorno', un: 'dias úteis', ajuda: 'A partir daí a solicitação pede uma cobrança ao cliente.' },
    { k: 'resolvidaClienteDias', rot: 'Considerar resolvida depois de', un: 'dias úteis', ajuda: 'Se a última resposta do analista não pede nada ao cliente. 0 desliga.' },
    { k: 'prescricaoAviso', rot: 'Alerta de prescrição a partir de', un: 'dias parada', ajuda: 'Fica vermelho com a contagem até a prescrição.' },
    { k: 'prescricaoDias', rot: 'Prescrição no Onvio', un: 'dias', ajuda: 'Regra do Onvio: só mude se o Onvio mudar.' }
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
  { k: 'prescreve', rot: 'Prescrevem em até 5 dias', f: i => i.prescreveEm != null && i.prescreveEm <= 5, cor: 'today' },
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
        sw('notificar', 'Notificações do Chrome', 'Nova solicitação para você, cliente respondeu, prazo estourou, prescrição perto.') +
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
function feriados(el) {
  const lista = estado.settings.feriados || [];
  const embutidos = new Set(OC.DEFAULTS.feriados), doEsc = new Set((estado.regras && estado.regras.regras && estado.regras.regras.feriados) || []);
  const hoje = OC.ymd(new Date()), ate = OC.ymd(new Date(Date.now() + 400 * 864e5));
  const prox = lista.filter(d => d >= hoje && d <= ate).sort();
  const porMes = {};
  prox.forEach(d => { const m = d.slice(0, 7); (porMes[m] = porMes[m] || []).push(d); });
  const nomeMes = m => { const s = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); return s[0].toUpperCase() + s.slice(1); };
  const orig = d => (embutidos.has(d) ? ['padrao', 'nacional'] : doEsc.has(d) ? ['esc', 'escritório'] : ['seu', 'seu']);
  const seuExtra = d => !embutidos.has(d) && !doEsc.has(d);
  el.innerHTML =
    '<div class="cfg-grade"><div class="cfg-col">' +
      '<section class="cfg-card"><h3><svg class="ic"><use href="#i-calendar"/></svg>Próximos feriados</h3><p class="fraco">Não contam como dia útil em nenhum prazo. Os nacionais vêm com a extensão; os do escritório, do arquivo de regras.</p>' +
        (prox.length ? Object.entries(porMes).map(([m, ds]) => '<div class="cfg-mes"><h4>' + esc(nomeMes(m)) + '</h4>' + ds.map(d => { const dt = OC.diaDe(d), [cls, rot] = orig(d); return '<div class="cfg-fer"><span class="mono">' + d.slice(8, 10) + '/' + d.slice(5, 7) + '</span><span class="fraco">' + SEMANA[dt.getDay()] + '</span><span class="orig orig-' + cls + '">' + rot + '</span>' + (seuExtra(d) ? '<button type="button" class="cfg-volta" data-tira="' + d + '" title="Tirar este feriado">Tirar</button>' : '') + '</div>'; }).join('') + '</div>').join('') : '<div class="vazio">Nenhum feriado nos próximos meses.</div>') +
      '</section></div>' +
      '<aside class="cfg-col cfg-lado"><section class="cfg-card"><h3><svg class="ic"><use href="#i-plus"/></svg>Feriado local</h3><p class="fraco">Municipal, ponto facultativo ou recesso do escritório: vale só no seu Chrome. Para valer para todos, peça para incluir no arquivo de regras.</p>' +
        '<div class="form-row"><label class="field">Data<input type="date" id="cf-fer-data"></label></div><div class="cfg-acoes"><span class="spacer"></span><button type="button" class="btn btn-primary btn-sm" id="cf-fer-add">Adicionar</button></div></section></aside>' +
    '</div>';
  $('#cf-fer-add', el).onclick = async () => {
    const d = $('#cf-fer-data', el).value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { toast('Escolha a data', true); return; }
    if (lista.includes(d)) { toast('Essa data já é feriado', true); return; }
    await gravar({ feriados: lista.concat(d).sort() });
    toast('Feriado incluído: ' + d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4));
  };
  $$('[data-tira]', el).forEach(b => b.onclick = async () => { await gravar({ feriados: lista.filter(x => x !== b.dataset.tira) }); toast('Feriado retirado'); });
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
function avancado(el) {
  el.innerHTML = '<iframe class="cfg-frame" src="../options.html" title="Configurações avançadas do Control Onvio"></iframe>';
}

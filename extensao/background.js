/* Control Onvio · service worker
 * Lê o Onvio de tempos em tempos, guarda um resumo e avisa o usuário.
 * Fase 1: somente leitura. Nada é gravado no Onvio.
 */
importScripts('core.js');

const ALARME = 'controlOnvio.coleta';
let rodando = null;

/* ---------- configurações ---------- */
// Padrões do código < regras do escritório (arquivo) < ajustes da pessoa. Ver OC.combinarSettings.
async function getSettings() {
  const { settings, regrasEscritorio } = await chrome.storage.local.get(['settings', 'regrasEscritorio']);
  return OC.combinarSettings(regrasEscritorio, settings);
}

async function agendar() {
  const s = await getSettings();
  await chrome.alarms.clear(ALARME);
  chrome.alarms.create(ALARME, { periodInMinutes: Math.max(5, Number(s.intervalo) || 10), delayInMinutes: 0.1 });
}

/* ---------- regras do escritório (arquivo JSON, só dados) ---------- */
const ALARME_REGRAS = 'controlOnvio.regras';

function urlRegrasValida(u) {
  try { const x = new URL(u); return x.protocol === 'https:' && !x.username && !x.password ? x : null; } catch (e) { return null; }
}

// Baixa o arquivo indicado em Configurações, valida e guarda. Se falhar, mantém a última cópia boa.
async function atualizarRegras() {
  const { settings, regrasEscritorio: atual } = await chrome.storage.local.get(['settings', 'regrasEscritorio']);
  const url = settings && settings.regrasUrl;
  if (!url) { if (atual) await chrome.storage.local.remove('regrasEscritorio'); return { ok: true, origem: 'embutidas' }; }
  const guardar = async extra => chrome.storage.local.set({ regrasEscritorio: Object.assign({}, atual || {}, { url, tentativaEm: new Date().toISOString() }, extra) });
  const u = urlRegrasValida(url);
  if (!u) { await guardar({ erro: 'O endereço das regras precisa começar com https://' }); return { ok: false }; }
  try {
    if (!(await chrome.permissions.contains({ origins: [u.origin + '/*'] }))) throw new Error('falta a permissão para acessar ' + u.host + ' (salve de novo em Configurações)');
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    let raw;
    try {
      const r = await fetch(u.href, { cache: 'no-store', credentials: 'omit', signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      raw = await r.json();
    } finally { clearTimeout(t); }
    const regras = OC.normalizarRegras(raw);
    if (!regras) throw new Error('o arquivo não tem prazos, feriados nem palavras válidas');
    await chrome.storage.local.set({ regrasEscritorio: { url, regras, versao: regras.versao, atualizadoEm: new Date().toISOString(), tentativaEm: new Date().toISOString() } });
    return { ok: true, origem: 'arquivo' };
  } catch (e) {
    await guardar({ erro: 'Não foi possível atualizar as regras (' + (e && e.message ? e.message : e) + '). Vale a última cópia boa.' });
    return { ok: false, erro: e && e.message };
  }
}

// Versões 0.1 e 0.2 gravavam TODOS os campos. Tira o que for igual ao padrão do código, para as
// regras do escritório poderem valer; o que a pessoa realmente mudou continua como ajuste dela.
async function migrarSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings || settings.__v === 2) return;
  const novo = { __v: 2 };
  for (const [k, v] of Object.entries(settings)) {
    if (k === '__v') continue;
    if (JSON.stringify(v) !== JSON.stringify(OC.DEFAULTS[k])) novo[k] = v;
  }
  await chrome.storage.local.set({ settings: novo });
}

/* ---------- acesso ao Onvio ---------- */
class AuthError extends Error { constructor(m) { super(m || 'Sessão do Onvio não encontrada'); this.auth = true; } }
class VisaoClienteError extends Error { constructor(m) { super(m || 'O Onvio está aberto com um acesso de cliente'); this.cliente = true; } }

// Sem sessão: 401/403, redirecionamento ou página em vez de dados. Outros erros (5xx, 404...) são erro da leitura.
// A mensagem sempre diz o que o Onvio respondeu, para o painel e o Diagnóstico mostrarem a causa real.
async function lerResposta(status, ct, texto) {
  const tipo = String(ct || '').split(';')[0] || 'sem tipo';
  if (status === 401 || status === 403) throw new AuthError('HTTP ' + status);
  if (status >= 300 && status < 400) throw new AuthError('redirecionou (HTTP ' + status + ')');
  if (status < 200 || status >= 300) throw new Error('HTTP ' + status);
  if (!/json/i.test(ct || '')) throw new AuthError('o Onvio devolveu uma página (' + tipo + ') em vez de dados');
  try { return JSON.parse(texto); } catch (e) { throw new Error('resposta inválida do Onvio'); }
}

/* Três jeitos de falar com a API, do mais fiel à sessão do usuário para o menos:
 *  pagina   = fetch no mundo da própria aba do Onvio (o mesmo que a página faz);
 *  extensao = fetch no mundo isolado da extensão, dentro da aba;
 *  direto   = fetch do service worker (pode não levar o cookie de sessão). */
const ROTULOS = { pagina: 'página do Onvio', extensao: 'extensão na aba', direto: 'direto' };

async function brutoDireto(url) {
  try {
    const r = await fetch(url, { credentials: 'include', redirect: 'follow' });
    return { status: r.status, ct: r.headers.get('content-type'), body: await r.text() };
  } catch (e) { return { status: 0, ct: '', body: String(e) }; }
}

function brutoPorAba(tabId, mundo) {
  return async url => {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId }, world: mundo,
      func: async u => {
        try {
          const r = await fetch(u, { credentials: 'include' });
          return { status: r.status, ct: r.headers.get('content-type'), body: await r.text() };
        } catch (e) { return { status: 0, ct: '', body: String(e) }; }
      },
      args: [url]
    });
    return (res && res.result) || { status: 0, ct: '', body: 'sem resposta da aba' };
  };
}

const comoFetcher = bruto => async url => {
  const v = await bruto(url);
  if (v.status === 0) throw new Error('falha de rede (' + String(v.body).slice(0, 80) + ')');
  return lerResposta(v.status, v.ct, v.body);
};

// Prefere a aba que o usuário está olhando; senão qualquer aba do Onvio já carregada.
async function abaOnvio() {
  const ativas = await chrome.tabs.query({ url: 'https://onvio.com.br/*', active: true, lastFocusedWindow: true });
  const todas = ativas.length ? ativas : await chrome.tabs.query({ url: 'https://onvio.com.br/*' });
  return todas.find(t => !t.discarded && t.status === 'complete') || todas[0] || null;
}

async function candidatosDeLeitura() {
  const tab = await abaOnvio();
  const lista = [];
  if (tab) {
    lista.push({ via: 'pagina', bruto: brutoPorAba(tab.id, 'MAIN') });
    lista.push({ via: 'extensao', bruto: brutoPorAba(tab.id, 'ISOLATED') });
  }
  lista.push({ via: 'direto', bruto: brutoDireto });
  const { metodoLeitura } = await chrome.storage.local.get('metodoLeitura');
  lista.sort((a, b) => (b.via === metodoLeitura) - (a.via === metodoLeitura));   // o que funcionou da última vez vai primeiro
  return { tab, lista };
}

// Valida a sessão com uma chamada de verdade (a lista Geral, 1 item), sem depender de endereço de sessão.
async function escolherFetcher(forcarPerfil) {
  const sonda = OC.urlSonda();
  const { tab, lista } = await candidatosDeLeitura();
  const falhas = [];
  let semSessao = false;
  for (const c of lista) {
    const f = comoFetcher(c.bruto);
    try {
      await f(sonda);
    } catch (e) {
      if (e && e.auth) { semSessao = true; perfilCache = null; }
      falhas.push(ROTULOS[c.via] + ': ' + (e && e.message ? e.message : e));
      continue;
    }
    await chrome.storage.local.set({ metodoLeitura: c.via });
    await garantirEscritorio(f, forcarPerfil);
    return { f, via: c.via };
  }
  const msg = (tab ? '' : 'Não há aba do Onvio aberta. ') + 'Tentativas: ' + falhas.join(' · ');
  throw semSessao || !tab ? new AuthError(msg) : new Error(msg);
}

/* ---------- só a visão do escritório ----------
 * Com o login de um cliente as mesmas APIs respondem (com as solicitações da empresa dele). A extensão é do
 * escritório: confere o perfil (OC.perfilDoAcesso) e, se for cliente, para tudo e apaga o que foi lido. */
let perfilCache = null;          // { perfil, motivo, em }
async function abaVisaoCliente() {
  const abas = await chrome.tabs.query({ url: 'https://onvio.com.br/*' });
  return abas.some(t => { try { return /^\/clientcenter(\/|$)/i.test(new URL(t.url).pathname); } catch (e) { return false; } });
}
async function garantirEscritorio(f, forcar) {
  const validade = perfilCache && perfilCache.perfil === 'cliente' ? 60000 : 5 * 60000;
  if (forcar || !perfilCache || Date.now() - perfilCache.em > validade) {
    const r = await OC.perfilDoAcesso(f, { abaCliente: await abaVisaoCliente() });
    perfilCache = { perfil: r.perfil, motivo: r.motivo, em: Date.now() };
    await chrome.storage.local.set({ perfilSessao: { perfil: r.perfil, motivo: r.motivo, formato: r.formato, em: new Date().toISOString() } });
  }
  if (perfilCache.perfil === 'cliente') throw new VisaoClienteError('O Onvio está aberto com um acesso de cliente (' + perfilCache.motivo + '). O Control Onvio é só para a visão do escritório.');
}
// Acesso de cliente: nada do que foi lido fica guardado nem aparece (lembretes pessoais ficam).
async function bloquearVisaoCliente(e) {
  await chrome.storage.local.remove(['snapshot', 'assinaturas', 'tramites', 'eventos', 'serie', 'ultimaVerificacao', 'notifMap']);
  await chrome.storage.local.set({ status: { estado: 'visao_cliente', em: new Date().toISOString(), msg: e.message } });
  await chrome.action.setBadgeText({ text: '' });
}

// Para o botão "Testar a leitura" das configurações: mostra o que cada jeito recebeu (sem dados de clientes).
async function testarLeitura() {
  const { tab, lista } = await candidatosDeLeitura();
  const linhas = ['Aba do Onvio: ' + (tab ? 'sim (' + new URL(tab.url).pathname.slice(0, 60) + ')' : 'não')];
  const url = OC.urlSonda();
  linhas.push('Endereço testado: ' + new URL(url).pathname);
  for (const c of lista) {
    const v = await c.bruto(url);
    let extra = '';
    if (/json/i.test(v.ct || '')) { try { const j = JSON.parse(v.body); extra = ' · campos: ' + Object.keys(j).slice(0, 8).join(', ') + (j.totalItems != null ? ' · total ' + j.totalItems : ''); } catch (e) { extra = ' · JSON inválido'; } }
    linhas.push(ROTULOS[c.via] + ': ' + (v.status ? 'HTTP ' + v.status + ' · ' + (String(v.ct || '').split(';')[0] || 'sem tipo') + extra : 'falha de rede'));
  }
  return linhas;
}

/* ---------- coleta ---------- */
async function coletar(manual) {
  if (rodando) return rodando;
  rodando = (async () => {
    const s = await getSettings();
    const { snapshot: anterior, tramites: cacheTramites, rotasTramites } = await chrome.storage.local.get(['snapshot', 'tramites', 'rotasTramites']);
    await chrome.storage.local.set({ status: { estado: 'lendo', em: new Date().toISOString(), etapa: '' } });
    try {
      const { f, via } = await escolherFetcher(manual);
      const assin = await OC.assinaturas(f).catch(() => null);     // antes da leitura: o que mudar depois será notado
      const snap = await OC.collect(f, s, (i, n, rot) => chrome.storage.local.set({ status: { estado: 'lendo', etapa: i + '/' + n + ' · ' + rot } }), { tramites: cacheTramites || {}, rotasTramites: rotasTramites || {} });
      snap.via = via;
      OC.tendencias(anterior, snap);                                  // setas ▲▼ da barra viva
      snap.versao = chrome.runtime.getManifest().version;
      const novoCache = snap.tramites.cache; delete snap.tramites.cache;   // o cache fica fora do resumo
      await chrome.storage.local.set({ tramites: novoCache });
      await notificar(anterior, snap, s);
      const { serie } = await chrome.storage.local.get('serie');
      await chrome.storage.local.set({ serie: OC.atualizarSerie(serie, anterior, snap) });
      await chrome.storage.local.set({ snapshot: snap, assinaturas: assin, ultimaVerificacao: new Date().toISOString(), status: { estado: 'ok', em: snap.fetchedAt, erros: snap.erros } });
      await atualizarBadge(snap);
      return snap;
    } catch (e) {
      if (e && e.cliente) { await bloquearVisaoCliente(e); if (manual) throw e; return null; }
      await chrome.storage.local.set({ status: { estado: e.auth ? 'sem_sessao' : 'erro', em: new Date().toISOString(), msg: e.message || String(e) } });
      await chrome.action.setBadgeText({ text: '!' });
      await chrome.action.setBadgeBackgroundColor({ color: '#5F6D77' });
      if (manual) throw e;
      return null;
    } finally {
      rodando = null;
    }
  })();
  return rodando;
}

/* ---------- tempo real ----------
 * O Onvio aberto pede uma verificação a cada poucos segundos (shell.js) e logo depois de qualquer ação
 * que altere solicitações na página (acao-hook.js). A verificação é leve: 1 item por lista, só para ver se
 * o total ou a última movimentação mudou. Só se mudou (ou a cada "intervalo" minutos) lê tudo de novo. */
let verificando = null;
const ULTIMA_VERIFICACAO_MIN_MS = 10000;

async function verificarAoVivo(forcar) {
  const s = await getSettings();
  const proximoEmSeg = s.tempoRealSeg > 0 ? Math.max(15, s.tempoRealSeg) : 60;
  if (!(s.tempoRealSeg > 0) && !forcar) return { ok: true, proximoEmSeg };
  if (rodando || verificando) return { ok: true, proximoEmSeg };
  verificando = (async () => {
    const { snapshot, assinaturas, ultimaVerificacao } = await chrome.storage.local.get(['snapshot', 'assinaturas', 'ultimaVerificacao']);
    if (!forcar && ultimaVerificacao && Date.now() - new Date(ultimaVerificacao) < ULTIMA_VERIFICACAO_MIN_MS) return;   // outra aba acabou de verificar
    const idadeMs = snapshot ? Date.now() - new Date(snapshot.fetchedAt) : Infinity;
    if (!snapshot || forcar || idadeMs > Math.max(1, Number(s.intervalo) || 5) * 60000) { await coletar(false); return; }
    const { f } = await escolherFetcher();
    const novas = await OC.assinaturas(f);
    if (OC.assinaturasDiferem(assinaturas, novas)) await coletar(false);
    else await chrome.storage.local.set({ ultimaVerificacao: new Date().toISOString() });
  })().catch(e => { if (e && e.cliente) return bloquearVisaoCliente(e); }).finally(() => { verificando = null; });
  await verificando;
  return { ok: true, proximoEmSeg };
}

/* ---------- lembretes (pessoais) ----------
 * Ficam em chrome.storage.local ("lembretes"). Cada um pendente tem um alarme "lembrete:<id>". */
const PREFIXO_LEMBRETE = 'lembrete:';
async function sincronizarLembretes() {
  const { lembretes } = await chrome.storage.local.get('lembretes');
  const ativos = (lembretes || []).filter(l => !l.feito && !l.disparado);
  const existentes = (await chrome.alarms.getAll()).filter(a => a.name.startsWith(PREFIXO_LEMBRETE));
  const querido = new Map(ativos.map(l => [PREFIXO_LEMBRETE + l.id, new Date(l.quando).getTime()]));
  for (const a of existentes) if (!querido.has(a.name) || Math.abs(a.scheduledTime - querido.get(a.name)) > 1000) await chrome.alarms.clear(a.name);
  const ainda = new Set((await chrome.alarms.getAll()).map(a => a.name));
  for (const [nome, quando] of querido) if (!ainda.has(nome)) chrome.alarms.create(nome, { when: Math.max(Date.now() + 1000, quando) });
}
async function dispararLembrete(id) {
  const { lembretes } = await chrome.storage.local.get('lembretes');
  const l = (lembretes || []).find(x => x.id === id);
  if (!l || l.feito || l.disparado) return;
  l.disparado = true;
  await chrome.storage.local.set({ lembretes });
  const em = new Date().toISOString();
  await registrarEventos([{ id: 'lembrete:' + l.id + ':' + em, tipo: 'lembrete', titulo: 'Lembrete: ' + l.texto, k: l.k, type: l.type, num: l.num, typeLabel: l.type && OC.TYPE_BY_KEY[l.type] ? OC.TYPE_BY_KEY[l.type].label : '', cliente: l.cliente || '', mine: true, em }]);
  const nid = 'lembrete-' + l.id;
  if (l.type && l.num) await guardarNotifMap({ [nid]: { type: l.type, num: l.num, ts: Date.now() } });
  await chrome.notifications.create(nid, { type: 'basic', iconUrl: 'icons/128.png', title: 'Lembrete', message: l.texto + (l.num ? ' · #' + l.num : ''), priority: 2, requireInteraction: true });
}

/* ---------- consultas sob demanda (o app pede; nada disso é guardado) ---------- */
async function consultar(msg) {
  const t = OC.TYPE_BY_KEY[msg.type];
  if (!t) throw new Error('tipo desconhecido');
  const s = await getSettings();
  const { f } = await escolherFetcher();
  const d = await f(OC.urlConsulta(t, { page: msg.page, per: msg.per, search: msg.search, filtro: msg.filtro, mine: msg.mine, orderBy: msg.orderBy }));
  const now = new Date();
  const itens = ((d && d.items) || []).map(r => { const x = OC.normalize(t, r, null, s.abaErrada); return Object.assign(x, OC.evaluate(x, s, now)); });
  return { itens, total: d && d.totalItems != null ? d.totalItems : itens.length, paginas: (d && d.totalPages) || 1 };
}
// Rotas de trâmites por lista: só o molde do caminho (sufixo, forma do id e parâmetros técnicos), nunca dados.
async function guardarRotaTramites(tipo, rota) {
  const r = OC.rotaValida(rota);
  if (!r || !OC.TYPE_BY_KEY[tipo]) return;
  const { rotasTramites } = await chrome.storage.local.get('rotasTramites');
  const atual = Object.assign({}, rotasTramites || {});
  const ant = atual[tipo];
  if (ant && ant.sufixo === r.sufixo && ant.idForma === r.idForma && JSON.stringify(ant.query) === JSON.stringify(r.query)) return;
  atual[tipo] = Object.assign(r, { em: new Date().toISOString() });
  await chrome.storage.local.set({ rotasTramites: atual });
  // o 1º trâmite dessa lista volta a ser procurado na próxima leitura
  const { tramites } = await chrome.storage.local.get('tramites');
  if (tramites) await chrome.storage.local.set({ tramites: Object.fromEntries(Object.entries(tramites).filter(([k, v]) => !(k.startsWith(tipo + ':') && v && v.erro))) });
}
async function detalhe(msg) {
  const t = OC.TYPE_BY_KEY[msg.type];
  if (!t) throw new Error('tipo desconhecido');
  const s = await getSettings();
  const { f } = await escolherFetcher();
  const d = await f(OC.urlConsulta(t, { numero: msg.num, per: 5 }));
  const r = ((d && d.items) || []).find(x => String(x.identifier) === String(msg.num));
  if (!r) throw new Error('solicitação #' + msg.num + ' não encontrada em ' + t.label);
  const x = OC.detalheDe(t, r);
  Object.assign(x, OC.evaluate(x, s, new Date()));
  // Trâmites: a rota aprendida da lista (se houver) ou o padrão "topics". Sem rota aprendida e com 404, tenta uma vez
  // o mesmo caminho com o número da solicitação; se der certo, guarda a forma para a lista.
  const { rotasTramites } = await chrome.storage.local.get('rotasTramites');
  const rota = (rotasTramites || {})[t.key];
  let tramites = null, erroTramites = null, semRota = false;
  try { tramites = OC.tramitesDe(t, await f(OC.urlTramites(t, r, rota))); } catch (e) {
    erroTramites = e.message || String(e);
    if (!rota && /HTTP 404/.test(erroTramites)) {
      try {
        tramites = OC.tramitesDe(t, await f(OC.urlTramites(t, r, { sufixo: 'topics', idForma: 'numero' })));
        erroTramites = null;
        await guardarRotaTramites(t.key, { sufixo: 'topics', idForma: 'numero', query: {} });
      } catch (e2) { semRota = true; }
    }
  }
  return { item: x, tramites, erroTramites, semRota, lista: t.label };
}

/* ---------- badge ---------- */
async function atualizarBadge(snap) {
  const minhas = snap.items.filter(i => i.mine && i.lado === 'esc');
  const n = minhas.length;
  await chrome.action.setBadgeText({ text: n ? (n > 99 ? '99+' : String(n)) : '' });
  const cor = minhas.some(i => i.nivel === 2) ? '#C2000C' : minhas.some(i => i.nivel === 1) ? '#B5530C' : '#3C659B';
  await chrome.action.setBadgeBackgroundColor({ color: cor });
  if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: '#FFFFFF' });
  await chrome.action.setTitle({ title: 'Control Onvio · ' + n + ' minha(s) com ação do escritório' });
}

/* ---------- notificações ---------- */
const EVENTOS_MAX = 300;
// Grava os eventos (sino do app) e mostra as notificações do Chrome.
async function registrarEventos(novos) {
  if (!novos.length) return;
  const { eventos } = await chrome.storage.local.get('eventos');
  await chrome.storage.local.set({ eventos: novos.concat(eventos || []).slice(0, EVENTOS_MAX) });
}
async function notificar(anterior, snap, s) {
  const evs = OC.eventos(anterior, snap, s);
  await registrarEventos(evs);
  if (!s.notificar) return;
  const avisos = evs.filter(e => e.mine || (e.tipo === 'semresp' && s.modoGestor)).map(e => ({ e, t: e.titulo, m: '#' + e.num + ' ' + e.typeLabel + ' · ' + e.cliente }));
  if (!avisos.length) return;
  const mapa = {};
  const agora = Date.now();
  if (avisos.length > 3) {
    const id = 'resumo-' + Date.now();
    await chrome.notifications.create(id, {
      type: 'list', iconUrl: 'icons/128.png', title: avisos.length + ' novidades no Onvio',
      message: 'Abra o Control Onvio para ver tudo', items: avisos.slice(0, 5).map(a => ({ title: a.t, message: a.m }))
    });
  } else {
    for (const a of avisos) {
      const id = 'it-' + a.e.k + '-' + agora;
      mapa[id] = { type: a.e.type, num: a.e.num, ts: agora };
      await chrome.notifications.create(id, { type: 'basic', iconUrl: 'icons/128.png', title: a.t, message: a.m, priority: 1 });
    }
  }
  await guardarNotifMap(mapa);
}

// Guarda só o que é preciso para abrir a solicitação (tipo e número) e descarta o que tem mais de 24 h.
async function guardarNotifMap(novos, remover) {
  const { notifMap } = await chrome.storage.local.get('notifMap');
  const corte = Date.now() - 864e5;
  const m = {};
  for (const [id, v] of Object.entries(Object.assign({}, notifMap || {}, novos || {}))) {
    if (id !== remover && v && v.ts > corte) m[id] = v;
  }
  await chrome.storage.local.set({ notifMap: m });
}

chrome.notifications.onClicked.addListener(async id => {
  const { notifMap } = await chrome.storage.local.get('notifMap');
  const it = notifMap && notifMap[id];
  if (it) await abrir(it);
  chrome.notifications.clear(id);
});
chrome.notifications.onClosed.addListener(id => { guardarNotifMap(null, id); });

/* ---------- o painel só existe no Onvio ---------- */
// Ícone da extensão e atalho: dentro do Onvio abrem/fecham o painel; fora dele levam ao Onvio.
const ehOnvio = u => { try { return new URL(u).hostname === 'onvio.com.br'; } catch (e) { return false; } };

// Fala com o script do painel (shell.js). Se a aba é anterior à instalação/atualização, injeta o script antes.
async function mensagemParaPainel(tabId, type) {
  try { return await chrome.tabs.sendMessage(tabId, { type }); }
  catch (e) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['shell.js'] });
    return chrome.tabs.sendMessage(tabId, { type });
  }
}

// Leva a pessoa ao Onvio com o painel aberto: usa uma aba do Onvio que já esteja aberta, ou cria uma.
async function irParaOnvio() {
  const tabs = await chrome.tabs.query({ url: 'https://onvio.com.br/*' });
  const alvo = tabs.find(t => /\/br-portal-do-cliente\//.test(t.url)) || tabs.find(t => /\/staff\//.test(t.url)) || tabs[0];
  if (alvo) {
    await chrome.tabs.update(alvo.id, { active: true });
    await chrome.windows.update(alvo.windowId, { focused: true });
    await mensagemParaPainel(alvo.id, 'abrir').catch(() => {});
    return alvo.id;
  }
  await chrome.storage.local.set({ abrirPainelAoCarregar: Date.now() });
  const t = await chrome.tabs.create({ url: OC.PORTAL + 'service-requesting/general' });
  return t.id;
}

async function aoClicarNoIcone(tab) {
  if (tab && tab.id != null && ehOnvio(tab.url)) await mensagemParaPainel(tab.id, 'alternar').catch(() => {});
  else await irParaOnvio();
}
chrome.action.onClicked.addListener(aoClicarNoIcone);
chrome.commands.onCommand.addListener(async (cmd, tab) => { if (cmd === 'alternar-painel') await aoClicarNoIcone(tab); });

/* ---------- abrir solicitação no Onvio ---------- */
// tabPreferida: a aba onde o painel está aberto (o painel continua aberto lá depois de trocar de página).
async function abrir(it, tabPreferida) {
  const t = OC.TYPE_BY_KEY[it.type];
  const url = OC.PORTAL + t.route;
  await chrome.storage.local.set({ abrir: { route: t.route, num: String(it.num), ts: Date.now() }, verOnvioAoCarregar: Date.now() });
  const pref = tabPreferida != null ? await chrome.tabs.get(tabPreferida).catch(() => null) : null;
  const tabs = await chrome.tabs.query({ url: 'https://onvio.com.br/br-portal-do-cliente/*' });
  const alvo = pref && ehOnvio(pref.url) ? pref : tabs[0];
  if (alvo) {
    await chrome.tabs.update(alvo.id, { url, active: true });
    await chrome.windows.update(alvo.windowId, { focused: true });
  } else {
    await chrome.storage.local.set({ abrirPainelAoCarregar: Date.now() });
    await chrome.tabs.create({ url });
  }
}

/* ---------- mensagens do painel ---------- */
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    try {
      if (msg.cmd === 'atualizar') reply({ ok: true, snap: await coletar(true) });
      else if (msg.cmd === 'buscar') {
        const s = await getSettings();
        const { f } = await escolherFetcher();
        reply({ ok: true, itens: await OC.search(f, msg.q, s) });
      } else if (msg.cmd === 'abrir') { await abrir(msg.item, sender.tab && sender.tab.id); reply({ ok: true }); }
      else if (msg.cmd === 'reagendar') { await agendar(); reply({ ok: true }); }
      else if (msg.cmd === 'atualizarRegras') { reply(await atualizarRegras()); }
      else if (msg.cmd === 'tick') { reply(await verificarAoVivo(!!msg.forcar)); }
      else if (msg.cmd === 'consultar') { reply(Object.assign({ ok: true }, await consultar(msg))); }
      else if (msg.cmd === 'detalhe') { reply(Object.assign({ ok: true }, await detalhe(msg))); }
      else if (msg.cmd === 'rotaTramites') {          // o Onvio abriu trâmites de uma lista: guarda o molde do caminho
        const t = OC.TYPES.find(x => typeof msg.base === 'string' && msg.base.replace(/\/+$/, '').endsWith('/' + x.path));
        if (t) await guardarRotaTramites(t.key, msg);
        reply({ ok: !!t, tipo: t ? t.key : null });
      }
      else if (msg.cmd === 'testarLeitura') { reply({ ok: true, linhas: await testarLeitura() }); }
      else if (msg.cmd === 'abrirOnvio') { await irParaOnvio(); reply({ ok: true }); }
      else if (msg.cmd === 'fecharPainel') { if (sender.tab && sender.tab.id != null) await mensagemParaPainel(sender.tab.id, 'fechar').catch(() => {}); reply({ ok: true }); }
      else reply({ ok: false, erro: 'comando desconhecido' });
    } catch (e) {
      if (e && e.cliente) await bloquearVisaoCliente(e).catch(() => {});
      reply({ ok: false, erro: e.message || String(e), auth: !!e.auth, cliente: !!(e && e.cliente) });
    }
  })();
  return true;
});

/* ---------- ciclo de vida ---------- */
async function iniciar() {
  await migrarSettings();
  await chrome.storage.local.remove(['guias', 'clientes']);      // dados das guias (removidas na v0.7)
  await sincronizarLembretes();
  chrome.alarms.create(ALARME_REGRAS, { periodInMinutes: 60, delayInMinutes: 1 });
  await atualizarRegras();
  await agendar();
}
chrome.runtime.onInstalled.addListener(iniciar);
chrome.runtime.onStartup.addListener(iniciar);
chrome.alarms.onAlarm.addListener(a => {
  if (a.name === ALARME) coletar(false);
  else if (a.name.startsWith(PREFIXO_LEMBRETE)) dispararLembrete(a.name.slice(PREFIXO_LEMBRETE.length));
  else if (a.name === ALARME_REGRAS) atualizarRegras();
});
chrome.storage.onChanged.addListener((ch, area) => {
  if (area !== 'local') return;
  if (ch.lembretes) sincronizarLembretes();
  if (ch.settings) {
    const a = ch.settings.oldValue || {}, b = ch.settings.newValue || {};
    if (a.regrasUrl !== b.regrasUrl) atualizarRegras();
    if (a.intervalo !== b.intervalo) agendar();      // não reagenda (nem lê o Onvio) por qualquer ajuste
  }
});

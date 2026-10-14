/* Control Onvio · service worker
 * Lê o Onvio de tempos em tempos, guarda um resumo e avisa o usuário.
 * Fase 1: somente leitura. Nada é gravado no Onvio.
 */
importScripts('core.js');

const ALARME = 'controlOnvio.coleta';
let rodando = null;

/* ---------- configurações ---------- */
async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return Object.assign({}, OC.DEFAULTS, settings || {});
}

async function agendar() {
  const s = await getSettings();
  await chrome.alarms.clear(ALARME);
  chrome.alarms.create(ALARME, { periodInMinutes: Math.max(5, Number(s.intervalo) || 10), delayInMinutes: 0.1 });
}

/* ---------- acesso ao Onvio ---------- */
class AuthError extends Error { constructor(m) { super(m || 'Sessão do Onvio não encontrada'); this.auth = true; } }

// 401/403 ou página de login (HTML com status 200) = sem sessão.
// Erro do servidor (5xx, 404, 400...) é erro da leitura e não deve pedir login.
async function lerResposta(status, ct, texto) {
  if (status === 401 || status === 403) throw new AuthError();
  if (status >= 300 && status < 400) throw new AuthError();
  if (status < 200 || status >= 300) throw new Error('HTTP ' + status);
  if (!/json/i.test(ct || '')) throw new AuthError();
  try { return JSON.parse(texto); } catch (e) { throw new Error('Resposta inválida do Onvio'); }
}

// 1ª opção: direto do service worker, com o cookie da sessão
async function fetcherDireto(url) {
  const r = await fetch(url, { credentials: 'include', redirect: 'follow' });
  return lerResposta(r.status, r.headers.get('content-type'), await r.text());
}

// 2ª opção: de dentro de uma aba do Onvio já aberta
async function abaOnvio() {
  const tabs = await chrome.tabs.query({ url: 'https://onvio.com.br/*' });
  return tabs.find(t => !t.discarded && t.status === 'complete') || tabs[0] || null;
}
function fetcherPorAba(tabId) {
  return async url => {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: async u => {
        try {
          const r = await fetch(u, { credentials: 'include' });
          return { status: r.status, ct: r.headers.get('content-type'), body: await r.text() };
        } catch (e) { return { status: 0, ct: '', body: String(e) }; }
      },
      args: [url]
    });
    const v = res && res.result;
    if (!v || v.status === 0) throw new Error('Falha de rede na aba do Onvio');
    return lerResposta(v.status, v.ct, v.body);
  };
}

async function escolherFetcher() {
  try {
    await fetcherDireto(OC.API + 'security/v1/session-and-bindings');
    return { f: fetcherDireto, via: 'direto' };
  } catch (e) {
    const tab = await abaOnvio();
    if (!tab) throw new AuthError('Abra o Onvio e faça login para a extensão conseguir ler as solicitações.');
    const f = fetcherPorAba(tab.id);
    await f(OC.API + 'security/v1/session-and-bindings');
    return { f, via: 'aba' };
  }
}

/* ---------- coleta ---------- */
async function coletar(manual) {
  if (rodando) return rodando;
  rodando = (async () => {
    const s = await getSettings();
    const { snapshot: anterior, tramites: cacheTramites } = await chrome.storage.local.get(['snapshot', 'tramites']);
    await chrome.storage.local.set({ status: { estado: 'lendo', em: new Date().toISOString(), etapa: '' } });
    try {
      const { f, via } = await escolherFetcher();
      const snap = await OC.collect(f, s, (i, n, rot) => chrome.storage.local.set({ status: { estado: 'lendo', etapa: i + '/' + n + ' · ' + rot } }), { tramites: cacheTramites || {} });
      snap.via = via;
      snap.versao = chrome.runtime.getManifest().version;
      const novoCache = snap.tramites.cache; delete snap.tramites.cache;   // o cache fica fora do resumo
      await chrome.storage.local.set({ tramites: novoCache });
      await notificar(anterior, snap, s);
      await chrome.storage.local.set({ snapshot: snap, status: { estado: 'ok', em: snap.fetchedAt, erros: snap.erros } });
      await atualizarBadge(snap);
      return snap;
    } catch (e) {
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
async function notificar(anterior, snap, s) {
  if (!s.notificar || !anterior || !anterior.items) return; // primeira leitura vira base
  const antes = new Map(anterior.items.map(i => [i.k, i]));
  const avisos = [];
  for (const it of snap.items) {
    const a = antes.get(it.k);
    const ref = '#' + it.num + ' ' + it.typeLabel + ' · ' + (it.apelido || it.cliente);
    if (!a) {
      if (it.mine) avisos.push({ it, t: 'Nova solicitação para você', m: ref });
      else if (!it.resp && s.modoGestor) avisos.push({ it, t: 'Nova solicitação sem responsável', m: ref });
      continue;
    }
    if (it.mine && a.lado === 'cli' && it.lado === 'esc') avisos.push({ it, t: 'Cliente respondeu', m: ref });
    if (it.mine && it.prescreveEm != null && it.prescreveEm <= 5 && (a.prescreveEm == null || a.prescreveEm > 5))
      avisos.push({ it, t: 'Prescreve em ' + it.prescreveEm + ' dia(s)', m: ref });
  }
  if (!avisos.length) return;
  const mapa = {};
  const agora = Date.now();
  if (avisos.length > 3) {
    const id = 'resumo-' + Date.now();
    await chrome.notifications.create(id, {
      type: 'list', iconUrl: 'icons/128.png', title: avisos.length + ' novidades no Onvio',
      message: 'Abra o painel para ver tudo', items: avisos.slice(0, 5).map(a => ({ title: a.t, message: a.m }))
    });
  } else {
    for (const a of avisos) {
      const id = 'it-' + a.it.k + '-' + agora;
      mapa[id] = { type: a.it.type, num: String(a.it.num), ts: agora };
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

/* ---------- abrir solicitação no Onvio ---------- */
async function abrir(it) {
  const t = OC.TYPE_BY_KEY[it.type];
  const url = OC.PORTAL + t.route;
  await chrome.storage.local.set({ abrir: { route: t.route, num: String(it.num), ts: Date.now() } });
  const tabs = await chrome.tabs.query({ url: 'https://onvio.com.br/br-portal-do-cliente/*' });
  if (tabs.length) {
    await chrome.tabs.update(tabs[0].id, { url, active: true });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
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
      } else if (msg.cmd === 'abrir') { await abrir(msg.item); reply({ ok: true }); }
      else if (msg.cmd === 'reagendar') { await agendar(); reply({ ok: true }); }
      else if (msg.cmd === 'abrirOnvio') { await chrome.tabs.create({ url: OC.PORTAL + 'service-requesting/general' }); reply({ ok: true }); }
      else reply({ ok: false, erro: 'comando desconhecido' });
    } catch (e) { reply({ ok: false, erro: e.message || String(e), auth: !!e.auth }); }
  })();
  return true;
});

/* ---------- ciclo de vida ---------- */
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  await agendar();
});
chrome.runtime.onStartup.addListener(agendar);
chrome.alarms.onAlarm.addListener(a => { if (a.name === ALARME) coletar(false); });
chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.settings) agendar(); });

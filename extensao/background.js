/* Control Onvio · service worker
 * Lê o Onvio de tempos em tempos, guarda um resumo e avisa o usuário.
 * Fase 1: somente leitura. Nada é gravado no Onvio.
 */
importScripts('core.js');

const ALARME = 'controlOnvio.coleta';
const ALARME_DIST = 'controlOnvio.distribuicao';
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
  // distribuição automática de responsáveis: só com o interruptor ligado (Equipe, gestor); a cada N minutos (padrão 15)
  await chrome.alarms.clear(ALARME_DIST);
  const da = await lerDistAuto();
  if (da.ligada) chrome.alarms.create(ALARME_DIST, { periodInMinutes: Math.max(5, Number(s.distribuicaoAuto && s.distribuicaoAuto.minutos) || 15), delayInMinutes: 1 });
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
  let v = await bruto(url);
  if (v.status === 503) { await new Promise(r => setTimeout(r, 800)); v = await bruto(url); }   // o Onvio às vezes responde 503 na 1ª tentativa
  if (v.status === 0) throw new Error('falha de rede (' + String(v.body).slice(0, 80) + ')');
  return lerResposta(v.status, v.ct, v.body);
};

// Prioridade: abrir uma solicitação (a pessoa esperando na tela) passa na frente das leituras em massa (sugestões do Hoje,
// previsão, distribuição, avaliação, leitura periódica). Enquanto houver uma abertura em andamento, a leitura em massa
// espera antes de cada chamada nova; as que já saíram terminam normalmente.
let interativas = 0;
function emSegundoPlano(f) { return async u => { let n = 0; while (interativas > 0 && n++ < 150) await new Promise(r => setTimeout(r, 100)); return f(u); }; }

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
// O jeito que funcionou fica valendo por 2 minutos (na mesma aba), para cada solicitação aberta não pagar mais uma ida ao Onvio
// só para testar a sessão; qualquer falha de sessão ou de rede com ele apaga o atalho. Escrita (forcarPerfil) testa sempre.
let leitorCache = null;          // { f, via, tabId, em }
const LEITOR_VALIDADE = 120000;
async function escolherFetcher(forcarPerfil) {
  if (!forcarPerfil && leitorCache && Date.now() - leitorCache.em < LEITOR_VALIDADE) {
    const aba = leitorCache.tabId == null ? null : await chrome.tabs.get(leitorCache.tabId).catch(() => null);
    if (leitorCache.tabId == null || (aba && !aba.discarded)) {
      await garantirEscritorio(leitorCache.f, false);
      return { f: leitorCache.f, via: leitorCache.via };
    }
    leitorCache = null;
  }
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
    // falha de sessão ou de rede com o atalho: a próxima leitura testa de novo
    const fc = async u => { try { return await f(u); } catch (e) { if (e && (e.auth || /falha de rede/.test(e.message || ''))) leitorCache = null; throw e; } };
    leitorCache = { f: fc, via: c.via, tabId: c.via === 'direto' ? null : (tab && tab.id), em: Date.now() };
    return { f: fc, via: c.via };
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
  await chrome.storage.local.remove(['snapshot', 'assinaturas', 'tramites', 'eventos', 'serie', 'ultimaVerificacao', 'notifMap', 'semCalculoMarcas', 'desempenhoCache', 'sugestoesIgnoradas']);
  casosCache = {};
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
  const seg = ms => (ms == null ? '–' : (ms / 1000).toFixed(1).replace('.', ',') + ' s');
  if (temposDetalhe.length) {
    const ts = temposDetalhe.map(x => x.total).sort((a, b) => a - b);
    linhas.push('Abrir solicitação (últimas ' + ts.length + '): metade em até ' + seg(ts[Math.floor(ts.length / 2)]) + ', a mais lenta ' + seg(ts[ts.length - 1]));
    temposDetalhe.slice(0, 5).forEach(x => linhas.push('  ' + x.em.slice(11, 19) + ' · total ' + seg(x.total) + ' (sessão ' + seg(x.sessao) + ', busca ' + seg(x.consulta) + ', dados ' + seg(x.dados) + ', trâmites ' + seg(x.tramites) + (x.adiantado ? ', em paralelo' : '') + ')'));
  } else linhas.push('Abrir solicitação: ainda sem medição (abra algumas e teste de novo)');
  return linhas;
}

/* ---------- coleta ---------- */
async function coletar(manual) {
  if (rodando) return rodando;
  rodando = (async () => {
    const s = await getSettings();
    const { snapshot: anterior, tramites: cacheTramites, avisos: cacheAvisos } = await chrome.storage.local.get(['snapshot', 'tramites', 'avisos']);
    await chrome.storage.local.set({ status: { estado: 'lendo', em: new Date().toISOString(), etapa: '' } });
    try {
      const { f, via } = await escolherFetcher(manual);
      const assin = await OC.assinaturas(f).catch(() => null);     // antes da leitura: o que mudar depois será notado
      const snap = await OC.collect(emSegundoPlano(f), s, (i, n, rot) => chrome.storage.local.set({ status: { estado: 'lendo', etapa: i + '/' + n + ' · ' + rot } }), { tramites: cacheTramites || {}, avisos: cacheAvisos || {} });
      snap.via = via;
      OC.tendencias(anterior, snap);                                  // setas ▲▼ da barra viva
      snap.versao = chrome.runtime.getManifest().version;
      const novoCache = snap.tramites.cache; delete snap.tramites.cache;   // o cache fica fora do resumo
      const novoAvisos = snap.avisos ? snap.avisos.cache : {}; if (snap.avisos) delete snap.avisos.cache;
      await chrome.storage.local.set({ tramites: novoCache, avisos: novoAvisos });
      await notificar(anterior, snap, s);
      const { serie } = await chrome.storage.local.get('serie');
      await chrome.storage.local.set({ serie: OC.atualizarSerie(serie, anterior, snap) });
      await chrome.storage.local.set({ snapshot: snap, assinaturas: assin, ultimaVerificacao: new Date().toISOString(), status: { estado: 'ok', em: snap.fetchedAt, erros: snap.erros } });
      await atualizarBadge(snap);
      enviarAoHubAuto(snap).catch(() => {});             // ponte opcional com o Control Hub (não atrasa nem derruba a leitura)
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
/* ---------- ações no Onvio (fase 2) ----------
 * Escrita sempre de dentro da aba do Onvio (mundo da página), com a sessão e a autorização da própria tela.
 * Só os pedidos montados por OC.pedidoAcao e aceitos por OC.escritaPermitida saem; nunca DELETE nem exclusão.
 * O app pede confirmação antes de mandar a mensagem. Nada do texto ou dos anexos é guardado. */
function escritaPorAba(tabId) {
  return async (metodo, url, corpo, arquivos) => {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId }, world: 'MAIN',
      func: async (m, u, c, arqs) => {
        try {
          const auth = typeof window.__controlOnvioAutorizacao === 'function' ? window.__controlOnvioAutorizacao() : null;
          const headers = { Accept: 'application/json, text/plain, */*' };
          if (auth) headers.Authorization = auth;
          let body;
          if (arqs) {
            body = new FormData();
            for (const a of arqs) { const bin = Uint8Array.from(atob(a.b64), ch => ch.charCodeAt(0)); body.append('file[]', new Blob([bin], { type: a.tipo || 'application/octet-stream' }), a.nome); }
          } else { headers['Content-Type'] = 'application/json'; body = JSON.stringify(c); }
          const r = await fetch(u, { method: m, body, headers, credentials: 'include' });
          return { status: r.status, location: r.headers.get('location'), texto: (await r.text()).slice(0, 200) };
        } catch (e) { return { status: 0, erro: String(e).slice(0, 200) }; }
      },
      args: [metodo, url, corpo || null, arquivos || null]
    });
    return (res && res.result) || { status: 0, erro: 'sem resposta da aba' };
  };
}
const MAX_ANEXOS = 10, MAX_BYTES = 15 * 1024 * 1024;

/* ---------- baixar anexos escolhidos ----------
 * Molde do caminho aprendido quando o próprio Onvio baixa um anexo (acao-hook.js -> shell.js -> rotaAnexo). Guarda só
 * o molde, sem ids nem nomes. O download é um GET feito de dentro da aba do Onvio (com a mesma autorização da página),
 * e o arquivo vai direto para a pasta de downloads do Chrome: a extensão não guarda nada. */
const ROTAS_ANEXO_MAX = 20;
async function guardarRotaAnexo(msg) {
  const molde = OC.moldeDeAnexo(String(msg.url || ''));
  if (!molde) return false;
  const campo = typeof msg.campo === 'string' && /^[A-Za-z_][\w]{0,40}$/.test(msg.campo) ? msg.campo : null;
  const { rotasAnexo } = await chrome.storage.local.get('rotasAnexo');
  const l = Array.isArray(rotasAnexo) ? rotasAnexo : [];
  const igual = l.find(r => r.molde === molde && (r.campo || null) === campo);
  if (igual) { igual.vezes = (igual.vezes || 1) + 1; igual.em = new Date().toISOString(); }
  else l.push({ molde, campo, vezes: 1, em: new Date().toISOString() });
  await chrome.storage.local.set({ rotasAnexo: l.sort((a, b) => String(b.em).localeCompare(String(a.em))).slice(0, ROTAS_ANEXO_MAX) });
  return true;
}
const MAX_DOWNLOADS = 50;
async function baixarAnexos(msg) {
  const t = OC.TYPE_BY_KEY[msg.type];
  if (!t) throw new Error('tipo desconhecido');
  const pedidos = Array.isArray(msg.anexos) ? msg.anexos : [];
  if (!pedidos.length) throw new Error('escolha ao menos um anexo');
  if (pedidos.length > MAX_DOWNLOADS) throw new Error('no máximo ' + MAX_DOWNLOADS + ' anexos de uma vez');
  const ok = v => typeof v === 'string' && /^[\w-]{1,80}$/.test(v);
  const direto = u => typeof u === 'string' && u.length < 800 && /^https:\/\/onvio\.com\.br\/api\/storage\//i.test(u) && OC.leituraAnexoPermitida(u);
  if (pedidos.some(a => !a || !(ok(a.id) || direto(a.direto)) || (a.id != null && !ok(a.id)) || (a.topico != null && !ok(a.topico)) || (a.direto != null && !direto(a.direto)))) throw new Error('anexo inválido');
  const { f } = await escolherFetcher(true);                     // confere de novo que é o escritório
  const tab = await abaOnvio();
  if (!tab) throw new Error('Abra o Onvio numa aba para baixar.');
  const d = await f(OC.urlConsulta(t, { numero: msg.num, per: 5 }));
  const r = ((d && d.items) || []).find(x => String(x.identifier) === String(msg.num));
  if (!r) throw new Error('solicitação #' + msg.num + ' não encontrada em ' + t.label);
  const { rotasAnexo } = await chrome.storage.local.get('rotasAnexo');
  const nomeSeguro = n => String(n || 'anexo').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').slice(0, 180) || 'anexo';
  const itens = [], semRota = [];
  for (const a of pedidos) {
    const nome = nomeSeguro(a.nome);
    if (a.direto) { itens.push({ url: a.direto, campo: null, direto: true, nome }); continue; }      // staticFilePath: o próprio arquivo
    const u = OC.urlAnexo(t, { sol: r.id, topico: a.topico || null, anexo: a.id, nome }, rotasAnexo || []);
    if (u && OC.leituraAnexoPermitida(u.url)) itens.push({ url: u.url, campo: u.campo, nome }); else semRota.push(nome);
  }
  if (!itens.length) return { baixados: 0, falhas: [], semRota: semRota.length, rotas: (rotasAnexo || []).length };
  const [res] = await chrome.scripting.executeScript({
    target: { tabId: tab.id }, world: 'MAIN',
    func: async lista => {
      const auth = typeof window.__controlOnvioAutorizacao === 'function' ? window.__controlOnvioAutorizacao() : null;
      const out = [];
      for (const it of lista) {
        try {
          const doOnvio = h => { try { const u = new URL(h); return u.protocol === 'https:' && /(^|\.)onvio\.com\.br$/i.test(u.hostname) && !u.username; } catch (e) { return false; } };
          let href, blob = null;
          if (it.direto) href = it.url;                         // staticFilePath: o arquivo já está nesse endereço
          else {
            const headers = { Accept: '*/*' };
            if (auth) headers.Authorization = auth;
            const r = await fetch(it.url, { method: 'GET', headers, credentials: 'include' });
            if (!r.ok) { out.push({ nome: it.nome, erro: 'HTTP ' + r.status }); continue; }
            if (it.campo) {
              const j = await r.json();
              href = j && j[it.campo];
              if (typeof href !== 'string' || !doOnvio(href)) { out.push({ nome: it.nome, erro: 'o Onvio não devolveu o endereço do arquivo' }); continue; }
            } else { blob = await r.blob(); href = URL.createObjectURL(blob); }
          }
          const a = document.createElement('a');
          a.href = href; a.download = it.nome; a.rel = 'noopener'; a.style.display = 'none';
          document.body.appendChild(a); a.click(); a.remove();
          if (blob) setTimeout(() => URL.revokeObjectURL(href), 60000);
          out.push({ nome: it.nome, ok: true });
          await new Promise(res => setTimeout(res, 400));
        } catch (e) { out.push({ nome: it.nome, erro: String(e && e.message || e).slice(0, 120) }); }
      }
      return out;
    },
    args: [itens]
  });
  const lista = (res && res.result) || [];
  return { baixados: lista.filter(x => x.ok).length, falhas: lista.filter(x => !x.ok).map(x => x.nome + ': ' + x.erro), semRota: semRota.length, rotas: (rotasAnexo || []).length };
}
async function executarAcao(msg) {
  const t = OC.TYPE_BY_KEY[msg.type];
  if (!t) throw new Error('tipo desconhecido');
  const { f } = await escolherFetcher(true);                     // confere de novo que é o escritório
  const tab = await abaOnvio();
  if (!tab) throw new Error('Abra o Onvio numa aba para enviar.');
  const d = await f(OC.urlConsulta(t, { numero: msg.num, per: 5 }));
  const r = ((d && d.items) || []).find(x => String(x.identifier) === String(msg.num));
  if (!r) throw new Error('solicitação #' + msg.num + ' não encontrada em ' + t.label);
  const s = await getSettings();
  const item = OC.normalize(t, r, null, s.abaErrada);
  // distribuição automática: nunca troca quem já é responsável (a Geral deixaria sobrescrever; aqui só vale para quem está sem ninguém)
  if (msg.soSemResponsavel && item.resp) { const e = new Error('já tem responsável (' + item.resp + ')'); e.jaTem = true; throw e; }
  const p = OC.pedidoAcao(msg, r, item);
  if (!OC.escritaPermitida(p.metodo, p.url)) throw new Error('endereço de escrita não permitido');
  const arquivos = Array.isArray(msg.arquivos) ? msg.arquivos : [];
  if (arquivos.length > MAX_ANEXOS) throw new Error('no máximo ' + MAX_ANEXOS + ' anexos por trâmite');
  if (arquivos.some(a => !a || typeof a.b64 !== 'string' || a.b64.length * 0.75 > MAX_BYTES)) throw new Error('anexo inválido ou maior que 15 MB');
  const escreve = escritaPorAba(tab.id);
  const res = await escreve(p.metodo, p.url, p.corpo);
  if (res.status === 401 || res.status === 403) { const e = new Error('o Onvio recusou a ação (HTTP ' + res.status + '). Faça pelo Onvio e avise quem mantém a extensão.'); e.recusado = true; throw e; }
  if (res.status < 200 || res.status >= 300) throw new Error('o Onvio não aceitou (' + (res.status ? 'HTTP ' + res.status : res.erro || 'falha de rede') + ')');
  const out = { acao: msg.acao, anexos: 0, erroAnexos: null };
  if (msg.acao === 'tramite' && arquivos.length) {
    const topicId = OC.idDoLocation(res.location);
    const u = topicId && OC.urlAnexoTramite(t, r.id, topicId);
    if (!u) out.erroAnexos = 'o Onvio não devolveu o número do trâmite; anexe pelo Onvio';
    else if (!OC.escritaPermitida('POST', u)) out.erroAnexos = 'endereço de anexo não permitido';
    else {
      const ra = await escreve('POST', u, null, arquivos);
      if (ra.status >= 200 && ra.status < 300) out.anexos = arquivos.length;
      else out.erroAnexos = 'o trâmite foi enviado, mas o anexo não (' + (ra.status ? 'HTTP ' + ra.status : ra.erro || 'falha de rede') + '). Anexe pelo Onvio.';
    }
  }
  if (!msg.semColetar) coletar(false).catch(() => {});           // a fila e o Hoje já refletem a ação
  return out;
}

/* ---------- distribuição automática de responsáveis (liga o gestor, na Equipe) ----------
 * Exceção registrada no CLAUDE.md à regra de confirmar na tela: só "definir responsável" de solicitação SEM responsável, pelos mesmos
 * critérios da aba Distribuir, a cada N minutos (15), em horário comercial, no Chrome de quem ligou, com uma aba do Onvio aberta.
 * Para na primeira recusa (401/403), nunca troca quem já é responsável e nunca escreve outra coisa. */
let rodandoDist = false;
async function lerDistAuto() { const { distribuicaoAuto } = await chrome.storage.local.get('distribuicaoAuto'); return distribuicaoAuto || { ligada: false }; }
async function gravarDistAuto(p) { const novo = Object.assign({}, await lerDistAuto(), p); await chrome.storage.local.set({ distribuicaoAuto: novo }); return novo; }
async function estadoDistAuto() {
  const [est, { distribuicaoLog }, s] = [await lerDistAuto(), await chrome.storage.local.get('distribuicaoLog'), await getSettings()];
  return { ok: true, ligada: !!est.ligada, ligadaEm: est.ligadaEm || null, ultima: est.ultima || null, log: distribuicaoLog || [], config: Object.assign({}, OC.DEFAULTS.distribuicaoAuto, s.distribuicaoAuto || {}), rodando: rodandoDist };
}
// A leitura da aba Distribuir: movimentadas dos últimos 30 dias + sugestões por empresa (nada é guardado)
async function calcularDistribuicao(f, pend) {
  const dias = 30;                                 // período fixo (7 e 14 dias saíram)
  const mov = await OC.lerMovimentadas(emSegundoPlano(f), dias, new Date());
  // concluídas valem para quem as concluiu, quando a avaliação da equipe já leu os trâmites (sem chamadas novas aqui)
  const { desempenhoCache } = await chrome.storage.local.get('desempenhoCache');
  return { dias, movimentadas: mov.itens.length, erros: mov.erros, sugestoes: OC.distribuirPorCliente(pend, OC.creditarQuemConcluiu(mov.itens, desempenhoCache || {}), dias) };
}
async function distribuirAutomatico(manual) {
  if (rodandoDist) return { pulou: 'já está rodando' };
  rodandoDist = true;
  const ultima = { em: new Date().toISOString(), atribuidas: 0, falhas: 0, puladas: {}, parou: '' };
  const log = [];
  try {
    const est = await lerDistAuto();
    if (!est.ligada) return { pulou: 'desligada' };
    const s = await getSettings();
    if (!manual && !OC.dentroDoHorario(new Date(), s)) return { pulou: 'fora do horário' };
    const { snapshot } = await chrome.storage.local.get('snapshot');
    const pend = (snapshot && snapshot.items) || [];
    if (!pend.some(i => !i.resp)) { ultima.parou = 'nada sem responsável'; }
    else if (!(await abaOnvio())) { ultima.parou = 'sem aba do Onvio aberta'; }
    else {
      let f;
      try { f = (await escolherFetcher(true)).f; }
      catch (e) { if (e && e.cliente) await bloquearVisaoCliente(e); ultima.parou = e && e.cliente ? 'acesso de cliente' : String((e && e.message) || e); }
      if (f) {
        const d = await calcularDistribuicao(f, pend);
        const perfil = OC.perfilSetor(s, snapshot.user && snapshot.user.nome, snapshot.user && snapshot.user.departmentId);
        const plano = OC.planoDistribuicaoAuto(pend, d.sugestoes, perfil);
        ultima.puladas = plano.puladas;
        for (const a of plano.atribuir) {
          try {
            await executarAcao({ cmd: 'acao', type: a.item.type, num: String(a.item.num), acao: 'responsavel', analista: a.respId, soSemResponsavel: true, semColetar: true });
            ultima.atribuidas++;
            log.push({ k: a.item.k, num: a.item.num, type: a.item.type, typeLabel: a.item.typeLabel, cliente: a.item.apelido || a.item.cliente || '', resp: a.resp, em: new Date().toISOString() });
          } catch (e) {
            if (e && e.jaTem) { ultima.puladas.jaTemResponsavel = (ultima.puladas.jaTemResponsavel || 0) + 1; continue; }
            ultima.falhas++;
            if (e && (e.recusado || e.auth || e.cliente || /Abra o Onvio/.test(e.message))) { if (e.cliente) await bloquearVisaoCliente(e); ultima.parou = String(e.message || e); break; }
          }
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }
    await gravarDistAuto({ ultima });
    if (log.length) {
      const { distribuicaoLog } = await chrome.storage.local.get('distribuicaoLog');
      await chrome.storage.local.set({ distribuicaoLog: log.reverse().concat(distribuicaoLog || []).slice(0, 100) });
      coletar(false).catch(() => {});                // uma leitura só no fim da rodada
    }
    if (s.notificar && (ultima.atribuidas || (ultima.parou && !['nada sem responsável', 'sem aba do Onvio aberta'].includes(ultima.parou)))) {
      const por = {};
      for (const l of log) por[l.resp] = (por[l.resp] || 0) + 1;
      const resumo = Object.entries(por).map(([n, q]) => n.split(' ')[0] + ' ' + q).join(', ');
      await chrome.notifications.create('dist-' + Date.now(), { type: 'basic', iconUrl: 'icons/128.png', title: ultima.atribuidas ? 'Distribuição automática: ' + ultima.atribuidas + (ultima.atribuidas === 1 ? ' atribuída' : ' atribuídas') : 'Distribuição automática parou', message: ultima.parou ? ultima.parou : resumo, priority: 0 });
    }
    return { ultima };
  } catch (e) {
    const ult = Object.assign(ultima, { parou: String((e && e.message) || e) });
    await gravarDistAuto({ ultima: ult }).catch(() => {});
    return { ultima: ult };
  } finally { rodandoDist = false; }
}

/* ---------- criar solicitação Geral (autorizado em 16/10/2026) ----------
 * O id do cliente vem de uma solicitação dele (origem), lida na hora. Tipo, meio e departamento: regras do escritório
 * ou o próprio Onvio (uma Geral recente e o acesso do usuário); na memória, só esses 3 valores técnicos, por 6 h.
 * Opcional: logo depois, um trâmite "Respondido" passa a vez ao cliente. Texto nenhum é guardado. */
let modeloCriacaoCache = null;
async function modeloDeCriacao(f, s, dep) {
  const c = Object.assign({}, OC.DEFAULTS.criacao, s.criacao || {});
  if (c.serviceRequestType && c.requestWay && (c.departmentId || (dep && c.departamentos && c.departamentos[dep]))) return OC.modeloCriacao(s, null, null, dep);
  if (!modeloCriacaoCache || Date.now() - modeloCriacaoCache.em > 6 * 3600e3) {
    const so = (e) => { if (e && (e.auth || e.cliente)) throw e; return null; };
    const acesso = await f(OC.URL_SO_ESCRITORIO()).catch(so);
    let exemplo = null;
    const geral = OC.TYPE_BY_KEY.geral;
    const l = await f(OC.urlConsulta(geral, { per: 5, orderBy: 'created desc' })).catch(so);
    const r0 = l && l.items && l.items[0];
    if (r0 && r0.id) exemplo = await f(OC.urlDetalhe(geral, r0.id)).catch(so);
    const pega = o => (o ? { serviceRequestType: o.serviceRequestType, requestWay: o.requestWay || (r0 && r0.requestWay), departmentId: o.departmentId || (r0 && r0.departmentId) } : r0 ? { requestWay: r0.requestWay, departmentId: r0.departmentId } : null);
    modeloCriacaoCache = { exemplo: pega(exemplo), acesso: acesso && typeof acesso.departmentId === 'string' ? { departmentId: acesso.departmentId } : null, em: Date.now() };
  }
  return OC.modeloCriacao(s, modeloCriacaoCache.exemplo, modeloCriacaoCache.acesso, dep);
}
function conferirEscrita(res) {
  if (res.status === 401 || res.status === 403) throw new Error('o Onvio recusou (HTTP ' + res.status + '). Faça pelo Onvio e avise quem mantém a extensão.');
  if (res.status < 200 || res.status >= 300) throw new Error('o Onvio não aceitou (' + (res.status ? 'HTTP ' + res.status : res.erro || 'falha de rede') + ')');
}
async function criarSolicitacao(msg) {
  const { f } = await escolherFetcher(true);                     // confere de novo que é o escritório
  const tab = await abaOnvio();
  if (!tab) throw new Error('Abra o Onvio numa aba para criar.');
  const to = msg.origem && OC.TYPE_BY_KEY[msg.origem.type];
  if (!to || msg.origem.num == null) throw new Error('escolha o cliente');
  const d = await f(OC.urlConsulta(to, { numero: msg.origem.num, per: 5 }));
  const r = ((d && d.items) || []).find(x => String(x.identifier) === String(msg.origem.num));
  if (!r) throw new Error('não encontrei a solicitação #' + msg.origem.num + ' para saber o cliente');
  const clienteId = r.clientExpanded && r.clientExpanded.id;
  if (!clienteId) throw new Error('o Onvio não trouxe o id do cliente; crie pelo Onvio');
  const s = await getSettings();
  const dep = OC.DEPARTAMENTOS.includes(msg.departamento) ? msg.departamento : '';
  const modelo = await modeloDeCriacao(f, s, dep);
  const p = OC.pedidoCriacao({ assunto: msg.assunto, descricao: msg.descricao }, clienteId, modelo);
  if (!OC.escritaPermitida(p.metodo, p.url)) throw new Error('endereço de escrita não permitido');
  const escreve = escritaPorAba(tab.id);
  const desde = Date.now();
  conferirEscrita(await escreve(p.metodo, p.url, p.corpo));
  const out = { criada: true, num: null, id: null, tramite: false, erroTramite: null, departamentoPadrao: !!modelo.departamentoPadrao };
  const geral = OC.TYPE_BY_KEY.geral;
  try {
    const l = await f(OC.urlConsulta(geral, { search: p.corpo.subject, per: 20, orderBy: 'created desc' }));
    const nova = OC.acharCriada((l && l.items) || [], p.corpo.subject, clienteId, desde);
    if (nova) { out.num = String(nova.identifier); out.id = nova.id; }
  } catch (e) { if (e && (e.auth || e.cliente)) throw e; }
  if (msg.passarVez) {
    if (!out.id) out.erroTramite = 'a solicitação foi criada, mas não a encontrei na lista para passar a vez ao cliente; faça pelo detalhe';
    else {
      const u = OC.urlNovoTramite(geral, out.id);
      if (!OC.escritaPermitida('POST', u)) out.erroTramite = 'endereço de trâmite não permitido';
      else {
        const rt = await escreve('POST', u, { description: s.tramiteCriacao || OC.DEFAULTS.tramiteCriacao, status: 4 });
        if (rt.status >= 200 && rt.status < 300) out.tramite = true;
        else out.erroTramite = 'a solicitação foi criada, mas o trâmite não (' + (rt.status ? 'HTTP ' + rt.status : rt.erro || 'falha de rede') + ')';
      }
    }
  }
  coletar(false).catch(() => {});
  return out;
}

async function detalhe(msg) {
  const t = OC.TYPE_BY_KEY[msg.type];
  if (!t) throw new Error('tipo desconhecido');
  interativas++;
  const t0 = Date.now(), tempos = {};
  const marca = (k, p) => p.then(v => { tempos[k] = Date.now() - t0; return v; });
  try {
    const s = await getSettings();
    const { f, via } = await marca('sessao', escolherFetcher());
    // Com o id já conhecido (da última leitura), dados e trâmites saem junto com a busca pelo número, em vez de depois dela
    const { snapshot } = await chrome.storage.local.get('snapshot');
    const conhecido = snapshot && (snapshot.items || []).concat(snapshot.resolvidas || []).find(i => i.type === msg.type && String(i.num) === String(msg.num) && i.id);
    const ler = id => Promise.all([
      marca('dados', f(OC.urlDetalhe(t, id)).then(d => ({ d }), e => { if (e && e.auth) throw e; return { erro: e.message || String(e) }; })),
      marca('tramites', f(OC.urlTramites(t, id)).then(d => ({ d }), e => { if (e && e.auth) throw e; return { erro: e.message || String(e) }; }))
    ]);
    const antes = conhecido ? ler(conhecido.id) : null;
    if (antes) antes.catch(() => {});            // se a busca falhar antes, o erro dela é o que vale
    const d = await marca('consulta', f(OC.urlConsulta(t, { numero: msg.num, per: 5 })));
    const r = ((d && d.items) || []).find(x => String(x.identifier) === String(msg.num));
    if (!r) throw new Error('solicitação #' + msg.num + ' não encontrada em ' + t.label);
    const x = OC.detalheDe(t, r);
    Object.assign(x, OC.evaluate(x, s, new Date()));
    // Solicitação completa (aba Dados) e trâmites, lidos na hora e em paralelo. Nada disso é guardado.
    const [comp, tr] = await (antes && conhecido.id === r.id ? antes : ler(r.id));
    const completo = comp.d ? OC.camposDetalhe(t, comp.d) : null;
    const datas = OC.datasDe(comp.d || r);
    if (comp.d && typeof comp.d.description === 'string' && !x.descricao) x.descricao = comp.d.description;
    registrarTempo(Object.assign({ via, adiantado: !!antes, total: Date.now() - t0 }, tempos));
    return {
      item: x, lista: t.label, datas,
      grupos: completo ? completo.grupos : null, anexos: completo ? completo.anexos : [], arquivos: completo ? completo.arquivos : [], erroDados: comp.erro || null,
      tramites: tr.d ? OC.tramitesDe(t, tr.d) : null, erroTramites: tr.erro || null
    };
  } finally { interativas--; }
}
// Quanto demorou cada abertura de solicitação (só os tempos, nada da solicitação): o "Testar a leitura" mostra as últimas
const temposDetalhe = [];
function registrarTempo(x) {
  temposDetalhe.unshift(Object.assign({ em: new Date().toISOString() }, x));
  temposDetalhe.length = Math.min(temposDetalhe.length, 20);
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

// Vereditos das Sugestões de ação (k -> { l, tipo, trecho }): só na memória, some quando o service worker dorme
let casosCache = {};

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
      else if (msg.cmd === 'hubStatus') reply(await hubStatus());
      else if (msg.cmd === 'hubRegistrar') reply(await hubRegistrar());
      else if (msg.cmd === 'hubDesconectar') reply(await hubDesconectar());
      else if (msg.cmd === 'hubEnviar') reply(await enviarAoHub(null, true));
      else if (msg.cmd === 'hubLote') {                  // caminho de reserva: o resumo para colar no Hub (sem o código de pareamento)
        const { snapshot } = await chrome.storage.local.get('snapshot');
        reply(snapshot ? { ok: true, lote: OC.montarLoteHub(snapshot, { versao: chrome.runtime.getManifest().version }) } : { ok: false, motivo: 'sem-leitura' });
      }
      else if (msg.cmd === 'atualizarRegras') { reply(await atualizarRegras()); }
      else if (msg.cmd === 'tick') { reply(await verificarAoVivo(!!msg.forcar)); }
      else if (msg.cmd === 'previsao') {            // sob demanda: solicitações abertas por empresa nas últimas 4 semanas (nada é guardado)
        const { f } = await escolherFetcher();
        const mov = await OC.lerMovimentadas(emSegundoPlano(f), 28, new Date());
        reply(Object.assign({ ok: true, erros: mov.erros }, OC.previsaoPorEmpresa(mov.itens, new Date(), 28)));
      }
      else if (msg.cmd === 'casos') {               // Sugestões de ação do Hoje: lê os trâmites das pendências na vez do escritório
        const { f } = await escolherFetcher();        // e devolve só o veredito (tipo e qual trecho da lista casou), nunca o texto
        const s = await getSettings();
        const { snapshot } = await chrome.storage.local.get('snapshot');
        const r = await OC.analisarCasos(emSegundoPlano(f), (snapshot && snapshot.items) || [], casosCache, s, 80);
        casosCache = r.analises;                       // só na memória do service worker (não é gravado)
        reply(Object.assign({ ok: true, em: new Date().toISOString() }, r));
      }
      else if (msg.cmd === 'desempenho') {          // área do gestor: entregas do período e do anterior, lidas na hora (nada é guardado)
        const { f } = await escolherFetcher();
        const dias = 30;                             // período fixo da avaliação (7 e 14 dias saíram)
        const s = await getSettings();
        const { snapshot } = await chrome.storage.local.get('snapshot');
        const agora = new Date();
        const mov = await OC.lerMovimentadas(emSegundoPlano(f), dias * 2 + 1, agora, 10);
        // vez do cliente sem retorno e sem pedido do analista conta como entregue na data da última resposta
        const resolvidas = ((snapshot && snapshot.resolvidas) || []).map(r => Object.assign({}, r, { lado: 'fim', status: 'Resolvida (cliente sem retorno)' }));
        // as mais recentes primeiro: o período avaliado é lido antes do anterior (que só serve de comparação)
        const entregas = resolvidas.concat(mov.itens).filter(x => x.lado === 'fim').sort((a, b) => String(b.last || '').localeCompare(String(a.last || '')));
        // trâmites de cada entrega: tempo com o escritório e quem concluiu. O cache leva só números, o nome de quem
        // concluiu e a data da última movimentação; o que saiu do período sai do cache.
        const { desempenhoCache } = await chrome.storage.local.get('desempenhoCache');
        const an = await OC.analisarEntregas(emSegundoPlano(f), entregas, desempenhoCache || {}, s, 400);
        await chrome.storage.local.set({ desempenhoCache: an.analises });
        // a conta é feita no app (com as exceções do gestor); aqui só a leitura
        reply({ ok: true, erros: mov.erros, dias, agora: agora.toISOString(), movimentadas: mov.itens.length, resolvidas: resolvidas.length, entregas, analises: an.analises, lidas: an.lidas, falhasTramites: an.falhas, semLeitura: an.semLeitura });
      }
      else if (msg.cmd === 'distribuicao') {        // sob demanda: quem mais atendeu cada empresa nos últimos dias (nada é guardado)
        const { f } = await escolherFetcher();
        const { snapshot } = await chrome.storage.local.get('snapshot');
        const d = await calcularDistribuicao(f, (snapshot && snapshot.items) || []);
        reply({ ok: true, dias: d.dias, movimentadas: d.movimentadas, erros: d.erros, sugestoes: d.sugestoes });
      }
      else if (msg.cmd === 'distribuicaoAuto') {     // interruptor da distribuição automática (Equipe, gestor): liga, desliga ou só devolve o estado
        if (typeof msg.ligar === 'boolean') {
          await gravarDistAuto(msg.ligar ? { ligada: true, ligadaEm: new Date().toISOString() } : { ligada: false });
          await agendar();
        }
        reply(await estadoDistAuto());
      }
      else if (msg.cmd === 'distribuicaoAutoAgora') { reply(Object.assign({ ok: true }, await distribuirAutomatico(true))); }
      else if (msg.cmd === 'consultar') { reply(Object.assign({ ok: true }, await consultar(msg))); }
      else if (msg.cmd === 'acao') { reply(Object.assign({ ok: true }, await executarAcao(msg))); }
      else if (msg.cmd === 'criar') { reply(Object.assign({ ok: true }, await criarSolicitacao(msg))); }
      else if (msg.cmd === 'detalhe') { reply(Object.assign({ ok: true }, await detalhe(msg))); }
      else if (msg.cmd === 'baixarAnexos') { reply(Object.assign({ ok: true }, await baixarAnexos(msg))); }
      else if (msg.cmd === 'rotaAnexo') { reply({ ok: await guardarRotaAnexo(msg) }); }
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


/* ---------- ponte com o Control Hub (opcional) ----------
 * O Hub é uma página do escritório aberta no claude.ai; só ela grava no banco. A extensão entrega a ela um RESUMO das
 * solicitações (OC.montarLoteHub: sem assunto, sem nome de empregado) pelo script ponte-hub.js. Fica desligada até a
 * pessoa clicar em "Conectar ao Control Hub" (permissão do claude.ai pedida na hora) e colar o código de pareamento. */
const HUB_ORIGENS = ['https://claude.ai/*'];
const HUB_SCRIPT_ID = 'ponte-hub';
async function hubCfg() { const { hubCfg } = await chrome.storage.local.get('hubCfg'); return Object.assign({ token: '', auto: true }, hubCfg || {}); }
async function hubGuardar(extra) { const c = await hubCfg(); await chrome.storage.local.set({ hubCfg: Object.assign(c, extra) }); }
async function hubAbas() { try { return await chrome.tabs.query({ url: HUB_ORIGENS }); } catch (e) { return []; } }
async function hubPermitido() { try { return await chrome.permissions.contains({ origins: HUB_ORIGENS }); } catch (e) { return false; } }
async function hubRegistrar() {
  if (!(await hubPermitido())) return { ok: false, motivo: 'sem-permissao' };
  const def = { id: HUB_SCRIPT_ID, matches: HUB_ORIGENS, js: ['ponte-hub.js'], runAt: 'document_start', persistAcrossSessions: true };
  try { await chrome.scripting.registerContentScripts([def]); }
  catch (e) { try { await chrome.scripting.updateContentScripts([def]); } catch (e2) { return { ok: false, motivo: 'registro: ' + (e2.message || e2) }; } }
  // abas do claude.ai que já estavam abertas: injeta agora (o registro só vale para páginas novas)
  for (const t of await hubAbas()) { try { await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['ponte-hub.js'] }); } catch (e) { /* aba protegida ou fechada */ } }
  return { ok: true };
}
async function hubDesconectar() {
  try { await chrome.scripting.unregisterContentScripts({ ids: [HUB_SCRIPT_ID] }); } catch (e) { /* já não estava */ }
  try { await chrome.permissions.remove({ origins: HUB_ORIGENS }); } catch (e) { /* ignora */ }
  return { ok: true };
}
async function hubStatus() {
  const c = await hubCfg(), permitido = await hubPermitido(), abas = permitido ? await hubAbas() : [];
  let hubAberto = false;
  for (const t of abas) { try { const r = await chrome.tabs.sendMessage(t.id, { alvo: 'ponte-hub', cmd: 'status' }); if (r && r.hub) { hubAberto = true; break; } } catch (e) { /* aba sem o script */ } }
  const { hubUltimo } = await chrome.storage.local.get('hubUltimo');
  return { ok: true, permitido, abasClaude: abas.length, hubAberto, temCodigo: !!c.token, auto: !!c.auto, ultimo: hubUltimo || null };
}
const hashLote = l => { let h = 0; const t = l.tabela + '|' + JSON.stringify(l.porTipo); for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return String(h); };
// manual: envia sempre. Automático: só o que mudou desde o último envio aceito.
async function enviarAoHub(snap, manual) {
  const c = await hubCfg();
  if (!c.token) return { ok: false, motivo: 'sem-codigo' };
  if (!(await hubPermitido())) return { ok: false, motivo: 'sem-permissao' };
  const snapshot = snap || (await chrome.storage.local.get('snapshot')).snapshot;
  if (!snapshot) return { ok: false, motivo: 'sem-leitura' };
  const lote = OC.montarLoteHub(snapshot, { versao: chrome.runtime.getManifest().version });
  const hash = hashLote(lote);
  const { hubUltimo } = await chrome.storage.local.get('hubUltimo');
  if (!manual && hubUltimo && hubUltimo.ok && hubUltimo.hash === hash) return { ok: true, motivo: 'sem-mudanca' };
  lote.id = 'onvio-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  lote.token = c.token;
  let r = { ok: false, motivo: 'sem-hub' };
  for (const t of await hubAbas()) {
    try { const x = await chrome.tabs.sendMessage(t.id, { alvo: 'ponte-hub', cmd: 'enviar', lote }); if (x) r = x; if (x && x.ok) break; } catch (e) { /* aba sem o script */ }
  }
  await chrome.storage.local.set({ hubUltimo: { ok: !!r.ok, motivo: r.motivo || '', em: new Date().toISOString(), linhas: lote.nLinhas, total: lote.totalNaOrigem, hash: r.ok ? hash : (hubUltimo && hubUltimo.hash) || '', mensagem: r.mensagem || '' } });
  return Object.assign({ linhas: lote.nLinhas, total: lote.totalNaOrigem }, r);
}
async function enviarAoHubAuto(snap) { const c = await hubCfg(); if (c.token && c.auto) return enviarAoHub(snap, false); }

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
// Ao instalar ou atualizar: esquece as rotas de trâmites aprendidas (até a 0.11; hoje o caminho é fixo) e os erros
// de trâmites guardados, para o 1º trâmite ser procurado de novo já na próxima leitura.
chrome.runtime.onInstalled.addListener(async () => {
  const { tramites } = await chrome.storage.local.get('tramites');
  await chrome.storage.local.remove(['rotasTramites', 'semCalculoMarcas']);   // as marcas do quadro de avisos sem cálculo (saiu na 0.33.0)
  if (tramites) await chrome.storage.local.set({ tramites: Object.fromEntries(Object.entries(tramites).filter(([, v]) => !(v && v.erro))) });
});
chrome.runtime.onStartup.addListener(iniciar);
chrome.alarms.onAlarm.addListener(a => {
  if (a.name === ALARME) coletar(false);
  else if (a.name.startsWith(PREFIXO_LEMBRETE)) dispararLembrete(a.name.slice(PREFIXO_LEMBRETE.length));
  else if (a.name === ALARME_REGRAS) atualizarRegras();
  else if (a.name === ALARME_DIST) distribuirAutomatico(false);
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

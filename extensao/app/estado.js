/* Control Onvio · estado do app
 * Espelho de chrome.storage.local: o service worker lê o Onvio e grava o resumo; o app só observa.
 * Nada aqui fala com o Onvio diretamente: pedidos vão ao service worker por mensagem. */
const OC = window.OC;

const CHAVES = {
  snapshot: 'snap', status: 'status', settings: 'usuario', regrasEscritorio: 'regras', ultimaVerificacao: 'ultima',
  eventos: 'eventos', lembretes: 'lembretes', serie: 'serie', alertasVistosEm: 'alertasVistosEm', semCalculoMarcas: 'semCalcMarcas', avaliacaoExcecoes: 'excecoes'
};

export const estado = {
  snap: null, status: null, usuario: {}, regras: null, ultima: null,
  eventos: [], lembretes: [], serie: {}, alertasVistosEm: null, semCalcMarcas: {}, excecoes: {},
  settings: Object.assign({}, OC.DEFAULTS)
};

const ouvintes = new Set();
export function aoMudar(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); }

function aplicar(d) {
  for (const [k, campo] of Object.entries(CHAVES)) {
    if (!(k in d)) continue;
    const v = d[k];
    estado[campo] = v == null ? (['eventos', 'lembretes'].includes(campo) ? [] : ['serie', 'usuario', 'semCalcMarcas', 'excecoes'].includes(campo) ? {} : null) : v;
  }
  estado.settings = OC.combinarSettings(estado.regras, estado.usuario);
}

export async function iniciarEstado() {
  aplicar(await chrome.storage.local.get(Object.keys(CHAVES)));
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    const mud = {};
    for (const k of Object.keys(ch)) if (k in CHAVES) mud[k] = ch[k].newValue;
    if (!Object.keys(mud).length) return;
    aplicar(mud);
    const quais = Object.keys(mud).map(k => CHAVES[k]);
    ouvintes.forEach(fn => { try { fn(quais); } catch (e) { console.error(e); } });
  });
}

// Mensagem ao service worker (ler o Onvio, consultar, abrir no Onvio...).
export function enviar(msg) {
  return new Promise(res => {
    try { chrome.runtime.sendMessage(msg, r => res(r || { ok: false, erro: (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'sem resposta' })); }
    catch (e) { res({ ok: false, erro: e.message }); }
  });
}

/* ---------- derivados usados em várias telas ---------- */
export const itens = () => (estado.snap && estado.snap.items) || [];
export const minhas = () => itens().filter(i => i.mine);
// "Cliente respondeu": vez do escritório numa situação em que o último a escrever foi o cliente.
export const clienteRespondeu = i => OC.clienteRespondeu(i);
export const primeiroNome = () => { const n = estado.snap && estado.snap.user && estado.snap.user.nome; return n ? n.split(' ')[0] : ''; };

export async function salvarLembretes(lista) { await chrome.storage.local.set({ lembretes: lista }); }
// Quadro dos avisos sem cálculo: só o id interno (k), a coluna e quando (OC.marcarSemCalculo)
export async function marcarSemCalculo(k, st) { await chrome.storage.local.set({ semCalculoMarcas: OC.marcarSemCalculo(estado.semCalcMarcas, k, st, itens(), new Date()) }); }
// Avaliação da equipe: casos que o gestor tirou da conta (só o k e quando; no Chrome dele)
export async function marcarExcecao(k, fora) {
  const l = Object.assign({}, estado.excecoes || {});
  if (fora) l[k] = new Date().toISOString(); else delete l[k];
  // guarda no máximo 500 (as mais recentes) e nada com mais de 180 dias
  const lim = Date.now() - 180 * 864e5;
  for (const [x, em] of Object.entries(l)) if (new Date(em).getTime() < lim) delete l[x];
  const ord = Object.entries(l).sort((a, b) => b[1].localeCompare(a[1])).slice(0, 500);
  const novo = Object.fromEntries(ord);
  estado.excecoes = novo;
  await chrome.storage.local.set({ avaliacaoExcecoes: novo });
}
export async function marcarAlertasVistos() { await chrome.storage.local.set({ alertasVistosEm: new Date().toISOString() }); }

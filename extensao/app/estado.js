/* Control Onvio · estado do app
 * Espelho de chrome.storage.local: o service worker lê o Onvio e grava o resumo; o app só observa.
 * Nada aqui fala com o Onvio diretamente: pedidos vão ao service worker por mensagem. */
const OC = window.OC;

const CHAVES = {
  snapshot: 'snap', status: 'status', settings: 'usuario', regrasEscritorio: 'regras', ultimaVerificacao: 'ultima',
  eventos: 'eventos', lembretes: 'lembretes', serie: 'serie', alertasVistosEm: 'alertasVistosEm', avaliacaoExcecoes: 'excecoes', sugestoesIgnoradas: 'sugIgnoradas', modelosPessoais: 'modelosPessoais',
  distribuicaoAuto: 'distAuto', distribuicaoLog: 'distLog'
};

export const estado = {
  snapBruto: null, setor: { ativo: false, fora: false, dep: '' },
  snap: null, status: null, usuario: {}, regras: null, ultima: null,
  eventos: [], lembretes: [], serie: {}, alertasVistosEm: null, excecoes: {}, sugIgnoradas: {}, modelosPessoais: [], distAuto: null, distLog: [],
  settings: Object.assign({}, OC.DEFAULTS)
};

const ouvintes = new Set();
export function aoMudar(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); }

function aplicar(d) {
  for (const [k, campo] of Object.entries(CHAVES)) {
    if (!(k in d)) continue;
    const v = d[k];
    if (campo === 'snap') { estado.snapBruto = v == null ? null : v; continue; }       // o resumo passa pelo filtro do setor abaixo
    estado[campo] = v == null ? (['eventos', 'lembretes', 'modelosPessoais', 'distLog'].includes(campo) ? [] : ['serie', 'usuario', 'excecoes', 'sugIgnoradas'].includes(campo) ? {} : null) : v;
  }
  estado.settings = OC.combinarSettings(estado.regras, estado.usuario);
  // Setores: quem não é da equipe do DP vê só as suas; a Geral mostra só o que é do DP (regras do escritório)
  const raw = estado.snapBruto;
  estado.setor = OC.perfilSetor(estado.settings, raw && raw.user && raw.user.nome, raw && raw.user && raw.user.departmentId);
  estado.snap = raw && estado.setor.ativo ? Object.assign({}, raw, { items: OC.filtrarPorSetor(raw.items, estado.setor), resolvidas: OC.filtrarPorSetor(raw.resolvidas, estado.setor) }) : raw;
  if (estado.setor.fora) estado.eventos = (estado.eventos || []).filter(e => e.mine);
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
// As "consideradas resolvidas" (vez do cliente sem retorno): ficam fora de itens(), mas ainda dá para concluí-las (Sugestões de ação)
export const resolvidas = () => ((estado.snap && estado.snap.resolvidas) || []).map(i => Object.assign({}, i, { lado: 'cli', resolvida: true }));
// "Cliente respondeu": vez do escritório numa situação em que o último a escrever foi o cliente.
export const clienteRespondeu = i => OC.clienteRespondeu(i);
export const primeiroNome = () => { const n = estado.snap && estado.snap.user && estado.snap.user.nome; return n ? n.split(' ')[0] : ''; };

export async function salvarLembretes(lista) { await chrome.storage.local.set({ lembretes: lista }); }
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
// Modelos de resposta pessoais (texto padrão, sem dado de cliente): até 20, no Chrome da pessoa
export async function salvarModelosPessoais(lista) {
  const l = (lista || []).filter(m => m && m.rot && m.texto).slice(0, 20).map(m => ({ id: m.id, rot: String(m.rot).slice(0, 60), texto: String(m.texto).slice(0, 2000), situacao: m.situacao || null, tipo: m.tipo || null }));
  estado.modelosPessoais = l;
  await chrome.storage.local.set({ modelosPessoais: l });
}
// Sugestões de ação: "não é o caso" guarda só o k e a última movimentação (volta se a solicitação mexer)
export async function ignorarSugestao(k, item) {
  const novo = OC.ignorarCaso(estado.sugIgnoradas, k, item, new Date());
  estado.sugIgnoradas = novo;
  await chrome.storage.local.set({ sugestoesIgnoradas: novo });
}
export async function marcarAlertasVistos() { await chrome.storage.local.set({ alertasVistosEm: new Date().toISOString() }); }

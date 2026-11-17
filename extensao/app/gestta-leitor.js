/* Tarefas do Gestta · leitor contínuo e armazém de leituras (0.124.0)
 * Josué, 17/11/2026: "primeiro deve carregar o que é do analista, depois do setor dele, depois dos outros setores e depois todo o restante";
 * "a leitura precisa ser contínua, mesmo que eu não clique em nada"; "cada item já lido, sem esperar os demais".
 *
 * Armazém: uma VISÃO é competência × de quem (x desconsideradas). Cada visão tem 4 partes (Meu dia ou competência × abertas ou concluídas),
 * cada uma um mapa id -> tarefa. Uma parte é lida POR PÁGINA (cmd gesttaTarefas com `passo`): cada página que chega entra no mapa na hora e
 * a tela se atualiza; na releitura o item é trocado no lugar e só no último passo some o que o Gestta não devolveu mais (nada de tela vazia).
 * Tudo só na memória desta tela (nada vai ao armazenamento).
 *
 * Leitor: uma leitura por vez (carga leve), escolhida por OCG.proximaLeitura: nível 1 o que é do analista, 2 o setor dele, 3 os outros setores,
 * 4 todo o resto (equipe, relatório do mês, Fechamento, Gestão, Envios, CNPJ). Pedir uma visão na tela fura a fila (urgente).
 */
const G = window.OCG;

const PARTES = ['dia', 'comp'], SITS = ['abertas', 'concluidas'];
export const armazem = new Map();
const MAX_VISOES = 10;
export const chaveDe = (ano, mes, quem, desc) => [ano, mes, quem, !!desc].join('|');
const novaParte = () => ({ itens: new Map(), lidoEm: 0, lendo: false, lidos: 0, total: null, cortado: false, erro: null, comecou: false, completa: false });
const kp = (parte, sit) => parte + '|' + sit;

export function obterVisao(ano, mes, quem, desc) {
  const chave = chaveDe(ano, mes, quem, desc);
  let v = armazem.get(chave);
  if (!v) {
    v = { chave, ano, mes, quem, desc: !!desc, comum: null, partes: {}, visto: 0 };
    for (const p of PARTES) for (const s of SITS) v.partes[kp(p, s)] = novaParte();
    armazem.set(chave, v);
  }
  v.visto = Date.now();
  if (armazem.size > MAX_VISOES) {          // sai a menos vista que não está em uso
    const emUso = new Set([...jobs.values()].filter(j => j.chave).map(j => j.chave));
    const velhas = [...armazem.values()].filter(x => x.chave !== chave && !emUso.has(x.chave)).sort((a, b) => a.visto - b.visto);
    while (armazem.size > MAX_VISOES && velhas.length) armazem.delete(velhas.shift().chave);
  }
  return v;
}

/* ---------- leitura de uma parte, página por página ---------- */
export async function lerParte(v, parte, sit, o) {
  const P = v.partes[kp(parte, sit)];
  if (P.lendo) return { ok: true, jaLendo: true };
  P.lendo = true; P.erro = null; P.lidos = 0; P.total = null;
  const visto = new Set(); let passo = {}, voltas = 0, r = null;
  try {
    for (;;) {
      r = await o.enviar({ cmd: 'gesttaTarefas', ano: v.ano, mes: v.mes, quem: v.quem, desconsideradas: v.desc, parte, situacoes: sit, passo });
      if (!r || !r.ok) { P.erro = r || { erro: 'sem resposta' }; return { ok: false, r: P.erro }; }
      if (r.recomecar) visto.clear();                      // o Gestta recusou o filtro de setor: o que veio antes não vale mais
      v.comum = Object.assign({}, v.comum || {}, { perfil: r.perfil, validade: r.validade, setorPessoas: r.setorPessoas, porDepartamento: r.porDepartamento, setoresPermitidos: r.setoresPermitidos, modoCompetencia: r.modoCompetencia || (v.comum && v.comum.modoCompetencia) });
      const itens = (parte === 'dia' ? r.dia : r.itens) || [], agora = Date.now(), primeira = !P.comecou;
      for (const t of itens) { if (!t || !t._id) continue; visto.add(t._id); P.itens.set(t._id, { t: o.legivel ? o.legivel(t) : t, em: agora }); }
      P.lidos = visto.size; P.comecou = true; if (r.total != null) P.total = r.total;
      if (r.fim === true || (r.fim === undefined && !r.passo)) break;      // sem cursor = resposta inteira de uma vez (modo antigo)
      passo = r.passo || {};
      if (++voltas > 600) { P.cortado = true; break; }
      if (o.aoPagina) o.aoPagina(v, primeira);
    }
    for (const id of [...P.itens.keys()]) if (!visto.has(id)) P.itens.delete(id);       // o que o Gestta não devolveu mais sai só agora
    P.lidoEm = Date.now(); P.completa = true;
    return { ok: true };
  } catch (e) {
    P.erro = { erro: String(e && e.message || e) }; return { ok: false, r: P.erro };
  } finally { P.lendo = false; if (o.aoPagina) o.aoPagina(v, false, true); }
}

/* ---------- o que a tela enxerga: a junção das partes da visão ---------- */
const uniao = (v, parte) => {
  const m = new Map();
  for (const s of SITS) for (const [id, e] of v.partes[kp(parte, s)].itens) { const o = m.get(id); if (!o || e.em >= o.em) m.set(id, e); }      // vale a leitura mais nova
  return [...m.values()].map(e => e.t);
};
const temParte = (v, parte) => SITS.some(s => { const P = v.partes[kp(parte, s)]; return P.comecou || P.completa; });
export function comporDados(v, comCnpj) {
  if (!v || !v.comum) return null;
  const c = comCnpj || (t => t), d = Object.assign({}, v.comum, { __chave: v.chave });
  if (temParte(v, 'comp')) d.itens = uniao(v, 'comp').map(c);
  if (temParte(v, 'dia')) d.dia = uniao(v, 'dia').map(c);
  else { const e = SITS.map(s => v.partes[kp('dia', s)].erro).find(Boolean); if (e) { d.dia = null; d.diaErro = e.erro || ''; } }
  d.cortado = SITS.some(s => v.partes[kp('comp', s)].cortado); d.diaCortado = SITS.some(s => v.partes[kp('dia', s)].cortado);
  d.desconsideradas = v.desc;
  return d;
}
export function estadoDaVisao(v) {
  if (!v) return { lendo: false, falta: new Set(PARTES), erro: null, lidoEm: 0, lidos: 0, total: null, completa: false };
  const Ps = PARTES.flatMap(p => SITS.map(s => v.partes[kp(p, s)]));
  const falta = new Set(PARTES.filter(p => !temParte(v, p) && !SITS.some(s => v.partes[kp(p, s)].erro)));
  const lendoP = Ps.filter(P => P.lendo);
  const erro = !temParte(v, 'comp') && !temParte(v, 'dia') ? (Ps.map(P => P.erro).find(Boolean) || null) : null;
  const lidos = lendoP.reduce((n, P) => n + P.lidos, 0), total = lendoP.every(P => P.total != null) && lendoP.length ? lendoP.reduce((n, P) => n + P.total, 0) : null;
  const lidoEm = Math.max(0, ...Ps.filter(P => P.completa).map(P => P.lidoEm));
  return { lendo: lendoP.length > 0, falta, erro, lidoEm, lidos, total, completa: Ps.every(P => P.completa) };
}

/* ---------- o leitor: uma leitura por vez, por prioridade ---------- */
const jobs = new Map();
const TTL = { abertas: { 1: 2 * 60e3, 2: 5 * 60e3, 3: 10 * 60e3 }, concluidas: 15 * 60e3 };
export const ttlDe = (sit, nivel) => sit === 'abertas' ? (TTL.abertas[nivel] || TTL.abertas[3]) : TTL.concluidas;
let ctx = null, parado = false, tempo = 0, semSessaoAte = 0, rodando = false;
const medidas = [];

export function iniciarLeitor(c) { ctx = c; if (!tempo) agendar(400); }
export function pausarLeitor(ms) { semSessaoAte = Date.now() + ms; }
function agendar(ms) { clearTimeout(tempo); tempo = setTimeout(tick, ms); }

// lista = [{ ano, mes, quem, desc, nivel }]: as visões que o leitor mantém quentes (as 4 partes de cada uma)
export function definirVisoes(lista) {
  const querem = new Set();
  for (const x of lista) {
    const v = obterVisao(x.ano, x.mes, x.quem, x.desc);
    for (const p of PARTES) for (const s of SITS) {
      const id = 't|' + v.chave + '|' + kp(p, s); querem.add(id);
      const j = jobs.get(id);
      if (j) { j.nivel = x.nivel; j.ttl = ttlDe(s, x.nivel); continue; }
      jobs.set(id, { id, chave: v.chave, parte: p, sit: s, nivel: x.nivel, ttl: ttlDe(s, x.nivel), lidoEm: P0(v, p, s), urgente: false, lendo: false, bloqueadoAte: 0,
        rodar: () => lerParte(v, p, s, { enviar: ctx.enviar, legivel: ctx.legivel, aoPagina: (vv, primeira, fim) => ctx.aoMudar(vv.chave, { primeira: !!primeira, fim: !!fim }) }) });
    }
  }
  for (const [id, j] of [...jobs]) if (j.chave && !querem.has(id) && !j.lendo) jobs.delete(id);
}
const P0 = (v, p, s) => v.partes[kp(p, s)].lidoEm || 0;

// leituras gerais (nível 4): equipe, relatório do mês, Fechamento, Gestão, Envios, CNPJ...
export function registrarGeral(id, nivel, ttl, rodar, ativo) {
  const j = jobs.get(id);
  if (j) { j.nivel = nivel; j.ttl = ttl; j.rodar = rodar; j.ativo = ativo; return; }
  jobs.set(id, { id, nivel, ttl, lidoEm: 0, urgente: false, lendo: false, bloqueadoAte: 0, rodar, ativo });
}
export function pedirGeral(id) { const j = jobs.get(id); if (j) { j.urgente = true; j.bloqueadoAte = 0; agendar(50); } }
// pedir uma visão na tela: as partes velhas (ou todas, com `forcar`) passam na frente da fila
// a parte da aba aberta e as tarefas em aberto vão primeiro (j.ordem); uma parte que já está sendo lida e foi pedida de novo à força é refeita ao terminar
export function urgenteVisao(chave, forcar, parteDaAba) {
  const agora = Date.now(); let n = 0;
  for (const j of jobs.values()) {
    if (j.chave !== chave) continue;
    const velho = forcar || !j.lidoEm || agora - j.lidoEm >= j.ttl;
    if (!velho) continue;
    if (j.lendo) { if (forcar) j.refazer = true; continue; }
    j.urgente = true; j.bloqueadoAte = 0; j.ordem = (j.parte === (parteDaAba || 'comp') ? 0 : 2) + (j.sit === 'abertas' ? 0 : 1); n++;
  }
  if (n) agendar(30);
  return n;
}
export const visaoLendo = (chave) => [...jobs.values()].some(j => j.chave === chave && (j.lendo || j.urgente));

async function tick() {
  tempo = 0;
  if (parado || !ctx || rodando) return;       // uma leitura por vez: quem pediu com urgência espera esta terminar (o fim dela agenda a próxima)
  const agora = Date.now();
  if (agora < semSessaoAte) return agendar(Math.min(5000, semSessaoAte - agora));
  const lista = [...jobs.values()].filter(j => !j.ativo || j.ativo());
  const j = G.proximaLeitura(lista, agora, { escondida: document.visibilityState !== 'visible' });
  if (!j) return agendar(1000);
  j.lendo = true; j.urgente = false; rodando = true;
  const t0 = performance.now(); let r = null;
  try { r = await j.rodar(); } catch (e) { r = { ok: false, r: { erro: String(e && e.message || e) } }; }
  j.lendo = false; rodando = false; j.lidoEm = Date.now();
  if (j.refazer) { j.refazer = false; j.urgente = true; j.ordem = 0; }
  const erro = r && r.ok === false ? (r.r || r) : null;
  medidas.push({ id: j.id, ms: Math.round(performance.now() - t0), ok: !erro, em: Date.now() }); if (medidas.length > 80) medidas.shift();
  if (erro && (erro.semSessao || erro.status === 401 || /sessão do Gestta/i.test(erro.erro || ''))) { semSessaoAte = Date.now() + 30e3; if (ctx.aoSemSessao) ctx.aoSemSessao(erro); }
  else if (erro) j.bloqueadoAte = Date.now() + Math.min(5 * 60e3, Math.max(30e3, j.ttl));       // falhou: tenta de novo mais tarde, sem martelar
  agendar(250);
}

// só números e nomes de leitura (nada de dado de cliente), para o "Copiar diagnóstico"
export function diagnostico() {
  const l = medidas.map(m => m.id + ' ' + m.ms + ' ms' + (m.ok ? '' : ' (falhou)'));
  const v = [...armazem.values()].map(x => x.quem + ' ' + x.ano + '-' + x.mes + ': ' + PARTES.flatMap(p => SITS.map(s => p + '/' + s + '=' + x.partes[kp(p, s)].itens.size)).join(' '));
  return 'Leitor do Gestta · ' + jobs.size + ' leituras, ' + armazem.size + ' visões\n' + v.join('\n') + '\nÚltimas leituras:\n' + l.slice(-40).join('\n');
}

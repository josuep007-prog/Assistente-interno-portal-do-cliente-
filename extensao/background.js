/* Control Onvio · service worker
 * Lê o Onvio de tempos em tempos, guarda um resumo e avisa o usuário.
 * Fase 1: somente leitura. Nada é gravado no Onvio.
 */
importScripts('core.js', 'gestta.js', 'mediador.js');

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
  chrome.alarms.create(ALARME_HUBSYNC, { periodInMinutes: 60, delayInMinutes: 6 });      // confere a cada hora se já passou o intervalo do envio completo ao Hub (só lê o armazenamento)
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
/* ---------- Gestta (só leitura; regras na seção Gestta do CLAUDE.md) ----------
 * Toda leitura é feita de dentro da aba do Gestta, no mundo da página: o núcleo (gestta.js) é injetado na hora,
 * confere cada pedido de novo, usa o token só lá e devolve só os dados já limpos. O service worker nunca vê o token. */
async function abaGestta() {
  const abas = await chrome.tabs.query({ url: 'https://app.gestta.com.br/*' });
  const boas = abas.filter(t => OCG.appDe(t.url || '') && OCG.appDe(t.url || '') !== 'login');
  return boas.find(t => t.active) || boas[0] || abas[0] || null;
}
async function lerGestta(pedidos, opcoes) {
  const lista = (pedidos || []).filter(p => p && OCG.leituraPermitida(p.metodo, p.url, p.corpo == null ? null : p.corpo).ok);
  if (lista.length !== (pedidos || []).length) throw new Error('pedido ao Gestta fora da lista permitida');
  const tab = (opcoes && opcoes.tab) || await abaGestta();
  if (!tab) return { aba: null, r: null };
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', files: ['gestta.js'] });
  const [res] = await chrome.scripting.executeScript({
    target: { tabId: tab.id }, world: 'MAIN',
    func: (ps, pausa) => (self.OCG ? self.OCG.lerNaPagina(ps, { pausa }) : { ok: false, motivo: 'núcleo do Gestta não carregou na aba' }),
    args: [lista, opcoes && opcoes.pausa != null ? opcoes.pausa : OCG.PAUSA_MS]
  });
  return { aba: tab, r: (res && res.result) || null };
}
// Tela "Tarefas do Gestta" (0.72.0): as tarefas do mês de quem está logado (ou, para a coordenação, de outra pessoa
// ou as sem responsável), abertas, com impedimento e concluídas, de 1000 em 1000. Lidas na hora e entregues ao app:
// nada fica no armazenamento. O analista só vê as dele: o pedido de outra pessoa sem acesso total vira "eu".
async function tabDoGestta(sender) {
  const t = sender && sender.tab;
  return t && OCG.appDe(t.url || '') ? t : await abaGestta();
}
// Todas as páginas de uma busca de tarefas (de 1000 em 1000, até OCG.MAX_PAGINAS_TAREFAS).
async function buscarTodasGestta(tab, base) {
  const itens = []; let total = null, paginas = 1;
  for (let p = 1; p <= paginas && p <= OCG.MAX_PAGINAS_TAREFAS; p++) {
    const { r } = await lerGestta([OCG.PEDIDOS.buscaTarefas(Object.assign({}, base, { page: p }))], { tab });
    const x = r && r.resultados && r.resultados[0];
    if (!r || !r.ok || !x) return { ok: false, erro: 'A leitura das tarefas parou no meio (aba do Gestta sem resposta).' };
    if (x.status !== 200) return { ok: false, status: x.status, erro: x.status === 403 ? 'Seu acesso do Gestta não inclui essas tarefas.' : x.status === 401 ? 'A sessão do Gestta acabou: faça login de novo na aba.' : 'O Gestta não respondeu às tarefas (' + (x.erro || x.recusado || x.status) + ').' };
    itens.push(...((x.dados && x.dados.itens) || []));
    if (x.dados && x.dados.total != null) total = x.dados.total;
    paginas = Math.max(1, Number(x.dados && x.dados.paginas) || 1);
  }
  return { ok: true, itens, total: total != null ? total : itens.length, cortado: paginas > OCG.MAX_PAGINAS_TAREFAS };
}
// 0.85.0 (Josué, 06/11/2026): as tarefas de uma competência. Tenta a busca pela competência (date_type COMPETENCE_DATE) e confere
// se o Gestta respeitou; se recusar ou ignorar, lê as metas da competência e dos 3 meses seguintes e separa pela competence_date.
// O jeito que deu certo fica lembrado só na memória do service worker.
let gesttaModoComp = '';
async function tarefasDaCompetencia(tab, base, ano, mes) {
  if (gesttaModoComp !== 'meta') {
    const d = await buscarTodasGestta(tab, Object.assign({}, base, { ano, mes, dataTipo: 'COMPETENCE_DATE' }));
    if (d.ok && OCG.buscaPorCompetenciaValeu(d.itens, ano, mes)) { gesttaModoComp = 'direto'; return Object.assign(d, { modo: 'direto' }); }
    if (!d.ok && d.status !== 400 && d.status !== 422 && d.status !== 500) return d;          // 401, 403, aba sem resposta: o erro é outro
    gesttaModoComp = 'meta';
  }
  const vistos = new Map(); let cortado = false;
  for (const m of OCG.mesesDaCompetencia(ano, mes)) {
    const d = await buscarTodasGestta(tab, Object.assign({}, base, { ano: m.ano, mes: m.mes }));
    if (!d.ok) return d;
    if (d.cortado) cortado = true;
    OCG.daCompetencia(d.itens, ano, mes).forEach(t => { if (t && t._id && !vistos.has(t._id)) vistos.set(t._id, t); });
  }
  const itens = [...vistos.values()];
  return { ok: true, itens, total: itens.length, cortado, modo: 'meta' };
}
async function gesttaTarefas(msg, sender) {
  const tab = await tabDoGestta(sender);
  if (!tab) return { ok: false, semAba: true, erro: 'Abra o Gestta numa aba, já logado.' };
  const { r: r1 } = await lerGestta([OCG.PEDIDOS.me()], { tab });
  if (!r1 || !r1.ok) return { ok: false, semSessao: !!(r1 && r1.semSessao), erro: (r1 && r1.motivo) || 'A aba do Gestta não respondeu (recarregue com F5).' };
  const me = r1.resultados[0], pf = me && me.dados ? OCG.perfil(me.dados) : null;
  if (!pf || !pf.ok) return { ok: false, erro: 'Não consegui saber quem está logado no Gestta' + (me && me.status ? ' (' + (me.erro || me.status) + ')' : '') + '.' };
  const padrao = OCG.competenciaPadrao(new Date());
  const ano = Number(msg.ano) || padrao.ano, mes = Number(msg.mes) || padrao.mes;
  let quem = String(msg.quem || 'eu');
  if (!pf.total || !(quem === 'eu' || quem === 'sem' || /^[0-9a-f]{24}$/i.test(quem))) quem = 'eu';
  const base = { limit: OCG.LIMITE_BUSCA, status: ['OPEN', 'IMPEDIMENT', 'DONE'] };
  if (quem === 'sem') base.semDono = true; else base.companyUser = quem === 'eu' ? pf.id : quem;
  const comp = await tarefasDaCompetencia(tab, base, ano, mes);
  if (!comp.ok) return { ok: false, erro: comp.erro };
  // Meu dia: pelo vencimento (escolha do Josué em 06/11/2026), as metas do mês corrente, de qualquer competência
  const h = new Date(), dia = await buscarTodasGestta(tab, Object.assign({}, base, { ano: h.getFullYear(), mes: h.getMonth() + 1 }));
  return { ok: true, ano, mes, quem, perfil: { id: pf.id, papelNome: pf.papelNome, total: pf.total, setores: pf.setores }, itens: comp.itens, total: comp.total, cortado: comp.cortado, modoCompetencia: comp.modo,
    dia: dia.ok ? dia.itens : null, diaErro: dia.ok ? '' : dia.erro, diaCortado: !!dia.cortado, validade: r1.validade || null, lidoEm: new Date().toISOString() };
}
// Fechamento do mês (0.73.0): o relatório CUSTOMER_TASK do mês, lido sob demanda e guardado SÓ na memória do Chrome
// (chrome.storage.session: some ao fechar o navegador, nunca vai ao disco), com no máximo uma leitura por hora
// (decisão do Josué em 05/11/2026). Com acesso parcial, a resposta vai marcada "parcial" e a tela avisa.
const FECH_INTERVALO_MS = 60 * 60e3;
// O relatório CUSTOMER_TASK de um mês de meta. 0.83.0: num 400 tenta os outros valores de período que o próprio Gestta usa.
async function relatorioDoMes(tab, ano, mes) {
  let x = null;
  for (const filtro of OCG.filtrosRelatorio({ ano, mes })) {
    const { r } = await lerGestta([OCG.PEDIDOS.fechamento({ ano, mes, filtro })], { tab });
    x = r && r.resultados && r.resultados[0];
    if (!x || x.status !== 400) { if (x && x.status === 200) OCG.lembrarFiltroRel(filtro); break; }
  }
  if (!x) return { ok: false, erro: 'A aba do Gestta não respondeu ao relatório.' };
  if (x.status !== 200 || !x.dados) return { ok: false, erro: x.status === 403 ? 'Seu acesso do Gestta não inclui o relatório de tarefas.' : x.status === 401 ? 'A sessão do Gestta acabou: faça login de novo na aba.' : 'O relatório do Gestta não veio (' + (x.erro || x.recusado || x.status) + ').' };
  return { ok: true, colunas: x.dados.colunas, linhas: x.dados.linhas, total: x.dados.total, formato: x.dados.formato };
}
// 0.85.0: o Fechamento é da competência. O relatório só sabe a meta, então: as tarefas da competência (a busca, todas as que o
// acesso alcança), os meses em que elas vencem, o relatório de cada um desses meses e só as linhas dessas tarefas.
async function gesttaFechamento(msg, sender) {
  const padrao = OCG.competenciaPadrao(new Date());
  const ano = Number(msg.ano) || padrao.ano, mes = Number(msg.mes) || padrao.mes;
  const chave = 'gtFechC-' + ano + '-' + String(mes).padStart(2, '0');
  const guardado = (await chrome.storage.session.get(chave).catch(() => ({})))[chave];
  const idade = guardado ? Date.now() - new Date(guardado.lidoEm).getTime() : Infinity;
  if (guardado && (!msg.forcar || idade < FECH_INTERVALO_MS)) return Object.assign({ ok: true, daMemoria: true, podeEm: Math.max(0, Math.ceil((FECH_INTERVALO_MS - idade) / 60e3)) }, guardado);
  const tab = await tabDoGestta(sender);
  if (!tab) return { ok: false, semAba: true, erro: 'Abra o Gestta numa aba, já logado.' };
  const { r: r1 } = await lerGestta([OCG.PEDIDOS.me()], { tab });
  if (!r1 || !r1.ok) return { ok: false, semSessao: !!(r1 && r1.semSessao), erro: (r1 && r1.motivo) || 'A aba do Gestta não respondeu (recarregue com F5).' };
  const pf = r1.resultados[0] && r1.resultados[0].dados ? OCG.perfil(r1.resultados[0].dados) : null;
  if (!pf || !pf.ok) return { ok: false, erro: 'Não consegui saber quem está logado no Gestta.' };
  const t0 = Date.now();
  const comp = await tarefasDaCompetencia(tab, { limit: OCG.LIMITE_BUSCA, status: ['OPEN', 'IMPEDIMENT', 'DONE'] }, ano, mes);
  if (!comp.ok) return { ok: false, erro: comp.erro };
  const ids = new Set(comp.itens.map(t => t && t._id).filter(Boolean)), meses = OCG.mesesDeMeta(comp.itens).slice(0, 6);
  let colunas = null, formato = '', linhas = [];
  for (const m of meses) {
    const rel = await relatorioDoMes(tab, m.ano, m.mes);
    if (!rel.ok) return { ok: false, erro: rel.erro };
    colunas = colunas || rel.colunas; formato = formato || rel.formato;
    const iId = (rel.colunas || []).indexOf('id');
    linhas = linhas.concat((rel.linhas || []).filter(l => iId >= 0 && ids.has(String(l[iId]))));
  }
  const dados = { ano, mes, competencia: true, lidoEm: new Date().toISOString(), segundos: Math.round((Date.now() - t0) / 1000), parcial: !pf.total, mesesMeta: meses.map(m => OCG.mesTexto(m.ano, m.mes)), semRelatorio: Math.max(0, ids.size - linhas.length),
    perfil: { papelNome: pf.papelNome, total: pf.total, setores: pf.setores }, colunas: colunas || OCG.COLUNAS_FECHAMENTO, linhas, total: linhas.length, formato, cortado: !!comp.cortado };
  let naMemoria = true;
  try { await chrome.storage.session.set({ [chave]: dados }); } catch (e) { naMemoria = false; }       // grande demais para a memória: vale só nesta resposta
  return Object.assign({ ok: true, naMemoria, podeEm: 60 }, dados);
}
// Detalhe de uma tarefa para o painel lateral: um GET, id conferido; nada é guardado.
async function gesttaTarefa(msg, sender) {
  const id = String(msg.id || '');
  if (!/^[0-9a-f]{24}$/i.test(id)) return { ok: false, erro: 'tarefa inválida' };
  const tab = await tabDoGestta(sender);
  if (!tab) return { ok: false, erro: 'Abra o Gestta numa aba, já logado.' };
  const { r } = await lerGestta([OCG.PEDIDOS.tarefa({ id })], { tab });
  const x = r && r.resultados && r.resultados[0];
  if (!r || !r.ok) return { ok: false, erro: (r && r.motivo) || 'A aba do Gestta não respondeu.' };
  if (!x || x.status !== 200 || !x.dados) return { ok: false, erro: x && x.status === 403 ? 'Seu acesso não inclui esta tarefa.' : x && x.status === 404 ? 'A tarefa não foi encontrada no Gestta.' : 'Não consegui ler a tarefa (' + ((x && (x.erro || x.status)) || 'sem resposta') + ').' };
  return { ok: true, tarefa: x.dados };
}
// Linha do tempo da tarefa (0.77.0): a 1ª página do histórico, só tipo, situação, data, quem e nome do documento; nada é guardado.
async function gesttaHistorico(msg, sender) {
  const id = String(msg.id || '');
  if (!/^[0-9a-f]{24}$/i.test(id)) return { ok: false, erro: 'tarefa inválida' };
  const tab = await tabDoGestta(sender);
  if (!tab) return { ok: false, erro: 'Abra o Gestta numa aba, já logado.' };
  const { r } = await lerGestta([OCG.PEDIDOS.historico({ id })], { tab });
  const x = r && r.resultados && r.resultados[0];
  if (!r || !r.ok) return { ok: false, erro: (r && r.motivo) || 'A aba do Gestta não respondeu.' };
  if (!x || x.status !== 200 || !x.dados) return { ok: false, erro: x && x.status === 403 ? 'Seu acesso não inclui o histórico desta tarefa.' : 'Não consegui ler o histórico (' + ((x && (x.erro || x.status)) || 'sem resposta') + ').' };
  return { ok: true, eventos: OCG.eventosDaTarefa(x.dados.itens || []), total: x.dados.total, paginas: x.dados.paginas };
}
// Ações no Gestta (0.93.0, aprovadas pelo Josué em 11/11/2026 e mapeadas na empresa de teste): etapa feita ou não, concluir,
// reabrir, impedimento, comentário interno e envio de documento. A tela só chama depois da confirmação da pessoa. O pedido é
// montado aqui (OCG.pedidoAcao), conferido aqui e de novo na página (OCG.escritaPermitida) e feito de dentro da aba do Gestta,
// com o token só lá. Nada é guardado: nem o texto, nem o arquivo, nem a resposta (volta só o resumo da tarefa).
async function gesttaAcao(msg, sender) {
  // só as telas da extensão pedem ação (nunca um script de conteúdo, como a ponte do Hub no claude.ai)
  if (!String((sender && sender.url) || '').startsWith(chrome.runtime.getURL('app/'))) return { ok: false, erro: 'Ação recusada: só a tela das Tarefas do Gestta pode pedir.' };
  const p = OCG.pedidoAcao(msg);
  if (p.erro) return { ok: false, erro: p.erro.charAt(0).toUpperCase() + p.erro.slice(1) + '.' };
  const perm = OCG.escritaPermitida(p.metodo, p.url, p.corpo);
  if (!perm.ok) return { ok: false, erro: 'A extensão recusou a ação (' + perm.motivo + ').' };
  const tab = await tabDoGestta(sender);
  if (!tab) return { ok: false, erro: 'Abra o Gestta numa aba, já logado.' };
  let x = null;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', files: ['gestta.js'] });
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: (ped) => (self.OCG ? self.OCG.agirNaPagina(ped) : { ok: false, erro: 'núcleo do Gestta não carregou na aba' }), args: [p] });
    x = res && res.result;
  } catch (e) { return { ok: false, erro: 'A aba do Gestta não respondeu (' + String(e && e.message || e).slice(0, 80) + ').' }; }
  if (!x) return { ok: false, erro: 'A aba do Gestta não respondeu.' };
  if (x.ok) return { ok: true, acao: msg.acao, tarefa: x.tarefa || null };
  if (x.recusado) return { ok: false, erro: 'A extensão recusou a ação (' + x.recusado + ').' };
  const st = x.status;
  return { ok: false, status: st, erro: st === 401 ? 'A sessão do Gestta acabou: faça login de novo na aba e tente outra vez.'
    : st === 403 ? 'Seu acesso do Gestta não permite esta ação nesta tarefa.'
    : st === 404 ? 'A tarefa (ou a etapa, ou o documento) não existe mais no Gestta.'
    : st === 413 ? 'O Gestta recusou o arquivo por ser grande demais.'
    : 'O Gestta não aceitou (' + (x.erro || ('erro ' + st)) + ').' };
}
// Para a coordenação escolher de quem ver as tarefas: só id e nome da equipe ativa.
async function gesttaEquipe(msg, sender) {
  const tab = await tabDoGestta(sender);
  if (!tab) return { ok: false, erro: 'Abra o Gestta numa aba, já logado.' };
  const pessoas = [];
  for (let p = 1; p <= 5; p++) {
    const { r } = await lerGestta([OCG.PEDIDOS.equipe({ limit: 200, page: p })], { tab });
    const x = r && r.resultados && r.resultados[0];
    if (!x || x.status !== 200) return { ok: false, erro: x && x.status === 403 ? 'Seu acesso não inclui a equipe.' : 'Não consegui ler a equipe do Gestta.' };
    (x.dados.itens || []).forEach(u => { if (u && u._id && u.active !== false) pessoas.push({ id: u._id, nome: String(u.name || ''), setores: (u.company_departments || []).map(s => String(s.name || '')) }); });
    if (!x.dados.paginas || p >= x.dados.paginas) break;
  }
  return { ok: true, pessoas: pessoas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) };
}
// Configurações › Avançado: quem está logado, o perfil e uma leitura de prova de cada fonte (só contagens).
async function testarGestta() {
  const tab = await abaGestta();
  if (!tab) return OCG.linhasDoTeste(null, null);
  const agora = new Date(), ano = agora.getFullYear(), mes = agora.getMonth() + 1;
  const { r: r1 } = await lerGestta([OCG.PEDIDOS.me()], { tab });
  if (!r1 || !r1.ok) return OCG.linhasDoTeste(r1, tab);
  const me = (r1.resultados || [])[0], pf = me && me.dados ? OCG.perfil(me.dados) : null;
  if (!pf || !pf.ok) return OCG.linhasDoTeste(r1, tab);
  const pedidos = [OCG.PEDIDOS.setores(), OCG.PEDIDOS.equipe({ limit: 1 }), OCG.PEDIDOS.clientes({ limit: 1 }),
    OCG.PEDIDOS.buscaTarefas({ ano, mes, limit: 1 }), OCG.PEDIDOS.multas({ ano, mes }), OCG.PEDIDOS.filaOnvioErro({ limit: 1 }), OCG.PEDIDOS.templatesDocumento()];
  const { r: r2 } = await lerGestta(pedidos, { tab });
  const resultados = [me].concat((r2 && r2.resultados) || []);
  // cartela e contatos de um cliente (o primeiro da lista), para provar a leitura sem mostrar quem é (0.88.0: só contagens dos contatos)
  const cli = resultados.find(x => x.id === 'clientes'), um = cli && cli.dados && (cli.dados.itens || [])[0];
  if (um && um._id) { const { r: r3 } = await lerGestta([OCG.PEDIDOS.cartela({ cliente: um._id }), OCG.PEDIDOS.contatos({ cliente: um._id })], { tab }); if (r3 && r3.resultados) resultados.push(...r3.resultados); }
  return OCG.linhasDoTeste(Object.assign({}, r2 || r1, { resultados }), tab);
}

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
const MAX_ANEXOS = 30, MAX_BYTES = 15 * 1024 * 1024;

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
const ANEXO_VER_MAX = 15 * 1024 * 1024;
// Confere o pedido (só o escritório, só onvio.com.br, só GET) e monta o endereço de cada anexo. Comum ao baixar e ao visualizar.
async function prepararAnexos(msg) {
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
  if (!tab) throw new Error('Abra o Onvio numa aba para ver ou baixar anexos.');
  const { rotasAnexo } = await chrome.storage.local.get('rotasAnexo');
  const nomeSeguro = n => String(n || 'anexo').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').slice(0, 180) || 'anexo';
  const itens = [], semRota = [];
  let r = null;
  for (const a of pedidos) {
    const nome = nomeSeguro(a.nome);
    if (a.direto) { itens.push({ url: a.direto, campo: null, nome }); continue; }      // staticFilePath: o próprio arquivo (também precisa da autorização)
    if (!r) {
      const d = await f(OC.urlConsulta(t, { numero: msg.num, per: 5 }));
      r = ((d && d.items) || []).find(x => String(x.identifier) === String(msg.num));
      if (!r) throw new Error('solicitação #' + msg.num + ' não encontrada em ' + t.label);
    }
    const u = OC.urlAnexo(t, { sol: r.id, topico: a.topico || null, anexo: a.id, nome }, rotasAnexo || []);
    if (u && OC.leituraAnexoPermitida(u.url)) itens.push({ url: u.url, campo: u.campo, nome }); else semRota.push(nome);
  }
  return { tab, itens, semRota, rotas: (rotasAnexo || []).length };
}
// Roda na aba do Onvio: busca cada arquivo COM a autorização do Onvio (antes, o endereço direto ia para o Chrome baixar sem ela e o Onvio
// recusava: "O arquivo não estava disponível no site", 05/11/2026) e salva pelo Chrome ('baixar') ou devolve o conteúdo ('ver', só o 1º).
function anexosNaPagina(lista, modo, max) {
  return (async () => {
    const auth = typeof window.__controlOnvioAutorizacao === 'function' ? window.__controlOnvioAutorizacao() : null;
    const doOnvio = h => { try { const u = new URL(h); return u.protocol === 'https:' && /(^|\.)onvio\.com\.br$/i.test(u.hostname) && !u.username; } catch (e) { return false; } };
    const mesmoSite = h => { try { return new URL(h).origin === location.origin; } catch (e) { return false; } };
    const pegar = async (u) => { const headers = { Accept: '*/*' }; if (auth && mesmoSite(u)) headers.Authorization = auth; return fetch(u, { method: 'GET', headers, credentials: mesmoSite(u) ? 'include' : 'omit' }); };
    const out = [];
    for (const it of lista) {
      try {
        let r = await pegar(it.url);
        if (!r.ok) { out.push({ nome: it.nome, erro: 'HTTP ' + r.status }); continue; }
        let href = null;
        if (it.campo || /json/i.test(r.headers.get('content-type') || '')) {          // o Onvio devolve { downloadUrl } em vez do arquivo
          const j = await r.json().catch(() => null), d = j && (j[it.campo || 'downloadUrl'] || j.downloadUrl || j.url);
          if (typeof d !== 'string' || !doOnvio(d)) { out.push({ nome: it.nome, erro: 'o Onvio não devolveu o endereço do arquivo' }); continue; }
          href = d;
          try { r = await pegar(d); } catch (e) { r = null; }
          if (r && !r.ok) { out.push({ nome: it.nome, erro: 'HTTP ' + r.status }); continue; }
        }
        let blob = null;
        if (r) { try { blob = await r.blob(); } catch (e) { blob = null; } }
        if (blob && /text\/html/i.test(blob.type)) { out.push({ nome: it.nome, erro: 'o Onvio devolveu uma página em vez do arquivo (sessão expirada?)' }); continue; }
        if (modo === 'ver') {
          if (!blob) { out.push({ nome: it.nome, erro: 'não foi possível ler o arquivo' }); break; }
          if (blob.size > max) { out.push({ nome: it.nome, erro: 'arquivo grande demais para visualizar (' + Math.round(blob.size / 1048576) + ' MB): baixe' }); break; }
          const b = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
          out.push({ nome: it.nome, ok: true, tipo: blob.type || '', b64: btoa(s), tamanho: b.length });
          break;
        }
        const alvo = blob ? URL.createObjectURL(blob) : href;          // sem conseguir ler (outro site sem CORS): o Chrome baixa o endereço assinado
        if (!alvo) { out.push({ nome: it.nome, erro: 'não foi possível ler o arquivo' }); continue; }
        const a = document.createElement('a');
        a.href = alvo; a.download = it.nome; a.rel = 'noopener'; a.style.display = 'none';
        document.body.appendChild(a); a.click(); a.remove();
        if (blob) setTimeout(() => URL.revokeObjectURL(alvo), 60000);
        out.push({ nome: it.nome, ok: true });
        await new Promise(res => setTimeout(res, 400));
      } catch (e) { out.push({ nome: it.nome, erro: String(e && e.message || e).slice(0, 120) }); if (modo === 'ver') break; }
    }
    return out;
  })();
}
async function baixarAnexos(msg) {
  const { tab, itens, semRota, rotas } = await prepararAnexos(msg);
  if (!itens.length) return { baixados: 0, falhas: [], semRota: semRota.length, rotas };
  const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: anexosNaPagina, args: [itens, 'baixar', 0] });
  const lista = (res && res.result) || [];
  return { baixados: lista.filter(x => x.ok).length, falhas: lista.filter(x => !x.ok).map(x => x.nome + ': ' + x.erro), semRota: semRota.length, rotas };
}
// Visualizar um anexo dentro da extensão (05/11/2026, pedido do Josué): o conteúdo vem da aba do Onvio e vai direto para a tela, sem ser guardado.
async function verAnexo(msg) {
  const { tab, itens, semRota } = await prepararAnexos(Object.assign({}, msg, { anexos: [msg.anexo] }));
  if (!itens.length) return { ok: false, semRota: semRota.length > 0, erro: 'ainda não sei como o Onvio entrega este anexo: baixe um anexo pelo Onvio uma vez' };
  const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: anexosNaPagina, args: [itens.slice(0, 1), 'ver', ANEXO_VER_MAX] });
  const v = ((res && res.result) || [])[0];
  if (!v || !v.ok) return { ok: false, erro: (v && v.erro) || 'sem resposta da aba do Onvio' };
  return { ok: true, nome: v.nome, tipo: v.tipo, b64: v.b64, tamanho: v.tamanho };
}
/* ---------- anexos de um trâmite: nunca ficam para trás em silêncio (0.63.0) ----------
 * O arquivo sobe num pedido só (um por vez), cada um com o seu resultado, e o que o Onvio diz ter aceitado é CONFERIDO lendo o
 * trâmite de volta: o que não aparece lá conta como faltando. Erro de um arquivo (inclusive exceção) nunca interrompe os outros. */
async function prepararEscrita(msg) {
  const t = OC.TYPE_BY_KEY[msg.type];
  if (!t) throw new Error('tipo desconhecido');
  const { f } = await escolherFetcher(true);                     // confere de novo que é o escritório
  const tab = await abaOnvio();
  if (!tab) throw new Error('Abra o Onvio numa aba para enviar.');
  const d = await f(OC.urlConsulta(t, { numero: msg.num, per: 5 }));
  const r = ((d && d.items) || []).find(x => String(x.identifier) === String(msg.num));
  if (!r) throw new Error('solicitação #' + msg.num + ' não encontrada em ' + t.label);
  return { t, f, tab, r };
}
const topicoValido = id => typeof id === 'string' && /^[0-9a-f-]{8,64}$/i.test(id);
function arquivoValido(a) { return !!a && typeof a.nome === 'string' && a.nome && typeof a.b64 === 'string' && a.b64.length > 0 && a.b64.length * 0.75 <= MAX_BYTES; }
async function subirArquivo(escreve, u, a) {
  let ra;
  try { ra = await escreve('POST', u, null, [a]); } catch (e) { ra = { status: 0, erro: String((e && e.message) || e).slice(0, 200) }; }
  const ok = ra.status >= 200 && ra.status < 300;
  return { nome: a.nome, ok, status: ra.status || 0, erro: ok ? null : (ra.erro || null) };
}
// Lê o trâmite de volta e diz quais dos nomes (aceitos pelo Onvio) não aparecem nos anexos dele. Duas leituras, com uma pausa: o Onvio
// pode demorar um instante para listar. conferido: true (todos lá), false (faltam) ou null (não deu para ler).
async function conferirAnexos(t, r, topicId, f, nomes) {
  const quer = (nomes || []).map(n => String(n));
  if (!quer.length) return { conferido: true, naoAchados: [], achados: 0 };
  let ultimo = { conferido: null, naoAchados: [], achados: 0 };
  for (let n = 0; n < 2; n++) {
    if (n) await new Promise(ok => setTimeout(ok, 1500));
    try {
      const d = await f(OC.urlTramites(t, r.id));
      const tr = OC.tramitesDe(t, d).find(x => x.id === topicId);
      if (!tr) { ultimo = { conferido: null, naoAchados: [], achados: 0 }; continue; }
      const lista = tr.arquivos.map(x => x.nome.toLowerCase());
      const faltam = quer.filter(nome => { const i = lista.indexOf(nome.toLowerCase()); if (i < 0) return true; lista.splice(i, 1); return false; });
      ultimo = { conferido: faltam.length === 0, naoAchados: faltam, achados: tr.arquivos.length };
      if (ultimo.conferido) return ultimo;
    } catch (e) { if (e && e.auth) throw e; ultimo = { conferido: null, naoAchados: [], achados: 0 }; }
  }
  return ultimo;
}
// Um arquivo para um trâmite que já existe (o app manda um por vez, para mostrar o andamento e não estourar o limite de mensagem)
async function anexarUm(msg) {
  const { t, tab, r } = await prepararEscrita(msg);
  if (!topicoValido(msg.topicId)) throw new Error('trâmite inválido');
  if (!arquivoValido(msg.arquivo)) throw new Error('arquivo inválido, vazio ou maior que 15 MB');
  const u = OC.urlAnexoTramite(t, r.id, msg.topicId);
  if (!OC.escritaPermitida('POST', u)) throw new Error('endereço de anexo não permitido');
  return await subirArquivo(escritaPorAba(tab.id), u, msg.arquivo);
}
async function conferirAnexosCmd(msg) {
  const { t, f, r } = await prepararEscrita(msg);
  if (!topicoValido(msg.topicId)) throw new Error('trâmite inválido');
  return await conferirAnexos(t, r, msg.topicId, f, Array.isArray(msg.nomes) ? msg.nomes.slice(0, MAX_ANEXOS) : []);
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
  if (arquivos.some(a => !arquivoValido(a))) throw new Error('anexo inválido, vazio ou maior que 15 MB');
  const escreve = escritaPorAba(tab.id);
  const res = await escreve(p.metodo, p.url, p.corpo);
  if (res.status === 401 || res.status === 403) { const e = new Error('o Onvio recusou a ação (HTTP ' + res.status + '). Faça pelo Onvio e avise quem mantém a extensão.'); e.recusado = true; throw e; }
  if (res.status < 200 || res.status >= 300) throw new Error('o Onvio não aceitou (' + (res.status ? 'HTTP ' + res.status : res.erro || 'falha de rede') + ')');
  const out = { acao: msg.acao, anexos: 0, erroAnexos: null, topicId: msg.acao === 'tramite' ? (OC.idDoLocation(res.location) || null) : null };
  if (msg.acao === 'tramite' && arquivos.length) {
    const topicId = out.topicId;
    const u = topicId && OC.urlAnexoTramite(t, r.id, topicId);
    if (!u) { out.erroAnexos = 'o Onvio não devolveu o número do trâmite; anexe pelo Onvio'; out.faltam = arquivos.map(a => a.nome); }
    else if (!OC.escritaPermitida('POST', u)) { out.erroAnexos = 'endereço de anexo não permitido'; out.faltam = arquivos.map(a => a.nome); }
    else {
      // Um pedido por arquivo (0.61.0): com vários `file[]` no mesmo pedido o Onvio guardava só um. Em sequência, cada um com o seu
      // resultado; um que falha (ou dá exceção) não impede os outros; o que o Onvio aceitou é conferido lendo o trâmite (0.63.0).
      out.arquivos = [];
      for (const a of arquivos) { const x = await subirArquivo(escreve, u, a); out.arquivos.push(x); if (x.ok) out.anexos++; }
      const conf = await conferirAnexos(t, r, topicId, f, out.arquivos.filter(x => x.ok).map(x => x.nome));
      out.conferido = conf.conferido; out.naoAchados = conf.naoAchados;
      out.faltam = out.arquivos.filter(x => !x.ok).map(x => x.nome).concat(conf.naoAchados);
      if (out.faltam.length) out.erroAnexos = 'o trâmite foi enviado, mas ' + (out.faltam.length === arquivos.length ? (arquivos.length > 1 ? 'nenhum anexo' : 'o anexo não') : (arquivos.length - out.faltam.length) + ' de ' + arquivos.length + ' anexos') + ' chegou ao Onvio (faltou: ' + out.faltam.map(n => { const x = out.arquivos.find(y => y.nome === n && !y.ok); return n + (x && x.status ? ' · HTTP ' + x.status : x && x.erro ? ' · ' + x.erro : ' · não apareceu no trâmite'); }).join(', ') + '). Anexe pelo Onvio o que faltou.';
      else if (conf.conferido === null) out.avisoConferencia = 'não consegui conferir no Onvio se os anexos chegaram: confira no trâmite';
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
  const s = await getSettings();                   // 0.89.0: a conta é por setor (cliente|setor), nunca a de outro setor
  return { dias, movimentadas: mov.itens.length, erros: mov.erros, sugestoes: OC.distribuirPorCliente(pend, OC.creditarQuemConcluiu(mov.itens, desempenhoCache || {}, s), dias, s) };
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
        const perfil = OC.perfilSetor(s, snapshot.user && snapshot.user.nome, snapshot.user && snapshot.user.departmentId, snapshot);   // 0.89.0: com o snap (sem ele o perfil ficava inativo)
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
  let evs = OC.eventos(anterior, snap, s);
  // 0.89.0: só o setor escolhido em Configurações › Meu setor (gravado pelo app em visaoSetor: só a chave do setor)
  const { visaoSetor } = await chrome.storage.local.get('visaoSetor');
  if (visaoSetor && snap && snap.items) { const ks = new Set(OC.filtrarVisao(snap.items, visaoSetor, s).map(i => i.k)); evs = evs.filter(e => ks.has(e.k)); }
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

/* ---------- o painel só existe no Portal do Cliente ---------- */
// O painel (camada em tela cheia e botão) só aparece em onvio.com.br/br-portal-do-cliente/ (manifesto e shell.js). O ícone da
// extensão e o atalho funcionam de qualquer página: dentro do portal abrem/fecham o painel; fora dele levam ao portal (às
// Solicitações) e o painel abre sozinho assim que a primeira leitura termina.
const ehPortal = u => { try { const x = new URL(u); return x.origin === 'https://onvio.com.br' && /^\/br-portal-do-cliente(\/|$)/i.test(x.pathname); } catch (e) { return false; } };
// o ícone nunca fica apagado (a 0.47.0 apagava fora do portal): limpa qualquer estado antigo por aba
try { chrome.action.enable && chrome.action.enable(); } catch (e) {}

// Fala com o script do painel (shell.js). Se a aba é anterior à instalação/atualização, injeta o script antes.
async function mensagemParaPainel(tabId, type) {
  try { return await chrome.tabs.sendMessage(tabId, { type }); }
  catch (e) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['shell.js'] });
    return chrome.tabs.sendMessage(tabId, { type });
  }
}

// Leva a pessoa ao Portal do Cliente com o painel pedido: usa uma aba do portal já aberta (só do portal; outras telas do Onvio
// não servem) ou cria uma nas Solicitações. O painel abre quando a leitura está pronta (shell.js).
async function irParaOnvio() {
  const tabs = await chrome.tabs.query({ url: 'https://onvio.com.br/br-portal-do-cliente/*' });
  const alvo = tabs.find(t => ehPortal(t.url));
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

// 0.91.0 (Josué, 10/11/2026): o botão flutuante de qualquer site pergunta para onde ir: Onvio, Gestta ou os dois. Só leva às guias
// (reaproveita a que já existe, ou cria uma): a camada por cima nunca abre sozinha. Quando são os dois, o Onvio fica na frente.
const GESTTA_URL = 'https://app.gestta.com.br/';
async function focarGuia(t) { await chrome.tabs.update(t.id, { active: true }); await chrome.windows.update(t.windowId, { focused: true }); }
async function irPara(destino) {
  const quer = destino === 'ambos' ? ['gestta', 'onvio'] : destino === 'gestta' || destino === 'onvio' ? [destino] : [];
  if (!quer.length) return { ok: false, erro: 'destino desconhecido' };
  for (const d of quer) {
    const ultimo = d === quer[quer.length - 1];                           // quem vem por último fica na frente
    if (d === 'gestta') {
      const t = (await chrome.tabs.query({ url: GESTTA_URL + '*' }))[0];
      if (t) { if (ultimo) await focarGuia(t); } else await chrome.tabs.create({ url: GESTTA_URL, active: ultimo });
    } else {
      const t = (await chrome.tabs.query({ url: 'https://onvio.com.br/br-portal-do-cliente/*' })).find(x => ehPortal(x.url));
      if (t) { if (ultimo) await focarGuia(t); } else await chrome.tabs.create({ url: OC.PORTAL + 'service-requesting/general', active: ultimo });
    }
  }
  return { ok: true };
}

// Dentro do portal alterna o painel daquela aba; em qualquer outra página leva ao portal (Solicitações) e abre o painel lá, na hora (é o clique da pessoa)
async function aoClicarNoIcone(tab) {
  if (tab && tab.id != null && ehPortal(tab.url)) await mensagemParaPainel(tab.id, 'alternar').catch(() => {});
  else if (tab && tab.id != null && OCG.appDe(tab.url || '')) await chrome.tabs.sendMessage(tab.id, { controlGestta: 'alternar' }).catch(() => {});      // no Gestta: abre e fecha a camada de lá
  else await irParaOnvio();
}
chrome.action.onClicked.addListener(aoClicarNoIcone);
chrome.commands.onCommand.addListener(async (cmd, tab) => { if (cmd === 'alternar-painel') await aoClicarNoIcone(tab); });

/* ---------- abrir solicitação no Onvio ---------- */
// tabPreferida: a aba onde o painel está aberto (o painel continua aberto lá depois de trocar de página).
async function abrir(it, tabPreferida) {
  const t = OC.TYPE_BY_KEY[it.type];
  const url = OC.PORTAL + t.route;
  await chrome.storage.local.set({ abrir: { route: t.route, num: String(it.num), ts: Date.now() } });
  const pref = tabPreferida != null ? await chrome.tabs.get(tabPreferida).catch(() => null) : null;
  const tabs = await chrome.tabs.query({ url: 'https://onvio.com.br/br-portal-do-cliente/*' });
  const alvo = pref && ehPortal(pref.url) ? pref : tabs[0];
  if (alvo) {
    await chrome.tabs.update(alvo.id, { url, active: true });
    await chrome.windows.update(alvo.windowId, { focused: true });
  } else await chrome.tabs.create({ url });           // "Abrir no Onvio" quer a tela do Onvio: a camada não abre (nunca abre sozinha)
}

// Vereditos das Sugestões de ação (k -> { l, tipo, trecho }): só na memória, some quando o service worker dorme
let casosCache = {};

/* ---------- mensagens do painel ---------- */
// 0.90.0 (Josué, 10/11/2026): as Configurações numa guia própria, a mesma pelo Onvio e pelo Gestta. Reaproveita a guia aberta
// (traz para frente e leva à aba pedida); só os parâmetros conhecidos (aba, sec) vão no endereço.
async function abrirGuiaConfig(params) {
  const base = chrome.runtime.getURL('app/app.html?janela=config');
  const p = new URLSearchParams();
  const ok = v => typeof v === 'string' && /^[a-z0-9-]{1,30}$/i.test(v);
  if (params && ok(params.aba)) p.set('aba', params.aba);
  if (params && ok(params.sec)) p.set('sec', params.sec);
  const url = base + '#/config' + (p.toString() ? '?' + p : '');
  const abas = await chrome.tabs.query({});
  const ja = abas.find(t => t.url && t.url.startsWith(base));
  if (ja) {
    await chrome.tabs.update(ja.id, { active: true, url });
    if (ja.windowId != null) await chrome.windows.update(ja.windowId, { focused: true }).catch(() => {});
    return { ok: true, tabId: ja.id, reaproveitada: true };
  }
  const t = await chrome.tabs.create({ url });
  return { ok: true, tabId: t.id };
}
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg && msg.alvo === 'offscreen') return false;                  // conversa com o documento que lê PDF, não é comando
  (async () => {
    try {
      if (msg.cmd === 'atualizar') reply({ ok: true, snap: await coletar(true) });
      else if (msg.cmd === 'buscar') {
        const s = await getSettings();
        const { f } = await escolherFetcher();
        reply({ ok: true, itens: await OC.search(f, msg.q, s) });
      } else if (msg.cmd === 'abrir') { await abrir(msg.item, sender.tab && sender.tab.id); reply({ ok: true }); }
      else if (msg.cmd === 'reagendar') { await agendar(); reply({ ok: true }); }
      else if (msg.cmd === 'hubAbriu') { reply({ ok: true }); enviarAoHubAuto(null).catch(() => {}); setTimeout(() => hubAutoUnico().catch(() => {}), 4000); hubProgresso(true); }      // o Hub apareceu numa aba: manda o resumo se faltar
      else if (msg.cmd === 'hubStatus') reply(await hubStatus());
      // 0.92.0: o envio único (Onvio e Gestta juntos), pela extensão ou pelo Hub (a ponte só repassa o pedido da janela que provou o código)
      else if (msg.cmd === 'hubAtualizar') reply(await hubIniciar(msg.origem === 'hub' ? 'hub' : 'extensao'));
      else if (msg.cmd === 'hubPedido') {
        if (!sender || !sender.tab || !(sender.tab.url || '').startsWith('https://claude.ai/')) reply({ ok: false, motivo: 'origem' });
        else if (msg.acao === 'atualizar') reply(await hubIniciar('hub', msg.alvo));          // Hub 340: alvo = só o que falta
        else if (msg.acao === 'cancelar') reply(hubCancelarEnvio());
        // 0.95.0, Mediador: buscar (os CNPJs dos sindicatos do Hub), guardar a lista para a semanal, texto e anexo na hora
        else if (msg.acao === 'mediador') { if (mediadorRodando || envioRodando) reply({ ok: true, jaRodando: true }); else if (!(await mediadorPermitido())) reply({ ok: false, motivo: 'sem-permissao-mediador' }); else if (!mediadorLimparCnpjs(msg.cnpjs).length) reply({ ok: false, motivo: 'sem-sindicatos' }); else { mediadorBuscar('hub', msg.cnpjs).catch(() => {}); reply({ ok: true, iniciado: true }); } }
        else if (msg.acao === 'mediadorCnpjs') reply({ ok: true, sindicatos: (await mediadorGuardarCnpjs(msg.cnpjs)).length, mediador: await mediadorPainel() });
        else if (msg.acao === 'mediadorTexto') reply(await mediadorTexto(msg.solicitacao));
        else if (msg.acao === 'mediadorAnexo') reply(await mediadorAnexo(msg.url));
        else reply({ ok: true, envio: await hubPainelAtual() });
      }
      else if (msg.cmd === 'hubCancelar') reply(hubCancelarEnvio());
      else if (msg.cmd === 'mediadorStatus') reply(Object.assign({ ok: true }, await mediadorPainel()));
      else if (msg.cmd === 'mediadorBuscar') { if (!sender || !(sender.url || '').startsWith(chrome.runtime.getURL(''))) reply({ ok: false, motivo: 'origem' }); else if (mediadorRodando || envioRodando) reply({ ok: true, jaRodando: true }); else if (!(await mediadorPermitido())) reply({ ok: false, motivo: 'sem-permissao-mediador' }); else if (!(await mediadorCfg()).cnpjs.length) reply({ ok: false, motivo: 'sem-sindicatos' }); else { mediadorBuscar('extensao').catch(() => {}); reply({ ok: true, iniciado: true }); } }
      else if (msg.cmd === 'hubReiniciar') { await hubRetomarDepoisDeReinicio(); reply({ ok: true }); }          // o mesmo que a extensão faz ao iniciar (usado no teste)
      else if (msg.cmd === 'hubProva') { const ok = await hubProvaConfere(msg.nonce, msg.prova); if (ok) await hubLembrarEndereco(msg.url, sender && sender.tab); reply({ ok, versao: chrome.runtime.getManifest().version }); }      // a ponte pergunta se a janela que se diz Hub conhece o código de pareamento
      else if (msg.cmd === 'hubRegistrar') reply(await hubRegistrar());
      else if (msg.cmd === 'hubDesconectar') reply(await hubDesconectar());
      else if (msg.cmd === 'hubEnviar') reply(await enviarAoHub(null, true));
      else if (msg.cmd === 'gesttaHubSync') { if (gesttaHubRodando) reply({ ok: true, jaRodando: true }); else if (msg.reenviar) { const { hubSyncGestta } = await chrome.storage.local.get('hubSyncGestta'); const so = OCG.paraReenviar(hubSyncGestta); if (!so.length) reply({ ok: false, motivo: 'nada-reenviar' }); else { gesttaHubSincronizar(true, so).catch(() => {}); reply({ ok: true, iniciado: true, n: so.length }); } } else reply(await hubIniciar('extensao')); }      // 0.92.0: o Gestta vai sempre junto com o Onvio
      else if (msg.cmd === 'hubSincronizar' && msg.reenviar) { if (hubSincRodando) reply({ ok: true, jaRodando: true }); else { const { hubSync } = await chrome.storage.local.get('hubSync'); const so = OC.hubParaReenviar(hubSync); if (!so.length) reply({ ok: false, motivo: 'nada-reenviar' }); else { hubSincronizar(true, false, so).catch(() => {}); reply({ ok: true, iniciado: true, n: so.length }); } } }      // 0.84.0: só o que deu erro
      else if (msg.cmd === 'hubSincronizar' && !msg.soFolha) reply(await hubIniciar('extensao'));          // 0.92.0: o envio completo é sempre Onvio e Gestta juntos
      else if (msg.cmd === 'hubSincronizar') { if (hubSincRodando || envioRodando) reply({ ok: true, jaRodando: true }); else if (!(await hubEnvioCats()).includes('pessoais')) reply({ ok: false, motivo: 'sem-pessoais' }); else { hubSincronizar(true, true).catch(() => {}); reply({ ok: true, iniciado: true }); } }      // longo: a tela acompanha pelo hubSync
      else if (msg.cmd === 'hubLote') {                  // caminho de reserva: o resumo para colar no Hub (sem o código de pareamento)
        const { snapshot } = await chrome.storage.local.get('snapshot');
        reply(snapshot ? { ok: true, lote: OC.montarLoteHub(snapshot, { versao: chrome.runtime.getManifest().version }) } : { ok: false, motivo: 'sem-leitura' });
      }
      else if (msg.cmd === 'atualizarRegras') { reply(await atualizarRegras()); }
      else if (msg.cmd === 'tick') { reply(await verificarAoVivo(!!msg.forcar)); }
      else if (msg.cmd === 'previsao') {            // sob demanda: solicitações abertas por empresa nas últimas 4 semanas (nada é guardado)
        const { f } = await escolherFetcher();
        const mov = await OC.lerMovimentadas(emSegundoPlano(f), 28, new Date());
        const itensV = OC.filtrarVisao(mov.itens, typeof msg.visao === 'string' ? msg.visao : '', await getSettings());     // 0.89.0: só o setor escolhido
        reply(Object.assign({ ok: true, erros: mov.erros }, OC.previsaoPorEmpresa(itensV, new Date(), 28)));
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
        // 0.89.0: só as pendentes do setor escolhido na tela (a tela Distribuir e a fila batem)
        const d = await calcularDistribuicao(f, OC.filtrarVisao((snapshot && snapshot.items) || [], typeof msg.visao === 'string' ? msg.visao : '', await getSettings()));
        reply({ ok: true, dias: d.dias, movimentadas: d.movimentadas, erros: d.erros, sugestoes: d.sugestoes });
      }
      else if (msg.cmd === 'concluidas') {          // aba Concluídas (0.76.0): as concluídas dos últimos 30 dias, sob demanda; nada é guardado
        const dias = 30, equipe = !!msg.equipe;
        const { f } = await escolherFetcher();
        // as suas: o próprio Onvio filtra (assignedtome); da equipe: todas as movimentadas, com o crédito a quem concluiu quando a avaliação já leu
        const mov = await OC.lerMovimentadas(emSegundoPlano(f), dias, new Date(), equipe ? 5 : 3, { mine: !equipe });
        let itens = OC.soConcluidas(mov.itens);
        if (equipe) { const { desempenhoCache } = await chrome.storage.local.get('desempenhoCache'); itens = OC.creditarQuemConcluiu(itens, desempenhoCache || {}, await getSettings()); }
        else itens = itens.map(x => Object.assign(x, { mine: true }));
        reply({ ok: true, dias, equipe, itens, erros: mov.erros, lidoEm: new Date().toISOString() });
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
      else if (msg.cmd === 'anexar') { reply(Object.assign({ ok: true }, await anexarUm(msg))); }
      else if (msg.cmd === 'conferirAnexos') { reply(Object.assign({ ok: true }, await conferirAnexosCmd(msg))); }
      else if (msg.cmd === 'criar') { reply(Object.assign({ ok: true }, await criarSolicitacao(msg))); }
      else if (msg.cmd === 'detalhe') { reply(Object.assign({ ok: true }, await detalhe(msg))); }
      else if (msg.cmd === 'baixarAnexos') { reply(Object.assign({ ok: true }, await baixarAnexos(msg))); }
      else if (msg.cmd === 'verAnexo') { reply(await verAnexo(msg)); }
      else if (msg.cmd === 'rotaAnexo') { reply({ ok: await guardarRotaAnexo(msg) }); }
      else if (msg.cmd === 'sondarEmpregados') { const { f } = await escolherFetcher(); reply({ ok: true, linhas: await OC.sondarEmpregados(emSegundoPlano(f), ms => new Promise(r => setTimeout(r, ms))) }); }
      else if (msg.cmd === 'testarFolha') { const { f } = await escolherFetcher(); try { reply({ ok: true, linhas: await OC.testarFolha(emSegundoPlano(f), textoDoPdf, ms => new Promise(r => setTimeout(r, ms))) }); } finally { fecharOffscreen(); } }
      else if (msg.cmd === 'testarEmpregadosEmpresa') { const { f } = await escolherFetcher(); reply({ ok: true, linhas: await OC.testarEmpregadosEmpresa(emSegundoPlano(f), ms => new Promise(r => setTimeout(r, ms)), String(msg.busca || '').slice(0, 80)) }); }
      else if (msg.cmd === 'testarFolhaEmpresa') { const { f } = await escolherFetcher(); const guardado = await chrome.storage.local.get(['folhaPastas', 'folhaLidos', 'folhaEstado']); try { reply({ ok: true, linhas: await OC.testarFolhaEmpresa(emSegundoPlano(f), textoDoPdf, ms => new Promise(r => setTimeout(r, ms)), String(msg.busca || '').slice(0, 80), guardado) }); } finally { fecharOffscreen(); } }
      else if (msg.cmd === 'folhaDeNovo') { await chrome.storage.local.remove(['folhaLidos', 'folhaEstado', 'folhaPastas']); reply({ ok: true }); }      // refaz também o caminho das pastas de cada empresa
      else if (msg.cmd === 'testarLeitura') { reply({ ok: true, linhas: await testarLeitura() }); }
      else if (msg.cmd === 'testarGestta') { reply({ ok: true, linhas: await testarGestta() }); }
      else if (msg.cmd === 'gesttaTarefas') { reply(await gesttaTarefas(msg, sender)); }
      else if (msg.cmd === 'gesttaEquipe') { reply(await gesttaEquipe(msg, sender)); }
      else if (msg.cmd === 'gesttaFechamento') { reply(await gesttaFechamento(msg, sender)); }
      else if (msg.cmd === 'gesttaTarefa') { reply(await gesttaTarefa(msg, sender)); }
      else if (msg.cmd === 'gesttaHistorico') { reply(await gesttaHistorico(msg, sender)); }
      else if (msg.cmd === 'gesttaAcao') { reply(await gesttaAcao(msg, sender)); }
      else if (msg.cmd === 'irPara') { reply(await irPara(msg.destino)); }
      else if (msg.cmd === 'abrirConfig') { reply(await abrirGuiaConfig(msg.params)); }
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
async function hubCfg() { const { hubCfg } = await chrome.storage.local.get('hubCfg'); return Object.assign({ token: '', auto: true, syncAuto: true, syncHoras: 6, envio: {} }, hubCfg || {}); }
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
  hubCancelar = true;                                                  // para o envio em andamento
  try { await chrome.scripting.unregisterContentScripts({ ids: [HUB_SCRIPT_ID] }); } catch (e) { /* já não estava */ }
  try { await chrome.permissions.remove({ origins: HUB_ORIGENS }); } catch (e) { /* ignora */ }
  await hubGuardar({ token: '', envioConfirmado: false, hubUrl: '' });            // o código e o endereço do Hub saem do armazenamento
  await chrome.storage.local.remove(['hubSync', 'hubSyncHash', 'hubUltimo', 'folhaLidos', 'folhaEstado', 'hubSyncGestta', 'hubSyncHashGestta', 'gesttaCartelaEm', 'hubEnvio']);       // outro Hub depois recebe a folha desde o começo
  return { ok: true };
}
// Prova de que uma janela é o Hub do código de pareamento: HMAC-SHA256(código, nonce) em hexadecimal, comparado sem pressa (tempo constante).
async function hubProvaConfere(nonce, prova) {
  const c = await hubCfg();
  nonce = String(nonce || ''); prova = String(prova || '');
  if (!c.token || !nonce || nonce.length > 64 || !/^[0-9a-f]{64}$/.test(prova)) return false;
  const enc = new TextEncoder();
  const chave = await crypto.subtle.importKey('raw', enc.encode(c.token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', chave, enc.encode(nonce))), b => b.toString(16).padStart(2, '0')).join('');
  let dif = 0; for (let i = 0; i < 64; i++) dif |= mac.charCodeAt(i) ^ prova.charCodeAt(i);
  return dif === 0;
}
async function hubStatus() {
  const c = await hubCfg(), permitido = await hubPermitido(), abas = permitido ? await hubAbas() : [];
  let hubAberto = false, hubAvisando = false;
  for (const t of abas) { try { const r = await chrome.tabs.sendMessage(t.id, { alvo: 'ponte-hub', cmd: 'status' }); if (r && r.hub) { hubAberto = true; hubAvisando = !!r.avisando; break; } } catch (e) { /* aba sem o script */ } }
  const { hubUltimo } = await chrome.storage.local.get('hubUltimo');
  return { ok: true, permitido, abasClaude: abas.length, hubAberto, hubSegundoPlano: hubAberto && !hubAvisando, temCodigo: !!c.token, auto: !!c.auto, ultimo: hubUltimo || null };
}
const hashLote = l => { let h = 0; const t = l.tabela + '|' + JSON.stringify(l.porTipo); for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return String(h); };
// Entrega um lote ao Hub pelas abas do claude.ai. 1ª rodada sem esperar (usa o Hub que cada aba já conhece, mesmo em
// segundo plano); a 2ª espera o Hub se anunciar.
async function entregarLote(lote) {
  let r = { ok: false, motivo: 'sem-hub' };
  const abasHub = await hubAbas();
  for (const espera of [0, 5000]) {
    for (const t of abasHub) {
      try { const x = await chrome.tabs.sendMessage(t.id, { alvo: 'ponte-hub', cmd: 'enviar', lote, espera }); if (x && (x.ok || x.motivo !== 'sem-hub' || r.motivo === 'sem-hub')) r = x; if (x && x.ok) break; } catch (e) { /* aba sem o script (ainda não recarregada) */ }
    }
    if (r.ok || r.motivo !== 'sem-hub') break;
  }
  return r;
}
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
  const r = await entregarLote(lote);
  await chrome.storage.local.set({ hubUltimo: { ok: !!r.ok, motivo: r.motivo || '', em: new Date().toISOString(), linhas: lote.nLinhas, total: lote.totalNaOrigem, hash: r.ok ? hash : (hubUltimo && hubUltimo.hash) || '', mensagem: r.mensagem || '' } });
  return Object.assign({ linhas: lote.nLinhas, total: lote.totalNaOrigem }, r);
}
async function enviarAoHubAuto(snap) { const c = await hubCfg(); if (c.token && c.auto) return enviarAoHub(snap, false); }

/* ---------- folha: PDF do portal de documentos (0.68.0) ----------
 * Só GET em onvio.com.br/api/storage/v1/Folders/{pasta}/documents/{doc}, de dentro da aba do Onvio (a mesma sessão da leitura).
 * O arquivo vai em base64 para um documento fora da tela da própria extensão (offscreen.html), que tira o texto com o pdf.js
 * empacotado (sem rede). Nem o arquivo nem o texto são guardados: o núcleo tira só código, nome, vínculo e competência. */
const PDF_MAX = 15 * 1024 * 1024;
const FOLHA_INTERVALO = 20 * 3600e3;
const urlDocumentoPermitida = u => { try { const x = new URL(u); return x.protocol === 'https:' && x.hostname === 'onvio.com.br' && /^\/api\/storage\/v1\/Folders\/[^/]+\/documents\/[^/]+$/i.test(x.pathname) && !x.search; } catch (e) { return false; } };
async function baixarPdfPelaAba(url) {
  if (!urlDocumentoPermitida(url)) throw new Error('endereço de documento não permitido');
  const tab = await abaOnvio();
  if (!tab) throw new AuthError('Abra o Onvio numa aba');
  let v = null;
  for (const mundo of ['MAIN', 'ISOLATED']) {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id }, world: mundo, args: [url, PDF_MAX],
      func: async (u, max) => {
        try {
          let r = await fetch(u, { credentials: 'include' });
          let ct = r.headers.get('content-type') || '';
          if (r.ok && /json/i.test(ct)) {                         // se um dia vier { downloadUrl } em vez do arquivo
            const j = await r.json().catch(() => null), d = j && (j.downloadUrl || j.url);
            if (!d || !/^https:\/\/([a-z0-9-]+\.)*onvio\.com\.br\//i.test(d)) return { status: 415, ct };
            r = await fetch(d, { credentials: 'include' }); ct = r.headers.get('content-type') || '';
          }
          if (!r.ok) return { status: r.status, ct };
          const b = new Uint8Array(await r.arrayBuffer());
          if (b.length > max) return { status: 413, ct };
          let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
          return { status: r.status, ct, b64: btoa(s) };
        } catch (e) { return { status: 0, ct: '', erro: String(e).slice(0, 80) }; }
      }
    }).catch(e => [{ result: { status: 0, ct: '', erro: String(e && e.message || e).slice(0, 80) } }]);
    v = (res && res.result) || { status: 0, ct: '' };
    if (v.b64 || [401, 403, 404, 413].includes(v.status)) break;
  }
  if (v.b64 && v.b64.startsWith('JVBER')) return v.b64;                // %PDF
  if (v.status === 401 || v.status === 403) throw new AuthError('HTTP ' + v.status);
  if (v.b64 && /html/i.test(v.ct || '')) throw new AuthError('o Onvio devolveu uma página em vez do arquivo');
  if (v.b64) throw new Error('o arquivo não é PDF');
  throw new Error(v.status === 413 ? 'PDF maior que 15 MB' : v.status ? 'HTTP ' + v.status : 'falha de rede (' + (v.erro || 'sem resposta') + ')');
}
let offscreenAberto = null;
async function garantirOffscreen() {
  if (offscreenAberto) return offscreenAberto;
  offscreenAberto = (async () => {
    try { await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['WORKERS'], justification: 'Ler o texto do Extrato Mensal (PDF) com o pdf.js empacotado' }); }
    catch (e) { if (!/single|already|only one/i.test(String(e && e.message || e))) { offscreenAberto = null; throw e; } }
  })();
  return offscreenAberto;
}
function fecharOffscreen() { if (!offscreenAberto) return; offscreenAberto = null; chrome.offscreen.closeDocument().catch(() => {}); }
async function textoDoPdf(url) {
  const b64 = await baixarPdfPelaAba(url);
  await garantirOffscreen();
  let r = null;
  for (let i = 0; i < 12 && !r; i++) { r = await chrome.runtime.sendMessage({ alvo: 'offscreen', cmd: 'pdfTexto', b64 }).catch(() => null); if (!r) await new Promise(ok => setTimeout(ok, 250)); }       // o documento pode ainda estar carregando o pdf.js (até ~3 s)
  if (!r || !r.ok) throw new Error('não consegui ler o PDF (' + ((r && r.erro) || 'sem resposta') + ')');
  return r.texto;
}
// Guarda só ids: documentos já lidos (com a competência) e o caminho das pastas de cada empresa. Os lidos de mais de 24 meses saem.
async function guardarFolha(x) {
  const { folhaLidos, folhaPastas } = await chrome.storage.local.get(['folhaLidos', 'folhaPastas']);
  const out = {};
  if (x.lidos) {
    const d = new Date(), corte = new Date(d.getFullYear(), d.getMonth() - 24, 1).toISOString().slice(0, 7);
    const l = Object.assign({}, folhaLidos, x.lidos);
    Object.keys(l).forEach(k => { if (l[k] && l[k] < corte) delete l[k]; });
    out.folhaLidos = l;
  }
  if (x.pastas) out.folhaPastas = Object.assign({}, folhaPastas, x.pastas);
  if (x.estado) out.folhaEstado = { em: Date.now(), pendentes: Number(x.estado.pendentes) || 0, v: OC.FOLHA_V };           // só números: quando leu e quantos PDFs ficaram para o próximo envio
  if (Object.keys(out).length) await chrome.storage.local.set(out);
}

/* ---------- Control Hub: envio completo (0.52.0) ----------
 * Listas inteiras, clientes de CND e NF-e, escritório, permissões, documentos, notícias e (só se a pessoa ligar e
 * confirmar) dados pessoais. Tudo é lido na hora pelo OC.hubExecutar e vai direto ao Hub em partes: nada fica na
 * extensão, só o andamento (hubSync: nomes e contagens) e um resumo do conteúdo para não reenviar o que não mudou
 * (hubSyncHash: só números). Automático a cada hubCfg.syncHoras horas (6), só com o Hub aberto numa aba. */
const ALARME_HUBSYNC = 'controlOnvio.hubsync';
let hubSincRodando = null, hubCancelar = false;
const hashTexto = t => { let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return String(h) + ':' + t.length; };
const ERROS_FATAIS_HUB = ['token', 'sem-hub', 'somente-leitura', 'sem-config', 'fonte-desconhecida', 'categoria', 'versao-antiga'];      // versão antiga: o Hub recusa tudo, não adianta ler o resto
async function hubEnvioCats() {
  const c = await hubCfg();
  return OC.HUB_CATEGORIAS.filter(k => (c.envio && c.envio[k.id] != null) ? !!c.envio[k.id] : k.padrao).map(k => k.id);
}
// soFolha (0.70.1, pedido do Josué em 04/11/2026): só a leitura da folha (Extrato Mensal), sem listas nem lista de empregados, com mais PDFs por rodada.
// Não conta como envio completo: o automático continua contando a partir do último envio completo (completoAnterior).
const FOLHA_DOCS_SO_FOLHA = 1500;
// so (0.84.0): ids das tarefas do plano a refazer ("Reenviar o que deu erro"); o resultado se junta ao do envio anterior.
async function hubSincronizar(manual, soFolha, so) {
  if (hubSincRodando) return hubSincRodando;
  hubSincRodando = (async () => {
    hubCancelar = false;
    if (manual) await hubGuardar({ envioConfirmado: true });         // a pessoa pediu o envio completo: vale como confirmação do que vai
    const c = await hubCfg();
    if (!c.token) return { ok: false, motivo: 'sem-codigo' };
    if (!(await hubPermitido())) return { ok: false, motivo: 'sem-permissao' };
    if (!(await hubAbas()).length) return { ok: false, motivo: 'sem-hub' };
    if (!(await hubStatus()).hubAberto) return { ok: false, motivo: 'sem-hub' };          // sondar o Hub antes de ler o Onvio: sem Hub não há por que gastar as chamadas
    let cats = await hubEnvioCats();
    if (soFolha) { if (!cats.includes('pessoais')) return { ok: false, motivo: 'sem-pessoais' }; cats = ['pessoais']; }
    const reenvio = !soFolha && Array.isArray(so) && so.length ? so.slice() : null;
    if (!cats.length) return { ok: false, motivo: 'sem-categoria' };
    const { hubSync: anterior } = await chrome.storage.local.get('hubSync');
    const completoAnterior = anterior ? (anterior.soFolha || anterior.reenvio ? anterior.completoAnterior || '' : (['ok', 'parcial'].includes(anterior.estado) ? anterior.terminouEm || '' : anterior.completoAnterior || '')) : '';
    const base = reenvio && anterior && anterior.estado !== 'enviando' ? (anterior.resultados || []).filter(r => !reenvio.includes(OC.hubTarefaDoConjunto(r.id))) : [];
    const status = { estado: 'enviando', manual: !!manual, soFolha: !!soFolha, reenvio: !!reenvio, completoAnterior, iniciouEm: new Date().toISOString(), pulso: Date.now(), etapa: 'preparando', feito: 0, total: 0, categorias: cats, resultados: [] };
    const grava = () => { status.pulso = Date.now(); return chrome.storage.local.set({ hubSync: status }).catch(() => {}).then(() => hubProgresso()); };
    await grava();
    // sinal de vida a cada 20 s, mesmo no meio de uma etapa longa (folha, empregados: uma leitura por empresa). Antes só havia sinal
    // entre etapas e a tela dava "interrompido" depois de 4 min com o envio rodando; gravar também mantém o service worker acordado.
    const batida = setInterval(grava, 20000);
    try {
      let { f } = await escolherFetcher(false), trocas = 0;
      // se a aba do Onvio sumir no meio, escolhe o leitor de novo (até 3 vezes) em vez de falhar cliente por cliente
      const leitor = async url => { try { return await f(url); } catch (e) { if (e && !e.auth && !e.cliente && trocas < 3 && /aba|tab|frame|context|Abra o Onvio|Cannot access|No tab/i.test(String((e && e.message) || ''))) { trocas++; const novo = await escolherFetcher(false); f = novo.f; return f(url); } throw e; } };
      const { snapshot, hubSyncHash } = await chrome.storage.local.get(['snapshot', 'hubSyncHash']);
      const hashes = Object.assign({}, hubSyncHash);
      const versao = chrome.runtime.getManifest().version, usuario = (snapshot && snapshot.user && snapshot.user.nome) || '';
      let fatal = '';
      const enviar = async (conj, p) => {
        if (hubCancelar) return { ok: false, motivo: 'cancelado', parar: true };
        if (fatal) return { ok: false, motivo: fatal, parar: true };
        const hash = hashTexto(p.partes.join('\u0001'));
        const antigo = hashes[conj.tipoDado];
        if (!manual && antigo && antigo.h === hash && Date.now() - antigo.em < 24 * 3600e3) return { ok: true, motivo: 'sem-mudanca' };
        const ciclo = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        for (let i = 0; i < p.partes.length; i++) {
          const tabela = p.partes[i];
          const lote = { id: 'onvio-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), token: c.token, fonte: 'onvio', tipoDado: conj.tipoDado, categoria: conj.categoria, titulo: conj.titulo,
            extraidoEm: new Date().toISOString(), usuario, colunas: conj.colunas, tabela, nLinhas: tabela ? tabela.split('\n').length : 0, nLinhasTotal: p.nLinhasTotal, totalNaOrigem: conj.totalNaOrigem,
            cortado: p.cortado, partes: p.partes.length, parte: i, ciclo, porTipo: conj.porTipo || {}, versaoExt: versao, acumular: conj.acumular || '' };
          let r = await entregarLote(lote);
          if (!r.ok && r.motivo === 'sem-resposta') r = await entregarLote(Object.assign({}, lote, { id: lote.id + 'r' }));
          // outro envio ao mesmo conjunto em andamento (outra pessoa com a extensão): espera a vez em vez de misturar as partes
          for (let k = 0; i === 0 && !r.ok && r.motivo === 'ocupado' && k < 4; k++) { await new Promise(res => setTimeout(res, 20000)); r = await entregarLote(Object.assign({}, lote, { id: lote.id + 'o' + k })); }
          if (!r.ok) { const grave = ERROS_FATAIS_HUB.includes(r.motivo) || r.motivo === 'sem-hub'; if (grave) fatal = r.motivo; return { ok: false, motivo: r.motivo || 'erro', mensagem: r.mensagem || '', parar: grave }; }
        }
        hashes[conj.tipoDado] = { h: hash, em: Date.now() };
        await chrome.storage.local.set({ hubSyncHash: hashes });         // na hora: se o service worker morrer, o que já foi aceito não é reenviado
        status.pulso = Date.now();
        return { ok: true };
      };
      const { folhaLidos, folhaPastas, folhaEstado } = await chrome.storage.local.get(['folhaLidos', 'folhaPastas', 'folhaEstado']);
      // 0.70.0: a leitura passou a mandar todas as pessoas dos últimos meses (a folha decide quem é ativo). O que foi lido antes só tinha os contribuintes:
      // uma vez, os extratos dos últimos meses saem da lista de "já lidos" e são lidos de novo (só eles; os mais antigos continuam valendo).
      const folhaAntiga = !folhaEstado || folhaEstado.v !== OC.FOLHA_V;
      let lidosFolha = folhaLidos || {};
      if (folhaAntiga) { const corte = OC.competenciaMinima(new Date(), OC.FOLHA_MESES_QUADRO); lidosFolha = Object.fromEntries(Object.entries(lidosFolha).filter(([, comp]) => !(comp && comp >= corte))); }
      const folhaRecente = !folhaAntiga && folhaEstado.em && Date.now() - folhaEstado.em < FOLHA_INTERVALO && !folhaEstado.pendentes;
      const ctx = { snapshot, pausa: ms => new Promise(r => setTimeout(r, ms)), onItem: null, cancelado: () => hubCancelar,
        // folha (0.68.0): no envio automático, a varredura das pastas é no máximo 1 vez por dia (os extratos saem uma vez por mês), salvo se ficou coisa para trás
        textoPdf: (!manual && folhaRecente) ? null : textoDoPdf, folhaEm: folhaEstado && folhaEstado.em, folhaLidos: lidosFolha, folhaPastas: folhaPastas || {},
        guardarFolha: x => guardarFolha(x), soTarefas: soFolha ? ['pessoais:folha'] : reenvio, folhaDocsMax: soFolha ? FOLHA_DOCS_SO_FOLHA : undefined, andamento: t => { status.detalhe = String(t || '').slice(0, 120); } };
      ctx.onItem = (feitos, total) => { status.detalhe = 'solicitação ' + feitos + ' de ' + total; };
      const res = await OC.hubExecutar(emSegundoPlano(leitor), cats, ctx, enviar, pr => { status.etapa = pr.etapa; status.detalhe = ''; status.feito = pr.feito; status.total = pr.total; grava(); });
      status.resultados = base.concat(res.map(r => ({ id: r.id, rotulo: r.rotulo, categoria: r.categoria || '', ok: r.ok !== false, motivo: (r.nota && r.ok !== false ? r.aviso || r.motivo : r.motivo || r.aviso) || '', nota: !!r.nota && r.ok !== false, cortado: !!r.cortado, porque: String(r.porque || '').slice(0, 300), linhas: r.linhas || 0, partes: r.partes || 0 })));
      status.estado = status.resultados.every(r => r.ok) ? 'ok' : status.resultados.some(r => r.ok) ? 'parcial' : 'erro';
      if (fatal) status.motivo = fatal;
      await chrome.storage.local.set({ hubSyncHash: hashes });
    } catch (e) {
      if (e && e.cliente) await bloquearVisaoCliente(e);
      status.estado = 'erro'; status.motivo = e && e.cliente ? 'visao-cliente' : String((e && e.message) || e).slice(0, 160);
    }
    clearInterval(batida);
    fecharOffscreen();
    status.etapa = ''; status.detalhe = ''; status.terminouEm = new Date().toISOString();
    await grava();
    return { ok: status.estado === 'ok' || status.estado === 'parcial', estado: status.estado, motivo: status.motivo || '' };
  })().finally(() => { hubSincRodando = null; });
  return hubSincRodando;
}
/* ---------- Gestta no Control Hub (0.79.0, item 3 da Fase 1, aprovado pelo Josué em 05/11/2026) ----------
 * Tarefas do mês atual e do anterior, clientes, equipe, setores, alertas e a cartela (no máximo 1 vez por dia), lidos na aba do
 * Gestta (o token não sai da página) e entregues ao Hub em partes, com a fonte "gestta". Só com acesso total (coordenação).
 * Nada fica na extensão: só o andamento (hubSyncGestta: nomes e contagens), o resumo numérico do que já foi aceito
 * (hubSyncHashGestta) e a hora da última cartela lida (gesttaCartelaEm). */
const CARTELA_INTERVALO = 20 * 3600e3;
let gesttaHubRodando = null;
async function gesttaHubCats() {
  const c = await hubCfg();
  return OCG.HUB_GESTTA.filter(k => (c.gestta && c.gestta[k.id] != null) ? !!c.gestta[k.id] : k.padrao).map(k => k.id);
}
async function gesttaHubSincronizar(manual, so) {
  if (gesttaHubRodando) return gesttaHubRodando;
  gesttaHubRodando = (async () => {
    const c = await hubCfg();
    if (!c.token) return { ok: false, motivo: 'sem-codigo' };
    if (!(await hubPermitido())) return { ok: false, motivo: 'sem-permissao' };
    if (!(await hubAbas()).length || !(await hubStatus()).hubAberto) return { ok: false, motivo: 'sem-hub' };
    if (!hubSincRodando) hubCancelar = false;
    const reenvio = Array.isArray(so) && so.length ? so.slice() : null;          // 0.84.0: só as categorias que deram erro, o resto do último envio fica
    const cats = reenvio || await gesttaHubCats();
    if (!cats.length) return { ok: false, motivo: 'sem-categoria' };
    const { hubSyncGestta: antG } = reenvio ? await chrome.storage.local.get('hubSyncGestta') : {};
    const baseG = reenvio && antG && antG.estado !== 'enviando' ? (antG.resultados || []).filter(r => !reenvio.includes(OCG.catDoConjunto(r.id))) : [];
    const tab = await abaGestta();
    if (!tab) return { ok: false, motivo: 'sem-gestta' };
    const { gesttaCartelaEm } = await chrome.storage.local.get('gesttaCartelaEm');
    const cartela = cats.includes('cartela') && (!!reenvio || !gesttaCartelaEm || Date.now() - gesttaCartelaEm > CARTELA_INTERVALO);
    const status = { estado: 'enviando', manual: !!manual, reenvio: !!reenvio, iniciouEm: new Date().toISOString(), pulso: Date.now(), etapa: 'conferindo o acesso', feito: 0, total: 0, categorias: cats, cartela, resultados: [] };
    const grava = () => { status.pulso = Date.now(); return chrome.storage.local.set({ hubSyncGestta: status }).catch(() => {}).then(() => hubProgresso()); };
    await grava();
    const batida = setInterval(grava, 20000);
    try {
      const { r: r1 } = await lerGestta([OCG.PEDIDOS.me()], { tab });
      if (!r1 || !r1.ok) throw Object.assign(new Error((r1 && r1.motivo) || 'a aba do Gestta não respondeu'), { motivo: r1 && r1.semSessao ? 'sem-sessao-gestta' : '' });
      const pf = r1.resultados[0] && r1.resultados[0].dados ? OCG.perfil(r1.resultados[0].dados) : null;
      if (!pf || !pf.ok) throw new Error('não consegui saber quem está logado no Gestta');
      if (!pf.total) throw Object.assign(new Error('acesso parcial'), { motivo: 'acesso-parcial' });           // nunca um conjunto de um setor como se fosse de todos
      const ler = async pedidos => { const { r } = await lerGestta(pedidos, { tab }); if (!r) throw new Error('a aba do Gestta foi fechada'); if (!r.ok) throw Object.assign(new Error(r.motivo || 'sem sessão do Gestta'), { status: 401 }); return r.resultados; };
      const { hubSyncHashGestta } = await chrome.storage.local.get('hubSyncHashGestta');
      const hashes = Object.assign({}, hubSyncHashGestta), versao = chrome.runtime.getManifest().version, usuario = pf.papelNome ? 'Gestta · ' + pf.papelNome : 'Gestta';
      let fatal = '';
      const enviar = async (conj, p) => {
        if (hubCancelar) return { ok: false, motivo: 'cancelado', parar: true };
        if (fatal) return { ok: false, motivo: fatal, parar: true };
        const hash = hashTexto(p.partes.join('\u0001')), antigo = hashes[conj.tipoDado];
        if (!manual && antigo && antigo.h === hash && Date.now() - antigo.em < 24 * 3600e3) return { ok: true, motivo: 'sem-mudanca' };
        const ciclo = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        for (let i = 0; i < p.partes.length; i++) {
          const tabela = p.partes[i];
          const lote = { id: 'gestta-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), token: c.token, fonte: 'gestta', tipoDado: conj.tipoDado, categoria: conj.categoria, titulo: conj.titulo,
            extraidoEm: new Date().toISOString(), usuario, colunas: conj.colunas, tabela, nLinhas: tabela ? tabela.split('\n').length : 0, nLinhasTotal: p.nLinhasTotal, totalNaOrigem: conj.totalNaOrigem,
            cortado: p.cortado, partes: p.partes.length, parte: i, ciclo, porTipo: {}, versaoExt: versao };
          let r = await entregarLote(lote);
          if (!r.ok && r.motivo === 'sem-resposta') r = await entregarLote(Object.assign({}, lote, { id: lote.id + 'r' }));
          for (let k = 0; i === 0 && !r.ok && r.motivo === 'ocupado' && k < 4; k++) { await new Promise(res => setTimeout(res, 20000)); r = await entregarLote(Object.assign({}, lote, { id: lote.id + 'o' + k })); }
          if (!r.ok) { const grave = ERROS_FATAIS_HUB.includes(r.motivo) || r.motivo === 'sem-hub'; if (grave) fatal = r.motivo; return { ok: false, motivo: r.motivo || 'erro', mensagem: r.mensagem || '', parar: grave }; }
        }
        hashes[conj.tipoDado] = { h: hash, em: Date.now() };
        await chrome.storage.local.set({ hubSyncHashGestta: hashes });
        return { ok: true };
      };
      const ctx = { hoje: new Date(), cartela, cancelado: () => hubCancelar, andamento: t => { status.detalhe = String(t || '').slice(0, 120); } };
      const res = await OCG.hubExecutarGestta(ler, cats, ctx, enviar, pr => { status.etapa = pr.etapa; status.feito = pr.feito; status.total = pr.total; grava(); });
      status.resultados = baseG.concat(res.map(r => ({ id: r.id, rotulo: r.rotulo, categoria: r.categoria || '', ok: r.ok !== false, motivo: r.motivo || '', nota: !!r.nota, cortado: !!r.cortado, porque: String(r.porque || '').slice(0, 300), linhas: r.linhas || 0, partes: r.partes || 0 })));
      if (res.some(r => r.cartela)) await chrome.storage.local.set({ gesttaCartelaEm: Date.now() });            // só a hora: a próxima cartela é daqui a ~1 dia
      status.estado = !status.resultados.length ? 'erro' : status.resultados.every(r => r.ok) ? 'ok' : status.resultados.some(r => r.ok) ? 'parcial' : 'erro';
      if (fatal) status.motivo = fatal;
    } catch (e) {
      status.estado = 'erro'; status.motivo = (e && e.motivo) || String((e && e.message) || e).slice(0, 160);
    }
    clearInterval(batida);
    status.etapa = ''; status.detalhe = ''; status.terminouEm = new Date().toISOString();
    await grava();
    return { ok: status.estado === 'ok' || status.estado === 'parcial', estado: status.estado, motivo: status.motivo || '' };
  })().finally(() => { gesttaHubRodando = null; });
  return gesttaHubRodando;
}
/* ---------- Mediador do MTE para o módulo Convenções (0.95.0, autorizado pelo Josué em 11/11/2026) ----------
 * Só leitura de dados públicos de sindicato e convenção, numa aba do próprio Mediador (o reCAPTCHA invisível do site trabalha ali;
 * nada é contornado). Os CNPJs são os dos sindicatos cadastrados no Hub (dado público), mandados pelo próprio Hub. Busca pelo botão
 * "Buscar no Mediador" (pedido do Hub) e uma vez por semana junto com o envio completo. Vão ao Hub a lista de todos os instrumentos
 * e o texto (por cláusula) da convenção vigente e dos aditivos dela; o resto abre no Hub buscado na hora (mediadorTexto, mediadorAnexo).
 * A extensão guarda só os CNPJs (mediadorCfg), o andamento (mediadorEnvio: estados e contagens) e um resumo numérico (mediadorHash). */
const MEDIADOR_ORIGENS = ['https://mediador.trabalho.gov.br/*', 'https://www3.mte.gov.br/*', 'http://www3.mte.gov.br/*'];
const MEDIADOR_PAUSA = 3000, MEDIADOR_MAX_CNPJS = 100;
let mediadorRodando = null, mediadorAbaPropria = null, mediadorFecharTimer = null;
async function mediadorPermitido() { try { return await chrome.permissions.contains({ origins: MEDIADOR_ORIGENS }); } catch (e) { return false; } }
async function mediadorCfg() { const { mediadorCfg } = await chrome.storage.local.get('mediadorCfg'); return Object.assign({ cnpjs: [], em: '', ultimaBusca: '' }, mediadorCfg || {}); }
const mediadorLimparCnpjs = l => [...new Set((Array.isArray(l) ? l : []).map(OCM.soDig).filter(OCM.cnpjValido))].slice(0, MEDIADOR_MAX_CNPJS);
async function mediadorGuardarCnpjs(lista) {
  const cnpjs = mediadorLimparCnpjs(lista), c = await mediadorCfg();
  if (cnpjs.join() !== c.cnpjs.join()) await chrome.storage.local.set({ mediadorCfg: Object.assign(c, { cnpjs, em: new Date().toISOString() }) });
  return cnpjs;
}
// A aba do Mediador: uma que a pessoa já tem aberta (para texto e anexo) ou uma própria, aberta em segundo plano e fechada depois de 3 min parada
async function mediadorAba(paraBuscar) {
  if (mediadorFecharTimer) { clearTimeout(mediadorFecharTimer); mediadorFecharTimer = null; }
  if (mediadorAbaPropria != null) { try { const t = await chrome.tabs.get(mediadorAbaPropria); if (t) return t; } catch (e) { mediadorAbaPropria = null; } }
  if (!paraBuscar) { const abas = await chrome.tabs.query({ url: 'https://mediador.trabalho.gov.br/*' }).catch(() => []); if (abas[0]) return abas[0]; }
  const t = await abrirEmSegundoPlano(OCM.URL_CONSULTA);
  if (t) { mediadorAbaPropria = t.id; abasDoEnvio.delete(t.id); }               // a aba do Mediador fecha pelo próprio relógio, não no fim do envio
  return t;
}
function mediadorSoltarAba() {
  if (mediadorFecharTimer) clearTimeout(mediadorFecharTimer);
  mediadorFecharTimer = setTimeout(async () => {
    mediadorFecharTimer = null; const id = mediadorAbaPropria; mediadorAbaPropria = null;
    if (id != null && !mediadorRodando) { try { const t = await chrome.tabs.get(id); if (!t.active) await chrome.tabs.remove(id); } catch (e) { /* já fechada */ } }
  }, 180000);
}
async function mediadorNaPagina(tab, func, args) {
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', files: ['mediador.js'] });
  const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func, args }).catch(e => [{ result: { ok: false, motivo: 'aba', erro: String(e && e.message || e).slice(0, 120) } }]);
  return (res && res.result) || { ok: false, motivo: 'aba' };
}
// Uma busca: recarrega a consulta (tela limpa), preenche e clica em Pesquisar pela página, e lê a exportação
async function mediadorBuscarUm(tab, cnpj, tipo) {
  await chrome.tabs.update(tab.id, { url: OCM.URL_CONSULTA });
  await dormir(500);
  await esperarAte(async () => (await chrome.tabs.get(tab.id)).status === 'complete', 45000, 700);
  return mediadorNaPagina(tab, (c, t) => (self.OCM ? self.OCM.buscarNaPagina({ cnpj: c, tipo: t }) : { ok: false, motivo: 'núcleo do Mediador não carregou' }), [cnpj, tipo]);
}
async function mediadorTexto(sol, tab) {
  if (!OCM.urlTexto(sol)) return { ok: false, motivo: 'solicitacao' };
  if (!(await mediadorPermitido())) return { ok: false, motivo: 'sem-permissao-mediador' };
  const aba = tab || await mediadorAba(false);
  if (!aba) return { ok: false, motivo: 'sem-aba-mediador' };
  const r = await mediadorNaPagina(aba, s => (self.OCM ? self.OCM.textoNaPagina(s) : { ok: false, motivo: 'núcleo' }), [sol]);
  if (!tab) mediadorSoltarAba();
  return r;
}
// O anexo é http (o site do MTE): a página https não pode buscar, então quem busca é o service worker (com a permissão do MTE), https primeiro
async function mediadorAnexo(url) {
  if (!OCM.leituraPermitida('GET', url)) return { ok: false, motivo: 'recusado' };
  if (!(await mediadorPermitido())) return { ok: false, motivo: 'sem-permissao-mediador' };
  const u = new URL(url), tentativas = u.protocol === 'http:' ? ['https://' + u.host + u.pathname, url] : [url];
  let st = 0;
  for (const t of tentativas) {
    try {
      const r = await fetch(t, { credentials: 'omit' });
      st = r.status; if (!r.ok) continue;
      const b = new Uint8Array(await r.arrayBuffer());
      if (b.length > PDF_MAX) return { ok: false, motivo: 'grande' };
      if (!(b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46)) { st = 415; continue; }          // %PDF
      let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
      return { ok: true, base64: btoa(s), tipo: 'application/pdf', tamanho: b.length };
    } catch (e) { /* tenta o próximo */ }
  }
  return { ok: false, motivo: st ? 'http-' + st : 'rede' };
}
// A busca completa: para cada CNPJ, as convenções e os aditivos; depois o texto do que é vigente; entrega ao Hub (fonte "mediador")
async function mediadorBuscar(origem, cnpjsPedidos) {
  if (mediadorRodando) return mediadorRodando;
  mediadorRodando = (async () => {
    if (!envioRodando) hubCancelar = false;
    const ev = { estado: 'buscando', origem, iniciouEm: new Date().toISOString(), etapa: 'abrindo o Mediador', feito: 0, total: 0, instrumentos: 0, textos: 0, erros: [], pulso: Date.now() };
    const grava = () => { ev.pulso = Date.now(); return chrome.storage.local.set({ mediadorEnvio: ev }).catch(() => {}).then(() => hubProgresso()); };
    await grava();
    let tab = null;
    try {
      const c = await hubCfg();
      if (!c.token) throw Object.assign(new Error('sem-codigo'), { motivo: 'sem-codigo' });
      if (!(await mediadorPermitido())) throw Object.assign(new Error('sem-permissao-mediador'), { motivo: 'sem-permissao-mediador' });
      const cnpjs = cnpjsPedidos ? await mediadorGuardarCnpjs(cnpjsPedidos) : (await mediadorCfg()).cnpjs;
      if (!cnpjs.length) throw Object.assign(new Error('sem-sindicatos'), { motivo: 'sem-sindicatos' });
      tab = await mediadorAba(true);
      if (!tab) throw Object.assign(new Error('sem-aba-mediador'), { motivo: 'sem-aba-mediador' });
      const tipos = Object.keys(OCM.TIPOS), itens = [];
      ev.total = cnpjs.length * tipos.length; ev.etapa = 'lendo os instrumentos'; await grava();
      let formato = 0;
      for (const cnpj of cnpjs) {
        for (const tipo of tipos) {
          if (hubCancelar) throw Object.assign(new Error('cancelado'), { motivo: 'cancelado' });
          const r = await mediadorBuscarUm(tab, cnpj, tipo);
          if (r && r.ok) itens.push(...r.itens);
          else { ev.erros.push({ cnpj: cnpj.slice(0, 8) + '…', tipo, motivo: String((r && (r.erro || r.motivo)) || 'erro').slice(0, 160) }); if (r && r.motivo === 'formato') formato++; }
          ev.feito++; ev.instrumentos = itens.length; await grava();
          if (formato >= 2) throw Object.assign(new Error((r && r.erro) || 'a tela do Mediador mudou'), { motivo: 'formato' });     // falha visível, nunca número errado
          await dormir(MEDIADOR_PAUSA);
        }
      }
      // o texto da convenção vigente e dos aditivos dela
      const sols = OCM.escolherTextos(itens), textos = [], porSol = new Map(itens.map(i => [i.solicitacao, i]));
      ev.etapa = 'lendo os textos'; ev.feito = 0; ev.total = sols.length; await grava();
      for (const s of sols) {
        if (hubCancelar) throw Object.assign(new Error('cancelado'), { motivo: 'cancelado' });
        const t = await mediadorTexto(s, tab);
        if (t && t.ok) textos.push(Object.assign(t, { solicitacao: s, registro: (porSol.get(s) || {}).registro || '' }));
        else ev.erros.push({ solicitacao: s, motivo: String((t && (t.erro || t.motivo)) || 'erro').slice(0, 160) });
        ev.feito++; ev.textos = textos.length; await grava();
        await dormir(1500);
      }
      // ao Hub (só se mudou desde a última entrega aceita, salvo pedido da pessoa)
      ev.etapa = 'entregando ao Hub'; await grava();
      const versao = chrome.runtime.getManifest().version, { mediadorHash } = await chrome.storage.local.get('mediadorHash'), hashes = Object.assign({}, mediadorHash);
      const conjuntos = [
        { tipoDado: 'mediador-instrumentos', titulo: 'Mediador · instrumentos coletivos', colunas: OCM.COLS_INSTRUMENTOS, linhas: OCM.linhasInstrumentos(itens), total: itens.length, cortado: ev.erros.some(e => e.cnpj) },
        { tipoDado: 'mediador-clausulas', titulo: 'Mediador · texto da convenção vigente e aditivos', colunas: OCM.COLS_CLAUSULAS, linhas: OCM.linhasClausulas(textos), total: textos.length, cortado: ev.erros.some(e => e.solicitacao) },
      ];
      for (const conj of conjuntos) {
        const p = OC.hubPartesDe({ linhas: conj.linhas, cortado: conj.cortado }), hash = hashTexto(p.partes.join('\u0001'));
        if (origem === 'auto' && hashes[conj.tipoDado] === hash) continue;
        const ciclo = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        for (let i = 0; i < p.partes.length; i++) {
          const tabela = p.partes[i];
          const lote = { id: 'mediador-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), token: c.token, fonte: 'mediador', tipoDado: conj.tipoDado, categoria: 'convencoes', titulo: conj.titulo,
            extraidoEm: new Date().toISOString(), usuario: 'Mediador (MTE)', colunas: conj.colunas, tabela, nLinhas: tabela ? tabela.split('\n').length : 0, nLinhasTotal: p.nLinhasTotal, totalNaOrigem: conj.total,
            cortado: p.cortado, partes: p.partes.length, parte: i, ciclo, porTipo: { cnpjs: cnpjs.length }, versaoExt: versao };
          let r = await entregarLote(lote);
          if (!r.ok && r.motivo === 'sem-resposta') r = await entregarLote(Object.assign({}, lote, { id: lote.id + 'r' }));
          if (!r.ok) throw Object.assign(new Error(r.mensagem || r.motivo || 'o Hub recusou'), { motivo: r.motivo || 'erro' });
        }
        hashes[conj.tipoDado] = hash;
        await chrome.storage.local.set({ mediadorHash: hashes });
      }
      ev.estado = ev.erros.length ? 'parcial' : 'ok';
      await chrome.storage.local.set({ mediadorCfg: Object.assign(await mediadorCfg(), { ultimaBusca: new Date().toISOString() }) });
    } catch (e) {
      ev.estado = (e && e.motivo) === 'cancelado' ? 'cancelado' : 'erro';
      ev.motivo = (e && e.motivo) || 'erro'; ev.mensagem = String((e && e.message) || e).slice(0, 200);
    }
    ev.etapa = ''; ev.terminouEm = new Date().toISOString();
    if (tab) mediadorSoltarAba();
    await grava();
    return { ok: ev.estado === 'ok' || ev.estado === 'parcial', estado: ev.estado, motivo: ev.motivo || '' };
  })().finally(() => { mediadorRodando = null; });
  return mediadorRodando;
}
// O andamento da busca no Mediador para o Hub e a tela: só estados, contagens e motivos (nunca dado lido)
async function mediadorPainel() {
  const { mediadorEnvio: e } = await chrome.storage.local.get('mediadorEnvio'), c = await mediadorCfg();
  return { permitido: await mediadorPermitido(), rodando: !!mediadorRodando, sindicatos: c.cnpjs.length, ultimaBusca: c.ultimaBusca || '',
    envio: e ? { estado: e.estado, origem: e.origem, etapa: e.etapa || '', feito: e.feito || 0, total: e.total || 0, instrumentos: e.instrumentos || 0, textos: e.textos || 0,
      erros: (e.erros || []).length, motivo: e.motivo || '', mensagem: e.mensagem || '', iniciouEm: e.iniciouEm || '', terminouEm: e.terminouEm || '' } : null };
}
// A rodada semanal (dentro do envio completo): só com a permissão, com sindicatos e com mais de 7 dias desde a última busca
async function mediadorSemanal() {
  const c = await mediadorCfg(), { mediadorEnvio } = await chrome.storage.local.get('mediadorEnvio');
  if (!OCM.semanalDevida(c, mediadorEnvio) || !(await mediadorPermitido())) return null;      // 0.95.1: depois de uma falha, só 24 h depois
  return mediadorBuscar('auto');
}

/* ---------- envio único ao Hub (0.92.0, pedido do Josué em 11/11/2026) ----------
 * "Acompanhar o envio, a divisão entre o que é do Gestta e o que não é, não poder iniciar por dentro do Hub, ter de abrir o Gestta e o
 * Onvio à mão": um envio só leva o resumo, o Onvio e o Gestta, nessa ordem. Pode começar pela extensão, pelo Hub (cmd hubPedido, que a
 * ponte só repassa da janela que provou o código) ou sozinho (a cada syncHoras). O que estiver fechado (Hub, Onvio, Gestta) abre numa
 * aba em segundo plano, sem tirar o foco, e fecha no fim, salvo se a pessoa usou a aba. O andamento (hubEnvio: só estados, nomes de
 * conjuntos e contagens) vai ao Hub a cada mudança (hubProgresso). Nada lido fica guardado; as leituras e regras são as mesmas de antes. */
let envioRodando = null;
const abasDoEnvio = new Map();                  // id da aba aberta pelo envio -> { usada }
chrome.tabs.onActivated.addListener(({ tabId }) => { const a = abasDoEnvio.get(tabId); if (a) a.usada = true; });
async function hubLembrarEndereco(url, tab) {
  const u = OC.hubUrlValida(url || (tab && tab.url));
  if (!u) return;
  const c = await hubCfg();
  if (c.hubUrl !== u) await hubGuardar({ hubUrl: u });
}
async function hubPainelAtual() {
  const { hubEnvio, hubSync, hubSyncGestta } = await chrome.storage.local.get(['hubEnvio', 'hubSync', 'hubSyncGestta']);
  const p = OC.hubEnvioPainel(hubEnvio, hubSync, hubSyncGestta, chrome.runtime.getManifest().version);
  p.rodando = !!envioRodando || !!hubSincRodando || !!gesttaHubRodando;
  p.mediador = await mediadorPainel();
  return p;
}
// Manda o andamento às abas do claude.ai (a ponte entrega só à janela do Hub que provou o código). No máximo 1 vez a cada 1,5 s.
let progressoEm = 0, progressoTimer = null;
function hubProgresso(forca) {
  const agora = Date.now();
  if (!forca && agora - progressoEm < 1500) { if (!progressoTimer) progressoTimer = setTimeout(() => { progressoTimer = null; hubProgresso(true); }, 1500 - (agora - progressoEm)); return; }
  progressoEm = agora;
  (async () => {
    const c = await hubCfg(); if (!c.token || !(await hubPermitido())) return;
    const envio = await hubPainelAtual();
    for (const t of await hubAbas()) { try { await chrome.tabs.sendMessage(t.id, { alvo: 'ponte-hub', cmd: 'progresso', envio, token: c.token }); } catch (e) { /* aba sem a ponte */ } }
  })().catch(() => {});
}
function hubCancelarEnvio() {
  if (!envioRodando && !hubSincRodando && !gesttaHubRodando && !mediadorRodando) return { ok: false, motivo: 'nada-rodando' };
  hubCancelar = true;
  return { ok: true };
}
const dormir = ms => new Promise(r => setTimeout(r, ms));
async function esperarAte(f, ms, passo) { const fim = Date.now() + ms; for (;;) { try { if (await f()) return true; } catch (e) { if (e && e.cliente) throw e; /* ainda não */ } if (Date.now() >= fim || hubCancelar) return false; await dormir(passo || 1500); } }
// Abre uma aba sem tirar o foco (numa janela normal; sem janela, numa janela minimizada) e espera carregar.
async function abrirEmSegundoPlano(url) {
  let tab = null;
  try {
    const jan = (await chrome.windows.getAll({ windowTypes: ['normal'] })).sort((a, b) => (b.focused === true) - (a.focused === true))[0];
    if (jan) tab = await chrome.tabs.create({ url, active: false, windowId: jan.id });
    else { const w = await chrome.windows.create({ url, focused: false, state: 'minimized' }); tab = w.tabs && w.tabs[0]; }
  } catch (e) { return null; }
  if (!tab) return null;
  abasDoEnvio.set(tab.id, { usada: false });
  try { await chrome.tabs.update(tab.id, { autoDiscardable: false }); } catch (e) { /* Chrome antigo */ }
  await esperarAte(async () => { const t = await chrome.tabs.get(tab.id); return t.status === 'complete'; }, 45000, 700);
  return tab;
}
async function fecharAbasDoEnvio() {
  for (const [id, a] of abasDoEnvio) {
    abasDoEnvio.delete(id);
    if (a.usada) continue;                                    // a pessoa foi para a aba: fica aberta
    try { const t = await chrome.tabs.get(id); if (!t.active) await chrome.tabs.remove(id); } catch (e) { /* já fechada */ }
  }
}
async function onvioPronto() {
  leitorCache = null;
  try { await escolherFetcher(false); return true; } catch (e) { if (e && e.cliente) throw e; return false; }
}
async function gesttaPronto() {
  const tab = await abaGestta();
  if (!tab || OCG.appDe(tab.url || '') === 'login' || !OCG.appDe(tab.url || '')) return false;
  const { r } = await lerGestta([OCG.PEDIDOS.me()], { tab }).catch(() => ({ r: null }));
  return !!(r && r.ok);
}
// Começa o envio único e responde na hora (é longo: as telas acompanham pelo hubEnvio e o Hub pelo progresso).
async function hubIniciar(origem, alvo) {
  if (envioRodando || hubSincRodando || gesttaHubRodando) return { ok: true, jaRodando: true };
  const c = await hubCfg();
  if (!c.token) return { ok: false, motivo: 'sem-codigo' };
  if (!(await hubPermitido())) return { ok: false, motivo: 'sem-permissao' };
  const a = OC.hubAlvo(alvo);
  if (a && !a.resumo && !a.onvio.length && !a.gestta.length) return { ok: false, motivo: 'nada-reenviar' };
  if (origem !== 'auto' && !a) await hubGuardar({ envioConfirmado: true });           // a pessoa pediu o envio completo: vale como confirmação do que vai
  hubAtualizar(origem, a).catch(() => {});
  return { ok: true, iniciado: true };
}
// 0.94.0 (Josué, 11/11/2026: "a extensão deve já reenviar automaticamente tudo que der erro, e caso o erro persistir dar o copiar para colar do
// diagnóstico do erro e dizer qual informação esse erro iria alimentar"): depois de cada fonte, o que deu erro é refeito sozinho até 2 vezes
// (pausa de 15 s e de 30 s), sem reler o que já foi aceito; o que continuar com erro fica no resultado com o que alimenta e o diagnóstico.
// Erros que não adianta repetir (código, versão antiga, acesso de cliente, acesso parcial do Gestta, leitura do escritório) não são refeitos.
const HUB_REENVIOS = 2, NAO_REPETE = ['token', 'sem-hub', 'somente-leitura', 'sem-config', 'versao-antiga', 'visao-cliente', 'acesso-parcial', 'sem-sessao-gestta', 'sem-gestta', 'cancelado'];
async function hubAtualizar(origem, alvo) {
  if (envioRodando) return envioRodando;
  envioRodando = (async () => {
    hubCancelar = false;
    const manual = origem !== 'auto';
    // alvo (Hub 340, "só o que falta"): só as fontes e os conjuntos pedidos; não conta como envio completo
    const catsAlvo = alvo ? [...new Set(alvo.gestta.map(id => OCG.catDoConjunto(id)).filter(Boolean))] : null;
    const querOnvio = !alvo || alvo.resumo || alvo.onvio.length > 0, querGestta = !alvo || catsAlvo.length > 0;
    const ev = { id: 'e' + Date.now().toString(36), origem, estado: 'preparando', fase: 'abas', iniciouEm: new Date().toISOString(), pulso: Date.now(), abas: {}, avisos: [], fontes: {}, tentativas: 0, reenvios: { onvio: 0, gestta: 0 }, alvo: alvo ? { onvio: alvo.onvio.length + (alvo.resumo ? 1 : 0), gestta: catsAlvo.length } : null };
    const grava = () => { ev.pulso = Date.now(); return chrome.storage.local.set({ hubEnvio: ev }).catch(() => {}).then(() => hubProgresso()); };
    await grava();
    const batida = setInterval(grava, 20000);
    let rO = null, rG = null;
    try {
      const c = await hubCfg();
      // 1) o Hub: aberto e respondendo, ou abre pelo endereço aprendido
      if ((await hubStatus()).hubAberto) ev.abas.hub = 'aberta';
      else if (!c.hubUrl) throw Object.assign(new Error('sem-endereco-hub'), { motivo: 'sem-endereco-hub' });
      else {
        const t = await abrirEmSegundoPlano(c.hubUrl);
        ev.abas.hub = t ? 'abriu' : 'falhou'; await grava();
        if (!t || !(await esperarAte(async () => (await hubStatus()).hubAberto, 60000, 2000))) throw Object.assign(new Error('sem-hub'), { motivo: 'sem-hub' });
      }
      await grava();
      // 2) o Onvio e o Gestta: abre o que faltar (os dois carregam juntos) e espera a sessão de cada um
      const precisaOnvio = querOnvio && !(await abaOnvio()), precisaGestta = querGestta && !(await abaGestta());
      const [tO, tG] = await Promise.all([precisaOnvio ? abrirEmSegundoPlano(OC.PORTAL + 'service-requesting/general') : null, precisaGestta ? abrirEmSegundoPlano(GESTTA_URL) : null]);
      if (querOnvio) ev.abas.onvio = precisaOnvio ? (tO ? 'abriu' : 'falhou') : 'aberta';
      if (querGestta) ev.abas.gestta = precisaGestta ? (tG ? 'abriu' : 'falhou') : 'aberta';
      await grava();
      const [okO, okG] = await Promise.all([querOnvio ? esperarAte(onvioPronto, precisaOnvio ? 40000 : 8000, 2500) : false, querGestta ? esperarAte(gesttaPronto, precisaGestta ? 40000 : 8000, 2500) : false]);
      if (querOnvio && !okO) { ev.abas.onvio = 'sem-sessao'; ev.fontes.onvio = { motivo: 'sem-sessao-onvio' }; }
      if (querGestta && !okG) { ev.abas.gestta = 'sem-sessao'; ev.fontes.gestta = { motivo: 'sem-sessao-gestta' }; }
      ev.estado = 'enviando'; await grava();
      // refaz o que deu erro (até HUB_REENVIOS vezes), lendo de novo só esses conjuntos
      const reenviar = async (fonte, chave, paraReenviar, sincronizar) => {
        for (let t = 1; t <= HUB_REENVIOS && !hubCancelar; t++) {
          const st = (await chrome.storage.local.get(chave))[chave];
          if (!st || NAO_REPETE.includes(st.motivo)) return;
          const so = paraReenviar(st); if (!so.length) return;
          ev.fase = 'reenvio-' + fonte; ev.reenvios[fonte] = t; ev.tentativas = Math.max(ev.reenvios.onvio, ev.reenvios.gestta); await grava();      // tentativas = rodadas de reenvio (no máximo HUB_REENVIOS)
          await dormir(t * 15000); if (hubCancelar) return;
          await sincronizar(so);
        }
      };
      // 3) o resumo das pendentes, 4) o Onvio, 5) o Gestta
      if (okO && !hubCancelar && (!alvo || alvo.resumo)) { ev.fase = 'resumo'; await grava(); await enviarAoHub(null, manual).catch(() => {}); }
      if (okO && !hubCancelar && (!alvo || alvo.onvio.length)) {
        ev.fase = 'onvio'; await grava();
        rO = alvo ? await hubSincronizar(true, false, alvo.onvio) : await hubSincronizar(manual);
        if (rO && rO.motivo) ev.fontes.onvio = { motivo: rO.motivo };
        if (!(rO && NAO_REPETE.includes(rO.motivo))) await reenviar('onvio', 'hubSync', OC.hubParaReenviar, so => hubSincronizar(true, false, so));
      }
      const parar = rO && ['token', 'sem-hub', 'somente-leitura', 'sem-config', 'versao-antiga', 'visao-cliente'].includes(rO.motivo);
      if (okG && !hubCancelar && !parar && querGestta) {
        ev.fase = 'gestta'; await grava();
        rG = await gesttaHubSincronizar(manual || !!alvo, catsAlvo || undefined);
        if (rG && rG.motivo) ev.fontes.gestta = { motivo: rG.motivo };
        if (!(rG && NAO_REPETE.includes(rG.motivo))) await reenviar('gestta', 'hubSyncGestta', OCG.paraReenviar, so => gesttaHubSincronizar(true, so));
      }
      // 6) o Mediador, uma vez por semana, só no envio completo (0.95.0)
      if (!alvo && !hubCancelar && !parar) { ev.fase = 'mediador'; await grava(); const rM = await mediadorSemanal().catch(() => null); if (rM && !rM.ok && rM.motivo !== 'cancelado') ev.avisos.push('O Mediador não foi lido nesta semana (' + rM.motivo + '): tente de novo pelo botão Buscar no Mediador, em Convenções.'); }
      // o resultado sai do estado final de cada fonte (depois dos reenvios); a fonte que não foi pedida não pesa
      const fim = await chrome.storage.local.get(['hubSync', 'hubSyncGestta']);
      const estFonte = (quer, ok, r, st) => !quer ? { estado: 'ok' } : !ok ? null : st && st.iniciouEm >= ev.iniciouEm ? { estado: st.estado } : r;
      ev.estado = OC.hubEnvioEstado(estFonte(querOnvio && (!alvo || alvo.onvio.length || alvo.resumo), okO, rO, fim.hubSync), estFonte(querGestta, okG, rG, fim.hubSyncGestta), hubCancelar);
      if (querOnvio && !okO) ev.avisos.push('O Onvio não estava com a sessão aberta: entre no Portal do Cliente e atualize de novo.');
      if (querGestta && !okG) ev.avisos.push('O Gestta não estava com a sessão aberta: entre no Gestta e atualize de novo.');
      if (parar) ev.motivo = rO.motivo;
    } catch (e) {
      if (e && e.cliente) await bloquearVisaoCliente(e);
      ev.estado = hubCancelar ? 'cancelado' : 'erro';
      ev.motivo = e && e.cliente ? 'visao-cliente' : (e && e.motivo) || String((e && e.message) || e).slice(0, 160);
    }
    clearInterval(batida);
    ev.fase = ''; ev.terminouEm = new Date().toISOString();
    await fecharAbasDoEnvio();
    await grava();
    hubProgresso(true);
    return { ok: ev.estado === 'ok' || ev.estado === 'parcial', estado: ev.estado, motivo: ev.motivo || '' };
  })().finally(() => { envioRodando = null; hubCancelar = false; });
  return envioRodando;
}
// Automático (Josué, 11/11/2026: abre e fecha sozinho): passou o intervalo desde o último envio completo, abre o que faltar e envia.
// Depois de uma falha, espera 1 hora antes de tentar de novo (sessão do Onvio ou do Gestta vencida não vira uma aba aberta a cada alarme).
async function hubAutoUnico() {
  const c = await hubCfg();
  if (!c.token || !c.auto || c.syncAuto === false || !c.envioConfirmado || envioRodando || hubSincRodando || gesttaHubRodando) return;
  if (!(await hubPermitido())) return;
  const { hubEnvio, hubSync } = await chrome.storage.local.get(['hubEnvio', 'hubSync']);
  const completo = e => e && !e.alvo && e.terminouEm && ['ok', 'parcial'].includes(e.estado) ? Date.parse(e.terminouEm) || 0 : 0;      // "só o que falta" não é envio completo
  const ult = Math.max(completo(hubEnvio), hubSync && !hubSync.soFolha && !hubSync.reenvio ? completo(hubSync) : 0);
  if (ult && Date.now() - ult < Math.max(1, Number(c.syncHoras) || 6) * 3600e3) return;
  const tentou = hubEnvio && hubEnvio.iniciouEm ? Date.parse(hubEnvio.iniciouEm) || 0 : 0;
  if (tentou && tentou > ult && Date.now() - tentou < 3600e3) return;
  if (!c.hubUrl && !(await hubStatus()).hubAberto) return;           // sem o endereço do Hub, só com ele aberto
  hubAtualizar('auto').catch(() => {});
}

/* ---------- ciclo de vida ---------- */
async function hubRetomarDepoisDeReinicio() {
  try {
    const { hubSync } = await chrome.storage.local.get('hubSync');
    if (hubSync && hubSync.estado === 'enviando' && !hubSincRodando) await chrome.storage.local.set({ hubSync: Object.assign({}, hubSync, { estado: 'interrompido', etapa: '', terminouEm: new Date().toISOString(), motivo: 'interrompido' }) });      // o service worker morreu no meio
    const { hubSyncGestta } = await chrome.storage.local.get('hubSyncGestta');
    if (hubSyncGestta && hubSyncGestta.estado === 'enviando' && !gesttaHubRodando) await chrome.storage.local.set({ hubSyncGestta: Object.assign({}, hubSyncGestta, { estado: 'interrompido', etapa: '', terminouEm: new Date().toISOString(), motivo: 'interrompido' }) });
    const { hubEnvio } = await chrome.storage.local.get('hubEnvio');
    if (hubEnvio && ['enviando', 'preparando'].includes(hubEnvio.estado) && !envioRodando) await chrome.storage.local.set({ hubEnvio: Object.assign({}, hubEnvio, { estado: 'interrompido', fase: '', terminouEm: new Date().toISOString(), motivo: 'interrompido' }) });
    if ((await hubCfg()).token) await hubRegistrar();                 // abas do claude.ai abertas antes da atualização ganham a ponte nova
  } catch (e) { /* sem Hub conectado */ }
}
async function iniciar() {
  await migrarSettings();
  await hubRetomarDepoisDeReinicio();
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
  else if (a.name === ALARME_HUBSYNC) { hubAutoUnico().catch(() => {}); }
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

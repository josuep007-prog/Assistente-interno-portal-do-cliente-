/* Control Onvio · núcleo do Gestta (sem chrome.*)
 * Roda em três lugares: no service worker (importScripts), dentro da aba do Gestta (mundo da página, injetado pelo
 * service worker só na hora da leitura) e nos testes (Node). Aqui ficam os endereços da API não oficial do Gestta,
 * a lista do que a extensão pode pedir, a limpeza de cada resposta (só os campos permitidos saem da página) e a
 * leitura do perfil de quem está logado.
 *
 * Regras (CLAUDE.md, seção Gestta; mapa em mapeamento/gestta-2026-11-04.md):
 *  - Só leitura: GET em https://api.gestta.com.br e dois POST que só leem, autorizados pelo Josué:
 *    a busca de tarefas (04/11/2026) e o relatório de tarefas do tipo CUSTOMER_TASK (05/11/2026).
 *  - O token (localStorage 'ngStorage-jwt') só é usado dentro da página. Nada aqui o devolve: lerNaPagina descarta o
 *    token antes de responder e só a validade (campo exp) sai.
 *  - Nunca: Senhas do cliente, certificados (senha de revogação), conta do escritório, permissões e login dos
 *    funcionários, destinatários do email_log, telefone, mensalidade, valor, pontuação e horas.
 */
(function (g) {
  'use strict';

  const API = 'https://api.gestta.com.br';
  const APP = 'https://app.gestta.com.br';
  const PAUSA_MS = 300;                 // entre uma leitura e outra (carga leve, como no Onvio)
  const LIMITE_BUSCA = 1000;            // o Gestta aceita até 1000 por página na busca de tarefas
  const JANELA_MAX_DIAS = 31;           // um mês por chamada: 12 meses de uma vez deu erro 500 (05/11/2026)

  /* ---------- o que pode ser pedido ---------- */
  // POST que só leem. Qualquer outro POST, PUT, PATCH ou DELETE é recusado antes de sair.
  const POST_LEITURA = {
    '/core/customer/task/search': 'busca',
    '/core/customer/task/report': 'relatorio'
  };
  const RELATORIO_TIPOS = ['CUSTOMER_TASK'];   // CUSTOMER_CERTIFICATE (senha de revogação) e CUSTOMER_TASK_DOCUMENT (binários) nunca
  // Caminhos proibidos mesmo em GET: Senhas, configurações e cobrança da conta, apontamento de horas, certificados,
  // exportação de arquivo, lote e a conta do escritório.
  const PROIBIDO = /password|senha|smtp|billing|email-domain|timesheet|certificate|\/export\b|\/batch\b|^\/admin\/company\/?$|^\/auth\//i;

  function caminhoDe(url) {
    try {
      const u = new URL(url, API);
      if (u.protocol !== 'https:' || u.hostname !== 'api.gestta.com.br' || u.username || u.password || u.port) return null;
      return u.pathname.replace(/\/+$/, '') || '/';
    } catch (e) { return null; }
  }
  const diasEntre = (a, b) => { const x = Date.parse(a), y = Date.parse(b); return isNaN(x) || isNaN(y) ? Infinity : Math.abs(y - x) / 864e5; };

  // { ok, motivo } — usada no service worker antes de pedir e de novo dentro da página antes do fetch.
  function leituraPermitida(metodo, url, corpo) {
    const m = String(metodo || 'GET').toUpperCase();
    const p = caminhoDe(url);
    if (!p) return { ok: false, motivo: 'fora da API do Gestta' };
    if (PROIBIDO.test(p)) return { ok: false, motivo: 'endereço proibido para a extensão' };
    if (m === 'GET') return corpo == null ? { ok: true } : { ok: false, motivo: 'GET não leva corpo' };
    if (m !== 'POST') return { ok: false, motivo: 'só leitura: ' + m + ' não é permitido' };
    const tipo = POST_LEITURA[p];
    if (!tipo) return { ok: false, motivo: 'POST não autorizado' };
    if (/\?/.test(String(url))) return { ok: false, motivo: 'POST sem querystring' };
    const c = corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? corpo : null;
    if (!c) return { ok: false, motivo: 'corpo inválido' };
    if (tipo === 'busca') {
      if (!(Number(c.limit) >= 1 && Number(c.limit) <= LIMITE_BUSCA)) return { ok: false, motivo: 'limit entre 1 e ' + LIMITE_BUSCA };
      if (!c.start_date || !c.end_date || diasEntre(c.start_date, c.end_date) > JANELA_MAX_DIAS) return { ok: false, motivo: 'a busca vai um mês por vez' };
      return { ok: true };
    }
    if (!RELATORIO_TIPOS.includes(c.type)) return { ok: false, motivo: 'relatório não autorizado' };
    const d = c.dates || {};
    if (!d.startDate || !d.endDate || diasEntre(d.startDate, d.endDate) > JANELA_MAX_DIAS) return { ok: false, motivo: 'o relatório vai um mês por vez' };
    return { ok: true };
  }

  /* ---------- em que app do Gestta a aba está ---------- */
  function appDe(url) {
    let u; try { u = new URL(url); } catch (e) { return null; }
    if (u.origin !== APP) return null;
    const p = u.pathname, h = u.hash || '';
    if (/^#\/login/.test(h)) return 'login';
    if (p.startsWith('/admin')) return 'admin';
    if (p.startsWith('/dashboard-v2')) return 'painel';
    if (p.startsWith('/dominio-integration')) return 'integracao';
    if (p.startsWith('/express')) return 'express';
    return 'classico';
  }
  const APPS = { classico: 'Tarefas (clássico)', admin: 'Cadastros (admin)', painel: 'Painel novo', integracao: 'Status de integração', express: 'Express', login: 'Tela de login' };

  /* ---------- limpeza: só os campos permitidos saem da página ---------- */
  // Molde: { campo: true } copia o valor simples; { campo: {molde} } desce no objeto; { campo: [molde] } cada item da lista.
  function escolher(v, molde) {
    if (v == null) return v;
    if (Array.isArray(molde)) return Array.isArray(v) ? v.slice(0, 5000).map(x => escolher(x, molde[0])) : undefined;
    if (molde === true) return v === null || ['string', 'number', 'boolean'].includes(typeof v) ? v : undefined;
    if (typeof v !== 'object' || Array.isArray(v)) return undefined;
    const o = {};
    for (const k of Object.keys(molde)) { const x = escolher(v[k], molde[k]); if (x !== undefined) o[k] = x; }
    return o;
  }
  const REF = { _id: true, name: true };
  const SETOR = REF;
  const MOLDES = {
    // quem está logado: só o que decide o perfil (nada de permissões, tentativas ou último login)
    me: { _id: true, name: true, role: true, active: true, root: true, company_departments: [SETOR] },
    // busca de tarefas (lista enxuta)
    tarefa: { _id: true, name: true, customer: { _id: true, name: true, code: true }, type: true, subtype: true, status: true, fine: true, overdue: true, done_overdue: true, done_fine: true, total_step: true, done_step: true, created_at: true, due_date: true, competence_date: true },
    // detalhe da tarefa: sem valor, apontamento, aprovadores e documentos anexos
    tarefaDetalhe: { _id: true, name: true, type: true, subtype: true, status: true, overdue: true, fine: true, created_at: true, legal_date: true, due_date: true, competence_date: true, conclusion_date: true,
      company_task: { _id: true, name: true, active: true }, company_department: SETOR, customer: { _id: true, name: true, code: true, active: true }, owner: { _id: true, name: true, active: true },
      customer_has_documents_integration: true, notify_customer: true, total_step: true, done_step: true,
      // 0.73.0: o que há dentro da tarefa (etapas e documentos), nunca o arquivo
      customer_task_steps: [{ name: true, order: true, required: true, done: true }], company_documents: [{ name: true, disconsidered: true, validation_required: true }],
      document_request: { active: true, requested_documents: [{ name: true, disconsidered: true }] } },
    cliente: { _id: true, code: true, name: true, trading_name: true, cnpj: true, active: true, federal_regime: { _id: true, name: true, identifier: true }, state_inscription: true, federative_unit: true, city: true, external_id: true, partner_config: { has_onvio_portal: true } },
    cartela: { company_department: SETOR, company_user: REF },
    equipe: { _id: true, name: true, role: true, active: true, company_departments: [SETOR], has_linked_tasks: true },
    setor: SETOR,
    template: REF,
    filaOnvio: { _id: true, status: true, error: true, retry_count: true, created_at: true, updated_at: true,
      customer_task: { _id: true, name: true, customer: { _id: true, name: true, cnpj: true }, company_department: SETOR, owner: REF, _due_date: true, _competence_date: true },
      customer_task_file: { company_document: REF } },
    contagem: { fine: true, approve: true, email_not_sent: true, count: true },
    // 0.79.0: template de documento com o destino no portal (só nomes de pasta; nunca o arquivo modelo)
    templateDoc: { _id: true, name: true, automation_type: true, valid: true, bypass: true, documents_integration: { pathName: [true] } },
    // 0.77.0: o histórico da tarefa para a linha do tempo do painel (lido na hora, nunca guardado). Fora o email_log
    // (destinatários e servidores), o arquivo e o upload: só o tipo, a situação, o motivo, a data, quem fez e o nome do documento.
    historico: { _id: true, type: true, status: true, reason: true, accomplished_at: true, created_at: true, accomplished_by: { name: true },
      accomplished_by_customer_user: { name: true }, company_document: { name: true }, file_name: true, comment: true, is_auto_respond: true }
  };
  // Colunas do relatório CUSTOMER_TASK que saem da página (das 34): fora valor, pontuação e mensalidade (decisão pendente).
  const COLUNAS_RELATORIO = ['id', 'name', 'type', 'subtype', 'status', 'company_department.name', 'owner.name', 'owner.role', 'notify_customer', 'fine', '_due_date', 'legal_date', 'downloaded',
    'done_overdue', 'done_fine', 'created_at', 'concluded_by.name', 'conclusion_date', 'overdue', 'on_time', 'company.status', 'customer.active', 'customer.cnpj', 'customer.name', 'customer.code', 'customer.federal_regime.name'];

  const lista = (d) => Array.isArray(d) ? d : d && Array.isArray(d.docs) ? d.docs : [];
  const pagina = (d) => Array.isArray(d) ? { total: d.length } : d && typeof d === 'object' ? { total: d.totalDocs != null ? d.totalDocs : d.total != null ? d.total : undefined, paginas: d.totalPages != null ? d.totalPages : d.pages, pagina: d.page } : {};
  // tipo: o molde a aplicar. Listas (com ou sem invólucro de paginação) viram { itens, total, paginas, pagina }.
  function limpar(tipo, dados) {
    if (tipo === 'relatorio') return limparRelatorio(dados);
    if (tipo === 'fechamento') return limparRelatorio(dados, COLUNAS_FECHAMENTO);
    const molde = MOLDES[tipo];
    if (!molde) return null;
    if (tipo === 'me' || tipo === 'tarefaDetalhe' || tipo === 'contagem') return escolher(dados, molde) || null;
    const o = Object.assign({ itens: lista(dados).map(x => escolher(x, molde)) }, pagina(dados));
    if (dados && dados.documents_without_destination != null) o.semPasta = Number(dados.documents_without_destination) || 0;
    return o;
  }
  // O relatório chega como lista de linhas planas (chaves com ponto) ou como objetos: sai só com as colunas permitidas.
  // Colunas que o Fechamento do mês usa (0.73.0): a tela guarda só estas, em linhas compactas, na memória do Chrome.
  const COLUNAS_FECHAMENTO = ['id', 'name', 'status', 'company_department.name', 'owner.name', '_due_date', 'legal_date', 'conclusion_date', 'on_time', 'fine', 'overdue', 'customer.code', 'customer.name', 'customer.cnpj'];
  // A resposta do relatório vem em fluxo e o formato exato ainda é "a confirmar" no Gestta real: aceita lista JSON,
  // { docs | data | rows | records }, ou uma linha JSON por registro (NDJSON). Formato desconhecido devolve null
  // (a leitura vira "formato desconhecido", visível), nunca uma lista vazia em silêncio.
  function linhasDoRelatorio(dados) {
    let d = dados, formato = 'json';
    if (typeof d === 'string') {
      const t = d.trim(); if (!t) return { linhas: [], formato: 'vazio' };
      try { d = JSON.parse(t); }
      catch (e) {
        try { d = t.split(/\r?\n/).map(x => x.trim()).filter(Boolean).map(x => JSON.parse(x.replace(/,$/, ''))); formato = 'ndjson'; }
        catch (e2) { return null; }
      }
    }
    if (Array.isArray(d)) return { linhas: d.filter(x => x && typeof x === 'object' && !Array.isArray(x)), formato };
    if (d && typeof d === 'object') for (const k of ['docs', 'data', 'rows', 'records', 'items']) if (Array.isArray(d[k])) return { linhas: d[k], formato: formato + ':' + k };
    return null;
  }
  function limparRelatorio(dados, colunas) {
    const r = linhasDoRelatorio(dados); if (!r) return null;
    const cols = (colunas || COLUNAS_RELATORIO).filter(c => COLUNAS_RELATORIO.includes(c));
    const valor = (l, c) => { if (l && Object.prototype.hasOwnProperty.call(l, c)) return l[c]; return c.split('.').reduce((o, k) => o && typeof o === 'object' ? o[k] : undefined, l); };
    return { colunas: cols.slice(), linhas: r.linhas.map(l => cols.map(c => { const v = valor(l, c); return v == null || typeof v === 'object' ? '' : v; })), total: r.linhas.length, formato: r.formato };
  }
  const sim = v => v === true || v === 1 || /^(true|sim|yes|1)$/i.test(String(v == null ? '' : v).trim());
  // Linhas compactas do relatório → tarefas no mesmo formato da busca (para grupos, trilha e filtros)
  function tarefasDoRelatorio(colunas, linhas) {
    const i = {}; (colunas || []).forEach((c, n) => { i[c] = n; });
    const v = (l, c) => i[c] == null ? '' : l[i[c]];
    return (linhas || []).map(l => {
      const code = v(l, 'customer.code'), cnpj = v(l, 'customer.cnpj');
      return { _id: String(v(l, 'id') || ''), name: String(v(l, 'name') || ''), status: String(v(l, 'status') || '').toUpperCase(), fine: sim(v(l, 'fine')), overdue: sim(v(l, 'overdue')),
        due_date: v(l, '_due_date') || '', legal_date: v(l, 'legal_date') || '', conclusion_date: v(l, 'conclusion_date') || '', no_prazo: v(l, 'on_time') === '' ? null : sim(v(l, 'on_time')),
        setor: String(v(l, 'company_department.name') || ''), responsavel: String(v(l, 'owner.name') || ''),
        customer: { _id: String(code || cnpj || v(l, 'customer.name') || '?'), name: String(v(l, 'customer.name') || ''), code: code === '' ? '' : String(code), cnpj: String(cnpj || '') } };
    });
  }

  /* ---------- perfil ---------- */
  const PAPEIS = { ROLE_ADMIN: 'Administrador', ROLE_MANAGER: 'Gestor', ROLE_USER: 'Analista' };
  // A coordenação (administrador ou gestor) vê todos os setores; o analista só os dele (Josué, 05/11/2026).
  // "total" só quando o papel diz isso: um envio ao Hub nunca sai de um acesso parcial como se fosse o todo.
  function perfil(me) {
    if (!me || typeof me !== 'object' || !me._id) return { ok: false, motivo: 'não foi possível saber quem está logado' };
    const papel = String(me.role || '');
    const setores = (me.company_departments || []).filter(s => s && s._id).map(s => ({ id: s._id, nome: String(s.name || '') }));
    const total = papel === 'ROLE_ADMIN' || papel === 'ROLE_MANAGER' || me.root === true;
    return { ok: true, id: me._id, papel, papelNome: PAPEIS[papel] || (papel ? 'Papel desconhecido (' + papel + ')' : 'Sem papel'), total, setores, ativo: me.active !== false };
  }

  // Validade da sessão: só o campo exp do JWT, lido dentro da página. O token nunca é devolvido.
  function expiraEm(token) {
    try {
      const parte = String(token || '').replace(/^JWT\s+/i, '').split('.')[1];
      if (!parte) return null;
      const json = JSON.parse(decodeURIComponent(escape(atob(parte.replace(/-/g, '+').replace(/_/g, '/')))));
      return typeof json.exp === 'number' ? new Date(json.exp * 1000).toISOString() : null;
    } catch (e) { return null; }
  }

  /* ---------- montagem dos pedidos ---------- */
  const url = (p, q) => { const u = new URL(p, API); Object.keys(q || {}).forEach(k => { if (q[k] != null && q[k] !== '') u.searchParams.set(k, q[k]); }); return u.toString(); };
  const iso = d => new Date(d).toISOString();
  // Mês de referência → { start_date, end_date } do primeiro ao último dia (horário do Brasil, como o Gestta usa).
  function janelaDoMes(ano, mes) {
    const ini = new Date(Date.UTC(ano, mes - 1, 1, 3, 0, 0)), fim = new Date(Date.UTC(ano, mes, 1, 2, 59, 59));
    return { start_date: iso(ini), end_date: iso(fim) };
  }
  // 0.83.0 (Josué, 06/11/2026: "Tarefas do mês atual e do anterior: erro 400"): o próprio Gestta pede o relatório com o período no
  // campo filter (CURRENT_MONTH); com filter vazio o servidor pode recusar. Só num 400 tenta os outros valores, e lembra o que deu certo.
  // lembra o JEITO que deu certo ('' vazio, 'P' período relativo, 'CUSTOM'), nunca a palavra: CURRENT_MONTH num mês passado traria o mês errado
  let modoRelOk = '';
  function filtrosRelatorio(m, hoje) {
    const h = hoje || new Date(), ant = mesAnterior(h.getFullYear(), h.getMonth() + 1);
    const rel = m.ano === h.getFullYear() && m.mes === h.getMonth() + 1 ? 'CURRENT_MONTH' : m.ano === ant.ano && m.mes === ant.mes ? 'LAST_MONTH' : '';
    const deModo = (md) => md === 'P' ? rel : md;
    return [...new Set([deModo(modoRelOk), '', rel, 'CUSTOM'])];          // rel vazio (mês mais antigo) cai no '' que já está na lista
  }
  const lembrarFiltroRel = (f) => { modoRelOk = f === 'CURRENT_MONTH' || f === 'LAST_MONTH' ? 'P' : String(f || ''); };
  const filtroRelOk = '';
  const PEDIDOS = {
    me: () => ({ id: 'me', tipo: 'me', metodo: 'GET', url: url('/core/company/user/me') }),
    setores: () => ({ id: 'setores', tipo: 'setor', metodo: 'GET', url: url('/admin/company/department') }),
    equipe: (o) => ({ id: 'equipe', tipo: 'equipe', metodo: 'GET', url: url('/admin/company/user', { active: true, limit: (o && o.limit) || 200, page: (o && o.page) || 1 }) }),
    clientes: (o) => ({ id: 'clientes', tipo: 'cliente', metodo: 'GET', url: url('/admin/customer', { active: true, limit: (o && o.limit) || 200, page: (o && o.page) || 1 }) }),
    cartela: (o) => ({ id: 'cartela', tipo: 'cartela', metodo: 'GET', url: url('/admin/customer/' + encodeURIComponent(o.cliente) + '/responsible') }),
    buscaTarefas: (o) => ({ id: 'buscaTarefas', tipo: 'tarefa', metodo: 'POST', url: url('/core/customer/task/search'),
      corpo: Object.assign({ page: o.page || 1, limit: o.limit || 100, type: o.type || ['RECURRENT', 'SERVICE_ORDER', 'ACCOUNTING'], status: o.status || ['OPEN', 'IMPEDIMENT'], date_type: o.dataTipo === 'COMPETENCE_DATE' ? 'COMPETENCE_DATE' : 'DUE_DATE' }, janelaDoMes(o.ano, o.mes), o.companyUser ? { company_user: [o.companyUser] } : {}, o.semDono ? { no_owner: true } : {}) }),
    tarefa: (o) => ({ id: 'tarefa', tipo: 'tarefaDetalhe', metodo: 'GET', url: url('/core/customer/task/' + encodeURIComponent(o.id)) }),
    historico: (o) => ({ id: 'historico', tipo: 'historico', metodo: 'GET', url: url('/core/customer/task/' + encodeURIComponent(o.id) + '/history', { page: o.page || 1 }) }),
    relatorio: (o) => { const j = janelaDoMes(o.ano, o.mes); return { id: 'relatorio', tipo: 'relatorio', metodo: 'POST', url: url('/core/customer/task/report'), corpo: { type: 'CUSTOMER_TASK', filter: o.filtro != null ? String(o.filtro) : filtroRelOk, dates: { startDate: j.start_date, endDate: j.end_date } } }; },
    fechamento: (o) => Object.assign(PEDIDOS.relatorio(o), { id: 'fechamento', tipo: 'fechamento' }),
    filaOnvioErro: (o) => ({ id: 'filaOnvioErro', tipo: 'filaOnvio', metodo: 'GET', url: url('/es/file/onvio', { status: 'ERROR', limit: (o && o.limit) || 50, skip: (o && o.skip) || 0 }) }),
    multas: (o) => { const j = janelaDoMes(o.ano, o.mes); return { id: 'multas', tipo: 'contagem', metodo: 'GET', url: url('/core/dashboard/attention/fine/all', j) }; },
    templatesDocumento: () => ({ id: 'templatesDocumento', tipo: 'template', metodo: 'GET', url: url('/admin/company/document', { limit: 1, page: 1 }) }),
    // 0.79.0: a lista inteira de templates de documento, com a pasta de destino no portal (para achar os que não têm pasta)
    templatesLista: (o) => ({ id: 'templatesLista', tipo: 'templateDoc', metodo: 'GET', url: url('/admin/company/document', { limit: (o && o.limit) || 200, page: (o && o.page) || 1 }) })
  };

  /* ---------- leitura dentro da página (mundo MAIN da aba do Gestta) ----------
   * Recebe uma lista de pedidos, confere cada um de novo, usa o token só aqui e devolve só os dados limpos.
   * O token não está no retorno, nem nos erros (só o código e uma mensagem curta do servidor). */
  async function lerNaPagina(pedidos, opcoes) {
    const pausa = opcoes && opcoes.pausa != null ? opcoes.pausa : PAUSA_MS;
    const app = appDe(String(g.location && g.location.href || ''));
    let tok = null;
    try { tok = JSON.parse(g.localStorage.getItem('ngStorage-jwt') || 'null'); } catch (e) { tok = null; }
    if (typeof tok !== 'string' || !/^JWT\s+\S+/.test(tok)) return { ok: false, app, semSessao: true, motivo: 'sem sessão do Gestta nesta aba (faça login)' };
    const validade = expiraEm(tok);
    const resultados = [];
    for (let i = 0; i < (pedidos || []).length; i++) {
      const p = pedidos[i] || {};
      const perm = leituraPermitida(p.metodo, p.url, p.corpo == null ? null : p.corpo);
      if (!perm.ok) { resultados.push({ id: p.id, status: 0, recusado: perm.motivo }); continue; }
      if (i) await new Promise(r => setTimeout(r, pausa));
      try {
        const metodo = String(p.metodo || 'GET').toUpperCase();
        const headers = { Accept: 'application/json, text/plain, */*', Authorization: tok };
        if (metodo === 'POST') headers['Content-Type'] = 'application/json';
        const r = await g.fetch(p.url, { method: metodo, headers, body: metodo === 'POST' ? JSON.stringify(p.corpo) : undefined, credentials: 'omit' });
        let dados = null, texto = '';
        try { texto = await r.text(); dados = texto ? JSON.parse(texto) : null; } catch (e) { dados = null; }
        if (r.ok) {
          const limpo = p.tipo === 'relatorio' || p.tipo === 'fechamento' ? limpar(p.tipo, texto) : limpar(p.tipo, dados);
          resultados.push(limpo == null ? { id: p.id, status: r.status, erro: 'resposta em formato desconhecido' } : { id: p.id, status: r.status, dados: limpo });
        } else {
          const msg = dados && typeof dados === 'object' ? String(dados.message || dados.error || '').slice(0, 160) : '';
          resultados.push({ id: p.id, status: r.status, erro: msg || ('erro ' + r.status) });
          if (r.status === 401) break;             // sessão caiu: para tudo
        }
      } catch (e) { resultados.push({ id: p.id, status: 0, erro: 'sem resposta do Gestta (' + String(e && e.message || e).slice(0, 80) + ')' }); }
    }
    tok = null;
    return { ok: true, app, validade, resultados };
  }

  /* ---------- texto do "Testar a leitura do Gestta" (só contagens e situação) ---------- */
  const fmt = n => typeof n === 'number' ? n.toLocaleString('pt-BR') : '?';
  function linhasDoTeste(r, aba) {
    const L = [];
    if (!aba) return ['Nenhuma aba do Gestta aberta. Abra https://app.gestta.com.br já logado e teste de novo.'];
    if (!r) return ['A aba do Gestta não respondeu (recarregue a página com F5 e teste de novo).'];
    L.push('Aba do Gestta: ' + (APPS[r.app] || 'tela desconhecida') + '.');
    if (r.semSessao || r.app === 'login') return L.concat(['Sem sessão do Gestta: faça login na aba e teste de novo.']);
    if (r.validade) L.push('Sessão válida até ' + new Date(r.validade).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) + '.');
    const por = {}; (r.resultados || []).forEach(x => { por[x.id] = x; });
    const me = por.me, pf = me && me.dados ? perfil(me.dados) : null;
    if (!pf || !pf.ok) return L.concat(['Não consegui ler quem está logado' + (me ? ' (' + (me.erro || me.recusado || 'status ' + me.status) + ')' : '') + ': nada mais foi lido.']);
    L.push('Perfil: ' + pf.papelNome + (pf.total ? ' · acesso a todos os setores' : ' · acesso ao(s) setor(es) dele') + ' · ' + pf.setores.length + (pf.setores.length === 1 ? ' setor' : ' setores') + (pf.setores.length ? ': ' + pf.setores.map(s => s.nome).join(', ') : '') + '.');
    if (!pf.total) L.push('Com este acesso, o envio ao Hub não sai: ele exige o acesso da coordenação para não mandar dados de um setor como se fossem de todos.');
    const linha = (rot, x, conta) => {
      if (!x) return '· ' + rot + ': não lido';
      if (x.recusado) return '· ' + rot + ': recusado pela extensão (' + x.recusado + ')';
      if (x.status === 403) return '· ' + rot + ': seu acesso não inclui esta leitura (403)';
      if (x.status !== 200) return '· ' + rot + ': falhou (' + (x.erro || 'status ' + x.status) + ')';
      return '· ' + rot + ': ' + conta(x.dados);
    };
    const tot = d => d && d.total != null ? fmt(d.total) : fmt((d && d.itens || []).length);
    L.push('Leituras (só contagens):');
    L.push(linha('setores', por.setores, d => tot(d)));
    L.push(linha('equipe ativa', por.equipe, d => tot(d)));
    L.push(linha('clientes ativos', por.clientes, d => tot(d)));
    L.push(linha('cartela de 1 cliente', por.cartela, d => fmt((d.itens || []).length) + ' setor(es) com responsável'));
    L.push(linha('tarefas abertas ou com impedimento no mês', por.buscaTarefas, d => tot(d)));
    L.push(linha('multas no mês (painel)', por.multas, d => fmt(d.fine)));
    L.push(linha('fila de envio ao Onvio com erro', por.filaOnvioErro, d => tot(d)));
    L.push(linha('templates de documento sem pasta no portal', por.templatesDocumento, d => d.semPasta != null ? fmt(d.semPasta) : '?'));
    L.push('Relatório do mês (CUSTOMER_TASK): liberado, mas não é lido no teste (é pesado: dezenas de segundos).');
    return L;
  }

  /* ---------- tarefas: grupos, prazos e visões da tela "Tarefas do Gestta" (0.72.0) ---------- */
  const diaLocal = d => { const x = d instanceof Date ? d : new Date(d); return isNaN(x) ? null : new Date(x.getFullYear(), x.getMonth(), x.getDate()); };
  const p2 = n => String(n).padStart(2, '0');
  const ymd = d => d ? d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) : '';
  const ddmm = d => d ? p2(d.getDate()) + '/' + p2(d.getMonth() + 1) : '';
  const util = d => d.getDay() !== 0 && d.getDay() !== 6;
  // dias úteis (seg a sex) de hoje (exclusive) até o alvo (inclusive); negativo para trás
  function diasUteis(hoje, alvo) {
    const a = diaLocal(hoje), b = diaLocal(alvo); if (!a || !b) return null;
    if (+a === +b) return 0;
    const passo = b > a ? 1 : -1; let n = 0;
    for (let d = new Date(a); +d !== +b;) { d.setDate(d.getDate() + passo); if (util(d)) n += passo; }
    return n;
  }
  const diasCorridos = (hoje, alvo) => { const a = diaLocal(hoje), b = diaLocal(alvo); return a && b ? Math.round((b - a) / 864e5) : null; };
  // Ordem na tela: do que mais pesa ao que pode esperar
  const GRUPOS = [
    { k: 'multa', rot: 'Gerando multa', dica: 'passaram da data legal: estão gerando multa' },
    { k: 'atrasada', rot: 'Atrasadas', dica: 'passaram da meta e ainda estão abertas' },
    { k: 'impedimento', rot: 'Com impedimento', dica: 'paradas por um impedimento (falta algo do cliente ou de outro setor)' },
    { k: 'hoje', rot: 'Vencem hoje', dica: 'a meta é hoje' },
    { k: 'proximas', rot: 'Próximos 5 dias úteis', dica: 'a meta chega nos próximos 5 dias úteis' },
    { k: 'depois', rot: 'Mais adiante', dica: 'a meta está a mais de 5 dias úteis' },
    { k: 'feita', rot: 'Concluídas', dica: 'concluídas no mês' }
  ];
  const ABERTA = new Set(['OPEN', 'IMPEDIMENT']);
  function grupoTarefa(t, hoje) {
    const st = String(t && t.status || '');
    if (st === 'DONE') return 'feita';
    if (!ABERTA.has(st)) return null;                     // ignorada, desconsiderada ou situação nova: fora da tela
    if (t.fine) return 'multa';
    if (st === 'IMPEDIMENT') return 'impedimento';
    const d = diaLocal(t.due_date), h = diaLocal(hoje || new Date());
    if (t.overdue || (d && d < h)) return 'atrasada';
    if (!d) return 'depois';
    if (+d === +h) return 'hoje';
    return diasUteis(h, d) <= 5 ? 'proximas' : 'depois';
  }
  function prazoTexto(t, hoje) {
    const d = diaLocal(t && t.due_date), h = diaLocal(hoje || new Date());
    if (String(t && t.status) === 'DONE') return 'Concluída';
    if (!d) return 'Sem meta';
    const c = diasCorridos(h, d);
    if (c < 0) return 'Venceu há ' + (-c) + (c === -1 ? ' dia' : ' dias') + ' (' + ddmm(d) + ')';
    if (c === 0) return 'Vence hoje';
    if (c === 1) return 'Vence amanhã';
    const u = diasUteis(h, d);
    return 'Vence em ' + u + (u === 1 ? ' dia útil' : ' dias úteis') + ' (' + ddmm(d) + ')';
  }
  const TIPOS_TAREFA = { RECURRENT: 'Recorrente', SERVICE_ORDER: 'Ordem de serviço', ACCOUNTING: 'Contábil' };
  const SITUACOES_TAREFA = { OPEN: 'Aberta', IMPEDIMENT: 'Impedimento', DONE: 'Concluída', IGNORED: 'Ignorada', DISCONSIDERED: 'Desconsiderada' };
  function contarGrupos(lista, hoje) {
    const n = {}; GRUPOS.forEach(gr => { n[gr.k] = 0; });
    let ignoradas = 0;
    (lista || []).forEach(t => { const k = grupoTarefa(t, hoje); if (k) n[k]++; else ignoradas++; });
    const total = GRUPOS.reduce((s, gr) => s + n[gr.k], 0);
    return { n, total, abertas: total - n.feita, feitas: n.feita, ignoradas, pctFeitas: total ? Math.round(n.feita / total * 100) : 0 };
  }
  // Uma linha por empresa, com o que pesa primeiro (multa, atraso, impedimento, hoje) e a próxima meta.
  function porEmpresa(lista, hoje) {
    const m = new Map();
    (lista || []).forEach(t => {
      const k = grupoTarefa(t, hoje); if (!k) return;
      const c = t.customer || {}, id = c._id || c.code || c.name || '?';
      let e = m.get(id);
      if (!e) { e = { id, nome: String(c.name || 'Sem cliente'), codigo: c.code != null ? String(c.code) : '', n: 0, abertas: 0, feitas: 0, multa: 0, atrasada: 0, impedimento: 0, hoje: 0, proximas: 0, proxima: null, tarefas: [] }; m.set(id, e); }
      e.n++; e.tarefas.push(t);
      if (k === 'feita') e.feitas++; else { e.abertas++; if (e[k] != null) e[k]++; const d = diaLocal(t.due_date); if (d && (!e.proxima || d < e.proxima)) e.proxima = d; }
    });
    const peso = e => [e.multa, e.atrasada, e.impedimento, e.hoje, e.proximas];
    return [...m.values()].map(e => Object.assign(e, { pctFeitas: e.n ? Math.round(e.feitas / e.n * 100) : 0, proxima: e.proxima ? ymd(e.proxima) : '' }))
      .sort((a, b) => { const pa = peso(a), pb = peso(b); for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) return pb[i] - pa[i]; return (a.abertas ? 0 : 1) - (b.abertas ? 0 : 1) || String(a.proxima || '9').localeCompare(String(b.proxima || '9')) || a.nome.localeCompare(b.nome, 'pt-BR'); });
  }
  // Calendário: por dia da meta, quantas abertas, atrasadas (com multa) e concluídas.
  function porDia(lista, hoje) {
    const m = {};
    (lista || []).forEach(t => {
      const k = grupoTarefa(t, hoje); if (!k) return;
      const d = ymd(diaLocal(t.due_date)); if (!d) return;
      const x = m[d] || (m[d] = { total: 0, abertas: 0, atrasadas: 0, feitas: 0 });
      x.total++; if (k === 'feita') x.feitas++; else { x.abertas++; if (k === 'multa' || k === 'atrasada') x.atrasadas++; }
    });
    return m;
  }
  const semAcento = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const setorDe = t => String((t && (t.setor || (t.company_department && t.company_department.name))) || '');
  const respDe = t => String((t && (t.responsavel || (t.owner && t.owner.name))) || '');
  // f: { q, grupos: [k], tipos: [type], dia: 'aaaa-mm-dd', cliente: id, feitas: bool, setor, analista }
  function filtrarTarefas(lista, f, hoje) {
    f = f || {};
    const termos = semAcento(f.q || '').split(/\s+/).filter(Boolean);
    const grupos = f.grupos && f.grupos.length ? new Set(f.grupos) : null, tipos = f.tipos && f.tipos.length ? new Set(f.tipos) : null;
    return (lista || []).filter(t => {
      const k = grupoTarefa(t, hoje); if (!k) return false;
      if (k === 'feita' && !f.feitas && !(grupos && grupos.has('feita'))) return false;
      if (grupos && !grupos.has(k)) return false;
      if (tipos && !tipos.has(t.type)) return false;
      if (f.dia && ymd(diaLocal(t.due_date)) !== f.dia) return false;
      if (f.cliente && (t.customer || {})._id !== f.cliente) return false;
      if (f.setor && setorDe(t) !== f.setor) return false;
      if (f.analista && respDe(t) !== f.analista) return false;
      if (!termos.length) return true;
      const c = t.customer || {}, alvo = semAcento([t.name, c.name, c.code, c.cnpj, TIPOS_TAREFA[t.type], setorDe(t), respDe(t)].join(' '));
      return termos.every(x => alvo.includes(x));
    }).sort((a, b) => {
      const ga = GRUPOS.findIndex(x => x.k === grupoTarefa(a, hoje)), gb = GRUPOS.findIndex(x => x.k === grupoTarefa(b, hoje));
      return ga - gb || String(a.due_date || '').localeCompare(String(b.due_date || '')) || String((a.customer || {}).name || '').localeCompare(String((b.customer || {}).name || ''), 'pt-BR');
    });
  }

  /* ---------- trilha da empresa e fechamento do mês (0.73.0) ---------- */
  const ESTADO_DO_GRUPO = { feita: 'feita', multa: 'multa', atrasada: 'atrasada', impedimento: 'impedimento', hoje: 'hoje', proximas: 'afazer', depois: 'afazer' };
  const ESTADOS = { feita: 'Concluída', multa: 'Gerando multa', atrasada: 'Atrasada', impedimento: 'Com impedimento', hoje: 'Vence hoje', afazer: 'A fazer' };
  // As tarefas da empresa como etapas, na ordem da meta. "cheiaAte": até onde o traço fica cheio (as concluídas do começo).
  function trilhaDaEmpresa(tarefas, hoje) {
    const etapas = (tarefas || []).map(t => ({ t, grupo: grupoTarefa(t, hoje) })).filter(x => x.grupo)
      .sort((a, b) => String(a.t.due_date || '9').localeCompare(String(b.t.due_date || '9')) || String(a.t.name || '').localeCompare(String(b.t.name || ''), 'pt-BR'))
      .map(x => { const d = diaLocal(x.t.due_date); return { t: x.t, estado: ESTADO_DO_GRUPO[x.grupo], grupo: x.grupo, dia: d ? d.getDate() : null, data: d ? ymd(d) : '', prazo: prazoTexto(x.t, hoje) }; });
    let cheiaAte = -1; while (cheiaAte + 1 < etapas.length && etapas[cheiaAte + 1].estado === 'feita') cheiaAte++;
    const feitas = etapas.filter(e => e.estado === 'feita').length;
    return { etapas, cheiaAte, feitas, total: etapas.length, proxima: etapas.findIndex(e => e.estado !== 'feita'), pct: etapas.length ? Math.round(feitas / etapas.length * 100) : 0 };
  }
  const ESCRITORIO_PROPRIO = [/\b(controltax|dynexa|diskcontador)\b/, /\boficina business\b/, /^oficina\s*(\||\d|$)/];     // o mesmo do core.js
  const ehEscritorioProprio = n => { const t = semAcento(n).trim(); return !!t && ESCRITORIO_PROPRIO.some(r => r.test(t)); };
  const SITUACOES_CONHECIDAS = new Set(['OPEN', 'IMPEDIMENT', 'DONE', 'IGNORED', 'DISCONSIDERED']);
  // Fechamento do mês: total, por setor, por analista e por empresa (com a trilha). Empresas do escritório ficam fora.
  function fechamento(tarefas, hoje) {
    const novo = nome => ({ nome, total: 0, feitas: 0, abertas: 0, multa: 0, atrasada: 0, impedimento: 0, hoje: 0 });
    const soma = (o, g) => { o.total++; if (g === 'feita') o.feitas++; else { o.abertas++; if (o[g] != null) o[g]++; } };
    const tot = novo('Todas'), setores = new Map(), analistas = new Map(), empresas = new Map();
    let desconhecidas = 0, escritorio = 0;
    for (const t of tarefas || []) {
      if (!SITUACOES_CONHECIDAS.has(String(t.status || ''))) desconhecidas++;
      const g = grupoTarefa(t, hoje); if (!g) continue;
      const c = t.customer || {};
      if (ehEscritorioProprio(c.name)) { escritorio++; continue; }
      soma(tot, g);
      const st = setorDe(t) || 'Sem setor', rs = respDe(t) || 'Sem responsável';
      if (!setores.has(st)) setores.set(st, novo(st)); soma(setores.get(st), g);
      if (!analistas.has(rs)) analistas.set(rs, novo(rs)); soma(analistas.get(rs), g);
      const k = c._id || c.code || c.cnpj || c.name || '?';
      let e = empresas.get(k);
      if (!e) { e = Object.assign(novo(String(c.name || 'Sem cliente')), { id: k, codigo: c.code || '', cnpj: c.cnpj || '', porSetor: new Map(), tarefas: [] }); empresas.set(k, e); }
      soma(e, g); e.tarefas.push(t);
      if (!e.porSetor.has(st)) e.porSetor.set(st, { nome: st, total: 0, feitas: 0 });
      const ps = e.porSetor.get(st); ps.total++; if (g === 'feita') ps.feitas++;
    }
    const pct = o => Object.assign(o, { pct: o.total ? Math.round(o.feitas / o.total * 100) : 0 });
    const porPct = (a, b) => a.pct - b.pct || b.abertas - a.abertas || a.nome.localeCompare(b.nome, 'pt-BR');
    const lista = [...empresas.values()].map(e => { pct(e); e.fechada = e.total > 0 && e.feitas === e.total; e.setores = [...e.porSetor.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')); delete e.porSetor; return e; })
      .sort((a, b) => (a.fechada ? 1 : 0) - (b.fechada ? 1 : 0) || (b.multa - a.multa) || (b.atrasada - a.atrasada) || (b.impedimento - a.impedimento) || a.pct - b.pct || a.nome.localeCompare(b.nome, 'pt-BR'));
    return { total: pct(tot), setores: [...setores.values()].map(pct).sort(porPct), analistas: [...analistas.values()].map(pct).sort(porPct), empresas: lista,
      fechadas: lista.filter(e => e.fechada).length, desconhecidas, escritorio };
  }
  // A tarefa no Gestta (só navegação; nada é feito nela)
  const urlTarefa = id => /^[0-9a-f]{24}$/i.test(String(id || '')) ? APP + '/#/sidebar/task/overview/dashboard/' + id : null;
  /* ---------- 0.77.0: linha do tempo da tarefa, quadro de obrigações, Meu dia e ordem das empresas ---------- */
  // Um evento do histórico em palavras. tom: ok (andou), alerta (algo não saiu), cliente (o cliente fez), neutro.
  const MOTIVO_DOC = { NO_FOLDER_CONFIGURED: 'a pasta do portal não está configurada', NOT_SENT_NO_CUSTOMER_ACCOUNTABLE: 'o cliente não tem usuário neste setor' };
  const EVENTO = {
    TASK: { DONE: ['Concluiu a tarefa', 'ok'], IMPEDIMENT: ['Marcou impedimento', 'alerta'], DISCONSIDERED: ['Desconsiderou a tarefa', 'neutro'], TRANSFER_OWNERSHIP: ['Transferiu a tarefa', 'neutro'], OPEN: ['Reabriu a tarefa', 'neutro'] },
    STEP: { DONE: ['Concluiu uma etapa', 'ok'], OPEN: ['Reabriu uma etapa', 'neutro'] },
    DOCUMENT: { SENT_TO_PORTAL: ['Documento enviado ao portal', 'ok'], NOT_SENT_TO_PORTAL: ['Documento não foi ao portal', 'alerta'], DOWNLOADED: ['O cliente baixou o documento', 'cliente'], VIEWED: ['O cliente viu o documento', 'cliente'], ADDED: ['Documento anexado', 'neutro'], ADD: ['Documento anexado', 'neutro'] },
    REQUESTED_DOCUMENT: { _: ['Documento pedido ao cliente', 'neutro'], DONE: ['O cliente mandou o documento pedido', 'cliente'], SENT: ['Pedido de documento enviado ao cliente', 'neutro'] },
    EMAIL: { SENT: ['E-mail enviado ao cliente', 'ok'], DELIVERY: ['E-mail entregue ao cliente', 'ok'], NOT_SENT: ['E-mail ao cliente não saiu', 'alerta'] },
    WHATSAPP: { _: ['Mensagem de WhatsApp', 'neutro'] },
    COMMENT: { _: ['Comentário', 'neutro'] },
    AUTOMATION: { _: ['Automação do Gestta', 'neutro'] },
    TASK_BATCH: { _: ['Alteração em lote', 'neutro'] },
    OUTCOMING_CALL: { _: ['Ligação', 'neutro'] },
    PROCESS: { _: ['Processo', 'neutro'] },
    MESSENGER: { _: ['Mensageiro', 'neutro'] }
  };
  function eventosDaTarefa(itens) {
    return (itens || []).filter(x => x && x.type !== 'TIMESHEET').map(x => {
      const tab = EVENTO[x.type], r = tab ? (tab[x.status] || tab._) : null;
      const rot = r ? r[0] : 'Evento do Gestta (' + String(x.type || '?').toLowerCase() + (x.status ? ', ' + String(x.status).toLowerCase() : '') + ')';
      const doc = (x.company_document && x.company_document.name) || x.file_name || '';
      const quem = (x.accomplished_by_customer_user && x.accomplished_by_customer_user.name) ? { nome: x.accomplished_by_customer_user.name, cliente: true } : (x.accomplished_by && x.accomplished_by.name) ? { nome: x.accomplished_by.name, cliente: false } : null;
      return { quando: x.accomplished_at || x.created_at || '', tipo: x.type || '', rot, tom: r ? r[1] : 'neutro', doc: String(doc || ''), motivo: MOTIVO_DOC[x.reason] || '', quem,
        texto: typeof x.comment === 'string' ? x.comment : '', auto: !!x.is_auto_respond, desconhecido: !r };
    }).sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
  }
  // Quadro de obrigações: empresas nas linhas e as tarefas do mês (pelo nome) nas colunas, das que mais se repetem às que menos.
  const nomeObrigacao = n => String(n || 'Sem nome').replace(/\s+/g, ' ').trim().toUpperCase();
  function obrigacoes(tarefas, hoje) {
    const cols = new Map(), emps = porEmpresa(tarefas, hoje);
    for (const t of tarefas || []) {
      const g = grupoTarefa(t, hoje); if (!g) continue;
      const k = nomeObrigacao(t.name);
      if (!cols.has(k)) cols.set(k, { nome: k, total: 0, feitas: 0, alerta: 0 });
      const c = cols.get(k); c.total++; if (g === 'feita') c.feitas++; else if (g === 'multa' || g === 'atrasada') c.alerta++;
    }
    const colunas = [...cols.values()].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'));
    const linhas = emps.map(e => {
      const cel = new Map();
      trilhaDaEmpresa(e.tarefas, hoje).etapas.forEach(x => { const k = nomeObrigacao(x.t.name); if (!cel.has(k)) cel.set(k, []); cel.get(k).push(x); });
      return { empresa: e, celulas: cel };
    });
    return { colunas, linhas };
  }
  // Meu dia: o que resolver agora (multa e atraso), o que está parado, o que vence hoje e os próximos dias úteis.
  function meuDia(tarefas, hoje, diasProximos) {
    const h = diaLocal(hoje || new Date()), n = diasProximos || 3, out = { agora: [], impedimento: [], hoje: [], proximos: [], adiante: [], feitasHoje: 0, totalHoje: 0 };
    for (const t of tarefas || []) {
      const g = grupoTarefa(t, h); if (!g) continue;
      const d = diaLocal(t.due_date), ehHoje = d && +d === +h;
      if (ehHoje) { out.totalHoje++; if (g === 'feita') out.feitasHoje++; }
      if (g === 'multa' || g === 'atrasada') out.agora.push(t);
      else if (g === 'impedimento') out.impedimento.push(t);
      else if (g === 'hoje') out.hoje.push(t);
      else if (g !== 'feita' && d && diasUteis(h, d) <= n) out.proximos.push(t);
      else if (g !== 'feita' && d && d > h) out.adiante.push(t);
    }
    const porMeta = (a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')) || String((a.customer || {}).name || '').localeCompare(String((b.customer || {}).name || ''), 'pt-BR');
    out.agora.sort((a, b) => (b.fine ? 1 : 0) - (a.fine ? 1 : 0) || porMeta(a, b)); out.impedimento.sort(porMeta); out.hoje.sort(porMeta); out.proximos.sort(porMeta);
    // 0.87.0: as próximas depois dos 3 dias úteis (até 6), para o dia livre não ficar vazio
    out.adiante = out.adiante.sort(porMeta).slice(0, 6);
    out.fila = out.agora.concat(out.hoje, out.impedimento, out.proximos);
    return out;
  }
  // Ordem das empresas: risco (o que pesa primeiro, como porEmpresa), progresso (menos concluída primeiro), próxima meta ou nome.
  const ORDENS_EMPRESA = { risco: 'Risco', progresso: 'Progresso', proxima: 'Próxima meta', nome: 'Nome' };
  function ordenarEmpresas(emps, criterio) {
    const l = (emps || []).slice();
    if (criterio === 'progresso') return l.sort((a, b) => (a.pctFeitas - b.pctFeitas) || (b.abertas - a.abertas) || a.nome.localeCompare(b.nome, 'pt-BR'));
    if (criterio === 'proxima') return l.sort((a, b) => String(a.proxima || '9').localeCompare(String(b.proxima || '9')) || a.nome.localeCompare(b.nome, 'pt-BR'));
    if (criterio === 'nome') return l.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return l;
  }
  /* ---------- 0.79.0: o Gestta no Control Hub (item 3 da Fase 1, aprovado pelo Josué em 05/11/2026) ----------
   * Conjuntos (fonte "gestta" no Hub, mesmo protocolo em partes do Onvio): tarefas do mês atual e do anterior (relatório
   * CUSTOMER_TASK), clientes, equipe, setores, alertas (envios ao Onvio com erro e templates sem pasta no portal) e a cartela
   * (quem atende cada setor de cada cliente, uma leitura por cliente, no máximo 1 vez por dia). Só com acesso total (a
   * coordenação), sem as empresas do escritório e sem valor, mensalidade, pontuação, telefone, e-mail ou senhas. Tudo é lido
   * na hora e vai direto ao Hub: nada fica na extensão. */
  const HUB_GESTTA = [
    { id: 'tarefas', nome: 'Tarefas do mês', ajuda: 'Todas as tarefas do mês atual e do anterior: empresa, CNPJ, código, tarefa, setor, responsável, meta, data legal, conclusão, quem concluiu, multa e atraso. Sem valor nem pontuação.', padrao: true },
    { id: 'clientes', nome: 'Clientes', ajuda: 'Os clientes ativos: código, nome, nome fantasia, CNPJ, regime, inscrição estadual, UF, cidade e se usam o portal do Onvio. Sem mensalidade.', padrao: true },
    { id: 'equipe', nome: 'Equipe e setores', ajuda: 'Os funcionários do escritório (nome, papel, ativo e setores) e os setores. Sem e-mail, telefone, permissões nem último login.', padrao: true },
    { id: 'alertas', nome: 'Alertas', ajuda: 'Os envios de documento ao Onvio que deram erro (empresa, tarefa e motivo) e os templates de documento sem pasta no portal.', padrao: true },
    { id: 'cartela', nome: 'Cartela (1 vez por dia)', ajuda: 'Quem atende cada setor de cada cliente, como está no Gestta. Uma leitura por cliente (uns 10 minutos), no máximo uma vez por dia.', padrao: true }
  ];
  const HUB_GESTTA_PARTE = 140000, HUB_GESTTA_PARTES_MAX = 80;
  const celula = (v, max) => String(v == null ? '' : v).replace(/[\t\r\n\u2028\u2029]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, max || 300);
  const simNao = v => v === '' || v == null ? '' : sim(v) ? 'sim' : 'não';
  const dataHub = v => { const t = String(v == null ? '' : v); return /^\d{4}-\d{2}-\d{2}T/.test(t) ? t.slice(0, 16).replace('T', ' ') : /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : t; };
  function partirLinhas(linhas) {
    const partes = []; let atual = [], n = 0;
    for (const l of linhas) {
      const t = l.length > HUB_GESTTA_PARTE ? l.slice(0, HUB_GESTTA_PARTE) : l;
      if (n + t.length + 1 > HUB_GESTTA_PARTE && atual.length) { partes.push(atual.join('\n')); atual = []; n = 0; }
      atual.push(t); n += t.length + 1;
    }
    if (atual.length || !partes.length) partes.push(atual.join('\n'));
    const cortado = partes.length > HUB_GESTTA_PARTES_MAX;
    const ficam = partes.slice(0, HUB_GESTTA_PARTES_MAX);
    return { partes: ficam, cortado, nLinhasTotal: ficam.reduce((s, p) => s + (p ? p.split('\n').length : 0), 0) };
  }
  const linhaTab = vals => vals.map(v => celula(v)).join('\t');
  // Tarefas: as colunas do relatório (sem valor, pontuação, mensalidade e grupos) com nomes em português e o mês de referência
  const ROT_REL = { id: 'Id', name: 'Tarefa', type: 'Tipo', subtype: 'Subtipo', status: 'Situação', 'company_department.name': 'Setor', 'owner.name': 'Responsável', 'owner.role': 'Papel do responsável',
    notify_customer: 'Avisa o cliente', fine: 'Gerando multa', _due_date: 'Meta', legal_date: 'Data legal', downloaded: 'Baixada', done_overdue: 'Concluída com atraso', done_fine: 'Concluída com multa',
    created_at: 'Criada em', 'concluded_by.name': 'Concluída por', conclusion_date: 'Concluída em', overdue: 'Atrasada', on_time: 'No prazo', 'customer.active': 'Cliente ativo',
    'customer.cnpj': 'CNPJ', 'customer.name': 'Cliente', 'customer.code': 'Código do cliente', 'customer.federal_regime.name': 'Regime' };
  // 0.86.0: a Competência (AAAA-MM) vai no fim, pela busca de tarefas cruzada pelo id (o relatório não a traz)
  const COLS_TAREFAS_HUB = ['Mês'].concat(COLUNAS_RELATORIO.filter(c => ROT_REL[c]).map(c => ROT_REL[c]), ['Competência']);
  const BOOL_REL = new Set(['notify_customer', 'fine', 'downloaded', 'done_overdue', 'done_fine', 'overdue', 'on_time', 'customer.active']);
  const DATA_REL = new Set(['_due_date', 'legal_date', 'created_at', 'conclusion_date']);
  // comp: Map id → competência; so: só as tarefas desse Map (meses de meta além do atual e do anterior)
  function tabelaTarefasHub(rel, mesRef, comp, so) {
    const cols = rel.colunas || [], iNome = cols.indexOf('customer.name'), iId = cols.indexOf('id'), out = [];
    let escritorio = 0;
    for (const l of rel.linhas || []) {
      const id = iId >= 0 ? String(l[iId] || '') : '';
      if (so && !(comp && comp.has(id))) continue;
      if (iNome >= 0 && ehEscritorioProprio(l[iNome])) { escritorio++; continue; }
      const val = c => { const i = cols.indexOf(c); if (i < 0) return ''; const v = l[i]; return BOOL_REL.has(c) ? simNao(v) : DATA_REL.has(c) ? dataHub(v) : c === 'type' ? (TIPOS_TAREFA[v] || v) : c === 'status' ? (SITUACOES_TAREFA[v] || v) : v; };
      out.push(linhaTab([mesRef].concat(COLUNAS_RELATORIO.filter(c => ROT_REL[c]).map(val), [(comp && comp.get(id)) || ''])));
    }
    return { linhas: out, escritorio };
  }
  const COLS_CLIENTES_HUB = ['Id', 'Código', 'Nome', 'Nome fantasia', 'CNPJ', 'Ativo', 'Regime', 'Inscrição estadual', 'UF', 'Cidade', 'Id externo', 'Usa o portal do Onvio'];
  const linhaCliente = c => linhaTab([c._id, c.code, c.name, c.trading_name, c.cnpj, simNao(c.active), c.federal_regime && c.federal_regime.name, c.state_inscription, c.federative_unit, c.city, c.external_id, simNao(c.partner_config && c.partner_config.has_onvio_portal)]);
  const COLS_EQUIPE_HUB = ['Id', 'Nome', 'Papel', 'Ativo', 'Setores', 'Tem tarefas atreladas'];
  const linhaEquipe = u => linhaTab([u._id, u.name, PAPEIS[u.role] || u.role, simNao(u.active), (u.company_departments || []).map(x => x && x.name).filter(Boolean).join(' | '), simNao(u.has_linked_tasks)]);
  const COLS_SETORES_HUB = ['Id', 'Setor'];
  const COLS_ENVIOS_HUB = ['Id', 'Situação', 'Erro', 'Tentativas', 'Criado em', 'Atualizado em', 'Tarefa', 'Id da tarefa', 'Cliente', 'CNPJ', 'Setor', 'Responsável', 'Meta', 'Competência', 'Documento'];
  const linhaEnvio = x => { const t = x.customer_task || {}, c = t.customer || {}; return linhaTab([x._id, x.status, x.error, x.retry_count, dataHub(x.created_at), dataHub(x.updated_at), t.name, t._id, c.name, c.cnpj, t.company_department && t.company_department.name, t.owner && t.owner.name, dataHub(t._due_date), dataHub(t._competence_date), x.customer_task_file && x.customer_task_file.company_document && x.customer_task_file.company_document.name]); };
  const COLS_TEMPLATES_HUB = ['Id', 'Template', 'Tipo de automação', 'Válido', 'Dispensado'];
  const semPasta = t => !(t && t.documents_integration && Array.isArray(t.documents_integration.pathName) && t.documents_integration.pathName.filter(Boolean).length);
  const COLS_CARTELA_HUB = ['Id do cliente', 'Código do cliente', 'Cliente', 'CNPJ', 'Setor', 'Id do setor', 'Responsável', 'Id do responsável'];
  // Empresas com tarefa no mês atual ou no anterior (aberta ou concluída): a referência do Hub para dizer quem está em atividade
  // (Josué, 06/11/2026: "a empresa só deve ser considerada nos módulos se possuir tarefa ativa no Gestta"). Só CNPJ, nome e contagens.
  const COLS_ATIVAS_HUB = ['CNPJ', 'Cliente', 'Tarefas', 'Último mês'];
  function empresasAtivasHub(rels) {
    const m = new Map();
    for (const { rel, mes } of rels) {
      const cols = rel.colunas || [], iC = cols.indexOf('customer.cnpj'), iN = cols.indexOf('customer.name');
      if (iC < 0) continue;
      for (const l of rel.linhas || []) {
        const dig = String(l[iC] || '').replace(/\D/g, ''), nome = iN >= 0 ? String(l[iN] || '').trim() : '';
        const cnpj = dig.length === 14 || dig.length === 11 ? dig : '';
        if (ehEscritorioProprio(nome) || (!cnpj && !nome)) continue;
        // 0.82.0: cliente sem CNPJ no Gestta (CPF, empregador doméstico) também vai, pelo nome; antes era descartado e a empresa sumia do Hub
        const chave = cnpj || 'n:' + nome.toUpperCase();
        const x = m.get(chave) || { cnpj, nome, n: 0, mes: '' }; x.n++; if (mes > x.mes) x.mes = mes; if (!x.nome) x.nome = nome; m.set(chave, x);
      }
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, x]) => linhaTab([x.cnpj, x.nome, x.n, x.mes]));
  }
  // 0.84.0: reenviar só o que deu erro. Qual categoria do envio refaz cada conjunto (a lista das ativas sai da etapa das tarefas).
  const CAT_DO_CONJUNTO = { 'gestta-tarefas': 'tarefas', 'gestta-empresas-ativas': 'tarefas', 'gestta-clientes': 'clientes', 'gestta-equipe': 'equipe', 'gestta-setores': 'equipe',
    'gestta-envios-onvio-erro': 'alertas', 'gestta-templates-sem-pasta': 'alertas', 'gestta-cartela': 'cartela' };
  const catDoConjunto = id => CAT_DO_CONJUNTO[String(id || '')] || '';
  const paraReenviar = hubSync => (!hubSync || hubSync.estado === 'enviando') ? [] : [...new Set((hubSync.resultados || []).filter(r => !r.ok).map(r => catDoConjunto(r.id)).filter(Boolean))];
  // 0.85.0 (Josué, 06/11/2026: "as tarefas devem ser agrupadas por competência e não por data de vencimento").
  // A competência de uma tarefa é o mês de competence_date (gravada no 1º dia do mês; meio-dia em UTC evita trocar de mês
  // pelo fuso) e, sem ela, o mês da meta. A busca tenta date_type COMPETENCE_DATE; se o Gestta recusar ou ignorar
  // (veio tarefa de outra competência), a tela lê as metas da competência e dos 3 meses seguintes e separa aqui.
  const mesUtc = d => { const t = new Date(d).getTime(); if (!isFinite(t)) return ''; const x = new Date(t + 12 * 3600e3); return x.getUTCFullYear() + '-' + p2(x.getUTCMonth() + 1); };
  const mesLocal = d => { const x = diaLocal(d); return x ? x.getFullYear() + '-' + p2(x.getMonth() + 1) : ''; };
  const competenciaDe = t => (t && t.competence_date ? mesUtc(t.competence_date) : '') || mesLocal(t && t.due_date);
  const daCompetencia = (itens, ano, mes) => { const k = mesTexto(ano, mes); return (itens || []).filter(t => t && competenciaDe(t) === k); };
  const buscaPorCompetenciaValeu = (itens, ano, mes) => (itens || []).every(t => !t || competenciaDe(t) === mesTexto(ano, mes));
  const competenciaPadrao = hoje => { const h = hoje || new Date(); return mesAnterior(h.getFullYear(), h.getMonth() + 1); };
  const mesSeguinte = (ano, mes) => mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
  // os meses de meta a ler quando a busca por competência não serve: a própria competência e os 3 seguintes
  const mesesDaCompetencia = (ano, mes) => { const l = [{ ano, mes }]; for (let i = 0; i < 3; i++) l.push(mesSeguinte(l[l.length - 1].ano, l[l.length - 1].mes)); return l; };
  // o mês em que mais tarefas da competência vencem (para a grade do calendário e da linha do tempo), e os outros, em ordem
  function mesesDeMeta(itens) {
    const n = new Map(); (itens || []).forEach(t => { const k = mesLocal(t && t.due_date); if (k) n.set(k, (n.get(k) || 0) + 1); });
    return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, q]) => ({ ano: Number(k.slice(0, 4)), mes: Number(k.slice(5, 7)), n: q }));
  }
  // 0.87.0 (Josué, 09/11/2026: melhorias de leitura): nomes que vêm todos em CAIXA ALTA do Gestta viram "Primeira maiúscula",
  // com as siglas conhecidas mantidas (DCTF, ICMS, FGTS…) e os conectores em minúscula. Nome já escrito em caixa mista fica como está.
  const SIGLAS = { dctf: 'DCTF', dctfweb: 'DCTFWeb', icms: 'ICMS', ipi: 'IPI', iss: 'ISS', issqn: 'ISSQN', fgts: 'FGTS', inss: 'INSS', irpj: 'IRPJ', irpf: 'IRPF', irrf: 'IRRF', csll: 'CSLL', pis: 'PIS',
    cofins: 'COFINS', efd: 'EFD', ecd: 'ECD', ecf: 'ECF', defis: 'DEFIS', pgdas: 'PGDAS', 'pgdas-d': 'PGDAS-D', das: 'DAS', mei: 'MEI', cnd: 'CND', 'nf-e': 'NF-e', nfe: 'NF-e', 'nfs-e': 'NFS-e', nfse: 'NFS-e',
    sped: 'SPED', gps: 'GPS', darf: 'DARF', rais: 'RAIS', dirf: 'DIRF', caged: 'CAGED', esocial: 'eSocial', reinf: 'Reinf', 'efd-reinf': 'EFD-Reinf', destda: 'DeSTDA', gia: 'GIA', dime: 'DIME', dmed: 'DMED',
    dimob: 'DIMOB', dapi: 'DAPI', dasn: 'DASN', 'dasn-simei': 'DASN-SIMEI', simei: 'SIMEI', itr: 'ITR', ir: 'IR', cnpj: 'CNPJ', cpf: 'CPF', rh: 'RH', dp: 'DP', ti: 'TI', os: 'OS', me: 'ME', epp: 'EPP', ltda: 'Ltda',
    eireli: 'Eireli', sa: 'S.A.', 's/a': 'S/A', 's.a.': 'S.A.', ss: 'SS', cat: 'CAT', aso: 'ASO', pcmso: 'PCMSO', pgr: 'PGR', ppp: 'PPP', grrf: 'GRRF', fap: 'FAP', rat: 'RAT', difal: 'DIFAL', st: 'ST', ctps: 'CTPS', tce: 'TCE' };
  const MINUSC = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'com', 'por', 'na', 'no', 'nas', 'nos', 'a', 'o', 'as', 'os', 'ao', 'aos', 'à', 'às']);
  function nomeLegivel(v) {
    const s = String(v == null ? '' : v);
    const letras = s.replace(/[^A-Za-zÀ-ÿ]/g, ''); if (letras.length < 3) return s;
    const maius = letras.replace(/[^A-ZÀ-Þ]/g, '').length;
    if (maius / letras.length < 0.85) return s;          // já está em caixa mista: respeita como veio
    let i = 0;
    return s.replace(/[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9./-]*/g, w => {
      const n = w.toLowerCase(), primeira = i++ === 0, limpo = n.replace(/[.,;:]+$/, ''), fim = n.slice(limpo.length);
      if (SIGLAS[limpo]) return SIGLAS[limpo] + fim;
      if (/\d/.test(w)) return w;                          // códigos, anos, "13º"
      if (!primeira && MINUSC.has(limpo)) return n;
      if (/-/.test(limpo)) return limpo.split('-').map(p => SIGLAS[p] || (p ? p[0].toUpperCase() + p.slice(1) : p)).join('-') + fim;
      return n[0].toUpperCase() + n.slice(1);
    });
  }
  let modoCompBusca = '';
  const mesAnterior = (ano, mes) => mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
  const mesTexto = (ano, mes) => ano + '-' + String(mes).padStart(2, '0');
  // Lê e entrega cada conjunto. ler(pedidos) → resultados (o mesmo de lerNaPagina, feito pelo service worker na aba do Gestta);
  // enviar(conjunto, partes) → { ok, motivo, parar }; progresso({ etapa, feito, total }). ctx: { hoje, cartela (ler a cartela
  // nesta rodada), cancelado(), andamento(texto) }.
  async function hubExecutarGestta(ler, cats, ctx, enviar, progresso) {
    ctx = ctx || {}; const hoje = ctx.hoje || new Date();
    const res = [], quer = k => (cats || []).includes(k);
    const etapas = [quer('tarefas') && 'tarefas', quer('clientes') || quer('tarefas') || (quer('cartela') && ctx.cartela) ? 'clientes' : null, quer('equipe') && 'equipe', quer('alertas') && 'alertas', quer('cartela') && ctx.cartela && 'cartela'].filter(Boolean);
    let feito = 0, parar = false, clientes = null;
    const prog = rot => progresso && progresso({ etapa: rot, feito, total: etapas.length });
    const um = async (pedido) => { const r = await ler([pedido]); const x = r && r[0]; if (!x) throw new Error('a aba do Gestta não respondeu'); if (x.status !== 200 || !x.dados) { const e = new Error(x.status === 403 ? 'seu acesso não inclui esta leitura (403)' : x.status === 401 ? 'a sessão do Gestta acabou' : (x.erro || x.recusado || ('HTTP ' + x.status))); e.status = x.status; throw e; } return x.dados; };
    const paginar = async (fazer, max) => { const itens = []; let total; for (let p = 1; p <= max; p++) { if (ctx.cancelado && ctx.cancelado()) break; const d = await fazer(p); itens.push(...(d.itens || [])); if (total == null) total = d.total; if (!d.paginas || p >= d.paginas || !(d.itens || []).length) return { itens, total, cortado: false }; } return { itens, total, cortado: !!(total && itens.length < total) }; };
    const entregar = async (conj, linhas, extra) => {
      const p = partirLinhas(linhas);
      const r = await enviar(conj, p);
      const item = Object.assign({ id: conj.tipoDado, rotulo: conj.titulo, categoria: conj.categoria, ok: !!r.ok, motivo: r.ok ? (r.motivo || '') : (r.motivo || 'erro'), linhas: linhas.length, partes: p.partes.length, cortado: p.cortado || !!(extra && extra.cortado), porque: extra && extra.porque || '' }, r.ok && r.motivo === 'sem-mudanca' ? { nota: true } : {});
      res.push(item); if (r.parar) parar = true; return item;
    };
    // o relatório de um mês, tentando os valores de período só quando o Gestta responde 400
    const lerRelatorio = async (m) => {
      let ultimo = null;
      for (const f of filtrosRelatorio(m, hoje)) {
        try { const r = await um(PEDIDOS.relatorio(Object.assign({}, m, { filtro: f }))); lembrarFiltroRel(f); return r; }
        catch (e) { if (e && e.status === 400) { ultimo = e; continue; } throw e; }
      }
      const e = new Error('o Gestta recusou o relatório de tarefas (erro 400' + (ultimo && ultimo.message && !/^erro 400$/.test(ultimo.message) ? ': ' + ultimo.message : '') + ')'); e.status = 400; throw e;
    };
    // 0.86.0: as tarefas de uma competência, do escritório todo (busca COMPETENCE_DATE conferida; senão, as metas da competência e
    // dos 3 meses seguintes separadas pela competence_date). O jeito que deu certo fica em modoCompBusca (memória).
    const tarefasDaComp = async (c) => {
      const buscar = (o) => paginar(p => { ctx.andamento && ctx.andamento('competência ' + mesTexto(c.ano, c.mes) + ', página ' + p); return um(PEDIDOS.buscaTarefas(Object.assign({ page: p, limit: LIMITE_BUSCA, status: ['OPEN', 'IMPEDIMENT', 'DONE'] }, o))); }, MAX_PAGINAS_TAREFAS);
      if (modoCompBusca !== 'meta') {
        try { const d = await buscar({ ano: c.ano, mes: c.mes, dataTipo: 'COMPETENCE_DATE' }); if (buscaPorCompetenciaValeu(d.itens, c.ano, c.mes)) { modoCompBusca = 'direto'; return d; } }
        catch (e) { if (e && e.status === 401) throw e; }
        modoCompBusca = 'meta';
      }
      const vistos = new Map(); let cortado = false;
      for (const m of mesesDaCompetencia(c.ano, c.mes)) { const d = await buscar({ ano: m.ano, mes: m.mes }); if (d.cortado) cortado = true; daCompetencia(d.itens, c.ano, c.mes).forEach(t => { if (t && t._id) vistos.set(t._id, t); }); }
      return { itens: [...vistos.values()], cortado };
    };
    let ativasPendente = false;
    const falhou = (tipoDado, titulo, categoria, e) => { res.push({ id: tipoDado, rotulo: titulo, categoria, ok: false, motivo: String((e && e.message) || e).slice(0, 160) }); if (e && e.status === 401) parar = true; };
    for (const etapa of etapas) {
      if (parar || (ctx.cancelado && ctx.cancelado())) break;
      if (etapa === 'tarefas') {
        prog('Tarefas do mês');
        const atual = { ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 }, ant = mesAnterior(atual.ano, atual.mes), linhas = [];
        let escritorio = 0, total = 0, formatos = [];
        const rels = [], avisos = [];
        try {
          // a competência de cada tarefa: as competências do mês atual, do anterior e de dois meses atrás (as que estão sendo fechadas)
          const comp = new Map(), extras = new Map(), base = new Set([mesTexto(ant.ano, ant.mes), mesTexto(atual.ano, atual.mes)]);
          let compCortado = false;
          try {
            for (const c of [mesAnterior(ant.ano, ant.mes), ant, atual]) {
              const d = await tarefasDaComp(c); if (d.cortado) compCortado = true;
              d.itens.forEach(t => { if (!t || !t._id) return; comp.set(String(t._id), mesTexto(c.ano, c.mes)); const m = mesLocal(t.due_date); if (m && !base.has(m)) extras.set(m, (extras.get(m) || 0) + 1); });
            }
          } catch (e) { if (e && e.status === 401) throw e; avisos.push('a competência não pôde ser lida (' + String((e && e.message) || e).slice(0, 80) + ')'); }
          if (compCortado) avisos.push('a busca da competência passou do limite de páginas');
          for (const m of [ant, atual]) {
            ctx.andamento && ctx.andamento('relatório de ' + mesTexto(m.ano, m.mes));
            const rel = await lerRelatorio(m);
            const t = tabelaTarefasHub(rel, mesTexto(m.ano, m.mes), comp); linhas.push(...t.linhas); escritorio += t.escritorio; total += rel.total || 0; formatos.push(rel.formato);
            rels.push({ rel, mes: mesTexto(m.ano, m.mes) });
          }
          // tarefas das competências que vencem em outros meses (ex.: anuais, ou metas no mês seguinte): só elas, do relatório desses meses
          for (const k of [...extras.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(x => x[0])) {
            const m = { ano: Number(k.slice(0, 4)), mes: Number(k.slice(5, 7)) };
            try { ctx.andamento && ctx.andamento('relatório de ' + k); const rel = await lerRelatorio(m); const t = tabelaTarefasHub(rel, k, comp, true); linhas.push(...t.linhas); escritorio += t.escritorio; }
            catch (e) { if (e && e.status === 401) throw e; avisos.push('o relatório de ' + k + ' não veio'); }
          }
          await entregar({ tipoDado: 'gestta-tarefas', categoria: 'tarefas', titulo: 'Gestta · Tarefas do mês atual e do anterior (com a competência)', colunas: COLS_TAREFAS_HUB, totalNaOrigem: total - escritorio }, linhas, { porque: [escritorio ? escritorio + ' tarefas de empresas do escritório ficaram fora' : ''].concat(avisos).filter(Boolean).join('; '), cortado: compCortado });
          if (!parar) { const at = empresasAtivasHub(rels); await entregar({ tipoDado: 'gestta-empresas-ativas', categoria: 'cadastros', titulo: 'Gestta · Empresas em atividade (tarefa no mês atual ou anterior)', colunas: COLS_ATIVAS_HUB, totalNaOrigem: at.length }, at); }
        } catch (e) { falhou('gestta-tarefas', 'Gestta · Tarefas do mês atual e do anterior', 'tarefas', e); if (!parar) ativasPendente = true; }
      }
      if (etapa === 'clientes') {
        prog('Clientes');
        try {
          const r = await paginar(p => { ctx.andamento && ctx.andamento('clientes, página ' + p); return um(PEDIDOS.clientes({ limit: 200, page: p })); }, 40);
          clientes = r.itens.filter(c => c && c._id && !ehEscritorioProprio(c.name));
          if (quer('clientes')) await entregar({ tipoDado: 'gestta-clientes', categoria: 'cadastros', titulo: 'Gestta · Clientes ativos', colunas: COLS_CLIENTES_HUB, totalNaOrigem: r.total }, clientes.map(linhaCliente), { cortado: r.cortado, porque: r.cortado ? 'a lista passou do limite de páginas' : '' });
        } catch (e) { if (quer('clientes')) falhou('gestta-clientes', 'Gestta · Clientes ativos', 'cadastros', e); }
        // sem o relatório, a lista das empresas em atividade sai da busca de tarefas (abertas, com impedimento e concluídas, um mês por vez)
        if (ativasPendente && clientes && !parar) try {
          const porId = new Map(clientes.map(c => [String(c._id), c])), vistos = new Map(); let cortado = false;
          for (const m of [mesAnterior(hoje.getFullYear(), hoje.getMonth() + 1), { ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 }]) {
            const r = await paginar(p => { ctx.andamento && ctx.andamento('tarefas de ' + mesTexto(m.ano, m.mes) + ', página ' + p); return um(PEDIDOS.buscaTarefas({ ano: m.ano, mes: m.mes, page: p, limit: LIMITE_BUSCA, status: ['OPEN', 'IMPEDIMENT', 'DONE'] })); }, MAX_PAGINAS_TAREFAS);
            if (r.cortado) cortado = true;
            r.itens.forEach(t => { const cu = t && t.customer; if (!cu) return; const c = porId.get(String(cu._id)); const nome = (c && c.name) || cu.name || ''; if (ehEscritorioProprio(nome)) return; const cnpj = String((c && c.cnpj) || '').replace(/\D/g, ''); const k = cnpj.length === 14 || cnpj.length === 11 ? cnpj : 'n:' + String(nome).toUpperCase(); const x = vistos.get(k) || { cnpj: cnpj.length === 14 || cnpj.length === 11 ? cnpj : '', nome, n: 0, mes: '' }; x.n++; const ms = mesTexto(m.ano, m.mes); if (ms > x.mes) x.mes = ms; vistos.set(k, x); });
          }
          const at = [...vistos.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, x]) => linhaTab([x.cnpj, x.nome, x.n, x.mes]));
          await entregar({ tipoDado: 'gestta-empresas-ativas', categoria: 'cadastros', titulo: 'Gestta · Empresas em atividade (pela busca de tarefas)', colunas: COLS_ATIVAS_HUB, totalNaOrigem: at.length }, at, { cortado, porque: cortado ? 'a busca passou do limite de páginas' : '' });
        } catch (e) { falhou('gestta-empresas-ativas', 'Gestta · Empresas em atividade', 'cadastros', e); }
      }
      if (etapa === 'equipe') {
        prog('Equipe e setores');
        try {
          const r = await paginar(p => um(PEDIDOS.equipe({ limit: 200, page: p })), 10);
          await entregar({ tipoDado: 'gestta-equipe', categoria: 'cadastros', titulo: 'Gestta · Equipe do escritório', colunas: COLS_EQUIPE_HUB, totalNaOrigem: r.total }, r.itens.filter(u => u && u._id).map(linhaEquipe), { cortado: r.cortado });
        } catch (e) { falhou('gestta-equipe', 'Gestta · Equipe do escritório', 'cadastros', e); }
        if (!parar) try {
          const d = await um(PEDIDOS.setores());
          await entregar({ tipoDado: 'gestta-setores', categoria: 'cadastros', titulo: 'Gestta · Setores', colunas: COLS_SETORES_HUB, totalNaOrigem: (d.itens || []).length }, (d.itens || []).filter(x => x && x._id).map(x => linhaTab([x._id, x.name])));
        } catch (e) { falhou('gestta-setores', 'Gestta · Setores', 'cadastros', e); }
      }
      if (etapa === 'alertas') {
        prog('Alertas');
        try {
          const itens = []; let total, cortado = false;
          for (let k = 0; k < 20; k++) { const d = await um(PEDIDOS.filaOnvioErro({ limit: 50, skip: k * 50 })); if (total == null) total = d.total; itens.push(...(d.itens || [])); if ((d.itens || []).length < 50) break; if (k === 19) cortado = true; }
          const ok = itens.filter(x => x && !ehEscritorioProprio(x.customer_task && x.customer_task.customer && x.customer_task.customer.name));
          await entregar({ tipoDado: 'gestta-envios-onvio-erro', categoria: 'alertas', titulo: 'Gestta · Envios ao Onvio com erro', colunas: COLS_ENVIOS_HUB, totalNaOrigem: total }, ok.map(linhaEnvio), { cortado });
        } catch (e) { falhou('gestta-envios-onvio-erro', 'Gestta · Envios ao Onvio com erro', 'alertas', e); }
        if (!parar) try {
          const r = await paginar(p => um(PEDIDOS.templatesLista({ limit: 200, page: p })), 20);
          const sem = r.itens.filter(t => t && t._id && semPasta(t));
          await entregar({ tipoDado: 'gestta-templates-sem-pasta', categoria: 'alertas', titulo: 'Gestta · Templates de documento sem pasta no portal', colunas: COLS_TEMPLATES_HUB, totalNaOrigem: r.total }, sem.map(t => linhaTab([t._id, t.name, t.automation_type, simNao(t.valid), simNao(t.bypass)])), { cortado: r.cortado, porque: sem.length + ' de ' + r.itens.length + ' templates sem pasta' });
        } catch (e) { falhou('gestta-templates-sem-pasta', 'Gestta · Templates de documento sem pasta no portal', 'alertas', e); }
      }
      if (etapa === 'cartela') {
        prog('Cartela');
        if (!clientes) { falhou('gestta-cartela', 'Gestta · Cartela por setor', 'cadastros', new Error('sem a lista de clientes')); }
        else try {
          const linhas = [], LOTE = 40; let falhas = 0, lidos = 0;
          for (let i = 0; i < clientes.length && !(ctx.cancelado && ctx.cancelado()); i += LOTE) {
            const fatia = clientes.slice(i, i + LOTE);
            ctx.andamento && ctx.andamento('cartela, cliente ' + Math.min(i + LOTE, clientes.length) + ' de ' + clientes.length);
            const r = await ler(fatia.map(c => Object.assign(PEDIDOS.cartela({ cliente: c._id }), { id: 'cartela:' + c._id })));
            (r || []).forEach((x, k) => {
              const c = fatia[k];
              if (!x || x.status !== 200 || !x.dados) { falhas++; if (x && x.status === 401) { const e = new Error('a sessão do Gestta acabou'); e.status = 401; throw e; } return; }
              lidos++;
              (x.dados.itens || []).forEach(z => { if (z && z.company_department) linhas.push(linhaTab([c._id, c.code, c.name, c.cnpj, z.company_department.name, z.company_department._id, z.company_user && z.company_user.name, z.company_user && z.company_user._id])); });
            });
          }
          const it = await entregar({ tipoDado: 'gestta-cartela', categoria: 'cadastros', titulo: 'Gestta · Cartela por setor', colunas: COLS_CARTELA_HUB, totalNaOrigem: clientes.length }, linhas, { cortado: lidos < clientes.length, porque: lidos < clientes.length ? (clientes.length - lidos) + ' clientes sem leitura' + (falhas ? ' (' + falhas + ' com erro)' : '') : '' });
          it.cartela = it.ok && !it.cortado;
        } catch (e) { falhou('gestta-cartela', 'Gestta · Cartela por setor', 'cadastros', e); }
      }
      feito++; prog('');
    }
    return res;
  }
  const MAX_PAGINAS_TAREFAS = 15;      // 15 × 1000: bem acima do que uma pessoa tem num mês; passou disso, a tela avisa que cortou

  g.OCG = { API, APP, PAUSA_MS, LIMITE_BUSCA, JANELA_MAX_DIAS, POST_LEITURA, RELATORIO_TIPOS, COLUNAS_RELATORIO, MOLDES, APPS,
    caminhoDe, leituraPermitida, appDe, escolher, limpar, limparRelatorio, perfil, expiraEm, janelaDoMes, PEDIDOS, lerNaPagina, linhasDoTeste,
    GRUPOS, TIPOS_TAREFA, SITUACOES_TAREFA, MAX_PAGINAS_TAREFAS, diasUteis, grupoTarefa, prazoTexto, contarGrupos, porEmpresa, porDia, filtrarTarefas, urlTarefa, ymd, diaLocal,
    COLUNAS_FECHAMENTO, linhasDoRelatorio, tarefasDoRelatorio, trilhaDaEmpresa, fechamento, ESTADOS, setorDe, respDe, ehEscritorioProprio,
    eventosDaTarefa, obrigacoes, nomeObrigacao, meuDia, ORDENS_EMPRESA, ordenarEmpresas,
    HUB_GESTTA, hubExecutarGestta, catDoConjunto, paraReenviar, nomeLegivel, competenciaDe, daCompetencia, buscaPorCompetenciaValeu, competenciaPadrao, mesesDaCompetencia, mesesDeMeta, mesTexto, filtrosRelatorio, lembrarFiltroRel, partirLinhas, tabelaTarefasHub, empresasAtivasHub, COLS_TAREFAS_HUB, COLS_CLIENTES_HUB, COLS_CARTELA_HUB, COLS_ATIVAS_HUB };
})(typeof self !== 'undefined' ? self : this);

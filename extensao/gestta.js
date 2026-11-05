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
  const PEDIDOS = {
    me: () => ({ id: 'me', tipo: 'me', metodo: 'GET', url: url('/core/company/user/me') }),
    setores: () => ({ id: 'setores', tipo: 'setor', metodo: 'GET', url: url('/admin/company/department') }),
    equipe: (o) => ({ id: 'equipe', tipo: 'equipe', metodo: 'GET', url: url('/admin/company/user', { active: true, limit: (o && o.limit) || 200, page: (o && o.page) || 1 }) }),
    clientes: (o) => ({ id: 'clientes', tipo: 'cliente', metodo: 'GET', url: url('/admin/customer', { active: true, limit: (o && o.limit) || 200, page: (o && o.page) || 1 }) }),
    cartela: (o) => ({ id: 'cartela', tipo: 'cartela', metodo: 'GET', url: url('/admin/customer/' + encodeURIComponent(o.cliente) + '/responsible') }),
    buscaTarefas: (o) => ({ id: 'buscaTarefas', tipo: 'tarefa', metodo: 'POST', url: url('/core/customer/task/search'),
      corpo: Object.assign({ page: o.page || 1, limit: o.limit || 100, type: o.type || ['RECURRENT', 'SERVICE_ORDER', 'ACCOUNTING'], status: o.status || ['OPEN', 'IMPEDIMENT'], date_type: 'DUE_DATE' }, janelaDoMes(o.ano, o.mes), o.companyUser ? { company_user: [o.companyUser] } : {}, o.semDono ? { no_owner: true } : {}) }),
    tarefa: (o) => ({ id: 'tarefa', tipo: 'tarefaDetalhe', metodo: 'GET', url: url('/core/customer/task/' + encodeURIComponent(o.id)) }),
    historico: (o) => ({ id: 'historico', tipo: 'historico', metodo: 'GET', url: url('/core/customer/task/' + encodeURIComponent(o.id) + '/history', { page: o.page || 1 }) }),
    relatorio: (o) => { const j = janelaDoMes(o.ano, o.mes); return { id: 'relatorio', tipo: 'relatorio', metodo: 'POST', url: url('/core/customer/task/report'), corpo: { type: 'CUSTOMER_TASK', filter: '', dates: { startDate: j.start_date, endDate: j.end_date } } }; },
    fechamento: (o) => Object.assign(PEDIDOS.relatorio(o), { id: 'fechamento', tipo: 'fechamento' }),
    filaOnvioErro: (o) => ({ id: 'filaOnvioErro', tipo: 'filaOnvio', metodo: 'GET', url: url('/es/file/onvio', { status: 'ERROR', limit: (o && o.limit) || 50, skip: 0 }) }),
    multas: (o) => { const j = janelaDoMes(o.ano, o.mes); return { id: 'multas', tipo: 'contagem', metodo: 'GET', url: url('/core/dashboard/attention/fine/all', j) }; },
    templatesDocumento: () => ({ id: 'templatesDocumento', tipo: 'template', metodo: 'GET', url: url('/admin/company/document', { limit: 1, page: 1 }) })
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
    const h = diaLocal(hoje || new Date()), n = diasProximos || 3, out = { agora: [], impedimento: [], hoje: [], proximos: [], feitasHoje: 0, totalHoje: 0 };
    for (const t of tarefas || []) {
      const g = grupoTarefa(t, h); if (!g) continue;
      const d = diaLocal(t.due_date), ehHoje = d && +d === +h;
      if (ehHoje) { out.totalHoje++; if (g === 'feita') out.feitasHoje++; }
      if (g === 'multa' || g === 'atrasada') out.agora.push(t);
      else if (g === 'impedimento') out.impedimento.push(t);
      else if (g === 'hoje') out.hoje.push(t);
      else if (g !== 'feita' && d && diasUteis(h, d) <= n) out.proximos.push(t);
    }
    const porMeta = (a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')) || String((a.customer || {}).name || '').localeCompare(String((b.customer || {}).name || ''), 'pt-BR');
    out.agora.sort((a, b) => (b.fine ? 1 : 0) - (a.fine ? 1 : 0) || porMeta(a, b)); out.impedimento.sort(porMeta); out.hoje.sort(porMeta); out.proximos.sort(porMeta);
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
  const MAX_PAGINAS_TAREFAS = 15;      // 15 × 1000: bem acima do que uma pessoa tem num mês; passou disso, a tela avisa que cortou

  g.OCG = { API, APP, PAUSA_MS, LIMITE_BUSCA, JANELA_MAX_DIAS, POST_LEITURA, RELATORIO_TIPOS, COLUNAS_RELATORIO, MOLDES, APPS,
    caminhoDe, leituraPermitida, appDe, escolher, limpar, limparRelatorio, perfil, expiraEm, janelaDoMes, PEDIDOS, lerNaPagina, linhasDoTeste,
    GRUPOS, TIPOS_TAREFA, SITUACOES_TAREFA, MAX_PAGINAS_TAREFAS, diasUteis, grupoTarefa, prazoTexto, contarGrupos, porEmpresa, porDia, filtrarTarefas, urlTarefa, ymd, diaLocal,
    COLUNAS_FECHAMENTO, linhasDoRelatorio, tarefasDoRelatorio, trilhaDaEmpresa, fechamento, ESTADOS, setorDe, respDe, ehEscritorioProprio,
    eventosDaTarefa, obrigacoes, nomeObrigacao, meuDia, ORDENS_EMPRESA, ordenarEmpresas };
})(typeof self !== 'undefined' ? self : this);

/*
 * Inventário de dados do Onvio (só leitura, sem valores)
 * ------------------------------------------------------
 * Para que serve: descobrir TUDO o que o Onvio entrega a quem está logado (o que a tela mostra e o que só a API traz),
 * para decidir o que a extensão pode extrair. Complementa o capturar-mapa-onvio.js (que registra telas): este registra
 * as fontes de dados.
 *
 * Como usar:
 *   1. Abra o Onvio já logado com o usuário do ESCRITÓRIO (Portal do Cliente: https://onvio.com.br/br-portal-do-cliente/
 *      ou o Onvio Gestão: https://onvio.com.br/staff/). Rode uma vez em cada um (a sessão e o navegador mudam).
 *   2. F12 > Console. Cole este arquivo inteiro e tecle Enter (se o Chrome pedir, digite "allow pasting").
 *   3. Rode:   await __inventarioOnvio.rodar()      (leva ~1 minuto; faz ~40 leituras, uma por vez, com pausa)
 *   4. Rode:   __inventarioOnvio.exportar()          (baixa inventario-onvio-<data>.json; suba o arquivo no chat)
 *      Para ver um resumo no console:  __inventarioOnvio.resumo()
 *   5. Opcional: navegue por telas que não foram tocadas (Documentos, CND, Relatórios, Configurações...) e rode
 *      __inventarioOnvio.rodar() de novo: ele junta o que cada tela chamou (performance do navegador) ao inventário.
 *   5b. Segunda rodada (outras telas do Onvio: notícias, CND, manifesto, avisos, licenças, Gestta):
 *      await __inventarioOnvio.rodarExtras()   e depois exportar() de novo.
 *   6. Para olhar mais uma leitura que você achou numa tela:  await __inventarioOnvio.sondar('/api/caminho?param=1')
 *
 * Segurança e privacidade (garantidas pelo código, confira abaixo):
 *   - SÓ LEITURA: só faz GET, só em /api/ do mesmo site, com a sessão que você já tem. Nunca POST, PUT, PATCH, DELETE.
 *   - NÃO grava valores: textos, nomes, CPF, e-mails, datas e números viram só o TIPO. Contagens (totalItems) ficam.
 *   - Não lê nem guarda tokens: dos campos de sessão registra só o nome e o tipo (nunca SeamlessAuthenticationToken nem
 *     LongToken). Dos cookies, só os nomes; do armazenamento do navegador, só os nomes das chaves e o tamanho.
 *   - Quando o Onvio responde erro (4xx/5xx), guarda o código e a mensagem curta do erro (até 160 caracteres).
 *   - Exceção intencional (configuração, não dado pessoal): os valores curtos de FeatureResourcePermissionsMap (as
 *     permissões do seu usuário), os nomes de InfrastructureAccessControls e os endereços (host) do RoutingTable, para
 *     saber quais serviços o Onvio expõe.
 *   - A parte "tela" guarda rótulos, abas e botões como aparecem escritos: confira o JSON antes de enviar se a tela
 *     estava com o nome de alguém (menu do usuário, por exemplo).
 *   - Pouca carga: uma leitura por vez, pausa de 250 ms, no máximo 120 leituras por execução.
 */
(() => {
  if (window.__inventarioOnvio) { console.warn('[inventario-onvio] já está carregado. Use __inventarioOnvio.rodar()'); return; }

  const MAX_LEITURAS = 120, PAUSA_MS = 250, PROF_MAX = 5;
  const estado = { versao: 1, iniciadoEm: new Date().toISOString(), pagina: location.origin + location.pathname, leituras: 0, sessao: null, recursos: {}, extras: {}, navegador: null, tela: null, rede: {}, erros: [] };

  const espera = ms => new Promise(r => setTimeout(r, ms));

  /* ---------- formato sem valores ---------- */
  function tipoDe(v) {
    if (v === null) return 'null';
    if (typeof v === 'string') {
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return 'texto:data-hora';
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'texto:data';
      if (/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(v)) return 'texto:guid';
      if (/^\d+$/.test(v)) return 'texto:numero';
      if (/^https?:\/\//i.test(v)) return 'texto:url';
      if (/^[A-Z][A-Z0-9_]{1,40}$/.test(v)) return 'texto:enum';           // WORKED, PHONE... (nome de opção, não dado pessoal)
      return 'texto';
    }
    return typeof v === 'number' ? 'numero' : typeof v === 'boolean' ? 'booleano' : typeof v;
  }
  function formato(v, prof) {
    prof = prof || 0;
    if (prof > PROF_MAX) return '…';
    if (Array.isArray(v)) return v.length ? [formato(v[0], prof + 1)] : [];
    if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v).slice(0, 120)) o[k] = formato(v[k], prof + 1); return o; }
    return tipoDe(v);
  }
  // nomes de campos (caminho com ponto) de um formato
  function caminhos(f, base, out) {
    out = out || []; base = base || '';
    if (Array.isArray(f)) { if (f.length) caminhos(f[0], base + '[]', out); else out.push(base + '[]'); return out; }
    if (f && typeof f === 'object') { for (const k of Object.keys(f)) caminhos(f[k], base ? base + '.' + k : k, out); return out; }
    out.push(base + ':' + f); return out;
  }

  /* ---------- leitura (só GET em /api/) ---------- */
  function caminhoSeguro(p) {
    try {
      const u = new URL(p, location.origin);
      if (u.origin !== location.origin || !/^\/api\//i.test(u.pathname)) return null;
      return u.pathname + u.search;
    } catch (e) { return null; }
  }
  async function ler(caminho) {
    const alvo = caminhoSeguro(caminho);
    if (!alvo) return { status: 0, motivo: 'fora de /api/ do mesmo site' };
    if (estado.leituras >= MAX_LEITURAS) return { status: 0, motivo: 'limite de leituras por execução' };
    estado.leituras++;
    await espera(PAUSA_MS);
    try {
      const r = await fetch(alvo, { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' } });
      const ct = r.headers.get('content-type') || '';
      if (!/json/i.test(ct)) { try { await r.arrayBuffer(); } catch (e) {} return { status: r.status, tipo: ct.split(';')[0] || '(sem tipo)', corpo: null }; }
      let j = null; try { j = await r.json(); } catch (e) {}
      return { status: r.status, tipo: 'json', corpo: j };
    } catch (e) { return { status: 0, motivo: String(e && e.message || e).slice(0, 80) }; }
  }
  const normalizarCaminho = p => {
    try {
      const u = new URL(p, location.origin);
      const c = u.pathname.replace(/[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/gi, '{id}').replace(/\/\d+(?=\/|$)/g, '/{num}');
      return c + (u.search ? '?' + [...u.searchParams.keys()].sort().join('&') : '');
    } catch (e) { return String(p).slice(0, 120); }
  };
  const resumoResposta = (r, o) => {
    o = o || {};
    const out = { status: r.status };
    if (r.motivo) out.motivo = r.motivo;
    if (r.tipo && r.tipo !== 'json') out.tipo = r.tipo;
    const j = r.corpo;
    // erro do Onvio (4xx/5xx): guarda o código e a mensagem curta para diagnosticar (ex.: parâmetro no formato errado)
    if (r.status >= 400 && j && j.error && typeof j.error === 'object') out.erro = { code: String(j.error.code || '').slice(0, 60), message: String(j.error.message || '').slice(0, 160) };
    if (j && typeof j === 'object') {
      // invólucro de lista: guarda as contagens e o formato do 1º item; senão, o formato do objeto
      const lista = Array.isArray(j.items) ? j.items : Array.isArray(j.content) ? j.content : Array.isArray(j.data && j.data.items) ? j.data.items : Array.isArray(j) ? j : null;
      if (lista) {
        const inv = Array.isArray(j) ? null : j;
        out.itens = lista.length;
        if (inv) { out.involuco = Object.keys(inv).filter(k => !Array.isArray(inv[k])).slice(0, 20); for (const k of ['totalItems', 'totalPages', 'itemsPerPage', 'totalElements']) if (typeof inv[k] === 'number') out[k] = inv[k]; }
        if (lista.length) out.item = formato(lista[0]);
        out._primeiro = lista[0];
      } else { out.objeto = formato(j); out._primeiro = j; }
    }
    return out;
  };
  const semInterno = o => { const { _primeiro, ...resto } = o; return resto; };

  /* ---------- 1. sessão e permissões (sem tokens) ---------- */
  async function sessao() {
    const r = await ler('/api/security/v1/session-and-bindings');
    const out = { status: r.status };
    const j = r.corpo;
    if (!j || typeof j !== 'object') { out.motivo = r.motivo || 'sem corpo'; return out; }
    out.UdsSession = formato(j.UdsSession || {});                          // só nomes e tipos: tokens e e-mail nunca ficam
    const b = j.UdsSessionBindings || {};
    const rt = b.RoutingTable && typeof b.RoutingTable === 'object' ? b.RoutingTable : {};
    const hosts = {};
    for (const [k, v] of Object.entries(rt)) { try { const h = new URL(String(v)).host; (hosts[h] ||= []).push(k); } catch (e) { (hosts['(sem endereço)'] ||= []).push(k); } }
    out.RoutingTable = { chaves: Object.keys(rt).length, porHost: Object.fromEntries(Object.entries(hosts).map(([h, ks]) => [h, { n: ks.length, chaves: ks.sort().slice(0, 400) }])) };
    const perm = (b.FeatureResourcePermissions && b.FeatureResourcePermissions.FeatureResourcePermissionsMap) || {};
    out.FeatureResourcePermissionsMap = {};
    for (const [g, m] of Object.entries(perm)) {
      out.FeatureResourcePermissionsMap[g] = {};
      for (const [k, v] of Object.entries(m && typeof m === 'object' ? m : {})) out.FeatureResourcePermissionsMap[g][k] = typeof v === 'string' ? v.slice(0, 40) : tipoDe(v);
    }
    out.ApplicationConfiguration = formato(b.ApplicationConfiguration || {});
    out.InfrastructureAccessControls = Array.isArray(b.InfrastructureAccessControls) ? { n: b.InfrastructureAccessControls.length, amostra: b.InfrastructureAccessControls.slice(0, 40).map(x => String(x).slice(0, 60)) } : null;
    out.outrasChaves = Object.keys(b).filter(k => !['RoutingTable', 'FeatureResourcePermissions', 'ApplicationConfiguration', 'InfrastructureAccessControls'].includes(k));
    out._companyId = b.ApplicationConfiguration && b.ApplicationConfiguration.CompanyId;      // só para encadear leituras; sai antes de exportar
    return out;
  }

  /* ---------- 2. catálogo de leituras ---------- */
  // lista: caminho da lista; detalhe/topicos: bases (com {id} = GUID do item); expand: o da tela
  const LISTAS = [
    { chave: 'geral', lista: 'service-requesting/v1/tickets/generic', expand: 'clientExpanded,staffResponsibleExpanded,requesterExpanded', detalhe: 'service-requesting/v1/tickets/generic', topicos: 'service-requesting/v1/tickets', anexos: 'service-requesting/v1/tickets' },
    { chave: 'cadEmpregado', lista: 'br-payroll-sr/v1/employees-registrations', expand: 'clientExpanded,staffResponsibleExpanded', detalhe: 'br-payroll-sr/v1/employees-registrations', topicos: 'br-payroll-sr/v1/employees-registrations' },
    { chave: 'cadContribuinte', lista: 'br-payroll-sr/v1/taxpayers-registrations', expand: 'clientExpanded,staffResponsibleExpanded', detalhe: 'br-payroll-sr/v1/taxpayers-registrations', topicos: 'br-payroll-sr/v1/employees-registrations' },
    { chave: 'cadEstagiario', lista: 'br-payroll-sr/v1/interns-registrations', expand: 'clientExpanded,staffResponsibleExpanded', detalhe: 'br-payroll-sr/v1/interns-registrations', topicos: 'br-payroll-sr/v1/employees-registrations' },
    { chave: 'avisoFerias', lista: 'br-payroll-sr/v1/prior-notice-vacations', expand: 'clientEmployeeExpanded,clientExpanded,staffResponsibleExpanded', detalhe: 'br-payroll-sr/v1/prior-notice-vacations', topicos: 'br-payroll-sr/v1/tickets' },
    { chave: 'calcFerias', lista: 'br-payroll-sr/v1/vacation-calculations', expand: 'clientEmployeeExpanded,clientExpanded,staffResponsibleExpanded', detalhe: 'br-payroll-sr/v1/vacation-calculations', topicos: 'br-payroll-sr/v1/tickets' },
    { chave: 'avisoRescisao', lista: 'br-payroll-sr/v1/prior-notice-terminations', expand: 'clientEmployeeExpanded,clientExpanded,staffResponsibleExpanded', detalhe: 'br-payroll-sr/v1/prior-notice-terminations', topicos: 'br-payroll-sr/v1/tickets' },
    { chave: 'calcRescisao', lista: 'br-payroll-sr/v1/termination-calculations', expand: 'clientEmployeeExpanded,clientExpanded,staffResponsibleExpanded', detalhe: 'br-payroll-sr/v1/termination-calculations', topicos: 'br-payroll-sr/v1/tickets' },
    { chave: 'afastamento', lista: 'br-payroll-sr/v1/employee-leave', expand: 'clientEmployeeExpanded,clientExpanded,staffResponsibleExpanded', detalhe: 'br-payroll-sr/v1/employee-leave', topicos: 'br-payroll-sr/v1/tickets' },
    { chave: 'rubricas', lista: 'br-payroll-sr/v1/payroll-entries', expand: 'clientExpanded,staffResponsibleExpanded', detalhe: 'br-payroll-sr/v2/payroll-entries', topicos: 'br-payroll-sr/v1/payroll-entries' }
  ];
  // tabelas de apoio (sem parâmetros)
  const APOIO = [
    'br-default-department/v1/department?itemsPerPage=100&pageIndex=1',
    'br-payroll-sr/v1/company-department-access',
    'br-payroll-sr/v1/employee-leave-types',
    'br-payroll-sr/v1/termination-reasons',
    'br-payroll-sr/v1/esocial-reasons',
    'br-payroll-sr/v1/esocial-categories',
    'br-payroll-sr/v1/employment-relationships',
    'br-payroll-sr/v1/categories',
    'service-requesting/v1/ticket-prescriptions',
    'br-payroll-sr/v1/ticket-prescriptions',
    'profiles/v1/preferences?application=service-request&category=topic-generic'
  ];

  async function lista(def) {
    const o = { lista: null, detalhe: null, topicos: null, anexo: null };
    const rl = await ler('/api/' + def.lista + '?itemsPerPage=1&pageIndex=1&startIndex=0&orderBy=lastUpdated desc&assignedtome=false&expand=' + encodeURIComponent(def.expand));
    const sl = resumoResposta(rl); o.lista = semInterno(sl);
    const item = sl._primeiro && typeof sl._primeiro === 'object' ? sl._primeiro : null;
    if (item && item.id) {
      const rd = await ler('/api/' + def.detalhe + '/' + encodeURIComponent(item.id) + '?expand=all');
      const sd = resumoResposta(rd); o.detalhe = semInterno(sd);
      const rt = await ler('/api/' + def.topicos + '/' + encodeURIComponent(item.id) + '/topics?expand=all&itemsPerPage=5&orderBy=created asc&pageIndex=0');
      const st = resumoResposta(rt); o.topicos = semInterno(st);
      // quem escreveu o trâmite: contato e usuário (campos de cada um; sem valores)
      const topico = st._primeiro && typeof st._primeiro === 'object' ? st._primeiro : null;
      const autor = topico && topico.createdByContactExpanded && topico.createdByContactExpanded.id;
      if (autor && estado._companyId && !estado.extras.contato) {
        const sc = resumoResposta(await ler('/api/core/v7/companies/' + encodeURIComponent(estado._companyId) + '/contacts/' + encodeURIComponent(autor)));
        estado.extras.contato = semInterno(sc);
        // o usuário tem outro id: o userId do contato (com o id do contato o Onvio responde 403)
        const uid = sc._primeiro && sc._primeiro.userId;
        if (uid) estado.extras.usuario = semInterno(resumoResposta(await ler('/api/profiles/v1/users/' + encodeURIComponent(uid))));
      }
      // cliente da solicitação: empregados dele (nomes dos campos)
      const cli = item.clientExpanded && item.clientExpanded.id;
      if (cli && !estado.extras.empregadosDoCliente) estado.extras.empregadosDoCliente = semInterno(resumoResposta(await ler('/api/br-payroll-sr/v1/clients/' + encodeURIComponent(cli) + '/employees?eprType=EMPLOYEE&eprType=INTERN&expand=clientEmployeeRelationshipExpanded')));
      // anexo de abertura (só o formato: o endereço de download é um token e nunca é seguido)
      const anexos = (sd._primeiro && sd._primeiro.attachmentsExpanded) || (topico && topico.attachmentsExpanded) || [];
      if (anexos.length) o.anexo = { campos: formato(anexos[0]) };
    }
    // campos da lista x campos do detalhe: o que só aparece no detalhe, e o que a lista traz sem pedir expand
    if (o.lista.item && o.detalhe && o.detalhe.objeto) {
      const a = new Set(Object.keys(o.lista.item)), b = new Set(Object.keys(o.detalhe.objeto));
      o.soNoDetalhe = [...b].filter(k => !a.has(k)); o.soNaLista = [...a].filter(k => !b.has(k));
    }
    return o;
  }

  // Segunda rodada (descoberta em 26/10/2026 pelo que as telas chamam): só GET, só leitura. Fora de propósito:
  // initial-data-load e handle-client-access (o nome sugere que mudam algo; nenhum GET é feito neles).
  const EXTRAS = [
    'notification-async/v1/counters',
    'br-news/v1/categories',
    'br-news/v1/articles/shared?expand=all&itemsPerPage=1&pageIndex=1',
    'cnd/v1/clients?expand=all&itemsPerPage=1&pageIndex=1&startIndex=0',
    'manifesto/v1/clients?expand=all&itemsPerPage=1&pageIndex=1',
    'br-platform-preference/v1/department-alert',
    'provisioning/v1/licenses',
    'profiles/v1/accounts?active=true&hideNonOnvio=true',
    'profiles/v2/company-preferences/applications/BR_ATENDIMENTO/categories/HIDE_INACTIVE_CLIENTS',
    'storage/v1/folders?includeTaxAccounting=true',
    'core/v3/companies/{empresa}/main',
    'br-gestta-dashboard/v1/statistics/company/{empresa}/tasks?start={ini}&end={fim}',
    'br-gestta-dashboard/v1/statistics/company/{empresa}/liable-tasks?start={ini}&end={fim}'
  ];
  async function rodarExtras() {
    const log = (...a) => console.log('[inventario-onvio]', ...a);
    if (!estado._companyId) { const s = await sessao(); estado._companyId = s._companyId; if (!estado.sessao) { delete s._companyId; estado.sessao = s; } }
    const fim = new Date(), ini = new Date(fim.getTime() - 30 * 864e5), dia = d => d.toISOString().slice(0, 10);
    for (const modelo of EXTRAS) {
      const p = modelo.replace('{empresa}', encodeURIComponent(estado._companyId || '')).replace('{ini}', dia(ini)).replace('{fim}', dia(fim));
      if (!estado._companyId && modelo.includes('{empresa}')) { estado.erros.push('sem CompanyId para ' + modelo); continue; }
      log('extra', modelo.split('?')[0]);
      try { estado.extras[normalizarCaminho('/api/' + p)] = semInterno(resumoResposta(await ler('/api/' + p))); } catch (e) { estado.erros.push(modelo + ': ' + (e && e.message)); }
    }
    estado.rede = redeVista();
    log('extras prontos: ' + estado.leituras + ' leituras no total. Rode __inventarioOnvio.exportar().');
    return resumo();
  }

  async function rodar() {
    estado.erros.length = 0;
    const log = (...a) => console.log('[inventario-onvio]', ...a);
    try {
      log('sessão e permissões…');
      estado.sessao = await sessao();
      estado._companyId = estado.sessao._companyId; delete estado.sessao._companyId;
      for (const def of LISTAS) { log('lista', def.chave); try { estado.recursos[def.chave] = await lista(def); } catch (e) { estado.erros.push(def.chave + ': ' + (e && e.message)); } }
      for (const p of APOIO) { log('apoio', p.split('?')[0]); try { estado.extras[normalizarCaminho('/api/' + p)] = semInterno(resumoResposta(await ler('/api/' + p))); } catch (e) { estado.erros.push(p + ': ' + (e && e.message)); } }
      log('navegador e tela…');
      estado.navegador = await navegador();
      estado.tela = tela();
      estado.rede = redeVista();
    } catch (e) { estado.erros.push(String(e && e.message || e)); }
    estado.terminadoEm = new Date().toISOString();
    log('pronto: ' + estado.leituras + ' leituras. Rode __inventarioOnvio.exportar() para baixar e __inventarioOnvio.resumo() para ver.');
    return resumo();
  }

  /* ---------- 3. navegador: o que a página guarda e expõe (só nomes) ---------- */
  async function navegador() {
    const o = {};
    const chaves = st => { try { return Object.keys(st).map(k => ({ chave: k.slice(0, 80), bytes: (st.getItem(k) || '').length })); } catch (e) { return 'bloqueado'; } };
    o.localStorage = chaves(localStorage); o.sessionStorage = chaves(sessionStorage);
    o.cookiesVisiveis = document.cookie ? document.cookie.split(';').map(c => c.split('=')[0].trim()).filter(Boolean) : [];
    try { o.indexedDB = indexedDB.databases ? (await indexedDB.databases()).map(d => ({ nome: d.name, versao: d.version })) : 'sem suporte'; } catch (e) { o.indexedDB = 'bloqueado'; }
    try { o.caches = window.caches ? await caches.keys() : []; } catch (e) { o.caches = 'bloqueado'; }
    try { o.serviceWorkers = navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).map(r => new URL(r.scope).pathname) : []; } catch (e) { o.serviceWorkers = 'bloqueado'; }
    // variáveis globais que a página criou (comparadas com uma janela vazia)
    try {
      const f = document.createElement('iframe'); f.style.display = 'none'; document.documentElement.appendChild(f);
      const base = new Set(Object.getOwnPropertyNames(f.contentWindow)); f.remove();
      o.globaisDaPagina = Object.getOwnPropertyNames(window).filter(k => !base.has(k)).slice(0, 200);
    } catch (e) { o.globaisDaPagina = 'bloqueado'; }
    o.frameworks = { angular: !!(window.ng || window.getAllAngularRootElements || document.querySelector('[ng-version]')), angularJs: !!window.angular, wijmo: !!window.wijmo, websocket: typeof WebSocket !== 'undefined', eventSource: typeof EventSource !== 'undefined' };
    const versao = document.querySelector('[ng-version]'); if (versao) o.frameworks.versaoAngular = versao.getAttribute('ng-version');
    return o;
  }

  /* ---------- 4. tela atual: colunas das grades (cabeçalho e campo) e rótulos ---------- */
  function tela() {
    const out = { titulo: (document.title || '').slice(0, 80), rota: location.pathname + (location.hash || '').split('?')[0], grades: [], rotulos: [], abas: [], botoes: [] };
    const limpa = (t, n) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, n || 60);
    try {
      document.querySelectorAll('.wj-flexgrid').forEach(el => {
        let ctl = null; try { ctl = window.wijmo && window.wijmo.Control && window.wijmo.Control.getControl(el); } catch (e) {}
        if (ctl && ctl.columns) out.grades.push({ colunas: ctl.columns.map(c => ({ cabecalho: limpa(c.header), campo: c.binding || null, visivel: c.visible !== false })) });
        else out.grades.push({ colunas: [...el.querySelectorAll('[wj-part="ch"] [role="columnheader"]')].map(c => ({ cabecalho: limpa(c.textContent), campo: null })) });
      });
    } catch (e) {}
    out.rotulos = [...new Set([...document.querySelectorAll('label, .field-label, th, .mat-form-field-label')].map(e => limpa(e.textContent, 50)).filter(t => t && t.length > 1))].slice(0, 150);
    out.abas = [...new Set([...document.querySelectorAll('[role="tab"], .nav-tabs a, .mat-tab-label')].map(e => limpa(e.textContent, 40)).filter(Boolean))];
    out.botoes = [...new Set([...document.querySelectorAll('button, [role="button"]')].map(e => limpa(e.textContent || e.getAttribute('aria-label') || e.title, 40)).filter(Boolean))].slice(0, 80);
    return out;
  }

  /* ---------- 5. rede já feita pela página (o que cada tela chama) ---------- */
  function redeVista() {
    const m = {};
    try {
      for (const e of performance.getEntriesByType('resource')) {
        let u; try { u = new URL(e.name); } catch (x) { continue; }
        if (!/(^|\.)onvio\.com\.br$/i.test(u.hostname) && !/thomsonreuters|tr\.com|onvio/i.test(u.hostname)) continue;
        if (!/^\/api\//i.test(u.pathname)) continue;
        const ch = u.host + normalizarCaminho(u.pathname + u.search);
        const x = (m[ch] ||= { n: 0, iniciador: e.initiatorType });
        x.n++;
      }
    } catch (e) {}
    return m;
  }

  /* ---------- exportar e resumo ---------- */
  function exportavel() { const { _companyId, ...resto } = estado; return resto; }
  function exportar() {
    const blob = new Blob([JSON.stringify(exportavel(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'inventario-onvio-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return 'baixado: ' + a.download;
  }
  function resumo() {
    const linhas = [];
    for (const [k, r] of Object.entries(estado.recursos)) {
      linhas.push({ recurso: k, lista: r.lista && r.lista.status, camposLista: r.lista && r.lista.item ? Object.keys(r.lista.item).length : '', detalhe: r.detalhe && r.detalhe.status, camposDetalhe: r.detalhe && r.detalhe.objeto ? Object.keys(r.detalhe.objeto).length : '', topicos: r.topicos && r.topicos.status, soNoDetalhe: (r.soNoDetalhe || []).join(', ').slice(0, 90) });
    }
    if (console.table) console.table(linhas);
    const s = estado.sessao || {};
    return { leituras: estado.leituras, recursos: Object.keys(estado.recursos).length, servicosNoRoteamento: s.RoutingTable && s.RoutingTable.chaves, gruposDePermissao: s.FeatureResourcePermissionsMap && Object.keys(s.FeatureResourcePermissionsMap), chamadasDaPagina: Object.keys(estado.rede).length, erros: estado.erros.length };
  }
  async function sondar(caminho) {
    const r = await ler(caminho);
    const s = resumoResposta(r);
    const k = normalizarCaminho(caminho);
    estado.extras[k] = semInterno(s);
    return estado.extras[k];
  }

  window.__inventarioOnvio = { rodar, rodarExtras, exportar, resumo, sondar, estado: exportavel, _teste: { formato, caminhoSeguro, ler } };
  console.log('[inventario-onvio] pronto. Rode:  await __inventarioOnvio.rodar()   e depois   __inventarioOnvio.exportar()');
})();

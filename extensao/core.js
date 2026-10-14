/* Onvio Controle · núcleo (sem dependência de chrome.*)
 * Define self.OC com: tipos de solicitação, coleta, busca, regras de prazo.
 * Roda no service worker (importScripts) e também colado direto na página do Onvio para teste.
 */
(function (g) {
  'use strict';

  const ORIGIN = 'https://onvio.com.br';
  const API = ORIGIN + '/api/';
  const PORTAL = ORIGIN + '/br-portal-do-cliente/';

  // [rótulo, lado]  lado: esc = ação do escritório | cli = vez do cliente | fim = encerrada
  const ST_PADRAO = {
    1: ['Sem análise', 'esc'],
    2: ['Em análise', 'esc'],
    3: ['Aguardando resposta', 'esc'],
    4: ['Respondido', 'cli'],
    5: ['Concluído', 'fim'],
    6: ['Prescrita', 'fim'],
    7: ['Encaminhado', 'esc'],
    8: ['Em análise interna', 'esc'],
    9: ['Encaminhado', 'esc']
  };
  const ST_CADASTRO = {
    1: ['Sem análise', 'esc'],
    2: ['Enviado para o escritório', 'esc'],
    3: ['Aguardando o cliente', 'cli'],
    4: ['Respondido pelo cliente', 'esc'],
    5: ['Cadastro efetuado', 'cli'],
    6: ['Concluído', 'fim']
  };
  const ST_RUBRICAS = {
    0: ['Sem análise', 'esc'],
    1: ['Sem análise', 'esc'],
    2: ['Em análise', 'esc'],
    3: ['Importação realizada', 'cli'],
    4: ['Respondido', 'cli'],
    5: ['Aguardando resposta', 'esc'],
    6: ['Aguardando correção', 'cli'],
    7: ['Em análise interna', 'esc'],
    8: ['Concluído', 'fim'],
    9: ['Encaminhado', 'esc'],
    10: ['Prescrita', 'fim'],
    11: ['Enviado para o escritório', 'esc'],
    12: ['Respondido pelo cliente', 'esc']
  };

  // pendentes: lista de códigos (filtro IN). excluir: pendente = qualquer código fora da lista
  // (filtro NE), que também pega códigos novos; se o Onvio recusar, volta para o IN.
  // clienteGrava: códigos de situação que um trâmite do CLIENTE grava (usado para achar o 1º trâmite do escritório).
  const FAMILIAS = {
    padrao: { st: ST_PADRAO, pendentes: '1,2,3,4,7,8,9', prescreve: true, clienteGrava: [1, 3] },
    cadastro: { st: ST_CADASTRO, pendentes: '1,2,3,4,5', prescreve: false, clienteGrava: [1, 2, 4] },
    rubricas: { st: ST_RUBRICAS, pendentes: '0,1,2,3,4,5,6,7,9,11,12', excluir: ['8', '10'], prescreve: true, clienteGrava: [0, 1, 11, 12] }
  };
  const DESCONHECIDO = code => ['Situação desconhecida (código ' + code + ')', 'desc'];

  const EXP_PADRAO = 'clientEmployeeExpanded,clientExpanded,staffResponsibleExpanded';
  const EXP_SIMPLES = 'clientExpanded,staffResponsibleExpanded';

  const TYPES = [
    { key: 'geral', label: 'Geral', path: 'service-requesting/v1/tickets/generic', expand: 'clientExpanded,staffResponsibleExpanded,requesterExpanded', route: 'service-requesting/general', familia: 'padrao', calculo: false },
    { key: 'cadEmpregado', label: 'Cadastro empregado', path: 'br-payroll-sr/v1/employees-registrations', expand: EXP_SIMPLES, route: 'service-requesting/payroll-registration/employee', familia: 'cadastro', calculo: false },
    { key: 'cadContribuinte', label: 'Cadastro contribuinte', path: 'br-payroll-sr/v1/taxpayers-registrations', expand: EXP_SIMPLES, route: 'service-requesting/payroll-registration/partner', familia: 'cadastro', calculo: false },
    { key: 'cadEstagiario', label: 'Cadastro estagiário', path: 'br-payroll-sr/v1/interns-registrations', expand: EXP_SIMPLES, route: 'service-requesting/payroll-registration/intern', familia: 'cadastro', calculo: false },
    { key: 'avisoFerias', label: 'Aviso de férias', path: 'br-payroll-sr/v1/prior-notice-vacations', expand: EXP_PADRAO, route: 'service-requesting/vacation/prior-notice', familia: 'padrao', calculo: false },
    { key: 'calcFerias', label: 'Cálculo de férias', path: 'br-payroll-sr/v1/vacation-calculations', expand: EXP_PADRAO, route: 'service-requesting/vacation/calculation', familia: 'padrao', calculo: true },
    { key: 'avisoRescisao', label: 'Aviso de rescisão', path: 'br-payroll-sr/v1/prior-notice-terminations', expand: EXP_PADRAO, route: 'service-requesting/termination/prior-notice', familia: 'padrao', calculo: false },
    { key: 'calcRescisao', label: 'Cálculo de rescisão', path: 'br-payroll-sr/v1/termination-calculations', expand: EXP_PADRAO, route: 'service-requesting/termination/calculation', familia: 'padrao', calculo: true },
    { key: 'afastamento', label: 'Afastamento', path: 'br-payroll-sr/v1/employee-leave', expand: EXP_PADRAO, route: 'service-requesting/employee-leave', familia: 'padrao', calculo: false },
    { key: 'rubricas', label: 'Lançamento de rubricas', path: 'br-payroll-sr/v1/payroll-entries', expand: EXP_SIMPLES, route: 'service-requesting/payroll-entries', familia: 'rubricas', calculo: false }
  ];
  const TYPE_BY_KEY = Object.fromEntries(TYPES.map(t => [t.key, t]));

  const DEFAULTS = {
    intervalo: 5,             // minutos entre leituras completas (a verificação ao vivo lê tudo antes se algo mudar)
    tempoRealSeg: 30,         // segundos entre verificações leves enquanto o Onvio está na tela (0 desliga)
    primeiroTramite: 1,       // dias úteis para o primeiro trâmite
    conclusaoSimples: 3,      // dias úteis para concluir demanda simples
    conclusaoCalculo: 5,      // dias úteis para concluir cálculo
    clienteSemRetorno: 5,     // dias úteis aguardando o cliente
    parada: 15,               // dias corridos sem movimentação
    prescricaoDias: 30,       // regra do Onvio
    prescricaoAviso: 20,      // a partir de quantos dias parada vira alerta vermelho
    guiaDias: 5,              // guias não visualizadas: alerta a partir de quantos dias do vencimento
    regrasUrl: '',            // endereço (https) de um arquivo de regras do escritório; vazio = só as embutidas
    // Geral: palavras do assunto que sugerem uma solicitação específica ("possível aba errada").
    // Sem acento e em minúsculas. A primeira entrada que casar vence, então as mais específicas vêm antes.
    abaErrada: [
      { tipo: 'calcFerias', palavras: ['calculo de ferias', 'recibo de ferias', 'pagar ferias'] },
      { tipo: 'avisoFerias', palavras: ['ferias', 'aviso de ferias', 'programar ferias'] },
      { tipo: 'calcRescisao', palavras: ['calculo de rescisao', 'verbas rescisorias', 'termo de rescisao', 'trct'] },
      { tipo: 'avisoRescisao', palavras: ['demissao', 'pedido de demissao', 'desligamento', 'aviso previo', 'justa causa', 'demitir'] },
      { tipo: 'afastamento', palavras: ['atestado', 'afastamento', 'licenca maternidade', 'licenca paternidade', 'inss', 'acidente de trabalho'] },
      { tipo: 'cadEmpregado', palavras: ['admissao', 'admitir', 'novo funcionario', 'nova contratacao', 'contratar'] },
      { tipo: 'cadEstagiario', palavras: ['estagio', 'estagiario', 'estagiaria'] },
      { tipo: 'rubricas', palavras: ['hora extra', 'horas extras', 'comissao', 'rubrica', 'variaveis da folha'] }
    ],
    notificar: true,
    modoGestor: false,
    feriados: [
      '2026-01-01', '2026-02-16', '2026-02-17', '2026-04-03', '2026-04-21', '2026-05-01', '2026-06-04',
      '2026-09-07', '2026-10-12', '2026-11-02', '2026-11-15', '2026-11-20', '2026-12-25',
      '2027-01-01', '2027-02-08', '2027-02-09', '2027-03-26', '2027-04-21', '2027-05-01', '2027-05-27',
      '2027-09-07', '2027-10-12', '2027-11-02', '2027-11-15', '2027-11-20', '2027-12-25'
    ]
  };

  /* ---------- datas ---------- */
  function parseDate(s) {
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 23, 59, 59); }
    const iso = /Z$|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z'; // a API devolve UTC sem fuso
    const d = new Date(iso);
    return isNaN(d) ? null : d;
  }
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function diasCorridos(from, now) { return from ? Math.floor((now - from) / 864e5) : 0; }
  // dias úteis completos depois de "from" até "now" (não conta o próprio dia de abertura)
  function diasUteis(from, now, feriados) {
    if (!from) return 0;
    const hol = feriados instanceof Set ? feriados : new Set(feriados || []);
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const fim = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let n = 0;
    while (d < fim) {
      d.setDate(d.getDate() + 1);
      const wd = d.getDay();
      if (wd !== 0 && wd !== 6 && !hol.has(ymd(d))) n++;
    }
    return n;
  }
  function fmtData(d) { return d ? String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') : ''; }

  /* ---------- URLs ---------- */
  function listUrl(t, o) {
    const p = new URLSearchParams();
    const per = o.per || 200, page = o.page || 1;
    p.set('itemsPerPage', per);
    p.set('pageIndex', page);
    p.set('startIndex', (page - 1) * per);
    p.set('orderBy', 'lastUpdated desc');
    p.set('assignedtome', o.mine ? 'true' : 'false');
    if (o.expand !== false) p.set('expand', t.expand);
    if (o.search) p.set('searchText', o.search);
    if (o.pendentes) {
      const fam = FAMILIAS[t.familia];
      const itens = fam.excluir && o.pendentes !== 'alt'
        ? fam.excluir.map(v => ({ by: 'firmStatus', op: 'NE', value: v }))
        : [{ by: 'firmStatus', op: 'IN', value: fam.pendentes }];
      p.set('filter', JSON.stringify({ groups: [{ useOr: false, items: itens }] }));
    }
    return API + t.path + '?' + p.toString();
  }

  async function paginar(fetcher, t, o, maxPages) {
    let page = 1, all = [];
    for (;;) {
      const d = await fetcher(listUrl(t, Object.assign({}, o, { page })));
      const items = (d && d.items) || [];
      all = all.concat(items);
      const per = o.per || 200;
      if (items.length < per || page >= (d.totalPages || 1) || page >= (maxPages || 15)) break;
      page++;
    }
    return all;
  }

  /* ---------- normalização ---------- */
  const ENTRY = { MONTHLY: 'Mensal', ADVANCE: 'Adiantamento', THIRTEENTH: '13º', VACATION: 'Férias', TERMINATION: 'Rescisão' };

  function normalize(t, r, mineSet, regras) {
    const fam = FAMILIAS[t.familia];
    const code = r.genericStatus;
    const conhecido = Object.prototype.hasOwnProperty.call(fam.st, code);
    const st = conhecido ? fam.st[code] : DESCONHECIDO(code);
    const cli = r.clientExpanded || {};
    let detalhe = '';
    if (t.key === 'geral') detalhe = r.subject || '';
    else if (t.familia === 'cadastro') detalhe = r.name || '';
    else if (t.key === 'rubricas') {
      const e = r.effectiveDate ? r.effectiveDate.slice(5, 7) + '/' + r.effectiveDate.slice(0, 4) : '';
      detalhe = [e, ENTRY[r.entryType] || r.entryType || ''].filter(Boolean).join(' · ');
    } else detalhe = (r.clientEmployeeExpanded && r.clientEmployeeExpanded.name) || r.subject || '';
    return {
      k: t.key + ':' + r.id,
      type: t.key,
      typeLabel: t.label,
      id: r.id,
      num: r.identifier,
      code,
      status: st[0],
      lado: st[1],
      desconhecido: !conhecido,
      created: r.created || r.lastStatusChanged || null,
      last: r.lastUpdated || r.genericLastUpdated || r.changed || null,
      due: r.dueDate || null,
      apelido: cli.nickname || cli.name || '',
      cliente: cli.name || '',
      codCliente: cli.code || '',
      detalhe,
      resp: (r.staffResponsibleExpanded && r.staffResponsibleExpanded.name) || '',
      solicitante: (r.requesterExpanded && r.requesterExpanded.name) || '',
      mine: mineSet ? mineSet.has(r.id) : false,
      abaProvavel: t.key === 'geral' ? abaProvavel(detalhe, regras || DEFAULTS.abaErrada) : null
    };
  }

  /* ---------- "possível aba errada" (Geral) ---------- */
  const semAcento = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const escRe = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Devolve { tipo, label, palavra } da primeira entrada cujas palavras aparecem no assunto, ou null.
  function abaProvavel(assunto, regras) {
    const alvo = semAcento(assunto);
    if (!alvo.trim()) return null;
    for (const e of (Array.isArray(regras) ? regras : [])) {
      const t = TYPE_BY_KEY[e && e.tipo];
      if (!t || t.key === 'geral') continue;
      for (const p of e.palavras || []) {
        const w = semAcento(p).trim();
        if (w && new RegExp('(^|[^a-z0-9])' + escRe(w) + '([^a-z0-9]|$)').test(alvo)) return { tipo: t.key, label: t.label, palavra: w };
      }
    }
    return null;
  }

  /* ---------- regras ---------- */
  function evaluate(it, s, now) {
    s = Object.assign({}, DEFAULTS, s || {});
    now = now || new Date();
    const t = TYPE_BY_KEY[it.type];
    const fam = FAMILIAS[t.familia];
    const hol = new Set(s.feriados || []);
    const created = parseDate(it.created) || parseDate(it.last);
    const last = parseDate(it.last);
    const due = parseDate(it.due);
    const parado = diasCorridos(last, now);
    const uteisParado = diasUteis(last, now, hol);
    const uteisAberto = diasUteis(created, now, hol);
    let nivel = 0; const motivos = [];
    const alerta = (n, m) => { motivos.push({ n, m }); if (n > nivel) nivel = n; };
    let prescreveEm = null;

    if (it.lado === 'esc') {
      if (/^Sem análise/.test(it.status)) {
        if (uteisAberto > s.primeiroTramite) alerta(2, 'Sem primeiro trâmite há ' + uteisAberto + ' d.u.');
        else if (uteisAberto === s.primeiroTramite) alerta(1, 'Primeiro trâmite vence hoje');
      }
      const lim = t.calculo ? s.conclusaoCalculo : s.conclusaoSimples;
      if (uteisAberto > lim) alerta(2, 'Aberta há ' + uteisAberto + ' d.u. (limite ' + lim + ')');
      else if (uteisAberto === lim) alerta(1, 'Prazo de conclusão vence hoje');
      if (parado > s.parada) alerta(2, 'Parada há ' + parado + ' dias');
      if (due) {
        if (due < now) alerta(2, 'Expectativa vencida em ' + fmtData(due));
        else if (diasUteis(now, due, hol) <= 1) alerta(1, 'Expectativa vence ' + fmtData(due));
      }
    } else if (it.lado === 'desc') {
      alerta(1, it.status + ': avise quem mantém a extensão');
    } else if (it.lado === 'cli') {
      if (fam.prescreve) {
        prescreveEm = Math.max(0, s.prescricaoDias - parado);
        if (parado >= s.prescricaoAviso) alerta(2, 'Prescreve em ' + prescreveEm + ' dia(s)');
        else if (uteisParado > s.clienteSemRetorno) alerta(1, 'Cliente sem retorno há ' + uteisParado + ' d.u.');
      } else {
        if (parado > s.parada) alerta(2, 'Cliente parado há ' + parado + ' dias');
        else if (uteisParado > s.clienteSemRetorno) alerta(1, 'Cliente sem retorno há ' + uteisParado + ' d.u.');
      }
    }
    return { nivel, motivos, parado, uteisAberto, prescreveEm, grav: gravidade(it, t, s, { nivel, parado, uteisAberto, prescreveEm }) };
  }

  /* Gravidade para o painel do gestor. 0 em dia | 1 atenção | 2 fora do prazo |
   * 3 crítica: fora do prazo e (prescreve em até 5 dias, parada há 2x o limite de parada,
   * ou aberta há 2x o prazo de conclusão). Definição em um lugar só para ajustar depois. */
  function gravidade(it, t, s, e) {
    if (e.nivel < 2) return e.nivel;
    const lim = t.calculo ? s.conclusaoCalculo : s.conclusaoSimples;
    if (e.prescreveEm != null && e.prescreveEm <= 5) return 3;
    if (e.parado >= 2 * s.parada) return 3;
    if (it.lado === 'esc' && e.uteisAberto >= 2 * lim) return 3;
    return 2;
  }

  /* ---------- coleta ---------- */
  // Uma chamada de verdade, pequena: serve para validar a sessão (não depende de nenhum endereço de sessão).
  function urlSonda() { return listUrl(TYPE_BY_KEY.geral, { per: 1, expand: false }); }

  // Assinatura leve de cada lista: total de pendentes + última movimentação. Se não mudou, não precisa ler tudo.
  async function assinaturaDe(fetcher, t) {
    const fam = FAMILIAS[t.familia];
    let d;
    try { d = await fetcher(listUrl(t, { per: 1, pendentes: true, expand: false })); }
    catch (e) {
      if ((e && e.auth) || !fam.excluir) throw e;
      d = await fetcher(listUrl(t, { per: 1, pendentes: 'alt', expand: false }));     // mesmo recuo de lerPendentes
    }
    const x = ((d && d.items) || [])[0];
    return String(d && d.totalItems != null ? d.totalItems : '?') + '|' + (x ? [x.id, x.lastUpdated || x.genericLastUpdated || '', x.genericStatus != null ? x.genericStatus : ''].join('|') : '-');
  }
  async function assinaturas(fetcher) {
    const out = {};
    await Promise.all(TYPES.map(async t => {
      try { out[t.key] = await assinaturaDe(fetcher, t); }
      catch (e) { if (e && e.auth) throw e; out[t.key] = null; }                       // lista que não respondeu: não conta como mudança
    }));
    return out;
  }
  function assinaturasDiferem(antes, depois) {
    if (!antes || !depois) return true;
    return Object.keys(depois).some(k => depois[k] != null && antes[k] != null && depois[k] !== antes[k]) ||
      Object.keys(depois).some(k => depois[k] != null && antes[k] == null);
  }

  async function usuario(fetcher) {
    try {
      const s = await fetcher(API + 'security/v1/session-and-bindings');
      const u = s && s.UdsSession;
      return u ? { nome: ((u.FirstName || '') + ' ' + (u.LastName || '')).trim(), email: u.EmailAddress || '' } : null;
    } catch (e) { return null; }
  }

  // Lê as pendentes de um tipo. Se o filtro por exclusão (NE) for recusado, repete com a lista (IN).
  async function lerPendentes(fetcher, t, out) {
    const fam = FAMILIAS[t.familia];
    const ler = modo => Promise.all([
      paginar(fetcher, t, { pendentes: modo }),
      paginar(fetcher, t, { pendentes: modo, mine: true, expand: false })
    ]);
    try { return await ler(true); }
    catch (e) {
      if ((e && e.auth) || !fam.excluir) throw e;
      out.filtroAlternativo.push(t.label);
      return ler('alt');
    }
  }

  async function collect(fetcher, settings, onProgress, extra) {
    const s = Object.assign({}, DEFAULTS, settings || {});
    const now = new Date();
    const out = { items: [], erros: [], porTipo: {}, desconhecidos: {}, filtroAlternativo: [], fetchedAt: now.toISOString(), user: null, tramites: { lidos: 0, falhas: 0, cache: {} } };
    out.user = await usuario(fetcher);
    let i = 0;
    for (const t of TYPES) {
      i++;
      if (onProgress) onProgress(i, TYPES.length, t.label);
      try {
        const [todas, minhas] = await lerPendentes(fetcher, t, out);
        const mineSet = new Set(minhas.map(r => r.id));
        const norm = todas.map(r => normalize(t, r, mineSet, s.abaErrada)).filter(x => x.lado !== 'fim');
        norm.filter(x => x.desconhecido).forEach(x => { const d = out.desconhecidos[t.key] || (out.desconhecidos[t.key] = {}); d[x.code] = (d[x.code] || 0) + 1; });
        norm.forEach(x => Object.assign(x, evaluate(x, s, now)));
        out.items = out.items.concat(norm);
        out.porTipo[t.key] = norm.length;
      } catch (e) {
        if (e && e.auth) throw e;
        out.erros.push(t.label + ': ' + (e && e.message ? e.message : e));
      }
    }
    if (extra && extra.tramites) {
      if (onProgress) onProgress(TYPES.length, TYPES.length, 'trâmites');
      await enriquecer(fetcher, out, extra.tramites, s, now);
    }
    out.items.sort((a, b) => (b.nivel - a.nivel) || (b.parado - a.parado));
    return out;
  }

  /* ---------- primeiro trâmite do escritório (estimativa) ----------
   * A lista não traz o histórico. Para cada pendência que já saiu de "Sem análise", lê os trâmites
   * uma única vez (o resultado fica em cache) e procura o primeiro trâmite depois da abertura cuja
   * situação NÃO seja uma que o cliente grava. É uma estimativa: confirme com a aba Trâmites. */
  function urlTramites(t, id) {
    return API + t.path + '/' + encodeURIComponent(id) + '/topics?expand=all&itemsPerPage=1000&orderBy=' + encodeURIComponent('created asc') + '&pageIndex=0';
  }
  function primeiroTramiteEsc(topicos, t) {
    const grava = new Set(FAMILIAS[t.familia].clienteGrava);
    const ord = (topicos || []).filter(x => x && x.created).sort((a, b) => String(a.created).localeCompare(String(b.created)));
    for (let i = 1; i < ord.length; i++) if (!grava.has(Number(ord[i].status))) return ord[i].created;
    return null;
  }
  async function enriquecer(fetcher, out, cache, s, now) {
    const LIMITE = 60, PARALELO = 4;
    const hol = new Set(s.feriados || []);
    const novo = {};
    const fila = [];
    for (const it of out.items) {
      const c = cache[it.k];
      if (c && c.pt) { novo[it.k] = c; continue; }
      if (c && c.erro && now - new Date(c.erro) < 864e5) continue;       // não insiste por 1 dia
      if (/^Sem análise/.test(it.status) || it.desconhecido) continue;     // ainda sem trâmite do escritório
      fila.push(it);
    }
    const falhou = {};
    let i = 0;
    async function worker() {
      while (i < fila.length && i < LIMITE) {
        const it = fila[i++];
        const t = TYPE_BY_KEY[it.type];
        if (falhou[t.key] >= 3) continue;                                  // endpoint do tipo não responde
        try {
          const d = await fetcher(urlTramites(t, it.id));
          const pt = primeiroTramiteEsc((d && d.items) || (Array.isArray(d) ? d : []), t);
          out.tramites.lidos++;
          if (pt) novo[it.k] = { pt }; // sem achar, tenta de novo no próximo ciclo
        } catch (e) {
          if (e && e.auth) throw e;
          out.tramites.falhas++;
          falhou[t.key] = (falhou[t.key] || 0) + 1;
          novo[it.k] = { erro: now.toISOString() };
        }
      }
    }
    await Promise.all(Array.from({ length: PARALELO }, worker));
    for (const it of out.items) {
      const c = novo[it.k];
      if (c && c.pt) {
        it.primeiroTramite = c.pt;
        it.ptUteis = diasUteis(parseDate(it.created), parseDate(c.pt), hol);
      }
    }
    out.tramites.cache = novo; // só o que ainda está pendente: o cache não cresce
  }

  async function search(fetcher, q, settings) {
    const s = Object.assign({}, DEFAULTS, settings || {});
    const now = new Date();
    const res = await Promise.all(TYPES.map(async t => {
      try {
        const d = await fetcher(listUrl(t, { search: q, per: 20 }));
        return ((d && d.items) || []).map(r => { const x = normalize(t, r, null, s.abaErrada); Object.assign(x, evaluate(x, s, now)); return x; });
      } catch (e) { if (e && e.auth) throw e; return []; }
    }));
    return [].concat(...res).sort((a, b) => String(b.last).localeCompare(String(a.last)));
  }

  function porAnalista(items) {
    const m = {};
    for (const it of items) {
      const k = it.resp || '(sem responsável)';
      const r = m[k] || (m[k] = { resp: k, esc: 0, cli: 0, desc: 0, vermelho: 0, amarelo: 0, total: 0, g1: 0, g2: 0, g3: 0, semPrimeiro: 0, ptSoma: 0, ptN: 0 });
      r.total++; r[it.lado === 'esc' || it.lado === 'cli' ? it.lado : 'desc']++;
      if (it.nivel === 2) r.vermelho++; else if (it.nivel === 1) r.amarelo++;
      if (it.grav >= 1 && it.grav <= 3) r['g' + it.grav]++;
      if (it.lado === 'esc' && /^Sem análise/.test(it.status)) r.semPrimeiro++;
      if (it.ptUteis != null) { r.ptSoma += it.ptUteis; r.ptN++; }
    }
    for (const r of Object.values(m)) r.ptMedia = r.ptN ? Math.round(r.ptSoma / r.ptN * 10) / 10 : null;
    return Object.values(m).sort((a, b) => (b.g3 - a.g3) || (b.vermelho - a.vermelho) || (b.total - a.total));
  }

  /* ---------- regras do escritório (arquivo editável, só dados) ----------
   * Aceita dois formatos de JSON:
   *  1. o do escritório:  { versao, prazos: {...}, feriados: [...], abaErrada: [...] }
   *  2. o do Assistente do Portal do Cliente (visão do cliente): usa config.prazoInternoDiasUteis
   *     (simples e calculo) e feriados, para os dois lados prometerem os mesmos prazos.
   * Tudo é validado: número dentro de limites, datas AAAA-MM-DD, textos curtos. Nada é executado. */
  const LIMITES = {
    primeiroTramite: [0, 30], conclusaoSimples: [1, 60], conclusaoCalculo: [1, 60], clienteSemRetorno: [1, 60],
    parada: [1, 90], prescricaoDias: [1, 120], prescricaoAviso: [1, 120], guiaDias: [0, 60], tempoRealSeg: [0, 600]
  };
  const inteiro = (v, [min, max]) => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined);

  function normalizarRegras(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const out = { versao: String(raw.versao == null ? '' : raw.versao).slice(0, 40), config: {}, feriados: [], abaErrada: [] };
    const prazos = raw.prazos && typeof raw.prazos === 'object' ? raw.prazos : {};
    for (const k of Object.keys(LIMITES)) { const v = inteiro(prazos[k], LIMITES[k]); if (v !== undefined) out.config[k] = v; }
    const cli = raw.config && raw.config.prazoInternoDiasUteis;           // formato do Assistente do cliente
    if (cli && typeof cli === 'object') {
      const a = inteiro(cli.simples, LIMITES.conclusaoSimples), b = inteiro(cli.calculo, LIMITES.conclusaoCalculo);
      if (a !== undefined && out.config.conclusaoSimples === undefined) out.config.conclusaoSimples = a;
      if (b !== undefined && out.config.conclusaoCalculo === undefined) out.config.conclusaoCalculo = b;
    }
    if (Array.isArray(raw.feriados)) out.feriados = [...new Set(raw.feriados.filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)))].slice(0, 600);
    if (Array.isArray(raw.abaErrada)) {
      for (const e of raw.abaErrada.slice(0, 30)) {
        const t = e && TYPE_BY_KEY[e.tipo];
        const palavras = Array.isArray(e && e.palavras) ? e.palavras.filter(p => typeof p === 'string' && p.trim() && p.length <= 60).map(p => semAcento(p).trim()).slice(0, 40) : [];
        if (t && t.key !== 'geral' && palavras.length) out.abaErrada.push({ tipo: t.key, palavras });
      }
    }
    const util = Object.keys(out.config).length || out.feriados.length || out.abaErrada.length;
    return util ? out : null;
  }

  // Ordem de precedência: padrões do código < regras do escritório < ajustes que a pessoa fez nas configurações.
  function combinarSettings(regrasGuardadas, usuario) {
    const base = Object.assign({}, DEFAULTS);
    const r = regrasGuardadas && regrasGuardadas.regras;
    if (r) {
      Object.assign(base, r.config || {});
      if (r.feriados && r.feriados.length) base.feriados = [...new Set(DEFAULTS.feriados.concat(r.feriados))].sort();
      if (r.abaErrada && r.abaErrada.length) base.abaErrada = r.abaErrada;
    }
    return Object.assign(base, usuario || {});
  }

  /* ---------- guias não visualizadas pelo cliente (Documentos do Onvio Gestão) ---------- */
  // Item de storage/v2/{Folders|Projects}/{id}/children. Pasta traz documentCount/hasFiles/readUserCount.
  function ehDocumento(x) {
    return !!x && typeof x === 'object' && typeof x.isReadByClientUser === 'boolean' &&
      !('documentCount' in x) && !('hasFiles' in x) && !('readUserCount' in x);
  }
  function parseVencimento(v) {
    if (!v || typeof v !== 'string') return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(v);
    return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  // Devolve null quando não é alerta (lida, sem vencimento ou longe do vencimento).
  function avaliarGuia(guia, settings, now) {
    const s = Object.assign({}, DEFAULTS, settings || {});
    if (!guia || guia.lido) return null;
    const venc = parseVencimento(guia.due);
    if (!venc) return null;
    now = now || new Date();
    const hoje = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dias = Math.round((venc - hoje) / 864e5);
    if (dias > s.guiaDias) return null;
    let nivel = 1, motivo;
    if (dias < 0) { nivel = 2; motivo = 'Venceu há ' + (-dias) + ' dia(s)'; }
    else if (dias === 0) { nivel = 2; motivo = 'Vence hoje'; }
    else if (dias === 1) { nivel = 2; motivo = 'Vence amanhã'; }
    else motivo = 'Vence em ' + dias + ' dias';
    return { dias, nivel, motivo, venc: ymd(venc) };
  }

  g.OC = { ORIGIN, API, PORTAL, TYPES, TYPE_BY_KEY, FAMILIAS, DEFAULTS, listUrl, collect, search, evaluate, normalize, parseDate, diasUteis, porAnalista, fmtData, gravidade, primeiroTramiteEsc, urlTramites, ehDocumento, parseVencimento, avaliarGuia, abaProvavel, normalizarRegras, combinarSettings, LIMITES, urlSonda, assinaturas, assinaturasDiferem };
})(typeof self !== 'undefined' ? self : this);

/*
 * Inventário de dados do Gestta (só leitura, sem valores)
 * -------------------------------------------------------
 * Para que serve: registrar o FORMATO de tudo o que a API do Gestta entrega a quem está logado (tarefas, clientes,
 * cartela, equipe, usuários de cliente, templates, fila de integração com o Onvio), para conferir o mapa
 * (mapeamento/gestta-2026-11-04.md) e perceber quando o Gestta mudar alguma coisa.
 *
 * Como usar:
 *   1. Abra o Gestta já logado (https://app.gestta.com.br/, em qualquer tela: Tarefas, admin, Dashboard...).
 *   2. F12 > Console. Cole este arquivo inteiro e tecle Enter (se o Chrome pedir, digite "allow pasting").
 *   3. Rode:   await __inventarioGestta.rodar()     (uns 30 segundos; ~35 leituras, uma por vez, com pausa)
 *   4. Rode:   __inventarioGestta.exportar()         (baixa inventario-gestta-<data>.json; suba o arquivo no chat)
 *      Resumo no console:  __inventarioGestta.resumo()
 *   5. Para olhar mais uma leitura:  await __inventarioGestta.sondar('/admin/caminho?param=1')
 *
 * Segurança e privacidade (garantidas pelo código, confira abaixo):
 *   - SÓ LEITURA: só GET em https://api.gestta.com.br, mais UMA exceção autorizada pelo Josué em 04/11/2026:
 *     POST /core/customer/task/search (a busca de tarefas, que só lê). Nunca PUT, PATCH, DELETE nem outro POST.
 *   - Nunca lê Senhas do cliente nem configurações da conta (password, smtp, billing, email-domain): recusa sem pedir.
 *   - O token (localStorage 'ngStorage-jwt') fica só dentro da função que faz a leitura: não entra no resultado, não
 *     vai ao console, não é exportado. Do localStorage, o resultado guarda só os NOMES das chaves (sem os ids).
 *   - NÃO grava valores: textos, nomes, CNPJ, e-mails e datas viram só o TIPO. Contagens (total, totalDocs) ficam.
 *   - Quando o Gestta responde erro (4xx/5xx), guarda o código e a mensagem curta (até 160 caracteres).
 *   - Pouca carga: uma leitura por vez, pausa de 300 ms, no máximo 60 leituras por execução, um mês na busca.
 */
(() => {
  if (window.__inventarioGestta) { console.warn('[inventario-gestta] já está carregado. Use __inventarioGestta.rodar()'); return; }

  const API = 'https://api.gestta.com.br';
  const MAX_LEITURAS = 60, PAUSA_MS = 300, PROF_MAX = 5;
  const POST_PERMITIDO = '/core/customer/task/search';
  const PROIBIDO = /password|senha|smtp|billing|email-domain|timesheet\/(start|stop)|\/batch\b/i;
  const estado = { versao: 1, iniciadoEm: new Date().toISOString(), app: null, leituras: 0, recursos: {}, navegador: null, rede: {}, erros: [] };
  const espera = ms => new Promise(r => setTimeout(r, ms));

  /* ---------- formato sem valores ---------- */
  function tipoDe(v) {
    if (v === null) return 'null';
    if (typeof v === 'string') {
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return 'texto:data-hora';
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'texto:data';
      if (/^[0-9a-f]{24}$/i.test(v)) return 'texto:id';
      if (/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(v)) return 'texto:guid';
      if (/^\d+$/.test(v)) return 'texto:numero';
      if (/^[A-Z][A-Z0-9_]{1,40}$/.test(v)) return 'texto:enum';            // OPEN, RECURRENT... (nome de opção)
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
  // valores de opção (enum) são configuração, não dado pessoal: guarda os distintos, no máximo 12 por campo
  function enums(lista, out) {
    out = out || {};
    for (const it of (lista || []).slice(0, 200)) {
      if (!it || typeof it !== 'object') continue;
      for (const [k, v] of Object.entries(it)) if (typeof v === 'string' && /^[A-Z][A-Z0-9_]{1,40}$/.test(v)) { const s = (out[k] ||= []); if (!s.includes(v) && s.length < 12) s.push(v); }
    }
    return out;
  }

  /* ---------- leitura ---------- */
  const normalizar = p => {
    try {
      const u = new URL(p, API);
      const c = u.pathname.replace(/\/[0-9a-f]{24}(?=\/|$)/gi, '/{id}').replace(/\/\d+(?=\/|$)/g, '/{num}');
      return c + (u.search ? '?' + [...new Set(u.searchParams.keys())].sort().join('&') : '');
    } catch (e) { return String(p).split('?')[0].slice(0, 120); }
  };
  function alvoSeguro(caminho, metodo) {
    try {
      const u = new URL(caminho, API);
      if (u.origin !== API) return null;
      if (PROIBIDO.test(u.pathname)) return null;
      if (metodo === 'POST' && u.pathname !== POST_PERMITIDO) return null;
      if (metodo !== 'GET' && metodo !== 'POST') return null;
      return u.href;
    } catch (e) { return null; }
  }
  function token() {
    try { const t = JSON.parse(localStorage.getItem('ngStorage-jwt') || 'null'); return typeof t === 'string' && t ? t : null; } catch (e) { return null; }
  }
  function xhr(metodo, url, corpo) {
    return new Promise(ok => {
      const t = token();                                     // só aqui, e só no cabeçalho
      if (!t) return ok({ status: 0, motivo: 'sem sessão do Gestta (faça login)' });
      const x = new XMLHttpRequest();
      x.open(metodo, url);
      x.setRequestHeader('Authorization', t);                // já vem como "JWT ...": não acrescentar "Bearer"
      x.setRequestHeader('Accept', 'application/json');
      if (corpo) x.setRequestHeader('Content-Type', 'application/json');
      x.onload = () => { let j = null; try { j = JSON.parse(x.responseText); } catch (e) {} ok({ status: x.status, corpo: j }); };
      x.onerror = () => ok({ status: 0, motivo: 'falha de rede' });
      x.send(corpo ? JSON.stringify(corpo) : null);
    });
  }
  async function ler(caminho, corpo) {
    const metodo = corpo ? 'POST' : 'GET';
    const alvo = alvoSeguro(caminho, metodo);
    if (!alvo) return { status: 0, motivo: 'recusado: fora de api.gestta.com.br, proibido ou método não permitido' };
    if (estado.leituras >= MAX_LEITURAS) return { status: 0, motivo: 'limite de leituras por execução' };
    estado.leituras++;
    await espera(PAUSA_MS);
    return xhr(metodo, alvo, corpo);
  }
  const listaDe = j => Array.isArray(j) ? j : j && Array.isArray(j.docs) ? j.docs : null;
  function resumir(r) {
    const out = { status: r.status };
    if (r.motivo) out.motivo = r.motivo;
    const j = r.corpo;
    if (r.status >= 400 && j && typeof j === 'object') out.erro = { code: String(j.code || j.error || j.statusCode || '').slice(0, 60), message: String(j.message || '').slice(0, 160) };
    if (r.status >= 200 && r.status < 300 && j && typeof j === 'object') {
      const lista = listaDe(j);
      if (lista) {
        out.itens = lista.length;
        if (!Array.isArray(j)) { out.involucro = Object.keys(j).filter(k => k !== 'docs'); for (const k of ['total', 'totalDocs', 'pages', 'totalPages', 'limit']) if (typeof j[k] === 'number') out[k] = j[k]; }
        if (lista.length) { out.item = formato(lista[0]); const e = enums(lista); if (Object.keys(e).length) out.opcoes = e; }
      } else out.objeto = formato(j);
    }
    return out;
  }
  async function registrar(nome, caminho, corpo) {
    const r = await ler(caminho, corpo);
    estado.recursos[nome] = Object.assign({ caminho: (corpo ? 'POST ' : 'GET ') + normalizar(caminho) }, resumir(r));
    if (corpo) estado.recursos[nome].corpo = formato(corpo);
    if (!r.status || r.status >= 400) estado.erros.push(nome + ': ' + (r.motivo || r.status));
    return r;
  }
  const idDe = r => { const l = listaDe(r && r.corpo); return l && l[0] && typeof l[0]._id === 'string' ? l[0]._id : null; };

  /* ---------- roteiro ---------- */
  function mesAtual() {
    const d = new Date(), ini = new Date(d.getFullYear(), d.getMonth(), 1), fim = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    const iso = x => x.toISOString();
    return { ini: iso(ini), fim: iso(fim) };
  }
  async function rodar() {
    estado.app = location.pathname.split('/')[1] || 'classico';
    const m = mesAtual();

    // escritório e apoio
    await registrar('eu', '/core/company/user/me');
    await registrar('setores', '/admin/company/department');
    await registrar('equipe', '/admin/company/user?active=true&limit=1&page=1&search=&sortField=name&sortType=asc');
    await registrar('equipeInativaComTarefas', '/admin/company/user/pending-transfer');
    await registrar('regimes', '/admin/company/regime');
    await registrar('agrupadores', '/admin/company/grouper');
    await registrar('etiquetas', '/admin/tag?type=CUSTOMER');
    await registrar('feriados', '/admin/company/holiday');
    await registrar('fluxos', '/admin/company/workflow');
    await registrar('templatesTarefa', '/admin/company/task?type=RECURRENT');
    await registrar('templatesDocumento', '/admin/company/document?limit=1&page=1&search=');
    await registrar('relatorios', '/core/report');

    // clientes, cartela e tarefas de um cliente (o primeiro da lista)
    const cli = await registrar('clientes', '/admin/customer?active=true&limit=1&page=1&search=');
    await registrar('clientesSemTarefa', '/admin/customer/count-without-task');
    const idCli = idDe(cli);
    if (idCli) {
      await registrar('cliente', '/admin/customer/' + idCli);
      await registrar('cartela', '/admin/customer/' + idCli + '/responsible');
      await registrar('tarefasDoCliente', '/admin/customer/' + idCli + '/company/task');
      await registrar('cnaes', '/admin/customer/' + idCli + '/cnae?customer=' + idCli);
      await registrar('certidoes', '/admin/customer/' + idCli + '/certificate');
    }

    // usuários de cliente e os setores de um deles
    const usu = await registrar('usuariosDeCliente', '/admin/customer/user?active=true&limit=1&page=1&search=');
    const idUsu = idDe(usu);
    if (idUsu) await registrar('setoresDoUsuarioDeCliente', '/admin/customer/user/' + idUsu + '/accountable');

    // integração com o Onvio e o Domínio
    await registrar('pendentesIntegracao', '/es/file/count-pending');
    await registrar('pendentesDominio', '/es/file/count-pending/dominio');
    await registrar('pendentesOnvio', '/es/file/count-pending/onvio');
    await registrar('filaOnvioComErro', '/es/file/onvio?limit=5&skip=0&status=ERROR');
    await registrar('notificacoes', '/nf/notification/count');

    // tarefas: calendário, busca (o único POST) e o detalhe da primeira
    await registrar('calendario', '/core/dashboard/calendar?start_date=' + encodeURIComponent(m.ini) + '&end_date=' + encodeURIComponent(m.fim) + '&no_owner=true&type=DUE_DATE');
    const busca = await registrar('buscaTarefas', POST_PERMITIDO, { page: 1, limit: 5, type: ['RECURRENT', 'SERVICE_ORDER', 'ACCOUNTING'], status: ['OPEN', 'IMPEDIMENT'], start_date: m.ini, end_date: m.fim, date_type: 'DUE_DATE', os_workflow: true });
    const idTar = idDe(busca);
    if (idTar) {
      await registrar('tarefa', '/core/customer/task/' + idTar);
      await registrar('historicoDaTarefa', '/core/customer/task/' + idTar + '/history?page=1');
      await registrar('colaboradoresDaTarefa', '/core/customer/task/' + idTar + '/collaborator');
    }

    // o que a página já chamou (performance do navegador): só caminhos normalizados, sem valores
    try {
      for (const e of performance.getEntriesByType('resource')) {
        if (!e.name.startsWith(API)) continue;
        const c = normalizar(e.name); estado.rede[c] = (estado.rede[c] || 0) + 1;
      }
    } catch (e) {}
    // navegador: só nomes das chaves, sem ids nem valores
    try { estado.navegador = { localStorage: Object.keys(localStorage).map(k => k.replace(/[0-9a-f]{24}/gi, '{id}').replace(/\d{4}-\d{2}-\d{2}/g, '{data}')).sort() }; } catch (e) { estado.navegador = { erro: 'sem acesso' }; }

    return resumo();
  }

  function resumo() {
    const r = Object.entries(estado.recursos);
    const ok = r.filter(([, v]) => v.status >= 200 && v.status < 300).length;
    const out = { app: estado.app, leituras: estado.leituras, recursos: r.length, ok, erros: estado.erros.slice(0, 20) };
    console.table(r.map(([k, v]) => ({ recurso: k, caminho: v.caminho, status: v.status, itens: v.itens, total: v.totalDocs ?? v.total })));
    return out;
  }
  function exportar() {
    const blob = new Blob([JSON.stringify(estado, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'inventario-gestta-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return a.download;
  }
  async function sondar(caminho) { const nome = 'sonda ' + normalizar(caminho); await registrar(nome, caminho); return estado.recursos[nome]; }

  window.__inventarioGestta = {
    rodar, resumo, exportar, sondar,
    estado: () => JSON.parse(JSON.stringify(estado)),
    _teste: { ler: (c, corpo) => ler(c, corpo), alvoSeguro, tipoDe }
  };
  console.log('[inventario-gestta] pronto. Rode: await __inventarioGestta.rodar()');
})();

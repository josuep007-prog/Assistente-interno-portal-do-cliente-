/*
 * Captura de mapa do Onvio Portal do Cliente
 * -------------------------------------------
 * Como usar:
 *   1. Abra https://onvio.com.br/br-portal-do-cliente/ já logado.
 *   2. F12 > Console. Cole este arquivo inteiro e tecle Enter.
 *      (Se o Chrome pedir, digite "allow pasting" antes.)
 *   3. Navegue normalmente pelas telas que quer mapear: Solicitações de Serviço
 *      (todos os submenus e sub-abas), Documentos, abra um modal de solicitação,
 *      troque de aba Dados/Trâmites, use filtros e paginação.
 *      A cada troca de tela o script tira um "retrato" da estrutura.
 *   4. No fim, rode no console:  __mapaOnvio.exportar()
 *      Baixa um arquivo mapa-onvio-<data>.json. Suba esse arquivo no chat.
 *
 * Privacidade: o script NÃO grava conteúdo de células, nomes, CPFs, e-mails nem
 * corpos de resposta. Grava só estrutura: rotas, títulos, abas, cabeçalhos de
 * tabela, rótulos de campos/botões, seletores CSS e o "formato" (chaves e tipos)
 * das respostas de API. Ids numéricos/GUIDs nas URLs viram {id}.
 *
 * Para capturar manualmente a tela atual (ex.: com um modal aberto):
 *   __mapaOnvio.capturar('nome-opcional')
 */
(() => {
  if (window.__mapaOnvio) {
    console.warn('[mapa-onvio] já está rodando. Use __mapaOnvio.exportar()');
    return;
  }

  const estado = { iniciadoEm: new Date().toISOString(), telas: [], api: {} };

  const limparTexto = (t, max = 80) => (t || '').replace(/\s+/g, ' ').trim().slice(0, max);

  const normalizarUrl = (url) => {
    try {
      const u = new URL(url, location.href);
      const caminho = u.pathname
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '{id}')
        .replace(/\/\d+(?=\/|$)/g, '/{id}');
      const params = [...u.searchParams.keys()].sort();
      return { host: u.host, caminho, params };
    } catch {
      return { host: '', caminho: String(url), params: [] };
    }
  };

  // Formato de um JSON (chaves e tipos), sem valores.
  const formato = (v, prof = 0) => {
    if (prof > 4) return '…';
    if (Array.isArray(v)) return v.length ? [formato(v[0], prof + 1)] : [];
    if (v && typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v).slice(0, 60)) o[k] = formato(v[k], prof + 1);
      return o;
    }
    return v === null ? 'null' : typeof v;
  };

  const registrarApi = (metodo, url, status, corpo) => {
    const n = normalizarUrl(url);
    if (!/onvio|thomsonreuters|dominio/i.test(n.host)) return;
    if (/\.(js|css|png|svg|woff2?|ico|jpg|gif)$/i.test(n.caminho)) return;
    const chave = `${metodo.toUpperCase()} ${n.host}${n.caminho}`;
    const item = (estado.api[chave] ||= { metodo, host: n.host, caminho: n.caminho, params: [], status: [], telas: [], formato: null, vezes: 0 });
    item.vezes++;
    for (const p of n.params) if (!item.params.includes(p)) item.params.push(p);
    if (!item.status.includes(status)) item.status.push(status);
    const tela = location.pathname + location.hash;
    if (!item.telas.includes(tela)) item.telas.push(tela);
    if (!item.formato && corpo !== undefined) item.formato = corpo;
  };

  const tentarFormato = async (resposta) => {
    try {
      const tipo = resposta.headers.get('content-type') || '';
      if (!tipo.includes('json')) return `(${tipo.split(';')[0] || 'sem content-type'})`;
      return formato(await resposta.clone().json());
    } catch {
      return undefined;
    }
  };

  // Intercepta fetch
  const fetchOriginal = window.fetch;
  window.fetch = async function (entrada, init) {
    const resp = await fetchOriginal.apply(this, arguments);
    try {
      const url = typeof entrada === 'string' ? entrada : entrada.url;
      const metodo = (init && init.method) || (entrada && entrada.method) || 'GET';
      tentarFormato(resp).then((f) => registrarApi(metodo, url, resp.status, f));
    } catch {}
    return resp;
  };

  // Intercepta XMLHttpRequest (Angular usa XHR)
  const abrirOriginal = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (metodo, url) {
    this.__mapa = { metodo, url };
    this.addEventListener('loadend', () => {
      let f;
      try {
        const tipo = this.getResponseHeader('content-type') || '';
        if (tipo.includes('json')) {
          f = formato(this.responseType === 'json' ? this.response : JSON.parse(this.responseText));
        } else {
          f = `(${tipo.split(';')[0] || 'sem content-type'})`;
        }
      } catch {}
      registrarApi(this.__mapa.metodo, this.__mapa.url, this.status, f);
    });
    return abrirOriginal.apply(this, arguments);
  };

  // Seletor CSS razoavelmente estável para um elemento.
  const seletor = (el) => {
    if (!el || el.nodeType !== 1) return '';
    if (el.id && !/^\d|[0-9a-f]{8}-/.test(el.id)) return `#${CSS.escape(el.id)}`;
    for (const a of ['data-testid', 'data-qa', 'data-test', 'name', 'formcontrolname', 'aria-label']) {
      const v = el.getAttribute(a);
      if (v) return `${el.tagName.toLowerCase()}[${a}="${v}"]`;
    }
    const partes = [];
    let atual = el;
    while (atual && atual.nodeType === 1 && partes.length < 4) {
      let p = atual.tagName.toLowerCase();
      const classes = [...atual.classList].filter((c) => !/^ng-|^is-|active|hover|focus/.test(c)).slice(0, 2);
      if (classes.length) p += '.' + classes.map((c) => CSS.escape(c)).join('.');
      partes.unshift(p);
      if (atual.id) break;
      atual = atual.parentElement;
    }
    return partes.join(' > ');
  };

  const visivel = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };

  const rotulo = (el) => {
    const id = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    return limparTexto(
      el.getAttribute('aria-label') ||
        (id && id.textContent) ||
        el.closest('label')?.textContent ||
        el.getAttribute('placeholder') ||
        el.getAttribute('title') ||
        (['BUTTON', 'A'].includes(el.tagName) ? el.textContent : '')
    );
  };

  const capturar = (nome) => {
    const doc = document;
    const tela = {
      nome: nome || null,
      quando: new Date().toISOString(),
      url: location.pathname + location.hash,
      titulo: limparTexto(doc.title),
      cabecalhos: [...doc.querySelectorAll('h1,h2,h3,h4,[role="heading"]')].filter(visivel).map((e) => limparTexto(e.textContent)).filter(Boolean),
      menu: [...doc.querySelectorAll('nav a, [role="menuitem"], [role="treeitem"], aside a')]
        .filter(visivel)
        .map((a) => ({ texto: limparTexto(a.textContent), href: a.getAttribute('href') || null, seletor: seletor(a) }))
        .filter((m) => m.texto),
      abas: [...doc.querySelectorAll('[role="tab"], .nav-tabs a, .tabs a, mat-tab-header .mat-tab-label')]
        .filter(visivel)
        .map((t) => ({ texto: limparTexto(t.textContent), ativa: t.getAttribute('aria-selected') === 'true' || t.classList.contains('active'), seletor: seletor(t) })),
      tabelas: [...doc.querySelectorAll('table, [role="grid"], [role="table"]')].filter(visivel).map((t) => ({
        seletor: seletor(t),
        colunas: [...t.querySelectorAll('th, [role="columnheader"]')].map((c) => limparTexto(c.textContent)).filter(Boolean),
        linhas: t.querySelectorAll('tbody tr, [role="row"]').length,
        acoesPorLinha: [...new Set([...t.querySelectorAll('tbody tr:first-child button, tbody tr:first-child a, tbody tr:first-child [role="button"]')].map((b) => rotulo(b) || seletor(b)))],
      })),
      campos: [...doc.querySelectorAll('input, select, textarea, [role="combobox"], [role="checkbox"], [role="switch"]')]
        .filter((e) => e.type !== 'hidden' && visivel(e))
        .map((e) => ({ tipo: e.getAttribute('role') || e.type || e.tagName.toLowerCase(), rotulo: rotulo(e), seletor: seletor(e) })),
      botoes: [...doc.querySelectorAll('button, [role="button"], input[type="submit"]')]
        .filter((b) => visivel(b) && !b.closest('table'))
        .map((b) => ({ texto: rotulo(b), seletor: seletor(b), desabilitado: !!b.disabled }))
        .filter((b) => b.texto),
      modais: [...doc.querySelectorAll('[role="dialog"], .modal.show, .modal.in, mat-dialog-container')].filter(visivel).map((m) => ({
        seletor: seletor(m),
        titulo: limparTexto(m.querySelector('h1,h2,h3,h4,.modal-title')?.textContent),
      })),
      rodapes: [...doc.querySelectorAll('body *')]
        .filter((e) => e.children.length === 0 && /Exibindo\s+\d+\s+a\s+\d+\s+de\s+\d+/i.test(e.textContent))
        .map((e) => ({ texto: limparTexto(e.textContent), seletor: seletor(e) })),
      iframes: [...doc.querySelectorAll('iframe')].map((f) => normalizarUrl(f.src).caminho),
    };
    estado.telas.push(tela);
    console.log(`[mapa-onvio] tela capturada: ${tela.url} (${estado.telas.length} no total)`);
    return tela;
  };

  // Captura automática quando a rota muda (SPA) ou a tela "assenta".
  let temporizador;
  let ultimaUrl = '';
  const agendar = () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      const url = location.pathname + location.hash;
      if (url !== ultimaUrl) {
        ultimaUrl = url;
        capturar();
      }
    }, 2500);
  };
  for (const m of ['pushState', 'replaceState']) {
    const original = history[m];
    history[m] = function () {
      const r = original.apply(this, arguments);
      agendar();
      return r;
    };
  }
  addEventListener('popstate', agendar);
  addEventListener('hashchange', agendar);

  const exportar = () => {
    const dados = { ...estado, exportadoEm: new Date().toISOString(), api: Object.values(estado.api).sort((a, b) => a.caminho.localeCompare(b.caminho)) };
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mapa-onvio-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    console.log(`[mapa-onvio] exportado: ${dados.telas.length} telas, ${dados.api.length} endpoints`);
  };

  window.__mapaOnvio = { capturar, exportar, estado };
  capturar('inicial');
  console.log('[mapa-onvio] ativo. Navegue pelo portal e rode __mapaOnvio.exportar() no fim.');
})();

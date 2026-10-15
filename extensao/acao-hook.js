/* Control Onvio · percebe quando a página altera solicitações (e, no modo aprender, o formato das chamadas)
 * Roda no mundo da PÁGINA (world: MAIN) do Portal do Cliente.
 *
 * Sempre: quando o Onvio faz uma chamada que altera dados (POST, PUT, PATCH ou DELETE em solicitações de
 * serviço), avisa o shell.js, que pede uma leitura imediata. O aviso não leva conteúdo.
 *
 * Modo aprender (ligado em Configurações, só para mapear as ações na empresa de teste): registra o FORMATO de
 * cada chamada à API do Onvio (método, caminho com ids trocados por {id}, nomes e tipos dos campos do
 * corpo e da resposta). Nunca grava valores: textos, nomes, CPF, datas e números viram só o tipo.
 */
(function () {
  'use strict';
  if (window.__controlOnvioAcao) return;
  window.__controlOnvioAcao = true;

  const RE = /\/api\/(?:service-requesting|br-payroll-sr)\//i;
  // No modo aprender vale qualquer API do Onvio: os trâmites de algumas listas podem vir de outro serviço.
  const RE_API = /\/api\//i;
  const altera = m => /^(POST|PUT|PATCH|DELETE)$/i.test(String(m || 'GET'));
  const postar = msg => { try { window.postMessage(Object.assign({ src: 'controlonvio' }, msg), location.origin); } catch (e) {} };
  const aviso = () => postar({ tipo: 'mudanca' });

  /* Autorização que o próprio Onvio manda nas chamadas de solicitações: fica só na memória desta página (nunca é
   * gravada nem enviada à extensão) e é usada pelas ações do Control Onvio feitas nesta mesma aba. */
  let autorizacao = null;
  try { Object.defineProperty(window, '__controlOnvioAutorizacao', { value: () => autorizacao, configurable: false, enumerable: false, writable: false }); } catch (e) {}
  const guardarAuth = v => { if (typeof v === 'string' && v.length < 8192) autorizacao = v; };

  /* ---------- modo aprender ---------- */
  let aprendendo = false;
  window.addEventListener('message', ev => {
    const d = ev.data;
    if (ev.source === window && d && d.src === 'controlonvio' && d.tipo === 'aprender') aprendendo = !!d.ligado;
  });

  // Tipo de um valor, sem o valor. Strings ganham uma pista do formato (data, guid), útil para montar as chamadas.
  function tipoDe(v) {
    if (v === null) return 'null';
    if (typeof v === 'string') {
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return 'texto:data-hora';
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'texto:data';
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return 'texto:guid';
      if (/^\d+$/.test(v)) return 'texto:numero';
      return 'texto';
    }
    return typeof v;
  }
  function formato(v, prof) {
    prof = prof || 0;
    if (prof > 5) return '…';
    if (Array.isArray(v)) return v.length ? [formato(v[0], prof + 1)] : [];
    if (v && typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v).slice(0, 80)) o[k] = formato(v[k], prof + 1);
      return o;
    }
    return tipoDe(v);
  }

  // Caminho sem ids; da query, só os nomes, e os valores apenas de parâmetros técnicos (nunca de busca ou filtro com dados).
  const VALOR_OK = new Set(['expand', 'orderBy', 'itemsPerPage', 'pageIndex', 'startIndex', 'assignedtome', 'requestTypes', 'sort', 'containersOnly']);
  function caminho(url) {
    try {
      const u = new URL(url, location.href);
      const p = u.pathname
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '{id}')
        .replace(/\/\d+(?=\/|$)/g, '/{id}');
      const q = {};
      for (const [k, v] of u.searchParams) {
        if (VALOR_OK.has(k)) q[k] = v.slice(0, 200);
        else if (k === 'filter') { try { q[k] = JSON.parse(v).groups.map(g => g.items.map(i => i.by + ' ' + i.op)); } catch (e) { q[k] = '…'; } }
        else q[k] = '…';
      }
      return { caminho: p, query: q };
    } catch (e) { return { caminho: '?', query: {} }; }
  }

  function formatoDoCorpo(corpo) {
    try {
      if (corpo == null) return null;
      if (typeof corpo === 'string') { try { return { json: formato(JSON.parse(corpo)) }; } catch (e) { return { texto: corpo.length + ' caracteres' }; } }
      if (typeof FormData !== 'undefined' && corpo instanceof FormData) {
        const campos = {};
        for (const [k, v] of corpo.entries()) campos[k] = (typeof File !== 'undefined' && v instanceof File) ? 'arquivo(' + (v.type || 'sem tipo') + ')' : tipoDe(v);
        return { multipart: campos };
      }
      if (typeof URLSearchParams !== 'undefined' && corpo instanceof URLSearchParams) return { formulario: [...corpo.keys()] };
      if (typeof Blob !== 'undefined' && corpo instanceof Blob) return { blob: corpo.type || 'sem tipo' };
      if (corpo instanceof ArrayBuffer || ArrayBuffer.isView(corpo)) return { binario: true };
    } catch (e) {}
    return { outro: typeof corpo };
  }

  function registrar(r) {
    if (!aprendendo) return;
    r.rota = caminho(location.href).caminho;
    r.em = new Date().toISOString();
    postar({ tipo: 'aprendido', registro: r });
  }

  async function formatoDaResposta(ct, ler) {
    if (!/json/i.test(ct || '')) return ct ? { tipo: String(ct).split(';')[0] } : null;
    try { return { json: formato(await ler()) }; } catch (e) { return { tipo: 'json inválido' }; }
  }

  /* ---------- fetch ---------- */
  const fetchOriginal = window.fetch;
  if (typeof fetchOriginal === 'function') {
    window.fetch = function (entrada, init) {
      const p = fetchOriginal.apply(this, arguments);
      try {
        const url = typeof entrada === 'string' ? entrada : entrada && entrada.url;
        const metodo = String((init && init.method) || (entrada && entrada.method) || 'GET').toUpperCase();
        if (url && RE.test(url) && init && init.headers) { try { guardarAuth(new Headers(init.headers).get('authorization')); } catch (e) {} }
        if (url && RE_API.test(url) && (RE.test(url) || aprendendo)) {
          if (altera(metodo) && RE.test(url)) p.then(r => { if (r && r.ok) aviso(); }).catch(() => {});
          if (aprendendo) {
            const corpo = formatoDoCorpo(init && init.body);
            const ctPedido = init && init.headers ? (new Headers(init.headers).get('content-type') || '') : '';
            p.then(async r => registrar(Object.assign({ via: 'fetch', metodo, status: r.status, contentTypePedido: ctPedido, corpo }, caminho(url), { resposta: await formatoDaResposta(r.headers.get('content-type'), () => r.clone().json()) }))).catch(() => {});
          }
        }
      } catch (e) {}
      return p;
    };
  }

  /* ---------- XMLHttpRequest (o Onvio usa Angular, que usa XHR) ---------- */
  const abrirOriginal = XMLHttpRequest.prototype.open;
  const enviarOriginal = XMLHttpRequest.prototype.send;
  const cabecalhoOriginal = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (metodo, url) {
    try {
      const u = String(url), m = String(metodo || 'GET').toUpperCase();
      const nosso = RE.test(u);
      if (nosso || (aprendendo && RE_API.test(u))) {
        this.__co = { metodo: m, url: u, ct: '' };
        this.addEventListener('load', () => {
          if (nosso && this.status >= 200 && this.status < 300 && altera(m)) aviso();
          if (aprendendo && this.__co) {
            const ct = this.getResponseHeader('content-type');
            formatoDaResposta(ct, () => (this.responseType === 'json' ? this.response : JSON.parse(this.responseText)))
              .then(resposta => registrar(Object.assign({ via: 'xhr', metodo: m, status: this.status, contentTypePedido: this.__co.ct, corpo: this.__co.corpo }, caminho(u), { resposta })));
          }
        });
      }
    } catch (e) {}
    return abrirOriginal.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (nome, valor) {
    try {
      if (this.__co && /^content-type$/i.test(nome)) this.__co.ct = String(valor).slice(0, 120);
      if (this.__co && /^authorization$/i.test(nome) && RE.test(this.__co.url)) guardarAuth(valor);
    } catch (e) {}
    return cabecalhoOriginal.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (corpo) {
    try { if (this.__co && aprendendo) this.__co.corpo = formatoDoCorpo(corpo); } catch (e) {}
    return enviarOriginal.apply(this, arguments);
  };
})();

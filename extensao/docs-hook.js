/* Control Onvio · escuta as respostas de Documentos (Onvio Gestão)
 * Roda no mundo da PÁGINA (world: MAIN) para enxergar o fetch/XHR do próprio Onvio.
 * Não faz nenhuma chamada nova: só copia, das respostas que a página já recebeu, os campos
 * mínimos de cada documento (nome, lido pelo cliente, vencimento) e repassa à ponte (docs-ponte.js).
 */
(function () {
  'use strict';
  if (window.__controlOnvioHook) return;
  window.__controlOnvioHook = true;

  const RE_FILHOS = /\/storage\/v2\/(?:Folders|Projects)\/([^/?#]+)\/children/i;
  const RE_CLIENTES = /\/core\/v3\/companies\/[^/]+\/clients\/search/i;
  const txt = (v, n) => (typeof v === 'string' ? v.slice(0, n || 200) : '');

  function itens(j) {
    const d = j && (j.data || j);
    return (d && d.items) || (Array.isArray(d) ? d : []);
  }

  function processar(url, j) {
    try {
      let m = RE_FILHOS.exec(url);
      if (m) {
        const u = new URL(url, location.href);
        const docs = [];
        for (const x of itens(j)) {
          if (!x || typeof x.isReadByClientUser !== 'boolean') continue;
          if ('documentCount' in x || 'hasFiles' in x || 'readUserCount' in x) continue; // pasta
          const cf = x.customFields || {};
          docs.push({
            id: txt(x.id), nome: txt(x.name), lido: x.isReadByClientUser,
            due: txt(cf.dueDate, 40), clientId: txt(cf.clientId, 80), link: txt(x.staffCenterViewPath, 300)
          });
        }
        window.postMessage({ src: 'controlonvio', tipo: 'filhos', pasta: txt(m[1], 80), from: Number(u.searchParams.get('from')) || 0, docs }, location.origin);
        return;
      }
      if (RE_CLIENTES.test(url)) {
        const cli = [];
        for (const x of itens(j).slice(0, 500)) {
          const nome = x && (x.nickname || x.name || x.displayName);
          if (x && x.id && nome) cli.push({ id: txt(String(x.id), 80), nome: txt(nome, 120) });
        }
        if (cli.length) window.postMessage({ src: 'controlonvio', tipo: 'clientes', cli }, location.origin);
      }
    } catch (e) { /* nunca atrapalha a página */ }
  }

  const interessa = url => typeof url === 'string' && (RE_FILHOS.test(url) || RE_CLIENTES.test(url));

  const fetchOriginal = window.fetch;
  if (typeof fetchOriginal === 'function') {
    window.fetch = function (entrada) {
      const p = fetchOriginal.apply(this, arguments);
      try {
        const url = typeof entrada === 'string' ? entrada : entrada && entrada.url;
        if (interessa(url)) p.then(r => r.clone().json()).then(j => processar(url, j)).catch(() => {});
      } catch (e) {}
      return p;
    };
  }

  const abrirOriginal = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (metodo, url) {
    try {
      const u = String(url);
      if (interessa(u)) {
        this.addEventListener('load', () => {
          try {
            const corpo = this.responseType === 'json' ? this.response : (this.responseType === '' || this.responseType === 'text') ? JSON.parse(this.responseText) : null;
            if (corpo) processar(u, corpo);
          } catch (e) {}
        });
      }
    } catch (e) {}
    return abrirOriginal.apply(this, arguments);
  };
})();

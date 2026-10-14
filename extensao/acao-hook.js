/* Control Onvio · percebe quando a página altera solicitações
 * Roda no mundo da PÁGINA (world: MAIN) do Portal do Cliente. Quando o Onvio faz uma chamada que altera dados
 * (POST, PUT, PATCH ou DELETE em solicitações de serviço), avisa o shell.js, que pede uma leitura imediata.
 * Não lê, não guarda e não altera nada: só manda um aviso sem conteúdo.
 */
(function () {
  'use strict';
  if (window.__controlOnvioAcao) return;
  window.__controlOnvioAcao = true;

  const RE = /\/api\/(?:service-requesting|br-payroll-sr)\//i;
  const aviso = () => { try { window.postMessage({ src: 'controlonvio', tipo: 'mudanca' }, location.origin); } catch (e) {} };
  const altera = m => /^(POST|PUT|PATCH|DELETE)$/i.test(String(m || 'GET'));

  const fetchOriginal = window.fetch;
  if (typeof fetchOriginal === 'function') {
    window.fetch = function (entrada, init) {
      const p = fetchOriginal.apply(this, arguments);
      try {
        const url = typeof entrada === 'string' ? entrada : entrada && entrada.url;
        const metodo = (init && init.method) || (entrada && entrada.method);
        if (url && RE.test(url) && altera(metodo)) p.then(r => { if (r && r.ok) aviso(); }).catch(() => {});
      } catch (e) {}
      return p;
    };
  }

  const abrirOriginal = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (metodo, url) {
    try {
      if (RE.test(String(url)) && altera(metodo)) {
        this.addEventListener('load', () => { if (this.status >= 200 && this.status < 300) aviso(); });
      }
    } catch (e) {}
    return abrirOriginal.apply(this, arguments);
  };
})();

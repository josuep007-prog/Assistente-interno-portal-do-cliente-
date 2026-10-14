/* Control Onvio · content script no Portal do Cliente
 * Quando o painel pede para abrir uma solicitação, filtra a grade pelo ID.
 */
(async function () {
  'use strict';
  let pedido;
  try { ({ abrir: pedido } = await chrome.storage.local.get('abrir')); } catch (e) { return; }
  if (!pedido || Date.now() - pedido.ts > 120000) return;
  if (!location.pathname.includes(pedido.route)) return;
  await chrome.storage.local.remove('abrir');

  const espera = ms => new Promise(r => setTimeout(r, ms));
  let campo = null;
  for (let i = 0; i < 60 && !campo; i++) {
    campo = [...document.querySelectorAll('input[placeholder="Pesquisar"]')].find(x => x.offsetParent !== null);
    if (!campo) await espera(500);
  }
  if (!campo) return aviso('Não achei o campo Pesquisar. Procure a solicitação #' + pedido.num + ' na grade.');
  await espera(800); // deixa a grade terminar a primeira carga

  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  campo.focus();
  setter.call(campo, pedido.num);
  campo.dispatchEvent(new Event('input', { bubbles: true }));
  for (const tipo of ['keydown', 'keypress', 'keyup']) campo.dispatchEvent(new KeyboardEvent(tipo, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
  aviso('Grade filtrada pela solicitação #' + pedido.num);

  function aviso(msg) {
    const d = document.createElement('div');
    d.textContent = msg;
    d.style.cssText = 'position:fixed;z-index:2147483647;bottom:22px;left:50%;transform:translateX(-50%);background:#101820;color:#EDF0F3;padding:11px 16px;border-radius:4px;border-left:4px solid #6BAAC9;font:600 13px/1.4 "IBM Plex Sans",system-ui,sans-serif;box-shadow:0 2px 4px rgba(16,24,32,.08),0 14px 32px rgba(16,24,32,.12)';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 3500);
  }
})();

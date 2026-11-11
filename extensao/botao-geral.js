/* Control Onvio · o botão flutuante em qualquer site (0.91.0, pedido do Josué em 10/11/2026)
 * Um botão arrastável em todos os sites (menos no Portal do Cliente e no Gestta, que têm o seu). Ao clicar, a pessoa escolhe:
 * ir para o Onvio, para o Gestta ou para os dois. A extensão só leva às guias (cmd irPara no service worker): nada abre por cima
 * sozinho, e este script não lê nada da página onde está. Dá para esconder em um site (no menu) ou em todos (Configurações › Aparência).
 */
(function () {
  'use strict';
  if (window.top !== window || window.__controlBotaoGeral) return;
  if (!/^https?:$/.test(location.protocol)) return;
  if (location.origin === 'https://app.gestta.com.br' || (location.origin === 'https://onvio.com.br' && /^\/br-portal-do-cliente(\/|$)/i.test(location.pathname))) return;
  window.__controlBotaoGeral = true;

  const viva = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } };
  const LOGO = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 258 320%22%3E%3Cdefs%3E%3ClinearGradient id=%22a%22 gradientUnits=%22userSpaceOnUse%22 x1=%2235.5%22 y1=%22175%22 x2=%22220.5%22 y2=%22294%22%3E%3Cstop offset=%22.22%22 stop-color=%22%23550E0B%22/%3E%3Cstop offset=%22.4%22 stop-color=%22%237F0E0D%22/%3E%3Cstop offset=%22.5%22 stop-color=%22%239B0D0E%22/%3E%3Cstop offset=%22.65%22 stop-color=%22%23B20A0E%22/%3E%3Cstop offset=%22.8%22 stop-color=%22%23BE090E%22/%3E%3Cstop offset=%221%22 stop-color=%22%23C3080E%22/%3E%3C/linearGradient%3E%3ClinearGradient id=%22b%22 gradientUnits=%22userSpaceOnUse%22 x1=%22135.25%22 y1=%22172%22 x2=%22228.5%22 y2=%22232%22%3E%3Cstop offset=%22.22%22 stop-color=%22%23550E0B%22/%3E%3Cstop offset=%22.4%22 stop-color=%22%237F0E0D%22/%3E%3Cstop offset=%22.5%22 stop-color=%22%239B0D0E%22/%3E%3Cstop offset=%22.65%22 stop-color=%22%23B20A0E%22/%3E%3Cstop offset=%22.8%22 stop-color=%22%23BE090E%22/%3E%3Cstop offset=%221%22 stop-color=%22%23C3080E%22/%3E%3C/linearGradient%3E%3ClinearGradient id=%22c%22 x1=%220%22 y1=%220%22 x2=%220%22 y2=%221%22%3E%3Cstop offset=%220%22 stop-color=%22%2386D0E3%22/%3E%3Cstop offset=%22.5%22 stop-color=%22%235E96BC%22/%3E%3Cstop offset=%221%22 stop-color=%22%23385F97%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Cg fill=%22none%22 stroke-linecap=%22round%22%3E%3Cpath d=%22M35.5 175L220.5 294%22 stroke=%22url(%23a)%22 stroke-width=%2252.5%22/%3E%3Cpath d=%22M135.25 172L228.5 232%22 stroke=%22url(%23b)%22 stroke-width=%2232%22/%3E%3Cpath d=%22M26.25 168L213.25 25.5%22 stroke=%22%23C2000C%22 stroke-width=%2252.5%22/%3E%3Cpath d=%22M123.25 165L223 89%22 stroke=%22%23C2000C%22 stroke-width=%2232%22/%3E%3C/g%3E%3Ccircle cx=%22224.5%22 cy=%22161%22 r=%2233.5%22 fill=%22url(%23c)%22/%3E%3C/svg%3E';
  const site = location.hostname;

  const host = document.createElement('div');
  host.id = 'controlonvio-botao-geral';
  host.style.cssText = 'all:initial;position:fixed;inset:auto 0 0 auto;z-index:2147483000;';
  const raiz = host.attachShadow({ mode: 'closed' });
  raiz.innerHTML = `
    <style>
      :host{all:initial}
      *{box-sizing:border-box}
      .launcher{position:fixed;right:18px;bottom:84px;width:44px;height:44px;padding:0;border:0;border-radius:50%;background:#0E151B;cursor:pointer;display:grid;place-items:center;
        box-shadow:0 2px 6px rgba(16,24,32,.22),0 10px 24px rgba(16,24,32,.28);transition:transform .15s ease;touch-action:none}
      .launcher:hover{transform:scale(1.08)}
      .launcher:focus-visible,.op:focus-visible,.link:focus-visible{outline:2px solid #6BAAC9;outline-offset:2px}
      .launcher .mark{width:32px;height:32px;border-radius:50%;background:#fff;display:grid;place-items:center}
      .launcher .mark img{width:16px;height:20px}
      .menu{position:fixed;width:244px;padding:8px;border-radius:8px;background:#fff;color:#101820;border:1px solid #C9D3DB;
        box-shadow:0 10px 30px rgba(16,24,32,.28);font:13px/1.35 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;display:none}
      .menu.on{display:block}
      .tit{padding:4px 8px 6px;font-size:12px;font-weight:600;color:#4B5963}
      .op{display:flex;flex-direction:column;gap:1px;width:100%;padding:8px;border:0;border-radius:6px;background:none;color:inherit;text-align:left;cursor:pointer;font:inherit}
      .op:hover{background:#EEF3F7}
      .op b{font-size:13.5px;font-weight:600}
      .op small{font-size:12px;color:#4B5963}
      hr{border:0;border-top:1px solid #DCE3E9;margin:6px 0}
      .rod{display:flex;justify-content:space-between;gap:8px;padding:2px 8px}
      .link{padding:4px 0;border:0;background:none;color:#2F5A8E;font:inherit;font-size:12px;cursor:pointer;text-decoration:underline}
      @media (prefers-color-scheme:dark){
        .menu{background:#16212B;color:#EAF0F5;border-color:#33434F}
        .op:hover{background:#22313D} .op small,.tit{color:#B4C2CD} hr{border-top-color:#33434F} .link{color:#9CC4EE}
      }
      @media (prefers-reduced-motion:reduce){.launcher{transition:none}}
      @media print{:host{display:none}}
    </style>
    <button class="launcher" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="Control: ir para o Onvio ou o Gestta" title="Control · ir para o Onvio ou o Gestta">
      <span class="mark"><img alt="" src="${LOGO}"></span>
    </button>
    <div class="menu" role="menu" aria-label="Ir para">
      <div class="tit">Control · ir para</div>
      <button class="op" role="menuitem" type="button" data-ir="onvio"><b>Onvio</b><small>Portal do Cliente · Solicitações</small></button>
      <button class="op" role="menuitem" type="button" data-ir="gestta"><b>Gestta</b><small>Tarefas e fechamento do mês</small></button>
      <button class="op" role="menuitem" type="button" data-ir="ambos"><b>Os dois</b><small>Cada um na sua guia</small></button>
      <hr>
      <div class="rod"><button class="link" type="button" data-acao="esconder">Esconder neste site</button><button class="link" type="button" data-acao="config">Configurações</button></div>
    </div>`;
  const launcher = raiz.querySelector('.launcher'), menu = raiz.querySelector('.menu');

  /* ---------- menu ---------- */
  let aberto = false;
  function posicionarMenu() {
    const r = launcher.getBoundingClientRect(), w = 244, h = menu.offsetHeight || 190;
    menu.style.right = Math.max(8, Math.min(innerWidth - w - 8, innerWidth - r.right)) + 'px';
    const acima = r.top - h - 8 >= 8;
    menu.style.bottom = acima ? (innerHeight - r.top + 8) + 'px' : 'auto';
    menu.style.top = acima ? 'auto' : Math.min(innerHeight - h - 8, r.bottom + 8) + 'px';
  }
  function abrirMenu(v) {
    aberto = v; menu.classList.toggle('on', v); launcher.setAttribute('aria-expanded', String(v));
    if (v) { posicionarMenu(); const p = menu.querySelector('.op'); if (p) p.focus(); } else if (raiz.activeElement && menu.contains(raiz.activeElement)) launcher.focus();
  }
  document.addEventListener('pointerdown', e => { if (aberto && !e.composedPath().includes(host)) abrirMenu(false); }, true);
  addEventListener('keydown', e => { if (aberto && e.key === 'Escape') { e.stopPropagation(); abrirMenu(false); } }, true);
  addEventListener('resize', () => { if (aberto) posicionarMenu(); });
  menu.addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const itens = [...menu.querySelectorAll('.op,.link')], i = itens.indexOf(raiz.activeElement);
    e.preventDefault(); itens[(i + (e.key === 'ArrowDown' ? 1 : -1) + itens.length) % itens.length].focus();
  });
  menu.addEventListener('click', e => {
    const b = e.target.closest('[data-ir],[data-acao]'); if (!b || !viva()) return;
    abrirMenu(false);
    if (b.dataset.ir) chrome.runtime.sendMessage({ cmd: 'irPara', destino: b.dataset.ir }, () => void chrome.runtime.lastError);
    else if (b.dataset.acao === 'config') chrome.runtime.sendMessage({ cmd: 'abrirConfig', params: { aba: 'aparencia' } }, () => void chrome.runtime.lastError);
    else if (b.dataset.acao === 'esconder') chrome.storage.local.get('botaoGeralOcultos', r => {
      const l = Array.isArray(r && r.botaoGeralOcultos) ? r.botaoGeralOcultos : [];
      if (!l.includes(site)) chrome.storage.local.set({ botaoGeralOcultos: [...l, site].slice(-300) });
    });
  });

  /* ---------- botão arrastável (posição em chrome.storage.local.posBotaoGeral: só distâncias das bordas, a mesma em todos os sites) ---------- */
  const TAM = 44, MARGEM = 4;
  let pos = null, arraste = null, moveu = false;
  const dentro = p => ({ r: Math.min(Math.max(MARGEM, Math.round(p.r)), Math.max(MARGEM, innerWidth - TAM - MARGEM)), b: Math.min(Math.max(MARGEM, Math.round(p.b)), Math.max(MARGEM, innerHeight - TAM - MARGEM)) });
  function aplicarPos(p) { pos = p ? dentro(p) : null; launcher.style.right = pos ? pos.r + 'px' : ''; launcher.style.bottom = pos ? pos.b + 'px' : ''; }
  launcher.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const r = launcher.getBoundingClientRect();
    arraste = { x: e.clientX, y: e.clientY, r: innerWidth - r.right, b: innerHeight - r.bottom }; moveu = false;
    try { launcher.setPointerCapture(e.pointerId); } catch (er) {}
  });
  launcher.addEventListener('pointermove', e => {
    if (!arraste) return;
    const dx = e.clientX - arraste.x, dy = e.clientY - arraste.y;
    if (!moveu && Math.hypot(dx, dy) < 4) return;
    moveu = true; if (aberto) abrirMenu(false); aplicarPos({ r: arraste.r - dx, b: arraste.b - dy });
  });
  const soltou = () => { if (!arraste) return; arraste = null; if (moveu && pos && viva()) chrome.storage.local.set({ posBotaoGeral: pos }); };
  launcher.addEventListener('pointerup', soltou);
  launcher.addEventListener('pointercancel', soltou);
  addEventListener('resize', () => { if (pos) aplicarPos(pos); });
  launcher.addEventListener('click', () => { if (moveu) { moveu = false; return; } abrirMenu(!aberto); });

  /* ---------- aparece ou some conforme as escolhas da pessoa ---------- */
  let montado = false;
  function montar() { if (montado) return; if (!document.body) return setTimeout(montar, 50); montado = true; document.documentElement.appendChild(host); }
  function atualizar(r) {
    if (!viva()) { host.remove(); return; }
    const off = !!(r && r.botaoGeralOff), ocultos = Array.isArray(r && r.botaoGeralOcultos) ? r.botaoGeralOcultos : [];
    if (off || ocultos.includes(site)) { abrirMenu(false); host.remove(); montado = false; return; }
    if (r && r.posBotaoGeral && !arraste) aplicarPos(r.posBotaoGeral);
    montar();
  }
  const CHAVES = ['botaoGeralOff', 'botaoGeralOcultos', 'posBotaoGeral'];
  try {
    chrome.storage.local.get(CHAVES, atualizar);
    chrome.storage.onChanged.addListener((mud, area) => { if (area === 'local' && CHAVES.some(k => k in mud)) chrome.storage.local.get(CHAVES, atualizar); });
  } catch (e) {}
})();

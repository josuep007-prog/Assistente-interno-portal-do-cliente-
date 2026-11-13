/* Control Onvio · a extensão dentro do Gestta (0.72.0)
 * Um botão arrastável em todas as telas do Gestta (clássico, admin, painel novo, integração e Express) abre uma camada
 * em tela cheia com a tela "Tarefas do Gestta" (app/gestta.html, iframe da extensão). Abre só pelo botão (ou pelo ícone
 * da extensão / Alt+Shift+O): a equipe trabalha nas telas do próprio Gestta (escolha do Josué em 05/11/2026).
 * Este script não lê nada do Gestta: as leituras são do service worker, de dentro da página (gestta.js). Ele só mostra a
 * camada, abre a tarefa escolhida no próprio Gestta e mostra no botão quantas tarefas pedem atenção.
 */
(function () {
  'use strict';
  if (window.__controlGesttaShell || location.origin !== 'https://app.gestta.com.br') return;
  window.__controlGesttaShell = true;

  const viva = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } };
  const url = p => chrome.runtime.getURL(p);
  const ORIGEM_EXT = new URL(url('')).origin;

  const host = document.createElement('div');
  host.id = 'controlgestta-host';
  host.style.cssText = 'all:initial;position:fixed;inset:auto 0 0 auto;z-index:2147483000;';
  const raiz = host.attachShadow({ mode: 'closed' });
  raiz.innerHTML = `
    <style>
      @font-face{font-family:'Archivo';font-weight:600;src:url('${url('fonts/archivo-latin-600-normal.woff2')}') format('woff2')}
      :host{all:initial}
      *{box-sizing:border-box}
      .launcher{--anel:#6BAAC9;position:fixed;right:18px;bottom:84px;width:48px;height:48px;padding:0;border:0;border-radius:50%;
        background:#0E151B;cursor:pointer;display:grid;place-items:center;
        box-shadow:0 2px 6px rgba(16,24,32,.22),0 10px 24px rgba(16,24,32,.28);transition:transform .15s ease}
      .launcher.late{--anel:#E8474B}
      .launcher::before{content:"";position:absolute;inset:0;border-radius:50%;border:2px solid var(--anel);opacity:0;pointer-events:none}
      .launcher.late::before{animation:anel 2.8s ease-out infinite}
      @keyframes anel{0%{transform:scale(1);opacity:.75}70%,100%{transform:scale(1.9);opacity:0}}
      .launcher:hover{transform:scale(1.1)}
      .launcher:focus-visible{outline:2px solid #6BAAC9;outline-offset:3px}
      .launcher .mark{width:34px;height:34px;border-radius:50%;background:#fff;display:grid;place-items:center}
      .launcher .mark img{width:17px;height:21px}
      .launcher .badge{position:absolute;top:-6px;right:-6px;min-width:22px;height:22px;padding:0 6px;border-radius:11px;border:2px solid #fff;background:#C2000C;color:#fff;font:700 12px/18px 'Archivo',sans-serif;text-align:center;box-sizing:border-box}
      .launcher .badge[hidden]{display:none}
      .launcher.hidden{display:none}
      .camada{position:fixed;inset:0;width:100vw;height:100vh;opacity:0;visibility:hidden;transition:opacity .16s ease, visibility 0s linear .16s;background:#E9F1F9}
      .camada.open{opacity:1;visibility:visible;transition:opacity .16s ease}
      iframe{border:0;width:100%;height:100%;display:block;background:#EDF0F3;color-scheme:normal}
      @media (prefers-reduced-motion: reduce){.camada,.camada.open,.launcher{transition:none}.launcher.late::before{animation:none;opacity:.35;transform:scale(1.35)}}
      @media print{:host{display:none}}
    </style>
    <button class="launcher" type="button" aria-label="Abrir as Tarefas do Gestta (Control)" title="Tarefas do Gestta · Control (Alt+Shift+O)">
      <span class="mark"><img alt="" src="${url('logo.svg')}"></span><span class="badge" hidden></span>
    </button>
    <div class="camada" aria-hidden="true"></div>`;
  const launcher = raiz.querySelector('.launcher'), badge = raiz.querySelector('.badge'), wrap = raiz.querySelector('.camada');
  let iframe = null, aberto = false;

  function garantirIframe() {
    if (iframe) return;
    iframe = document.createElement('iframe');
    iframe.title = 'Tarefas do Gestta · Control';
    iframe.allow = 'clipboard-write';      // 0.109.1: sem isto o Copiar do quadro falhava em silêncio
    iframe.src = url('app/gestta.html');
    wrap.appendChild(iframe);
  }
  function definir(abrir) {
    if (!viva()) return;
    if (abrir) garantirIframe();
    aberto = abrir;
    wrap.classList.toggle('open', abrir);
    wrap.setAttribute('aria-hidden', String(!abrir));
    launcher.classList.toggle('hidden', abrir);
    document.documentElement.style.overflow = abrir ? 'hidden' : '';
    if (iframe) try { iframe.contentWindow.postMessage({ controlGestta: abrir ? 'visivel' : 'oculto' }, ORIGEM_EXT); } catch (e) {}
    if (abrir && iframe) setTimeout(() => { try { iframe.focus(); } catch (e) {} }, 50);
  }

  /* ---------- botão arrastável (posição em chrome.storage.local.posBotaoGestta: só distâncias das bordas) ---------- */
  const TAM = 48, MARGEM = 4;
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
    moveu = true; aplicarPos({ r: arraste.r - dx, b: arraste.b - dy });
  });
  const soltou = () => { if (!arraste) return; arraste = null; if (moveu && pos && viva()) chrome.storage.local.set({ posBotaoGestta: pos }); };
  launcher.addEventListener('pointerup', soltou);
  launcher.addEventListener('pointercancel', soltou);
  addEventListener('resize', () => { if (pos) aplicarPos(pos); });
  launcher.addEventListener('click', () => { if (moveu) { moveu = false; return; } definir(true); });

  /* ---------- conversa com a tela (iframe da extensão) ---------- */
  addEventListener('message', e => {
    if (!iframe || e.source !== iframe.contentWindow || e.origin !== ORIGEM_EXT) return;
    const d = e.data || {};
    if (d.controlGestta === 'fechar') definir(false);
    else if (d.controlGestta === 'abrirTarefa' && /^[0-9a-f]{24}$/i.test(String(d.id || ''))) {
      definir(false);
      location.href = 'https://app.gestta.com.br/#/sidebar/task/overview/dashboard/' + d.id;      // só navega: nada é feito na tarefa
    } else if (d.controlGestta === 'contagem') {
      const n = Math.max(0, Math.min(9999, Number(d.atencao) || 0));
      badge.hidden = !n; badge.textContent = n > 99 ? '99+' : String(n);
      launcher.classList.toggle('late', n > 0);
      // 0.87.0: a dica separa o que gera multa, o que está atrasado e o que vence hoje
      const q = k => Math.max(0, Math.min(9999, Number(d[k]) || 0)), partes = [[q('multa'), ' gerando multa'], [q('atrasada'), ' atrasada', ' atrasadas'], [q('hoje'), ' vence hoje', ' vencem hoje']].filter(p => p[0]).map(p => p[0] + (p[0] > 1 && p[2] ? p[2] : p[1]));
      launcher.title = n ? (partes.length ? partes.join(', ') : n + ' pedem atenção') + ' · Tarefas do Gestta (Alt+Shift+O)' : 'Tarefas do Gestta · Control (Alt+Shift+O)';
      launcher.setAttribute('aria-label', n ? 'Abrir as Tarefas do Gestta: ' + launcher.title : 'Abrir as Tarefas do Gestta (Control)');
    }
  });
  try { chrome.runtime.onMessage.addListener(m => { if (m && m.controlGestta === 'alternar') definir(!aberto); }); } catch (e) {}

  function montar() {
    if (!document.body) return setTimeout(montar, 50);
    document.documentElement.appendChild(host);
    if (viva()) chrome.storage.local.get('posBotaoGestta', r => { if (r && r.posBotaoGestta) aplicarPos(r.posBotaoGestta); });
  }
  montar();
})();

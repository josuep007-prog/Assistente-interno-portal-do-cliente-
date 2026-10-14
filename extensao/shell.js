/* Control Onvio · a extensão dentro do Onvio
 * Mostra um botão flutuante no canto da tela e, ao abrir, o painel como uma coluna fixa à direita
 * (a página encolhe em telas largas, então nada fica escondido atrás dele).
 * Só existe no Onvio: não há painel em nenhum outro site. O painel em si é painel.html (iframe da extensão).
 * O ícone da extensão e o atalho Alt+Shift+O falam com este script pelo service worker.
 */
(function () {
  'use strict';
  if (window.__controlOnvioShell) return;
  window.__controlOnvioShell = true;

  const LARGURA = 420;           // largura da coluna do painel (px)
  const LARGURA_MINIMA_PARA_EMPURRAR = 1000;
  const CHAVE_ABERTO = 'controlonvio-painel-aberto';

  const viva = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } };
  const url = p => chrome.runtime.getURL(p);

  /* ---------- interface (Shadow DOM fechado, como a página não precisa mexer nela) ---------- */
  const host = document.createElement('div');
  host.id = 'controlonvio-host';
  host.style.cssText = 'all:initial;position:fixed;inset:auto 0 0 auto;z-index:2147483000;';
  const raiz = host.attachShadow({ mode: 'closed' });
  raiz.innerHTML = `
    <style>
      @font-face{font-family:'Archivo';font-weight:600;src:url('${url('fonts/archivo-latin-600-normal.woff2')}') format('woff2')}
      @font-face{font-family:'IBM Plex Sans';font-weight:500;src:url('${url('fonts/ibm-plex-sans-latin-500-normal.woff2')}') format('woff2')}
      :host{all:initial}
      *{box-sizing:border-box}
      .launcher{position:fixed;right:20px;bottom:22px;display:flex;align-items:center;gap:10px;height:46px;padding:0 16px 0 8px;border:0;border-radius:23px;
        background:#0E151B;color:#E9EEF2;font:500 13px 'IBM Plex Sans',system-ui,sans-serif;cursor:pointer;
        box-shadow:0 2px 6px rgba(16,24,32,.18),0 14px 32px rgba(16,24,32,.22);transition:transform .15s ease, box-shadow .15s ease}
      .launcher:hover{transform:translateY(-2px)}
      .launcher:focus-visible{outline:2px solid #6BAAC9;outline-offset:3px}
      .launcher .mark{width:32px;height:32px;border-radius:16px;background:#fff;display:grid;place-items:center}
      .launcher .mark img{width:16px;height:20px}
      .launcher .badge{min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:#3C659B;color:#fff;font:600 11px 'Archivo',sans-serif;display:grid;place-items:center}
      .launcher .badge.late{background:#C2000C}
      .launcher .badge.today{background:#B5530C}
      .launcher .badge[hidden]{display:none}
      .launcher.hidden{display:none}
      .frame-wrap{position:fixed;top:0;right:0;height:100vh;width:min(${LARGURA}px,100vw);transform:translateX(105%);visibility:hidden;
        transition:transform .22s cubic-bezier(.2,.7,.2,1), visibility 0s linear .22s;
        box-shadow:-2px 0 6px rgba(16,24,32,.08),-18px 0 40px rgba(16,24,32,.16)}
      .frame-wrap.open{transform:none;visibility:visible;transition:transform .22s cubic-bezier(.2,.7,.2,1)}
      iframe{border:0;width:100%;height:100%;display:block;background:#EDF0F3;color-scheme:normal}
      @media (prefers-reduced-motion: reduce){.frame-wrap,.frame-wrap.open,.launcher{transition:none}}
      @media print{:host{display:none}}
    </style>
    <button class="launcher" type="button" aria-label="Abrir o Control Onvio">
      <span class="mark"><img alt="" src="${url('logo.svg')}"></span>
      <span class="lbl">Control Onvio</span><span class="badge" hidden></span>
    </button>
    <div class="frame-wrap" aria-hidden="true"></div>`;
  const launcher = raiz.querySelector('.launcher');
  const badge = raiz.querySelector('.badge');
  const wrap = raiz.querySelector('.frame-wrap');
  let iframe = null;
  let aberto = false;

  // O iframe só é criado na primeira abertura: com o painel fechado a página não carrega nada a mais.
  function garantirIframe() {
    if (iframe) return;
    iframe = document.createElement('iframe');
    iframe.title = 'Control Onvio';
    iframe.src = url('painel.html');
    wrap.appendChild(iframe);
  }

  function definirPainel(abrir) {
    if (!viva()) return;
    if (abrir) garantirIframe();
    aberto = abrir;
    wrap.classList.toggle('open', abrir);
    wrap.setAttribute('aria-hidden', String(!abrir));
    launcher.classList.toggle('hidden', abrir);
    // telas largas: o painel vira uma coluna e a página encolhe
    document.documentElement.classList.toggle('controlonvio-docked', abrir && innerWidth >= LARGURA_MINIMA_PARA_EMPURRAR);
    try { sessionStorage.setItem(CHAVE_ABERTO, abrir ? '1' : '0'); } catch (e) {}   // só nesta aba
  }
  launcher.addEventListener('click', () => definirPainel(true));

  const estilo = document.createElement('style');
  estilo.textContent = `html.controlonvio-docked{margin-right:${LARGURA}px!important;transition:margin-right .22s ease}
    @media (prefers-reduced-motion: reduce){html.controlonvio-docked{transition:none}}`;
  document.documentElement.appendChild(estilo);
  (document.body || document.documentElement).appendChild(host);
  addEventListener('resize', () => document.documentElement.classList.toggle('controlonvio-docked', aberto && innerWidth >= LARGURA_MINIMA_PARA_EMPURRAR));

  /* ---------- contador no botão: minhas solicitações com ação do escritório ---------- */
  function atualizarContador(snap) {
    const minhas = ((snap && snap.items) || []).filter(i => i.mine && i.lado === 'esc');
    badge.hidden = !minhas.length;
    badge.textContent = minhas.length > 99 ? '99+' : String(minhas.length);
    badge.className = 'badge' + (minhas.some(i => i.nivel === 2) ? ' late' : minhas.some(i => i.nivel === 1) ? ' today' : '');
    launcher.setAttribute('aria-label', 'Abrir o Control Onvio' + (minhas.length ? ' · ' + minhas.length + ' minha(s) com ação do escritório' : ''));
  }

  /* ---------- mensagens do service worker (ícone da extensão, atalho) ---------- */
  chrome.runtime.onMessage.addListener(m => {
    if (!m || typeof m.type !== 'string') return;
    if (m.type === 'alternar') definirPainel(!aberto);
    else if (m.type === 'abrir') definirPainel(true);
    else if (m.type === 'fechar') definirPainel(false);
  });
  chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.snapshot) atualizarContador(ch.snapshot.newValue); });

  /* ---------- tempo real ----------
   * Enquanto esta aba do Onvio está visível, pede ao service worker uma verificação leve a cada poucos
   * segundos (o intervalo vem das configurações). Também verifica ao voltar para a aba e logo depois de
   * qualquer ação que altere solicitações na página (acao-hook.js). */
  let relogio = null, aviso = null;
  const visivel = () => document.visibilityState === 'visible';
  function agendar(seg) { clearTimeout(relogio); relogio = setTimeout(() => verificar(false), Math.max(15, seg || 30) * 1000); }
  async function verificar(forcar) {
    clearTimeout(relogio);
    let prox = 30;
    if (viva() && visivel()) {
      try { const r = await chrome.runtime.sendMessage({ cmd: 'tick', forcar: !!forcar }); if (r && r.proximoEmSeg != null) prox = r.proximoEmSeg; } catch (e) { prox = 60; }
    }
    if (viva()) agendar(prox);
  }
  document.addEventListener('visibilitychange', () => { if (visivel() && viva()) verificar(false); });
  addEventListener('message', ev => {
    const d = ev.data;
    if (ev.source !== window || ev.origin !== location.origin || !d || d.src !== 'controlonvio' || d.tipo !== 'mudanca') return;
    clearTimeout(aviso);
    aviso = setTimeout(() => verificar(true), 1500);          // junta várias chamadas seguidas numa leitura só
  });
  verificar(false);

  /* ---------- estado inicial ---------- */
  chrome.storage.local.get(['snapshot', 'abrirPainelAoCarregar'], d => {
    atualizarContador(d.snapshot);
    let reabrir = false;
    try { reabrir = sessionStorage.getItem(CHAVE_ABERTO) === '1'; } catch (e) {}
    const pedido = d.abrirPainelAoCarregar && Date.now() - d.abrirPainelAoCarregar < 120000;
    if (pedido) chrome.storage.local.remove('abrirPainelAoCarregar');
    if (reabrir || pedido) definirPainel(true);
  });
})();

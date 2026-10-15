/* Control Onvio · a extensão dentro do Onvio
 * O Control Onvio é uma página em TELA CHEIA por cima do Onvio (app/app.html, iframe da extensão). O Onvio
 * continua carregado por trás e mantém a sessão: é por ele que a extensão lê e, nas próximas versões, grava.
 * "Ver Onvio" esconde a camada e deixa um botão flutuante para voltar.
 * Só existe no Onvio. O ícone da extensão e o atalho Alt+Shift+O falam com este script pelo service worker.
 */
(function () {
  'use strict';
  if (window.__controlOnvioShell) return;
  window.__controlOnvioShell = true;

  const CHAVE_ABERTO = 'controlonvio-painel-aberto';

  const viva = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } };
  const url = p => chrome.runtime.getURL(p);

  /* ---------- interface (Shadow DOM fechado: a página não precisa mexer nela) ---------- */
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
      .camada{position:fixed;inset:0;width:100vw;height:100vh;opacity:0;visibility:hidden;transition:opacity .16s ease, visibility 0s linear .16s;background:#EDF0F3}
      .camada.open{opacity:1;visibility:visible;transition:opacity .16s ease}
      iframe{border:0;width:100%;height:100%;display:block;background:#EDF0F3;color-scheme:normal}
      @media (prefers-reduced-motion: reduce){.camada,.camada.open,.launcher{transition:none}}
      @media print{:host{display:none}}
    </style>
    <button class="launcher" type="button" aria-label="Voltar ao Control Onvio">
      <span class="mark"><img alt="" src="${url('logo.svg')}"></span>
      <span class="lbl">Voltar ao Control Onvio</span><span class="badge" hidden></span>
    </button>
    <div class="camada" aria-hidden="true"></div>`;
  const launcher = raiz.querySelector('.launcher');
  const badge = raiz.querySelector('.badge');
  const wrap = raiz.querySelector('.camada');
  let iframe = null;
  let aberto = false;
  let visaoCliente = false;      // Onvio com login de cliente: não abre sozinho nem mostra o botão

  // O app só é carregado na primeira vez que a camada aparece.
  function garantirIframe() {
    if (iframe) return;
    iframe = document.createElement('iframe');
    iframe.title = 'Control Onvio';
    iframe.allow = 'clipboard-write';
    iframe.src = url('app/app.html');
    wrap.appendChild(iframe);
  }

  function definirPainel(abrir) {
    if (!viva()) return;
    if (abrir) garantirIframe();
    aberto = abrir;
    wrap.classList.toggle('open', abrir);
    wrap.setAttribute('aria-hidden', String(!abrir));
    launcher.classList.toggle('hidden', abrir || visaoCliente);
    // com a camada aberta a página do Onvio por trás não rola nem recebe o foco
    document.documentElement.classList.toggle('controlonvio-cheia', abrir);
    if (abrir && iframe) setTimeout(() => { try { iframe.focus(); } catch (e) {} }, 50);
    try { sessionStorage.setItem(CHAVE_ABERTO, abrir ? '1' : '0'); } catch (e) {}   // só nesta aba
  }
  launcher.addEventListener('click', () => definirPainel(true));

  const estilo = document.createElement('style');
  estilo.textContent = 'html.controlonvio-cheia,html.controlonvio-cheia body{overflow:hidden!important}';
  document.documentElement.appendChild(estilo);
  (document.body || document.documentElement).appendChild(host);

  /* ---------- contador no botão: minhas solicitações com ação do escritório ---------- */
  function atualizarContador(snap) {
    const minhas = ((snap && snap.items) || []).filter(i => i.mine && i.lado === 'esc');
    badge.hidden = !minhas.length;
    badge.textContent = minhas.length > 99 ? '99+' : String(minhas.length);
    badge.className = 'badge' + (minhas.some(i => i.nivel === 2) ? ' late' : minhas.some(i => i.nivel === 1) ? ' today' : '');
    launcher.setAttribute('aria-label', 'Voltar ao Control Onvio' + (minhas.length ? ' · ' + minhas.length + ' minha(s) com ação do escritório' : ''));
  }

  /* ---------- mensagens do service worker (ícone da extensão, atalho) ---------- */
  chrome.runtime.onMessage.addListener(m => {
    if (!m || typeof m.type !== 'string') return;
    if (m.type === 'alternar') definirPainel(!aberto);
    else if (m.type === 'abrir') definirPainel(true);
    else if (m.type === 'fechar') definirPainel(false);
  });
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    if (ch.snapshot) atualizarContador(ch.snapshot.newValue);
    if (ch.status) { visaoCliente = !!(ch.status.newValue && ch.status.newValue.estado === 'visao_cliente'); launcher.classList.toggle('hidden', aberto || visaoCliente); }
  });

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

  /* ---------- modo aprender (mapeamento das ações) ----------
   * Liga o registro de formatos no acao-hook.js (mundo da página) e guarda o que ele mandar.
   * Desliga sozinho depois de 2 horas, para ninguém esquecer ligado. */
  const APRENDER_MAX_MS = 2 * 3600 * 1000, APRENDIZADO_MAX = 300;
  const aprenderAtivo = a => !!(a && a.ligado && Date.now() - (a.desde || 0) < APRENDER_MAX_MS);
  const avisarHook = a => { try { window.postMessage({ src: 'controlonvio', tipo: 'aprender', ligado: aprenderAtivo(a) }, location.origin); } catch (e) {} };
  let filaAprendido = Promise.resolve();
  function guardarAprendido(r) {
    let txt;
    try { txt = JSON.stringify(r); } catch (e) { return; }
    if (!r || typeof r !== 'object' || txt.length > 40000) return;               // nada enorme ou estranho
    const chave = [r.metodo, r.caminho, JSON.stringify(r.corpo || null), r.status].join(' ');
    filaAprendido = filaAprendido.then(async () => {
      const { aprender, aprendizado } = await chrome.storage.local.get(['aprender', 'aprendizado']);
      if (!aprenderAtivo(aprender)) return;
      const lista = Array.isArray(aprendizado) ? aprendizado : [];
      const igual = lista.find(x => x.chave === chave);
      if (igual) { igual.vezes = (igual.vezes || 1) + 1; igual.ultimaEm = r.em; igual.rotas = [...new Set((igual.rotas || []).concat(r.rota))].slice(0, 10); }
      else lista.push({ chave, vezes: 1, primeiraEm: r.em, ultimaEm: r.em, rotas: [r.rota], metodo: String(r.metodo).slice(0, 10), caminho: String(r.caminho).slice(0, 300), query: r.query, status: r.status, contentTypePedido: r.contentTypePedido, corpo: r.corpo, resposta: r.resposta, via: r.via });
      await chrome.storage.local.set({ aprendizado: lista.slice(-APRENDIZADO_MAX) });
    }).catch(() => {});
  }
  addEventListener('message', ev => {
    const d = ev.data;
    if (ev.source !== window || ev.origin !== location.origin || !d || d.src !== 'controlonvio' || d.tipo !== 'aprendido') return;
    if (viva()) guardarAprendido(d.registro);
  });
  // Rota dos trâmites: quando o próprio Onvio abre os trâmites de uma solicitação, o acao-hook.js manda só o molde
  // do caminho (lista, sufixo, forma do id). O service worker confere com as listas conhecidas e guarda.
  addEventListener('message', ev => {
    const d = ev.data;
    if (ev.source !== window || ev.origin !== location.origin || !d || d.src !== 'controlonvio' || d.tipo !== 'rotaTramites') return;
    if (!viva() || typeof d.base !== 'string' || typeof d.sufixo !== 'string' || d.base.length > 200 || d.sufixo.length > 90) return;
    try { chrome.runtime.sendMessage({ cmd: 'rotaTramites', base: d.base, sufixo: d.sufixo, idForma: d.idForma === 'numero' ? 'numero' : 'guid', query: d.query && typeof d.query === 'object' ? d.query : {} }).catch(() => {}); } catch (e) {}
  });
  chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.aprender) avisarHook(ch.aprender.newValue); });
  chrome.storage.local.get('aprender', d => avisarHook(d.aprender));

  /* ---------- estado inicial ----------
   * Abre ao entrar no Onvio (configurável). Fica escondido se nesta aba a pessoa escolheu "Ver Onvio", ou se
   * chegou aqui por "Abrir no Onvio" (quer ver a tela nativa). O pedido do ícone fora do Onvio sempre abre. */
  chrome.storage.local.get(['snapshot', 'status', 'abrirPainelAoCarregar', 'verOnvioAoCarregar', 'settings', 'regrasEscritorio'], d => {
    atualizarContador(d.snapshot);
    visaoCliente = !!(d.status && d.status.estado === 'visao_cliente');
    let naAba = null;
    try { naAba = sessionStorage.getItem(CHAVE_ABERTO); } catch (e) {}
    const recente = ts => ts && Date.now() - ts < 120000;
    const pedido = recente(d.abrirPainelAoCarregar);
    const verOnvio = recente(d.verOnvioAoCarregar);
    if (pedido) chrome.storage.local.remove('abrirPainelAoCarregar');
    if (verOnvio) chrome.storage.local.remove('verOnvioAoCarregar');
    const abrirAoEntrar = !(d.settings && d.settings.abrirAoEntrar === false);
    // com acesso de cliente só abre a pedido (ícone), para mostrar o aviso; nunca sozinho
    const abrir = pedido || (!visaoCliente && !verOnvio && (naAba === '1' || (naAba === null && abrirAoEntrar)));
    definirPainel(abrir);
  });
})();

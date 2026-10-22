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
      .launcher{--anel:#6BAAC9;position:fixed;right:18px;bottom:18px;width:48px;height:48px;padding:0;border:0;border-radius:50%;
        background:#0E151B;cursor:pointer;display:grid;place-items:center;
        box-shadow:0 2px 6px rgba(16,24,32,.22),0 10px 24px rgba(16,24,32,.28);transition:transform .15s ease, box-shadow .15s ease}
      .launcher.late{--anel:#E8474B}
      .launcher.today{--anel:#FF9D42}
      /* só a bolinha, chamando atenção: dois anéis que se abrem e somem, um depois do outro */
      .launcher::before, .launcher::after{content:"";position:absolute;inset:0;border-radius:50%;border:2px solid var(--anel);opacity:0;pointer-events:none;animation:anel 2.8s ease-out infinite}
      .launcher::after{animation-delay:1.4s}
      @keyframes anel{0%{transform:scale(1);opacity:.75}70%,100%{transform:scale(1.9);opacity:0}}
      .launcher:hover{transform:scale(1.1)}
      .launcher:hover::before, .launcher:hover::after{animation-play-state:paused;opacity:0}
      .launcher:focus-visible{outline:2px solid #6BAAC9;outline-offset:3px}
      .launcher .mark{width:34px;height:34px;border-radius:50%;background:#fff;display:grid;place-items:center}
      .launcher .mark img{width:17px;height:21px}
      .launcher .badge{position:absolute;top:-5px;right:-5px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;border:2px solid #fff;background:#3C659B;color:#fff;font:600 11px/16px 'Archivo',sans-serif;text-align:center}
      .launcher .badge.late{background:#C2000C}
      .launcher .badge.today{background:#B5530C}
      .launcher .badge[hidden]{display:none}
      .launcher.hidden{display:none}
      .camada{position:fixed;inset:0;width:100vw;height:100vh;opacity:0;visibility:hidden;transition:opacity .16s ease, visibility 0s linear .16s;background:#E9F1F9}
      .camada.open{opacity:1;visibility:visible;transition:opacity .16s ease}
      iframe{border:0;width:100%;height:100%;display:block;background:#EDF0F3;color-scheme:normal}
      @media (prefers-reduced-motion: reduce){.camada,.camada.open,.launcher{transition:none}.launcher::before,.launcher::after{animation:none;opacity:.35;transform:scale(1.35)}.launcher::after{display:none}}
      @media print{:host{display:none}}
    </style>
    <button class="launcher" type="button" aria-label="Voltar ao Control Onvio" title="Voltar ao Control Onvio">
      <span class="mark"><img alt="" src="${url('logo.svg')}"></span><span class="badge" hidden></span>
    </button>
    <div class="camada" aria-hidden="true"></div>`;
  const launcher = raiz.querySelector('.launcher');
  const badge = raiz.querySelector('.badge');
  const wrap = raiz.querySelector('.camada');
  let iframe = null;
  let aberto = false;
  let visaoCliente = false;      // Onvio com login de cliente: não abre sozinho nem mostra o botão
  let statusAtual = null;        // último estado da leitura (para o aviso no botão quando não há dados)

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
  /* ---------- botão arrastável ----------
   * O botão atrapalha em algumas telas do Onvio: dá para arrastá-lo para outro canto. O clique só conta sem arraste
   * (limiar de 4 px). A posição (distância das bordas direita e de baixo) fica em chrome.storage.local.posBotao e é
   * mantida dentro da janela. */
  const TAM = 48, MARGEM = 4;
  let pos = null, arraste = null, moveu = false;
  const dentro = p => ({ r: Math.min(Math.max(MARGEM, Math.round(p.r)), Math.max(MARGEM, innerWidth - TAM - MARGEM)), b: Math.min(Math.max(MARGEM, Math.round(p.b)), Math.max(MARGEM, innerHeight - TAM - MARGEM)) });
  function aplicarPos(p) { pos = p ? dentro(p) : null; launcher.style.right = pos ? pos.r + 'px' : ''; launcher.style.bottom = pos ? pos.b + 'px' : ''; }
  launcher.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const r = launcher.getBoundingClientRect();
    arraste = { x: e.clientX, y: e.clientY, r: innerWidth - r.right, b: innerHeight - r.bottom };
    moveu = false;
    try { launcher.setPointerCapture(e.pointerId); } catch (er) {}
  });
  launcher.addEventListener('pointermove', e => {
    if (!arraste) return;
    const dx = e.clientX - arraste.x, dy = e.clientY - arraste.y;
    if (!moveu && Math.hypot(dx, dy) < 4) return;
    moveu = true;
    aplicarPos({ r: arraste.r - dx, b: arraste.b - dy });
  });
  const soltou = () => {
    if (!arraste) return;
    arraste = null;
    if (moveu && pos && viva()) chrome.storage.local.set({ posBotao: pos });
  };
  launcher.addEventListener('pointerup', soltou);
  launcher.addEventListener('pointercancel', soltou);
  addEventListener('resize', () => { if (pos) aplicarPos(pos); });
  launcher.addEventListener('click', () => { if (moveu) { moveu = false; return; } definirPainel(true); });

  const estilo = document.createElement('style');
  estilo.textContent = 'html.controlonvio-cheia,html.controlonvio-cheia body{overflow:hidden!important}';
  document.documentElement.appendChild(estilo);
  (document.body || document.documentElement).appendChild(host);

  /* ---------- contador no botão: minhas solicitações com ação do escritório ---------- */
  function atualizarContador(snap) {
    const minhas = ((snap && snap.items) || []).filter(i => i.mine && i.lado === 'esc');
    const semLeitura = statusAtual && (statusAtual.estado === 'erro' || statusAtual.estado === 'sem_sessao');
    badge.hidden = !minhas.length && !semLeitura;
    badge.textContent = semLeitura ? '!' : minhas.length > 99 ? '99+' : String(minhas.length);
    // a cor segue o prazo legal (o prazo interno não aparece para o analista)
    const legal = (i, n) => (i.motivos || []).some(m => m.legal && m.n === n);
    const nivel = semLeitura || minhas.some(i => legal(i, 2)) ? 'late' : minhas.some(i => legal(i, 1)) ? 'today' : '';
    badge.className = 'badge' + (nivel ? ' ' + nivel : '');
    launcher.className = 'launcher' + (nivel ? ' ' + nivel : '') + (launcher.classList.contains('hidden') ? ' hidden' : '');   // a cor do anel segue a urgência
    const txt = 'Voltar ao Control Onvio' + (semLeitura ? ' · sem leitura do Onvio agora: clique para ver o aviso' : minhas.length ? ' · ' + minhas.length + ' minha(s) com ação do escritório' : '');
    launcher.setAttribute('aria-label', txt); launcher.title = txt;
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
    if (ch.status) { statusAtual = ch.status.newValue || null; visaoCliente = !!(statusAtual && statusAtual.estado === 'visao_cliente'); launcher.classList.toggle('hidden', aberto || visaoCliente); chrome.storage.local.get('snapshot', d => atualizarContador(d.snapshot)); }
    if (ch.posBotao) aplicarPos(ch.posBotao.newValue);
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
  // O Onvio baixou um anexo: o service worker guarda só o molde do caminho (OC.moldeDeAnexo), nunca o endereço.
  addEventListener('message', ev => {
    const d = ev.data;
    if (ev.source !== window || ev.origin !== location.origin || !d || d.src !== 'controlonvio' || d.tipo !== 'anexoBaixado') return;
    if (viva() && typeof d.url === 'string' && d.url.length < 2000) chrome.runtime.sendMessage({ cmd: 'rotaAnexo', url: d.url, campo: typeof d.campo === 'string' ? d.campo.slice(0, 60) : null }).catch(() => {});
  });
  chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.aprender) avisarHook(ch.aprender.newValue); });
  chrome.storage.local.get('aprender', d => avisarHook(d.aprender));

  /* ---------- estado inicial ----------
   * Abre ao entrar no Onvio (configurável). Fica escondido se nesta aba a pessoa escolheu "Ver Onvio", ou se
   * chegou aqui por "Abrir no Onvio" (quer ver a tela nativa). O pedido do ícone fora do Onvio sempre abre. */
  chrome.storage.local.get(['snapshot', 'status', 'abrirPainelAoCarregar', 'verOnvioAoCarregar', 'settings', 'regrasEscritorio', 'posBotao'], d => {
    statusAtual = d.status || null;
    if (d.posBotao && typeof d.posBotao.r === 'number' && typeof d.posBotao.b === 'number') aplicarPos(d.posBotao);
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
    // com acesso de cliente só abre a pedido (ícone), para mostrar o aviso; nunca sozinho. Sozinha, a camada também só abre
    // quando já há leitura (resumo guardado e estado sem erro): sem dados fica só o botão, com o aviso, e o clique abre igual.
    const comDados = !!(d.snapshot && d.snapshot.items && !(d.status && ['erro', 'sem_sessao', 'visao_cliente'].includes(d.status.estado)));
    const abrir = pedido || (!visaoCliente && !verOnvio && comDados && (naAba === '1' || (naAba === null && abrirAoEntrar)));
    definirPainel(abrir);
  });
})();

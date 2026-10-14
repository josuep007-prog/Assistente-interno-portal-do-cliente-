/* Control Onvio · ponte das guias não visualizadas
 * Recebe o que docs-hook.js copiou da página de Documentos, guarda só as guias que ainda não foram
 * vistas pelo cliente e têm vencimento, e mostra um aviso na própria tela de Documentos.
 * Depende de core.js (OC.avaliarGuia). Guarda em chrome.storage.local: guias, clientes.
 */
(function () {
  'use strict';
  if (window.__controlOnvioPonte) return;
  window.__controlOnvioPonte = true;

  const MAX_PASTAS = 400, MAX_CLIENTES = 3000, VALIDADE_MS = 30 * 864e5;
  let pastaAtual = null;
  let fila = Promise.resolve();

  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  const linkSeguro = l => {
    try { const u = new URL(l, 'https://onvio.com.br'); return u.origin === 'https://onvio.com.br' ? u.href : ''; } catch (e) { return ''; }
  };

  function guardar(fn) { fila = fila.then(fn).catch(() => {}); return fila; }

  window.addEventListener('message', ev => {
    const d = ev.data;
    if (ev.source !== window || ev.origin !== location.origin || !d || d.src !== 'controlonvio') return;
    if (d.tipo === 'filhos' && Array.isArray(d.docs)) guardar(() => receberPasta(d));
    else if (d.tipo === 'clientes' && Array.isArray(d.cli)) guardar(() => receberClientes(d.cli));
  });

  async function receberPasta(d) {
    const pasta = str(d.pasta, 80);
    if (!pasta) return;
    pastaAtual = pasta;
    const { guias, settings } = await chrome.storage.local.get(['guias', 'settings']);
    const g = guias || {};
    const agora = Date.now();
    const atual = g[pasta] && d.from > 0 ? g[pasta].docs : [];            // páginas seguintes somam à primeira
    const porId = new Map(atual.map(x => [x.id, x]));
    for (const x of d.docs) {
      if (x.lido || !x.due || !x.id) { porId.delete(x.id); continue; }   // lida ou sem vencimento: sai
      porId.set(x.id, { id: str(x.id, 80), nome: str(x.nome, 200), due: str(x.due, 40), clientId: str(x.clientId, 80), link: linkSeguro(x.link) });
    }
    g[pasta] = { ts: agora, docs: [...porId.values()] };
    if (!g[pasta].docs.length) delete g[pasta];
    for (const k of Object.keys(g)) if (agora - g[k].ts > VALIDADE_MS) delete g[k];
    const chaves = Object.keys(g).sort((a, b) => g[b].ts - g[a].ts);
    chaves.slice(MAX_PASTAS).forEach(k => delete g[k]);
    await chrome.storage.local.set({ guias: g });
    mostrar(g, settings);
  }

  async function receberClientes(lista) {
    const { clientes } = await chrome.storage.local.get('clientes');
    const c = Object.assign({}, clientes || {});
    for (const x of lista) c[str(x.id, 80)] = str(x.nome, 120);
    const ids = Object.keys(c);
    if (ids.length > MAX_CLIENTES) ids.slice(0, ids.length - MAX_CLIENTES).forEach(k => delete c[k]);
    await chrome.storage.local.set({ clientes: c });
  }

  /* ---------- aviso na tela de Documentos ---------- */
  function mostrar(g, settings) {
    const alertas = [];
    for (const [pasta, v] of Object.entries(g)) for (const x of v.docs) {
      const a = OC.avaliarGuia({ due: x.due, lido: false }, settings);
      if (a) alertas.push({ pasta, nome: x.nome, a });
    }
    const aqui = alertas.filter(x => x.pasta === pastaAtual).sort((x, y) => x.a.dias - y.a.dias);
    let box = document.getElementById('controlonvio-guias');
    if (!aqui.length) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement('div');
      box.id = 'controlonvio-guias';
      box.style.cssText = 'position:fixed;z-index:2147483646;right:16px;bottom:16px;max-width:360px;background:#101820;color:#EDF0F3;border-left:4px solid #C2000C;border-radius:4px;box-shadow:0 2px 4px rgba(16,24,32,.08),0 14px 32px rgba(16,24,32,.25);font:13px/1.45 "IBM Plex Sans",system-ui,sans-serif';
      document.body.appendChild(box);
    }
    box.textContent = '';
    const topo = document.createElement('button');
    topo.type = 'button';
    topo.style.cssText = 'all:unset;display:block;cursor:pointer;padding:10px 14px;font-weight:600;width:100%;box-sizing:border-box';
    const vencidas = aqui.filter(x => x.a.nivel === 2).length;
    topo.textContent = aqui.length + ' guia(s) sem visualização do cliente perto do vencimento' + (vencidas ? ' · ' + vencidas + ' urgente(s)' : '') + (alertas.length > aqui.length ? ' · +' + (alertas.length - aqui.length) + ' em outras pastas' : '');
    const lista = document.createElement('div');
    lista.style.cssText = 'display:none;padding:0 14px 10px;max-height:240px;overflow:auto';
    for (const x of aqui.slice(0, 30)) {
      const l = document.createElement('div');
      l.style.cssText = 'padding:3px 0;border-top:1px solid #2A3640;font-size:12px';
      l.textContent = x.a.motivo + ' (' + x.a.venc.split('-').reverse().join('/') + ') · ' + x.nome;
      lista.appendChild(l);
    }
    const nota = document.createElement('div');
    nota.style.cssText = 'padding:6px 0 0;font-size:11px;color:#8FA0AD';
    nota.textContent = 'Veja todas na aba Guias do painel Control Onvio. Só entram pastas que você abriu.';
    lista.appendChild(nota);
    topo.onclick = () => { lista.style.display = lista.style.display === 'none' ? 'block' : 'none'; };
    box.append(topo, lista);
  }

  // Ao mudar o ajuste de dias no painel, reavalia sem esperar outra pasta.
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === 'local' && ch.settings) chrome.storage.local.get(['guias', 'settings']).then(d => mostrar(d.guias || {}, d.settings));
  });
})();

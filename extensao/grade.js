/* Control Onvio · "dias parada" na grade nativa do Portal do Cliente
 * Em cada linha pendente, acrescenta na célula "Último Trâmite" uma marca colorida com os dias
 * parada (e a prescrição, quando for vez do cliente). Usa o resumo já guardado pela extensão:
 * não faz chamadas ao Onvio.
 *
 * Por que uma marca dentro da célula e não uma coluna nova: a grade (Wijmo) desenha só as células
 * visíveis, com posição absoluta, e redesenha ao rolar. Uma coluna criada por fora quebraria o layout.
 * Se a marca não aparecer, abra o console da página (F12) e rode:
 *   document.dispatchEvent(new CustomEvent('controlonvio-diagnosticar'))
 */
(function () {
  'use strict';
  if (window.__controlOnvioGrade) return;

  const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  let snap = null;
  let agendado = null;
  let observador = null, relogio = null;

  // Depois que a extensão é atualizada, o script desta aba fica órfão: o Chrome nega o acesso à extensão.
  const viva = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } };
  function desligar() {
    if (observador) observador.disconnect();
    clearInterval(relogio);
    document.querySelectorAll('.controlonvio-marca').forEach(m => m.remove());
    const d = document.createElement('div');
    d.textContent = 'O Control Onvio foi atualizado. Recarregue esta página (F5) para voltar a ver os dias parada.';
    d.style.cssText = 'position:fixed;z-index:2147483647;bottom:22px;left:50%;transform:translateX(-50%);background:#101820;color:#EDF0F3;padding:11px 16px;border-radius:4px;border-left:4px solid #6BAAC9;font:600 13px/1.4 "IBM Plex Sans",system-ui,sans-serif';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 8000);
  }

  function tipoAtual() {
    const p = location.pathname.replace(/\/+$/, '');
    return OC.TYPES.find(t => new RegExp('(^|/)' + t.route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$').test(p)) || null;
  }

  /* ---------- leitura da grade ---------- */
  // Devolve linhas { id, alvo } onde alvo é a célula "Último Trâmite" (ou a de Situação, se faltar).
  function lerGrade() {
    const linhas = [];
    const info = { modo: null, cabecalhos: [], linhas: 0 };

    // Wijmo FlexGrid: células <div class="wj-cell"> posicionadas por style.top / style.left
    for (const grade of document.querySelectorAll('.wj-flexgrid')) {
      const cab = [...grade.querySelectorAll('.wj-colheaders .wj-cell, [wj-part="ch"] .wj-cell')];
      const corpo = [...grade.querySelectorAll('.wj-cells .wj-cell, [wj-part="cells"] .wj-cell')];
      if (!cab.length || !corpo.length) continue;
      info.modo = 'wijmo';
      info.cabecalhos = cab.map(c => norm(c.textContent));
      const esq = el => Math.round(parseFloat(el.style.left) || 0);
      const colunaDe = nome => { const h = cab.find(c => norm(c.textContent) === nome); return h ? esq(h) : null; };
      const xId = colunaDe('id'), xUlt = colunaDe('ultimo tramite'), xSit = colunaDe('situacao');
      const porLinha = new Map();
      for (const c of corpo) {
        const topo = Math.round(parseFloat(c.style.top) || 0);
        if (!porLinha.has(topo)) porLinha.set(topo, []);
        porLinha.get(topo).push(c);
      }
      for (const cels of porLinha.values()) {
        const doId = xId != null ? cels.find(c => esq(c) === xId) : cels.find(c => /^\d{1,9}$/.test(c.textContent.trim()));
        if (!doId) continue;
        const alvo = (xUlt != null && cels.find(c => esq(c) === xUlt)) || (xSit != null && cels.find(c => esq(c) === xSit)) || null;
        if (alvo) linhas.push({ id: doId.textContent.trim(), alvo });
      }
      info.linhas = linhas.length;
      if (linhas.length) return { linhas, info };
    }

    // Tabela comum
    for (const tabela of document.querySelectorAll('table')) {
      const ths = [...tabela.querySelectorAll('thead th')];
      const nomes = ths.map(th => norm(th.textContent));
      const iId = nomes.indexOf('id');
      if (iId < 0) continue;
      info.modo = 'tabela';
      info.cabecalhos = nomes;
      const iAlvo = nomes.indexOf('ultimo tramite') >= 0 ? nomes.indexOf('ultimo tramite') : nomes.indexOf('situacao');
      if (iAlvo < 0) continue;
      for (const tr of tabela.querySelectorAll('tbody tr')) {
        const td = tr.children;
        if (td[iId] && td[iAlvo]) linhas.push({ id: td[iId].textContent.trim(), alvo: td[iAlvo] });
      }
      info.linhas = linhas.length;
      if (linhas.length) return { linhas, info };
    }
    return { linhas, info };
  }

  /* ---------- marca ---------- */
  // O analista vê só a idade e o prazo legal (pagamento, eSocial): o prazo interno e a prescrição não aparecem
  const legais = it => (it.motivos || []).filter(m => m.legal);
  const nivelL = it => Math.max(0, ...legais(it).map(m => m.n));
  function textoMarca(it) {
    return (it.parado || 0) + 'd parada';
  }
  function estilo(it) {
    const n = nivelL(it);
    const cor = n === 2 ? ['#C2000C', '#FBEAEA'] : n === 1 ? ['#B5530C', '#FDF0E3'] : ['#3F4B55', '#E9EEF2'];
    return 'display:inline-block;margin-left:6px;padding:0 6px;border-radius:3px;font:600 11px/18px "IBM Plex Sans",system-ui,sans-serif;white-space:nowrap;vertical-align:middle;color:' + cor[0] + ';background:' + cor[1];
  }

  function aplicar() {
    agendado = null;
    if (!viva()) { desligar(); return; }
    const tipo = tipoAtual();
    if (!tipo || !snap || !snap.items) return;
    const mapa = new Map();
    for (const it of snap.items) if (it.type === tipo.key) mapa.set(String(it.num), it);
    if (!mapa.size) return;
    const { linhas } = lerGrade();
    for (const { id, alvo } of linhas) {
      const it = mapa.get(id);
      let marca = alvo.querySelector(':scope > .controlonvio-marca');
      if (!it) { if (marca) marca.remove(); continue; }
      const texto = textoMarca(it);
      if (marca && marca.textContent === texto && marca.dataset.n === String(nivelL(it))) continue;
      if (!marca) { marca = document.createElement('span'); marca.className = 'controlonvio-marca'; alvo.appendChild(marca); }
      marca.textContent = texto;
      marca.dataset.n = String(nivelL(it));
      marca.style.cssText = estilo(it);
      marca.title = (legais(it).length ? legais(it).map(m => m.m).join(' · ') : 'Sem prazo legal perto') + ' (Control Onvio)';
    }
  }

  function agendar() { if (!agendado) agendado = setTimeout(aplicar, 250); }

  /* ---------- ciclo ---------- */
  function iniciar() {
    chrome.storage.local.get('snapshot', d => { snap = d.snapshot || null; agendar(); });
    chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.snapshot) { snap = ch.snapshot.newValue || null; agendar(); } });
    observador = new MutationObserver(agendar);
    observador.observe(document.body, { childList: true, subtree: true, characterData: true });
    let ultima = location.href;
    relogio = setInterval(() => { if (!viva()) { desligar(); return; } if (location.href !== ultima) { ultima = location.href; agendar(); } }, 1000); // o portal troca de lista sem recarregar
    window.addEventListener('scroll', agendar, true);
    // O console da página não enxerga as variáveis da extensão; este evento chega até ela.
    document.addEventListener('controlonvio-diagnosticar', () => window.__controlOnvioGrade.diagnosticar());
    // Aviso único no console se a grade não foi reconhecida (o Onvio pode ter mudado o layout).
    setTimeout(() => {
      if (tipoAtual() && snap && snap.items && snap.items.some(i => tipoAtual() && i.type === tipoAtual().key) && !lerGrade().linhas.length) {
        console.info('[Control Onvio] Não reconheci a grade desta lista. Rode no console: document.dispatchEvent(new CustomEvent("controlonvio-diagnosticar"))');
      }
    }, 20000);
  }

  window.__controlOnvioGrade = {
    aplicar,
    diagnosticar() {
      const tipo = tipoAtual();
      const { linhas, info } = lerGrade();
      const mapa = new Set(((snap && snap.items) || []).filter(i => tipo && i.type === tipo.key).map(i => String(i.num)));
      const r = {
        rota: location.pathname, tipoReconhecido: tipo && tipo.label, resumoCarregado: !!snap,
        pendentesNoResumo: mapa.size, modoDaGrade: info.modo, cabecalhos: info.cabecalhos,
        linhasLidas: linhas.length, linhasComMarca: linhas.filter(l => mapa.has(l.id)).length
      };
      console.table(r);
      return r;
    }
  };

  if (document.body) iniciar(); else addEventListener('DOMContentLoaded', iniciar);
})();

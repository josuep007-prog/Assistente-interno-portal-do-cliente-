/* Control Onvio · configurações */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const NUM = ['intervalo', 'primeiroTramite', 'conclusaoSimples', 'conclusaoCalculo', 'clienteSemRetorno', 'parada', 'prescricaoDias', 'prescricaoAviso', 'guiaDias'];
  const BOOL = ['notificar', 'modoGestor'];

  function preencher(s) {
    NUM.forEach(k => { $('#' + k).value = s[k]; });
    BOOL.forEach(k => { $('#' + k).checked = !!s[k]; });
    $('#feriados').value = (s.feriados || []).join('\n');
  }
  function ler() {
    const s = {};
    NUM.forEach(k => { const v = Number($('#' + k).value); s[k] = Number.isFinite(v) && v >= 0 ? v : OC.DEFAULTS[k]; });
    s.intervalo = Math.max(5, s.intervalo);
    BOOL.forEach(k => { s[k] = $('#' + k).checked; });
    s.feriados = $('#feriados').value.split(/\s+/).map(x => x.trim()).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x));
    return s;
  }
  function estado(msg, ok) { const e = $('#estado'); e.textContent = msg; e.classList.toggle('ok', !!ok); }

  function diagnostico(snap, tr) {
    if (!snap) return 'Ainda sem leitura do Onvio.';
    const l = ['Versão: ' + (snap.versao || chrome.runtime.getManifest().version) + ' · leitura: ' + snap.fetchedAt + ' · via ' + (snap.via || '?'),
      'Pendências por lista:'];
    OC.TYPES.forEach(t => l.push('  ' + t.label + ': ' + (snap.porTipo && snap.porTipo[t.key] != null ? snap.porTipo[t.key] : '—')));
    const desc = snap.desconhecidos || {};
    l.push('Códigos de situação desconhecidos: ' + (Object.keys(desc).length ? Object.entries(desc).map(([k, v]) => OC.TYPE_BY_KEY[k].label + ' ' + Object.entries(v).map(([c, n]) => 'código ' + c + ' (' + n + ')').join(', ')).join(' | ') : 'nenhum'));
    l.push('Filtro por lista (Rubricas): ' + (snap.filtroAlternativo && snap.filtroAlternativo.length ? 'o Onvio recusou o filtro por exclusão e a extensão usou a lista de códigos (' + snap.filtroAlternativo.join(', ') + ')' : 'por exclusão (tudo menos Concluído e Prescrita)'));
    const t = snap.tramites || {};
    l.push('Trâmites lidos neste ciclo: ' + (t.lidos || 0) + ' · falhas: ' + (t.falhas || 0) + ' · com 1º trâmite conhecido: ' + (snap.items || []).filter(i => i.ptUteis != null).length + ' de ' + (snap.items || []).length);
    if (snap.erros && snap.erros.length) l.push('Erros: ' + snap.erros.join(' | '));
    return l.join('\n');
  }

  chrome.storage.local.get(['settings', 'snapshot'], d => {
    preencher(Object.assign({}, OC.DEFAULTS, d.settings || {}));
    $('#diag').textContent = diagnostico(d.snapshot);
  });
  $('#salvar').addEventListener('click', async () => {
    await chrome.storage.local.set({ settings: ler() });
    estado('Salvo. Vale a partir da próxima leitura.', true);
    chrome.runtime.sendMessage({ cmd: 'atualizar' });
  });
  $('#padrao').addEventListener('click', () => { preencher(OC.DEFAULTS); estado('Padrão carregado; clique em Salvar para aplicar.'); });
})();

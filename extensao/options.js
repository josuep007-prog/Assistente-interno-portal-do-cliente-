/* Control Onvio · configurações */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const NUM = ['intervalo', 'primeiroTramite', 'conclusaoSimples', 'conclusaoCalculo', 'clienteSemRetorno', 'parada', 'prescricaoDias', 'prescricaoAviso'];
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

  chrome.storage.local.get('settings', d => preencher(Object.assign({}, OC.DEFAULTS, d.settings || {})));
  $('#salvar').addEventListener('click', async () => {
    await chrome.storage.local.set({ settings: ler() });
    estado('Salvo. Vale a partir da próxima leitura.', true);
    chrome.runtime.sendMessage({ cmd: 'atualizar' });
  });
  $('#padrao').addEventListener('click', () => { preencher(OC.DEFAULTS); estado('Padrão carregado; clique em Salvar para aplicar.'); });
})();

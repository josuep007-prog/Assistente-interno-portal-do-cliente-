/* Configurações · a mesma página de opções da extensão, dentro do app */
export function render(el) {
  el.innerHTML = '<div class="cab"><div><h1>Configurações</h1><div class="sub">Prazos, leitura ao vivo, regras do escritório, aprender ações e diagnóstico</div></div></div>' +
    '<iframe class="cfg-frame" src="../options.html" title="Configurações do Control Onvio"></iframe>';
}

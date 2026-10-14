/* Configurações · a mesma página de opções da extensão, dentro do app */
export function render(el, ctx) {
  ctx.cab({ titulo: 'Configurações', sub: 'Prazos, leitura ao vivo, regras do escritório, aprender ações e diagnóstico' });
  el.innerHTML = '<iframe class="cfg-frame" src="../options.html" title="Configurações do Control Onvio"></iframe>';
}

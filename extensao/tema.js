/* Aplica o tema antes de a página aparecer (evita o piscar). Sem escolha salva o padrão é o claro; o escuro só por escolha no botão.
 * O estilo (data-estilo) é outra escolha: "simples" (de fábrica) ou "atual" (o desenho de antes da 0.42.0), em Configurações → Aparência. */
try {
  var t = localStorage.getItem('controlonvio-theme'), e = localStorage.getItem('controlonvio-estilo');
  document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
  document.documentElement.setAttribute('data-estilo', e === 'atual' ? 'atual' : 'simples');
} catch (x) { document.documentElement.setAttribute('data-theme', 'light'); document.documentElement.setAttribute('data-estilo', 'simples'); }

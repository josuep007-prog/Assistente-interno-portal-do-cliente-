/* Aplica o tema antes de a página aparecer (evita o piscar). Sem escolha salva o padrão é o claro; o escuro só por escolha no botão. */
try { var t = localStorage.getItem('controlonvio-theme'); document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light'); } catch (e) { document.documentElement.setAttribute('data-theme', 'light'); }

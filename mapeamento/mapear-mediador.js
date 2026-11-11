/* Mapeamento do Mediador do MTE (consulta pública de convenções e acordos coletivos), para o módulo Convenções do Hub
 * (Josué, 11/11/2026: "o módulo convenções hoje está 100% manual"; primeiro passo: saber se a extensão consegue ler o
 * Mediador sozinha ou só com a pessoa clicando). Rodar no console de uma aba do Mediador.
 *
 * ESTE ROTEIRO NÃO CONSULTA NADA SOZINHO. Ele só observa a tela enquanto a pessoa faz a consulta à mão e anota a FORMA:
 *  - as chamadas que a página faz (método, endereço com {n} no lugar dos números, nomes dos parâmetros, nomes e tipos dos
 *    campos enviados e recebidos, situação HTTP);
 *  - em cada tela marcada: formulários (para onde vão, método, nomes e tipos dos campos, rótulos), se há captcha (e qual),
 *    tabelas (os títulos das colunas, quantas linhas e o TIPO de cada célula da 1ª linha: data, CNPJ, número de registro,
 *    texto…), links (endereço com {n}, o texto do link quando é curto, como "Visualizar" ou "PDF"), quadros (iframe) e
 *    botões.
 * Nunca anota o que a pessoa digita (CNPJ, nome do sindicato), nem o conteúdo das células, nem cookies. O Mediador é público
 * e não tem dado de cliente, mas o resultado fica só com a forma, como nos mapeamentos do Onvio e do Gestta.
 * As anotações ficam só nesta aba (sessionStorage) até a pessoa copiar o resultado.
 *
 * Uso:
 *   1. Cole este roteiro no console e tecle Enter. Aparece "mapeamento do Mediador ligado".
 *   2. Em cada tela importante, rode  medMapa.tela('nome')  (ex.: medMapa.tela('formulário de consulta')).
 *   3. Faça a consulta normalmente. Se a página recarregar, cole e rode o roteiro de novo: as anotações continuam.
 *   4. No fim, rode  medMapa.resultado()  : o texto vai para a área de transferência.
 *   medMapa.parar() desliga a escuta; medMapa.limpar() apaga as anotações. */
(() => {
  const CHAVE = 'medMapa.v2', MAX = 300;
  if (window.medMapa && window.medMapa.ligado) { console.log('mapeamento do Mediador já está ligado nesta página (' + window.medMapa.n() + ' anotações)'); return; }
  let notas = [];
  try { notas = JSON.parse(sessionStorage.getItem(CHAVE) || '[]'); } catch (e) { notas = []; }
  const guardar = () => { try { sessionStorage.setItem(CHAVE, JSON.stringify(notas.slice(-MAX))); } catch (e) {} };
  let marca = (notas.filter(n => n.marca).slice(-1)[0] || {}).marca || '';

  // ---- só a forma, nunca o valor ----
  const limpo = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const tipoTexto = (s) => {
    s = limpo(s);
    if (!s) return 'vazio';
    if (/^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/.test(s)) return 'CNPJ';
    if (/^\d{2}\/\d{2}\/\d{4}( \d{2}:\d{2}(:\d{2})?)?$/.test(s)) return 'data (dd/mm/aaaa)';
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return 'data (aaaa-mm-dd)';
    if (/^\d{2}\/\d{2}\/\d{4}\s*(a|até|-)\s*\d{2}\/\d{2}\/\d{4}$/i.test(s)) return 'período (data a data)';
    if (/^[A-Z]{2}\d{5,7}\/\d{4}$/.test(s)) return 'número de registro (UF000000/AAAA)';
    if (/^\d{5}\.\d{6}\/\d{4}-\d{2}$/.test(s)) return 'número de processo';
    if (/^[\d.,]+\s*%$/.test(s)) return 'percentual';
    if (/^R\$\s*[\d.,]+$/.test(s)) return 'valor em reais';
    if (/^\d+$/.test(s)) return 'número';
    if (/^(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(\/\d{4})?$/i.test(s)) return 'mês';
    return 'texto (' + (s.length <= 20 ? 'curto' : s.length <= 80 ? 'médio' : 'longo') + ')';
  };
  const forma = (v, prof) => {
    if (v == null) return 'vazio';
    if (Array.isArray(v)) return v.length ? [forma(v[0], prof + 1), 'itens: ' + v.length] : ['lista vazia'];
    if (typeof v === 'object') { if (prof > 5) return 'objeto'; const o = {}; for (const c of Object.keys(v).sort()) o[c] = forma(v[c], prof + 1); return o; }
    if (typeof v === 'string') return tipoTexto(v);
    return typeof v === 'number' ? 'número' : typeof v === 'boolean' ? 'booleano' : typeof v;
  };
  const molde = (url) => {
    let u; try { u = new URL(url, location.href); } catch (e) { return { host: '?', caminho: '?', parametros: [] }; }
    const segs = u.pathname.split('/').map(s => /^\d+$/.test(s) ? '{n}' : /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s) ? '{uuid}' : /^[0-9a-f]{24,}$/i.test(s) ? '{id}' : s.length > 50 ? '{longo}' : s.replace(/\d{3,}/g, '{n}'));      // números dentro do nome (987654.pdf) também
    return { host: u.hostname, caminho: segs.join('/'), parametros: [...new Set([...u.searchParams.keys()])].sort() };
  };
  const corpoForma = (b) => {
    if (b == null || b === '') return 'sem corpo';
    if (typeof FormData !== 'undefined' && b instanceof FormData) { const o = {}; for (const [k, v] of b.entries()) o[k] = typeof v === 'string' ? tipoTexto(v) : 'arquivo'; return { formulário: o }; }
    if (typeof URLSearchParams !== 'undefined' && b instanceof URLSearchParams) return { 'campos de formulário': [...b.keys()].sort() };
    if (typeof b === 'string') {
      try { return forma(JSON.parse(b), 0); } catch (e) {}
      if (/^[\w.%-]+=/.test(b)) { try { return { 'campos de formulário': [...new URLSearchParams(b).keys()].sort() }; } catch (e) {} }
      return 'texto (' + b.length + ' caracteres)';
    }
    return typeof b;
  };
  // v2: o esqueleto de um pedaço de HTML: tags, classes e ids, com o texto trocado pelo tipo (para a extensão saber onde ler)
  const esqueletoEl = (el, prof) => {
    if (!el || prof > 7) return '…';
    if (el.nodeType === 3) { const t = limpo(el.textContent); return t ? '«' + tipoTexto(t) + '»' : ''; }
    if (el.nodeType !== 1) return '';
    const tag = el.tagName.toLowerCase() + (el.id ? '#' + el.id.replace(/\d{3,}/g, '{n}') : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
    const on = el.getAttribute && el.getAttribute('onclick'); const href = el.getAttribute && el.getAttribute('href');
    const extra = (on ? ' onclick=' + mascaraJs(on) : '') + (href && !/^#$/.test(href) ? ' href=' + (/^javascript:/i.test(href) ? mascaraJs(href) : molde(href).caminho) : '');
    const filhos = [...el.childNodes].map(c => esqueletoEl(c, prof + 1)).filter(Boolean);
    return filhos.length ? { [tag + extra]: filhos.length > 12 ? filhos.slice(0, 12).concat(['… +' + (filhos.length - 12)]) : filhos } : tag + extra;
  };
  // chamada de função em onclick/href: o nome e a forma dos argumentos (MR{n}_{n}, {n}…), nunca os valores
  const mascaraJs = (js) => String(js).replace(/\s+/g, ' ').trim().slice(0, 160).replace(/'([^']*)'|"([^"]*)"/g, (m, a, b) => "'" + String(a != null ? a : b).replace(/\d+/g, '{n}').replace(/[A-Za-zÀ-ú]{4,}/g, (w) => /^(MR|true|false|null)$/i.test(w) ? w : '{texto}') + "'").replace(/\b\d+\b/g, '{n}');
  const esqueletoHtml = (html) => {
    try {
      const doc = new DOMParser().parseFromString(String(html), 'text/html');
      const comDownload = [...doc.querySelectorAll('[onclick*="fDownload"],[href*="fDownload"]')];
      // o bloco de um instrumento: o menor ancestral do 1º link "Download" que não contém o 2º
      let bloco = comDownload[0] || null;
      while (bloco && bloco.parentElement && !(comDownload[1] && bloco.parentElement.contains(comDownload[1]))) bloco = bloco.parentElement;
      const funcoes = [...new Set([...doc.querySelectorAll('[onclick],[href^="javascript"]')].map(e => mascaraJs(e.getAttribute('onclick') || e.getAttribute('href'))))].slice(0, 40);
      const paginas = [...doc.querySelectorAll('a,button,li,span')].filter(e => /^(\d{1,3}|próxim\w*|anterior|»|«|>|<|primeira|última)$/i.test(limpo(e.textContent))).slice(0, 12).map(e => esqueletoEl(e, 6));
      return { tamanho: Math.round(String(html).length / 1024) + ' KB', instrumentos: comDownload.length, umInstrumento: bloco ? esqueletoEl(bloco, 0) : 'não achei o link Download', funcoes, paginacao: paginas,
        totalNaPagina: (limpo(doc.body.textContent).match(/(\d+)\s*(registros?|resultados?|instrumentos?)\b/i) || [, ''])[2] || '' };
    } catch (e) { return 'não deu para ler o HTML: ' + e.message; }
  };
  const respostaForma = (texto, tipo) => {
    if (!texto) return 'vazia';
    if (/json/.test(tipo || '') || /^[[{]/.test(String(texto).trim())) { try { return forma(JSON.parse(texto), 0); } catch (e) {} }
    if (/html/.test(tipo || '') || /^\s*</.test(String(texto))) return { html: esqueletoHtml(texto) };      // v2
    return (tipo || 'sem tipo') + ', ' + Math.round(String(texto).length / 1024) + ' KB';
  };
  const anotar = (n) => {
    const u = notas[notas.length - 1];
    if (u && u.metodo === n.metodo && u.caminho === n.caminho && u.status === n.status) return;      // a mesma chamada seguida conta uma vez
    n.tela = marca || '(sem marca)'; n.quando = new Date().toISOString().slice(11, 19);
    notas.push(n); if (notas.length > MAX) notas = notas.slice(-MAX); guardar();
    console.log('%c[mediador] ' + n.metodo + ' ' + n.caminho + (n.status ? ' → ' + n.status : ''), 'color:#0a7');
  };

  // ---- a tela: formulários, captcha, tabelas, links, quadros e botões (só a forma) ----
  const rotuloDe = (el) => {
    const id = el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
    const t = limpo((id && id.textContent) || (el.closest('label') && el.closest('label').textContent) || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.title || '');
    return t.length <= 60 ? t : t.slice(0, 60) + '…';
  };
  const captcha = () => {
    const achados = [];
    if (document.querySelector('.g-recaptcha, iframe[src*="recaptcha"], script[src*="recaptcha"]')) achados.push('reCAPTCHA (Google)');
    if (document.querySelector('.h-captcha, iframe[src*="hcaptcha"], script[src*="hcaptcha"]')) achados.push('hCaptcha');
    if (document.querySelector('.cf-turnstile, iframe[src*="challenges.cloudflare"]')) achados.push('Cloudflare Turnstile');
    const img = [...document.querySelectorAll('img')].find(i => /captcha|imagem.?de.?verifica|jcaptcha|kaptcha/i.test((i.src || '') + ' ' + (i.alt || '') + ' ' + (i.id || '') + ' ' + (i.className || '')));
    if (img) achados.push('imagem com letras (captcha clássico): ' + molde(img.src).caminho);
    const campo = [...document.querySelectorAll('input')].find(i => /captcha|codigo.?seguranca|verifica/i.test((i.name || '') + ' ' + (i.id || '')));
    if (campo) achados.push('campo de código: ' + (campo.name || campo.id));
    return achados.length ? achados : ['nenhum à vista'];
  };
  const formularios = () => [...document.forms].slice(0, 10).map(f => ({
    destino: molde(f.getAttribute('action') || location.href).caminho, metodo: (f.getAttribute('method') || 'GET').toUpperCase(),
    campos: [...f.elements].filter(e => e.name || e.id).slice(0, 60).map(e => {
      const c = { nome: e.name || '', id: e.id || '', tipo: e.tagName === 'SELECT' ? 'lista' : e.tagName === 'TEXTAREA' ? 'texto longo' : (e.type || 'texto'), rotulo: rotuloDe(e) };
      if (e.tagName === 'SELECT') { c.opcoes = [...e.options].slice(0, 25).map(o => limpo(o.textContent).slice(0, 50)); c.nOpcoes = e.options.length; }      // as opções da lista são do próprio site (tipos de instrumento, UF…)
      if (e.type === 'hidden') { c.tipo = 'oculto'; c.valor = tipoTexto(e.value) + (e.value && e.value.length > 200 ? ' (grande: estado da página)' : ''); }
      if (e.type === 'radio' || e.type === 'checkbox') c.rotulo = rotuloDe(e) || limpo(e.value).slice(0, 40);
      return c;
    }),
  }));
  const tabelas = () => [...document.querySelectorAll('table')].filter(t => t.rows.length > 1).slice(0, 8).map(t => {
    const cab = [...(t.tHead ? t.tHead.rows[0].cells : t.rows[0].cells)].map(c => limpo(c.textContent).slice(0, 50));
    const corpo = t.tHead ? [...t.tBodies].flatMap(b => [...b.rows]) : [...t.rows].slice(1);
    const primeira = corpo.find(r => r.cells.length > 1 && !r.querySelector('th'));
    return {
      colunas: cab, linhas: corpo.length,
      primeiraLinha: primeira ? [...primeira.cells].map(c => {
        const a = c.querySelector('a'), b = c.querySelector('input,button,img');
        return tipoTexto(c.textContent) + (a ? ' + link ' + molde(a.getAttribute('href') || '').caminho + (/javascript:|^#/.test(a.getAttribute('href') || '') ? ' (' + (a.getAttribute('onclick') ? 'onclick' : 'script') + ')' : '') : '') + (b ? ' + ' + b.tagName.toLowerCase() : '');
      }) : [],
      paginacao: !!t.parentElement && /próxim|anterior|página|pagina/i.test(limpo(t.parentElement.textContent).slice(-400)),
    };
  });
  const links = () => {
    const vistos = new Map();
    for (const a of document.querySelectorAll('a[href]')) {
      const h = a.getAttribute('href') || '', txt = limpo(a.textContent);
      const k = /^javascript:/i.test(h) ? 'javascript (' + (h.match(/javascript:\s*([\w.$]+)/i) || [, '?'])[1] + ')' : molde(h).host + molde(h).caminho;
      if (!vistos.has(k)) vistos.set(k, { endereco: k, parametros: /^javascript:/i.test(h) ? [] : molde(h).parametros, texto: txt.length <= 25 ? txt : tipoTexto(txt), vezes: 0, pdf: /\.pdf(\?|$)/i.test(h) || /pdf/i.test(txt) });
      vistos.get(k).vezes++;
    }
    return [...vistos.values()].slice(0, 60);
  };
  const tela = () => ({
    pagina: molde(location.href), titulo: limpo(document.title).slice(0, 80), captcha: captcha(),
    formularios: formularios(), tabelas: tabelas(), links: links(),
    funcoes: [...new Set([...document.querySelectorAll('[onclick],[href^="javascript"]')].map(e => mascaraJs(e.getAttribute('onclick') || e.getAttribute('href'))))].slice(0, 40),      // v2
    quadros: [...document.querySelectorAll('iframe,frame')].map(f => molde(f.src || '').host + molde(f.src || '').caminho).slice(0, 10),
    botoes: [...document.querySelectorAll('button, input[type=submit], input[type=button], input[type=image]')].map(b => limpo(b.value || b.textContent || b.alt).slice(0, 30)).filter(Boolean).slice(0, 20),
    tecnologia: [window.jQuery && 'jQuery', window.angular && 'AngularJS', window.PrimeFaces && 'PrimeFaces (JSF)', document.querySelector('input[name="javax.faces.ViewState"]') && 'JSF ViewState', document.querySelector('input[name="__VIEWSTATE"]') && 'ASP.NET ViewState', window.__NEXT_DATA__ && 'Next.js', document.querySelector('[ng-app],[data-ng-app]') && 'ng-app'].filter(Boolean),
  });

  // ---- escuta: XMLHttpRequest e fetch (só a forma) ----
  const XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, url) { this.__med = { metodo: String(m || 'GET').toUpperCase(), url: String(url) }; return XO.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) {
    const r = this.__med, envio = corpoForma(b);
    if (r) this.addEventListener('loadend', () => {
      let resposta = 'não lida';
      try { resposta = (this.responseType === '' || this.responseType === 'text') ? respostaForma(this.responseText, this.getResponseHeader('content-type')) : (this.responseType === 'json' ? forma(this.response, 0) : this.responseType); } catch (e) {}
      anotar(Object.assign(molde(r.url), { via: 'xhr', metodo: r.metodo, envio, status: this.status, resposta }));
    });
    return XS.apply(this, arguments);
  };
  const F = window.fetch;
  window.fetch = async function (entrada, op) {
    const url = typeof entrada === 'string' ? entrada : (entrada && entrada.url) || String(entrada);
    const metodo = String((op && op.method) || (entrada && entrada.method) || 'GET').toUpperCase();
    const envio = corpoForma(op && op.body);
    const res = await F.apply(this, arguments);
    let resposta = 'não lida';
    try { resposta = respostaForma(await res.clone().text(), res.headers.get('content-type')); } catch (e) {}
    anotar(Object.assign(molde(url), { via: 'fetch', metodo, envio, status: res.status, resposta }));
    return res;
  };
  // envio de formulário que troca a página inteira (o jeito antigo): anota para onde vai e os nomes dos campos
  const aoEnviar = (e) => { const f = e.target; if (!f || f.tagName !== 'FORM') return; const d = new FormData(f);
    notas.push({ tela: marca || '(sem marca)', quando: new Date().toISOString().slice(11, 19), via: 'formulário (página inteira)', metodo: (f.getAttribute('method') || 'GET').toUpperCase(), caminho: molde(f.getAttribute('action') || location.href).caminho, envio: { 'campos de formulário': [...new Set([...d.keys()])].sort() } }); guardar(); };
  document.addEventListener('submit', aoEnviar, true);

  window.medMapa = {
    ligado: true,
    n: () => notas.length,
    tela(nome) {
      marca = String(nome || '').slice(0, 60);
      const t = tela();
      notas.push(Object.assign({ marca, quando: new Date().toISOString().slice(11, 19) }, t)); guardar();
      console.log('[mediador] tela "' + marca + '": ' + t.formularios.length + ' formulário(s), ' + t.tabelas.length + ' tabela(s), captcha: ' + t.captcha.join(', '));
      return t.captcha;
    },
    // v2: a estrutura do texto da convenção aberta (títulos, cláusulas, tabelas), só a forma
    estrutura(nome) {
      marca = String(nome || 'estrutura').slice(0, 60);
      const corpo = document.body, txt = limpo(corpo.textContent);
      const titulos = [...corpo.querySelectorAll('h1,h2,h3,h4,h5,strong,b,p')].map(e => limpo(e.textContent)).filter(t => t && t.length <= 90 && /^(CL[ÁA]USULA|CAP[ÍI]TULO|T[ÍI]TULO|ANEXO|SAL[ÁA]RIO|REAJUSTE|PISO|VIG[ÊE]NCIA|DATA.?BASE|CONTRIBUI|ABRANG)/i.test(t))
        .map(t => t.replace(/\d+/g, '{n}').replace(/(CL[ÁA]USULA\s+\S+)\s*[-–:]?\s*(.*)/i, (m, a, b) => a + (b ? ' - ' + b : ''))).slice(0, 120);
      const e = { marca, quando: new Date().toISOString().slice(11, 19), pagina: molde(location.href), tamanhoTexto: Math.round(txt.length / 1024) + ' KB', clausulas: (txt.match(/CL[ÁA]USULA\s/gi) || []).length,
        titulos, tabelas: tabelas(), temVigencia: /vig[êe]ncia/i.test(txt), temDataBase: /data.?base/i.test(txt), temPiso: /piso/i.test(txt), temReajuste: /reajust/i.test(txt), temPercentual: /\d+[.,]?\d*\s*%/.test(txt), esqueleto: esqueletoEl(corpo, 0) };
      notas.push(e); guardar(); console.log('[mediador] estrutura "' + marca + '": ' + e.clausulas + ' cláusulas, ' + titulos.length + ' títulos'); return e.clausulas;
    },
    resultado() {
      const saida = { roteiro: 'mapear-mediador v2', quando: new Date().toISOString().slice(0, 16), navegador: (navigator.userAgent.match(/Chrome\/\d+/) || [''])[0], anotacoes: notas };
      const texto = JSON.stringify(saida, null, 1);
      try { navigator.clipboard.writeText(texto); } catch (e) {}
      try { copy(texto); } catch (e) {}
      console.log(texto); console.log('pronto: ' + notas.length + ' anotações (o texto também foi copiado)');
      return notas.length;
    },
    parar() { XMLHttpRequest.prototype.open = XO; XMLHttpRequest.prototype.send = XS; window.fetch = F; document.removeEventListener('submit', aoEnviar, true); this.ligado = false; console.log('mapeamento desligado (as anotações continuam guardadas nesta aba)'); },
    limpar() { notas = []; marca = ''; guardar(); console.log('anotações apagadas'); },
  };
  console.log('mapeamento do Mediador ligado (' + notas.length + ' anotações já guardadas). Em cada tela: medMapa.tela("nome"). No fim: medMapa.resultado()');
})();

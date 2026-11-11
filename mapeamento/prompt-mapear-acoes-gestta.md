# Mapear as ações do Gestta (concluir, impedimento, comentário, documento)

O Josué aprovou em 11/11/2026 quatro ações do Gestta para a extensão: **concluir a tarefa e as etapas**, **registrar e retirar impedimento**, **comentar** e **enviar documento**. Antes de a extensão fazer qualquer uma delas, é preciso ver como a própria tela do Gestta faz. Este passo a passo serve para isso.

**O roteiro não grava nada no Gestta.** Ele não chama a API: só escuta as chamadas que a tela do Gestta faz enquanto você executa cada ação à mão. Anota só o formato (endereço, nomes dos campos e tipos, códigos como `DONE`), nunca nomes, CNPJ, textos, nomes de arquivo nem o token.

## Antes de começar

- Use uma **empresa de teste** no Gestta, com uma tarefa aberta que tenha etapas e um documento a enviar. As ações são de verdade: a tarefa vai ficar concluída, comentada e com documento.
- Se a tarefa notifica o cliente, desligue a notificação ou use uma empresa sem contato de cliente, para nenhum e-mail sair.

## Passo a passo

1. Abra o Gestta logado e abra a tarefa da empresa de teste.
2. Abra o console do Chrome (F12 › Console), cole o roteiro do fim desta página e tecle Enter. Deve aparecer "mapeamento ligado".
3. Para cada ação abaixo, **primeiro** rode a linha `gtMapa.marcar(...)` indicada no console, **depois** faça a ação na tela do Gestta, do jeito de sempre:

| # | Rode antes no console | Depois faça na tela do Gestta |
| --- | --- | --- |
| 1 | `gtMapa.marcar('marcar etapa')` | marque uma etapa da tarefa como feita |
| 2 | `gtMapa.marcar('desmarcar etapa')` | desmarque essa etapa (se o Gestta deixar) |
| 3 | `gtMapa.marcar('registrar impedimento')` | registre um impedimento, com um motivo qualquer |
| 4 | `gtMapa.marcar('retirar impedimento')` | retire o impedimento |
| 5 | `gtMapa.marcar('comentar')` | escreva um comentário na tarefa |
| 6 | `gtMapa.marcar('enviar documento')` | anexe um arquivo qualquer (um PDF de teste) no documento da tarefa e envie |
| 7 | `gtMapa.marcar('enviar documento pelo express')` | se vocês usam o Express para dar baixa, envie um arquivo por ele também (depois de abrir o Express, rode o roteiro de novo) |
| 8 | `gtMapa.marcar('concluir tarefa')` | conclua a tarefa |
| 9 | `gtMapa.marcar('reabrir tarefa')` | reabra a tarefa (se o Gestta deixar) |

4. Se a página recarregar no meio, cole o roteiro de novo: o que já foi anotado continua guardado nesta aba.
5. No fim, rode `gtMapa.resultado()`. O texto vai para a área de transferência: cole na conversa do Claude Code.
6. Rode `gtMapa.parar()` (ou feche a aba). Se quiser apagar as anotações da aba, `gtMapa.limpar()`.

Se uma ação não existir na tela, pule e diga qual foi. Se der erro, mande a mensagem.

## O que vem depois

Com o resultado, cada ação entra na extensão do mesmo jeito que as do Onvio: um pedido montado só para aquele endereço e aquele método, uma regra no código que recusa todo o resto (`OCG.leituraPermitida` ganha a lista das escritas aprovadas), um teste com o Gestta simulado e, na tela, sempre a confirmação da pessoa antes de gravar.

## O roteiro

Cópia de `mapeamento/mapear-acoes-gestta.js` (teste: `node testes/mapear-acoes-gestta.js`).

```js
/* Mapeamento das ações do Gestta (aprovadas pelo Josué em 11/11/2026: concluir tarefa e etapas, impedimento, comentário e
 * envio de documento). Rodar no console de uma aba do Gestta já logada (app.gestta.com.br).
 *
 * ESTE ROTEIRO NÃO CHAMA A API. Ele só escuta as chamadas que a própria tela do Gestta faz enquanto a pessoa executa cada
 * ação, à mão, numa EMPRESA DE TESTE. Anota, para cada chamada: método, endereço com {id} no lugar dos ids, nomes dos
 * parâmetros, nomes e tipos dos campos enviados e recebidos, a situação HTTP e os códigos de situação em maiúsculas
 * (DONE, OPEN, IMPEDIMENT…). Nunca anota valores (nome, CNPJ, texto de comentário, motivo, nome de arquivo), nem o token,
 * nem cookies. As anotações ficam só nesta aba (sessionStorage) até a pessoa copiar o resultado.
 *
 * Uso:
 *   1. Cole este roteiro no console e tecle Enter. Aparece "mapeamento ligado".
 *   2. Antes de cada ação, rode  gtMapa.marcar('nome da ação')  (ex.: gtMapa.marcar('concluir etapa')).
 *   3. Faça a ação na tela do Gestta, numa empresa de teste.
 *   4. No fim, rode  gtMapa.resultado()  : o texto vai para a área de transferência. Cole na conversa do Claude Code.
 *   Se a página recarregar (ou abrir o Express), rode o roteiro de novo: o que já foi anotado continua guardado.
 *   gtMapa.parar() desliga a escuta; gtMapa.limpar() apaga as anotações. */
(() => {
  const CHAVE = 'gtMapa.v1', MAX = 400;
  if (window.gtMapa && window.gtMapa.ligado) { console.log('mapeamento já está ligado nesta página (' + window.gtMapa.n() + ' anotações)'); return; }
  let notas = [];
  try { notas = JSON.parse(sessionStorage.getItem(CHAVE) || '[]'); } catch (e) { notas = []; }
  const guardar = () => { try { sessionStorage.setItem(CHAVE, JSON.stringify(notas.slice(-MAX))); } catch (e) {} };
  let acao = (notas.filter(n => n.marca).slice(-1)[0] || {}).marca || '';

  // ---- só a forma, nunca o valor ----
  const CODIGO = /^[A-Z][A-Z0-9_]{1,40}$/;
  const tipoTexto = (s) => /^\d{4}-\d\d-\d\d(T|$)/.test(s) ? 'data' : /^[0-9a-f]{24}$/i.test(s) ? 'id' : CODIGO.test(s) ? 'código ' + s : 'texto';
  const forma = (v, prof) => {
    if (v == null) return 'vazio';
    if (Array.isArray(v)) return v.length ? [forma(v[0], prof + 1), 'itens: ' + v.length] : ['lista vazia'];
    if (typeof Blob !== 'undefined' && v instanceof Blob) return 'arquivo (' + (v.type || 'sem tipo') + ', ' + Math.round(v.size / 1024) + ' KB)';
    if (typeof v === 'object') {
      if (prof > 5) return 'objeto';
      const o = {};
      for (const c of Object.keys(v).sort()) o[c] = forma(v[c], prof + 1);
      return o;
    }
    if (typeof v === 'string') return tipoTexto(v);
    return typeof v === 'number' ? 'número' : typeof v === 'boolean' ? 'booleano' : typeof v;
  };
  const caminho = (url) => {
    let u; try { u = new URL(url, location.href); } catch (e) { return { host: '?', caminho: '?', parametros: [] }; }
    const segs = u.pathname.split('/').map(s => /^[0-9a-f]{24}$/i.test(s) ? '{id}' : /^\d+$/.test(s) ? '{n}'
      : /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s) ? '{uuid}' : s.length > 40 ? '{longo}' : s);
    return { host: u.hostname, caminho: segs.join('/'), parametros: [...new Set([...u.searchParams.keys()])].sort() };
  };
  const corpoForma = (b) => {
    if (b == null || b === '') return 'sem corpo';
    if (typeof FormData !== 'undefined' && b instanceof FormData) {
      const o = {}; for (const [k, v] of b.entries()) o[k] = typeof v === 'string' ? tipoTexto(v) : forma(v, 0);
      return { formulário: o };
    }
    if (typeof Blob !== 'undefined' && b instanceof Blob) return forma(b, 0);
    if (typeof URLSearchParams !== 'undefined' && b instanceof URLSearchParams) return { 'campos de formulário': [...b.keys()].sort() };
    if (typeof b === 'string') { try { return forma(JSON.parse(b), 0); } catch (e) { return 'texto (' + b.length + ' caracteres)'; } }
    return typeof b;
  };
  const respostaForma = (texto, tipo) => {
    if (!texto) return 'vazia';
    if (/json/.test(tipo || '') || /^[[{]/.test(String(texto).trim())) { try { return forma(JSON.parse(texto), 0); } catch (e) {} }
    return (tipo || 'sem tipo') + ', ' + Math.round(String(texto).length / 1024) + ' KB';
  };
  // GET entra na hora do envio, só como endereço (sem corpo nem resposta) e uma vez seguida; as escritas entram ao voltar,
  // inteiras, com a ação marcada quando saíram
  const anotar = (n, acaoNoEnvio) => {
    if (n.metodo === 'GET') { const u = notas[notas.length - 1]; if (u && u.metodo === 'GET' && u.caminho === n.caminho) return; }
    n.acao = acaoNoEnvio || '(sem marca)'; n.quando = new Date().toISOString().slice(11, 19);
    notas.push(n); if (notas.length > MAX) notas = notas.slice(-MAX); guardar();
    if (n.metodo !== 'GET') console.log('%c[mapa] ' + n.metodo + ' ' + n.caminho + ' → ' + n.status, 'color:#0a7');
  };

  // ---- escuta: XMLHttpRequest (AngularJS) e fetch (Express) ----
  const XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send, XH = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (m, url) { this.__gtm = { metodo: String(m || 'GET').toUpperCase(), url: String(url), cab: [] }; return XO.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k) { if (this.__gtm) this.__gtm.cab.push(String(k).toLowerCase()); return XH.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) {
    const r = this.__gtm;
    if (r && r.metodo === 'GET') anotar(Object.assign(caminho(r.url), { via: 'xhr', metodo: 'GET', cabecalhos: [...new Set(r.cab)].sort() }), acao);
    else if (r) {
      const envio = corpoForma(b), naHora = acao;
      this.addEventListener('loadend', () => {
        let resposta = 'não lida';
        try { resposta = (this.responseType === '' || this.responseType === 'text') ? respostaForma(this.responseText, this.getResponseHeader('content-type')) : (this.responseType === 'json' ? forma(this.response, 0) : this.responseType); } catch (e) {}
        anotar(Object.assign(caminho(r.url), { via: 'xhr', metodo: r.metodo, cabecalhos: [...new Set(r.cab)].sort(), envio, status: this.status, resposta }), naHora);
      });
    }
    return XS.apply(this, arguments);
  };
  const F = window.fetch;
  window.fetch = async function (entrada, op) {
    const url = typeof entrada === 'string' ? entrada : (entrada && entrada.url) || String(entrada);
    const metodo = String((op && op.method) || (entrada && entrada.method) || 'GET').toUpperCase();
    const cab = []; try { new Headers((op && op.headers) || (entrada && entrada.headers) || {}).forEach((v, k) => cab.push(k)); } catch (e) {}
    if (metodo === 'GET') { anotar(Object.assign(caminho(url), { via: 'fetch', metodo, cabecalhos: cab.sort() }), acao); return F.apply(this, arguments); }
    const envio = corpoForma(op && op.body), naHora = acao;
    const res = await F.apply(this, arguments);
    let resposta = 'não lida';
    try { resposta = respostaForma(await res.clone().text(), res.headers.get('content-type')); } catch (e) {}
    anotar(Object.assign(caminho(url), { via: 'fetch', metodo, cabecalhos: cab.sort(), envio, status: res.status, resposta }), naHora);
    return res;
  };

  window.gtMapa = {
    ligado: true,
    n: () => notas.length,
    marcar(nome) { acao = String(nome || '').slice(0, 60); notas.push({ marca: acao, quando: new Date().toISOString().slice(11, 19) }); guardar(); console.log('[mapa] próxima ação: ' + acao); },
    resultado() {
      const saida = { roteiro: 'mapear-acoes-gestta v1', pagina: location.pathname + location.hash.replace(/[0-9a-f]{24}/gi, '{id}'), quando: new Date().toISOString().slice(0, 16), anotacoes: notas };
      const texto = JSON.stringify(saida, null, 1);
      try { navigator.clipboard.writeText(texto); } catch (e) {}
      try { copy(texto); } catch (e) {}
      console.log(texto); console.log('pronto: ' + notas.length + ' anotações (o texto também foi copiado)');
      return notas.length;
    },
    parar() { XMLHttpRequest.prototype.open = XO; XMLHttpRequest.prototype.send = XS; XMLHttpRequest.prototype.setRequestHeader = XH; window.fetch = F; this.ligado = false; console.log('mapeamento desligado (as anotações continuam guardadas nesta aba)'); },
    limpar() { notas = []; acao = ''; guardar(); console.log('anotações apagadas'); },
  };
  console.log('mapeamento ligado (' + notas.length + ' anotações já guardadas). Antes de cada ação: gtMapa.marcar("nome"). No fim: gtMapa.resultado()');
})();
```

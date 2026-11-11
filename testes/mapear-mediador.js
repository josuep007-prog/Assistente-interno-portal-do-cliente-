/* Roteiro de mapeamento do Mediador (mapeamento/mapear-mediador.js) contra um Mediador simulado.
 * Confere: o roteiro não consulta nada sozinho; anota formulários (nomes, tipos e rótulos dos campos), o captcha, as tabelas
 * (títulos das colunas e o TIPO de cada célula), os links com {n} e as chamadas da página; nunca anota o que a pessoa
 * digitou nem o conteúdo das células; as anotações sobrevivem a recarregar a página e parar devolve a tela como era.
 * Precisa do Playwright:  node testes/mapear-mediador.js */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROTEIRO = fs.readFileSync(path.join(__dirname, '..', 'mapeamento', 'mapear-mediador.js'), 'utf8');
// o que nunca pode sair no resultado: o que foi digitado e o conteúdo das células
const SEGREDOS = ['11.222.333/0001-81', '11222333000181', 'SINDICATO FICTICIO DOS COMERCIARIOS', 'ES000123/2026', '46207.000123/2026-11', 'FEDERACAO FICTICIA'];

const FORM = `<!doctype html><title>Mediador - Consulta</title><body>
  <form id="f" action="/sistemas/mediador/ConsultarInstColetivo" method="post">
    <input type="hidden" name="__VIEWSTATE" value="${'x'.repeat(300)}">
    <label for="tp">Tipo de instrumento</label><select id="tp" name="tpInstrumento"><option>Todos</option><option>Convenção Coletiva</option><option>Acordo Coletivo</option><option>Termo Aditivo</option></select>
    <label for="cnpj">CNPJ da parte</label><input id="cnpj" name="nrCnpj" type="text">
    <label><input type="radio" name="vigencia" value="vigentes"> Somente vigentes</label>
    <img id="imgCaptcha" src="/sistemas/mediador/captcha.jpg?t=123" alt="imagem de verificação"><input name="txtCaptcha" id="txtCaptcha">
    <input type="submit" value="Pesquisar">
  </form></body>`;
const RES = `<!doctype html><title>Mediador - Resultado</title><body>
  <table id="r"><thead><tr><th>Registro</th><th>Processo</th><th>Partes</th><th>Vigência</th><th>Data de registro</th><th></th></tr></thead>
  <tbody>
    <tr><td>ES000123/2026</td><td>46207.000123/2026-11</td><td>SINDICATO FICTICIO DOS COMERCIARIOS X FEDERACAO FICTICIA</td><td>01/05/2026 a 30/04/2027</td><td>15/06/2026</td><td><a href="/sistemas/mediador/Resumo/ResumoVisualizar?NrSolicitacao=MR012345/2026">Visualizar</a> <a href="/sistemas/mediador/Arquivo/987654.pdf">PDF</a></td></tr>
    <tr><td>ES000099/2025</td><td>46207.000099/2025-01</td><td>SINDICATO FICTICIO DOS COMERCIARIOS X FEDERACAO FICTICIA</td><td>01/05/2025 a 30/04/2026</td><td>10/06/2025</td><td><a href="javascript:abrir(2)">Visualizar</a></td></tr>
  </tbody></table><span>Página 1 de 1 · Próxima</span></body>`;

// v2: a lista que a busca devolve (HTML por trás) e o texto de uma convenção
const item = (n) => `<div class="instrumento"><table><tr><td><b>Nº do Registro:</b></td><td>ES0001${n}3/2026</td></tr><tr><td>Nº da Solicitação:</td><td>MR0123${n}5/2026</td></tr><tr><td>Vigência:</td><td>01/05/2026 a 30/04/2027</td></tr><tr><td>Partes:</td><td>SINDICATO FICTICIO DOS COMERCIARIOS</td></tr></table><a href="javascript:void(0)" onclick="fDownload('MR0123${n}5_2026', '11222333000181')">Download</a> <a href="javascript:void(0)" onclick="funcBtnVisualizarSolicitacaoHandler('MR0123${n}5/2026', 'x')">Visualizar Instrumento Coletivo</a></div>`;
const LISTA = `<div id="grid">${item(1)}${item(2)}${item(3)}</div><ul class="paginacao"><li><a onclick="paginar(2)">2</a></li><li><a onclick="paginar(2)">Próxima</a></li></ul><span>66 registros</span>`;
const DOC = `<!doctype html><title>Resumo</title><body><h3>CONVENÇÃO COLETIVA DE TRABALHO 2026/2027</h3><p><b>CLÁUSULA PRIMEIRA - VIGÊNCIA E DATA-BASE</b></p><p>As partes fixam a vigência de 01/05/2026 a 30/04/2027 e a data-base em 01º de maio. SINDICATO FICTICIO DOS COMERCIARIOS.</p><p><b>CLÁUSULA TERCEIRA - PISO SALARIAL</b></p><p>Piso de R$ 1.850,00.</p><p><b>CLÁUSULA QUARTA - REAJUSTE SALARIAL</b></p><p>Reajuste de 5,5%.</p></body>`;

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const ctx = await browser.newContext();
  const chamadas = [];
  await ctx.route('https://www3.mte.gov.br/**', r => {
    const q = r.request(), u = new URL(q.url());
    chamadas.push(q.method() + ' ' + u.pathname);
    if (u.pathname.endsWith('/getConsultaAvancada')) return r.fulfill({ contentType: 'text/html; charset=utf-8', body: LISTA });
    if (u.pathname.endsWith('/ResumoVisualizar')) return r.fulfill({ contentType: 'text/html; charset=utf-8', body: DOC });
    if (u.pathname.includes('/api/instrumentos/')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ itens: [{ registro: 'ES000123/2026', partes: 'SINDICATO FICTICIO DOS COMERCIARIOS', vigenciaInicio: '01/05/2026', cnpj: '11.222.333/0001-81' }], total: 1 }) });
    if (q.method() === 'POST') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: RES });
    return r.fulfill({ contentType: 'text/html; charset=utf-8', body: FORM });
  });
  const page = await ctx.newPage();
  await page.goto('https://www3.mte.gov.br/sistemas/mediador/ConsultarInstColetivo');
  await page.evaluate(ROTEIRO);
  const antes = chamadas.length;
  assert.equal(await page.evaluate(() => window.medMapa.ligado), true);
  // a pessoa preenche (o roteiro nunca lê o que foi digitado)
  await page.fill('#cnpj', '11.222.333/0001-81');
  const cap = await page.evaluate(() => window.medMapa.tela('formulário de consulta'));
  assert.ok(cap.some(c => /imagem com letras/.test(c)), 'acha o captcha de imagem: ' + cap);
  assert.equal(chamadas.length, antes, 'o roteiro não faz chamada nenhuma sozinho');
  // a página faz uma chamada por trás (como um site novo faria)
  await page.evaluate(() => fetch('/sistemas/mediador/api/instrumentos/123?cnpj=11222333000181&pagina=1').then(r => r.json()));
  // envio do formulário: a página inteira troca; o roteiro roda de novo e as anotações continuam
  await Promise.all([page.waitForNavigation(), page.click('input[type=submit]')]);
  await page.evaluate(ROTEIRO);
  await page.evaluate(() => window.medMapa.tela('resultado'));
  const n = await page.evaluate(() => window.medMapa.resultado());
  const txt = await page.evaluate(() => { let t = ''; const c = console.log; console.log = (x) => { if (String(x).startsWith('{')) t = x; }; window.medMapa.resultado(); console.log = c; return t; });
  const r = JSON.parse(txt);
  assert.ok(n >= 4, 'anotações: ' + n);
  for (const s of SEGREDOS) assert.ok(!txt.includes(s), 'não pode sair no resultado: ' + s);
  const telas = r.anotacoes.filter(a => a.marca);
  const f = telas.find(t => t.marca === 'formulário de consulta');
  const campos = f.formularios[0].campos;
  assert.equal(f.formularios[0].metodo, 'POST');
  assert.ok(campos.some(c => c.nome === 'nrCnpj' && c.rotulo === 'CNPJ da parte'), 'campo do CNPJ com o rótulo');
  assert.ok(campos.some(c => c.nome === 'tpInstrumento' && c.opcoes.includes('Convenção Coletiva')), 'as opções da lista do site');
  assert.ok(campos.some(c => c.nome === '__VIEWSTATE' && /estado da página/.test(c.valor)), 'o estado oculto da página aparece só como tipo');
  assert.ok(f.tecnologia.includes('ASP.NET ViewState'));
  const t = telas.find(x => x.marca === 'resultado');
  assert.deepEqual(t.tabelas[0].colunas, ['Registro', 'Processo', 'Partes', 'Vigência', 'Data de registro', '']);
  assert.equal(t.tabelas[0].linhas, 2);
  assert.match(t.tabelas[0].primeiraLinha[0], /número de registro/);
  assert.match(t.tabelas[0].primeiraLinha[1], /número de processo/);
  assert.match(t.tabelas[0].primeiraLinha[3], /período/);
  assert.match(t.tabelas[0].primeiraLinha[4], /^data/);
  assert.ok(t.tabelas[0].paginacao, 'percebe a paginação');
  assert.ok(t.links.some(l => /Arquivo\/\{n\}\.pdf$/.test(l.endereco) && l.pdf), 'o link do PDF com {n}: ' + JSON.stringify(t.links));
  assert.ok(t.links.some(l => /ResumoVisualizar/.test(l.endereco) && l.parametros.includes('NrSolicitacao') && l.texto === 'Visualizar'));
  assert.ok(t.links.some(l => /^javascript \(abrir\)/.test(l.endereco)), 'link que abre por script');
  const api = r.anotacoes.find(a => a.via === 'fetch');
  assert.equal(api.caminho, '/sistemas/mediador/api/instrumentos/{n}');
  assert.deepEqual(api.parametros, ['cnpj', 'pagina']);
  assert.equal(api.resposta.itens[0].cnpj, 'CNPJ');
  assert.match(api.resposta.itens[0].registro, /número de registro/);
  const env = r.anotacoes.find(a => a.via === 'formulário (página inteira)');
  assert.ok(env && env.envio['campos de formulário'].includes('nrCnpj'), 'o envio do formulário com os nomes dos campos');
  // v2: a busca por trás devolve HTML: o esqueleto de um instrumento, as funções dos links e a paginação, sem valores
  await page.evaluate(() => window.medMapa.tela('busca v2'));
  await page.evaluate(() => new Promise(res => { const x = new XMLHttpRequest(); x.open('POST', '/sistemas/mediador/ConsultarInstColetivo/getConsultaAvancada'); x.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded'); x.onloadend = res; x.send('nrCnpj=11222333000181&pagina=1&excel=false&recaptchaToken=abc'); }));
  // e o texto da convenção aberto: a estrutura (cláusulas e títulos), sem o texto
  await page.goto('https://www3.mte.gov.br/sistemas/mediador/Resumo/ResumoVisualizar');
  await page.evaluate(ROTEIRO);
  const nCl = await page.evaluate(() => window.medMapa.estrutura('instrumento'));
  assert.equal(nCl, 3, 'conta as cláusulas');
  const txt2 = await page.evaluate(() => { let t = ''; const c = console.log; console.log = (x) => { if (String(x).startsWith('{')) t = x; }; window.medMapa.resultado(); console.log = c; return t; });
  for (const s of SEGREDOS.concat(['MR012315/2026', 'MR012315_2026', '1.850,00', '5,5%'])) assert.ok(!txt2.includes(s), 'v2 não pode sair: ' + s);
  const r2 = JSON.parse(txt2);
  assert.equal(r2.roteiro, 'mapear-mediador v2');
  const busca = r2.anotacoes.find(a => a.caminho && a.caminho.endsWith('/getConsultaAvancada') && a.resposta && a.resposta.html);
  assert.ok(busca, 'a busca por trás anotada');
  assert.deepEqual(busca.envio['campos de formulário'], ['excel', 'nrCnpj', 'pagina', 'recaptchaToken'], 'o formato do corpo: formulário, com os nomes');
  const h = busca.resposta.html;
  assert.equal(h.instrumentos, 3);
  assert.ok(h.funcoes.includes("fDownload('MR{n}_{n}', '{n}')"), 'a forma da chamada do Download: ' + JSON.stringify(h.funcoes));
  assert.ok(h.funcoes.some(f => /^paginar\(\{n\}\)$/.test(f)), 'a função da paginação');
  assert.ok(JSON.stringify(h.umInstrumento).includes('número de registro'), 'o esqueleto de um instrumento traz o tipo das células');
  assert.ok(h.paginacao.length >= 2);
  const est = r2.anotacoes.find(a => a.marca === 'instrumento' && a.clausulas != null);
  assert.ok(est.titulos.some(t => /CLÁUSULA \S+ - PISO SALARIAL/.test(t)), 'os títulos das cláusulas: ' + JSON.stringify(est.titulos));
  assert.ok(est.temDataBase && est.temPiso && est.temReajuste && est.temPercentual);
  // parar devolve o fetch original
  await page.evaluate(() => window.medMapa.parar());
  assert.equal(await page.evaluate(() => window.medMapa.ligado), false);
  await browser.close();
  console.log('mapear-mediador: formulários, captcha, tabelas, links e chamadas só pela forma; nada do que foi digitado nem das células');
})().catch(e => { console.error('FALHOU:', e.message); process.exit(1); });

/* Mediador do MTE (0.95.0): a busca pela própria página, a exportação e o texto, num Mediador SIMULADO (nada vai ao site real).
 * Confere: preenche CNPJ, tipo e vigência e clica em Pesquisar (o "site" faz o XHR, com o token do captcha dele), espera a resposta,
 * lê a exportação em iso-8859-1, o texto em windows-1252, recusa endereço fora da lista e falha visível quando a tela muda.
 *   NODE_PATH=$(npm root -g) node testes/mediador-pagina.js */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'extensao', 'mediador.js'), 'utf8');

const CONSULTA = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<input type="checkbox" id="chkNRCNPJ"><input type="text" id="txtNRCNPJ" disabled>
<select id="cboTPRequerimento"><option value="acordo">Acordo</option><option value="convencao">Convenção</option><option value="termoAditivoConvecao">Aditivo</option></select>
<select id="cboSTVigencia"><option value="1">Vigentes</option><option value="2">Todos</option><option value="0">Não vigentes</option></select>
<input type="button" value="Pesquisar" id="btnPesquisar"><input type="button" value="Limpar">
<div id="res"></div>
<script>
  document.getElementById('chkNRCNPJ').addEventListener('click', function () { document.getElementById('txtNRCNPJ').disabled = !this.checked; });
  window.__pedidos = [];
  document.getElementById('btnPesquisar').addEventListener('click', function () {
    setTimeout(function () {          // o reCAPTCHA invisível do site gera o token e só então a busca sai
      var x = new XMLHttpRequest(); x.open('POST', '/sistemas/mediador/ConsultarInstColetivo/getConsultaAvancada');
      x.setRequestHeader('content-type', 'application/x-www-form-urlencoded');
      x.onload = function () { document.getElementById('res').innerHTML = x.responseText; };
      var corpo = 'nrCnpj=' + document.getElementById('txtNRCNPJ').value + '&tpRequerimento=' + document.getElementById('cboTPRequerimento').value + '&tpVigencia=' + document.getElementById('cboSTVigencia').value + '&recaptchaToken=tok';
      window.__pedidos.push(corpo); x.send(corpo);
    }, 150);
  });
</script></body></html>`;
const EXPORT = (n) => `<html><body><table><tr><td>CNPJ</td><td>x</td></tr></table><table><tr><td>Nº do Registro</td><td>Nº do Processo</td><td>Nº da Solicitação</td><td>Tipo de Instrumento Coletivo</td><td>Vigência</td><td>CNPJ Trabalhador</td><td>Trabalhador</td><td>CNPJ Empregador</td><td>Empregador</td><td>Nº Trab. Entidade(s)</td><td>Nº Trab. Negociação</td></tr>`
  + Array.from({ length: n }, (_, i) => `<tr><td>XX00${i}111/2026</td><td>10000.00000${i}/2026-11</td><td>MR00${i}111/2026</td><td>Convenção Coletiva</td><td>01/05/2026 a 30/04/2027</td><td>11.222.333/0001-81</td><td>SINDICATO EXEMPLO DOS TRABALHADORES EM SERVIÇOS</td><td>11.444.777/0001-61</td><td>SINDICATO EXEMPLO PATRONAL</td><td>1</td><td>1</td></tr>`).join('') + '</table></body></html>';
const TEXTO = `<html><body><table class="titulo"><tr><td class="titulo">Convenção Coletiva De Trabalho</td></tr></table>
<label class="textogrupo">Salários, Reajustes e Pagamento</label><label class="textosubgrupo">Piso Salarial</label>
<label class="tituloClausula"><b>CLÁUSULA TERCEIRA - PISO SALARIAL</b></label><label class="descricaoClausula">Piso de R$ 1.000,00, reajustado em 5% (cinco por cento).</label></body></html>`;

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const ctx = await browser.newContext();
  let consultas = 0, exportacoes = 0, tela = CONSULTA;
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.hostname !== 'mediador.trabalho.gov.br') return r.abort();               // nada vai a outro lugar
    if (u.pathname === '/sistemas/mediador/ConsultarInstColetivo') return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: tela });
    if (u.pathname.endsWith('/getConsultaAvancada')) { consultas++; return r.fulfill({ status: 200, contentType: 'text/html', body: '<table><tr><td>ok</td></tr></table>' }); }
    if (u.pathname.endsWith('/exportarConsultaAvancada')) { exportacoes++; return r.fulfill({ status: 200, headers: { 'content-type': 'application/ms-excel; charset=iso-8859-1' }, body: Buffer.from(EXPORT(3), 'latin1') }); }
    if (u.pathname.endsWith('/resumoVisualizarSalvarMsWordDoc')) return r.fulfill({ status: 200, headers: { 'content-type': 'application/msword; charset=windows-1252' }, body: Buffer.from(TEXTO, 'latin1') });
    return r.fulfill({ status: 404, body: '' });
  });
  const page = await ctx.newPage();
  let falhas = 0;
  const passo = async (nome, fn) => { try { await fn(); console.log('ok   ' + nome); } catch (e) { falhas++; console.log('FALHA ' + nome + '\n     ' + String(e && e.message || e).split('\n').slice(0, 6).join('\n     ')); } };
  const abrir = async () => { await page.goto('https://mediador.trabalho.gov.br/sistemas/mediador/ConsultarInstColetivo'); await page.addScriptTag({ content: SRC }); };

  await passo('busca pela página: preenche, clica em Pesquisar, espera a busca do site e lê a exportação (acentos em iso-8859-1)', async () => {
    await abrir();
    const r = await page.evaluate(() => self.OCM.buscarNaPagina({ cnpj: '11.222.333/0001-81', tipo: 'convencao', pausaMs: 10 }));
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.itens.length, 3);
    assert.equal(r.itens[0].trabalhador, 'SINDICATO EXEMPLO DOS TRABALHADORES EM SERVIÇOS');
    assert.equal(r.itens[0].cnpj, '11222333000181'); assert.equal(r.itens[0].busca, 'convencao');
    const corpo = await page.evaluate(() => window.__pedidos[0]);
    assert.match(corpo, /nrCnpj=11222333000181&tpRequerimento=convencao&tpVigencia=2&recaptchaToken=tok/, 'a busca saiu do site, com o token dele');
    assert.equal(consultas, 1); assert.equal(exportacoes, 1);
    assert.equal(await page.evaluate(() => XMLHttpRequest.prototype.send.toString().includes('__ocm')), false, 'devolve o XHR da página como estava');
  });

  await passo('texto: cláusulas em windows-1252, com acento', async () => {
    const t = await page.evaluate(() => self.OCM.textoNaPagina('MR000333/2026'));
    assert.equal(t.ok, true);
    assert.equal(t.clausulas[0].titulo, 'CLÁUSULA TERCEIRA - PISO SALARIAL');
    assert.match(t.clausulas[0].texto, /5% \(cinco por cento\)/);
    assert.equal(t.solicitacao, 'MR000333/2026');
  });

  await passo('lista fechada também dentro da página: o que não é do Mediador nem é pedido', async () => {
    const r = await page.evaluate(() => self.OCM.textoNaPagina('MR1/2026&x=1'));
    assert.equal(r.ok, false);
    const a = await page.evaluate(() => self.OCM.anexoNaPagina('https://mediador.trabalho.gov.br/sistemas/mediador/ConsultarInstColetivo/GenerateSecurityToken'));
    assert.deepEqual(a, { ok: false, motivo: 'recusado' });
    const c = await page.evaluate(() => self.OCM.buscarNaPagina({ cnpj: '123' }));
    assert.equal(c.motivo, 'cnpj');
  });

  await passo('tela mudou: falha visível (formato), sem número errado', async () => {
    tela = '<!doctype html><html><body><input id="outro"><button>Pesquisar</button></body></html>';
    await abrir();
    const r = await page.evaluate(() => self.OCM.buscarNaPagina({ cnpj: '11222333000181', tipo: 'convencao' }));
    assert.equal(r.ok, false); assert.equal(r.motivo, 'formato'); assert.match(r.erro, /mudou/);
  });

  await browser.close();
  console.log(falhas ? falhas + ' falha(s)' : 'tudo ok');
  process.exit(falhas ? 1 : 0);
})();

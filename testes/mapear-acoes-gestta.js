/* Roteiro de mapeamento das ações do Gestta (mapeamento/mapear-acoes-gestta.js) contra um Gestta simulado.
 * Confere: o roteiro não faz chamada nenhuma sozinho; anota método, endereço com {id}, nomes e tipos dos campos, a situação
 * HTTP e os códigos em maiúsculas; nunca anota valores, nome de arquivo nem o token; as anotações sobrevivem a recarregar
 * a página (rodando o roteiro de novo) e parar devolve a tela como era.
 * Precisa do Playwright:  node testes/mapear-acoes-gestta.js */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROTEIRO = fs.readFileSync(path.join(__dirname, '..', 'mapeamento', 'mapear-acoes-gestta.js'), 'utf8');
const TOKEN = 'JWT eyJ-SEGREDO-GESTTA-789';
const SEGREDOS = [TOKEN, 'SEGREDO-GESTTA', 'Comentario sigiloso do analista', 'Aguardando extrato do banco SIGILO', 'folha-sigilosa.pdf', 'conteudo-sigiloso-do-pdf', 'EMPRESA SIGILO LTDA', '12.345.678/0001-90'];
const ID = '5f1e2d3c4b5a69788796a5b4', ID2 = '6a5b4c3d2e1f00112233aabb';
const CORS = { 'access-control-allow-origin': 'https://app.gestta.com.br', 'access-control-allow-headers': 'authorization,content-type,accept', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,OPTIONS' };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const ctx = await browser.newContext();
  const chamadas = [];
  await ctx.route('https://app.gestta.com.br/**', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Gestta</title><body>Tarefas</body>' }));
  await ctx.route('https://api.gestta.com.br/**', async r => {
    const req = r.request(), u = new URL(req.url());
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    chamadas.push(req.method() + ' ' + u.pathname);
    const json = (o, status) => r.fulfill({ status: status || 200, headers: Object.assign({ 'content-type': 'application/json' }, CORS), body: JSON.stringify(o) });
    if (req.method() === 'GET') return json({ _id: ID, status: 'OPEN', customer: { name: 'EMPRESA SIGILO LTDA', cnpj: '12.345.678/0001-90' } });
    if (u.pathname.endsWith('/comment')) return json({ _id: ID2, text: 'Comentario sigiloso do analista', created_at: '2026-11-11T10:00:00.000Z' }, 201);
    return json({ _id: ID, status: 'DONE', impediment: { reason: 'Aguardando extrato do banco SIGILO', active: false } });
  });
  const page = await ctx.newPage();
  await page.goto('https://app.gestta.com.br/#/tarefas');
  // a tela "do Gestta": o que ela faria quando a pessoa clica (o roteiro só escuta)
  const telaGestta = () => page.evaluate(async ([ID, ID2, TOKEN]) => {
    const xhr = (m, url, corpo, tipo) => new Promise(res => { const x = new XMLHttpRequest(); x.open(m, url); x.setRequestHeader('Authorization', TOKEN); if (tipo) x.setRequestHeader('Content-Type', tipo); x.onloadend = res; x.send(corpo); });
    await xhr('GET', 'https://api.gestta.com.br/core/customer/task/' + ID + '?expand=all');
    await xhr('GET', 'https://api.gestta.com.br/core/customer/task/' + ID + '?expand=all');
    window.gtMapa && window.gtMapa.marcar('concluir etapa');
    await xhr('PUT', 'https://api.gestta.com.br/core/customer/task/' + ID + '/step/' + ID2, JSON.stringify({ done: true, status: 'DONE', observacao: 'Comentario sigiloso do analista' }), 'application/json');
    window.gtMapa && window.gtMapa.marcar('impedimento');
    await xhr('PATCH', 'https://api.gestta.com.br/core/customer/task/' + ID + '/impediment', JSON.stringify({ reason: 'Aguardando extrato do banco SIGILO', type: 'CUSTOMER' }), 'application/json');
    window.gtMapa && window.gtMapa.marcar('enviar documento');
    const fd = new FormData(); fd.append('file', new File(['conteudo-sigiloso-do-pdf'], 'folha-sigilosa.pdf', { type: 'application/pdf' })); fd.append('name', 'folha-sigilosa.pdf'); fd.append('company_document', ID2);
    await fetch('https://api.gestta.com.br/core/customer/task/' + ID + '/document?origin=EXPRESS', { method: 'POST', headers: { Authorization: TOKEN }, body: fd });
  }, [ID, ID2, TOKEN]);

  let falhas = 0;
  const passo = async (nome, fn) => { try { await fn(); console.log('ok   ' + nome); } catch (e) { falhas++; console.log('FALHA ' + nome + '\n     ' + (e && e.message || e)); } };
  let res = null;
  const resultado = async () => { const t = await page.evaluate(() => { let s = ''; const c = console.log; console.log = (x) => { if (typeof x === 'string' && x.startsWith('{')) s = x; }; try { window.gtMapa.resultado(); } finally { console.log = c; } return s; }); return { texto: t, json: JSON.parse(t) }; };

  await passo('o roteiro sozinho não faz chamada nenhuma', async () => {
    await page.evaluate(ROTEIRO);
    await page.waitForTimeout(300);
    assert.deepEqual(chamadas, []);
    assert.equal(await page.evaluate(() => window.gtMapa.ligado), true);
  });
  await passo('anota a forma das ações da tela: método, endereço com {id}, campos, tipos, códigos e a situação HTTP', async () => {
    await telaGestta();
    res = await resultado();
    const ns = res.json.anotacoes.filter(n => !n.marca);
    assert.deepEqual(ns.map(n => n.metodo + ' ' + n.caminho), ['GET /core/customer/task/{id}', 'PUT /core/customer/task/{id}/step/{id}', 'PATCH /core/customer/task/{id}/impediment', 'POST /core/customer/task/{id}/document'], 'GET repetido entra uma vez só');
    const [g, put, patch, post] = ns;
    assert.deepEqual(g.parametros, ['expand']); assert.equal(g.envio, undefined, 'GET sem corpo nem resposta');
    assert.deepEqual(put.envio, { done: 'booleano', observacao: 'texto', status: 'código DONE' });
    assert.equal(put.status, 200); assert.equal(put.acao, 'concluir etapa');
    assert.deepEqual(put.cabecalhos, ['authorization', 'content-type'], 'só os nomes dos cabeçalhos');
    assert.equal(put.resposta.status, 'código DONE');
    assert.deepEqual(patch.envio, { reason: 'texto', type: 'código CUSTOMER' }); assert.equal(patch.acao, 'impedimento');
    assert.equal(post.via, 'fetch'); assert.deepEqual(post.parametros, ['origin']); assert.equal(post.acao, 'enviar documento');
    assert.deepEqual(post.envio, { formulário: { company_document: 'id', file: 'arquivo (application/pdf, 0 KB)', name: 'texto' } });
  });
  await passo('nenhum valor, nome de arquivo nem token no resultado', async () => {
    for (const s of SEGREDOS) assert.ok(!res.texto.includes(s), 'vazou: ' + s);
    const guardado = await page.evaluate(() => sessionStorage.getItem('gtMapa.v1'));
    for (const s of SEGREDOS) assert.ok(!guardado.includes(s), 'guardado na aba: ' + s);
  });
  await passo('a página recarrega: rodando de novo, as anotações continuam e as novas entram depois', async () => {
    await page.reload();
    await page.evaluate(ROTEIRO);
    await page.evaluate(() => window.gtMapa.marcar('comentar'));
    await page.evaluate(([ID, TOKEN]) => fetch('https://api.gestta.com.br/core/customer/task/' + ID + '/comment', { method: 'POST', headers: { Authorization: TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Comentario sigiloso do analista' }) }), [ID, TOKEN]);
    const r = await resultado();
    const ult = r.json.anotacoes.filter(n => !n.marca).pop();
    assert.equal(ult.metodo + ' ' + ult.caminho, 'POST /core/customer/task/{id}/comment');
    assert.equal(ult.status, 201); assert.equal(ult.acao, 'comentar');
    assert.equal(r.json.anotacoes.filter(n => !n.marca).length, 5);
    for (const s of SEGREDOS) assert.ok(!r.texto.includes(s), 'vazou: ' + s);
  });
  await passo('parar devolve a tela como era, e limpar apaga as anotações', async () => {
    const igual = await page.evaluate(() => { window.gtMapa.parar(); return !String(XMLHttpRequest.prototype.send).includes('__gtm') && !String(window.fetch).includes('corpoForma'); });
    assert.ok(igual);
    await page.evaluate(() => window.gtMapa.limpar());
    assert.equal(await page.evaluate(() => sessionStorage.getItem('gtMapa.v1')), '[]');
  });

  await passo('o passo a passo traz a mesma cópia do roteiro', async () => {
    const md = fs.readFileSync(path.join(__dirname, '..', 'mapeamento', 'prompt-mapear-acoes-gestta.md'), 'utf8');
    assert.ok(md.includes(ROTEIRO.trimEnd()), 'mapeamento/prompt-mapear-acoes-gestta.md está desatualizado');
  });

  await browser.close();
  console.log(falhas ? 'FALHARAM: ' + falhas : 'tudo ok');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

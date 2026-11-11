/* Ações no Gestta (0.93.0) contra um Gestta simulado: OCG.agirNaPagina dentro da página, como o service worker faz.
 * Confere: cada ação sai com o método, o endereço e o corpo exatos do mapeamento de 11/11/2026; o documento vai num
 * formulário com customer_task, company_document e file; o token vai só no cabeçalho; da resposta (que traz cliente,
 * escritório e usuário) volta só o resumo da tarefa; um pedido adulterado ou sem sessão não sai.
 * Precisa do Playwright:  node testes/acoes-gestta.js */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const NUCLEO = fs.readFileSync(path.join(__dirname, '..', 'extensao', 'gestta.js'), 'utf8');
const TOKEN = 'JWT eyJ-SEGREDO-GESTTA-789';
const T = '5f1e2d3c4b5a69788796a5b4', S = '6a5b4c3d2e1f00112233aabb', D = '7b6c5d4e3f2a10213243bbcc';
const SEGREDOS = [TOKEN, 'SEGREDO-GESTTA', 'EMPRESA SIGILO LTDA', '12.345.678/0001-90', 'fulana@exemplo.com', 'ESCRITORIO SIGILO', 'CIRCULAR_WRITE'];
const CORS = { 'access-control-allow-origin': 'https://app.gestta.com.br', 'access-control-allow-headers': 'authorization,content-type,accept', 'access-control-allow-methods': 'GET,POST,PUT,OPTIONS' };
// a resposta do Gestta traz a tarefa inteira, o cliente, o escritório e o usuário (como no mapeamento)
const tarefa = (status, feita) => ({ _id: T, status, done_step: feita ? 1 : 0, total_step: 1, conclusion_date: status === 'DONE' ? '2026-11-11T15:00:00.000Z' : null,
  customer: { _id: D, name: 'EMPRESA SIGILO LTDA', cnpj: '12.345.678/0001-90' }, owner: { _id: S, name: 'Fulana', email: 'fulana@exemplo.com' },
  company: { name: 'ESCRITORIO SIGILO', cnpj: '99.999.999/0001-99' }, customer_task_steps: [{ _id: S, name: 'Conferir', done: !!feita, created_at: '2026-11-11T10:00:00.000Z' }] });

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const ctx = await browser.newContext();
  const chamadas = [];
  await ctx.route('https://app.gestta.com.br/**', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Gestta</title><body>Tarefas</body>' }));
  await ctx.route('https://api.gestta.com.br/**', async r => {
    const req = r.request(), u = new URL(req.url());
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    const tipo = req.headers()['content-type'] || '';
    const bruto = req.postDataBuffer() ? req.postDataBuffer().toString('latin1') : '';
    chamadas.push({ metodo: req.method(), caminho: u.pathname, busca: u.search, auth: req.headers()['authorization'], tipo, corpo: /json/.test(tipo) ? JSON.parse(bruto || 'null') : bruto });
    const json = (o, status) => r.fulfill({ status: status || 200, headers: Object.assign({ 'content-type': 'application/json' }, CORS), body: JSON.stringify(o) });
    if (u.pathname.endsWith('/done')) { const c = JSON.parse(bruto); return json(tarefa('OPEN', c.done)); }
    if (u.pathname === '/es/task/' + T + '/status') { const c = JSON.parse(bruto); return c.status === 'DONE' && c.forcar403 ? json({ message: 'sem permissão' }, 403) : json(tarefa(c.status, true)); }
    if (u.pathname.endsWith('/history/comment')) return json({ _id: D, type: 'COMMENT', status: 'ADD', accomplished_by: { name: 'Fulana', email: 'fulana@exemplo.com', permissions: ['CIRCULAR_WRITE'] }, customer_task: tarefa('OPEN', true) }, 201);
    if (u.pathname === '/es/upload/direct') return json({ company_document: { _id: D, name: 'Recibo' }, customer_task: tarefa('DONE', true) });
    return json({ message: 'não mapeado' }, 404);
  });
  const page = await ctx.newPage();
  await page.goto('https://app.gestta.com.br/#/tarefas');
  await page.evaluate((t) => localStorage.setItem('ngStorage-jwt', JSON.stringify(t)), TOKEN);
  await page.addScriptTag({ content: NUCLEO });
  const agir = (o) => page.evaluate(async (o) => { const p = self.OCG.pedidoAcao(o); return p.erro ? { erroMontagem: p.erro } : self.OCG.agirNaPagina(p); }, o);

  let falhas = 0;
  const passo = async (nome, fn) => { try { await fn(); console.log('ok   ' + nome); } catch (e) { falhas++; console.log('FALHA ' + nome + '\n     ' + (e && e.message || e)); } };
  const ultima = () => chamadas[chamadas.length - 1];
  const semSegredos = (r) => { const s = JSON.stringify(r); for (const x of SEGREDOS) assert.ok(!s.includes(x), 'voltou para a extensão: ' + x); };

  await passo('marcar e desmarcar etapa: PUT …/step/{id}/done com { done }, e volta só o resumo da tarefa', async () => {
    let r = await agir({ acao: 'etapa', id: T, etapa: S, feita: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual([ultima().metodo, ultima().caminho, ultima().corpo], ['PUT', '/core/customer/task/' + T + '/step/' + S + '/done', { done: true }]);
    assert.equal(ultima().auth, TOKEN, 'o token vai no cabeçalho, como na tela do Gestta');
    assert.deepEqual(r.tarefa, { _id: T, status: 'OPEN', done_step: 1, total_step: 1, conclusion_date: null, customer_task_steps: [{ _id: S, done: true }] });
    semSegredos(r);
    r = await agir({ acao: 'etapa', id: T, etapa: S, feita: false });
    assert.deepEqual(ultima().corpo, { done: false }); assert.equal(r.tarefa.done_step, 0);
  });
  await passo('impedimento com o motivo, retirar, concluir e reabrir: PUT /es/task/{id}/status', async () => {
    let r = await agir({ acao: 'impedir', id: T, motivo: 'Aguardando extrato' });
    assert.deepEqual([ultima().metodo, ultima().caminho, ultima().corpo], ['PUT', '/es/task/' + T + '/status', { status: 'IMPEDIMENT', justification: 'Aguardando extrato' }]);
    assert.equal(r.tarefa.status, 'IMPEDIMENT');
    r = await agir({ acao: 'liberar', id: T }); assert.deepEqual(ultima().corpo, { status: 'OPEN' });
    r = await agir({ acao: 'concluir', id: T }); assert.deepEqual(ultima().corpo, { status: 'DONE' }); assert.equal(r.tarefa.status, 'DONE');
    r = await agir({ acao: 'reabrir', id: T }); assert.deepEqual(ultima().corpo, { status: 'OPEN' });
    semSegredos(r);
  });
  await passo('comentário interno: POST …/history/comment com external false, sem menções nem arquivos; a resposta (com usuário e permissões) não volta', async () => {
    const r = await agir({ acao: 'comentar', id: T, texto: 'Conferido com o extrato' });
    assert.deepEqual([ultima().metodo, ultima().caminho, ultima().corpo], ['POST', '/core/customer/task/' + T + '/history/comment', { message: 'Conferido com o extrato', external: false, mentions: [], cc_mentions: [], files: [] }]);
    assert.equal(r.ok, true); assert.equal(r.tarefa, null); semSegredos(r);
  });
  await passo('documento: POST /es/upload/direct em formulário com customer_task, company_document e file (nome e tipo do arquivo)', async () => {
    const b64 = Buffer.from('%PDF-1.4 conteudo de teste').toString('base64');
    const r = await agir({ acao: 'documento', id: T, documento: D, arquivo: { nome: 'recibo.pdf', tipo: 'application/pdf', base64: b64 } });
    assert.equal(r.ok, true, JSON.stringify(r));
    const c = ultima();
    assert.equal(c.metodo + ' ' + c.caminho, 'POST /es/upload/direct'); assert.match(c.tipo, /^multipart\/form-data/);
    assert.match(c.corpo, /name="customer_task"\r\n\r\n5f1e2d3c4b5a69788796a5b4/); assert.match(c.corpo, /name="company_document"\r\n\r\n7b6c5d4e3f2a10213243bbcc/);
    assert.match(c.corpo, /name="file"; filename="recibo.pdf"\r\nContent-Type: application\/pdf\r\n\r\n%PDF-1.4 conteudo de teste/);
    assert.equal(r.tarefa.status, 'DONE', 'o Gestta pode concluir a tarefa ao receber o documento'); semSegredos(r);
  });
  await passo('pedido adulterado não sai: outro endereço, DELETE, comentário externo, status fora da lista', async () => {
    const antes = chamadas.length;
    const ruins = [
      { metodo: 'DELETE', url: 'https://api.gestta.com.br/core/customer/task/' + T, corpo: {} },
      { metodo: 'PUT', url: 'https://api.gestta.com.br/es/task/' + T + '/status', corpo: { status: 'CANCELED' } },
      { metodo: 'POST', url: 'https://api.gestta.com.br/core/customer/task/' + T + '/history/comment', corpo: { message: 'x', external: true, mentions: [], cc_mentions: [], files: [] } },
      { metodo: 'POST', url: 'https://api.gestta.com.br/core/customer/task/' + T + '/step', corpo: { name: 'x', order: '1' } }
    ];
    for (const p of ruins) { const r = await page.evaluate((p) => self.OCG.agirNaPagina(p), p); assert.equal(r.ok, false); assert.ok(r.recusado, JSON.stringify(r)); }
    assert.equal(chamadas.length, antes, 'nenhuma chamada saiu');
  });
  await passo('sem sessão do Gestta, nada sai', async () => {
    const antes = chamadas.length;
    await page.evaluate(() => localStorage.removeItem('ngStorage-jwt'));
    const r = await agir({ acao: 'concluir', id: T });
    assert.equal(r.ok, false); assert.equal(r.semSessao, true); assert.equal(chamadas.length, antes);
  });
  await passo('nenhuma chamada levou querystring; só PUT e POST nos endereços mapeados', async () => {
    assert.ok(chamadas.every(c => !c.busca), 'querystring');
    const ok = [/^PUT \/core\/customer\/task\/[0-9a-f]{24}\/step\/[0-9a-f]{24}\/done$/, /^PUT \/es\/task\/[0-9a-f]{24}\/status$/, /^POST \/core\/customer\/task\/[0-9a-f]{24}\/history\/comment$/, /^POST \/es\/upload\/direct$/];
    for (const c of chamadas) assert.ok(ok.some(re => re.test(c.metodo + ' ' + c.caminho)), c.metodo + ' ' + c.caminho);
  });

  await browser.close();
  console.log(falhas ? 'FALHARAM: ' + falhas : 'tudo ok');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

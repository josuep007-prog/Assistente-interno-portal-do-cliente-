/* Inventário de dados do Gestta (mapeamento/inventario-gestta.js) contra um Gestta simulado.
 * Confere: só GET em api.gestta.com.br e um único POST (a busca de tarefas), o token vai só no cabeçalho e nunca no
 * resultado, Senhas e configurações da conta nunca são lidas, limite de leituras, formato sem valores.
 * Precisa do Playwright:  node testes/inventario-gestta.js */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const TOKEN = 'JWT eyJ-SEGREDO-GESTTA-789';
const SEGREDOS = ['ABCDEF0123456789ABCDEF0123456789', 'SIGILOSA', TOKEN, 'SEGREDO-GESTTA', 'Fulana de Tal', 'fulana@exemplo.com', '12.345.678/0001-90', 'EMPRESA SIGILO LTDA', 'senha-do-cliente', '(27) 99999-0000'];
const ID = '5f1e2d3c4b5a69788796a5b4', ID2 = '6a5b4c3d2e1f00112233aabb';
const CORS = { 'access-control-allow-origin': 'https://app.gestta.com.br', 'access-control-allow-headers': 'authorization,content-type,accept', 'access-control-allow-methods': 'GET,POST,OPTIONS' };

(async () => {
  const browser = await chromium.launch({ channel: 'chromium' });
  const ctx = await browser.newContext();
  const chamadas = [];
  const cabecalhos = [];
  await ctx.route('https://app.gestta.com.br/**', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Gestta</title><body>Tarefas</body>' }));
  await ctx.route('https://api.gestta.com.br/**', async r => {
    const req = r.request(), u = new URL(req.url());
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    chamadas.push(req.method() + ' ' + u.pathname);
    cabecalhos.push(req.headers()['authorization']);
    const json = (o, status) => r.fulfill({ status: status || 200, headers: Object.assign({ 'content-type': 'application/json' }, CORS), body: JSON.stringify(o) });
    const p = u.pathname;
    if (/password/.test(p)) return json([{ value: 'senha-do-cliente' }]);
    if (p === '/admin/customer') return json({ docs: [{ _id: ID, code: '9999', name: 'EMPRESA SIGILO LTDA', cnpj: '12.345.678/0001-90', active: true, external_id: 'ABCDEF0123456789ABCDEF0123456789', trading_name: 'SIGILOSA', complement: 'SALA9', federal_regime: { _id: ID2, name: 'Simples Nacional' } }], totalDocs: 512, totalPages: 512, limit: 1 });
    if (p === '/admin/customer/' + ID + '/responsible') return json([{ _id: ID2, company_department: { _id: ID2, name: 'Pessoal' }, company_user: { _id: ID2, name: 'Fulana de Tal', email: 'fulana@exemplo.com', phone_number: '(27) 99999-0000' } }]);
    if (p === '/admin/customer/user') return json({ docs: [{ _id: ID2, name: 'Fulana de Tal', email: 'fulana@exemplo.com', customers: ['EMPRESA SIGILO LTDA'] }], totalDocs: 2100 });
    if (p === '/core/customer/task/search') {
      const corpo = JSON.parse(req.postData() || '{}');
      if (corpo.status && corpo.status.includes('CANCELED')) return json({ message: 'status inválido' }, 400);
      return json({ docs: [{ _id: ID, name: 'FISCAL | APURAÇÃO', status: 'OPEN', type: 'RECURRENT', owner: { _id: ID2, name: 'Fulana de Tal', active: true } }, { _id: ID2, status: 'IMPEDIMENT', type: 'SERVICE_ORDER' }], total: 1288, pages: 258, page: 1, limit: 5 });
    }
    if (p === '/core/customer/task/' + ID) return json({ _id: ID, status: 'OPEN', due_date: '2026-11-20T03:00:00.000Z', legal_date: '2026-11-20T03:00:00.000Z', customer: { _id: ID, name: 'EMPRESA SIGILO LTDA', code: '9999' }, owner: { _id: ID2, name: 'Fulana de Tal' } });
    if (p === '/es/file/onvio') return json([{ _id: ID, status: 'ERROR', error: 'Pasta de destino não configurada', customer_task: { customer: { name: 'EMPRESA SIGILO LTDA', cnpj: '12.345.678/0001-90' } } }]);
    if (p === '/core/report') return json({ message: 'falha interna' }, 500);
    return json([{ _id: ID, name: 'Fulana de Tal' }]);
  });

  const page = await ctx.newPage();
  await page.goto('https://app.gestta.com.br/admin/');
  await page.evaluate(t => { localStorage.setItem('ngStorage-jwt', JSON.stringify(t)); localStorage.setItem('ngStorage-' + '5f1e2d3c4b5a69788796a5b4', '{}'); }, TOKEN);
  await page.addScriptTag({ path: path.join(__dirname, '..', 'mapeamento', 'inventario-gestta.js') });

  const resumo = await page.evaluate(() => window.__inventarioGestta.rodar());
  const inv = await page.evaluate(() => window.__inventarioGestta.estado());
  const texto = JSON.stringify(inv) + JSON.stringify(resumo);

  // só leitura: GET em tudo, e o único POST é a busca de tarefas
  assert.ok(chamadas.length >= 25, 'fez as leituras (' + chamadas.length + ')');
  const posts = chamadas.filter(c => !c.startsWith('GET '));
  assert.deepEqual(posts, ['POST /core/customer/task/search'], 'único POST: ' + posts);
  assert.ok(!chamadas.some(c => /password|smtp|billing|email-domain/.test(c)), 'nunca lê Senhas nem a conta');
  assert.equal(inv.leituras, chamadas.length, 'contagem bate');

  // o token vai só no cabeçalho, como veio (sem "Bearer"), e nunca no resultado
  assert.ok(cabecalhos.every(h => h === TOKEN), 'Authorization exatamente como o Gestta guarda');
  for (const s of SEGREDOS) assert.ok(!texto.includes(s), 'vazou: ' + s);
  assert.ok(!texto.includes('5f1e2d3c4b5a69788796a5b4'), 'nem os ids aparecem');
  assert.ok(inv.navegador.localStorage.includes('ngStorage-{id}') && inv.navegador.localStorage.includes('ngStorage-jwt'));

  // formato sem valores, contagens e opções
  assert.equal(inv.recursos.clientes.totalDocs, 512);
  assert.equal(inv.recursos.clientes.item.cnpj, 'texto');
  assert.equal(inv.recursos.clientes.item.external_id, 'texto:guid', 'id do Onvio vira só o tipo');
  assert.ok(!inv.recursos.clientes.opcoes || !inv.recursos.clientes.opcoes.external_id, 'id do Onvio nunca entra nas opções');
  assert.ok(chamadas.some(c => c === 'GET /admin/tag'), 'etiquetas lidas');
  assert.ok(chamadas.includes('GET /core/dashboard/attention/fine/all'), 'contagens do painel por GET');
  assert.equal(inv.recursos.clientes.item._id, 'texto:id');
  assert.equal(inv.recursos.cartela.item.company_user.email, 'texto');
  assert.equal(inv.recursos.buscaTarefas.total, 1288);
  assert.deepEqual(inv.recursos.buscaTarefas.opcoes.status, ['OPEN', 'IMPEDIMENT']);
  assert.equal(inv.recursos.buscaTarefas.corpo.status[0], 'texto:enum');
  assert.equal(inv.recursos.tarefa.objeto.due_date, 'texto:data-hora');
  assert.ok(inv.recursos.tarefa.caminho.includes('/core/customer/task/{id}'), 'caminho normalizado');
  assert.deepEqual(inv.recursos.filaOnvioComErro.opcoes.status, ['ERROR']);
  assert.equal(inv.recursos.relatorios.status, 500);
  assert.equal(inv.recursos.relatorios.erro.message, 'falha interna', 'guarda a mensagem curta do erro');
  assert.ok(resumo.erros.some(e => e.startsWith('relatorios')));

  // recusas sem pedir nada: outro site, Senhas, outro POST, POST com corpo na busca é o único aceito
  const antes = chamadas.length;
  const rec = await page.evaluate(async () => {
    const t = window.__inventarioGestta._teste;
    return [
      await t.ler('https://outro.com/admin/customer'),
      await t.ler('/admin/customer/5f1e2d3c4b5a69788796a5b4/passwords'),
      await t.ler('/admin/password/list'),
      await t.ler('/core/customer/task/report', { type: 'CUSTOMER_TASK' }),
      await t.ler('/core/dashboard/my-filter', { nome: 'x' }),
      await t.ler('/admin/company/document/integration/documents/batch')
    ];
  });
  assert.ok(rec.every(x => x.status === 0), 'tudo recusado');
  assert.equal(chamadas.length, antes, 'nenhum pedido saiu');

  // sem sessão: não pede nada e avisa
  const p2 = await ctx.newPage();
  await p2.goto('https://app.gestta.com.br/');
  await p2.evaluate(() => localStorage.removeItem('ngStorage-jwt'));
  await p2.addScriptTag({ path: path.join(__dirname, '..', 'mapeamento', 'inventario-gestta.js') });
  const semSessao = await p2.evaluate(() => window.__inventarioGestta._teste.ler('/core/company/user/me'));
  assert.equal(semSessao.status, 0);
  assert.match(semSessao.motivo, /sem sessão/);
  assert.equal(chamadas.length, antes);

  // limite de leituras
  const p3 = await ctx.newPage();
  await p3.goto('https://app.gestta.com.br/');
  await p3.evaluate(t => localStorage.setItem('ngStorage-jwt', JSON.stringify(t)), TOKEN);
  await p3.addScriptTag({ path: path.join(__dirname, '..', 'mapeamento', 'inventario-gestta.js') });
  const n = await p3.evaluate(async () => { const t = window.__inventarioGestta._teste; let ok = 0; for (let i = 0; i < 65; i++) { const x = await t.ler('/admin/company/holiday'); if (x.status) ok++; } return ok; });
  assert.equal(n, 60, 'para em 60 leituras');

  await browser.close();
  console.log('inventário do Gestta: tudo certo (' + antes + ' leituras na rodada, 1 POST de busca)');
})().catch(e => { console.error(e); process.exit(1); });

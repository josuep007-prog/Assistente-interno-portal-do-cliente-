/* Inventário de dados do Onvio (mapeamento/inventario-onvio.js) contra um Onvio simulado.
 * Confere: só GET em /api/ do mesmo site, limite de leituras, formato dos campos sem valores, nenhum token/nome/CPF no
 * resultado, e que o que só o detalhe traz aparece em soNoDetalhe.
 * Precisa do Playwright:  node testes/inventario-onvio.js */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SEGREDOS = ['TOKEN-SEGREDO-123', 'LONGTOKEN-SEGREDO-456', 'Fulana de Tal', '123.456.789-09', 'fulana@exemplo.com', 'Assunto Reservado', 'EMPRESA SIGILO LTDA', '98765432100'];
const GUID = '11111111-2222-3333-4444-555555555555';
const GUID2 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

(async () => {
  const browser = await chromium.launch({ channel: 'chromium' });
  const ctx = await browser.newContext();
  const metodos = [];
  const caminhos = [];
  await ctx.route('https://onvio.com.br/**', r => {
    const req = r.request(), u = new URL(req.url());
    if (u.pathname.startsWith('/api/')) { metodos.push(req.method()); caminhos.push(u.pathname); }
    const json = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify(o) });
    if (u.pathname.endsWith('/session-and-bindings')) return json({
      UdsSession: { SeamlessAuthenticationToken: 'TOKEN-SEGREDO-123', LongToken: 'LONGTOKEN-SEGREDO-456', EmailAddress: 'fulana@exemplo.com', FirstName: 'Fulana de Tal', UserId: GUID2 },
      UdsSessionBindings: {
        RoutingTable: { 'br-payroll-sr': 'https://payroll.onvio.com.br/x', 'service-requesting': 'https://sr.onvio.com.br/y' },
        FeatureResourcePermissions: { FeatureResourcePermissionsMap: { PortalDoCliente: { Solicitacoes: 'Allow' } } },
        ApplicationConfiguration: { CompanyId: GUID, Idioma: 'pt-BR' },
        InfrastructureAccessControls: ['Gestta', 'Portal']
      }
    });
    if (/\/topics$/.test(u.pathname)) return json({ items: [{ id: GUID, text: 'Assunto Reservado', createdByContactExpanded: { id: GUID2, name: 'Fulana de Tal' }, attachmentsExpanded: [{ id: GUID, name: 'Assunto Reservado.pdf', downloadUrl: 'https://x/TOKEN-SEGREDO-123' }] }], totalItems: 1 });
    if (u.pathname.includes('/statistics/company/')) return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INVALID_DATE', message: 'formato de data inválido', callId: GUID } }) });
    if (u.pathname.includes('/contacts/')) return json({ id: GUID2, userId: GUID, name: 'Fulana de Tal', email: 'fulana@exemplo.com', cpf: '123.456.789-09' });
    if (u.pathname.includes('/profiles/v1/users/')) { if (!u.pathname.endsWith('/' + GUID)) return r.fulfill({ status: 403, contentType: 'application/json', body: '{}' }); return json({ id: GUID2, displayName: 'Fulana de Tal', emailAddress: 'fulana@exemplo.com' }); }
    if (u.pathname.includes('/clients/') && u.pathname.endsWith('/employees')) return json({ items: [{ id: GUID, name: 'Fulana de Tal', cpf: '98765432100', wage: 3500.5 }], totalItems: 1 });
    // detalhe: tem o que a lista não tem
    if (/\/api\/[^?]+\/[0-9a-f-]{36}$/.test(u.pathname) && u.searchParams.get('expand') === 'all') return json({ id: GUID, identifier: 77, subject: 'Assunto Reservado', cpf: '123.456.789-09', salary: 4200, deletedTopic: false, catDate: '2026-10-01', clientExpanded: { id: GUID, name: 'EMPRESA SIGILO LTDA' }, attachmentsExpanded: [{ id: GUID, name: 'doc.pdf', staticFilePath: '/api/storage/x' }] });
    if (u.searchParams.get('itemsPerPage') === '1') return json({ items: [{ id: GUID, identifier: 77, genericStatus: 1, subject: 'Assunto Reservado', created: '2026-10-20T10:00:00', clientExpanded: { id: GUID, name: 'EMPRESA SIGILO LTDA' } }], totalItems: 12, totalPages: 12 });
    if (u.pathname.startsWith('/api/')) return json({ items: [{ id: 1, description: 'Fulana de Tal' }], totalItems: 1 });
    return r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>onvio</title><body><label>Nome do empregado</label><button>Salvar</button></body>' });
  });
  const page = await ctx.newPage();
  await page.goto('https://onvio.com.br/br-portal-do-cliente/solicitacoes');
  await page.evaluate(() => { try { localStorage.setItem('chave-teste', 'valor'); } catch (e) {} });
  await page.addScriptTag({ path: path.join(__dirname, '..', 'mapeamento', 'inventario-onvio.js') });

  const resumo = await page.evaluate(() => window.__inventarioOnvio.rodar());
  const inv = await page.evaluate(() => window.__inventarioOnvio.estado());
  const texto = JSON.stringify(inv);

  // só leitura, só /api/
  assert.ok(metodos.length > 20, 'fez as leituras (' + metodos.length + ')');
  assert.ok(metodos.every(m => m === 'GET'), 'só GET: ' + [...new Set(metodos)]);
  assert.ok(caminhos.every(c => c.startsWith('/api/')));
  assert.ok(inv.leituras <= 120 && metodos.length === inv.leituras, 'limite e contagem: ' + inv.leituras + ' x ' + metodos.length);
  assert.equal(resumo.recursos, 10);

  // nenhum valor sensível no resultado
  for (const s of SEGREDOS) assert.ok(!texto.includes(s), 'vazou: ' + s);
  assert.ok(!/downloadUrl":"https/.test(texto) && !texto.includes('/api/storage/x'), 'não guarda endereço de download');

  // formato sem valores
  const g = inv.recursos.geral;
  assert.equal(g.lista.totalItems, 12);
  assert.equal(g.lista.item.identifier, 'numero');
  assert.equal(g.lista.item.id, 'texto:guid');
  assert.equal(g.lista.item.created, 'texto:data-hora');
  assert.equal(g.detalhe.objeto.salary, 'numero');
  assert.equal(g.detalhe.objeto.cpf, 'texto');
  assert.ok(g.soNoDetalhe.includes('salary') && g.soNoDetalhe.includes('catDate') && g.soNoDetalhe.includes('deletedTopic'), 'só no detalhe: ' + g.soNoDetalhe);
  assert.ok(g.soNaLista.includes('genericStatus'), 'só na lista: ' + g.soNaLista);
  assert.ok(g.anexo.campos.staticFilePath === 'texto' || g.anexo.campos.name === 'texto');
  assert.equal(inv.extras.contato.objeto.cpf, 'texto');
  assert.equal(inv.extras.usuario.status, 200, 'usuário lido pelo userId do contato');
  assert.equal(inv.extras.empregadosDoCliente.item.wage, 'numero');

  // sessão: nomes e tipos, sem tokens; permissões e hosts ficam
  assert.equal(inv.sessao.UdsSession.SeamlessAuthenticationToken, 'texto');
  assert.equal(inv.sessao.RoutingTable.chaves, 2);
  assert.ok(inv.sessao.RoutingTable.porHost['payroll.onvio.com.br']);
  assert.equal(inv.sessao.FeatureResourcePermissionsMap.PortalDoCliente.Solicitacoes, 'Allow');
  assert.ok(!('_companyId' in inv) && !('_companyId' in inv.sessao));

  // navegador e tela
  assert.ok(inv.navegador.localStorage.some(x => x.chave === 'chave-teste') && !texto.includes('"valor"'));
  assert.ok(inv.tela.rotulos.includes('Nome do empregado') && inv.tela.botoes.includes('Salvar'));

  // segunda rodada: só GET, sem os endereços que mudam algo, sem vazar valores
  const antesExtras = metodos.length;
  await page.evaluate(() => window.__inventarioOnvio.rodarExtras());
  const inv2 = await page.evaluate(() => window.__inventarioOnvio.estado());
  assert.ok(metodos.length > antesExtras + 8, 'fez as leituras extras');
  assert.ok(metodos.every(m => m === 'GET'));
  assert.ok(!caminhos.some(c => /initial-data-load|handle-client-access/.test(c)), 'não toca nos endereços que podem mudar algo');
  assert.ok(caminhos.some(c => c.includes('/statistics/company/' + GUID + '/tasks')), 'usa o CompanyId da sessão');
  for (const sg of SEGREDOS) assert.ok(!JSON.stringify(inv2).includes(sg), 'vazou nas extras: ' + sg);

  const gestta = Object.entries(inv2.extras).find(([k]) => k.includes('statistics/company'));
  assert.equal(gestta[1].status, 500);
  assert.equal(gestta[1].erro.message, 'formato de data inválido', 'guarda a mensagem curta do erro');

  // fora de /api/ ou de outro site: recusa sem pedir nada
  const antes = metodos.length;
  const r = await page.evaluate(async () => [await window.__inventarioOnvio._teste.ler('/staff/x'), await window.__inventarioOnvio._teste.ler('https://outro.com/api/x')]);
  assert.ok(r.every(x => x.status === 0));
  assert.equal(metodos.length, antes);

  // limite de leituras
  const page2 = await ctx.newPage();
  await page2.goto('https://onvio.com.br/br-portal-do-cliente/solicitacoes');
  await page2.addScriptTag({ path: path.join(__dirname, '..', 'mapeamento', 'inventario-onvio.js') });
  const n = await page2.evaluate(async () => { const t = window.__inventarioOnvio._teste; let ok = 0; for (let i = 0; i < 130; i++) { const x = await t.ler('/api/x'); if (x.status) ok++; } return ok; });
  assert.equal(n, 120, 'para em 120 leituras');

  await browser.close();
  console.log('inventário do Onvio: tudo certo (' + metodos.length + ' leituras GET)');
})().catch(e => { console.error(e); process.exit(1); });

/* Carrega a extensão de verdade no Chromium e a exercita com uma API do Onvio simulada.
 * Precisa do Playwright (npm i -D playwright). Rodar:  node testes/extensao-real.js
 */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const EXT = path.join(__dirname, '..', 'extensao');
(async () => {
const sleepMs = ms => new Promise(r => setTimeout(r, ms));
const esperarReal = async (cond, ms = 8000) => { const fim = Date.now() + ms; while (Date.now() < fim) { if (await cond()) return; await sleepMs(150); } throw new Error('tempo esgotado: ' + cond); };
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'controlonvio-'));
const ctx = await chromium.launchPersistentContext(perfil, {
  headless: false, channel: 'chromium',
  args: ['--headless=new', '--disable-extensions-except=' + EXT, '--load-extension=' + EXT, '--no-sandbox']
});
let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
console.log('service worker:', sw.url());
const id = new URL(sw.url()).host;
const externas = [];
ctx.on('request', q => { if (!/^(chrome-extension|data|blob):/.test(q.url())) externas.push(q.url()); });

const hoje = new Date(); const iso = n => new Date(hoje.getTime() - n * 864e5).toISOString().replace(/\.\d+Z$/, '');
const itensPorRota = {
  'tickets/generic': [
    { id: 'g1', identifier: 900, genericStatus: 1, created: iso(4), lastUpdated: iso(4), subject: 'Férias do João em dezembro', clientExpanded: { name: 'ACME', nickname: 'ACME' }, staffResponsibleExpanded: null },
    { id: 'g3', identifier: 880, genericStatus: 5, created: iso(3), lastUpdated: iso(1), subject: 'Concluída', clientExpanded: { name: 'ACME', nickname: 'ACME' }, staffResponsibleExpanded: { name: 'Ana Teste' } },
    { id: 'g4', identifier: 881, genericStatus: 5, created: iso(12), lastUpdated: iso(2), subject: 'Concluída tarde', clientExpanded: { name: 'BETA' }, staffResponsibleExpanded: { name: 'Ana Teste' } },
    { id: 'g2', identifier: 901, genericStatus: 66, created: iso(2), lastUpdated: iso(2), subject: 'Estranha', clientExpanded: { name: 'BETA' }, staffResponsibleExpanded: { name: 'Ana Teste' } }
  ],
  'vacation-calculations': [
    { id: 'v1', identifier: 101, genericStatus: 2, created: iso(9), lastUpdated: iso(7), clientEmployeeExpanded: { name: 'Fulano' }, clientExpanded: { name: 'ACME', nickname: 'ACME' }, staffResponsibleExpanded: { name: 'Ana Teste' } }
  ],
  'prior-notice-vacations': [
    { id: '7d9f2c1a-4b3e-4c55-9a10-2f6e8b7c0d11', identifier: 702, genericStatus: 2, created: iso(6), lastUpdated: iso(5), clientEmployeeExpanded: { name: 'Beltrano' }, clientExpanded: { name: 'DELTA', nickname: 'DELTA' }, staffResponsibleExpanded: { name: 'Bia' } }
  ],
  'payroll-entries': [
    { id: 'r1', identifier: 55, genericStatus: 4, created: iso(25), genericLastUpdated: iso(25), effectiveDate: '2026-09-01', entryType: 'MONTHLY', clientExpanded: { name: 'GAMA' }, staffResponsibleExpanded: null },
    { id: 'r2', identifier: 56, genericStatus: 4, created: iso(12), genericLastUpdated: iso(10), effectiveDate: '2026-09-01', entryType: 'MONTHLY', clientExpanded: { name: 'GAMA' }, staffResponsibleExpanded: { name: 'Ana Teste' } }
  ]
};
const chamadas = [];
let modoCliente = false;      // simula o login de um cliente: o Onvio recusa o que só o escritório acessa
await ctx.route('https://onvio.com.br/**', async r => {
  const u = new URL(r.request().url());
  chamadas.push(u.pathname + (u.searchParams.get('filter') ? ' ' + u.searchParams.get('filter') : ''));
  if (u.pathname.endsWith('/security/v1/session-and-bindings')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ UdsSession: { FirstName: 'Ana', LastName: 'Teste', EmailAddress: 'a@b.c' } }) });
  // Trâmites como no Onvio real (15/10/2026): tickets (Geral e Férias/Rescisão/Afastamento), employees-registrations
  // (os 3 Cadastros) e payroll-entries; o caminho da própria lista + /topics dá 404 (ex.: prior-notice-vacations).
  const tramiteOk = /^\/api\/(service-requesting\/v1\/tickets|br-payroll-sr\/v1\/(tickets|employees-registrations|payroll-entries))\/[^/]+\/topics$/.test(u.pathname);
  if (tramiteOk && /7d9f2c1a-4b3e-4c55-9a10-2f6e8b7c0d11/.test(u.pathname)) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [{ created: iso(6), status: 1, description: 'Aviso de férias', createdByContactExpanded: { name: 'Cliente DELTA' } }, { created: iso(5), status: 2, description: 'Recebido', createdByExpanded: { name: 'Bia' } }] }) });
  // Rubricas #55: o analista ainda espera algo do cliente (continua pendente); a #56 fica com o texto genérico (resolvida)
  if (tramiteOk && /payroll-entries\/r1\/topics$/.test(u.pathname)) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [{ created: iso(25), status: 1, description: 'Rubricas' }, { created: iso(25), status: 4, description: 'Aguardamos a planilha de horas extras.' }] }) });
  if (u.pathname.endsWith('/topics') && !tramiteOk) return r.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  if (u.pathname.endsWith('/topics')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [{ created: iso(9), status: 1, description: '<p>Bom dia, segue o pedido de <b>cálculo de férias</b> do Fulano a partir de 03/11.</p>', createdByContactExpanded: { name: 'Cliente ACME' }, attachmentsExpanded: [{ name: 'aviso-ferias-fulano.pdf' }] }, { created: iso(7), status: 2, description: 'Recebido, estamos calculando.', createdByContactExpanded: { name: 'Ana Teste' } }] }) });
  if (modoCliente && u.pathname.endsWith('/company-department-access')) return r.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
  const k = Object.keys(itensPorRota).find(x => u.pathname.endsWith('/' + x));
  if (u.pathname.startsWith('/api/')) {
    const mine = u.searchParams.get('assignedtome') === 'true';
    let items = k ? itensPorRota[k] : [];
    if (mine) items = items.filter(i => i.staffResponsibleExpanded && i.staffResponsibleExpanded.name === 'Ana Teste');
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items, totalPages: 1, totalItems: items.length }) });
  }
  return r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>mock</title><body>onvio</body>' });
});

// aba do Onvio aberta (a leitura usa a sessão dela quando o fetch direto não alcança)
const aba = await ctx.newPage();
await aba.goto('https://onvio.com.br/br-portal-do-cliente/home');
// dispara a coleta pelo mesmo caminho do painel
const pagina = await ctx.newPage();
await pagina.goto('chrome-extension://' + id + '/options.html');
const r = await pagina.evaluate(() => new Promise(res => chrome.runtime.sendMessage({ cmd: 'atualizar' }, res)));
console.log('atualizar ->', r.ok, r.erro || '');
const snap = await pagina.evaluate(() => chrome.storage.local.get(['snapshot', 'tramites', 'status']));
assert.ok(snap.snapshot, 'snapshot gravado');
const s = snap.snapshot;
console.log('versão', s.versao, '| via', s.via, '| porTipo', JSON.stringify(s.porTipo), '| desconhecidos', JSON.stringify(s.desconhecidos), '| tramites', JSON.stringify(s.tramites), '| erros', JSON.stringify(s.erros));
assert.equal(s.versao, require(path.join(EXT, 'manifest.json')).version);
assert.ok(['pagina', 'extensao'].includes(s.via), 'leu pela aba do Onvio: ' + s.via);
assert.deepEqual(s.desconhecidos, { geral: { 66: 1 } });
assert.equal(s.items.find(i => i.num === 101).ptUteis != null, true, '1º trâmite estimado');
assert.equal(s.tramites.cache, undefined, 'cache fora do resumo');
assert.ok(Object.keys(snap.tramites).includes('calcFerias:v1'));
assert.ok(chamadas.some(c => /payroll-entries.*"IN"/.test(c)) && !chamadas.some(c => /"NE"/.test(c)), 'Rubricas usa IN (o NE dava HTTP 500 no Onvio real)');
assert.equal(s.items.find(i => i.num === 55).status, 'Respondido');
assert.equal(s.items.find(i => i.num === 55).pedidoAoCliente, 'aguardamos', 'o analista pediu algo: continua pendente');
assert.deepEqual(s.resolvidas.map(x => x.num), [56], 'vez do cliente sem retorno e sem pedido: resolvida');
assert.ok(!s.items.some(i => i.num === 56));
assert.doesNotMatch(JSON.stringify(snap.tramites), /Aguardamos|planilha|Recebido/, 'cache sem texto de trâmite');
assert.equal(s.items.find(i => i.num === 900).abaProvavel.label, 'Aviso de férias', 'Geral com assunto de férias sugere a aba certa');
// regras do escritório guardadas (como se o arquivo remoto tivesse sido baixado): prazo de cálculo de 1 d.u.
await pagina.evaluate(() => chrome.storage.local.set({ regrasEscritorio: { url: 'https://exemplo.com/r.json', versao: 't1', atualizadoEm: new Date().toISOString(), regras: { versao: 't1', config: { conclusaoCalculo: 1 }, feriados: [], abaErrada: [] } } }));
await pagina.evaluate(() => new Promise(res => chrome.runtime.sendMessage({ cmd: 'atualizar' }, res)));
const s2 = (await pagina.evaluate(() => chrome.storage.local.get('snapshot'))).snapshot;
const v1 = s2.items.find(i => i.num === 101);
assert.ok(v1.motivos.some(m => /limite 1\)/.test(m.m)), 'o prazo do arquivo de regras vale no semáforo: ' + JSON.stringify(v1.motivos));
// opções com diagnóstico
await pagina.goto('chrome-extension://' + id + '/options.html');
await pagina.waitForFunction(() => document.getElementById('diag').textContent.length > 20);
await pagina.evaluate(() => document.fonts.ready);
const fontes = await pagina.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/"/g, '')));
assert.ok(fontes.includes('IBM Plex Sans'), 'fontes locais: ' + fontes);
assert.match(await pagina.textContent('#regras-estado'), /versão t1/);
assert.equal(await pagina.inputValue('#conclusaoCalculo'), '1', 'a tela mostra o prazo vindo das regras do escritório');
assert.ok(!externas.some(u => /fonts\.(googleapis|gstatic)/.test(u)), 'nenhuma chamada ao Google Fonts');
console.log((await pagina.textContent('#diag')).split('\n').slice(0, 4).join('\n'));

// scripts de conteúdo em páginas do Onvio (grade e documentos)
const grade = await ctx.newPage();
await grade.route('https://onvio.com.br/br-portal-do-cliente/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><body><table><thead><tr><th>ID</th><th>Situação</th><th>Último Trâmite</th></tr></thead><tbody><tr><td>101</td><td>Em análise</td><td>07/10</td></tr></tbody></table></body>' }));
await grade.goto('https://onvio.com.br/br-portal-do-cliente/service-requesting/vacation/calculation');
await grade.waitForSelector('.controlonvio-marca', { timeout: 8000 });
console.log('marca na grade real:', await grade.textContent('.controlonvio-marca'));

// ---- tempo real: ação do usuário na página do Onvio atualiza o painel na hora ----
const idxP = await ctx.newPage();
await idxP.goto('https://onvio.com.br/br-portal-do-cliente/tempo-real');
await sleepMs(1500);
itensPorRota['tickets/generic'].push({ id: 'g777', identifier: 777, genericStatus: 1, created: iso(0), lastUpdated: iso(0), subject: 'Chegou agora', clientExpanded: { name: 'NOVA' }, staffResponsibleExpanded: { name: 'Ana Teste' } });
await idxP.evaluate(() => fetch('/api/service-requesting/v1/tickets/generic/g1/topics', { method: 'POST', body: '{}' }));   // o analista respondeu algo no Onvio
await esperarReal(async () => ((await pagina.evaluate(() => chrome.storage.local.get('snapshot'))).snapshot || { items: [] }).items.some(i => i.num === 777), 20000);
console.log('ação na página -> o painel já tem a solicitação nova (#777)');
await idxP.close();

// "Testar a leitura" das configurações mostra o que cada jeito recebeu
const teste = await pagina.evaluate(() => new Promise(res => chrome.runtime.sendMessage({ cmd: 'testarLeitura' }, res)));
assert.ok(teste.ok && /página do Onvio: HTTP 200 · application\/json/.test(teste.linhas.join('\n')), teste.linhas.join(' | '));

// ---- o app em tela cheia por cima do Onvio; ícone e atalho; telas para revisão visual ----
const CAPTURAS = process.env.CAPTURAS || '';
const foto = async (pg, nome) => { if (CAPTURAS) { fs.mkdirSync(CAPTURAS, { recursive: true }); await pg.screenshot({ path: path.join(CAPTURAS, nome) }); } };
const PORTAL_TESTE = 'https://onvio.com.br/br-portal-do-cliente/painel-teste';
const idDaAba = url => sw.evaluate(async u => (await chrome.tabs.query({ url: u }))[0].id, url);
const appDe = pg => pg.frames().find(f => f.url().startsWith('chrome-extension://' + id + '/app/app.html'));
const cheia = pg => pg.evaluate(() => document.documentElement.classList.contains('controlonvio-cheia'));
const esperar = async (cond, ms = 8000) => { const fim = Date.now() + ms; while (Date.now() < fim) { if (await cond()) return; await new Promise(r => setTimeout(r, 100)); } throw new Error('tempo esgotado: ' + cond); };

const portal = await ctx.newPage();
await portal.setViewportSize({ width: 1440, height: 900 });
await portal.goto(PORTAL_TESTE);
await esperar(() => appDe(portal));                                   // ao entrar no Onvio, o app já ocupa a tela
const app = appDe(portal);
await app.waitForSelector('.hj-hero .an-svg', { timeout: 8000 });
await new Promise(r => setTimeout(r, 1000));                         // números e anel animados
assert.equal(await cheia(portal), true);
const caixa = await (await app.frameElement()).boundingBox();
assert.deepEqual([caixa.width, caixa.height], [1440, 900], 'tela cheia');
await foto(portal, '1-inicio.png');
await portal.mouse.move(800, 600); await portal.mouse.wheel(0, 800);
await new Promise(r => setTimeout(r, 500));
await foto(portal, '1-inicio-2.png');
await app.evaluate(() => document.querySelector('#vista').scrollTo(0, 0));
await app.selectOption('#hj-carteira', '__equipe');
await new Promise(r => setTimeout(r, 600));
await foto(portal, '1-inicio-equipe.png');
assert.ok(await app.$('#hj-paineis, .hj-paineis'), 'painéis do Hoje');
await app.selectOption('#hj-carteira', '__minha');
await app.evaluate(() => document.querySelector('#vista').scrollTo(0, 0));
// Equipe: área do gestor com senha; o Desempenho lê as entregas do período na hora
await portal.bringToFront();                                          // a aba do Onvio na frente, como quem digita a senha
await app.evaluate(() => { location.hash = '#/equipe'; });
await app.waitForSelector('#g-trava');
await foto(portal, '2-equipe-senha.png');
// digitar e Enter já são testados em navegador.js; aqui o envio vai direto pelo formulário (a aba de teste fica em segundo plano)
await app.evaluate(() => { const c = document.querySelector('#g-senha'); c.value = 'gestor@987654321'; c.dispatchEvent(new Event('input')); document.querySelector('#g-trava').requestSubmit(); });
await esperar(() => app.evaluate(() => !!document.querySelector('.av-hero')), 15000);   // a aba pode estar em segundo plano (sem requestAnimationFrame)
assert.equal(await app.getAttribute('#av-k-entregas [data-conta]', 'data-conta'), '3', 'entregas dos 30 dias lidas na API (2 concluídas da Ana e a #56 resolvida há 10 dias)');
await new Promise(r => setTimeout(r, 1200));
await foto(portal, '2-equipe-desempenho.png');
await app.click('#av-rank .av-lin');
await esperar(() => app.evaluate(() => { const d = document.querySelector('#dlg-pessoa'); return !!d && !d.hidden; }));   // a pessoa abre por cima
await foto(portal, '2-equipe-detalhe.png');
await app.evaluate(() => document.querySelector('#pp-fechar').click());
for (const rota of ['fila', 'fila?escopo=equipe', 'equipe?aba=carga', 'equipe?aba=resp', 'lembretes', 'lembretes?aba=lista']) {
  await app.evaluate(r => { location.hash = '#/' + r; }, rota);
  await app.waitForFunction(() => document.querySelector('#vista').children.length > 0);
  await new Promise(r => setTimeout(r, 300));
  await foto(portal, '2-' + rota.replace(/[?=&]/g, '-') + '.png');
}
// busca em janela central e lembrete com repetição
await app.evaluate(() => { location.hash = '#/inicio'; });
await new Promise(r => setTimeout(r, 300));
await app.click('#btn-busca');                                       // o botão da busca (o atalho depende de onde está o foco)
await app.waitForSelector('#cmdk:not([hidden])');
await app.fill('#busca-q', 'acme');
await new Promise(r => setTimeout(r, 400));
await foto(portal, '2-busca.png');
await app.click('#cmdk', { position: { x: 20, y: 20 } });              // clique fora fecha a busca
await app.waitForSelector('#cmdk', { state: 'hidden' });
await app.click('#ag-novo');
await app.waitForSelector('#dlg-lembrete:not([hidden])');
await new Promise(r => setTimeout(r, 400));
await foto(portal, '2-novo-lembrete.png');
await app.click('#lc');                                                 // Cancelar
await app.waitForSelector('#dlg-lembrete', { state: 'hidden' });
// detalhe: lê dados e trâmites na hora (API simulada)
await app.evaluate(() => { location.hash = '#/fila?escopo=equipe'; });
await app.waitForSelector('#corpo [data-k]');
await app.click('#corpo [data-k="calcFerias:v1"]');
await app.waitForSelector('#gaveta .tr-item', { timeout: 8000 });
assert.equal(await app.$$eval('#gaveta .tr-item', e => e.length), 2);
await foto(portal, '4-detalhe.png');
await app.click('#g-fechar');
await app.waitForSelector('#gaveta', { state: 'hidden' });
// Aviso de férias: os trâmites vêm de br-payroll-sr/v1/tickets (o caminho da lista + /topics daria 404)
const det = m => pagina.evaluate(x => new Promise(res => chrome.runtime.sendMessage(x, res)), m);
const ferias = await det({ cmd: 'detalhe', type: 'avisoFerias', num: 702 });
assert.deepEqual([ferias.ok, ferias.erroTramites, ferias.tramites && ferias.tramites.length], [true, null, 2]);
await pagina.reload(); await pagina.waitForFunction(() => /Trâmites por lista/.test(document.querySelector('#diag').textContent));
assert.match(await pagina.textContent('#diag'), /Aviso de férias \(br-payroll-sr\/v1\/tickets\)/);
console.log('trâmites de Aviso de férias: caminho fixo (tickets)');
// sino
await app.click('#btn-sino');
await foto(portal, '5-sino.png');
await app.click('#btn-sino');
// tema escuro
await app.click('#btn-tema');
await app.evaluate(() => { location.hash = '#/equipe'; });
await new Promise(r => setTimeout(r, 400));
await foto(portal, '6-equipe-escuro.png');
await app.evaluate(() => { location.hash = '#/inicio'; });
await new Promise(r => setTimeout(r, 1200));
await foto(portal, '6-inicio-escuro.png');
await portal.mouse.move(800, 500); await portal.mouse.wheel(0, 1500);
await new Promise(r => setTimeout(r, 500));
await foto(portal, '6-inicio-escuro-2.png');
await app.click('#btn-tema');

// "Ver Onvio" esconde; o ícone alterna; o detalhe "Abrir no Onvio" chega com a camada escondida
const idPortal = await idDaAba(PORTAL_TESTE);
await app.click('#btn-ver-onvio');
await esperar(async () => !(await cheia(portal)));
await foto(portal, '7-ver-onvio.png');
await sw.evaluate(i => aoClicarNoIcone({ id: i, url: 'https://onvio.com.br/br-portal-do-cliente/painel-teste' }), idPortal);
await esperar(() => cheia(portal));
await sw.evaluate(i => aoClicarNoIcone({ id: i, url: 'https://onvio.com.br/br-portal-do-cliente/painel-teste' }), idPortal);
await esperar(async () => !(await cheia(portal)));
await sw.evaluate(i => aoClicarNoIcone({ id: i, url: 'https://onvio.com.br/br-portal-do-cliente/painel-teste' }), idPortal);
await esperar(() => cheia(portal));
// Configurações > Avançado: a página de opções abre dentro do app (precisa estar liberada no manifesto)
await app.evaluate(() => { location.hash = '#/config?aba=avancado'; });
await app.waitForSelector('.cfg-frame');
await esperar(async () => { const f = (await app.$('.cfg-frame').then(e => e.contentFrame())); return !!(f && await f.$('#regrasUrl').catch(() => null)); });
console.log('Configurações > Avançado abre a página de opções');
await app.evaluate(() => { location.hash = '#/fila?escopo=equipe'; });
await app.waitForSelector('#corpo [data-k="calcFerias:v1"]');
await app.click('#corpo [data-k="calcFerias:v1"]');
await app.waitForSelector('#gaveta .tr-item', { timeout: 8000 });         // espera os dados chegarem (a gaveta se redesenha)
// clique por script: neste navegador de teste a janela real é menor que a área emulada e os ~120 px de baixo
// não chegam ao iframe por mouse (também acontecia com a versão anterior)
await app.$eval('#g-onvio', b => b.click());
await esperar(() => /vacation\/calculation$/.test(portal.url()));
await portal.waitForLoadState('load');
await new Promise(r => setTimeout(r, 800));
assert.equal(await cheia(portal), false, 'chegou na tela nativa do Onvio, com o app escondido');

// fora do Onvio: leva ao Onvio que já está aberto e abre o app lá
const fora = await ctx.newPage();
await fora.route('https://exemplo.com/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><body>outro site</body>' }));
await fora.goto('https://exemplo.com/');
const idFora = await idDaAba('https://exemplo.com/*');
await sw.evaluate(i => aoClicarNoIcone({ id: i, url: 'https://exemplo.com/' }), idFora);
await esperar(async () => (await Promise.all(ctx.pages().map(async pg => (/onvio\.com\.br/.test(pg.url()) && (await cheia(pg)))))).some(Boolean));
assert.equal(appDe(fora), undefined, 'em outro site nunca aparece o app');

// sem nenhuma aba do Onvio: o ícone cria uma aba do Onvio e o app abre quando ela carregar
for (const pg of ctx.pages()) if (/onvio\.com\.br/.test(pg.url())) await pg.close();
const antes = ctx.pages().length;
await sw.evaluate(i => aoClicarNoIcone({ id: i, url: 'https://exemplo.com/' }), idFora);
await esperar(() => ctx.pages().length > antes);
const nova = ctx.pages().find(pg => /onvio\.com\.br\/br-portal-do-cliente/.test(pg.url()));
assert.ok(nova, 'abriu uma aba do Onvio');
await esperar(() => appDe(nova));

// login de cliente: a extensão para, apaga o que leu e o app mostra só o aviso
modoCliente = true;
const rc = await pagina.evaluate(() => new Promise(res => chrome.runtime.sendMessage({ cmd: 'atualizar' }, res)));
assert.equal(rc.cliente, true, 'atualizar responde "acesso de cliente"');
const depois = await pagina.evaluate(() => chrome.storage.local.get(['status', 'snapshot', 'eventos']));
assert.deepEqual([depois.status.estado, depois.snapshot, depois.eventos], ['visao_cliente', undefined, undefined]);
await appDe(nova).waitForSelector('#bloqueio', { timeout: 8000 });
await foto(nova, '8-acesso-de-cliente.png');
modoCliente = false;
const ro = await pagina.evaluate(() => new Promise(res => chrome.runtime.sendMessage({ cmd: 'atualizar' }, res)));
assert.equal(ro.ok, true, 'de volta ao login do escritório, lê de novo');
await appDe(nova).waitForFunction(() => !document.querySelector('#bloqueio'));
console.log('acesso de cliente -> bloqueado; escritório -> volta a ler');

// atalho Alt+Shift+O tem o mesmo efeito do ícone
const man = require(path.join(EXT, 'manifest.json'));
assert.equal(man.commands['alternar-painel'].suggested_key.default, 'Alt+Shift+O');
assert.ok(!man.permissions.includes('sidePanel') && !man.side_panel, 'sem painel lateral do Chrome: o painel só existe no Onvio');
assert.deepEqual(man.web_accessible_resources[0].matches, ['https://onvio.com.br/*']);

console.log('\ntudo certo com a extensão carregada de verdade');
await ctx.close();
fs.rmSync(perfil, { recursive: true, force: true });
process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

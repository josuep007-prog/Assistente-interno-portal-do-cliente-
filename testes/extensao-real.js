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
  // folha (0.68.0): o Extrato Mensal FICTÍCIO (testes/fixtures) baixado pela rota mapeada do portal de documentos
  if (/^\/api\/storage\/v1\/Folders\/[^/]+\/documents\/[^/]+$/.test(u.pathname)) return r.fulfill({ contentType: 'application/pdf', body: fs.readFileSync(path.join(__dirname, 'fixtures', 'extrato-mensal-ficticio.pdf')) });
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
await new Promise(r => setTimeout(r, 1500));
assert.equal(appDe(portal), undefined, 'ao entrar no Onvio a camada nunca abre sozinha (só o botão)');
await sw.evaluate(async i => aoClicarNoIcone(await chrome.tabs.get(i)), await idDaAba(PORTAL_TESTE));      // o clique no ícone abre
await esperar(() => appDe(portal));
const app = appDe(portal);
await app.waitForSelector('.hj-meudia .hj-md-k', { timeout: 8000 });
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
// o cartão fica na borda de baixo da tela: o clique do mouse às vezes não chega, o do elemento sempre
await app.$eval('#corpo [data-k="calcFerias:v1"]', e => e.click());
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
// Configurações (0.90.0): dentro do Onvio, #/config abre a guia própria das Configurações; a tela de trabalho fica onde estava
const ehGuiaConfig = pg => pg.url().startsWith('chrome-extension://' + id + '/app/app.html?janela=config');
const hashAntes = await app.evaluate(() => location.hash);
await app.evaluate(() => { location.hash = '#/config?aba=avancado'; });
await esperar(() => ctx.pages().some(ehGuiaConfig));
const cfg = ctx.pages().find(ehGuiaConfig);
assert.match(cfg.url(), /#\/config\?aba=avancado$/, 'abre já na aba pedida');
await esperar(async () => (await app.evaluate(() => location.hash)) === hashAntes);
await cfg.waitForSelector('.adv-tab[data-parte="hub"]');
assert.equal(await cfg.evaluate(() => document.documentElement.classList.contains('so-config') && getComputedStyle(document.querySelector('.trilho')).display === 'none'), true, 'guia só com as Configurações, sem o trilho');
await cfg.click('.adv-tab[data-parte="regras"]');
await cfg.waitForSelector('#adv-regrasUrl');
await esperar(async () => /Em uso: versão/.test(await cfg.textContent('#adv-regras-pils')));
// o ícone do trilho reaproveita a guia aberta (não abre outra) e leva à aba pedida
const nAbas = ctx.pages().filter(ehGuiaConfig).length;
await app.$eval('.trilho [data-rota="config"]', a => a.click());
await esperar(async () => /#\/config$/.test(cfg.url()));
assert.equal(ctx.pages().filter(ehGuiaConfig).length, nAbas, 'reaproveita a guia');
await cfg.waitForSelector('#abas .aba[data-aba="aparencia"].on');
await cfg.close(); await portal.bringToFront();   // a pessoa volta à guia do Onvio
console.log('Configurações: guia própria pelo ícone do Onvio (reaproveitada), Avançado com as regras em uso');
await app.evaluate(() => { location.hash = '#/fila?escopo=equipe'; });
await app.waitForSelector('#corpo [data-k="calcFerias:v1"]');
await app.$eval('#corpo [data-k="calcFerias:v1"]', b => b.click());   // por script: depois de trocar de guia o clique de mouse não chega ao quadro neste navegador de teste
await app.waitForSelector('#gaveta .tr-item', { timeout: 8000 });         // espera os dados chegarem (a gaveta se redesenha)
// clique por script: neste navegador de teste a janela real é menor que a área emulada e os ~120 px de baixo
// não chegam ao iframe por mouse (também acontecia com a versão anterior)
await app.$eval('#g-onvio', b => b.click());
await esperar(() => /vacation\/calculation$/.test(portal.url()));
await portal.waitForLoadState('load');
await new Promise(r => setTimeout(r, 800));
assert.equal(await cheia(portal), false, 'chegou na tela nativa do Onvio, com o app escondido');

// fora do Portal do Cliente o ícone leva ao portal (Solicitações) e o app abre lá; em outro site ou em outra tela do Onvio (/staff/) o painel nunca aparece
const fora = await ctx.newPage();
await fora.route('https://exemplo.com/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><body>outro site</body>' }));
await fora.goto('https://exemplo.com/');
const idFora = await idDaAba('https://exemplo.com/*');
await sw.evaluate(i => aoClicarNoIcone({ id: i, url: 'https://exemplo.com/' }), idFora);
await esperar(async () => (await Promise.all(ctx.pages().map(async pg => (/onvio\.com\.br\/br-portal-do-cliente/.test(pg.url()) && (await cheia(pg)))))).some(Boolean));
assert.equal(appDe(fora), undefined, 'em outro site nunca aparece o app');
// outra tela do Onvio (/staff/): sem painel, nem sozinho nem pelo ícone (o ícone leva ao portal)
const staff = await ctx.newPage();
await staff.route('https://onvio.com.br/staff/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><body>Onvio · home</body>' }));
await staff.goto('https://onvio.com.br/staff/#/home');
await new Promise(r => setTimeout(r, 2500));
assert.equal(await staff.evaluate(() => !!document.getElementById('controlonvio-host') || document.documentElement.classList.contains('controlonvio-cheia')), false, 'sem painel nas outras telas do Onvio');
assert.equal(appDe(staff), undefined);
const idStaff = await idDaAba('https://onvio.com.br/staff/*');
const abasAntes = ctx.pages().length;
await sw.evaluate(i => aoClicarNoIcone({ id: i, url: 'https://onvio.com.br/staff/#/home' }), idStaff);
await new Promise(r => setTimeout(r, 1200));
assert.equal(appDe(staff), undefined, 'a tela /staff/ continua sem painel');
assert.equal(ctx.pages().length, abasAntes, 'e reaproveita a aba do portal que já está aberta');
await staff.close();
console.log('ícone fora do portal -> leva ao portal e abre o app lá; /staff/ nunca tem painel');

// sem nenhuma aba do portal: o ícone cria uma nas Solicitações e o app abre lá (resposta ao clique)
for (const pg of ctx.pages()) if (/onvio\.com\.br/.test(pg.url())) await pg.close();
await pagina.evaluate(() => chrome.storage.local.remove(['snapshot', 'status', 'assinaturas', 'ultimaVerificacao']));      // como na 1ª vez: ainda não há leitura
const antes = ctx.pages().length;
await sw.evaluate(i => aoClicarNoIcone({ id: i, url: 'https://exemplo.com/' }), idFora);
await esperar(() => ctx.pages().length > antes);
const nova = ctx.pages().find(pg => /onvio\.com\.br\/br-portal-do-cliente\/service-requesting\/general/.test(pg.url()));
assert.ok(nova, 'abriu o portal nas Solicitações');
await esperar(() => appDe(nova), 20000);                                  // abre logo que a página carrega: é a resposta ao clique
assert.equal(await cheia(nova), true);
console.log('primeira vez: o clique no ícone abre o portal nas Solicitações com o app');

// folha (0.68.0): o PDF vem pela aba do Onvio, o texto sai do pdf.js no documento fora da tela e o núcleo acha os contribuintes
{
  const txt = await sw.evaluate(() => textoDoPdf('https://onvio.com.br/api/storage/v1/Folders/F1/documents/D1'));
  const x = await sw.evaluate(t => OC.extratoContribuintes(t), txt);
  assert.equal(x.competencia, '2026-09', 'competência lida do PDF');
  assert.deepEqual(x.pessoas.map(p => [p.codigo, p.vinculo, p.contribuinte]), [['12', 'Celetista', false], ['15', 'Pró-labore', true], ['21', 'Autônomo (RPA)', true]], 'pessoas e vínculos do PDF: ' + txt.slice(0, 300));
  assert.equal(x.pessoas[1].nome, 'SICRANA SOCIA FICTICIA');
  await assert.rejects(sw.evaluate(() => textoDoPdf('https://onvio.com.br/api/storage/v2/search/documents')), /não permitido/, 'só a rota de download mapeada');
  await sw.evaluate(() => fecharOffscreen());
  console.log('folha: PDF lido pela aba + pdf.js fora da tela -> competência e contribuintes');
}

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
assert.ok(!man.permissions.includes('sidePanel') && !man.side_panel, 'sem painel lateral do Chrome: o painel só existe no Portal do Cliente');
assert.deepEqual(man.web_accessible_resources[0].matches, ['https://onvio.com.br/*']);

// ---------- Gestta (0.71.0): leitura de dentro da aba, só GET e a busca, o token nunca sai da página ----------
{
  const TOKEN = 'JWT eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ exp: 1893456000 })).toString('base64url') + '.SEGREDO-ASSINATURA';
  const ID = '5f1e2d3c4b5a69788796a5b4', ID2 = '6a5b4c3d2e1f00112233aabb';
  const CORS = { 'access-control-allow-origin': 'https://app.gestta.com.br', 'access-control-allow-headers': 'authorization,content-type,accept', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
  const gChamadas = [], gCab = [], gBuscas = [], gRel = [];
  let papel = 'ROLE_ADMIN', adminProibido = false, gCompOk = true;
  await ctx.route('https://app.gestta.com.br/**', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Gestta</title><body>Tarefas</body>' }));
  await ctx.route('https://api.gestta.com.br/**', async r => {
    const q = r.request(), u = new URL(q.url());
    if (q.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    gChamadas.push(q.method() + ' ' + u.pathname); gCab.push(q.headers()['authorization']);
    const json = (o, status) => r.fulfill({ status: status || 200, headers: Object.assign({ 'content-type': 'application/json' }, CORS), body: JSON.stringify(o) });
    const p = u.pathname;
    if (p === '/core/company/user/me') return json({ _id: ID2, name: 'Pessoa Ficticia', role: papel, active: true, email: 'pessoa@exemplo.com', permissions: ['X'], last_login: '2026-11-05T10:00:00Z', company_departments: [{ _id: ID, name: 'Pessoal' }] });
    if (adminProibido && p.startsWith('/admin/')) return json({ message: 'forbidden' }, 403);
    if (p === '/admin/company/department') return json([{ _id: ID, name: 'Pessoal' }, { _id: ID2, name: 'Fiscal' }]);
    if (p === '/admin/company/user') return json({ docs: [{ _id: ID2, name: 'Pessoa Ficticia', phone_number: '(27) 90000-0000' }], totalDocs: 123 });
    if (p === '/admin/customer') return json({ docs: [{ _id: ID, code: '9999', name: 'EMPRESA FICTICIA LTDA', cnpj: '12.345.678/0001-90', monthly_payment: 999 }], totalDocs: 1385 });
    if (p === '/admin/customer/' + ID + '/responsible') return json([{ company_department: { _id: ID, name: 'Pessoal' }, company_user: { _id: ID2, name: 'Pessoa Ficticia', phone_number: '(27) 90000-0000' } }]);
    if (p === '/core/customer/task/search') {
      const c = JSON.parse(q.postData() || '{}'); gBuscas.push(c);
      if (c.limit === 1) return json({ docs: [{ _id: ID, name: 'TAREFA', status: 'OPEN' }], total: 6833, pages: 6833, page: 1, limit: 1 });
      // 0.85.0: com gCompOk o Gestta filtra pela competência; sem, recusa date_type COMPETENCE_DATE (400) e a meta de M é da competência M-1
      if (c.date_type === 'COMPETENCE_DATE' && !gCompOk) return json({ message: 'invalid date_type' }, 400);
      const ini = new Date(c.start_date), porComp = c.date_type === 'COMPETENCE_DATE';
      const comp = porComp ? ini : new Date(Date.UTC(ini.getUTCFullYear(), ini.getUTCMonth() - 1, 1, 3)), meta = new Date(porComp ? Date.UTC(ini.getUTCFullYear(), ini.getUTCMonth() + 1, 10, 3) : ini.getTime() + 9 * 864e5);
      return json({ docs: [{ _id: c.page === 1 ? ID : ID2, name: 'TAREFA ' + c.page, status: 'OPEN', due_date: meta.toISOString(), competence_date: comp.toISOString(), customer: { _id: ID, name: 'EMPRESA FICTICIA LTDA', code: '9999' }, value: 999, owner: { phone_number: '9' } }], total: 2, pages: 2, page: c.page, limit: 1000 });
    }
    if (p === '/core/customer/task/report') {
      const c = JSON.parse(q.postData() || '{}'); gRel.push(c);
      const linha = (id, st, setor) => JSON.stringify({ id, name: 'TAREFA ' + id.slice(-2), status: st, 'company_department.name': setor, 'owner.name': 'Pessoa Ficticia', _due_date: new Date().toISOString(), 'customer.code': '9999', 'customer.name': 'EMPRESA FICTICIA LTDA', 'customer.cnpj': '12.345.678/0001-90', 'customer.monthly_payment': 999, value: 50, 'company_task.score': 3 });
      return r.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'application/x-ndjson' }, CORS), body: [linha(ID, 'DONE', 'Fiscal'), linha(ID2, 'OPEN', 'Pessoal')].join('\n') + '\n' });
    }
    if (p === '/core/customer/task/' + ID) return json({ _id: ID, name: 'DCTF WEB', status: 'OPEN', value: 99, timesheet: [{ h: 1 }], approvers: [{ _id: 'a' }],
      customer_task_steps: [{ name: 'Conferir', order: 1, required: true, done: true, done_by: { email: 'x@exemplo.com' } }],
      company_documents: [{ name: 'Recibo', disconsidered: false, validation_required: true, file: { url: 'https://arquivo.exemplo/segredo.pdf' } }],
      document_request: { active: true, requested_documents: [{ name: 'Extrato', disconsidered: false, file: 'x' }] } });
    if (p === '/core/customer/task/' + ID + '/history') return json({ docs: [
      { _id: 'h1', type: 'DOCUMENT', status: 'NOT_SENT_TO_PORTAL', reason: 'NO_FOLDER_CONFIGURED', accomplished_at: new Date().toISOString(), company_document: { name: 'Recibo' }, upload: { url: 'https://arquivo.exemplo/up.pdf' } },
      { _id: 'h2', type: 'EMAIL', status: 'SENT', accomplished_at: new Date().toISOString(), email_log: { to: ['destino@exemplo.com'], server: 'smtp.exemplo' } }], totalDocs: 2, totalPages: 1, page: 1 });
    if (p === '/core/dashboard/attention/fine/all') return json({ fine: 7 });
    if (p === '/es/file/onvio') return json({ docs: [], totalDocs: 4 });
    if (p === '/admin/company/document') return json({ docs: [{ _id: ID, name: 'DAS' }], totalDocs: 1008, documents_without_destination: 31 });
    return json({ message: 'não simulado' }, 404);
  });
  const gAba = await ctx.newPage();
  await gAba.goto('https://app.gestta.com.br/admin/#/sidebar/customer/list');
  await gAba.evaluate(t => localStorage.setItem('ngStorage-jwt', JSON.stringify(t)), TOKEN);
  const tg = () => pagina.evaluate(() => new Promise(res => chrome.runtime.sendMessage({ cmd: 'testarGestta' }, res)));
  const g1 = await tg();
  assert.ok(g1 && g1.ok, 'testarGestta respondeu');
  const txt = g1.linhas.join('\n');
  console.log('Testar a leitura do Gestta ->\n  ' + g1.linhas.join('\n  '));
  assert.match(txt, /Aba do Gestta: Cadastros \(admin\)/);
  assert.match(txt, /Sessão válida até/);
  assert.match(txt, /Perfil: Administrador · acesso a todos os setores · 1 setor: Pessoal/);
  assert.match(txt, /clientes ativos: 1\.385/); assert.match(txt, /equipe ativa: 123/); assert.match(txt, /setores: 2/);
  assert.match(txt, /tarefas abertas ou com impedimento no mês: 6\.833/); assert.match(txt, /multas no mês \(painel\): 7/);
  assert.match(txt, /fila de envio ao Onvio com erro: 4/); assert.match(txt, /sem pasta no portal: 31/); assert.match(txt, /cartela de 1 cliente: 1 setor/);
  for (const s of ['SEGREDO', 'eyJ', 'EMPRESA FICTICIA', '12.345.678', '9999', '(27)', 'pessoa@exemplo', 'Pessoa Ficticia']) assert.ok(!JSON.stringify(g1).includes(s), 'vazou no resultado: ' + s);
  // só leitura: GET em tudo e o único POST é a busca; o token vai só no cabeçalho, exatamente como o Gestta guarda
  const naoGet = gChamadas.filter(c => !c.startsWith('GET '));
  assert.deepEqual(naoGet, ['POST /core/customer/task/search']);
  assert.ok(gCab.every(h => h === TOKEN), 'Authorization exatamente como o Gestta guarda (sem Bearer)');
  // o token não chega ao armazenamento da extensão
  const tudo = await pagina.evaluate(() => chrome.storage.local.get(null));
  assert.ok(!JSON.stringify(tudo).includes('SEGREDO') && !JSON.stringify(tudo).includes('eyJ'), 'token fora do armazenamento');
  // Tarefas do Gestta (0.72.0): as da própria pessoa, de 1000 em 1000, todas as páginas, abertas, com impedimento e concluídas
  const tt = m => pagina.evaluate(x => new Promise(res => chrome.runtime.sendMessage(x, res)), m);
  gBuscas.length = 0;
  const t1 = await tt({ cmd: 'gesttaTarefas' });
  assert.ok(t1.ok, 'gesttaTarefas: ' + (t1.erro || ''));
  assert.equal(t1.itens.length, 2, 'as duas páginas'); assert.equal(t1.quem, 'eu'); assert.equal(t1.perfil.total, true);
  // 0.85.0: a competência (de fábrica a do mês anterior) pela busca COMPETENCE_DATE, e o Meu dia pelas metas do mês corrente
  const hj = new Date(), cpA = hj.getMonth() === 0 ? [hj.getFullYear() - 1, 12] : [hj.getFullYear(), hj.getMonth()];
  assert.deepEqual([t1.ano, t1.mes], cpA, 'competência anterior de fábrica'); assert.equal(t1.modoCompetencia, 'direto');
  assert.deepEqual(gBuscas.map(c => c.date_type + ':' + c.page), ['COMPETENCE_DATE:1', 'COMPETENCE_DATE:2', 'DUE_DATE:1', 'DUE_DATE:2']);
  assert.equal(t1.dia.length, 2, 'as metas do mês para o Meu dia');
  // o Gestta recusa a busca pela competência: lê as metas da competência e dos 3 meses seguintes e separa pela competence_date
  gCompOk = false; gBuscas.length = 0;
  const tc = await tt({ cmd: 'gesttaTarefas', ano: 2026, mes: 9 });
  assert.ok(tc.ok, 'competência pelas metas: ' + (tc.erro || '')); assert.equal(tc.modoCompetencia, 'meta');
  assert.deepEqual(tc.itens.map(t => t.competence_date.slice(0, 7)), ['2026-09', '2026-09'], 'só a competência pedida');
  assert.deepEqual(gBuscas.filter(c => c.date_type === 'DUE_DATE').slice(0, 8).map(c => c.start_date.slice(0, 7)), ['2026-09', '2026-09', '2026-10', '2026-10', '2026-11', '2026-11', '2026-12', '2026-12']);
  gBuscas.length = 0;
  await tt({ cmd: 'gesttaTarefas', ano: 2026, mes: 9 });
  assert.ok(!gBuscas.some(c => c.date_type === 'COMPETENCE_DATE'), 'lembra que a busca pela competência não serve');
  gCompOk = true;
  assert.ok(gBuscas.every(c => c.limit === 1000 && JSON.stringify(c.company_user) === JSON.stringify([ID2]) && c.status.includes('DONE') && !c.status.includes('IGNORED')), 'só as da pessoa logada, um mês');
  assert.equal(t1.itens[0].value, undefined, 'valor da tarefa não sai da página'); assert.equal(t1.itens[0].owner, undefined);
  gBuscas.length = 0;
  const t2 = await tt({ cmd: 'gesttaTarefas', quem: 'sem' });
  assert.equal(t2.quem, 'sem'); assert.ok(gBuscas.every(c => c.no_owner === true && !c.company_user), 'sem responsável');
  const eq = await tt({ cmd: 'gesttaEquipe' });
  assert.ok(eq.ok && eq.pessoas.length === 1 && eq.pessoas[0].nome === 'Pessoa Ficticia' && !JSON.stringify(eq).includes('(27)'), 'equipe só com id e nome');
  for (const s of ['SEGREDO', 'eyJ']) assert.ok(!JSON.stringify([t1, t2, eq]).includes(s), 'token fora: ' + s);
  // o shell entra no Gestta pelo manifesto (o botão fica num Shadow DOM fechado)
  assert.equal(await gAba.evaluate(() => !!document.getElementById('controlgestta-host')), true, 'botão do Control no Gestta');
  // 0.90.0: a engrenagem das Tarefas do Gestta abre a mesma guia das Configurações
  const gtTela = await ctx.newPage();
  await gtTela.goto('chrome-extension://' + id + '/app/gestta.html');
  await gtTela.click('#btn-config');
  const ehCfg = pg => pg.url().startsWith('chrome-extension://' + id + '/app/app.html?janela=config');
  await esperarReal(async () => ctx.pages().some(ehCfg));
  const cfgG = ctx.pages().find(ehCfg);
  await cfgG.waitForSelector('#abas .aba[data-aba="aparencia"]');
  await gtTela.click('#btn-config'); await sleepMs(800);
  assert.equal(ctx.pages().filter(ehCfg).length, 1, 'a engrenagem do Gestta reaproveita a guia');
  await cfgG.close(); await gtTela.close();
  // Fechamento do mês (0.73.0): um POST do relatório CUSTOMER_TASK, guardado só na memória do Chrome, no máximo 1 vez por hora
  const antesFech = gChamadas.length;
  const f1 = await tt({ cmd: 'gesttaFechamento', ano: 2026, mes: 11 });
  assert.ok(f1.ok, 'gesttaFechamento: ' + (f1.erro || ''));
  assert.equal(f1.formato, 'ndjson'); assert.equal(f1.linhas.length, 2); assert.equal(f1.parcial, false); assert.equal(f1.naMemoria, true);
  // 0.85.0: o Fechamento é da competência: as tarefas da competência pela busca, e o relatório só dos meses em que elas vencem
  assert.deepEqual([...new Set(gChamadas.slice(antesFech).filter(c => c.startsWith('POST ')))], ['POST /core/customer/task/search', 'POST /core/customer/task/report']);
  assert.equal(gRel.length, 1, 'as tarefas da competência 11 vencem em dezembro: um relatório'); assert.equal(gRel[0].type, 'CUSTOMER_TASK');
  assert.match(gRel[0].dates.startDate, /^2026-12-01/); assert.deepEqual(f1.mesesMeta, ['2026-12']); assert.equal(f1.competencia, true);
  for (const c of ['value', 'customer.monthly_payment', 'company_task.score']) assert.ok(!f1.colunas.includes(c), 'coluna fora do fechamento: ' + c);
  assert.ok(f1.colunas.includes('company_department.name') && f1.colunas.includes('owner.name'), 'setor e responsável no fechamento');
  const nRel = gRel.length;
  const f2 = await tt({ cmd: 'gesttaFechamento', ano: 2026, mes: 11, forcar: true });
  assert.ok(f2.ok && f2.daMemoria && f2.podeEm > 0, 'em menos de 1 hora vem da memória');
  assert.equal(gRel.length, nRel, 'atualizar antes de 1 hora não chama o Gestta de novo');
  const sess = await pagina.evaluate(() => chrome.storage.session.get(null));
  assert.ok(sess['gtFechC-2026-11'] && sess['gtFechC-2026-11'].linhas.length === 2, 'relatório na memória do Chrome');
  const loc = JSON.stringify(await pagina.evaluate(() => chrome.storage.local.get(null)));
  assert.ok(!loc.includes('gtFech') && !loc.includes('EMPRESA FICTICIA'), 'nada do relatório no armazenamento do disco');
  for (const s of ['SEGREDO', 'eyJ']) assert.ok(!JSON.stringify(sess).includes(s) && !JSON.stringify(f1).includes(s), 'token fora da memória: ' + s);
  // detalhe da tarefa: um GET, sem valor, apontamento, aprovadores nem arquivo
  const antesDet = gChamadas.length;
  const d1 = await tt({ cmd: 'gesttaTarefa', id: ID });
  assert.ok(d1.ok, 'gesttaTarefa: ' + (d1.erro || ''));
  assert.deepEqual(gChamadas.slice(antesDet), ['GET /core/customer/task/' + ID]);
  assert.equal(d1.tarefa.customer_task_steps[0].name, 'Conferir'); assert.equal(d1.tarefa.company_documents[0].validation_required, true);
  assert.equal(d1.tarefa.document_request.requested_documents[0].name, 'Extrato');
  for (const s of ['segredo.pdf', 'x@exemplo', '"value"', 'timesheet', 'approvers', '"file"']) assert.ok(!JSON.stringify(d1).includes(s), 'detalhe vazou: ' + s);
  // linha do tempo da tarefa (0.77.0): um GET do histórico, sem email_log nem arquivo
  const antesH = gChamadas.length;
  const h1 = await tt({ cmd: 'gesttaHistorico', id: ID });
  assert.ok(h1.ok, 'gesttaHistorico: ' + (h1.erro || ''));
  assert.deepEqual(gChamadas.slice(antesH), ['GET /core/customer/task/' + ID + '/history']);
  assert.deepEqual(h1.eventos.map(e => e.rot).sort(), ['Documento não foi ao portal', 'E-mail enviado ao cliente']);
  for (const s of ['destino@exemplo', 'smtp.exemplo', 'up.pdf']) assert.ok(!JSON.stringify(h1).includes(s), 'histórico vazou: ' + s);
  const antesHi = gChamadas.length;
  assert.equal((await tt({ cmd: 'gesttaHistorico', id: 'x' })).ok, false); assert.equal(gChamadas.length, antesHi, 'id inválido não pede nada');
  const antesInv = gChamadas.length;
  const d2 = await tt({ cmd: 'gesttaTarefa', id: '../admin/company' });
  assert.equal(d2.ok, false); assert.equal(gChamadas.length, antesInv, 'id inválido não pede nada');
  // analista: avisa que o envio ao Hub não sai; admin proibido vira "seu acesso não inclui"
  papel = 'ROLE_USER'; adminProibido = true;
  await pagina.evaluate(() => chrome.storage.session.remove('gtFechC-2026-11'));
  const f3 = await tt({ cmd: 'gesttaFechamento', ano: 2026, mes: 11 });
  assert.ok(f3.ok && f3.parcial === true, 'analista: fechamento marcado como parcial');
  const g2 = (await tg()).linhas.join('\n');
  assert.match(g2, /Perfil: Analista · acesso ao\(s\) setor\(es\) dele/);
  assert.match(g2, /o envio ao Hub não sai/);
  assert.match(g2, /clientes ativos: seu acesso não inclui esta leitura \(403\)/);
  gBuscas.length = 0;
  const t3 = await tt({ cmd: 'gesttaTarefas', quem: '6a5b4c3d2e1f00112233aabc' });
  assert.equal(t3.quem, 'eu', 'o analista não vê as tarefas de outra pessoa'); assert.ok(gBuscas.every(c => JSON.stringify(c.company_user) === JSON.stringify([ID2])));
  // sem sessão: não pede nada e diz o que fazer
  const antes = gChamadas.length;
  await gAba.evaluate(() => localStorage.removeItem('ngStorage-jwt'));
  const g3 = (await tg()).linhas.join('\n');
  assert.match(g3, /Sem sessão do Gestta: faça login/);
  assert.equal(gChamadas.length, antes, 'sem sessão, nenhum pedido sai');
  // sem aba do Gestta
  await gAba.close();
  assert.match((await tg()).linhas.join('\n'), /Nenhuma aba do Gestta aberta/);
  assert.ok(man.host_permissions.includes('https://app.gestta.com.br/*'), 'permissão do Gestta no manifesto');
  // 0.91.0: o botão flutuante em qualquer site leva ao Onvio, ao Gestta ou aos dois, sem abrir a camada sozinha
  for (const pg of ctx.pages()) if (/onvio\.com\.br|app\.gestta\.com\.br/.test(pg.url())) await pg.close();
  await pagina.evaluate(() => chrome.storage.local.remove(['abrirPainelAoCarregar', 'botaoGeralOff', 'botaoGeralOcultos']));
  const bg = await ctx.newPage();
  await bg.route('https://exemplo.org/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><body>outro site</body>' }));
  await bg.setViewportSize({ width: 1000, height: 700 });
  await bg.goto('https://exemplo.org/');
  const temBotao = () => bg.evaluate(() => !!document.getElementById('controlonvio-botao-geral'));
  await esperarReal(temBotao, 10000);
  const abrirMenu = async () => { await bg.bringToFront(); await bg.mouse.click(1000 - 18 - 22, 700 - 84 - 22); await sleepMs(250); };
  const onvioAbas = () => ctx.pages().filter(pg => /onvio\.com\.br\/br-portal-do-cliente/.test(pg.url()));
  const gesttaAbas = () => ctx.pages().filter(pg => /app\.gestta\.com\.br/.test(pg.url()));
  // Onvio: abre uma guia no portal e a camada continua fechada (nunca abre sozinha)
  await abrirMenu(); await bg.keyboard.press('Enter');
  await esperarReal(() => onvioAbas().length > 0, 10000);
  assert.equal(gesttaAbas().length, 0, 'só o Onvio');
  await sleepMs(2500);
  assert.equal(await cheia(onvioAbas()[0]), false, 'a camada do Onvio não abre sozinha');
  // Gestta: a segunda opção abre o Gestta
  await abrirMenu(); await bg.keyboard.press('ArrowDown'); await bg.keyboard.press('Enter');
  await esperarReal(() => gesttaAbas().length > 0, 10000);
  // reaproveita as guias: de novo "Os dois" não cria outras
  const antesDe = ctx.pages().length;
  await abrirMenu(); await bg.keyboard.press('ArrowDown'); await bg.keyboard.press('ArrowDown'); await bg.keyboard.press('Enter');
  await sleepMs(1500);
  assert.equal(ctx.pages().length, antesDe, '"Os dois" reaproveita as guias que já existem');
  // "Os dois" do zero abre cada um na sua guia
  for (const pg of [...onvioAbas(), ...gesttaAbas()]) await pg.close();
  await abrirMenu(); await bg.keyboard.press('ArrowDown'); await bg.keyboard.press('ArrowDown'); await bg.keyboard.press('Enter');
  await esperarReal(() => onvioAbas().length > 0 && gesttaAbas().length > 0, 10000);
  // esconder neste site (último link do menu para cima) e mostrar de novo pela configuração
  await abrirMenu(); await bg.keyboard.press('ArrowUp'); await bg.keyboard.press('ArrowUp'); await bg.keyboard.press('Enter');
  await esperarReal(async () => !(await temBotao()), 8000);
  assert.deepEqual((await pagina.evaluate(() => chrome.storage.local.get('botaoGeralOcultos'))).botaoGeralOcultos, ['exemplo.org']);
  await pagina.evaluate(() => chrome.storage.local.remove('botaoGeralOcultos'));
  await esperarReal(temBotao, 8000);
  // desligado em todos os sites
  await pagina.evaluate(() => chrome.storage.local.set({ botaoGeralOff: true }));
  await esperarReal(async () => !(await temBotao()), 8000);
  await pagina.evaluate(() => chrome.storage.local.remove('botaoGeralOff'));
  await esperarReal(temBotao, 8000);
  // no Portal do Cliente e no Gestta o botão geral não aparece (cada um tem o seu)
  const portalQ = onvioAbas()[0], gesttaQ = gesttaAbas()[0];
  assert.equal(await portalQ.evaluate(() => !!document.getElementById('controlonvio-botao-geral')), false, 'sem o botão geral no Portal do Cliente');
  assert.equal(await gesttaQ.evaluate(() => !!document.getElementById('controlonvio-botao-geral')), false, 'sem o botão geral no Gestta');
  await bg.close();
  console.log('Botão em qualquer site: Onvio, Gestta ou os dois, sem abrir a camada; esconder e mostrar de novo');
  console.log('Gestta: leitura pela aba, só GET e a busca, token só na página');
}

console.log('\ntudo certo com a extensão carregada de verdade');
await ctx.close();
fs.rmSync(perfil, { recursive: true, force: true });
process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

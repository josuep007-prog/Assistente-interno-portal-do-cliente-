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
    { id: 'g2', identifier: 901, genericStatus: 66, created: iso(2), lastUpdated: iso(2), subject: 'Estranha', clientExpanded: { name: 'BETA' }, staffResponsibleExpanded: { name: 'Ana Teste' } }
  ],
  'vacation-calculations': [
    { id: 'v1', identifier: 101, genericStatus: 2, created: iso(9), lastUpdated: iso(7), clientEmployeeExpanded: { name: 'Fulano' }, clientExpanded: { name: 'ACME', nickname: 'ACME' }, staffResponsibleExpanded: { name: 'Ana Teste' } }
  ],
  'payroll-entries': [
    { id: 'r1', identifier: 55, genericStatus: 4, created: iso(25), genericLastUpdated: iso(25), effectiveDate: '2026-09-01', entryType: 'MONTHLY', clientExpanded: { name: 'GAMA' }, staffResponsibleExpanded: null }
  ]
};
const chamadas = [];
await ctx.route('https://onvio.com.br/**', async r => {
  const u = new URL(r.request().url());
  chamadas.push(u.pathname + (u.searchParams.get('filter') ? ' ' + u.searchParams.get('filter') : ''));
  if (u.pathname.endsWith('/security/v1/session-and-bindings')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ UdsSession: { FirstName: 'Ana', LastName: 'Teste', EmailAddress: 'a@b.c' } }) });
  if (u.pathname.endsWith('/topics')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [{ created: iso(9), status: 1 }, { created: iso(7), status: 2 }] }) });
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
await pagina.goto('chrome-extension://' + id + '/painel.html');
const r = await pagina.evaluate(() => new Promise(res => chrome.runtime.sendMessage({ cmd: 'atualizar' }, res)));
console.log('atualizar ->', r.ok, r.erro || '');
const snap = await pagina.evaluate(() => chrome.storage.local.get(['snapshot', 'tramites', 'status']));
assert.ok(snap.snapshot, 'snapshot gravado');
const s = snap.snapshot;
console.log('versão', s.versao, '| via', s.via, '| porTipo', JSON.stringify(s.porTipo), '| desconhecidos', JSON.stringify(s.desconhecidos), '| tramites', JSON.stringify(s.tramites), '| erros', JSON.stringify(s.erros));
assert.equal(s.versao, require(path.join(EXT, 'manifest.json')).version);
assert.deepEqual(s.desconhecidos, { geral: { 66: 1 } });
assert.equal(s.items.find(i => i.num === 101).ptUteis != null, true, '1º trâmite estimado');
assert.equal(s.tramites.cache, undefined, 'cache fora do resumo');
assert.ok(Object.keys(snap.tramites).includes('calcFerias:v1'));
assert.ok(chamadas.some(c => /payroll-entries.*"NE"/.test(c)), 'Rubricas pediu o filtro NE');
assert.equal(s.items.find(i => i.num === 55).status, 'Respondido');
assert.equal(s.items.find(i => i.num === 900).abaProvavel.label, 'Aviso de férias', 'Geral com assunto de férias sugere a aba certa');
// regras do escritório guardadas (como se o arquivo remoto tivesse sido baixado): prazo de cálculo de 1 d.u.
await pagina.evaluate(() => chrome.storage.local.set({ regrasEscritorio: { url: 'https://exemplo.com/r.json', versao: 't1', atualizadoEm: new Date().toISOString(), regras: { versao: 't1', config: { conclusaoCalculo: 1 }, feriados: [], abaErrada: [] } } }));
await pagina.evaluate(() => new Promise(res => chrome.runtime.sendMessage({ cmd: 'atualizar' }, res)));
const s2 = (await pagina.evaluate(() => chrome.storage.local.get('snapshot'))).snapshot;
const v1 = s2.items.find(i => i.num === 101);
assert.ok(v1.motivos.some(m => /limite 1\)/.test(m.m)), 'o prazo do arquivo de regras vale no semáforo: ' + JSON.stringify(v1.motivos));
// painel mostra
await pagina.reload();
await pagina.waitForSelector('#kpis .kpi-card');
console.log('aviso do painel:', (await pagina.textContent('#aviso')).trim().slice(0, 140));
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

const docs = await ctx.newPage();
await docs.route('https://onvio.com.br/staff/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><body>docs</body>' }));
await docs.route('https://onvio.com.br/api/storage/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: { items: [{ id: 'd1', name: 'DARF.pdf', isReadByClientUser: false, customFields: { dueDate: new Date(Date.now() + 864e5).toISOString().slice(0, 10), clientId: 'c1' } }] } }) }));
await docs.goto('https://onvio.com.br/staff/');
await docs.evaluate(() => fetch('/api/storage/v2/Folders/pasta9/children?from=0').then(r => r.json()));
await docs.waitForSelector('#controlonvio-guias', { timeout: 8000 });
console.log('aviso de guias:', (await docs.textContent('#controlonvio-guias')).slice(0, 90));
const g = await pagina.evaluate(() => chrome.storage.local.get('guias'));
assert.ok(g.guias.pasta9);

// ---- ícone da extensão e atalho: dentro do Onvio abrem o painel; fora dele levam ao Onvio ----
const CAPTURAS = process.env.CAPTURAS || '';
const foto = async (pg, nome) => { if (CAPTURAS) { fs.mkdirSync(CAPTURAS, { recursive: true }); await pg.screenshot({ path: path.join(CAPTURAS, nome) }); } };
const PORTAL_TESTE = 'https://onvio.com.br/br-portal-do-cliente/painel-teste';
const portal = await ctx.newPage();
await portal.setViewportSize({ width: 1360, height: 820 });
await portal.goto(PORTAL_TESTE);
const idDaAba = url => sw.evaluate(async u => (await chrome.tabs.query({ url: u }))[0].id, url);
const painelDe = pg => pg.frames().find(f => f.url() === 'chrome-extension://' + id + '/painel.html');
const dockado = pg => pg.evaluate(() => document.documentElement.classList.contains('controlonvio-docked'));
const esperar = async (cond, ms = 8000) => { const fim = Date.now() + ms; while (Date.now() < fim) { if (await cond()) return; await new Promise(r => setTimeout(r, 100)); } throw new Error('tempo esgotado: ' + cond); };

await foto(portal, '1-onvio-botao.png');
assert.equal(painelDe(portal), undefined, 'com o painel fechado a página não carrega o iframe');
const idPortal = await idDaAba(PORTAL_TESTE);
await sw.evaluate(i => aoClicarNoIcone({ id: i, url: 'https://onvio.com.br/br-portal-do-cliente/painel-teste' }), idPortal);
await esperar(() => painelDe(portal));
const painel = painelDe(portal);
await painel.waitForSelector('#kpis .kpi-card', { timeout: 8000 });
await esperar(async () => (await portal.evaluate(() => getComputedStyle(document.documentElement).marginRight)) === '420px');
assert.equal(await portal.evaluate(() => innerWidth), 1360 - 0, 'a janela continua do mesmo tamanho; só a página encolhe');
await foto(portal, '2-painel-aberto.png');
for (const aba of ['equipe', 'analistas', 'guias']) { await painel.click('[data-aba="' + aba + '"]'); await foto(portal, '3-aba-' + aba + '.png'); }
await painel.click('[data-aba="minhas"]');
// ícone de novo: fecha
await sw.evaluate(i => aoClicarNoIcone({ id: i, url: 'https://onvio.com.br/br-portal-do-cliente/painel-teste' }), idPortal);
await esperar(async () => !(await dockado(portal)));
// botão de fechar dentro do painel
await sw.evaluate(i => aoClicarNoIcone({ id: i, url: 'https://onvio.com.br/br-portal-do-cliente/painel-teste' }), idPortal);
await esperar(() => dockado(portal));
await painel.click('#btn-fechar');
await esperar(async () => !(await dockado(portal)));

// fora do Onvio: leva ao Onvio que já está aberto e abre o painel lá
const fora = await ctx.newPage();
await fora.route('https://exemplo.com/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><body>outro site</body>' }));
await fora.goto('https://exemplo.com/');
const idFora = await idDaAba('https://exemplo.com/*');
await sw.evaluate(i => aoClicarNoIcone({ id: i, url: 'https://exemplo.com/' }), idFora);
await esperar(async () => (await Promise.all(ctx.pages().map(async pg => (/onvio\.com\.br/.test(pg.url()) && (await dockado(pg)))))).some(Boolean));
assert.equal(painelDe(fora), undefined, 'em outro site nunca aparece painel');
assert.equal(await fora.evaluate(() => document.documentElement.classList.contains('controlonvio-docked')), false);

// sem nenhuma aba do Onvio: o ícone cria uma aba do Onvio e o painel abre quando ela carregar
for (const pg of ctx.pages()) if (/onvio\.com\.br/.test(pg.url())) await pg.close();
const antes = ctx.pages().length;
await sw.evaluate(i => aoClicarNoIcone({ id: i, url: 'https://exemplo.com/' }), idFora);
await esperar(() => ctx.pages().length > antes);
const nova = ctx.pages().find(pg => /onvio\.com\.br\/br-portal-do-cliente/.test(pg.url()));
assert.ok(nova, 'abriu uma aba do Onvio');
await esperar(() => painelDe(nova));
await foto(nova, '4-aba-criada-pelo-icone.png');

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

/* Testes da extensão (sem dependências):  node --test testes/ */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const EXT = path.join(__dirname, '..', 'extensao');
const src = f => fs.readFileSync(path.join(EXT, f), 'utf8');

function carregarCore() {
  const ctx = { console, URL, URLSearchParams };
  ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(src('core.js'), ctx);
  return ctx.OC;
}
const OC = carregarCore();
const AGORA = new Date('2026-10-14T15:00:00');
const plano = x => JSON.parse(JSON.stringify(x));

/* ---------- situação desconhecida ---------- */
test('código de situação desconhecido vira lado "desc" com alerta amarelo', () => {
  const t = OC.TYPE_BY_KEY.cadEmpregado;
  const it = OC.normalize(t, { id: 'a', identifier: 10, genericStatus: 99, created: '2026-10-13T12:00:00', lastUpdated: '2026-10-13T12:00:00' }, null);
  assert.equal(it.lado, 'desc');
  assert.equal(it.desconhecido, true);
  assert.equal(it.status, 'Situação desconhecida (código 99)');
  const ev = OC.evaluate(it, {}, AGORA);
  assert.equal(ev.nivel, 1);
  assert.match(ev.motivos[0].m, /desconhecida/);
});

test('código conhecido não é marcado como desconhecido (inclusive o 0 de Rubricas)', () => {
  const it = OC.normalize(OC.TYPE_BY_KEY.rubricas, { id: 'a', identifier: 1, genericStatus: 0 }, null);
  assert.equal(it.desconhecido, false);
  assert.equal(it.lado, 'esc');
});

/* ---------- filtro de pendentes ---------- */
const filtroDe = url => JSON.parse(new URL(url).searchParams.get('filter')).groups[0].items;

test('Rubricas filtra por exclusão (NE 8 e NE 10); a lista IN fica como alternativa', () => {
  const t = OC.TYPE_BY_KEY.rubricas;
  assert.deepEqual(plano(filtroDe(OC.listUrl(t, { pendentes: true }))).map(i => i.op + ' ' + i.value), ['NE 8', 'NE 10']);
  const alt = filtroDe(OC.listUrl(t, { pendentes: 'alt' }));
  assert.equal(alt.length, 1);
  assert.equal(alt[0].op, 'IN');
});

test('os demais tipos continuam com IN', () => {
  assert.equal(filtroDe(OC.listUrl(OC.TYPE_BY_KEY.geral, { pendentes: true }))[0].op, 'IN');
});

/* ---------- coleta ---------- */
function fetcherFalso({ recusaNE = false, itens = {}, topicos = {}, falhaTopicos = false } = {}) {
  const chamadas = { listas: 0, topicos: 0 };
  const f = async url => {
    const u = new URL(url);
    if (u.pathname.endsWith('session-and-bindings')) return { UdsSession: { FirstName: 'Ana', LastName: 'Teste' } };
    if (u.pathname.endsWith('/topics')) {
      chamadas.topicos++;
      if (falhaTopicos) throw new Error('HTTP 404');
      const id = u.pathname.split('/').slice(-2)[0];
      return { items: topicos[id] || [] };
    }
    chamadas.listas++;
    if (recusaNE && u.pathname.endsWith('/payroll-entries') && /"NE"/.test(u.searchParams.get('filter') || '')) throw new Error('HTTP 400');
    const t = OC.TYPES.find(x => u.pathname.endsWith('/' + x.path.split('/').pop()));
    return { items: itens[t.key] || [], totalPages: 1 };
  };
  f.chamadas = chamadas;
  return f;
}

test('se o Onvio recusa o filtro NE de Rubricas, a coleta repete com IN e avisa', async () => {
  const f = fetcherFalso({ recusaNE: true, itens: { rubricas: [{ id: 'r1', identifier: 5, genericStatus: 4, lastUpdated: '2026-10-10T12:00:00', created: '2026-10-01T12:00:00' }] } });
  const snap = await OC.collect(f, {}, null);
  assert.deepEqual(plano(snap.filtroAlternativo), ['Lançamento de rubricas']);
  assert.equal(snap.porTipo.rubricas, 1);
  assert.equal(snap.erros.length, 0);
});

test('a coleta resume códigos desconhecidos por tipo', async () => {
  const f = fetcherFalso({ itens: { calcFerias: [{ id: 'x', identifier: 7, genericStatus: 42, created: '2026-10-10T12:00:00', lastUpdated: '2026-10-10T12:00:00' }] } });
  const snap = await OC.collect(f, {}, null);
  assert.deepEqual(plano(snap.desconhecidos), { calcFerias: { 42: 1 } });
  assert.equal(snap.items.length, 1);
});

/* ---------- gravidade ---------- */
test('gravidade: 0 em dia, 1 atenção, 2 fora do prazo, 3 crítica', () => {
  const t = OC.TYPE_BY_KEY.avisoFerias, s = OC.DEFAULTS;
  assert.equal(OC.gravidade({ lado: 'esc' }, t, s, { nivel: 0 }), 0);
  assert.equal(OC.gravidade({ lado: 'esc' }, t, s, { nivel: 1 }), 1);
  assert.equal(OC.gravidade({ lado: 'esc' }, t, s, { nivel: 2, parado: 16, uteisAberto: 4 }), 2);
  assert.equal(OC.gravidade({ lado: 'esc' }, t, s, { nivel: 2, parado: 30, uteisAberto: 4 }), 3);
  assert.equal(OC.gravidade({ lado: 'esc' }, t, s, { nivel: 2, parado: 5, uteisAberto: 6 }), 3);
  assert.equal(OC.gravidade({ lado: 'cli' }, t, s, { nivel: 2, parado: 26, uteisAberto: 20, prescreveEm: 4 }), 3);
});

/* ---------- primeiro trâmite ---------- */
test('primeiro trâmite do escritório ignora a abertura e os trâmites gravados pelo cliente', () => {
  const t = OC.TYPE_BY_KEY.calcFerias; // padrão: cliente grava 1 e 3
  const topicos = [
    { created: '2026-10-01T10:00:00', status: 1 },   // abertura
    { created: '2026-10-02T09:00:00', status: 3 },   // cliente escreveu
    { created: '2026-10-05T14:00:00', status: 2 },   // escritório em análise  <- primeiro
    { created: '2026-10-06T14:00:00', status: 4 }
  ];
  assert.equal(OC.primeiroTramiteEsc(topicos, t), '2026-10-05T14:00:00');
  assert.equal(OC.primeiroTramiteEsc([topicos[0]], t), null);
  assert.equal(OC.primeiroTramiteEsc([], t), null);
});

test('trâmites: lê uma vez, guarda em cache e não relê; falha vira pausa de 1 dia', async () => {
  const itens = { calcFerias: [
    { id: 'g1', identifier: 1, genericStatus: 2, created: '2026-10-05T12:00:00', lastUpdated: '2026-10-08T12:00:00' },
    { id: 'g2', identifier: 2, genericStatus: 1, created: '2026-10-05T12:00:00', lastUpdated: '2026-10-05T12:00:00' } // Sem análise: não lê
  ] };
  const topicos = { g1: [{ created: '2026-10-05T12:00:00', status: 1 }, { created: '2026-10-07T12:00:00', status: 2 }] };
  const f = fetcherFalso({ itens, topicos });
  const s1 = await OC.collect(f, {}, null, { tramites: {} });
  assert.equal(f.chamadas.topicos, 1);
  assert.equal(s1.items.find(i => i.id === 'g1').ptUteis, 2);
  assert.equal(s1.items.find(i => i.id === 'g2').ptUteis, undefined);
  const s2 = await OC.collect(f, {}, null, { tramites: s1.tramites.cache });
  assert.equal(f.chamadas.topicos, 1, 'segunda leitura reaproveita o cache');
  assert.equal(s2.items.find(i => i.id === 'g1').ptUteis, 2);

  const ruim = fetcherFalso({ itens, falhaTopicos: true });
  const s3 = await OC.collect(ruim, {}, null, { tramites: {} });
  assert.equal(s3.tramites.falhas, 1);
  assert.ok(s3.tramites.cache['calcFerias:g1'].erro);
  await OC.collect(ruim, {}, null, { tramites: s3.tramites.cache });
  assert.equal(ruim.chamadas.topicos, 1, 'não insiste no mesmo dia');
});

test('o cache de trâmites só guarda o que continua pendente', async () => {
  const f = fetcherFalso({ itens: {} });
  const snap = await OC.collect(f, {}, null, { tramites: { 'calcFerias:velho': { pt: '2026-01-01T00:00:00' } } });
  assert.deepEqual(plano(snap.tramites.cache), {});
});

/* ---------- painel do gestor ---------- */
test('porAnalista soma G1/G2/G3, "sem 1º trâmite" e média do 1º trâmite', () => {
  const base = { status: 'Em análise', lado: 'esc', nivel: 0, grav: 0 };
  const rows = OC.porAnalista([
    Object.assign({}, base, { resp: 'Ana', grav: 3, nivel: 2, ptUteis: 2 }),
    Object.assign({}, base, { resp: 'Ana', grav: 1, nivel: 1, ptUteis: 3 }),
    Object.assign({}, base, { resp: 'Ana', status: 'Sem análise' }),
    Object.assign({}, base, { resp: 'Ana', lado: 'desc' }),
    Object.assign({}, base, { resp: '', grav: 2, nivel: 2 })
  ]);
  const ana = rows.find(r => r.resp === 'Ana');
  assert.deepEqual([ana.total, ana.esc, ana.desc, ana.g1, ana.g2, ana.g3, ana.semPrimeiro, ana.ptMedia], [4, 3, 1, 1, 0, 1, 1, 2.5]);
  assert.ok(rows.find(r => r.resp === '(sem responsável)'));
  assert.equal(rows[0].resp, 'Ana', 'quem tem G3 vem primeiro');
});

/* ---------- guias não visualizadas ---------- */
test('guias: só alerta não lida com vencimento dentro do prazo, e marca vencidas', () => {
  const g = (due, lido) => OC.avaliarGuia({ due, lido: !!lido }, { guiaDias: 5 }, AGORA);
  assert.equal(g('2026-10-14').motivo, 'Vence hoje');
  assert.equal(g('2026-10-15').motivo, 'Vence amanhã');
  assert.equal(g('2026-10-15').nivel, 2);
  assert.equal(g('2026-10-17').nivel, 1);
  assert.equal(g('2026-10-17').motivo, 'Vence em 3 dias');
  assert.equal(g('2026-10-12').motivo, 'Venceu há 2 dia(s)');
  assert.equal(g('2026-10-12').nivel, 2);
  assert.equal(g('2026-10-19').nivel, 1, 'no limite de 5 dias');
  assert.equal(g('2026-10-20'), null, 'além do prazo');
  assert.equal(g('2026-10-14', true), null, 'já lida');
  assert.equal(g(null), null, 'sem vencimento');
  assert.equal(g('2026-10-17T00:00:00Z').venc, '2026-10-17', 'usa a data, sem deslocar pelo fuso');
});

test('guias: o prazo vem das configurações', () => {
  assert.equal(OC.avaliarGuia({ due: '2026-10-20', lido: false }, { guiaDias: 10 }, AGORA).dias, 6);
});

test('reconhece documento e descarta pasta', () => {
  assert.equal(OC.ehDocumento({ name: 'a.pdf', isReadByClientUser: false }), true);
  assert.equal(OC.ehDocumento({ name: 'Pasta', isReadByClientUser: false, documentCount: 3 }), false);
  assert.equal(OC.ehDocumento({ name: 'Pasta', isReadByClientUser: true, hasFiles: true }), false);
  assert.equal(OC.ehDocumento({ name: 'x' }), false);
});

/* ---------- background.js (com chrome simulado) ---------- */
function carregarBackground(opcoes = {}) {
  const store = {};
  const chrome = {
    storage: {
      local: {
        async get(k) { const ks = Array.isArray(k) ? k : [k]; const o = {}; ks.forEach(x => { if (x in store) o[x] = store[x]; }); return o; },
        async set(o) { Object.assign(store, o); },
        async remove(k) { (Array.isArray(k) ? k : [k]).forEach(x => delete store[x]); }
      },
      onChanged: { addListener() {} }
    },
    alarms: { clear: async () => {}, create() {}, onAlarm: { addListener() {} } },
    runtime: { onMessage: { addListener() {} }, onInstalled: { addListener() {} }, onStartup: { addListener() {} }, getManifest: () => ({ version: 'teste' }) },
    notifications: { onClicked: { addListener() {} }, onClosed: { addListener() {} }, create: async () => {}, clear() {} },
    permissions: { contains: async () => opcoes.permitido !== false },
    sidePanel: {}, action: {}, tabs: {}, windows: {}, scripting: {}
  };
  const ctx = { console, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, chrome, fetch: opcoes.fetch || (async () => { throw new Error('sem rede'); }) };
  ctx.self = ctx;
  ctx.importScripts = f => vm.runInContext(src(f), ctx);
  vm.createContext(ctx);
  vm.runInContext(src('background.js'), ctx);
  return { ctx, store };
}

test('background: erro do servidor não vira "sem sessão"; login e 401 viram', async () => {
  const { ctx } = carregarBackground();
  await assert.rejects(ctx.lerResposta(500, 'text/html', '<html>erro</html>'), e => !e.auth && /HTTP 500/.test(e.message));
  await assert.rejects(ctx.lerResposta(404, 'application/json', '{}'), e => !e.auth && /HTTP 404/.test(e.message));
  await assert.rejects(ctx.lerResposta(401, 'application/json', '{}'), e => e.auth === true);
  await assert.rejects(ctx.lerResposta(403, 'text/html', ''), e => e.auth === true);
  await assert.rejects(ctx.lerResposta(200, 'text/html', '<html>login</html>'), e => e.auth === true);
  await assert.rejects(ctx.lerResposta(200, 'application/json', 'não é json'), e => !e.auth);
  assert.deepEqual(plano(await ctx.lerResposta(200, 'application/json; charset=utf-8', '{"a":1}')), { a: 1 });
});

test('background: notifMap descarta o que passou de 24 h e o que foi fechado', async () => {
  const { ctx, store } = carregarBackground();
  const agora = Date.now();
  store.notifMap = { velho: { type: 'geral', num: '1', ts: agora - 2 * 864e5 }, ok: { type: 'geral', num: '2', ts: agora - 1000 }, fechado: { type: 'geral', num: '3', ts: agora } };
  await ctx.guardarNotifMap({ novo: { type: 'rubricas', num: '4', ts: agora } }, 'fechado');
  assert.deepEqual(Object.keys(store.notifMap).sort(), ['novo', 'ok']);
  assert.deepEqual(Object.keys(store.notifMap.novo).sort(), ['num', 'ts', 'type'], 'guarda só o necessário para abrir');
});


/* ================= v0.3.0: regras do escritório ================= */
test('aba errada: acha pelo assunto, sem depender de acento nem de maiúscula, e só palavra inteira', () => {
  const ab = a => OC.abaProvavel(a, OC.DEFAULTS.abaErrada);
  assert.equal(ab('Férias do João em Dezembro').tipo, 'avisoFerias');
  assert.equal(ab('RECIBO DE FÉRIAS da Maria').tipo, 'calcFerias', 'a entrada mais específica vence');
  assert.equal(ab('Pedido de demissão - Pedro').tipo, 'avisoRescisao');
  assert.equal(ab('Atestado médico').tipo, 'afastamento');
  assert.equal(ab('Admissão de novo funcionário').tipo, 'cadEmpregado');
  assert.equal(ab('Dúvida sobre guia de ICMS'), null);
  assert.equal(ab('Triagem do estágio probatório').tipo, 'cadEstagiario');
  assert.equal(ab('Compartilhamento de pastas'), null, '"inss" não casa dentro de outra palavra');
  assert.equal(ab('Sobre o inssumo'), null);
  assert.equal(ab(''), null);
  assert.equal(ab(null), null);
});

test('aba errada: só a lista Geral recebe a sugestão', () => {
  const geral = OC.normalize(OC.TYPE_BY_KEY.geral, { id: 'a', identifier: 1, genericStatus: 1, subject: 'Férias do João' }, null);
  const ferias = OC.normalize(OC.TYPE_BY_KEY.calcFerias, { id: 'b', identifier: 2, genericStatus: 1, subject: 'Férias do João' }, null);
  assert.equal(geral.abaProvavel.label, 'Aviso de férias');
  assert.equal(ferias.abaProvavel, null);
});

test('regras: aceita o formato do escritório e valida limites', () => {
  const r = OC.normalizarRegras({
    versao: '2026.10.14', prazos: { conclusaoSimples: 2, conclusaoCalculo: 99, parada: 'x', guiaDias: 7, primeiroTramite: 0 },
    feriados: ['2026-12-24', '24/12/2026', 'abc', '2026-12-24'], abaErrada: [{ tipo: 'avisoFerias', palavras: ['Férias', '', 'x'.repeat(80)] }, { tipo: 'geral', palavras: ['qualquer'] }, { tipo: 'inexistente', palavras: ['a'] }]
  });
  assert.deepEqual(plano(r.config), { conclusaoSimples: 2, guiaDias: 7, primeiroTramite: 0 }, 'fora do limite ou não numérico é ignorado');
  assert.deepEqual(plano(r.feriados), ['2026-12-24']);
  assert.deepEqual(plano(r.abaErrada), [{ tipo: 'avisoFerias', palavras: ['ferias'] }]);
  assert.equal(r.versao, '2026.10.14');
});

test('regras: lê os prazos do arquivo do Assistente do cliente (mesmos números dos dois lados)', () => {
  const r = OC.normalizarRegras({ versao: 'c-1', config: { prazoInternoDiasUteis: { simples: 4, calculo: 6 } }, feriados: ['2026-11-20'], tipos: {}, documentos: [] });
  assert.deepEqual(plano(r.config), { conclusaoSimples: 4, conclusaoCalculo: 6 });
  // o formato do escritório tem prioridade sobre o do cliente
  const r2 = OC.normalizarRegras({ prazos: { conclusaoSimples: 2 }, config: { prazoInternoDiasUteis: { simples: 4, calculo: 6 } } });
  assert.deepEqual(plano(r2.config), { conclusaoSimples: 2, conclusaoCalculo: 6 });
});

test('regras: arquivo sem nada aproveitável, ou que não é objeto, é recusado', () => {
  for (const ruim of [null, [], 'texto', 5, {}, { prazos: { parada: 9999 } }, { feriados: ['x'] }, { abaErrada: [{ tipo: 'geral', palavras: ['a'] }] }]) assert.equal(OC.normalizarRegras(ruim), null);
});

test('regras: não executa nem copia nada além do que valida (campos extras e "__proto__" são ignorados)', () => {
  const r = OC.normalizarRegras(JSON.parse('{"prazos":{"parada":10,"__proto__":{"x":1},"constructor":5},"script":"alert(1)","feriados":["2026-12-24"]}'));
  assert.deepEqual(plano(r.config), { parada: 10 });
  assert.equal(r.script, undefined);
  assert.equal(({}).x, undefined);
});

test('configurações: código < arquivo do escritório < ajuste da pessoa', () => {
  const regras = { regras: OC.normalizarRegras({ prazos: { conclusaoSimples: 2, parada: 10 }, feriados: ['2026-12-24'] }) };
  const s = OC.combinarSettings(regras, { parada: 20 });
  assert.equal(s.conclusaoSimples, 2, 'vem do arquivo');
  assert.equal(s.parada, 20, 'a pessoa manda');
  assert.equal(s.conclusaoCalculo, OC.DEFAULTS.conclusaoCalculo, 'o que o arquivo não diz fica no padrão');
  assert.ok(s.feriados.includes('2026-12-24') && s.feriados.includes('2026-12-25'), 'feriados: soma os embutidos e os do arquivo');
  assert.equal(OC.combinarSettings(null, null).parada, OC.DEFAULTS.parada);
  assert.equal(OC.combinarSettings(null, null).abaErrada.length, OC.DEFAULTS.abaErrada.length);
});

test('as regras do arquivo mudam de fato o semáforo', () => {
  const it = { type: 'avisoFerias', lado: 'esc', status: 'Em análise', created: '2026-10-08T12:00:00', last: '2026-10-13T12:00:00', due: null };
  const rigido = OC.combinarSettings({ regras: OC.normalizarRegras({ prazos: { conclusaoSimples: 1 } }) }, {});
  const folgado = OC.combinarSettings({ regras: OC.normalizarRegras({ prazos: { conclusaoSimples: 10 } }) }, {});
  assert.equal(OC.evaluate(it, rigido, AGORA).nivel, 2);
  assert.equal(OC.evaluate(it, folgado, AGORA).nivel, 0);
});

const regrasOk = { versao: '2026.10.14', prazos: { conclusaoSimples: 2 }, feriados: ['2026-12-24'] };
const respJson = (obj, status = 200) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => obj });

test('background: baixa o arquivo, valida e guarda; erro depois mantém a última cópia boa', async () => {
  let resposta = respJson(regrasOk);
  const { ctx, store } = carregarBackground({ fetch: (u, o) => resposta(u, o) });
  store.settings = { regrasUrl: 'https://exemplo.com/regras.json' };
  const r = await ctx.atualizarRegras();
  assert.equal(r.ok, true);
  assert.equal(store.regrasEscritorio.versao, '2026.10.14');
  assert.equal(store.regrasEscritorio.regras.config.conclusaoSimples, 2);
  assert.equal((await ctx.getSettings()).conclusaoSimples, 2);

  resposta = respJson({}, 500);
  assert.equal((await ctx.atualizarRegras()).ok, false);
  assert.match(store.regrasEscritorio.erro, /HTTP 500/);
  assert.equal(store.regrasEscritorio.regras.config.conclusaoSimples, 2, 'continua com a última cópia boa');

  resposta = respJson({ qualquer: 'coisa' });
  assert.equal((await ctx.atualizarRegras()).ok, false);
  assert.match(store.regrasEscritorio.erro, /não tem prazos/);
  assert.equal(store.regrasEscritorio.regras.config.conclusaoSimples, 2);
});

test('background: sem permissão, endereço http e sem endereço', async () => {
  let chamou = 0;
  const { ctx, store } = carregarBackground({ permitido: false, fetch: async () => { chamou++; return respJson(regrasOk)(); } });
  store.settings = { regrasUrl: 'https://exemplo.com/regras.json' };
  assert.equal((await ctx.atualizarRegras()).ok, false);
  assert.match(store.regrasEscritorio.erro, /falta a permissão/);
  assert.equal(chamou, 0, 'não chama a rede sem permissão');

  store.settings = { regrasUrl: 'http://exemplo.com/regras.json' };
  assert.equal((await ctx.atualizarRegras()).ok, false);
  assert.match(store.regrasEscritorio.erro, /https/);

  store.settings = { regrasUrl: 'https://u:p@exemplo.com/r.json' };
  assert.equal((await ctx.atualizarRegras()).ok, false, 'endereço com usuário e senha é recusado');

  store.settings = {};
  assert.equal((await ctx.atualizarRegras()).ok, true);
  assert.equal(store.regrasEscritorio, undefined, 'sem endereço, volta para as regras embutidas');
});

test('background: migra configurações antigas tirando o que era só o padrão', async () => {
  const { ctx, store } = carregarBackground();
  store.settings = Object.assign({}, JSON.parse(JSON.stringify(OC.DEFAULTS)), { parada: 21, modoGestor: true });
  await ctx.migrarSettings();
  assert.deepEqual(plano(store.settings), { __v: 2, parada: 21, modoGestor: true });
  await ctx.migrarSettings();                          // idempotente
  assert.deepEqual(plano(store.settings), { __v: 2, parada: 21, modoGestor: true });
  assert.equal((await ctx.getSettings()).parada, 21);
});

test('o arquivo de regras de exemplo é válido e cobre prazos, feriados e palavras', () => {
  const ex = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'regras', 'escritorio.exemplo.json'), 'utf8'));
  const r = OC.normalizarRegras(ex);
  assert.ok(r);
  assert.equal(Object.keys(r.config).length, 8, 'todos os prazos do exemplo passam na validação');
  assert.equal(r.feriados.length, 2);
  assert.equal(r.abaErrada.length, 4);
  assert.equal(r.abaErrada[0].palavras[0], 'calculo de ferias', 'palavras ficam sem acento');
});

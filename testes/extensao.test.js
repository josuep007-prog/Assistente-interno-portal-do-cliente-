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
function carregarBackground() {
  const store = {};
  const chrome = {
    storage: {
      local: {
        async get(k) { const ks = Array.isArray(k) ? k : [k]; const o = {}; ks.forEach(x => { if (x in store) o[x] = store[x]; }); return o; },
        async set(o) { Object.assign(store, o); }
      },
      onChanged: { addListener() {} }
    },
    alarms: { clear: async () => {}, create() {}, onAlarm: { addListener() {} } },
    runtime: { onMessage: { addListener() {} }, onInstalled: { addListener() {} }, onStartup: { addListener() {} }, getManifest: () => ({ version: 'teste' }) },
    notifications: { onClicked: { addListener() {} }, onClosed: { addListener() {} }, create: async () => {}, clear() {} },
    sidePanel: {}, action: {}, tabs: {}, windows: {}, scripting: {}
  };
  const ctx = { console, URL, URLSearchParams, chrome, fetch: async () => { throw new Error('sem rede'); } };
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

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

test('Rubricas filtra com IN: o filtro NE (8 e 10) dava HTTP 500 no Onvio real', () => {
  const t = OC.TYPE_BY_KEY.rubricas;
  assert.deepEqual(plano(filtroDe(OC.listUrl(t, { pendentes: true }))).map(i => i.op + ' ' + i.value), ['IN 0,1,2,3,4,5,6,7,9,11,12']);
  for (const x of OC.TYPES) assert.ok(!/"NE"/.test(new URL(OC.listUrl(x, { pendentes: true })).searchParams.get('filter')), x.key + ' sem NE');
});

test('Cadastro: 7 (Encaminhado para outro usuário) é pendente do escritório', () => {
  const t = OC.TYPE_BY_KEY.cadEmpregado;
  assert.equal(filtroDe(OC.listUrl(t, { pendentes: true }))[0].value, '1,2,3,4,5,7');
  const x = OC.normalize(t, { id: 'e1', identifier: 3, genericStatus: 7, created: '2026-10-10T12:00:00', lastUpdated: '2026-10-10T12:00:00' }, new Set(), []);
  assert.deepEqual([x.status, x.lado, !!x.desconhecido], ['Encaminhado para outro usuário', 'esc', false]);
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

test('trâmites: caminho fixo por lista (mapeado no Onvio real), sempre com o GUID da solicitação', () => {
  const esperado = {
    geral: 'service-requesting/v1/tickets', cadEmpregado: 'br-payroll-sr/v1/employees-registrations',
    cadContribuinte: 'br-payroll-sr/v1/employees-registrations', cadEstagiario: 'br-payroll-sr/v1/employees-registrations',
    avisoFerias: 'br-payroll-sr/v1/tickets', calcFerias: 'br-payroll-sr/v1/tickets', avisoRescisao: 'br-payroll-sr/v1/tickets',
    calcRescisao: 'br-payroll-sr/v1/tickets', afastamento: 'br-payroll-sr/v1/tickets', rubricas: 'br-payroll-sr/v1/payroll-entries'
  };
  for (const t of OC.TYPES) assert.equal(OC.urlTramites(t, { id: 'abc123', identifier: 702 }), OC.API + esperado[t.key] + '/abc123/topics?expand=all&itemsPerPage=1000&orderBy=created%20asc&pageIndex=0', t.key);
  assert.equal(OC.urlTramites(OC.TYPE_BY_KEY.avisoFerias, 'g9'), OC.API + 'br-payroll-sr/v1/tickets/g9/topics?expand=all&itemsPerPage=1000&orderBy=created%20asc&pageIndex=0', 'aceita só o id');
});

test('trâmites: a coleta lê cada lista no seu caminho e marca por lista o que falhou', async () => {
  const itens = {
    avisoFerias: [{ id: 'v1', identifier: 702, genericStatus: 2, created: '2026-10-05T12:00:00', lastUpdated: '2026-10-08T12:00:00' }],
    rubricas: [{ id: 'r1', identifier: 101, genericStatus: 2, created: '2026-10-05T12:00:00', genericLastUpdated: '2026-10-08T12:00:00' }]
  };
  const pedidos = [];
  const f = async url => {
    const u = new URL(url);
    if (u.pathname.endsWith('session-and-bindings')) return { UdsSession: { FirstName: 'Ana', LastName: 'Teste' } };
    if (u.pathname.endsWith('/topics')) {
      pedidos.push(u.pathname.replace('/api/br-payroll-sr/v1/', ''));
      if (u.pathname.endsWith('tickets/v1/topics')) return { items: [{ created: '2026-10-05T12:00:00', status: 1 }, { created: '2026-10-06T12:00:00', status: 2 }] };
      throw new Error('HTTP 500');
    }
    const t = OC.TYPES.find(x => u.pathname.endsWith('/' + x.path.split('/').pop()));
    return { items: itens[t.key] || [], totalPages: 1 };
  };
  const snap = await OC.collect(f, {}, null, { tramites: {} });
  assert.deepEqual(pedidos.sort(), ['payroll-entries/r1/topics', 'tickets/v1/topics']);
  assert.equal(snap.items.find(i => i.k === 'avisoFerias:v1').ptUteis, 1);
  assert.deepEqual(plano(snap.tramites.porTipo), { avisoFerias: 'ok', rubricas: 'erro: HTTP 500' });
});

/* ---------- por que a gravidade (justificativa mostrada nas etiquetas) ---------- */
test('gravidade: G3 diz o porquê com os números (prescrição, parada, prazo de simples e de cálculo)', () => {
  const p = OC.porqueGravidade({ type: 'avisoRescisao', grav: 3, nivel: 2, lado: 'cli', prescreveEm: 3, parado: 27, motivos: [{ n: 2, m: 'Prescreve em 3 dia(s)' }] });
  assert.equal(p.rot, 'Crítica (G3)');
  assert.equal(p.texto, 'Crítica (G3) porque prescreve em 3 dia(s) (crítica a partir de 5).');
  assert.equal(p.curto, 'G3: prescreve em 3 d');
  const q = OC.porqueGravidade({ type: 'calcFerias', grav: 3, nivel: 2, lado: 'esc', parado: 31, uteisAberto: 12, motivos: [{ n: 2, m: 'Parada há 31 dias' }] });
  assert.equal(q.texto, 'Crítica (G3) porque parada há 31 dias, o dobro do limite de 15; aberta há 12 d.u., o dobro do prazo de 5 d.u. (cálculo).');
  assert.equal(q.curto, 'G3: parada 2× o limite · aberta 2× o prazo');
  const r = OC.porqueGravidade({ type: 'geral', grav: 3, nivel: 2, lado: 'esc', parado: 3, uteisAberto: 6, motivos: [] });
  assert.match(r.texto, /aberta há 6 d\.u\., o dobro do prazo de 3 d\.u\. \(demanda simples\)/);
  // limites das configurações: com parada 20, 31 dias não é o dobro
  assert.doesNotMatch(OC.porqueGravidade({ type: 'calcFerias', grav: 3, nivel: 2, lado: 'esc', parado: 31, uteisAberto: 12 }, { parada: 20 }).texto, /parada/);
  // leitura antiga, sem os números: usa os motivos
  assert.equal(OC.porqueGravidade({ type: 'geral', grav: 3, nivel: 2, motivos: [{ n: 2, m: 'Sem primeiro trâmite há 9 d.u.' }] }).texto, 'Crítica (G3) porque sem primeiro trâmite há 9 d.u.');
});

test('gravidade: G2 e G1 explicam pelo motivo; em dia não tem justificativa', () => {
  assert.equal(OC.porqueGravidade({ type: 'geral', grav: 2, nivel: 2, motivos: [{ n: 2, m: 'Aberta há 4 d.u. (limite 3)' }] }).texto, 'Fora do prazo (G2): aberta há 4 d.u. (limite 3).');
  const g1 = OC.porqueGravidade({ type: 'geral', grav: 1, nivel: 1, motivos: [{ n: 1, m: 'Prazo de conclusão vence hoje' }] });
  assert.deepEqual([g1.rot, g1.curto], ['Atenção (G1)', 'G1: prazo de conclusão vence hoje']);
  assert.equal(OC.porqueGravidade({ type: 'geral', grav: 0, nivel: 0 }), null);
  // a mesma regra de evaluate: um item avaliado de verdade
  const it = OC.normalize(OC.TYPE_BY_KEY.calcFerias, { id: 'x', identifier: 1, genericStatus: 2, created: '2026-08-01T10:00:00', lastUpdated: '2026-09-01T10:00:00' }, null);
  Object.assign(it, OC.evaluate(it, {}, AGORA));
  assert.equal(it.grav, 3);
  assert.match(OC.porqueGravidade(it).texto, /^Crítica \(G3\) porque parada há \d+ dias, o dobro do limite de 15; aberta há \d+ d\.u\., o dobro do prazo de 5 d\.u\. \(cálculo\)\.$/);
});

/* ---------- vez do cliente sem retorno = resolvida (regra de 16/10/2026) ---------- */
test('resolvida: só uma resposta que não pede nada ao cliente (cortesia e faltas não contam)', () => {
  const pede = t => OC.pedeAlgoAoCliente(t, OC.DEFAULTS).pede;
  assert.equal(pede('Segue a guia em anexo.'), false);
  assert.equal(pede('<p>Cálculo enviado. Qualquer dúvida, estamos à disposição.</p>'), false);
  assert.equal(pede('Feito! Ficou alguma dúvida? Estamos à disposição.'), false);
  assert.equal(pede('As faltas do mês foram descontadas.'), false);
  assert.equal(pede('Favor enviar o recibo assinado.'), true);
  assert.equal(pede('Aguardamos o atestado.'), true);
  assert.equal(pede('Ainda falta o exame admissional'), true);
  assert.equal(pede('Qual a data de início?'), true);
  assert.equal(OC.pedeAlgoAoCliente('Por favor, confirme.', OC.DEFAULTS).trecho, 'favor');
  assert.equal(pede('Pagamento ok, obrigado.'), false);
  assert.equal(OC.pedeAlgoAoCliente('Pagamento ok, obrigado.', Object.assign({}, OC.DEFAULTS, { pedidoAoCliente: ['obrigado'] })).pede, true, 'a lista vem das regras');
});

test('resolvida: vez do cliente há mais de 3 d.u. sem pedido sai da fila; o cache guarda só o veredito', async () => {
  const recente = new Date(Date.now() - 36e5).toISOString().slice(0, 19);
  const cli = (id, n, last) => ({ id, identifier: n, genericStatus: 4, created: '2026-01-05T12:00:00', lastUpdated: last || '2026-01-08T12:00:00' });
  const itens = { avisoFerias: [cli('c1', 801), cli('c2', 802), cli('c3', 803), cli('c4', 804, recente)] };
  const topicos = {
    c1: [{ created: '2026-01-05T12:00:00', status: 1, description: 'Pedido' }, { created: '2026-01-08T12:00:00', status: 4, description: '<p>Segue o aviso. Qualquer dúvida, estamos à disposição.</p>' }],
    c2: [{ created: '2026-01-05T12:00:00', status: 1 }, { created: '2026-01-08T12:00:00', status: 4, description: 'Favor enviar o aviso assinado.' }],
    c3: [{ created: '2026-01-05T12:00:00', status: 1 }, { created: '2026-01-07T12:00:00', status: 4, description: 'Segue.' }, { created: '2026-01-08T12:00:00', status: 3, description: 'Recebido' }],
    c4: [{ created: '2026-01-05T12:00:00', status: 1 }, { created: '2026-01-08T12:00:00', status: 4, description: 'Segue.' }]
  };
  const pedidos = [];
  const f = async url => {
    const u = new URL(url);
    if (u.pathname.endsWith('session-and-bindings')) return { UdsSession: { FirstName: 'Ana', LastName: 'Teste' } };
    const m = /tickets\/(\w+)\/topics$/.exec(u.pathname);
    if (m) { pedidos.push(m[1]); return { items: topicos[m[1]] }; }
    const t = OC.TYPES.find(x => u.pathname.endsWith('/' + x.path.split('/').pop()));
    return { items: itens[t.key] || [], totalPages: 1 };
  };
  const snap = await OC.collect(f, {}, null, { tramites: {} });
  assert.deepEqual(plano(snap.resolvidas.map(r => r.k)), ['avisoFerias:c1']);
  assert.equal(snap.items.some(i => i.k === 'avisoFerias:c1'), false, 'sai das pendências');
  assert.equal(snap.items.find(i => i.k === 'avisoFerias:c2').pedidoAoCliente, 'favor');
  assert.equal(snap.items.find(i => i.k === 'avisoFerias:c3').pedidoAoCliente, 'última palavra do cliente');
  assert.equal(snap.items.find(i => i.k === 'avisoFerias:c4').pedidoAoCliente, undefined, 'parada há pouco: nem é conferida');
  assert.ok(snap.resolvidas[0].semRetorno > 3);
  assert.equal(snap.resolvidas[0].num, 801);
  const cache = plano(snap.tramites.cache);
  assert.deepEqual(cache['avisoFerias:c1'].res, { em: '2026-01-08T12:00:00', pede: false });
  assert.doesNotMatch(JSON.stringify(cache), /Segue|Favor|Recebido|dúvida/, 'nenhum texto de trâmite no cache');
  // segunda leitura: o veredito vem do cache, sem ler os trâmites de novo
  pedidos.length = 0;
  const snap2 = await OC.collect(f, {}, null, { tramites: cache });
  assert.equal(pedidos.includes('c1'), false);
  assert.deepEqual(plano(snap2.resolvidas.map(r => r.k)), ['avisoFerias:c1']);
  // nova movimentação: o veredito antigo não vale e a solicitação volta a ser conferida
  itens.avisoFerias[0] = cli('c1', 801, recente);
  const snap3 = await OC.collect(f, {}, null, { tramites: cache });
  assert.equal(snap3.resolvidas.length, 0);
  assert.ok(snap3.items.some(i => i.k === 'avisoFerias:c1'));
  // regra desligada (0): nada sai da fila
  itens.avisoFerias[0] = cli('c1', 801);
  const snap4 = await OC.collect(f, { resolvidaClienteDias: 0 }, null, { tramites: {} });
  assert.equal(snap4.resolvidas.length, 0);
  assert.equal(snap4.items.length, 4);
});

test('resolvida que volta à fila não vira "nova solicitação"', () => {
  const it = { k: 'avisoFerias:c1', type: 'avisoFerias', num: 801, typeLabel: 'Aviso de férias', mine: true, lado: 'cli', resp: 'Ana' };
  const ev = OC.eventos({ items: [], resolvidas: [it] }, { items: [it] }, {}, AGORA);
  assert.equal(ev.length, 0);
});

test('regras do escritório podem trocar o prazo e as palavras da regra de resolvida', () => {
  const r = OC.normalizarRegras({ prazos: { resolvidaClienteDias: 5 }, pedidoAoCliente: ['Aguardamos', '', 7], cortesiaCliente: ['Abraços'] });
  assert.equal(r.config.resolvidaClienteDias, 5);
  assert.deepEqual(plano(r.pedidoAoCliente), ['aguardamos']);
  const s = OC.combinarSettings({ regras: r }, {});
  assert.deepEqual(plano(s.cortesiaCliente), ['abracos']);
  assert.equal(OC.normalizarRegras({ prazos: { resolvidaClienteDias: 99 } }), null, 'fora do limite é ignorado');
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



/* ---------- background.js (com chrome simulado) ---------- */
function carregarBackground(opcoes = {}) {
  const store = {};
  const chamadas = [];            // o que o service worker pediu ao Chrome (abas, janelas, injeção)
  const ouvintes = [];            // chrome.runtime.onMessage
  const instalado = [];           // chrome.runtime.onInstalled
  let injetado = false;
  const chrome = {
    storage: {
      local: {
        async get(k) { const ks = Array.isArray(k) ? k : [k]; const o = {}; ks.forEach(x => { if (x in store) o[x] = store[x]; }); return o; },
        async set(o) { Object.assign(store, o); },
        async remove(k) { (Array.isArray(k) ? k : [k]).forEach(x => delete store[x]); }
      },
      onChanged: { addListener() {} }
    },
    alarms: { _a: new Map(), async clear(n) { this._a.delete(n); }, create(n, o) { this._a.set(n, { name: n, scheduledTime: o.when || 0, periodInMinutes: o.periodInMinutes }); }, async getAll() { return [...this._a.values()]; }, onAlarm: { addListener() {} } },
    runtime: { onMessage: { addListener(f) { ouvintes.push(f); } }, onInstalled: { addListener(f) { instalado.push(f); } }, onStartup: { addListener() {} }, getManifest: () => ({ version: 'teste' }) },
    notifications: { onClicked: { addListener() {} }, onClosed: { addListener() {} }, create: async (id, o) => { chamadas.push(['notificacao', id, o.title]); }, clear() {} },
    permissions: { contains: async () => opcoes.permitido !== false },
    action: { onClicked: { addListener() {} }, setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setBadgeTextColor: async () => {}, setTitle: async () => {} },
    commands: { onCommand: { addListener() {} } },
    tabs: {
      query: async () => opcoes.abas || [],
      get: async id => (opcoes.abas || []).find(t => t.id === id),
      update: async (id, p) => { chamadas.push(['atualizar', id, p]); },
      create: async p => { chamadas.push(['criar', p]); return { id: 99 }; },
      sendMessage: async (id, m) => { chamadas.push(['mensagem', id, m.type]); if (opcoes.abaAntiga && !injetado) throw new Error('Receiving end does not exist'); }
    },
    windows: { update: async (id, p) => { chamadas.push(['janela', id, p]); } },
    scripting: {
      executeScript: async o => {
        if (o.func) {            // leitura dentro da aba: cada "mundo" pode ter o seu fetch
          const original = ctx.fetch, doMundo = opcoes.fetchPorMundo && opcoes.fetchPorMundo[o.world || 'ISOLATED'];
          if (doMundo) ctx.fetch = doMundo;
          try { return [{ result: await o.func(...(o.args || [])) }]; } finally { ctx.fetch = original; }
        }
        chamadas.push(['injetar', o.target.tabId, o.files[0]]); injetado = true;
      }
    }
  };
  const ctx = { console, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, chrome, FormData, Blob, atob, Headers, fetch: opcoes.fetch || (async () => { throw new Error('sem rede'); }) };
  ctx.self = ctx;
  ctx.window = ctx;
  ctx.importScripts = f => vm.runInContext(src(f), ctx);
  vm.createContext(ctx);
  vm.runInContext(src('background.js'), ctx);
  return { ctx, store, chamadas, ouvintes, chrome, instalado };
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
    versao: '2026.10.14', prazos: { conclusaoSimples: 2, conclusaoCalculo: 99, parada: 'x', tempoRealSeg: 45, primeiroTramite: 0 },
    feriados: ['2026-12-24', '24/12/2026', 'abc', '2026-12-24'], abaErrada: [{ tipo: 'avisoFerias', palavras: ['Férias', '', 'x'.repeat(80)] }, { tipo: 'geral', palavras: ['qualquer'] }, { tipo: 'inexistente', palavras: ['a'] }]
  });
  assert.deepEqual(plano(r.config), { conclusaoSimples: 2, tempoRealSeg: 45, primeiroTramite: 0 }, 'fora do limite ou não numérico é ignorado');
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


/* ================= v0.4.0: a extensão só existe no Onvio ================= */
const ONVIO_PORTAL = 'https://onvio.com.br/br-portal-do-cliente/service-requesting/general';
const aba = (id, url) => ({ id, url, windowId: 7 });

test('ícone dentro do Onvio abre/fecha o painel daquela aba e não cria nada', async () => {
  const { ctx, chamadas } = carregarBackground({ abas: [aba(5, ONVIO_PORTAL)] });
  await ctx.aoClicarNoIcone(aba(5, 'https://onvio.com.br/staff/#/documents/all'));
  assert.deepEqual(plano(chamadas), [['mensagem', 5, 'alternar']]);
});

test('ícone fora do Onvio leva a uma aba do Onvio que já está aberta (portal primeiro) e abre o painel', async () => {
  const { ctx, chamadas } = carregarBackground({ abas: [aba(3, 'https://onvio.com.br/staff/#/home'), aba(4, ONVIO_PORTAL)] });
  await ctx.aoClicarNoIcone(aba(9, 'https://exemplo.com/'));
  assert.deepEqual(plano(chamadas), [['atualizar', 4, { active: true }], ['janela', 7, { focused: true }], ['mensagem', 4, 'abrir']]);
});

test('ícone fora do Onvio sem nenhuma aba do Onvio cria uma e pede para abrir o painel ao carregar', async () => {
  const { ctx, chamadas, store } = carregarBackground({ abas: [] });
  await ctx.aoClicarNoIcone(aba(9, 'https://exemplo.com/'));
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0][0], 'criar');
  assert.equal(chamadas[0][1].url, ONVIO_PORTAL);
  assert.ok(Date.now() - store.abrirPainelAoCarregar < 5000);
});

test('ícone numa aba sem destino (nova aba em branco, chrome://) também leva ao Onvio', async () => {
  for (const url of [undefined, '', 'chrome://newtab/', 'about:blank', 'https://onvio.com.br.falso.com/', 'https://exemplo.com/onvio.com.br']) {
    const { ctx, chamadas } = carregarBackground({ abas: [] });
    await ctx.aoClicarNoIcone({ id: 1, url });
    assert.equal(chamadas[0][0], 'criar', 'não é Onvio: ' + url);
  }
});

test('aba do Onvio aberta antes da instalação: injeta o script do painel e tenta de novo', async () => {
  const { ctx, chamadas } = carregarBackground({ abaAntiga: true });
  await ctx.aoClicarNoIcone(aba(5, ONVIO_PORTAL));
  assert.deepEqual(plano(chamadas), [['mensagem', 5, 'alternar'], ['injetar', 5, 'shell.js'], ['mensagem', 5, 'alternar']]);
});

test('abrir uma solicitação a partir do painel navega a MESMA aba (o painel continua aberto)', async () => {
  const { ctx, chamadas, store } = carregarBackground({ abas: [aba(3, ONVIO_PORTAL), aba(8, 'https://onvio.com.br/staff/#/home')] });
  await ctx.abrir({ type: 'calcFerias', num: 101 }, 8);
  assert.equal(chamadas[0][0], 'atualizar');
  assert.equal(chamadas[0][1], 8);
  assert.match(chamadas[0][2].url, /service-requesting\/vacation\/calculation$/);
  assert.equal(store.abrir.num, '101');
  // sem aba preferida, usa uma aba do portal; sem nenhuma, cria uma e pede o painel aberto
  const b = carregarBackground({ abas: [] });
  await b.ctx.abrir({ type: 'geral', num: 5 });
  assert.equal(b.chamadas[0][0], 'criar');
  assert.ok(b.store.abrirPainelAoCarregar);
});

test('o botão de fechar do painel (iframe) manda a aba fechar o painel', async () => {
  const { ouvintes, chamadas } = carregarBackground();
  const resp = [];
  ouvintes[0]({ cmd: 'fecharPainel' }, { tab: { id: 12 } }, r => resp.push(r));
  await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(plano(chamadas), [['mensagem', 12, 'fechar']]);
  assert.deepEqual(plano(resp), [{ ok: true }]);
});

test('manifesto: painel só no Onvio, sem painel lateral do Chrome, ícone sem popup e atalho definido', () => {
  const m = JSON.parse(src('manifest.json'));
  assert.ok(!m.permissions.includes('sidePanel') && !m.side_panel);
  assert.equal(m.action.default_popup, undefined, 'sem popup: o clique no ícone chega ao service worker');
  assert.equal(m.commands['alternar-painel'].suggested_key.default, 'Alt+Shift+O');
  const painelPages = m.content_scripts.filter(c => c.js.includes('shell.js'));
  assert.equal(painelPages.length, 1);
  assert.deepEqual(painelPages[0].matches.sort(), ['https://onvio.com.br/br-portal-do-cliente/*', 'https://onvio.com.br/staff/*']);
  for (const c of m.content_scripts) for (const u of c.matches) assert.ok(u.startsWith('https://onvio.com.br/'), 'nenhum script fora do Onvio: ' + u);
  const war = m.web_accessible_resources.flatMap(w => w.resources);
  for (const f of ['app/app.html', 'logo.svg']) assert.ok(war.includes(f), f + ' precisa ser acessível pela página');
  for (const w of m.web_accessible_resources) assert.deepEqual(w.matches, ['https://onvio.com.br/*']);
  // tudo que o manifesto cita existe
  for (const f of m.content_scripts.flatMap(c => c.js).concat(war, ['background.js', 'options.html'])) assert.ok(fs.existsSync(path.join(EXT, f)), 'falta ' + f);
});


/* ================= v0.5.0: leitura robusta e em tempo real ================= */
const respHttp = (status, ct, corpo) => ({ status, headers: { get: () => ct }, text: async () => corpo });

function apiSimulada(estado) {
  const chamadas = { listas: 0, leves: 0, topicos: 0, urls: [] };
  const fn = async url => {
    const u = new URL(url);
    chamadas.urls.push(u.pathname);
    if (estado.status) return respHttp(estado.status, estado.ct || 'application/json', estado.corpo || '{}');
    const json = obj => respHttp(200, 'application/json; charset=utf-8', JSON.stringify(obj));
    if (u.pathname.endsWith('/topics')) { chamadas.topicos++; return json({ items: [] }); }
    const t = OC.TYPES.find(x => u.pathname.endsWith('/' + x.path.split('/').pop()));
    if (!t) return json({});
    const por = Number(u.searchParams.get('itemsPerPage'));
    if (por === 1) chamadas.leves++; else chamadas.listas++;
    const todos = (estado.itens && estado.itens[t.key]) || [];
    const itens = u.searchParams.get('assignedtome') === 'true' ? todos.filter(i => i.staffResponsibleExpanded && i.staffResponsibleExpanded.name === 'Ana') : todos;
    return json({ items: itens.slice(0, por), totalItems: itens.length, totalPages: 1 });
  };
  fn.chamadas = chamadas;
  return fn;
}
const pend = (id, num, extra) => Object.assign({ id, identifier: num, genericStatus: 1, created: new Date(Date.now() - 864e5).toISOString().slice(0, 19), lastUpdated: new Date(Date.now() - 864e5).toISOString().slice(0, 19), subject: 'x', clientExpanded: { name: 'ACME' }, staffResponsibleExpanded: { name: 'Ana' } }, extra || {});

test('leitura: valida a sessão com a lista de verdade (e não com um endereço de sessão), pela página do Onvio', async () => {
  const api = apiSimulada({ itens: {} });
  const { ctx, store } = carregarBackground({ abas: [aba(5, ONVIO_PORTAL)], fetchPorMundo: { MAIN: api, ISOLATED: async () => respHttp(401, 'application/json', '{}') }, fetch: async () => respHttp(401, 'text/html', '') });
  const r = await ctx.escolherFetcher();
  assert.equal(r.via, 'pagina');
  assert.equal(store.metodoLeitura, 'pagina');
  assert.match(api.chamadas.urls[0], /tickets\/generic$/, 'a sessão vale pela lista de verdade');
  assert.ok(api.chamadas.urls.indexOf('/api/security/v1/session-and-bindings') > 0, 'o perfil (escritório x cliente) só é conferido depois');
  assert.equal(store.perfilSessao.perfil, 'escritorio');
});

test('leitura: se a página não serve, tenta a extensão na aba; lembra o que funcionou e começa por ele', async () => {
  const api = apiSimulada({ itens: {} });
  const { ctx, store } = carregarBackground({ abas: [aba(5, ONVIO_PORTAL)], fetchPorMundo: { MAIN: async () => respHttp(401, 'application/json', '{}'), ISOLATED: api }, fetch: async () => respHttp(403, 'text/html', '') });
  assert.equal((await ctx.escolherFetcher()).via, 'extensao');
  assert.equal(store.metodoLeitura, 'extensao');
  const antes = api.chamadas.urls.length;
  assert.equal((await ctx.escolherFetcher()).via, 'extensao');
  assert.equal(api.chamadas.urls.length - antes, 1, 'na segunda vez vai direto ao que funcionou');
});

test('leitura: sem sessão em todos os jeitos, a mensagem diz o que cada um recebeu', async () => {
  const { ctx } = carregarBackground({ abas: [aba(5, ONVIO_PORTAL)], fetchPorMundo: { MAIN: async () => respHttp(401, 'application/json', '{}'), ISOLATED: async () => respHttp(403, 'application/json', '{}') }, fetch: async () => respHttp(200, 'text/html; charset=utf-8', '<html>login</html>') });
  await assert.rejects(ctx.escolherFetcher(), e => e.auth === true &&
    /página do Onvio: HTTP 401 · extensão na aba: HTTP 403 · direto: o Onvio devolveu uma página \(text\/html\) em vez de dados/.test(e.message));
});

test('leitura: erro do servidor em todos os jeitos não vira "sem sessão"; sem aba aberta pede para abrir o Onvio', async () => {
  const quebrado = async () => respHttp(500, 'text/html', 'erro');
  const a = carregarBackground({ abas: [aba(5, ONVIO_PORTAL)], fetchPorMundo: { MAIN: quebrado, ISOLATED: quebrado }, fetch: quebrado });
  await assert.rejects(a.ctx.escolherFetcher(), e => !e.auth && /HTTP 500/.test(e.message));
  const b = carregarBackground({ abas: [], fetch: async () => respHttp(401, 'application/json', '{}') });
  await assert.rejects(b.ctx.escolherFetcher(), e => e.auth === true && /Não há aba do Onvio aberta/.test(e.message));
});

/* ---------- só a visão do escritório ---------- */
test('perfil da sessão: campos de tipo/papel dizem se é cliente ou escritório; nome e e-mail não contam', () => {
  assert.equal(OC.perfilDaSessao({ UdsSession: { FirstName: 'Cliente', UserType: 'ClientUser' } }), 'cliente');
  assert.equal(OC.perfilDaSessao({ UdsSession: { UserType: 'Staff' } }), 'escritorio');
  assert.equal(OC.perfilDaSessao({ UdsSession: { IsClientUser: true } }), 'cliente');
  assert.equal(OC.perfilDaSessao({ Bindings: [{ Product: 'ClientCenter' }] }), 'cliente');
  assert.equal(OC.perfilDaSessao({ Bindings: [{ Product: 'Staff' }, { Product: 'ClientCenter' }] }), null, 'sinais dos dois lados: não decide');
  assert.equal(OC.perfilDaSessao({ UdsSession: { FirstName: 'Ana', LastName: 'Cliente', EmailAddress: 'cliente@acme.com' } }), null);
  assert.equal(OC.perfilDaSessao(null), null);
  // formato real do Onvio (15/10/2026): a permissão de plataforma do escritório
  const real = v => ({ UdsSession: { FirstName: 'Ana' }, UdsSessionBindings: { FeatureResourcePermissions: { FeatureResourcePermissionsMap: { Platform: { OnvioStaffAccess: v } } } } });
  assert.equal(OC.perfilDaSessao(real('Allow')), 'escritorio');
  assert.equal(OC.perfilDaSessao(real('')), null, 'vazio não conta');
  assert.equal(OC.perfilDaSessao(real('Deny')), null, 'negativo não conta');
  const f = OC.formatoSessao({ UdsSession: { FirstName: 'Ana', EmailAddress: 'a@b.c', UserType: 'Staff', Ativo: true } });
  assert.deepEqual(plano(f), ['UdsSession:objeto', 'UdsSession.FirstName:string', 'UdsSession.EmailAddress:string', 'UdsSession.UserType:string=Staff', 'UdsSession.Ativo:boolean=true'], 'sem nomes nem e-mails');
});

test('perfil do acesso: sessão, aba da visão do cliente e um acesso que só o escritório tem', async () => {
  const erroAuth = () => Object.assign(new Error('HTTP 403'), { auth: true });
  const f = (sessao, escritorio) => async url => {
    if (/session-and-bindings/.test(url)) { if (sessao instanceof Error) throw sessao; return sessao; }
    if (url === OC.URL_SO_ESCRITORIO()) { if (escritorio instanceof Error) throw escritorio; return escritorio; }
    return { items: [] };
  };
  const ana = { UdsSession: { FirstName: 'Ana' } };
  assert.equal((await OC.perfilDoAcesso(f(ana, []))).perfil, 'escritorio');
  assert.equal((await OC.perfilDoAcesso(f(ana, erroAuth()))).perfil, 'cliente', 'recusado com sessão válida');
  assert.equal((await OC.perfilDoAcesso(f(ana, new Error('HTTP 404')))).perfil, null, 'endereço mudou: não bloqueia, fica "não confirmado"');
  assert.equal((await OC.perfilDoAcesso(f(new Error('x'), erroAuth()))).perfil, null, 'sem sessão não conclui nada');
  assert.equal((await OC.perfilDoAcesso(f(ana, []), { abaCliente: true })).perfil, 'cliente');
  assert.equal((await OC.perfilDoAcesso(f({ UdsSession: { UserType: 'Staff' } }, []), { abaCliente: true })).perfil, 'escritorio', 'a sessão manda');
  const r = await OC.perfilDoAcesso(f({ UdsSession: { UserType: 'Client' } }, []));
  assert.deepEqual([r.perfil, r.motivo], ['cliente', 'sessão do Onvio']);
});

test('acesso de cliente: a extensão não lê, apaga o que tinha e responde às telas com "cliente"', async () => {
  const api = apiSimulada({ itens: { geral: [pend('g1', 1)] } });
  const cliente = async url => /company-department-access/.test(url) ? respHttp(403, 'application/json', '{}')
    : /session-and-bindings/.test(url) ? respHttp(200, 'application/json', JSON.stringify({ UdsSession: { FirstName: 'Cli' } })) : api(url);
  const { ctx, store, ouvintes } = carregarBackground({ abas: [aba(5, ONVIO_PORTAL)], fetchPorMundo: { MAIN: cliente, ISOLATED: cliente }, fetch: cliente });
  Object.assign(store, { snapshot: { items: [{ k: 'x' }] }, eventos: [{ id: 'e' }], serie: { a: 1 }, tramites: { x: 1 }, lembretes: [{ id: 'l1' }] });
  await ctx.coletar(false);
  assert.equal(store.status.estado, 'visao_cliente');
  assert.match(store.status.msg, /acesso de cliente/);
  assert.deepEqual([store.snapshot, store.eventos, store.serie, store.tramites], [undefined, undefined, undefined, undefined], 'nada do que foi lido fica');
  assert.equal(store.lembretes.length, 1, 'lembretes pessoais ficam');
  assert.equal(api.chamadas.listas, 0, 'nenhuma lista completa foi lida');
  const r = await new Promise(res => ouvintes[0]({ cmd: 'consultar', type: 'geral', page: 1 }, {}, res));
  assert.deepEqual([r.ok, r.cliente], [false, true]);
  // aba da visão do cliente aberta também bloqueia
  const b = carregarBackground({ abas: [aba(7, 'https://onvio.com.br/clientcenter/pt/home')], fetchPorMundo: { MAIN: api, ISOLATED: api }, fetch: api });
  await b.ctx.coletar(false);
  assert.equal(b.store.status.estado, 'visao_cliente');
  assert.match(b.store.perfilSessao.motivo, /clientcenter/);
  // login do escritório: volta ao normal
  const c = carregarBackground({ abas: [aba(5, ONVIO_PORTAL)], fetchPorMundo: { MAIN: api, ISOLATED: api }, fetch: api });
  c.store.status = { estado: 'visao_cliente' };
  await c.ctx.coletar(true);
  assert.equal(c.store.status.estado, 'ok');
  assert.equal(c.store.snapshot.items.length, 1);
});

test('testarLeitura mostra o que cada jeito recebeu, sem dados de clientes', async () => {
  const api = apiSimulada({ itens: { geral: [pend('g1', 1)] } });
  const { ctx } = carregarBackground({ abas: [aba(5, ONVIO_PORTAL)], fetchPorMundo: { MAIN: api, ISOLATED: async () => respHttp(401, 'application/json', '{}') }, fetch: async () => respHttp(200, 'text/html', '<html>') });
  const linhas = await ctx.testarLeitura();
  const texto = linhas.join('\n');
  assert.match(texto, /Aba do Onvio: sim/);
  assert.match(texto, /página do Onvio: HTTP 200 · application\/json · campos: items, totalItems, totalPages · total 1/);
  assert.match(texto, /extensão na aba: HTTP 401/);
  assert.match(texto, /direto: HTTP 200 · text\/html/);
  assert.doesNotMatch(texto, /ACME/);
});

test('ao vivo: sem mudança só faz a checagem leve; com mudança lê tudo; passado o intervalo lê tudo', async () => {
  const estado = { itens: { geral: [pend('g1', 1)] } };
  const api = apiSimulada(estado);
  const { ctx, store } = carregarBackground({ abas: [aba(5, ONVIO_PORTAL)], fetchPorMundo: { MAIN: api, ISOLATED: api }, fetch: api });
  const velha = () => { store.ultimaVerificacao = new Date(Date.now() - 60000).toISOString(); };   // fora da janela de 10 s

  let r = await ctx.verificarAoVivo(false);                       // primeira vez: sem leitura anterior
  assert.equal(r.proximoEmSeg, 30);
  assert.equal(store.snapshot.items.length, 1);
  assert.ok(store.assinaturas.geral);
  const cheias = () => api.chamadas.listas;
  const base = cheias();

  velha(); await ctx.verificarAoVivo(false);                      // nada mudou
  assert.equal(cheias(), base, 'não leu tudo de novo');
  assert.ok(Date.now() - new Date(store.ultimaVerificacao) < 5000, 'mas registrou que verificou');

  estado.itens.geral.push(pend('g2', 2, { lastUpdated: new Date().toISOString().slice(0, 19) }));   // chegou uma solicitação
  velha(); await ctx.verificarAoVivo(false);
  assert.ok(cheias() > base, 'mudou: leu tudo');
  assert.equal(store.snapshot.items.length, 2);

  const base2 = cheias();
  velha(); await ctx.verificarAoVivo(false);
  assert.equal(cheias(), base2, 'estável de novo');

  store.snapshot.fetchedAt = new Date(Date.now() - 6 * 60000).toISOString();   // leitura completa com mais de 5 min
  velha(); await ctx.verificarAoVivo(false);
  assert.ok(cheias() > base2, 'passou o intervalo: lê tudo mesmo sem mudança');
});

test('ao vivo: mudança de situação na mesma solicitação também é percebida', async () => {
  const estado = { itens: { calcFerias: [pend('v1', 7)] } };
  const api = apiSimulada(estado);
  const { ctx, store } = carregarBackground({ abas: [aba(5, ONVIO_PORTAL)], fetchPorMundo: { MAIN: api }, fetch: api });
  await ctx.verificarAoVivo(false);
  assert.equal(store.snapshot.items[0].status, 'Sem análise');
  estado.itens.calcFerias[0] = pend('v1', 7, { genericStatus: 2, lastUpdated: new Date().toISOString().slice(0, 19) });
  store.ultimaVerificacao = new Date(Date.now() - 60000).toISOString();
  await ctx.verificarAoVivo(false);
  assert.equal(store.snapshot.items[0].status, 'Em análise');
});

test('ao vivo: não verifica de novo dentro de 10 s (várias abas), mas "forçar" lê na hora', async () => {
  const estado = { itens: { geral: [pend('g1', 1)] } };
  const api = apiSimulada(estado);
  const { ctx, store } = carregarBackground({ abas: [aba(5, ONVIO_PORTAL)], fetchPorMundo: { MAIN: api }, fetch: api });
  await ctx.verificarAoVivo(false);
  const n = api.chamadas.urls.length;
  await ctx.verificarAoVivo(false);
  assert.equal(api.chamadas.urls.length, n, 'segunda aba logo em seguida não repete');
  estado.itens.geral.push(pend('g2', 2));
  await ctx.verificarAoVivo(true);                                 // ação do usuário no Onvio
  assert.equal(store.snapshot.items.length, 2);
});

test('ao vivo: com o tempo real desligado (0) as checagens param, mas a ação do usuário ainda atualiza', async () => {
  const api = apiSimulada({ itens: { geral: [pend('g1', 1)] } });
  const { ctx, store } = carregarBackground({ abas: [aba(5, ONVIO_PORTAL)], fetchPorMundo: { MAIN: api }, fetch: api });
  store.settings = { __v: 2, tempoRealSeg: 0 };
  const r = await ctx.verificarAoVivo(false);
  assert.equal(r.proximoEmSeg, 60);
  assert.equal(api.chamadas.urls.length, 0);
  await ctx.verificarAoVivo(true);
  assert.equal(store.snapshot.items.length, 1);
});

test('ao vivo: o intervalo mínimo de 15 s vale mesmo se a regra pedir menos', async () => {
  const api = apiSimulada({ itens: {} });
  const { ctx, store } = carregarBackground({ abas: [aba(5, ONVIO_PORTAL)], fetchPorMundo: { MAIN: api }, fetch: api });
  store.settings = { __v: 2, tempoRealSeg: 5 };
  assert.equal((await ctx.verificarAoVivo(false)).proximoEmSeg, 15);
});

test('o pedido de verificação chega pelo canal do painel (tick) e responde o próximo horário', async () => {
  const api = apiSimulada({ itens: {} });
  const { ouvintes } = carregarBackground({ abas: [aba(5, ONVIO_PORTAL)], fetchPorMundo: { MAIN: api }, fetch: api });
  const resp = await new Promise(res => ouvintes[0]({ cmd: 'tick', forcar: false }, { tab: { id: 5 } }, res));
  assert.deepEqual(plano(resp), { ok: true, proximoEmSeg: 30 });
});

test('assinaturas: só diferem quando o total ou a última movimentação mudam; lista que falhou não conta', () => {
  const a = { geral: '3|a|2026-10-01|1', rubricas: '9|r|2026-10-02|4' };
  assert.equal(OC.assinaturasDiferem(a, Object.assign({}, a)), false);
  assert.equal(OC.assinaturasDiferem(a, { geral: '4|b|2026-10-03|1', rubricas: a.rubricas }), true);
  assert.equal(OC.assinaturasDiferem(a, { geral: '3|a|2026-10-01|2', rubricas: a.rubricas }), true, 'mudou a situação');
  assert.equal(OC.assinaturasDiferem(a, { geral: null, rubricas: a.rubricas }), false, 'lista que não respondeu');
  assert.equal(OC.assinaturasDiferem(null, a), true);
});

/* ================= v0.7.0: app em tela cheia (dados de dashboards, alertas, lembretes, consultas) ================= */
const itemT = (k, extra) => Object.assign({ k, type: 'geral', typeLabel: 'Geral', num: k.split(':')[1], status: 'Sem análise', lado: 'esc', nivel: 0, parado: 1, apelido: 'ACME', cliente: 'ACME LTDA', mine: true, resp: 'Ana' }, extra || {});

test('porCliente: soma por empresa, média de dias com o cliente e ordena pelo que está pior', () => {
  const r = OC.porCliente([
    itemT('geral:1', { lado: 'cli', parado: 10 }), itemT('geral:2', { lado: 'cli', parado: 20, prescreveEm: 3, nivel: 2 }), itemT('geral:3', { abaProvavel: { label: 'x' } }),
    itemT('geral:4', { cliente: 'BETA SA', apelido: 'BETA' })
  ]);
  const acme = r.find(c => c.cliente === 'ACME LTDA');
  assert.deepEqual([acme.total, acme.esc, acme.cli, acme.atraso, acme.prescreve, acme.abaErrada, acme.diasCliMedia], [3, 1, 2, 1, 1, 1, 15]);
  assert.equal(r[0].cliente, 'ACME LTDA', 'quem tem atraso vem primeiro');
  assert.equal(r.find(c => c.cliente === 'BETA SA').diasCliMedia, null);
});

test('série do dia: entradas e saídas por diferença entre leituras, pendentes por hora, guarda 60 dias', () => {
  const agora = new Date('2026-10-14T10:20:00');
  const a = { items: [itemT('geral:1'), itemT('geral:2')] }, b = { items: [itemT('geral:2'), itemT('geral:3'), itemT('geral:4')] };
  let s = OC.atualizarSerie({}, null, a, agora);
  assert.deepEqual(plano(s['2026-10-14']), { entradas: 0, saidas: 0, horas: { 10: 2 } }, 'primeira leitura: só registra o total');
  s = OC.atualizarSerie(s, a, b, new Date('2026-10-14T11:05:00'));
  assert.deepEqual(plano(s['2026-10-14']), { entradas: 2, saidas: 1, horas: { 10: 2, 11: 3 } });
  const velha = {}; for (let d = 1; d <= 70; d++) velha['2026-07-' + String(d).padStart(2, '0')] = { entradas: 0, saidas: 0, horas: {} };
  assert.equal(Object.keys(OC.atualizarSerie(velha, a, b, agora)).length, 60);
});

test('eventos: nova para mim, sem responsável, cliente respondeu, prescreve e ficou fora do prazo; só campos mínimos', () => {
  const antes = { items: [itemT('geral:1', { lado: 'cli' }), itemT('geral:2', { lado: 'cli', prescreveEm: 9 }), itemT('geral:3', { nivel: 1 })] };
  const depois = { items: [itemT('geral:1', { lado: 'esc' }), itemT('geral:2', { lado: 'cli', prescreveEm: 4 }), itemT('geral:3', { nivel: 2 }), itemT('geral:9'), itemT('geral:8', { mine: false, resp: '' }), itemT('geral:7', { mine: false, resp: 'Bia' })] };
  const ev = OC.eventos(antes, depois, {}, new Date('2026-10-14T10:00:00'));
  assert.deepEqual(plano(ev.map(e => e.tipo + ':' + e.num).sort()), ['atrasou:3', 'nova:9', 'prescreve:2', 'respondeu:1', 'semresp:8'].sort());
  assert.deepEqual(plano(Object.keys(ev[0]).sort()), ['cliente', 'em', 'id', 'k', 'mine', 'num', 'tipo', 'titulo', 'type', 'typeLabel']);
  assert.deepEqual(plano(OC.eventos(null, depois, {})), [], 'primeira leitura vira base');
});

test('lembretes: criar valida texto e data; adiar 1 h ou amanhã 9h (pulando fim de semana); situação', () => {
  const agora = new Date('2026-10-16T15:00:00');                                      // sexta
  const l = OC.novoLembrete({ texto: '  cobrar documento  ', quando: '2026-10-16T17:00:00', type: 'geral', num: 12, cliente: 'ACME' }, agora);
  assert.equal(l.texto, 'cobrar documento'); assert.equal(l.num, '12'); assert.equal(l.feito, false);
  assert.throws(() => OC.novoLembrete({ texto: '', quando: '2026-10-16T17:00:00' }, agora), /escreva/);
  assert.throws(() => OC.novoLembrete({ texto: 'x', quando: 'amanhã' }, agora), /data inválida/);
  assert.equal(new Date(OC.adiarLembrete(l, '1h', agora).quando).getHours(), 16);
  const seg = new Date(OC.adiarLembrete(l, 'amanha', agora).quando);
  assert.deepEqual([seg.getDay(), seg.getHours()], [1, 9], 'sexta → segunda às 9h');
  assert.equal(OC.situacaoLembrete(l, agora), 'hoje');
  assert.equal(OC.situacaoLembrete(l, new Date('2026-10-16T18:00:00')), 'atrasado');
  assert.equal(OC.situacaoLembrete(Object.assign({}, l, { quando: '2026-10-20T09:00:00' }), agora), 'proximo');
  assert.equal(OC.situacaoLembrete(Object.assign({}, l, { feito: true }), agora), 'feito');
});

test('lembretes que repetem: feito pula para a próxima vez que ainda não passou; sem repetição conclui', () => {
  const agora = new Date('2026-10-16T15:00:00');                                      // sexta
  const base = OC.novoLembrete({ texto: 'conferir folha', quando: '2026-10-16T09:00:00', rep: 'util' }, agora);
  assert.equal(base.rep, 'util');
  assert.equal(OC.novoLembrete({ texto: 'x', quando: '2026-10-16T09:00:00', rep: 'qualquer' }, agora).rep, 'nao', 'repetição desconhecida vira "não repete"');
  const q = l => { const d = new Date(l.quando); return OC.ymd(d) + ' ' + d.getHours(); };
  assert.equal(q(OC.concluirLembrete(base, agora)), '2026-10-19 9', 'dia útil: sexta → segunda');
  assert.equal(q(OC.concluirLembrete(base, agora, ['2026-10-19'])), '2026-10-20 9', 'pula feriado');
  assert.equal(q(OC.concluirLembrete(Object.assign({}, base, { rep: 'diaria' }), agora)), '2026-10-17 9');
  assert.equal(q(OC.concluirLembrete(Object.assign({}, base, { rep: 'semanal' }), agora)), '2026-10-23 9');
  assert.equal(q(OC.concluirLembrete(Object.assign({}, base, { rep: 'mensal', quando: '2026-01-31T09:00:00' }), agora)), '2026-10-31 9', 'mensal no dia 31 alcança o presente sem perder o dia 31');
  assert.equal(q(OC.concluirLembrete(Object.assign({}, base, { rep: 'mensal', quando: '2026-10-31T09:00:00' }), new Date('2026-11-01'))), '2026-11-30 9', 'em mês de 30 dias cai no último dia');
  const r = OC.concluirLembrete(Object.assign({}, base, { disparado: true }), agora);
  assert.deepEqual([r.feito, r.disparado], [false, false], 'volta a avisar na próxima vez');
  assert.equal(OC.concluirLembrete(Object.assign({}, base, { rep: 'nao' }), agora).feito, true);
  assert.equal(OC.concluirLembrete({ id: 'antigo', texto: 'sem rep', quando: '2026-10-16T09:00:00' }, agora).feito, true, 'lembrete de versão anterior');
});

test('Hoje: motivo de cada pendência e lista única de prioridades na ordem certa', () => {
  const it = [
    { k: 'emdia-esc', lado: 'esc', nivel: 0, parado: 3, status: 'Em análise' },
    { k: 'resp', lado: 'esc', nivel: 0, parado: 1, status: 'Aguardando resposta' },
    { k: 'hoje', lado: 'esc', nivel: 1, parado: 2, status: 'Em análise' },
    { k: 'presc-4', lado: 'cli', nivel: 2, prescreveEm: 4, parado: 26, status: 'Respondido' },
    { k: 'presc-1', lado: 'cli', nivel: 2, prescreveEm: 1, parado: 29, status: 'Respondido' },
    { k: 'atraso-g2', lado: 'esc', nivel: 2, grav: 2, parado: 20, status: 'Em análise' },
    { k: 'atraso-g3', lado: 'esc', nivel: 2, grav: 3, parado: 5, status: 'Aguardando resposta' },
    { k: 'emdia-cli', lado: 'cli', nivel: 0, parado: 2, status: 'Respondido' }
  ];
  assert.deepEqual(plano(OC.prioridades(it).map(p => p.item.k + ':' + p.motivo)), [
    'atraso-g3:atraso', 'atraso-g2:atraso', 'presc-1:prescreve', 'presc-4:prescreve', 'hoje:hoje', 'resp:respondeu', 'emdia-esc:emdia'
  ], 'fora do prazo vence "cliente respondeu" no mesmo item; em dia na vez do cliente não entra');
  assert.deepEqual(plano(OC.contarMotivos(it)), { atraso: 2, prescreve: 2, hoje: 1, respondeu: 1, emdia: 2 }, 'o anel conta todas, inclusive as em dia do cliente');
  assert.equal(Object.values(OC.contarMotivos(it)).reduce((a, b) => a + b, 0), it.length);
  assert.equal(OC.motivoDe({ lado: 'cli', nivel: 1 }), 'hoje', 'cliente sem retorno (atenção) entra como "vence hoje / atenção"');
  assert.deepEqual(plano(OC.MOTIVOS.map(m => m.k)), ['atraso', 'prescreve', 'hoje', 'respondeu', 'emdia']);
});

test('painel do Hoje: tendência (nova, piorou, melhorou) e a marca dura 2 horas', () => {
  const t0 = new Date('2026-10-14T10:00:00');
  const ant = { items: [{ k: 'a', nivel: 0, grav: 0 }, { k: 'b', nivel: 2, grav: 2 }, { k: 'c', nivel: 1, grav: 1 }] };
  const snap = { items: [{ k: 'a', nivel: 1, grav: 1 }, { k: 'b', nivel: 1, grav: 1 }, { k: 'c', nivel: 1, grav: 1 }, { k: 'd', nivel: 0 }] };
  OC.tendencias(ant, snap, t0);
  assert.deepEqual(snap.items.map(i => i.tend), ['piorou', 'melhorou', undefined, 'nova']);
  const depois = { items: snap.items.map(i => ({ k: i.k, nivel: i.nivel, grav: i.grav })) };
  OC.tendencias(snap, depois, new Date('2026-10-14T11:00:00'));
  assert.equal(depois.items[0].tend, 'piorou', 'continua por 2 h');
  const mais = { items: depois.items.map(i => ({ k: i.k, nivel: i.nivel, grav: i.grav })) };
  OC.tendencias(depois, mais, new Date('2026-10-14T12:30:00'));
  assert.equal(mais.items[0].tend, undefined, 'depois de 2 h some');
  const primeira = { items: [{ k: 'x' }] };
  OC.tendencias(null, primeira, t0);
  assert.equal(primeira.items[0].tend, undefined, 'primeira leitura não tem seta');
});

test('painel do Hoje: mapa de calor por idade com "sem responsável" primeiro', () => {
  const it = [
    { resp: 'Ana', parado: 1, grav: 3, nivel: 2 }, { resp: 'Ana', parado: 20 }, { resp: '', parado: 40 },
    { resp: 'Bia', parado: 4 }, { resp: 'Bia', parado: 6 }, { resp: 'Bia', parado: 15 }
  ];
  const m = OC.mapaIdade(it);
  assert.deepEqual(plano(m.linhas.map(l => l.resp)), ['(sem responsável)', 'Ana', 'Bia']);
  assert.deepEqual(plano(m.linhas.map(l => l.por)), [[0, 0, 0, 0, 1], [1, 0, 0, 1, 0], [0, 1, 2, 0, 0]]);
  assert.deepEqual(plano(m.totais), [1, 1, 2, 1, 1]);
  assert.equal(OC.faixaDe(2), 0); assert.equal(OC.faixaDe(3), 1); assert.equal(OC.faixaDe(31), 4); assert.equal(OC.faixaDe(undefined), 0);
});

test('painel do Hoje: sugestão de distribuição equilibra a carga e não manda tudo para a mesma pessoa', () => {
  const it = [
    { k: 'a1', resp: 'Ana', lado: 'esc', grav: 3 }, { k: 'a2', resp: 'Ana', lado: 'esc', grav: 0 },
    { k: 'b1', resp: 'Bia', lado: 'esc', grav: 0 }, { k: 'b2', resp: 'Bia', lado: 'cli', grav: 0 },
    { k: 's1', resp: '', nivel: 2, grav: 3, parado: 9 }, { k: 's2', resp: '', nivel: 0, parado: 1 }, { k: 's3', resp: '', nivel: 1, grav: 1 }
  ];
  const r = OC.sugerirDistribuicao(it);
  assert.deepEqual(plano(r.map(x => x.k)), ['s1', 's3', 's2'], 'mais grave primeiro');
  assert.deepEqual(plano(r.map(x => x.sugerido)), ['Bia', 'Ana', 'Bia'], 'Bia (1) recebe a G3, passa a 5; Ana (5) empata e vence pelo nome; depois Bia');
  assert.equal(r[0].carga, 1, 'carga só conta a vez do escritório');
  assert.deepEqual(plano(OC.sugerirDistribuicao([{ k: 's', resp: '' }])), [], 'sem ninguém da equipe, sem sugestão');
});

test('painel do Hoje: placar do dia com saldo e comparação com o fim de ontem', () => {
  const now = new Date('2026-10-14T15:00:00');
  const serie = { '2026-10-13': { entradas: 2, saidas: 1, horas: { '09': 7, '17': 9 } }, '2026-10-14': { entradas: 5, saidas: 2, horas: { '10': 10 } } };
  assert.deepEqual(plano(OC.placarDoDia(serie, new Array(12).fill({}), now)), { entradas: 5, saidas: 2, saldo: 3, fila: 12, filaOntem: 9, variacao: 3 });
  assert.deepEqual(plano(OC.placarDoDia({}, [], now)), { entradas: 0, saidas: 0, saldo: 0, fila: 0, filaOntem: null, variacao: null });
});

test('consulta sob demanda: pendentes, todas, busca e uma solicitação pelo número', () => {
  const f = u => JSON.parse(new URL(u).searchParams.get('filter') || '{"groups":[{"items":[]}]}').groups[0].items.map(i => i.by + ' ' + i.op + ' ' + i.value);
  const g = OC.TYPE_BY_KEY.geral, r = OC.TYPE_BY_KEY.rubricas;
  assert.deepEqual(f(OC.urlConsulta(g, { filtro: 'pendentes' })), ['firmStatus IN 1,2,3,4,7,8,9']);
  assert.deepEqual(f(OC.urlConsulta(r, { filtro: 'pendentes' })), ['firmStatus IN 0,1,2,3,4,5,6,7,9,11,12']);
  assert.deepEqual(f(OC.urlConsulta(g, { filtro: 'todas' })), []);
  assert.deepEqual(f(OC.urlConsulta(g, { numero: 1372 })), ['identifier EQ 1372']);
  const u = new URL(OC.urlConsulta(g, { page: 3, per: 50, search: 'acme' }));
  assert.deepEqual([u.searchParams.get('pageIndex'), u.searchParams.get('startIndex'), u.searchParams.get('searchText'), u.searchParams.get('itemsPerPage')], ['3', '100', 'acme', '50']);
  assert.equal(new URL(OC.urlConsulta(g, { per: 9999 })).searchParams.get('itemsPerPage'), '200', 'limite de 200 por página');
});

test('detalhe e trâmites: campos para a tela, trâmites em ordem, situação pelo dicionário do tipo', () => {
  const t = OC.TYPE_BY_KEY.calcFerias;
  const d = OC.detalheDe(t, { id: 'x', identifier: 7, genericStatus: 4, subject: 'Férias', description: '<p>texto</p>', requestWay: 'WEB', clientExpanded: { name: 'ACME' }, clientEmployeeExpanded: { name: 'João' } });
  assert.deepEqual([d.num, d.status, d.lado, d.assunto, d.meio, d.detalhe], [7, 'Respondido', 'cli', 'Férias', 'WEB', 'João']);
  const tr = OC.tramitesDe(t, { items: [{ created: '2026-10-02T10:00:00', status: 4, description: 'b', createdByContactExpanded: { name: 'Ana' }, attachmentsExpanded: [{ name: 'recibo.pdf' }] }, { created: '2026-10-01T10:00:00', status: 1, description: 'a' }, { status: 2 }] });
  assert.deepEqual(tr.map(x => [x.n, x.situacao, x.autor, x.texto, x.anexos.join()]), [[1, 'Sem análise', '', 'a', ''], [2, 'Respondido', 'Ana', 'b', 'recibo.pdf']]);
});

test('trâmites: lado pela situação (abertura e as do cliente), id do trâmite e anexos com id; apagados ficam fora', () => {
  const t = OC.TYPE_BY_KEY.avisoFerias;
  const tr = OC.tramitesDe(t, { items: [
    { id: 't1', created: '2026-10-01T10:00:00', status: 1, description: 'a', attachmentsExpanded: [{ id: 'a1', name: 'ponto.xlsx' }] },
    { id: 't2', created: '2026-10-02T10:00:00', status: 4, description: 'b', attachmentsExpanded: [{ id: 'a2', name: 'aviso.pdf' }, { name: '' }] },
    { id: 't3', created: '2026-10-03T10:00:00', status: 3, description: 'c' },
    { id: 't4', created: '2026-10-04T10:00:00', status: 4, description: 'apagado', deletedTopic: true }] });
  assert.deepEqual(plano(tr.map(x => [x.id, x.lado, x.arquivos])), [['t1', 'cli', [{ id: 'a1', nome: 'ponto.xlsx' }]], ['t2', 'esc', [{ id: 'a2', nome: 'aviso.pdf' }]], ['t3', 'cli', []]]);
  const c = OC.camposDetalhe(t, { vacationStartDate: '2026-11-03T00:00:00', requestWay: 'WEB', attachmentsExpanded: [{ id: 'x9', name: 'pedido.pdf' }] });
  assert.deepEqual(plano(c.arquivos), [{ id: 'x9', nome: 'pedido.pdf' }]);
  assert.deepEqual(plano(c.anexos), ['pedido.pdf']);
  const inicio = c.grupos[0].campos.find(x => /Início/.test(x.k));
  assert.equal(inicio.destaque, true, 'início das férias em destaque');
  assert.equal(c.grupos[0].campos[0], inicio, 'o destaque vem primeiro');
  assert.ok(!c.grupos[0].campos.find(x => x.v === 'Portal do Cliente' || /Meio/.test(x.k) && x.destaque), 'meio sem destaque');
});

test('anexos: molde aprendido sem ids, nomes nem tokens; endereço por lista; só GET em onvio.com.br', () => {
  const G = '3f2a1b4c-1111-2222-3333-444455556666', T = 'aaaaaaaa-1111-2222-3333-444455556666', A = 'bbbbbbbb-1111-2222-3333-444455556666';
  const folha = OC.moldeDeAnexo('https://onvio.com.br/api/br-payroll-sr/v1/tickets/' + G + '/topics/' + T + '/attachments/' + A + '/download?inline=false');
  assert.equal(folha, 'https://onvio.com.br/api/br-payroll-sr/v1/tickets/{tickets}/topics/{topics}/attachments/{attachments}/download?inline=false');
  assert.equal(OC.moldeDeAnexo('https://onvio.com.br/api/files/' + A + '/Aviso%20Jo%C3%A3o.pdf'), 'https://onvio.com.br/api/files/{files}/{nome}');
  assert.equal(OC.moldeDeAnexo('https://onvio.com.br/api/files/' + A + '/joao'), 'https://onvio.com.br/api/files/{files}/{nome}', 'palavra depois do id pode ser nome: vira {nome}');
  assert.equal(OC.moldeDeAnexo('https://onvio.com.br/api/files/' + A + '?token=Abc123xyz9'), null, 'token não é aprendido');
  assert.equal(OC.moldeDeAnexo('https://outro.com/api/attachments/' + A), null);
  assert.equal(OC.moldeDeAnexo('http://onvio.com.br/api/attachments/' + A), null);
  assert.equal(OC.moldeDeAnexo('https://onvio.com.br/api/br-payroll-sr/v1/tickets'), null, 'sem id não é download');
  const ids = { sol: 'S1', topico: 'T1', anexo: 'A1', nome: 'a b.pdf' };
  assert.equal(OC.urlAnexo(OC.TYPE_BY_KEY.calcFerias, ids, [{ molde: folha }]).url, 'https://onvio.com.br/api/br-payroll-sr/v1/tickets/S1/topics/T1/attachments/A1/download?inline=false');
  assert.equal(OC.urlAnexo(OC.TYPE_BY_KEY.geral, ids, [{ molde: folha }]), null, 'molde da folha não serve para a Geral');
  assert.equal(OC.urlAnexo(OC.TYPE_BY_KEY.calcFerias, { sol: 'S1', anexo: 'A1' }, [{ molde: folha }]), null, 'anexo da abertura (sem trâmite) não cabe no molde do trâmite');
  const generico = OC.moldeDeAnexo('https://onvio.com.br/api/files/' + A + '/x.pdf');
  assert.equal(OC.urlAnexo(OC.TYPE_BY_KEY.geral, ids, [{ molde: folha }, { molde: generico }]).url, 'https://onvio.com.br/api/files/A1/a%20b.pdf');
  assert.equal(OC.urlAnexo(OC.TYPE_BY_KEY.calcFerias, ids, [{ molde: generico }, { molde: folha }]).url.includes('/tickets/S1/'), true, 'o da própria lista vem antes do genérico');
  assert.equal(OC.leituraAnexoPermitida('https://onvio.com.br/api/x/attachments/1/delete'), false);
  assert.equal(OC.leituraAnexoPermitida('https://onvio.com.br.evil.com/api/x'), false);
});

test('background: baixar anexos usa o molde aprendido, confere o escritório e baixa pela aba; sem molde, explica', async () => {
  const api = apiSimulada({ itens: { avisoFerias: [pend('f1', 31)] } });
  const { ouvintes, store } = carregarBackground({ abas: [aba(5, ONVIO_PORTAL)], fetchPorMundo: { MAIN: api }, fetch: api });
  const pedir = m => new Promise(res => ouvintes[0](m, { tab: { id: 5 } }, res));
  const G = '3f2a1b4c-1111-2222-3333-444455556666', T = 'aaaaaaaa-1111-2222-3333-444455556666', A = 'bbbbbbbb-1111-2222-3333-444455556666';
  const sem = await pedir({ cmd: 'baixarAnexos', type: 'avisoFerias', num: '31', anexos: [{ id: 'a1', topico: 't1', nome: 'aviso.pdf' }] });
  assert.deepEqual([sem.ok, sem.baixados, sem.semRota], [true, 0, 1]);
  assert.equal((await pedir({ cmd: 'rotaAnexo', url: 'https://onvio.com.br/api/br-payroll-sr/v1/tickets/' + G + '/topics/' + T + '/attachments/' + A })).ok, true);
  assert.equal((await pedir({ cmd: 'rotaAnexo', url: 'https://evil.com/x/' + A })).ok, false);
  assert.doesNotMatch(JSON.stringify(store.rotasAnexo), /3f2a1b4c|aaaaaaaa|bbbbbbbb/, 'só o molde, sem ids');
  const r = await pedir({ cmd: 'baixarAnexos', type: 'avisoFerias', num: '31', anexos: [{ id: 'a1', topico: 't1', nome: 'av/iso.pdf' }] });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(api.chamadas.urls.includes('/api/br-payroll-sr/v1/tickets/f1/topics/t1/attachments/a1'), 'GET pela aba no endereço montado do molde');
  assert.equal(r.baixados + r.falhas.length, 1);
  assert.match(r.falhas.concat('av_iso.pdf').join(), /av_iso\.pdf/, 'nome sem barra');
  const ruim = await pedir({ cmd: 'baixarAnexos', type: 'avisoFerias', num: '31', anexos: [{ id: '../x', nome: 'a' }] });
  assert.equal(ruim.ok, false);
});

test('background: consultar lista na hora e devolve itens avaliados, sem gravar nada', async () => {
  const api = apiSimulada({ itens: { geral: [pend('g1', 1), pend('g2', 2)] } });
  const { ouvintes, store } = carregarBackground({ abas: [aba(5, ONVIO_PORTAL)], fetchPorMundo: { MAIN: api }, fetch: api });
  const r = await new Promise(res => ouvintes[0]({ cmd: 'consultar', type: 'geral', filtro: 'todas', page: 1, per: 50 }, { tab: { id: 5 } }, res));
  assert.equal(r.ok, true);
  assert.equal(r.total, 2);
  assert.equal(r.itens[0].typeLabel, 'Geral');
  assert.ok('nivel' in r.itens[0], 'vem com o semáforo calculado');
  assert.deepEqual(Object.keys(store).filter(k => !['metodoLeitura', 'perfilSessao'].includes(k)), [], 'consulta não grava nada');
});

test('background: detalhe acha pelo número e traz os trâmites; trâmites que falham não derrubam o detalhe', async () => {
  const api = apiSimulada({ itens: { geral: [pend('g1', 77, { subject: 'Dúvida' })] } });
  const { ouvintes } = carregarBackground({ abas: [aba(5, ONVIO_PORTAL)], fetchPorMundo: { MAIN: api }, fetch: api });
  const r = await new Promise(res => ouvintes[0]({ cmd: 'detalhe', type: 'geral', num: 77 }, { tab: { id: 5 } }, res));
  assert.equal(r.ok, true);
  assert.equal(r.item.assunto, 'Dúvida');
  assert.deepEqual(plano(r.tramites), []);
  assert.ok(api.chamadas.urls.some(u => /service-requesting\/v1\/tickets\/g1\/topics$/.test(u)));
  const nada = await new Promise(res => ouvintes[0]({ cmd: 'detalhe', type: 'geral', num: 999 }, { tab: { id: 5 } }, res));
  assert.equal(nada.ok, false);
  assert.match(nada.erro, /#999 não encontrada/);
});

test('background: detalhe de Aviso de férias lê os trâmites em br-payroll-sr tickets; erro nos trâmites não derruba o detalhe', async () => {
  const base = apiSimulada({ itens: { avisoFerias: [pend('v1', 702)], afastamento: [pend('a1', 9)] } });
  const api = async url => {
    const p = new URL(url).pathname;
    if (/br-payroll-sr\/v1\/tickets\/v1\/topics$/.test(p)) { await base(url); return respHttp(200, 'application/json', JSON.stringify({ items: [{ created: '2026-10-01T10:00:00', status: 1, description: 'oi' }] })); }
    if (/tickets\/a1\/topics$/.test(p)) { await base(url); return respHttp(404, 'application/json', '{}'); }
    return base(url);
  };
  const { ouvintes } = carregarBackground({ abas: [aba(5, ONVIO_PORTAL)], fetchPorMundo: { MAIN: api }, fetch: api });
  const pedir = m => new Promise(res => ouvintes[0](m, { tab: { id: 5 } }, res));
  const r = await pedir({ cmd: 'detalhe', type: 'avisoFerias', num: 702 });
  assert.equal(r.erroTramites, null);
  assert.equal(r.tramites.length, 1);
  const r2 = await pedir({ cmd: 'detalhe', type: 'afastamento', num: 9 });
  assert.equal(r2.ok, true);
  assert.equal(r2.tramites, null);
  assert.match(r2.erroTramites, /HTTP 404/);
});

test('background: ao atualizar, esquece rotas aprendidas e erros de trâmites guardados', async () => {
  const { store, instalado } = carregarBackground();
  store.rotasTramites = { avisoFerias: { sufixo: 'history', idForma: 'guid', query: {} } };
  store.tramites = { 'avisoFerias:v1': { erro: '2026-10-15T10:00:00Z' }, 'calcFerias:c1': { pt: '2026-10-02T10:00:00' } };
  await Promise.all(instalado.map(f => f({ reason: 'update' })));
  assert.equal(store.rotasTramites, undefined);
  assert.deepEqual(Object.keys(store.tramites), ['calcFerias:c1'], 'o que já foi achado fica; os erros são tentados de novo');
});

test('background: cada lembrete pendente tem um alarme; feito/excluído some; no horário vira notificação e alerta', async () => {
  const { ctx, store, chrome, chamadas } = carregarBackground();
  const futuro = new Date(Date.now() + 3600e3).toISOString();
  store.lembretes = [OC.novoLembrete({ texto: 'A', quando: futuro, type: 'geral', num: 5, cliente: 'ACME' }), OC.novoLembrete({ texto: 'B', quando: futuro }), Object.assign(OC.novoLembrete({ texto: 'C', quando: futuro }), { feito: true })];
  await ctx.sincronizarLembretes();
  const nomes = () => [...chrome.alarms._a.keys()].filter(n => n.startsWith('lembrete:')).sort();
  assert.deepEqual(nomes(), ['lembrete:' + store.lembretes[0].id, 'lembrete:' + store.lembretes[1].id].sort());
  store.lembretes = store.lembretes.slice(1);                                         // excluiu o A
  await ctx.sincronizarLembretes();
  assert.deepEqual(nomes(), ['lembrete:' + store.lembretes[0].id]);
  await ctx.dispararLembrete(store.lembretes[0].id);
  assert.equal(store.lembretes[0].disparado, true);
  assert.equal(store.eventos[0].tipo, 'lembrete');
  assert.ok(chamadas.some(c => c[0] === 'notificacao' && c[2] === 'Lembrete'));
  await ctx.dispararLembrete(store.lembretes[0].id);                                 // não dispara duas vezes
  assert.equal(store.eventos.length, 1);
});

test('background: cada leitura grava eventos (máx. 300) e a série do dia, sem descrição nem dados pessoais', async () => {
  const estado = { itens: { geral: [pend('g1', 1)] } };
  const api = apiSimulada(estado);
  const { ctx, store } = carregarBackground({ abas: [aba(5, ONVIO_PORTAL)], fetchPorMundo: { MAIN: api }, fetch: api });
  await ctx.coletar(false);
  estado.itens.geral.push(pend('g2', 2, { description: 'CPF 123.456.789-00 do João', subject: 'Férias', clientEmployeeExpanded: { name: 'João' } }));
  await ctx.coletar(false);
  assert.equal(store.eventos.length, 1);
  assert.equal(store.eventos[0].tipo, 'nova');
  const hoje = OC.ymd(new Date());
  assert.equal(store.serie[hoje].entradas, 1);
  const tudo = JSON.stringify(store);
  assert.ok(!tudo.includes('123.456.789'), 'descrição com CPF não é guardada');
});

test('Hoje: próximo passo de cada motivo e anel do prazo (escritório × cliente, teto em 100%)', () => {
  assert.equal(OC.acaoDe({ lado: 'esc', nivel: 2, parado: 31 }), 'Fora do prazo · parada há 31 dias');
  assert.equal(OC.acaoDe({ lado: 'cli', nivel: 2, prescreveEm: 4, parado: 26 }), 'Cobrar o cliente · prescreve em 4 dias');
  assert.equal(OC.acaoDe({ lado: 'esc', nivel: 1, parado: 2 }), 'Concluir hoje · o prazo vence hoje');
  assert.equal(OC.acaoDe({ lado: 'cli', nivel: 1, parado: 8 }), 'Cobrar o cliente · sem retorno');
  assert.equal(OC.acaoDe({ lado: 'esc', nivel: 0, status: 'Aguardando resposta', parado: 1 }), 'Responder o cliente');
  assert.equal(OC.acaoDe({ lado: 'esc', nivel: 0, parado: 1 }), 'Em dia · parada há 1 dia');
  assert.equal(OC.acaoDe({ lado: 'cli', nivel: 0, parado: 3 }), 'Aguardando o cliente · 3 dias');
  assert.deepEqual(plano(OC.progressoPrazo({ lado: 'esc', parado: 6 }, { parada: 15 })), { pct: 40, dias: 6, limite: 15 });
  assert.deepEqual(plano(OC.progressoPrazo({ lado: 'cli', parado: 15 }, { prescricaoDias: 30 })), { pct: 50, dias: 15, limite: 30 });
  assert.equal(OC.progressoPrazo({ lado: 'esc', parado: 40 }, {}).pct, 100, 'nunca passa de 100%');
});

/* ---------- v0.13: detalhe completo, observações, aviso sem cálculo, distribuição ---------- */
test('detalhe completo: endereço por lista (Rubricas na v2) e campos em grupos com rótulos, sem ids técnicos', () => {
  assert.equal(OC.urlDetalhe(OC.TYPE_BY_KEY.avisoFerias, 'g1'), OC.API + 'br-payroll-sr/v1/prior-notice-vacations/g1?expand=all');
  assert.equal(OC.urlDetalhe(OC.TYPE_BY_KEY.rubricas, 'r1'), OC.API + 'br-payroll-sr/v2/payroll-entries/r1?expand=all');
  const c = OC.camposDetalhe(OC.TYPE_BY_KEY.cadEmpregado, {
    type: 'x', apiVersion: '1', id: 'g', companyId: 'c', identifier: 9, genericStatus: 2, departmentId: 'd',
    name: 'Fulano', admissionDate: '2026-11-03T00:00:00', wage: 2500.5, firstJob: true, novoCampoDoOnvio: 'abc',
    clientExpanded: { id: 'z', name: 'ACME', code: 12, nickname: 'AC' }, jobPositionExpanded: { id: 'j', name: 'Auxiliar' },
    attachmentsExpanded: [{ name: 'rg.pdf' }, { name: 'ctps.pdf' }]
  });
  const princ = Object.fromEntries(c.grupos[0].campos.map(x => [x.k, x.v]));
  assert.equal(princ['Nome'], 'Fulano');
  assert.equal(princ['Data de admissão'], '03/11/2026', 'data "só dia" sem voltar um dia pelo fuso');
  assert.match(princ['Salário'], /R\$\s?2\.500,50/);
  assert.equal(princ['Primeiro emprego'], 'Sim');
  assert.equal(princ['Cargo'], 'Auxiliar', 'objeto só com nome vira uma linha');
  assert.equal(princ['Novo campo do onvio'], 'abc', 'campo novo do Onvio aparece');
  for (const k of ['Id', 'Company id', 'Api version', 'Type', 'Generic status', 'Department id']) assert.ok(!(k in princ), k + ' é técnico');
  assert.deepEqual(plano(c.grupos.map(g => g.titulo)), ['Solicitação'], 'cliente fica no topo da janela, não repete na aba Dados');
  assert.deepEqual(plano(c.anexos), ['rg.pdf', 'ctps.pdf']);
});

test('aba Dados: só o que serve para atender (sem campos técnicos, sem repetir o topo), rótulos e valores em português', () => {
  const c = OC.camposDetalhe(OC.TYPE_BY_KEY.avisoFerias, {
    id: 'g', subject: 'Férias de novembro', description: 'Texto longo do cliente', serviceRequestType: 'PRIOR_NOTICE_VACATION', requestWay: 'PORTAL',
    created: '2026-10-01T10:00:00', changed: '2026-10-02T10:00:00', lastUpdated: '2026-10-02T10:00:00', dueDate: '2026-10-20T00:00:00', genericStatus: 1,
    vacationStartDate: '2026-11-03T00:00:00', vacationDays: 30,
    createdByContactExpanded: { id: 'u', name: 'Contato' }, requesterExpanded: { id: 'r', name: 'Contato' }, staffResponsibleExpanded: { id: 's', name: 'Analista' },
    clientExpanded: { id: 'z', name: 'ACME', code: 12, nickname: 'AC' },
    clientEmployeeExpanded: { id: 'e', name: 'Fulano', code: 7, hireDate: '2024-01-02T00:00:00', clientEmployeeRelationship: 'EMPLOYEE', sortOrder: 3 }
  });
  assert.deepEqual(plano(c.grupos.map(g => g.titulo)), ['Solicitação', 'Empregado']);
  const princ = c.grupos[0].campos.map(x => x.k);
  for (const k of ['Tipo de solicitação', 'Meio da solicitação', 'Aberta em', 'Alterada em', 'Último trâmite', 'Expectativa de conclusão', 'Cadastrada por', 'Solicitante', 'Responsável'])
    assert.ok(!princ.includes(k), k + ' não é preciso para atender ou já está no topo');
  assert.deepEqual(plano(princ), ['Assunto', 'Início das férias', 'Dias de férias', 'Descrição'], 'descrição (texto longo) por último');
  const emp = Object.fromEntries(c.grupos[1].campos.map(x => [x.k, x.v]));
  assert.equal(emp['Admissão'], '02/01/2024');
  assert.equal(emp['Vínculo'], 'Empregado', 'enumeração em português');
  assert.ok(!('Hire date' in emp) && !('Sort order' in emp) && !('Client employee relationship' in emp));
});

test('avisos sem cálculo: quadro em duas colunas, marcas só com k/coluna/hora e texto do aviso ao cliente pelas regras', () => {
  const now = new Date(2026, 9, 16, 10);
  const it = (k, faltam, extra) => Object.assign({ k, type: 'avisoFerias', typeLabel: 'Aviso de férias', num: k.slice(-1), detalhe: 'Fulano', semCalculo: { alvo: '2026-10-30', faltam, ref: 'início das férias em 03/11/2026', calculo: 'Cálculo de férias' } }, extra || {});
  const itens = [it('avisoFerias:a', 3), it('avisoFerias:b', -1), it('avisoFerias:c', 1), { k: 'geral:x', type: 'geral' }];
  let marcas = OC.marcarSemCalculo({}, 'avisoFerias:c', 'avisado', itens, now);
  marcas = OC.marcarSemCalculo(marcas, 'avisoFerias:a', 'desconsiderado', itens, now);
  assert.deepEqual(plano(marcas['avisoFerias:c']), { st: 'avisado', em: now.toISOString() });
  const q = OC.quadroSemCalculo(itens, marcas);
  assert.deepEqual(plano(q.avisar.map(x => x.item.k)), ['avisoFerias:b']);
  assert.deepEqual(plano(q.avisados.map(x => x.item.k)), ['avisoFerias:c']);
  assert.deepEqual(plano(q.desconsiderados.map(x => x.item.k)), ['avisoFerias:a']);
  // voltar tira a marca; marca de aviso que saiu das pendentes some depois de 7 dias; coluna desconhecida é ignorada
  assert.ok(!('avisoFerias:c' in OC.marcarSemCalculo(marcas, 'avisoFerias:c', null, itens, now)));
  const velha = { 'avisoFerias:z': { st: 'avisado', em: '2026-10-01T10:00:00.000Z' }, 'avisoFerias:y': { st: 'avisado', em: '2026-10-14T10:00:00.000Z' }, 'avisoFerias:a': { st: 'xx', em: now.toISOString() } };
  assert.deepEqual(Object.keys(OC.marcarSemCalculo(velha, null, null, itens, now)), ['avisoFerias:y']);
  // texto: padrão e o do arquivo de regras
  assert.equal(OC.textoAvisoSemCalculo(it('avisoFerias:a', 3), {}),
    'Recebemos o aviso de férias de Fulano, mas ainda não há a solicitação de cálculo de férias desse empregado. Para o pagamento sair dentro do prazo legal (até 30/10/2026, início das férias em 03/11/2026), abra a solicitação de cálculo de férias no Portal do Cliente o quanto antes. Sem ela não conseguimos preparar o cálculo a tempo.');
  const r = OC.normalizarRegras({ avisoSemCalculo: 'Falta o {calculo} de {empregado} (pagar até {pagamento}). {outro}' });
  const s = OC.combinarSettings({ regras: r }, {});
  assert.equal(OC.textoAvisoSemCalculo(it('avisoFerias:a', 3), s), 'Falta o cálculo de férias de Fulano (pagar até 30/10/2026). {outro}', 'chave desconhecida fica como está');
  assert.equal(OC.normalizarRegras({ avisoSemCalculo: 'x'.repeat(801) }), null, 'texto grande demais é ignorado');
});

test('criar solicitação Geral: corpo do formato mapeado, tipo/meio/departamento das regras ou do Onvio, e achar a nova', () => {
  const ex = { serviceRequestType: 'TIPO_GERAL', requestWay: 'WEB', departmentId: 'depX', subject: 'não usar', clientExpanded: { id: 'outro' } };
  const m = OC.modeloCriacao({}, ex, { departmentId: 'depDP' });
  assert.deepEqual(plano(m), { serviceRequestType: 'TIPO_GERAL', requestWay: 'WEB', departmentId: 'depDP', faltam: [] }, 'departamento do acesso do usuário antes do exemplo');
  assert.deepEqual(plano(OC.modeloCriacao({ criacao: { serviceRequestType: 'R', requestWay: 'PHONE', departmentId: 'D' } }, ex, null)), { serviceRequestType: 'R', requestWay: 'PHONE', departmentId: 'D', faltam: [] }, 'regras do escritório valem primeiro');
  assert.deepEqual(plano(OC.modeloCriacao({}, null, null).faltam), ['tipo', 'meio', 'departamento']);
  assert.deepEqual(plano(OC.pedidoCriacao({ assunto: '  Cálculo   pendente ', descricao: ' Texto ' }, 'cli1', m)), {
    metodo: 'POST', url: OC.API + 'service-requesting/v1/tickets/generic',
    corpo: { serviceRequestType: 'TIPO_GERAL', clientExpanded: { id: 'cli1' }, departmentId: 'depDP', description: 'Texto', subject: 'Cálculo pendente', requestWay: 'WEB', requesterExpanded: {} }
  });
  assert.throws(() => OC.pedidoCriacao({ assunto: 'a', descricao: 'b' }, '', m), /escolha o cliente/);
  assert.throws(() => OC.pedidoCriacao({ assunto: ' ', descricao: 'b' }, 'c', m), /escreva o assunto/);
  assert.throws(() => OC.pedidoCriacao({ assunto: 'a', descricao: '' }, 'c', m), /escreva a descrição/);
  assert.throws(() => OC.pedidoCriacao({ assunto: 'a', descricao: 'b' }, 'c', OC.modeloCriacao({}, { requestWay: 'WEB' }, null)), /não consegui descobrir no Onvio o tipo, departamento/);
  const agora = new Date(2026, 9, 16, 10);
  const regs = [
    { id: 'n1', identifier: 1500, subject: 'Cálculo pendente', clientExpanded: { id: 'cli1' }, created: '2026-10-16T09:58:00' },
    { id: 'n0', identifier: 1400, subject: 'Cálculo pendente', clientExpanded: { id: 'cli1' }, created: '2026-10-01T09:00:00' },
    { id: 'n2', identifier: 1501, subject: 'Cálculo pendente', clientExpanded: { id: 'cli2' }, created: '2026-10-16T09:59:00' }
  ];
  assert.equal(OC.acharCriada(regs, 'Cálculo pendente', 'cli1', agora).id, 'n1', 'mesmo assunto e cliente, criada há pouco');
  assert.equal(OC.acharCriada(regs, 'Outro', 'cli1', agora), null);
  assert.equal(OC.assuntoAvisoSemCalculo({ typeLabel: 'Aviso de férias', detalhe: 'Fulano', semCalculo: { calculo: 'Cálculo de férias' } }, {}), 'Cálculo de férias pendente · Fulano');
  const r = OC.normalizarRegras({ criacao: { serviceRequestType: 'GENERIC', requestWay: 'x y', departmentId: 'abc-1' }, tramiteCriacao: 'Aguardamos.' });
  assert.deepEqual(plano(r.criacao), { serviceRequestType: 'GENERIC', departmentId: 'abc-1' }, 'valor com espaço é ignorado');
  const s2 = OC.combinarSettings({ regras: r }, {});
  assert.deepEqual(plano(s2.criacao), { serviceRequestType: 'GENERIC', requestWay: '', departmentId: 'abc-1' });
  assert.equal(s2.tramiteCriacao, 'Aguardamos.');
});

test('prazo de pagamento: férias 2 dias antes do início e rescisão 10 dias após, antecipando fim de semana e feriado', () => {
  const f = OC.prazoPagamento('avisoFerias', { inicio: '2026-11-03' }, {});
  assert.equal(OC.ymd(f.alvo), '2026-10-30', '01/11 é domingo: antecipa para sexta 30/10');
  const r = OC.prazoPagamento('avisoRescisao', { aviso: '2026-10-05' }, {});
  assert.equal(OC.ymd(r.alvo), '2026-10-15');
  assert.match(r.ref, /sem data de desligamento/);
  const r2 = OC.prazoPagamento('calcRescisao', { desligamento: '2026-10-02', aviso: '2026-09-01' }, {});
  assert.equal(OC.ymd(r2.alvo), '2026-10-09', '12/10 é feriado e 10 e 11 fim de semana: antecipa para 09/10');
  assert.equal(OC.prazoPagamento('avisoFerias', {}, {}), null);
  assert.deepEqual(plano(OC.datasDe({ vacationStartDate: '2026-11-03T00:00:00', adviceDate: '2026-10-01T00:00:00', name: 'Fulano', nationalIdentity: '123' })),
    { inicio: '2026-11-03', aviso: '2026-10-01', desligamento: null, admissao: null, competencia: null, afastamento: null, pagamento: null }, 'só datas, nada pessoal');
});

test('observações para o cliente: frases do tipo com as datas, avisos fora do prazo primeiro e linha sem dado some', () => {
  const now = new Date(2026, 9, 15, 10);
  const it = { type: 'avisoFerias', created: '2026-10-14T12:00:00', lado: 'esc' };
  const o = OC.observacoesCliente(it, { inicio: '2026-11-03' }, {}, now);
  assert.equal(o[0].id, 'alerta-aviso');
  assert.match(o[0].texto, /faltam 19 dias para o início das férias \(03\/11\/2026\), menos que os 30 dias/);
  assert.ok(o.some(x => /Prazo de conclusão: até 19\/10\/2026 \(3 dias úteis a partir da abertura\)\./.test(x.texto)));
  assert.ok(o.some(x => /pagamento das férias deve ser feito até 30\/10\/2026/.test(x.texto)));
  const sem = OC.observacoesCliente(it, {}, {}, now);
  assert.ok(!sem.some(x => /férias começam/.test(x.texto)), 'sem a data de início, a frase não aparece');
  const venc = OC.observacoesCliente({ type: 'geral', created: '2026-09-01T12:00:00', lado: 'esc' }, {}, {}, now);
  assert.deepEqual([venc[0].id, venc[0].interno], ['alerta-conclusao', true], 'prazo vencido é aviso interno (não vai para o cliente)');
  const regras = OC.normalizarRegras({ observacoes: { geral: ['Frase do escritório.'], invalido: ['x'], rubricas: [42, 'Outra'] } });
  assert.deepEqual(plano(regras.observacoes), { geral: ['Frase do escritório.'], rubricas: ['Outra'] });
  const s = OC.combinarSettings({ regras }, {});
  assert.ok(OC.observacoesCliente({ type: 'geral', created: '2026-10-14T12:00:00', lado: 'esc' }, {}, s, now).some(x => x.texto === 'Frase do escritório.'));
});

test('aviso sem cálculo: lê a data do aviso uma vez, só procura o cálculo perto do prazo e marca quem não tem', async () => {
  const now = new Date(2026, 9, 15, 10);
  const urls = [];
  const det = { v1: { vacationStartDate: '2026-10-22T00:00:00' }, v2: { vacationStartDate: '2026-10-21T00:00:00' }, v3: { vacationStartDate: '2027-01-10T00:00:00' }, r1: { adviceDate: '2026-10-05T00:00:00' } };
  const f = async url => {
    const u = new URL(url); urls.push(u.pathname + (u.searchParams.get('searchText') ? '?' + u.searchParams.get('searchText') : ''));
    const id = u.pathname.split('/').pop();
    if (det[id]) return det[id];
    if (u.pathname.endsWith('vacation-calculations')) return { items: [{ id: 'c', created: '2026-10-10T12:00:00', clientEmployeeExpanded: { name: 'Beltrano' }, clientExpanded: { code: 7, name: 'ACME' } }] };
    return { items: [] };
  };
  const item = (k, type, id, emp) => ({ k, type, id, detalhe: emp, codCliente: 7, cliente: 'ACME', created: '2026-10-01T12:00:00' });
  const out = { items: [item('avisoFerias:v1', 'avisoFerias', 'v1', 'Fulano'), item('avisoFerias:v2', 'avisoFerias', 'v2', 'Beltrano'), item('avisoFerias:v3', 'avisoFerias', 'v3', 'Ciclano'), item('avisoRescisao:r1', 'avisoRescisao', 'r1', 'Joana'), { k: 'geral:g', type: 'geral', id: 'g' }] };
  await OC.verificarAvisos(f, out, {}, Object.assign({}, OC.DEFAULTS), now);
  const v1 = out.items[0].semCalculo;
  assert.deepEqual([v1.alvo, v1.faltam, v1.calculo], ['2026-10-20', 3, 'Cálculo de férias']);
  assert.equal(out.items[1].semCalculo, undefined, 'Beltrano já tem cálculo');
  assert.equal(out.items[2].semCalculo, undefined, 'férias longe: nem procura o cálculo');
  assert.ok(!urls.includes('/api/br-payroll-sr/v1/vacation-calculations?Ciclano'));
  assert.equal(out.items[3].semCalculo.alvo, '2026-10-15', 'rescisão: 10 dias do aviso');
  assert.equal(out.avisos.semCalculo, 2);
  assert.ok(!urls.some(u => /\/g\?|generic/.test(u)), 'só avisos de férias e rescisão');
  // segunda leitura: cache evita reler o detalhe e reconferir antes de 6 h
  urls.length = 0;
  const out2 = { items: out.items.map(i => Object.assign({}, i, { semCalculo: undefined })) };
  await OC.verificarAvisos(f, out2, out.avisos.cache, Object.assign({}, OC.DEFAULTS), new Date(2026, 9, 15, 11));
  assert.deepEqual(urls, []);
  assert.equal(out2.items[0].semCalculo.alvo, '2026-10-20');
  assert.deepEqual(Object.keys(out.avisos.cache['avisoFerias:v1']).sort(), ['alvo', 'calc', 'conf', 'lido', 'ref'], 'cache só com datas e sim/não');
});

test('distribuição: quem mais atendeu a empresa na semana; admissões fora da conta e com quem mais faz admissões', () => {
  const x = (type, resp, cod, extra) => Object.assign({ k: type + ':' + Math.random(), type, resp, codCliente: cod, cliente: 'C' + cod }, extra || {});
  const mov = [
    x('geral', 'Ana', 1), x('calcFerias', 'Ana', 1), x('rubricas', 'Bia', 1),
    x('cadEmpregado', 'Carla', 1), x('cadEmpregado', 'Carla', 1), x('cadEmpregado', 'Carla', 1), x('cadEstagiario', 'Carla', 2),
    x('geral', 'Bia', 2), x('avisoFerias', '', 2)
  ];
  const pend = [x('geral', 'Ana', 5), x('geral', 'Ana', 5), x('geral', 'Bia', 6),
    x('afastamento', '', 1, { k: 'a1', nivel: 2 }), x('cadEmpregado', '', 2, { k: 'c1' }), x('geral', '', 2, { k: 'g2' }), x('geral', '', 9, { k: 'g9' })];
  const s = OC.distribuirPorCliente(pend, mov, 7);
  const por = Object.fromEntries(s.map(r => [r.item.k, r]));
  assert.equal(por.a1.resp, 'Ana', 'empresa 1: Ana atendeu 2 (as 3 admissões da Carla não contam)');
  assert.match(por.a1.motivo, /atendeu 2 de 3 solicitações desta empresa na última semana/);
  assert.deepEqual(plano(por.a1.alternativas), [{ resp: 'Bia', n: 1, respId: '' }]);
  assert.equal(por.c1.resp, 'Carla', 'admissão vai para quem mais fez admissões');
  assert.match(por.c1.motivo, /fez 4 admissões/);
  assert.equal(por.g2.resp, 'Bia');
  assert.equal(por.g9.resp, '', 'sem histórico: não sugere ninguém (nada de "quem tem menos")');
  assert.equal(por.g9.semHistorico, true);
  assert.match(por.g9.motivo, /ninguém atendeu esta empresa na última semana: escolha o responsável/);
  assert.equal(s[0].item.k, 'a1', 'mais grave primeiro');
  assert.equal(s.length, 4, 'só as sem responsável');
});

test('distribuição: lê só o período (para na primeira mais antiga) e o service worker devolve as sugestões sem gravar', async () => {
  const agora = new Date('2026-10-15T12:00:00Z');
  const f = async url => {
    const u = new URL(url);
    if (!/tickets\/generic$/.test(u.pathname)) return { items: [] };
    return { items: [
      { id: 'a', identifier: 1, genericStatus: 5, lastUpdated: '2026-10-14T10:00:00', staffResponsibleExpanded: { name: 'Ana' }, clientExpanded: { code: 1, name: 'ACME' } },
      { id: 'b', identifier: 2, genericStatus: 5, lastUpdated: '2026-10-01T10:00:00', staffResponsibleExpanded: { name: 'Bia' }, clientExpanded: { code: 1, name: 'ACME' } }
    ], totalPages: 3 };
  };
  const m = await OC.lerMovimentadas(f, 7, agora);
  assert.deepEqual(plano(m.itens.map(i => i.resp)), ['Ana']);

  const api = apiSimulada({ itens: { geral: [pend('g1', 1, { staffResponsibleExpanded: null })] } });
  const { ouvintes, store } = carregarBackground({ abas: [aba(5, ONVIO_PORTAL)], fetchPorMundo: { MAIN: api }, fetch: api });
  store.snapshot = { items: [{ k: 'geral:g1', type: 'geral', resp: '', codCliente: '', cliente: 'ACME' }, { k: 'geral:g2', type: 'geral', resp: 'Ana', cliente: 'X' }] };
  const r = await new Promise(res => ouvintes[0]({ cmd: 'distribuicao', dias: 7 }, { tab: { id: 5 } }, res));
  assert.equal(r.ok, true);
  assert.deepEqual([r.dias, r.sugestoes.length, r.sugestoes[0].resp], [7, 1, ''], 'sem histórico no período: ninguém sugerido');
  assert.deepEqual(Object.keys(store).filter(k => !['metodoLeitura', 'perfilSessao', 'snapshot'].includes(k)), [], 'nada é gravado');
});

test('background: detalhe traz a solicitação completa em grupos, anexos e datas; erro na completa não derruba', async () => {
  const base = apiSimulada({ itens: { avisoFerias: [pend('v1', 702)] } });
  let falhaDetalhe = false;
  const api = async url => {
    const p = new URL(url).pathname;
    if (/prior-notice-vacations\/v1$/.test(p)) { if (falhaDetalhe) return respHttp(500, 'application/json', '{}'); return respHttp(200, 'application/json', JSON.stringify({ id: 'v1', subject: 'Férias', vacationStartDate: '2026-11-03T00:00:00', clientExpanded: { name: 'ACME', code: 3, nickname: 'AC' }, clientEmployeeExpanded: { name: 'Fulano', code: 7, hireDate: '2024-01-02T00:00:00' }, attachmentsExpanded: [{ name: 'aviso.pdf' }] })); }
    return base(url);
  };
  const { ouvintes, store } = carregarBackground({ abas: [aba(5, ONVIO_PORTAL)], fetchPorMundo: { MAIN: api }, fetch: api });
  const pedir = m => new Promise(res => ouvintes[0](m, { tab: { id: 5 } }, res));
  const r = await pedir({ cmd: 'detalhe', type: 'avisoFerias', num: 702 });
  assert.equal(r.ok, true);
  assert.deepEqual(plano(r.grupos.map(g => g.titulo)), ['Solicitação', 'Empregado'], 'o cliente já está no topo da janela');
  assert.deepEqual(plano(r.anexos), ['aviso.pdf']);
  assert.equal(r.datas.inicio, '2026-11-03');
  assert.equal(r.erroDados, null);
  falhaDetalhe = true;
  const r2 = await pedir({ cmd: 'detalhe', type: 'avisoFerias', num: 702 });
  assert.equal(r2.ok, true);
  assert.equal(r2.grupos, null);
  assert.match(r2.erroDados, /HTTP 500/);
  assert.ok(!('grupos' in store) && !('datas' in store), 'nada do detalhe é gravado');
});

test('vencimento: expectativa do cliente não conta; prazo legal de pagamento perto do tempo de atendimento (período cheio) conta', async () => {
  const now = new Date(2026, 9, 15, 10);
  const it = { type: 'geral', lado: 'esc', status: 'Em análise', created: '2026-10-14T12:00:00', last: '2026-10-14T12:00:00', due: '2026-10-01T00:00:00' };
  const e = OC.evaluate(it, {}, now);
  assert.equal(e.nivel, 0, 'expectativa vencida do cliente não vira atraso');
  assert.ok(!e.motivos.some(m => /Expectativa/.test(m.m)));
  const det = { c1: { vacationStartDate: '2026-10-19T00:00:00' }, c2: { vacationStartDate: '2026-10-24T00:00:00' }, c3: { vacationStartDate: '2026-12-01T00:00:00' } };
  const f = async url => det[new URL(url).pathname.split('/').pop()] || { items: [] };
  const item = (id, extra) => Object.assign({ k: 'calcFerias:' + id, type: 'calcFerias', id, lado: 'esc', nivel: 0, grav: 0, motivos: [], parado: 1, uteisAberto: 1 }, extra || {});
  const out = { items: [item('c1'), item('c2'), item('c3')] };
  await OC.verificarAvisos(f, out, {}, Object.assign({}, OC.DEFAULTS), now);
  const [a, b, c] = out.items;
  assert.deepEqual([a.nivel, a.motivos[0].m], [2, 'Pagamento (prazo legal) vence em 1 d.u., 16/10'], 'férias na segunda 19/10: 2 dias antes é sábado, antecipa para sexta 16/10');
  assert.deepEqual([b.nivel, b.motivos[0].m], [1, 'Pagamento (prazo legal) vence em 5 d.u., 22/10'], 'dentro do tempo de atendimento de 5 d.u.');
  assert.deepEqual([c.nivel, c.motivos.length, c.pagamentoAte.alvo], [0, 0, '2026-11-27'], 'longe: só a data, para a agenda');
  assert.equal(a.semCalculo, undefined, 'cálculo não procura cálculo');
});


/* ---------- v0.14: ações no Onvio (fase 2), sempre com API simulada ---------- */
test('ações: formatos do Onvio real (trâmite, encaminhar, responsável, expectativa) e só onde foi mapeado', () => {
  const geral = { type: 'geral', code: 2, lado: 'esc', resp: 'Ana' };
  const reg = { id: 'g1', departmentId: 'dep1' };
  assert.deepEqual(plano(OC.pedidoAcao({ acao: 'tramite', type: 'geral', texto: ' Segue o cálculo ', situacao: '4' }, reg, geral)),
    { metodo: 'POST', url: OC.API + 'service-requesting/v1/tickets/g1/topics', corpo: { description: 'Segue o cálculo', status: 4 } });
  const ferias = { type: 'avisoFerias', code: 2, lado: 'esc', resp: '' };
  assert.equal(OC.pedidoAcao({ acao: 'tramite', type: 'avisoFerias', texto: 'ok', situacao: 5 }, { id: 'f1' }, ferias).url, OC.API + 'br-payroll-sr/v1/tickets/f1/topics');
  assert.deepEqual(plano(OC.pedidoAcao({ acao: 'tramite', type: 'geral', texto: 'Veja', encaminharPara: 'u9' }, reg, geral).corpo), { description: 'Veja', status: 7, forwardedToExpanded: { departmentId: 'dep1', id: 'u9' } });
  assert.deepEqual(plano(OC.pedidoAcao({ acao: 'tramite', type: 'avisoFerias', texto: 'Veja', encaminharPara: 'u9' }, { id: 'f1' }, ferias).corpo.forwardedToExpanded), { id: 'u9' });
  assert.deepEqual(plano(OC.pedidoAcao({ acao: 'responsavel', type: 'geral', analista: 'u9' }, reg, geral)), { metodo: 'PUT', url: OC.API + 'service-requesting/v1/tickets/generic/g1/assign-staff', corpo: { departmentId: 'dep1', id: 'u9' } });
  assert.deepEqual(plano(OC.pedidoAcao({ acao: 'responsavel', type: 'avisoFerias', analista: 'u9' }, { id: 'f1' }, ferias)), { metodo: 'PUT', url: OC.API + 'br-payroll-sr/v1/prior-notice-vacations/f1/assign-staff', corpo: { id: 'u9' } });
  assert.deepEqual(plano(OC.pedidoAcao({ acao: 'expectativa', type: 'geral', data: '2026-10-30' }, reg, geral)), { metodo: 'PUT', url: OC.API + 'service-requesting/v1/tickets/generic/g1/change-due-date', corpo: { dueDate: '2026-10-30T00:00:00' } });
  // regras do Onvio e do mapeamento
  assert.throws(() => OC.pedidoAcao({ acao: 'tramite', type: 'geral', texto: 'x', situacao: 3 }, reg, geral), /escolha a situação/, 'situação fora do seletor do Onvio');
  assert.deepEqual(plano(OC.situacoesTramite(geral).map(x => x.code)), [2, 8, 4, 5]);
  assert.deepEqual(plano(OC.situacoesTramite({ type: 'geral', code: 4 }).map(x => x.code)), [4, 5], 'depois de Respondido só Respondido e Concluído');
  assert.throws(() => OC.pedidoAcao({ acao: 'tramite', type: 'geral', texto: '  ', situacao: 4 }, reg, geral), /escreva o texto/);
  assert.match(OC.podeAcao('responsavel', { type: 'avisoFerias', code: 2, lado: 'esc', resp: 'Ana' }).motivo, /só permite definir responsável quando ainda não há/);
  assert.match(OC.podeAcao('responsavel', { type: 'geral', code: 4, lado: 'cli' }).motivo, /Respondido/);
  assert.match(OC.podeAcao('expectativa', ferias).motivo, /ainda não mapeada/);
  for (const k of ['cadEmpregado', 'cadContribuinte', 'cadEstagiario', 'rubricas']) assert.equal(OC.podeAcao('tramite', { type: k, code: 2, lado: 'esc' }).ok, false, k + ' não mapeado');
  assert.throws(() => OC.pedidoAcao({ acao: 'tramite', type: 'rubricas', texto: 'x', situacao: 4 }, { id: 'r' }, { type: 'rubricas', code: 2, lado: 'esc' }), /ainda não mapeada/);
  // só estes endereços recebem escrita; nunca DELETE nem /delete
  assert.equal(OC.escritaPermitida('POST', OC.API + 'service-requesting/v1/tickets/g1/topics'), true);
  assert.equal(OC.escritaPermitida('POST', OC.API + 'service-requesting/v1/tickets/g1/topics/t7/attachments'), true);
  assert.equal(OC.escritaPermitida('PUT', OC.API + 'br-payroll-sr/v1/prior-notice-vacations/f1/assign-staff'), true);
  assert.equal(OC.escritaPermitida('DELETE', OC.API + 'service-requesting/v1/tickets/g1/topics'), false);
  assert.equal(OC.escritaPermitida('PUT', OC.API + 'service-requesting/v1/tickets/g1/topics/t7/attachments/a1/delete'), false);
  assert.equal(OC.escritaPermitida('POST', OC.API + 'service-requesting/v1/tickets/generic'), true, 'criar solicitação Geral (autorizado em 16/10/2026)');
  assert.equal(OC.escritaPermitida('PUT', OC.API + 'service-requesting/v1/tickets/generic'), false);
  assert.equal(OC.escritaPermitida('POST', OC.API + 'br-payroll-sr/v1/prior-notice-vacations'), false, 'criar nas listas da folha ainda não');
  assert.equal(OC.escritaPermitida('POST', OC.API + 'service-requesting/v1/tickets/generic?x=1'), false);
  assert.equal(OC.escritaPermitida('POST', 'https://outro.com/api/service-requesting/v1/tickets/g1/topics'), false);
  assert.equal(OC.idDoLocation('https://onvio.com.br/api/service-requesting/v1/tickets/g1/topics/abc123'), 'abc123');
  assert.deepEqual(plano(OC.equipeDe([{ resp: 'Bia', respId: 'b' }, { resp: 'Ana', respId: 'a' }, { resp: 'Ana', respId: 'a' }, { resp: '', respId: '' }])), [{ id: 'a', nome: 'Ana' }, { id: 'b', nome: 'Bia' }]);
});

test('background: criar solicitação Geral pela aba do Onvio, com o cliente da solicitação de origem, e passar a vez ao cliente', async () => {
  const origem = pend('f1', 901, { clientExpanded: { id: 'cli-guid', name: 'ACME' } });
  const exemplo = pend('ex1', 1490, { departmentId: 'depEx', requestWay: 'WEB' });
  let criada = null;
  const escritas = [];
  const json = o => respHttp(200, 'application/json', JSON.stringify(o));
  const api = async (url, init) => {
    const u = new URL(url);
    if (init && init.method && init.method !== 'GET') {
      escritas.push({ metodo: init.method, url: u.pathname, corpo: JSON.parse(init.body), auth: init.headers.Authorization || null });
      if (u.pathname.endsWith('/tickets/generic')) criada = { id: 'novo-guid', identifier: 1501, subject: JSON.parse(init.body).subject, clientExpanded: { id: 'cli-guid', name: 'ACME' }, created: new Date().toISOString().slice(0, 19) };
      return respHttp(201, 'application/json', '');
    }
    if (u.pathname.endsWith('/company-department-access')) return json({ id: 'a', departmentId: 'depDP' });
    if (u.pathname.endsWith('/tickets/generic/ex1')) return json({ id: 'ex1', serviceRequestType: 'TIPO_GERAL', requestWay: 'WEB', departmentId: 'depEx', subject: 'outro' });
    if (u.pathname.endsWith('/tickets/generic')) return json({ items: u.searchParams.get('searchText') ? (criada ? [criada] : []) : [exemplo], totalItems: 1 });
    if (u.pathname.endsWith('/prior-notice-vacations')) return json({ items: [origem], totalItems: 1 });
    return json({ items: [] });
  };
  const { ctx, ouvintes, store } = carregarBackground({ abas: [aba(5, ONVIO_PORTAL)], fetchPorMundo: { MAIN: api }, fetch: api });
  ctx.__controlOnvioAutorizacao = () => 'Bearer x';
  const pedir = m => new Promise(res => ouvintes[0](m, { tab: { id: 5 } }, res));
  const r = await pedir({ cmd: 'criar', origem: { type: 'avisoFerias', num: 901 }, assunto: 'Cálculo de férias pendente · Fulano', descricao: 'Falta o cálculo', passarVez: true });
  assert.equal(r.ok, true, r.erro);
  assert.deepEqual([r.num, r.tramite, r.erroTramite], ['1501', true, null]);
  assert.deepEqual(plano(escritas.map(e => [e.metodo, e.url])), [['POST', '/api/service-requesting/v1/tickets/generic'], ['POST', '/api/service-requesting/v1/tickets/novo-guid/topics']]);
  assert.deepEqual(plano(escritas[0].corpo), { serviceRequestType: 'TIPO_GERAL', clientExpanded: { id: 'cli-guid' }, departmentId: 'depDP', description: 'Falta o cálculo', subject: 'Cálculo de férias pendente · Fulano', requestWay: 'WEB', requesterExpanded: {} });
  assert.equal(escritas[0].auth, 'Bearer x');
  assert.deepEqual(plano(escritas[1].corpo), { description: 'Aguardando o retorno do cliente.', status: 4 });
  assert.ok(!JSON.stringify(store).includes('Falta o cálculo') && !JSON.stringify(store).includes('TIPO_GERAL'), 'nada da criação é guardado');
  // sem cliente, sem assunto: nada é enviado
  const r2 = await pedir({ cmd: 'criar', assunto: 'x', descricao: 'y' });
  assert.equal(r2.ok, false); assert.match(r2.erro, /escolha o cliente/);
  const r3 = await pedir({ cmd: 'criar', origem: { type: 'avisoFerias', num: 901 }, assunto: '', descricao: 'y' });
  assert.match(r3.erro, /escreva o assunto/);
  assert.equal(escritas.length, 2);
});

test('background: ação manda o trâmite pela aba do Onvio, com a autorização da página, e o anexo no trâmite criado', async () => {
  const base = apiSimulada({ itens: { geral: [pend('g1', 77, { departmentId: 'dep1' })] } });
  const escritas = [];
  const api = async (url, init) => {
    if (init && init.method && init.method !== 'GET') {
      const corpo = init.body instanceof FormData ? [...init.body.entries()].map(([k, v]) => k + '=' + v.name + ':' + v.size) : JSON.parse(init.body);
      escritas.push({ metodo: init.method, url: new URL(url).pathname, auth: init.headers.Authorization || null, corpo });
      const r = respHttp(201, 'application/json', '');
      if (/\/topics$/.test(url)) r.headers.set ? r.headers.set('location', url + '/top9') : null;
      return Object.assign(r, { headers: { get: k => (k === 'location' && /\/topics$/.test(url) ? url + '/top9' : k === 'content-type' ? 'application/json' : null) } });
    }
    return base(url);
  };
  const { ctx, ouvintes, store } = carregarBackground({ abas: [aba(5, ONVIO_PORTAL)], fetchPorMundo: { MAIN: api }, fetch: api });
  ctx.__controlOnvioAutorizacao = () => 'Bearer x';
  const pedir = m => new Promise(res => ouvintes[0](m, { tab: { id: 5 } }, res));
  const arq = { nome: 'recibo.txt', tipo: 'text/plain', b64: Buffer.from('ola').toString('base64') };
  const r = await pedir({ cmd: 'acao', acao: 'tramite', type: 'geral', num: 77, texto: 'Segue', situacao: 4, arquivos: [arq] });
  assert.equal(r.ok, true, r.erro);
  assert.equal(r.anexos, 1);
  assert.deepEqual(plano(escritas.map(e => [e.metodo, e.url])), [['POST', '/api/service-requesting/v1/tickets/g1/topics'], ['POST', '/api/service-requesting/v1/tickets/g1/topics/top9/attachments']]);
  assert.deepEqual(plano(escritas[0].corpo), { description: 'Segue', status: 4 });
  assert.equal(escritas[0].auth, 'Bearer x', 'usa a autorização que a própria página do Onvio usa');
  assert.deepEqual(plano(escritas[1].corpo), ['file[]=recibo.txt:3']);
  assert.ok(!Object.keys(store).some(k => /acao|texto|anexo/i.test(k)), 'nada da ação é guardado');
  // responsável na folha e erro do Onvio visível
  const r2 = await pedir({ cmd: 'acao', acao: 'responsavel', type: 'geral', num: 77, analista: 'u9' });
  assert.equal(r2.ok, true);
  assert.deepEqual(plano(escritas[2]), { metodo: 'PUT', url: '/api/service-requesting/v1/tickets/generic/g1/assign-staff', auth: 'Bearer x', corpo: { departmentId: 'dep1', id: 'u9' } });
  const r3 = await pedir({ cmd: 'acao', acao: 'tramite', type: 'geral', num: 77, texto: 'x', situacao: 3 });
  assert.equal(r3.ok, false);
  assert.match(r3.erro, /escolha a situação/);
  assert.equal(escritas.length, 3, 'pedido inválido não sai');
});

test('background: ação recusada pelo Onvio, sem aba ou com acesso de cliente não escreve', async () => {
  const base = apiSimulada({ itens: { geral: [pend('g1', 77)] } });
  let escritas = 0;
  const api = async (url, init) => { if (init && init.method && init.method !== 'GET') { escritas++; return respHttp(403, 'application/json', '{}'); } return base(url); };
  const { ouvintes } = carregarBackground({ abas: [aba(5, ONVIO_PORTAL)], fetchPorMundo: { MAIN: api }, fetch: api });
  const r = await new Promise(res => ouvintes[0]({ cmd: 'acao', acao: 'tramite', type: 'geral', num: 77, texto: 'x', situacao: 4 }, { tab: { id: 5 } }, res));
  assert.equal(r.ok, false);
  assert.match(r.erro, /o Onvio recusou a ação \(HTTP 403\)/);
  assert.equal(escritas, 1);
  const sem = carregarBackground({ abas: [], fetch: api });
  const r2 = await new Promise(res => sem.ouvintes[0]({ cmd: 'acao', acao: 'tramite', type: 'geral', num: 77, texto: 'x', situacao: 4 }, {}, res));
  assert.equal(r2.ok, false);
  assert.equal(escritas, 1, 'sem aba do Onvio nada é enviado');
});

/* ---------- v0.15: Hoje (admissões, vencimentos, uso do portal, sugestões, previsão) ---------- */
test('admissão: retroativa, já passada ou perto do início destaca; cadastro efetuado não', () => {
  const now = new Date(2026, 9, 16, 10);   // sexta
  const it = (admissao, extra) => Object.assign({ type: 'cadEmpregado', code: 2, lado: 'esc', status: 'Enviado para o escritório', created: '2026-10-14T12:00:00', last: '2026-10-15T12:00:00', admissao }, extra || {});
  const retro = OC.evaluate(it('2026-10-10'), {}, now);
  assert.deepEqual(plano(retro.admissaoAlerta), { data: '2026-10-10', faltam: -4, retro: true });
  assert.ok(retro.motivos.some(m => m.n === 2 && /Admissão retroativa: início em 10\/10/.test(m.m)));
  const passou = OC.evaluate(it('2026-10-15', { created: '2026-10-01T12:00:00' }), {}, now);
  assert.equal(passou.admissaoAlerta.retro, false);
  assert.ok(passou.motivos.some(m => /já passou/.test(m.m)));
  const segunda = OC.evaluate(it('2026-10-19'), {}, now);
  assert.deepEqual([segunda.admissaoAlerta.faltam, segunda.nivel], [1, 2], 'segunda-feira: eSocial na sexta (hoje)');
  const quarta = OC.evaluate(it('2026-10-21'), {}, now);
  assert.deepEqual([quarta.admissaoAlerta, quarta.nivel], [null, 0], 'quarta: 3 d.u., fora da janela de 2');
  assert.equal(OC.evaluate(it('2026-10-10', { code: 5, lado: 'cli' }), {}, now).admissaoAlerta, null, 'cadastro efetuado');
  // estagiário: o eSocial vai até 15 dias corridos depois do início; começar antes do pedido ou já ter começado não é atraso
  const est = (admissao, extra) => it(admissao, Object.assign({ type: 'cadEstagiario' }, extra || {}));
  const ontem = OC.evaluate(est('2026-10-15'), {}, now);
  assert.deepEqual([ontem.admissaoAlerta, ontem.nivel], [null, 0], 'estágio começou ontem: prazo em 30/10, longe');
  const perto = OC.evaluate(est('2026-10-04', { created: '2026-10-14T12:00:00' }), {}, now);
  assert.deepEqual(plano(perto.admissaoAlerta), { data: '2026-10-04', prazo: '2026-10-19', faltam: 1, retro: false, estagio: true }, 'retroativo mas dentro do prazo: só avisa a 2 d.u. do prazo');
  assert.deepEqual([perto.nivel, perto.motivos[0].m], [1, 'Estágio: eSocial até 19/10 (15 dias após o início)']);
  const venceu = OC.evaluate(est('2026-09-30'), {}, now);
  assert.deepEqual([venceu.admissaoAlerta.faltam < 0, venceu.nivel], [true, 2]);
  assert.match(venceu.motivos[0].m, /prazo do eSocial \(15\/10\) já passou/);
  assert.equal(OC.evaluate(est('2026-10-04'), { estagiarioPrazoDias: 30 }, now).admissaoAlerta, null, 'o prazo vem das regras');
  assert.equal(OC.normalizarRegras({ prazos: { estagiarioPrazoDias: 20 } }).config.estagiarioPrazoDias, 20);
  assert.equal(OC.normalize(OC.TYPE_BY_KEY.cadEmpregado, { id: 'x', identifier: 1, genericStatus: 2, admissionDate: '2026-10-20T00:00:00', name: 'F' }, null, []).admissao, '2026-10-20');
  assert.equal(OC.normalize(OC.TYPE_BY_KEY.geral, { id: 'x', identifier: 1, genericStatus: 2, admissionDate: '2026-10-20T00:00:00' }, null, []).admissao, null);
  const lista = OC.admissoesCriticas([{ k: 'a', admissaoAlerta: { faltam: 2, retro: false } }, { k: 'b' }, { k: 'c', admissaoAlerta: { faltam: -4, retro: true } }, { k: 'd', admissaoAlerta: { faltam: 0, retro: false } }]);
  assert.deepEqual(plano(lista.map(x => x.k)), ['c', 'd', 'a'], 'retroativas primeiro, depois a mais perto');
  // só as que o escritório ainda não tramitou
  const al = { faltam: -1, retro: true };
  const cad = (k, code, extra) => Object.assign({ k, type: 'cadEmpregado', code, admissaoAlerta: al }, extra || {});
  assert.deepEqual(plano(OC.admissoesCriticas([cad('sem', 1), cad('env', 2), cad('aguarda', 3), cad('resp', 4), cad('encam', 7), cad('respLido', 4, { primeiroTramite: '2026-10-10T10:00:00' })]).map(x => x.k)), ['sem', 'env', 'resp'],
    'Aguardando o cliente e Encaminhado são situações do escritório; trâmite do escritório lido também tira');
  assert.equal(OC.escritorioTramitou({ type: 'cadEstagiario', code: 2 }), false);
  assert.equal(OC.escritorioTramitou({ type: 'cadEstagiario', code: 3 }), true);
});

test('Hoje: vencimentos legais na janela, uso errado do portal por empresa e sugestões de ação', () => {
  const now = new Date(2026, 9, 16, 10);
  const v = OC.vencimentosLegais([
    { k: 'a', lado: 'esc', pagamentoAte: { alvo: '2026-10-20', ref: 'x' } },
    { k: 'b', lado: 'cli', pagamentoAte: { alvo: '2026-10-16', ref: 'y' } },
    { k: 'c', lado: 'esc', pagamentoAte: { alvo: '2026-12-01', ref: 'z' } },
    { k: 'd', lado: 'fim', pagamentoAte: { alvo: '2026-10-16', ref: 'w' } }
  ], {}, now);
  assert.deepEqual(plano(v.map(x => [x.item.k, x.faltam])), [['b', 0], ['a', 2]]);
  const it = (k, o) => Object.assign({ k, type: 'geral', lado: 'esc', codCliente: 1, cliente: 'ACME', apelido: 'ACME', parado: 1, resp: 'Ana' }, o);
  const uso = OC.malUso([
    it('a', { abaProvavel: { label: 'Aviso de férias' } }),
    it('b', { type: 'avisoFerias', detalhe: 'Fulano' }), it('c', { type: 'avisoFerias', detalhe: 'fulano ' }),
    it('d', { lado: 'cli', parado: 20 }),
    it('e', { codCliente: 2, cliente: 'BETA', apelido: 'BETA' })
  ], {});
  assert.equal(uso.length, 1, 'BETA sem sinais fica de fora');
  assert.deepEqual(plano(uso[0].motivos), ['1 na lista Geral com aba própria', '2 pedidos repetidos em aberto', '1 parada esperando o cliente há mais de 15 dias']);
  const sug = OC.sugestoesAcoes([it('a', { grav: 3 }), it('b', { resp: '' }), it('c', { lado: 'cli', prescreveEm: 3 })], { admissoes: [{}], semCalculo: [{}, {}], vencimentos: [{ faltam: 0 }, { faltam: 5 }] });
  assert.deepEqual(plano(sug.map(x => x.k + '=' + x.n)), ['admissao=1', 'g3=1', 'pagamento=1', 'semcalc=2', 'semresp=1', 'prescreve=1']);
  assert.equal(sug.find(x => x.k === 'semresp').link, '#/distribuir');
});

test('previsão por empresa: média por semana, tendência e estimativa; o service worker calcula sem gravar', async () => {
  const now = new Date('2026-10-16T12:00:00Z');
  const dia = n => new Date(now.getTime() - n * 864e5).toISOString().slice(0, 19);
  const x = (cod, n, tipo) => ({ codCliente: cod, cliente: 'C' + cod, apelido: 'C' + cod, created: dia(n), typeLabel: tipo || 'Geral' });
  const itens = [x(1, 1), x(1, 2), x(1, 3), x(1, 5), x(1, 9, 'Cálculo de férias'), x(1, 20), x(2, 25), x(2, 26), x(2, 3), x(3, 40)];
  const p = OC.previsaoPorEmpresa(itens, now, 28);
  assert.equal(p.total, 9, 'a de 40 dias fica de fora');
  const c1 = p.empresas.find(e => e.cliente === 'C1');
  assert.deepEqual(plano([c1.total, c1.porSemana, c1.tendencia, c1.tipos[0].tipo]), [6, 1.5, 'sobe', 'Geral']);
  assert.ok(c1.prox30 >= c1.prox7 && c1.prox7 >= 1);
  assert.equal(p.empresas[0].cliente, 'C1', 'mais pedidos previstos primeiro');
  const api = apiSimulada({ itens: { geral: [pend('g1', 1)] } });
  const { ouvintes, store } = carregarBackground({ abas: [aba(5, ONVIO_PORTAL)], fetchPorMundo: { MAIN: api }, fetch: api });
  const r = await new Promise(res => ouvintes[0]({ cmd: 'previsao' }, { tab: { id: 5 } }, res));
  assert.equal(r.ok, true);
  assert.equal(r.dias, 28);
  assert.equal(r.empresas[0].cliente, 'ACME');
  assert.deepEqual(Object.keys(store).filter(k => !['metodoLeitura', 'perfilSessao'].includes(k)), [], 'nada é gravado');
});

test('avaliação da equipe: entregas no período, % no prazo, carteira em dia, cuidado, agilidade, nota e comparação', () => {
  const now = new Date(2026, 9, 16, 10);   // sexta, 16/10
  const fim = (resp, type, criada, concluida, extra) => Object.assign({ k: type + ':' + resp + criada + concluida, type, resp, lado: 'fim', status: 'Concluído', created: criada + 'T09:00:00', last: concluida + 'T15:00:00' }, extra || {});
  const mov = [
    fim('Ana', 'geral', '2026-10-13', '2026-10-14'),          // 1 d.u.: no prazo (3)
    fim('Ana', 'calcFerias', '2026-10-06', '2026-10-15'),     // 6 d.u.: fora do prazo (5)
    fim('Ana', 'geral', '2026-10-01', '2026-10-05'),          // período anterior (antes de 10/10)
    fim('Bia', 'geral', '2026-10-12', '2026-10-13'),
    fim('Bia', 'geral', '2026-10-12', '2026-10-15', { status: 'Prescrita', k: 'geral:prescrita' }),
    fim('Bia', 'geral', '2026-10-12', '2026-10-15'),
    { k: 'geral:aberta', type: 'geral', resp: 'Bia', lado: 'esc', status: 'Em análise', last: '2026-10-15T10:00:00' }   // movimentada, não concluída: não conta
  ];
  const pend = [
    { k: 'p1', type: 'geral', resp: 'Ana', lado: 'esc', nivel: 0, grav: 0, parado: 1, ptUteis: 1 },
    { k: 'p2', type: 'geral', resp: 'Ana', lado: 'esc', nivel: 2, grav: 3, parado: 20, ptUteis: 3 },
    { k: 'p3', type: 'geral', resp: 'Bia', lado: 'cli', nivel: 0, grav: 0, parado: 2 },
    { k: 'p4', type: 'geral', resp: '', lado: 'esc', nivel: 0, grav: 0, parado: 0 }
  ];
  const r = OC.avaliarEquipe(pend, mov, {}, 7, now);
  assert.deepEqual([r.de, r.ate], ['2026-10-10', '2026-10-16']);
  const ana = r.analistas.find(a => a.resp === 'Ana'), bia = r.analistas.find(a => a.resp === 'Bia');
  assert.deepEqual([ana.concluidas, ana.noPrazo, ana.pctNoPrazo, ana.tempoMedio, ana.estimadas], [2, 1, 50, 3.5, 2], 'sem os trâmites lidos, o tempo é estimado (abertura à conclusão)');
  assert.deepEqual([ana.carteira, ana.esc, ana.pctEmDia, ana.g3, ana.g3Esc, ana.paradas, ana.primeiroTramite], [2, 2, 50, 1, 1, 1, 2]);
  assert.deepEqual(plano(ana.brutos), { pontualidade: 50, ritmo: 75, emDia: 50, cuidado: 75, agilidade: 75 }, 'valores próprios');
  assert.deepEqual(plano(ana.componentes), { pontualidade: 68, ritmo: 75, emDia: 62, cuidado: 75, agilidade: 75 }, 'com 2 entregas (mínimo 5), puxados para a média da equipe');
  assert.equal(ana.nota, Math.round((68 * 30 + 75 * 10 + 62 * 25 + 75 * 20 + 75 * 15) / 100));
  assert.deepEqual(plano([ana.anterior.concluidas, ana.variacao.concluidas]), [1, 1]);
  assert.deepEqual(plano(ana.atencao.map(i => i.k)), ['p2'], 'crítica e parada vão para os pontos de atenção');
  assert.deepEqual(plano(ana.foraDoPrazo.map(x => [x.tempo, x.prazo, x.estimado])), [[6, 5, true]]);
  assert.deepEqual([bia.concluidas, bia.prescritas, bia.prescSemCobranca, bia.brutos.emDia, bia.brutos.agilidade], [2, 1, 1, null, null]);
  assert.deepEqual([bia.componentes.emDia, bia.componentes.agilidade], [r.equipe.brutos.emDia, r.equipe.brutos.agilidade], 'sem dado: recebe o valor da equipe (não some da conta)');
  assert.deepEqual([ana.poucosDados, ana.pos, bia.poucosDados, bia.pos], [true, null, true, null], 'menos de 5 entregas: sem posição no ranking');
  assert.equal(r.analistas.some(a => a.resp === '(sem responsável)'), false);
  assert.deepEqual([r.equipe.concluidas, r.equipe.carteira, r.equipe.prescritas], [4, 4, 1]);
  assert.deepEqual(plano(r.medianas), { geral: 1, calcFerias: 6 }, 'tempo normal da equipe por tipo');
  assert.deepEqual(plano(ana.porDia.map(d => d.n)), [0, 0, 0, 0, 1, 1, 0], 'entregas por dia do período');
  assert.equal(OC.faixaNota(90).rot, 'Excelente');
  assert.equal(OC.faixaNota(40).rot, 'Precisa de apoio');
  assert.equal(OC.faixaNota(null).k, 'sem');
});

// trâmites simulados: status 1 abertura (cliente), 3 aguardando resposta (cliente respondeu), 4 respondido (vez do cliente), 5 concluído
const tr = (em, status, autor) => ({ created: em, status, createdByContactExpanded: { name: autor || 'Cliente' } });
test('avaliação justa: só o tempo com o escritório conta, a entrega é de quem concluiu e a cobrança ao cliente aparece', () => {
  const t = OC.TYPE_BY_KEY.geral;
  const item = { k: 'geral:x', type: 'geral', created: '2026-10-01T09:00:00', last: '2026-10-14T15:00:00' };
  // qui 01/10 abre; sex 02/10 o escritório pede documentos (vez do cliente); qua 07/10 o escritório cobra;
  // ter 13/10 o cliente manda; qua 14/10 a Bia conclui
  const a = OC.analisarEntrega([tr('2026-10-01T09:00:00', 1), tr('2026-10-02T10:00:00', 4, 'Ana'), tr('2026-10-07T10:00:00', 4, 'Ana'), tr('2026-10-13T10:00:00', 3), tr('2026-10-14T15:00:00', 5, 'Bia')], t, item, {});
  assert.deepEqual(plano(a), { e: 2, p: 1, a: 'Bia', c: true }, '1 d.u. até pedir + 1 d.u. depois da resposta; a espera de 6 d.u. pelo cliente não conta');
  // a mesma entrega na conta: no prazo (2 ≤ 3), e para a Bia (quem concluiu), não para a Ana (responsável)
  const ent = Object.assign({ resp: 'Ana', lado: 'fim', status: 'Concluído' }, item);
  const r = OC.avaliarEquipe([{ k: 'p', type: 'geral', resp: 'Bia', lado: 'esc', nivel: 0, parado: 0 }], [ent], {}, 7, new Date(2026, 9, 16, 10), { analises: { 'geral:x': a } });
  const bia = r.analistas.find(x => x.resp === 'Bia');
  assert.deepEqual([bia.concluidas, bia.noPrazo, bia.estimadas, bia.tempoMedio], [1, 1, 0, 2]);
  assert.equal((r.analistas.find(x => x.resp === 'Ana') || { concluidas: 0 }).concluidas, 0);
  const sem = OC.avaliarEquipe([], [ent], {}, 7, new Date(2026, 9, 16, 10));
  assert.deepEqual([sem.analistas[0].resp, sem.analistas[0].noPrazo, sem.analistas[0].estimadas], ['Ana', 0, 1], 'sem leitura: tempo total, estimado, crédito ao responsável');
  // resolvida (sem trâmite de conclusão): conta até a última movimentação
  const b = OC.analisarEntrega([tr('2026-10-05T09:00:00', 1), tr('2026-10-06T09:00:00', 4, 'Ana')], t, { created: '2026-10-05T09:00:00', last: '2026-10-06T09:00:00' }, {});
  assert.deepEqual(plano(b), { e: 1, p: 1, a: '', c: false });
});

test('avaliação justa: volume e amostra, atrasos do cliente, cuidado proporcional, agilidade com as sem resposta e exceções', () => {
  const now = new Date(2026, 9, 16, 12);
  const d = n => { const x = new Date(now); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 19); };
  const pend = (resp, n, extra) => Array.from({ length: n }, (_, i) => Object.assign({ k: resp + 'p' + i + JSON.stringify(extra || {}), type: 'geral', resp, lado: 'esc', nivel: 0, grav: 1, parado: 1, status: 'Em análise' }, extra || {}));
  const ent = (resp, n, dias, pre) => Array.from({ length: n }, (_, i) => ({ k: resp + (pre || '') + 'e' + i, type: 'geral', resp, lado: 'fim', status: 'Concluído', created: d(dias + 1), last: d(1) }));
  // 2 entregas perfeitas não passam na frente de 40 entregas com 90% no prazo
  const r1 = OC.avaliarEquipe([...pend('Ana', 3), ...pend('Bia', 54), ...pend('Bia', 6, { nivel: 1 }), ...pend('Bia', 2, { grav: 3, nivel: 2 })], [...ent('Ana', 2, 1), ...ent('Bia', 36, 1), ...ent('Bia', 4, 8, 'x')], {}, 7, now);
  assert.deepEqual(plano(r1.analistas.map(a => [a.resp, a.pos])), [['Bia', 1], ['Ana', null]], 'quem tem poucas entregas fica sem posição');
  const bia = r1.analistas[0];
  assert.ok(bia.componentes.cuidado >= 85, '2 críticas em 102 solicitações pesam pouco (proporcional): ' + bia.componentes.cuidado);
  // sem entregas não tira 100
  const r2 = OC.avaliarEquipe([...pend('Eva', 2), ...pend('Fabi', 30)], [...ent('Fabi', 20, 1)], {}, 7, now);
  const eva = r2.analistas.find(a => a.resp === 'Eva');
  assert.equal(eva.poucosDados, true);
  assert.equal(eva.componentes.pontualidade, r2.equipe.brutos.pontualidade, 'sem entregas, a pontualidade é a da equipe');
  // atraso de origem do cliente não tira "em dia"
  const cli = pend('Gil', 4, { nivel: 2, motivos: [{ n: 2, m: 'Admissão retroativa', o: 'cli' }] });
  const esc = pend('Gil', 1, { nivel: 2, motivos: [{ n: 2, m: 'Parada há 20 dias' }] });
  const gil = OC.avaliarEquipe([...cli, ...esc], [], {}, 7, now).analistas[0];
  assert.equal(gil.brutos.emDia, 80, '4 de 5 em dia: só a parada é do escritório');
  // agilidade: "Sem análise" há 4 d.u. conta como 4 d.u. (antes ficava de fora)
  const h = OC.avaliarEquipe(pend('Hugo', 1, { status: 'Sem análise', uteisAberto: 4 }), [], {}, 7, now).analistas[0];
  assert.deepEqual([h.primeiroTramite, h.brutos.agilidade], [4, 25]);
  // exceção do gestor tira o caso da conta
  const r3 = OC.avaliarEquipe(esc, [], {}, 7, now, { excecoes: { [esc[0].k]: '2026-10-16' } });
  assert.deepEqual([r3.excluidas, r3.analistas.length], [1, 0]);
  // pesos e mínimo pelas regras do escritório (o ajuste da pessoa não muda)
  const reg = OC.normalizarRegras({ avaliacao: { pesos: { pontualidade: 50, ritmo: 0 }, minEntregas: 2 } });
  const s = OC.combinarSettings({ regras: reg }, { pesosNota: { pontualidade: 1 }, avaliacaoMinEntregas: 99 });
  assert.deepEqual([s.pesosNota.pontualidade, s.pesosNota.ritmo, s.pesosNota.emDia, s.avaliacaoMinEntregas], [50, 0, 25, 2]);
  assert.equal(OC.avaliarEquipe(pend('Ana', 1), ent('Ana', 2, 1), s, 7, now).analistas[0].pos, 1, 'com mínimo 2, duas entregas já entram');
});

test('avaliação justa: o service worker lê os trâmites das entregas (com cache só de números) e o Distribuir credita quem concluiu', async () => {
  const lidas = [];
  const f = async url => { lidas.push(url); return { items: [tr('2026-10-12T09:00:00', 1), tr('2026-10-13T09:00:00', 5, 'Bia')] }; };
  const e1 = { k: 'geral:a', id: 'a', type: 'geral', resp: 'Ana', lado: 'fim', created: '2026-10-12T09:00:00', last: '2026-10-13T09:00:00' };
  const e2 = Object.assign({}, e1, { k: 'geral:b', id: 'b' });
  const r = await OC.analisarEntregas(f, [e1, e2], { 'geral:b': { l: e2.last, e: 9, p: 1, a: 'Ana', c: false } }, {});
  assert.equal(lidas.length, 1, 'o que está no cache e não mudou não é lido de novo');
  assert.deepEqual(plano(r.analises['geral:a']), { l: e1.last, e: 1, p: 1, a: 'Bia', c: false });
  assert.ok(!JSON.stringify(r.analises).match(/description|texto|cliente/i), 'o cache não leva texto');
  const cred = OC.creditarQuemConcluiu([e1, { k: 'x', resp: 'Bia', lado: 'esc' }], r.analises);
  assert.equal(cred[0].resp, 'Bia', 'concluída vale para quem concluiu (alguém da equipe)');
  assert.equal(OC.creditarQuemConcluiu([e1], { 'geral:a': { a: 'Fulano de fora' } })[0].resp, 'Ana', 'autor desconhecido: fica com o responsável');
});

test('motivos de origem do cliente: admissão retroativa e prazo que inclui a espera pelo cliente ficam marcados', () => {
  const now = new Date(2026, 9, 16, 10);
  const adm = OC.evaluate({ type: 'cadEmpregado', lado: 'esc', status: 'Enviado para o escritório', code: 2, created: '2026-10-14T09:00:00', last: '2026-10-14T09:00:00', admissao: '2026-10-10' }, {}, now);
  assert.equal(adm.motivos.find(m => /retroativa/.test(m.m)).o, 'cli');
  const resp = OC.evaluate({ type: 'geral', lado: 'esc', status: 'Aguardando resposta', created: '2026-10-01T09:00:00', last: '2026-10-15T09:00:00' }, {}, now);
  assert.equal(resp.motivos.find(m => /Aberta há/.test(m.m)).o, 'cli', 'o cliente respondeu depois: o tempo aberto inclui a espera');
  const nosso = OC.evaluate({ type: 'geral', lado: 'esc', status: 'Em análise', created: '2026-10-01T09:00:00', last: '2026-10-15T09:00:00' }, {}, now);
  assert.equal(nosso.motivos.find(m => /Aberta há/.test(m.m)).o, undefined);
});

test('área do gestor: a senha fica só como resumo SHA-256; regras podem trocar, ajustes da pessoa não', () => {
  const crypto = require('node:crypto');
  assert.equal(OC.DEFAULTS.senhaGestorSha256, crypto.createHash('sha256').update('gestor@987654321').digest('hex'));
  assert.ok(!fs.readFileSync(path.join(EXT, 'core.js'), 'utf8').includes('gestor@987654321'), 'o texto da senha não está no código');
  const outro = crypto.createHash('sha256').update('outra').digest('hex');
  const regras = OC.normalizarRegras({ senhaGestorSha256: outro.toUpperCase() });
  assert.equal(regras.senhaGestorSha256, outro);
  assert.equal(OC.combinarSettings({ regras }, { senhaGestorSha256: 'a'.repeat(64) }).senhaGestorSha256, outro, 'ajuste da pessoa não troca a senha');
  assert.equal(OC.normalizarRegras({ senhaGestorSha256: 'texto' }), null);
});

test('detalhe em português: campos e códigos do Onvio traduzidos; o que não tem tradução aparece como veio', () => {
  assert.equal(OC.traduzirCampo('lastWorkDay'), 'Último dia trabalhado');
  assert.equal(OC.traduzirCampo('workScheduleType'), 'Tipo de horário de trabalho', 'palavra por palavra, na ordem do português');
  assert.equal(OC.traduzirCampo('costCenterCode'), 'Código de centro de custo');
  assert.equal(OC.traduzirCampo('fooBarBaz'), 'Foo bar baz', 'sem tradução de tudo: não mistura idiomas');
  assert.equal(OC.traduzirValor('x', 'PRIOR_NOTICE_TERMINATION'), 'Aviso prévio de rescisão');
  assert.equal(OC.traduzirValor('x', 'SICK_LEAVE'), 'Afastamento por doença');
  assert.equal(OC.traduzirValor('x', 'WEB'), 'Portal (web)');
  assert.equal(OC.traduzirValor('x', 'XPTO_ABC'), 'XPTO_ABC');
  const d = OC.camposDetalhe(OC.TYPE_BY_KEY.calcRescisao, { terminationType: 'WITHOUT_CAUSE', lastWorkDay: '2026-10-10T00:00:00', noticeType: 'INDEMNIFIED' });
  const txt = JSON.stringify(plano(d.grupos));
  assert.match(txt, /Tipo de rescisão.*Sem justa causa/);
  assert.match(txt, /Último dia trabalhado.*10\/10\/2026/);
  assert.match(txt, /Tipo do aviso.*Indenizado/);
});

/* ---------- v0.23: nada de inglês na aba Dados ---------- */
test('aba Dados: campos e valores comuns do DP saem em português, e o desconhecido não leva a frase toda para o inglês', () => {
  const c = OC.camposDetalhe(OC.TYPE_BY_KEY.cadEmpregado, {
    maritalStatus: 'MARRIED', raceColor: 'WHITE', educationLevel: 'HIGH_SCHOOL_COMPLETE', zipCode: '01000-000', bankAccountType: 'CHECKING',
    contractType: 'UNDETERMINED', expectedReturnDate: '2026-12-01T00:00:00', previousEmployerXyzName: 'Empresa'
  });
  const princ = Object.fromEntries(c.grupos.flatMap(g => g.campos).map(x => [x.k, x.v]));
  assert.equal(princ['Raça/cor'], 'Branca');
  assert.equal(princ['Escolaridade'], 'Médio completo');
  assert.equal(princ['CEP'], '01000-000');
  assert.equal(princ['Tipo de contrato'], 'Prazo indeterminado');
  assert.equal(princ['Retorno previsto'], '01/12/2026');
  assert.ok('Estado civil' in princ, 'estado civil');
  const outro = Object.keys(princ).find(k => /xyz/i.test(k));
  assert.ok(outro && /empregador/i.test(outro) && !/employer|previous|name/i.test(outro), 'só a palavra desconhecida fica como veio: ' + outro);
  const conta = Object.keys(princ).find(k => /conta/i.test(k));
  assert.ok(conta && !/bank|account|type/i.test(conta), conta);
  assert.equal(princ[conta], 'Corrente');
  const d = Object.fromEntries(OC.camposDetalhe(OC.TYPE_BY_KEY.cadEmpregado, { educationLevel: 'highSchoolComplete', gender: 'not_informed', name: 'Ana Paula' }).grupos.flatMap(g => g.campos).map(x => [x.k, x.v]));
  assert.equal(d['Escolaridade'], 'Médio completo');
  assert.equal(d['Sexo'], 'Não informado');
  assert.equal(d['Nome'], 'Ana Paula', 'texto comum não é mexido');
});

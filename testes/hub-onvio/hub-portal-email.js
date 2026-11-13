/* Teste de navegador do Control Hub, módulo Portal do Cliente (Hub 354, Josué 13/11/2026): avisos e e-mail inicial.
 *  - empresa em foco 100% implementada: aviso no sino (uma vez), bloco "Implementação completa", "Marcar como avisada";
 *  - empresa que entra no foco: bloco "Boas-vindas ao Portal", janela do e-mail inicial (contatos por setor, Portal + Gestta),
 *    rascunho no Zimbra (nada é enviado sozinho), "Marcar como enviado" grava só {em, por, setores, n};
 *  - modelo editável pela coordenação; analista só vê as próprias empresas; consulta não vê nada.
 * Dados FICTÍCIOS, banco simulado (o mesmo de hub-onvio.js).
 *   HUB_DIR=<pasta do controlhub, com portal.html, portal.js, portal.css e tema.js> NODE_PATH=$(npm root -g) node testes/hub-onvio/hub-portal-email.js
 *   CAP=<pasta> grava capturas (claro e escuro). */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const HUB = process.env.HUB_DIR;
if (!HUB || !fs.existsSync(path.join(HUB, 'portal.js'))) { console.log('HUB_DIR não definido (pasta com portal.html e portal.js): teste do Portal pulado.'); process.exit(0); }
const CAP = process.env.CAP || '';
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8' };
const BANCO = fs.readFileSync(path.join(__dirname, 'hub-onvio.js'), 'utf8').match(/const BANCO = `([\s\S]*?)`;/)[1];
const PAI = `<!doctype html><html><head><meta charset="utf8"></head><body style="margin:0"><iframe id="m" style="width:1300px;height:880px;border:0"></iframe></body></html>`;
const servidor = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/pai.html') { res.writeHead(200, { 'content-type': MIME['.html'] }); return res.end(PAI); }
  const f = path.join(HUB, path.basename(u));
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});

const hoje = '2026-11-13T10:00:00.000Z', antigo = '2026-10-01T10:00:00.000Z';
const emp = (id, nome, extra) => ({ nome, cnpj: '11.222.333/0001-8' + id.slice(1), ativo: true, emFoco: true, emFocoEm: hoje, setoresDemanda: { pessoal: true, contabil: false, fiscal: true }, ...extra });
const frente = (e, setor, ana, trein) => ({ empresaId: e, empresaNome: e, setor, analistaNome: ana, etapas: trein ? { treinamentoAnalista: { status: 'concluido' }, habilitacaoDominio: { status: 'concluido' } } : {} });
const contato = (id, e, nome, email, setores, treinado) => ({ nome, email, empresaId: e, empresaNome: e, setores, statusTreinamento: treinado ? 'concluido' : 'pendente', concluidoEm: treinado ? '2026-11-10' : '' });
const SEMENTE = [
  ['empresas/e1', emp('e1', 'EMPRESA ALFA LTDA')],                                                                  // entrou no foco agora: e-mail inicial pendente
  ['empresas/e2', emp('e2', 'EMPRESA BETA LTDA', { emFocoEm: antigo })],                                             // já estava em foco: não pede
  ['empresas/e3', emp('e3', 'EMPRESA GAMA LTDA', { emailInicial: { em: hoje, por: 'x', setores: ['pessoal'], n: 1 }, habilitacao: { status: 'concluido', data: '2026-11-10' }, setoresDemanda: { pessoal: true, contabil: false, fiscal: false } })],   // 100%
  ['empresaSetores/e1_pessoal', frente('e1', 'pessoal', 'ANA TESTE', false)], ['empresaSetores/e1_fiscal', frente('e1', 'fiscal', 'BIA TESTE', false)],
  ['empresaSetores/e2_pessoal', frente('e2', 'pessoal', 'BIA TESTE', false)], ['empresaSetores/e2_fiscal', frente('e2', 'fiscal', 'BIA TESTE', false)],
  ['empresaSetores/e3_pessoal', frente('e3', 'pessoal', 'ANA TESTE', true)],
  ['contatos/c1', contato('c1', 'e1', 'Maria Souza', 'maria@alfa.exemplo.com.br', ['pessoal'], false)],
  ['contatos/c3', contato('c3', 'e3', 'Carlos Lima', 'carlos@gama.exemplo.com.br', ['pessoal'], true)]
];

let falhas = 0;
async function passo(nome, fn) { try { await fn(); console.log('ok   ' + nome); } catch (e) { falhas++; console.log('FALHA ' + nome + '\n     ' + String(e && e.message || e).split('\n').slice(0, 6).join(' | ')); } }

(async () => {
  await new Promise(r => servidor.listen(0, r));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'pt-BR' });
  await ctx.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await ctx.route('**/cdnjs.cloudflare.com/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  const zimbra = [];
  await ctx.route('https://mail.controltax.com.br/**', r => { zimbra.push(r.request().url()); r.fulfill({ status: 200, contentType: 'text/html', body: 'zimbra simulado' }); });
  const base = 'http://localhost:' + servidor.address().port;

  async function abrir(papel, opcoes) {
    const page = await ctx.newPage();
    const erros = []; page.on('pageerror', e => erros.push(String(e && e.message || e)));
    await page.addInitScript(BANCO);
    await page.addInitScript(([p, o]) => {
      window.__papel = p;
      window.__auth = { nivel: () => window.__papel.nivel, analista: () => window.__papel.analista, usuario: () => ({ id: 'u-teste', nome: 'Teste' }), perfis: async () => ({}), podeVer: () => true, aguardar: async () => ({}) };
      window.__hubApi = { notificar: (m) => (window.__sino = window.__sino || []).push(m) };
      if (o && o.gestta) window.__cadastro = { pronto: () => true, identidade: () => null, contatosGestta: (mod, id) => id === 'e1' ? [{ setor: 'fiscal', nome: 'João Fiscal', email: 'joao@alfa.exemplo.com.br' }] : [] };
      try { localStorage.setItem('controlhub-theme', (o && o.tema) || 'light'); } catch (e) {}
    }, [papel, opcoes || {}]);
    await page.goto(base + '/pai.html');
    await page.evaluate((s) => { for (const [p, d] of s) window.__db.semear(p, d); }, SEMENTE);
    await page.evaluate((u) => { document.getElementById('m').src = u; }, base + '/portal.html');
    const fr = page.frames().find(f => f !== page.mainFrame()) || await page.waitForEvent('frameattached');
    await fr.waitForSelector('button[data-view="foco"]');
    await fr.waitForFunction(() => !document.querySelector('#carregandoAviso') || document.querySelector('#carregandoAviso').hidden);
    await fr.click('button[data-view="foco"]');
    return { page, fr, erros };
  }
  const sino = (p) => p.evaluate(() => (window.__sino || []).map(m => m.t));

  let coord;
  await passo('coordenação: bloco "Boas-vindas" lista só a empresa que entrou no foco agora; bloco "Implementação completa" lista a 100%; avisos no sino saem uma vez e o carimbo fica no banco', async () => {
    coord = await abrir({ nivel: 'coord', analista: '' });
    const { page, fr } = coord;
    await fr.waitForSelector('.auto-email .auto-lin');
    assert.deepEqual(await fr.$$eval('.auto-email .auto-lin .auto-quem b', l => l.map(x => x.textContent)), ['EMPRESA ALFA LTDA'], 'a que já estava em foco antes e a que já recebeu não pedem o e-mail');
    assert.match(await fr.textContent('.auto-email .auto-lin small'), /Pessoal e Fiscal · ANA TESTE e BIA TESTE/);
    assert.deepEqual(await fr.$$eval('.auto-pronta .auto-lin .auto-quem b', l => l.map(x => x.textContent)), ['EMPRESA GAMA LTDA']);
    assert.equal(await fr.getAttribute('button[data-view="foco"]', 'data-n'), '2', 'contador na aba Foco');
    await page.waitForFunction(() => (window.__sino || []).filter(t => /Implementação completa|e-mail inicial/.test(t.t)).length >= 2, null, { timeout: 8000 });
    const avisos = (await sino(page)).filter(t => /Implementação completa|e-mail inicial/.test(t));
    assert.equal(avisos.length, 2, avisos.join(' | '));
    assert.ok(avisos.some(t => /Implementação completa: EMPRESA GAMA LTDA \(Pessoal\)\. Falta avisar o cliente\./.test(t)));
    assert.ok(avisos.some(t => /EMPRESA ALFA LTDA entrou em foco: falta enviar o e-mail inicial do Portal\./.test(t)));
    const bd = await page.evaluate(() => ({ e1: window.__db.ler('empresas/e1').emailInicialAvisoEm, e3: window.__db.ler('empresas/e3').implementadaAvisoEm }));
    assert.ok(bd.e1 && bd.e3, 'carimbos gravados no banco');
    await page.evaluate(() => { document.getElementById('m').src = document.getElementById('m').src; });       // recarrega o módulo: nada de aviso repetido
    await page.waitForTimeout(1500);
    assert.equal((await sino(page)).filter(t => /Implementação completa|e-mail inicial/.test(t)).length, 2, 'não repete');
  });

  await passo('janela do e-mail inicial: contatos por setor (Portal e Gestta), setor sem contato avisa, texto com o que o Josué pediu, rascunho do Zimbra, nada vai sozinho', async () => {
    await coord.page.close();
    coord = await abrir({ nivel: 'coord', analista: '' }, { gestta: true });
    const { page, fr } = coord;
    await fr.waitForSelector('.auto-email [data-action="ei-abrir"]');
    await fr.click('.auto-email [data-action="ei-abrir"][data-id="e1"]');
    await fr.waitForSelector('#eiBg .ei');
    assert.deepEqual(await fr.$$eval('.ei-setor h4', l => l.map(x => x.textContent)), ['Pessoal', 'Fiscal']);
    assert.match(await fr.locator('.ei-setor').nth(0).textContent(), /Maria Souza.*maria@alfa\.exemplo\.com\.br · Portal/);
    assert.match(await fr.locator('.ei-setor').nth(1).textContent(), /João Fiscal.*joao@alfa\.exemplo\.com\.br · Gestta/, 'o contato do Gestta entra onde o Portal ainda não tem');
    const assunto = await fr.inputValue('#eiAssunto'), corpo = await fr.inputValue('#eiCorpo');
    assert.equal(assunto, 'EMPRESA ALFA LTDA: conheça o Portal do Cliente da ControlTax e nos confirme seus contatos');
    for (const t of [/EMPRESA ALFA LTDA acaba de entrar no nosso Portal do Cliente/, /serviços de Pessoal e Fiscal/, /ANA TESTE e BIA TESTE acompanha/, /Pessoal:\n  - Maria Souza <maria@alfa\.exemplo\.com\.br>/, /Fiscal:\n  - João Fiscal <joao@alfa\.exemplo\.com\.br>/,
      /nome completo e o e-mail de quem mais deve ter acesso, indicando o setor/, /treinamento por ligação/, /enviar o manual/, /Mais segurança para os dois lados/, /centraliz/, /otimizar ainda mais os processos/])
      assert.match(corpo, t);
    assert.doesNotMatch(corpo, /assinad|termo de|recibo|atestado|requerimento|\{\w+\}/i, 'o texto padrão não pede documento assinado e não deixa variável sem preencher');
    const href = await fr.getAttribute('#eiZimbra', 'href');
    assert.match(href, /^https:\/\/mail\.controltax\.com\.br\/\?view=compose&to=maria%40alfa\.exemplo\.com\.br%2Cjoao%40alfa\.exemplo\.com\.br&subject=.*&body=/);
    assert.equal(await fr.textContent('#eiN'), '2 destinatários marcados');
    assert.equal(await fr.isDisabled('#eiEnviado'), true, 'só habilita depois de abrir o Zimbra ou copiar');
    if (CAP) await page.screenshot({ path: path.join(CAP, 'email-inicial-claro.png') });
    // desmarcar um destinatário tira dele do Para
    await fr.uncheck('input[data-k="joao@alfa.exemplo.com.br"]');
    assert.equal(await fr.textContent('#eiN'), '1 destinatário marcado');
    assert.doesNotMatch((await fr.getAttribute('#eiZimbra', 'href')).split('&subject=')[0], /joao/);
    // abrir o Zimbra: só abre o rascunho (a requisição é só o endereço; nada é enviado)
    const [pop] = await Promise.all([page.context().waitForEvent('page'), fr.click('#eiZimbra')]);
    await pop.waitForLoadState().catch(() => {});
    assert.equal(zimbra.length >= 1 && /\?view=compose&to=maria/.test(zimbra[zimbra.length - 1]), true);
    await pop.close();
    assert.equal(await fr.isDisabled('#eiEnviado'), false, 'depois de abrir o Zimbra');
    // marcar como enviado: só {em, por, setores, n}; nunca o texto nem os e-mails
    await fr.click('#eiEnviado');
    await fr.waitForSelector('#eiBg', { state: 'detached' });
    const reg = await page.evaluate(() => window.__db.ler('empresas/e1').emailInicial);
    assert.deepEqual(Object.keys(reg).sort(), ['em', 'n', 'por', 'setores']);
    assert.deepEqual([reg.setores, reg.n], [['pessoal', 'fiscal'], 1]);
    assert.doesNotMatch(JSON.stringify(await page.evaluate(() => window.__db.ler('empresas/e1'))), /@|conheça o Portal/, 'nada de e-mail nem texto no banco');
    assert.deepEqual(await fr.$$eval('.auto-email .auto-lin', l => l.length), 0, 'sai da pendência');
    assert.match(await fr.textContent('#eiOutra'), /EMPRESA ALFA LTDA \(já enviado\)/, 'dá para montar de novo');
  });

  await passo('texto longo: o Zimbra abre só com assunto e destinatários e o texto vai para a área de transferência; Desfazer do "enviado" devolve a pendência', async () => {
    const { page, fr } = coord;
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await fr.selectOption('#eiOutra', 'e1');
    await fr.waitForSelector('#eiBg .ei');
    await fr.fill('#eiCorpo', 'x'.repeat(9000));
    assert.equal(await fr.isVisible('#eiAviso'), true);
    assert.doesNotMatch(await fr.getAttribute('#eiZimbra', 'href'), /body=/);
    await fr.click('[data-action="ei-fechar"]');
    await fr.waitForSelector('#eiBg', { state: 'detached' });
    // a pendência volta se o envio for desfeito
    await fr.selectOption('#eiOutra', 'e1'); await fr.waitForSelector('#eiBg .ei');
    await fr.click('[data-action="ei-copiar-txt"]');
    assert.equal(await fr.isDisabled('#eiEnviado'), false, 'copiar também libera');
    await fr.click('#eiEnviado');
    await fr.waitForSelector('.toast-act', { timeout: 4000 });
    await fr.click('.toast-act');
    await fr.waitForSelector('.auto-email .auto-lin');
    assert.equal(await page.evaluate(() => window.__db.ler('empresas/e1').emailInicial), null);
  });

  await passo('modelo editável pela coordenação (assunto, texto e link do manual); restaurar o padrão', async () => {
    const { page, fr } = coord;
    await fr.click('.auto-email [data-action="ei-abrir"][data-id="e1"]'); await fr.waitForSelector('#eiBg .ei');
    await fr.click('.ei-modelo summary');
    await fr.fill('#eiMAssunto', 'Bem-vindos, {empresa}!');
    await fr.fill('#eiMCorpo', 'Olá, {empresa} ({setores}).\n\n{tabelaContatos}\n\nManual: {manual}');
    await fr.fill('#eiMManual', 'https://exemplo.com/manual.pdf');
    await fr.click('[data-action="ei-modelo-salvar"]');
    await fr.waitForFunction(() => document.getElementById('eiAssunto') && document.getElementById('eiAssunto').value === 'Bem-vindos, EMPRESA ALFA LTDA!');
    assert.match(await fr.inputValue('#eiCorpo'), /^Olá, EMPRESA ALFA LTDA \(Pessoal e Fiscal\)\.\n\nPessoal:[\s\S]*Manual: o manual \(https:\/\/exemplo\.com\/manual\.pdf\)$/);
    const cfg = await page.evaluate(() => window.__db.ler('portal_config/emailInicial'));
    assert.equal(cfg.assunto, 'Bem-vindos, {empresa}!'); assert.equal(cfg.manualUrl, 'https://exemplo.com/manual.pdf');
    await fr.click('.ei-modelo summary'); await fr.click('[data-action="ei-modelo-padrao"]');
    await fr.waitForFunction(() => /conheça o Portal do Cliente/.test(document.getElementById('eiAssunto').value));
    assert.equal((await page.evaluate(() => window.__db.ler('portal_config/emailInicial'))).assunto, '');
    await fr.click('[data-action="ei-fechar"]');
  });

  await passo('"Marcar como avisada" tira a empresa 100% do bloco (e Desfazer devolve)', async () => {
    const { page, fr } = coord;
    await fr.click('.auto-pronta [data-action="impl-ok"]');
    await fr.waitForFunction(() => !document.querySelector('.auto-pronta'));
    assert.ok((await page.evaluate(() => window.__db.ler('empresas/e3').implementadaOkEm)));
    await fr.click('.toast-act');
    await fr.waitForSelector('.auto-pronta .auto-lin');
    assert.equal(await page.evaluate(() => window.__db.ler('empresas/e3').implementadaOkEm), '');
  });

  await passo('Desligado de verdade: o mesmo vale nos dois temas (captura) e sem erros de página', async () => {
    if (CAP) {
      const { page } = coord; await page.screenshot({ path: path.join(CAP, 'foco-blocos-claro.png') });
      const esc = await abrir({ nivel: 'coord', analista: '' }, { tema: 'dark' });
      await esc.fr.waitForSelector('.auto-email .auto-lin'); await esc.page.waitForTimeout(1500); await esc.page.screenshot({ path: path.join(CAP, 'foco-blocos-escuro.png') });
      await esc.fr.click('.auto-email [data-action="ei-abrir"]'); await esc.fr.waitForSelector('#eiBg .ei'); await esc.page.screenshot({ path: path.join(CAP, 'email-inicial-escuro.png') });
      await esc.page.close();
    }
    assert.deepEqual(coord.erros, []);
  });

  await passo('analista: vê e monta só as empresas em que é o analista e não edita o modelo; consulta não vê nada nem gera aviso', async () => {
    const ana = await abrir({ nivel: 'analista', analista: 'ANA TESTE' });
    await ana.fr.waitForSelector('.auto-email .auto-lin');
    assert.deepEqual(await ana.fr.$$eval('.auto-email .auto-lin .auto-quem b', l => l.map(x => x.textContent)), ['EMPRESA ALFA LTDA']);
    assert.equal(await ana.fr.locator('#eiOutra option').count(), 1 + 1, 'só a que ela atende (EMPRESA GAMA), fora o título');
    await ana.fr.click('[data-action="ei-abrir"][data-id="e1"]'); await ana.fr.waitForSelector('#eiBg .ei');
    assert.equal(await ana.fr.locator('.ei-modelo').count(), 0, 'o modelo é da coordenação');
    await ana.fr.click('[data-action="ei-fechar"]');
    await ana.page.waitForFunction(() => (window.__sino || []).length >= 1, null, { timeout: 8000 });
    assert.deepEqual(ana.erros, []);
    await ana.page.close();
    const con = await abrir({ nivel: 'consulta', analista: '' });
    await con.page.waitForTimeout(1200);
    assert.equal(await con.fr.locator('.auto-bloco').count(), 0);
    assert.deepEqual(await sino(con.page), []);
    assert.equal(await con.fr.getAttribute('button[data-view="foco"]', 'data-n'), null);
    await con.page.close();
  });

  await browser.close(); servidor.close();
  if (falhas) { console.log('\nFALHARAM: ' + falhas); process.exit(1); }
  console.log('\ntodos os testes do Portal (e-mail inicial) passaram');
})();

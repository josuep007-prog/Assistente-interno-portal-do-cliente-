/* Configurações → Avançado (0.69.0, pedido do Josué em 03/11/2026: a aba antiga era a página de opções inteira num quadro, repetindo
 * prazos, avisos e feriados das outras abas). Agora é uma tela do app, com cinco partes e uma de cada vez:
 *   Control Hub · Regras do escritório · Testes de leitura · Aprender ações · Diagnóstico.
 * O cartão de cada parte, no topo, já mostra o estado (conectado, em uso, ligado…). A lógica comum com a página de opções
 * (que continua abrindo à parte) fica em ../opcoes-comum.js (window.OCOpcoes). */
import { estado, enviar } from '../estado.js';
import { $, $$, esc, toast } from '../util.js';
const OC = window.OC, OP = window.OCOpcoes;

const PARTES = [
  { id: 'hub', rot: 'Control Hub', ic: 'i-link' },
  { id: 'regras', rot: 'Regras do escritório', ic: 'i-layers' },
  { id: 'testes', rot: 'Testes de leitura', ic: 'i-pulso' },
  { id: 'aprender', rot: 'Aprender ações', ic: 'i-edit' },
  { id: 'diag', rot: 'Diagnóstico', ic: 'i-alert' }
];
let parte = 'hub', saida = { titulo: '', texto: '', quando: 0 }, timer = null, ouvindo = false, elAtual = null, hubSt = null;
const ler = chaves => chrome.storage.local.get(chaves);
const pilula = (tom, txt) => '<span class="adv-pil adv-' + tom + '">' + esc(txt) + '</span>';

// Estado curto de cada parte, para o cartão do topo
async function resumos() {
  const d = await ler(['hubCfg', 'hubSync', 'regrasEscritorio', 'aprender', 'aprendizado', 'snapshot', 'status', 'folhaEstado']);
  const c = d.hubCfg || {}, r = d.regrasEscritorio, st = hubSt;
  const hub = !c.token ? ['neutro', 'não conectado'] : !st ? ['neutro', 'verificando…'] : !st.permitido ? ['aviso', 'falta permitir'] : st.hubAberto ? ['ok', 'conectado'] : ['aviso', 'Hub fechado'];
  const regras = r && r.url ? (r.regras ? (r.erro ? ['aviso', 'falhou ao atualizar'] : ['ok', 'arquivo v' + (r.versao || '?')]) : ['erro', 'não baixado']) : ['neutro', 'embutidas'];
  const snap = d.snapshot, erroLeitura = d.status && (d.status.estado === 'erro' || d.status.estado === 'visao_cliente');
  const testes = erroLeitura ? ['erro', 'leitura com erro'] : snap ? ['ok', 'lendo normalmente'] : ['neutro', 'sem leitura'];
  const lig = OP.aprenderAtivo(d.aprender), n = (d.aprendizado || []).length;
  const aprender = lig ? ['aviso', 'ligado · ' + OP.aprenderResta(d.aprender) + ' min'] : ['neutro', n ? n + ' chamadas anotadas' : 'desligado'];
  const diag = snap && snap.erros && snap.erros.length ? ['erro', snap.erros.length + ' erro(s)'] : snap ? ['ok', 'sem erros'] : ['neutro', 'sem leitura'];
  return { hub, regras, testes, aprender, diag, d };
}

export async function avancado(el, params) {
  if (params && PARTES.some(p => p.id === params.sec)) parte = params.sec;
  el.innerHTML = '<div class="av"><nav class="adv-nav" role="tablist" aria-label="Partes do Avançado"></nav><div class="adv-corpo" id="adv-corpo"></div>' +
    '<p class="adv-rodape fraco">Prazos, leitura ao vivo, avisos e feriados ficam nas outras abas. <button type="button" class="btn btn-sm" id="adv-outra-aba">Abrir as configurações numa aba à parte</button></p></div>';
  $('#adv-outra-aba', el).onclick = () => { try { chrome.runtime.openOptionsPage(); } catch (e) { window.open('../options.html', '_blank'); } };
  const nav = $('.adv-nav', el);
  nav.onclick = e => { const b = e.target.closest('[data-parte]'); if (!b || b.dataset.parte === parte) return; parte = b.dataset.parte; history.replaceState(null, '', '#/config?aba=avancado&sec=' + parte); desenhar(el); };
  elAtual = el;
  // um ouvinte só, registrado uma vez: atualiza a tela que estiver aberta (o estado muda pelo service worker, por exemplo no envio ao Hub)
  if (!ouvindo) { ouvindo = true; chrome.storage.onChanged.addListener((mud, area) => {
    if (area !== 'local' || !elAtual || !elAtual.isConnected) return;
    if (['hubSync', 'hubSyncGestta', 'hubCfg', 'regrasEscritorio', 'aprender', 'aprendizado', 'snapshot', 'status'].some(k => k in mud)) atualizar(elAtual);
  }); }
  clearInterval(timer);
  timer = setInterval(() => { if (!el.isConnected) { clearInterval(timer); timer = null; return; } verHub(el); }, 15000);
  await desenhar(el);
  verHub(el);
}

async function verHub(el) {
  hubSt = await enviar({ cmd: 'hubStatus' });
  if (hubSt && hubSt.ok === false && hubSt.erro) hubSt = null;
  atualizar(el);
}

// Redesenha só o que mostra estado (os cartões do topo e as partes "vivas"), sem perder o que a pessoa está digitando
let atualizando = null;
function atualizar(el) {
  clearTimeout(atualizando);
  atualizando = setTimeout(async () => {
    if (!el.isConnected) return;
    await desenharNav(el);
    if (parte === 'hub') await estadoHub(el);
    if (parte === 'regras') await estadoRegras(el);
    if (parte === 'aprender') await estadoAprender(el);
  }, 120);
}

async function desenharNav(el) {
  const r = await resumos(), nav = $('.adv-nav', el); if (!nav) return r;
  nav.innerHTML = PARTES.map(p => { const [tom, txt] = r[p.id], on = p.id === parte;
    return '<button type="button" role="tab" aria-selected="' + on + '" class="adv-tab' + (on ? ' on' : '') + '" data-parte="' + p.id + '"><svg class="ic"><use href="#' + p.ic + '"/></svg><span class="adv-tab-tx"><b>' + esc(p.rot) + '</b><small class="adv-st adv-' + tom + '"><i></i>' + esc(txt) + '</small></span></button>'; }).join('');
  return r;
}

async function desenhar(el) {
  const r = await desenharNav(el), corpo = $('#adv-corpo', el);
  ({ hub: parteHub, regras: parteRegras, testes: parteTestes, aprender: parteAprender, diag: parteDiag })[parte](corpo, r.d, el);
}

/* ---------- Control Hub ---------- */
function parteHub(corpo, d, el) {
  const c = Object.assign({ token: '', auto: true }, d.hubCfg || {});
  corpo.innerHTML =
    '<section class="cfg-card adv-card"><h3><svg class="ic"><use href="#i-link"/></svg>Conexão</h3>' +
      '<p class="fraco ajuda">A ponte entrega ao Control Hub, aberto numa aba do claude.ai, o resumo das pendentes e, no envio completo, os conjuntos marcados abaixo. Tudo é lido na hora: nada fica guardado na extensão.</p>' +
      '<div class="adv-linha"><label class="adv-campo adv-cresce"><span>Código de pareamento</span><input type="text" id="adv-hubCodigo" class="mono" autocomplete="off" spellcheck="false" placeholder="24 letras e números, da “Entrada de dados” do Hub" value="' + esc(c.token) + '"></label>' +
        '<button type="button" class="btn btn-primary btn-sm" id="adv-conectar">Conectar</button><button type="button" class="btn btn-sm" id="adv-desconectar"' + (c.token ? '' : ' hidden') + '>Desconectar</button></div>' +
      '<div class="adv-pils" id="adv-hub-pils"></div>' +
    '</section>' +
    '<div class="adv-duas">' +
      '<section class="cfg-card adv-card"><h3><svg class="ic"><use href="#i-refresh"/></svg>Resumo das pendentes</h3>' +
        '<label class="cfg-sw"><input type="checkbox" id="adv-hubAuto"' + (c.auto ? ' checked' : '') + '><span class="cfg-tx"><b>Enviar sozinho a cada leitura</b><small class="ajuda">Só quando algo mudou.</small></span></label>' +
        '<div class="adv-acoes"><button type="button" class="btn btn-sm" id="adv-hub-enviar">Enviar resumo agora</button><button type="button" class="btn btn-sm" id="adv-hub-copiar" title="Se a ponte não funcionar: copia o resumo para colar em Entrada de dados no Hub"><svg class="ic"><use href="#i-copy"/></svg>Copiar resumo</button></div>' +
        '<p class="adv-msg" id="adv-hub-msg" role="status"></p>' +
      '</section>' +
      '<section class="cfg-card adv-card"><h3><svg class="ic"><use href="#i-download"/></svg>Envio completo</h3>' +
        '<label class="cfg-sw"><input type="checkbox" id="adv-syncAuto"' + (c.syncAuto !== false ? ' checked' : '') + '><span class="cfg-tx"><b>Automático</b><small class="ajuda">Só com o Hub aberto numa aba.</small></span></label>' +
        '<div class="adv-linha"><span class="adv-rot">A cada</span><div class="cfg-num"><input type="number" id="adv-syncHoras" min="1" max="48" step="1" value="' + (c.syncHoras || 6) + '"></div><span class="cfg-un">horas</span><span class="adv-espaco"></span><button type="button" class="btn btn-primary btn-sm" id="adv-sincronizar">Enviar tudo agora</button></div>' +
        '<div class="adv-linha"><span class="adv-rot" style="flex:1">Só a folha (Extrato Mensal): bem mais rápido, sem as listas nem a lista de empregados.</span><button type="button" class="btn btn-sm" id="adv-so-folha" title="Lê só os extratos novos ou que faltam (até 1.500 PDFs por vez) e manda ao Hub. Não conta como envio completo.">Enviar só a folha</button></div>' +
      '</section>' +
    '</div>' +
    '<section class="cfg-card adv-card"><h3><svg class="ic"><use href="#i-layers"/></svg>O que vai no envio completo</h3><div class="adv-cats" id="adv-cats"></div>' +
      '<div class="adv-alerta" id="adv-pessoais-aviso" hidden><b>Dados pessoais no Hub.</b> Com esta opção vão para o banco do Hub (no claude.ai) CPF, salário, nomes de empregados, assunto e descrição de todas as solicitações, dados completos e trâmites das pendentes, a folha (contribuintes por competência) e comunicações. Quem acessa o Hub passa a poder ver. Só ligue se o escritório decidiu isso.' +
        '<div class="adv-acoes"><button type="button" class="btn btn-primary btn-sm" id="adv-pessoais-sim">Entendi, enviar dados pessoais</button><button type="button" class="btn btn-sm" id="adv-pessoais-nao">Cancelar</button></div></div>' +
    '</section>' +
    '<section class="cfg-card adv-card"><h3><svg class="ic"><use href="#i-clock"/></svg>Último envio</h3><div id="adv-envio"></div></section>' +
    // 0.79.0: o Gestta no Hub (tarefas, clientes, equipe e setores, alertas e a cartela 1 vez por dia), lido na aba do Gestta
    '<section class="cfg-card adv-card" id="adv-gestta"><h3><svg class="ic"><use href="#i-layers"/></svg>Gestta no Hub</h3>' +
      '<p class="fraco ajuda">Com o Gestta aberto numa aba e logado com acesso de coordenação, a extensão lê os conjuntos marcados e entrega ao Hub, junto com o envio automático. Nada fica guardado na extensão; nunca vão valor, mensalidade, pontuação, e-mail, telefone ou senhas, nem as empresas do escritório.</p>' +
      '<label class="cfg-sw"><input type="checkbox" id="adv-gesttaAuto"' + (c.gesttaAuto !== false ? ' checked' : '') + '><span class="cfg-tx"><b>Junto com o envio automático</b><small class="ajuda">A cada ' + (c.syncHoras || 6) + ' horas, com o Hub e o Gestta abertos.</small></span></label>' +
      '<div class="adv-cats" id="adv-gestta-cats"></div>' +
      '<div class="adv-acoes"><button type="button" class="btn btn-primary btn-sm" id="adv-gestta-enviar">Enviar o Gestta agora</button></div>' +
      '<div id="adv-gestta-envio"></div>' +
    '</section>';
  // conjuntos: cartões com chave
  const cats = $('#adv-cats', corpo);
  cats.innerHTML = OC.HUB_CATEGORIAS.map(k => { const on = c.envio && c.envio[k.id] != null ? !!c.envio[k.id] : !!k.padrao;
    return '<label class="adv-cat' + (k.pessoal ? ' adv-cat-pessoal' : '') + '" title="' + esc(k.ajuda) + '"><input type="checkbox" data-cat="' + k.id + '"' + (on ? ' checked' : '') + '><span class="cfg-tx"><b>' + esc(k.nome) + (k.pessoal ? ' ' + pilula('aviso', 'sensível') : '') + '</b><small class="ajuda">' + esc(k.ajuda) + '</small></span></label>'; }).join('');
  const G = window.OCG;
  $('#adv-gestta-cats', corpo).innerHTML = G ? G.HUB_GESTTA.map(k => { const on = c.gestta && c.gestta[k.id] != null ? !!c.gestta[k.id] : !!k.padrao;
    return '<label class="adv-cat" title="' + esc(k.ajuda) + '"><input type="checkbox" data-gcat="' + k.id + '"' + (on ? ' checked' : '') + '><span class="cfg-tx"><b>' + esc(k.nome) + '</b><small class="ajuda">' + esc(k.ajuda) + '</small></span></label>'; }).join('') : '';
  $('#adv-gestta-cats', corpo).addEventListener('change', async e => {
    const inp = e.target.closest('input[data-gcat]'); if (!inp) return;
    const { hubCfg } = await ler('hubCfg'); const n = Object.assign({}, hubCfg || {}); n.gestta = Object.assign({}, n.gestta || {}, { [inp.dataset.gcat]: inp.checked }); await chrome.storage.local.set({ hubCfg: n });
    const k = G.HUB_GESTTA.find(x => x.id === inp.dataset.gcat); toast(inp.checked ? '“' + k.nome + '” vai ao Hub' : '“' + k.nome + '” fora do envio');
  });
  $('#adv-gesttaAuto', corpo).addEventListener('change', async e => { const { hubCfg } = await ler('hubCfg'); await chrome.storage.local.set({ hubCfg: Object.assign({}, hubCfg || {}, { gesttaAuto: e.target.checked }) }); });
  $('#adv-gestta-enviar', corpo).onclick = async () => {
    await salvar();
    $('#adv-gestta-envio', corpo).innerHTML = '<p class="adv-msg">Iniciando…</p>';
    const r = await enviar({ cmd: 'gesttaHubSync' });
    if (r && r.ok === false) { $('#adv-gestta-envio', corpo).innerHTML = '<p class="adv-msg adv-msg-erro">' + esc(OP.msgHub(r)) + '</p>'; return; }
    if (r && r.jaRodando) toast('Já há um envio do Gestta em andamento');
  };
  const salvar = async () => {
    const { hubCfg } = await ler('hubCfg'), token = $('#adv-hubCodigo', corpo).value.replace(/\s+/g, '').toUpperCase();
    const horas = Math.min(48, Math.max(1, Number($('#adv-syncHoras', corpo).value) || 6));
    await chrome.storage.local.set({ hubCfg: Object.assign({}, hubCfg || {}, { token, auto: $('#adv-hubAuto', corpo).checked, syncAuto: $('#adv-syncAuto', corpo).checked, syncHoras: horas }) });
    return token;
  };
  const gravarEnvio = async (id, valor) => { const { hubCfg } = await ler('hubCfg'); const n = Object.assign({}, hubCfg || {}); n.envio = Object.assign({}, n.envio || {}, { [id]: valor }); await chrome.storage.local.set({ hubCfg: n }); };
  const msg = (t, erro) => { const m = $('#adv-hub-msg', corpo); m.textContent = t; m.classList.toggle('adv-msg-erro', !!erro); };
  ['#adv-hubAuto', '#adv-syncAuto', '#adv-syncHoras', '#adv-hubCodigo'].forEach(s => $(s, corpo).addEventListener('change', salvar));
  cats.addEventListener('change', async e => {
    const inp = e.target.closest('input[data-cat]'); if (!inp) return;
    const k = OC.HUB_CATEGORIAS.find(x => x.id === inp.dataset.cat);
    if (k.pessoal && inp.checked) { inp.checked = false; $('#adv-pessoais-aviso', corpo).hidden = false; $('#adv-pessoais-aviso', corpo).scrollIntoView({ block: 'nearest' }); return; }   // pede confirmação antes de ligar
    await gravarEnvio(k.id, inp.checked); toast(inp.checked ? '“' + k.nome + '” vai no envio completo' : '“' + k.nome + '” fora do envio completo');
  });
  $('#adv-pessoais-sim', corpo).onclick = async () => { await gravarEnvio('pessoais', true); $('#adv-pessoais-aviso', corpo).hidden = true; const i = $('input[data-cat="pessoais"]', corpo); if (i) i.checked = true; toast('Dados pessoais vão no envio completo'); };
  $('#adv-pessoais-nao', corpo).onclick = () => { $('#adv-pessoais-aviso', corpo).hidden = true; };
  $('#adv-conectar', corpo).onclick = async () => {
    const token = await salvar();
    if (!token) { msg(OP.MOTIVOS_HUB['sem-codigo'], true); $('#adv-hubCodigo', corpo).focus(); return; }
    const ok = (await chrome.permissions.contains({ origins: OP.HUB_ORIGENS })) || await chrome.permissions.request({ origins: OP.HUB_ORIGENS });
    if (!ok) { msg('Permissão do claude.ai recusada: sem ela a ponte não funciona.', true); return; }
    const r = await enviar({ cmd: 'hubRegistrar' });
    if (!r || !r.ok) { msg('Não consegui ligar a ponte: ' + ((r && r.motivo) || 'erro'), true); return; }
    toast('Conectado ao Control Hub'); verHub(el);
  };
  $('#adv-desconectar', corpo).onclick = async () => { await enviar({ cmd: 'hubDesconectar' }); toast('Desconectado do Control Hub'); await desenhar(el); verHub(el); };
  $('#adv-hub-enviar', corpo).onclick = async () => { await salvar(); msg('Enviando…'); const r = await enviar({ cmd: 'hubEnviar' }); msg(r && r.ok ? 'Resumo enviado.' : OP.msgHub(r), !(r && r.ok)); verHub(el); };
  $('#adv-hub-copiar', corpo).onclick = async () => {
    const r = await enviar({ cmd: 'hubLote' });
    if (!r || !r.ok) { msg(OP.MOTIVOS_HUB[(r && r.motivo) || 'sem-leitura'], true); return; }
    try { await navigator.clipboard.writeText(JSON.stringify(r.lote)); msg('Resumo copiado (' + r.lote.nLinhas + ' solicitações). Cole em “Entrada de dados” no Hub.'); } catch (e) { msg('Não consegui copiar.', true); }
  };
  const sincronizar = async (soFolha) => {
    await salvar();
    $('#adv-envio', corpo).innerHTML = '<p class="adv-msg">Iniciando…</p>';
    const r = await enviar({ cmd: 'hubSincronizar', soFolha });
    if (r && r.ok === false) { $('#adv-envio', corpo).innerHTML = '<p class="adv-msg adv-msg-erro">' + esc(OP.msgHub(r)) + '</p>'; return; }
    if (r && r.jaRodando) toast('Já há um envio em andamento: acompanhe em "Último envio"');
  };
  $('#adv-sincronizar', corpo).onclick = () => sincronizar(false);
  if (!corpo.dataset.reenviar) corpo.dataset.reenviar = '1', corpo.addEventListener('click', async ev => {          // uma vez só: a parte é redesenhada sem trocar o elemento
    const b = ev.target.closest('[data-reenviar]'); if (!b) return;
    b.disabled = true; b.textContent = 'Reenviando…';
    const r = await enviar({ cmd: b.dataset.reenviar, reenviar: true });
    if (r && r.ok === false) { toast(OP.msgHub(r)); b.disabled = false; b.textContent = 'Reenviar o que deu erro'; return; }
    if (r && r.jaRodando) toast('Já há um envio em andamento: espere ele terminar');
    else toast('Reenviando ' + (r && r.n ? r.n + (r.n === 1 ? ' conjunto' : ' conjuntos') : 'o que deu erro'));
  });
  $('#adv-so-folha', corpo).onclick = () => sincronizar(true);
  estadoHub(el);
}
async function estadoHub(el) {
  const pils = $('#adv-hub-pils', el), envio = $('#adv-envio', el); if (!pils || !envio) return;
  const { hubCfg, hubSync } = await ler(['hubCfg', 'hubSync']), c = hubCfg || {}, st = hubSt, u = st && st.ultimo;
  const dz = $('#adv-desconectar', el); if (dz) dz.hidden = !c.token;
  pils.innerHTML = !c.token ? pilula('neutro', 'Sem código: cole o código e clique em Conectar') : !st ? pilula('neutro', 'Verificando a ponte…') :
    pilula(st.permitido ? 'ok' : 'aviso', st.permitido ? 'claude.ai permitido' : 'claude.ai não permitido') +
    pilula(st.hubAberto ? 'ok' : 'aviso', st.hubAberto ? (st.hubSegundoPlano ? 'Hub aberto em segundo plano' : 'Hub aberto e respondendo') : 'Hub não encontrado numa aba') +
    pilula(!u ? 'neutro' : u.ok ? 'ok' : 'erro', !u ? 'Nenhum resumo enviado' : u.ok ? 'Resumo aceito em ' + OP.quando(u.em) + ' (' + u.linhas + ' de ' + u.total + ')' : 'Resumo recusado: ' + OP.msgHub(u));
  const ICO = { ok: '✓', erro: '✕', aviso: '⚠', nota: '•', igual: '=' }, ordem = { erro: 0, aviso: 1, nota: 2, ok: 3, igual: 4 };
  // 0.83.0: o resumo numa linha; à vista só o que pede atenção (erro e aviso); o resto recolhido
  // 0.84.0 (Josué, 06/11/2026): com erro no último envio, "Reenviar o que deu erro" refaz só esses conjuntos (o resto fica como estava)
  const pinta = (alvo, e, cmd) => {
    const aberto = alvo.querySelector('details.adv-todos[open]');
    const barra = e.estado === 'enviando' && e.total ? '<div class="adv-barra" role="progressbar" aria-valuemin="0" aria-valuemax="' + e.total + '" aria-valuenow="' + e.feito + '"><i style="width:' + Math.round(e.feito / e.total * 100) + '%"></i></div>' : '';
    const li = l => '<li class="adv-' + l.tom + '"' + (l.dica && l.dica !== l.texto ? ' title="' + esc(l.dica) + '"' : '') + '><span aria-hidden="true">' + ICO[l.tom] + '</span><b>' + esc(l.rotulo) + '</b><span>' + esc(l.texto) + '</span></li>';
    const ls = e.linhas.slice().sort((a, b) => ordem[a.tom] - ordem[b.tom]), prob = ls.filter(l => l.tom === 'erro' || l.tom === 'aviso'), resto = ls.filter(l => l.tom !== 'erro' && l.tom !== 'aviso');
    const r = e.resumo || {}, chip = (n, cls, rot) => n ? '<span class="adv-chip adv-' + cls + '">' + ICO[cls] + ' ' + n + ' ' + rot + '</span>' : '';
    const resumo = e.linhas.length ? '<div class="adv-resumo">' + chip(r.ok, 'ok', r.ok === 1 ? 'enviado' : 'enviados') + chip(r.igual, 'igual', 'sem mudança') + chip(r.aviso, 'aviso', r.aviso === 1 ? 'aviso' : 'avisos') + chip(r.erro, 'erro', r.erro === 1 ? 'erro' : 'erros') + '</div>' : '';
    const reenv = cmd && r.erro && e.estado !== 'enviando' ? '<button type="button" class="btn btn-sm adv-reenviar" data-reenviar="' + cmd + '">Reenviar o que deu erro (' + r.erro + ')</button>' : '';
    alvo.innerHTML = '<p class="adv-msg' + (['erro', 'interrompido'].includes(e.estado) ? ' adv-msg-erro' : '') + '">' + esc(e.cab) + '</p>' + barra + (resumo || reenv ? '<div class="adv-resumo-l">' + resumo + reenv + '</div>' : '') +
      (prob.length ? '<ul class="adv-res">' + prob.map(li).join('') + '</ul>' : '') +
      (resto.length ? '<details class="adv-todos"' + (aberto ? ' open' : '') + '><summary>Ver ' + (prob.length ? 'os outros ' : 'os ') + resto.length + ' conjuntos</summary><ul class="adv-res">' + resto.map(li).join('') + '</ul></details>' : '');
  };
  pinta(envio, OP.linhasEnvio(hubSync), 'hubSincronizar');
  const ge = $('#adv-gestta-envio', el);
  if (ge) { const { hubSyncGestta, gesttaCartelaEm } = await ler(['hubSyncGestta', 'gesttaCartelaEm']); pinta(ge, OP.linhasEnvio(hubSyncGestta, { nome: 'do Gestta', cartelaEm: gesttaCartelaEm }), 'gesttaHubSync'); }
}

/* ---------- Regras do escritório ---------- */
function parteRegras(corpo, d) {
  const url = (estado.settings && estado.settings.regrasUrl) || '';
  corpo.innerHTML = '<section class="cfg-card adv-card"><h3><svg class="ic"><use href="#i-layers"/></svg>Arquivo de regras do escritório</h3>' +
    '<p class="fraco ajuda">Prazos, feriados e palavras podem vir de um arquivo publicado pelo escritório, para valer igual para todos sem reinstalar a extensão. O arquivo só traz dados e é conferido antes de valer. O que cada pessoa muda nas outras abas tem prioridade sobre ele.</p>' +
    '<div class="adv-pils" id="adv-regras-pils"></div>' +
    '<label class="adv-campo"><span>Endereço do arquivo (https)</span><input type="url" id="adv-regrasUrl" placeholder="https://raw.githubusercontent.com/…/regras.json" autocomplete="off" value="' + esc(url) + '"></label>' +
    '<div class="adv-acoes"><button type="button" class="btn btn-primary btn-sm" id="adv-regras-salvar">Salvar e atualizar</button><button type="button" class="btn btn-sm" id="adv-regras-cliente" title="Os prazos e feriados passam a ser iguais aos que o cliente vê no Assistente do Portal">Usar o arquivo do portal do cliente</button><button type="button" class="btn btn-sm" id="adv-regras-limpar">Usar só as embutidas</button></div>' +
    '<p class="adv-msg" id="adv-regras-msg" role="status"></p></section>';
  const msg = (t, erro) => { const m = $('#adv-regras-msg', corpo); m.textContent = t; m.classList.toggle('adv-msg-erro', !!erro); };
  const aplicar = async url => {
    if (url) {
      let u; try { u = new URL(url); } catch (e) { msg('Endereço inválido.', true); return; }
      if (u.protocol !== 'https:') { msg('Use um endereço https.', true); return; }
      const origins = [u.origin + '/*'];
      if (!((await chrome.permissions.contains({ origins })) || await chrome.permissions.request({ origins }))) { msg('Sem permissão para acessar esse endereço (aceite o pedido do Chrome).', true); return; }
    }
    const { settings } = await ler('settings'), s = Object.assign({ __v: 2 }, settings || {});
    if (url) s.regrasUrl = url; else delete s.regrasUrl;
    await chrome.storage.local.set({ settings: s });
    msg('Atualizando…');
    const r = await enviar({ cmd: 'atualizarRegras' });
    msg(r && r.ok ? (url ? 'Regras atualizadas.' : 'Usando só as regras embutidas.') : 'Não foi possível atualizar: ' + ((r && (r.erro || r.motivo)) || 'veja o estado acima'), !(r && r.ok));
    enviar({ cmd: 'atualizar' });
  };
  $('#adv-regras-salvar', corpo).onclick = () => aplicar($('#adv-regrasUrl', corpo).value.trim());
  $('#adv-regras-cliente', corpo).onclick = () => { $('#adv-regrasUrl', corpo).value = OP.URL_REGRAS_CLIENTE; aplicar(OP.URL_REGRAS_CLIENTE); };
  $('#adv-regras-limpar', corpo).onclick = () => { $('#adv-regrasUrl', corpo).value = ''; aplicar(''); };
  estadoRegras(corpo);
}
async function estadoRegras(el) {
  const box = $('#adv-regras-pils', el); if (!box) return;
  const { regrasEscritorio: r } = await ler('regrasEscritorio');
  box.innerHTML = !r || !r.url ? pilula('neutro', 'Usando as regras embutidas na extensão')
    : r.regras ? pilula('ok', 'Em uso: versão ' + (r.versao || '?')) + pilula('neutro', 'atualizado em ' + OP.quando(r.atualizadoEm)) + (r.erro ? pilula('erro', 'última tentativa falhou: ' + r.erro) : '')
    : pilula('erro', r.erro || 'Ainda não baixado');
}

/* ---------- Testes de leitura ---------- */
const TESTES = [
  { id: 'testarLeitura', ic: 'i-pulso', rot: 'Testar a leitura', desc: 'Confere a sessão do Onvio e cada jeito de ler (página, extensão, direto).', espera: 'Testando a leitura…' },
  { id: 'testarGestta', ic: 'i-pulso', rot: 'Testar a leitura do Gestta', desc: 'Com o Gestta aberto e logado numa aba: quem está logado, o perfil e uma leitura de prova de cada fonte, só contagens.', espera: 'Lendo o Gestta pela aba aberta (só leitura)…' },
  { id: 'sondarEmpregados', ic: 'i-users', rot: 'Sondar a lista de empregados', desc: 'Lê uma empresa e mostra só o formato da lista (campos e contagens), sem nome nem CPF.', espera: 'Sondando a lista de empregados (uma empresa, só leitura)…' },
  { id: 'testarFolha', ic: 'i-recibo', rot: 'Testar a leitura da folha', desc: 'Acha uma empresa com Extrato Mensal, lê o mais recente e mostra só o formato (contagens, vínculos, competência).', espera: 'Procurando um Extrato Mensal no portal de documentos (só leitura)…' },
  { id: 'folhaDeNovo', ic: 'i-repeat', rot: 'Ler a folha de novo', desc: 'No próximo envio ao Hub, procura de novo as pastas e lê os extratos dos últimos 12 meses (pode levar horas).', confirma: true }
];
function parteTestes(corpo, d) {
  const fe = d.folhaEstado;
  corpo.innerHTML = '<section class="cfg-card adv-card"><h3><svg class="ic"><use href="#i-pulso"/></svg>Testes de leitura</h3>' +
    '<p class="fraco ajuda">Só leitura no Onvio e no Gestta. O resultado mostra formatos e contagens, nunca dado de cliente.' + (fe && fe.em ? ' Última varredura da folha: ' + esc(OP.quando(fe.em)) + (fe.pendentes ? ' (' + fe.pendentes + ' PDFs ficaram para o próximo envio)' : '') + '.' : '') + '</p>' +
    '<form class="adv-empresa" id="adv-folha-emp"><label class="adv-campo adv-cresce"><span>Uma empresa: código ou parte do nome</span><input type="text" id="adv-folha-busca" autocomplete="off" placeholder="ex.: 123 ou torre"></label>' +
      '<button type="submit" class="btn btn-primary btn-sm" id="adv-folha-testar">Testar a folha</button><button type="button" class="btn btn-sm" id="adv-emp-testar">Testar os empregados</button></form>' +
      '<p class="fraco ajuda">Folha: onde a leitura do Extrato Mensal para nessa empresa (projeto, pastas, extratos e o mais recente). Empregados: quantas pessoas o Onvio devolve em cada código da empresa e se o Hub as descartaria (código antigo, filiais com o mesmo nome). Só contagens, nunca nome nem CPF.</p>' +
    '<div class="adv-testes">' + TESTES.map(t => '<button type="button" class="adv-teste" data-teste="' + t.id + '"><svg class="ic"><use href="#' + t.ic + '"/></svg><span class="cfg-tx"><b>' + esc(t.rot) + '</b><small>' + esc(t.desc) + '</small></span></button>').join('') + '</div>' +
    '</section><section class="cfg-card adv-card adv-console-card"' + (saida.texto ? '' : ' hidden') + '><h3><svg class="ic"><use href="#i-list"/></svg><span id="adv-saida-t">' + esc(saida.titulo) + '</span><span class="adv-espaco"></span>' +
      '<button type="button" class="btn btn-sm" id="adv-saida-copiar"><svg class="ic"><use href="#i-copy"/></svg>Copiar</button></h3><pre class="adv-console" id="adv-saida">' + esc(saida.texto) + '</pre></section>';
  let confirma = 0;
  const mostrar = (titulo, texto) => { saida = { titulo, texto, quando: Date.now() }; const card = $('.adv-console-card', corpo); card.hidden = false; $('#adv-saida-t', corpo).textContent = titulo; $('#adv-saida', corpo).textContent = texto; card.scrollIntoView({ block: 'nearest' }); };
  $('.adv-testes', corpo).onclick = async e => {
    const b = e.target.closest('[data-teste]'); if (!b || b.classList.contains('rodando')) return;
    const t = TESTES.find(x => x.id === b.dataset.teste);
    if (t.confirma && Date.now() - confirma > 8000) { confirma = Date.now(); b.classList.add('confirmar'); b.querySelector('b').textContent = 'Clique de novo para confirmar'; setTimeout(() => { if (b.isConnected) { b.classList.remove('confirmar'); b.querySelector('b').textContent = t.rot; } }, 8000); return; }
    confirma = 0; b.classList.remove('confirmar'); b.querySelector('b').textContent = t.rot;
    b.classList.add('rodando'); b.setAttribute('aria-busy', 'true');
    if (t.espera) mostrar(t.rot, t.espera);
    const r = await enviar({ cmd: t.id });
    b.classList.remove('rodando'); b.removeAttribute('aria-busy');
    if (t.id === 'folhaDeNovo') { mostrar(t.rot, r && r.ok ? 'Pronto: o próximo envio ao Control Hub procura de novo as pastas de cada empresa e lê a folha desde 12 meses atrás.' : 'Não foi possível: ' + ((r && r.erro) || 'sem resposta')); return; }
    mostrar(t.rot, r && r.ok ? (r.linhas || []).join('\n') : 'Não foi possível: ' + ((r && r.erro) || 'sem resposta'));
  };
  $('#adv-folha-emp', corpo).onsubmit = async e => {
    e.preventDefault();
    const busca = $('#adv-folha-busca', corpo).value.trim(), btn = $('#adv-folha-testar', corpo);
    if (!busca) { $('#adv-folha-busca', corpo).focus(); return; }
    btn.disabled = true; mostrar('Folha de "' + busca + '"', 'Procurando a empresa e o Extrato Mensal dela (só leitura; pode levar um minuto)…');
    const r = await enviar({ cmd: 'testarFolhaEmpresa', busca });
    btn.disabled = false;
    mostrar('Folha de "' + busca + '"', r && r.ok ? (r.linhas || []).join('\n') : 'Não foi possível: ' + ((r && r.erro) || 'sem resposta'));
  };
  $('#adv-emp-testar', corpo).onclick = async () => {
    const busca = $('#adv-folha-busca', corpo).value.trim(), btn = $('#adv-emp-testar', corpo);
    if (!busca) { $('#adv-folha-busca', corpo).focus(); return; }
    btn.disabled = true; mostrar('Empregados de "' + busca + '"', 'Procurando a empresa e lendo a lista de empregados de cada código dela (só leitura)…');
    const r = await enviar({ cmd: 'testarEmpregadosEmpresa', busca });
    btn.disabled = false;
    mostrar('Empregados de "' + busca + '"', r && r.ok ? (r.linhas || []).join('\n') : 'Não foi possível: ' + ((r && r.erro) || 'sem resposta'));
  };
  $('#adv-saida-copiar', corpo).onclick = async () => { try { await navigator.clipboard.writeText(saida.texto); toast('Copiado'); } catch (e) { toast('Não consegui copiar: selecione o texto', true); } };
}

/* ---------- Aprender ações ---------- */
function parteAprender(corpo) {
  corpo.innerHTML = '<section class="cfg-card adv-card"><h3><svg class="ic"><use href="#i-edit"/></svg>Aprender ações (mapeamento)</h3>' +
    '<p class="fraco ajuda">Com o modo ligado, a extensão anota o <b>formato</b> das chamadas que o próprio Onvio faz enquanto você trabalha (endereço, nomes e tipos dos campos), para passar a fazer essas ações. <b>Nunca anota valores.</b> Desliga sozinho depois de 2 horas.</p>' +
    '<div class="adv-aprender"><label class="adv-chave"><input type="checkbox" id="adv-aprender-sw"><span class="adv-chave-ui" aria-hidden="true"></span><span id="adv-aprender-rot">Desligado</span></label><div class="adv-pils" id="adv-aprender-pils"></div></div>' +
    '<details class="adv-roteiro"><summary>Roteiro: o que fazer no Onvio com o modo ligado (só na empresa de teste)</summary><p class="fraco">Use só na EMPRESA EXEMPLO SIMPLES NACIONAL LTDA e faça uma vez cada ação, em cada tipo de solicitação que puder (Geral, Cadastro, Férias, Rescisão, Afastamento, Rubricas):</p><ol>' +
      OP.ROTEIRO_APRENDER.map(x => '<li>' + esc(x) + '</li>').join('') + '</ol></details>' +
    '<div class="adv-acoes"><button type="button" class="btn btn-primary btn-sm" id="adv-aprender-copiar"><svg class="ic"><use href="#i-copy"/></svg>Copiar o que foi aprendido</button><button type="button" class="btn btn-sm" id="adv-aprender-limpar">Limpar</button></div>' +
    '<p class="fraco ajuda">Abas do Onvio abertas antes de atualizar a extensão precisam de F5 para o modo valer.</p></section>';
  $('#adv-aprender-sw', corpo).onchange = async e => { await chrome.storage.local.set({ aprender: e.target.checked ? { ligado: true, desde: Date.now() } : { ligado: false } }); toast(e.target.checked ? 'Aprender ações ligado por 2 horas' : 'Aprender ações desligado'); };
  $('#adv-aprender-copiar', corpo).onclick = async () => {
    const { aprendizado } = await ler('aprendizado');
    try { await navigator.clipboard.writeText(OP.textoAprendido(aprendizado)); toast('Copiado (' + (aprendizado || []).length + ' chamadas)'); } catch (e) { toast('Não consegui copiar', true); }
  };
  $('#adv-aprender-limpar', corpo).onclick = async () => { await chrome.storage.local.remove('aprendizado'); toast('Registro limpo'); };
  estadoAprender(corpo);
}
async function estadoAprender(el) {
  const sw = $('#adv-aprender-sw', el); if (!sw) return;
  const { aprender, aprendizado } = await ler(['aprender', 'aprendizado']), lig = OP.aprenderAtivo(aprender), n = (aprendizado || []).length;
  sw.checked = lig; $('#adv-aprender-rot', el).textContent = lig ? 'Ligado' : 'Desligado';
  $('#adv-aprender-pils', el).innerHTML = (lig ? pilula('aviso', 'desliga em ' + OP.aprenderResta(aprender) + ' min') : '') + pilula(n ? 'ok' : 'neutro', n + (n === 1 ? ' chamada diferente anotada' : ' chamadas diferentes anotadas'));
}

/* ---------- Diagnóstico ---------- */
async function parteDiag(corpo) {
  const d = await ler(['snapshot', 'perfilSessao', 'status', 'rotasAnexo', 'regrasEscritorio']);
  const texto = OP.diagnostico(d.snapshot, d.perfilSessao, d.status, d.rotasAnexo, d.regrasEscritorio || null), snap = d.snapshot;
  const n = (v, rot, tom) => '<div class="adv-num' + (tom ? ' adv-' + tom : '') + '"><b>' + esc(String(v)) + '</b><span>' + esc(rot) + '</span></div>';
  const t = (snap && snap.tramites) || {}, desc = Object.values((snap && snap.desconhecidos) || {}).reduce((s, v) => s + Object.keys(v).length, 0);
  corpo.innerHTML = '<section class="cfg-card adv-card"><h3><svg class="ic"><use href="#i-alert"/></svg>Diagnóstico</h3>' +
    '<p class="fraco ajuda">Para conferir a leitura do Onvio e informar problemas. Só contagens, caminhos e nomes de campo: pode copiar e mandar.</p>' +
    (snap ? '<div class="adv-nums">' + n((snap.items || []).length, 'pendentes lidas') + n(t.lidos || 0, 'trâmites lidos') + n(t.falhas || 0, 'falhas de trâmite', t.falhas ? 'erro' : '') + n(desc, 'códigos desconhecidos', desc ? 'aviso' : '') + n((snap.erros || []).length, 'erros de leitura', (snap.erros || []).length ? 'erro' : '') + '</div>' : '') +
    '<div class="adv-acoes"><button type="button" class="btn btn-primary btn-sm" id="adv-diag-copiar"><svg class="ic"><use href="#i-copy"/></svg>Copiar diagnóstico</button></div>' +
    '<pre class="adv-console" id="adv-diag">' + esc(texto) + '</pre></section>';
  $('#adv-diag-copiar', corpo).onclick = async () => { try { await navigator.clipboard.writeText(texto); toast('Diagnóstico copiado'); } catch (e) { toast('Não consegui copiar: selecione o texto', true); } };
}

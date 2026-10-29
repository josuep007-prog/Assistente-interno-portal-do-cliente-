/* Detalhe de uma solicitação (janela grande, como a da empresa no Departamento Pessoal).
 * Lê dados e trâmites na hora; nada disso é guardado. Com a lista de onde veio, anda para a
 * anterior/próxima (setas ← → ou os botões do topo) sem fechar. */
import { estado, itens, enviar, salvarLembretes, aoMudar } from '../estado.js';
import { formAcao, ligarAcao, novaAcao, acaoAberta, fecharAcao, opcoesPassar } from './acao-form.js';
import { respostaHtml, ligarResposta, prepararResposta, bolhaRascunho, recemEnviado, respostaEmAndamento, cancelarPendente, focarResposta, temRascunho } from './resposta.js';
import { esc, pillSituacao, motivosHtml, fmtDataHora, fmtData, textoPuro, toast, ladoTexto, relativo, iniciais, simples, $, $$ } from '../util.js';
import { abrirLembrete, lembreteAberto } from './lembrete-dlg.js';
import { abrirNova, novaAberta } from './nova-dlg.js';
import { abrirAnexos, anexosAbertos, contarAnexos, tipoArquivo } from './anexos-dlg.js';
const OC = window.OC;

let atual = null;        // { type, num }
let aba = 'tramites';     // 'tramites' (a conversa) ou 'acao' (formulário de uma ação no lugar da conversa), dentro da gaveta da direita
const LARGA = 1000;      // a partir desta largura a gaveta abre ao passar o mouse; abaixo, só ao clicar (vira uma aba embaixo)
const GAV_FIXA = 'controlonvio-gaveta-fixa';
let gavetaAberta = false;      // aberta pelo mouse, pelo clique na barra, pela tecla R ou por uma resposta/ação preparada (vale nesta visita)
let gavetaFixa = (() => { try { return localStorage.getItem(GAV_FIXA) === '1'; } catch (e) { return false; } })();   // fixada: fica aberta e os dados abrem espaço
let lembAberto = false;        // o menu "Lembretes" do topo está aberto (continua aberto ao salvar um lembrete)
let saiTimer = null, fechouEu = false;   // fechouEu: a pessoa fechou a gaveta de propósito (vale até ela abrir de novo)
const painelAbertos = new Map();   // seções do painel de dados abertas/fechadas pela pessoa (vale enquanto o app está aberto)
let lista = null;        // lista de onde a pessoa abriu (para anterior/próxima)
let ultimo = null;       // { i, r, erro, carregando } para redesenhar ao trocar de aba ou ao mudar lembretes
let rolada = null;       // solicitação cuja conversa já foi levada ao fim (uma vez por abertura)
let ultimaChave = '', ultimaAba = '';   // para manter a rolagem da conversa quando só a caixa de resposta muda

export const detalheAberto = () => !$('#gaveta').hidden;
export function fecharDetalhe() {
  const estava = detalheAberto();
  cancelarPendente(); fecharAcao(); gavetaAberta = false;
  ultimaChave = ''; ultimaAba = '';
  $('#gaveta').hidden = true; $('#fundo').hidden = true;
  $('#gaveta').innerHTML = '';
  atual = null; lista = null; ultimo = null; rolada = null;
  if (estava) dispatchEvent(new CustomEvent('controlonvio-detalhe-fechado'));
}

// ref: item da fila, evento do sino ou lembrete (precisa de type e num); fonte: lista para navegar
// opcoes.acao: já abre na caixa de resposta ('tramite') ou no formulário da ação (com opcoes.preset), por exemplo "Avisar o cliente" no Hoje
export async function abrirDetalhe(ref, fonte, opcoes) {
  if (!ref || !ref.type || ref.num == null) return;
  const t = OC.TYPE_BY_KEY[ref.type];
  if (!t) return;
  if (fonte !== undefined) lista = Array.isArray(fonte) && fonte.length > 1 ? fonte : null;
  const mesma = !!atual && atual.type === ref.type && atual.num === String(ref.num);
  if (!mesma) { cancelarPendente(); fecharAcao(); gavetaAberta = false; fechouEu = false; if (aba === 'acao') aba = 'tramites'; }
  atual = { type: ref.type, num: String(ref.num) };
  if (aba === 'acao' && !ultimo) aba = 'tramites';
  if (opcoes && opcoes.acao === 'tramite') { prepararResposta({ type: ref.type, num: String(ref.num) }, opcoes.preset); aba = 'tramites'; gavetaAberta = true; }
  else if (opcoes && opcoes.acao) { novaAcao(opcoes.acao, opcoes.preset); aba = 'acao'; gavetaAberta = true; }
  const doResumo = itens().find(i => i.type === ref.type && String(i.num) === String(ref.num));
  const base = doResumo || (ref.status ? ref : { type: ref.type, typeLabel: t.label, num: ref.num, status: 'Carregando…', lado: 'desc', apelido: ref.cliente || '' });
  const g = $('#gaveta');
  g.hidden = false; $('#fundo').hidden = false;
  desenhar(base, null, null, true);
  g.focus();
  const meu = atual;
  const r = await enviar({ cmd: 'detalhe', type: ref.type, num: String(ref.num) });
  if (atual !== meu) return;                                        // a pessoa já abriu outra
  if (!r.ok) { desenhar(base, null, 'Não foi possível ler a solicitação no Onvio: ' + (r.erro || ''), false); return; }
  // sempre abre nos dados; a conversa e a resposta ficam na gaveta da direita, que abre ao passar o mouse (0.62.0)
  if (!mesma && !(opcoes && opcoes.acao)) aba = 'tramites';
  desenhar(Object.assign({}, base, r.item), r, null, false);
}

const posicao = () => lista ? lista.findIndex(x => x.type === atual.type && String(x.num) === atual.num) : -1;
function andar(d) {
  const p = posicao();
  if (p < 0) return;
  const prox = lista[p + d];
  if (prox) abrirDetalhe(prox);
}
const meusLembretes = i => (estado.lembretes || []).filter(l => l.type === i.type && String(l.num) === String(i.num));


function desenhar(i, r, erro, carregando) {
  ultimo = { i, r, erro, carregando };
  const g = $('#gaveta');
  const corpoAntes = $('#g-corpo'), stAntes = corpoAntes ? corpoAntes.scrollTop : 0;   // só a caixa de resposta mudou: a conversa fica onde estava
  const tramites = r && r.tramites;
  const lems = meusLembretes(i);
  const p = posicao();
  const ultimoTr = tramites && tramites.length ? tramites[tramites.length - 1] : null;
  // prazo legal de pagamento (férias e rescisão): o da leitura ou, no detalhe, calculado das datas lidas agora
  const pl = i.pagamentoAte || (r && r.datas ? (x => x && { alvo: OC.ymd(x.alvo), ref: x.ref })(OC.prazoPagamento(i.type, r.datas, estado.settings)) : null);
  const pagto = pl && pl.alvo ? { dt: pl.alvo.slice(8, 10) + '/' + pl.alvo.slice(5, 7) + '/' + pl.alvo.slice(0, 4), faltam: OC.uteisAte(new Date(), OC.diaDe(pl.alvo), estado.settings.feriados) } : null;
  const obs = carregando ? [] : OC.observacoesCliente(i, (r && r.datas) || {}, estado.settings, new Date());
  const nAnexos = carregando ? 0 : contarAnexos(r);
  // linha de dados: no Simplificado ficam Responsável, Pagamento até e Último trâmite; o resto vai para "mais" (a vez e a idade já estão no topo)
  const dpLast = () => {
    const resp = '<span>Responsável: <b>' + esc(i.resp || 'sem responsável') + '</b></span>';
    const aberta = i.created ? '<span>Aberta em <b>' + esc(fmtDataHora(i.created)) + '</b>' + (i.solicitante ? ' por ' + esc(i.solicitante) : '') + '</span>' : '';
    const ult = i.last ? '<span>Último trâmite: <b>' + esc(fmtDataHora(i.last)) + '</b>' + (ultimoTr && ultimoTr.autor ? ' por ' + esc(ultimoTr.autor) : '') + '</span>' : '';
    const par = i.parado != null ? '<span>Parada há <b>' + i.parado + ' dia(s)</b></span>' : '';
    const presc = i.lado === 'cli' && i.prescreveEm != null ? '<span title="Regra do Onvio: sem retorno do cliente, a solicitação prescreve sozinha">Prescreve no Onvio em <b>' + i.prescreveEm + ' dia(s)</b></span>' : '';
    const pg = pagto ? '<span class="' + (pagto.faltam != null && pagto.faltam <= 1 && i.lado !== 'cli' ? 'late' : '') + '">Pagamento até <b>' + esc(pagto.dt) + '</b> (prazo legal)</span>' : '';
    const exp = i.due ? '<span title="Data informada pelo cliente; não conta como vencimento">Expectativa do cliente: ' + esc(fmtData(i.due)) + '</span>' : '';
    if (!simples()) return resp + aberta + ult + par + presc + pg + exp;
    const mais = aberta + presc + exp;
    return resp + pg + ult + (mais ? '<details class="dp-mais"><summary title="Aberta em, prescrição e expectativa do cliente">mais</summary>' + mais + '</details>' : '');
  };
  g.innerHTML =
    '<div class="dlg-head"><div class="tt">' +
      '<div class="dlg-l1"><span class="mono">#' + esc(i.num) + '</span><span>' + esc(i.typeLabel) + '</span>' + pillSituacao(i) + (i.lado === 'esc' || i.lado === 'cli' ? '<span>vez: <b>' + ladoTexto(i) + '</b></span>' : '') +
        (simples() && i.parado != null ? '<span>parada há <b>' + i.parado + (i.parado === 1 ? ' dia' : ' dias') + '</b></span>' : '') +
        (simples() && i.pedidoAoCliente && !i.resolvida ? '<span class="dlg-pede-ic" title="' + esc(porquePendente(i.pedidoAoCliente).replace(/<[^>]+>/g, '')) + '"><svg class="ic ic-sm"><use href="#i-clock"/></svg></span>' : '') + '</div>' +
      '<h2>' + esc(i.apelido || i.cliente || 'Solicitação') + '</h2>' +
      '<div class="dlg-l3">' + esc(i.detalhe || i.assunto || '') + '</div>' +
      (((i.motivos || []).some(m => m.legal) || i.abaProvavel) ? '<div class="motivos">' + motivosHtml(i) + '</div>' : '') +
      (i.resolvida ? '<div class="dlg-resolvida"><svg class="ic ic-sm"><use href="#i-check"/></svg><span><b>Considerada resolvida:</b> o cliente não respondeu' + (i.semRetorno != null ? ' em ' + i.semRetorno + ' dias úteis' : '') + ' e a última resposta não pedia nada. No Onvio ela continua aberta.</span></div>'
        : i.pedidoAoCliente && !simples() ? '<div class="dlg-resolvida pede"><svg class="ic ic-sm"><use href="#i-clock"/></svg><span>' + porquePendente(i.pedidoAoCliente) + '</span></div>' : '') +
    '</div>' + lembretesBtn(lems) +
    (p >= 0 ? '<div class="dlg-nav"><button class="icon-btn" id="g-ant" title="Anterior (←)" aria-label="Anterior"' + (p <= 0 ? ' disabled' : '') + '><svg class="ic"><use href="#i-chev-l"/></svg></button><span>' + (p + 1) + ' de ' + lista.length + '</span><button class="icon-btn" id="g-prox" title="Próxima (→)" aria-label="Próxima"' + (p >= lista.length - 1 ? ' disabled' : '') + '><svg class="ic"><use href="#i-chev-r"/></svg></button></div>' : '') +
    '<button class="icon-btn" id="g-fechar" aria-label="Fechar" title="Fechar (Esc)"><svg class="ic"><use href="#i-x"/></svg></button></div>' +
    '<div class="dp-last">' + dpLast() +
    '</div>' +
    // os dados em largura total; na borda direita, a gaveta com a conversa (trâmites) e a caixa de resposta embaixo (0.62.0)
    '<div class="dlg-cols dlg-v3' + (gavetaFixa ? ' fixa' : '') + '">' +
    painelHtml(i, r, carregando, nAnexos) +
    gavetaHtml(i, r, erro, carregando, obs, p, tramites) +
    '</div>' +
    '<div class="dlg-actions">' +
      '<button class="btn btn-sm" id="g-onvio"><svg class="ic ic-sm"><use href="#i-link"/></svg> Abrir no Onvio</button>' +
      (nAnexos ? '<button class="btn btn-sm" id="g-anexos" title="Escolha quais anexos baixar"><svg class="ic ic-sm"><use href="#i-download"/></svg> Baixar anexos<span class="n-anexos">' + nAnexos + '</span></button>' : '') +
      '<span class="spacer"></span>' +
      maisAcoes(i, carregando) +
    '</div>';

  $('#g-fechar').onclick = fecharDetalhe;
  ligarGaveta(g, i);
  // conversa: ao chegar, mostra o fim (o trâmite mais recente), uma vez por solicitação aberta
  const chave = atual ? atual.type + ':' + atual.num : '';
  const primeira = aba === 'tramites' && !carregando && tramites && tramites.length && rolada !== chave;
  const emAndamento = aba === 'tramites' && respostaEmAndamento(i) && !carregando;    // o rascunho fica no fim da conversa
  const rolar = !!(primeira || emAndamento);
  if (primeira) rolada = chave;
  if (rolar) { const c = $('#g-corpo'); if (c) c.scrollTop = c.scrollHeight; }
  else if (ultimaChave === chave && ultimaAba === aba && stAntes) { const c = $('#g-corpo'); if (c) c.scrollTop = stAntes; }
  ultimaChave = chave; ultimaAba = aba;
  const anexos = marcar => abrirAnexos({ item: i, r, marcar });
  if ($('#g-anexos')) $('#g-anexos').onclick = () => anexos();
  if ($('#g-anexos2')) $('#g-anexos2').onclick = () => anexos();
  $$('[data-ax-abrir]', g).forEach(b => b.onclick = e => { e.stopPropagation(); anexos(b.dataset.axAbrir); });
  $$('.tr-mais', g).forEach(b => b.onclick = () => { const c = b.closest('.tr-bolha'); const ab = c.classList.toggle('aberto'); b.textContent = ab ? 'Ver menos' : 'Ver tudo'; });
  // texto longo ganha "Ver tudo" na hora (medido já na montagem, sem piscar); se a conversa acabou de ser levada ao fim, continua no fim
  $$('.tr-texto', g).forEach(t => { if (t.scrollHeight > t.clientHeight + 4) t.closest('.tr-bolha').classList.add('longo'); });
  if (rolar) { const c0 = $('#g-corpo'); if (c0) c0.scrollTop = c0.scrollHeight; }
  requestAnimationFrame(() => {
    const c = $('#g-corpo');
    if (rolar && c) c.scrollTop = c.scrollHeight;
  });
  if ($('#g-ant')) { $('#g-ant').onclick = () => andar(-1); $('#g-prox').onclick = () => andar(1); }
  // painel: lembra quais seções a pessoa abriu ou fechou
  $$('#g-painel details[data-pn]', g).forEach(d => d.addEventListener('toggle', () => painelAbertos.set(d.dataset.pn, d.open)));
  if ($('#g-lemb')) $('#g-lemb').addEventListener('toggle', e => { lembAberto = e.target.open; });
  $('#g-onvio').onclick = async () => {
    const x = await enviar({ cmd: 'abrir', item: { type: i.type, num: String(i.num) } });
    if (!x.ok) toast('Não foi possível abrir no Onvio: ' + (x.erro || ''), true);
  };
  $$('[data-acao]', g).forEach(b => b.onclick = () => { novaAcao(b.dataset.acao); aba = 'acao'; desenhar(i, r, erro, carregando); });
  $$('[data-abrir-onvio]', g).forEach(b => b.onclick = () => $('#g-onvio').click());
  $$('[data-responder]', g).forEach(b => b.onclick = () => { abrirGaveta(); if (!focarResposta()) toast('A caixa de resposta não está disponível aqui', true); });
  $$('.g-mais .menu-item', g).forEach(b => b.addEventListener('click', () => { const m = b.closest('details'); if (m) m.open = false; }));
  document.addEventListener('click', fechaMais);
  const mesma = () => !!atual && atual.type === i.type && atual.num === String(i.num);
  if (aba === 'acao' && acaoAberta()) ligarAcao(g, i, obs, {
    redesenhar: () => { if (mesma()) desenhar(i, r, erro, carregando); },
    cancelar: () => { aba = 'tramites'; desenhar(i, r, erro, carregando); },
    feito: () => { aba = 'tramites'; abrirDetalhe({ type: i.type, num: i.num }); }
  });
  if (aba === 'tramites' && !carregando && r && !erro) ligarResposta(g, i, r, obs, {
    redesenhar: () => { if (mesma()) desenhar(i, r, erro, carregando); },
    feito: prox => { if (!mesma()) return; const pp = posicao(); if (prox && pp >= 0 && lista[pp + 1]) abrirDetalhe(lista[pp + 1]); else abrirDetalhe({ type: i.type, num: i.num }); }
  });
  $('#g-nova').onclick = () => abrirNova({ origem: Object.assign({}, i, { type: i.type, num: String(i.num) }) });
  if ($('#g-concluir')) $('#g-concluir').onclick = () => abrirNova({ origem: Object.assign({}, i, { type: i.type, num: String(i.num) }), assunto: OC.assuntoPedirConcluir(i, estado.settings), descricao: OC.textoPedirConcluir(i, estado.settings), passarVez: true });
  $('#g-lembrete').onclick = () => abrirLembrete({ vinculo: { type: i.type, num: String(i.num), k: i.k || null, cliente: i.apelido || i.cliente } });
  $$('[data-l]', g).forEach(row => row.addEventListener('click', async e => {
    const l = estado.lembretes.find(x => x.id === row.dataset.l);
    if (!l) return;
    const b = e.target.closest('[data-a]');
    if (!b) { abrirLembrete({ l }); return; }
    await salvarLembretes(estado.lembretes.map(x => x.id !== l.id ? x : b.dataset.a === 'feito' ? OC.concluirLembrete(x, new Date(), estado.settings.feriados) : Object.assign({}, x, { feito: false, disparado: false })));
  }));
}

// "Responder" sempre à vista no rodapé (de qualquer aba): leva à caixa de resposta; desativado com o motivo quando não dá
// "Mais ações": o resto fica num menu, cada item com o motivo na própria linha quando não dá para usar (OC.podeAcao)
function maisAcoes(i, carregando) {
  const item = (rot, ic, attrs, pode) => '<button type="button" class="menu-item"' + attrs + (pode.ok ? '' : ' disabled') + '><svg class="ic ic-sm"><use href="#i-' + ic + '"/></svg><span class="mi-tx">' + rot + (pode.ok ? '' : '<small class="mi-motivo">' + esc(pode.motivo) + '</small>') + '</span></button>';
  const livre = { ok: true }, espera = { ok: false, motivo: 'lendo a solicitação…' };
  const op = carregando ? { encaminhar: espera, responsavel: espera } : opcoesPassar(i);
  const passar = op.encaminhar.ok || op.responsavel.ok ? livre : { ok: false, motivo: op.encaminhar.motivo };
  return '<details class="menu g-mais" id="g-mais"><summary class="btn btn-sm" title="Passar para outro analista, expectativa, nova solicitação e mais"><svg class="ic ic-sm"><use href="#i-more"/></svg> Mais ações</summary><div class="menu-list">' +
    item('Passar para outro analista', 'repeat', ' data-acao="passar"', passar) +
    (OC.ACOES.expectativa(i.type) ? item('Alterar expectativa de conclusão', 'calendar', ' data-acao="expectativa"', carregando ? espera : OC.podeAcao('expectativa', i)) : '') +
    item('Nova solicitação para o cliente', 'plus', ' id="g-nova"', livre) +
    (i.lado === 'cli' ? item('Pedir ao cliente para concluir', 'check', ' id="g-concluir"', livre) : '') +
    '</div></details>';
}
// os menus (Mais ações e Lembretes) fecham ao clicar fora
function fechaMais(e) {
  const m = $('#g-mais'), l = $('#g-lemb');
  if (!m && !l) { document.removeEventListener('click', fechaMais); return; }
  if (m && m.open && !m.contains(e.target)) m.open = false;
  if (l && l.open && e.target.isConnected && !l.contains(e.target) && !(e.target.closest && e.target.closest('dialog'))) l.open = false;     // clique em outra janela (Novo lembrete) não fecha a lista
}

// Lembretes desta solicitação: um botão no topo, ao lado da navegação, com o nº de pendentes; abre a lista e "Novo lembrete" (0.62.1)
function lembretesBtn(lems) {
  const pend = lems.filter(l => !l.feito).length, atras = lems.some(l => !l.feito && OC.situacaoLembrete(l) === 'atrasado');
  return '<details class="menu g-lemb" id="g-lemb"' + (lembAberto ? ' open' : '') + '><summary class="btn btn-sm" title="Lembretes desta solicitação: ver, marcar como feito e criar">' + ico('clock') + ' Lembretes' + (pend ? '<span class="g-lemb-n' + (atras ? ' late' : '') + '">' + pend + '</span>' : '') + '</summary>' +
    '<div class="menu-list g-lemb-lista">' + lembretesHtml(lems) + '<button type="button" class="btn btn-sm btn-primary g-lemb-novo" id="g-lembrete">' + ico('plus') + ' Novo lembrete</button></div></details>';
}

// Trâmites como conversa, sempre na ordem em que aconteceram (sem filtros): cliente à esquerda, escritório à direita,
// com o tempo entre um e outro. Ao abrir, a janela já mostra o fim da conversa (o mais recente).
function tramitesHtml(r, carregando, i) {
  if (carregando) return '<div class="vazio">Lendo os trâmites no Onvio…</div>';
  if (!r) return '<div class="vazio">Sem trâmites para mostrar.</div>';
  if (r.erroTramites) return '<div class="faixa warn"><svg class="ic"><use href="#i-alert"/></svg>Não foi possível ler os trâmites (' + esc(r.erroTramites) + '). Use "Abrir no Onvio" para ver o histórico.</div>';
  const todos = r.tramites || [];
  const rasc = i ? bolhaRascunho(i) : '';
  if (!todos.length && !rasc) return '<div class="vazio"><b>Nenhum trâmite ainda</b>A solicitação ainda não teve resposta.</div>';
  const ult = todos[todos.length - 1];
  const novo = !!i && recemEnviado(i);
  // "Responder" ao lado da última mensagem do cliente (abre o formulário do trâmite, como o botão do rodapé)
  const ultCli = todos.filter(x => x.lado !== 'esc').pop();
  const pode = i ? OC.podeAcao('tramite', i) : { ok: false, motivo: '' };
  const responder = '<button type="button" class="btn btn-sm' + (ultCli === ult ? ' btn-primary' : '') + ' tr-responder" data-responder="1"' + (pode.ok ? '' : ' disabled title="' + esc(pode.motivo) + '"') + '><svg class="ic ic-sm"><use href="#i-chat"/></svg> Responder</button>';
  const dias = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
  // índice de cada trâmite na lista de anexos (primeiro os da abertura), calculado uma vez
  let acum = r.arquivos && r.arquivos.length ? 1 : 0;
  const gis = new Map();
  for (const t of todos) { gis.set(t, acum); if (t.arquivos && t.arquivos.length) acum++; }
  let ant = null;
  const corpo = todos.map(x => {
    // tempo entre este trâmite e o anterior na leitura (só quando passou ao menos 1 dia)
    const ant0 = ant;
    let gap = '';
    if (ant) { const d = Math.abs(dias(ant.em, x.em)); if (d >= 1) gap = '<div class="tr-gap"><span>' + d + (d === 1 ? ' dia' : ' dias') + ' depois</span></div>'; }
    ant = x;
    const lado = x.lado === 'esc' ? 'esc' : 'cli';
    const quem = x.autor || (lado === 'esc' ? 'Escritório' : 'Cliente');
    const anexos = (x.arquivos && x.arquivos.length ? x.arquivos : (x.anexos || []).map(nome => ({ nome })));
    const gi = gis.get(x);
    const sit = ant0 && x.situacao !== ant0.situacao ? '<div class="tr-sit"><span>Situação passou a: <b>' + esc(x.situacao) + '</b></span></div>' : '';
    return gap + '<div class="tr-item ' + lado + (x === ult ? ' ultimo' : '') + (novo && x === ult && lado === 'esc' ? ' tr-nova' : '') + '">' +
      '<span class="tr-av" title="' + esc(quem) + '">' + esc(iniciais(quem) || (lado === 'esc' ? 'E' : 'C')) + '</span>' +
      '<div class="tr-bolha">' +
        '<div class="tr-meta"><b>' + esc(quem) + '</b><span class="tr-lado">' + (x.n === 1 ? 'abertura' : lado === 'esc' ? 'escritório' : 'cliente') + '</span>' +
          (x.situacao && x.n !== 1 ? '<span class="tr-sit-pill" title="Situação gravada por este trâmite">' + esc(x.situacao) + '</span>' : '') + '<span class="tr-quando" title="' + esc(fmtDataHora(x.em)) + '">#' + String(x.n).padStart(2, '0') + ' · ' + esc(simples() ? relativo(x.em) : relativo(x.em) !== fmtDataHora(x.em) ? relativo(x.em) + ' · ' + fmtDataHora(x.em) : fmtDataHora(x.em)) + '</span></div>' +
        (x.texto ? '<div class="tr-texto">' + esc(textoPuro(x.texto)) + '</div><button type="button" class="tr-mais">Ver tudo</button>' : '<div class="tr-texto fraco">Sem texto' + (anexos.length ? ' (só anexo)' : '') + '</div>') +
        (anexos.length ? '<div class="tr-anexos">' + anexos.map((a, ai) => { const tp = tipoArquivo(a.nome); return '<button type="button" class="tr-arq"' + (a.id || a.direto ? ' data-ax-abrir="' + gi + ':' + ai + '"' : ' disabled') + ' title="Baixar ' + esc(a.nome) + '"><span class="ax-ic ' + tp.cls + '">' + tp.rot + '</span><span class="ax-nome">' + esc(a.nome) + '</span></button>'; }).join('') + '</div>' : '') +
      '</div>' + (x === ultCli && x.n !== 1 ? responder : '') + '</div>' + sit;
  }).join('');
  return '<div class="tr-lista" id="tr-lista">' + corpo + rasc + '</div>';
}

// Em destaque: as datas e os dados que definem o atendimento, tirados da solicitação completa (no painel, sempre à vista).
function destaquesHtml(r) {
  const l = [];
  for (const g of (r && r.grupos) || []) for (const c of g.campos) if (c.destaque && !c.longo && l.length < 8 && !l.some(x => x.k === c.k)) l.push(c);
  // sem campo em destaque: os primeiros dados curtos da solicitação
  if (!l.length) for (const g of (r && r.grupos) || []) for (const c of g.campos) if (!c.longo && l.length < 6 && !l.some(x => x.k === c.k)) l.push(c);
  if (!l.length) return '';
  return '<div class="dlg-destaques" aria-label="Em destaque">' + l.map(c => '<span class="dq"><small>' + esc(c.k) + '</small><b>' + esc(c.v) + '</b></span>').join('') + '</div>';
}

// Painel de dados (0.62.0, pedido do Josué em 29/10/2026): a solicitação abre nele, em largura total (a conversa e a resposta ficam na gaveta
// da direita). Em destaque no topo; "Todos os dados" em cartões lado a lado; Anexos numa seção que abre e fecha.
function painelHtml(i, r, carregando, nAnexos) {
  const sec = (id, tit, n, corpo, padrao, alerta) => {
    const ab = painelAbertos.has(id) ? painelAbertos.get(id) : padrao;
    return '<details class="pn-sec" data-pn="' + id + '"' + (ab ? ' open' : '') + '><summary><span class="pn-tit">' + tit + '</span>' + (n ? '<span class="pn-n' + (alerta ? ' late' : '') + '">' + n + '</span>' : '') + '</summary><div class="pn-corpo">' + corpo + '</div></details>';
  };
  if (carregando) return '<section class="dlg-dados" id="g-painel" aria-label="Dados da solicitação"><div class="vazio">Lendo a solicitação completa no Onvio…</div></section>';
  const abertura = (r && r.anexos) || [], total = Math.max(nAnexos, abertura.length);
  const anexos = total ? (abertura.length ? '<div class="anexos">' + abertura.map(a => '<span><svg class="ic ic-sm"><use href="#i-paperclip"/></svg>' + esc(a) + '</span>').join('') + '</div>' : '') +
    (total > abertura.length ? '<p class="fraco">' + (abertura.length ? 'E mais ' + (total - abertura.length) + ' nos trâmites da conversa.' : total + (total === 1 ? ' anexo' : ' anexos') + ' nos trâmites da conversa.') + '</p>' : '') +
    (nAnexos ? '<button type="button" class="btn btn-sm" id="g-anexos2"><svg class="ic ic-sm"><use href="#i-download"/></svg> Escolher e baixar</button>' : '') : '';
  const dq = destaquesHtml(r);
  return '<section class="dlg-dados" id="g-painel" aria-label="Dados da solicitação">' +
    dq +
    sec('dados', 'Todos os dados', '', dados(i, r, false), true) +
    '<div class="pn-extras">' +
    (total ? sec('anexos', 'Anexos', String(total), anexos, true) : '') +
    '</div>' +
  '</section>';
}

// Gaveta da direita (0.62.0): a conversa (trâmites) e a caixa de resposta. Fechada, só a barra aparece na borda; abre ao passar o mouse
// (janela larga) ou ao clicar na barra; fica aberta enquanto há algo em andamento (foco, rascunho, balão, ação) ou se estiver fixada.
const ico = n => '<svg class="ic ic-sm"><use href="#i-' + n + '"/></svg>';
const gavetaFixaAtiva = () => gavetaFixa && innerWidth >= LARGA;
function gavetaHtml(i, r, erro, carregando, obs, p, tramites) {
  const nTr = tramites ? tramites.length : 0, rasc = temRascunho(i);
  const aberta = !fechouEu && (gavetaAberta || gavetaFixaAtiva() || aba === 'acao' || rasc);
  return '<aside class="g-gaveta' + (aberta ? ' aberta' : '') + (gavetaFixaAtiva() ? ' fixa' : '') + '" id="g-gaveta" aria-label="Trâmites e resposta">' +
    '<button type="button" class="g-barra" id="g-barra" aria-expanded="' + aberta + '" aria-controls="g-gaveta-in" title="Trâmites e resposta (tecla R)">' + ico('chat') + '<span class="g-barra-tx">Conversa</span>' +
      (nTr ? '<span class="g-barra-n" title="' + nTr + ' trâmite(s)">' + nTr + '</span>' : '') +
      (i.lado === 'esc' ? '<i class="g-barra-pt" title="Vez do escritório"></i>' : '') + (rasc ? '<i class="g-barra-rasc" title="Rascunho guardado"></i>' : '') + '</button>' +
    '<div class="g-gaveta-in" id="g-gaveta-in">' +
      '<div class="g-gaveta-cab"><b>Trâmites e resposta</b>' + (nTr ? '<span class="g-gaveta-n">' + nTr + '</span>' : '') + '<span class="spacer"></span>' +
        '<button type="button" class="icon-btn g-pin" id="g-pin" aria-pressed="' + gavetaFixa + '" title="' + (gavetaFixa ? 'Soltar: volta a abrir só ao passar o mouse' : 'Fixar aberta: os dados passam para o lado') + '" aria-label="Fixar a conversa aberta">' + ico('pin') + '</button>' +
        '<button type="button" class="icon-btn" id="g-gav-x" title="Fechar a conversa" aria-label="Fechar a conversa">' + ico('chev-r') + '</button></div>' +
      '<div class="dlg-body" id="g-corpo">' + (erro ? '<div class="faixa"><svg class="ic"><use href="#i-alert"/></svg>' + esc(erro) + '</div>' : '') +
        (aba === 'acao' && acaoAberta() ? formAcao(i) : tramitesHtml(r, carregando, i)) + '</div>' +
      (aba === 'tramites' && !carregando && r && !erro ? respostaHtml(i, obs, { datas: r.datas, proxima: p >= 0 && p < lista.length - 1 }) : '') +
    '</div></aside>';
}
function abrirGaveta() {
  gavetaAberta = true; fechouEu = false; clearTimeout(saiTimer);
  const gav = $('#g-gaveta'); if (!gav) return;
  gav.classList.add('aberta'); const b = $('#g-barra'); if (b) b.setAttribute('aria-expanded', 'true');
}
function ligarGaveta(g, i) {
  const gav = $('#g-gaveta', g), barra = $('#g-barra', g);
  if (!gav || !barra) return;
  const larga = () => innerWidth >= LARGA && matchMedia('(hover: hover)').matches;
  const marca = on => { gav.classList.toggle('aberta', on); barra.setAttribute('aria-expanded', String(on)); };
  // o que está em andamento (foco na conversa/resposta, rascunho, balão, ação) segura a gaveta aberta
  const segura = () => gavetaFixaAtiva() || aba === 'acao' || temRascunho(i) || (document.activeElement !== barra && !!$('#g-gaveta-in', g) && $('#g-gaveta-in', g).contains(document.activeElement));
  gav.onmouseenter = () => {
    clearTimeout(saiTimer);
    if (!larga()) return;
    saiTimer = setTimeout(() => { fechouEu = false; gavetaAberta = true; marca(true); }, 120);
  };
  gav.onmouseleave = () => {
    clearTimeout(saiTimer);
    if (!larga()) return;
    saiTimer = setTimeout(() => { if (!document.contains(gav) || segura()) return; gavetaAberta = false; marca(false); }, 280);
  };
  // o ponto "rascunho" da barra acompanha o que está sendo escrito (sem redesenhar a janela)
  const pontoRasc = () => { const d = $('.g-barra-rasc', barra), t = temRascunho(i); if (t && !d) barra.insertAdjacentHTML('beforeend', '<i class="g-barra-rasc" title="Rascunho guardado"></i>'); else if (!t && d) d.remove(); };
  gav.addEventListener('input', pontoRasc);
  const fecha = () => {                                   // fechar de propósito: vence o rascunho e a fixação
    clearTimeout(saiTimer);
    const eraFixa = gavetaFixaAtiva();
    gavetaAberta = false; fechouEu = true; pontoRasc();
    if (eraFixa) { gavetaFixa = false; try { localStorage.setItem(GAV_FIXA, '0'); } catch (e) {} if (ultimo) desenhar(ultimo.i, ultimo.r, ultimo.erro, ultimo.carregando); }
    else marca(false);
  };
  barra.onclick = () => { if (gav.classList.contains('aberta')) fecha(); else { abrirGaveta(); } };
  $('#g-gav-x', g).onclick = fecha;
  $('#g-pin', g).onclick = () => {
    gavetaFixa = !gavetaFixa; try { localStorage.setItem(GAV_FIXA, gavetaFixa ? '1' : '0'); } catch (e) {}
    if (gavetaFixa) { gavetaAberta = true; fechouEu = false; }
    if (ultimo) desenhar(ultimo.i, ultimo.r, ultimo.erro, ultimo.carregando);
  };
}

// Todos os dados (seção do painel): só o que serve para atender. Responsável, datas, solicitante e prazos já estão no topo da janela.
function dados(i, r, carregando) {
  const grade = cs => '<div class="campos">' + cs.map(([k, v, dq]) => '<div class="campo' + (dq ? ' dq-campo' : '') + '"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div></div>').join('') + '</div>';
  if (carregando) return '<div class="vazio">Lendo a solicitação completa no Onvio…</div>';
  if (r && r.grupos) {
    // cada grupo num cartão; o nome (do empregado, por exemplo) vai para o título do cartão em vez de ser mais um campo
    let html = r.grupos.map(gr => {
      const nome = gr.titulo !== 'Solicitação' && gr.campos.find(c => c.k === 'Nome' && !c.longo);
      const campos = gr.campos.filter(c => c !== nome);
      const curtos = campos.filter(c => !c.longo), longos = campos.filter(c => c.longo);
      return '<section class="dados-g"><header class="dados-cab"><h4 class="dados-tit">' + esc(gr.titulo) + '</h4>' + (nome ? '<span class="dados-nome">' + esc(nome.v) + '</span>' : '') + '</header>' +
        (curtos.length ? grade(curtos.map(c => [c.k, c.v, c.destaque])) : '') +
        longos.map(c => '<div class="campo campo-longo"><div class="k">' + esc(c.k) + '</div><div class="texto-longo">' + esc(textoPuro(c.v)) + '</div></div>').join('') + '</section>';
    }).join('');
    return html || '<div class="vazio">O Onvio não trouxe outros dados desta solicitação.</div>';
  }
  const aviso = r && r.erroDados ? '<div class="faixa warn"><svg class="ic"><use href="#i-alert"/></svg>Não foi possível ler a solicitação completa (' + esc(r.erroDados) + '). Mostrando o que veio da lista.</div>' : '';
  return aviso + (i.assunto ? grade([['Assunto', i.assunto]]) : '') +
    (i.descricao ? '<div class="campo campo-longo"><div class="k">Descrição</div><div class="texto-longo">' + esc(textoPuro(i.descricao)) + '</div></div>' : '');
}

function lembretesHtml(lems) {
  if (!lems.length) return '<div class="vazio"><b>Nenhum lembrete nesta solicitação</b>Use "Lembrete" para ser avisado na hora certa (por exemplo, para cobrar o cliente).</div>';
  return lems.sort((a, b) => a.quando.localeCompare(b.quando)).map(l => {
    const s = OC.situacaoLembrete(l);
    return '<div class="item-ag clicavel ' + (s === 'atrasado' ? 'late' : s === 'hoje' ? 'today' : '') + '" data-l="' + esc(l.id) + '"><svg class="ic"><use href="#i-clock"/></svg>' +
      '<div class="tx"><b' + (l.feito ? ' class="feito-tx"' : '') + '>' + esc(l.texto) + '</b><small>' + esc(fmtDataHora(l.quando)) + (l.rep && l.rep !== 'nao' ? ' · ' + esc(OC.REPETICOES[l.rep]) : '') + '</small></div>' +
      '<div class="acts">' + (l.feito ? '<button class="btn btn-sm" data-a="reabrir">Reabrir</button>' : '<button class="btn btn-sm" data-a="feito"><svg class="ic ic-sm"><use href="#i-check"/></svg> Feito</button>') + '</div></div>';
  }).join('');
}

// Setas ← → andam na lista; lembretes mudaram com a janela aberta: redesenha a aba.
addEventListener('keydown', e => {
  if (!detalheAberto() || lembreteAberto() || novaAberta() || anexosAbertos() || e.target.matches('input, select, textarea')) return;
  if (e.key === 'ArrowLeft') andar(-1);
  else if (e.key === 'ArrowRight') andar(1);
  else if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey) {
    abrirGaveta();
    if (focarResposta()) e.preventDefault();
    else if (ultimo && ultimo.r && aba !== 'tramites') { aba = 'tramites'; fecharAcao(); desenhar(ultimo.i, ultimo.r, ultimo.erro, ultimo.carregando); if (focarResposta()) e.preventDefault(); }
  }
});
aoMudar(quais => {
  if (quais.includes('lembretes') && detalheAberto() && ultimo) desenhar(ultimo.i, ultimo.r, ultimo.erro, ultimo.carregando);
});

// Por que uma solicitação na vez do cliente, parada há dias, não conta como resolvida (OC.vereditoResolvida).
function porquePendente(t) {
  if (t === 'última palavra do cliente') return 'Continua pendente: o último trâmite é do cliente, então a vez é do escritório.';
  if (t === 'sem trâmites') return 'Continua pendente: não há resposta do analista para conferir.';
  return 'Continua pendente: a última resposta pede algo ao cliente' + (t === '?' ? ' (uma pergunta)' : typeof t === 'string' ? ' (“' + esc(t) + '”)' : '') + '.';
}

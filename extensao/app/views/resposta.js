/* Caixa de resposta do detalhe (trâmite para o cliente), compacta, no fim da conversa dentro da gaveta da direita (0.62.0).
 * - escolhe o que acontece depois do envio (Respondido, Em análise, Concluído...) no botão "Enviar como ▾", com o efeito em palavras;
 * - modelos com variáveis ({saudacao}, {empregado}...), do escritório (regras) e pessoais;
 * - avisos de coerência entre o texto e a situação; marcadores como "(descreva ...)" barram o envio;
 * - "Enviar resposta" mostra o rascunho na própria conversa; "Confirmar envio" espera alguns segundos para desistir (trâmite não pode
 *   ser excluído) e só então chama o Onvio (cmd 'acao', pelo service worker, depois da conferência de escritório);
 * - o rascunho fica só na memória desta visita (nunca gravado); texto e anexos enviados também não são guardados.
 * Sempre com confirmação da pessoa: nada sai sem "Enviar". */
import { estado, enviar, primeiroNome, salvarModelosPessoais } from '../estado.js';
import { esc, toast, simples, $, $$ } from '../util.js';
const OC = window.OC;

const MAX_ANEXOS = 30, MAX_BYTES = 15 * 1024 * 1024;
const rascunhos = new Map();     // 'tipo:num' -> rascunho (só na memória)
let pendente = null;             // { chave, timer }: contagem para desistir
let enviado = null;              // { chave, em }: o último envio, para o aviso e o destaque da bolha
let aoAbrir = null;              // { r, redesenhar } da caixa na tela (para fechar o balão da Mensagem pronta ao clicar fora)

const chaveDe = i => i.type + ':' + i.num;
// clique fora do balão da Mensagem pronta fecha o balão (o texto editado nele não vai para a resposta)
document.addEventListener('mousedown', e => {
  if (!aoAbrir || !aoAbrir.r.mp || !e.target.closest || e.target.closest('#mp-balao, #cmp-mp')) return;
  aoAbrir.r.mp = null; aoAbrir.redesenhar();
});
// janela larga (a partir de 1000 px): a caixa fica ao lado da conversa e as situações do trâmite ficam sempre à vista (CSS .g-cols > .cmp); abaixo disso, lista suspensa
const listaFixa = () => innerWidth >= 1000;
const novoRascunho = () => ({ mp: null, guardSit: '', guardDeTexto: false, texto: '', sit: '', arquivos: [], modo: 'editar', erro: '', aoEnviar: null, antes: [], guardando: false, guardTexto: '', guardRot: '', aberto: false, menuAberto: false, fora: [], pend: null, reenviando: false, prog: '', focar: false, selMarca: '', proxima: false, fimEm: 0, segTotal: 0 });
const rascunho = i => { const k = chaveDe(i); if (!rascunhos.has(k)) rascunhos.set(k, novoRascunho()); return rascunhos.get(k); };
const ic = (n, c) => '<svg class="ic' + (c ? ' ' + c : '') + '"><use href="#i-' + n + '"/></svg>';
const tamanho = n => n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1).replace('.', ',') + ' MB';

// abre a caixa já com texto e situação sugeridos (Hoje, Sugestões de ação); aoEnviar roda depois que o Onvio aceitou
export function prepararResposta(i, preset) {
  const p = preset || {}, r = rascunho(i);
  if (p.texto) r.texto = p.texto;
  if (p.situacao) r.sit = String(p.situacao);
  r.aoEnviar = typeof p.aoEnviar === 'function' ? p.aoEnviar : null;
  r.antes = Array.isArray(p.antes) ? p.antes.filter(a => a && a.situacao && a.texto).map(a => ({ situacao: String(a.situacao), rot: String(a.rot || ''), texto: String(a.texto) })) : [];     // passos antes do trâmite da caixa (ex.: Respondido pelo cliente e só depois Concluído)
  r.modo = 'editar'; r.aberto = true; r.focar = true; r.erro = '';
  r.preencherPendente = /\{\w+\}/.test(r.texto);       // {variáveis} do texto sugerido são preenchidas quando o detalhe é lido (datas, empregado)
}
// Há algo em andamento nesta solicitação (texto, anexo, balão, modelo ou revisão/envio): a gaveta não fecha sozinha
export const temRascunho = i => { const r = rascunhos.get(chaveDe(i)); return !!r && !!(r.texto.trim() || r.arquivos.length || r.mp || r.guardando || r.pend || r.fora.length || r.modo !== 'editar'); };
// Trâmite enviado cujos anexos não chegaram (ou não deu para conferir): o aviso fica na caixa até a pessoa resolver
export const anexosPendentes = i => { const r = i && rascunhos.get(chaveDe(i)); return r && r.pend ? r.pend : null; };
export const recemEnviado = i => !!(enviado && enviado.chave === chaveDe(i) && Date.now() - enviado.em < 20000);
export const respostaEmAndamento = i => { const r = rascunhos.get(chaveDe(i)); return !!r && r.modo !== 'editar'; };
// a pessoa fechou a janela ou foi para outra solicitação durante a contagem: cancela (nada foi enviado)
export function cancelarPendente() {
  if (!pendente) return false;
  clearInterval(pendente.timer);
  const r = rascunhos.get(pendente.chave);
  if (r && r.modo === 'contagem') r.modo = 'revisar';
  pendente = null;
  toast('Envio cancelado: o trâmite não foi enviado');
  return true;
}
export function focarResposta() {
  const t = $('#a-texto');
  if (!t) return false;
  t.focus(); t.setSelectionRange(t.value.length, t.value.length);
  return true;
}

const vars = (i, ctx) => OC.variaveisTramite(i, ctx && ctx.datas, estado.settings, new Date(), primeiroNome());
// As intenções do Onvio agora e, quando a caixa veio de uma sugestão em dois passos, a conclusão que só vale depois do 1º passo
function intsDe(i, r) {
  const ints = OC.intencoesDe(i, estado.settings);
  const t = OC.TYPE_BY_KEY[i.type];
  if (!r.antes.length || !t || ints.some(x => String(x.sit) === String(r.sit))) return ints;
  const rot = OC.FAMILIAS[t.familia].st[Number(r.sit)];
  if (!rot) return ints;
  return ints.concat([{ sit: Number(r.sit), rot: rot[0] + ' · encerra', onvio: rot[0], lado: 'fim', pedeCliente: false, tom: 'fim',
    efeito: 'Primeiro registra "' + r.antes.map(a => a.rot).join('" e "') + '" e em seguida conclui: a solicitação sai da fila' }]);
}
const horaDe = ms => new Date(ms).toTimeString().slice(0, 5);
// Arquivos que ficaram de fora ao escolher (grandes, vazios, passou do limite): o aviso NÃO some sozinho e o envio só segue depois do "Entendi"
const foraHtml = r => r.fora.length ? '<div class="cmp-fora" role="alert">' + ic('alert', 'ic-sm') + '<div><b>' + (r.fora.length === 1 ? 'Este arquivo NÃO vai no envio:' : 'Estes ' + r.fora.length + ' arquivos NÃO vão no envio:') + '</b><ul>' +
  r.fora.map(x => '<li>' + esc(x.nome) + ' <small>· ' + esc(x.motivo) + '</small></li>').join('') + '</ul><button type="button" class="btn btn-sm" id="a-fora-ok">Entendi, seguir sem eles</button></div></div>' : '';
// Anexos que não chegaram ao Onvio depois do trâmite enviado: ficam aqui, com o motivo de cada um, até tentar de novo ou resolver pelo Onvio
function pendHtml(i, r) {
  const p = r.pend, n = r.arquivos.length;
  const cab = p.naoConferido && !n
    ? '<b>O trâmite foi enviado e o Onvio aceitou ' + p.naoConferido.length + (p.naoConferido.length === 1 ? ' anexo' : ' anexos') + ', mas não consegui conferir no trâmite se chegaram.</b><p class="fraco">Abra o trâmite no Onvio e confira: ' + esc(p.naoConferido.join(', ')) + '.</p>'
    : '<b>O trâmite foi enviado, mas ' + (n === 1 ? '1 anexo não chegou' : n + ' anexos não chegaram') + ' ao Onvio:</b><ul>' + r.arquivos.map(a => '<li>' + esc(a.name) + ' <small>· ' + tamanho(a.size) + ' · ' + esc((p.motivos && p.motivos[a.name]) || 'não chegou') + '</small></li>').join('') + '</ul><p class="fraco">Eles continuam guardados aqui, só nesta visita. Tente de novo ou anexe pelo Onvio.</p>';
  const meio = r.reenviando ? '<div class="cmp-contagem"><span id="cmp-env-tx">' + esc(r.prog || 'Anexando…') + '</span></div>'
    : '<div class="cmp-pe"><span class="spacer"></span><button class="btn btn-sm" id="a-pend-abrir" type="button">' + ic('link', 'ic-sm') + ' Abrir no Onvio</button>' + (n && p.topicId ? '<button class="btn btn-sm btn-primary" id="a-reanexar" type="button">Tentar anexar de novo</button>' : '') +
      '<button class="btn btn-sm" id="a-pend-fechar" type="button" title="Só tire o aviso depois de conferir no Onvio">' + (n ? 'Anexei pelo Onvio, tirar o aviso' : 'Conferi, tirar o aviso') + '</button></div>';
  return '<div class="cmp aberto cmp-pend" id="cmp"><div class="cmp-erro cmp-pend-faixa" role="alert">' + ic('alert', 'ic-sm') + '<div>' + cab + '</div></div>' + meio + '</div>';
}

function avisosHtml(r, i) {
  return OC.avisosResposta(r.texto, r.sit, estado.settings, i).map(a => '<div class="cmp-aviso' + (a.bloqueia ? ' bloqueia' : '') + '">' + ic(a.bloqueia ? 'alert' : 'chat', 'ic-sm') + '<span>' + esc(a.msg) + '</span></div>').join('');
}

// Bolha tracejada "rascunho" no fim da conversa, enquanto a resposta é revisada ou enviada
export function bolhaRascunho(i) {
  const r = rascunhos.get(chaveDe(i));
  if (!r || r.modo === 'editar') return '';
  const it = intsDe(i, r).find(x => String(x.sit) === String(r.sit));
  const quem = primeiroNome() || 'Você';
  return '<div class="tr-item esc rascunho" id="tr-rascunho"><span class="tr-av" title="' + esc(quem) + '">' + esc((quem[0] || 'V').toUpperCase()) + '</span><div class="tr-bolha">' +
    '<div class="tr-meta"><b>' + esc(quem) + '</b><span class="tr-lado">rascunho</span>' + (it ? '<span class="pill">' + esc(it.onvio) + '</span>' : '') + '<span class="tr-quando">ainda não enviado</span></div>' +
    '<div class="tr-texto">' + esc(OC.aplicarDestaques(r.texto)) + '</div>' +
    (r.arquivos.length ? '<div class="tr-anexos">' + r.arquivos.map(a => '<span class="tr-arq off"><span class="ax-nome">' + esc(a.name) + ' · ' + tamanho(a.size) + '</span></span>').join('') + '</div>' : '') +
    '</div></div>';
}

// A mensagem completa de um trâmite: {variáveis} preenchidas e, quando cabe, as observações para o cliente que o texto ainda não diz
function mensagemCompleta(m, i, cliObs, ctx) {
  const t = OC.preencherModelo(m.texto, vars(i, ctx));
  if (!m.completa) return t;
  const extras = OC.observacoesFaltantes(t, cliObs);
  return extras.length ? t.trimEnd() + '\n\nObservações importantes:\n' + extras.map(o => '- ' + o.texto).join('\n') : t;
}
function balaoHtml(i, r, cliObs, ctx) {
  const ms = OC.mensagensProntas(i, estado.settings, estado.modelosPessoais);
  if (!ms.length) return '<div class="mp-balao" id="mp-balao" role="dialog" aria-label="Mensagem pronta"><p class="fraco">Esta lista não aceita trâmite agora.</p></div>';
  const m = ms.find(x => String(x.sit) === String(r.mp.sit)) || ms.find(x => String(x.sit) === String(r.sit)) || ms[0];
  r.mp.sit = String(m.sit);
  const txt = r.mp.txt[m.sit] != null ? r.mp.txt[m.sit] : mensagemCompleta(m, i, cliObs, ctx);
  const tem = !!r.texto.trim();
  const outros = (estado.modelosPessoais || []).filter(x => !x.situacao);       // modelos antigos, sem trâmite: continuam à mão
  return '<div class="mp-balao" id="mp-balao" role="dialog" aria-label="Mensagem pronta" tabindex="-1">' +
    '<div class="mp-cab"><b>Mensagem pronta</b><span class="fraco">uma para cada trâmite; edite antes de usar</span><button type="button" class="icon-btn" id="mp-fechar" aria-label="Fechar" title="Fechar (Esc)">' + ic('x', 'ic-sm') + '</button></div>' +
    '<div class="mp-tabs" role="tablist">' + ms.map(x => '<button type="button" role="tab" class="mp-tab' + (x === m ? ' on' : '') + '" data-tom="' + x.tom + '" data-mp-sit="' + x.sit + '" aria-selected="' + (x === m) + '" title="' + esc(x.efeito) + '"><i class="cmp-pt"></i>' + esc(x.rot.split(' · ')[0]) + (x.pessoal ? ' <small>sua</small>' : '') + '</button>').join('') + '</div>' +
    '<textarea id="mp-texto" rows="9" aria-label="Texto da mensagem pronta">' + esc(txt) + '</textarea>' +
    '<div class="mp-pe"><span class="fraco">Trâmite <b>' + esc(m.onvio) + '</b>' + (m.pessoal ? ' · mensagem sua' : '') + '</span><span class="spacer"></span>' +
      (m.pessoal ? '<button type="button" class="btn btn-sm" id="mp-padrao" title="Apaga a sua e volta à mensagem do escritório">Voltar à do escritório</button>' : '') +
      '<button type="button" class="btn btn-sm" id="mp-salvar" title="Guarda o texto como está aqui como a sua mensagem pronta para este trâmite em ' + esc(i.typeLabel) + ' (nomes e datas desta solicitação viram {variáveis})">' + ic('check', 'ic-sm') + ' ' + (m.pessoal ? 'Salvar alterações' : 'Salvar como minha mensagem') + '</button>' +
      (tem ? '<button type="button" class="btn btn-sm" id="mp-acrescentar">Acrescentar ao texto</button>' : '') +
      '<button type="button" class="btn btn-sm btn-primary" id="mp-usar">' + (tem ? 'Substituir o texto' : 'Usar mensagem') + '</button></div>' +
    (outros.length ? '<div class="mp-outros"><span class="fraco">Outros modelos seus:</span>' + outros.map(x => '<button type="button" class="linkish" data-mp-outro="' + esc(x.id) + '">' + esc(x.rot) + '</button>').join('') + '</div>' : '') +
  '</div>';
}

export function respostaHtml(i, obs, ctx) {
  const nota = (t, onvio) => '<div class="cmp cmp-nota"><span>' + ic('alert', 'ic-sm') + ' ' + esc(t) + '</span>' + (onvio ? '<button type="button" class="btn btn-sm" data-abrir-onvio>' + ic('link', 'ic-sm') + ' Abrir no Onvio</button>' : '') + '</div>';
  if (!OC.ACOES.tramite(i.type)) return nota('Responder ainda não está disponível na extensão para ' + i.typeLabel + ': responda pelo Onvio.', true);
  const pode = OC.podeAcao('tramite', i);
  if (!pode.ok) return nota('Não dá para responder: ' + pode.motivo + '.');
  const r = rascunho(i);
  if (r.preencherPendente && ctx && ctx.datas !== undefined) {
    r.preencherPendente = false;
    r.texto = OC.preencherModelo(r.texto, vars(i, ctx));
    r.selMarca = OC.marcadoresPendentes(r.texto)[0] || '';       // o que faltar já vem marcado
  }
  const ints = intsDe(i, r);
  const it = ints.find(x => String(x.sit) === String(r.sit));
  if (r.pend) return pendHtml(i, r);
  const aberto = r.aberto || r.texto || r.sit || r.arquivos.length || r.guardando || r.erro;
  const ok = recemEnviado(i) ? '<div class="cmp-ok">' + ic('check', 'ic-sm') + ' Trâmite enviado às ' + horaDe(enviado.em) + '. Ele aparece no fim da conversa.</div>' : '';
  const erro = r.erro ? '<div class="cmp-erro">' + ic('alert', 'ic-sm') + '<span>' + esc(r.erro) + '</span></div>' : '';
  const arqs = r.arquivos.length ? '<div class="cmp-arqs">' + r.arquivos.map((a, n) => '<span class="cmp-arq">' + ic('paperclip', 'ic-sm') + esc(a.name) + ' · ' + tamanho(a.size) + (r.modo === 'editar' ? ' <button type="button" class="linkish" data-tira-arq="' + n + '" aria-label="Tirar ' + esc(a.name) + '">×</button>' : '') + '</span>').join('') + '</div>' : '';

  // revisar, contagem para desistir e envio: o rascunho aparece na conversa e aqui só o resumo
  if (r.modo !== 'editar') {
    const resta = Math.max(0, Math.ceil((r.fimEm - Date.now()) / 1000));
    const proxDisp = ctx && ctx.proxima;
    let pe;
    if (r.modo === 'contagem') pe = '<div class="cmp-contagem"><span id="cmp-conta-tx">Enviando em ' + resta + ' s…</span><i class="cmp-barra"><i id="cmp-barra" style="--dur:' + r.segTotal + 's"></i></i><button class="btn btn-sm" id="a-desfazer" type="button">Desfazer</button></div>';
    else if (r.modo === 'enviando') pe = '<div class="cmp-contagem"><span id="cmp-env-tx">' + esc(r.prog || 'Enviando ao Onvio…') + '</span></div>';
    else pe = '<div class="cmp-pe"><span class="spacer"></span><button class="btn btn-sm" id="a-voltar" type="button">Voltar e editar</button>' +
      (proxDisp ? '<button class="btn btn-sm" id="a-enviar-prox" type="button" title="Envia e abre a próxima solicitação da lista">Confirmar e ir para a próxima</button>' : '') +
      '<button class="btn btn-sm btn-primary" id="a-enviar" type="button">Confirmar envio</button></div>';
    return '<div class="cmp aberto revisando" id="cmp" tabindex="-1">' + erro + '<div class="acao-conf cmp-conf" id="a-conf"><b>Confira o rascunho na conversa e confirme o envio ao Onvio:</b><ul>' +
      (r.antes.length ? '<li>Em ' + (r.antes.length + 1) + ' passos, um depois do outro: ' + r.antes.map((a, n) => (n + 1) + ') ' + esc(a.rot) + ' (texto: "' + esc(a.texto) + '")').join(', ') + ', ' + (r.antes.length + 1) + ') ' + esc(it ? it.onvio : '?') + ' (com o texto abaixo)</li>' : '') +
      '<li>Situação do trâmite: ' + esc(it ? it.onvio + ' (' + it.efeito.toLowerCase() + ')' : '?') + '</li>' +
      '<li>Texto: "' + esc(OC.aplicarDestaques(r.texto.length > 140 ? r.texto.slice(0, 140) + '…' : r.texto)) + '"</li>' +
      (r.arquivos.length ? '<li>' + r.arquivos.length + ' anexo(s): ' + esc(r.arquivos.map(a => a.name).join(', ')) + '</li>' : '') +
      '</ul><p class="fraco">Fica registrado no Onvio em seu nome e o cliente pode ver o trâmite. Depois de enviado, não dá para desfazer pela extensão.</p>' + avisosHtml(r, i) + '</div>' + pe + '</div>';
  }

  // Mensagem pronta: uma por trâmite (o balão abre por cima; o texto é editável antes de usar). Criar/Salvar como modelo.
  const cliObs = obs.filter(o => !o.interno);
  const ints0 = intsDe(i, r);
  const balao = r.mp ? balaoHtml(i, r, cliObs, ctx) : '';
  const tem = !!r.texto.trim();
  const guardar = r.guardando
    ? '<div class="cmp-guardar"><b>' + (r.guardDeTexto ? 'Salvar como modelo' : 'Criar modelo') + '</b>' +
      '<label class="field">Trâmite<select id="mg-sit">' + ints0.map(x => '<option value="' + x.sit + '"' + (String(x.sit) === String(r.guardSit) ? ' selected' : '') + '>' + esc(x.rot.split(' · ')[0]) + ' (' + esc(x.onvio) + ')</option>').join('') + '</select></label>' +
      '<label class="field">Texto da mensagem<textarea id="mg-texto" rows="6" maxlength="2000" placeholder="Escreva a mensagem. Use {saudacao}, {cliente}, {empregado}, {pagamento} para os dados de cada solicitação.">' + esc(r.guardTexto) + '</textarea></label>' +
      '<p class="fraco">Vira a sua mensagem pronta para esse trâmite em ' + esc(i.typeLabel) + ' (no lugar da do escritório). Nomes e datas desta solicitação viraram {variáveis}: confira se não ficou nome, CPF ou valor.</p>' +
      '<div class="cmp-pe"><button class="btn btn-sm" id="mg-cancelar" type="button">Cancelar</button><button class="btn btn-sm btn-primary" id="mg-salvar" type="button">Salvar modelo</button></div></div>' : '';
  const rotSit = it ? it.rot.split(' · ')[0] : '';
  return '<div class="cmp' + (aberto ? ' aberto' : '') + '" id="cmp">' + ok + erro + foraHtml(r) + arqs + guardar +
    '<div class="cmp-caixa">' +
      '<div class="cmp-chat">' +
        '<label class="cmp-fer-b cmp-ico" title="Anexar arquivos ao trâmite (até ' + MAX_ANEXOS + ' de 15 MB; também dá para arrastar ou colar uma imagem)" aria-label="Anexar">' + ic('paperclip') + '<input type="file" id="a-arquivos" multiple hidden></label>' +
        '<button type="button" class="cmp-fer-b cmp-ico' + (r.mp ? ' on' : '') + '" id="cmp-mp" aria-expanded="' + !!r.mp + '" aria-label="Mensagem pronta" title="Mensagem pronta: uma mensagem completa para cada trâmite (com as observações para o cliente); você edita antes de usar">' + ic('chat') + '</button>' +
        '<textarea id="a-texto" rows="1" placeholder="Escreva a resposta ao cliente">' + esc(r.texto) + '</textarea>' +
        '<div class="cmp-envia">' +
          '<button class="btn btn-primary cmp-enviar" id="a-revisar" type="button" title="Mostra como vai ficar e pede a confirmação antes de enviar ao Onvio">Enviar como <b id="a-sit-rot">' + (it ? esc(rotSit) : '…') + '</b></button>' +
          '<button class="btn btn-primary cmp-split" id="a-sit-menu" type="button" aria-haspopup="true" aria-expanded="' + !!r.menuAberto + '" title="Escolher a situação do trâmite" aria-label="Escolher a situação do trâmite">' + ic('chev-d', 'ic-sm') + '</button>' +
          '<div class="cmp-seg" id="cmp-seg" role="radiogroup" aria-label="Situação do trâmite"' + (r.menuAberto || listaFixa() ? '' : ' hidden') + '>' +
            ints.map(x => { const [t1, t2] = x.rot.split(' · '); return '<button type="button" class="cmp-int' + (String(r.sit) === String(x.sit) ? ' on' : '') + '" role="radio" aria-checked="' + (String(r.sit) === String(x.sit)) + '" data-sit="' + x.sit + '" data-tom="' + x.tom + '" data-pede="' + (x.pedeCliente ? '1' : '0') + '" title="' + esc(x.efeito) + '"><i class="cmp-pt"></i><span class="t">' + esc(t1) + '</span>' + (t2 ? '<span class="s"><span class="sep"> · </span>' + esc(t2) + '</span>' : '') + '</button>'; }).join('') +
          '</div>' +
        '</div>' +
      '</div>' +
      balao +
    '</div>' +
    '<div class="cmp-avisos" id="cmp-avisos">' + avisosHtml(r, i) + '</div>' +
    (!i.resp ? '<p class="cmp-nota-p">Sem responsável: no Onvio, o primeiro trâmite define você como responsável.</p>' : '') +
    '<div class="cmp-rodape">' +
      '<p class="cmp-efeito" id="cmp-efeito">' + (it ? 'Trâmite: ' + esc(it.efeito) + '.' : 'Escolha a situação do trâmite.') + '</p>' +
      '<button type="button" class="cmp-fer-b" id="a-guardar" title="' + (tem ? 'Salva o texto escrito como a sua mensagem pronta para um trâmite (dados desta solicitação viram variáveis)' : 'Cria uma mensagem pronta sua para um trâmite') + '">' + ic('plus', 'ic-sm') + ' <span id="a-guardar-tx">' + (tem ? 'Salvar como modelo' : 'Criar modelo') + '</span></button>' +
      '<button class="cmp-fer-b" id="a-descartar" type="button"' + (r.texto || r.arquivos.length || r.sit ? '' : ' disabled') + '>Descartar</button>' +
    '</div>' +
  '</div>';
}

const base64 = arq => new Promise((ok, falha) => {
  const fr = new FileReader();
  fr.onload = () => ok(String(fr.result).replace(/^data:[^,]*,/, ''));
  fr.onerror = () => falha(new Error('não consegui ler ' + arq.name));
  fr.readAsDataURL(arq);
});

// cb: { redesenhar, feito(proxima), proxima }
export function ligarResposta(g, i, r0, obs, cb) {
  const r = rascunho(i), ctx = { datas: r0 && r0.datas };
  const cmp = $('#cmp', g);
  if (!cmp) return;
  const ints = intsDe(i, r);
  aoAbrir = { r, redesenhar: cb.redesenhar };
  // atualiza sem redesenhar (para não perder o foco nem o cursor)
  const atualizar = () => {
    if (!$('#a-texto', g)) return;
    $$('.cmp-int', g).forEach(b => { const on = String(b.dataset.sit) === String(r.sit); b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    const x = ints.find(z => String(z.sit) === String(r.sit));
    $('#cmp-efeito', g).textContent = x ? 'Trâmite: ' + x.efeito + '.' : 'Escolha a situação do trâmite.';
    $('#a-sit-rot', g).textContent = x ? x.rot.split(' · ')[0] : '…';
    const pede = !!r.texto.trim() && OC.pedeAlgoAoCliente(r.texto, estado.settings).pede;
    $$('.cmp-int', g).forEach(b => b.classList.toggle('sug', !r.sit && pede && b.dataset.pede === '1'));
    $('#a-sit-menu', g).classList.toggle('sug', !r.sit && pede);
    $('#cmp-avisos', g).innerHTML = avisosHtml(r, i);
    $('#a-descartar', g).disabled = !(r.texto || r.arquivos.length || r.sit);
    const gt = $('#a-guardar-tx', g); if (gt) gt.textContent = r.texto.trim() ? 'Salvar como modelo' : 'Criar modelo';
    if (r.texto || r.sit || r.arquivos.length) cmp.classList.add('aberto');
  };
  const cresce = t => { t.style.height = 'auto'; t.style.height = Math.min(220, Math.max(40, t.scrollHeight + 2)) + 'px'; };
  const limparErro = () => { if (r.erro) { r.erro = ''; const e = $('.cmp-erro', g); if (e) e.remove(); } };

  const t = $('#a-texto', g);
  if (t) {
    cresce(t);
    t.oninput = e => { r.texto = e.target.value; limparErro(); cresce(t); atualizar(); };
    t.onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); $('#a-revisar', g).click(); } };   // só revisa: o mesmo toque nunca chega a enviar
    t.onpaste = e => { const fs = [...((e.clipboardData && e.clipboardData.files) || [])]; if (fs.length) { e.preventDefault(); adicionar(fs); } };
    if (r.focar) {
      r.focar = false; t.focus();
      const pos = r.selMarca ? t.value.indexOf(r.selMarca) : -1;    // o que falta preencher já vem marcado
      if (pos >= 0) t.setSelectionRange(pos, pos + r.selMarca.length); else t.setSelectionRange(t.value.length, t.value.length);
      r.selMarca = '';
    }
  }
  cmp.onkeydown = e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && r.modo === 'revisar' && e.target.tagName !== 'BUTTON' && cmp.contains(e.target)) { e.preventDefault(); const b = $('#a-enviar', g); if (b) b.click(); }
  };
  if (r.modo === 'revisar') cmp.focus({ preventScroll: true });
  cmp.ondragover = e => { if (r.modo === 'editar' && e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); cmp.classList.add('arrastando'); } };
  cmp.ondragleave = e => { if (!cmp.contains(e.relatedTarget)) cmp.classList.remove('arrastando'); };
  cmp.ondrop = e => { cmp.classList.remove('arrastando'); if (r.modo === 'editar' && e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); adicionar([...e.dataTransfer.files]); } };

  // "Enviar como ▾": a lista de situações abre sob o botão e fecha ao escolher, ao clicar fora ou com Esc
  const seg = $('#cmp-seg', g), caret = $('#a-sit-menu', g);
  const menu = abrir => {
    if (!seg || !caret || listaFixa()) return;
    seg.hidden = !abrir; caret.setAttribute('aria-expanded', String(!!abrir));
    if (abrir) {                                           // fixa por cima de tudo (a caixa rola por dentro e cortaria a lista)
      const b = caret.getBoundingClientRect(), h = seg.offsetHeight, acima = b.top - 6 - h >= 8;
      seg.style.right = Math.max(8, innerWidth - b.right) + 'px';
      seg.style.top = (acima ? b.top - 6 - h : Math.min(b.bottom + 6, innerHeight - h - 8)) + 'px';
    }
  };
  if (caret) caret.onclick = e => { e.stopPropagation(); menu(seg.hidden); };
  if (seg) {
    $('.cmp-envia', g).onkeydown = e => { if (e.key === 'Escape' && !seg.hidden && !listaFixa()) { e.preventDefault(); e.stopPropagation(); menu(false); caret.focus(); } };      // Esc fecha só a lista, não o detalhe
    const fora = e => { if (!document.contains(seg)) { document.removeEventListener('mousedown', fora); return; } if (!seg.hidden && !e.target.closest('.cmp-envia')) menu(false); };
    document.addEventListener('mousedown', fora);
  }
  r.menuAberto = false;
  $$('.cmp-int', g).forEach(b => b.onclick = () => { if (String(r.sit) !== b.dataset.sit) r.antes = []; r.sit = b.dataset.sit; limparErro(); atualizar(); menu(false); });

  // Mensagem pronta: o balão abre por cima; cada trâmite tem a sua mensagem (editável aqui, só para este uso)
  const cliObs = obs.filter(o => !o.interno);
  const poeTexto = (txt, sit, acrescentar) => {
    r.texto = acrescentar && r.texto.trim() ? r.texto.trimEnd() + '\n\n' + txt : txt;
    if (sit) { if (String(r.sit) !== String(sit)) r.antes = []; r.sit = String(sit); }
    r.aberto = true; r.erro = ''; r.mp = null;
    r.focar = true; r.selMarca = OC.marcadoresPendentes(txt)[0] || '';     // o que falta preencher já vem marcado
    cb.redesenhar();
  };
  if ($('#cmp-mp', g)) $('#cmp-mp', g).onclick = e => { e.stopPropagation(); r.mp = r.mp ? null : { sit: r.sit || '', txt: {} }; r.aberto = true; cb.redesenhar(); };
  const bal = $('#mp-balao', g);
  if (bal) {
    // fica por cima de tudo, junto do botão (posição fixa, para não ser cortado pela rolagem da caixa)
    const b = $('#cmp-mp', g).getBoundingClientRect(), w = Math.min(560, innerWidth - 24), h = bal.offsetHeight;
    bal.style.width = w + 'px';
    bal.style.left = Math.max(12, Math.min(b.left, innerWidth - w - 12)) + 'px';
    bal.style.top = (b.bottom + 6 + h > innerHeight - 8 && b.top - 6 - h > 8 ? b.top - 6 - h : Math.min(b.bottom + 6, innerHeight - h - 8)) + 'px';
    bal.onkeydown = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); r.mp = null; cb.redesenhar(); } };
    $('#mp-fechar', bal).onclick = () => { r.mp = null; cb.redesenhar(); };
    const tx = $('#mp-texto', bal);
    tx.oninput = () => { r.mp.txt[r.mp.sit] = tx.value; };
    $$('[data-mp-sit]', bal).forEach(t2 => t2.onclick = () => { r.mp.sit = t2.dataset.mpSit; cb.redesenhar(); });
    $('#mp-usar', bal).onclick = () => poeTexto(tx.value, r.mp.sit, false);
    if ($('#mp-acrescentar', bal)) $('#mp-acrescentar', bal).onclick = () => poeTexto(tx.value, r.sit ? '' : r.mp.sit, true);
    if ($('#mp-padrao', bal)) $('#mp-padrao', bal).onclick = async () => {
      const m = OC.mensagensProntas(i, estado.settings, estado.modelosPessoais).find(x => String(x.sit) === String(r.mp.sit));
      if (!m || !m.pessoal) return;
      await salvarModelosPessoais((estado.modelosPessoais || []).filter(x => x.id !== m.pessoal.id));
      delete r.mp.txt[r.mp.sit];
      toast('Voltou à mensagem do escritório');
      cb.redesenhar();
    };
    // Salvar ali mesmo o que a pessoa editou no balão: vira (ou substitui) a mensagem pronta dela para este trâmite e tipo
    $('#mp-salvar', bal).onclick = async () => {
      const m = OC.mensagensProntas(i, estado.settings, estado.modelosPessoais).find(x => String(x.sit) === String(r.mp.sit));
      const texto = OC.despersonalizar(tx.value.trim(), vars(i, ctx));
      if (!m || !texto) { toast('Escreva o texto da mensagem antes de salvar', true); return; }
      const outros = (estado.modelosPessoais || []).filter(x => !(Number(x.situacao) === Number(m.sit) && x.tipo === i.type));
      if (outros.length >= 20) { toast('Você já tem 20 mensagens suas: volte alguma à do escritório antes', true); return; }
      await salvarModelosPessoais(outros.concat([{ id: 'm' + Date.now().toString(36), rot: m.rot.split(' · ')[0] + ' · ' + i.typeLabel, texto, situacao: Number(m.sit), tipo: i.type }]));
      delete r.mp.txt[r.mp.sit];
      toast((m.pessoal ? 'Alterações salvas' : 'Salva como a sua mensagem') + ' para "' + m.onvio + '" em ' + i.typeLabel + ' (nomes e datas desta solicitação viraram variáveis)');
      cb.redesenhar();
    };
    $$('[data-mp-outro]', bal).forEach(b2 => b2.onclick = () => { const m = (estado.modelosPessoais || []).find(x => x.id === b2.dataset.mpOutro); if (m) poeTexto(OC.preencherModelo(m.texto, vars(i, ctx)), '', !!r.texto.trim()); });
    if (r.mp.foco !== false) { tx.focus(); r.mp.foco = false; }
  }
  // Criar modelo (sem texto) ou Salvar como modelo (com texto): vira a sua mensagem pronta para um trâmite neste tipo de solicitação
  if ($('#a-guardar', g)) $('#a-guardar', g).onclick = () => {
    r.guardando = true; r.mp = null;
    r.guardDeTexto = !!r.texto.trim();
    r.guardTexto = r.guardDeTexto ? OC.despersonalizar(r.texto, vars(i, ctx)) : '';
    r.guardSit = r.sit || (ints[0] && ints[0].sit) || '';
    cb.redesenhar();
  };
  if ($('#mg-cancelar', g)) $('#mg-cancelar', g).onclick = () => { r.guardando = false; cb.redesenhar(); };
  if ($('#mg-salvar', g)) $('#mg-salvar', g).onclick = async () => {
    const sit = $('#mg-sit', g).value, texto = $('#mg-texto', g).value.trim();
    if (!texto) { r.guardSit = sit; r.guardTexto = ''; r.erro = 'Escreva o texto da mensagem.'; cb.redesenhar(); return; }
    const it = ints.find(x => String(x.sit) === String(sit));
    const outros = (estado.modelosPessoais || []).filter(m => !(Number(m.situacao) === Number(sit) && m.tipo === i.type));     // um por trâmite e tipo: substitui o anterior
    if (outros.length >= 20) { r.erro = 'Você já tem 20 modelos seus: volte algum à mensagem do escritório antes.'; cb.redesenhar(); return; }
    await salvarModelosPessoais(outros.concat([{ id: 'm' + Date.now().toString(36), rot: (it ? it.rot.split(' · ')[0] : 'Trâmite') + ' · ' + i.typeLabel, texto, situacao: Number(sit), tipo: i.type }]));
    r.guardando = false;
    toast('Modelo salvo: é a sua mensagem pronta para "' + (it ? it.onvio : 'esse trâmite') + '" em ' + i.typeLabel);
    cb.redesenhar();
  };

  function adicionar(novos) {
    // o que não entra NUNCA some em silêncio: fica listado na caixa, com o motivo, até a pessoa dizer "Entendi" (e o envio espera por isso)
    const fora = [], bons = [];
    for (const a of novos) {
      if (!a.size) fora.push({ nome: a.name, motivo: 'arquivo vazio' });
      else if (a.size > MAX_BYTES) fora.push({ nome: a.name, motivo: 'maior que 15 MB (' + tamanho(a.size) + ')' });
      else bons.push(a);
    }
    const vagas = Math.max(0, MAX_ANEXOS - r.arquivos.length);
    bons.slice(vagas).forEach(a => fora.push({ nome: a.name, motivo: 'passou do limite de ' + MAX_ANEXOS + ' anexos por trâmite' }));
    // nomes repetidos (ex.: várias "image.png" coladas) ganham (2), (3)… para o Onvio não confundir os arquivos
    const usados = new Set(r.arquivos.map(a => a.name.toLowerCase()));
    const unico = a => {
      if (!usados.has(a.name.toLowerCase())) { usados.add(a.name.toLowerCase()); return a; }
      const m = /^(.*?)(\.[^.]*)?$/.exec(a.name); let n = 2, nome;
      do { nome = m[1] + ' (' + n++ + ')' + (m[2] || ''); } while (usados.has(nome.toLowerCase()));
      usados.add(nome.toLowerCase());
      try { return new File([a], nome, { type: a.type }); } catch (e) { return a; }
    };
    r.arquivos = r.arquivos.concat(bons.slice(0, vagas).map(unico));
    if (fora.length) { r.fora = r.fora.concat(fora); toast(fora.length + (fora.length === 1 ? ' arquivo ficou de fora' : ' arquivos ficaram de fora') + ': veja o aviso na caixa de resposta', true); }
    r.aberto = true; r.focar = true; cb.redesenhar();
  }
  if ($('#a-arquivos', g)) $('#a-arquivos', g).onchange = e => adicionar([...e.target.files]);
  $$('[data-tira-arq]', g).forEach(b => b.onclick = () => { r.arquivos.splice(Number(b.dataset.tiraArq), 1); cb.redesenhar(); });

  if ($('#a-descartar', g)) $('#a-descartar', g).onclick = () => { rascunhos.delete(chaveDe(i)); cb.redesenhar(); };
  if ($('#a-revisar', g)) $('#a-revisar', g).onclick = () => {
    const bloq = OC.avisosResposta(r.texto, r.sit, estado.settings, i).find(a => a.bloqueia);
    r.erro = r.fora.length ? 'Há arquivos que ficaram de fora do envio (veja o aviso acima): confirme com "Entendi" ou escolha-os de novo.' : !r.texto.trim() ? 'Escreva o texto da resposta.' : !r.sit ? 'Escolha a situação do trâmite (Respondido, Em análise, Concluído...).' : bloq ? bloq.msg : '';
    if (!r.erro) r.modo = 'revisar';
    else if (r.texto.trim() && !r.sit) r.menuAberto = true;       // falta só a situação: a lista já abre
    else if (!r.texto.trim() || bloq) { r.focar = true; r.selMarca = bloq ? OC.marcadoresPendentes(r.texto)[0] : ''; }   // volta o cursor para onde falta escrever
    cb.redesenhar();
  };
  if ($('#a-voltar', g)) $('#a-voltar', g).onclick = () => { r.modo = 'editar'; cb.redesenhar(); };
  if ($('#a-enviar', g)) $('#a-enviar', g).onclick = () => iniciar(false);
  if ($('#a-enviar-prox', g)) $('#a-enviar-prox', g).onclick = () => iniciar(true);
  if ($('#a-desfazer', g)) $('#a-desfazer', g).onclick = () => {
    if (pendente) clearInterval(pendente.timer);
    pendente = null; r.modo = 'revisar'; toast('Envio desfeito: o trâmite não foi enviado'); cb.redesenhar();
  };

  // "Enviar": espera desfazerSeg segundos para a pessoa desistir e só então escreve no Onvio
  function iniciar(prox) {
    r.proxima = !!prox;
    const seg = Math.max(0, Number(estado.settings.desfazerSeg) || 0);
    if (!seg) { enviarAgora(); return; }
    r.modo = 'contagem'; r.segTotal = seg; r.fimEm = Date.now() + seg * 1000;
    cb.redesenhar();
    if (pendente) clearInterval(pendente.timer);
    const chave = chaveDe(i);
    pendente = { chave, timer: setInterval(() => {
      const resta = r.fimEm - Date.now(), tx = $('#cmp-conta-tx');
      if (tx) tx.textContent = 'Enviando em ' + Math.max(0, Math.ceil(resta / 1000)) + ' s…';
      if (resta <= 0) { clearInterval(pendente.timer); pendente = null; enviarAgora(); }
    }, 100) };
  }
  // Sobe os arquivos de um trâmite que já existe, um por vez (cada um com o seu resultado) e confere no Onvio, lendo o trâmite de volta,
  // se os aceitos de fato aparecem lá. Devolve os que falharam (com o motivo) e se a conferência deu certo (true/false/null = não deu para ler).
  async function subirAnexos(arquivos, topicId) {
    const prog = tx => { r.prog = tx; const e = $('#cmp-env-tx'); if (e) e.textContent = tx; };
    const falhas = [], aceitos = [];
    for (let n = 0; n < arquivos.length; n++) {
      const a = arquivos[n];
      prog('Anexando ' + (n + 1) + ' de ' + arquivos.length + ': ' + a.name);
      let b64;
      try { b64 = await base64(a); } catch (e) { falhas.push({ arq: a, motivo: 'não consegui ler o arquivo' }); continue; }
      if (!b64) { falhas.push({ arq: a, motivo: 'arquivo vazio' }); continue; }
      let x;
      try { x = await enviar({ cmd: 'anexar', type: i.type, num: String(i.num), topicId, arquivo: { nome: a.name, tipo: a.type, b64 } }); } catch (e) { x = { ok: false, erro: String(e.message || e) }; }
      if (x && x.ok) aceitos.push(a);
      else falhas.push({ arq: a, motivo: x && x.status ? 'o Onvio respondeu HTTP ' + x.status : (x && x.erro) || 'o Onvio não aceitou' });
    }
    let conferido = aceitos.length ? null : true, naoAchados = [];
    if (aceitos.length) {
      prog('Conferindo no Onvio se ' + (aceitos.length === 1 ? 'o anexo chegou' : 'os ' + aceitos.length + ' anexos chegaram') + '…');
      let c; try { c = await enviar({ cmd: 'conferirAnexos', type: i.type, num: String(i.num), topicId, nomes: aceitos.map(a => a.name) }); } catch (e) { c = null; }
      if (c && c.ok) { conferido = c.conferido; naoAchados = (c.naoAchados || []).map(n => String(n).toLowerCase()); }
    }
    for (const a of aceitos) if (naoAchados.includes(a.name.toLowerCase())) falhas.push({ arq: a, motivo: 'o Onvio disse que aceitou, mas o anexo não aparece no trâmite' });
    return { falhas, conferido, enviados: aceitos.length - falhas.filter(f => naoAchados.includes(f.arq.name.toLowerCase())).length, aceitos };
  }
  // Fecha a conta dos anexos: sem pendência segue o fluxo; com pendência a faixa fica na caixa (nunca só um aviso que passa)
  function fecharAnexos(s, topicId) {
    if (s.falhas.length || s.conferido === null) {
      r.pend = { topicId, motivos: Object.fromEntries(s.falhas.map(f => [f.arq.name, f.motivo])), naoConferido: !s.falhas.length ? s.aceitos.map(a => a.name) : null, em: Date.now() };
      r.arquivos = s.falhas.map(f => f.arq);
      return true;
    }
    r.pend = null; r.arquivos = [];
    return false;
  }
  async function enviarAgora() {
    r.modo = 'enviando'; r.erro = ''; r.prog = '';
    cb.redesenhar();
    try {
      // antes de criar o trâmite, todos os arquivos precisam estar legíveis: um que foi movido, apagado ou alterado depois de escolhido falharia no meio
      const ilegiveis = [];
      for (const a of r.arquivos) { try { const buf = await a.slice(0, 1024).arrayBuffer(); if (!a.size || !buf) throw new Error('vazio'); } catch (e) { ilegiveis.push(a.name); } }
      if (ilegiveis.length) throw new Error('não consegui ler ' + ilegiveis.join(', ') + ' (o arquivo foi movido, apagado ou alterado depois de escolhido). Tire-o e escolha de novo. Nada foi enviado');
      // sugestão em dois passos: cada um só segue se o anterior foi aceito (o service worker confere a situação de verdade antes de cada envio)
      const passos = r.antes.slice();
      for (let n = 0; n < passos.length; n++) {
        const pr = await enviar({ cmd: 'acao', type: i.type, num: String(i.num), acao: 'tramite', texto: passos[n].texto, situacao: passos[n].situacao, analista: '', data: '', arquivos: [] });
        if (!pr.ok) throw new Error('passo ' + (n + 1) + ' (' + passos[n].rot + '): ' + (pr.erro || 'o Onvio não aceitou') + '. Nada foi concluído');
        r.antes.shift();
        await new Promise(ok => setTimeout(ok, 500));
      }
      // o trâmite vai sem os arquivos; eles sobem em seguida, um por vez, com andamento e conferência (0.63.0)
      let resp;
      try { resp = await enviar({ cmd: 'acao', type: i.type, num: String(i.num), acao: 'tramite', texto: r.texto, situacao: r.sit, analista: '', data: '', arquivos: [] }); }
      catch (e) { if (passos.length) { r.erro = 'O passo "' + passos[passos.length - 1].rot + '" foi enviado, mas a conclusão não: ' + (e.message || e) + '. Atualize e conclua de novo.'; r.modo = 'editar'; cb.redesenhar(); return; } throw e; }
      if (!resp.ok && passos.length) { r.erro = 'O passo "' + passos[passos.length - 1].rot + '" foi enviado, mas a conclusão não: ' + (resp.erro || 'o Onvio não aceitou') + '. Atualize e conclua de novo.'; r.modo = 'editar'; cb.redesenhar(); return; }
      if (!resp.ok) throw new Error(resp.erro || 'o Onvio não aceitou');
      const depois = r.aoEnviar, prox = r.proxima, total = r.arquivos.length;
      enviado = { chave: chaveDe(i), em: Date.now() };
      let pendente2 = false, s = null;
      if (total) {
        if (!resp.topicId) { s = { falhas: r.arquivos.map(a => ({ arq: a, motivo: 'o Onvio não devolveu o número do trâmite' })), conferido: true, aceitos: [] }; }
        else s = await subirAnexos(r.arquivos.slice(), resp.topicId);
        r.texto = ''; r.sit = ''; r.antes = []; r.aoEnviar = null; r.fora = [];
        pendente2 = fecharAnexos(s, resp.topicId || null);
      }
      if (depois) { try { await depois(); } catch (e) { console.error(e); } }
      if (pendente2) {
        r.modo = 'editar'; r.aberto = true; r.erro = '';
        toast('Trâmite enviado, mas ' + (s.falhas.length ? (s.falhas.length === 1 ? '1 anexo não chegou' : s.falhas.length + ' anexos não chegaram') : 'não consegui conferir os anexos') + ': veja o aviso na caixa de resposta', true);
        cb.redesenhar();
        return;
      }
      toast('Trâmite enviado ao Onvio' + (total ? ' com ' + (total === 1 ? '1 anexo' : total + ' anexos') + ' (conferido no trâmite)' : ''));
      rascunhos.delete(chaveDe(i));
      cb.feito(prox);
    } catch (e) {
      r.modo = 'editar'; r.erro = 'Não foi enviado: ' + (e.message || e);
      cb.redesenhar();
    }
  }
  // Anexos que ficaram para trás: tentar de novo (só os que faltam, no trâmite que já existe), abrir o Onvio ou tirar o aviso depois de conferir
  if ($('#a-reanexar', g)) $('#a-reanexar', g).onclick = async () => {
    const topicId = r.pend && r.pend.topicId, arqs = r.arquivos.slice();
    if (!topicId) { toast('Sem o número do trâmite não dá para tentar de novo por aqui: anexe pelo Onvio', true); return; }
    r.reenviando = true; r.prog = 'Anexando…'; cb.redesenhar();
    const s = await subirAnexos(arqs, topicId);
    r.reenviando = false;
    if (fecharAnexos(s, topicId)) { toast(s.falhas.length ? (s.falhas.length === 1 ? 'Ainda falta 1 anexo' : 'Ainda faltam ' + s.falhas.length + ' anexos') + ': veja o aviso' : 'Não consegui conferir os anexos: veja o aviso', true); cb.redesenhar(); }
    else { toast('Todos os anexos chegaram ao Onvio (conferido no trâmite)'); rascunhos.delete(chaveDe(i)); cb.feito(false); }
  };
  if ($('#a-pend-abrir', g)) $('#a-pend-abrir', g).onclick = async () => { const x = await enviar({ cmd: 'abrir', item: { type: i.type, num: String(i.num) } }); if (!x.ok) toast('Não foi possível abrir no Onvio: ' + (x.erro || ''), true); };
  if ($('#a-pend-fechar', g)) $('#a-pend-fechar', g).onclick = () => { rascunhos.delete(chaveDe(i)); cb.redesenhar(); };
  if ($('#a-fora-ok', g)) $('#a-fora-ok', g).onclick = () => { r.fora = []; cb.redesenhar(); };
  // depois de um redesenho no meio da contagem, a barra continua de onde estava
  if (r.modo === 'contagem') { const b = $('#cmp-barra', g); if (b) b.style.animationDelay = '-' + Math.max(0, r.segTotal * 1000 - Math.max(0, r.fimEm - Date.now())) + 'ms'; }
}

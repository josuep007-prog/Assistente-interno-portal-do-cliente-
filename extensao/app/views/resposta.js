/* Caixa de resposta do detalhe (trâmite para o cliente), fixa embaixo da conversa.
 * - escolhe o que acontece depois do envio (Respondido, Em análise, Concluído...), com o efeito em palavras;
 * - modelos com variáveis ({saudacao}, {empregado}...), do escritório (regras) e pessoais;
 * - avisos de coerência entre o texto e a situação; marcadores como "(descreva ...)" barram o envio;
 * - "Revisar" mostra o rascunho na própria conversa; "Enviar" espera alguns segundos para desistir (trâmite não pode
 *   ser excluído) e só então chama o Onvio (cmd 'acao', pelo service worker, depois da conferência de escritório);
 * - o rascunho fica só na memória desta visita (nunca gravado); texto e anexos enviados também não são guardados.
 * Sempre com confirmação da pessoa: nada sai sem "Enviar". */
import { estado, enviar, primeiroNome, salvarModelosPessoais } from '../estado.js';
import { esc, toast, simples, $, $$ } from '../util.js';
const OC = window.OC;

const MAX_ANEXOS = 10, MAX_BYTES = 15 * 1024 * 1024;
const rascunhos = new Map();     // 'tipo:num' -> rascunho (só na memória)
let pendente = null;             // { chave, timer }: contagem para desistir
let enviado = null;              // { chave, em }: o último envio, para o aviso e o destaque da bolha
let recolhida = true;            // começa só com a barra de título, para a conversa ter a janela; abre ao clicar, no atalho R ou ao preparar uma resposta (vale nesta visita)
let chaveAberta = '';            // a solicitação a que o estado recolhida/aberta se refere: ao abrir outra, volta a recolher
let lateral = false;              // janela larga: a caixa de resposta fica ao lado da conversa, sempre aberta (sem recolher)
let aoAbrir = null;              // { r, redesenhar } da caixa na tela, para o atalho R e o botão Responder abrirem a recolhida

const chaveDe = i => i.type + ':' + i.num;
// clique fora do balão da Mensagem pronta fecha o balão (o texto editado nele não vai para a resposta)
document.addEventListener('mousedown', e => {
  if (!aoAbrir || !aoAbrir.r.mp || !e.target.closest || e.target.closest('#mp-balao, #cmp-mp')) return;
  aoAbrir.r.mp = null; aoAbrir.redesenhar();
});
const novoRascunho = () => ({ mp: null, guardSit: '', guardDeTexto: false, texto: '', sit: '', arquivos: [], modo: 'editar', erro: '', aoEnviar: null, antes: [], guardando: false, guardTexto: '', guardRot: '', aberto: false, focar: false, selMarca: '', proxima: false, fimEm: 0, segTotal: 0 });
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
  chaveAberta = chaveDe(i); recolhida = false;
}
// fechou o detalhe: a próxima solicitação aberta começa recolhida
export const definirLateral = b => { lateral = !!b; };
export function reiniciarCaixa() { chaveAberta = ''; recolhida = true; }
// Clique fora da caixa (dentro do detalhe) recolhe; o rascunho fica. Não recolhe revisando ou enviando.
export function recolherSeFora(alvo) {
  if (lateral || recolhida || !aoAbrir || !alvo || !alvo.closest || !$('#cmp') || aoAbrir.r.modo !== 'editar') return false;
  if (alvo.closest('#cmp') || alvo.closest('.dlg-actions, [data-responder]')) return false;      // o rodapé (Responder, Mais ações...) não conta como "fora"
  recolhida = true; aoAbrir.redesenhar();
  return true;
}
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
  if (!lateral && recolhida && aoAbrir && $('#cmp')) { recolhida = false; aoAbrir.r.focar = true; aoAbrir.redesenhar(); return true; }
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
    '<div class="tr-texto">' + esc(r.texto) + '</div>' +
    (r.arquivos.length ? '<div class="tr-anexos">' + r.arquivos.map(a => '<span class="tr-arq off"><span class="ax-nome">' + esc(a.name) + ' · ' + tamanho(a.size) + '</span></span>').join('') + '</div>' : '') +
    '</div></div>';
}

// A mensagem completa de um trâmite: {variáveis} preenchidas e, quando cabe, as observações para o cliente que o texto ainda não diz
function mensagemCompleta(m, i, cliObs, ctx) {
  const t = OC.preencherModelo(m.texto, vars(i, ctx));
  if (!m.completa) return t;
  const datas = o => o.texto.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
  const extras = cliObs.filter(o => !t.includes(o.texto) && !datas(o).some(d => t.includes(d)));
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
  if (chaveAberta !== chaveDe(i)) { chaveAberta = chaveDe(i); recolhida = r.modo === 'editar'; }     // outra solicitação: recolhida (salvo se está revisando ou enviando)
  const ints = intsDe(i, r);
  const it = ints.find(x => String(x.sit) === String(r.sit));
  const vez = i.lado === 'esc' ? 'Vez do escritório' : i.lado === 'cli' ? 'Vez do cliente' : '';
  const aberto = r.aberto || r.texto || r.sit || r.arquivos.length || r.guardando || r.erro;
  const cab = '<div class="cmp-cab"><b' + (simples() ? ' title="Atalho: R"' : '') + '>Responder ao cliente</b>' + (vez ? '<span class="cmp-vez ' + esc(i.lado) + '">' + vez + (i.parado != null ? ' · parada há ' + i.parado + ' dia(s)' : '') + '</span>' : '') + '<span class="cmp-atalho">atalho <kbd>R</kbd></span>' + (r.modo !== 'editar' || lateral ? '' : '<button type="button" class="cmp-rec" id="cmp-rec" aria-expanded="' + (recolhida && r.modo === 'editar' ? 'false' : 'true') + '" title="' + (recolhida && r.modo === 'editar' ? 'Abrir a caixa de resposta' : 'Recolher a caixa de resposta (o rascunho fica guardado)') + '">' + ic(recolhida && r.modo === 'editar' ? 'chev-r' : 'chev-d', 'ic-sm') + (recolhida && r.modo === 'editar' ? ' Abrir' : '') + '</button>') + '</div>';
  const ok = recemEnviado(i) ? '<div class="cmp-ok">' + ic('check', 'ic-sm') + ' Trâmite enviado às ' + horaDe(enviado.em) + '. Ele aparece no fim da conversa.</div>' : '';
  const erro = r.erro ? '<div class="cmp-erro">' + ic('alert', 'ic-sm') + '<span>' + esc(r.erro) + '</span></div>' : '';
  const arqs = r.arquivos.length ? '<div class="cmp-arqs">' + r.arquivos.map((a, n) => '<span class="cmp-arq">' + ic('paperclip', 'ic-sm') + esc(a.name) + ' · ' + tamanho(a.size) + (r.modo === 'editar' ? ' <button type="button" class="linkish" data-tira-arq="' + n + '" aria-label="Tirar ' + esc(a.name) + '">×</button>' : '') + '</span>').join('') + '</div>' : '';

  // recolhida: só a barra de título (com o aviso de que há rascunho)
  if (recolhida && !lateral && r.modo === 'editar') {
    const ha = r.texto.trim() || r.arquivos.length;
    return '<div class="cmp cmp-min" id="cmp" title="Abrir a caixa de resposta">' + cab + ok + erro + (ha ? '<span class="fraco cmp-min-rasc">Rascunho guardado' + (r.texto.trim() ? ' (' + r.texto.trim().length + ' caracteres)' : '') + (r.arquivos.length ? ' · ' + r.arquivos.length + ' anexo(s)' : '') + '</span>' : '') + '</div>';
  }

  // revisar, contagem para desistir e envio: o rascunho aparece na conversa e aqui só o resumo
  if (r.modo !== 'editar') {
    const resta = Math.max(0, Math.ceil((r.fimEm - Date.now()) / 1000));
    const proxDisp = ctx && ctx.proxima;
    let pe;
    if (r.modo === 'contagem') pe = '<div class="cmp-contagem"><span id="cmp-conta-tx">Enviando em ' + resta + ' s…</span><i class="cmp-barra"><i id="cmp-barra" style="--dur:' + r.segTotal + 's"></i></i><button class="btn btn-sm" id="a-desfazer" type="button">Desfazer</button></div>';
    else if (r.modo === 'enviando') pe = '<div class="cmp-contagem"><span>Enviando ao Onvio…</span></div>';
    else pe = '<div class="cmp-pe"><span class="spacer"></span><button class="btn btn-sm" id="a-voltar" type="button">Voltar e editar</button>' +
      (proxDisp ? '<button class="btn btn-sm" id="a-enviar-prox" type="button" title="Envia e abre a próxima solicitação da lista">Enviar e ir para a próxima</button>' : '') +
      '<button class="btn btn-sm btn-primary" id="a-enviar" type="button">Enviar</button></div>';
    return '<div class="cmp aberto revisando" id="cmp" tabindex="-1">' + cab + erro + '<div class="acao-conf cmp-conf" id="a-conf"><b>Confira o rascunho na conversa e envie ao Onvio:</b><ul>' +
      (r.antes.length ? '<li>Em ' + (r.antes.length + 1) + ' passos, um depois do outro: ' + r.antes.map((a, n) => (n + 1) + ') ' + esc(a.rot) + ' (texto: "' + esc(a.texto) + '")').join(', ') + ', ' + (r.antes.length + 1) + ') ' + esc(it ? it.onvio : '?') + ' (com o texto abaixo)</li>' : '') +
      '<li>Situação do trâmite: ' + esc(it ? it.onvio + ' (' + it.efeito.toLowerCase() + ')' : '?') + '</li>' +
      '<li>Texto: "' + esc(r.texto.length > 140 ? r.texto.slice(0, 140) + '…' : r.texto) + '"</li>' +
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
  return '<div class="cmp' + (aberto ? ' aberto' : '') + '" id="cmp">' + cab + ok + erro +
    '<div class="cmp-caixa">' +
      '<textarea id="a-texto" rows="2" placeholder="Escreva a resposta ao cliente (texto simples; o Onvio não usa formatação)">' + esc(r.texto) + '</textarea>' +
      '<div class="cmp-fer">' +
        '<label class="cmp-fer-b" title="Anexar arquivos ao trâmite (até ' + MAX_ANEXOS + ' de 15 MB; também dá para arrastar ou colar uma imagem)">' + ic('paperclip', 'ic-sm') + ' Anexar<input type="file" id="a-arquivos" multiple hidden></label>' +
        '<button type="button" class="cmp-fer-b' + (r.mp ? ' on' : '') + '" id="cmp-mp" aria-expanded="' + !!r.mp + '" title="Uma mensagem completa para cada trâmite (com as observações para o cliente); você edita antes de usar">' + ic('chat', 'ic-sm') + ' Mensagem pronta</button>' +
        '<button type="button" class="cmp-fer-b" id="a-guardar" title="' + (tem ? 'Salva o texto escrito como a sua mensagem pronta para um trâmite (dados desta solicitação viram variáveis)' : 'Cria uma mensagem pronta sua para um trâmite') + '">' + ic('plus', 'ic-sm') + ' <span id="a-guardar-tx">' + (tem ? 'Salvar como modelo' : 'Criar modelo') + '</span></button>' +
        '<span class="cmp-fer-dica">arraste arquivos ou cole uma imagem</span>' +
      '</div>' +
      balao +
    '</div>' +
    arqs + guardar +
    '<div class="cmp-avisos" id="cmp-avisos">' + avisosHtml(r, i) + '</div>' +
    (!i.resp ? '<p class="cmp-nota-p">Sem responsável: no Onvio, o primeiro trâmite define você como responsável.</p>' : '') +
    '<div class="cmp-envio"><span class="cmp-rot">Trâmite</span><div class="cmp-seg" role="radiogroup" aria-label="Situação do trâmite">' +
        ints.map(x => { const [t1, t2] = x.rot.split(' · '); return '<button type="button" class="cmp-int' + (String(r.sit) === String(x.sit) ? ' on' : '') + '" role="radio" aria-checked="' + (String(r.sit) === String(x.sit)) + '" data-sit="' + x.sit + '" data-tom="' + x.tom + '" data-pede="' + (x.pedeCliente ? '1' : '0') + '" title="' + esc(x.efeito) + '"><i class="cmp-pt"></i><span class="t">' + esc(t1) + '</span>' + (t2 ? '<span class="s"><span class="sep"> · </span>' + esc(t2) + '</span>' : '') + '</button>'; }).join('') +
      '</div></div>' +
    '<p class="cmp-efeito" id="cmp-efeito">' + (it ? 'Trâmite: ' + esc(it.efeito) + '.' : 'Escolha a situação do trâmite.') + '</p>' +
    '<div class="cmp-pe"><span class="spacer"></span><button class="btn btn-sm" id="a-descartar" type="button"' + (r.texto || r.arquivos.length || r.sit ? '' : ' disabled') + '>Descartar</button><button class="btn btn-sm btn-primary" id="a-revisar" type="button">Revisar ' + ic('chev-r', 'ic-sm') + '</button></div>' +
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
  const alternar = () => {
    if (r.modo !== 'editar') return;                 // revisando ou enviando: não recolhe
    recolhida = !recolhida;
    if (!recolhida) r.focar = true;
    cb.redesenhar();
  };
  if ($('#cmp-rec', g)) $('#cmp-rec', g).onclick = e => { e.stopPropagation(); alternar(); };
  if (cmp.classList.contains('cmp-min')) cmp.onclick = alternar;     // a barra inteira abre a caixa

  // atualiza sem redesenhar (para não perder o foco nem o cursor)
  const atualizar = () => {
    if (!$('#a-texto', g)) return;
    $$('.cmp-int', g).forEach(b => { const on = String(b.dataset.sit) === String(r.sit); b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    const x = ints.find(z => String(z.sit) === String(r.sit));
    $('#cmp-efeito', g).textContent = x ? 'Trâmite: ' + x.efeito + '.' : 'Escolha a situação do trâmite.';
    const pede = !!r.texto.trim() && OC.pedeAlgoAoCliente(r.texto, estado.settings).pede;
    $$('.cmp-int', g).forEach(b => b.classList.toggle('sug', !r.sit && pede && b.dataset.pede === '1'));
    $('#cmp-avisos', g).innerHTML = avisosHtml(r, i);
    $('#a-descartar', g).disabled = !(r.texto || r.arquivos.length || r.sit);
    const gt = $('#a-guardar-tx', g); if (gt) gt.textContent = r.texto.trim() ? 'Salvar como modelo' : 'Criar modelo';
    if (r.texto || r.sit || r.arquivos.length) cmp.classList.add('aberto');
  };
  const cresce = t => { t.style.height = 'auto'; t.style.height = Math.min(220, Math.max(52, t.scrollHeight + 2)) + 'px'; };
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

  $$('.cmp-int', g).forEach(b => b.onclick = () => { if (String(r.sit) !== b.dataset.sit) r.antes = []; r.sit = b.dataset.sit; limparErro(); atualizar(); });

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
    const grandes = novos.filter(a => a.size > MAX_BYTES);
    r.arquivos = r.arquivos.concat(novos.filter(a => a.size <= MAX_BYTES)).slice(0, MAX_ANEXOS);
    if (grandes.length) toast('Maior que 15 MB, ficou de fora: ' + grandes.map(a => a.name).join(', '), true);
    r.aberto = true; r.focar = true; cb.redesenhar();
  }
  if ($('#a-arquivos', g)) $('#a-arquivos', g).onchange = e => adicionar([...e.target.files]);
  $$('[data-tira-arq]', g).forEach(b => b.onclick = () => { r.arquivos.splice(Number(b.dataset.tiraArq), 1); cb.redesenhar(); });

  if ($('#a-descartar', g)) $('#a-descartar', g).onclick = () => { rascunhos.delete(chaveDe(i)); cb.redesenhar(); };
  if ($('#a-revisar', g)) $('#a-revisar', g).onclick = () => {
    const bloq = OC.avisosResposta(r.texto, r.sit, estado.settings, i).find(a => a.bloqueia);
    r.erro = !r.texto.trim() ? 'Escreva o texto da resposta.' : !r.sit ? 'Escolha a situação do trâmite (Respondido, Em análise, Concluído...).' : bloq ? bloq.msg : '';
    if (!r.erro) r.modo = 'revisar';
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
  async function enviarAgora() {
    r.modo = 'enviando'; r.erro = '';
    cb.redesenhar();
    try {
      const arquivos = await Promise.all(r.arquivos.map(async a => ({ nome: a.name, tipo: a.type, b64: await base64(a) })));
      // sugestão em dois passos: cada um só segue se o anterior foi aceito (o service worker confere a situação de verdade antes de cada envio)
      const passos = r.antes.slice();
      for (let n = 0; n < passos.length; n++) {
        const pr = await enviar({ cmd: 'acao', type: i.type, num: String(i.num), acao: 'tramite', texto: passos[n].texto, situacao: passos[n].situacao, analista: '', data: '', arquivos: [] });
        if (!pr.ok) throw new Error('passo ' + (n + 1) + ' (' + passos[n].rot + '): ' + (pr.erro || 'o Onvio não aceitou') + '. Nada foi concluído');
        r.antes.shift();
        await new Promise(ok => setTimeout(ok, 500));
      }
      let resp;
      try { resp = await enviar({ cmd: 'acao', type: i.type, num: String(i.num), acao: 'tramite', texto: r.texto, situacao: r.sit, analista: '', data: '', arquivos }); }
      catch (e) { if (passos.length) { r.erro = 'O passo "' + passos[passos.length - 1].rot + '" foi enviado, mas a conclusão não: ' + (e.message || e) + '. Atualize e conclua de novo.'; r.modo = 'editar'; cb.redesenhar(); return; } throw e; }
      if (!resp.ok && passos.length) { r.erro = 'O passo "' + passos[passos.length - 1].rot + '" foi enviado, mas a conclusão não: ' + (resp.erro || 'o Onvio não aceitou') + '. Atualize e conclua de novo.'; r.modo = 'editar'; cb.redesenhar(); return; }
      if (!resp.ok) throw new Error(resp.erro || 'o Onvio não aceitou');
      if (resp.erroAnexos) toast('Trâmite enviado ao Onvio, mas: ' + resp.erroAnexos, true);
      else toast('Trâmite enviado ao Onvio' + (resp.anexos ? ' com ' + resp.anexos + ' anexo(s)' : ''));
      const depois = r.aoEnviar, prox = r.proxima;
      rascunhos.delete(chaveDe(i));
      enviado = { chave: chaveDe(i), em: Date.now() };
      if (depois) { try { await depois(); } catch (e) { console.error(e); } }
      cb.feito(prox);
    } catch (e) {
      r.modo = 'editar'; r.erro = 'Não foi enviado: ' + (e.message || e);
      cb.redesenhar();
    }
  }
  // depois de um redesenho no meio da contagem, a barra continua de onde estava
  if (r.modo === 'contagem') { const b = $('#cmp-barra', g); if (b) b.style.animationDelay = '-' + Math.max(0, r.segTotal * 1000 - Math.max(0, r.fimEm - Date.now())) + 'ms'; }
}

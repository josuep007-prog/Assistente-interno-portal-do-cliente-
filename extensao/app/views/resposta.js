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
const novoRascunho = () => ({ texto: '', sit: '', arquivos: [], modo: 'editar', erro: '', aoEnviar: null, antes: [], guardando: false, guardTexto: '', guardRot: '', aberto: false, focar: false, selMarca: '', proxima: false, fimEm: 0, segTotal: 0 });
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

  const modelos = OC.modelosPara(i, estado.settings, estado.modelosPessoais);
  const resumo = t => { const x = String(t || '').replace(/\s+/g, ' ').trim(); return x.length > 130 ? x.slice(0, 130) + '…' : x; };
  const itemModelo = (m, n) => '<button type="button" class="cmp-modelo" data-m="' + n + '" title="' + esc(m.texto) + '"><b>' + esc(m.rot) + (m.pessoal ? ' <small>seu</small>' : '') + '</b><span>' + esc(resumo(m.texto)) + '</span></button>';
  const cardsModelos = modelos.length ? modelos.map((m, n) => m.pessoal
    ? '<span class="cmp-modelo-p">' + itemModelo(m, n) + '<button type="button" class="cmp-m-tira" data-m-tira="' + esc(m.id) + '" aria-label="Tirar o modelo ' + esc(m.rot) + '" title="Tirar este modelo">×</button></span>'
    : itemModelo(m, n)).join('') : '<span class="fraco">Nenhum modelo para este tipo de solicitação.</span>';
  const cliObs = obs.filter(o => !o.interno);
  const linhasObs = cliObs.map(o => '<button type="button" class="cmp-obs" data-obs-add="' + esc(o.id) + '" title="Acrescentar ao texto"><span class="cmp-obs-mais">+</span><span>' + esc(o.texto) + '</span></button>').join('');
  const painel = r.painel === 'modelos'
    ? '<div class="cmp-painel" id="cmp-painel"><div class="cmp-painel-cab"><b>Modelos de resposta</b><span class="fraco">clique para colocar no texto</span></div><div class="cmp-modelos">' + cardsModelos + '</div></div>'
    : r.painel === 'obs' && cliObs.length
      ? '<div class="cmp-painel" id="cmp-painel"><div class="cmp-painel-cab"><b>Observações para o cliente</b><span class="fraco">clique para acrescentar ao texto</span><button class="btn btn-sm" id="a-obs" type="button">Inserir todas</button></div><div class="cmp-obs-l">' + linhasObs + '</div></div>'
      : '';
  const guardar = r.guardando
    ? '<div class="cmp-guardar"><b>Guardar como modelo</b><label class="field">Nome<input id="mg-rot" maxlength="40" value="' + esc(r.guardRot) + '" placeholder="Ex.: Pedido de atestado"></label>' +
      '<label class="field">Texto do modelo<textarea id="mg-texto" rows="4" maxlength="800">' + esc(r.guardTexto) + '</textarea></label>' +
      '<p class="fraco">O modelo vale para qualquer cliente: nomes e datas desta solicitação viraram {variáveis}. Confira se não ficou nome, CPF ou valor.</p>' +
      '<div class="cmp-pe"><button class="btn btn-sm" id="mg-cancelar" type="button">Cancelar</button><button class="btn btn-sm btn-primary" id="mg-salvar" type="button">Guardar modelo</button></div></div>' : '';
  return '<div class="cmp' + (aberto ? ' aberto' : '') + '" id="cmp">' + cab + ok + erro +
    '<div class="cmp-caixa">' +
      '<textarea id="a-texto" rows="2" placeholder="Escreva a resposta ao cliente (texto simples; o Onvio não usa formatação)">' + esc(r.texto) + '</textarea>' +
      '<div class="cmp-fer">' +
        '<label class="cmp-fer-b" title="Anexar arquivos ao trâmite (até ' + MAX_ANEXOS + ' de 15 MB; também dá para arrastar ou colar uma imagem)">' + ic('paperclip', 'ic-sm') + ' Anexar<input type="file" id="a-arquivos" multiple hidden></label>' +
        '<button type="button" class="cmp-fer-b' + (r.painel === 'modelos' ? ' on' : '') + '" id="cmp-ab-modelos" aria-expanded="' + (r.painel === 'modelos') + '" title="Modelos de resposta">' + ic('copy', 'ic-sm') + ' Modelos <span class="menu-n">' + modelos.length + '</span></button>' +
        '<button type="button" class="cmp-fer-b' + (r.painel === 'obs' ? ' on' : '') + '" id="cmp-ab-obs" aria-expanded="' + (r.painel === 'obs') + '"' + (cliObs.length ? '' : ' disabled title="Nenhuma observação para este tipo de solicitação"') + '>' + ic('chat', 'ic-sm') + ' Observações <span class="menu-n">' + cliObs.length + '</span></button>' +
        (simples()
          // Simplificado: "Guardar como modelo" fica num menu ⋯ (o botão e a ação são os mesmos)
          ? '<details class="menu cmp-mais"><summary class="cmp-fer-b" title="Mais" aria-label="Mais">' + ic('more', 'ic-sm') + '</summary><div class="menu-list"><button type="button" class="menu-item" id="a-guardar" title="Guarda o texto como modelo seu (dados desta solicitação viram variáveis)">' + ic('plus', 'ic-sm') + ' Guardar como modelo</button></div></details>'
          : '<button type="button" class="cmp-fer-b" id="a-guardar" title="Guarda o texto como modelo seu (dados desta solicitação viram variáveis)">' + ic('plus', 'ic-sm') + ' Guardar como modelo</button>') +
        '<span class="cmp-fer-dica">arraste arquivos ou cole uma imagem</span>' +
      '</div>' +
    '</div>' +
    painel + arqs + guardar +
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

  // modelos: preenche as {variáveis}; o que não tiver valor fica marcado e o cursor já cai nele
  const modelos = OC.modelosPara(i, estado.settings, estado.modelosPessoais);
  $$('.cmp-modelo', g).forEach(b => b.onclick = () => {
    const m = modelos[Number(b.dataset.m)];
    if (!m) return;
    const txt = OC.preencherModelo(m.texto, vars(i, ctx));
    const vazio = !r.texto.trim();
    r.texto = vazio ? txt : r.texto.trimEnd() + '\n\n' + txt;
    if (m.situacao && (vazio || !r.sit)) r.sit = String(m.situacao);
    r.aberto = true; r.erro = ''; r.painel = null;
    cb.redesenhar();
    const t2 = $('#a-texto');
    if (t2) {
      t2.focus();
      const marca = OC.marcadoresPendentes(txt)[0], pos = marca ? t2.value.lastIndexOf(marca) : -1;
      if (pos >= 0) t2.setSelectionRange(pos, pos + marca.length); else t2.setSelectionRange(t2.value.length, t2.value.length);
    }
  });
  // painéis de modelos e de observações: abrem entre a caixa e o rodapé, um de cada vez
  const painelDe = k => () => { r.painel = r.painel === k ? null : k; r.aberto = true; cb.redesenhar(); };
  if ($('#cmp-ab-modelos', g)) $('#cmp-ab-modelos', g).onclick = painelDe('modelos');
  if ($('#cmp-ab-obs', g)) $('#cmp-ab-obs', g).onclick = painelDe('obs');
  $$('[data-m-tira]', g).forEach(b => b.onclick = async e => {
    e.stopPropagation();
    await salvarModelosPessoais((estado.modelosPessoais || []).filter(m => m.id !== b.dataset.mTira));
    toast('Modelo tirado');
    cb.redesenhar();
  });
  $$('.cmp-mais', g).forEach(d => d.addEventListener('mouseleave', () => { d.open = false; }));
  if ($('#a-guardar', g)) $('#a-guardar', g).onclick = () => {
    if (!r.texto.trim()) { r.erro = 'Escreva o texto antes de guardar como modelo.'; cb.redesenhar(); return; }
    r.guardando = true; r.guardRot = ''; r.guardTexto = OC.despersonalizar(r.texto, vars(i, ctx));
    cb.redesenhar();
  };
  if ($('#mg-cancelar', g)) $('#mg-cancelar', g).onclick = () => { r.guardando = false; cb.redesenhar(); };
  if ($('#mg-salvar', g)) $('#mg-salvar', g).onclick = async () => {
    const rot = $('#mg-rot', g).value.trim(), texto = $('#mg-texto', g).value.trim();
    if (!rot || !texto) { r.guardRot = rot; r.guardTexto = texto; r.erro = 'Dê um nome e confira o texto do modelo.'; cb.redesenhar(); return; }
    if ((estado.modelosPessoais || []).length >= 20) { r.erro = 'Você já tem 20 modelos pessoais: tire algum antes.'; cb.redesenhar(); return; }
    await salvarModelosPessoais((estado.modelosPessoais || []).concat([{ id: 'm' + Date.now().toString(36), rot, texto, situacao: r.sit ? Number(r.sit) : null }]));
    r.guardando = false;
    toast('Modelo guardado: ' + rot);
    cb.redesenhar();
  };
  // observações para o cliente (as mesmas da aba "Para o cliente")
  const cliObs = obs.filter(o => !o.interno);
  const poe = lista => {
    const novas = lista.filter(o => !r.texto.includes(o.texto));
    if (!novas.length) return;
    r.texto = (r.texto.trim() ? r.texto.trimEnd() + '\n\n' : '') + (r.texto.includes('Observações importantes:') ? '' : 'Observações importantes:\n') + novas.map(o => '• ' + o.texto).join('\n');
    r.aberto = true; r.focar = true; r.painel = null; cb.redesenhar();
  };
  if ($('#a-obs', g)) $('#a-obs', g).onclick = () => { r.painel = null; r.texto = (r.texto.trim() ? r.texto.trimEnd() + '\n\n' : '') + 'Observações importantes:\n' + cliObs.map(o => '• ' + o.texto).join('\n'); r.aberto = true; r.focar = true; cb.redesenhar(); };
  $$('[data-obs-add]', g).forEach(b => b.onclick = () => { const o = cliObs.find(x => x.id === b.dataset.obsAdd); if (o) poe([o]); });

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

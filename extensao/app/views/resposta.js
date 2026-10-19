/* Caixa de resposta do detalhe (trâmite para o cliente), fixa embaixo da conversa.
 * - escolhe o que acontece depois do envio (Respondido, Em análise, Concluído...), com o efeito em palavras;
 * - modelos com variáveis ({saudacao}, {empregado}...), do escritório (regras) e pessoais;
 * - avisos de coerência entre o texto e a situação; marcadores como "(descreva ...)" barram o envio;
 * - "Revisar" mostra o rascunho na própria conversa; "Enviar" espera alguns segundos para desistir (trâmite não pode
 *   ser excluído) e só então chama o Onvio (cmd 'acao', pelo service worker, depois da conferência de escritório);
 * - o rascunho fica só na memória desta visita (nunca gravado); texto e anexos enviados também não são guardados.
 * Sempre com confirmação da pessoa: nada sai sem "Enviar". */
import { estado, enviar, primeiroNome, salvarModelosPessoais } from '../estado.js';
import { esc, toast, $, $$ } from '../util.js';
const OC = window.OC;

const MAX_ANEXOS = 10, MAX_BYTES = 15 * 1024 * 1024;
const rascunhos = new Map();     // 'tipo:num' -> rascunho (só na memória)
let pendente = null;             // { chave, timer }: contagem para desistir
let enviado = null;              // { chave, em }: o último envio, para o aviso e o destaque da bolha

const chaveDe = i => i.type + ':' + i.num;
const novoRascunho = () => ({ texto: '', sit: '', arquivos: [], modo: 'editar', erro: '', aoEnviar: null, guardando: false, guardTexto: '', guardRot: '', aberto: false, focar: false, selMarca: '', proxima: false, fimEm: 0, segTotal: 0 });
const rascunho = i => { const k = chaveDe(i); if (!rascunhos.has(k)) rascunhos.set(k, novoRascunho()); return rascunhos.get(k); };
const ic = (n, c) => '<svg class="ic' + (c ? ' ' + c : '') + '"><use href="#i-' + n + '"/></svg>';
const tamanho = n => n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1).replace('.', ',') + ' MB';

// abre a caixa já com texto e situação sugeridos (Hoje, Sugestões de ação); aoEnviar roda depois que o Onvio aceitou
export function prepararResposta(i, preset) {
  const p = preset || {}, r = rascunho(i);
  if (p.texto) r.texto = p.texto;
  if (p.situacao) r.sit = String(p.situacao);
  r.aoEnviar = typeof p.aoEnviar === 'function' ? p.aoEnviar : null;
  r.modo = 'editar'; r.aberto = true; r.focar = true; r.erro = '';
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
  const t = $('#a-texto');
  if (!t) return false;
  t.focus(); t.setSelectionRange(t.value.length, t.value.length);
  return true;
}

const vars = (i, ctx) => OC.variaveisTramite(i, ctx && ctx.datas, estado.settings, new Date(), primeiroNome());
const horaDe = ms => new Date(ms).toTimeString().slice(0, 5);

function avisosHtml(r) {
  return OC.avisosResposta(r.texto, r.sit, estado.settings).map(a => '<div class="cmp-aviso' + (a.bloqueia ? ' bloqueia' : '') + '">' + ic(a.bloqueia ? 'alert' : 'chat', 'ic-sm') + '<span>' + esc(a.msg) + '</span></div>').join('');
}

// Bolha tracejada "rascunho" no fim da conversa, enquanto a resposta é revisada ou enviada
export function bolhaRascunho(i) {
  const r = rascunhos.get(chaveDe(i));
  if (!r || r.modo === 'editar') return '';
  const it = OC.intencoesDe(i, estado.settings).find(x => String(x.sit) === String(r.sit));
  const quem = primeiroNome() || 'Você';
  return '<div class="tr-item esc rascunho" id="tr-rascunho"><span class="tr-av" title="' + esc(quem) + '">' + esc((quem[0] || 'V').toUpperCase()) + '</span><div class="tr-bolha">' +
    '<div class="tr-meta"><b>' + esc(quem) + '</b><span class="tr-lado">rascunho</span>' + (it ? '<span class="pill">' + esc(it.onvio) + '</span>' : '') + '<span class="tr-quando">ainda não enviado</span></div>' +
    '<div class="tr-texto">' + esc(r.texto) + '</div>' +
    (r.arquivos.length ? '<div class="tr-anexos">' + r.arquivos.map(a => '<span class="tr-arq off"><span class="ax-nome">' + esc(a.name) + ' · ' + tamanho(a.size) + '</span></span>').join('') + '</div>' : '') +
    '</div></div>';
}

export function respostaHtml(i, obs, ctx) {
  const nota = t => '<div class="cmp cmp-nota"><span>' + ic('alert', 'ic-sm') + ' ' + esc(t) + '</span></div>';
  if (!OC.ACOES.tramite(i.type)) return nota('Responder (Respondido, Concluído...) ainda não está mapeado no Onvio para ' + i.typeLabel + ': use "Abrir no Onvio". Para liberar, rode a Parte 3 de mapeamento/prompt-pendencias-onvio.md.');
  const pode = OC.podeAcao('tramite', i);
  if (!pode.ok) return nota('Não dá para responder: ' + pode.motivo + '.');
  const r = rascunho(i);
  const ints = OC.intencoesDe(i, estado.settings);
  const it = ints.find(x => String(x.sit) === String(r.sit));
  const vez = i.lado === 'esc' ? 'Vez do escritório' : i.lado === 'cli' ? 'Vez do cliente' : '';
  const aberto = r.aberto || r.texto || r.sit || r.arquivos.length || r.guardando || r.erro;
  const cab = '<div class="cmp-cab"><b>Responder ao cliente</b>' + (vez ? '<span class="cmp-vez ' + esc(i.lado) + '">' + vez + (i.parado != null ? ' · parada há ' + i.parado + ' dia(s)' : '') + '</span>' : '') + '<span class="cmp-atalho">atalho: R</span></div>';
  const ok = recemEnviado(i) ? '<div class="cmp-ok">' + ic('check', 'ic-sm') + ' Trâmite enviado às ' + horaDe(enviado.em) + '. Ele aparece no fim da conversa.</div>' : '';
  const erro = r.erro ? '<div class="cmp-erro">' + ic('alert', 'ic-sm') + '<span>' + esc(r.erro) + '</span></div>' : '';
  const arqs = r.arquivos.length ? '<div class="cmp-arqs">' + r.arquivos.map((a, n) => '<span class="cmp-arq">' + ic('paperclip', 'ic-sm') + esc(a.name) + ' · ' + tamanho(a.size) + (r.modo === 'editar' ? ' <button type="button" class="linkish" data-tira-arq="' + n + '" aria-label="Tirar ' + esc(a.name) + '">×</button>' : '') + '</span>').join('') + '</div>' : '';

  // revisar, contagem para desistir e envio: o rascunho aparece na conversa e aqui só o resumo
  if (r.modo !== 'editar') {
    const resta = Math.max(0, Math.ceil((r.fimEm - Date.now()) / 1000));
    const proxDisp = ctx && ctx.proxima;
    let pe;
    if (r.modo === 'contagem') pe = '<div class="cmp-contagem"><span id="cmp-conta-tx">Enviando em ' + resta + ' s…</span><i class="cmp-barra"><i id="cmp-barra" style="--dur:' + r.segTotal + 's"></i></i><button class="btn btn-sm" id="a-desfazer" type="button">Desfazer</button></div>';
    else if (r.modo === 'enviando') pe = '<div class="cmp-contagem"><span>Enviando ao Onvio…</span></div>';
    else pe = '<div class="cmp-pe"><span class="fraco">Ctrl+Enter envia</span><button class="btn btn-sm" id="a-voltar" type="button">Voltar e editar</button>' +
      (proxDisp ? '<button class="btn btn-sm" id="a-enviar-prox" type="button" title="Envia e abre a próxima solicitação da lista">Enviar e ir para a próxima</button>' : '') +
      '<button class="btn btn-sm btn-primary" id="a-enviar" type="button">Enviar</button></div>';
    return '<div class="cmp aberto revisando" id="cmp" tabindex="-1">' + cab + erro + '<div class="acao-conf cmp-conf" id="a-conf"><b>Confira o rascunho na conversa e envie ao Onvio:</b><ul>' +
      '<li>Situação depois do envio: ' + esc(it ? it.onvio + ' (' + it.efeito.toLowerCase() + ')' : '?') + '</li>' +
      '<li>Texto: "' + esc(r.texto.length > 140 ? r.texto.slice(0, 140) + '…' : r.texto) + '"</li>' +
      (r.arquivos.length ? '<li>' + r.arquivos.length + ' anexo(s): ' + esc(r.arquivos.map(a => a.name).join(', ')) + '</li>' : '') +
      '</ul><p class="fraco">Fica registrado no Onvio em seu nome e o cliente pode ver o trâmite. Depois de enviado, não dá para desfazer pela extensão.</p>' + avisosHtml(r) + '</div>' + pe + '</div>';
  }

  const modelos = OC.modelosPara(i, estado.settings, estado.modelosPessoais);
  const chipsModelos = modelos.map((m, n) => m.pessoal
    ? '<span class="cmp-modelo-p"><button type="button" class="cmp-modelo" data-m="' + n + '" title="' + esc(m.texto) + '">' + esc(m.rot) + '</button><button type="button" class="cmp-m-tira" data-m-tira="' + esc(m.id) + '" aria-label="Tirar o modelo ' + esc(m.rot) + '" title="Tirar este modelo">×</button></span>'
    : '<button type="button" class="cmp-modelo" data-m="' + n + '" title="' + esc(m.texto) + '">' + esc(m.rot) + '</button>').join('');
  const cliObs = obs.filter(o => !o.interno);
  const chipsObs = cliObs.map(o => '<button type="button" class="cmp-obs" data-obs-add="' + esc(o.id) + '" title="' + esc(o.texto) + '">+ ' + esc(o.texto.length > 46 ? o.texto.slice(0, 46) + '…' : o.texto) + '</button>').join('');
  const guardar = r.guardando
    ? '<div class="cmp-guardar"><b>Guardar como modelo</b><label class="field">Nome<input id="mg-rot" maxlength="40" value="' + esc(r.guardRot) + '" placeholder="Ex.: Pedido de atestado"></label>' +
      '<label class="field">Texto do modelo<textarea id="mg-texto" rows="4" maxlength="800">' + esc(r.guardTexto) + '</textarea></label>' +
      '<p class="fraco">O modelo vale para qualquer cliente: nomes e datas desta solicitação viraram {variáveis}. Confira se não ficou nome, CPF ou valor.</p>' +
      '<div class="cmp-pe"><button class="btn btn-sm" id="mg-cancelar" type="button">Cancelar</button><button class="btn btn-sm btn-primary" id="mg-salvar" type="button">Guardar modelo</button></div></div>' : '';
  return '<div class="cmp' + (aberto ? ' aberto' : '') + '" id="cmp">' + cab + ok + erro +
    '<textarea id="a-texto" rows="2" placeholder="Escreva a resposta ao cliente (texto simples; o Onvio não usa formatação)">' + esc(r.texto) + '</textarea>' +
    '<div class="cmp-linha cmp-sit"><span class="cmp-rot">Depois do envio</span><div class="cmp-ints" role="radiogroup" aria-label="O que acontece depois do envio">' +
      ints.map(x => '<button type="button" class="cmp-int' + (String(r.sit) === String(x.sit) ? ' on' : '') + '" role="radio" aria-checked="' + (String(r.sit) === String(x.sit)) + '" data-sit="' + x.sit + '" title="' + esc(x.efeito) + '">' + esc(x.rot) + '</button>').join('') + '</div></div>' +
    '<p class="cmp-efeito" id="cmp-efeito">' + (it ? 'Depois do envio: ' + esc(it.efeito) + '.' : 'Escolha o que acontece depois do envio.') + '</p>' +
    '<div class="cmp-linha"><span class="cmp-rot">Modelos</span><div class="cmp-chips">' + chipsModelos + '</div></div>' +
    '<div class="cmp-extra">' +
      (cliObs.length ? '<div class="cmp-linha"><span class="cmp-rot">Observações</span><div class="cmp-chips">' + chipsObs + '</div><button class="linkish" id="a-obs" type="button">Inserir todas</button></div>' : '') +
      '<div class="cmp-linha"><span class="cmp-rot"></span><button type="button" class="linkish" id="a-guardar">Guardar o texto como modelo</button></div>' +
      guardar +
      '<div class="cmp-linha"><label class="btn btn-sm">' + ic('paperclip', 'ic-sm') + ' Anexar ao trâmite<input type="file" id="a-arquivos" multiple hidden></label><span class="fraco">arraste arquivos aqui ou cole uma imagem · até ' + MAX_ANEXOS + ' de 15 MB</span></div>' +
      (!i.resp ? '<p class="fraco">Sem responsável: no Onvio, o primeiro trâmite define você como responsável.</p>' : '') +
    '</div>' +
    arqs +
    '<div class="cmp-avisos" id="cmp-avisos">' + avisosHtml(r) + '</div>' +
    '<div class="cmp-pe"><span class="fraco">Ctrl+Enter revisa</span><button class="btn btn-sm" id="a-descartar" type="button"' + (r.texto || r.arquivos.length || r.sit ? '' : ' disabled') + '>Descartar</button><button class="btn btn-sm btn-primary" id="a-revisar" type="button">Revisar</button></div>' +
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
  const ints = OC.intencoesDe(i, estado.settings);

  // atualiza sem redesenhar (para não perder o foco nem o cursor)
  const atualizar = () => {
    if (!$('#a-texto', g)) return;
    $$('.cmp-int', g).forEach(b => { const on = String(b.dataset.sit) === String(r.sit); b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    const x = ints.find(z => String(z.sit) === String(r.sit));
    $('#cmp-efeito', g).textContent = x ? 'Depois do envio: ' + x.efeito + '.' : 'Escolha o que acontece depois do envio.';
    const pede = !!r.texto.trim() && OC.pedeAlgoAoCliente(r.texto, estado.settings).pede;
    $$('.cmp-int', g).forEach(b => b.classList.toggle('sug', !r.sit && pede && b.dataset.sit === '4'));
    $('#cmp-avisos', g).innerHTML = avisosHtml(r);
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

  $$('.cmp-int', g).forEach(b => b.onclick = () => { r.sit = b.dataset.sit; limparErro(); atualizar(); });

  // modelos: preenche as {variáveis}; o que não tiver valor fica marcado e o cursor já cai nele
  const modelos = OC.modelosPara(i, estado.settings, estado.modelosPessoais);
  $$('.cmp-modelo', g).forEach(b => b.onclick = () => {
    const m = modelos[Number(b.dataset.m)];
    if (!m) return;
    const txt = OC.preencherModelo(m.texto, vars(i, ctx));
    const vazio = !r.texto.trim();
    r.texto = vazio ? txt : r.texto.trimEnd() + '\n\n' + txt;
    if (m.situacao && (vazio || !r.sit)) r.sit = String(m.situacao);
    r.aberto = true; r.erro = '';
    cb.redesenhar();
    const t2 = $('#a-texto');
    if (t2) {
      t2.focus();
      const marca = OC.marcadoresPendentes(txt)[0], pos = marca ? t2.value.lastIndexOf(marca) : -1;
      if (pos >= 0) t2.setSelectionRange(pos, pos + marca.length); else t2.setSelectionRange(t2.value.length, t2.value.length);
    }
  });
  $$('[data-m-tira]', g).forEach(b => b.onclick = async e => {
    e.stopPropagation();
    await salvarModelosPessoais((estado.modelosPessoais || []).filter(m => m.id !== b.dataset.mTira));
    toast('Modelo tirado');
    cb.redesenhar();
  });
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
    r.aberto = true; r.focar = true; cb.redesenhar();
  };
  if ($('#a-obs', g)) $('#a-obs', g).onclick = () => { r.texto = (r.texto.trim() ? r.texto.trimEnd() + '\n\n' : '') + 'Observações importantes:\n' + cliObs.map(o => '• ' + o.texto).join('\n'); r.aberto = true; r.focar = true; cb.redesenhar(); };
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
    const bloq = OC.avisosResposta(r.texto, r.sit, estado.settings).find(a => a.bloqueia);
    r.erro = !r.texto.trim() ? 'Escreva o texto da resposta.' : !r.sit ? 'Escolha o que acontece depois do envio (Respondido, Em análise, Concluído...).' : bloq ? bloq.msg : '';
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
      const resp = await enviar({ cmd: 'acao', type: i.type, num: String(i.num), acao: 'tramite', texto: r.texto, situacao: r.sit, analista: '', data: '', arquivos });
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

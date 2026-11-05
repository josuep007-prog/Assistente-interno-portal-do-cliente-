/* Janela "Anexos": todos os anexos da solicitação (abertura e trâmites) num lugar só; o analista marca quais quer e
 * baixa de uma vez, ou vê um deles sem baixar (abrirVisualizador). O download é um GET feito pela aba do Onvio (cmd baixarAnexos), com a
 * autorização do Onvio, e o arquivo vai para a pasta de downloads do Chrome. A extensão não guarda anexos nem nomes de arquivo. */
import { enviar } from '../estado.js';
import { $, $$, esc, toast, fmtDataHora } from '../util.js';

let fundo = null, ctx = null;
export const anexosAbertos = () => !$('#dlg-anexos').hidden;
export function fecharAnexos() {
  const d = $('#dlg-anexos');
  if (d.hidden) return;
  if (d.dataset.baixando) return;                                   // não fecha no meio do download
  d.hidden = true; d.innerHTML = ''; ctx = null;
  if (fundo) { fundo.remove(); fundo = null; }
}

// Ícone e cor pelo tipo do arquivo (só pela extensão do nome)
const EXT = [[/\.pdf$/i, 'PDF', 'pdf'], [/\.(png|jpe?g|gif|webp|heic|bmp|tiff?)$/i, 'IMG', 'img'], [/\.(xlsx?|csv|ods)$/i, 'XLS', 'xls'], [/\.(docx?|odt|rtf|txt)$/i, 'DOC', 'doc'], [/\.(zip|rar|7z)$/i, 'ZIP', 'zip']];
export function tipoArquivo(nome) { const e = EXT.find(([re]) => re.test(nome || '')); return e ? { rot: e[1], cls: e[2] } : { rot: 'ARQ', cls: 'arq' }; }

// Grupos de anexos a partir do detalhe lido agora: os da solicitação e os de cada trâmite (com id).
export function gruposDeAnexos(r) {
  const g = [];
  const sol = (r && r.arquivos) || [];
  if (sol.length) g.push({ titulo: 'Na abertura da solicitação', sub: '', arquivos: sol.map(a => ({ id: a.id, nome: a.nome, topico: null, direto: a.direto || null })) });
  ((r && r.tramites) || []).forEach(t => {
    const l = (t.arquivos || []).map(a => ({ id: a.id, nome: a.nome, topico: t.id, direto: a.direto || null }));
    if (l.length) g.push({ titulo: 'Trâmite #' + String(t.n).padStart(2, '0') + ' · ' + (t.lado === 'cli' ? 'cliente' : 'escritório'), sub: (t.autor ? t.autor + ' · ' : '') + fmtDataHora(t.em), arquivos: l });
  });
  return g;
}
export const contarAnexos = r => gruposDeAnexos(r).reduce((n, g) => n + g.arquivos.length, 0);

// o: { item: {type, num, typeLabel}, r: resposta do detalhe, marcar: chave de um anexo para já vir marcado }
export function abrirAnexos(o) {
  const grupos = gruposDeAnexos(o.r);
  const lista = [];
  grupos.forEach((g, gi) => g.arquivos.forEach((a, ai) => lista.push(Object.assign({ chave: gi + ':' + ai, grupo: gi }, a))));
  ctx = { item: o.item, lista };
  const d = $('#dlg-anexos');
  if (!fundo) { fundo = document.createElement('div'); fundo.className = 'fundo'; fundo.style.zIndex = 52; fundo.onclick = fecharAnexos; document.body.appendChild(fundo); }
  d.style.zIndex = 53;
  d.hidden = false;
  const marcada = c => (o.marcar ? c === o.marcar : true);
  d.innerHTML =
    '<div class="dlg-head"><div class="tt"><h2 class="pq">Anexos da solicitação #' + esc(o.item.num) + '</h2><div class="dlg-l3">' + lista.length + (lista.length === 1 ? ' arquivo' : ' arquivos') + ' · marque os que quer baixar ou clique no olho para ver sem baixar</div></div><button class="icon-btn" id="ax-fechar" aria-label="Fechar"><svg class="ic"><use href="#i-x"/></svg></button></div>' +
    '<div class="dlg-body">' +
      (lista.length ? '<label class="ax-todos"><input type="checkbox" id="ax-todos"' + (o.marcar ? '' : ' checked') + '> <b>Marcar todos</b></label>' +
        grupos.map((g, gi) => '<section class="ax-grupo"><h4 class="dados-tit">' + esc(g.titulo) + (g.sub ? '<small>' + esc(g.sub) + '</small>' : '') + '</h4>' +
          g.arquivos.map((a, ai) => { const c = gi + ':' + ai, tp = tipoArquivo(a.nome); return '<label class="ax-arq"><input type="checkbox" data-ax="' + c + '"' + (marcada(c) ? ' checked' : '') + (a.id || a.direto ? '' : ' disabled') + '><span class="ax-ic ' + tp.cls + '">' + tp.rot + '</span><span class="ax-nome" title="' + esc(a.nome) + '">' + esc(a.nome) + '</span>' + (a.id || a.direto ? '<button type="button" class="icon-btn ax-ver" data-ax-ver="' + c + '" aria-label="Ver ' + esc(a.nome) + '" title="Ver sem baixar"><svg class="ic ic-sm"><use href="#i-eye"/></svg></button>' : '<small class="fraco">sem identificação: baixe pelo Onvio</small>') + '</label>'; }).join('') +
          '</section>').join('')
        : '<div class="vazio"><b>Nenhum anexo nesta solicitação</b>Os anexos da abertura e dos trâmites aparecem aqui.</div>') +
      '<div id="ax-msg"></div>' +
    '</div>' +
    '<div class="dlg-actions"><span class="fraco" id="ax-cont"></span><span class="spacer"></span><button type="button" class="btn btn-sm" id="ax-cancelar">Cancelar</button><button type="button" class="btn btn-primary btn-sm" id="ax-baixar"><svg class="ic ic-sm"><use href="#i-download"/></svg> Baixar</button></div>';
  const marcados = () => $$('[data-ax]', d).filter(c => c.checked).map(c => lista.find(x => x.chave === c.dataset.ax));
  const contar = () => {
    const n = marcados().length, total = $$('[data-ax]:not([disabled])', d).length;
    $('#ax-cont').textContent = n + ' de ' + total + ' marcado' + (n === 1 ? '' : 's');
    $('#ax-baixar').disabled = !n;
    $('#ax-baixar').lastChild.textContent = n > 1 ? ' Baixar ' + n + ' anexos' : ' Baixar';
    const t = $('#ax-todos'); if (t) { t.checked = n === total && total > 0; t.indeterminate = n > 0 && n < total; }
  };
  $$('[data-ax]', d).forEach(c => c.onchange = contar);
  $$('[data-ax-ver]', d).forEach(b => b.onclick = e => { e.preventDefault(); e.stopPropagation(); abrirVisualizador({ item: o.item, r: o.r, chave: b.dataset.axVer }); });
  if ($('#ax-todos')) $('#ax-todos').onchange = e => { $$('[data-ax]:not([disabled])', d).forEach(c => { c.checked = e.target.checked; }); contar(); };
  $('#ax-fechar').onclick = fecharAnexos;
  $('#ax-cancelar').onclick = fecharAnexos;
  $('#ax-baixar').onclick = () => baixar(marcados());
  contar();
  $('#ax-baixar').focus();
}

async function baixar(lista) {
  const d = $('#dlg-anexos');
  if (!lista.length || !ctx) return;
  const b = $('#ax-baixar'), msg = $('#ax-msg');
  b.disabled = true; d.dataset.baixando = '1';
  msg.innerHTML = '<div class="faixa"><svg class="ic"><use href="#i-download"/></svg>Baixando ' + lista.length + (lista.length === 1 ? ' anexo' : ' anexos') + ' pelo Onvio… Se o Chrome perguntar, permita vários downloads.</div>';
  const r = await enviar({ cmd: 'baixarAnexos', type: ctx.item.type, num: String(ctx.item.num), anexos: lista.map(a => ({ id: a.id, topico: a.topico, nome: a.nome, direto: a.direto || null })) });
  delete d.dataset.baixando;
  if (!ctx) return;
  b.disabled = false;
  if (!r.ok) { msg.innerHTML = '<div class="faixa warn"><svg class="ic"><use href="#i-alert"/></svg>Não foi possível baixar: ' + esc(r.erro || '') + '</div>'; return; }
  const partes = [];
  if (r.baixados) partes.push(r.baixados + (r.baixados === 1 ? ' anexo baixado' : ' anexos baixados'));
  if (r.semRota) partes.push(r.semRota + ' sem caminho conhecido');
  if (r.falhas && r.falhas.length) partes.push(r.falhas.length + ' com erro');
  if (r.baixados && !r.semRota && !(r.falhas && r.falhas.length)) { toast(partes[0] + ': veja a pasta de downloads do Chrome'); fecharAnexos(); return; }
  msg.innerHTML = '<div class="faixa warn"><svg class="ic"><use href="#i-alert"/></svg><div>' + esc(partes.join(' · ')) + '.' +
    (r.semRota ? ' <b>Ainda não sei como o Onvio baixa estes anexos.</b> Abra a solicitação no Onvio e baixe um anexo uma vez (com o Control Onvio instalado): a extensão aprende o caminho e, daí em diante, baixa por aqui.' : '') +
    (r.falhas && r.falhas.length ? '<ul class="ax-falhas">' + r.falhas.slice(0, 8).map(f => '<li>' + esc(f) + '</li>').join('') + '</ul>' : '') +
    (r.semRota ? '<div style="margin-top:8px"><button type="button" class="btn btn-sm" id="ax-onvio"><svg class="ic ic-sm"><use href="#i-link"/></svg> Abrir no Onvio</button></div>' : '') + '</div></div>';
  if ($('#ax-onvio')) $('#ax-onvio').onclick = async () => { const x = await enviar({ cmd: 'abrir', item: { type: ctx.item.type, num: String(ctx.item.num) } }); if (!x.ok) toast('Não foi possível abrir no Onvio: ' + (x.erro || ''), true); };
}

/* ---------- Visualizar um anexo sem baixar (0.73.0, pedido do Josué em 05/11/2026) ----------
 * O arquivo é lido na hora pela aba do Onvio (cmd verAnexo, com a autorização do Onvio) e mostrado aqui: PDF no leitor do Chrome,
 * imagem e texto direto na janela. Fica só na memória desta janela (endereço blob:, liberado ao trocar ou fechar); nada é gravado.
 * Os outros tipos (Word, Excel, zip…) não abrem no navegador: a janela oferece Baixar. Setas (← →) passam pelos anexos da solicitação. */
let ver = null;                                  // { item, lista, pos, url, blob, pedido }
export const verAberto = () => !!ver;
const MIME_EXT = [[/\.pdf$/i, 'application/pdf'], [/\.png$/i, 'image/png'], [/\.jpe?g$/i, 'image/jpeg'], [/\.gif$/i, 'image/gif'], [/\.webp$/i, 'image/webp'], [/\.bmp$/i, 'image/bmp'], [/\.(txt|csv|xml|json)$/i, 'text/plain']];
const mimeDe = (nome, tipo) => { const t = String(tipo || '').split(';')[0].trim().toLowerCase(); if (t && t !== 'application/octet-stream' && t !== 'binary/octet-stream') return t; const e = MIME_EXT.find(([re]) => re.test(nome || '')); return e ? e[1] : t || 'application/octet-stream'; };
const modoDe = mime => mime === 'application/pdf' ? 'pdf' : /^image\/(png|jpe?g|gif|webp|bmp|svg\+xml)$/.test(mime) ? 'img' : /^text\//.test(mime) ? 'txt' : '';
function liberar() { if (ver && ver.url) { URL.revokeObjectURL(ver.url); ver.url = null; ver.blob = null; } }
export function fecharVer() {
  if (!ver) return;
  liberar(); ver = null;
  const d = $('#dlg-ver'); if (d) { d.hidden = true; d.innerHTML = ''; }
  const f = $('#fundo-ver'); if (f) f.remove();
}
// o: { item, r, chave: 'gi:ai' } — a chave é a mesma da janela Anexos (grupo e posição)
export function abrirVisualizador(o) {
  const lista = [];
  gruposDeAnexos(o.r).forEach((g, gi) => g.arquivos.forEach((a, ai) => { if (a.id || a.direto) lista.push(Object.assign({ chave: gi + ':' + ai, onde: g.titulo }, a)); }));
  const pos = Math.max(0, lista.findIndex(a => a.chave === o.chave));
  if (!lista.length) { toast('Este anexo não tem identificação: veja pelo Onvio', true); return; }
  liberar();
  ver = { item: o.item, lista, pos, url: null, blob: null, pedido: 0 };
  let d = $('#dlg-ver');
  if (!d) { d = document.createElement('section'); d.id = 'dlg-ver'; d.className = 'dlg'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', 'Ver anexo'); d.tabIndex = -1; document.body.appendChild(d); }
  if (!$('#fundo-ver')) { const f = document.createElement('div'); f.className = 'fundo'; f.id = 'fundo-ver'; f.style.zIndex = 56; f.onclick = fecharVer; document.body.appendChild(f); }
  d.style.zIndex = 57; d.hidden = false;
  carregar();
}
export function andarVer(passo) { if (!ver || ver.lista.length < 2) return; ver.pos = (ver.pos + passo + ver.lista.length) % ver.lista.length; liberar(); carregar(); }
function cabVer(a) {
  const n = ver.lista.length, tp = tipoArquivo(a.nome);
  return '<div class="dlg-head ver-cab"><span class="ax-ic ' + tp.cls + '">' + tp.rot + '</span><div class="tt"><h2 class="pq ver-nome" title="' + esc(a.nome) + '">' + esc(a.nome) + '</h2><div class="dlg-l3">' + esc(a.onde) + ' · solicitação #' + esc(ver.item.num) + '</div></div>' +
    (n > 1 ? '<div class="ver-nav"><button type="button" class="icon-btn" id="ver-ant" aria-label="Anexo anterior" title="Anterior (←)"><svg class="ic"><use href="#i-chev-l"/></svg></button><span class="fraco">' + (ver.pos + 1) + ' de ' + n + '</span><button type="button" class="icon-btn" id="ver-prox" aria-label="Próximo anexo" title="Próximo (→)"><svg class="ic"><use href="#i-chev-r"/></svg></button></div>' : '') +
    '<button type="button" class="btn btn-sm" id="ver-baixar"><svg class="ic ic-sm"><use href="#i-download"/></svg> Baixar</button>' +
    '<button type="button" class="icon-btn" id="ver-fechar" aria-label="Fechar"><svg class="ic"><use href="#i-x"/></svg></button></div>';
}
function ligarCab(a) {
  const d = $('#dlg-ver');
  $('#ver-fechar', d).onclick = fecharVer;
  if ($('#ver-ant', d)) { $('#ver-ant', d).onclick = () => andarVer(-1); $('#ver-prox', d).onclick = () => andarVer(1); }
  $('#ver-baixar', d).onclick = () => baixarVisto(a);
}
async function carregar() {
  const d = $('#dlg-ver'), a = ver.lista[ver.pos], meu = ++ver.pedido;
  d.innerHTML = cabVer(a) + '<div class="ver-corpo"><div class="vazio"><b>Abrindo o arquivo pelo Onvio…</b>Ele não é guardado: fica só nesta janela.</div></div>';
  ligarCab(a); d.focus();
  const r = await enviar({ cmd: 'verAnexo', type: ver.item.type, num: String(ver.item.num), anexo: { id: a.id || null, topico: a.topico || null, nome: a.nome, direto: a.direto || null } });
  if (!ver || ver.pedido !== meu) return;                       // trocou de anexo ou fechou enquanto lia
  const corpo = $('.ver-corpo', d);
  if (!r || !r.ok) { corpo.innerHTML = '<div class="vazio"><b>Não foi possível abrir este anexo</b>' + esc((r && r.erro) || 'sem resposta') + '</div>'; return; }
  const bin = atob(r.b64), b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  const mime = mimeDe(a.nome, r.tipo), modo = modoDe(mime);
  ver.blob = new Blob([b], { type: mime }); ver.url = URL.createObjectURL(ver.blob);
  if (modo === 'pdf') corpo.innerHTML = '<iframe class="ver-pdf" title="' + esc(a.nome) + '" src="' + ver.url + '#view=FitH"></iframe>';
  else if (modo === 'img') corpo.innerHTML = '<div class="ver-img"><img alt="' + esc(a.nome) + '" src="' + ver.url + '"></div>';
  else if (modo === 'txt') corpo.innerHTML = '<pre class="ver-txt">' + esc(new TextDecoder().decode(b.subarray(0, 400000))) + '</pre>';
  else corpo.innerHTML = '<div class="vazio"><b>Este tipo de arquivo não abre no navegador</b>' + esc(tipoArquivo(a.nome).rot === 'ARQ' ? 'Baixe para abrir no programa certo.' : 'Arquivos ' + tipoArquivo(a.nome).rot + ' (Word, Excel, zip…) precisam ser baixados para abrir.') + '<div style="margin-top:10px"><button type="button" class="btn btn-primary btn-sm" id="ver-baixar2"><svg class="ic ic-sm"><use href="#i-download"/></svg> Baixar</button></div></div>';
  if ($('#ver-baixar2', d)) $('#ver-baixar2', d).onclick = () => baixarVisto(a);
}
async function baixarVisto(a) {
  if (ver && ver.url && ver.lista[ver.pos] === a) {                // já lido: salva daqui mesmo, sem ler de novo
    const l = document.createElement('a'); l.href = ver.url; l.download = a.nome; l.rel = 'noopener'; l.style.display = 'none'; document.body.appendChild(l); l.click(); l.remove();
    toast('Baixado: veja a pasta de downloads do Chrome'); return;
  }
  const r = await enviar({ cmd: 'baixarAnexos', type: ver.item.type, num: String(ver.item.num), anexos: [{ id: a.id || null, topico: a.topico || null, nome: a.nome, direto: a.direto || null }] });
  if (r && r.ok && r.baixados) toast('Baixado: veja a pasta de downloads do Chrome');
  else toast('Não foi possível baixar: ' + ((r && (r.erro || (r.falhas || [])[0])) || 'sem resposta'), true);
}

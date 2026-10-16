/* Janela "Anexos": todos os anexos da solicitação (abertura e trâmites) num lugar só; o analista marca quais quer e
 * baixa de uma vez. O download é um GET feito pela aba do Onvio (cmd baixarAnexos) e o arquivo vai para a pasta de
 * downloads do Chrome. A extensão não guarda anexos nem nomes de arquivo. */
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
  if (sol.length) g.push({ titulo: 'Na abertura da solicitação', sub: '', arquivos: sol.map(a => ({ id: a.id, nome: a.nome, topico: null })) });
  ((r && r.tramites) || []).forEach(t => {
    const l = (t.arquivos || []).map(a => ({ id: a.id, nome: a.nome, topico: t.id }));
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
    '<div class="dlg-head"><div class="tt"><h2 class="pq">Anexos da solicitação #' + esc(o.item.num) + '</h2><div class="dlg-l3">' + lista.length + (lista.length === 1 ? ' arquivo' : ' arquivos') + ' · marque os que quer baixar</div></div><button class="icon-btn" id="ax-fechar" aria-label="Fechar"><svg class="ic"><use href="#i-x"/></svg></button></div>' +
    '<div class="dlg-body">' +
      (lista.length ? '<label class="ax-todos"><input type="checkbox" id="ax-todos"' + (o.marcar ? '' : ' checked') + '> <b>Marcar todos</b></label>' +
        grupos.map((g, gi) => '<section class="ax-grupo"><h4 class="dados-tit">' + esc(g.titulo) + (g.sub ? '<small>' + esc(g.sub) + '</small>' : '') + '</h4>' +
          g.arquivos.map((a, ai) => { const c = gi + ':' + ai, tp = tipoArquivo(a.nome); return '<label class="ax-arq"><input type="checkbox" data-ax="' + c + '"' + (marcada(c) ? ' checked' : '') + (a.id ? '' : ' disabled') + '><span class="ax-ic ' + tp.cls + '">' + tp.rot + '</span><span class="ax-nome" title="' + esc(a.nome) + '">' + esc(a.nome) + '</span>' + (a.id ? '' : '<small class="fraco">sem identificação: baixe pelo Onvio</small>') + '</label>'; }).join('') +
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
  const r = await enviar({ cmd: 'baixarAnexos', type: ctx.item.type, num: String(ctx.item.num), anexos: lista.map(a => ({ id: a.id, topico: a.topico, nome: a.nome })) });
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

/* Tarefas do Gestta · ações em lote na Lista (0.99.0, Josué 12/11/2026: "quero tudo com a possibilidade de fazer em lote já").
   As mesmas ações aprovadas em 11/11/2026 para uma tarefa (concluir, reabrir, impedimento, retirar impedimento, comentário interno),
   agora para as tarefas marcadas na Lista. Uma confirmação para o lote (com o motivo ou o comentário, iguais para todas), depois
   uma tarefa por vez pelo cmd gesttaAcao, com pausa; para no primeiro 401. Só entra no lote a tarefa em que a ação cabe pela
   situação dela; as outras ficam de fora e a confirmação diz quantas. Nada é guardado: a seleção vale só nesta tela. */
import { $, $$, esc, num, plural, toast } from './util.js';
import { concluirComEtapas } from './gestta-concluir.js';

const enviar = msg => new Promise(res => { try { chrome.runtime.sendMessage(msg, r => res(r || { ok: false, erro: 'sem resposta' })); } catch (e) { res({ ok: false, erro: String(e.message || e) }); } });
export const LOTE = { sel: new Set(), conf: null, rodando: null, falhas: [], grupo: null };

const st = t => String((t && t.status) || '').toUpperCase();
export const ACOES_LOTE = [
  { k: 'concluir', rot: 'Concluir', ic: 'check', cabe: t => st(t) === 'OPEN', feito: ['concluída', 'concluídas'] },
  { k: 'impedir', rot: 'Impedimento', ic: 'alert', cabe: t => st(t) === 'OPEN', campo: 'motivo', rotCampo: 'Motivo do impedimento', feito: ['com impedimento', 'com impedimento'] },
  { k: 'liberar', rot: 'Retirar impedimento', ic: 'check', cabe: t => st(t) === 'IMPEDIMENT', feito: ['liberada', 'liberadas'] },
  { k: 'reabrir', rot: 'Reabrir', ic: 'undo', cabe: t => st(t) === 'DONE', feito: ['reaberta', 'reabertas'] },
  { k: 'comentar', rot: 'Comentar', ic: 'chat', cabe: () => true, campo: 'texto', rotCampo: 'Comentário interno (o cliente não vê)', feito: ['comentada', 'comentadas'] }
];
const acao = k => ACOES_LOTE.find(a => a.k === k);

// a coluna de marcar: o cabeçalho marca ou desmarca as visíveis
export const caixaLinha = t => '<span class="gl-c gl-sel" role="cell"><input type="checkbox" data-gl-sel="' + esc(t._id) + '" aria-label="Marcar ' + esc(t.name || 'tarefa') + '"' + (LOTE.sel.has(t._id) ? ' checked' : '') + (LOTE.rodando ? ' disabled' : '') + '></span>';
export const caixaCab = vis => { const n = vis.filter(t => LOTE.sel.has(t._id)).length; return '<span class="gl-sel" role="columnheader"><input type="checkbox" id="gl-sel-todas" aria-label="Marcar todas as tarefas da lista"' + (n && n === vis.length ? ' checked' : '') + (LOTE.rodando ? ' disabled' : '') + '></span>'; };

export function barraLote(vis) {
  const marcadas = vis.filter(t => LOTE.sel.has(t._id));
  if (LOTE.rodando) return '<div class="gl-lote" role="status"><b>Gravando no Gestta: ' + num(LOTE.rodando.feitas) + ' de ' + num(LOTE.rodando.total) + '…</b><span class="fraco">uma tarefa por vez</span></div>';
  if (!marcadas.length) return '';
  const c = LOTE.conf && acao(LOTE.conf.k);
  if (c) {
    const cabem = marcadas.filter(c.cabe), fora = marcadas.length - cabem.length;
    return '<div class="gl-lote gl-lote-conf" role="alertdialog" aria-label="Confirmar ação em lote"><p><b>' + esc(c.rot) + ' em ' + plural(cabem.length, 'tarefa', 'tarefas') + ' no Gestta?</b>' +
        (fora ? ' ' + plural(fora, 'marcada fica', 'marcadas ficam') + ' de fora: a ação não cabe na situação dela' + (fora === 1 ? '' : 's') + '.' : '') + (c.k === 'concluir' ? ' Antes de concluir cada uma, a extensão marca as etapas que faltam e desconsidera os itens sem anexo.' : '') + ' Uma por vez, e fica registrado no Gestta em seu nome.</p>' +
      (cabem.length ? '<ul class="gl-lote-l">' + cabem.slice(0, 8).map(t => '<li>' + esc(t.name || 'Tarefa') + ' <small>' + esc((t.customer && t.customer.name) || '') + '</small></li>').join('') + (cabem.length > 8 ? '<li class="fraco">e mais ' + num(cabem.length - 8) + '</li>' : '') + '</ul>' : '') +
      (c.campo ? '<label for="gl-lote-campo">' + esc(c.rotCampo) + ' <small class="fraco">(o mesmo para todas)</small></label><textarea id="gl-lote-campo" rows="2" maxlength="4000"' + (LOTE.conf.falta ? ' aria-invalid="true"' : '') + '>' + esc(LOTE.conf.valor || '') + '</textarea>' + (LOTE.conf.falta ? '<small class="gp-conf-falta">Escreva antes de confirmar.</small>' : '') : '') +
      '<div class="gl-lote-bt"><button type="button" class="btn btn-sm btn-primary" id="gl-lote-ok"' + (cabem.length ? '' : ' disabled') + '>Confirmar (' + num(cabem.length) + ')</button><button type="button" class="btn btn-sm" id="gl-lote-nao">Cancelar</button></div></div>';
  }
  return '<div class="gl-lote" role="toolbar" aria-label="Ações em lote"><b>' + plural(marcadas.length, 'tarefa marcada', 'tarefas marcadas') + '</b>' +
    ACOES_LOTE.map(a => { const n = marcadas.filter(a.cabe).length; if (!n) return ''; return '<button type="button" class="btn btn-sm" data-gl-lote="' + a.k + '"' + (n ? '' : ' disabled') + ' title="' + esc(a.rot + ': ' + n + ' das marcadas') + '"><svg class="ic ic-sm" aria-hidden="true"><use href="#i-' + a.ic + '"/></svg>' + esc(a.rot) + (n !== marcadas.length ? ' (' + num(n) + ')' : '') + '</button>'; }).join('') +
    '<button type="button" class="gte-link" id="gl-lote-limpar">Desmarcar</button>' +
    (LOTE.falhas.length ? '<span class="gl-lote-erro">' + esc(plural(LOTE.falhas.length, 'tarefa não foi', 'tarefas não foram')) + ': ' + esc(LOTE.falhas[0]) + '</span>' : '') + '</div>';
}

// liga a seleção, a barra e a confirmação; redesenhar() desenha a Lista de novo
export function ligarLote(el, vis, redesenhar) {
  el.addEventListener('click', e => { if (e.target.closest('[data-gl-sel], .gl-sel')) e.stopPropagation(); }, true);
  el.addEventListener('change', e => {
    const c = e.target.closest('[data-gl-sel]');
    if (c) { if (c.checked) LOTE.sel.add(c.dataset.glSel); else LOTE.sel.delete(c.dataset.glSel); LOTE.conf = null; atualizarBarra(el, vis, redesenhar); return; }
    if (e.target.id === 'gl-sel-todas') { vis.forEach(t => { if (e.target.checked) LOTE.sel.add(t._id); else LOTE.sel.delete(t._id); }); LOTE.conf = null; redesenhar(); }
  });
  ligarBarra(el, vis, redesenhar);
}
function atualizarBarra(el, vis, redesenhar) {
  const b = $('#gl-lote-host', el); if (!b) return;
  b.innerHTML = barraLote(vis);
  const cab = $('#gl-sel-todas', el); if (cab) { const n = vis.filter(t => LOTE.sel.has(t._id)).length; cab.checked = !!n && n === vis.length; cab.indeterminate = n > 0 && n < vis.length; }
  ligarBarra(el, vis, redesenhar);
}
function ligarBarra(el, vis, redesenhar) {
  const host = $('#gl-lote-host', el); if (!host) return;
  $$('[data-gl-lote]', host).forEach(b => b.onclick = () => { LOTE.conf = { k: b.dataset.glLote }; LOTE.falhas = []; atualizarBarra(el, vis, redesenhar); const f = $('#gl-lote-campo', host) || $('#gl-lote-ok', host); if (f) f.focus(); });
  const nao = $('#gl-lote-nao', host); if (nao) nao.onclick = () => { LOTE.conf = null; atualizarBarra(el, vis, redesenhar); };
  const limpar = $('#gl-lote-limpar', host); if (limpar) limpar.onclick = () => { LOTE.sel.clear(); LOTE.conf = null; LOTE.falhas = []; redesenhar(); };
  const ok = $('#gl-lote-ok', host); if (ok) ok.onclick = () => executar(el, vis, redesenhar);
}
async function executar(el, vis, redesenhar) {
  const c = LOTE.conf && acao(LOTE.conf.k); if (!c || LOTE.rodando) return;
  const valor = c.campo ? String(($('#gl-lote-campo', el) || {}).value || '').trim() : '';
  if (c.campo && !valor) { LOTE.conf.falta = true; LOTE.conf.valor = ''; atualizarBarra(el, vis, redesenhar); return; }
  const alvo = vis.filter(t => LOTE.sel.has(t._id) && c.cabe(t));
  LOTE.conf = null; LOTE.falhas = []; LOTE.rodando = { feitas: 0, total: alvo.length };
  redesenhar();
  let ok = 0;
  for (const t of alvo) {
    const msg = { cmd: 'gesttaAcao', acao: c.k, id: t._id }; if (c.campo) msg[c.campo] = valor;
    const r = c.k === 'concluir' ? await concluirComEtapas(enviar, t._id) : await enviar(msg);   // 0.103.0: as etapas antes
    LOTE.rodando.feitas++;
    if (r && r.ok) { ok++; LOTE.sel.delete(t._id); if (r.tarefa && r.tarefa.status) t.status = r.tarefa.status; }
    else { LOTE.falhas.push(((t.name || 'Tarefa') + ': ' + ((r && r.erro) || 'o Gestta não respondeu')).slice(0, 200)); if (r && r.status === 401) break; }
    atualizarBarra(el, vis, redesenhar);
    await new Promise(res => setTimeout(res, 350));
  }
  LOTE.rodando = null;
  toast(plural(ok, 'tarefa ' + c.feito[0], 'tarefas ' + c.feito[1]) + ' no Gestta' + (LOTE.falhas.length ? ' · ' + LOTE.falhas.length + ' com erro (continuam marcadas)' : '') + '.', LOTE.falhas.length > 0);
  redesenhar();
  if (ok) try { window.dispatchEvent(new CustomEvent('gt-tarefa-mudou', { detail: { lote: true } })); } catch (e) {}
}

// 0.104.0 (Josué, 12/11/2026: lote também em Empresas e no Meu dia): "Agir em lote" marca o grupo todo (as tarefas de uma empresa
// ou de um bloco do Meu dia) e mostra a mesma barra da Lista. chave diz qual grupo está em lote; só um por vez.
export const grupoEmLote = chave => LOTE.grupo === chave;
export function marcarGrupo(chave, tarefas) { LOTE.grupo = chave; LOTE.sel = new Set(tarefas.map(t => t._id)); LOTE.conf = null; LOTE.falhas = []; }
export function barraGrupo(chave, tarefas) {
  if (LOTE.grupo !== chave) return '';
  if (!tarefas.some(t => LOTE.sel.has(t._id)) && !LOTE.rodando) { LOTE.grupo = null; return ''; }
  return '<div class="gl-grupo" data-gl-grupo-host><div id="gl-lote-host">' + barraLote(tarefas) + '</div></div>';
}
export function ligarGrupo(el, tarefas, redesenhar) {
  const host = el.querySelector('[data-gl-grupo-host]'); if (!host) return;
  ligarLote(host, tarefas, () => { if (!tarefas.some(t => LOTE.sel.has(t._id)) && !LOTE.rodando) LOTE.grupo = null; redesenhar(); });
}

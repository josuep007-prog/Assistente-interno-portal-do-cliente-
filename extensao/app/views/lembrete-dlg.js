/* Janela "Novo lembrete" / "Editar lembrete" (igual à do Control Hub): texto, data, hora, repetição
 * e, quando vem do detalhe, a solicitação ligada. Só a pessoa vê; fica no Chrome dela. */
import { estado, salvarLembretes } from '../estado.js';
import { $, esc, toast, fmtDataHora } from '../util.js';
const OC = window.OC;
const p2 = n => String(n).padStart(2, '0');
const dataInput = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());

let fundo = null;
export const lembreteAberto = () => !$('#dlg-lembrete').hidden;
export function fecharLembrete() {
  const d = $('#dlg-lembrete');
  if (d.hidden) return;
  d.hidden = true; d.innerHTML = '';
  if (fundo) { fundo.remove(); fundo = null; }
}

// o: { l: lembrete a editar, vinculo: solicitação (type, num, k, cliente), dia: Date sugerida }
export function abrirLembrete(o) {
  o = o || {};
  const l = o.l || null;
  const v = l && l.num ? { type: l.type, num: l.num, k: l.k, cliente: l.cliente } : o.vinculo || null;
  let q = l ? new Date(l.quando) : null;
  if (!q) {
    q = new Date(OC.adiarLembrete({}, 'amanha').quando);
    if (o.dia) { const d = new Date(o.dia); q = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0, 0); if (q < new Date()) q = new Date(OC.adiarLembrete({}, '1h').quando); }
  }
  const d = $('#dlg-lembrete');
  if (!fundo) { fundo = document.createElement('div'); fundo.className = 'fundo'; fundo.style.zIndex = 52; fundo.onclick = fecharLembrete; document.body.appendChild(fundo); }
  d.style.zIndex = 53;
  d.hidden = false;
  d.innerHTML =
    '<div class="dlg-head"><div class="tt"><h2 class="pq">' + (l ? 'Editar lembrete' : 'Novo lembrete') + '</h2></div><button class="icon-btn" id="lm-fechar" aria-label="Fechar"><svg class="ic"><use href="#i-x"/></svg></button></div>' +
    '<form class="dlg-body" id="lm-form" autocomplete="off"><div class="dlg-section">' +
      '<label class="field">Lembrete *<input id="lt" maxlength="300" required placeholder="Ex.: cobrar o cliente sobre o documento" value="' + esc(l ? l.texto : '') + '"></label>' +
      '<div class="form-row"><label class="field">Data *<input id="ld" type="date" required value="' + dataInput(q) + '"></label><label class="field" style="max-width:130px">Hora<input id="lh" type="time" value="' + p2(q.getHours()) + ':' + p2(q.getMinutes()) + '"></label></div>' +
      '<div class="chips"><button type="button" data-q="1h">Em 1 hora</button><button type="button" data-q="amanha">Amanhã 9h</button></div>' +
      '<label class="field">Repetição<select id="lr">' + Object.entries(OC.REPETICOES).map(([k, r]) => '<option value="' + k + '"' + ((l && l.rep || 'nao') === k ? ' selected' : '') + '>' + esc(r) + '</option>').join('') + '</select><span class="field-hint">Ao marcar como feito, um lembrete que repete pula para a próxima data.</span></label>' +
      (v ? '<div class="vinculo"><svg class="ic"><use href="#i-link"/></svg><span>Ligado à solicitação <b>#' + esc(v.num) + '</b>' + (v.cliente ? ' · ' + esc(v.cliente) : '') + '</span></div>' : '') +
      '<p class="field-hint" style="margin:0">Só você vê os seus lembretes. O Chrome avisa na hora marcada, mesmo com o Onvio fechado.</p>' +
    '</div></form>' +
    '<div class="dlg-actions">' + (l ? '<button type="button" class="btn btn-danger btn-sm" id="lx">Excluir</button>' : '') + '<span class="spacer"></span><button type="button" class="btn btn-sm" id="lc">Cancelar</button><button type="button" class="btn btn-primary btn-sm" id="ls">Salvar</button></div>';
  $('#lt').focus();
  $('#lm-fechar').onclick = fecharLembrete;
  $('#lc').onclick = fecharLembrete;
  d.querySelectorAll('[data-q]').forEach(b => b.onclick = () => {
    const x = new Date(OC.adiarLembrete({}, b.dataset.q).quando);
    $('#ld').value = dataInput(x); $('#lh').value = p2(x.getHours()) + ':' + p2(x.getMinutes());
  });
  const salvar = async () => {
    try {
      const n = OC.novoLembrete({ texto: $('#lt').value, quando: $('#ld').value + 'T' + ($('#lh').value || '09:00') + ':00', rep: $('#lr').value, k: v && v.k, type: v && v.type, num: v && v.num, cliente: v && v.cliente });
      const lista = l ? estado.lembretes.map(x => x.id === l.id ? Object.assign(n, { id: l.id, criadoEm: l.criadoEm }) : x) : estado.lembretes.concat(n);
      await salvarLembretes(lista);
      fecharLembrete();
      toast((l ? 'Lembrete salvo para ' : 'Lembrete criado para ') + fmtDataHora(n.quando));
    } catch (e) { toast(e.message, true); }
  };
  $('#ls').onclick = salvar;
  $('#lm-form').onsubmit = e => { e.preventDefault(); salvar(); };
  if (l) $('#lx').onclick = async () => { await salvarLembretes(estado.lembretes.filter(x => x.id !== l.id)); fecharLembrete(); toast('Lembrete excluído'); };
}

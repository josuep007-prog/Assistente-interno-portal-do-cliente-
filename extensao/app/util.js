/* Control Onvio · utilidades do app */
const OC = window.OC;

export const $ = (s, el) => (el || document).querySelector(s);
export const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const plural = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);
export const num = n => Number(n || 0).toLocaleString('pt-BR');

const dt = v => { const d = v instanceof Date ? v : OC.parseDate(v); return d && !isNaN(d) ? d : null; };
const p2 = n => String(n).padStart(2, '0');
export const fmtData = v => { const d = dt(v); return d ? p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear() : ''; };
export const fmtDataCurta = v => { const d = dt(v); return d ? p2(d.getDate()) + '/' + p2(d.getMonth() + 1) : ''; };
export const fmtDataHora = v => { const d = dt(v); return d ? fmtDataCurta(d) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) : ''; };
export const fmtHoraS = v => { const d = v ? new Date(v) : null; return d && !isNaN(d) ? [d.getHours(), d.getMinutes(), d.getSeconds()].map(p2).join(':') : ''; };
export function relativo(v) {
  const d = v ? new Date(v) : null;
  if (!d || isNaN(d)) return '';
  const s = Math.round((Date.now() - d) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return 'há ' + Math.round(s / 60) + ' min';
  if (s < 86400) return 'há ' + Math.round(s / 3600) + ' h';
  return fmtDataHora(d);
}
export const hojeExtenso = () => new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

// Texto de trâmite pode vir com HTML do editor do Onvio: vira texto puro (nada é inserido como HTML).
export function textoPuro(html) {
  if (!html) return '';
  if (!/[<&]/.test(html)) return html;
  const doc = new DOMParser().parseFromString('<div>' + String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n') + '</div>', 'text/html');
  return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

/* ---------- peças de interface ---------- */
export function pillSituacao(i) {
  const cls = i.lado === 'esc' ? 'pill-soon' : i.lado === 'cli' ? '' : 'pill-muted';
  return '<span class="pill ' + cls + '">' + esc(i.status) + '</span>';
}
export const ladoTexto = i => (i.lado === 'esc' ? 'escritório' : i.lado === 'cli' ? 'cliente' : '—');
export function motivosHtml(i) {
  return (i.grav === 3 ? '<span class="pill pill-late" title="Crítica">G3</span>' : '') +
    (i.motivos || []).map(m => '<span class="pill ' + (m.n === 2 ? 'pill-late' : 'pill-today') + '">' + esc(m.m) + '</span>').join('') +
    (i.abaProvavel ? '<span class="pill pill-muted" title="O assunto lembra uma solicitação específica (palavra: ' + esc(i.abaProvavel.palavra) + ')">Pode ser: ' + esc(i.abaProvavel.label) + '</span>' : '');
}
// Linha de lista (mesmo desenho do painel antigo).
export function linhaItem(i, mostrarResp) {
  const sub = [i.detalhe, mostrarResp ? (i.resp || 'sem responsável') : i.solicitante].filter(Boolean).join(' · ');
  const mot = motivosHtml(i);
  return '<div class="row lvl-' + (i.nivel || 0) + '" tabindex="0" data-k="' + esc(i.k) + '">' +
    '<div><div class="row-top"><span class="num mono">#' + esc(i.num) + '</span><span>' + esc(i.typeLabel) + '</span>' + pillSituacao(i) + '</div>' +
    '<div class="cell-main">' + esc(i.apelido || i.cliente || 'Cliente não informado') + '</div>' +
    '<div class="cell-sub">' + esc(sub) + '</div></div>' +
    '<div class="row-side"><span class="dias mono">' + (i.parado || 0) + 'd</span><span>parada</span><span>vez: ' + ladoTexto(i) + '</span></div>' +
    (mot ? '<div class="motivos">' + mot + '</div>' : '') + '</div>';
}

let toastT = null;
export function toast(msg, erro) {
  const t = $('#toast');
  t.textContent = msg; t.classList.toggle('err', !!erro); t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3800);
}

// Liga clique/Enter em linhas [data-k] para abrir o detalhe.
export function ligarItens(el, fonte, abrir) {
  $$('[data-k]', el).forEach(r => {
    const go = () => { const it = fonte.find(x => x.k === r.dataset.k); if (it) abrir(it); };
    r.addEventListener('click', go);
    r.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  });
}

// CSV no formato do Excel brasileiro (; e BOM).
export function baixarCsv(nome, cabecalho, linhas) {
  const cel = v => { const s = String(v == null ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const blob = new Blob(['﻿' + [cabecalho.map(cel).join(';')].concat(linhas.map(l => l.map(cel).join(';'))).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export function csvItens(nome, lista) {
  baixarCsv(nome, ['Tipo', 'ID', 'Situação', 'Vez de', 'Cliente', 'Apelido', 'Empregado/Assunto', 'Responsável', 'Aberta em', 'Último trâmite', 'Expectativa', 'Dias parada', 'Prescreve em (dias)', 'Gravidade', '1º trâmite (d.u.)', 'Possível aba certa', 'Motivos'],
    lista.map(i => [i.typeLabel, i.num, i.status, ladoTexto(i), i.cliente, i.apelido, i.detalhe, i.resp, fmtDataHora(i.created), fmtDataHora(i.last), i.due ? fmtData(i.due) : '', i.parado, i.prescreveEm == null ? '' : i.prescreveEm, i.grav ? 'G' + i.grav : '', i.ptUteis == null ? '' : i.ptUteis, i.abaProvavel ? i.abaProvavel.label : '', (i.motivos || []).map(m => m.m).join(' | ')]));
}

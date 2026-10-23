/* Control Onvio · utilidades do app */
import { estado } from './estado.js';
const OC = window.OC;

export const $ = (s, el) => (el || document).querySelector(s);
export const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const plural = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);
// Estilo escolhido em Configurações → Aparência: "simples" (de fábrica) ou "atual". Só a arrumação em JS que não cabe no CSS pergunta isto.
export const simples = () => document.documentElement.getAttribute('data-estilo') !== 'atual';
export function lerPref(k, padrao) { try { return localStorage.getItem('oc.' + k) || padrao; } catch { return padrao; } }
export function gravarPref(k, v) { try { localStorage.setItem('oc.' + k, v); } catch { /* sem armazenamento: vale só nesta visita */ } }
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

/* ---------- peças de interface ----------
 * O analista vê só prazos legais (pagamento de férias e rescisão, eSocial da admissão) e a idade da solicitação.
 * O prazo interno e a gravidade ordenam por trás (OC.ordemFila) e só aparecem na Equipe (área do gestor). */
export function pillSituacao(i) {
  const g = OC.grupoSituacao(i);
  return '<span class="pill pill-sit g-' + g.k + '" title="' + esc(i.status === g.rot ? g.rot : i.status + ' · ' + g.rot) + '">' + esc(i.status) + '</span>';
}
export const ladoTexto = i => (i.lado === 'esc' ? 'escritório' : i.lado === 'cli' ? 'cliente' : '—');
// Justificativa da gravidade (OC.porqueGravidade) com os limites em vigor: só para a Equipe.
export const porqueGrav = i => OC.porqueGravidade(i, estado.settings);
// 0 sem prazo legal, 1 perto, 2 vencendo: é o que pinta a borda e o texto do prazo
export const nivelLegal = i => Math.max(0, ...(i.motivos || []).filter(m => m.legal).map(m => m.n));
const legais = i => (i.motivos || []).filter(m => m.legal);
export function motivosHtml(i) {
  return legais(i).map(m => '<span class="pill ' + (m.n === 2 ? 'pill-late' : 'pill-today') + (m.acidente ? ' pill-acidente' : '') + (m.t ? '" title="' + esc(m.t) : m.o === 'cli' ? ' pill-cli" title="O pedido chegou em cima do prazo (origem do cliente)' : '') + '">' + esc(m.m) + '</span>').join('') +
    (i.abaProvavel ? '<span class="pill pill-muted" title="O assunto lembra uma solicitação específica (palavra: ' + esc(i.abaProvavel.palavra) + ')">Pode ser: ' + esc(i.abaProvavel.label) + '</span>' : '');
}
const nomeCli = i => i.apelido || i.cliente || 'Cliente não informado';
// Idade da solicitação, em cinza e sem juízo: "aberta há N d.u." (ou parada, quando já mexeram)
const idadeTxt = i => (i.uteisAberto != null ? 'aberta há ' + i.uteisAberto + ' d.u.' : i.parado != null ? 'parada há ' + i.parado + (i.parado === 1 ? ' dia' : ' dias') : '');
// Prazo em uma linha: o prazo legal mais urgente, ou a idade
export function prazoHtml(i) {
  const m = legais(i).sort((a, b) => b.n - a.n)[0];
  if (!m) return '<span class="fraco">' + esc(idadeTxt(i)) + '</span>';
  return '<span class="c-prazo ' + (m.n === 2 ? 'late' : 'today') + '"' + (m.t ? ' title="' + esc(m.t) + '"' : '') + '>' + esc(m.m) + '</span>';
}
// Responsável sugerido para as solicitações sem responsável (lido do histórico dos últimos 30 dias, só na memória do app)
let sugestoesResp = null;
export const definirSugestoesResp = m => { sugestoesResp = m; };
export function respHtml(i) {
  if (i.resp) return esc(i.resp);
  if (!OC.podeAcao('responsavel', i).ok) return '<span class="today">sem responsável</span>';
  const s = sugestoesResp && sugestoesResp.get(i.k);
  // sem sugestão (a solicitação chegou depois da última leitura do histórico, ou a leitura falhou): o botão de escolher continua
  return s && s.resp && s.respId
    ? '<button type="button" class="btn btn-sm sug-resp" data-sug-resp="' + esc(i.k) + '" title="' + esc('Sugerido: ' + s.resp + ', que ' + s.motivo + '. Clique para atribuir: você revisa e confirma.') + '">Sugerido: ' + esc(s.resp.split(' ').slice(0, 2).join(' ')) + '</button>'
    : '<button type="button" class="btn btn-sm sug-resp" data-sug-resp="' + esc(i.k) + '" title="' + esc((s && s.motivo) || 'Sem sugestão ainda: escolha o responsável') + '">Escolher responsável</button>';
}
// Cartão de solicitação (visão "Cartões" das filas): o prazo legal, quando há, ou a idade em cinza
// "Concluir" nas Solicitações, para o que está aguardando o cliente: abre o trâmite já preenchido (1 ou 2 passos, conforme a lista),
// você revisa e confirma. Só aparece na vez do cliente; sem como concluir por aqui, fica desativado com o motivo.
// "Pôr em análise": só onde cabe (vez do escritório, lista com trâmite e Em análise oferecido, ainda não em análise; OC.acaoAnalise)
export function analiseBtn(i) {
  if (!i || i.lado !== 'esc') return '';
  const a = OC.acaoAnalise(i, estado.settings);
  if (!a.cabe) return '';
  return '<button type="button" class="btn btn-sm btn-concluir btn-analise" data-analise="' + esc(i.k) + '" title="Pôr em análise: abre o trâmite já preenchido (situação Em análise); você revisa e confirma.">' +
    '<svg class="ic ic-sm"><use href="#i-clock"/></svg> Pôr em análise</button>';
}
export function concluirBtn(i) {
  if (!i || i.lado !== 'cli') return '';
  const a = OC.acaoConcluir(i, estado.settings);
  const dois = a.acao.antes && a.acao.antes.length;
  return '<button type="button" class="btn btn-sm btn-concluir" data-concluir="' + esc(i.k) + '"' + (a.pode.ok ? ' title="Concluir sem retorno do cliente' + (dois ? ' (em dois passos: ' + esc(a.acao.antes[0].rot) + ' e depois Concluído, com uma confirmação só)' : '') + '. Abre o trâmite já preenchido: você revisa e confirma."' : ' disabled title="' + esc(a.pode.motivo) + '"') + '>' + '<svg class="ic ic-sm"><use href="#i-check"/></svg> Concluir</button>';
}
export function cartaoItem(i, o) {
  const ms = legais(i).sort((a, b) => b.n - a.n);
  const m = ms[0];
  const mot = m ? '<div class="sc-mot ' + (m.n === 2 ? 'late' : 'today') + (m.acidente ? ' acidente' : '') + '" title="' + esc(ms.map(x => x.t || x.m).join(' · ')) + '"><span class="sc-mot-tx">' + esc(m.m) + (ms.length > 1 ? ' <small>+' + (ms.length - 1) + '</small>' : '') + '</span></div>' : '';
  return '<div class="sc lvl-' + nivelLegal(i) + '" tabindex="0" data-k="' + esc(i.k) + '">' +
    '<div class="sc-top"><span class="mono">#' + esc(i.num) + '</span><span class="c-tipo">' + tipoIcone(i.type, 'pq') + '<span class="c-tipo-tx">' + esc(i.typeLabel) + '</span></span>' + pillSituacao(i) + '</div>' +
    '<div class="sc-cli" title="' + esc(i.cliente) + '">' + esc(nomeCli(i)) + '</div>' +
    (simples() && !i.detalhe ? '' : '<div class="sc-sub">' + esc(i.detalhe || '—') + '</div>') +
    mot +
    '<div class="sc-pe"><span><b>' + (i.parado || 0) + 'd</b> parada</span><span class="resp">' + (o && o.semResp ? '' : respHtml(i)) + '</span>' + concluirBtn(i) + analiseBtn(i) + '</div></div>';
}

let toastT = null;
export function toast(msg, erro) {
  const t = $('#toast');
  t.textContent = msg; t.classList.toggle('err', !!erro); t.classList.toggle('ok', !erro); t.classList.add('show');
  t.classList.remove('com-acao');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3800);
}
// Aviso com um botão (por exemplo "Desfazer"); fica um pouco mais na tela e aceita o clique
export function toastAcao(msg, rotulo, fn) {
  const t = $('#toast');
  t.innerHTML = '<span>' + esc(msg) + '</span><button type="button" class="toast-btn">' + esc(rotulo) + '</button>';
  t.classList.remove('err'); t.classList.add('ok', 'show', 'com-acao');
  t.querySelector('.toast-btn').onclick = () => { t.classList.remove('show', 'com-acao'); clearTimeout(toastT); fn(); };
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show', 'com-acao'), 6500);
}

// Liga clique/Enter em [data-k] para abrir o detalhe (com a lista, para "anterior/próxima")
// e ↑/↓ para andar entre as linhas.
export function ligarItens(el, fonte, abrir) {
  const linhas = $$('[data-k]', el);
  linhas.forEach((r, n) => {
    const go = () => { const it = fonte.find(x => x.k === r.dataset.k); if (it) abrir(it, fonte); };
    r.addEventListener('click', go);
    r.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target === r) go();
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const p = linhas[n + (e.key === 'ArrowDown' ? 1 : -1)]; if (p) p.focus(); }
    });
  });
}
// Sem acento e em minúsculas, para buscar "joao" e achar "João".
export const normal = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const iniciais = n => String(n || '').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join('');
export const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
export const dataExtensa = d => { const s = (d || new Date()).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }); return s[0].toUpperCase() + s.slice(1); };

// CSV no formato do Excel brasileiro (; e BOM).
export function baixarCsv(nome, cabecalho, linhas) {
  const cel = v => { const s = String(v == null ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const blob = new Blob(['﻿' + [cabecalho.map(cel).join(';')].concat(linhas.map(l => l.map(cel).join(';'))).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export function csvItens(nome, lista) {
  baixarCsv(nome, ['Tipo', 'ID', 'Situação', 'Vez de', 'Cliente', 'Apelido', 'Empregado/Assunto', 'Responsável', 'Aberta em', 'Último trâmite', 'Expectativa', 'Dias parada', '1º trâmite (d.u.)', 'Possível aba certa', 'Prazo legal'],
    lista.map(i => [i.typeLabel, i.num, i.status, ladoTexto(i), i.cliente, i.apelido, i.detalhe, i.resp, fmtDataHora(i.created), fmtDataHora(i.last), i.due ? fmtData(i.due) : '', i.parado, i.ptUteis == null ? '' : i.ptUteis, i.abaProvavel ? i.abaProvavel.label : '', legais(i).map(m => m.m).join(' | ')]));
}

// Identidade visual de cada tipo de solicitação: ícone (o que é) e família (cor do acento). Sem emoji.
const TIPO_VISUAL = {
  geral: ['i-chat', 'geral'], cadEmpregado: ['i-user-plus', 'cad'], cadContribuinte: ['i-briefcase', 'cad'], cadEstagiario: ['i-cap', 'cad'],
  avisoFerias: ['i-sol', 'ferias'], calcFerias: ['i-calc', 'ferias'], avisoRescisao: ['i-porta', 'resc'], calcRescisao: ['i-calc', 'resc'],
  afastamento: ['i-pulso', 'afast'], rubricas: ['i-recibo', 'rub']
};
export const tipoVisual = k => { const v = TIPO_VISUAL[k] || ['i-layers', 'todos']; return { ic: v[0], fam: v[1] }; };
export const tipoIcone = (k, cls) => { const v = tipoVisual(k); return '<span class="tipo-ic fam-' + v.fam + (cls ? ' ' + cls : '') + '" aria-hidden="true"><svg class="ic"><use href="#' + v.ic + '"/></svg></span>'; };

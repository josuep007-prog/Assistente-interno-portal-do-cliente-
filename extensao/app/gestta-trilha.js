/* Control Onvio · Tarefas do Gestta (0.73.0): a empresa como uma trilha de etapas, a linha do tempo do mês e o painel
 * lateral com o detalhe da tarefa. Usado nas abas "Minhas tarefas" (visão por empresa) e "Fechamento do mês".
 * Cada tarefa do mês é uma etapa: na trilha, na ordem da meta, com o traço cheio até onde está concluído; na linha do
 * tempo, no dia da meta, com a linha do hoje. O detalhe é lido na hora (cmd gesttaTarefa) e nunca guardado. */
import { $, $$, esc, num } from './util.js';
const G = window.OCG;
const enviar = msg => new Promise(res => { try { chrome.runtime.sendMessage(msg, r => res(r || { ok: false, erro: 'sem resposta' })); } catch (e) { res({ ok: false, erro: String(e.message || e) }); } });
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MARCA = { feita: '✓', multa: '!', atrasada: '!', impedimento: '', hoje: '', afazer: '' };
const ddmm = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '';

// Uma etapa (botão): marca do estado (nunca só a cor), dica com nome, meta, setor e responsável
function etapaHtml(e, k, i, cheia) {
  const t = e.t, dica = [t.name || 'Tarefa', G.ESTADOS[e.estado], e.prazo, G.setorDe(t), G.respDe(t)].filter(Boolean).join(' · ');
  return '<li class="gt-et-li' + (cheia ? ' cheia' : '') + '"><button type="button" class="gt-et gt-e-' + e.estado + '" data-et="' + esc(t._id) + '" data-emp="' + esc(k) + '" data-i="' + i + '" title="' + esc(dica) + '" aria-label="' + esc(dica) + '">' +
    '<span class="gt-et-mk" aria-hidden="true">' + MARCA[e.estado] + '</span></button><span class="gt-et-dia" aria-hidden="true">' + esc(ddmm(e.data)) + '</span></li>';
}
// Trilha em sequência (padrão)
export function trilhaSeq(tr, k) {
  if (!tr.total) return '<span class="fraco">Sem tarefas no filtro</span>';
  return '<ol class="gt-trilha" style="--n:' + tr.total + '">' + tr.etapas.map((e, i) => etapaHtml(e, k, i, i <= tr.cheiaAte)).join('') + '</ol>';
}
// Linha do tempo: cada etapa no dia da meta (várias no mesmo dia viram uma pilha com o número)
export function trilhaTempo(tr, k, ano, mes) {
  const nDias = new Date(ano, mes, 0).getDate(), porDia = new Map();
  tr.etapas.forEach((e, i) => { const d = e.data && Number(e.data.slice(0, 4)) === ano && Number(e.data.slice(5, 7)) === mes ? e.dia : null; const c = d || 0; if (!porDia.has(c)) porDia.set(c, []); porDia.get(c).push([e, i]); });
  const peso = { multa: 0, atrasada: 1, impedimento: 2, hoje: 3, afazer: 4, feita: 5 };
  let h = '<div class="gt-tl" style="--dias:' + nDias + '">';
  for (const [d, l] of porDia) {
    if (!d) continue;
    l.sort((a, b) => peso[a[0].estado] - peso[b[0].estado]);
    const [e, i] = l[0];
    h += '<span class="gt-tl-c" style="grid-column:' + d + '">' + etapaBotao(e, k, i) + (l.length > 1 ? '<span class="gt-tl-mais" title="' + esc(l.map(x => x[0].t.name).join(' · ')) + '">' + l.length + '</span>' : '') + '</span>';
  }
  const fora = porDia.get(0);
  return h + '</div>' + (fora ? '<span class="gt-tl-fora fraco">' + num(fora.length) + ' fora do mês</span>' : '');
}
function etapaBotao(e, k, i) {
  const t = e.t, dica = [t.name || 'Tarefa', G.ESTADOS[e.estado], e.prazo, G.setorDe(t), G.respDe(t)].filter(Boolean).join(' · ');
  return '<button type="button" class="gt-et gt-e-' + e.estado + '" data-et="' + esc(t._id) + '" data-emp="' + esc(k) + '" data-i="' + i + '" title="' + esc(dica) + '" aria-label="' + esc(dica) + '"><span class="gt-et-mk" aria-hidden="true">' + MARCA[e.estado] + '</span></button>';
}
// Cabeçalho da linha do tempo: os dias do mês, fim de semana em tom claro e a linha do hoje (no mês corrente)
export function cabecalhoTempo(ano, mes) {
  const nDias = new Date(ano, mes, 0).getDate(), h = new Date();
  let c = '';
  for (let d = 1; d <= nDias; d++) { const w = new Date(ano, mes - 1, d).getDay(); c += '<span class="' + (w === 0 || w === 6 ? 'fds' : '') + (h.getFullYear() === ano && h.getMonth() + 1 === mes && h.getDate() === d ? ' hoje' : '') + '">' + d + '</span>'; }
  return '<div class="gt-tl-dias" style="--dias:' + nDias + '" aria-hidden="true">' + c + '</div>';
}
export function linhaDoHoje(ano, mes) {
  const h = new Date(); if (h.getFullYear() !== ano || h.getMonth() + 1 !== mes) return '';
  const nDias = new Date(ano, mes, 0).getDate();
  return '<span class="gt-tl-hoje" style="--pos:' + ((h.getDate() - .5) / nDias * 100).toFixed(2) + '%" title="Hoje, ' + h.getDate() + ' de ' + MESES[mes - 1] + '"></span>';
}

/* ---------- linha de uma empresa (as duas abas) ---------- */
// e: { id, nome, codigo, tarefas, setores? }; o: { modo: 'seq'|'tempo', ano, mes, hoje }
export function linhaEmpresa(e, o) {
  const tr = G.trilhaDaEmpresa(e.tarefas, o.hoje), k = e.id;
  const atras = tr.etapas.filter(x => x.estado === 'multa' || x.estado === 'atrasada').length, multa = tr.etapas.filter(x => x.estado === 'multa').length, imp = tr.etapas.filter(x => x.estado === 'impedimento').length;
  const fechada = tr.total > 0 && tr.feitas === tr.total;
  const tags = fechada ? '<span class="pill pill-ok">✓ mês fechado</span>' : [multa ? '<span class="pill pill-late">' + num(multa) + ' com multa</span>' : '', atras - multa ? '<span class="pill pill-late">' + num(atras - multa) + (atras - multa === 1 ? ' atrasada' : ' atrasadas') + '</span>' : '', imp ? '<span class="pill pill-today">' + num(imp) + ' impedimento</span>' : ''].join('');
  const setores = (e.setores || []).length > 1 || (e.setores || []).length === 1 && o.comSetores ? '<span class="gt-tr-setores">' + e.setores.map(s => esc(s.nome) + ' ' + s.feitas + '/' + s.total).join(' · ') + '</span>' : '';
  return '<article class="gt-tr' + (fechada ? ' fechada' : '') + (atras ? ' tem-atraso' : '') + '" data-emp-row="' + esc(k) + '">' +
    '<div class="gt-tr-nome"><b title="' + esc(e.nome) + '">' + esc(e.nome) + '</b><small>' + (e.codigo ? 'código ' + esc(e.codigo) : '') + (e.cnpj && !e.codigo ? esc(e.cnpj) : '') + '</small></div>' +
    '<div class="gt-tr-trilha' + (o.modo === 'tempo' ? ' tempo' : '') + '">' + (o.modo === 'tempo' ? trilhaTempo(tr, k, o.ano, o.mes) + linhaDoHoje(o.ano, o.mes) : trilhaSeq(tr, k)) + '</div>' +
    '<div class="gt-tr-res"><span class="gt-tr-num"><b>' + num(tr.feitas) + '</b>/' + num(tr.total) + ' · ' + tr.pct + '%</span>' + tags + setores + '</div></article>';
}
// Lista de empresas em blocos à medida que rola (sem "ver mais", regra do Josué): desenha 120 por vez.
export function listaEmpresas(el, empresas, o) {
  const BLOCO = 120;
  let n = 0;
  const cab = o.modo === 'tempo' ? '<div class="gt-tr gt-tr-cab"><div class="gt-tr-nome"><small>Empresa</small></div><div class="gt-tr-trilha tempo">' + cabecalhoTempo(o.ano, o.mes) + '</div><div class="gt-tr-res"></div></div>' : '';
  el.innerHTML = '<div class="gt-trs' + (o.modo === 'tempo' ? ' modo-tempo' : '') + '">' + cab + '<div class="gt-trs-corpo"></div><div class="gt-trs-fim" aria-hidden="true"></div></div>';
  const corpo = $('.gt-trs-corpo', el), fim = $('.gt-trs-fim', el);
  const mais = () => { const ate = Math.min(empresas.length, n + BLOCO); corpo.insertAdjacentHTML('beforeend', empresas.slice(n, ate).map(e => linhaEmpresa(e, o)).join('')); n = ate; fim.hidden = n >= empresas.length; };
  mais();
  if (n < empresas.length && 'IntersectionObserver' in window) { const io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { mais(); if (n >= empresas.length) io.disconnect(); } }, { rootMargin: '600px' }); io.observe(fim); }
  // a próxima etapa aberta de cada empresa à vista quando a trilha rola na horizontal
  requestAnimationFrame(() => $$('.gt-trilha', el).forEach(ol => { const p = ol.querySelector('.gt-et:not(.gt-e-feita)'); if (p && ol.scrollWidth > ol.clientWidth) ol.scrollLeft = Math.max(0, p.parentElement.offsetLeft - 40); }));
}

/* ---------- painel do detalhe da tarefa ----------
 * Por cima (gaveta à direita, com fundo) ou embutido numa coluna da tela (o.alvo, no Meu dia). Duas abas: Resumo (datas,
 * etapas internas, documentos e pedidos ao cliente) e Linha do tempo (o histórico da tarefa, lido só quando a aba abre).
 * Detalhe e histórico são lidos na hora (cmds gesttaTarefa e gesttaHistorico) e ficam só na memória desta tela. */
let P = null;          // { lista, i, dados, erro, carregando, paraPai, alvo, aba }
const HIST = new Map();  // histórico já lido nesta visita, por id (some ao fechar a tela)
export const painelAberto = () => !!(P && !P.alvo);
export const painelTarefa = () => P && P.lista[P.i];
export function abrirPainel(lista, i, paraPai, o) {
  const alvo = o && o.alvo;
  const aba = P && P.aba === 'tempo' ? 'tempo' : 'resumo';
  if (P && !P.alvo && alvo) fecharPainel();
  P = { lista, i, paraPai, dados: null, erro: null, carregando: true, alvo, aba };
  if (!alvo) {
    let fundo = $('#gt-painel-fundo'), el = $('#gt-painel');
    if (!el) {
      document.body.insertAdjacentHTML('beforeend', '<div class="gt-painel-fundo" id="gt-painel-fundo"></div><aside class="gt-painel" id="gt-painel" role="dialog" aria-modal="true" aria-label="Detalhe da tarefa" tabindex="-1"></aside>');
      fundo = $('#gt-painel-fundo'); el = $('#gt-painel');
      fundo.onclick = fecharPainel;
    }
    fundo.hidden = false; el.hidden = false;
    requestAnimationFrame(() => { el.classList.add('aberto'); fundo.classList.add('aberto'); });
    setTimeout(() => el.focus(), 30);
  }
  desenharPainel(); carregar();
}
export function fecharPainel() {
  if (!P) return;
  const eraFlutuante = !P.alvo;
  P = null;
  if (!eraFlutuante) return;
  const el = $('#gt-painel'), fundo = $('#gt-painel-fundo');
  if (el) { el.classList.remove('aberto'); el.hidden = true; }
  if (fundo) { fundo.classList.remove('aberto'); fundo.hidden = true; }
}
export function passarPainel(d) { if (!P) return; const j = P.i + d; if (j < 0 || j >= P.lista.length) return; P.i = j; P.dados = null; P.erro = null; P.carregando = true; desenharPainel(); carregar(); if (P.aba === 'tempo') carregarHist(); }
async function carregar() {
  const meu = P, t = P.lista[P.i];
  const r = await enviar({ cmd: 'gesttaTarefa', id: t._id });
  if (P !== meu || P.lista[P.i] !== t) return;
  P.carregando = false;
  if (r && r.ok) P.dados = r.tarefa; else P.erro = (r && r.erro) || 'Não consegui ler a tarefa.';
  desenharPainel();
  if (P.aba === 'tempo') carregarHist();
}
async function carregarHist(forcar) {
  const meu = P, id = P.lista[P.i]._id;
  const h = HIST.get(id);
  if (h && !forcar && (h.eventos || h.carregando)) return;
  HIST.set(id, { carregando: true });
  desenharPainel();
  const r = await enviar({ cmd: 'gesttaHistorico', id });
  HIST.set(id, r && r.ok ? { eventos: r.eventos || [], total: r.total, paginas: r.paginas } : { erro: (r && r.erro) || 'Não consegui ler o histórico.' });
  if (P === meu && P.lista[P.i]._id === id) desenharPainel();
}
const fmt = v => { if (!v) return ''; const d = new Date(v); return isNaN(d) ? String(v) : d.toLocaleDateString('pt-BR'); };
const fmtHora = v => { const d = new Date(v); return isNaN(d) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
function linhaDoTempoHtml(id) {
  const h = HIST.get(id);
  if (!h || h.carregando) return '<div class="gt-esq"><i></i><i></i><i></i></div><p class="fraco">Lendo o histórico no Gestta…</p>';
  if (h.erro) return '<div class="faixa"><svg class="ic"><use href="#i-alert"/></svg><div><b>Não consegui ler o histórico.</b> ' + esc(h.erro) + '</div><button class="btn btn-sm" id="gp-hist-tentar">Tentar de novo</button></div>';
  if (!h.eventos.length) return '<p class="fraco">Nada registrado no histórico desta tarefa.</p>';
  return '<ol class="gp-tl">' + h.eventos.map(ev => '<li class="gp-ev tom-' + ev.tom + '"><span class="gp-ev-pt" aria-hidden="true"></span><div class="gp-ev-tx"><b>' + esc(ev.rot) + '</b>' +
      (ev.doc ? '<span class="gp-ev-doc">' + esc(ev.doc) + '</span>' : '') + (ev.motivo ? '<span class="gp-ev-mot">Motivo: ' + esc(ev.motivo) + '</span>' : '') +
      (ev.texto ? '<p class="gp-ev-com">' + esc(ev.texto) + '</p>' : '') +
      '<small>' + esc(fmtHora(ev.quando)) + (ev.quem ? ' · ' + esc(ev.quem.nome) + (ev.quem.cliente ? ' (cliente)' : '') : ev.auto ? ' · automático' : '') + '</small></div></li>').join('') + '</ol>' +
    (h.paginas > 1 ? '<p class="fraco">Mostrando os eventos mais recentes. O histórico completo fica no Gestta.</p>' : '');
}
function desenharPainel() {
  if (!P) return;
  const el = P.alvo || $('#gt-painel'); if (!el) return;
  const base = P.lista[P.i], d = P.dados || {}, hoje = new Date();
  const t = Object.assign({}, base, d, { customer: Object.assign({}, base.customer, d.customer) });
  const g = G.grupoTarefa(t, hoje), est = { feita: 'feita', multa: 'multa', atrasada: 'atrasada', impedimento: 'impedimento', hoje: 'hoje' }[g] || 'afazer';
  const pill = { feita: 'pill-ok', multa: 'pill-late', atrasada: 'pill-late', impedimento: 'pill-today', hoje: 'pill-today' }[est] || '';
  const campo = (k, v) => v ? '<div><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>' : '';
  const setor = (d.company_department && d.company_department.name) || G.setorDe(base), resp = (d.owner && d.owner.name) || G.respDe(base);
  const passos = Array.isArray(d.customer_task_steps) ? d.customer_task_steps.slice().sort((a, b) => (a.order || 0) - (b.order || 0)) : null;
  const docs = (Array.isArray(d.company_documents) ? d.company_documents : []).filter(x => x && !x.disconsidered);
  const pedidos = (d.document_request && Array.isArray(d.document_request.requested_documents) ? d.document_request.requested_documents : []).filter(x => x && !x.disconsidered);
  const nPassos = passos ? passos.length : Number(t.total_step) || 0, fPassos = passos ? passos.filter(p => p.done).length : Number(t.done_step) || 0;
  const resumo = P.carregando
    ? '<div class="gt-esq"><i></i><i></i><i></i><i></i></div><p class="fraco">Lendo a tarefa no Gestta…</p>'
    : P.erro ? '<div class="faixa"><svg class="ic"><use href="#i-alert"/></svg><div><b>Não consegui abrir o detalhe.</b> ' + esc(P.erro) + '</div><button class="btn btn-sm" id="gp-tentar">Tentar de novo</button></div>'
    : (passos && passos.length ? '<section class="gp-sec"><h3>Etapas da tarefa <span class="gt-n">' + fPassos + '/' + nPassos + '</span></h3><div class="gp-prog" aria-hidden="true"><i style="width:' + Math.round(fPassos / nPassos * 100) + '%"></i></div><ul class="gp-passos">' + passos.map(p => '<li class="' + (p.done ? 'ok' : '') + '"><span class="gp-ck" aria-hidden="true">' + (p.done ? '✓' : '') + '</span><span>' + esc(p.name || 'Etapa') + (p.required ? ' <small class="fraco">obrigatória</small>' : '') + '</span><span class="sr-only">' + (p.done ? 'feita' : 'a fazer') + '</span></li>').join('') + '</ul></section>' : '<p class="fraco">Esta tarefa não tem etapas internas.</p>') +
      (docs.length ? '<section class="gp-sec"><h3>Documentos da tarefa</h3><ul class="gp-docs">' + docs.map(x => '<li>' + esc(x.name || 'Documento') + (x.validation_required ? ' <small class="fraco">pede validação</small>' : '') + '</li>').join('') + '</ul></section>' : '') +
      (pedidos.length ? '<section class="gp-sec"><h3>Pedidos ao cliente' + (d.document_request && d.document_request.active ? ' <span class="pill pill-today">cobrança ativa</span>' : '') + '</h3><ul class="gp-docs">' + pedidos.map(x => '<li>' + esc(x.name || 'Documento') + '</li>').join('') + '</ul></section>' : '');
  const abaBtn = (k, rot) => '<button type="button" role="tab" class="gp-aba' + (P.aba === k ? ' on' : '') + '" data-gp-aba="' + k + '" aria-selected="' + (P.aba === k) + '">' + rot + '</button>';
  el.classList.toggle('gp-embutido', !!P.alvo);
  el.innerHTML = '<header class="gp-cab"><div class="gp-nav"><button type="button" class="icon-btn" id="gp-ant" aria-label="Tarefa anterior"' + (P.i ? '' : ' disabled') + '><svg class="ic"><use href="#i-chev-l"/></svg></button><span class="fraco">' + (P.i + 1) + ' de ' + P.lista.length + '</span><button type="button" class="icon-btn" id="gp-prox" aria-label="Próxima tarefa"' + (P.i < P.lista.length - 1 ? '' : ' disabled') + '><svg class="ic"><use href="#i-chev-r"/></svg></button></div>' +
      (P.alvo ? '' : '<button type="button" class="icon-btn" id="gp-fechar" aria-label="Fechar (Esc)"><svg class="ic"><use href="#i-x"/></svg></button>') + '</header>' +
    '<div class="gp-corpo"><div class="gp-topo"><span class="pill ' + pill + '">' + esc(G.ESTADOS[est]) + '</span>' + (nPassos ? '<span class="gp-etapas-mini" title="Etapas da tarefa">' + fPassos + '/' + nPassos + ' etapas</span>' : '') + '</div>' +
      '<h2 class="gp-tit">' + esc(t.name || 'Tarefa') + '</h2><p class="gp-cli">' + (t.customer.code ? '<span class="gt-cod">' + esc(t.customer.code) + '</span>' : '') + esc(t.customer.name || '') + '</p>' +
      '<dl class="gp-dl">' + campo('Meta', fmt(t.due_date) + ' · ' + G.prazoTexto(t, hoje)) + campo('Data legal', fmt(t.legal_date)) + campo('Competência', fmt(t.competence_date)) + campo('Setor', setor) + campo('Responsável', resp) + campo('Concluída em', fmt(t.conclusion_date)) + campo('Modelo', d.company_task && d.company_task.name) + '</dl>' +
      '<div class="gp-abas" role="tablist" aria-label="Detalhe">' + abaBtn('resumo', 'Resumo') + abaBtn('tempo', 'Linha do tempo') + '</div>' +
      '<div class="gp-aba-corpo" role="tabpanel">' + (P.aba === 'tempo' ? linhaDoTempoHtml(base._id) : resumo) + '</div></div>' +
    '<footer class="gp-pe"><button type="button" class="btn btn-primary" id="gp-abrir" title="Abrir esta tarefa no Gestta (Enter)"><svg class="ic ic-sm"><use href="#i-ext"/></svg>Abrir no Gestta</button><button type="button" class="btn" id="gp-aba" title="Abrir em outra aba"><svg class="ic ic-sm"><use href="#i-link"/></svg>Outra aba</button></footer>';
  const f = $('#gp-fechar', el); if (f) f.onclick = fecharPainel;
  $('#gp-ant', el).onclick = () => (P.aoPassar ? P.aoPassar(-1) : passarPainel(-1));
  $('#gp-prox', el).onclick = () => (P.aoPassar ? P.aoPassar(1) : passarPainel(1));
  $('#gp-abrir', el).onclick = () => abrirNoGestta();
  $('#gp-aba', el).onclick = () => { const u = G.urlTarefa(base._id); if (u) window.open(u, '_blank', 'noopener'); };
  $$('[data-gp-aba]', el).forEach(b => b.onclick = () => { P.aba = b.dataset.gpAba; desenharPainel(); if (P.aba === 'tempo') carregarHist(); });
  const tt = $('#gp-tentar', el); if (tt) tt.onclick = () => { P.erro = null; P.carregando = true; desenharPainel(); carregar(); };
  const th = $('#gp-hist-tentar', el); if (th) th.onclick = () => carregarHist(true);
}
// Abrir no Gestta: a camada fecha e o próprio Gestta vai para a tarefa
export function abrirNoGestta() {
  if (!P) return;
  const id = P.lista[P.i]._id, pp = P.paraPai;
  fecharPainel(); pp({ controlGestta: 'abrirTarefa', id });
}
// No Meu dia a navegação ‹ › do painel embutido passa a seleção da lista (fn(±1))
export function aoPassarPainel(fn) { if (P) P.aoPassar = fn; }

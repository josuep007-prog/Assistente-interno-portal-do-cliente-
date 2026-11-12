/* Control Onvio · Tarefas do Gestta (0.73.0): a empresa como uma trilha de etapas, a linha do tempo do mês e o painel
 * lateral com o detalhe da tarefa. Usado nas abas "Minhas tarefas" (visão por empresa) e "Fechamento do mês".
 * Cada tarefa do mês é uma etapa: na trilha, na ordem da meta, com o traço cheio até onde está concluído; na linha do
 * tempo, no dia da meta, com a linha do hoje. O detalhe é lido na hora (cmd gesttaTarefa) e nunca guardado. */
import { $, $$, esc, num, toast } from './util.js';
import { concluirComEtapas, etapasAbertas, itensSemAnexo } from './gestta-concluir.js';
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
  return h + '</div>' + (fora ? '<span class="gt-tl-fora fraco">' + num(fora.length) + ' com meta em outro mês</span>' : '');
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
  const tags = fechada ? '<span class="pill pill-ok">✓ competência fechada</span>' : [multa ? '<span class="pill pill-late">' + num(multa) + ' com multa</span>' : '', atras - multa ? '<span class="pill pill-late">' + num(atras - multa) + (atras - multa === 1 ? ' atrasada' : ' atrasadas') + '</span>' : '', imp ? '<span class="pill pill-today">' + num(imp) + ' impedimento</span>' : ''].join('');
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
let P = null;          // { lista, i, dados, erro, carregando, paraPai, alvo, aba, conf, agindo, aviso, rasc }
const HIST = new Map();  // histórico já lido nesta visita, por id (some ao fechar a tela)
export const painelAberto = () => !!(P && !P.alvo);
export const painelTarefa = () => P && P.lista[P.i];
export function abrirPainel(lista, i, paraPai, o) {
  const alvo = o && o.alvo;
  const aba = P && P.aba === 'tempo' ? 'tempo' : 'resumo';
  if (P && !P.alvo && alvo) fecharPainel();
  // 0.93.0: reaberto na mesma tarefa (a lista foi relida depois de uma ação): fica o que já foi lido, o aviso, o rascunho e a confirmação
  const ant = P && P.lista[P.i], mesma = !!(ant && lista[i] && ant._id === lista[i]._id);
  P = { lista, i, paraPai, dados: mesma ? P.dados : null, erro: null, carregando: !(mesma && P.dados), alvo, aba, conf: mesma ? P.conf : null, agindo: mesma ? P.agindo : false, aviso: mesma ? P.aviso : null, rasc: mesma ? P.rasc : { com: '' } };
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
export function passarPainel(d) { if (!P) return; const j = P.i + d; if (j < 0 || j >= P.lista.length) return; P.i = j; P.dados = null; P.erro = null; P.carregando = true; P.conf = null; P.aviso = null; P.rasc = { com: '' }; desenharPainel(); carregar(); if (P.aba === 'tempo') carregarHist(); }
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
/* ---------- ações na tarefa (0.93.0, aprovadas pelo Josué em 11/11/2026) ----------
 * Cada uma passa por uma confirmação no próprio painel (P.conf) antes de ir ao Gestta (cmd gesttaAcao). Depois, o detalhe é
 * relido e a lista da tela também (evento gt-tarefa-mudou). Texto e arquivo ficam só na memória desta tela até o envio. */
const ARQ_MAX = (G && G.ARQ_MAX) || 15 * 1024 * 1024;
const tamanho = n => n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const lerBase64 = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).replace(/^data:[^,]*,/, '')); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
function pedirConfirmacao(conf) { if (!P || P.agindo) return; P.conf = conf; P.aviso = null; desenharPainel(); setTimeout(() => { const el = P && (P.alvo || $('#gt-painel')); const f = el && ($('#gp-conf-campo', el) || $('#gp-conf-ok', el)); if (f) f.focus(); }, 20); }
async function confirmar() {
  if (!P || !P.conf || P.agindo) return;
  const c = P.conf, t = P.lista[P.i];
  const campo = c.campo ? String(($('#gp-conf-campo', P.alvo || $('#gt-painel')) || {}).value || '').trim() : '';
  if (c.campo && !campo) { P.conf.falta = true; desenharPainel(); return; }
  P.agindo = true; desenharPainel();
  if (c.arquivos && c.arquivos.length) return enviarVarios(c, t);
  let msg = Object.assign({ cmd: 'gesttaAcao', id: t._id }, c.msg);
  if (c.campo) msg[c.campo] = campo;
  try { if (c.arquivo) msg.arquivo = { nome: c.arquivo.name, tipo: c.arquivo.type || '', base64: await lerBase64(c.arquivo) }; }
  catch (e) { msg = null; }
  // 0.103.0: concluir marca antes as etapas que faltam (concluirComEtapas), com o detalhe já lido
  const r = !msg ? { ok: false, erro: 'Não consegui ler o arquivo escolhido.' } : c.msg.acao === 'concluir' ? await concluirComEtapas(enviar, t._id, P.dados) : await enviar(msg);
  if (!P || !P.lista[P.i] || P.lista[P.i]._id !== t._id) { if (!(r && r.ok)) toast((r && r.erro) || 'O Gestta não respondeu.', true); else { toast(c.feito); try { window.dispatchEvent(new CustomEvent('gt-tarefa-mudou', { detail: { id: t._id } })); } catch (e) {} } return; }
  P.agindo = false; P.conf = null;
  if (r && r.ok) {
    P.aviso = { ok: true, texto: c.feito };
    if (c.msg.acao === 'comentar') P.rasc.com = '';
    const x = r.tarefa;
    if (x && x.status) { t.status = x.status; P.lista[P.i].status = x.status; if (P.dados) P.dados.status = x.status; }
    HIST.delete(t._id);
    try { window.dispatchEvent(new CustomEvent('gt-tarefa-mudou', { detail: { id: t._id } })); } catch (e) {}
    desenharPainel(); recarregarQuieto();
    if (P.aba === 'tempo') carregarHist(true);
  } else { P.aviso = { ok: false, texto: (r && r.erro) || 'O Gestta não respondeu.' }; desenharPainel(); }
}
// 0.101.0 (Josué, 12/11/2026: "também dê só de arrastar o arquivo, podendo arrastar mais de uma vez"; "se o analista arrastar o
// documento direto no item de uma tarefa, não precisa passar pelo leitor do Express"): vários arquivos no mesmo item da tarefa,
// um por vez, pelo mesmo envio do "Enviar arquivo" (gesttaAcao documento), depois de uma confirmação só. Para no "sessão acabou".
async function enviarVarios(c, t) {
  let ok = 0; const falhas = [];
  for (const f of c.arquivos) {
    let r;
    try { r = await enviar(Object.assign({ cmd: 'gesttaAcao', id: t._id }, c.msg, { arquivo: { nome: f.name, tipo: f.type || '', base64: await lerBase64(f) } })); }
    catch (e) { r = { ok: false, erro: 'Não consegui ler o arquivo.' }; }
    if (r && r.ok) { ok++; if (r.tarefa && r.tarefa.status) t.status = r.tarefa.status; }
    else { falhas.push('“' + f.name + '”: ' + ((r && r.erro) || 'o Gestta não respondeu')); if (r && (r.status === 401 || /sess[aã]o/i.test(r.erro || ''))) break; }
  }
  const texto = (ok ? (ok === 1 ? '1 arquivo enviado' : ok + ' arquivos enviados') + ' no documento “' + c.docNome + '”.' : 'Nenhum arquivo foi enviado.') + (falhas.length ? ' Não foram: ' + falhas.join(' · ') : '');
  if (!P || !P.lista[P.i] || P.lista[P.i]._id !== t._id) { toast(texto, !!falhas.length); if (ok) try { window.dispatchEvent(new CustomEvent('gt-tarefa-mudou', { detail: { id: t._id } })); } catch (e) {} return; }
  P.agindo = false; P.conf = null; P.aviso = { ok: !falhas.length, texto };
  if (ok) { HIST.delete(t._id); try { window.dispatchEvent(new CustomEvent('gt-tarefa-mudou', { detail: { id: t._id } })); } catch (e) {} }
  desenharPainel(); if (ok) { recarregarQuieto(); if (P.aba === 'tempo') carregarHist(true); }
}
// Confirmação de um ou vários arquivos para um documento (item) da tarefa: escolhidos no botão ou arrastados em cima do item
function confirmarArquivos(doc, lista) {
  const fs = Array.from(lista || []).filter(f => f && f.size != null);
  if (!fs.length || !doc) return;
  const grandes = fs.filter(f => f.size > ARQ_MAX), vao = fs.filter(f => f.size <= ARQ_MAX);
  if (!vao.length) { P.aviso = { ok: false, texto: grandes.map(f => '“' + f.name + '” tem ' + tamanho(f.size)).join(' · ') + ': o limite é 15 MB por arquivo.' }; desenharPainel(); return; }
  const nome = doc.name || 'Documento';
  const extra = (vao.length > 1 ? vao.map(f => f.name + ' (' + tamanho(f.size) + ')') : [])
    .concat(grandes.length ? ['Ficam de fora (acima de 15 MB): ' + grandes.map(f => f.name).join(', ')] : [])
    .concat(doc.has_documents_integration ? ['O arquivo vai ao Portal do Cliente.'] : [])
    .concat(['Se este for o último documento que falta, o Gestta pode concluir a tarefa sozinho.'])
    .concat(doc.temArquivo ? ['O documento já tem arquivo: ' + (vao.length > 1 ? 'estes serão mais.' : 'este será mais um.')] : []);
  if (vao.length === 1) return pedirConfirmacao({ msg: { acao: 'documento', documento: doc._id }, arquivo: vao[0], texto: 'Enviar “' + vao[0].name + '” (' + tamanho(vao[0].size) + ') no documento “' + nome + '”?', extra, botao: 'Enviar arquivo', feito: 'Arquivo enviado no Gestta.' });
  pedirConfirmacao({ msg: { acao: 'documento', documento: doc._id }, arquivos: vao, docNome: nome, texto: 'Enviar ' + vao.length + ' arquivos no documento “' + nome + '”? Vão um por vez.', extra, botao: 'Enviar ' + vao.length + ' arquivos', feito: '' });
}
// Soltar fora de um item vai para o Express (gestta-soltar.js, 0.102.0)
const temArquivos = e => !!(e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files'));
// Relê o detalhe sem o esqueleto (depois de uma ação)
async function recarregarQuieto() {
  const meu = P, t = P && P.lista[P.i]; if (!t) return;
  const r = await enviar({ cmd: 'gesttaTarefa', id: t._id });
  if (P !== meu || P.lista[P.i] !== t || !(r && r.ok)) return;
  P.dados = r.tarefa; if (r.tarefa && r.tarefa.status) t.status = r.tarefa.status;
  desenharPainel();
}
function confHtml() {
  if (P.aviso) return '<div class="gp-aviso ' + (P.aviso.ok ? 'ok' : 'erro') + '" role="status"><svg class="ic ic-sm" aria-hidden="true"><use href="#i-' + (P.aviso.ok ? 'check' : 'alert') + '"/></svg><span>' + esc(P.aviso.texto) + '</span><button type="button" class="icon-btn" id="gp-aviso-x" aria-label="Fechar aviso"><svg class="ic ic-sm"><use href="#i-x"/></svg></button></div>';
  const c = P.conf; if (!c) return '';
  return '<div class="gp-conf' + (c.perigo ? ' perigo' : '') + '" role="alertdialog" aria-label="Confirmar ação no Gestta"><p class="gp-conf-tx">' + esc(c.texto) + '</p>' +
    (c.campo ? '<label class="gp-conf-lab" for="gp-conf-campo">' + esc(c.rotCampo) + '</label><textarea id="gp-conf-campo" rows="3" maxlength="4000"' + (c.falta ? ' aria-invalid="true"' : '') + '>' + esc(c.valor || '') + '</textarea>' + (c.falta ? '<small class="gp-conf-falta">Escreva o ' + esc(c.rotCampo.toLowerCase()) + ' antes de confirmar.</small>' : '') : '') +
    (c.extra ? '<ul class="gp-conf-extra">' + c.extra.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') +
    '<div class="gp-conf-bt"><button type="button" class="btn btn-primary" id="gp-conf-ok"' + (P.agindo ? ' disabled' : '') + '>' + (P.agindo ? 'Gravando no Gestta…' : esc(c.botao)) + '</button><button type="button" class="btn" id="gp-conf-nao"' + (P.agindo ? ' disabled' : '') + '>Cancelar</button></div></div>';
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
  // 0.87.0: o detalhe lido na hora vem em maiúsculas como o Gestta guarda; mostra no mesmo jeito legível da lista
  t.name = G.nomeLegivel(t.name || ''); t.customer.name = G.nomeLegivel(t.customer.name || '');
  const prox = P.lista[P.i + 1], cnpj = t.customer.cnpj || t.customer.document || '';
  const copiar = (v, rot) => v ? '<button type="button" class="gp-copiar" data-copiar="' + esc(v) + '" title="Copiar ' + esc(rot) + '"><svg class="ic" aria-hidden="true"><use href="#i-copy"/></svg>' + esc(rot === 'o código' ? v : G.cnpjFormatado(v)) + '</button>' : '';
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
    : (passos && passos.length ? '<section class="gp-sec"><h3>Etapas da tarefa <span class="gt-n">' + fPassos + '/' + nPassos + '</span></h3><div class="gp-prog" aria-hidden="true"><i style="width:' + Math.round(fPassos / nPassos * 100) + '%"></i></div><ul class="gp-passos">' + passos.map(p => {
        const conteudo = '<span class="gp-ck" aria-hidden="true">' + (p.done ? '✓' : '') + '</span><span>' + esc(p.name || 'Etapa') + (p.required ? ' <small class="fraco">obrigatória</small>' : '') + '</span><span class="sr-only">' + (p.done ? 'feita' : 'a fazer') + '</span>';
        // 0.93.0: com o id da etapa, clicar marca ou desmarca (com confirmação)
        return '<li class="' + (p.done ? 'ok' : '') + '">' + (p._id ? '<button type="button" class="gp-passo" data-gp-etapa="' + esc(p._id) + '" aria-pressed="' + !!p.done + '" title="' + (p.done ? 'Desmarcar esta etapa' : 'Marcar esta etapa como feita') + '">' + conteudo + '</button>' : conteudo) + '</li>';
      }).join('') + '</ul></section>' : '<p class="fraco">Esta tarefa não tem etapas internas.</p>') +
      (docs.length ? '<section class="gp-sec"><h3>Documentos da tarefa</h3>' + (docs.some(x => x._id) ? '<p class="gp-dica-arrastar ajuda">Arraste um ou mais arquivos em cima do documento para enviar nele.</p>' : '') + '<ul class="gp-docs">' + docs.map(x => '<li class="gp-doc"' + (x._id ? ' data-gp-drop="' + esc(x._id) + '" data-gp-drop-rot="Soltar em “' + esc(x.name || 'Documento') + '”"' : '') + '><span class="gp-doc-nome">' + esc(x.name || 'Documento') + (x.validation_required ? ' <small class="fraco">pede validação</small>' : '') + (x.temArquivo ? ' <small class="gp-doc-ok">✓ com arquivo</small>' : '') + (x.has_documents_integration ? ' <small class="fraco">vai ao Portal do Cliente</small>' : '') + '</span>' +
        (x._id ? '<button type="button" class="btn btn-sm" data-gp-doc="' + esc(x._id) + '"><svg class="ic ic-sm" aria-hidden="true"><use href="#i-upload"/></svg>' + (x.temArquivo ? 'Enviar outro arquivo' : 'Enviar arquivo') + '</button>' : '') + '</li>').join('') + '</ul><input type="file" id="gp-arq" multiple hidden></section>' : '') +
      (pedidos.length ? '<section class="gp-sec"><h3>Pedidos ao cliente' + (d.document_request && d.document_request.active ? ' <span class="pill pill-today">cobrança ativa</span>' : '') + '</h3><ul class="gp-docs">' + pedidos.map(x => '<li>' + esc(x.name || 'Documento') + '</li>').join('') + '</ul></section>' : '') +
      // 0.93.0: comentário interno (fica só para a equipe; nunca vai ao cliente)
      '<section class="gp-sec gp-com"><h3><label for="gp-com">Comentário interno</label></h3><textarea id="gp-com" rows="2" maxlength="4000" placeholder="Escreva um comentário para a equipe (o cliente não vê)">' + esc(P.rasc.com) + '</textarea><div class="gp-com-pe"><button type="button" class="btn btn-sm" id="gp-comentar"' + (P.rasc.com.trim() ? '' : ' disabled') + '>Comentar</button></div></section>';
  // 0.93.0: o que dá para fazer com a tarefa, pela situação dela no Gestta
  const st = String(d.status || base.status || '').toUpperCase();
  const desc = st === 'IGNORED' || st === 'DISCONSIDERED';          // 0.103.0: desconsiderada não tem ação pela extensão
  const acoesTarefa = P.carregando || P.erro || desc ? '' : '<div class="gp-acoes" role="group" aria-label="Ações na tarefa">' +
    (st === 'DONE' ? '<button type="button" class="btn btn-sm" data-gp-acao="reabrir"><svg class="ic ic-sm" aria-hidden="true"><use href="#i-undo"/></svg>Reabrir tarefa</button>'
      : st === 'IMPEDIMENT' ? '<button type="button" class="btn btn-sm btn-primary" data-gp-acao="liberar"><svg class="ic ic-sm" aria-hidden="true"><use href="#i-check"/></svg>Retirar impedimento</button>'
      : '<button type="button" class="btn btn-sm btn-primary" data-gp-acao="concluir"><svg class="ic ic-sm" aria-hidden="true"><use href="#i-check"/></svg>Concluir tarefa</button><button type="button" class="btn btn-sm" data-gp-acao="impedir"><svg class="ic ic-sm" aria-hidden="true"><use href="#i-alert"/></svg>Registrar impedimento</button>') + '</div>';
  const abaBtn = (k, rot) => '<button type="button" role="tab" class="gp-aba' + (P.aba === k ? ' on' : '') + '" data-gp-aba="' + k + '" aria-selected="' + (P.aba === k) + '">' + rot + '</button>';
  el.classList.toggle('gp-embutido', !!P.alvo);
  el.innerHTML = '<header class="gp-cab"><div class="gp-nav"><button type="button" class="icon-btn" id="gp-ant" aria-label="Tarefa anterior"' + (P.i ? '' : ' disabled') + '><svg class="ic"><use href="#i-chev-l"/></svg></button><span class="fraco">' + (P.i + 1) + ' de ' + P.lista.length + '</span><button type="button" class="icon-btn" id="gp-prox" aria-label="Próxima tarefa"' + (P.i < P.lista.length - 1 ? '' : ' disabled') + '><svg class="ic"><use href="#i-chev-r"/></svg></button>' +
      (prox ? '<span class="gp-prox-nome" title="' + esc('Próxima: ' + G.nomeLegivel(prox.name || 'Tarefa')) + '">Próxima: ' + esc(G.nomeLegivel(prox.name || 'Tarefa')) + '</span>' : '') + '</div>' +
      (P.alvo ? '' : '<button type="button" class="icon-btn" id="gp-fechar" aria-label="Fechar (Esc)"><svg class="ic"><use href="#i-x"/></svg></button>') + '</header>' +
    '<div class="gp-corpo"><div class="gp-topo"><span class="pill ' + (desc ? '' : pill) + '">' + esc(desc ? 'Desconsiderada' : G.ESTADOS[est]) + '</span>' + (nPassos ? '<span class="gp-etapas-mini" title="Etapas da tarefa">' + fPassos + '/' + nPassos + ' etapas</span>' : '') + '</div>' +
      '<h2 class="gp-tit">' + esc(t.name || 'Tarefa') + '</h2><p class="gp-cli">' + esc(t.customer.name || '') + (t.customer.code || cnpj ? ' <span class="gp-copias">' + copiar(t.customer.code, 'o código') + copiar(cnpj, 'o CNPJ') + '</span>' : '') + '</p>' +
      acoesTarefa + confHtml() +
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
  $$('[data-copiar]', el).forEach(b => b.onclick = () => { const v = b.dataset.copiar, ok = () => { b.classList.add('ok'); b.lastChild.textContent = 'Copiado'; setTimeout(() => desenharPainel(), 1400); }; try { navigator.clipboard.writeText(v).then(ok, ok); } catch (_) { ok(); } });
  const tt = $('#gp-tentar', el); if (tt) tt.onclick = () => { P.erro = null; P.carregando = true; desenharPainel(); carregar(); };
  const th = $('#gp-hist-tentar', el); if (th) th.onclick = () => carregarHist(true);
  ligarAcoes(el, t, passos || [], docs);
}
function ligarAcoes(el, t, passos, docs) {
  const nomeT = '“' + (t.name || 'Tarefa') + '”';
  $$('[data-gp-acao]', el).forEach(b => b.onclick = () => {
    const a = b.dataset.gpAcao;
    if (a === 'concluir') {
      const abertas = etapasAbertas(P.dados), semAnexo = itensSemAnexo(P.dados);
      pedirConfirmacao({ msg: { acao: 'concluir' }, texto: 'Concluir a tarefa ' + nomeT + ' no Gestta?', botao: abertas.length ? 'Marcar as etapas e concluir' : 'Concluir tarefa',
        feito: abertas.length ? 'Etapas marcadas e tarefa concluída no Gestta.' : 'Tarefa concluída no Gestta.',
        extra: (abertas.length ? ['Antes, marca ' + (abertas.length === 1 ? 'a etapa' : 'as ' + abertas.length + ' etapas') + ' que falta' + (abertas.length === 1 ? '' : 'm') + ': ' + abertas.map(p => p.name || 'Etapa').join(', ') + '.'] : [])
          .concat(semAnexo.length ? [(semAnexo.length === 1 ? '1 item sem anexo fica' : semAnexo.length + ' itens sem anexo ficam') + ' como está' + (semAnexo.length === 1 ? '' : 'ão') + ': desconsiderar o item pela extensão chega depois do mapeamento.'] : []) });
    }
    else if (a === 'reabrir') pedirConfirmacao({ msg: { acao: 'reabrir' }, texto: 'Reabrir a tarefa ' + nomeT + '? Ela volta a ficar aberta no Gestta.', botao: 'Reabrir tarefa', feito: 'Tarefa reaberta no Gestta.', perigo: true });
    else if (a === 'impedir') pedirConfirmacao({ msg: { acao: 'impedir' }, campo: 'motivo', rotCampo: 'Motivo do impedimento', texto: 'Registrar um impedimento na tarefa ' + nomeT + '?', botao: 'Registrar impedimento', feito: 'Impedimento registrado no Gestta.' });
    else if (a === 'liberar') pedirConfirmacao({ msg: { acao: 'liberar' }, texto: 'Retirar o impedimento da tarefa ' + nomeT + '? Ela volta a ficar aberta.', botao: 'Retirar impedimento', feito: 'Impedimento retirado: a tarefa voltou a ficar aberta.' });
  });
  $$('[data-gp-etapa]', el).forEach(b => b.onclick = () => {
    const p = passos.find(x => x._id === b.dataset.gpEtapa); if (!p) return;
    const nome = '“' + (p.name || 'Etapa') + '”';
    pedirConfirmacao(p.done ? { msg: { acao: 'etapa', etapa: p._id, feita: false }, texto: 'Desmarcar a etapa ' + nome + '?', botao: 'Desmarcar', feito: 'Etapa desmarcada no Gestta.' }
      : { msg: { acao: 'etapa', etapa: p._id, feita: true }, texto: 'Marcar a etapa ' + nome + ' como feita?', botao: 'Marcar como feita', feito: 'Etapa marcada como feita no Gestta.' });
  });
  const com = $('#gp-com', el), bc = $('#gp-comentar', el);
  if (com) com.oninput = () => { P.rasc.com = com.value; if (bc) bc.disabled = !com.value.trim(); };
  if (bc) bc.onclick = () => { const tx = P.rasc.com.trim(); if (!tx) return;
    pedirConfirmacao({ msg: { acao: 'comentar', texto: tx }, texto: 'Gravar este comentário na tarefa ' + nomeT + '?', extra: ['“' + (tx.length > 160 ? tx.slice(0, 160) + '…' : tx) + '”', 'Fica só para a equipe: o cliente não vê.'], botao: 'Gravar comentário', feito: 'Comentário gravado no Gestta.' }); };
  const arq = $('#gp-arq', el);
  $$('[data-gp-doc]', el).forEach(b => b.onclick = () => { if (!arq) return; arq.dataset.doc = b.dataset.gpDoc; arq.value = ''; arq.click(); });
  if (arq) arq.onchange = () => { const doc = docs.find(x => x._id === arq.dataset.doc); if (arq.files && arq.files.length) confirmarArquivos(doc, arq.files); };
  // 0.101.0: arrastar e soltar em cima do documento (um ou vários arquivos, quantas vezes quiser)
  $$('[data-gp-drop]', el).forEach(li => {
    let n = 0;
    li.addEventListener('dragenter', e => { if (!temArquivos(e) || P.agindo || P.conf) return; e.preventDefault(); n++; li.classList.add('gp-drop-on'); });
    li.addEventListener('dragover', e => { if (!temArquivos(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = P.agindo || P.conf ? 'none' : 'copy'; });
    li.addEventListener('dragleave', () => { n = Math.max(0, n - 1); if (!n) li.classList.remove('gp-drop-on'); });
    li.addEventListener('drop', e => {
      if (!temArquivos(e)) return; e.preventDefault(); n = 0; li.classList.remove('gp-drop-on');
      if (P.agindo || P.conf) { P.aviso = { ok: false, texto: 'Termine (ou cancele) a confirmação aberta antes de soltar outro arquivo.' }; desenharPainel(); return; }
      confirmarArquivos(docs.find(x => x._id === li.dataset.gpDrop), e.dataTransfer.files);
    });
  });
  const ok = $('#gp-conf-ok', el), nao = $('#gp-conf-nao', el), ax = $('#gp-aviso-x', el), cf = $('.gp-conf', el);
  if (ok) ok.onclick = confirmar;
  if (nao) nao.onclick = () => { P.conf = null; desenharPainel(); };
  if (ax) ax.onclick = () => { P.aviso = null; desenharPainel(); };
  const campo = $('#gp-conf-campo', el); if (campo && P.conf) campo.oninput = () => { P.conf.valor = campo.value; if (P.conf.falta && campo.value.trim()) { P.conf.falta = false; } };
  // Esc fecha só a confirmação (sem fechar o painel e perder o que foi escrito)
  if (cf) cf.onkeydown = e => { if (e.key === 'Escape' && !P.agindo) { e.preventDefault(); e.stopPropagation(); P.conf = null; desenharPainel(); } };
}
// Abrir no Gestta: a camada fecha e o próprio Gestta vai para a tarefa
export function abrirNoGestta() {
  if (!P) return;
  const id = P.lista[P.i]._id, pp = P.paraPai;
  fecharPainel(); pp({ controlGestta: 'abrirTarefa', id });
}
// No Meu dia a navegação ‹ › do painel embutido passa a seleção da lista (fn(±1))
export function aoPassarPainel(fn) { if (P) P.aoPassar = fn; }

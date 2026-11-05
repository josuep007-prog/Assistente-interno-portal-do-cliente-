/* Control Onvio · Tarefas do Gestta (0.72.0)
 * Tela por cima do Gestta (iframe da extensão, aberto pelo shell-gestta.js). Mostra as tarefas do mês de quem está logado
 * (a coordenação escolhe outra pessoa ou as sem responsável) de três jeitos: por prazo (multa, atraso, impedimento, hoje,
 * próximos 5 dias úteis, mais adiante, concluídas), por empresa (o mês de cada cliente numa linha, com o que pesa primeiro)
 * e em calendário. Filtros instantâneos: busca, situação, tipo e dia. As tarefas são lidas na hora (cmd gesttaTarefas) e
 * ficam só na memória desta tela: nada vai ao armazenamento. Abrir uma tarefa só navega no próprio Gestta.
 */
import { $, $$, esc, toast, simples, lerPref, gravarPref, num, plural } from './util.js';
const G = window.OCG;
const enviar = msg => new Promise(res => { try { chrome.runtime.sendMessage(msg, r => res(r || { ok: false, erro: (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'sem resposta' })); } catch (e) { res({ ok: false, erro: String(e.message || e) }); } });
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const ATUALIZA_MIN = 10;               // com a camada aberta e visível, relê sozinho a cada 10 minutos

const hoje0 = new Date();
const E = {
  ano: hoje0.getFullYear(), mes: hoje0.getMonth() + 1, quem: 'eu',
  dados: null, carregando: false, erro: null, lidoEm: null, equipe: null,
  modo: lerPref('gt.modo', 'prazo'), feitas: lerPref('gt.feitas', '0') === '1',
  q: '', grupos: new Set(), tipos: new Set(), dia: '', abertas: new Set(), visivel: true
};
const lista = () => (E.dados && E.dados.itens) || [];
const nomeMes = () => MESES[E.mes - 1].replace(/^./, c => c.toUpperCase()) + ' de ' + E.ano;
const ehMesAtual = () => E.ano === new Date().getFullYear() && E.mes === new Date().getMonth() + 1;
const filtroAtivo = () => !!(E.q || E.grupos.size || E.tipos.size || E.dia);
const paraPai = m => { try { window.parent.postMessage(Object.assign({}, m), 'https://app.gestta.com.br'); } catch (e) {} };

/* ---------- leitura ---------- */
let pedido = 0;
async function ler(silencioso) {
  const meu = ++pedido;
  E.carregando = true; if (!silencioso) E.erro = null;
  aoVivo(); if (!E.dados || !silencioso) desenhar();
  const r = await enviar({ cmd: 'gesttaTarefas', ano: E.ano, mes: E.mes, quem: E.quem });
  if (meu !== pedido) return;                       // trocou de mês ou de pessoa no meio: vale a leitura mais nova
  E.carregando = false;
  if (r && r.ok) {
    E.dados = r; E.erro = null; E.lidoEm = r.lidoEm || new Date().toISOString();
    if (r.perfil && r.perfil.total && !E.equipe) carregarEquipe();
    if (ehMesAtual() && E.quem === 'eu') { const c = G.contarGrupos(r.itens, new Date()).n; paraPai({ controlGestta: 'contagem', atencao: c.multa + c.atrasada + c.hoje }); }
  } else { E.erro = r || { erro: 'sem resposta' }; if (!silencioso) E.dados = null; }
  aoVivo(); desenhar();
}
async function carregarEquipe() {
  const r = await enviar({ cmd: 'gesttaEquipe' });
  if (!r || !r.ok) return;
  E.equipe = r.pessoas || [];
  const s = $('#gt-quem');
  s.innerHTML = '<option value="eu">Minhas</option><option value="sem">Sem responsável</option><optgroup label="Equipe">' +
    E.equipe.filter(p => !E.dados || p.id !== E.dados.perfil.id).map(p => '<option value="' + esc(p.id) + '">' + esc(p.nome) + '</option>').join('') + '</optgroup>';
  s.value = E.quem;
  $('#gt-quem-wrap').hidden = false;
}

/* ---------- cabeçalho, trilho e "ao vivo" ---------- */
function aoVivo() {
  const el = $('#aovivo'), tx = $('#aovivo-tx');
  el.classList.remove('ok', 'parado', 'erro');
  $('#btn-atualizar').classList.toggle('girando', E.carregando);
  if (E.carregando) { tx.textContent = 'Lendo o Gestta…'; return; }
  if (E.erro) { el.classList.add('erro'); tx.textContent = E.erro.semSessao ? 'Sem sessão no Gestta' : 'Falha na leitura'; return; }
  if (!E.lidoEm) { tx.textContent = 'Aguardando'; return; }
  const h = new Date(E.lidoEm), hm = String(h.getHours()).padStart(2, '0') + ':' + String(h.getMinutes()).padStart(2, '0');
  el.classList.add(Date.now() - h > (ATUALIZA_MIN + 2) * 60e3 ? 'parado' : 'ok');
  tx.textContent = simples() ? hm : 'Lido às ' + hm; el.title = 'Lido às ' + hm;
}
function cabecalho(c) {
  $('#gt-mes-rot').textContent = nomeMes();
  const quem = E.quem === 'eu' ? 'Minhas' : E.quem === 'sem' ? 'Sem responsável' : ((E.equipe || []).find(p => p.id === E.quem) || {}).nome || 'Outra pessoa';
  const sub = c ? quem + ' · ' + plural(c.total, 'tarefa', 'tarefas') + ' no mês' : quem;
  $('#subtitulo').textContent = sub;
  const t = $('#titulo'); if (simples()) t.title = sub; else t.removeAttribute('title');
  const pf = E.dados && E.dados.perfil;
  $('#quem').textContent = pf ? pf.papelNome : '';
  $('#trilho-pe').title = pf ? 'No Gestta como ' + pf.papelNome + (pf.setores.length ? ' · ' + pf.setores.map(s => s.nome).join(', ') : '') : '';
  const n = c && E.quem === 'eu' && ehMesAtual() ? c.n.multa + c.n.atrasada + c.n.hoje : 0;
  $('#n-atencao').textContent = n || '';
  $('#res-atencao').textContent = c ? [c.n.multa ? c.n.multa + ' com multa' : '', c.n.atrasada ? c.n.atrasada + ' atrasadas' : '', c.n.hoje ? c.n.hoje + ' vencem hoje' : ''].filter(Boolean).join(' · ') : '';
}

/* ---------- peças ---------- */
const COR = { multa: 'multa', atrasada: 'atraso', impedimento: 'imped', hoje: 'hoje', proximas: 'prox', depois: 'depois', feita: 'feita' };
const PILL = { multa: 'pill-late', atrasada: 'pill-late', impedimento: 'pill-today', hoje: 'pill-today', feita: 'pill-ok' };
function anel(pct, tam) {
  const r = (tam - 10) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, pct));
  return '<svg class="gt-anel" width="' + tam + '" height="' + tam + '" viewBox="0 0 ' + tam + ' ' + tam + '" aria-hidden="true"><circle cx="' + tam / 2 + '" cy="' + tam / 2 + '" r="' + r + '" class="gt-anel-fundo"/><circle cx="' + tam / 2 + '" cy="' + tam / 2 + '" r="' + r + '" class="gt-anel-valor" stroke-dasharray="' + (c * v / 100).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 ' + tam / 2 + ' ' + tam / 2 + ')"/></svg>';
}
function heroHtml(c) {
  const kpi = gr => '<button type="button" class="gt-kpi gt-c-' + COR[gr.k] + (E.grupos.has(gr.k) ? ' on' : '') + '" data-grupo="' + gr.k + '" aria-pressed="' + E.grupos.has(gr.k) + '" title="' + esc(gr.dica) + '"><b>' + num(c.n[gr.k]) + '</b><span>' + esc(gr.rot) + '</span></button>';
  return '<section class="gt-hero cfg-card">' +
    '<div class="gt-prog">' + anel(c.pctFeitas, simples() ? 76 : 96) + '<div class="gt-prog-tx"><b>' + c.pctFeitas + '%</b><span>' + num(c.feitas) + ' de ' + num(c.total) + ' concluídas</span><small>' + plural(c.abertas, 'aberta', 'abertas') + ' no mês</small></div></div>' +
    '<div class="gt-kpis" role="group" aria-label="Filtrar pela situação">' + G.GRUPOS.map(kpi).join('') + '</div></section>';
}
function barraHtml() {
  const tipo = k => '<button type="button" class="gt-chip' + (E.tipos.has(k) ? ' on' : '') + '" data-tipo="' + k + '" aria-pressed="' + E.tipos.has(k) + '">' + esc(G.TIPOS_TAREFA[k]) + '</button>';
  const modo = (k, ic, rot) => '<button type="button" class="' + (E.modo === k ? 'on' : '') + '" data-modo="' + k + '" aria-pressed="' + (E.modo === k) + '"><svg class="ic ic-sm"><use href="#' + ic + '"/></svg>' + rot + '</button>';
  return '<div class="gt-barra">' +
    '<label class="gt-busca"><svg class="ic"><use href="#i-search"/></svg><input type="search" id="gt-q" placeholder="Buscar tarefa, cliente ou código" autocomplete="off" aria-label="Buscar tarefa, cliente ou código" value="' + esc(E.q) + '"><kbd>/</kbd></label>' +
    '<div class="gt-chips" role="group" aria-label="Tipo">' + Object.keys(G.TIPOS_TAREFA).map(tipo).join('') + '</div>' +
    '<label class="gt-feitas"><input type="checkbox" id="gt-feitas"' + (E.feitas ? ' checked' : '') + '> Mostrar concluídas</label>' +
    (filtroAtivo() ? '<button type="button" class="btn btn-sm gt-limpar" id="gt-limpar"><svg class="ic ic-sm"><use href="#i-x"/></svg>Limpar filtros</button>' : '') +
    '<span class="gt-espaco"></span>' +
    '<div class="seg gt-modos" role="group" aria-label="Como ver">' + modo('prazo', 'i-list', 'Por prazo') + modo('empresa', 'i-building', 'Por empresa') + modo('calendario', 'i-calendar', 'Calendário') + '</div></div>';
}
const tipoCurto = { RECURRENT: 'Recorrente', SERVICE_ORDER: 'OS', ACCOUNTING: 'Contábil' };
function linhaTarefa(t, hoje, semCliente) {
  const k = G.grupoTarefa(t, hoje), c = t.customer || {};
  const etapas = Number(t.total_step) > 0 ? '<span class="gt-etapas" title="' + num(t.done_step || 0) + ' de ' + num(t.total_step) + ' etapas"><i style="--p:' + Math.round((t.done_step || 0) / t.total_step * 100) + '%"></i>' + num(t.done_step || 0) + '/' + num(t.total_step) + '</span>' : '';
  const marca = k === 'multa' ? '<span class="pill pill-late">Multa</span>' : k === 'impedimento' ? '<span class="pill pill-today">Impedimento</span>' : '';
  return '<li class="gt-t gt-c-' + COR[k] + '" data-id="' + esc(t._id) + '">' +
    '<div class="gt-t-main"><b class="gt-t-nome">' + esc(t.name || 'Tarefa sem nome') + '</b>' +
      (semCliente ? '' : '<span class="gt-t-cli">' + (c.code ? '<span class="gt-cod">' + esc(c.code) + '</span>' : '') + esc(c.name || 'Sem cliente') + '</span>') + '</div>' +
    '<div class="gt-t-meta"><span class="gt-prazo' + (PILL[k] ? ' ' + PILL[k] + ' pill' : '') + '">' + esc(G.prazoTexto(t, hoje)) + '</span>' + marca +
      '<span class="gt-tipo">' + esc(tipoCurto[t.type] || t.type || '') + '</span>' + etapas + '</div>' +
    '<div class="gt-t-acoes"><button type="button" class="btn btn-sm" data-abrir="' + esc(t._id) + '" title="Abrir esta tarefa no Gestta (a camada fecha)"><svg class="ic ic-sm"><use href="#i-ext"/></svg>Abrir</button>' +
      '<button type="button" class="icon-btn" data-nova="' + esc(t._id) + '" title="Abrir em outra aba" aria-label="Abrir em outra aba"><svg class="ic ic-sm"><use href="#i-link"/></svg></button></div></li>';
}
function vistaPrazo(itens, hoje) {
  const grupos = G.GRUPOS.map(gr => ({ gr, l: itens.filter(t => G.grupoTarefa(t, hoje) === gr.k) })).filter(x => x.l.length);
  if (!grupos.length) return vazio();
  return grupos.map(({ gr, l }) => '<section class="gt-grupo gt-c-' + COR[gr.k] + '"><h2 class="gt-grupo-cab"><i class="gt-ponto"></i>' + esc(gr.rot) + '<span class="gt-n">' + num(l.length) + '</span><small class="ajuda">' + esc(gr.dica) + '</small></h2><ul class="gt-lista">' + l.map(t => linhaTarefa(t, hoje)).join('') + '</ul></section>').join('');
}
function vistaEmpresa(itens, hoje) {
  const emps = G.porEmpresa(itens, hoje);
  if (!emps.length) return vazio();
  return '<p class="fraco ajuda gt-ajuda">Cada empresa numa linha, com o que pesa primeiro. Clique para ver as tarefas dela.</p><div class="gt-emps">' + emps.map(e => {
    const aberta = E.abertas.has(e.id), w = v => e.n ? (v / e.n * 100).toFixed(1) + '%' : '0';
    const atras = e.multa + e.atrasada;
    const tags = [e.multa ? '<span class="pill pill-late">' + num(e.multa) + ' com multa</span>' : '', e.atrasada ? '<span class="pill pill-late">' + num(e.atrasada) + (e.atrasada === 1 ? ' atrasada' : ' atrasadas') + '</span>' : '', e.impedimento ? '<span class="pill pill-today">' + num(e.impedimento) + ' impedimento</span>' : '', e.hoje ? '<span class="pill pill-today">' + num(e.hoje) + ' hoje</span>' : ''].join('');
    return '<article class="gt-emp' + (aberta ? ' aberta' : '') + (atras ? ' tem-atraso' : '') + '">' +
      '<button type="button" class="gt-emp-cab" data-emp="' + esc(e.id) + '" aria-expanded="' + aberta + '">' +
        '<span class="gt-emp-nome"><b>' + esc(e.nome) + '</b>' + (e.codigo ? '<small>código ' + esc(e.codigo) + '</small>' : '') + '</span>' +
        '<span class="gt-emp-barra" title="' + num(e.feitas) + ' concluídas · ' + num(e.abertas) + ' abertas"><i class="b-feita" style="width:' + w(e.feitas) + '"></i><i class="b-atraso" style="width:' + w(atras) + '"></i><i class="b-aberta" style="width:' + w(e.abertas - atras) + '"></i></span>' +
        '<span class="gt-emp-num"><b>' + num(e.abertas) + '</b> ' + (e.abertas === 1 ? 'aberta' : 'abertas') + ' · ' + e.pctFeitas + '% feito</span>' +
        '<span class="gt-emp-tags">' + tags + (e.proxima && e.abertas ? '<span class="gt-prox">próxima meta ' + esc(e.proxima.slice(8, 10) + '/' + e.proxima.slice(5, 7)) + '</span>' : '') + '</span>' +
        '<svg class="ic gt-chev"><use href="#i-chev-d"/></svg></button>' +
      (aberta ? '<ul class="gt-lista gt-emp-lista">' + e.tarefas.slice().sort((a, b) => G.GRUPOS.findIndex(x => x.k === G.grupoTarefa(a, hoje)) - G.GRUPOS.findIndex(x => x.k === G.grupoTarefa(b, hoje)) || String(a.due_date).localeCompare(String(b.due_date))).map(t => linhaTarefa(t, hoje, true)).join('') + '</ul>' : '') +
      '</article>';
  }).join('') + '</div>';
}
function vistaCalendario(itens, hoje, todosDoMes) {
  const dias = G.porDia(todosDoMes, hoje), max = Math.max(1, ...Object.values(dias).map(d => d.abertas));
  const ini = new Date(E.ano, E.mes - 1, 1), nDias = new Date(E.ano, E.mes, 0).getDate(), pulo = (ini.getDay() + 6) % 7, hojeK = G.ymd(G.diaLocal(hoje));
  let cel = '';
  for (let i = 0; i < pulo; i++) cel += '<span class="gt-dia vazio" aria-hidden="true"></span>';
  for (let d = 1; d <= nDias; d++) {
    const k = E.ano + '-' + String(E.mes).padStart(2, '0') + '-' + String(d).padStart(2, '0'), x = dias[k], dt = new Date(E.ano, E.mes - 1, d), fds = dt.getDay() === 0 || dt.getDay() === 6;
    const nivel = x && x.abertas ? Math.ceil(x.abertas / max * 4) : 0;
    const desc = x ? [x.abertas ? x.abertas + (x.abertas === 1 ? ' aberta' : ' abertas') : '', x.atrasadas ? x.atrasadas + ' atrasadas' : '', x.feitas ? x.feitas + (x.feitas === 1 ? ' concluída' : ' concluídas') : ''].filter(Boolean).join(', ') : 'nenhuma tarefa';
    cel += '<button type="button" class="gt-dia n' + nivel + (fds ? ' fds' : '') + (k === hojeK ? ' hoje' : '') + (E.dia === k ? ' on' : '') + '" data-dia="' + k + '" aria-pressed="' + (E.dia === k) + '" aria-label="' + d + ' de ' + MESES[E.mes - 1] + ': ' + desc + '">' +
      '<span class="gt-dia-n">' + d + '</span>' + (x ? (x.abertas ? '<span class="gt-dia-tot">' + num(x.abertas) + '</span>' : '') + '<span class="gt-dia-mk">' + (x.atrasadas ? '<i class="mk-atraso" title="' + x.atrasadas + ' atrasadas">' + x.atrasadas + '</i>' : '') + (x.feitas ? '<i class="mk-feita" title="' + x.feitas + ' concluídas">' + x.feitas + '</i>' : '') + '</span>' : '') + '</button>';
  }
  const dSel = E.dia ? new Date(E.dia + 'T12:00:00') : null;
  return '<section class="gt-cal cfg-card"><div class="gt-cal-sem">' + SEMANA.map(s => '<span>' + s + '</span>').join('') + '</div><div class="gt-cal-grade">' + cel + '</div>' +
    '<p class="gt-cal-leg"><span><i class="lg-aberta"></i>número = abertas com meta no dia</span><span><i class="mk-atraso">3</i>atrasadas</span><span><i class="mk-feita">2</i>concluídas</span></p></section>' +
    (E.dia ? '<h2 class="gt-cal-dia">Meta em ' + dSel.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) + '<button type="button" class="btn btn-sm" id="gt-dia-sair">Ver o mês todo</button></h2>' + (itens.length ? '<ul class="gt-lista">' + itens.map(t => linhaTarefa(t, hoje)).join('') + '</ul>' : vazio()) : '<p class="fraco gt-cal-dica">Clique num dia para ver as tarefas com meta nele.</p>');
}
const vazio = () => '<div class="vazio"><b>' + (filtroAtivo() ? 'Nenhuma tarefa com esses filtros' : 'Nenhuma tarefa aberta no mês') + '</b>' + (filtroAtivo() ? 'Tire um filtro ou limpe todos.' : 'Tudo em dia por aqui.') + '</div>';

/* ---------- desenho ---------- */
function desenhar() {
  const v = $('#vista'), topo = v.scrollTop;
  if (!E.dados) {
    cabecalho(null);
    if (E.erro) {
      v.innerHTML = '<div class="faixa"><svg class="ic"><use href="#i-alert"/></svg><div style="flex:1;min-width:240px"><b>' + (E.erro.semSessao ? 'Sem sessão no Gestta.' : E.erro.semAba ? 'Nenhuma aba do Gestta.' : 'Não consegui ler as tarefas.') + '</b> ' + esc(E.erro.erro || '') + '</div><button class="btn btn-sm" id="gt-tentar">Tentar de novo</button></div>';
      $('#gt-tentar').onclick = () => ler();
    } else v.innerHTML = '<div class="gt-carregando"><span class="gt-giro" aria-hidden="true"></span><b>Lendo as tarefas no Gestta…</b><small>Só leitura, de dentro desta aba. Na primeira vez pode levar alguns segundos.</small></div>';
    return;
  }
  const hoje = new Date(), todos = lista(), c = G.contarGrupos(todos, hoje);
  cabecalho(c);
  const f = { q: E.q, grupos: [...E.grupos], tipos: [...E.tipos], feitas: E.feitas, dia: E.modo === 'calendario' ? E.dia : '' };
  const filtrados = G.filtrarTarefas(todos, f, hoje);
  const base = G.filtrarTarefas(todos, Object.assign({}, f, { dia: '', feitas: true }), hoje);
  const aviso = (E.erro ? '<div class="faixa"><svg class="ic"><use href="#i-alert"/></svg><div><b>A última atualização falhou.</b> ' + esc(E.erro.erro || '') + ' Mostrando a leitura anterior.</div></div>' : '') +
    (E.dados.cortado ? '<div class="faixa"><svg class="ic"><use href="#i-alert"/></svg><div><b>Lista cortada.</b> Passou de ' + num(G.MAX_PAGINAS_TAREFAS * G.LIMITE_BUSCA) + ' tarefas no mês: a tela mostra as primeiras. Escolha uma pessoa para ver tudo dela.</div></div>' : '') +
    (E.quem !== 'eu' ? '<p class="gt-outra">Vendo ' + (E.quem === 'sem' ? 'as tarefas <b>sem responsável</b>' : 'as tarefas de <b>' + esc($('#gt-quem').selectedOptions[0] ? $('#gt-quem').selectedOptions[0].textContent : 'outra pessoa') + '</b>') + '. <button type="button" class="linkish" id="gt-voltar-eu">Voltar às minhas</button></p>' : '');
  const conteudo = E.modo === 'empresa' ? vistaEmpresa(filtrados, hoje) : E.modo === 'calendario' ? vistaCalendario(filtrados, hoje, base) : vistaPrazo(filtrados, hoje);
  const contagem = E.modo !== 'calendario' || E.dia ? '<p class="gt-cont" aria-live="polite">' + (filtroAtivo() ? num(filtrados.length) + ' de ' + num(c.total) + ' tarefas' : plural(filtrados.length, 'tarefa', 'tarefas') + (E.feitas ? '' : ' abertas')) + '</p>' : '';
  const foco = document.activeElement && document.activeElement.id === 'gt-q' ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
  v.innerHTML = aviso + heroHtml(c) + barraHtml() + contagem + '<div class="gt-conteudo gt-modo-' + E.modo + '">' + conteudo + '</div>';
  v.scrollTop = topo;
  if (foco) { const q = $('#gt-q'); q.focus(); try { q.setSelectionRange(foco[0], foco[1]); } catch (e) {} }
  ligar(v);
}
function ligar(v) {
  $$('[data-grupo]', v).forEach(b => b.onclick = () => { const k = b.dataset.grupo; if (E.grupos.has(k)) E.grupos.delete(k); else E.grupos.add(k); if (k === 'feita' && E.grupos.has('feita')) E.feitas = true; desenhar(); });
  $$('[data-tipo]', v).forEach(b => b.onclick = () => { const k = b.dataset.tipo; if (E.tipos.has(k)) E.tipos.delete(k); else E.tipos.add(k); desenhar(); });
  $$('[data-modo]', v).forEach(b => b.onclick = () => { E.modo = b.dataset.modo; gravarPref('gt.modo', E.modo); desenhar(); });
  $$('[data-dia]', v).forEach(b => b.onclick = () => { E.dia = E.dia === b.dataset.dia ? '' : b.dataset.dia; desenhar(); });
  $$('[data-emp]', v).forEach(b => b.onclick = () => { const k = b.dataset.emp; if (E.abertas.has(k)) E.abertas.delete(k); else E.abertas.add(k); desenhar(); });
  $$('[data-abrir]', v).forEach(b => b.onclick = e => { e.stopPropagation(); paraPai({ controlGestta: 'abrirTarefa', id: b.dataset.abrir }); });
  $$('[data-nova]', v).forEach(b => b.onclick = e => { e.stopPropagation(); const u = G.urlTarefa(b.dataset.nova); if (u) window.open(u, '_blank', 'noopener'); });
  const q = $('#gt-q', v); if (q) q.oninput = () => { E.q = q.value; desenhar(); };
  const fe = $('#gt-feitas', v); if (fe) fe.onchange = () => { E.feitas = fe.checked; if (!fe.checked) E.grupos.delete('feita'); gravarPref('gt.feitas', E.feitas ? '1' : '0'); desenhar(); };
  const lp = $('#gt-limpar', v); if (lp) lp.onclick = () => { E.q = ''; E.grupos.clear(); E.tipos.clear(); E.dia = ''; desenhar(); };
  const ds = $('#gt-dia-sair', v); if (ds) ds.onclick = () => { E.dia = ''; desenhar(); };
  const ve = $('#gt-voltar-eu', v); if (ve) ve.onclick = () => { E.quem = 'eu'; $('#gt-quem').value = 'eu'; ler(); };
}

/* ---------- tema e início ---------- */
const temaAtual = () => document.documentElement.getAttribute('data-theme') || 'light';
const iconeTema = () => { const d = temaAtual() === 'dark'; $('#btn-tema use').setAttribute('href', d ? '#i-sun' : '#i-moon'); $('#tema-tx').textContent = d ? 'Tema claro' : 'Tema escuro'; };
$('#btn-tema').onclick = () => { const n = temaAtual() === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', n); try { localStorage.setItem('controlonvio-theme', n); } catch (e) {} iconeTema(); };
$('#btn-ver-gestta').onclick = () => paraPai({ controlGestta: 'fechar' });
$('#btn-atualizar').onclick = () => ler();
$('#gt-mes-ant').onclick = () => { E.mes--; if (E.mes < 1) { E.mes = 12; E.ano--; } E.dia = ''; ler(); };
$('#gt-mes-prox').onclick = () => { E.mes++; if (E.mes > 12) { E.mes = 1; E.ano++; } E.dia = ''; ler(); };
$('#gt-quem').onchange = e => { E.quem = e.target.value; E.abertas.clear(); ler(); };
addEventListener('keydown', e => {
  const digitando = e.target.matches('input, select, textarea');
  if (e.key === '/' && !digitando) { const q = $('#gt-q'); if (q) { e.preventDefault(); q.focus(); } return; }
  if (e.key === 'Escape') { if (digitando && e.target.id === 'gt-q' && E.q) { E.q = ''; desenhar(); return; } if (!digitando) paraPai({ controlGestta: 'fechar' }); }
});
// A camada avisa quando aparece ou some: só relê sozinho com ela visível.
addEventListener('message', e => {
  if (e.source !== window.parent || e.origin !== 'https://app.gestta.com.br') return;
  const d = e.data || {};
  if (d.controlGestta === 'visivel') { E.visivel = true; if (!E.carregando && (!E.lidoEm || Date.now() - new Date(E.lidoEm) > 60e3)) ler(true); }
  else if (d.controlGestta === 'oculto') E.visivel = false;
});
setInterval(() => { if (E.visivel && !E.carregando && document.visibilityState === 'visible') ler(true); }, ATUALIZA_MIN * 60e3);
setInterval(aoVivo, 30e3);
iconeTema();
ler();

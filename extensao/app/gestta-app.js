/* Control Onvio · Tarefas do Gestta (0.72.0; trilha, setor e Fechamento do mês na 0.73.0)
 * Tela por cima do Gestta (iframe da extensão, aberto pelo shell-gestta.js). Mostra as tarefas do mês de quem está logado
 * (a coordenação escolhe outra pessoa ou as sem responsável) de três jeitos: por prazo (multa, atraso, impedimento, hoje,
 * próximos 5 dias úteis, mais adiante, concluídas), por empresa (o mês de cada cliente numa linha, com o que pesa primeiro)
 * e em calendário. Filtros instantâneos: busca, situação, tipo e dia. As tarefas são lidas na hora (cmd gesttaTarefas) e
 * ficam só na memória desta tela: nada vai ao armazenamento. Abrir uma tarefa só navega no próprio Gestta.
 */
import { $, $$, esc, toast, simples, lerPref, gravarPref, num, plural } from './util.js';
import { listaEmpresas, abrirPainel, fecharPainel, painelAberto, passarPainel } from './gestta-trilha.js';
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
  q: '', grupos: new Set(), tipos: new Set(), dia: '', abertas: new Set(), visivel: true,
  aba: lerPref('gt.aba', 'minhas'), trilha: lerPref('gt.trilha', 'seq'), setor: '',
  fech: null, fechTarefas: [], setorPorId: null, fechCarregando: false, fechErro: null, fq: '', fsetor: '', fanal: '', soPend: false,
  empMap: new Map(), listaAtual: []
};
// as tarefas da busca ganham o setor quando o relatório do mês já está na memória (cruzando pelo id)
const lista = () => { const l = (E.dados && E.dados.itens) || []; return E.setorPorId ? l.map(t => Object.assign({}, t, { setor: E.setorPorId.get(t._id) || '' })) : l; };
const nomeMes = () => MESES[E.mes - 1].replace(/^./, c => c.toUpperCase()) + ' de ' + E.ano;
const ehMesAtual = () => E.ano === new Date().getFullYear() && E.mes === new Date().getMonth() + 1;
const filtroAtivo = () => !!(E.q || E.grupos.size || E.tipos.size || E.dia || E.setor);
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
async function lerFech(forcar) {
  E.fechCarregando = true; E.fechErro = null; aoVivo(); desenhar();
  const r = await enviar({ cmd: 'gesttaFechamento', ano: E.ano, mes: E.mes, forcar: !!forcar });
  E.fechCarregando = false;
  if (r && r.ok) {
    E.fech = r; E.fechTarefas = G.tarefasDoRelatorio(r.colunas, r.linhas); E.setorPorId = new Map(E.fechTarefas.map(t => [t._id, t.setor]));
    if (forcar && r.daMemoria && r.podeEm > 0) toast('O relatório foi lido há menos de 1 hora: pode atualizar de novo em ' + r.podeEm + ' min.');
  } else E.fechErro = r || { erro: 'sem resposta' };
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
  if (E.aba === 'fech') {
    $('#btn-atualizar').classList.toggle('girando', E.fechCarregando);
    if (E.fechCarregando) { tx.textContent = 'Lendo o relatório…'; return; }
    if (E.fechErro) { el.classList.add('erro'); tx.textContent = 'Falha na leitura'; return; }
    if (!E.fech) { tx.textContent = 'Aguardando'; return; }
    const hf = new Date(E.fech.lidoEm), hmf = String(hf.getHours()).padStart(2, '0') + ':' + String(hf.getMinutes()).padStart(2, '0');
    el.classList.add('ok'); tx.textContent = simples() ? hmf : 'Lido às ' + hmf; el.title = 'Relatório lido às ' + hmf + (E.fech.segundos ? ' (levou ' + E.fech.segundos + ' s)' : '') + '. Atualiza no máximo 1 vez por hora.'; return;
  }
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
    setorSelHtml() +
    '<label class="gt-feitas"><input type="checkbox" id="gt-feitas"' + (E.feitas ? ' checked' : '') + '> Mostrar concluídas</label>' +
    (filtroAtivo() ? '<button type="button" class="btn btn-sm gt-limpar" id="gt-limpar"><svg class="ic ic-sm"><use href="#i-x"/></svg>Limpar filtros</button>' : '') +
    '<span class="gt-espaco"></span>' +
    '<div class="seg gt-modos" role="group" aria-label="Como ver">' + modo('prazo', 'i-list', 'Por prazo') + modo('empresa', 'i-building', 'Por empresa') + modo('calendario', 'i-calendar', 'Calendário') + '</div></div>';
}
// Setor: vem do relatório do mês (a busca não traz). Sem o relatório na memória, a opção carrega.
function setorSelHtml() {
  const setores = E.setorPorId ? [...new Set(lista().map(t => t.setor).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')) : [];
  return '<label class="gt-sel"><span>Setor</span><select id="gt-setor" aria-label="Setor"><option value="">Todos</option>' +
    (E.setorPorId ? setores.map(x => '<option' + (x === E.setor ? ' selected' : '') + '>' + esc(x) + '</option>').join('') : '<option value="__carregar">' + (E.fechCarregando ? 'Carregando setores…' : 'Carregar setores (relatório do mês)') + '</option>') + '</select></label>';
}
const modoTrilhaHtml = () => '<div class="seg gt-modos" role="group" aria-label="Como desenhar as etapas"><button type="button" class="' + (E.trilha === 'seq' ? 'on' : '') + '" data-trilha="seq" aria-pressed="' + (E.trilha === 'seq') + '"><svg class="ic ic-sm"><use href="#i-repeat"/></svg>Trilha</button><button type="button" class="' + (E.trilha === 'tempo' ? 'on' : '') + '" data-trilha="tempo" aria-pressed="' + (E.trilha === 'tempo') + '"><svg class="ic ic-sm"><use href="#i-calendar"/></svg>Linha do tempo</button></div>';
const legendaTrilha = () => '<p class="gt-leg" aria-hidden="true"><span><i class="gt-et gt-e-feita"><span class="gt-et-mk">✓</span></i>concluída</span><span><i class="gt-et gt-e-multa"><span class="gt-et-mk">!</span></i>multa ou atraso</span><span><i class="gt-et gt-e-impedimento"><span class="gt-et-mk"></span></i>impedimento</span><span><i class="gt-et gt-e-hoje"><span class="gt-et-mk"></span></i>vence hoje</span><span><i class="gt-et gt-e-afazer"><span class="gt-et-mk"></span></i>a fazer</span><span class="fraco">clique numa etapa para ver o detalhe</span></p>';
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
  E.empMap = new Map(emps.map(e => [e.id, e.tarefas]));
  if (!emps.length) return vazio();
  return '<div class="gt-tr-barra">' + modoTrilhaHtml() + legendaTrilha() + '</div><div id="gt-trs-alvo"></div>';
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
function abas() {
  $$('#abas [data-aba]').forEach(b => { const on = b.dataset.aba === E.aba; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
  const qw = $('#gt-quem-wrap'); if (qw) qw.classList.toggle('gt-so-minhas', E.aba !== 'minhas');
}
function desenhar() {
  abas();
  if (E.aba === 'fech') return desenharFech();
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
  const f = { q: E.q, grupos: [...E.grupos], tipos: [...E.tipos], feitas: E.feitas, dia: E.modo === 'calendario' ? E.dia : '', setor: E.setor };
  const filtrados = G.filtrarTarefas(todos, f, hoje);
  const base = G.filtrarTarefas(todos, Object.assign({}, f, { dia: '', feitas: true }), hoje);
  const aviso = (E.erro ? '<div class="faixa"><svg class="ic"><use href="#i-alert"/></svg><div><b>A última atualização falhou.</b> ' + esc(E.erro.erro || '') + ' Mostrando a leitura anterior.</div></div>' : '') +
    (E.dados.cortado ? '<div class="faixa"><svg class="ic"><use href="#i-alert"/></svg><div><b>Lista cortada.</b> Passou de ' + num(G.MAX_PAGINAS_TAREFAS * G.LIMITE_BUSCA) + ' tarefas no mês: a tela mostra as primeiras. Escolha uma pessoa para ver tudo dela.</div></div>' : '') +
    (E.quem !== 'eu' ? '<p class="gt-outra">Vendo ' + (E.quem === 'sem' ? 'as tarefas <b>sem responsável</b>' : 'as tarefas de <b>' + esc($('#gt-quem').selectedOptions[0] ? $('#gt-quem').selectedOptions[0].textContent : 'outra pessoa') + '</b>') + '. <button type="button" class="linkish" id="gt-voltar-eu">Voltar às minhas</button></p>' : '');
  const conteudo = E.modo === 'empresa' ? vistaEmpresa(filtrados, hoje) : E.modo === 'calendario' ? vistaCalendario(filtrados, hoje, base) : vistaPrazo(filtrados, hoje);
  const contagem = E.modo !== 'calendario' || E.dia ? '<p class="gt-cont" aria-live="polite">' + (filtroAtivo() ? num(filtrados.length) + ' de ' + num(c.total) + ' tarefas' : plural(filtrados.length, 'tarefa', 'tarefas') + (E.feitas ? '' : ' abertas')) + '</p>' : '';
  const foco = document.activeElement && document.activeElement.id === 'gt-q' ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
  v.innerHTML = aviso + heroHtml(c) + barraHtml() + contagem + '<div class="gt-conteudo gt-modo-' + E.modo + '">' + conteudo + '</div>';
  E.listaAtual = filtrados;
  const alvo = $('#gt-trs-alvo', v); if (alvo) listaEmpresas(alvo, G.porEmpresa(filtrados, hoje), { modo: E.trilha, ano: E.ano, mes: E.mes, hoje });
  v.scrollTop = topo;
  if (foco) { const q = $('#gt-q'); q.focus(); try { q.setSelectionRange(foco[0], foco[1]); } catch (e) {} }
  ligar(v);
}

/* ---------- Fechamento do mês (0.73.0): todas as empresas que o acesso alcança, do relatório CUSTOMER_TASK ---------- */
function barras(lista, tipo, sel) {
  if (!lista.length) return '<p class="fraco">Sem dados.</p>';
  return '<ul class="gt-barras">' + lista.map(x => '<li><button type="button" class="gt-bar' + (sel === x.nome ? ' on' : '') + '" data-f' + tipo + '="' + esc(x.nome) + '" aria-pressed="' + (sel === x.nome) + '" title="' + esc(x.nome + ': ' + x.feitas + ' de ' + x.total + ' concluídas' + (x.multa ? ', ' + x.multa + ' com multa' : '') + (x.atrasada ? ', ' + x.atrasada + ' atrasadas' : '')) + '">' +
    '<span class="gt-bar-nome">' + esc(x.nome) + '</span><span class="gt-bar-trilho"><i style="width:' + x.pct + '%"></i></span><span class="gt-bar-num"><b>' + x.pct + '%</b> ' + num(x.feitas) + '/' + num(x.total) + '</span>' +
    (x.multa + x.atrasada ? '<span class="pill pill-late">' + num(x.multa + x.atrasada) + '</span>' : '<span></span>') + '</button></li>').join('') + '</ul>';
}
function desenharFech() {
  const v = $('#vista'), topo = v.scrollTop;
  $('#gt-mes-rot').textContent = nomeMes();
  if (!E.fech) {
    $('#subtitulo').textContent = 'Fechamento do mês';
    if (E.fechErro) { v.innerHTML = '<div class="faixa"><svg class="ic"><use href="#i-alert"/></svg><div style="flex:1;min-width:240px"><b>Não consegui ler o relatório do mês.</b> ' + esc(E.fechErro.erro || '') + '</div><button class="btn btn-sm" id="gt-fech-tentar">Tentar de novo</button></div>'; $('#gt-fech-tentar').onclick = () => lerFech(true); }
    else { v.innerHTML = '<div class="gt-carregando"><span class="gt-giro" aria-hidden="true"></span><b>Lendo o relatório de tarefas do mês no Gestta…</b><small>São todas as tarefas do mês de todas as empresas que o seu acesso alcança: pode levar até um minuto. Depois fica na memória do Chrome e atualiza no máximo 1 vez por hora.</small></div>'; if (!E.fechCarregando) lerFech(false); }
    return;
  }
  const hoje = new Date(), todos = E.fechTarefas, geral = G.fechamento(todos, hoje);
  const filtradas = G.filtrarTarefas(todos, { q: E.fq, setor: E.fsetor, analista: E.fanal, feitas: true }, hoje), L = G.fechamento(filtradas, hoje);
  const emps = E.soPend ? L.empresas.filter(e => !e.fechada) : L.empresas;
  E.empMap = new Map(emps.map(e => [e.id, e.tarefas]));
  const t = L.total, filtro = !!(E.fq || E.fsetor || E.fanal || E.soPend);
  $('#subtitulo').textContent = 'Fechamento do mês · ' + plural(L.empresas.length, 'empresa', 'empresas') + ' · ' + t.pct + '% fechado';
  const kpi = (n, rot, cls) => '<div class="gt-kpi gt-kpi-est ' + (cls || '') + '"><b>' + num(n) + '</b><span>' + rot + '</span></div>';
  const avisos = (E.fech.parcial ? '<div class="faixa gt-faixa-info"><svg class="ic"><use href="#i-lock"/></svg><div><b>Você vê só o que o Gestta libera para o seu acesso</b> (' + esc(E.fech.perfil.papelNome) + (E.fech.perfil.setores.length ? ': ' + esc(E.fech.perfil.setores.map(x => x.nome).join(', ')) : '') + '). Não é o fechamento do escritório todo.</div></div>' : '') +
    (geral.desconhecidas ? '<div class="faixa"><svg class="ic"><use href="#i-alert"/></svg><div><b>' + plural(geral.desconhecidas, 'tarefa veio', 'tarefas vieram') + ' com situação desconhecida</b> e não entram na conta. O Gestta pode ter mudado o relatório: avise o Josué.</div></div>' : '');
  v.innerHTML = avisos +
    '<section class="gt-hero cfg-card"><div class="gt-prog">' + anel(t.pct, simples() ? 76 : 96) + '<div class="gt-prog-tx"><b>' + t.pct + '%</b><span>' + num(t.feitas) + ' de ' + num(t.total) + ' tarefas concluídas</span><small>' + num(L.fechadas) + ' de ' + num(L.empresas.length) + ' empresas com o mês fechado</small></div></div>' +
      '<div class="gt-kpis">' + kpi(t.abertas, 'abertas', 'gt-c-prox') + kpi(t.multa, 'gerando multa', 'gt-c-multa') + kpi(t.atrasada, 'atrasadas', 'gt-c-atraso') + kpi(t.impedimento, 'com impedimento', 'gt-c-imped') + kpi(L.empresas.length - L.fechadas, 'empresas com pendência', 'gt-c-depois') + '</div></section>' +
    '<div class="gt-paineis"><section class="cfg-card gt-pn"><h2 class="gt-pn-tit">Por setor <small class="fraco">clique para filtrar</small></h2>' + barras(geral.setores, 'setor', E.fsetor) + '</section>' +
      '<section class="cfg-card gt-pn"><h2 class="gt-pn-tit">Por analista <small class="fraco">da menor para a maior</small></h2>' + barras(geral.analistas, 'anal', E.fanal) + '</section></div>' +
    '<div class="gt-barra">' +
      '<label class="gt-busca"><svg class="ic"><use href="#i-search"/></svg><input type="search" id="gt-fq" placeholder="Buscar empresa, código, CNPJ ou tarefa" autocomplete="off" aria-label="Buscar empresa, código, CNPJ ou tarefa" value="' + esc(E.fq) + '"><kbd>/</kbd></label>' +
      '<label class="gt-sel"><span>Setor</span><select id="gt-fsetor"><option value="">Todos</option>' + geral.setores.map(x => '<option' + (x.nome === E.fsetor ? ' selected' : '') + '>' + esc(x.nome) + '</option>').join('') + '</select></label>' +
      '<label class="gt-sel"><span>Analista</span><select id="gt-fanal"><option value="">Todos</option>' + geral.analistas.map(x => '<option' + (x.nome === E.fanal ? ' selected' : '') + '>' + esc(x.nome) + '</option>').join('') + '</select></label>' +
      '<label class="gt-feitas"><input type="checkbox" id="gt-pend"' + (E.soPend ? ' checked' : '') + '> Só com pendência</label>' +
      (filtro ? '<button type="button" class="btn btn-sm" id="gt-flimpar"><svg class="ic ic-sm"><use href="#i-x"/></svg>Limpar filtros</button>' : '') +
      '<span class="gt-espaco"></span>' + modoTrilhaHtml() + '</div>' +
    legendaTrilha() + '<p class="gt-cont">' + plural(emps.length, 'empresa', 'empresas') + (E.fech.daMemoria ? ' · relatório da memória do Chrome' : '') + '</p>' +
    (emps.length ? '<div id="gt-trs-alvo"></div>' : '<div class="vazio"><b>Nenhuma empresa com esses filtros</b>Tire um filtro ou limpe todos.</div>');
  const alvo = $('#gt-trs-alvo', v); if (alvo) listaEmpresas(alvo, emps, { modo: E.trilha, ano: E.ano, mes: E.mes, hoje, comSetores: !E.fsetor });
  v.scrollTop = topo;
  const foco = document.activeElement && document.activeElement.id;
  $$('[data-fsetor]', v).forEach(b => b.onclick = () => { E.fsetor = E.fsetor === b.dataset.fsetor ? '' : b.dataset.fsetor; desenhar(); });
  $$('[data-fanal]', v).forEach(b => b.onclick = () => { E.fanal = E.fanal === b.dataset.fanal ? '' : b.dataset.fanal; desenhar(); });
  $$('[data-trilha]', v).forEach(b => b.onclick = () => { E.trilha = b.dataset.trilha; gravarPref('gt.trilha', E.trilha); desenhar(); });
  const fq = $('#gt-fq', v); fq.oninput = () => { E.fq = fq.value; const p = [fq.selectionStart, fq.selectionEnd]; desenhar(); const n = $('#gt-fq'); n.focus(); try { n.setSelectionRange(p[0], p[1]); } catch (e) {} };
  $('#gt-fsetor', v).onchange = e => { E.fsetor = e.target.value; desenhar(); };
  $('#gt-fanal', v).onchange = e => { E.fanal = e.target.value; desenhar(); };
  $('#gt-pend', v).onchange = e => { E.soPend = e.target.checked; desenhar(); };
  const fl = $('#gt-flimpar', v); if (fl) fl.onclick = () => { E.fq = ''; E.fsetor = ''; E.fanal = ''; E.soPend = false; desenhar(); };
  if (foco === 'gt-fq') { const n = $('#gt-fq'); if (n) n.focus(); }
}
function ligar(v) {
  $$('[data-grupo]', v).forEach(b => b.onclick = () => { const k = b.dataset.grupo; if (E.grupos.has(k)) E.grupos.delete(k); else E.grupos.add(k); if (k === 'feita' && E.grupos.has('feita')) E.feitas = true; desenhar(); });
  $$('[data-tipo]', v).forEach(b => b.onclick = () => { const k = b.dataset.tipo; if (E.tipos.has(k)) E.tipos.delete(k); else E.tipos.add(k); desenhar(); });
  $$('[data-modo]', v).forEach(b => b.onclick = () => { E.modo = b.dataset.modo; gravarPref('gt.modo', E.modo); desenhar(); });
  $$('[data-dia]', v).forEach(b => b.onclick = () => { E.dia = E.dia === b.dataset.dia ? '' : b.dataset.dia; desenhar(); });
  $$('[data-abrir]', v).forEach(b => b.onclick = e => { e.stopPropagation(); paraPai({ controlGestta: 'abrirTarefa', id: b.dataset.abrir }); });
  $$('[data-nova]', v).forEach(b => b.onclick = e => { e.stopPropagation(); const u = G.urlTarefa(b.dataset.nova); if (u) window.open(u, '_blank', 'noopener'); });
  $$('[data-trilha]', v).forEach(b => b.onclick = () => { E.trilha = b.dataset.trilha; gravarPref('gt.trilha', E.trilha); desenhar(); });
  const st = $('#gt-setor', v); if (st) st.onchange = () => { if (st.value === '__carregar') { st.value = ''; if (!E.fechCarregando) lerFech(false); return; } E.setor = st.value; desenhar(); };
  $$('.gt-t .gt-t-main', v).forEach(m => { m.tabIndex = 0; m.setAttribute('role', 'button'); m.title = 'Ver o detalhe'; });
  const q = $('#gt-q', v); if (q) q.oninput = () => { E.q = q.value; desenhar(); };
  const fe = $('#gt-feitas', v); if (fe) fe.onchange = () => { E.feitas = fe.checked; if (!fe.checked) E.grupos.delete('feita'); gravarPref('gt.feitas', E.feitas ? '1' : '0'); desenhar(); };
  const lp = $('#gt-limpar', v); if (lp) lp.onclick = () => { E.q = ''; E.grupos.clear(); E.tipos.clear(); E.dia = ''; E.setor = ''; desenhar(); };
  const ds = $('#gt-dia-sair', v); if (ds) ds.onclick = () => { E.dia = ''; desenhar(); };
  const ve = $('#gt-voltar-eu', v); if (ve) ve.onclick = () => { E.quem = 'eu'; $('#gt-quem').value = 'eu'; ler(); };
}

/* ---------- tema e início ---------- */
const temaAtual = () => document.documentElement.getAttribute('data-theme') || 'light';
const iconeTema = () => { const d = temaAtual() === 'dark'; $('#btn-tema use').setAttribute('href', d ? '#i-sun' : '#i-moon'); $('#tema-tx').textContent = d ? 'Tema claro' : 'Tema escuro'; };
$('#btn-tema').onclick = () => { const n = temaAtual() === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', n); try { localStorage.setItem('controlonvio-theme', n); } catch (e) {} iconeTema(); };
$('#btn-ver-gestta').onclick = () => paraPai({ controlGestta: 'fechar' });
$('#btn-atualizar').onclick = () => E.aba === 'fech' ? lerFech(true) : ler();
$$('#abas [data-aba]').forEach(b => b.onclick = () => { E.aba = b.dataset.aba; gravarPref('gt.aba', E.aba); fecharPainel(); aoVivo(); desenhar(); });
// uma etapa (trilha ou linha do tempo) ou uma tarefa da lista abre o detalhe ao lado
function abrirDe(alvo) {
  const et = alvo.closest('[data-et]');
  if (et) { const l = G.trilhaDaEmpresa(E.empMap.get(et.dataset.emp) || [], new Date()).etapas.map(x => x.t); const i = l.findIndex(t => t._id === et.dataset.et); if (i >= 0) abrirPainel(l, i, paraPai); return true; }
  const m = alvo.closest('.gt-t-main');
  if (m) { const id = m.closest('.gt-t').dataset.id, l = E.listaAtual, i = l.findIndex(t => t._id === id); if (i >= 0) abrirPainel(l, i, paraPai); return true; }
  return false;
}
$('#vista').addEventListener('click', e => { abrirDe(e.target); });
$('#vista').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.gt-t-main')) { e.preventDefault(); abrirDe(e.target); } });
const trocouMes = () => { E.dia = ''; E.fech = null; E.fechTarefas = []; E.setorPorId = null; E.setor = ''; E.fechErro = null; fecharPainel(); ler(); if (E.aba === 'fech') desenhar(); };
$('#gt-mes-ant').onclick = () => { E.mes--; if (E.mes < 1) { E.mes = 12; E.ano--; } trocouMes(); };
$('#gt-mes-prox').onclick = () => { E.mes++; if (E.mes > 12) { E.mes = 1; E.ano++; } trocouMes(); };
$('#gt-quem').onchange = e => { E.quem = e.target.value; E.abertas.clear(); ler(); };
addEventListener('keydown', e => {
  const digitando = e.target.matches('input, select, textarea');
  if (painelAberto()) { if (e.key === 'Escape') { e.preventDefault(); fecharPainel(); return; } if (!digitando && e.key === 'ArrowLeft') { passarPainel(-1); return; } if (!digitando && e.key === 'ArrowRight') { passarPainel(1); return; } }
  if (e.key === '/' && !digitando) { const q = $('#gt-q') || $('#gt-fq'); if (q) { e.preventDefault(); q.focus(); } return; }
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

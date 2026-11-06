/* Control Onvio · Tarefas do Gestta (0.72.0; trilha, setor e Fechamento na 0.73.0; tela de trabalho nova na 0.77.0)
 * Tela por cima do Gestta (iframe da extensão, aberto pelo shell-gestta.js). Mostra as tarefas do mês de quem está logado
 * (a coordenação escolhe outra pessoa ou as sem responsável) em abas: Meu dia (a fila do dia com o detalhe ao lado),
 * Empresas (a lista de empresas e a ficha de cada uma, com a trilha do mês e as tarefas por situação), Lista (tabela densa),
 * Obrigações (grade empresa × obrigação), Calendário e Fechamento do mês. Um topo só: progresso, situações que filtram,
 * busca e Filtros. As tarefas são lidas na hora (cmd gesttaTarefas) e ficam só na memória desta tela: nada vai ao
 * armazenamento. Abrir uma tarefa só navega no próprio Gestta.
 */
import { $, $$, esc, toast, simples, lerPref, gravarPref, num, plural } from './util.js';
import { listaEmpresas, abrirPainel, fecharPainel, painelAberto, passarPainel, abrirNoGestta } from './gestta-trilha.js';
import { vistaDia, vistaEmpresas, vistaLista, vistaQuadro } from './gestta-vistas.js';
const G = window.OCG;
const enviar = msg => new Promise(res => { try { chrome.runtime.sendMessage(msg, r => res(r || { ok: false, erro: (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'sem resposta' })); } catch (e) { res({ ok: false, erro: String(e.message || e) }); } });
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const ATUALIZA_MIN = 10;
const ABAS = ['dia', 'empresas', 'lista', 'quadro', 'calendario', 'fech'];               // com a camada aberta e visível, relê sozinho a cada 10 minutos

const hoje0 = new Date(), comp0 = G.competenciaPadrao(hoje0);
// 0.85.0 (Josué, 06/11/2026): a tela é da competência (de fábrica a do mês anterior, a que está sendo fechada); o Meu dia segue o vencimento
const E = {
  ano: comp0.ano, mes: comp0.mes, quem: 'eu', calMes: '',
  dados: null, carregando: false, erro: null, lidoEm: null, equipe: null,
  feitas: lerPref('gt.feitas', '0') === '1',
  q: '', grupos: new Set(), tipos: new Set(), dia: '', abertas: new Set(), visivel: true,
  aba: (a => ABAS.includes(a) ? a : 'dia')(lerPref('gt.aba', 'dia')), soPendEmp: false, trilha: lerPref('gt.trilha', 'seq'), setor: '',
  fech: null, fechTarefas: [], setorPorId: null, fechCarregando: false, fechErro: null, fq: '', fsetor: '', fanal: '', soPend: false,
  empMap: new Map(), listaAtual: []
};
// as tarefas da busca ganham o setor quando o relatório do mês já está na memória (cruzando pelo id)
const comSetor = l => E.setorPorId ? l.map(t => Object.assign({}, t, { setor: E.setorPorId.get(t._id) || '' })) : l;
const lista = () => comSetor((E.dados && E.dados.itens) || []);
const listaDia = () => comSetor((E.dados && E.dados.dia) || []);          // o que vence no mês corrente, de qualquer competência
const nomeMes = () => 'Competência ' + MESES[E.mes - 1] + ' de ' + E.ano;
// o mês de meta para as grades (calendário e linha do tempo): o escolhido no calendário ou onde mais tarefas da competência vencem
function mesDeMeta(tarefas) {
  const ms = G.mesesDeMeta(tarefas), esc = ms.find(m => G.mesTexto(m.ano, m.mes) === E.calMes);
  return esc || ms[0] || (E.mes === 12 ? { ano: E.ano + 1, mes: 1 } : { ano: E.ano, mes: E.mes + 1 });
}
const filtroAtivo = () => !!(E.q || E.grupos.size || E.tipos.size || E.dia || E.setor || E.soPendEmp);
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
    if (E.quem === 'eu' && r.dia) { const c = G.contarGrupos(r.dia, new Date()).n; paraPai({ controlGestta: 'contagem', atencao: c.multa + c.atrasada + c.hoje }); }
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
  const sub = c ? quem + ' · ' + plural(c.total, 'tarefa', 'tarefas') + (E.aba === 'dia' ? ' com meta neste mês' : ' na competência') : quem;
  $('#subtitulo').textContent = sub;
  const t = $('#titulo'); if (simples()) t.title = sub; else t.removeAttribute('title');
  const pf = E.dados && E.dados.perfil;
  $('#quem').textContent = pf ? pf.papelNome : '';
  $('#trilho-pe').title = pf ? 'No Gestta como ' + pf.papelNome + (pf.setores.length ? ' · ' + pf.setores.map(s => s.nome).join(', ') : '') : '';
  const cd = E.dados && E.dados.dia ? G.contarGrupos(E.dados.dia, new Date()).n : null;
  const n = cd && E.quem === 'eu' ? cd.multa + cd.atrasada + cd.hoje : 0;
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
// rótulos curtos das situações no topo (o nome inteiro e a explicação ficam na dica)
const SIT_CURTO = { multa: 'Multa', atrasada: 'Atrasadas', impedimento: 'Impedimento', hoje: 'Hoje', proximas: 'Próximos dias', depois: 'Mais adiante', feita: 'Concluídas' };
// Topo das abas de trabalho (0.77.0): progresso do mês, as situações (que filtram), a busca e o menu Filtros, numa faixa só.
function topoHtml(c) {
  const sit = gr => (c.n[gr.k] || E.grupos.has(gr.k)) ? '<button type="button" class="gt-sit gt-c-' + COR[gr.k] + (E.grupos.has(gr.k) ? ' on' : '') + '" data-grupo="' + gr.k + '" aria-pressed="' + E.grupos.has(gr.k) + '" title="' + esc(gr.rot + ': ' + gr.dica) + '"><i class="gt-ponto"></i>' + esc(SIT_CURTO[gr.k] || gr.rot) + '<b>' + num(c.n[gr.k]) + '</b></button>' : '';
  const tipo = k => '<button type="button" class="gt-chip' + (E.tipos.has(k) ? ' on' : '') + '" data-tipo="' + k + '" aria-pressed="' + E.tipos.has(k) + '">' + esc(G.TIPOS_TAREFA[k]) + '</button>';
  const nf = E.tipos.size + (E.setor ? 1 : 0) + (E.soPendEmp && (E.aba === 'empresas' || E.aba === 'quadro') ? 1 : 0) + (E.feitas && (E.aba === 'lista' || E.aba === 'calendario') ? 1 : 0);
  return '<div class="gt-topo">' +
    '<div class="gt-topo-prog" title="' + num(c.feitas) + ' de ' + num(c.total) + (E.aba === 'dia' ? ' tarefas com meta neste mês' : ' tarefas da competência') + ' concluídas">' + anel(c.pctFeitas, 42) + '<span><b>' + c.pctFeitas + '%</b><small>' + num(c.feitas) + ' de ' + num(c.total) + '</small></span></div>' +
    '<div class="gt-sits" role="group" aria-label="Filtrar pela situação">' + G.GRUPOS.map(sit).join('') + '</div>' +
    '<div class="gt-topo-dir">' +
      '<label class="gt-busca"><svg class="ic"><use href="#i-search"/></svg><input type="search" id="gt-q" placeholder="Buscar tarefa, empresa ou código" autocomplete="off" aria-label="Buscar tarefa, empresa ou código" value="' + esc(E.q) + '"><kbd>/</kbd></label>' +
      '<details class="menu gt-filtros" id="gt-filtros"><summary class="btn btn-sm' + (nf ? ' filtro-on' : '') + '"><svg class="ic ic-sm"><use href="#i-filter"/></svg>Filtros' + (nf ? ' <span class="menu-n">' + nf + '</span>' : '') + '</summary>' +
        '<div class="menu-list form gt-filtros-menu"><span class="gt-f-rot">Tipo</span><div class="gt-chips" role="group" aria-label="Tipo">' + Object.keys(G.TIPOS_TAREFA).map(tipo).join('') + '</div>' +
          setorSelHtml() +
          (E.aba === 'empresas' || E.aba === 'quadro' ? '<label class="gt-feitas"><input type="checkbox" id="gt-pend-emp"' + (E.soPendEmp ? ' checked' : '') + '> Só empresas com pendência</label>' : '') +
          (E.aba === 'lista' || E.aba === 'calendario' ? '<label class="gt-feitas"><input type="checkbox" id="gt-feitas"' + (E.feitas ? ' checked' : '') + '> Mostrar concluídas</label>' : '') +
        '</div></details>' +
      (filtroAtivo() ? '<button type="button" class="btn btn-sm gt-limpar" id="gt-limpar"><svg class="ic ic-sm"><use href="#i-x"/></svg>Limpar</button>' : '') +
    '</div></div>';
}
// Setor: vem do relatório (Fechamento da competência) (a busca não traz). Sem o relatório na memória, a opção carrega.
function setorSelHtml() {
  const setores = E.setorPorId ? [...new Set(lista().map(t => t.setor).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')) : [];
  return '<label class="gt-sel"><span>Setor</span><select id="gt-setor" aria-label="Setor"><option value="">Todos</option>' +
    (E.setorPorId ? setores.map(x => '<option' + (x === E.setor ? ' selected' : '') + '>' + esc(x) + '</option>').join('') : '<option value="__carregar">' + (E.fechCarregando ? 'Carregando setores…' : 'Carregar setores (fechamento da competência)') + '</option>') + '</select></label>';
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
function vistaCalendario(itens, hoje, todosDoMes) {
  // 0.85.0: as tarefas são da competência; o calendário mostra as metas delas, um mês de meta por vez
  const ms = G.mesesDeMeta(todosDoMes), vm = mesDeMeta(todosDoMes), ano = vm.ano, mes = vm.mes;
  const dias = G.porDia(todosDoMes, hoje), max = Math.max(1, ...Object.values(dias).map(d => d.abertas));
  const ini = new Date(ano, mes - 1, 1), nDias = new Date(ano, mes, 0).getDate(), pulo = (ini.getDay() + 6) % 7, hojeK = G.ymd(G.diaLocal(hoje));
  const outros = ms.length > 1 ? '<div class="gt-chips gt-cal-meses" role="group" aria-label="Mês das metas"><span class="gt-f-rot">Metas em</span>' + ms.map(m => { const k = G.mesTexto(m.ano, m.mes), on = m.ano === ano && m.mes === mes; return '<button type="button" class="gt-chip' + (on ? ' on' : '') + '" data-calmes="' + k + '" aria-pressed="' + on + '">' + MESES[m.mes - 1] + ' de ' + m.ano + ' <b>' + num(m.n) + '</b></button>'; }).join('') + '</div>' : '';
  let cel = '';
  for (let i = 0; i < pulo; i++) cel += '<span class="gt-dia vazio" aria-hidden="true"></span>';
  for (let d = 1; d <= nDias; d++) {
    const k = ano + '-' + String(mes).padStart(2, '0') + '-' + String(d).padStart(2, '0'), x = dias[k], dt = new Date(ano, mes - 1, d), fds = dt.getDay() === 0 || dt.getDay() === 6;
    const nivel = x && x.abertas ? Math.ceil(x.abertas / max * 4) : 0;
    const desc = x ? [x.abertas ? x.abertas + (x.abertas === 1 ? ' aberta' : ' abertas') : '', x.atrasadas ? x.atrasadas + ' atrasadas' : '', x.feitas ? x.feitas + (x.feitas === 1 ? ' concluída' : ' concluídas') : ''].filter(Boolean).join(', ') : 'nenhuma tarefa';
    cel += '<button type="button" class="gt-dia n' + nivel + (fds ? ' fds' : '') + (k === hojeK ? ' hoje' : '') + (E.dia === k ? ' on' : '') + '" data-dia="' + k + '" aria-pressed="' + (E.dia === k) + '" aria-label="' + d + ' de ' + MESES[mes - 1] + ': ' + desc + '">' +
      '<span class="gt-dia-n">' + d + '</span>' + (x ? (x.abertas ? '<span class="gt-dia-tot">' + num(x.abertas) + '</span>' : '') + '<span class="gt-dia-mk">' + (x.atrasadas ? '<i class="mk-atraso" title="' + x.atrasadas + ' atrasadas">' + x.atrasadas + '</i>' : '') + (x.feitas ? '<i class="mk-feita" title="' + x.feitas + ' concluídas">' + x.feitas + '</i>' : '') + '</span>' : '') + '</button>';
  }
  const dSel = E.dia ? new Date(E.dia + 'T12:00:00') : null;
  return outros + '<section class="gt-cal cfg-card"><h2 class="gt-cal-tit">Metas em ' + MESES[mes - 1] + ' de ' + ano + '</h2><div class="gt-cal-sem">' + SEMANA.map(s => '<span>' + s + '</span>').join('') + '</div><div class="gt-cal-grade">' + cel + '</div>' +
    '<p class="gt-cal-leg"><span><i class="lg-aberta"></i>número = abertas com meta no dia</span><span><i class="mk-atraso">3</i>atrasadas</span><span><i class="mk-feita">2</i>concluídas</span></p></section>' +
    (E.dia ? '<h2 class="gt-cal-dia">Meta em ' + dSel.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) + '<button type="button" class="btn btn-sm" id="gt-dia-sair">Ver a competência toda</button></h2>' + (itens.length ? '<ul class="gt-lista">' + itens.map(t => linhaTarefa(t, hoje)).join('') + '</ul>' : vazio()) : '<p class="fraco gt-cal-dica">Clique num dia para ver as tarefas com meta nele.</p>');
}
const vazio = () => '<div class="vazio"><b>' + (filtroAtivo() ? 'Nenhuma tarefa com esses filtros' : E.aba === 'dia' ? 'Nenhuma tarefa com meta neste mês' : 'Nenhuma tarefa na competência') + '</b>' + (filtroAtivo() ? 'Tire um filtro ou limpe todos.' : 'Tudo em dia por aqui.') + '</div>';

/* ---------- desenho ---------- */
function abas() {
  $$('#abas [data-aba]').forEach(b => { const on = b.dataset.aba === E.aba; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
  const qw = $('#gt-quem-wrap'); if (qw) qw.classList.toggle('gt-so-minhas', E.aba === 'fech');
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
  const hoje = new Date(), todos = E.aba === 'dia' && E.dados.dia ? listaDia() : lista(), c = G.contarGrupos(todos, hoje), vm = mesDeMeta(lista());
  cabecalho(c);
  const f = { q: E.q, grupos: [...E.grupos], tipos: [...E.tipos], feitas: E.aba === 'lista' || E.aba === 'calendario' ? E.feitas : true, dia: E.aba === 'calendario' ? E.dia : '', setor: E.setor };
  const filtrados = G.filtrarTarefas(todos, f, hoje);
  const base = G.filtrarTarefas(todos, Object.assign({}, f, { dia: '', feitas: true }), hoje);
  const aviso = (E.erro ? '<div class="faixa"><svg class="ic"><use href="#i-alert"/></svg><div><b>A última atualização falhou.</b> ' + esc(E.erro.erro || '') + ' Mostrando a leitura anterior.</div></div>' : '') +
    ((E.aba === 'dia' ? E.dados.diaCortado : E.dados.cortado) ? '<div class="faixa"><svg class="ic"><use href="#i-alert"/></svg><div><b>Lista cortada.</b> Passou de ' + num(G.MAX_PAGINAS_TAREFAS * G.LIMITE_BUSCA) + ' tarefas: a tela mostra as primeiras. Escolha uma pessoa para ver tudo dela.</div></div>' : '') +
    (E.aba === 'dia' && !E.dados.dia ? '<div class="faixa"><svg class="ic"><use href="#i-alert"/></svg><div><b>Não consegui ler as metas deste mês</b>' + (E.dados.diaErro ? ': ' + esc(E.dados.diaErro) : '') + '. O Meu dia mostra as tarefas da competência escolhida.</div></div>' : '') +
    (E.quem !== 'eu' ? '<p class="gt-outra">Vendo ' + (E.quem === 'sem' ? 'as tarefas <b>sem responsável</b>' : 'as tarefas de <b>' + esc($('#gt-quem').selectedOptions[0] ? $('#gt-quem').selectedOptions[0].textContent : 'outra pessoa') + '</b>') + '. <button type="button" class="linkish" id="gt-voltar-eu">Voltar às minhas</button></p>' : '');
  const foco = document.activeElement && document.activeElement.id === 'gt-q' ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
  const menuAberto = $('#gt-filtros') && $('#gt-filtros').open;
  v.innerHTML = aviso + topoHtml(c) + '<div class="gt-conteudo gt-aba-' + E.aba + '" id="gt-conteudo"></div>';
  const alvo = $('#gt-conteudo', v);
  E.empMap = new Map(); E.listaAtual = filtrados; teclaVista = null;
  const x = { itens: filtrados, todos, hoje, ano: vm.ano, mes: vm.mes, mesAtual: true, filtro: filtroAtivo(), soPend: E.soPendEmp, paraPai, vazio,
    teclas: fn => { teclaVista = fn; }, ligarEtapas };
  if (E.aba === 'dia') vistaDia(alvo, x);
  else if (E.aba === 'empresas') vistaEmpresas(alvo, x);
  else if (E.aba === 'lista') vistaLista(alvo, x);
  else if (E.aba === 'quadro') vistaQuadro(alvo, x);
  else alvo.innerHTML = vistaCalendario(filtrados, hoje, base);
  if (menuAberto) $('#gt-filtros').open = true;
  v.scrollTop = topo;
  if (foco) { const q = $('#gt-q'); q.focus(); try { q.setSelectionRange(foco[0], foco[1]); } catch (e) {} }
  ligar(v);
}
// Clique numa etapa (trilha, quadro, cartão) abre o detalhe com as tarefas daquela empresa, na ordem da meta
let teclaVista = null;
function ligarEtapas(el, tarefasDe) {
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-et]'); if (!b || !el.contains(b)) return;
    const l = G.trilhaDaEmpresa(tarefasDe(b.dataset.emp), new Date()).etapas.map(z => z.t), i = l.findIndex(t => t._id === b.dataset.et);
    if (i >= 0) abrirPainel(l, i, paraPai);
  });
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
    $('#subtitulo').textContent = 'Fechamento da competência';
    if (E.fechErro) { v.innerHTML = '<div class="faixa"><svg class="ic"><use href="#i-alert"/></svg><div style="flex:1;min-width:240px"><b>Não consegui ler o fechamento da competência.</b> ' + esc(E.fechErro.erro || '') + '</div><button class="btn btn-sm" id="gt-fech-tentar">Tentar de novo</button></div>'; $('#gt-fech-tentar').onclick = () => lerFech(true); }
    else { v.innerHTML = '<div class="gt-carregando"><span class="gt-giro" aria-hidden="true"></span><b>Lendo o fechamento da competência no Gestta…</b><small>São todas as tarefas da competência de todas as empresas que o seu acesso alcança, com o relatório de cada mês em que elas vencem: pode levar alguns minutos. Depois fica na memória do Chrome e atualiza no máximo 1 vez por hora.</small></div>'; if (!E.fechCarregando) lerFech(false); }
    return;
  }
  const hoje = new Date(), todos = E.fechTarefas, geral = G.fechamento(todos, hoje);
  const filtradas = G.filtrarTarefas(todos, { q: E.fq, setor: E.fsetor, analista: E.fanal, feitas: true }, hoje), L = G.fechamento(filtradas, hoje);
  const emps = E.soPend ? L.empresas.filter(e => !e.fechada) : L.empresas;
  E.empMap = new Map(emps.map(e => [e.id, e.tarefas]));
  const t = L.total, filtro = !!(E.fq || E.fsetor || E.fanal || E.soPend);
  $('#subtitulo').textContent = 'Fechamento da competência · ' + plural(L.empresas.length, 'empresa', 'empresas') + ' · ' + t.pct + '% fechado';
  const kpi = (n, rot, cls) => '<div class="gt-kpi gt-kpi-est ' + (cls || '') + '"><b>' + num(n) + '</b><span>' + rot + '</span></div>';
  const avisos = (E.fech.parcial ? '<div class="faixa gt-faixa-info"><svg class="ic"><use href="#i-lock"/></svg><div><b>Você vê só o que o Gestta libera para o seu acesso</b> (' + esc(E.fech.perfil.papelNome) + (E.fech.perfil.setores.length ? ': ' + esc(E.fech.perfil.setores.map(x => x.nome).join(', ')) : '') + '). Não é o fechamento do escritório todo.</div></div>' : '') +
    (geral.desconhecidas ? '<div class="faixa"><svg class="ic"><use href="#i-alert"/></svg><div><b>' + plural(geral.desconhecidas, 'tarefa veio', 'tarefas vieram') + ' com situação desconhecida</b> e não entram na conta. O Gestta pode ter mudado o relatório: avise o Josué.</div></div>' : '');
  v.innerHTML = avisos +
    '<section class="gt-hero cfg-card"><div class="gt-prog">' + anel(t.pct, simples() ? 76 : 96) + '<div class="gt-prog-tx"><b>' + t.pct + '%</b><span>' + num(t.feitas) + ' de ' + num(t.total) + ' tarefas concluídas</span><small>' + num(L.fechadas) + ' de ' + num(L.empresas.length) + ' empresas com a competência fechada</small></div></div>' +
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
  const vf = mesDeMeta(todos), alvo = $('#gt-trs-alvo', v); if (alvo) listaEmpresas(alvo, emps, { modo: E.trilha, ano: vf.ano, mes: vf.mes, hoje, comSetores: !E.fsetor });
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
  $$('[data-dia]', v).forEach(b => b.onclick = () => { E.dia = E.dia === b.dataset.dia ? '' : b.dataset.dia; desenhar(); });
  $$('[data-calmes]', v).forEach(b => b.onclick = () => { E.calMes = b.dataset.calmes; E.dia = ''; desenhar(); });
  $$('[data-abrir]', v).forEach(b => b.onclick = e => { e.stopPropagation(); paraPai({ controlGestta: 'abrirTarefa', id: b.dataset.abrir }); });
  $$('[data-nova]', v).forEach(b => b.onclick = e => { e.stopPropagation(); const u = G.urlTarefa(b.dataset.nova); if (u) window.open(u, '_blank', 'noopener'); });
  const pe = $('#gt-pend-emp', v); if (pe) pe.onchange = () => { E.soPendEmp = pe.checked; desenhar(); };
  const st = $('#gt-setor', v); if (st) st.onchange = () => { if (st.value === '__carregar') { st.value = ''; if (!E.fechCarregando) lerFech(false); return; } E.setor = st.value; desenhar(); };
  $$('.gt-t .gt-t-main', v).forEach(m => { m.tabIndex = 0; m.setAttribute('role', 'button'); m.title = 'Ver o detalhe'; });
  const q = $('#gt-q', v); if (q) q.oninput = () => { E.q = q.value; desenhar(); };
  const fe = $('#gt-feitas', v); if (fe) fe.onchange = () => { E.feitas = fe.checked; if (!fe.checked) E.grupos.delete('feita'); gravarPref('gt.feitas', E.feitas ? '1' : '0'); desenhar(); };
  const lp = $('#gt-limpar', v); if (lp) lp.onclick = () => { E.q = ''; E.grupos.clear(); E.tipos.clear(); E.dia = ''; E.setor = ''; E.soPendEmp = false; desenhar(); };
  const ds = $('#gt-dia-sair', v); if (ds) ds.onclick = () => { E.dia = ''; desenhar(); };
  const ve = $('#gt-voltar-eu', v); if (ve) ve.onclick = () => { E.quem = 'eu'; $('#gt-quem').value = 'eu'; ler(); };
}

/* ---------- tema e início ---------- */
const temaAtual = () => document.documentElement.getAttribute('data-theme') || 'light';
const iconeTema = () => { const d = temaAtual() === 'dark'; $('#btn-tema use').setAttribute('href', d ? '#i-sun' : '#i-moon'); $('#tema-tx').textContent = d ? 'Tema claro' : 'Tema escuro'; };
$('#btn-tema').onclick = () => { const n = temaAtual() === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', n); try { localStorage.setItem('controlonvio-theme', n); } catch (e) {} iconeTema(); };
$('#btn-ver-gestta').onclick = () => paraPai({ controlGestta: 'fechar' });
$('#btn-atualizar').onclick = () => E.aba === 'fech' ? lerFech(true) : ler();
function trocarAba(a) { if (!ABAS.includes(a) || a === E.aba) return; E.aba = a; gravarPref('gt.aba', E.aba); fecharPainel(); aoVivo(); desenhar(); $('#vista').scrollTop = 0; }
$$('#abas [data-aba]').forEach(b => b.onclick = () => trocarAba(b.dataset.aba));
// uma etapa (trilha ou linha do tempo) ou uma tarefa da lista abre o detalhe ao lado
function abrirDe(alvo) {
  const et = alvo.closest('[data-et]');
  if (et) { if (!E.empMap.has(et.dataset.emp)) return false; const l = G.trilhaDaEmpresa(E.empMap.get(et.dataset.emp), new Date()).etapas.map(x => x.t); const i = l.findIndex(t => t._id === et.dataset.et); if (i >= 0) abrirPainel(l, i, paraPai); return true; }
  const m = alvo.closest('.gt-t-main');
  if (m) { const id = m.closest('.gt-t').dataset.id, l = E.listaAtual, i = l.findIndex(t => t._id === id); if (i >= 0) abrirPainel(l, i, paraPai); return true; }
  return false;
}
$('#vista').addEventListener('click', e => { abrirDe(e.target); });
// o menu Filtros fecha ao clicar fora dele
document.addEventListener('click', e => { const m = $('#gt-filtros'); if (m && m.open && !m.contains(e.target)) m.open = false; });
$('#vista').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.gt-t-main')) { e.preventDefault(); abrirDe(e.target); } });
const trocouMes = () => { E.dia = ''; E.calMes = ''; E.fech = null; E.fechTarefas = []; E.setorPorId = null; E.setor = ''; E.fechErro = null; fecharPainel(); ler(); if (E.aba === 'fech') desenhar(); };
$('#gt-mes-ant').onclick = () => { E.mes--; if (E.mes < 1) { E.mes = 12; E.ano--; } trocouMes(); };
$('#gt-mes-prox').onclick = () => { E.mes++; if (E.mes > 12) { E.mes = 1; E.ano++; } trocouMes(); };
$('#gt-quem').onchange = e => { E.quem = e.target.value; E.abertas.clear(); ler(); };
addEventListener('keydown', e => {
  const digitando = e.target.matches('input, select, textarea');
  if (painelAberto()) { if (e.key === 'Escape') { e.preventDefault(); fecharPainel(); return; } if (!digitando && e.key === 'ArrowLeft') { passarPainel(-1); return; } if (!digitando && e.key === 'ArrowRight') { passarPainel(1); return; } }
  if (e.key === '/' && !digitando) { const q = $('#gt-q') || $('#gt-fq'); if (q) { e.preventDefault(); q.focus(); } return; }
  if (!digitando && !e.ctrlKey && !e.metaKey && !e.altKey && teclaVista && E.aba !== 'fech' && teclaVista(e)) { e.preventDefault(); return; }
  const n = '123456'.indexOf(e.key);
  if (!digitando && n >= 0 && !e.ctrlKey && !e.metaKey && !e.altKey) { trocarAba(ABAS[n]); return; }
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

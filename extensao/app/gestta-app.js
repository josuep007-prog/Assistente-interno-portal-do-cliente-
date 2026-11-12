/* Control Onvio · Tarefas do Gestta (0.72.0; trilha, setor e Fechamento na 0.73.0; tela de trabalho nova na 0.77.0)
 * Tela por cima do Gestta (iframe da extensão, aberto pelo shell-gestta.js). Mostra as tarefas do mês de quem está logado
 * (a coordenação escolhe outra pessoa ou as sem responsável) em abas: Meu dia (a fila do dia com o detalhe ao lado),
 * Empresas (a lista de empresas e a ficha de cada uma, com a trilha do mês e as tarefas por situação), Lista (tabela densa),
 * Obrigações (grade empresa × obrigação), Calendário e Fechamento do mês. Um topo só: progresso, situações que filtram,
 * busca e Filtros. As tarefas são lidas na hora (cmd gesttaTarefas) e ficam só na memória desta tela: nada vai ao
 * armazenamento. Abrir uma tarefa só navega no próprio Gestta.
 */
import { $, $$, esc, toast, simples, lerPref, gravarPref, num, plural } from './util.js';
import { listaEmpresas, abrirPainel, fecharPainel, painelAberto, passarPainel, abrirNoGestta, painelTarefa } from './gestta-trilha.js';
import { ligarSoltar } from './gestta-soltar.js';
import { vistaDia, vistaEmpresas, vistaLista, vistaQuadro } from './gestta-vistas.js';
import { desenharEnvios, lerEnvios, ligarEnvios, estadoEnvios } from './gestta-envios.js';
const G = window.OCG;
const enviar = msg => new Promise(res => { try { chrome.runtime.sendMessage(msg, r => res(r || { ok: false, erro: (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'sem resposta' })); } catch (e) { res({ ok: false, erro: String(e.message || e) }); } });
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const ATUALIZA_MIN = 10;
const ABAS = ['dia', 'empresas', 'lista', 'quadro', 'calendario', 'fech', 'envios'];               // com a camada aberta e visível, relê sozinho a cada 10 minutos

const hoje0 = new Date(), comp0 = G.competenciaPadrao(hoje0);
// 0.85.0 (Josué, 06/11/2026): a tela é da competência (de fábrica a do mês anterior, a que está sendo fechada); o Meu dia segue o vencimento
const E = {
  ano: comp0.ano, mes: comp0.mes, quem: 'eu', calMes: '',
  dados: null, carregando: false, erro: null, lidoEm: null, equipe: null,
  feitas: lerPref('gt.feitas', '0') === '1',
  q: '', grupos: new Set(), tipos: new Set(), sits: new Set(), cnpjs: {}, dia: '', abertas: new Set(), visivel: true,
  aba: (a => ABAS.includes(a) ? a : 'dia')(lerPref('gt.aba', 'dia')), soPendEmp: false, trilha: lerPref('gt.trilha', 'seq'), setor: '',
  fech: null, fechTarefas: [], setorPorId: null, fechCarregando: false, fechErro: null, fq: '', fsetor: '', fanal: '', soPend: false,
  empMap: new Map(), listaAtual: [],
  fest: '', ultimaAberta: '', dens: lerPref('gt.dens', 'conf')
};
// 0.87.0: nomes em CAIXA ALTA do Gestta ficam legíveis (siglas mantidas); a busca continua sem acento e sem diferenciar maiúsculas
const legivel = t => t ? Object.assign({}, t, { name: G.nomeLegivel(t.name), customer: t.customer ? Object.assign({}, t.customer, { name: G.nomeLegivel(t.customer.name) }) : t.customer }) : t;
// 0.103.0 (Josué, 12/11/2026): o nome da empresa vem com o final do CNPJ ("Cliente Alfa · 0001-90"), que separa matriz e filiais
const comCnpj = t => {
  const c = t && t.customer, cnpj = c && E.cnpjs[c._id];
  if (!cnpj || c.cnpj) return t;
  const fim = G.fimCnpj(cnpj);
  return Object.assign({}, t, { customer: Object.assign({}, c, { cnpj, nomeBase: c.name, name: fim ? c.name + ' · ' + fim : c.name }) });
};
function aplicarCnpjs() { if (!E.dados) return; E.dados.itens = (E.dados.itens || []).map(comCnpj); if (E.dados.dia) E.dados.dia = E.dados.dia.map(comCnpj); }
async function carregarCnpjs() {
  const todos = ((E.dados && E.dados.itens) || []).concat((E.dados && E.dados.dia) || []);
  const faltam = [...new Set(todos.map(t => t.customer && t.customer._id).filter(id => id && !(id in E.cnpjs)))];
  if (!faltam.length) return;
  const r = await enviar({ cmd: 'gesttaCnpjs', ids: faltam.slice(0, 3000) });
  if (!r || !r.ok) return;                                  // sem acesso à lista de clientes: fica só o nome
  faltam.forEach(id => { E.cnpjs[id] = (r.cnpjs || {})[id] || ''; });
  aplicarCnpjs(); desenhar();
}
const MES3 = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
// 0.87.0: voltar ao mesmo ponto quando a camada reabre (aba, competência, pessoa, filtros e rolagem), por 30 minutos, só nesta sessão do navegador
const SALVO = 'gt.estado';
function restaurar() {
  let v = null; try { v = JSON.parse(sessionStorage.getItem(SALVO) || 'null'); } catch (e) {}
  if (!v || Date.now() - (v.em || 0) > 30 * 60e3) return null;
  if (ABAS.includes(v.aba)) E.aba = v.aba;
  if (v.ano && v.mes) { E.ano = v.ano; E.mes = v.mes; }
  if (v.quem) E.quem = v.quem;
  E.q = v.q || ''; E.grupos = new Set(v.grupos || []); E.tipos = new Set(v.tipos || []); E.ultimaAberta = v.ultimaAberta || '';
  return v;
}
let tSalvar = 0;
function salvarEstado(agora) {
  clearTimeout(tSalvar);
  const gravar = () => { try { sessionStorage.setItem(SALVO, JSON.stringify({ em: Date.now(), aba: E.aba, ano: E.ano, mes: E.mes, quem: E.quem, q: E.q, grupos: [...E.grupos], tipos: [...E.tipos], ultimaAberta: E.ultimaAberta, rolagem: $('#vista') ? $('#vista').scrollTop : 0 })); } catch (e) {} };
  if (agora) gravar(); else tSalvar = setTimeout(gravar, 250);
}
const salvo = restaurar();
// as tarefas da busca ganham o setor quando o relatório do mês já está na memória (cruzando pelo id)
const comSetor = l => E.setorPorId ? l.map(t => Object.assign({}, t, { setor: E.setorPorId.get(t._id) || '' })) : l;
// 0.103.0: na visão de um setor, sai a tarefa cujo setor (do relatório) é outro; a que o relatório não conhece fica
const doSetor = l => { const s = E.quem && E.quem.startsWith('setor:') ? E.quem.slice(6) : ''; return s && E.setorPorId ? l.filter(t => !t.setor || t.setor === s) : l; };
const lista = () => doSetor(comSetor((E.dados && E.dados.itens) || []));
const listaDia = () => doSetor(comSetor((E.dados && E.dados.dia) || []));          // o que vence no mês corrente, de qualquer competência
const nomeMes = () => 'Competência ' + MESES[E.mes - 1] + ' de ' + E.ano;
const rotMes = () => '<small>Competência</small><b>' + MES3[E.mes - 1] + '/' + E.ano + '</b>';
// o mês de meta para as grades (calendário e linha do tempo): o escolhido no calendário ou onde mais tarefas da competência vencem
function mesDeMeta(tarefas) {
  const ms = G.mesesDeMeta(tarefas), esc = ms.find(m => G.mesTexto(m.ano, m.mes) === E.calMes);
  return esc || ms[0] || (E.mes === 12 ? { ano: E.ano + 1, mes: 1 } : { ano: E.ano, mes: E.mes + 1 });
}
const filtroAtivo = () => !!(E.q || E.grupos.size || E.tipos.size || E.sits.size || E.dia || E.setor || E.soPendEmp);
const paraPai = m => { if (m && m.controlGestta === 'abrirTarefa') { E.ultimaAberta = m.id; salvarEstado(true); } try { window.parent.postMessage(Object.assign({}, m), 'https://app.gestta.com.br'); } catch (e) {} };

/* ---------- leitura ---------- */
let pedido = 0;
async function ler(silencioso) {
  const meu = ++pedido;
  E.carregando = true; if (!silencioso) E.erro = null;
  aoVivo(); if (!E.dados || !silencioso) desenhar();
  const r = await enviar({ cmd: 'gesttaTarefas', ano: E.ano, mes: E.mes, quem: E.quem, desconsideradas: E.sits.has('desconsiderada') });
  if (meu !== pedido) return;                       // trocou de mês ou de pessoa no meio: vale a leitura mais nova
  E.carregando = false;
  if (r && r.ok) {
    r.itens = (r.itens || []).map(legivel); if (r.dia) r.dia = r.dia.map(legivel);
    E.dados = r; E.erro = null; E.lidoEm = r.lidoEm || new Date().toISOString(); aplicarCnpjs(); carregarCnpjs();
    if (setorDaVisao() && !E.setorPorId && !E.fechCarregando) lerFech(false);      // 0.103.0: o setor de cada tarefa sai do relatório
    if (r.perfil && r.perfil.total && !E.equipe) carregarEquipe();
    if (E.quem === 'eu' && r.dia) { const c = G.contarGrupos(r.dia, new Date()).n; paraPai({ controlGestta: 'contagem', atencao: c.multa + c.atrasada + c.hoje, multa: c.multa, atrasada: c.atrasada, hoje: c.hoje }); }
  } else { E.erro = r || { erro: 'sem resposta' }; if (!silencioso) E.dados = null; }
  aoVivo(); desenhar();
}
async function lerFech(forcar) {
  E.fechCarregando = true; E.fechErro = null; aoVivo(); desenhar();
  const r = await enviar({ cmd: 'gesttaFechamento', ano: E.ano, mes: E.mes, forcar: !!forcar });
  E.fechCarregando = false;
  if (r && r.ok) {
    E.fech = r; E.fechTarefas = G.tarefasDoRelatorio(r.colunas, r.linhas).map(legivel); E.setorPorId = new Map(E.fechTarefas.map(t => [t._id, t.setor]));
    if (forcar && r.daMemoria && r.podeEm > 0) toast('O relatório foi lido há menos de 1 hora: pode atualizar de novo em ' + r.podeEm + ' min.');
  } else E.fechErro = r || { erro: 'sem resposta' };
  aoVivo(); desenhar();
}
async function carregarEquipe() {
  const r = await enviar({ cmd: 'gesttaEquipe' });
  if (!r || !r.ok) return;
  E.equipe = (r.pessoas || []).map(p => Object.assign({}, p, { nome: G.nomeLegivel(p.nome) }));
  $('#gt-quem-wrap').hidden = false;
  quemRot();
}
// 0.87.0: "De quem" é um botão com o nome e uma lista com busca (iniciais de cada pessoa), no lugar da lista larga
const iniciais = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const setorDaVisao = () => E.quem.startsWith('setor:') ? E.quem.slice(6) : '';
const quemNome = () => E.quem === 'eu' ? 'Minhas' : E.quem === 'sem' ? 'Sem responsável' : setorDaVisao() ? 'Setor ' + setorDaVisao() : ((E.equipe || []).find(p => p.id === E.quem) || {}).nome || 'Outra pessoa';
function quemRot() { const b = $('#gt-quem-btn'); if (b) b.innerHTML = '<span class="gt-quem-av" aria-hidden="true">' + esc(E.quem === 'eu' ? 'Eu' : E.quem === 'sem' ? '—' : setorDaVisao() ? '▦' : iniciais(quemNome())) + '</span><span>' + esc(quemNome()) + '</span><svg class="ic ic-sm"><use href="#i-chev-d"/></svg>'; }
function quemLista(f) {
  const n = String(f || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  // 0.103.0: os setores primeiro (todas as tarefas de quem é do setor), depois as pessoas
  const setores = [...new Set((E.equipe || []).flatMap(p => p.setores || []).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map(s => ({ id: 'setor:' + s, nome: 'Setor ' + s + ' · todas as tarefas', av: '▦' }));
  const pessoas = [{ id: 'eu', nome: 'Minhas', av: 'Eu' }, { id: 'sem', nome: 'Sem responsável', av: '—' }].concat(setores,(E.equipe || []).filter(p => !E.dados || p.id !== E.dados.perfil.id).map(p => ({ id: p.id, nome: p.nome, av: iniciais(p.nome) })));
  const l = pessoas.filter(p => !n || p.nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(n));
  // 0.104.0: títulos separando os setores das pessoas
  const sec = rot => '<li class="gt-quem-sec" role="presentation">' + rot + '</li>';
  let jaSet = false, jaPes = false;
  $('#gt-quem-lista').innerHTML = l.length ? l.map(p => { let h = ''; if (p.id.startsWith('setor:') && !jaSet) { jaSet = true; h = sec('Setores'); } else if (!p.id.startsWith('setor:') && p.id !== 'eu' && p.id !== 'sem' && !jaPes) { jaPes = true; h = sec('Pessoas'); } return h + '<li><button type="button" role="option" data-quem="' + esc(p.id) + '" aria-selected="' + (E.quem === p.id) + '" class="' + (E.quem === p.id ? 'on' : '') + '"><span class="gt-quem-av" aria-hidden="true">' + esc(p.av) + '</span>' + esc(p.nome) + '</button></li>'; }).join('') : '<li class="fraco gt-quem-nada">Ninguém com esse nome</li>';
}
function quemAbrir(abrir) {
  const pop = $('#gt-quem-pop'), b = $('#gt-quem-btn'); if (!pop) return;
  pop.hidden = !abrir; b.setAttribute('aria-expanded', String(abrir));
  if (abrir) { $('#gt-quem-busca').value = ''; quemLista(''); setTimeout(() => $('#gt-quem-busca').focus(), 20); }
}
function trocarQuem(id) { if (!id || id === E.quem) { quemAbrir(false); return; } E.quem = id; E.abertas.clear(); quemAbrir(false); quemRot(); salvarEstado(); ler(); }

/* ---------- cabeçalho, trilho e "ao vivo" ---------- */
function aoVivo() {
  const el = $('#aovivo'), tx = $('#aovivo-tx');
  el.classList.remove('ok', 'parado', 'erro');
  $('#btn-atualizar').classList.toggle('girando', E.carregando);
  if (E.aba === 'envios') {   // 0.96.0
    const S = estadoEnvios(); $('#btn-atualizar').classList.toggle('girando', S.carregando);
    if (S.carregando) { tx.textContent = 'Lendo os envios…'; return; }
    if (S.erro) { el.classList.add('erro'); tx.textContent = 'Falha na leitura'; return; }
    if (!S.dados) { tx.textContent = 'Aguardando'; return; }
    const he = new Date(S.dados.lidoEm), hme = String(he.getHours()).padStart(2, '0') + ':' + String(he.getMinutes()).padStart(2, '0');
    el.classList.add('ok'); tx.textContent = simples() ? hme : 'Lido às ' + hme; el.title = 'Envios ao portal lidos às ' + hme; return;
  }
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
  $('#gt-mes-rot').innerHTML = rotMes(); $('#gt-mes-rot').setAttribute('aria-label', nomeMes() + ' (escolher outra)');
  const quem = quemNome();
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
const COR = { multa: 'multa', atrasada: 'atraso', impedimento: 'imped', hoje: 'hoje', proximas: 'prox', depois: 'depois', feita: 'feita', desconsiderada: 'desc' };
const PILL = { multa: 'pill-late', atrasada: 'pill-late', impedimento: 'pill-today', hoje: 'pill-today', feita: 'pill-ok' };
function anel(pct, tam) {
  const r = (tam - 10) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, pct));
  return '<svg class="gt-anel" width="' + tam + '" height="' + tam + '" viewBox="0 0 ' + tam + ' ' + tam + '" aria-hidden="true"><circle cx="' + tam / 2 + '" cy="' + tam / 2 + '" r="' + r + '" class="gt-anel-fundo"/><circle cx="' + tam / 2 + '" cy="' + tam / 2 + '" r="' + r + '" class="gt-anel-valor" stroke-dasharray="' + (c * v / 100).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 ' + tam / 2 + ' ' + tam / 2 + ')"/></svg>';
}
// rótulos curtos das situações no topo (o nome inteiro e a explicação ficam na dica)
const SIT_CURTO = { multa: 'Multa', atrasada: 'Atrasadas', impedimento: 'Impedimento', hoje: 'Hoje', proximas: 'Próximos dias', depois: 'Mais adiante', feita: 'Concluídas' };
// Topo das abas de trabalho (0.77.0): progresso do mês, as situações (que filtram), a busca e o menu Filtros, numa faixa só.
function topoHtml(c) {
  const agora = c.n.multa + c.n.atrasada, agoraOn = E.grupos.has('multa') && E.grupos.has('atrasada');
  const sitAgora = (agora || agoraOn) ? '<button type="button" class="gt-sit gt-sit-agora gt-c-multa' + (agoraOn ? ' on' : '') + '" data-grupo="agora" aria-pressed="' + agoraOn + '" title="' + esc('Resolver agora: ' + c.n.multa + ' gerando multa e ' + c.n.atrasada + ' com a meta vencida') + '"><span class="gt-sit-ic" aria-hidden="true">!</span>Resolver agora<b>' + num(agora) + '</b></button>' : '';
  const sit = gr => (gr.k === 'multa' || gr.k === 'atrasada') ? '' : (c.n[gr.k] || E.grupos.has(gr.k)) ? '<button type="button" class="gt-sit gt-c-' + COR[gr.k] + (E.grupos.has(gr.k) ? ' on' : '') + '" data-grupo="' + gr.k + '" aria-pressed="' + E.grupos.has(gr.k) + '" title="' + esc(gr.rot + ': ' + gr.dica) + '"><i class="gt-ponto"></i>' + esc(SIT_CURTO[gr.k] || gr.rot) + '<b>' + num(c.n[gr.k]) + '</b></button>' : '';
  const tipo = k => '<button type="button" class="gt-chip' + (E.tipos.has(k) ? ' on' : '') + '" data-tipo="' + k + '" aria-pressed="' + E.tipos.has(k) + '">' + esc(G.TIPOS_TAREFA[k]) + '</button>';
  const sitChip = s => '<button type="button" class="gt-chip' + (E.sits.has(s.k) ? ' on' : '') + '" data-sit="' + s.k + '" aria-pressed="' + E.sits.has(s.k) + '">' + esc(s.rot) + '</button>';
  const nf = E.tipos.size + (E.setor ? 1 : 0) + (E.soPendEmp && (E.aba === 'empresas' || E.aba === 'quadro') ? 1 : 0) + (E.feitas && (E.aba === 'lista' || E.aba === 'calendario') ? 1 : 0);
  return '<div class="gt-topo">' +
    '<div class="gt-topo-prog" title="' + num(c.feitas) + ' de ' + num(c.total) + (E.aba === 'dia' ? ' tarefas com meta neste mês' : ' tarefas da competência') + ' concluídas">' + anel(c.pctFeitas, 52) + '<span><b>' + c.pctFeitas + '%</b><small>' + num(c.feitas) + ' de ' + num(c.total) + ' concluídas</small></span></div>' +
    '<div class="gt-sits" role="group" aria-label="Filtrar pela situação">' + sitAgora + G.GRUPOS.map(sit).join('') + '</div>' +
    '<div class="gt-topo-dir">' +
      '<label class="gt-busca"><svg class="ic"><use href="#i-search"/></svg><input type="search" id="gt-q" placeholder="Buscar tarefa, empresa ou código" autocomplete="off" aria-label="Buscar tarefa, empresa ou código" value="' + esc(E.q) + '"><kbd>/</kbd></label>' +
      '<details class="menu gt-filtros" id="gt-filtros"><summary class="btn btn-sm' + (nf ? ' filtro-on' : '') + '"><svg class="ic ic-sm"><use href="#i-filter"/></svg>Filtros' + (nf ? ' <span class="menu-n">' + nf + '</span>' : '') + '</summary>' +
        '<div class="menu-list form gt-filtros-menu"><span class="gt-f-rot">Tipo</span><div class="gt-chips" role="group" aria-label="Tipo">' + Object.keys(G.TIPOS_TAREFA).map(tipo).join('') + '</div>' +
          setorSelHtml() +
          (E.aba === 'empresas' || E.aba === 'quadro' ? '<label class="gt-feitas"><input type="checkbox" id="gt-pend-emp"' + (E.soPendEmp ? ' checked' : '') + '> Só empresas com pendência</label>' : '') +
          (E.aba === 'lista' || E.aba === 'calendario' ? '<label class="gt-feitas"><input type="checkbox" id="gt-feitas"' + (E.feitas ? ' checked' : '') + '> Mostrar concluídas</label>' : '') +
          '<span class="gt-f-rot">Densidade</span><div class="seg gt-modos" role="group" aria-label="Densidade"><button type="button" class="' + (E.dens !== 'compacta' ? 'on' : '') + '" data-dens="conf" aria-pressed="' + (E.dens !== 'compacta') + '">Confortável</button><button type="button" class="' + (E.dens === 'compacta' ? 'on' : '') + '" data-dens="compacta" aria-pressed="' + (E.dens === 'compacta') + '">Compacta</button></div>' +
        '</div></details>' +
      (filtroAtivo() ? '<button type="button" class="btn btn-sm gt-limpar" id="gt-limpar"><svg class="ic ic-sm"><use href="#i-x"/></svg>Limpar</button>' : '') +
    '</div></div>' +
    // 0.104.0 (Josué, 12/11/2026): a situação no Gestta à vista, numa faixa logo abaixo; nenhuma marcada = como sempre
    '<div class="gt-sitbar" role="group" aria-label="Situação no Gestta"><span class="gt-f-rot">Situação no Gestta</span><div class="gt-chips">' + G.SITUACOES_FILTRO.map(sitChip).join('') + '</div>' +
      '<span class="gt-sitbar-dica">' + (E.sits.size ? 'mostrando só ' + G.SITUACOES_FILTRO.filter(s => E.sits.has(s.k)).map(s => s.rot.toLowerCase()).join(', ') : 'nenhuma marcada: abertas e com impedimento' + (E.feitas || E.aba !== 'lista' && E.aba !== 'calendario' ? ', e as concluídas' : '')) + '</span></div>';
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
  const k = G.grupoTela(t, hoje), c = t.customer || {};
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

// 0.87.0: carregando com o esqueleto da tela (os contornos no lugar), em vez de só um texto
const esqueleto = rot => '<div class="gt-esq-tela" role="status" aria-label="' + esc(rot) + '"><div class="gt-esq-topo"><i class="r"></i><i></i><i></i><i></i><i></i></div><div class="gt-esq-corpo"><div class="gt-esq-col">' + '<i></i>'.repeat(7) + '</div><div class="gt-esq-col gt-esq-lado"><i></i><i></i><i></i></div></div><span class="sr">' + esc(rot) + '</span></div>';
/* ---------- desenho ---------- */
function abas() {
  $$('#abas [data-aba]').forEach(b => { const on = b.dataset.aba === E.aba; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
  const qw = $('#gt-quem-wrap'); if (qw) qw.classList.toggle('gt-so-minhas', E.aba === 'fech' || E.aba === 'envios');
}
function desenhar() {
  abas();
  if (E.aba === 'fech') return desenharFech();
  if (E.aba === 'envios') {   // 0.96.0: Envios ao portal (lidos na hora, só na memória da tela)
    const S = estadoEnvios(); desenharEnvios($('#vista'), t => { $('#subtitulo').textContent = t; });
    if (!S.dados && !S.carregando && !S.erro) lerEnvios(enviar, () => { aoVivo(); desenhar(); });
    return;
  }
  const v = $('#vista'), topo = v.scrollTop;
  if (!E.dados) {
    cabecalho(null);
    if (E.erro) {
      v.innerHTML = '<div class="faixa"><svg class="ic"><use href="#i-alert"/></svg><div style="flex:1;min-width:240px"><b>' + (E.erro.semSessao ? 'Sem sessão no Gestta.' : E.erro.semAba ? 'Nenhuma aba do Gestta.' : 'Não consegui ler as tarefas.') + '</b> ' + esc(E.erro.erro || '') + '</div><button class="btn btn-sm" id="gt-tentar">Tentar de novo</button></div>';
      $('#gt-tentar').onclick = () => ler();
    } else v.innerHTML = esqueleto('Lendo as tarefas no Gestta…');
    return;
  }
  const hoje = new Date(), todos = E.aba === 'dia' && E.dados.dia ? listaDia() : lista(), c = G.contarGrupos(todos, hoje), vm = mesDeMeta(lista());
  cabecalho(c);
  const f = { q: E.q, grupos: [...E.grupos], tipos: [...E.tipos], situacoes: [...E.sits], feitas: E.aba === 'lista' || E.aba === 'calendario' ? E.feitas : true, dia: E.aba === 'calendario' ? E.dia : '', setor: E.setor };
  const filtrados = G.filtrarTarefas(todos, f, hoje);
  const base = G.filtrarTarefas(todos, Object.assign({}, f, { dia: '', feitas: true }), hoje);
  const aviso = (E.erro ? '<div class="faixa"><svg class="ic"><use href="#i-alert"/></svg><div><b>A última atualização falhou.</b> ' + esc(E.erro.erro || '') + ' Mostrando a leitura anterior.</div></div>' : '') +
    ((E.aba === 'dia' ? E.dados.diaCortado : E.dados.cortado) ? '<div class="faixa"><svg class="ic"><use href="#i-alert"/></svg><div><b>Lista cortada.</b> Passou de ' + num(G.MAX_PAGINAS_TAREFAS * G.LIMITE_BUSCA) + ' tarefas: a tela mostra as primeiras. Escolha uma pessoa para ver tudo dela.</div></div>' : '') +
    (E.aba === 'dia' && !E.dados.dia ? '<div class="faixa"><svg class="ic"><use href="#i-alert"/></svg><div><b>Não consegui ler as metas deste mês</b>' + (E.dados.diaErro ? ': ' + esc(E.dados.diaErro) : '') + '. O Meu dia mostra as tarefas da competência escolhida.</div></div>' : '') +
    (E.quem !== 'eu' ? '<p class="gt-outra">Vendo ' + (E.quem === 'sem' ? 'as tarefas <b>sem responsável</b>' : setorDaVisao() ? 'todas as tarefas do setor <b>' + esc(setorDaVisao()) + '</b>' + (E.dados.setorPessoas ? ' (' + plural(E.dados.setorPessoas, 'pessoa', 'pessoas') + ')' : '') + (E.setorPorId ? '' : E.fechCarregando ? ', separando pelo setor…' : ', inclusive as de outro setor de quem está em mais de um') : 'as tarefas de <b>' + esc(quemNome()) + '</b>') + '. <button type="button" class="linkish" id="gt-voltar-eu">Voltar às minhas</button></p>' : '');
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
  if (rolarSalvo != null) { v.scrollTop = rolarSalvo; rolarSalvo = null; }
  salvarEstado();
  if (foco) { const q = $('#gt-q'); q.focus(); try { q.setSelectionRange(foco[0], foco[1]); } catch (e) {} }
  ligar(v);
}
let rolarSalvo = salvo && salvo.rolagem ? salvo.rolagem : null;
// 0.87.0: ao reabrir a camada, a tarefa aberta no Gestta pisca na tela
function destacarUltima() {
  if (!E.ultimaAberta) return;
  const el = document.querySelector('[data-id="' + CSS.escape(E.ultimaAberta) + '"], [data-et="' + CSS.escape(E.ultimaAberta) + '"]');
  if (!el) return;
  el.scrollIntoView({ block: 'nearest' }); el.classList.remove('gt-flash'); void el.offsetWidth; el.classList.add('gt-flash');
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
  $('#gt-mes-rot').innerHTML = rotMes(); $('#gt-mes-rot').setAttribute('aria-label', nomeMes() + ' (escolher outra)');
  if (!E.fech) {
    $('#subtitulo').textContent = 'Fechamento da competência';
    if (E.fechErro) { v.innerHTML = '<div class="faixa"><svg class="ic"><use href="#i-alert"/></svg><div style="flex:1;min-width:240px"><b>Não consegui ler o fechamento da competência.</b> ' + esc(E.fechErro.erro || '') + '</div><button class="btn btn-sm" id="gt-fech-tentar">Tentar de novo</button></div>'; $('#gt-fech-tentar').onclick = () => lerFech(true); }
    else { v.innerHTML = esqueleto('Lendo o fechamento da competência no Gestta…') + '<p class="fraco gt-esq-nota">São todas as tarefas da competência de todas as empresas que o seu acesso alcança, com o relatório de cada mês em que elas vencem: pode levar alguns minutos. Depois fica na memória do Chrome e atualiza no máximo 1 vez por hora.</p>'; if (!E.fechCarregando) lerFech(false); }
    return;
  }
  const hoje = new Date(), todos = E.fechTarefas, geral = G.fechamento(todos, hoje);
  const FEST = { abertas: g => g !== 'feita', multa: g => g === 'multa', atrasada: g => g === 'atrasada', impedimento: g => g === 'impedimento' };
  const filtradas = G.filtrarTarefas(todos, { q: E.fq, setor: E.fsetor, analista: E.fanal, feitas: true }, hoje).filter(t => !FEST[E.fest] || FEST[E.fest](G.grupoTarefa(t, hoje))), L = G.fechamento(filtradas, hoje);
  const emps = E.soPend ? L.empresas.filter(e => !e.fechada) : L.empresas;
  E.empMap = new Map(emps.map(e => [e.id, e.tarefas]));
  const t = L.total, filtro = !!(E.fq || E.fsetor || E.fanal || E.soPend || E.fest);
  $('#subtitulo').textContent = 'Fechamento da competência · ' + plural(L.empresas.length, 'empresa', 'empresas') + ' · ' + t.pct + '% fechado';
  // 0.87.0: os cartões filtram a lista (clique de novo para tirar)
  const kpi = (n, rot, cls, f) => '<button type="button" class="gt-kpi gt-kpi-est ' + (cls || '') + ((f === 'pend' ? E.soPend : E.fest === f) ? ' on' : '') + '" data-fest="' + f + '" aria-pressed="' + (f === 'pend' ? E.soPend : E.fest === f) + '" title="Mostrar só estas"><b>' + num(n) + '</b><span>' + rot + '</span></button>';
  const avisos = (E.fech.parcial ? '<div class="faixa gt-faixa-info"><svg class="ic"><use href="#i-lock"/></svg><div><b>Você vê só o que o Gestta libera para o seu acesso</b> (' + esc(E.fech.perfil.papelNome) + (E.fech.perfil.setores.length ? ': ' + esc(E.fech.perfil.setores.map(x => x.nome).join(', ')) : '') + '). Não é o fechamento do escritório todo.</div></div>' : '') +
    (geral.desconhecidas ? '<div class="faixa"><svg class="ic"><use href="#i-alert"/></svg><div><b>' + plural(geral.desconhecidas, 'tarefa veio', 'tarefas vieram') + ' com situação desconhecida</b> e não entram na conta. O Gestta pode ter mudado o relatório: avise o Josué.</div></div>' : '');
  v.innerHTML = avisos +
    '<section class="gt-hero cfg-card"><div class="gt-prog">' + anel(t.pct, simples() ? 76 : 96) + '<div class="gt-prog-tx"><b>' + t.pct + '%</b><span>' + num(t.feitas) + ' de ' + num(t.total) + ' tarefas concluídas</span><small>' + num(L.fechadas) + ' de ' + num(L.empresas.length) + ' empresas com a competência fechada</small></div></div>' +
      '<div class="gt-kpis">' + kpi(geral.total.abertas, 'abertas', 'gt-c-prox', 'abertas') + kpi(geral.total.multa, 'gerando multa', 'gt-c-multa', 'multa') + kpi(geral.total.atrasada, 'atrasadas', 'gt-c-atraso', 'atrasada') + kpi(geral.total.impedimento, 'com impedimento', 'gt-c-imped', 'impedimento') + kpi(geral.empresas.length - geral.fechadas, 'empresas com pendência', 'gt-c-depois', 'pend') + '</div></section>' +
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
  const fl = $('#gt-flimpar', v); if (fl) fl.onclick = () => { E.fq = ''; E.fsetor = ''; E.fanal = ''; E.soPend = false; E.fest = ''; desenhar(); };
  $$('[data-fest]', v).forEach(b => b.onclick = () => { const f = b.dataset.fest; if (f === 'pend') E.soPend = !E.soPend; else E.fest = E.fest === f ? '' : f; desenhar(); });
  if (foco === 'gt-fq') { const n = $('#gt-fq'); if (n) n.focus(); }
}
function ligar(v) {
  $$('[data-dens]', v).forEach(b => b.onclick = () => { E.dens = b.dataset.dens; gravarPref('gt.dens', E.dens); document.documentElement.dataset.densidade = E.dens; desenhar(); });
  $$('[data-grupo="agora"]', v).forEach(b => b.onclick = () => { const on = E.grupos.has('multa') && E.grupos.has('atrasada'); ['multa', 'atrasada'].forEach(k => on ? E.grupos.delete(k) : E.grupos.add(k)); desenhar(); });
  $$('[data-grupo]:not([data-grupo="agora"])', v).forEach(b => b.onclick = () => { const k = b.dataset.grupo; if (E.grupos.has(k)) E.grupos.delete(k); else E.grupos.add(k); if (k === 'feita' && E.grupos.has('feita')) E.feitas = true; desenhar(); });
  // 0.103.0: situação no Gestta; a desconsiderada só é lida quando pedida (liga ou desliga = lê de novo)
  $$('[data-sit]', v).forEach(b => b.onclick = () => { const k = b.dataset.sit; if (E.sits.has(k)) E.sits.delete(k); else E.sits.add(k); if (k === 'desconsiderada') ler(); else desenhar(); });
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
  const lp = $('#gt-limpar', v); if (lp) lp.onclick = () => { const rele = E.sits.has('desconsiderada'); E.q = ''; E.grupos.clear(); E.tipos.clear(); E.sits.clear(); if (rele) ler(); E.dia = ''; E.setor = ''; E.soPendEmp = false; desenhar(); };
  const ds = $('#gt-dia-sair', v); if (ds) ds.onclick = () => { E.dia = ''; desenhar(); };
  const ve = $('#gt-voltar-eu', v); if (ve) ve.onclick = () => trocarQuem('eu');
}

/* ---------- tema e início ---------- */
const temaAtual = () => document.documentElement.getAttribute('data-theme') || 'light';
const iconeTema = () => { const d = temaAtual() === 'dark'; $('#btn-tema use').setAttribute('href', d ? '#i-sun' : '#i-moon'); $('#tema-tx').textContent = d ? 'Tema claro' : 'Tema escuro'; };
$('#btn-config').onclick = () => enviar({ cmd: 'abrirConfig' }).then(r => { if (!r || !r.ok) toast((r && r.erro) || 'Não foi possível abrir as Configurações', true); });   // 0.90.0: a mesma guia das Configurações do Onvio
$('#btn-tema').onclick = () => { const n = temaAtual() === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', n); try { localStorage.setItem('controlonvio-theme', n); } catch (e) {} iconeTema(); };
$('#btn-ver-gestta').onclick = () => paraPai({ controlGestta: 'fechar' });
// 0.92.0: tema e estilo mudados na guia de Configurações valem aqui na hora, com um aviso
let avisoCfg = 0;
addEventListener('storage', e => {
  if (e.key === 'controlonvio-theme' && e.newValue) document.documentElement.setAttribute('data-theme', e.newValue === 'dark' ? 'dark' : 'light');
  else if (e.key === 'controlonvio-estilo' && e.newValue) document.documentElement.setAttribute('data-estilo', e.newValue === 'atual' ? 'atual' : 'simples');
  else return;
  iconeTema(); desenhar();
  clearTimeout(avisoCfg); avisoCfg = setTimeout(() => toast('Configurações atualizadas: já valem nesta tela'), 400);
});
$('#vista').addEventListener('scroll', () => salvarEstado(), { passive: true });
$('#btn-atualizar').onclick = () => E.aba === 'fech' ? lerFech(true) : E.aba === 'envios' ? lerEnvios(enviar, () => { aoVivo(); desenhar(); }) : ler();
ligarEnvios($('#vista'), () => { aoVivo(); desenhar(); }, paraPai);
// 0.102.0: soltar documentos fora de um item da tarefa vai para o Express (e, se ele não achar, a sugestão da extensão)
ligarSoltar({ enviar, atual: () => painelTarefa() || null, tarefas: () => ((E.dados && E.dados.itens) || []).concat((E.dados && E.dados.dia) || []) });
function trocarAba(a) { if (!ABAS.includes(a) || a === E.aba) return; E.aba = a; gravarPref('gt.aba', E.aba); salvarEstado(); fecharPainel(); aoVivo(); desenhar(); $('#vista').scrollTop = 0; }
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
const trocouMes = () => { salvarEstado(); E.dia = ''; E.calMes = ''; E.fech = null; E.fechTarefas = []; E.setorPorId = null; E.setor = ''; E.fechErro = null; fecharPainel(); ler(); if (E.aba === 'fech') desenhar(); };
$('#gt-mes-ant').onclick = () => { E.mes--; if (E.mes < 1) { E.mes = 12; E.ano--; } trocouMes(); };
$('#gt-mes-prox').onclick = () => { E.mes++; if (E.mes > 12) { E.mes = 1; E.ano++; } trocouMes(); };
// 0.87.0: clicar na competência abre a grade dos 12 meses (com o ano) e o atalho "Em fechamento"
let anoPop = E.ano;
function mesPop() {
  const atual = G.competenciaPadrao(new Date());
  $('#gt-mes-pop').innerHTML = '<div class="gt-mp-cab"><button type="button" class="icon-btn" data-mp-ano="-1" aria-label="Ano anterior"><svg class="ic"><use href="#i-chev-l"/></svg></button><b>' + anoPop + '</b><button type="button" class="icon-btn" data-mp-ano="1" aria-label="Próximo ano"><svg class="ic"><use href="#i-chev-r"/></svg></button></div>' +
    '<div class="gt-mp-grade">' + MES3.map((m, i) => { const on = anoPop === E.ano && i + 1 === E.mes, fech = anoPop === atual.ano && i + 1 === atual.mes; return '<button type="button" class="' + (on ? 'on' : '') + (fech ? ' fech' : '') + '" data-mp-mes="' + (i + 1) + '" aria-pressed="' + on + '" aria-label="' + MESES[i] + ' de ' + anoPop + (fech ? ' (em fechamento)' : '') + '">' + m + '</button>'; }).join('') + '</div>' +
    '<button type="button" class="btn btn-sm gt-mp-atual" data-mp-atual="1">Em fechamento: ' + MES3[atual.mes - 1] + '/' + atual.ano + '</button>';
}
function mesAbrir(abrir) { const pop = $('#gt-mes-pop'); pop.hidden = !abrir; $('#gt-mes-rot').setAttribute('aria-expanded', String(abrir)); if (abrir) { anoPop = E.ano; mesPop(); setTimeout(() => { const b = pop.querySelector('[data-mp-mes].on') || pop.querySelector('[data-mp-mes]'); if (b) b.focus(); }, 20); } }
$('#gt-mes-rot').onclick = () => mesAbrir($('#gt-mes-pop').hidden);
$('#gt-mes-pop').addEventListener('click', e => {
  const a = e.target.closest('[data-mp-ano]'); if (a) { anoPop += Number(a.dataset.mpAno); mesPop(); return; }
  const m = e.target.closest('[data-mp-mes]'); if (m) { E.ano = anoPop; E.mes = Number(m.dataset.mpMes); mesAbrir(false); trocouMes(); return; }
  if (e.target.closest('[data-mp-atual]')) { const c = G.competenciaPadrao(new Date()); E.ano = c.ano; E.mes = c.mes; mesAbrir(false); trocouMes(); }
});
$('#gt-quem-btn').onclick = () => quemAbrir($('#gt-quem-pop').hidden);
$('#gt-quem-busca').oninput = e => quemLista(e.target.value);
$('#gt-quem-busca').onkeydown = e => { if (e.key === 'Enter') { const b = $('#gt-quem-lista [data-quem]'); if (b) trocarQuem(b.dataset.quem); } };
$('#gt-quem-lista').addEventListener('click', e => { const b = e.target.closest('[data-quem]'); if (b) trocarQuem(b.dataset.quem); });
document.addEventListener('click', e => {
  if (!$('#gt-mes-pop').hidden && !e.target.closest('#gt-mes-pop, #gt-mes-rot')) mesAbrir(false);
  if (!$('#gt-quem-pop').hidden && !e.target.closest('#gt-quem-pop, #gt-quem-btn')) quemAbrir(false);
});
// 0.87.0: a ajuda dos atalhos (tecla ?)
function atalhos(abrir) { const d = $('#gt-atalhos'); d.hidden = !abrir; if (abrir) setTimeout(() => $('#gt-atalhos-fechar').focus(), 20); }
$('#btn-atalhos').onclick = () => atalhos(true);
$('#gt-atalhos-fechar').onclick = () => atalhos(false);
$('#gt-atalhos').addEventListener('click', e => { if (e.target.id === 'gt-atalhos') atalhos(false); });
addEventListener('keydown', e => {
  const digitando = e.target.matches('input, select, textarea');
  if (!$('#gt-atalhos').hidden) { if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); atalhos(false); } return; }
  if (e.key === 'Escape' && !$('#gt-mes-pop').hidden) { e.preventDefault(); mesAbrir(false); $('#gt-mes-rot').focus(); return; }
  if (e.key === 'Escape' && !$('#gt-quem-pop').hidden) { e.preventDefault(); quemAbrir(false); $('#gt-quem-btn').focus(); return; }
  if (e.key === '?' && !digitando) { e.preventDefault(); atalhos(true); return; }
  if (painelAberto()) { if (e.key === 'Escape') { e.preventDefault(); fecharPainel(); return; } if (!digitando && e.key === 'ArrowLeft') { passarPainel(-1); return; } if (!digitando && e.key === 'ArrowRight') { passarPainel(1); return; } }
  if (e.key === '/' && !digitando) { const q = $('#gt-q') || $('#gt-fq'); if (q) { e.preventDefault(); q.focus(); } return; }
  if (!digitando && !e.ctrlKey && !e.metaKey && !e.altKey && teclaVista && E.aba !== 'fech' && E.aba !== 'envios' && teclaVista(e)) { e.preventDefault(); return; }
  const n = '1234567'.indexOf(e.key);
  if (!digitando && n >= 0 && !e.ctrlKey && !e.metaKey && !e.altKey) { trocarAba(ABAS[n]); return; }
  if (e.key === 'Escape') { if (digitando && e.target.id === 'gt-q' && E.q) { E.q = ''; desenhar(); return; } if (!digitando) paraPai({ controlGestta: 'fechar' }); }
});
// A camada avisa quando aparece ou some: só relê sozinho com ela visível.
addEventListener('message', e => {
  if (e.source !== window.parent || e.origin !== 'https://app.gestta.com.br') return;
  const d = e.data || {};
  if (d.controlGestta === 'visivel') { E.visivel = true; setTimeout(destacarUltima, 120); if (!E.carregando && (!E.lidoEm || Date.now() - new Date(E.lidoEm) > 60e3)) ler(true); }
  else if (d.controlGestta === 'oculto') E.visivel = false;
});
setInterval(() => { if (E.visivel && !E.carregando && document.visibilityState === 'visible') ler(true); }, ATUALIZA_MIN * 60e3);
setInterval(aoVivo, 30e3);
// 0.93.0: depois de uma ação no painel (etapa, concluir, impedimento, comentário, documento), a lista é relida em silêncio
addEventListener('gt-tarefa-mudou', () => { if (!E.carregando) ler(true); });
document.documentElement.dataset.densidade = E.dens;
quemRot();
iconeTema();
ler().then(() => setTimeout(destacarUltima, 150));

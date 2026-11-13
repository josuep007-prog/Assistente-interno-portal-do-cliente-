/* Tarefas do Gestta · aba Saúde da operação (0.110.0, Josué 13/11/2026: uma sessão para compensar o que o Gestta não mostra:
   falhas de e-mail ao cliente, tarefa que avisa o cliente sem contato no setor, a carga por dia que mostra quando não vai dar
   tempo e o que vem primeiro, e, para a coordenação, a configuração das tarefas de cada empresa pela demanda).
   Tudo só leitura (cmd gesttaSaude). As tarefas vêm do relatório do mês (o mesmo do Fechamento); contatos, e-mails e configuração
   só são lidos pelo botão de cada bloco, um por vez, e ficam só na memória desta tela. A coordenação vê tudo; o analista vê só as
   tarefas dele e não vê o bloco da configuração. A capacidade manual de cada pessoa fica só neste navegador (oc.gt.cap, só números). */
import { $, esc, num, plural, simples, toast, lerPref, gravarPref, copiarTexto } from './util.js';
import { abrirPainel } from './gestta-trilha.js';
import { LOTE, marcarGrupo, barraGrupo, ligarGrupo, grupoEmLote } from './gestta-lote.js';

const G = window.OCG;
const S = { dados: null, tarefas: [], carregando: false, erro: null, feriados: null,
  contatos: {}, lendoCont: null, erroCont: '', emails: {}, lendoEm: null, erroEm: '', config: null, porTemplate: {}, lendoCfg: null, erroCfg: '',
  fechados: new Set(lerPref('gt.saude.fechados', '').split(',').filter(Boolean)), cel: null, cap: lerCap(), editCap: false, extra: '' };
let enviarFn = null, aoMudar = () => {}, paraPaiFn = () => {};
const pausa = ms => new Promise(r => setTimeout(r, ms));
function lerCap() { try { const o = JSON.parse(lerPref('gt.cap', '{}')); const out = {}; for (const k of Object.keys(o || {})) { const n = Number(o[k]); if (n > 0 && n < 1000) out[k] = n; } return out; } catch (e) { return {}; } }
const nome = (t) => G.nomeLegivel ? G.nomeLegivel(t) : t;
const ic = (n) => '<svg class="ic ic-sm" aria-hidden="true"><use href="#i-' + n + '"/></svg>';
const p2 = n => String(n).padStart(2, '0');
const ddmm = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? m[3] + '/' + m[2] : ''; };
const SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const diaSem = k => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(k); return m ? SEM[new Date(+m[1], +m[2] - 1, +m[3]).getDay()] : ''; };
const cnpjFmt = c => String(c || '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

export function estadoSaude() { return S; }
async function feriados() {
  if (S.feriados) return S.feriados;
  try {
    const st = await chrome.storage.local.get(['settings', 'regrasEscritorio']);
    const cfg = window.OC && OC.combinarSettings ? OC.combinarSettings(st.regrasEscritorio, st.settings) : null;
    S.feriados = new Set((cfg && cfg.feriados) || (window.OC && OC.DEFAULTS && OC.DEFAULTS.feriados) || []);
  } catch (e) { S.feriados = new Set((window.OC && OC.DEFAULTS && OC.DEFAULTS.feriados) || []); }
  return S.feriados;
}
export async function lerSaude(enviar, redesenhar, forcar) {
  enviarFn = enviar; aoMudar = redesenhar || aoMudar;
  S.carregando = true; S.erro = null; aoMudar();
  await feriados();
  const r = await enviar({ cmd: 'gesttaSaude', parte: 'tarefas', forcar: !!forcar });
  S.carregando = false;
  if (r && r.ok) { S.dados = r; S.tarefas = G.tarefasDoRelatorio(r.colunas, r.linhas).map(t => Object.assign(t, { name: nome(t.name), customer: Object.assign({}, t.customer, { name: nome(t.customer.name) }) })); }
  else S.erro = r || { erro: 'sem resposta' };
  aoMudar();
}

/* ---------- leituras sob demanda (uma por vez, com o andamento na tela) ---------- */
const hojeD = () => new Date();
// clientes cujas tarefas avisam o cliente e ainda contam: abertas, ou concluídas nos últimos 30 dias
function clientesQueAvisam() {
  const lim = new Date(); lim.setDate(lim.getDate() - 30);
  const l = S.tarefas.filter(t => t.notifica === true && (t.status === 'OPEN' || t.status === 'IMPEDIMENT' || (t.status === 'DONE' && t.conclusion_date && new Date(t.conclusion_date) >= lim)));
  return { tarefas: l, cnpjs: [...new Set(l.map(t => String(t.customer.cnpj || '').replace(/\D/g, '')).filter(c => c.length === 14))] };
}
async function lerContatos() {
  const { cnpjs } = clientesQueAvisam(), faltam = cnpjs.filter(c => !(c in S.contatos));
  S.lendoCont = { feitos: cnpjs.length - faltam.length, total: cnpjs.length }; S.erroCont = ''; aoMudar();
  for (let i = 0; i < faltam.length; i += 20) {
    const r = await enviarFn({ cmd: 'gesttaSaude', parte: 'contatos', cnpjs: faltam.slice(i, i + 20) });
    if (!r || !r.ok) { S.erroCont = (r && r.erro) || 'sem resposta'; break; }
    Object.assign(S.contatos, r.porCnpj || {});
    S.lendoCont.feitos = Math.min(S.lendoCont.total, S.lendoCont.feitos + faltam.slice(i, i + 20).length); aoMudar();
  }
  S.lendoCont = null; aoMudar();
}
const MAX_EMAILS = 150;
async function lerEmails() {
  const l = G.tarefasParaEmail(S.tarefas, hojeD(), 7).slice(0, MAX_EMAILS), faltam = l.filter(t => !(t._id in S.emails));
  S.lendoEm = { feitos: l.length - faltam.length, total: l.length }; S.erroEm = ''; aoMudar();
  for (let i = 0; i < faltam.length; i += 10) {
    const pedaco = faltam.slice(i, i + 10);
    const r = await enviarFn({ cmd: 'gesttaSaude', parte: 'emails', ids: pedaco.map(t => t._id) });
    if (r && r.porTarefa) for (const [id, ev] of Object.entries(r.porTarefa)) S.emails[id] = ev ? G.vereditoEmail(ev) : { v: 'erro', rot: 'Não consegui ler o histórico' };
    if (!r || !r.ok) { S.erroEm = (r && r.erro) || 'sem resposta'; break; }
    S.lendoEm.feitos += pedaco.length; aoMudar();
  }
  S.lendoEm = null; aoMudar();
}
async function lerConfig() {
  S.lendoCfg = { feitos: 0, total: 0, fase: 'templates' }; S.erroCfg = ''; aoMudar();
  const r = await enviarFn({ cmd: 'gesttaSaude', parte: 'config' });
  if (!r || !r.ok) { S.erroCfg = (r && r.erro) || 'sem resposta'; S.lendoCfg = null; aoMudar(); return; }
  S.config = { templates: r.templates || [], clientes: Object.fromEntries((r.clientes || []).map(c => [c.id, c])) };
  const faltam = S.config.templates.map(t => t.id).filter(id => !(id in S.porTemplate));
  S.lendoCfg = { feitos: S.config.templates.length - faltam.length, total: S.config.templates.length, fase: 'empresas' }; aoMudar();
  for (let i = 0; i < faltam.length; i += 20) {
    const x = await enviarFn({ cmd: 'gesttaSaude', parte: 'configClientes', ids: faltam.slice(i, i + 20) });
    if (x && x.porTemplate) Object.assign(S.porTemplate, x.porTemplate);
    if (!x || !x.ok) { S.erroCfg = (x && x.erro) || 'sem resposta'; break; }
    S.lendoCfg.feitos += faltam.slice(i, i + 20).length; aoMudar();
  }
  S.lendoCfg = null; aoMudar();
}

/* ---------- desenho ---------- */
const barra = (a) => a ? '<div class="gsa-prog" role="progressbar" aria-valuemin="0" aria-valuemax="' + a.total + '" aria-valuenow="' + a.feitos + '"><span style="width:' + (a.total ? Math.round(a.feitos * 100 / a.total) : 0) + '%"></span></div><p class="gsa-num">' + num(a.feitos) + ' de ' + num(a.total) + '</p>' : '';
const btnTarefa = (t) => '<button type="button" class="gte-link" data-gsa-tarefa="' + esc(t._id) + '">' + esc(t.name || 'Tarefa') + '</button>';
const linkFora = (url, rot) => url ? '<a class="btn btn-sm" href="' + esc(url) + '" target="_blank" rel="noopener">' + ic('ext') + esc(rot) + '</a>' : '';
const copiar = (v, rot) => v ? '<button type="button" class="btn btn-sm" data-gsa-copiar="' + esc(v) + '">' + ic('copy') + esc(rot || 'Copiar') + '</button>' : '';
function secao(k, titulo, n, corpo, o) {
  o = o || {};
  const aberta = !S.fechados.has(k);
  return '<section class="gsa-sec' + (o.tom ? ' gsa-tom-' + o.tom : '') + '" id="gsa-' + k + '"><button type="button" class="gsa-sec-h" data-gsa-sec="' + k + '" aria-expanded="' + aberta + '">' + ic(aberta ? 'chev-d' : 'chev-r') +
    '<h3>' + esc(titulo) + (n != null ? ' <span class="gte-n">' + num(n) + '</span>' : '') + '</h3>' + (o.resumo ? '<span class="gsa-resumo">' + o.resumo + '</span>' : '') + '</button>' +
    (aberta ? '<div class="gsa-corpo">' + corpo + '</div>' : '') + '</section>';
}
function blocoContatos() {
  const { tarefas, cnpjs } = clientesQueAvisam();
  const lidos = cnpjs.filter(c => c in S.contatos).length;
  const an = G.semContatoNoSetor(tarefas, S.contatos);
  let h = '<p class="gte-dica">As tarefas que avisam o cliente por e-mail e o setor dela não tem contato que receba: o e-mail não sai. No Gestta isso é só um número no painel.</p>';
  if (S.lendoCont) h += barra(S.lendoCont);
  else if (lidos < cnpjs.length) h += '<p><button type="button" class="btn btn-primary btn-sm" data-gsa-ler="contatos">' + ic('search') + 'Conferir os contatos de ' + plural(cnpjs.length - lidos, 'cliente', 'clientes') + '</button> <small class="fraco">Um cliente por vez. Só o setor, se está ativo e se tem e-mail: nada é guardado.</small></p>';
  if (S.erroCont) h += '<div class="faixa warn"><svg class="ic"><use href="#i-alert"/></svg><div>' + esc(S.erroCont) + '</div></div>';
  if (lidos) {
    h += an.casos.length ? '<div class="gte-tab-wrap"><table class="gte-tab gsa-tab"><thead><tr><th>Empresa</th><th>Setor</th><th>O que falta</th><th class="num">Tarefas</th><th></th></tr></thead><tbody>' +
      an.casos.map(c => '<tr><td><b>' + esc(nome(c.cliente) || '—') + '</b><small>' + esc(cnpjFmt(c.cnpj)) + '</small></td><td>' + esc(c.setor) + '</td><td><span class="gte-tag gte-erro">' + esc(c.rot) + '</span><small>' + c.tarefas.slice(0, 3).map(t => esc(t.nome)).join(' · ') + (c.n > 3 ? ' …' : '') + '</small></td><td class="num">' + num(c.n) + '</td>' +
        '<td class="gsa-acoes">' + copiar(cnpjFmt(c.cnpj), 'Copiar CNPJ') + '</td></tr>').join('') + '</tbody></table></div>'
      : '<p class="gte-vazio">' + ic('check') + 'Todas as tarefas que avisam o cliente têm contato com e-mail no setor (' + plural(lidos, 'cliente conferido', 'clientes conferidos') + ').</p>';
    if (an.naoLidos && !S.lendoCont) h += '<p class="fraco">' + plural(an.naoLidos, 'cliente ainda não conferido', 'clientes ainda não conferidos') + '.</p>';
  }
  return { h, n: lidos ? an.casos.length : null };
}
function blocoEmails() {
  const l = G.tarefasParaEmail(S.tarefas, hojeD(), 7), alvo = l.slice(0, MAX_EMAILS), lidos = alvo.filter(t => t._id in S.emails);
  const falhas = lidos.filter(t => S.emails[t._id].v === 'naoSaiu');
  const n = S.dados.emailNaoSaiu;
  let h = '<p class="gte-dica">' + (n != null ? 'No painel do Gestta, <b>' + plural(n, 'e-mail não saiu', 'e-mails não saíram') + '</b> neste mês. ' : '') + 'A lista sai do histórico das tarefas que avisam o cliente e foram concluídas nos últimos 7 dias (' + plural(l.length, 'tarefa', 'tarefas') + (l.length > MAX_EMAILS ? ', as ' + MAX_EMAILS + ' mais novas' : '') + ').</p>';
  if (S.lendoEm) h += barra(S.lendoEm);
  else if (lidos.length < alvo.length) h += '<p><button type="button" class="btn btn-primary btn-sm" data-gsa-ler="emails">' + ic('search') + 'Ler as falhas (' + plural(alvo.length - lidos.length, 'tarefa', 'tarefas') + ')</button> <small class="fraco">Uma tarefa por vez. Só a situação do e-mail, o motivo e a data.</small></p>';
  if (S.erroEm) h += '<div class="faixa warn"><svg class="ic"><use href="#i-alert"/></svg><div>' + esc(S.erroEm) + '</div></div>';
  if (lidos.length) {
    const conta = (v) => lidos.filter(t => S.emails[t._id].v === v).length;
    h += '<p class="gsa-pills"><span class="gte-tag gte-erro">' + plural(falhas.length, 'não saiu', 'não saíram') + '</span><span class="gte-tag gte-ok">' + plural(conta('entregue'), 'entregue', 'entregues') + '</span><span class="gte-tag gte-neutro">' + plural(conta('saiu'), 'saiu', 'saíram') + ' sem confirmação</span><span class="gte-tag gte-neutro">' + conta('semEmail') + ' sem e-mail registrado</span></p>';
    h += falhas.length ? '<div class="gte-tab-wrap"><table class="gte-tab gsa-tab"><thead><tr><th>Empresa</th><th>Tarefa</th><th>Setor</th><th>Motivo</th><th>Quando</th></tr></thead><tbody>' +
      falhas.map(t => { const v = S.emails[t._id]; return '<tr><td><b>' + esc(t.customer.name || '—') + '</b><small>' + esc(cnpjFmt(t.customer.cnpj)) + '</small></td><td>' + btnTarefa(t) + '</td><td>' + esc(t.setor) + '</td><td>' + esc(v.motivo || '') + '</td><td>' + esc(ddmm(v.quando) || ddmm(t.conclusion_date)) + '</td></tr>'; }).join('') + '</tbody></table></div>'
      : '<p class="gte-vazio">' + ic('check') + 'Nenhum e-mail que deixou de sair nas tarefas lidas.</p>';
  }
  return { h, n: lidos.length ? falhas.length : (n != null ? n : null) };
}
function blocoCarga(carga, prio) {
  const fer = S.feriados;
  let h = '<p class="gte-dica">Tarefas abertas por pessoa nos próximos 10 dias úteis, pela meta (as atrasadas contam no primeiro dia). A capacidade é o ritmo de cada um: concluídas por dia útil nos 2 meses anteriores' + (fer && fer.size ? ', sem os feriados do escritório' : '') + '. Acima dela, não vai dar tempo.' + (S.dados.perfil.total ? ' Clique na capacidade para trocar por um número fixo (só neste navegador).' : '') + '</p>';
  if (!carga.pessoas.length) return { h: h + '<p class="gte-vazio">' + ic('check') + 'Nenhuma tarefa aberta com meta nos próximos dias.</p>', n: 0 };
  const cab = '<tr><th class="gsa-pessoa">Pessoa</th><th class="num" title="Concluídas por dia útil">Ritmo</th><th class="num">Atrasadas</th>' + carga.dias.map((d, i) => '<th class="num gsa-dia' + (i === 0 ? ' hoje' : '') + '">' + esc(diaSem(d)) + '<small>' + esc(ddmm(d)) + '</small></th>').join('') + '</tr>';
  const linhas = carga.pessoas.map(p => {
    const capTxt = p.cap ? String(p.cap).replace('.', ',') : '—', dica = p.origemCap === 'manual' ? 'Capacidade fixa (posta à mão)' : p.origemCap === 'ritmo' ? 'Ritmo dos 2 meses anteriores' : 'Sem concluídas nos 2 meses anteriores: sem capacidade';
    const capCel = S.editCap === p.nome ? '<input type="number" min="0" step="0.5" class="gsa-cap-in" data-gsa-cap-in="' + esc(p.nome) + '" value="' + esc(p.origemCap === 'manual' ? p.cap : '') + '" aria-label="Capacidade de ' + esc(p.nome) + ' por dia" placeholder="' + esc(capTxt) + '">'
      : S.dados.perfil.total && p.nome !== 'Sem responsável' ? '<button type="button" class="gsa-cap' + (p.origemCap === 'manual' ? ' manual' : '') + '" data-gsa-cap="' + esc(p.nome) + '" title="' + esc(dica) + '">' + esc(capTxt) + '</button>' : '<span title="' + esc(dica) + '">' + esc(capTxt) + '</span>';
    return '<tr><th class="gsa-pessoa" scope="row">' + esc(nome(p.nome)) + (p.diasAcima ? '<small class="gsa-alerta">' + ic('alert') + plural(p.diasAcima, 'dia acima', 'dias acima') + '</small>' : '') + '</th><td class="num">' + capCel + '</td>' +
      '<td class="num">' + (p.atrasadas.length ? '<button type="button" class="gsa-cel atr" data-gsa-cel="' + esc(p.nome) + '|atr" aria-label="' + esc(p.nome + ': ' + p.atrasadas.length + ' atrasadas') + '">' + num(p.atrasadas.length) + '</button>' : '<span class="fraco">0</span>') + '</td>' +
      p.celulas.map(c => !c.n && !c.acima ? '<td class="num"><span class="fraco">·</span></td>' : '<td class="num"><button type="button" class="gsa-cel' + (c.acima ? ' acima' : '') + (S.cel === p.nome + '|' + c.dia ? ' on' : '') + '" data-gsa-cel="' + esc(p.nome + '|' + c.dia) + '" aria-label="' + esc(p.nome + ', ' + ddmm(c.dia) + ': ' + c.n + ' tarefas' + (c.acima ? ', ' + c.acima + ' acima do ritmo' : '')) + '" title="' + esc(c.acima ? 'Não vai dar tempo: ' + c.acima + ' acima do ritmo' : c.n + ' tarefas') + '">' + num(c.n) + (c.acima ? '<i aria-hidden="true">!</i>' : '') + '</button></td>').join('') + '</tr>';
  }).join('');
  h += '<div class="gte-tab-wrap gsa-grade-wrap"><table class="gte-tab gsa-grade"><thead>' + cab + '</thead><tbody>' + linhas + '</tbody></table></div>';
  if (S.cel) {
    const [pn, dia] = S.cel.split('|'), p = carga.pessoas.find(x => x.nome === pn);
    const ids = p ? (dia === 'atr' ? p.atrasadas : ((p.celulas.find(c => c.dia === dia) || {}).ids || [])) : [];
    const l = prio.filter(x => ids.includes(x.t._id)).map(x => x.t), chave = 'saude:' + S.cel;
    S._celTarefas = l;
    h += '<div class="gsa-cel-lista"><div class="gsa-cel-h"><b>' + esc(nome(pn)) + ' · ' + (dia === 'atr' ? 'atrasadas' : esc(diaSem(dia) + ' ' + ddmm(dia))) + '</b><span class="gte-cont">' + plural(l.length, 'tarefa', 'tarefas') + '</span>' +
      (l.length ? '<button type="button" class="btn btn-sm" data-gsa-lote>' + (grupoEmLote(chave) ? 'Sair do lote' : 'Agir em lote') + '</button>' : '') + '<button type="button" class="btn btn-sm" data-gsa-cel-fechar>' + ic('x') + 'Fechar</button></div>' +
      barraGrupo(chave, l) + '<ul class="gsa-tlist">' + l.map(t => '<li>' + btnTarefa(t) + '<small>' + esc([t.customer.name, t.setor, t.legal_date && 'legal ' + ddmm(t.legal_date)].filter(Boolean).join(' · ')) + '</small></li>').join('') + '</ul></div>';
  }
  const top = prio.filter(x => x.nivel <= 4).slice(0, 12);
  h += '<h4 class="gsa-h4">Prioridade do dia</h4>' + (top.length ? '<ol class="gsa-prio">' + top.map(x => '<li class="gsa-n' + x.nivel + '"><span class="gsa-nivel">' + esc(x.motivo) + '</span>' + btnTarefa(x.t) + '<small>' + esc([x.t.customer.name, nome(x.t.responsavel) || 'sem responsável', x.t.legal_date ? 'legal ' + ddmm(x.t.legal_date) : x.t.due_date ? 'meta ' + ddmm(x.t.due_date) : ''].filter(Boolean).join(' · ')) + '</small></li>').join('') + '</ol>'
    : '<p class="gte-vazio">' + ic('check') + 'Nada passou da data legal, da meta ou do ritmo.</p>');
  return { h, n: carga.alertas.length };
}
function blocoConfig() {
  let h = '<p class="gte-dica">As empresas com os mesmos setores formam um perfil. Dentro dele, <b>falta</b> é um template de tarefa que 80% ou mais das parecidas recebem e esta não; <b>sobra</b> é um que quase nenhuma parecida recebe. Só leitura: confira e ajuste no Gestta.</p>';
  if (S.dados.semTarefa != null) h += '<p class="gsa-pills"><span class="gte-tag gte-neutro">' + plural(S.dados.semTarefa, 'cliente ativo sem nenhuma tarefa', 'clientes ativos sem nenhuma tarefa') + ' no Gestta</span></p>';
  if (S.lendoCfg) h += '<p class="fraco">' + (S.lendoCfg.fase === 'templates' ? 'Lendo os templates de tarefa…' : 'Lendo as empresas de cada template…') + '</p>' + barra(S.lendoCfg.total ? S.lendoCfg : null);
  else if (!S.config || S.config.templates.some(t => !(t.id in S.porTemplate))) h += '<p><button type="button" class="btn btn-primary btn-sm" data-gsa-ler="config">' + ic('search') + (S.config ? 'Continuar a leitura' : 'Ler a configuração das empresas') + '</button> <small class="fraco">Os templates de tarefa ativos e as empresas de cada um, um template por vez.</small></p>';
  if (S.erroCfg) h += '<div class="faixa warn"><svg class="ic"><use href="#i-alert"/></svg><div>' + esc(S.erroCfg) + '</div></div>';
  if (!S.config || S.lendoCfg) return { h, n: null };
  const sg = G.sugestoesConfig(S.config.templates, S.porTemplate, S.config.clientes);
  const linha = (x) => '<tr><td><b>' + esc(nome(x.nomeCliente) || '—') + '</b><small>' + esc(cnpjFmt(x.cnpj)) + '</small></td><td>' + esc(nome(x.nomeTemplate)) + '<small>' + esc(x.setor) + '</small></td><td class="num">' + x.pct + '%<small>de ' + x.grupo + ' parecidas</small></td><td class="gsa-acoes">' + linkFora(G.urlCliente(x.cliente), 'Abrir a empresa') + copiar(cnpjFmt(x.cnpj), 'Copiar CNPJ') + '</td></tr>';
  const tab = (l, vazio) => l.length ? '<div class="gte-tab-wrap"><table class="gte-tab gsa-tab"><thead><tr><th>Empresa</th><th>Template</th><th class="num">Parecidas com ele</th><th></th></tr></thead><tbody>' + l.slice(0, 200).map(linha).join('') + '</tbody></table></div>' + (l.length > 200 ? '<p class="fraco">e mais ' + num(l.length - 200) + '.</p>' : '') : '<p class="gte-vazio">' + ic('check') + esc(vazio) + '</p>';
  h += '<h4 class="gsa-h4">Falta <span class="gte-n">' + num(sg.falta.length) + '</span></h4>' + tab(sg.falta, 'Nenhuma empresa deixa de receber o que as parecidas recebem.') +
    '<h4 class="gsa-h4">Sobra <span class="gte-n">' + num(sg.sobra.length) + '</span></h4>' + tab(sg.sobra, 'Nenhum template fora do padrão das parecidas.') +
    '<p class="fraco">' + plural(sg.perfis.length, 'perfil de demanda', 'perfis de demanda') + ' · ' + plural(S.config.templates.length, 'template ativo', 'templates ativos') + '.</p>';
  return { h, n: sg.falta.length + sg.sobra.length };
}
function blocoExtras(ex) {
  const l = S.extra === 'velhas' ? null : ex.semDono;
  let h = '';
  if (S.extra !== 'velhas') h += '<h4 class="gsa-h4">Sem responsável <span class="gte-n">' + num(ex.semDono.length) + '</span></h4>' + (l.length ? '<ul class="gsa-tlist">' + l.slice(0, 100).map(t => '<li>' + btnTarefa(t) + '<small>' + esc([t.customer.name, t.setor, t.due_date && 'meta ' + ddmm(t.due_date)].filter(Boolean).join(' · ')) + '</small></li>').join('') + '</ul>' : '<p class="gte-vazio">' + ic('check') + 'Toda tarefa aberta tem responsável.</p>');
  if (S.extra !== 'semDono') h += '<h4 class="gsa-h4">Empresas com tarefa atrasada há mais de 15 dias <span class="gte-n">' + num(ex.atrasoLongo.length) + '</span></h4>' + (ex.atrasoLongo.length ? '<ul class="gsa-tlist">' + ex.atrasoLongo.slice(0, 100).map(e => '<li><b>' + esc(e.cliente || '—') + '</b><small>' + plural(e.tarefas.length, 'tarefa', 'tarefas') + ': ' + e.tarefas.slice(0, 4).map(t => esc(t.name) + ' (meta ' + esc(ddmm(t.due_date)) + ')').join(' · ') + (e.tarefas.length > 4 ? ' …' : '') + '</small></li>').join('') + '</ul>' : '<p class="gte-vazio">' + ic('check') + 'Nenhuma empresa com tarefa atrasada há mais de 15 dias.</p>');
  return h;
}

export function desenharSaude(v, sub) {
  if (!S.dados) {
    sub('Saúde da operação');
    v.innerHTML = S.erro ? '<div class="faixa"><svg class="ic"><use href="#i-alert"/></svg><div style="flex:1;min-width:240px"><b>Não consegui ler a saúde da operação.</b> ' + esc(S.erro.erro || '') + '</div><button type="button" class="btn btn-sm" data-gsa-reler>Tentar de novo</button></div>'
      : '<div class="gt-esq-tela" role="status" aria-label="Lendo a saúde da operação"><p class="fraco">Lendo no Gestta o relatório de tarefas dos últimos meses…</p></div>';
    return;
  }
  const D = S.dados, total = !!D.perfil.total, hoje = hojeD(), fer = S.feriados;
  const ritmo = G.ritmoPorPessoa(S.tarefas, hoje, fer), carga = G.cargaPorDia(S.tarefas, hoje, { dias: 10, feriados: fer, ritmo, cap: S.cap });
  const sobre = new Set(); carga.pessoas.forEach(p => p.celulas.forEach(c => { if (c.acima) c.ids.forEach(id => sobre.add(id)); }));
  const prio = G.prioridade(S.tarefas, hoje, { feriados: fer, sobrecarregadas: sobre });
  S._lista = prio.map(x => x.t).concat(S.tarefas.filter(t => !prio.some(x => x.t === t)));
  const ex = G.extrasSaude(S.tarefas, hoje, 15);
  S._celTarefas = null;
  const bC = blocoContatos(), bE = blocoEmails(), bK = blocoCarga(carga, prio), bG = total ? blocoConfig() : null;
  sub('Saúde da operação · ' + (total ? 'equipe toda' : 'as suas tarefas') + ' · lido às ' + new Date(D.lidoEm).toTimeString().slice(0, 5));
  const kpi = (n, rot, alvo, cls, dica) => '<button type="button" class="gte-kpi ' + cls + '" data-gsa-ir="' + alvo + '" title="' + esc(dica) + '"><b>' + (n == null ? '—' : num(n)) + '</b><span>' + esc(rot) + '</span></button>';
  let h = '<section class="gte-topo cfg-card gsa-topo"><div class="gte-tit"><h2>Saúde da operação</h2><p' + (simples() ? ' class="ajuda"' : '') + '>O que o Gestta não mostra direito: o e-mail que não chega ao cliente, a tarefa que avisa sem contato no setor, quando não vai dar tempo e o que vem primeiro' + (total ? ', e a configuração das tarefas de cada empresa' : '') + '. Só leitura; ' + (total ? 'a equipe toda.' : 'só as suas tarefas.') + '</p></div>' +
    '<div class="gte-kpis">' + kpi(D.emailNaoSaiu, 'e-mails não saíram no mês', 'emails', 'gte-k-erro', 'Do painel do Gestta (atenção: e-mail não enviado)') +
    kpi(bC.n, 'empresas × setor sem contato', 'contatos', 'gte-k-erro', 'Tarefas que avisam o cliente e o setor não tem contato com e-mail (confira os contatos)') +
    kpi(carga.alertas.length, 'dias acima do ritmo', 'carga', 'gte-k-erro', 'Pessoa × dia em que a carga passa da capacidade') +
    kpi(ex.semDono.length, 'abertas sem responsável', 'extras:semDono', 'gte-k-neutro', 'Tarefas abertas sem responsável') +
    kpi(ex.atrasoLongo.length, 'empresas atrasadas +15 dias', 'extras:velhas', 'gte-k-neutro', 'Empresas com tarefa aberta e meta vencida há mais de 15 dias') + '</div></section>' +
    (D.mesesFaltam && D.mesesFaltam.length ? '<p class="fraco gsa-memo">O Gestta não entregou o relatório de ' + esc(D.mesesFaltam.join(' e ')) + ': o ritmo e a carga usam só ' + esc((D.meses || []).join(', ')) + '.</p>' : '') +
    (D.daMemoria ? '<p class="fraco gsa-memo">Relatório lido há pouco (vale por 1 hora). ' + (D.meses ? 'Meses: ' + esc(D.meses.join(', ')) + '.' : '') + '</p>' : '');
  h += secao('carga', 'Carga por dia e prioridade', carga.alertas.length, bK.h, { tom: carga.alertas.length ? 'alerta' : '', resumo: carga.alertas.length ? esc(plural(carga.alertas.length, 'dia', 'dias') + ' acima do ritmo') : 'dentro do ritmo' });
  h += secao('contatos', 'Avisa o cliente sem contato no setor', bC.n, bC.h, { tom: bC.n ? 'alerta' : '' });
  h += secao('emails', 'Falhas de e-mail ao cliente', bE.n, bE.h, { tom: bE.n ? 'alerta' : '' });
  if (total) h += secao('config', 'Configuração das empresas pela demanda', bG.n, bG.h);
  h += secao('extras', 'Sem responsável e atrasos longos', ex.semDono.length + ex.atrasoLongo.length, blocoExtras(ex));
  v.innerHTML = h;
  if (S.cel) ligarGrupo(v, S._celTarefas || [], aoMudar);
}
export function ligarSaude(v, redesenhar, paraPai) {
  aoMudar = redesenhar || aoMudar; paraPaiFn = paraPai || paraPaiFn;
  v.addEventListener('click', (e) => {
    if (!v.querySelector('.gsa-topo, [data-gsa-reler]')) return;
    const t = e.target.closest('[data-gsa-sec],[data-gsa-ler],[data-gsa-reler],[data-gsa-ir],[data-gsa-cel],[data-gsa-cel-fechar],[data-gsa-lote],[data-gsa-tarefa],[data-gsa-copiar],[data-gsa-cap]'); if (!t) return;
    if (t.dataset.gsaReler != null) { if (enviarFn) lerSaude(enviarFn, aoMudar, true); return; }
    if (t.dataset.gsaSec) { const k = t.dataset.gsaSec; S.fechados.has(k) ? S.fechados.delete(k) : S.fechados.add(k); gravarPref('gt.saude.fechados', [...S.fechados].join(',')); aoMudar(); return; }
    if (t.dataset.gsaLer === 'contatos') { if (!S.lendoCont) lerContatos(); return; }
    if (t.dataset.gsaLer === 'emails') { if (!S.lendoEm) lerEmails(); return; }
    if (t.dataset.gsaLer === 'config') { if (!S.lendoCfg) lerConfig(); return; }
    if (t.dataset.gsaIr) {
      const [k, extra] = t.dataset.gsaIr.split(':'); S.fechados.delete(k); S.extra = extra || ''; aoMudar();
      const s = document.getElementById('gsa-' + k); if (s) s.scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    if (t.dataset.gsaCel) { S.cel = S.cel === t.dataset.gsaCel ? null : t.dataset.gsaCel; LOTE.grupo = null; LOTE.sel.clear(); aoMudar(); return; }
    if (t.dataset.gsaCelFechar != null) { S.cel = null; LOTE.grupo = null; LOTE.sel.clear(); aoMudar(); return; }
    if (t.dataset.gsaLote != null) {
      const chave = 'saude:' + S.cel;
      if (grupoEmLote(chave)) { LOTE.grupo = null; LOTE.sel.clear(); }
      else marcarGrupo(chave, S._celTarefas || []);
      aoMudar(); return;
    }
    if (t.dataset.gsaTarefa) { const l = S._lista || S.tarefas, i = l.findIndex(x => x._id === t.dataset.gsaTarefa); if (i >= 0) abrirPainel(l, i, paraPaiFn); return; }
    if (t.dataset.gsaCopiar) { copiarTexto(t.dataset.gsaCopiar).then(ok => toast(ok ? 'Copiado: ' + t.dataset.gsaCopiar : 'Não consegui copiar.', !ok)); return; }
    if (t.dataset.gsaCap) { S.editCap = t.dataset.gsaCap; aoMudar(); setTimeout(() => { const i = v.querySelector('[data-gsa-cap-in]'); if (i) i.focus(); }, 20); }
  });
  const salvarCap = (inp) => {
    const k = inp.dataset.gsaCapIn, n = Number(String(inp.value).replace(',', '.'));
    if (n > 0 && n < 1000) S.cap[k] = Math.round(n * 10) / 10; else delete S.cap[k];
    gravarPref('gt.cap', JSON.stringify(S.cap)); S.editCap = false; aoMudar();
  };
  v.addEventListener('keydown', (e) => { const i = e.target.closest && e.target.closest('[data-gsa-cap-in]'); if (!i) return; if (e.key === 'Enter') { e.preventDefault(); salvarCap(i); } else if (e.key === 'Escape') { e.stopPropagation(); S.editCap = false; aoMudar(); } });
  v.addEventListener('focusout', (e) => { const i = e.target.closest && e.target.closest('[data-gsa-cap-in]'); if (i && S.editCap) salvarCap(i); });
}

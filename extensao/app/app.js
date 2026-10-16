/* Control Onvio · app em tela cheia por cima do Onvio
 * Rotas (#/inicio, #/fila, #/equipe, #/distribuir, #/lembretes, #/config, #/busca?q=),
 * trilho lateral, cabeçalho do módulo (título, abas, ao vivo, sino, Ver Onvio), busca em janela central
 * (/ ou Ctrl+K) e as janelas de detalhe e de lembrete. */
import { estado, iniciarEstado, aoMudar, enviar, itens, minhas, marcarAlertasVistos } from './estado.js';
import { $, $$, esc, relativo, fmtHoraS, toast, normal, iniciais, pillSituacao } from './util.js';
import { abrirDetalhe, fecharDetalhe, detalheAberto } from './views/detalhe.js';
import { abrirLembrete, fecharLembrete, lembreteAberto } from './views/lembrete-dlg.js';
import { abrirNova, fecharNova, novaAberta } from './views/nova-dlg.js';
import { fecharAnexos, anexosAbertos } from './views/anexos-dlg.js';
import * as inicio from './views/inicio.js';
import * as fila from './views/fila.js';
import * as equipe from './views/equipe.js';
import * as busca from './views/busca.js';
import * as lembretes from './views/lembretes.js';
import * as distribuir from './views/distribuir.js';
import * as config from './views/config.js';
const OC = window.OC;

const VISTAS = { inicio, fila, equipe, distribuir, lembretes, config, busca };
// Telas que se redesenham sozinhas quando chega leitura nova (as de consulta sob demanda não).
const AO_VIVO = new Set(['inicio', 'fila', 'equipe', 'lembretes']);

let rota = { nome: 'inicio', params: {} };
let aoRedim = null;
let redesenharDepois = false;   // mudança que chegou com uma janela aberta

function lerRota() {
  const h = location.hash.replace(/^#\/?/, '');
  const [nome, q] = h.split('?');
  const params = Object.fromEntries(new URLSearchParams(q || ''));
  return { nome: VISTAS[nome] ? nome : 'inicio', params };
}
function navegar(nome, params) {
  const q = new URLSearchParams(params || {}).toString();
  const alvo = '#/' + nome + (q ? '?' + q : '');
  if (location.hash === alvo) desenhar(); else location.hash = alvo;
}

/* ---------- cabeçalho do módulo: cada tela diz o título, as abas e o que vai à direita ---------- */
// o: { titulo, sub (html), abas: [{ id, rot, href|acao, n, late }], aba, extra (html) }
function cab(o) {
  $('#titulo').textContent = o.titulo || 'Control Onvio';
  $('#subtitulo').innerHTML = o.sub || '';
  $('#cab-extra').innerHTML = o.extra || '';
  const ab = $('#abas');
  ab.hidden = !(o.abas && o.abas.length);
  ab.innerHTML = (o.abas || []).map(a => (a.href
    ? '<a class="aba' + (a.id === o.aba ? ' on' : '') + '" role="tab" aria-selected="' + (a.id === o.aba) + '" href="' + esc(a.href) + '" data-aba="' + esc(a.id) + '">'
    : '<button type="button" class="aba' + (a.id === o.aba ? ' on' : '') + '" role="tab" aria-selected="' + (a.id === o.aba) + '" data-aba="' + esc(a.id) + '">') +
    esc(a.rot) + (a.n != null ? '<span class="n' + (a.late ? ' late' : '') + '">' + (a.n || '') + '</span>' : '') + (a.href ? '</a>' : '</button>')).join('');
  return { abas: ab, extra: $('#cab-extra') };
}
const ctx = { navegar, abrirDetalhe, abrirLembrete, abrirNova, cab, aoRedimensionar: fn => { aoRedim = fn; } };

// Onvio aberto com login de cliente: o app não mostra nada (o service worker já apagou o que foi lido).
const bloqueado = () => (estado.status || {}).estado === 'visao_cliente';
function telaBloqueio(v) {
  cab({ titulo: 'Control Onvio', sub: 'Só para a visão do escritório' });
  v.innerHTML = '<div class="bloqueio" id="bloqueio"><div class="bl-ic"><svg class="ic"><use href="#i-lock"/></svg></div>' +
    '<h2>Este é um acesso de cliente</h2>' +
    '<p>O Control Onvio é uma ferramenta interna da ControlTax e só funciona com o login de um analista ou gestor do escritório. Com o acesso de cliente nada é lido nem guardado.</p>' +
    '<p class="fraco">' + esc((estado.status || {}).msg || '') + '</p>' +
    '<p>Para usar: saia do Onvio e entre com o seu usuário do escritório. Se a aba da visão do cliente (Client Center) estiver aberta, feche-a.</p>' +
    '<div class="bl-acoes"><button class="btn btn-primary" id="bl-tentar"><svg class="ic ic-sm"><use href="#i-refresh"/></svg> Já entrei com o login do escritório</button><button class="btn" id="bl-onvio"><svg class="ic ic-sm"><use href="#i-eye"/></svg> Ver Onvio</button></div></div>';
  $('#bl-tentar', v).onclick = async () => { const r = await enviar({ cmd: 'atualizar' }); if (r.ok) toast('Acesso do escritório confirmado'); else toast(r.cliente ? 'Continua um acesso de cliente' : (r.erro || 'Não foi possível ler o Onvio'), true); };
  $('#bl-onvio', v).onclick = () => enviar({ cmd: 'fecharPainel' });
}

function desenhar() {
  rota = lerRota();
  aoRedim = null;
  document.body.classList.toggle('bloqueado', bloqueado());
  if (bloqueado()) { fecharAnexos(); fecharDetalhe(); fecharLembrete(); fecharNova(); fecharBusca(); abrirSino(false); $$('.trilho [data-rota]').forEach(a => a.classList.remove('on')); telaBloqueio($('#vista')); return; }
  const p = rota.params;
  const ativo = rota.nome === 'busca' ? '' : rota.nome === 'fila' && p.analista ? 'equipe' : rota.nome;
  $$('.trilho [data-rota]').forEach(a => { a.classList.toggle('on', a.dataset.rota === ativo); if (a.dataset.rota === ativo) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  const v = $('#vista');
  const params = rota.nome === 'busca' ? Object.assign({ q: rota.params.q || '' }, rota.params) : rota.params;
  try { VISTAS[rota.nome].render(v, ctx, params); }
  catch (e) { console.error(e); v.innerHTML = '<div class="faixa"><b>Algo deu errado ao montar esta tela.</b> ' + esc(e.message) + '</div>'; }
  avisoSessao();
}

/* ---------- aviso de leitura (sem sessão / erro) no topo da tela ---------- */
function avisoSessao() {
  const s = estado.status || {};
  const v = $('#vista');
  const velho = $('#aviso-sessao', v);
  if (velho) velho.remove();
  if (s.estado !== 'sem_sessao' && s.estado !== 'erro') return;
  const d = document.createElement('div');
  d.id = 'aviso-sessao';
  d.className = 'faixa';
  d.innerHTML = '<svg class="ic"><use href="#i-alert"/></svg><div style="flex:1;min-width:240px"><b>' + (s.estado === 'sem_sessao' ? 'Sem sessão no Onvio.' : 'A última leitura falhou.') + '</b> ' + esc(s.msg || '') + '</div>' +
    '<button class="btn btn-sm" id="av-tentar">Tentar de novo</button><a class="btn btn-sm" href="#/config">Testar a leitura</a>';
  v.prepend(d);
  $('#av-tentar', d).onclick = () => atualizar();
}

/* ---------- ao vivo e contadores ---------- */
function aoVivo() {
  const el = $('#aovivo'), tx = $('#aovivo-tx');
  const s = estado.status || {}, seg = estado.settings.tempoRealSeg;
  el.classList.remove('ok', 'parado', 'erro');
  $('#btn-atualizar').classList.toggle('girando', s.estado === 'lendo');
  if (s.estado === 'lendo') { tx.textContent = 'Lendo o Onvio' + (s.etapa ? ' · ' + s.etapa : '…'); return; }
  if (s.estado === 'visao_cliente') { el.classList.add('erro'); tx.textContent = 'Acesso de cliente'; return; }
  if (s.estado === 'sem_sessao' || s.estado === 'erro') { el.classList.add('erro'); tx.textContent = s.estado === 'sem_sessao' ? 'Sem sessão no Onvio' : 'Falha na leitura'; return; }
  const ver = estado.ultima || (estado.snap && estado.snap.fetchedAt);
  if (!ver) { tx.textContent = 'Aguardando a primeira leitura'; return; }
  const velha = Date.now() - new Date(ver) > Math.max(120, (seg || 60) * 4) * 1000;
  el.classList.add(velha || !(seg > 0) ? 'parado' : 'ok');
  tx.textContent = (seg > 0 && !velha ? 'Ao vivo · ' : 'Atualizado ') + fmtHoraS(ver);
}
function contadores() {
  const m = minhas().filter(i => i.lado === 'esc');
  const nf = $('#n-fila'); nf.textContent = m.length || ''; nf.classList.toggle('late', m.some(i => i.nivel === 2));
  const late = itens().filter(i => i.nivel === 2).length;
  const ne = $('#n-equipe'); ne.textContent = late || ''; ne.classList.toggle('late', !!late);
  const nl = lembretes.contarPendentes(); const el = $('#n-lembretes'); el.textContent = nl || ''; el.classList.toggle('late', nl > 0);
  const vistos = estado.alertasVistosEm ? new Date(estado.alertasVistosEm) : new Date(0);
  const novos = (estado.eventos || []).filter(e => new Date(e.em) > vistos && (e.mine || e.tipo === 'semresp')).length;
  $('#sino-cont').textContent = novos ? (novos > 99 ? '99+' : novos) : '';
  const nome = estado.snap && estado.snap.user ? estado.snap.user.nome : '';
  $('#quem').textContent = nome || 'Control Onvio';
  $('#avatar').textContent = iniciais(nome) || 'CO'; $('#trilho-pe').title = nome ? 'Lendo o Onvio como ' + nome : '';
}

/* ---------- sino ---------- */
const ICONE = { nova: 'i-plus', respondeu: 'i-chat', prescreve: 'i-alert', atrasou: 'i-alert', semresp: 'i-users', lembrete: 'i-clock' };
function abrirSino(abrir) {
  const p = $('#sino-painel'), b = $('#btn-sino');
  const vai = abrir == null ? p.hidden : abrir;
  p.hidden = !vai; b.setAttribute('aria-expanded', String(vai));
  if (!vai) return;
  const r = b.getBoundingClientRect();
  p.style.top = (r.bottom + 8) + 'px';
  p.style.right = Math.max(12, innerWidth - r.right - 12) + 'px';
  const vistos = estado.alertasVistosEm ? new Date(estado.alertasVistosEm) : new Date(0);
  const ev = (estado.eventos || []).filter(e => e.mine || e.tipo === 'semresp').slice(0, 60);
  const novos = ev.filter(e => new Date(e.em) > vistos).length;
  p.innerHTML = '<h3>Alertas<small>' + (novos ? novos + (novos === 1 ? ' novo' : ' novos') : 'nada novo') + '</small></h3>' + (ev.length ? ev.map(e => '<div class="ev ev-' + esc(e.tipo) + (new Date(e.em) > vistos ? ' novo' : '') + '" data-ev="' + esc(e.id) + '"><svg class="ic"><use href="#' + (ICONE[e.tipo] || 'i-bell') + '"/></svg><div class="tx"><b>' + esc(e.titulo) + '</b><small>' + (e.num ? '#' + esc(e.num) + ' ' + esc(e.typeLabel) + ' · ' : '') + esc(e.cliente) + ' · ' + esc(relativo(e.em)) + '</small></div></div>').join('') : '<div class="vazio">Sem alertas por enquanto. Eles aparecem aqui quando chega solicitação para você, o cliente responde ou algo vai prescrever.</div>');
  $$('[data-ev]', p).forEach(d => d.onclick = () => { const e = ev.find(x => x.id === d.dataset.ev); abrirSino(false); if (e && e.type && e.num) abrirDetalhe(e); });
  marcarAlertasVistos();
}

/* ---------- avisos na hora (toasts) para eventos novos enquanto o app está aberto ---------- */
let eventosVistos = null;
function avisarNovos() {
  const ids = new Set((estado.eventos || []).map(e => e.id));
  if (eventosVistos) {
    const novos = (estado.eventos || []).filter(e => !eventosVistos.has(e.id) && e.mine);
    if (novos.length === 1) toast(novos[0].titulo + ' · #' + novos[0].num + ' ' + novos[0].cliente);
    else if (novos.length > 1) toast(novos.length + ' novidades nas suas solicitações (veja o sino)');
  }
  eventosVistos = ids;
}

/* ---------- busca em janela central (Ctrl+K ou /) ---------- */
const TELAS = [
  { rot: 'Hoje', sub: 'o que fazer agora', ic: 'i-home', ir: () => navegar('inicio') },
  { rot: 'Solicitações', sub: 'minhas pendências', ic: 'i-inbox', ir: () => navegar('fila') },
  { rot: 'Solicitações da equipe', sub: 'todas as pendências', ic: 'i-users', ir: () => navegar('fila', { escopo: 'equipe' }) },
  { rot: 'Sem responsável', sub: 'para distribuir', ic: 'i-users', ir: () => navegar('fila', { escopo: 'semresp' }) },
  { rot: 'Agenda e lembretes', sub: 'calendário do mês', ic: 'i-calendar', ir: () => navegar('lembretes') },
  { rot: 'Novo lembrete', sub: 'criar agora', ic: 'i-plus', ir: () => abrirLembrete() },
  { rot: 'Equipe', sub: 'painel do gestor', ic: 'i-users', ir: () => navegar('equipe') },
  { rot: 'Configurações', sub: 'prazos, leitura, diagnóstico', ic: 'i-gear', ir: () => navegar('config') }
];
let opcoes = [], marcada = 0;
function abrirBusca() {
  if (bloqueado()) return;
  const c = $('#cmdk');
  c.hidden = false;
  const q = $('#busca-q'); q.value = ''; resultados(''); q.focus();
}
function fecharBusca() { $('#cmdk').hidden = true; }
function resultados(q) {
  const n = normal(q.trim());
  const termos = n.split(/\s+/).filter(Boolean);
  const casa = txt => termos.every(t => normal(txt).includes(t));
  const grupos = [];
  if (!n) grupos.push({ rot: 'Ir para', l: TELAS.map(t => ({ ic: t.ic, rot: t.rot, sub: t.sub, ir: t.ir })) });
  else {
    const exato = itens().filter(i => String(i.num) === n.replace(/^#/, ''));
    const pend = itens().filter(i => !exato.includes(i) && casa([i.num, i.apelido, i.cliente, i.detalhe, i.resp, i.typeLabel, i.status].join(' '))).slice(0, 8);
    const cls = [...new Set(itens().map(i => i.cliente || i.apelido).filter(Boolean))].filter(c => casa(c + ' ' + (itens().find(i => (i.cliente || i.apelido) === c).apelido || ''))).slice(0, 4);
    const telas = TELAS.filter(t => casa(t.rot));
    const item = i => ({ ic: 'i-inbox', rot: '#' + i.num + ' · ' + (i.apelido || i.cliente || ''), sub: [i.typeLabel, i.detalhe, i.resp || 'sem responsável'].filter(Boolean).join(' · '), pill: pillSituacao(i), ir: () => abrirDetalhe(i) });
    const onvio = { ic: 'i-search', rot: 'Buscar “' + q.trim() + '” no Onvio', sub: 'nas 10 listas, inclusive concluídas', ir: () => navegar('busca', { q: q.trim() }) };
    if (exato.length) grupos.push({ rot: 'Solicitação', l: exato.map(item) });
    if (telas.length && telas.some(t => normal(t.rot).startsWith(n))) grupos.push({ rot: 'Ir para', l: telas.map(t => ({ ic: t.ic, rot: t.rot, sub: t.sub, ir: t.ir })) });
    grupos.push({ rot: 'Onvio', l: [onvio] });
    if (pend.length) grupos.push({ rot: 'Pendências lidas agora', l: pend.map(item) });
    if (cls.length) grupos.push({ rot: 'Clientes', l: cls.map(c => ({ ic: 'i-building', rot: c, sub: itens().filter(i => (i.cliente || i.apelido) === c).length + ' pendência(s)', ir: () => navegar('fila', { cliente: c }) })) });
    if (telas.length && !grupos.some(g => g.rot === 'Ir para')) grupos.push({ rot: 'Ir para', l: telas.map(t => ({ ic: t.ic, rot: t.rot, sub: t.sub, ir: t.ir })) });
  }
  opcoes = grupos.flatMap(g => g.l); marcada = 0;
  let k = 0;
  $('#cmdk-res').innerHTML = grupos.map(g => '<div class="sr-grupo">' + esc(g.rot) + '</div>' + g.l.map(o => '<button type="button" class="sr-item' + (k === 0 ? ' on' : '') + '" role="option" data-o="' + (k++) + '"><span class="sr-ico"><svg class="ic"><use href="#' + o.ic + '"/></svg></span><span class="sr-tx"><b>' + esc(o.rot) + '</b><small>' + esc(o.sub || '') + '</small></span>' + (o.pill || '') + '</button>').join('')).join('');
  $$('#cmdk-res [data-o]').forEach(b => { b.onclick = () => escolher(Number(b.dataset.o)); b.onmousemove = () => marcar(Number(b.dataset.o)); });
}
function marcar(n) {
  marcada = Math.max(0, Math.min(opcoes.length - 1, n));
  $$('#cmdk-res [data-o]').forEach(b => b.classList.toggle('on', Number(b.dataset.o) === marcada));
  const b = $('#cmdk-res [data-o="' + marcada + '"]'); if (b) b.scrollIntoView({ block: 'nearest' });
}
function escolher(n) { const o = opcoes[n]; if (!o) return; fecharBusca(); o.ir(); }

/* ---------- tema ---------- */
const temaAtual = () => document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
const iconeTema = () => { const esc_ = temaAtual() === 'dark'; $('#btn-tema use').setAttribute('href', esc_ ? '#i-sun' : '#i-moon'); $('#tema-tx').textContent = esc_ ? 'Tema claro' : 'Tema escuro'; };

async function atualizar() {
  const r = await enviar({ cmd: 'atualizar' });
  if (!r.ok) toast(r.erro || 'Não foi possível ler o Onvio', true); else toast('Lido agora');
}

/* ---------- início ---------- */
(async function iniciar() {
  await iniciarEstado();
  desenhar(); aoVivo(); contadores(); iconeTema(); avisarNovos();
  addEventListener('hashchange', () => { fecharAnexos(); fecharDetalhe(); fecharLembrete(); fecharNova(); desenhar(); });
  aoMudar(quais => {
    const ocupado = detalheAberto() || anexosAbertos() || lembreteAberto() || novaAberta() || !$('#cmdk').hidden || document.activeElement.matches('input, select, textarea') || document.querySelector('#vista details[open]');
    const relevante = quais.some(q => ['snap', 'settings', 'regras', 'lembretes', 'serie', 'eventos', 'semCalcMarcas'].includes(q)) && AO_VIVO.has(rota.nome);
    if (relevante && ocupado) redesenharDepois = true;
    if (relevante && !ocupado) {
      redesenharDepois = false;
      const rolagem = $('#vista').scrollTop; desenhar(); $('#vista').scrollTop = rolagem;
    } else if (quais.includes('status')) { if (bloqueado() !== document.body.classList.contains('bloqueado')) desenhar(); else if (!bloqueado()) avisoSessao(); }
    if (quais.includes('eventos')) avisarNovos();
    aoVivo(); contadores();
  });
  // mudou algo com a janela de detalhe aberta (por exemplo, um aviso enviado por ela): redesenha ao fechar
  addEventListener('controlonvio-detalhe-fechado', () => {
    if (!redesenharDepois || !AO_VIVO.has(rota.nome) || lembreteAberto() || novaAberta()) return;
    redesenharDepois = false;
    const rolagem = $('#vista').scrollTop; desenhar(); $('#vista').scrollTop = rolagem;
  });
  setInterval(aoVivo, 5000);
  let t = null;
  addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => aoRedim && aoRedim(), 150); });

  $('#btn-ver-onvio').onclick = () => enviar({ cmd: 'fecharPainel' });
  $('#btn-atualizar').onclick = atualizar;
  $('#btn-sino').onclick = e => { e.stopPropagation(); abrirSino(); };
  document.addEventListener('click', e => {
    if (!$('#sino-painel').hidden && !e.target.closest('#sino-painel')) abrirSino(false);
    $$('#vista details.menu[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; });
  });
  $('#btn-tema').onclick = () => {
    const n = temaAtual() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', n);
    try { localStorage.setItem('controlonvio-theme', n); } catch (e) {}
    iconeTema(); if (aoRedim) aoRedim();
  };
  $('#btn-busca').onclick = abrirBusca;
  $('#rail-busca').onclick = abrirBusca;
  $('#cmdk').addEventListener('mousedown', e => { if (e.target.id === 'cmdk') fecharBusca(); });
  $('#busca-q').addEventListener('input', e => resultados(e.target.value));
  $('#busca-q').addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); marcar(marcada + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); marcar(marcada - 1); }
  });
  $('#busca').onsubmit = e => { e.preventDefault(); escolher(marcada); };
  $('#fundo').onclick = fecharDetalhe;
  addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!$('#cmdk').hidden) fecharBusca();
      else if (anexosAbertos()) fecharAnexos();
      else if (lembreteAberto()) fecharLembrete();
      else if (novaAberta()) { if (!$('#nv-criar[disabled]')) fecharNova(); }
      else if (detalheAberto()) fecharDetalhe();
      else if (!$('#sino-painel').hidden) abrirSino(false);
      return;
    }
    const digitando = e.target.matches('input, select, textarea');
    if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !digitando)) { e.preventDefault(); abrirBusca(); }
  });
})();

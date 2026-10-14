/* Control Onvio · app em tela cheia por cima do Onvio
 * Rotas (#/inicio, #/fila, #/equipe, #/clientes, #/solicitacoes, #/lembretes, #/config, #/busca?q=),
 * barra superior (busca, ao vivo, sino, tema, Ver Onvio) e a gaveta de detalhe. */
import { estado, iniciarEstado, aoMudar, enviar, itens, minhas, marcarAlertasVistos } from './estado.js';
import { $, $$, esc, relativo, fmtHoraS, toast } from './util.js';
import { abrirDetalhe, fecharDetalhe } from './views/detalhe.js';
import * as inicio from './views/inicio.js';
import * as fila from './views/fila.js';
import * as equipe from './views/equipe.js';
import * as clientes from './views/clientes.js';
import * as solicitacoes from './views/solicitacoes.js';
import * as lembretes from './views/lembretes.js';
import * as config from './views/config.js';

const VISTAS = { inicio, fila, equipe, clientes, solicitacoes, lembretes, config, busca: solicitacoes };
// Telas que se redesenham sozinhas quando chega leitura nova (as de consulta sob demanda não).
const AO_VIVO = new Set(['inicio', 'fila', 'equipe', 'clientes', 'lembretes']);

let rota = { nome: 'inicio', params: {} };
let aoRedim = null;

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
const ctx = { navegar, abrirDetalhe, aoRedimensionar: fn => { aoRedim = fn; } };

function desenhar() {
  rota = lerRota();
  aoRedim = null;
  const p = rota.params;
  const ativo = rota.nome === 'busca' ? '' : rota.nome === 'fila' && p.cliente ? 'clientes' : rota.nome === 'fila' && (p.analista || p.escopo === 'equipe' || p.escopo === 'semresp') ? 'equipe' : rota.nome;
  $$('.lateral a').forEach(a => a.classList.toggle('on', a.dataset.rota === ativo));
  const v = $('#vista');
  const params = rota.nome === 'busca' ? Object.assign({ q: rota.params.q || '' }, rota.params) : rota.params;
  try { VISTAS[rota.nome].render(v, ctx, params); }
  catch (e) { console.error(e); v.innerHTML = '<div class="faixa">Algo deu errado ao montar esta tela: ' + esc(e.message) + '</div>'; }
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
  d.innerHTML = '<div style="flex:1;min-width:240px"><b>' + (s.estado === 'sem_sessao' ? 'Sem sessão no Onvio.' : 'A última leitura falhou.') + '</b> ' + esc(s.msg || '') + '</div>' +
    '<button class="btn btn-sm" id="av-tentar">Tentar de novo</button><a class="btn btn-sm" href="#/config">Testar a leitura</a>';
  v.prepend(d);
  $('#av-tentar', d).onclick = () => atualizar();
}

/* ---------- barra superior ---------- */
function aoVivo() {
  const el = $('#aovivo'), tx = $('#aovivo-tx');
  const s = estado.status || {}, seg = estado.settings.tempoRealSeg;
  el.classList.remove('ok', 'parado', 'erro');
  $('#btn-atualizar').classList.toggle('girando', s.estado === 'lendo');
  if (s.estado === 'lendo') { tx.textContent = 'Lendo o Onvio' + (s.etapa ? ' · ' + s.etapa : '…'); return; }
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
  const ne = $('#n-equipe'), late = itens().filter(i => i.nivel === 2).length; ne.textContent = late || ''; ne.classList.toggle('late', !!late);
  $('#n-lembretes').textContent = lembretes.contarPendentes() || '';
  const vistos = estado.alertasVistosEm ? new Date(estado.alertasVistosEm) : new Date(0);
  const novos = (estado.eventos || []).filter(e => new Date(e.em) > vistos && (e.mine || e.tipo === 'semresp')).length;
  $('#sino-cont').textContent = novos ? (novos > 99 ? '99+' : novos) : '';
  $('#quem').textContent = estado.snap && estado.snap.user ? estado.snap.user.nome : '';
}

/* ---------- sino ---------- */
const ICONE = { nova: 'i-plus', respondeu: 'i-chat', prescreve: 'i-alert', atrasou: 'i-alert', semresp: 'i-users', lembrete: 'i-clock' };
function abrirSino(abrir) {
  const p = $('#sino-painel'), b = $('#btn-sino');
  const vai = abrir == null ? p.hidden : abrir;
  p.hidden = !vai; b.setAttribute('aria-expanded', String(vai));
  if (!vai) return;
  const vistos = estado.alertasVistosEm ? new Date(estado.alertasVistosEm) : new Date(0);
  const ev = (estado.eventos || []).filter(e => e.mine || e.tipo === 'semresp').slice(0, 60);
  p.innerHTML = '<h3>Alertas</h3>' + (ev.length ? ev.map(e => '<div class="ev ev-' + esc(e.tipo) + (new Date(e.em) > vistos ? ' novo' : '') + '" data-ev="' + esc(e.id) + '"><svg class="ic"><use href="#' + (ICONE[e.tipo] || 'i-bell') + '"/></svg><div class="tx"><b>' + esc(e.titulo) + '</b><small>' + (e.num ? '#' + esc(e.num) + ' ' + esc(e.typeLabel) + ' · ' : '') + esc(e.cliente) + ' · ' + esc(relativo(e.em)) + '</small></div></div>').join('') : '<div class="vazio">Sem alertas por enquanto. Eles aparecem aqui quando chega solicitação para você, o cliente responde ou algo vai prescrever.</div>');
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

/* ---------- tema ---------- */
const temaAtual = () => document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
const iconeTema = () => $('#btn-tema use').setAttribute('href', temaAtual() === 'dark' ? '#i-sun' : '#i-moon');

async function atualizar() {
  const r = await enviar({ cmd: 'atualizar' });
  if (!r.ok) toast(r.erro || 'Não foi possível ler o Onvio', true); else toast('Lido agora');
}

/* ---------- início ---------- */
(async function iniciar() {
  await iniciarEstado();
  desenhar(); aoVivo(); contadores(); iconeTema(); avisarNovos();
  addEventListener('hashchange', () => { fecharDetalhe(); desenhar(); });
  aoMudar(quais => {
    if (quais.some(q => ['snap', 'settings', 'regras', 'lembretes', 'serie', 'eventos'].includes(q)) && AO_VIVO.has(rota.nome) && $('#gaveta').hidden && !document.activeElement.matches('input, select, textarea')) {
      const rolagem = $('#vista').scrollTop; desenhar(); $('#vista').scrollTop = rolagem;
    } else if (quais.includes('status')) avisoSessao();
    if (quais.includes('eventos')) avisarNovos();
    aoVivo(); contadores();
  });
  setInterval(aoVivo, 5000);
  let t = null;
  addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => aoRedim && aoRedim(), 150); });

  $('#btn-ver-onvio').onclick = () => enviar({ cmd: 'fecharPainel' });
  $('#btn-atualizar').onclick = atualizar;
  $('#btn-sino').onclick = e => { e.stopPropagation(); abrirSino(); };
  document.addEventListener('click', e => { if (!$('#sino-painel').hidden && !e.target.closest('#sino-painel')) abrirSino(false); });
  $('#btn-tema').onclick = () => {
    const n = temaAtual() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', n);
    try { localStorage.setItem('controlonvio-theme', n); } catch (e) {}
    iconeTema(); if (aoRedim) aoRedim();
  };
  $('#busca').onsubmit = e => { e.preventDefault(); const q = $('#busca-q').value.trim(); if (q) navegar('busca', { q }); };
  $('#fundo').onclick = fecharDetalhe;
  addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (!$('#gaveta').hidden) fecharDetalhe(); else if (!$('#sino-painel').hidden) abrirSino(false); }
    if (e.key === '/' && !e.target.matches('input, select, textarea')) { e.preventDefault(); $('#busca-q').focus(); }
  });
})();

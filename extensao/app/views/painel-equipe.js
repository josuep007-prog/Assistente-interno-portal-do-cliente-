/* Peças da equipe: bolinha da leitura ao vivo (Hoje); mapa de calor por idade e
 * sugestão de distribuição (Equipe). Tudo lido do resumo (estado.snap); nada aqui grava no Onvio:
 * a distribuição é só sugestão. */
import { estado, itens } from '../estado.js';
import { esc, plural, ligarItens, fmtHoraS, $, nivelLegal } from '../util.js';
import { mapaDeCalor } from '../graficos.js';
const OC = window.OC;

const SEM = '(sem responsável)';

// mesma ordem das Solicitações (OC.ordemFila)
export const porPrioridade = l => OC.ordemFila(l).map(p => p.item);
const eu = () => (itens().find(i => i.mine) || {}).resp || '';
const nomeResp = r => (r === SEM ? 'Sem analista' : r);

/* ---------- bolinha da leitura ao vivo (Hoje): verde = ao vivo, cinza = parada, vermelha = sem leitura ---------- */
export function estadoLeitura() {
  const s = estado.status || {};
  if (s.estado === 'sem_sessao' || s.estado === 'erro') return 'erro';
  const ver = estado.ultima || (estado.snap && estado.snap.fetchedAt);
  const seg = estado.settings.tempoRealSeg;
  return ver && seg > 0 && Date.now() - new Date(ver) < Math.max(120, seg * 4) * 1000 ? 'ok' : 'parado';
}
export function dicaLeitura(e) {
  const ver = estado.ultima || (estado.snap && estado.snap.fetchedAt);
  return e === 'ok' ? 'Lendo o Onvio ao vivo · última leitura ' + fmtHoraS(ver) : e === 'erro' ? 'Sem leitura do Onvio agora' : 'Leitura parada' + (ver ? ' · última ' + fmtHoraS(ver) : '');
}

/* ---------- mapa de calor (tela Equipe) ---------- */
export function mapaIdadeHtml() {
  const m = OC.mapaIdade(itens());
  const colunas = OC.FAIXAS_IDADE.map(f => ({ id: f.de + '-' + (f.ate == null ? '' : f.ate), rotulo: f.rot }));
  return '<section class="card"><div class="card-h"><h3>Idade da fila por analista</h3><span class="sub ajuda">dias parada · clique numa célula para ver as solicitações</span></div><div class="card-b" id="mapa-idade">' +
    mapaDeCalor(m.linhas.map(l => ({ id: l.resp, rotulo: nomeResp(l.resp), valores: l.por })), colunas, { titulo: 'Solicitações por analista e dias parada', destaque: [eu()], fixo: SEM }) + '</div></section>';
}

/* ---------- sem analista: sugestão de distribuição ---------- */
export function distribuicaoHtml() {
  const it = itens();
  const sem = porPrioridade(it.filter(i => !i.resp));
  const sug = new Map(OC.sugerirDistribuicao(it).map(s => [s.k, s]));
  const cargas = [...OC.cargaEscritorio(it).entries()].sort((a, b) => (a[1] - b[1]) || a[0].localeCompare(b[0], 'pt-BR'));
  return '<section class="card" id="distribuicao"><div class="card-h"><h3>Sem analista: sugestão de distribuição</h3><span class="sub">' + plural(sem.length, 'solicitação', 'solicitações') + '</span><a href="#/fila?escopo=semresp">Ver todas</a></div><div class="card-b">' +
    (sem.length
      ? (cargas.length ? '<p class="dist-res">Menos carregados agora: ' + cargas.slice(0, 4).map(([r, c]) => '<b>' + esc(r) + '</b> (' + c + ')').join(', ') + '. Carga = pendências na vez do escritório, pesadas pela gravidade.</p>' : '') +
        '<div class="dist" id="l-dist">' + sem.slice(0, 8).map(i => { const s = sug.get(i.k); return '<div class="dist-i lvl-' + nivelLegal(i) + '" tabindex="0" data-k="' + esc(i.k) + '"><div class="tx"><div class="m-top"><span class="mono">#' + esc(i.num) + '</span><span>' + esc(i.typeLabel) + '</span></div><b>' + esc(i.apelido || i.cliente || '—') + ' <span class="fraco">· ' + (i.parado || 0) + 'd parada</span></b></div>' + (s ? '<span class="sug">sugerido: <b>' + esc(s.sugerido) + '</b><small>carga ' + s.carga + '</small></span>' : '') + '</div>'; }).join('') + '</div>' +
        '<p class="card-nota">Só sugestão: defina o responsável no Onvio.</p>'
      : '<div class="vazio" style="padding:10px 0"><b>Todas as solicitações têm analista</b>Quando chegar uma sem responsável, a sugestão aparece aqui.</div>') +
    '</div></section>';
}

/* ---------- liga o que estiver na tela (Equipe) ---------- */
export function ligarEquipe(el, ctx) {
  const dist = $('#l-dist', el);
  if (dist) ligarItens(dist, porPrioridade(itens().filter(i => !i.resp)).slice(0, 8), ctx.abrirDetalhe);
  const mapa = $('#mapa-idade', el);
  if (mapa) mapa.addEventListener('click', e => { const c = e.target.closest('[data-col]'); if (c && !c.disabled) ctx.navegar('fila', Object.assign(c.dataset.id === SEM ? { escopo: 'semresp' } : { analista: c.dataset.id }, { idade: c.dataset.col })); });
}

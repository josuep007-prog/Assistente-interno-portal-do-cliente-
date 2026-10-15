/* Peças da equipe: barra viva e mosaico (Hoje); mapa de calor por idade, próximas a prescrever e
 * sugestão de distribuição (Equipe). Tudo lido do resumo (estado.snap); nada aqui grava no Onvio:
 * a distribuição é só sugestão. */
import { estado, itens } from '../estado.js';
import { esc, plural, ligarItens, fmtHoraS, $ } from '../util.js';
import { mapaDeCalor } from '../graficos.js';
const OC = window.OC;

const SEM = '(sem responsável)';

// mesma ordem da fila "Prazo, mais grave primeiro"
export const porPrioridade = l => l.slice().sort((a, b) => ((b.nivel || 0) - (a.nivel || 0)) || ((b.grav || 0) - (a.grav || 0)) || ((b.parado || 0) - (a.parado || 0)));
const eu = () => (itens().find(i => i.mine) || {}).resp || '';
const nomeResp = r => (r === SEM ? 'Sem analista' : r);

/* ---------- barra viva (estilo cotações): só a bolinha, sem rótulo ---------- */
function estadoLeitura() {
  const s = estado.status || {};
  if (s.estado === 'sem_sessao' || s.estado === 'erro') return 'erro';
  const ver = estado.ultima || (estado.snap && estado.snap.fetchedAt);
  const seg = estado.settings.tempoRealSeg;
  return ver && seg > 0 && Date.now() - new Date(ver) < Math.max(120, seg * 4) * 1000 ? 'ok' : 'parado';
}
const TEND = { piorou: '<span class="ft-t sobe" title="Piorou desde a leitura anterior">▲</span>', melhorou: '<span class="ft-t desce" title="Melhorou desde a leitura anterior">▼</span>', nova: '<span class="ft-t nova">NOVA</span>' };
function itemFita(i) {
  return '<button type="button" class="ft-i" data-k="' + esc(i.k) + '" tabindex="-1"><i class="ft-p n' + (i.nivel || 0) + '"></i><b class="mono">#' + esc(i.num) + '</b><span class="ft-c">' + esc(i.apelido || i.cliente || '—') + '</span><span class="ft-y">' + esc(i.typeLabel) + '</span><span class="mono ft-d' + (i.nivel === 2 ? ' late' : i.nivel === 1 ? ' today' : '') + '">' + (i.parado || 0) + 'd</span>' + (TEND[i.tend] || '') + '</button>';
}
export function fitaHtml(lista) {
  const e = estadoLeitura();
  const ver = estado.ultima || (estado.snap && estado.snap.fetchedAt);
  const dica = e === 'ok' ? 'Lendo o Onvio ao vivo · última leitura ' + fmtHoraS(ver) : e === 'erro' ? 'Sem leitura do Onvio agora' : 'Leitura parada' + (ver ? ' · última ' + fmtHoraS(ver) : '');
  const tempo = Math.max(30, lista.length * 4);
  return '<div class="fita ' + e + '" id="fita" role="region" aria-label="Pendências da equipe por prioridade">' +
    '<span class="ft-bola" title="' + esc(dica) + '" aria-label="' + esc(dica) + '"></span>' +
    (lista.length
      ? '<div class="ft-janela"><div class="ft-trilho" style="--ft-tempo:' + tempo + 's"><div class="ft-grupo">' + lista.map(itemFita).join('') + '</div><div class="ft-grupo" aria-hidden="true">' + lista.map(itemFita).join('') + '</div></div></div>'
      : '<div class="ft-janela ft-vazia">' + (estado.snap ? 'Nenhuma pendência na equipe agora.' : 'Aguardando a primeira leitura do Onvio.') + '</div>') +
    '</div>';
}

/* ---------- mosaico da equipe (dados) ---------- */
// Um bloco por analista e um para "Sem analista": total e o pior caso (G3, fora do prazo, atenção, em dia).
export function blocosEquipe(lista) {
  const meu = eu();
  return OC.porAnalista(lista || itens()).map(r => ({
    id: r.resp, rot: nomeResp(r.resp), n: r.total, sem: r.resp === SEM, eu: !!meu && r.resp === meu,
    nivel: r.g3 ? 'g3' : r.vermelho ? 'g2' : r.amarelo ? 'g1' : 'ok',
    det: [r.vermelho ? r.vermelho + ' fora do prazo' : '', r.g3 ? r.g3 + ' crítica(s)' : '', !r.vermelho && r.amarelo ? r.amarelo + ' em atenção' : ''].filter(Boolean).join(' · ')
  }));
}

/* ---------- prescrição e mapa de calor (tela Equipe) ---------- */
const prescLista = () => itens().filter(i => i.lado === 'cli' && i.prescreveEm != null && i.prescreveEm <= 7).sort((a, b) => a.prescreveEm - b.prescreveEm);
export function prescricaoHtml() {
  const presc = prescLista();
  return '<section class="card"><div class="card-h"><h3>Próximas a prescrever</h3><span class="sub">vez do cliente · ' + presc.length + '</span><a href="#/fila?escopo=equipe&kpi=prescreve">Ver todas</a></div><div class="card-b" id="l-presc">' +
    (presc.length ? presc.slice(0, 7).map(i => '<div class="item-ag clicavel presc" tabindex="0" data-k="' + esc(i.k) + '"><span class="cd' + (i.prescreveEm <= 3 ? ' late' : '') + '"><b>' + i.prescreveEm + '</b>' + (i.prescreveEm === 1 ? 'dia' : 'dias') + '</span><div class="tx"><b>' + esc(i.apelido || i.cliente || '—') + '</b><small>#' + esc(i.num) + ' ' + esc(i.typeLabel) + ' · ' + esc(i.resp || 'sem analista') + '</small></div></div>').join('') : '<div class="vazio" style="padding:10px 0">Nada perto de prescrever na próxima semana.</div>') +
    '</div></section>';
}
export function mapaIdadeHtml() {
  const m = OC.mapaIdade(itens());
  const colunas = OC.FAIXAS_IDADE.map(f => ({ id: f.de + '-' + (f.ate == null ? '' : f.ate), rotulo: f.rot }));
  return '<section class="card"><div class="card-h"><h3>Idade da fila por analista</h3><span class="sub">dias parada · clique numa célula para ver as solicitações</span></div><div class="card-b" id="mapa-idade">' +
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
        '<div class="dist" id="l-dist">' + sem.slice(0, 8).map(i => { const s = sug.get(i.k); return '<div class="dist-i lvl-' + (i.nivel || 0) + '" tabindex="0" data-k="' + esc(i.k) + '"><div class="tx"><div class="m-top"><span class="mono">#' + esc(i.num) + '</span><span>' + esc(i.typeLabel) + '</span></div><b>' + esc(i.apelido || i.cliente || '—') + ' <span class="fraco">· ' + (i.parado || 0) + 'd parada</span></b></div>' + (s ? '<span class="sug">sugerido: <b>' + esc(s.sugerido) + '</b><small>carga ' + s.carga + '</small></span>' : '') + '</div>'; }).join('') + '</div>' +
        '<p class="card-nota">Só sugestão: defina o responsável no Onvio.</p>'
      : '<div class="vazio" style="padding:10px 0"><b>Todas as solicitações têm analista</b>Quando chegar uma sem responsável, a sugestão aparece aqui.</div>') +
    '</div></section>';
}

/* ---------- liga o que estiver na tela (Equipe) ---------- */
export function ligarEquipe(el, ctx) {
  const presc = $('#l-presc', el);
  if (presc) ligarItens(presc, prescLista().slice(0, 7), ctx.abrirDetalhe);
  const dist = $('#l-dist', el);
  if (dist) ligarItens(dist, porPrioridade(itens().filter(i => !i.resp)).slice(0, 8), ctx.abrirDetalhe);
  const mapa = $('#mapa-idade', el);
  if (mapa) mapa.addEventListener('click', e => { const c = e.target.closest('[data-col]'); if (c && !c.disabled) ctx.navegar('fila', Object.assign(c.dataset.id === SEM ? { escopo: 'semresp' } : { analista: c.dataset.id }, { idade: c.dataset.col })); });
}

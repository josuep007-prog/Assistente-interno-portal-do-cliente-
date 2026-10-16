/* Distribuir · sugere o responsável de cada solicitação sem responsável: quem mais atendeu aquela empresa no
 * período (solicitações movimentadas, em qualquer situação). Admissões (os 3 Cadastros) não entram nessa conta e vão
 * para quem mais fez admissões. Lido na hora pelo service worker (cmd 'distribuicao'); nada é guardado.
 * "Atribuir" define o responsável no Onvio (cmd 'acao', assign-staff) depois de confirmar; só nas listas em que o
 * formato foi mapeado (OC.podeAcao). Nas outras, abra no Onvio. */
import { estado, itens, enviar } from '../estado.js';
import { esc, toast, ligarItens, plural, pillSituacao, $, $$ } from '../util.js';
const OC = window.OC;

let dias = 7;
let resultado = null;   // { dias, movimentadas, erros, sugestoes }
let lendo = false;
let escolha = {};       // k -> id do responsável escolhido (troca da sugestão), só nesta visita
let confirmar = null;   // null | 'todas' | k (confirmação pendente)
let estadoK = {};       // k -> 'enviando' | 'ok' | mensagem de erro
let trabalhando = false;

export function render(el, ctx) {
  ctx.cab({
    titulo: 'Distribuir',
    sub: 'Quem mais atendeu cada empresa ' + (dias === 7 ? 'na última semana' : 'nos últimos ' + dias + ' dias') + ' · admissões à parte'
  });
  const sem = (estado.snap ? estado.snap.items || [] : []).filter(i => !i.resp);
  const atribuiveis = resultado ? resultado.sugestoes.filter(x => OC.podeAcao('responsavel', x.item).ok && idEscolhido(x) && estadoK[x.item.k] !== 'ok') : [];
  el.innerHTML =
    '<div class="barra">' +
      '<span class="rotulo">Período</span><div class="seg" role="group" aria-label="Período">' + [7, 14, 30].map(d => '<button data-dias="' + d + '"' + (dias === d ? ' class="on"' : '') + '>' + (d === 7 ? 'Última semana' : d + ' dias') + '</button>').join('') + '</div>' +
      '<button class="btn btn-sm" id="d-recalc"' + (lendo || trabalhando ? ' disabled' : '') + '><svg class="ic ic-sm"><use href="#i-refresh"/></svg> ' + (lendo ? 'Lendo o Onvio…' : 'Recalcular') + '</button>' +
      '<span class="count">' + plural(sem.length, 'sem responsável', 'sem responsável') + (resultado ? ' · ' + plural(resultado.movimentadas, 'movimentada', 'movimentadas') + ' no período' : '') + '</span>' +
      '<span class="spacer" style="flex:1"></span>' +
      '<button class="btn btn-sm btn-primary" id="d-todas"' + (atribuiveis.length && !trabalhando ? '' : ' disabled') + '><svg class="ic ic-sm"><use href="#i-user"/></svg> Atribuir todas (' + atribuiveis.length + ')</button>' +
    '</div>' +
    (confirmar === 'todas' ? '<div class="acao-conf" id="d-conf"><b>Definir o responsável de ' + plural(atribuiveis.length, 'solicitação', 'solicitações') + ' no Onvio?</b><ul>' +
      porPessoa(atribuiveis).map(([n, q]) => '<li>' + esc(n) + ': ' + q + '</li>').join('') + '</ul><p class="fraco">Fica registrado no Onvio em seu nome. Cadastro e Rubricas ficam de fora (ainda não mapeados).</p>' +
      '<div class="acao-pe"><button class="btn btn-sm" id="d-cancelar">Cancelar</button><button class="btn btn-sm btn-primary" id="d-confirmar">Confirmar e atribuir</button></div></div>' : '') +
    (resultado && resultado.erros && resultado.erros.length ? '<div class="faixa warn"><svg class="ic"><use href="#i-alert"/></svg>Algumas listas não foram lidas: ' + esc(resultado.erros.join(' · ')) + '. As sugestões podem estar incompletas.</div>' : '') +
    '<div id="d-corpo">' + corpo(sem) + '</div>';

  $$('[data-dias]', el).forEach(b => b.onclick = () => { dias = Number(b.dataset.dias); resultado = null; estadoK = {}; render(el, ctx); });
  $('#d-recalc', el).onclick = () => { resultado = null; estadoK = {}; render(el, ctx); };
  $$('[data-esc]', el).forEach(s => s.onchange = e => { escolha[s.dataset.esc] = e.target.value; render(el, ctx); });
  $$('[data-esc], [data-atr], [data-conf-k], [data-canc-k]', el).forEach(s => s.addEventListener('click', e => e.stopPropagation()));
  $$('[data-atr]', el).forEach(b => b.onclick = () => { confirmar = b.dataset.atr; render(el, ctx); });
  $$('[data-canc-k]', el).forEach(b => b.onclick = () => { confirmar = null; render(el, ctx); });
  $$('[data-conf-k]', el).forEach(b => b.onclick = async () => {
    const x = resultado.sugestoes.find(s => s.item.k === b.dataset.confK);
    confirmar = null; await atribuir([x], el, ctx);
  });
  $('#d-todas', el).onclick = () => { confirmar = 'todas'; render(el, ctx); };
  if ($('#d-cancelar', el)) $('#d-cancelar', el).onclick = () => { confirmar = null; render(el, ctx); };
  if ($('#d-confirmar', el)) $('#d-confirmar', el).onclick = async () => { confirmar = null; await atribuir(atribuiveis, el, ctx); };
  if (resultado) ligarItens($('#d-corpo', el), resultado.sugestoes.map(x => x.item), ctx.abrirDetalhe);

  if (!resultado && !lendo && estado.snap) {
    lendo = true;
    enviar({ cmd: 'distribuicao', dias }).then(r => {
      lendo = false;
      if (!r.ok) { toast('Não foi possível ler o Onvio: ' + (r.erro || ''), true); resultado = { dias, movimentadas: 0, erros: [r.erro || 'erro'], sugestoes: OC.distribuirPorCliente(estado.snap.items || [], [], dias) }; }
      else resultado = r;
      if (location.hash.startsWith('#/distribuir')) render(el, ctx);
    });
    $('#d-recalc', el).disabled = true;
  }
}

const equipe = () => OC.equipeDe(itens());
const idEscolhido = x => escolha[x.item.k] || x.respId || '';
const nomeDoId = (x, id) => (equipe().find(p => p.id === id) || {}).nome || (id === x.respId ? x.resp : '') || '';
function porPessoa(lista) {
  const m = {};
  lista.forEach(x => { const n = nomeDoId(x, idEscolhido(x)) || '?'; m[n] = (m[n] || 0) + 1; });
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

// Uma por vez (o Onvio responde a cada uma); o resultado aparece na linha.
async function atribuir(lista, el, ctx) {
  trabalhando = true;
  let ok = 0, erro = 0;
  for (const x of lista) {
    estadoK[x.item.k] = 'enviando'; render(el, ctx);
    const r = await enviar({ cmd: 'acao', acao: 'responsavel', type: x.item.type, num: String(x.item.num), analista: idEscolhido(x) });
    if (r.ok) { estadoK[x.item.k] = 'ok'; ok++; } else { estadoK[x.item.k] = r.erro || 'o Onvio não aceitou'; erro++; }
  }
  trabalhando = false;
  toast(ok + ' atribuída(s)' + (erro ? ' · ' + erro + ' com erro (veja na lista)' : ''), erro > 0);
  render(el, ctx);
}

function corpo(sem) {
  if (!estado.snap) return '<div class="list-card"><div class="vazio"><b>Aguardando a primeira leitura do Onvio</b></div></div>';
  if (!sem.length && !resultado) return '<div class="list-card"><div class="vazio"><b>Nenhuma solicitação sem responsável</b>Quando chegar uma, a sugestão aparece aqui.</div></div>';
  if (!resultado) return '<div class="list-card"><div class="vazio"><b>Lendo as solicitações movimentadas no período…</b>Conta, por empresa, quem atendeu cada uma.</div></div>';
  if (!resultado.sugestoes.length) return '<div class="list-card"><div class="vazio"><b>Nenhuma solicitação sem responsável</b></div></div>';
  const eq = equipe();
  const porResp = porPessoa(resultado.sugestoes.filter(x => estadoK[x.item.k] !== 'ok'));
  return '<div class="dist-resumo">' + porResp.map(([r, n]) => '<span><b>' + esc(r) + '</b> ' + n + '</span>').join('') + '</div>' +
    '<div class="list-card distrib" style="--cols:64px minmax(0,1.2fr) 150px minmax(0,1.8fr) 150px">' + resultado.sugestoes.map(x => {
      const i = x.item, atual = idEscolhido(x), st = estadoK[i.k];
      const opcoes = [{ id: x.respId, nome: x.resp }].concat(x.alternativas.map(a => ({ id: a.respId, nome: a.resp })), eq).filter((p, n, a) => p.id && a.findIndex(q => q.id === p.id) === n);
      const pode = OC.podeAcao('responsavel', i);
      const acao = st === 'ok' ? '<span class="ok-t">Atribuída ✓</span>'
        : st === 'enviando' ? '<span class="fraco">Enviando…</span>'
        : confirmar === i.k ? '<span class="dist-conf"><button class="btn btn-sm" data-canc-k="1">Não</button><button class="btn btn-sm btn-primary" data-conf-k="' + esc(i.k) + '">Confirmar</button></span>'
        : '<button class="btn btn-sm" data-atr="' + esc(i.k) + '"' + (pode.ok && atual && !trabalhando ? '' : ' disabled title="' + esc(pode.ok ? 'escolha o responsável' : pode.motivo) + '"') + '>Atribuir</button>';
      return '<div class="lr dist-l lvl-' + (i.nivel || 0) + '" tabindex="0" data-k="' + esc(i.k) + '">' +
        '<span class="mono">#' + esc(i.num) + '</span>' +
        '<span><div class="c-main">' + esc(i.apelido || i.cliente || '—') + '</div><div class="c-sub">' + esc([i.typeLabel, i.detalhe].filter(Boolean).join(' · ')) + '</div></span>' +
        '<span>' + pillSituacao(i) + '<div class="c-sub">parada há ' + (i.parado || 0) + 'd</div></span>' +
        '<span class="dist-sug"><label>Sugestão<select data-esc="' + esc(i.k) + '" aria-label="Responsável"' + (st === 'ok' ? ' disabled' : '') + '>' +
          (atual ? '' : '<option value="" selected>Escolha o responsável…</option>') +
          opcoes.map(p => '<option value="' + esc(p.id) + '"' + (p.id === atual ? ' selected' : '') + '>' + esc(p.nome) + '</option>').join('') +
        '</select></label><small' + (x.semHistorico ? ' class="today"' : '') + '>' + esc(x.motivo) + (x.alternativas.length ? ' · depois: ' + esc(x.alternativas.map(a => a.resp + ' (' + a.n + ')').join(', ')) : '') + '</small>' +
          (st && st !== 'ok' && st !== 'enviando' ? '<small class="late">' + esc(st) + '</small>' : '') + '</span>' +
        '<span class="dist-acao">' + acao + '</span>' +
        '</div>';
    }).join('') + '</div>';
}

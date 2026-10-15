/* Distribuir · sugere o responsável de cada solicitação sem responsável: quem mais atendeu aquela empresa no
 * período (solicitações movimentadas, em qualquer situação). Admissões (os 3 Cadastros) não entram nessa conta e vão
 * para quem mais fez admissões. Lido na hora pelo service worker (cmd 'distribuicao'); nada é guardado.
 * Atribuir direto daqui é a fase 2 (precisa do mapeamento de "Definir responsável"); por enquanto, o botão abre
 * a solicitação no Onvio para definir o responsável sugerido. */
import { estado, enviar } from '../estado.js';
import { esc, toast, ligarItens, plural, pillSituacao, $, $$ } from '../util.js';
const OC = window.OC;

let dias = 7;
let resultado = null;   // { dias, movimentadas, erros, sugestoes }
let lendo = false;
let escolha = {};       // k -> responsável escolhido (troca da sugestão), só nesta visita

export function render(el, ctx) {
  ctx.cab({
    titulo: 'Distribuir',
    sub: 'Quem mais atendeu cada empresa ' + (dias === 7 ? 'na última semana' : 'nos últimos ' + dias + ' dias') + ' · admissões à parte'
  });
  const sem = (estado.snap ? estado.snap.items || [] : []).filter(i => !i.resp);
  el.innerHTML =
    '<div class="barra">' +
      '<span class="rotulo">Período</span><div class="seg" role="group" aria-label="Período">' + [7, 14, 30].map(d => '<button data-dias="' + d + '"' + (dias === d ? ' class="on"' : '') + '>' + (d === 7 ? 'Última semana' : d + ' dias') + '</button>').join('') + '</div>' +
      '<button class="btn btn-sm" id="d-recalc"' + (lendo ? ' disabled' : '') + '><svg class="ic ic-sm"><use href="#i-refresh"/></svg> ' + (lendo ? 'Lendo o Onvio…' : 'Recalcular') + '</button>' +
      '<span class="count">' + plural(sem.length, 'sem responsável', 'sem responsável') + (resultado ? ' · ' + plural(resultado.movimentadas, 'movimentada', 'movimentadas') + ' no período' : '') + '</span>' +
      '<span class="spacer" style="flex:1"></span>' +
      '<button class="btn btn-sm" disabled title="Chega na fase 2, depois do mapeamento de Definir responsável no Onvio"><svg class="ic ic-sm"><use href="#i-lock"/></svg> Atribuir todas</button>' +
    '</div>' +
    '<div class="aviso-linha"><svg class="ic"><use href="#i-alert"/></svg><span>Atribuir direto daqui chega na fase 2, depois do mapeamento de "Definir responsável". Por enquanto, clique na solicitação e use "Abrir no Onvio" para definir o responsável sugerido.</span></div>' +
    (resultado && resultado.erros && resultado.erros.length ? '<div class="faixa warn"><svg class="ic"><use href="#i-alert"/></svg>Algumas listas não foram lidas: ' + esc(resultado.erros.join(' · ')) + '. As sugestões podem estar incompletas.</div>' : '') +
    '<div id="d-corpo">' + corpo(sem) + '</div>';

  $$('[data-dias]', el).forEach(b => b.onclick = () => { dias = Number(b.dataset.dias); resultado = null; render(el, ctx); });
  $('#d-recalc', el).onclick = () => { resultado = null; render(el, ctx); };
  $$('[data-esc]', el).forEach(s => s.onchange = e => { escolha[s.dataset.esc] = e.target.value; e.stopPropagation(); });
  $$('[data-esc]', el).forEach(s => s.onclick = e => e.stopPropagation());
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

function corpo(sem) {
  if (!estado.snap) return '<div class="list-card"><div class="vazio"><b>Aguardando a primeira leitura do Onvio</b></div></div>';
  if (!sem.length) return '<div class="list-card"><div class="vazio"><b>Nenhuma solicitação sem responsável</b>Quando chegar uma, a sugestão aparece aqui.</div></div>';
  if (!resultado) return '<div class="list-card"><div class="vazio"><b>Lendo as solicitações movimentadas no período…</b>Conta, por empresa, quem atendeu cada uma.</div></div>';
  const resps = [...new Set((estado.snap.items || []).map(i => i.resp).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const porResp = resultado.sugestoes.reduce((m, x) => { const r = escolha[x.item.k] || x.resp || '—'; m[r] = (m[r] || 0) + 1; return m; }, {});
  return '<div class="dist-resumo">' + Object.entries(porResp).sort((a, b) => b[1] - a[1]).map(([r, n]) => '<span><b>' + esc(r) + '</b> ' + n + '</span>').join('') + '</div>' +
    '<div class="list-card distrib" style="--cols:64px minmax(0,1.2fr) 150px minmax(0,1.8fr)">' + resultado.sugestoes.map(x => {
      const i = x.item, atual = escolha[i.k] || x.resp;
      return '<div class="lr dist-l lvl-' + (i.nivel || 0) + '" tabindex="0" data-k="' + esc(i.k) + '">' +
        '<span class="mono">#' + esc(i.num) + '</span>' +
        '<span><div class="c-main">' + esc(i.apelido || i.cliente || '—') + '</div><div class="c-sub">' + esc([i.typeLabel, i.detalhe].filter(Boolean).join(' · ')) + '</div></span>' +
        '<span>' + pillSituacao(i) + '<div class="c-sub">parada há ' + (i.parado || 0) + 'd</div></span>' +
        '<span class="dist-sug"><label>Sugestão<select data-esc="' + esc(i.k) + '" aria-label="Responsável">' +
          [x.resp].concat(x.alternativas.map(a => a.resp), resps).filter((r, n, a) => r && a.indexOf(r) === n).map(r => '<option' + (r === atual ? ' selected' : '') + '>' + esc(r) + '</option>').join('') +
        '</select></label><small' + (x.semHistorico ? ' class="today"' : '') + '>' + esc(x.motivo) + (x.alternativas.length ? ' · depois: ' + esc(x.alternativas.map(a => a.resp + ' (' + a.n + ')').join(', ')) : '') + '</small></span>' +
        '</div>';
    }).join('') + '</div>';
}

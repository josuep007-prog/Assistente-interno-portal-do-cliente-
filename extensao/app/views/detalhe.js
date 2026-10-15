/* Detalhe de uma solicitação (janela grande, como a da empresa no Departamento Pessoal).
 * Lê dados e trâmites na hora; nada disso é guardado. Com a lista de onde veio, anda para a
 * anterior/próxima (setas ← → ou os botões do topo) sem fechar. */
import { estado, itens, enviar, salvarLembretes, aoMudar } from '../estado.js';
import { esc, pillSituacao, motivosHtml, fmtDataHora, fmtData, textoPuro, toast, ladoTexto, relativo, $, $$ } from '../util.js';
import { abrirLembrete, lembreteAberto } from './lembrete-dlg.js';
const OC = window.OC;

let atual = null;        // { type, num }
let aba = 'tramites';
let lista = null;        // lista de onde a pessoa abriu (para anterior/próxima)
let ultimo = null;       // { i, r, erro, carregando } para redesenhar ao trocar de aba ou ao mudar lembretes

export const detalheAberto = () => !$('#gaveta').hidden;
export function fecharDetalhe() {
  $('#gaveta').hidden = true; $('#fundo').hidden = true;
  $('#gaveta').innerHTML = '';
  atual = null; lista = null; ultimo = null;
}

// ref: item da fila, evento do sino ou lembrete (precisa de type e num); fonte: lista para navegar
export async function abrirDetalhe(ref, fonte) {
  if (!ref || !ref.type || ref.num == null) return;
  const t = OC.TYPE_BY_KEY[ref.type];
  if (!t) return;
  if (fonte !== undefined) lista = Array.isArray(fonte) && fonte.length > 1 ? fonte : null;
  atual = { type: ref.type, num: String(ref.num) };
  if (aba === 'lembretes' && !ultimo) aba = 'tramites';
  const doResumo = itens().find(i => i.type === ref.type && String(i.num) === String(ref.num));
  const base = doResumo || (ref.status ? ref : { type: ref.type, typeLabel: t.label, num: ref.num, status: 'Carregando…', lado: 'desc', apelido: ref.cliente || '' });
  const g = $('#gaveta');
  g.hidden = false; $('#fundo').hidden = false;
  desenhar(base, null, null, true);
  g.focus();
  const meu = atual;
  const r = await enviar({ cmd: 'detalhe', type: ref.type, num: String(ref.num) });
  if (atual !== meu) return;                                        // a pessoa já abriu outra
  if (!r.ok) { desenhar(base, null, 'Não foi possível ler a solicitação no Onvio: ' + (r.erro || ''), false); return; }
  desenhar(Object.assign({}, base, r.item), r, null, false);
}

const posicao = () => lista ? lista.findIndex(x => x.type === atual.type && String(x.num) === atual.num) : -1;
function andar(d) {
  const p = posicao();
  if (p < 0) return;
  const prox = lista[p + d];
  if (prox) abrirDetalhe(prox);
}
const meusLembretes = i => (estado.lembretes || []).filter(l => l.type === i.type && String(l.num) === String(i.num));

function desenhar(i, r, erro, carregando) {
  ultimo = { i, r, erro, carregando };
  const g = $('#gaveta');
  const tramites = r && r.tramites;
  const lems = meusLembretes(i);
  const p = posicao();
  const ultimoTr = tramites && tramites.length ? tramites[tramites.length - 1] : null;
  g.innerHTML =
    '<div class="dlg-head"><div class="tt">' +
      '<div class="dlg-l1"><span class="mono">#' + esc(i.num) + '</span><span>' + esc(i.typeLabel) + '</span>' + pillSituacao(i) + (i.lado === 'esc' || i.lado === 'cli' ? '<span>vez: <b>' + ladoTexto(i) + '</b></span>' : '') + '</div>' +
      '<h2>' + esc(i.apelido || i.cliente || 'Solicitação') + '</h2>' +
      '<div class="dlg-l3">' + esc(i.detalhe || i.assunto || '') + '</div>' +
      ((i.motivos && i.motivos.length) || i.abaProvavel || i.grav === 3 ? '<div class="motivos">' + motivosHtml(i) + '</div>' : '') +
    '</div>' +
    (p >= 0 ? '<div class="dlg-nav"><button class="icon-btn" id="g-ant" title="Anterior (←)" aria-label="Anterior"' + (p <= 0 ? ' disabled' : '') + '><svg class="ic"><use href="#i-chev-l"/></svg></button><span>' + (p + 1) + ' de ' + lista.length + '</span><button class="icon-btn" id="g-prox" title="Próxima (→)" aria-label="Próxima"' + (p >= lista.length - 1 ? ' disabled' : '') + '><svg class="ic"><use href="#i-chev-r"/></svg></button></div>' : '') +
    '<button class="icon-btn" id="g-fechar" aria-label="Fechar" title="Fechar (Esc)"><svg class="ic"><use href="#i-x"/></svg></button></div>' +
    '<div class="dp-last">' +
      '<span>Responsável: <b>' + esc(i.resp || 'sem responsável') + '</b></span>' +
      (i.last ? '<span>Último trâmite: <b>' + esc(fmtDataHora(i.last)) + '</b>' + (ultimoTr && ultimoTr.autor ? ' por ' + esc(ultimoTr.autor) : '') + '</span>' : '') +
      (i.parado != null ? '<span>Parada há <b>' + i.parado + ' dia(s)</b></span>' : '') +
      (i.due ? '<span>Expectativa: <b>' + esc(fmtData(i.due)) + '</b></span>' : '') +
    '</div>' +
    '<div class="dtabs" role="tablist">' +
      '<button class="dtab' + (aba === 'tramites' ? ' on' : '') + '" data-aba="tramites" role="tab">Trâmites<span class="n">' + (tramites ? tramites.length : '') + '</span></button>' +
      '<button class="dtab' + (aba === 'dados' ? ' on' : '') + '" data-aba="dados" role="tab">Dados</button>' +
      '<button class="dtab' + (aba === 'lembretes' ? ' on' : '') + '" data-aba="lembretes" role="tab">Lembretes<span class="n">' + (lems.filter(l => !l.feito).length || '') + '</span></button>' +
    '</div>' +
    '<div class="dlg-body" id="g-corpo">' + (erro ? '<div class="faixa"><svg class="ic"><use href="#i-alert"/></svg>' + esc(erro) + '</div>' : '') +
      (aba === 'dados' ? dados(i) : aba === 'lembretes' ? lembretesHtml(lems) : tramitesHtml(r, carregando)) + '</div>' +
    '<div class="dlg-actions">' +
      '<button class="btn btn-sm" id="g-onvio"><svg class="ic ic-sm"><use href="#i-link"/></svg> Abrir no Onvio</button>' +
      '<span class="em-breve" title="Chegam na próxima versão, depois do mapeamento das ações">' +
        '<button class="btn btn-sm" disabled><svg class="ic ic-sm"><use href="#i-lock"/></svg> Responder</button>' +
        '<button class="btn btn-sm" disabled>Definir responsável</button>' +
        '<button class="btn btn-sm" disabled>Alterar expectativa</button>' +
        '<button class="btn btn-sm" disabled><svg class="ic ic-sm"><use href="#i-paperclip"/></svg> Anexar</button></span>' +
      '<span class="spacer"></span>' +
      '<button class="btn btn-primary btn-sm" id="g-lembrete"><svg class="ic ic-sm"><use href="#i-clock"/></svg> Lembrete</button>' +
      '<p class="dlg-nota">Responder, definir responsável, expectativa e anexos chegam na próxima versão, depois do mapeamento das ações. Por enquanto, use "Abrir no Onvio".</p>' +
    '</div>';

  $('#g-fechar').onclick = fecharDetalhe;
  if ($('#g-ant')) { $('#g-ant').onclick = () => andar(-1); $('#g-prox').onclick = () => andar(1); }
  $$('[data-aba]', g).forEach(b => b.onclick = () => { aba = b.dataset.aba; desenhar(i, r, erro, carregando); });
  $('#g-onvio').onclick = async () => {
    const x = await enviar({ cmd: 'abrir', item: { type: i.type, num: String(i.num) } });
    if (!x.ok) toast('Não foi possível abrir no Onvio: ' + (x.erro || ''), true);
  };
  $('#g-lembrete').onclick = () => abrirLembrete({ vinculo: { type: i.type, num: String(i.num), k: i.k || null, cliente: i.apelido || i.cliente } });
  $$('[data-l]', g).forEach(row => row.addEventListener('click', async e => {
    const l = estado.lembretes.find(x => x.id === row.dataset.l);
    if (!l) return;
    const b = e.target.closest('[data-a]');
    if (!b) { abrirLembrete({ l }); return; }
    await salvarLembretes(estado.lembretes.map(x => x.id !== l.id ? x : b.dataset.a === 'feito' ? OC.concluirLembrete(x, new Date(), estado.settings.feriados) : Object.assign({}, x, { feito: false, disparado: false })));
  }));
}

function tramitesHtml(r, carregando) {
  if (carregando) return '<div class="vazio">Lendo os trâmites no Onvio…</div>';
  if (!r) return '<div class="vazio">Sem trâmites para mostrar.</div>';
  if (r.erroTramites) return '<div class="faixa warn"><svg class="ic"><use href="#i-alert"/></svg>Não foi possível ler os trâmites (' + esc(r.erroTramites) + '). Use "Abrir no Onvio" para ver o histórico.</div>';
  const l = r.tramites || [];
  if (!l.length) return '<div class="vazio"><b>Nenhum trâmite ainda</b>A solicitação ainda não teve resposta.</div>';
  return '<div class="tl">' + l.slice().reverse().map(x =>
    '<div class="tl-item' + (/^cliente\b/i.test(x.autor || '') ? ' cli' : '') + '"><div class="meta"><b>#' + String(x.n).padStart(2, '0') + '</b><span class="pill">' + esc(x.situacao) + '</span><span>' + esc(x.autor || '—') + '</span><span title="' + esc(fmtDataHora(x.em)) + '">' + esc(fmtDataHora(x.em)) + (relativo(x.em) !== fmtDataHora(x.em) ? ' · ' + esc(relativo(x.em)) : '') + '</span></div>' +
    (x.texto ? '<div class="texto-longo">' + esc(textoPuro(x.texto)) + '</div>' : '') +
    (x.anexos && x.anexos.length ? '<div class="anexos">' + x.anexos.map(a => '<span><svg class="ic ic-sm"><use href="#i-paperclip"/></svg>' + esc(a) + '</span>').join('') + '</div>' : '') +
    '</div>').join('') + '</div>';
}

function dados(i) {
  const campos = [
    ['Cliente', i.cliente], ['Apelido', i.apelido], ['Responsável', i.resp || 'sem responsável'], ['Solicitante', i.solicitante],
    ['Aberta em', fmtDataHora(i.created)], ['Último trâmite', fmtDataHora(i.last)], ['Expectativa de conclusão', i.due ? fmtData(i.due) : ''],
    ['Departamento', i.departamento], ['Meio da solicitação', i.meio], ['Data de admissão', i.admissao ? fmtData(i.admissao) : ''],
    ['Competência', i.competencia ? i.competencia.slice(5, 7) + '/' + i.competencia.slice(0, 4) : ''],
    ['Dias parada', i.parado != null ? i.parado + ' dia(s)' : ''], ['Prescreve em', i.prescreveEm != null ? i.prescreveEm + ' dia(s)' : ''],
    ['1º trâmite', i.ptUteis != null ? i.ptUteis + ' dia(s) útil(eis) · estimativa' : '']
  ].filter(c => c[1]);
  return '<div class="campos">' + campos.map(([k, v]) => '<div class="campo"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div></div>').join('') + '</div>' +
    (i.assunto ? '<div class="campo" style="margin-bottom:14px"><div class="k">Assunto</div><div class="v">' + esc(i.assunto) + '</div></div>' : '') +
    (i.descricao ? '<div class="campo"><div class="k">Descrição</div><div class="texto-longo" style="margin-top:4px">' + esc(textoPuro(i.descricao)) + '</div></div>' : '');
}

function lembretesHtml(lems) {
  if (!lems.length) return '<div class="vazio"><b>Nenhum lembrete nesta solicitação</b>Use "Lembrete" para ser avisado na hora certa (por exemplo, para cobrar o cliente).</div>';
  return lems.sort((a, b) => a.quando.localeCompare(b.quando)).map(l => {
    const s = OC.situacaoLembrete(l);
    return '<div class="item-ag clicavel ' + (s === 'atrasado' ? 'late' : s === 'hoje' ? 'today' : '') + '" data-l="' + esc(l.id) + '"><svg class="ic"><use href="#i-clock"/></svg>' +
      '<div class="tx"><b' + (l.feito ? ' class="feito-tx"' : '') + '>' + esc(l.texto) + '</b><small>' + esc(fmtDataHora(l.quando)) + (l.rep && l.rep !== 'nao' ? ' · ' + esc(OC.REPETICOES[l.rep]) : '') + '</small></div>' +
      '<div class="acts">' + (l.feito ? '<button class="btn btn-sm" data-a="reabrir">Reabrir</button>' : '<button class="btn btn-sm" data-a="feito"><svg class="ic ic-sm"><use href="#i-check"/></svg> Feito</button>') + '</div></div>';
  }).join('');
}

// Setas ← → andam na lista; lembretes mudaram com a janela aberta: redesenha a aba.
addEventListener('keydown', e => {
  if (!detalheAberto() || lembreteAberto() || e.target.matches('input, select, textarea')) return;
  if (e.key === 'ArrowLeft') andar(-1);
  else if (e.key === 'ArrowRight') andar(1);
});
aoMudar(quais => {
  if (quais.includes('lembretes') && detalheAberto() && ultimo) desenhar(ultimo.i, ultimo.r, ultimo.erro, ultimo.carregando);
});

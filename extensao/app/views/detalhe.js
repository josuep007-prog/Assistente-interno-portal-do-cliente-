/* Detalhe de uma solicitação (janela grande, como a da empresa no Departamento Pessoal).
 * Lê dados e trâmites na hora; nada disso é guardado. Com a lista de onde veio, anda para a
 * anterior/próxima (setas ← → ou os botões do topo) sem fechar. */
import { estado, itens, enviar, salvarLembretes, aoMudar } from '../estado.js';
import { formAcao, ligarAcao, novaAcao, acaoAberta } from './acao-form.js';
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
  if ((aba === 'lembretes' || aba === 'acao') && !ultimo) aba = 'tramites';
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
  // prazo legal de pagamento (férias e rescisão): o da leitura ou, no detalhe, calculado das datas lidas agora
  const pl = i.pagamentoAte || (r && r.datas ? (x => x && { alvo: OC.ymd(x.alvo), ref: x.ref })(OC.prazoPagamento(i.type, r.datas, estado.settings)) : null);
  const pagto = pl && pl.alvo ? { dt: pl.alvo.slice(8, 10) + '/' + pl.alvo.slice(5, 7) + '/' + pl.alvo.slice(0, 4), faltam: OC.uteisAte(new Date(), OC.diaDe(pl.alvo), estado.settings.feriados) } : null;
  const obs = carregando ? [] : OC.observacoesCliente(i, (r && r.datas) || {}, estado.settings, new Date());
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
      (pagto ? '<span class="' + (pagto.faltam != null && pagto.faltam <= 1 ? 'late' : '') + '">Pagamento até <b>' + esc(pagto.dt) + '</b> (prazo legal)</span>' : '') +
      (i.due ? '<span title="Data informada pelo cliente; não conta como vencimento">Expectativa do cliente: ' + esc(fmtData(i.due)) + '</span>' : '') +
    '</div>' +
    '<div class="dtabs" role="tablist">' +
      '<button class="dtab' + (aba === 'tramites' ? ' on' : '') + '" data-aba="tramites" role="tab">Trâmites<span class="n">' + (tramites ? tramites.length : '') + '</span></button>' +
      '<button class="dtab' + (aba === 'dados' ? ' on' : '') + '" data-aba="dados" role="tab">Dados' + (r && r.anexos && r.anexos.length ? '<span class="n">' + r.anexos.length + ' anexo' + (r.anexos.length > 1 ? 's' : '') + '</span>' : '') + '</button>' +
      '<button class="dtab' + (aba === 'cliente' ? ' on' : '') + '" data-aba="cliente" role="tab">Para o cliente' + (obs.some(o => o.alerta) ? '<span class="n late">!</span>' : '') + '</button>' +
      '<button class="dtab' + (aba === 'lembretes' ? ' on' : '') + '" data-aba="lembretes" role="tab">Lembretes<span class="n">' + (lems.filter(l => !l.feito).length || '') + '</span></button>' +
    '</div>' +
    '<div class="dlg-body" id="g-corpo">' + (erro ? '<div class="faixa"><svg class="ic"><use href="#i-alert"/></svg>' + esc(erro) + '</div>' : '') +
      (aba === 'acao' && acaoAberta() ? formAcao(i, obs) : aba === 'dados' ? dados(i, r, carregando) : aba === 'cliente' ? clienteHtml(obs, carregando) : aba === 'lembretes' ? lembretesHtml(lems) : tramitesHtml(r, carregando)) + '</div>' +
    '<div class="dlg-actions">' +
      '<button class="btn btn-sm" id="g-onvio"><svg class="ic ic-sm"><use href="#i-link"/></svg> Abrir no Onvio</button>' +
      botoesAcao(i, carregando) +
      '<span class="spacer"></span>' +
      (obs.some(o => !o.interno) ? '<button class="btn btn-sm" id="g-copiar-obs" title="Copia as observações de prazo e os avisos para colar na resposta ao cliente"><svg class="ic ic-sm"><use href="#i-copy"/></svg> Copiar observações</button>' : '') +
      '<button class="btn btn-primary btn-sm" id="g-lembrete"><svg class="ic ic-sm"><use href="#i-clock"/></svg> Lembrete</button>' +
      (OC.ACOES.tramite(i.type) ? '' : '<p class="dlg-nota">Responder, encaminhar e definir responsável ainda não foram mapeados para ' + esc(i.typeLabel) + ': use "Abrir no Onvio".</p>') +
    '</div>';

  $('#g-fechar').onclick = fecharDetalhe;
  if ($('#g-ant')) { $('#g-ant').onclick = () => andar(-1); $('#g-prox').onclick = () => andar(1); }
  $$('[data-aba]', g).forEach(b => b.onclick = () => { aba = b.dataset.aba; desenhar(i, r, erro, carregando); });
  $('#g-onvio').onclick = async () => {
    const x = await enviar({ cmd: 'abrir', item: { type: i.type, num: String(i.num) } });
    if (!x.ok) toast('Não foi possível abrir no Onvio: ' + (x.erro || ''), true);
  };
  const copiarObs = async () => {
    const marcadas = $$('#g-obs [data-obs]', g);
    const lista = marcadas.length ? obs.filter(o => marcadas.some(c => c.dataset.obs === o.id && c.checked)) : obs.filter(o => !o.interno);
    const txt = textoParaCliente(lista);
    if (!txt) { toast('Marque ao menos uma observação', true); return; }
    try { await navigator.clipboard.writeText(txt); toast('Observações copiadas: cole na resposta ao cliente'); }
    catch (e) { toast('Não foi possível copiar: selecione o texto na aba "Para o cliente"', true); }
  };
  if ($('#g-copiar-obs')) $('#g-copiar-obs').onclick = copiarObs;
  if ($('#g-copiar-obs2')) $('#g-copiar-obs2').onclick = copiarObs;
  $$('#g-obs [data-obs]', g).forEach(c => c.onchange = () => { const pv = $('#g-obs-texto', g); if (pv) pv.textContent = textoParaCliente(obs.filter(o => $$('#g-obs [data-obs]', g).some(x => x.dataset.obs === o.id && x.checked))); });
  $$('[data-acao]', g).forEach(b => b.onclick = () => { novaAcao(b.dataset.acao); aba = 'acao'; desenhar(i, r, erro, carregando); });
  if (aba === 'acao' && acaoAberta()) ligarAcao(g, i, obs, {
    redesenhar: () => desenhar(i, r, erro, carregando),
    cancelar: () => { aba = 'tramites'; desenhar(i, r, erro, carregando); },
    feito: () => { aba = 'tramites'; abrirDetalhe({ type: i.type, num: i.num }); }
  });
  $('#g-lembrete').onclick = () => abrirLembrete({ vinculo: { type: i.type, num: String(i.num), k: i.k || null, cliente: i.apelido || i.cliente } });
  $$('[data-l]', g).forEach(row => row.addEventListener('click', async e => {
    const l = estado.lembretes.find(x => x.id === row.dataset.l);
    if (!l) return;
    const b = e.target.closest('[data-a]');
    if (!b) { abrirLembrete({ l }); return; }
    await salvarLembretes(estado.lembretes.map(x => x.id !== l.id ? x : b.dataset.a === 'feito' ? OC.concluirLembrete(x, new Date(), estado.settings.feriados) : Object.assign({}, x, { feito: false, disparado: false })));
  }));
}

// Botões das ações no Onvio: habilitados só onde o formato foi mapeado e o Onvio permite (OC.podeAcao)
function botoesAcao(i, carregando) {
  const b = (acao, rot, ic) => { const p = carregando ? { ok: false, motivo: 'carregando' } : OC.podeAcao(acao, i); return '<button class="btn btn-sm' + (acao === 'tramite' ? ' btn-acao' : '') + '" data-acao="' + acao + '"' + (p.ok ? '' : ' disabled title="' + esc(p.motivo) + '"') + '>' + (ic ? '<svg class="ic ic-sm"><use href="#i-' + ic + '"/></svg> ' : '') + rot + '</button>'; };
  return b('tramite', 'Responder', 'chat') + b('encaminhar', 'Encaminhar', 'repeat') + b('responsavel', 'Responsável', 'user') + (OC.ACOES.expectativa(i.type) ? b('expectativa', 'Expectativa', 'calendar') : '');
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

function dados(i, r, carregando) {
  const resumo = [
    ['Cliente', i.cliente], ['Apelido', i.apelido], ['Responsável', i.resp || 'sem responsável'], ['Solicitante', i.solicitante],
    ['Aberta em', fmtDataHora(i.created)], ['Último trâmite', fmtDataHora(i.last)], ['Expectativa do cliente', i.due ? fmtData(i.due) : ''],
    ['Dias parada', i.parado != null ? i.parado + ' dia(s)' : ''], ['Prescreve em', i.prescreveEm != null ? i.prescreveEm + ' dia(s)' : ''],
    ['1º trâmite', i.ptUteis != null ? i.ptUteis + ' dia(s) útil(eis) · estimativa' : '']
  ].filter(c => c[1]);
  const grade = cs => '<div class="campos">' + cs.map(([k, v]) => '<div class="campo"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div></div>').join('') + '</div>';
  let html = '<h4 class="dados-tit">Controle</h4>' + grade(resumo);
  if (carregando) return html + '<div class="vazio">Lendo a solicitação completa no Onvio…</div>';
  if (r && r.grupos) {
    html += r.grupos.map(gr => {
      const curtos = gr.campos.filter(c => !c.longo), longos = gr.campos.filter(c => c.longo);
      return '<h4 class="dados-tit">' + esc(gr.titulo) + '</h4>' + (curtos.length ? grade(curtos.map(c => [c.k, c.v])) : '') +
        longos.map(c => '<div class="campo" style="margin-bottom:14px"><div class="k">' + esc(c.k) + '</div><div class="texto-longo" style="margin-top:4px">' + esc(textoPuro(c.v)) + '</div></div>').join('');
    }).join('');
    if (r.anexos && r.anexos.length) html += '<h4 class="dados-tit">Anexos da solicitação</h4><div class="anexos">' + r.anexos.map(a => '<span><svg class="ic ic-sm"><use href="#i-paperclip"/></svg>' + esc(a) + '</span>').join('') + '</div><p class="fraco" style="margin-top:6px">Para baixar os anexos, use "Abrir no Onvio".</p>';
    return html;
  }
  if (r && r.erroDados) html += '<div class="faixa warn"><svg class="ic"><use href="#i-alert"/></svg>Não foi possível ler a solicitação completa (' + esc(r.erroDados) + '). Mostrando o que veio da lista.</div>';
  return html + (i.assunto ? '<div class="campo" style="margin-bottom:14px"><div class="k">Assunto</div><div class="v">' + esc(i.assunto) + '</div></div>' : '') +
    (i.descricao ? '<div class="campo"><div class="k">Descrição</div><div class="texto-longo" style="margin-top:4px">' + esc(textoPuro(i.descricao)) + '</div></div>' : '');
}

// Observações para o cliente: avisos calculados primeiro; os internos (só para o analista) não vão para o texto.
function textoParaCliente(lista) {
  const l = lista.filter(o => !o.interno).map(o => '• ' + o.texto);
  return l.length ? 'Observações importantes:\n' + l.join('\n') : '';
}
function clienteHtml(obs, carregando) {
  if (carregando) return '<div class="vazio">Lendo as datas da solicitação…</div>';
  if (!obs.length) return '<div class="vazio"><b>Nenhuma observação para este tipo de solicitação</b>As frases ficam em Configurações (arquivo de regras do escritório).</div>';
  const internos = obs.filter(o => o.interno), cli = obs.filter(o => !o.interno);
  return (internos.length ? internos.map(o => '<div class="faixa warn"><svg class="ic"><use href="#i-alert"/></svg>' + esc(o.texto) + '</div>').join('') : '') +
    '<p class="fraco">Marque o que vale para este caso. "Copiar observações" copia o texto pronto para colar na resposta ao cliente.</p>' +
    '<div class="obs-lista" id="g-obs">' + cli.map(o => '<label class="obs' + (o.alerta ? ' alerta' : '') + '"><input type="checkbox" data-obs="' + esc(o.id) + '" checked><span>' + esc(o.texto) + '</span></label>').join('') + '</div>' +
    '<h4 class="dados-tit">Texto que será copiado</h4><div class="texto-longo" id="g-obs-texto">' + esc(textoParaCliente(cli)) + '</div>' +
    '<div style="margin-top:10px"><button class="btn btn-primary btn-sm" id="g-copiar-obs2"><svg class="ic ic-sm"><use href="#i-copy"/></svg> Copiar observações</button></div>';
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

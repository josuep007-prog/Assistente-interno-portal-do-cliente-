/* Detalhe de uma solicitação (gaveta). Lê dados e trâmites na hora; nada disso é guardado. */
import { estado, itens, enviar, salvarLembretes } from '../estado.js';
import { esc, pillSituacao, motivosHtml, fmtDataHora, fmtData, textoPuro, toast, ladoTexto, $ } from '../util.js';
const OC = window.OC;

let atual = null;        // { type, num }
let aba = 'tramites';

export function fecharDetalhe() {
  $('#gaveta').hidden = true; $('#fundo').hidden = true;
  $('#gaveta').innerHTML = '';
  atual = null;
}

// ref: item da fila, evento do sino ou lembrete (precisa de type e num)
export async function abrirDetalhe(ref) {
  if (!ref || !ref.type || ref.num == null) return;
  const t = OC.TYPE_BY_KEY[ref.type];
  if (!t) return;
  atual = { type: ref.type, num: String(ref.num) };
  aba = 'tramites';
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

function desenhar(i, r, erro, carregando) {
  const g = $('#gaveta');
  const tramites = r && r.tramites;
  g.innerHTML =
    '<div class="gav-cab"><div class="tt">' +
      '<div class="linha1"><span class="mono"><b>#' + esc(i.num) + '</b></span><span>' + esc(i.typeLabel) + '</span>' + pillSituacao(i) + (i.lado === 'esc' || i.lado === 'cli' ? '<span>vez: ' + ladoTexto(i) + '</span>' : '') + '</div>' +
      '<h2>' + esc(i.apelido || i.cliente || 'Solicitação') + '</h2>' +
      '<div class="linha3">' + esc(i.detalhe || i.assunto || '') + '</div>' +
      ((i.motivos && i.motivos.length) || i.abaProvavel ? '<div class="motivos" style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap">' + motivosHtml(i) + '</div>' : '') +
    '</div><button class="icon-btn" id="g-fechar" aria-label="Fechar" title="Fechar (Esc)"><svg class="ic"><use href="#i-x"/></svg></button></div>' +
    '<div class="gav-tabs" role="tablist"><button data-aba="tramites" class="' + (aba === 'tramites' ? 'on' : '') + '">Trâmites' + (tramites ? ' (' + tramites.length + ')' : '') + '</button><button data-aba="dados" class="' + (aba === 'dados' ? 'on' : '') + '">Dados</button></div>' +
    '<div class="gav-corpo" id="g-corpo">' + (erro ? '<div class="faixa">' + esc(erro) + '</div>' : '') + (aba === 'dados' ? dados(i) : tramitesHtml(r, carregando)) + '</div>' +
    '<div class="gav-rodape">' +
      '<button class="btn btn-primary btn-sm" id="g-lembrete"><svg class="ic ic-sm"><use href="#i-clock"/></svg> Lembrete</button>' +
      '<button class="btn btn-sm" id="g-onvio"><svg class="ic ic-sm"><use href="#i-link"/></svg> Abrir no Onvio</button>' +
      '<button class="btn btn-sm" disabled title="Chega na próxima versão">Responder</button>' +
      '<button class="btn btn-sm" disabled title="Chega na próxima versão">Definir responsável</button>' +
      '<button class="btn btn-sm" disabled title="Chega na próxima versão">Alterar expectativa</button>' +
      '<button class="btn btn-sm" disabled title="Chega na próxima versão"><svg class="ic ic-sm"><use href="#i-paperclip"/></svg> Anexar</button>' +
      '<div class="nota">Responder, definir responsável, expectativa e anexos chegam na próxima versão, depois do mapeamento das ações. Por enquanto, use "Abrir no Onvio".</div>' +
      '<div id="g-form" class="form-lembrete" hidden style="flex-basis:100%"></div>' +
    '</div>';

  $('#g-fechar').onclick = fecharDetalhe;
  g.querySelectorAll('[data-aba]').forEach(b => b.onclick = () => { aba = b.dataset.aba; desenhar(i, r, erro, carregando); });
  $('#g-onvio').onclick = async () => {
    const x = await enviar({ cmd: 'abrir', item: { type: i.type, num: String(i.num) } });
    if (!x.ok) toast('Não foi possível abrir no Onvio: ' + (x.erro || ''), true);
  };
  $('#g-lembrete').onclick = () => formLembrete(i);
}

function tramitesHtml(r, carregando) {
  if (carregando) return '<div class="vazio">Lendo os trâmites no Onvio…</div>';
  if (!r) return '<div class="vazio">Sem trâmites para mostrar.</div>';
  if (r.erroTramites) return '<div class="faixa warn">Não foi possível ler os trâmites (' + esc(r.erroTramites) + '). Use "Abrir no Onvio" para ver o histórico.</div>';
  const l = r.tramites || [];
  if (!l.length) return '<div class="vazio">Nenhum trâmite ainda.</div>';
  return '<div class="tl">' + l.slice().reverse().map(x =>
    '<div class="tl-item"><div class="meta"><b>#' + String(x.n).padStart(2, '0') + '</b><span class="pill">' + esc(x.situacao) + '</span><span>' + esc(x.autor || '—') + '</span><span>' + esc(fmtDataHora(x.em)) + '</span></div>' +
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
    (i.assunto ? '<div class="campo" style="margin-bottom:12px"><div class="k">Assunto</div><div class="v">' + esc(i.assunto) + '</div></div>' : '') +
    (i.descricao ? '<div class="campo"><div class="k">Descrição</div><div class="texto-longo" style="margin-top:4px">' + esc(textoPuro(i.descricao)) + '</div></div>' : '');
}

function formLembrete(i) {
  const f = $('#g-form');
  f.hidden = !f.hidden;
  if (f.hidden) return;
  const amanha = OC.adiarLembrete({}, 'amanha');
  const d = new Date(amanha.quando);
  const p2 = n => String(n).padStart(2, '0');
  f.innerHTML = '<input type="text" id="lt" placeholder="Ex.: cobrar o cliente sobre o documento" maxlength="300">' +
    '<input type="date" id="ld" value="' + d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + '"><input type="time" id="lh" value="09:00">' +
    '<div class="chips"><button data-q="1h">Em 1 hora</button><button data-q="amanha">Amanhã 9h</button></div>' +
    '<button class="btn btn-primary btn-sm" id="ls">Salvar lembrete</button>';
  $('#lt').focus();
  f.querySelectorAll('[data-q]').forEach(b => b.onclick = () => {
    const q = new Date(OC.adiarLembrete({}, b.dataset.q).quando);
    $('#ld').value = q.getFullYear() + '-' + p2(q.getMonth() + 1) + '-' + p2(q.getDate());
    $('#lh').value = p2(q.getHours()) + ':' + p2(q.getMinutes());
  });
  $('#ls').onclick = async () => {
    try {
      const l = OC.novoLembrete({ texto: $('#lt').value, quando: $('#ld').value + 'T' + ($('#lh').value || '09:00') + ':00', k: i.k || null, type: i.type, num: i.num, cliente: i.apelido || i.cliente });
      await salvarLembretes(estado.lembretes.concat(l));
      f.hidden = true;
      toast('Lembrete criado para ' + fmtDataHora(l.quando));
    } catch (e) { toast(e.message, true); }
  };
}

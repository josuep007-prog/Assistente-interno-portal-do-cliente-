/* Janela "Em lote": a mesma sugestão para várias solicitações do mesmo tipo (Hoje > Sugestões de ação). Mostra o que será feito e a
 * lista (marcadas por padrão, dá para desmarcar), e só depois do botão de confirmação executa uma por vez, mostrando o resultado de
 * cada uma. Nada é guardado: o que não foi feito continua nas sugestões. */
import { $, $$, esc, toast } from '../util.js';

let fundo = null, ctx = null;
export const loteAberto = () => !$('#dlg-lote').hidden;
export function fecharLote() {
  const d = $('#dlg-lote');
  if (d.hidden || (ctx && ctx.rodando)) return;                     // não fecha no meio do envio
  d.hidden = true; d.innerHTML = ''; ctx = null;
  if (fundo) { fundo.remove(); fundo = null; }
}

// o: { titulo, tipo, resumo (HTML já escapado), passos: [texto], itens: [{ k, rotulo, sub }], botao, local (true: não escreve no Onvio),
//      executar(k) → Promise<{ ok, erro }>, aoTerminar(feitas: [k]) }
export function abrirLote(o) {
  ctx = { o, rodando: false, feitas: [] };
  const d = $('#dlg-lote');
  if (!fundo) { fundo = document.createElement('div'); fundo.className = 'fundo'; fundo.style.zIndex = 52; fundo.onclick = fecharLote; document.body.appendChild(fundo); }
  d.style.zIndex = 53;
  d.hidden = false;
  d.innerHTML =
    '<div class="dlg-head"><div class="tt"><h2 class="pq">' + esc(o.titulo) + '</h2><div class="dlg-l3">' + esc(o.tipo) + ' · ' + o.itens.length + (o.itens.length === 1 ? ' solicitação' : ' solicitações') + '</div></div><button class="icon-btn" id="lt-fechar" aria-label="Fechar"><svg class="ic"><use href="#i-x"/></svg></button></div>' +
    '<div class="dlg-body">' +
      '<div class="faixa lote-aviso"><svg class="ic"><use href="#i-' + (o.local ? 'clock' : 'alert') + '"/></svg><div>' + (o.local ? 'Cria um lembrete pessoal para cada uma. Nada é enviado ao Onvio.' : '<b>Será enviado ao Onvio, em seu nome, um trâmite para cada solicitação marcada.</b> O cliente pode ver o trâmite e, depois de enviado, não dá para desfazer pela extensão.') + '</div></div>' +
      '<div class="lote-resumo">' + o.resumo + '</div>' +
      '<label class="ax-todos"><input type="checkbox" id="lt-todos" checked> <b>Marcar todas</b></label>' +
      '<div class="lote-lista" id="lt-lista">' + o.itens.map(it => '<label class="lote-it" data-lt="' + esc(it.k) + '"><input type="checkbox" data-lt-k="' + esc(it.k) + '" checked><span class="lote-tx"><b>' + esc(it.rotulo) + '</b><small>' + esc(it.sub || '') + '</small></span><span class="lote-st" aria-live="polite"></span></label>').join('') + '</div>' +
      '<div id="lt-msg"></div>' +
    '</div>' +
    '<div class="dlg-actions"><span class="fraco" id="lt-cont"></span><span class="spacer"></span><button type="button" class="btn btn-sm" id="lt-cancelar">Cancelar</button><button type="button" class="btn btn-primary btn-sm" id="lt-ir"></button></div>';
  const marcadas = () => $$('[data-lt-k]', d).filter(c => c.checked).map(c => c.dataset.ltK);
  const contar = () => {
    const n = marcadas().length, total = o.itens.length;
    $('#lt-cont').textContent = n + ' de ' + total + ' marcada' + (n === 1 ? '' : 's');
    $('#lt-ir').disabled = !n || ctx.rodando;
    $('#lt-ir').textContent = (o.botao || 'Enviar') + (n ? ' (' + n + ')' : '');
    const t = $('#lt-todos'); t.checked = n === total; t.indeterminate = n > 0 && n < total;
  };
  $$('[data-lt-k]', d).forEach(c => { c.onchange = contar; });
  $('#lt-todos').onchange = e => { $$('[data-lt-k]', d).forEach(c => { c.checked = e.target.checked; }); contar(); };
  $('#lt-fechar').onclick = fecharLote;
  $('#lt-cancelar').onclick = fecharLote;
  $('#lt-ir').onclick = () => rodar(marcadas());
  contar();
  $('#lt-ir').focus();
}

async function rodar(ks) {
  const d = $('#dlg-lote');
  if (!ctx || !ks.length) return;
  ctx.rodando = true;
  $$('[data-lt-k]', d).forEach(c => { c.disabled = true; });
  $('#lt-todos').disabled = true; $('#lt-ir').disabled = true; $('#lt-cancelar').disabled = true; $('#lt-fechar').disabled = true;
  let ok = 0, falhas = 0;
  for (const k of ks) {
    const linha = $$('[data-lt]', d).find(x => x.dataset.lt === k), st = linha && $('.lote-st', linha);
    if (st) { st.textContent = 'enviando…'; st.className = 'lote-st'; }
    let r;
    try { r = await ctx.o.executar(k); } catch (e) { r = { ok: false, erro: String((e && e.message) || e) }; }
    if (!ctx) return;
    if (r && r.ok) { ok++; ctx.feitas.push(k); if (st) { st.textContent = '✓ feito'; st.className = 'lote-st ok'; } }
    else { falhas++; if (st) { st.textContent = '✕ ' + ((r && r.erro) || 'não deu'); st.className = 'lote-st erro'; st.title = (r && r.erro) || ''; } if (r && r.parar) break; }
    await new Promise(res => setTimeout(res, 400));
  }
  if (!ctx) return;
  ctx.rodando = false;
  $('#lt-cancelar').disabled = false; $('#lt-fechar').disabled = false;
  $('#lt-ir').remove();
  $('#lt-cancelar').textContent = 'Fechar';
  const feitas = ctx.feitas.slice(), o = ctx.o;
  $('#lt-msg').innerHTML = '<div class="faixa' + (falhas ? ' warn' : '') + '"><svg class="ic"><use href="#i-' + (falhas ? 'alert' : 'check') + '"/></svg><div>' + (ok ? ok + (ok === 1 ? ' feita' : ' feitas') : 'Nenhuma feita') + (falhas ? ' · ' + falhas + (falhas === 1 ? ' com erro (as que falharam continuam nas sugestões)' : ' com erro (as que falharam continuam nas sugestões)') : '') + '.</div></div>';
  if (ok) toast((o.local ? ok + ' lembrete(s) criado(s)' : ok + ' trâmite(s) enviado(s) ao Onvio'), false);
  try { if (o.aoTerminar) await o.aoTerminar(feitas); } catch (e) { console.error(e); }
}

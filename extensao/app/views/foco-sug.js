/* Sugestões de ação, uma por vez ("Revisar uma a uma", no Hoje). Mostra o caso, o porquê e o que será enviado; "Fazer"
 * abre o detalhe com o trâmite já preenchido (você revisa e confirma) e, ao fechar o detalhe, a revisão volta na próxima.
 * Lembrete (aviso trabalhado) é criado aqui mesmo, sem escrever no Onvio. Nada é enviado sem a confirmação no detalhe. */
import { esc, $ } from '../util.js';

let st = null;          // { ks, i, o }: a fila de k fixada ao abrir, a posição e as funções de quem abriu
let voltar = false;     // "Fazer"/"Ver" abriu o detalhe: ao fechar, a revisão continua
const dlg = () => $('#dlg-foco');
export const focoAberto = () => !!dlg() && !dlg().hidden;

// o: { ks, inicio, casos() (os casos atuais), previa(c) (HTML), fazer(c) (abre o detalhe ou cria o lembrete; devolve 'detalhe' ou 'feito'),
//      ignorar(c), ver(c) }
export function abrirFoco(o) {
  st = { ks: o.ks.slice(), i: Math.max(0, o.ks.indexOf(o.inicio)), o };
  dlg().hidden = false; $('#fundo').hidden = false;
  desenhar();
}
export function fecharFoco() {
  if (!focoAberto()) return;
  dlg().hidden = true; dlg().innerHTML = '';
  if (!document.querySelector('#gaveta:not([hidden])')) $('#fundo').hidden = true;
  st = null; voltar = false;
}

// o caso de uma posição, com os dados atuais (pode ter saído das sugestões: feito ou "não é o caso")
const casoEm = n => st && st.o.casos().find(c => c.k === st.ks[n]);
function andar(d) {
  let n = st.i + d;
  while (n >= 0 && n < st.ks.length && !casoEm(n)) n += d;      // pula as que já saíram
  st.i = Math.max(-1, Math.min(st.ks.length, n));
  desenhar();
}

function desenhar() {
  const g = dlg();
  const restam = st.ks.filter((k, n) => casoEm(n)).length;
  if (st.i < 0) st.i = 0;
  const c = casoEm(st.i);
  if (!c) {
    if (st.i < st.ks.length && restam) { andar(1); return; }
    g.innerHTML = '<div class="dlg-head"><div class="tt"><h2>Pronto</h2><div class="dlg-l3">' + (restam ? 'Você chegou ao fim da lista. ' + restam + (restam === 1 ? ' sugestão ficou' : ' sugestões ficaram') + ' para depois.' : 'Não há mais sugestões de ação.') + '</div></div>' +
      '<button class="icon-btn" id="fo-fechar" aria-label="Fechar" title="Fechar (Esc)"><svg class="ic"><use href="#i-x"/></svg></button></div>' +
      '<div class="dlg-actions">' + (restam ? '<button class="btn btn-sm" id="fo-recomecar">Voltar ao começo</button>' : '') + '<span class="spacer"></span><button class="btn btn-sm btn-primary" id="fo-ok">Fechar</button></div>';
    $('#fo-fechar', g).onclick = fecharFoco; $('#fo-ok', g).onclick = fecharFoco;
    if ($('#fo-recomecar', g)) $('#fo-recomecar', g).onclick = () => { st.i = -1; andar(1); };
    $('#fo-ok', g).focus();
    return;
  }
  const i = c.item, pos = st.ks.slice(0, st.i + 1).filter((k, n) => casoEm(n)).length;
  g.innerHTML =
    '<div class="dlg-head"><div class="tt">' +
      '<div class="dlg-l1"><span class="fo-cat cs-' + esc(c.tipo) + '"><i></i>' + esc(c.rot) + '</span><span>' + esc(i.typeLabel) + '</span><span class="fo-n">' + pos + ' de ' + restam + '</span></div>' +
      '<h2>#' + esc(i.num) + ' ' + esc(i.apelido || i.cliente || '—') + '</h2>' +
      '<div class="dlg-l3">' + esc(i.detalhe || '') + (i.resp ? ' · ' + esc(i.resp) : ' · sem responsável') + '</div></div>' +
      '<button class="icon-btn" id="fo-fechar" aria-label="Fechar" title="Fechar (Esc)"><svg class="ic"><use href="#i-x"/></svg></button></div>' +
    '<div class="dlg-body">' +
      '<p class="fo-porque">' + esc(c.porque || '') + '</p>' +
      (c.pode && c.pode.ok ? st.o.previa(c) : '<div class="faixa warn"><svg class="ic"><use href="#i-alert"/></svg><div>A extensão não consegue fazer esta por aqui: ' + esc((c.pode && c.pode.motivo) || '') + '. Abra a solicitação para tratar.</div></div>') +
    '</div>' +
    '<div class="dlg-actions">' +
      '<button class="btn btn-sm" id="fo-ant" title="Anterior (←)"' + (pos <= 1 ? ' disabled' : '') + '><svg class="ic ic-sm"><use href="#i-chev-l"/></svg> Anterior</button>' +
      '<button class="btn btn-sm" id="fo-ver"><svg class="ic ic-sm"><use href="#i-eye"/></svg> Ver a solicitação</button>' +
      '<span class="spacer"></span>' +
      '<button class="btn btn-sm" id="fo-nao" title="Sai das sugestões; volta se a solicitação mexer"><svg class="ic ic-sm"><use href="#i-x"/></svg> Não é o caso</button>' +
      '<button class="btn btn-sm" id="fo-pular" title="Próxima (→)">Pular <svg class="ic ic-sm"><use href="#i-chev-r"/></svg></button>' +
      (c.pode && c.pode.ok ? '<button class="btn btn-sm btn-primary" id="fo-fazer">' + esc(c.botao) + '</button>' : '') +
    '</div>';
  $('#fo-fechar', g).onclick = fecharFoco;
  $('#fo-ant', g).onclick = () => andar(-1);
  $('#fo-pular', g).onclick = () => andar(1);
  $('#fo-ver', g).onclick = () => { voltar = true; esconder(); st.o.ver(c); };
  $('#fo-nao', g).onclick = async () => { await st.o.ignorar(c); andar(1); };
  if ($('#fo-fazer', g)) $('#fo-fazer', g).onclick = async () => {
    const r = await st.o.fazer(c, () => { voltar = true; esconder(); });
    if (r === 'feito') andar(1);
  };
  ($('#fo-fazer', g) || $('#fo-pular', g)).focus();
}
// some enquanto o detalhe está aberto (a fila e a posição ficam); volta quando o detalhe fecha
function esconder() { dlg().hidden = true; }
addEventListener('controlonvio-detalhe-fechado', () => {
  if (!st || !voltar) return;
  voltar = false;
  dlg().hidden = false; $('#fundo').hidden = false;
  andar(1);
});
addEventListener('keydown', e => {
  if (!focoAberto() || e.target.matches('input, select, textarea')) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); andar(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); andar(-1); }
});

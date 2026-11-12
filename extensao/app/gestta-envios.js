/* Tarefas do Gestta · aba Envios ao portal (0.96.0, Josué 12/11/2026: "no Gestta tem uma sessão chamada status da integração onde ficam
   documentos que deram erro no envio ao portal do cliente … preciso que a extensão do Gestta me ajude a gerir isso").
   Lê na hora a fila de envios com erro e os templates de documento (cmd gesttaEnvios) e separa:
   1) Para reenviar: erro de envio de verdade, ou "sem pasta" de um template que já ganhou pasta;
   2) Sem pasta, por template: se deveria ir ao portal sai do padrão já configurado no Gestta (template parecido com um que tem pasta);
   3) Risco: templates sem pasta parecidos com os que vão ao portal, mesmo sem documento parado agora.
   Nada fica guardado. Reenviar e configurar a pasta pela extensão esperam o mapeamento dessas ações (por enquanto abrem o Gestta). */
import { $, esc, num, plural, simples } from './util.js';

const G = window.OCG;
const URL_STATUS = 'https://app.gestta.com.br/dominio-integration/#/error-status';
const URL_TEMPLATES = 'https://app.gestta.com.br/admin/#/sidebar/document/list';
const S = { dados: null, analise: null, carregando: false, erro: null, filtro: '', q: '', abertos: new Set() };
let enviarFn = null, aoMudar = () => {};

export function estadoEnvios() { return S; }
export async function lerEnvios(enviar, redesenhar) {
  enviarFn = enviar; aoMudar = redesenhar || aoMudar;
  S.carregando = true; S.erro = null; aoMudar();
  const r = await enviar({ cmd: 'gesttaEnvios' });
  S.carregando = false;
  if (r && r.ok) { S.dados = r; S.analise = G.enviosPortal(r.envios, r.templates); }
  else S.erro = r || { erro: 'sem resposta' };
  aoMudar();
}
const nome = (t) => G.nomeLegivel ? G.nomeLegivel(t) : t;
const dataCurta = (s) => { const d = s ? new Date(s) : null; return d && !isNaN(d) ? String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear() : '—'; };
const haDias = (s) => { const d = s ? new Date(s) : null; if (!d || isNaN(d)) return ''; const n = Math.floor((Date.now() - d) / 864e5); return n <= 0 ? 'hoje' : n === 1 ? 'há 1 dia' : 'há ' + n + ' dias'; };
const comp = (s) => { const m = /^(\d{4})-(\d{2})/.exec(String(s || '')); return m ? m[2] + '/' + m[1] : ''; };
const casa = (x, q) => !q || [x.cliente, x.cnpj, x.template, x.arquivo, x.tarefa, x.erroTexto, x.responsavel, x.setor].join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q);
const ic = (n) => '<svg class="ic ic-sm" aria-hidden="true"><use href="#i-' + n + '"/></svg>';
const linkFora = (url, rot, cls) => '<a class="btn btn-sm ' + (cls || '') + '" href="' + url + '" target="_blank" rel="noopener">' + ic('ext') + esc(rot) + '</a>';

function linhaEnvio(x) {
  return '<tr><td><b>' + esc(nome(x.cliente) || '—') + '</b><small>' + esc(x.cnpj || '') + '</small></td>' +
    '<td>' + esc(nome(x.template) || '—') + (x.arquivo ? '<small title="' + esc(x.arquivo) + '">' + esc(x.arquivo) + '</small>' : '') + '</td>' +
    '<td>' + (x.tarefaId ? '<button type="button" class="gte-link" data-abrir="' + esc(x.tarefaId) + '">' + esc(nome(x.tarefa)) + '</button>' : esc(nome(x.tarefa) || '—')) + '<small>' + esc([x.setor, comp(x.competencia) && 'competência ' + comp(x.competencia), x.responsavel].filter(Boolean).join(' · ')) + '</small></td>' +
    '<td>' + (x.pastaJa ? '<span class="gte-tag gte-ok">' + ic('check') + 'Pasta já configurada</span><small>vai para ' + esc(x.pasta) + '</small>' : '<span class="gte-tag gte-erro">' + esc(x.erroTexto) + '</span>' + (x.detalhe ? '<small title="' + esc(x.detalhe) + '">' + esc(x.detalhe) + '</small>' : '')) + '</td>' +
    '<td class="num">' + num(x.tentativas) + '</td><td>' + esc(dataCurta(x.atualizado || x.criado)) + '<small>' + esc(haDias(x.criado)) + '</small></td></tr>';
}
const tabela = (l) => '<div class="gte-tab-wrap"><table class="gte-tab"><thead><tr><th>Cliente</th><th>Documento</th><th>Tarefa</th><th>Erro</th><th class="num">Tentativas</th><th>Desde</th></tr></thead><tbody>' + l.map(linhaEnvio).join('') + '</tbody></table></div>';

export function desenharEnvios(v, sub) {
  if (!S.dados) {
    sub('Envios ao Portal do Cliente');
    v.innerHTML = S.erro ? '<div class="faixa"><svg class="ic"><use href="#i-alert"/></svg><div style="flex:1;min-width:240px"><b>Não consegui ler os envios ao portal.</b> ' + esc(S.erro.erro || '') + '</div><button type="button" class="btn btn-sm" data-gte-ler>Tentar de novo</button></div>'
      : '<div class="gt-esq-tela" role="status" aria-label="Lendo os envios ao portal"><p class="fraco">Lendo no Gestta a fila de envios ao Portal do Cliente e os templates de documento…</p></div>';
    return;
  }
  const A = S.analise, T = A.totais, q = S.q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(), f = S.filtro;
  sub('Envios ao portal · ' + plural(T.erros, 'documento com erro', 'documentos com erro') + ' · lido às ' + new Date(S.dados.lidoEm).toTimeString().slice(0, 5));
  const kpi = (n, rot, k, cls, dica) => '<button type="button" class="gte-kpi ' + cls + (f === k ? ' on' : '') + '" data-gte-f="' + k + '" aria-pressed="' + (f === k) + '" title="' + esc(dica) + '"><b>' + num(n) + '</b><span>' + esc(rot) + '</span></button>';
  const reenv = A.reenviar.filter(x => casa(x, q));
  const semP = A.semPasta.map(g => Object.assign({}, g, { vis: g.itens.filter(x => casa(x, q)) })).filter(g => g.vis.length || (!q ? false : String(g.template).toLowerCase().includes(q)));
  const risco = A.risco.filter(r => !q || (r.template + ' ' + r.parecido.nome).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q));
  const mostra = (k) => !f || f === k;
  let h = '<section class="gte-topo cfg-card"><div class="gte-tit"><h2>Envios ao Portal do Cliente</h2><p' + (simples() ? ' class="ajuda"' : '') + '>Os documentos que o Gestta não conseguiu mandar ao portal. O que deve ir ao portal sai do padrão já configurado: template com pasta vai; template sem pasta e parecido com um que vai provavelmente deveria ir. Lido na hora, nada fica guardado.</p></div>' +
    '<div class="gte-kpis">' + kpi(T.reenviar, 'para reenviar', 'reenviar', 'gte-k-erro', 'Erro no envio, ou sem pasta num template que já ganhou pasta') +
    kpi(T.deve, T.deve === 1 ? 'template sem pasta que deveria ir' : 'templates sem pasta que deveriam ir', 'deve', 'gte-k-deve', 'Parecidos com templates que já vão ao portal') +
    kpi(T.templatesSemPasta - T.deve, 'templates sem pasta que não vão', 'naoVai', 'gte-k-neutro', 'Nenhum template parecido vai ao portal: o mais provável é que não devam ir') +
    kpi(T.risco, 'em risco, ainda sem erro', 'risco', 'gte-k-risco', 'Templates sem pasta parecidos com os que vão ao portal, sem documento parado agora') + '</div></section>' +
    '<div class="faixa gt-faixa-info"><svg class="ic"><use href="#i-lock"/></svg><div><b>Reenviar e configurar a pasta pela extensão chegam depois do mapeamento dessas duas ações</b> (feito no seu Chrome, numa empresa e num template de teste). Por enquanto os botões abrem a tela certa no Gestta.</div></div>' +
    '<div class="gte-barra"><input type="search" id="gte-q" placeholder="Buscar cliente, documento, arquivo ou tarefa" value="' + esc(S.q) + '" autocomplete="off">' + (f ? '<button type="button" class="btn btn-sm" data-gte-f="">' + ic('x') + 'Ver tudo</button>' : '') +
    (S.dados.cortado ? '<span class="gte-aviso">Lidos os 2.000 primeiros de ' + num(S.dados.total) + '</span>' : '') + '</div>';
  if (mostra('reenviar')) {
    const pj = reenv.filter(x => x.pastaJa), err = reenv.filter(x => !x.pastaJa);
    h += '<section class="gte-sec"><div class="gte-sec-h"><h3>Para reenviar <span class="gte-n">' + num(reenv.length) + '</span></h3>' + linkFora(URL_STATUS, 'Abrir o status da integração no Gestta', 'btn-primary') + '</div>' +
      (reenv.length ? (pj.length ? '<h4>Já têm pasta: só falta reenviar <span class="gte-n">' + num(pj.length) + '</span></h4>' + tabela(pj) : '') + (err.length ? '<h4>Erro ao enviar o arquivo <span class="gte-n">' + num(err.length) + '</span></h4>' + tabela(err) : '')
        : '<p class="gte-vazio">' + ic('check') + 'Nada para reenviar.</p>') + '</section>';
  }
  if (mostra('deve') || mostra('naoVai')) {
    const gs = semP.filter(g => !f || g.classe === f);
    h += '<section class="gte-sec"><div class="gte-sec-h"><h3>Sem pasta, por template <span class="gte-n">' + num(gs.length) + '</span></h3>' + linkFora(URL_TEMPLATES, 'Abrir os templates no Gestta') + '</div>' +
      (gs.length ? '<ul class="gte-tpls">' + gs.map(g => {
        const ab = S.abertos.has(g.templateId || g.template), deve = g.classe === 'deve';
        return '<li class="gte-tpl ' + (deve ? 'deve' : 'nao') + '"><div class="gte-tpl-h"><span class="gte-tag ' + (deve ? 'gte-deve' : 'gte-neutro') + '">' + ic(deve ? 'alert' : 'eye') + (deve ? 'Provavelmente deveria ir ao portal' : 'Provavelmente não vai ao portal') + '</span>' +
          '<b>' + esc(nome(g.template)) + '</b><span class="gte-cont">' + plural(g.itens.length, 'documento parado', 'documentos parados') + ' · ' + plural(g.nClientes, 'cliente', 'clientes') + '</span></div>' +
          '<p class="gte-motivo">' + esc(g.motivo) + (deve ? '. Configure a pasta ' + esc(g.parecido.pasta) + ' neste template e reenvie os documentos.' : '. Se este documento deve ir ao portal, configure a pasta no template.') + '</p>' +
          '<button type="button" class="gte-link" data-gte-abrir="' + esc(g.templateId || g.template) + '" aria-expanded="' + ab + '">' + (ab ? 'Esconder os documentos' : 'Ver os documentos') + '</button>' + (ab ? tabela(g.vis.length ? g.vis : g.itens) : '') + '</li>';
      }).join('') + '</ul>' : '<p class="gte-vazio">' + ic('check') + 'Nenhum documento parado por falta de pasta.</p>') + '</section>';
  }
  if (mostra('risco')) {
    h += '<section class="gte-sec"><div class="gte-sec-h"><h3>Templates em risco, ainda sem erro <span class="gte-n">' + num(risco.length) + '</span></h3></div>' +
      '<p class="gte-dica">Sem pasta no portal, mas com nome parecido com um template que vai. Quando um documento deles chegar, vai parar aqui como erro.</p>' +
      (risco.length ? '<ul class="gte-risco">' + risco.map(r => '<li><b>' + esc(nome(r.template)) + '</b><span>parecido com <b>' + esc(nome(r.parecido.nome)) + '</b>, que vai para ' + esc(r.parecido.pasta) + '</span></li>').join('') + '</ul>' : '<p class="gte-vazio">' + ic('check') + 'Nenhum template em risco.</p>') + '</section>';
  }
  v.innerHTML = h;
}
export function ligarEnvios(v, redesenhar, paraPai) {
  v.addEventListener('click', (e) => {
    if (!v.querySelector('.gte-topo, [data-gte-ler]')) return;
    const t = e.target.closest('[data-gte-f],[data-gte-abrir],[data-gte-ler],[data-abrir]'); if (!t) return;
    if (t.dataset.gteLer != null) { if (enviarFn) lerEnvios(enviarFn, redesenhar); return; }
    if (t.dataset.gteF != null) { S.filtro = S.filtro === t.dataset.gteF ? '' : t.dataset.gteF; redesenhar(); return; }
    if (t.dataset.gteAbrir != null) { const k = t.dataset.gteAbrir; S.abertos.has(k) ? S.abertos.delete(k) : S.abertos.add(k); redesenhar(); return; }
    if (t.dataset.abrir && t.classList.contains('gte-link')) { e.stopPropagation(); paraPai({ controlGestta: 'abrirTarefa', id: t.dataset.abrir }); }
  });
  let tq = 0;
  v.addEventListener('input', (e) => { if (e.target.id !== 'gte-q') return; clearTimeout(tq); const val = e.target.value; tq = setTimeout(() => { S.q = val; const pos = e.target.selectionStart; redesenhar(); const n = $('#gte-q'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* busca */ } } }, 200); });
}

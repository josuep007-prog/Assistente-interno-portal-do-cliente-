/* Tarefas do Gestta · aba Envios ao portal (0.96.0, Josué 12/11/2026: "no Gestta tem uma sessão chamada status da integração onde ficam
   documentos que deram erro no envio ao portal do cliente … preciso que a extensão do Gestta me ajude a gerir isso").
   Lê na hora a fila de envios com erro e os templates de documento (cmd gesttaEnvios) e separa:
   1) Para reenviar: erro de envio de verdade, ou "sem pasta" de um template que já ganhou pasta;
   2) Sem pasta, por template: se deveria ir ao portal sai do padrão já configurado no Gestta (template parecido com um que tem pasta);
   3) Risco: templates sem pasta parecidos com os que vão ao portal, mesmo sem documento parado agora.
   Nada fica guardado.
   0.97.0 (aprovado pelo Josué em 12/11/2026, mapeado no mesmo dia): Reenviar (um ou o grupo, de 50 em 50) e "Usar a pasta de" um template
   parecido, sempre com a confirmação aqui antes de gravar. Reenviar só os que têm pasta: num "sem pasta" o Gestta diz que reenviou, mas o
   documento continua com erro (visto no mapeamento).
   0.98.0 (Josué, 12/11/2026: os sem pasta que não vão ao portal "devem ser excluídos em lote da lista de erros"; lixeira mapeada no mesmo dia):
   "Tirar da lista" por template ou todos de uma vez, com confirmação; o service worker relê e só tira os que continuam "não vai". */
import { $, esc, num, plural, simples, toast } from './util.js';

const G = window.OCG;
const URL_STATUS = 'https://app.gestta.com.br/dominio-integration/#/error-status';
const URL_TEMPLATES = 'https://app.gestta.com.br/admin/#/sidebar/document/list';
const S = { dados: null, analise: null, carregando: false, erro: null, filtro: '', q: '', abertos: new Set(), conf: null, agindo: false };
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
    '<td class="num">' + num(x.tentativas) + '</td><td>' + esc(dataCurta(x.atualizado || x.criado)) + '<small>' + esc(haDias(x.criado)) + '</small></td>' +
    '<td>' + (podeReenviar(x) ? '<button type="button" class="btn btn-sm" data-gte-reenviar="' + esc(x.id) + '"' + (S.agindo ? ' disabled' : '') + '>' + ic('repeat') + 'Reenviar</button>' : '') + '</td></tr>';
}
const tabela = (l) => '<div class="gte-tab-wrap"><table class="gte-tab"><thead><tr><th>Cliente</th><th>Documento</th><th>Tarefa</th><th>Erro</th><th class="num">Tentativas</th><th>Desde</th><th><span class="sr">Ação</span></th></tr></thead><tbody>' + l.map(linhaEnvio).join('') + '</tbody></table></div>';
// só reenvia o que tem pasta (o "sem pasta" reenviado volta como sucesso, mas continua com erro) e tem os ids do Gestta
// templates sem pasta com um parecido que tem a pasta inteira: o que "Usar a pasta" em lote leva
const pastasDe = (l) => l.filter(g => g.templateId && g.parecido && g.parecido.integracao).map(g => ({ destino: g.templateId, modelo: g.parecido.id, nomeDestino: g.template, nomeModelo: g.parecido.nome, pasta: g.parecido.pasta }));
const podeReenviar = (x) => x && x.pastaJa !== undefined && !(String(x.erro).match(/NO_FOLDER/i) && !x.pastaJa) && x.ids && ['usuario', 'cliente', 'tarefa', 'arquivo'].every(k => /^[0-9a-f]{24}$/i.test(x.ids[k] || ''));
function confHtml() {
  const c = S.conf; if (!c) return '';
  const corpo = c.tipo === 'tirar'
    ? '<b>Tirar ' + plural(c.ids.length, 'documento', 'documentos') + ' da lista de erros do portal?</b> ' + (c.nomes.length === 1 ? 'São do template “' + esc(nome(c.nomes[0])) + '”, que não vai' : 'São de ' + c.nomes.length + ' templates que não vão') + ' ao portal. É a lixeira da tela Status da integração do Gestta: o documento sai só desta lista e não é enviado. Antes de tirar, a extensão confere de novo cada um.'
    : c.tipo === 'pastas'
    ? '<b>Usar a pasta sugerida em ' + plural(c.lista.length, 'template', 'templates') + '?</b> Cada um recebe a pasta do template parecido que já vai ao portal, um por vez:<ul class="gte-conf-l">' +
      c.lista.slice(0, 10).map(x => '<li>“' + esc(nome(x.nomeDestino)) + '” → ' + esc(x.pasta) + ' <small>(como “' + esc(nome(x.nomeModelo)) + '”)</small></li>').join('') + (c.lista.length > 10 ? '<li>e mais ' + num(c.lista.length - 10) + '</li>' : '') + '</ul>Os documentos que já estão parados precisam ser reenviados depois.'
    : c.tipo === 'reenviar'
    ? '<b>Reenviar ' + plural(c.itens.length, 'documento', 'documentos') + ' ao Portal do Cliente?</b> O Gestta tenta mandar de novo para a pasta configurada' + (c.itens.length > 50 ? ' (de 50 em 50)' : '') + '. Nada é apagado.'
    : '<b>Usar a pasta ' + esc(c.pasta) + ' no template “' + esc(nome(c.nomeDestino)) + '”?</b> É a mesma do template “' + esc(nome(c.nomeModelo)) + '”. Daqui para frente os documentos deste template vão para essa pasta; os que já estão parados precisam ser reenviados depois.';
  return '<div class="faixa warn gte-conf" role="alertdialog" aria-label="Confirmar"><svg class="ic"><use href="#i-alert"/></svg><div>' + corpo + '</div>' +
    '<button type="button" class="btn btn-sm btn-primary" data-gte-confirmar' + (S.agindo ? ' disabled' : '') + '>' + (S.agindo ? 'Gravando…' : 'Confirmar') + '</button><button type="button" class="btn btn-sm" data-gte-cancelar' + (S.agindo ? ' disabled' : '') + '>Cancelar</button></div>';
}
async function executarConf(redesenhar) {
  const c = S.conf; if (!c || S.agindo || !enviarFn) return;
  S.agindo = true; redesenhar();
  try {
    if (c.tipo === 'reenviar') {
      let ok = 0, falhou = 0, bloq = 0, erro = '';
      for (let i = 0; i < c.itens.length; i += 50) {
        const r = await enviarFn({ cmd: 'gesttaAcao', acao: 'reenviar', itens: c.itens.slice(i, i + 50).map(x => x.ids) });
        if (!r || !r.ok) { erro = (r && r.erro) || 'sem resposta'; break; }
        const z = r.resumo || {}; ok += z.success || 0; falhou += z.failed || 0; bloq += z.blocked || 0;
      }
      toast(erro ? 'Reenvio interrompido: ' + erro : 'Gestta: ' + plural(ok, 'documento reenviado', 'documentos reenviados') + (falhou ? ', ' + falhou + ' com falha' : '') + (bloq ? ', ' + bloq + ' bloqueado(s)' : '') + '. A lista é relida em seguida.');
    } else if (c.tipo === 'pastas') {
      let ok = 0; const erros = [];
      for (const x of c.lista) {
        const r = await enviarFn({ cmd: 'gesttaPasta', template: x.destino, modelo: x.modelo });
        if (r && r.ok) ok++; else { erros.push(nome(x.nomeDestino) + ': ' + ((r && r.erro) || 'sem resposta')); if (r && r.status === 401) break; }
        await new Promise(res => setTimeout(res, 350));
      }
      toast('Pasta configurada em ' + plural(ok, 'template', 'templates') + (erros.length ? ' · ' + erros.length + ' sem pasta (' + erros[0] + ')' : '') + '. Agora reenvie os documentos deles.', erros.length > 0);
    } else if (c.tipo === 'tirar') {
      const r = await enviarFn({ cmd: 'gesttaTirar', ids: c.ids });
      toast(r && r.ok ? 'Gestta: ' + plural(r.success || 0, 'documento tirado', 'documentos tirados') + ' da lista de erros' + (r.failed ? ', ' + r.failed + ' com falha' : '') + (r.ignorados ? ', ' + r.ignorados + ' não estavam mais como “não vai”' : '') + '.' : 'Nada tirado: ' + ((r && r.erro) || 'sem resposta'));
    } else {
      const r = await enviarFn({ cmd: 'gesttaPasta', template: c.destino, modelo: c.modelo });
      toast(r && r.ok ? 'Pasta ' + (r.pasta || c.pasta) + ' configurada no template. Agora reenvie os documentos dele.' : 'Pasta não configurada: ' + ((r && r.erro) || 'sem resposta'));
    }
  } finally { S.agindo = false; S.conf = null; }
  lerEnvios(enviarFn, redesenhar);
}

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
    kpi(T.templatesSemPasta - T.deve, 'sem pasta que não vão (saem da lista)', 'naoVai', 'gte-k-neutro', 'Templates sem pasta que não vão ao portal: os documentos deles saem da lista de erros') +
    kpi(T.risco, 'em risco, ainda sem erro', 'risco', 'gte-k-risco', 'Templates sem pasta parecidos com os que vão ao portal, sem documento parado agora') + '</div></section>' +
    '<div class="faixa gt-faixa-info gte-info"><svg class="ic"><use href="#i-alert"/></svg><div><b>Documento “sem pasta” só sai do erro depois de a pasta ser configurada no template.</b> Reenviar antes disso não adianta: o Gestta diz que reenviou, mas ele continua aqui. Por isso o Reenviar só aparece para quem já tem pasta.</div></div>' +
    confHtml() +
    '<div class="gte-barra"><input type="search" id="gte-q" placeholder="Buscar cliente, documento, arquivo ou tarefa" value="' + esc(S.q) + '" autocomplete="off">' + (f ? '<button type="button" class="btn btn-sm" data-gte-f="">' + ic('x') + 'Ver tudo</button>' : '') +
    (S.dados.cortado ? '<span class="gte-aviso">Lidos os 2.000 primeiros de ' + num(S.dados.total) + '</span>' : '') + '</div>';
  if (mostra('reenviar')) {
    const pj = reenv.filter(x => x.pastaJa), err = reenv.filter(x => !x.pastaJa);
    const todos = reenv.filter(podeReenviar);
    h += '<section class="gte-sec"><div class="gte-sec-h"><h3>Para reenviar <span class="gte-n">' + num(reenv.length) + '</span></h3><span class="gte-acoes">' +
      (todos.length ? '<button type="button" class="btn btn-sm btn-primary" data-gte-reenviar-todos' + (S.agindo ? ' disabled' : '') + '>' + ic('repeat') + 'Reenviar ' + (todos.length === 1 ? 'o documento' : 'os ' + num(todos.length)) + '</button>' : '') + linkFora(URL_STATUS, 'Status da integração no Gestta') + '</span></div>' +
      (reenv.length ? (pj.length ? '<h4>Já têm pasta: só falta reenviar <span class="gte-n">' + num(pj.length) + '</span></h4>' + tabela(pj) : '') + (err.length ? '<h4>Erro ao enviar o arquivo <span class="gte-n">' + num(err.length) + '</span></h4>' + tabela(err) : '')
        : '<p class="gte-vazio">' + ic('check') + 'Nada para reenviar.</p>') + '</section>';
  }
  if (mostra('deve') || mostra('naoVai')) {
    // Josué, 12/11/2026: "documentos que estão sem pasta configurada e realmente não vão pro portal devem ser excluídos em lote da lista de erros":
    // nunca reenviar nem configurar pasta para eles; sem filtro ficam recolhidos numa linha. A exclusão em lote espera o mapeamento da lixeira.
    const gs = semP.filter(g => f ? g.classe === f : g.classe === 'deve'), nNao = semP.filter(g => g.classe === 'naoVai').length;
    const nDocsNao = A.semPasta.filter(g => g.classe === 'naoVai').reduce((n, g) => n + g.itens.length, 0);
    h += '<section class="gte-sec"><div class="gte-sec-h"><h3>Sem pasta, por template <span class="gte-n">' + num(gs.length) + '</span></h3><span class="gte-acoes">' +
      (f !== 'naoVai' && pastasDe(gs.filter(g => g.classe === 'deve')).length > 1 ? '<button type="button" class="btn btn-sm btn-primary" data-gte-pastas="deve"' + (S.agindo ? ' disabled' : '') + '>' + ic('check') + 'Usar as pastas sugeridas (' + num(pastasDe(gs.filter(g => g.classe === 'deve')).length) + ')</button>' : '') +
      (f === 'naoVai' && nDocsNao ? '<button type="button" class="btn btn-sm btn-primary" data-gte-tirar-todos' + (S.agindo ? ' disabled' : '') + '>' + ic('x') + 'Tirar ' + (nDocsNao === 1 ? 'o documento' : 'os ' + num(nDocsNao)) + ' da lista</button>' : '') + linkFora(URL_TEMPLATES, 'Abrir os templates no Gestta') + '</span></div>' +
      (gs.length ? '<ul class="gte-tpls">' + gs.map(g => {
        const ab = S.abertos.has(g.templateId || g.template), deve = g.classe === 'deve';
        return '<li class="gte-tpl ' + (deve ? 'deve' : 'nao') + '"><div class="gte-tpl-h"><span class="gte-tag ' + (deve ? 'gte-deve' : 'gte-neutro') + '">' + ic(deve ? 'alert' : 'eye') + (deve ? 'Provavelmente deveria ir ao portal' : 'Não vai ao portal: sai da lista de erros') + '</span>' +
          '<b>' + esc(nome(g.template)) + '</b><span class="gte-cont">' + plural(g.itens.length, 'documento parado', 'documentos parados') + ' · ' + plural(g.nClientes, 'cliente', 'clientes') + '</span></div>' +
          '<p class="gte-motivo">' + esc(g.motivo) + (deve ? '.' : '. Estes documentos saem da lista de erros (não vão ao portal).') + '</p>' +
          (!deve ? '<button type="button" class="btn btn-sm gte-usar" data-gte-tirar="' + esc(g.templateId || g.template) + '"' + (S.agindo ? ' disabled' : '') + '>' + ic('x') + 'Tirar ' + (g.itens.length === 1 ? 'o documento' : 'os ' + num(g.itens.length)) + ' da lista</button> ' : '') +
          (deve && g.templateId && g.parecido.integracao ? '<button type="button" class="btn btn-sm btn-primary gte-usar" data-gte-pasta="' + esc(g.templateId) + '" data-gte-modelo="' + esc(g.parecido.id) + '"' + (S.agindo ? ' disabled' : '') + '>' + ic('check') + 'Usar a pasta ' + esc(g.parecido.pasta) + '</button> ' : '') +
          '<button type="button" class="gte-link" data-gte-abrir="' + esc(g.templateId || g.template) + '" aria-expanded="' + ab + '">' + (ab ? 'Esconder os documentos' : 'Ver os documentos') + '</button>' + (ab ? tabela(g.vis.length ? g.vis : g.itens) : '') + '</li>';
      }).join('') + '</ul>' : '<p class="gte-vazio">' + ic('check') + (f === 'naoVai' ? 'Nenhum template sem pasta fora do portal.' : 'Nenhum template sem pasta que deveria ir ao portal.') + '</p>') +
      (!f && nNao ? '<p class="gte-dica gte-nao-resumo">' + plural(nNao, 'template sem pasta não vai', 'templates sem pasta não vão') + ' ao portal: os documentos deles saem da lista de erros. <button type="button" class="gte-link" data-gte-f="naoVai">Ver e tirar da lista</button></p>' : '') + '</section>';
  }
  if (mostra('risco')) {
    h += '<section class="gte-sec"><div class="gte-sec-h"><h3>Templates em risco, ainda sem erro <span class="gte-n">' + num(risco.length) + '</span></h3>' + (pastasDe(risco).length > 1 ? '<span class="gte-acoes"><button type="button" class="btn btn-sm btn-primary" data-gte-pastas="risco"' + (S.agindo ? ' disabled' : '') + '>' + ic('check') + 'Usar as pastas sugeridas (' + num(pastasDe(risco).length) + ')</button></span>' : '') + '</div>' +
      '<p class="gte-dica">Sem pasta no portal, mas com nome parecido com um template que vai. Quando um documento deles chegar, vai parar aqui como erro.</p>' +
      (risco.length ? '<ul class="gte-risco">' + risco.map(r => '<li><b>' + esc(nome(r.template)) + '</b><span>parecido com <b>' + esc(nome(r.parecido.nome)) + '</b>, que vai para ' + esc(r.parecido.pasta) + '</span>' +
        (r.parecido.integracao ? '<button type="button" class="btn btn-sm gte-usar" data-gte-pasta="' + esc(r.templateId) + '" data-gte-modelo="' + esc(r.parecido.id) + '"' + (S.agindo ? ' disabled' : '') + '>Usar a mesma pasta</button>' : '') + '</li>').join('') + '</ul>' : '<p class="gte-vazio">' + ic('check') + 'Nenhum template em risco.</p>') + '</section>';
  }
  v.innerHTML = h;
}
const topo = (v) => { const c = v.querySelector('.gte-conf'); if (c) c.scrollIntoView({ block: 'center' }); };
export function ligarEnvios(v, redesenhar, paraPai) {
  v.addEventListener('click', (e) => {
    if (!v.querySelector('.gte-topo, [data-gte-ler]')) return;
    const t = e.target.closest('[data-gte-f],[data-gte-abrir],[data-gte-ler],[data-abrir],[data-gte-reenviar],[data-gte-reenviar-todos],[data-gte-pasta],[data-gte-tirar],[data-gte-tirar-todos],[data-gte-pastas],[data-gte-confirmar],[data-gte-cancelar]'); if (!t) return;
    const A = S.analise;
    if (t.dataset.gteCancelar != null) { S.conf = null; redesenhar(); return; }
    if (t.dataset.gteConfirmar != null) { executarConf(redesenhar); return; }
    if (t.dataset.gteReenviar != null && A) { const x = A.reenviar.find(i => i.id === t.dataset.gteReenviar); if (x && podeReenviar(x)) { S.conf = { tipo: 'reenviar', itens: [x] }; redesenhar(); topo(v); } return; }
    if (t.dataset.gtePastas != null && A) {
      const l = pastasDe(t.dataset.gtePastas === 'risco' ? A.risco : A.semPasta.filter(g => g.classe === 'deve'));
      if (l.length) { S.conf = { tipo: 'pastas', lista: l }; redesenhar(); topo(v); }
      return;
    }
    if ((t.dataset.gteTirar != null || t.dataset.gteTirarTodos != null) && A) {
      const gs = A.semPasta.filter(g => g.classe === 'naoVai' && (t.dataset.gteTirarTodos != null || (g.templateId || g.template) === t.dataset.gteTirar));
      const ids = gs.flatMap(g => g.itens.map(i => i.id)).filter(v => /^[0-9a-f]{24}$/i.test(v || ''));
      if (ids.length) { S.conf = { tipo: 'tirar', ids, nomes: gs.map(g => g.template) }; redesenhar(); topo(v); }
      return;
    }
    if (t.dataset.gteReenviarTodos != null && A) { const l = A.reenviar.filter(podeReenviar); if (l.length) { S.conf = { tipo: 'reenviar', itens: l }; redesenhar(); topo(v); } return; }
    if (t.dataset.gtePasta != null && A) {
      const dest = t.dataset.gtePasta, mod = t.dataset.gteModelo, g = A.semPasta.find(x => x.templateId === dest) || A.risco.find(x => x.templateId === dest);
      if (g && g.parecido) { S.conf = { tipo: 'pasta', destino: dest, modelo: mod, nomeDestino: g.template, nomeModelo: g.parecido.nome, pasta: g.parecido.pasta }; redesenhar(); topo(v); }
      return;
    }
    if (t.dataset.gteLer != null) { if (enviarFn) lerEnvios(enviarFn, redesenhar); return; }
    if (t.dataset.gteF != null) { S.filtro = S.filtro === t.dataset.gteF ? '' : t.dataset.gteF; redesenhar(); return; }
    if (t.dataset.gteAbrir != null) { const k = t.dataset.gteAbrir; S.abertos.has(k) ? S.abertos.delete(k) : S.abertos.add(k); redesenhar(); return; }
    if (t.dataset.abrir && t.classList.contains('gte-link')) { e.stopPropagation(); paraPai({ controlGestta: 'abrirTarefa', id: t.dataset.abrir }); }
  });
  let tq = 0;
  v.addEventListener('input', (e) => { if (e.target.id !== 'gte-q') return; clearTimeout(tq); const val = e.target.value; tq = setTimeout(() => { S.q = val; const pos = e.target.selectionStart; redesenhar(); const n = $('#gte-q'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* busca */ } } }, 200); });
}

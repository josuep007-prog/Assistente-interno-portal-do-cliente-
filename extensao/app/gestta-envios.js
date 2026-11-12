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
  if (r && r.ok) { S.dados = r; S.analise = G.enviosPortal(r.envios, r.templates, r.notifica, r.modelo && r.modelo.id, r.vinculados); }
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
// só reenvia o que tem pasta (o "sem pasta" reenviado volta como sucesso, mas continua com erro) e tem os ids do Gestta
// templates sem pasta com um parecido que tem a pasta inteira: o que "Usar a pasta" em lote leva
const pastasDe = (l) => l.filter(g => g.templateId && g.parecido && g.parecido.integracao).map(g => ({ destino: g.templateId, modelo: g.parecido.id, nomeDestino: g.template, nomeModelo: g.parecido.nome, pasta: g.parecido.pasta }));
const podeReenviar = (x) => x && x.pastaJa !== undefined && !(String(x.erro).match(/NO_FOLDER/i) && !x.pastaJa) && x.ids && ['usuario', 'cliente', 'tarefa', 'arquivo'].every(k => /^[0-9a-f]{24}$/i.test(x.ids[k] || ''));
function confHtml() {
  const c = S.conf; if (!c) return '';
  const corpo = c.tipo === 'tirarPasta'
    ? '<b>Tirar a pasta de ' + plural(c.lista.length, 'template', 'templates') + '?</b> A pasta foi montada a partir de outra empresa (só vale a da 9999). Um template por vez: primeiro os documentos dele saem da lista de erros, depois a pasta sai do template (os outros templates da mesma pasta não mudam):<ul class="gte-conf-l">' +
      c.lista.slice(0, 10).map(x => '<li>“' + esc(nome(x.template)) + '”: pasta ' + esc(x.pasta) + (x.ids.length ? ' · ' + plural(x.ids.length, 'documento sai', 'documentos saem') + ' da lista' : '') + '</li>').join('') + (c.lista.length > 10 ? '<li>e mais ' + num(c.lista.length - 10) + '</li>' : '') + '</ul>Antes de cada um, a extensão relê o template no Gestta e confere de novo.'
    : c.tipo === 'tirar'
    ? '<b>Tirar ' + plural(c.ids.length, 'documento', 'documentos') + ' da lista de erros do portal?</b> ' + (c.nomes.length === 1 ? 'São do template “' + esc(nome(c.nomes[0])) + '”' : 'São de ' + c.nomes.length + ' templates') + ' e não vão ao portal. É a lixeira da tela Status da integração do Gestta: o documento sai só desta lista e não é enviado. Antes de tirar, a extensão confere de novo cada um.'
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
    } else if (c.tipo === 'tirarPasta') {
      let ok = 0, docs = 0; const erros = [];
      for (const x of c.lista) {
        if (x.ids.length) {
          const t = await enviarFn({ cmd: 'gesttaTirar', ids: x.ids });
          if (t && t.ok) docs += t.success || 0; else if (t && /sessão/.test(t.erro || '')) { erros.push(t.erro); break; }
        }
        const r = await enviarFn({ cmd: 'gesttaTirarPasta', template: x.templateId });
        if (r && r.ok) ok++; else { erros.push(nome(x.template) + ': ' + ((r && r.erro) || 'sem resposta')); if (r && r.status === 401) break; }
        await new Promise(res => setTimeout(res, 350));
      }
      toast('Pasta tirada de ' + plural(ok, 'template', 'templates') + (docs ? ' · ' + plural(docs, 'documento tirado', 'documentos tirados') + ' da lista' : '') + (erros.length ? ' · ' + erros.length + ' sem mudar (' + erros[0] + ')' : '') + '. A lista é relida em seguida.', erros.length > 0);
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
      : '<div class="gt-esq-tela" role="status" aria-label="Lendo os envios ao portal"><p class="fraco">Lendo no Gestta a fila de envios ao Portal do Cliente, as tarefas e os templates de documento…</p></div>';
    return;
  }
  // 0.100.3 (Josué, 12/11/2026: "a parte de reenviar está confusa"; aprovada a sugestão): cada documento com erro tem um destino só,
  // em três blocos numerados (Reenviar, Corrigir a pasta no Gestta, Tirar da lista), mais as pastas fora da 9999 e o risco.
  const A = S.analise, T = A.totais, q = S.q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(), f = S.filtro, dis = S.agindo ? ' disabled' : '';
  sub('Envios ao portal · ' + plural(T.erros, 'documento com erro', 'documentos com erro') + ' · lido às ' + new Date(S.dados.lidoEm).toTimeString().slice(0, 5));
  const kpi = (n, rot, k, cls, dica) => '<button type="button" class="gte-kpi ' + cls + (f === k ? ' on' : '') + '" data-gte-f="' + k + '" aria-pressed="' + (f === k) + '" title="' + esc(dica) + '"><b>' + num(n) + '</b><span>' + esc(rot) + '</span></button>';
  const reenv = A.reenviar.filter(x => casa(x, q));
  const grupos = A.semPasta.map(g => Object.assign({}, g, { vis: g.itens.filter(x => casa(x, q)) })).filter(g => g.vis.length || (q && String(g.template).toLowerCase().includes(q)));
  const tirar = grupos.filter(g => g.classe === 'naoVai');
  const risco = A.risco.filter(r => !q || (r.template + ' ' + r.parecido.nome).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q));
  const fora = (A.pastaFora || []).filter(r => !q || String(r.template).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q));
  const docs = (gs) => gs.reduce((n, g) => n + g.itens.length, 0);
  const mostra = (k) => !f || f === k;
  const abrirTpl = (id, rot) => G.urlTemplate && G.urlTemplate(id) ? linkFora(G.urlTemplate(id), rot || 'Abrir o template no Gestta') : '';
  const verDocs = (g) => { const ab = S.abertos.has(g.chave); return '<button type="button" class="gte-link" data-gte-abrir="' + esc(g.chave) + '" aria-expanded="' + ab + '">' + (ab ? 'Esconder os documentos' : 'Ver os documentos') + '</button>' + (ab ? tabela(g.vis.length ? g.vis : g.itens, true) : ''); };
  const cab = (g) => '<b>' + esc(nome(g.template)) + '</b><span class="gte-cont">' + plural(g.itens.length, 'documento parado', 'documentos parados') + ' · ' + plural(g.nClientes, 'cliente', 'clientes') + '</span>';
  let h = '<section class="gte-topo cfg-card"><div class="gte-tit"><h2>Envios ao Portal do Cliente</h2><p' + (simples() ? ' class="ajuda"' : '') + '>Cada documento com erro tem um destino só. A pasta é a regra: só vai ao portal o documento cujo template tem a pasta da empresa 9999. <b>Reenviar</b>: o template tem essa pasta (e a tarefa não está com “Notificar cliente: Não”). <b>Tirar da lista</b>: não vai ao portal (template sem pasta, pasta fora da 9999 ou tarefa que não notifica o cliente). Se um template sem pasta for novo e deveria ir, ponha a pasta nele: os documentos passam para Reenviar. Lido na hora, nada fica guardado.</p></div>' +
    '<div class="gte-kpis">' + kpi(T.reenviar, 'para reenviar', 'reenviar', 'gte-k-erro', 'Documentos que podem ser reenviados agora') +
    kpi(docs(A.semPasta.filter(g => g.classe === 'naoVai')), 'para tirar da lista', 'naoVai', 'gte-k-neutro', 'Documentos que não vão ao portal') +
    kpi(T.pastaFora || 0, 'pastas fora da 9999', 'fora', 'gte-k-erro', 'Templates com a pasta montada a partir de outra empresa') +
    kpi(T.risco, 'em risco, ainda sem erro', 'risco', 'gte-k-risco', 'Templates sem pasta parecidos com os que vão ao portal') + '</div></section>' +
    (!S.dados.modelo ? '<div class="faixa warn"><svg class="ic"><use href="#i-alert"/></svg><div><b>Não achei a empresa 9999 no Gestta.</b> Sem ela não dá para conferir se a pasta de cada template é a válida: por enquanto toda pasta conta como válida.</div></div>' : '') +
    confHtml() +
    '<div class="gte-barra"><input type="search" id="gte-q" placeholder="Buscar cliente, documento, arquivo ou tarefa" value="' + esc(S.q) + '" autocomplete="off">' + (f ? '<button type="button" class="btn btn-sm" data-gte-f="">' + ic('x') + 'Ver tudo</button>' : '') +
    (S.dados.pendentesGestta != null ? '<span class="gte-cont" title="O número vermelho da aba Integração Portal do Cliente do Gestta conta todos os documentos pendentes de envio ao portal, não só os que deram erro.">No Gestta, ' + num(S.dados.pendentesGestta) + ' pendentes de envio ao todo; com erro: ' + num(S.dados.lidos != null ? S.dados.lidos : S.dados.envios.length) + '</span>' : '') + (S.dados.naoLidas ? '<span class="gte-aviso">' + plural(S.dados.naoLidas, 'tarefa não lida', 'tarefas não lidas') + ': para elas vale o nome do template</span>' : '') + (S.dados.cortado ? '<span class="gte-aviso">Lidos ' + num(S.dados.lidos != null ? S.dados.lidos : S.dados.envios.length) + (S.dados.total != null ? ' de ' + num(S.dados.total) : '') + ': a fila não veio inteira</span>' : '') + '</div>';
  if (mostra('reenviar')) {
    const todos = reenv.filter(podeReenviar);
    h += '<section class="gte-sec"><div class="gte-sec-h"><h3>1 · Reenviar <span class="gte-n">' + num(reenv.length) + '</span></h3><span class="gte-acoes">' +
      (todos.length ? '<button type="button" class="btn btn-sm btn-primary" data-gte-reenviar-todos' + dis + '>' + ic('repeat') + 'Reenviar ' + (todos.length === 1 ? 'o documento' : 'os ' + num(todos.length)) + '</button>' : '') + linkFora(URL_STATUS, 'Status da integração no Gestta') + '</span></div>' +
      '<p class="gte-dica">A tarefa notifica o cliente e o template tem a pasta da 9999: o Gestta tenta mandar de novo.</p>' +
      (reenv.length ? tabela(reenv) : '<p class="gte-vazio">' + ic('check') + 'Nada para reenviar.</p>') + '</section>';
  }
  if (mostra('naoVai')) {
    const n = docs(tirar);
    h += '<section class="gte-sec"><div class="gte-sec-h"><h3>2 · Tirar da lista <span class="gte-n">' + num(n) + '</span></h3><span class="gte-acoes">' +
      (n ? '<button type="button" class="btn btn-sm btn-primary" data-gte-tirar-todos' + dis + '>' + ic('x') + 'Tirar ' + (n === 1 ? 'o documento' : 'os ' + num(n)) + ' da lista</button>' : '') + '</span></div>' +
      '<p class="gte-dica">Não vão ao portal: saem da lista de erros (a lixeira da tela Status da integração; a tarefa não muda). Se algum template sem pasta deveria ir ao portal, ponha a pasta nele antes de tirar: os documentos dele passam para Reenviar.</p>' +
      (tirar.length ? '<ul class="gte-tpls">' + tirar.map(g => '<li class="gte-tpl nao"><div class="gte-tpl-h"><span class="gte-tag gte-neutro">' + ic('eye') + (g.fora ? 'Pasta fora da 9999' : g.semPasta ? 'Template sem pasta' : 'Tarefa não notifica') + '</span>' + cab(g) + '</div>' +
        '<p class="gte-motivo">' + esc(g.motivo) + '.</p>' +
        '<button type="button" class="btn btn-sm gte-usar" data-gte-tirar="' + esc(g.chave) + '"' + dis + '>' + ic('x') + 'Tirar ' + (g.itens.length === 1 ? 'o documento' : 'os ' + num(g.itens.length)) + ' da lista</button> ' +
        (g.fora && g.templateId ? '<button type="button" class="btn btn-sm gte-usar" data-gte-tirarpasta="' + esc(g.templateId) + '"' + dis + '>' + ic('x') + 'Tirar a pasta e os documentos</button> ' + abrirTpl(g.templateId) + ' ' : '') +
        (g.semPasta && g.templateId ? '<span class="gte-cont">Deveria ir?</span> ' + (g.parecido && g.parecido.integracao ? '<button type="button" class="btn btn-sm gte-usar" data-gte-pasta="' + esc(g.templateId) + '" data-gte-modelo="' + esc(g.parecido.id) + '"' + dis + '>' + ic('check') + 'Usar a pasta ' + esc(g.parecido.pasta) + '</button> ' : '') + abrirTpl(g.templateId, 'Pôr a pasta no Gestta') + ' ' : '') + verDocs(g) + '</li>').join('') + '</ul>' : '<p class="gte-vazio">' + ic('check') + 'Nada para tirar da lista.</p>') + '</section>';
  }
  if (mostra('fora') && (fora.length || f === 'fora')) {
    h += '<section class="gte-sec"><div class="gte-sec-h"><h3>Pastas fora da empresa 9999 <span class="gte-n">' + num(fora.length) + '</span></h3><span class="gte-acoes">' +
      (fora.length > 1 && S.dados.modelo ? '<button type="button" class="btn btn-sm btn-primary" data-gte-tirarpasta-todos' + dis + '>' + ic('x') + 'Tirar as ' + num(fora.length) + ' pastas</button>' : '') + '</span></div>' +
      '<p class="gte-dica">A única pasta válida é a montada a partir da empresa 9999' + (S.dados.modelo && S.dados.modelo.nome ? ' (' + esc(nome(S.dados.modelo.nome)) + ')' : '') + '. Estes templates têm a pasta montada a partir de outra empresa: a pasta sai do template e os documentos dele com erro saem da lista (bloco 2).</p>' +
      (fora.length ? '<ul class="gte-risco">' + fora.map(r => '<li><b>' + esc(nome(r.template)) + '</b><span>pasta ' + esc(r.pasta) + (r.docs ? ' · ' + plural(r.docs, 'documento parado', 'documentos parados') : '') + '</span>' + (S.dados.modelo ? '<button type="button" class="btn btn-sm gte-usar" data-gte-tirarpasta="' + esc(r.templateId) + '"' + dis + '>' + ic('x') + 'Tirar a pasta</button> ' : '') + abrirTpl(r.templateId) + '</li>').join('') + '</ul>' : '<p class="gte-vazio">' + ic('check') + 'Nenhuma pasta fora da 9999.</p>') + '</section>';
  }
  if (mostra('risco')) {
    h += '<section class="gte-sec"><div class="gte-sec-h"><h3>Templates em risco, ainda sem erro <span class="gte-n">' + num(risco.length) + '</span></h3>' + (pastasDe(risco).length > 1 ? '<span class="gte-acoes"><button type="button" class="btn btn-sm btn-primary" data-gte-pastas="risco"' + dis + '>' + ic('check') + 'Usar as pastas sugeridas (' + num(pastasDe(risco).length) + ')</button></span>' : '') + '</div>' +
      '<p class="gte-dica">Sem pasta no portal, ligados a algum template de tarefa ativo e com nome parecido com um template que vai. Quando um documento deles chegar, cai em Tirar da lista; se deveria ir, ponha a pasta antes.</p>' +
      (!S.dados.vinculados ? '<p class="gte-aviso">Não deu para conferir quais templates estão em tarefas ativas: a lista mostra todos os parecidos.</p>' : '') +
      (risco.length ? '<ul class="gte-risco">' + risco.map(r => '<li><b>' + esc(nome(r.template)) + '</b><span>parecido com <b>' + esc(nome(r.parecido.nome)) + '</b>, que vai para ' + esc(r.parecido.pasta) + '</span>' +
        (r.parecido.integracao ? '<button type="button" class="btn btn-sm gte-usar" data-gte-pasta="' + esc(r.templateId) + '" data-gte-modelo="' + esc(r.parecido.id) + '"' + dis + '>Usar a mesma pasta</button> ' : '') + abrirTpl(r.templateId) + '</li>').join('') + '</ul>' : '<p class="gte-vazio">' + ic('check') + 'Nenhum template em risco.</p>') + '</section>';
  }
  v.innerHTML = h;
}
const topo = (v) => { const c = v.querySelector('.gte-conf'); if (c) c.scrollIntoView({ block: 'center' }); };
export function ligarEnvios(v, redesenhar, paraPai) {
  v.addEventListener('click', (e) => {
    if (!v.querySelector('.gte-topo, [data-gte-ler]')) return;
    const t = e.target.closest('[data-gte-f],[data-gte-abrir],[data-gte-ler],[data-abrir],[data-gte-reenviar],[data-gte-reenviar-todos],[data-gte-pasta],[data-gte-tirar],[data-gte-tirar-todos],[data-gte-pastas],[data-gte-tirarpasta],[data-gte-tirarpasta-todos],[data-gte-confirmar],[data-gte-cancelar]'); if (!t) return;
    const A = S.analise;
    if (t.dataset.gteCancelar != null) { S.conf = null; redesenhar(); return; }
    if (t.dataset.gteConfirmar != null) { executarConf(redesenhar); return; }
    if (t.dataset.gteReenviar != null && A) { const x = A.reenviar.find(i => i.id === t.dataset.gteReenviar); if (x && podeReenviar(x)) { S.conf = { tipo: 'reenviar', itens: [x] }; redesenhar(); topo(v); } return; }
    if (t.dataset.gtePastas != null && A) {
      const l = pastasDe(t.dataset.gtePastas === 'risco' ? A.risco : A.semPasta.filter(g => g.classe === 'deve'));
      if (l.length) { S.conf = { tipo: 'pastas', lista: l }; redesenhar(); topo(v); }
      return;
    }
    if ((t.dataset.gteTirarpasta != null || t.dataset.gteTirarpastaTodos != null) && A) {
      const alvo = t.dataset.gteTirarpastaTodos != null ? (A.pastaFora || []) : (A.pastaFora || []).filter(x => x.templateId === t.dataset.gteTirarpasta);
      const lista = alvo.map(x => ({ templateId: x.templateId, template: x.template, pasta: x.pasta,
        ids: A.semPasta.filter(g => g.fora && g.templateId === x.templateId).flatMap(g => g.itens.map(i => i.id)).filter(v => /^[0-9a-f]{24}$/i.test(v || '')) }));
      if (lista.length) { S.conf = { tipo: 'tirarPasta', lista }; redesenhar(); topo(v); }
      return;
    }
    if ((t.dataset.gteTirar != null || t.dataset.gteTirarTodos != null) && A) {
      const gs = A.semPasta.filter(g => g.classe === 'naoVai' && (t.dataset.gteTirarTodos != null || g.chave === t.dataset.gteTirar));
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

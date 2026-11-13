/* Tarefas do Gestta · soltar documentos para o Express (0.102.0, Josué 12/11/2026):
   "ao arrastar um documento mesmo que eu não esteja na tarefa ele pegue e direcione usando o mecanismo do Express dando um aviso de pra
   quais tarefas de quais empresas aquele documento foi"; "quando o leitor do Express falhar a extensão lê o documento e sugere pra qual
   tarefa / item ele deve ir, confirmando a extensão já anexa mesmo sem o Express reconhecer"; caso nada ache, um e-mail pronto no Zimbra
   ("na extensão apenas avisa pro próprio analista escolher o e-mail da gestão ou do setor do Portal do Cliente").
   Arrastar em cima de um item da tarefa continua indo direto para ele (gestta-trilha.js, sem Express).
   Fluxo, sempre com confirmação: soltar → "Ler com o Express" → o que o Express achou (ou a sugestão da extensão) → "Vincular" → o aviso
   de para onde cada arquivo foi. Arquivo, texto lido e resultados ficam só na memória desta tela.
   0.110.0 (Josué, 13/11/2026): depois de "Ler com o Express" nada fica por cima da tela. A leitura, a sugestão e o vínculo andam num
   cartão no canto (barra de progresso, o arquivo da vez, Recolher e Cancelar), a tela atrás continua clicável e a escolha dos destinos
   só abre pelo botão "Escolher destinos". Esc recolhe o cartão. O "Pronto" fica no cartão e some sozinho se tudo deu certo. */
import { esc, toast, copiarTexto } from './util.js';

const G = window.OCG;
const ARQ_MAX = (G && G.ARQ_MAX) || 15 * 1024 * 1024;
const ZIMBRA = 'https://mail.controltax.com.br/';
const tamanho = n => n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const lerBase64 = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).replace(/^data:[^,]*,/, '')); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
const nome = (t) => G && G.nomeLegivel ? G.nomeLegivel(t) : t;
const comp = (c) => { const m = /^(\d{4})-(\d{2})/.exec(String(c || '')); return m ? m[2] + '/' + m[1] : ''; };
const temArquivos = e => !!(e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files'));

let O = null;            // { enviar, tarefas(), atual() }
let S = null;            // a janela aberta: { itens: [{ f, estado, express, sug, escolha, erro, cnpjs, comps, final }], fase, atual, modo, parar }
// modo: 'grande' (janela no meio, com fundo: a confirmação e a escolha dos destinos) · 'canto' (cartão sem fundo) · 'recolhido'
const PRONTO_SOME_MS = 6000;
let veu = null, cont = 0;

export function ligarSoltar(o) {
  O = o;
  if (document.__gtSoltarExpress) return;
  document.__gtSoltarExpress = true;
  veu = document.createElement('div'); veu.className = 'gs-veu'; veu.hidden = true; veu.setAttribute('aria-hidden', 'true');
  veu.innerHTML = '<div class="gs-veu-caixa"><svg class="ic" aria-hidden="true"><use href="#i-upload"/></svg><b></b><span></span></div>';
  document.body.appendChild(veu);
  const noItem = (e) => !!(e.target && e.target.closest && e.target.closest('[data-gp-drop]'));
  const naTarefa = (e) => !!(e.target && e.target.closest && e.target.closest('#gt-painel, #gd-det, .gp'));
  const mostrar = (e) => {
    const t = naTarefa(e) && O.atual && O.atual();
    veu.querySelector('b').textContent = t ? 'Soltar nesta tarefa' : 'Soltar aqui';
    veu.querySelector('span').textContent = t ? 'O Express escolhe o item de “' + nome(t.name || 'tarefa') + '”.' : 'O Express procura a empresa, a tarefa e o item de cada arquivo.';
    veu.hidden = false;
  };
  document.addEventListener('dragenter', e => { if (!temArquivos(e) || S) return; cont++; if (!noItem(e)) mostrar(e); else veu.hidden = true; }, true);
  document.addEventListener('dragover', e => { if (!temArquivos(e) || noItem(e)) { if (veu && !S && noItem(e)) veu.hidden = true; return; } e.preventDefault(); e.dataTransfer.dropEffect = S ? 'none' : 'copy'; if (!S) mostrar(e); }, true);
  document.addEventListener('dragleave', e => { if (!temArquivos(e)) return; cont = Math.max(0, cont - 1); if (!cont) veu.hidden = true; }, true);
  document.addEventListener('drop', e => {
    if (!temArquivos(e)) return;
    cont = 0; veu.hidden = true;
    if (noItem(e)) return;                               // em cima de um item: vai direto (gestta-trilha.js)
    e.preventDefault(); e.stopPropagation();
    if (S) { toast('Termine o que está aberto antes de soltar outros arquivos.', true); return; }
    abrir(Array.from(e.dataTransfer.files || []), naTarefa(e) && O.atual ? O.atual() : null);
  }, true);
}

/* ---------- a janela ---------- */
function abrir(arquivos, atual) {
  const fs = arquivos.filter(f => f && f.size != null);
  if (!fs.length) return;
  S = { atual, fase: 'confirmar', modo: 'grande', itens: fs.map(f => ({ f, estado: f.size > ARQ_MAX ? 'grande' : 'novo' })) };
  let el = document.getElementById('gs-dlg');
  if (!el) {
    el = document.createElement('div'); el.id = 'gs-dlg'; el.className = 'gs-dlg'; el.setAttribute('aria-label', 'Documentos soltos');
    document.body.appendChild(el);
    el.addEventListener('click', clique); el.addEventListener('change', mudou);
    el.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !S) return;
      e.stopPropagation();
      if (S.modo === 'canto') modo('recolhido');
      else if (S.modo === 'grande') { if (S.fase === 'confirmar') fechar(); else modo('canto'); }
    });
  }
  el.hidden = false; desenhar();
  setTimeout(() => { const b = el.querySelector('[data-gs="ler"]'); if (b) b.focus(); }, 20);
}
function fechar() { const el = document.getElementById('gs-dlg'); if (el) { el.hidden = true; el.innerHTML = ''; } if (S && S.timer) clearTimeout(S.timer); S = null; }
function modo(m) {
  if (!S) return;
  if (S.timer && m === 'grande') { clearTimeout(S.timer); S.timer = null; }
  S.modo = m; desenhar();
  const el = document.getElementById('gs-dlg'); if (!el) return;
  const alvo = m === 'grande' ? el.querySelector('.gs-caixa select, [data-gs="vincular"], [data-gs="fechar"]') : el.querySelector('[data-gs="expandir"], [data-gs="recolher"]');
  if (alvo) setTimeout(() => alvo.focus(), 20);
}

function destinoTxt(d) {
  if (!d) return '';
  return [d.cliente && d.cliente.nome && nome(d.cliente.nome), d.tarefa && nome(d.tarefa.nome) + (d.tarefa.competencia ? ' (' + comp(d.tarefa.competencia) + ')' : ''), d.documento && '“' + nome(d.documento.nome) + '”'].filter(Boolean).join(' · ');
}
function linha(it, i) {
  const f = it.f, cab = '<div class="gs-arq"><b>' + esc(f.name) + '</b><small>' + tamanho(f.size) + '</small></div>';
  let corpo = '';
  if (it.estado === 'grande') corpo = '<p class="gs-st erro">Acima de 15 MB: fica de fora.</p>';
  else if (it.estado === 'novo') corpo = '<p class="gs-st">Aguardando a leitura.</p>';
  else if (it.estado === 'lendo') corpo = '<p class="gs-st">Lendo com o Express…</p>';
  else if (it.estado === 'sugerindo') corpo = '<p class="gs-st">O Express não achou: lendo o documento para sugerir…</p>';
  else if (it.estado === 'pronto' || it.estado === 'semDestino') {
    const ops = (it.express && it.express.achou ? [Object.assign({ origem: 'express' }, expressDestino(it.express))] : []).concat((it.sug || []).map(s => Object.assign({ origem: 'sugestao' }, s)));
    it.ops = ops;
    if (ops.length) {
      const sel = '<select data-gs-esc="' + i + '" aria-label="Destino de ' + esc(f.name) + '">' + ops.map((o, j) => '<option value="' + j + '"' + (it.escolha === j ? ' selected' : '') + '>' + esc((o.origem === 'express' ? 'Express: ' : 'Sugestão: ') + destinoTxt(o)) + '</option>').join('') + '<option value="-1"' + (it.escolha === -1 ? ' selected' : '') + '>Não vincular este arquivo</option></select>';
      const o = it.escolha >= 0 ? ops[it.escolha] : null;
      corpo = (it.express && it.express.achou ? '<p class="gs-st ok">O Express achou o destino.</p>' : '<p class="gs-st gs-sug">O Express não achou' + (it.express && it.express.erro ? ' (' + esc(it.express.erro) + ')' : '') + '. A extensão sugere:</p>') + sel +
        (o && o.porque ? '<small class="gs-porque">' + esc(o.porque.join(' · ')) + '</small>' : '') +
        (o && S.atual && o.tarefa && o.tarefa.id !== S.atual._id ? '<small class="gs-porque">Não é a tarefa que estava aberta.</small>' : '');
    } else {
      corpo = '<p class="gs-st erro">Nem o Express nem a extensão acharam a tarefa.' + (it.motivo ? ' ' + esc(it.motivo) : '') + '</p>' +
        '<div class="gs-mail"><button type="button" class="btn btn-sm" data-gs-mail="' + i + '">Avisar por e-mail (Zimbra)</button><button type="button" class="btn btn-sm" data-gs-copiar="' + i + '">Copiar o texto do aviso</button></div>' +
        '<small class="gs-porque">No e-mail, escolha no Para a gestão do seu departamento ou o setor do Portal do Cliente.</small>';
    }
  } else if (it.estado === 'feito') corpo = '<p class="gs-st ok">Foi para ' + esc(destinoTxt(it.final)) + '.</p>';
  else if (it.estado === 'falhou') corpo = '<p class="gs-st erro">' + esc(it.erro || 'Não foi.') + '</p>';
  else if (it.estado === 'pulado') corpo = '<p class="gs-st">Não vinculado.</p>';
  else if (it.estado === 'vinculando') corpo = '<p class="gs-st">Vinculando…</p>';
  return '<li class="gs-it">' + cab + corpo + '</li>';
}
const lidoFim = x => ['pronto', 'semDestino', 'falhou', 'pulado'].includes(x.estado);
const icone = n => '<svg class="ic ic-sm" aria-hidden="true"><use href="#i-' + n + '"/></svg>';
function barra(feitos, total, rot) {
  const pct = total ? Math.round(feitos * 100 / total) : 0;
  return '<div class="gs-prog" role="progressbar" aria-valuemin="0" aria-valuemax="' + total + '" aria-valuenow="' + feitos + '" aria-label="' + esc(rot) + '"><span style="width:' + pct + '%"></span></div><p class="gs-c-num">' + esc(rot) + '</p>';
}
// o cartão do canto (e a faixa recolhida): o andamento sem tapar a tela
function cantoHtml() {
  const validos = S.itens.filter(x => x.estado !== 'grande');
  const da_vez = S.itens.find(x => x.estado === 'lendo' || x.estado === 'sugerindo' || x.estado === 'vinculando');
  const esperam = S.itens.filter(x => x.estado === 'pronto' || x.estado === 'semDestino').length;
  const ok = S.itens.filter(x => x.estado === 'feito').length, falhas = S.itens.filter(x => x.estado === 'falhou').length;
  let tit = '', corpo = '', bts = '', curto = '';
  const recolher = '<button type="button" class="btn btn-sm" data-gs="recolher">Recolher</button>';
  const cancelar = S.parar ? '' : '<button type="button" class="btn btn-sm" data-gs="cancelar">Cancelar</button>';
  if (S.fase === 'lendo') {
    const n = validos.filter(lidoFim).length;
    tit = S.parar ? 'Parando a leitura…' : 'Lendo com o Express'; curto = 'Lendo ' + n + ' de ' + validos.length;
    corpo = barra(n, validos.length, n + ' de ' + validos.length + (validos.length === 1 ? ' arquivo lido' : ' arquivos lidos')) +
      (da_vez ? '<p class="gs-c-arq" title="' + esc(da_vez.f.name) + '">' + (da_vez.estado === 'sugerindo' ? 'Procurando o destino de ' : 'Lendo ') + '<b>' + esc(da_vez.f.name) + '</b></p>' : '');
    bts = recolher + cancelar;
  } else if (S.fase === 'escolher') {
    tit = esperam === 1 ? '1 arquivo espera o destino' : esperam + ' arquivos esperam o destino'; curto = tit;
    corpo = '<p class="gs-c-arq">Leitura terminada. Nada foi vinculado: confira para onde cada um vai.</p>';
    bts = '<button type="button" class="btn btn-primary btn-sm" data-gs="escolher">Escolher destinos</button>' + recolher + '<button type="button" class="btn btn-sm" data-gs="fechar">Descartar</button>';
  } else if (S.fase === 'vinculando') {
    const n = ok + falhas, t = S.totalVinc || 0;
    tit = S.parar ? 'Parando…' : 'Vinculando'; curto = 'Vinculando ' + n + ' de ' + t;
    corpo = barra(n, t, n + ' de ' + t + (t === 1 ? ' vinculado' : ' vinculados')) + (da_vez ? '<p class="gs-c-arq" title="' + esc(da_vez.f.name) + '">Vinculando <b>' + esc(da_vez.f.name) + '</b></p>' : '');
    bts = recolher + cancelar;
  } else if (S.fase === 'fim') {
    tit = 'Pronto'; curto = 'Pronto: ' + ok + (ok === 1 ? ' vinculado' : ' vinculados');
    corpo = '<p class="gs-c-arq">' + (ok ? (ok === 1 ? '1 arquivo vinculado: ' + esc(destinoTxt((S.itens.find(x => x.estado === 'feito') || {}).final)) : ok + ' arquivos vinculados.') : 'Nenhum arquivo vinculado.') + (falhas ? ' <b class="gs-c-erro">' + (falhas === 1 ? '1 não foi.' : falhas + ' não foram.') + '</b>' : '') + '</p>';
    bts = '<button type="button" class="btn btn-sm" data-gs="ver">Ver para onde cada um foi</button><button type="button" class="btn btn-sm" data-gs="fechar">Fechar</button>';
  }
  if (S.modo === 'recolhido') return '<div class="gs-canto gs-recolhido">' + (S.fase === 'lendo' || S.fase === 'vinculando' ? '<span class="gs-gira" aria-hidden="true"></span>' : '') + '<span class="gs-c-curto">' + esc(curto) + '</span><button type="button" class="btn btn-sm" data-gs="expandir" aria-label="Expandir: ' + esc(curto) + '">Expandir</button></div>';
  return '<div class="gs-canto"><div class="gs-c-cab">' + icone('upload') + '<h2>' + esc(tit) + '</h2></div>' + corpo + '<div class="gs-bt">' + bts + '</div></div>';
}
function desenhar() {
  const el = document.getElementById('gs-dlg'); if (!el || !S) return;
  const grande = S.modo === 'grande';
  el.className = 'gs-dlg' + (grande ? '' : ' canto') + (S.modo === 'recolhido' ? ' recolhido' : '');
  if (grande) { el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.removeAttribute('aria-live'); }
  else { el.setAttribute('role', 'region'); el.removeAttribute('aria-modal'); el.setAttribute('aria-live', 'polite'); }
  if (!grande) { el.innerHTML = cantoHtml(); return; }
  const n = S.itens.length, validos = S.itens.filter(x => x.estado !== 'grande').length;
  const marcados = S.itens.filter(x => x.estado === 'pronto' && x.escolha >= 0).length;
  const titulo = S.fase === 'confirmar' ? (n === 1 ? 'Ler 1 arquivo com o Express?' : 'Ler ' + n + ' arquivos com o Express?')
    : S.fase === 'lendo' ? 'Lendo…' : S.fase === 'escolher' ? 'Para onde cada arquivo vai' : S.fase === 'vinculando' ? 'Vinculando…' : 'Pronto';
  const dica = S.fase === 'confirmar' ? (S.atual ? 'Soltos na tarefa “' + nome(S.atual.name || '') + '”. ' : '') + 'O Express do Gestta lê cada arquivo e procura a empresa, a tarefa e o item. Nada é vinculado antes de você conferir.'
    : S.fase === 'escolher' ? 'Confira o destino de cada arquivo. O do Express vem marcado; quando ele não acha, a extensão sugere pelo CNPJ, pela competência e pelo nome do item.'
    : S.fase === 'fim' ? 'Aviso de para onde cada arquivo foi.' : '';
  const bt = S.fase === 'confirmar' ? '<button type="button" class="btn btn-primary" data-gs="ler"' + (validos ? '' : ' disabled') + '>Ler com o Express</button><button type="button" class="btn" data-gs="fechar">Cancelar</button>'
    : S.fase === 'escolher' ? '<button type="button" class="btn btn-primary" data-gs="vincular"' + (marcados ? '' : ' disabled') + '>' + (marcados === 1 ? 'Vincular o arquivo' : 'Vincular os ' + marcados + ' arquivos') + '</button><button type="button" class="btn" data-gs="canto">Deixar para depois</button><button type="button" class="btn" data-gs="fechar">Descartar</button>'
    : S.fase === 'fim' ? '<button type="button" class="btn btn-primary" data-gs="fechar">Fechar</button>' : '';
  el.innerHTML = '<div class="gs-caixa"><h2>' + esc(titulo) + '</h2>' + (dica ? '<p class="gs-dica">' + esc(dica) + '</p>' : '') + '<ul class="gs-lista">' + S.itens.map(linha).join('') + '</ul><div class="gs-bt">' + bt + '</div></div>';
}
const expressDestino = (x) => ({ tarefa: x.tarefa ? { id: x.tarefa.id, nome: x.tarefa.nome, competencia: x.tarefa.competencia } : null, cliente: x.tarefa && x.tarefa.cliente ? { id: x.tarefa.cliente.id, nome: x.tarefa.cliente.nome } : null, documento: x.documento });

/* ---------- ler: Express e, se ele não achar, a sugestão da extensão ---------- */
async function ler() {
  S.fase = 'lendo'; S.modo = 'canto'; desenhar();
  for (const it of S.itens) {
    if (!S) return;
    if (it.estado === 'grande') continue;
    if (S.parar) { it.estado = 'pulado'; continue; }
    it.estado = 'lendo'; desenhar();
    try { it.b64 = await lerBase64(it.f); } catch (e) { it.estado = 'falhou'; it.erro = 'Não consegui ler o arquivo.'; continue; }
    const r = await O.enviar({ cmd: 'gesttaAcao', acao: 'expressLer', arquivo: { nome: it.f.name, tipo: it.f.type || '', base64: it.b64 } });
    if (!S) return;
    if (r && r.ok && r.express) it.express = r.express;
    else { it.express = { achou: false, erro: (r && r.erro) || 'o Express não respondeu' }; if (r && r.status === 401) { it.estado = 'falhou'; it.erro = r.erro; break; } }
    if (it.express.achou) { it.estado = 'pronto'; it.escolha = 0; desenhar(); continue; }
    it.estado = 'sugerindo'; desenhar();
    await sugerir(it);
    if (!S) return;
    it.estado = (it.sug && it.sug.length) ? 'pronto' : 'semDestino'; it.escolha = it.sug && it.sug.length ? 0 : -1;
    desenhar();
  }
  if (!S) return;
  S.parar = false;
  if (!S.itens.some(x => x.estado === 'pronto' || x.estado === 'semDestino')) { S.fase = 'fim'; desenhar(); return; }
  S.fase = 'escolher'; desenhar();
}
async function sugerir(it) {
  const t = await O.enviar({ cmd: 'gesttaTextoDoc', base64: it.b64, tipo: it.f.type || '', nome: it.f.name });
  const texto = t && t.ok ? String(t.texto || '') : '';
  if (!texto.trim()) { it.motivo = t && t.ok ? 'O arquivo não tem texto para ler (documento escaneado ou imagem).' : 'Não consegui ler o texto do arquivo.'; return; }
  it.cnpjs = G.cnpjsDoTexto(texto); it.comps = G.competenciasDoTexto(texto);
  if (!it.cnpjs.length) { it.motivo = 'Não achei CNPJ no documento.'; return; }
  const c = await O.enviar({ cmd: 'gesttaClientesCnpj', cnpjs: it.cnpjs });
  const clientes = c && c.ok ? c.clientes || [] : [];
  if (!clientes.length) { it.motivo = 'O CNPJ do documento não é de um cliente do Gestta.'; return; }
  const ids = new Set(clientes.map(x => x.id));
  const tarefas = (O.tarefas() || []).filter(x => x && x.customer && ids.has(x.customer._id) && x.status !== 'DONE')
    .map(x => ({ id: x._id, nome: x.name, status: x.status, clienteId: x.customer._id, competencia: x.competence_date || '' }));
  if (!tarefas.length) { it.motivo = 'Nenhuma tarefa aberta dessa empresa na lista desta tela (troque a competência ou de quem ver).'; return; }
  // os itens de cada tarefa (no máximo 6 tarefas, a da competência citada primeiro)
  const cps = new Set(it.comps || []);
  tarefas.sort((a, b) => (cps.has(String(b.competencia).slice(0, 7)) - cps.has(String(a.competencia).slice(0, 7))) || ((b.id === (S.atual && S.atual._id)) - (a.id === (S.atual && S.atual._id))));
  const docsPorTarefa = {};
  for (const x of tarefas.slice(0, 6)) {
    const d = await O.enviar({ cmd: 'gesttaTarefa', id: x.id });
    if (d && d.ok && d.tarefa) docsPorTarefa[x.id] = d.tarefa.company_documents || [];
  }
  it.sug = G.sugerirDestinos({ texto, clientes: clientes.map(c => Object.assign({}, c, { nome: nome(c.nome) })), tarefas, docsPorTarefa, atual: S.atual && S.atual._id });
  if (!it.sug.length) it.motivo = 'As tarefas dessa empresa não têm item de documento.';
}

/* ---------- vincular ---------- */
async function vincular() {
  S.totalVinc = S.itens.filter(x => x.estado === 'pronto' && x.escolha >= 0).length;
  S.fase = 'vinculando'; S.modo = 'canto'; desenhar();
  for (const it of S.itens) {
    if (!S) return;
    if (S.parar && it.estado === 'pronto') { it.estado = 'pulado'; continue; }
    if (it.estado !== 'pronto') { if (it.estado === 'semDestino') it.estado = 'pulado'; continue; }
    if (it.escolha < 0) { it.estado = 'pulado'; continue; }
    const o = it.ops[it.escolha];
    it.estado = 'vinculando'; desenhar();
    let r = null;
    // pelo Express (o arquivo já está no registro dele); se o Express recusar o destino escolhido, envio direto no item (o mesmo do "Enviar arquivo")
    if (it.express && it.express.id) r = await O.enviar({ cmd: 'gesttaAcao', acao: 'expressConfirmar', express: it.express.id, tarefa: o.tarefa.id, documento: o.documento.id });
    if (!(r && r.ok) && !(r && r.status === 401)) r = await O.enviar({ cmd: 'gesttaAcao', id: o.tarefa.id, acao: 'documento', documento: o.documento.id, arquivo: { nome: it.f.name, tipo: it.f.type || '', base64: it.b64 } });
    if (r && r.ok) { it.estado = 'feito'; it.final = o; try { window.dispatchEvent(new CustomEvent('gt-tarefa-mudou', { detail: { id: o.tarefa.id } })); } catch (e) {} }
    else { it.estado = 'falhou'; it.erro = (r && r.erro) || 'O Gestta não respondeu.'; if (r && r.status === 401) break; }
    desenhar();
  }
  if (!S) return;
  S.fase = 'fim'; S.parar = false; desenhar();
  // tudo certo: o "Pronto" some sozinho do canto; com falha, fica até a pessoa fechar
  if (!S.itens.some(x => x.estado === 'falhou') && S.modo !== 'grande') { const eu = S; S.timer = setTimeout(() => { if (S === eu && S.fase === 'fim' && S.modo !== 'grande') fechar(); }, PRONTO_SOME_MS); }
}

/* ---------- e-mail pronto no Zimbra (sem destinatário: o analista escolhe a gestão do departamento ou o setor do Portal do Cliente) ---------- */
function textoAviso(it) {
  const linhas = ['Olá,', '', 'O documento abaixo não foi lido pelo Express do Gestta e a extensão não achou a tarefa para ele.', '',
    'Arquivo: ' + it.f.name + ' (' + tamanho(it.f.size) + ')'];
  if (S && S.atual) linhas.push('Tarefa aberta quando soltei: ' + nome(S.atual.name || '') + (S.atual.customer ? ' · ' + nome(S.atual.customer.name || '') : ''));
  if (it.express && it.express.erro) linhas.push('O que o Express disse: ' + it.express.erro);
  if (it.motivo) linhas.push('O que a extensão achou: ' + it.motivo);
  if (it.cnpjs && it.cnpjs.length) linhas.push('CNPJ lido no documento: ' + it.cnpjs.map(c => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')).join(', '));
  if (it.comps && it.comps.length) linhas.push('Competência citada: ' + it.comps.slice(0, 3).map(comp).join(', '));
  linhas.push('', 'Podem me ajudar a direcionar? O arquivo segue comigo.');
  return { assunto: 'Documento não lido pelo Express: ' + it.f.name, corpo: linhas.join('\n') };
}
export const urlZimbra = (assunto, corpo) => ZIMBRA + '?view=compose&subject=' + encodeURIComponent(assunto) + '&body=' + encodeURIComponent(corpo);

function clique(e) {
  const b = e.target.closest('[data-gs],[data-gs-mail],[data-gs-copiar]'); if (!b || !S) return;
  if (b.dataset.gs === 'fechar') { if (S.fase !== 'lendo' && S.fase !== 'vinculando') fechar(); return; }
  if (b.dataset.gs === 'cancelar') { S.parar = true; desenhar(); return; }      // para depois do arquivo da vez
  if (b.dataset.gs === 'recolher') { modo('recolhido'); return; }
  if (b.dataset.gs === 'expandir' || b.dataset.gs === 'canto') { modo('canto'); return; }
  if (b.dataset.gs === 'escolher' || b.dataset.gs === 'ver') { modo('grande'); return; }
  if (b.dataset.gs === 'ler') { ler(); return; }
  if (b.dataset.gs === 'vincular') { vincular(); return; }
  const i = +(b.dataset.gsMail != null ? b.dataset.gsMail : b.dataset.gsCopiar), it = S.itens[i]; if (!it) return;
  const a = textoAviso(it);
  if (b.dataset.gsMail != null) { try { window.open(urlZimbra(a.assunto, a.corpo), '_blank', 'noopener'); } catch (x) {} toast('E-mail aberto no Zimbra: escolha no Para a gestão do seu departamento ou o setor do Portal do Cliente.'); return; }
  copiarTexto(a.assunto + '\n\n' + a.corpo).then(ok => ok ? toast('Texto do aviso copiado.') : toast('Não consegui copiar.', true));
}
function mudou(e) {
  const s = e.target.closest('[data-gs-esc]'); if (!s || !S) return;
  const it = S.itens[+s.dataset.gsEsc]; if (!it) return;
  it.escolha = +s.value; desenhar();
}
export const estadoSoltar = () => S;

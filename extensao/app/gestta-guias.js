/* Tarefas do Gestta · aba Guias da folha (0.116.0, fase 1: só leitura).
   Josué, 13/11 e 16/11/2026 (mapa em mapeamento/guias-fgts-dctfweb.md; desenho em guias-fgts-dctfweb-desenho.md): a extensão lista as
   tarefas FGTS DIGITAL da competência, mostra quais ainda estão sem a guia anexada, o analista escolhe as empresas e a extensão lê o
   "Valor do FGTS" do Extrato Mensal publicado no portal de documentos do Onvio; desde a 0.118.0 confere esse valor no FGTS Digital (só
   leitura). A emissão e o anexo são as fases seguintes (aparecem no trilho, ainda sem ação). Tudo só na memória desta tela: os valores nunca são guardados. */
import { esc, num, plural, simples } from './util.js';
import { abrirPainel } from './gestta-trilha.js';
import { concluirComEtapas } from './gestta-concluir.js';

const S = { comp: '', dados: null, carregando: false, erro: null, itens: {}, lendoItens: null, extratos: {}, lendoExt: null, erroExt: '',
  sel: new Set(), modo: {}, verFeitas: false, fgts: {}, conf: null, erroConf: '', parar: false,
  guias: {}, emis: null, confirmarEmissao: false, erroEmis: '',
  anexos: {}, anexando: null, confirmarAnexo: false, concluirDepois: false, erroAnexo: '', pasta: null };
let enviarFn = null, aoMudar = () => {}, paraPaiFn = () => {};
const ic = (n) => '<svg class="ic ic-sm" aria-hidden="true"><use href="#i-' + n + '"/></svg>';
const nomeLeg = (t) => window.OCG && OCG.nomeLegivel ? OCG.nomeLegivel(t) : t;
const reais = (n) => typeof n === 'number' ? 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
const chave = (t) => t.empresa.cnpj || t.empresa.code || t.empresa.nome;
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function estadoGuias() { return S; }
// a aba segue a competência escolhida no topo das Tarefas do Gestta
export async function lerGuias(enviar, redesenhar, comp, forcar) {
  enviarFn = enviar; aoMudar = redesenhar || aoMudar;
  const k = comp.ano + '-' + String(comp.mes).padStart(2, '0');
  if (S.comp !== k) { S.comp = k; S.dados = null; S.itens = {}; S.extratos = {}; S.fgts = {}; S.guias = {}; S.anexos = {}; S.pasta = null; S.sel.clear(); }
  const vez = (lerGuias.vez = (lerGuias.vez || 0) + 1);
  S.carregando = true; S.erro = null; aoMudar();
  const r = await enviar({ cmd: 'guiasFolha', parte: 'lista', ano: comp.ano, mes: comp.mes, forcar: !!forcar });
  if (lerGuias.vez !== vez) return;
  S.carregando = false;
  if (!r || !r.ok) { S.erro = r || { erro: 'sem resposta' }; aoMudar(); return; }
  S.dados = r; aoMudar();
  await lerItens(vez);
}
// os itens de cada tarefa ainda aberta (uma leitura por vez, 10 por pedido); as concluídas já têm a guia
async function lerItens(vez) {
  const faltam = S.dados.tarefas.filter(t => t.status !== 'DONE' && !(t.id in S.itens));
  if (!faltam.length) return;
  S.lendoItens = { feitos: 0, total: faltam.length }; aoMudar();
  for (let i = 0; i < faltam.length; i += 10) {
    const pedaco = faltam.slice(i, i + 10);
    const r = await enviarFn({ cmd: 'guiasFolha', parte: 'itens', ids: pedaco.map(t => t.id) });
    if (lerGuias.vez !== vez) return;
    if (r && r.porTarefa) Object.assign(S.itens, r.porTarefa);
    if (!r || !r.ok) { S.erroItens = (r && r.erro) || 'sem resposta'; break; }
    S.lendoItens.feitos += pedaco.length; aoMudar();
  }
  S.lendoItens = null; aoMudar();
}
async function lerExtratos() {
  const [ano, mes] = S.comp.split('-').map(Number);
  const alvo = S.dados.tarefas.filter(t => S.sel.has(t.id) && !(S.extratos[chave(t)] && S.extratos[chave(t)].ok));
  if (!alvo.length) return;
  S.lendoExt = { feitos: 0, total: alvo.length }; S.erroExt = ''; aoMudar();
  for (let i = 0; i < alvo.length; i += 3) {
    const pedaco = alvo.slice(i, i + 3);
    const r = await enviarFn({ cmd: 'guiasFolha', parte: 'extrato', ano, mes, empresas: pedaco.map(t => t.empresa) });
    if (r && r.porCodigo) Object.assign(S.extratos, r.porCodigo);
    if (!r || !r.ok) { S.erroExt = (r && r.erro) || 'sem resposta'; break; }
    S.lendoExt.feitos += pedaco.length; aoMudar();
  }
  S.lendoExt = null; aoMudar();
}

// 0.118.0 · fase 2: conferir no FGTS Digital, uma empresa por vez (troca o perfil para a matriz, lê os débitos e soma o principal).
// A permissão do site é pedida aqui, no clique (o Chrome mostra o pedido). Parar vale para a próxima empresa.
const HOST_FGTS = 'https://fgtsdigital.sistema.gov.br/*';
const esperadoDe = (x) => x && x.ok && typeof x.fgts === 'number' ? Math.round((x.fgts + (x.aprendiz || 0)) * 100) / 100 : null;
const prontasParaConferir = () => S.dados ? S.dados.tarefas.filter(t => S.sel.has(t.id) && esperadoDe(S.extratos[chave(t)]) != null) : [];
async function conferirFgts() {
  const alvo = prontasParaConferir().filter(t => !(S.fgts[chave(t)] && S.fgts[chave(t)].ok));
  if (!alvo.length || S.conf) return;
  try { if (chrome.permissions && chrome.permissions.request && !(await chrome.permissions.request({ origins: [HOST_FGTS] }))) { S.erroConf = 'Sem a permissão do FGTS Digital a extensão não consegue conferir.'; aoMudar(); return; } }
  catch (e) { S.erroConf = 'Não consegui pedir a permissão do FGTS Digital: ' + (e && e.message || e); aoMudar(); return; }
  const [ano, mes] = S.comp.split('-').map(Number);
  S.conf = { feitos: 0, total: alvo.length, atual: '' }; S.erroConf = ''; S.parar = false; aoMudar();
  for (const t of alvo) {
    if (S.parar) break;
    S.conf.atual = nomeLeg(t.empresa.nome); aoMudar();
    const r = await enviarFn({ cmd: 'guiasFolha', parte: 'fgts', ano, mes, empresa: t.empresa, esperado: esperadoDe(S.extratos[chave(t)]) });
    S.fgts[chave(t)] = r || { ok: false, erro: 'sem resposta' };
    if (r && (r.semAba || r.semSessao || r.semPermissao)) { S.erroConf = r.erro; break; }      // vale para todas: para e mostra o que fazer
    S.conf.feitos++; aoMudar();
  }
  S.conf = null; aoMudar();
}
function celulaFgts(t) {
  const x = S.fgts[chave(t)];
  if (!x) return S.conf && S.conf.atual === nomeLeg(t.empresa.nome) ? '<span class="gte-tag gte-neutro">' + ic('clock') + 'conferindo…</span>' : '<span class="fraco">—</span>';
  if (!x.ok) return '<span class="ggu-motivo">' + ic('alert') + esc(x.erro || 'Não consegui conferir') + '</span>';
  if (!x.debitos) return '<span class="gte-tag gte-neutro">Sem débito na competência</span>';
  const ja = x.guias && x.guias.length && !x.semGuia ? '<small class="fraco">já tem guia ' + esc(x.guias.join(', ')) + '</small>' : '';
  const enc = x.encargos ? '<small class="fraco">+ encargos ' + esc(reais(x.encargos)) + '</small>' : '';
  if (x.bate === true) return '<span class="gte-tag gte-ok">' + ic('check') + 'Bate</span> <b class="ggu-valor">' + esc(reais(x.principal)) + '</b>' + enc + ja;
  if (x.bate === false) return '<span class="gte-tag gte-erro">Não bate</span> <b class="ggu-valor">' + esc(reais(x.principal)) + '</b><small>diferença ' + esc(reais(x.diferenca)) + ' (limite R$ 0,05)</small>' + ja;
  return '<b class="ggu-valor">' + esc(reais(x.principal)) + '</b>' + enc + ja;
}

// 0.119.0 · fase 3: emitir a guia mensal pela Guia Rápida do FGTS Digital (Josué, 16/11/2026), só das escolhidas que bateram e ainda
// sem guia, depois de uma confirmação para o lote; uma empresa por vez. Pergunta do FGTS Digital volta para a linha da empresa e só segue
// com o "sim". Os PDFs ficam só na memória desta tela (Ver abre o arquivo; anexar e baixar a pasta são as próximas fases).
const podeEmitir = (t) => { const f = S.fgts[chave(t)], g = S.guias[chave(t)]; return S.sel.has(t.id) && f && f.ok && f.bate === true && !(f.guias && f.guias.length) && !(g && /emitida|jaExistia|emitindo/.test(g.estado)); };
const deB64 = (b64) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return URL.createObjectURL(new Blob([u], { type: 'application/pdf' })); };
async function emitirUma(t, confirmado) {
  const k = chave(t), [ano, mes] = S.comp.split('-').map(Number);
  S.guias[k] = { estado: 'emitindo' }; aoMudar();
  const r = await enviarFn({ cmd: 'guiasFolha', parte: 'emitir', ano, mes, empresa: t.empresa, esperado: esperadoDe(S.extratos[k]), confirmado: !!confirmado });
  if (r && r.ok && r.perguntas) { S.guias[k] = { estado: 'pergunta', perguntas: r.perguntas, alertas: r.alertas || [] }; return r; }
  if (r && r.ok && (r.emitida || r.jaExistia)) {
    S.guias[k] = { estado: r.emitida ? 'emitida' : 'jaExistia', numero: r.numero, pagamentoAte: r.pagamentoAte, mensal: r.mensal,
      arquivos: (r.arquivos || []).map(a => Object.assign({ tipo: a.tipo, nome: a.nome, confere: a.confere, motivo: a.motivo || '', erro: a.erro || '' }, a.b64 ? { url: deB64(a.b64), b64: a.b64 } : {})) };
    return r;
  }
  S.guias[k] = { estado: r && r.emProcessamento ? 'processando' : 'erro', erro: (r && r.erro) || 'sem resposta' };
  return r;
}
async function emitirLote() {
  const alvo = S.dados.tarefas.filter(podeEmitir); if (!alvo.length || S.emis) return;
  S.confirmarEmissao = false; S.emis = { feitos: 0, total: alvo.length, atual: '' }; S.erroEmis = ''; S.parar = false; aoMudar();
  for (const t of alvo) {
    if (S.parar) break;
    S.emis.atual = nomeLeg(t.empresa.nome); aoMudar();
    const r = await emitirUma(t, false);
    if (r && (r.semAba || r.semSessao || r.semPermissao)) { S.erroEmis = r.erro; break; }
    S.emis.feitos++; aoMudar();
  }
  S.emis = null; aoMudar();
}
const ROT_ARQ = { guia: 'Ver guia', detalhe: 'Ver demonstrativo', consignado: 'Ver consignado' };
function celulaGuia(t) {
  const g = S.guias[chave(t)];
  if (!g) return '<span class="fraco">—</span>';
  if (g.estado === 'emitindo') return '<span class="gte-tag gte-neutro">' + ic('clock') + 'emitindo…</span>';
  if (g.estado === 'pergunta') return '<div class="ggu-pergunta"><b>O FGTS Digital pergunta:</b>' + g.perguntas.map(q => '<p>' + esc(q) + '</p>').join('') + (g.alertas.length ? '<small>' + esc(g.alertas.join(' · ')) + '</small>' : '') +
    '<span class="ggu-acoes"><button type="button" class="btn btn-sm btn-primary" data-ggu-sim="' + esc(t.id) + '">Sim, emitir</button><button type="button" class="btn btn-sm" data-ggu-nao="' + esc(t.id) + '">Não emitir</button></span></div>';
  if (g.estado === 'naoEmitir') return '<span class="gte-tag gte-neutro">Não emitida (você respondeu não)</span>';
  if (g.estado === 'erro' || g.estado === 'processando') return '<span class="ggu-motivo">' + ic('alert') + esc(g.erro) + '</span>';
  const arq = (g.arquivos || []).map((a, i) => a.url ? '<button type="button" class="gte-link" data-ggu-ver="' + esc(chave(t)) + '|' + i + '">' + esc(ROT_ARQ[a.tipo] || a.nome) + '</button>' + (a.confere === false ? '<small class="ggu-motivo">' + ic('alert') + esc(a.motivo) + '</small>' : '') : '<small class="ggu-motivo">' + ic('alert') + esc(a.erro || 'não veio') + '</small>').join('');
  return '<span class="gte-tag gte-ok">' + ic('check') + (g.estado === 'emitida' ? 'Emitida' : 'Já existia') + '</span> <small>nº ' + esc(g.numero) + (g.pagamentoAte ? ' · vence ' + esc(String(g.pagamentoAte).slice(0, 10).split('-').reverse().join('/')) : '') + '</small><span class="ggu-arqs">' + arq + '</span>' + celulaAnexo(t);
}

// 0.120.0 · fase 4: anexar os PDFs emitidos na tarefa FGTS DIGITAL do Gestta (o envio de arquivo já aprovado, POST /es/upload/direct),
// cada um no seu item: guia → "FGTS Guia", detalhe → "Demonstrativo FGTS", consignado → "Demonstrativo e-consignado". Só o que passou na
// conferência do conteúdo, só em item vazio, uma confirmação para o lote e um arquivo por vez. Concluir a tarefa depois é opcional
// (desligado de fábrica) e usa o concluir já aprovado (etapas e itens sem anexo antes).
const ITEM_DO_TIPO = { guia: 'guia', detalhe: 'demonstrativo', consignado: 'consignado' };
function planoAnexo(t) {
  const g = S.guias[chave(t)], it = S.itens[t.id] || {}, vao = [], fora = [];
  if (!g || !/emitida|jaExistia/.test(g.estado)) return null;
  for (const a of g.arquivos || []) {
    const item = it[ITEM_DO_TIPO[a.tipo]];
    if (!a.b64) fora.push(a.nome + ': não veio');
    else if (a.confere === false) fora.push(a.nome + ': não passou na conferência (' + a.motivo + ')');
    else if (!item || !item.id) fora.push(a.nome + ': a tarefa não tem o item');
    else if (item.temArquivo) fora.push(a.nome + ': o item “' + item.nome + '” já tem arquivo');
    else vao.push({ a, item });
  }
  return { vao, fora };
}
const podeAnexar = (t) => { const p = planoAnexo(t), x = S.anexos[chave(t)]; return !!p && p.vao.length > 0 && !(x && /anexando|anexado/.test(x.estado)); };
async function anexarLote() {
  const alvo = S.dados.tarefas.filter(podeAnexar); if (!alvo.length || S.anexando) return;
  S.confirmarAnexo = false; S.anexando = { feitos: 0, total: alvo.length, atual: '' }; S.erroAnexo = ''; S.parar = false; aoMudar();
  for (const t of alvo) {
    if (S.parar) break;
    const k = chave(t), pl = planoAnexo(t); S.anexando.atual = nomeLeg(t.empresa.nome); S.anexos[k] = { estado: 'anexando', enviados: [], falhas: pl.fora.slice() }; aoMudar();
    let parou = false;
    for (const { a, item } of pl.vao) {
      const r = await enviarFn({ cmd: 'gesttaAcao', acao: 'documento', id: t.id, documento: item.id, arquivo: { nome: a.nome, tipo: 'application/pdf', base64: a.b64 } });
      if (r && r.ok) { S.anexos[k].enviados.push(a.nome); item.temArquivo = true; }
      else { S.anexos[k].falhas.push(a.nome + ': ' + ((r && r.erro) || 'o Gestta não respondeu')); if (r && (r.status === 401 || /sess[aã]o/i.test(r.erro || ''))) { S.erroAnexo = r.erro; parou = true; break; } }
    }
    if (S.concluirDepois && !parou && S.anexos[k].enviados.length && !S.anexos[k].falhas.some(f => !/não veio|já tem arquivo|não tem o item/.test(f))) {
      const c = await concluirComEtapas(enviarFn, t.id);
      S.anexos[k].concluida = !!(c && c.ok); if (!(c && c.ok)) S.anexos[k].falhas.push('Concluir: ' + ((c && c.erro) || 'o Gestta não respondeu'));
    }
    S.anexos[k].estado = S.anexos[k].enviados.length ? 'anexado' : 'erro';
    S.anexando.feitos++; aoMudar();
    if (parou) break;
  }
  S.anexando = null; aoMudar();
  try { window.dispatchEvent(new CustomEvent('gt-tarefa-mudou', { detail: {} })); } catch (e) {}
}
function celulaAnexo(t) {
  const x = S.anexos[chave(t)];
  if (!x) return '';
  if (x.estado === 'anexando') return '<small class="fraco">' + ic('clock') + ' anexando no Gestta…</small>';
  return (x.enviados.length ? '<small class="ggu-ok">' + ic('check') + ' No Gestta: ' + esc(x.enviados.join(', ')) + (x.concluida ? ' · tarefa concluída' : '') + '</small>' : '') +
    (x.falhas.length ? '<small class="ggu-motivo">' + ic('alert') + esc(x.falhas.join(' · ')) + '</small>' : '');
}
// 0.120.0 · fase 5: baixar a pasta para o servidor (Josué, 16/11/2026: subpastas por competência e empresa; o nome do servidor,
// "DARF FGTS MM-AAAA.pdf"), com o relatório da competência (o que bateu, o que não bateu com os dois valores e a diferença, e o que foi
// emitido). A permissão de downloads é pedida na hora. Nada fica guardado na extensão.
const NOME_SERVIDOR = { guia: 'DARF FGTS', detalhe: 'DEMONSTRATIVO FGTS', consignado: 'DEMONSTRATIVO E-CONSIGNADO' };
const pastaSegura = (t) => String(t || 'Empresa').normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Empresa';
function relatorioCsv() {
  const [ano, mes] = S.comp.split('-'), lin = [['Empresa', 'Código', 'CNPJ', 'FGTS do extrato', 'FGTS no FGTS Digital', 'Diferença', 'Situação', 'Guia']];
  const brl = n => typeof n === 'number' ? n.toFixed(2).replace('.', ',') : '';
  for (const t of S.dados.tarefas.filter(x => S.sel.has(x.id) || S.guias[chave(x)] || S.fgts[chave(x)])) {
    const k = chave(t), e = S.extratos[k], f = S.fgts[k], g = S.guias[k];
    const sit = g && /emitida|jaExistia/.test(g.estado) ? (g.estado === 'emitida' ? 'Emitida' : 'Já existia') : f && f.ok ? (f.bate === true ? 'Bateu' : f.bate === false ? 'Não bateu' : 'Sem débito') : f ? 'Erro: ' + f.erro : e && !e.ok ? 'Sem extrato: ' + e.motivo : 'Não conferida';
    lin.push([nomeLeg(t.empresa.nome), t.empresa.code, t.empresa.cnpj, brl(esperadoDe(e)), brl(f && f.principal), brl(f && f.diferenca), sit, g && g.numero || '']);
  }
  return '\ufeff' + lin.map(l => l.map(c => /[;"\n]/.test(String(c)) ? '"' + String(c).replace(/"/g, '""') + '"' : String(c)).join(';')).join('\r\n') + '\r\n';
}
async function baixarPasta() {
  try { if (!(chrome.permissions && chrome.permissions.request && await chrome.permissions.request({ permissions: ['downloads'] }))) { S.pasta = { erro: 'Sem a permissão de downloads a extensão não consegue salvar a pasta.' }; aoMudar(); return; } }
  catch (e) { S.pasta = { erro: 'Não consegui pedir a permissão de downloads: ' + (e && e.message || e) }; aoMudar(); return; }
  const [ano, mes] = S.comp.split('-'), mm = mes + '-' + ano, base = 'Guias da folha/' + mm + '/';
  let n = 0; const falhas = [];
  const salvar = (url, filename) => new Promise(ok => chrome.downloads.download({ url, filename, conflictAction: 'uniquify', saveAs: false }, id => ok(id != null && !chrome.runtime.lastError)));
  for (const t of S.dados.tarefas) {
    const g = S.guias[chave(t)]; if (!g || !g.arquivos) continue;
    for (const a of g.arquivos) if (a.url && a.confere !== false) { if (await salvar(a.url, base + pastaSegura(nomeLeg(t.empresa.nome)) + '/' + NOME_SERVIDOR[a.tipo] + ' ' + mm + '.pdf')) n++; else falhas.push(a.nome); }
  }
  const rel = URL.createObjectURL(new Blob([relatorioCsv()], { type: 'text/csv;charset=utf-8' }));
  if (await salvar(rel, base + 'Relatório das guias ' + mm + '.csv')) n++; else falhas.push('relatório');
  setTimeout(() => URL.revokeObjectURL(rel), 60e3);
  S.pasta = { n, falhas, caminho: 'Downloads/' + base }; aoMudar();
}

/* ---------- desenho ---------- */
const PASSOS = [['Escolher', 'empresas e o modo do FGTS'], ['Conferir', 'extrato × FGTS Digital'], ['Emitir', 'guia e demonstrativos'], ['Anexar', 'nas tarefas do Gestta'], ['Baixar', 'a pasta para o servidor']];
function trilho(atual) {
  return '<ol class="ggu-passos" aria-label="Passos das guias da folha">' + PASSOS.map((p, i) => '<li class="' + (i < atual ? 'feito' : i === atual ? 'atual' : 'depois') + '"' + (i === atual ? ' aria-current="step"' : '') + '><span class="ggu-n">' + (i < atual ? '✓' : i + 1) + '</span><span><b>' + p[0] + '</b><small>' + p[1] + '</small></span></li>').join('') + '</ol>';
}
function situacaoGuia(t) {
  if (t.status === 'DONE') return '<span class="gte-tag gte-ok">' + ic('check') + 'Concluída</span>';
  if (!(t.id in S.itens)) return '<span class="gte-tag gte-neutro">' + (S.lendoItens ? 'lendo…' : 'não lida') + '</span>';
  const it = S.itens[t.id];
  if (!it) return '<span class="gte-tag gte-deve">Não consegui ler</span>';
  if (!it.guia) return '<span class="gte-tag gte-deve" title="A tarefa não tem o item “FGTS Guia”">Sem o item da guia</span>';
  if (it.guia.temArquivo) return '<span class="gte-tag gte-ok">' + ic('check') + 'Guia anexada</span>';
  return '<span class="gte-tag gte-erro">Sem guia</span>';
}
const semGuia = (t) => t.status !== 'DONE' && S.itens[t.id] && S.itens[t.id].guia && !S.itens[t.id].guia.temArquivo;
function celulaExtrato(t) {
  const x = S.extratos[chave(t)];
  if (!x) return S.lendoExt && S.sel.has(t.id) ? '<span class="fraco">lendo…</span>' : '<span class="fraco">—</span>';
  if (!x.ok) return '<span class="ggu-motivo">' + ic('alert') + esc(x.motivo || 'Não consegui ler') + '</span>';
  if (x.semValor) return '<span class="ggu-motivo">' + ic('alert') + 'O extrato não traz a linha “Valor do FGTS”</span>';
  const det = (x.extratos || []).map(e => (e.calculo || 'Extrato') + ': ' + reais(e.fgts) + (e.aprendiz ? ' + aprendiz ' + reais(e.aprendiz) : '')).join(' · ');
  return '<b class="ggu-valor" title="' + esc(det) + '">' + esc(reais(x.fgts)) + '</b>' + (x.aprendiz ? '<small class="fraco"> + aprendiz ' + esc(reais(x.aprendiz)) + '</small>' : '') +
    ((x.extratos || []).length > 1 ? '<small class="fraco"> · ' + x.extratos.length + ' extratos somados</small>' : '');
}
function modoFgts(t) {
  const m = S.modo[t.id] || 'matriz', id = esc(t.id);
  return '<span class="ggu-seg" role="group" aria-label="FGTS de ' + esc(nomeLeg(t.empresa.nome)) + '">' +
    '<button type="button" data-ggu-modo="' + id + '|matriz" aria-pressed="' + (m === 'matriz') + '">Matriz única</button>' +
    '<button type="button" data-ggu-modo="' + id + '|filial" aria-pressed="' + (m === 'filial') + '" disabled title="A guia por filial ainda não foi mapeada no FGTS Digital">Por filial</button></span>';
}
function linha(t) {
  const marcavel = t.status !== 'DONE';
  return '<tr' + (S.sel.has(t.id) ? ' class="on"' : '') + '><td>' + (marcavel ? '<input type="checkbox" data-ggu-sel="' + esc(t.id) + '"' + (S.sel.has(t.id) ? ' checked' : '') + ' aria-label="Escolher ' + esc(nomeLeg(t.empresa.nome)) + '">' : '') + '</td>' +
    '<td><b>' + esc(nomeLeg(t.empresa.nome) || '—') + '</b><small>' + esc([t.empresa.code && 'cód. ' + t.empresa.code, t.empresa.cnpj && '…' + t.empresa.cnpj.slice(-6)].filter(Boolean).join(' · ')) + '</small></td>' +
    '<td><button type="button" class="gte-link" data-ggu-tarefa="' + esc(t.id) + '">' + esc(nomeLeg(t.nome)) + '</button><small>' + esc(t.responsavel ? nomeLeg(t.responsavel) : 'sem responsável') + '</small></td>' +
    '<td>' + situacaoGuia(t) + '</td><td class="num">' + celulaExtrato(t) + '</td><td class="num">' + celulaFgts(t) + '</td><td>' + celulaGuia(t) + '</td><td>' + (marcavel ? modoFgts(t) : '') + '</td></tr>';
}
export function desenharGuias(v, sub) {
  const [ano, mes] = (S.comp || '').split('-').map(Number), rotComp = mes ? MESES[mes - 1] + ' de ' + ano : '';
  sub('Guias da folha · competência ' + rotComp);
  if (S.carregando && !S.dados) { v.innerHTML = '<div class="vazio" role="status"><b>Lendo as tarefas FGTS DIGITAL…</b>Do relatório do Gestta do mês da meta.</div>'; return; }
  if (S.erro) { v.innerHTML = '<div class="faixa warn"><svg class="ic"><use href="#i-alert"/></svg><div><b>Não consegui ler as tarefas.</b> ' + esc(S.erro.erro || '') + ' <button type="button" class="btn btn-sm" data-ggu-reler>Tentar de novo</button></div></div>'; return; }
  if (!S.dados) { v.innerHTML = ''; return; }
  const todas = S.dados.tarefas, abertas = todas.filter(t => t.status !== 'DONE'), feitas = todas.filter(t => t.status === 'DONE');
  const nSem = abertas.filter(semGuia).length, nSel = S.sel.size, lidos = Object.values(S.extratos).filter(x => x && x.ok && !x.semValor).length;
  const kpi = (n, rot, cls) => '<div class="gte-kpi ' + cls + '"><b>' + (n == null ? '—' : num(n)) + '</b><span>' + esc(rot) + '</span></div>';
  let h = '<section class="gte-topo cfg-card ggu-topo"><div class="gte-tit"><h2>Guias da folha</h2><p' + (simples() ? ' class="ajuda"' : '') + '>Escolha as empresas com a folha publicada e a guia do FGTS ainda sem anexar. A extensão lê o “Valor do FGTS” do Extrato Mensal no portal de documentos do Onvio para conferir com o FGTS Digital. Os valores ficam só nesta tela.</p></div>' +
    '<div class="gte-kpis">' + kpi(todas.length, 'tarefas FGTS DIGITAL', 'gte-k-neutro') + kpi(S.lendoItens ? null : nSem, 'sem a guia anexada', 'gte-k-erro') + kpi(nSel, 'escolhidas', 'gte-k-neutro') + kpi(lidos, 'extratos lidos', 'gte-k-neutro') + '</div></section>' +
    trilho(S.pasta && !S.pasta.erro ? 5 : S.anexando || Object.keys(S.anexos).length ? 3 : S.emis || Object.keys(S.guias).length ? 2 : S.conf || Object.keys(S.fgts).length ? 1 : 0);
  if (S.dados.daMemoria) h += '<p class="fraco ggu-memo">Relatório do Gestta lido há pouco (vale por 1 hora).</p>';
  if (S.lendoItens) h += '<p class="fraco ggu-memo" role="status">' + ic('clock') + ' Conferindo os itens das tarefas: ' + S.lendoItens.feitos + ' de ' + S.lendoItens.total + '.</p>';
  if (S.erroItens) h += '<div class="faixa warn"><svg class="ic"><use href="#i-alert"/></svg><div>' + esc(S.erroItens) + '</div></div>';
  if (S.erroExt) h += '<div class="faixa warn"><svg class="ic"><use href="#i-alert"/></svg><div>' + esc(S.erroExt) + '</div></div>';
  if (S.conf) h += '<div class="cfg-card ggu-and" role="status"><div><b>Conferindo no FGTS Digital: ' + S.conf.feitos + ' de ' + S.conf.total + '</b><div class="fraco">' + esc(S.conf.atual) + ' · troca o perfil para a matriz (até 30 s) e lê os débitos da competência. Se o site pedir o certificado ou um captcha, resolva na aba do FGTS Digital.</div>' +
    '<div class="gsa-prog"><span style="width:' + Math.round(100 * S.conf.feitos / Math.max(1, S.conf.total)) + '%"></span></div></div><button type="button" class="btn btn-sm" data-ggu-parar' + (S.parar ? ' disabled' : '') + '>' + (S.parar ? 'Parando…' : 'Parar') + '</button></div>';
  if (S.erroConf) h += '<div class="faixa warn"><svg class="ic"><use href="#i-alert"/></svg><div>' + esc(S.erroConf) + '</div></div>';
  if (S.emis) h += '<div class="cfg-card ggu-and" role="status"><div><b>Emitindo no FGTS Digital: ' + S.emis.feitos + ' de ' + S.emis.total + '</b><div class="fraco">' + esc(S.emis.atual) + ' · a geração da guia pode levar até 1 minuto; depois vêm a guia e o demonstrativo.</div>' +
    '<div class="gsa-prog"><span style="width:' + Math.round(100 * S.emis.feitos / Math.max(1, S.emis.total)) + '%"></span></div></div><button type="button" class="btn btn-sm" data-ggu-parar' + (S.parar ? ' disabled' : '') + '>' + (S.parar ? 'Parando…' : 'Parar') + '</button></div>';
  if (S.erroEmis) h += '<div class="faixa warn"><svg class="ic"><use href="#i-alert"/></svg><div>' + esc(S.erroEmis) + '</div></div>';
  if (S.anexando) h += '<div class="cfg-card ggu-and" role="status"><div><b>Anexando no Gestta: ' + S.anexando.feitos + ' de ' + S.anexando.total + '</b><div class="fraco">' + esc(S.anexando.atual) + ' · um arquivo por vez.</div>' +
    '<div class="gsa-prog"><span style="width:' + Math.round(100 * S.anexando.feitos / Math.max(1, S.anexando.total)) + '%"></span></div></div><button type="button" class="btn btn-sm" data-ggu-parar' + (S.parar ? ' disabled' : '') + '>' + (S.parar ? 'Parando…' : 'Parar') + '</button></div>';
  if (S.erroAnexo) h += '<div class="faixa warn"><svg class="ic"><use href="#i-alert"/></svg><div>' + esc(S.erroAnexo) + '</div></div>';
  if (S.confirmarAnexo) { const l = S.dados.tarefas.filter(podeAnexar);
    h += '<div class="cfg-card ggu-confirma" role="dialog" aria-labelledby="ggu-anx-tit"><b id="ggu-anx-tit">Anexar no Gestta os arquivos de ' + plural(l.length, 'empresa', 'empresas') + '?</b><ul>' +
      l.map(t => { const p = planoAnexo(t); return '<li>' + esc(nomeLeg(t.empresa.nome)) + ': ' + esc(p.vao.map(x => x.a.nome + ' → ' + x.item.nome).join(' · ')) + (p.fora.length ? ' <small class="fraco">(fica de fora: ' + esc(p.fora.join(' · ')) + ')</small>' : '') + '</li>'; }).join('') + '</ul>' +
      '<label class="ggu-chk"><input type="checkbox" data-ggu-concluir' + (S.concluirDepois ? ' checked' : '') + '> Concluir a tarefa depois de anexar (marca as etapas e desconsidera os itens sem arquivo; o Gestta avisa o cliente por e-mail)</label>' +
      '<p class="fraco">Um arquivo por vez, cada um no seu item. Os itens com integração vão ao Portal do Cliente.</p>' +
      '<span class="ggu-acoes"><button type="button" class="btn btn-primary" data-ggu-anexar-ok>Anexar</button><button type="button" class="btn" data-ggu-anexar-cancelar>Cancelar</button></span></div>'; }
  if (S.pasta) h += S.pasta.erro ? '<div class="faixa warn"><svg class="ic"><use href="#i-alert"/></svg><div>' + esc(S.pasta.erro) + '</div></div>'
    : '<div class="faixa"><svg class="ic"><use href="#i-check"/></svg><div><b>' + plural(S.pasta.n, 'arquivo salvo', 'arquivos salvos') + '</b> em ' + esc(S.pasta.caminho) + ' (uma subpasta por empresa e o relatório da competência).' + (S.pasta.falhas.length ? ' Não salvos: ' + esc(S.pasta.falhas.join(', ')) + '.' : '') + '</div></div>';
  if (S.confirmarEmissao) { const l = S.dados.tarefas.filter(podeEmitir);
    h += '<div class="cfg-card ggu-confirma" role="dialog" aria-labelledby="ggu-conf-tit"><b id="ggu-conf-tit">Emitir ' + plural(l.length, 'guia', 'guias') + ' do FGTS no FGTS Digital?</b><ul>' +
      l.map(t => '<li>' + esc(nomeLeg(t.empresa.nome)) + ' · competência ' + esc(S.comp.slice(5) + '/' + S.comp.slice(0, 4)) + ' · ' + esc(reais(S.fgts[chave(t)].principal)) + '</li>').join('') + '</ul>' +
      '<p class="fraco">Guia mensal pela Guia Rápida, uma empresa por vez. A guia emitida fica aguardando pagamento no FGTS Digital; a extensão não paga nada. Se o site fizer uma pergunta, ela aparece na linha da empresa.</p>' +
      '<span class="ggu-acoes"><button type="button" class="btn btn-primary" data-ggu-emitir-ok>Emitir ' + plural(l.length, 'guia', 'guias') + '</button><button type="button" class="btn" data-ggu-emitir-cancelar>Cancelar</button></span></div>'; }
  if (!todas.length) { v.innerHTML = h + '<div class="vazio"><b>Nenhuma tarefa FGTS DIGITAL nesta competência</b>' + (S.dados.perfil && !S.dados.perfil.total ? 'Você vê só as tarefas em que é responsável.' : 'Troque a competência no topo.') + '</div>'; return; }
  const cab = '<thead><tr><th><input type="checkbox" data-ggu-todas aria-label="Escolher todas as sem guia"' + (abertas.length && abertas.filter(semGuia).every(t => S.sel.has(t.id)) && nSem ? ' checked' : '') + '></th><th>Empresa</th><th>Tarefa</th><th>Guia no Gestta</th><th class="num">FGTS do extrato</th><th class="num">No FGTS Digital</th><th>Guia</th><th>FGTS emitido como</th></tr></thead>';
  h += '<div class="cfg-card ggu-lista"><div class="gte-tab-wrap"><table class="gte-tab ggu-tab">' + cab + '<tbody>' + abertas.map(linha).join('') + '</tbody></table></div>' +
    '<p class="fraco">A DCTFWeb fica para depois. O FGTS sai da matriz, que traz todos os estabelecimentos; a guia por filial entra quando for mapeada.</p></div>';
  if (feitas.length) h += '<div class="cfg-card"><button type="button" class="gte-link" data-ggu-feitas aria-expanded="' + S.verFeitas + '">' + ic(S.verFeitas ? 'chev-d' : 'chev-r') + plural(feitas.length, 'tarefa concluída', 'tarefas concluídas') + ' (já com a guia)</button>' +
    (S.verFeitas ? '<div class="gte-tab-wrap"><table class="gte-tab ggu-tab">' + cab.replace(/<input[^>]*data-ggu-todas[^>]*>/, '') + '<tbody>' + feitas.map(linha).join('') + '</tbody></table></div>' : '') + '</div>';
  const faltaLer = S.dados.tarefas.filter(t => S.sel.has(t.id) && !(S.extratos[chave(t)] && S.extratos[chave(t)].ok)).length;
  h += '<div class="cfg-card ggu-rodape"><div><b>' + (nSel ? plural(nSel, 'empresa escolhida', 'empresas escolhidas') : 'Escolha as empresas na lista') + '</b><div class="fraco">' +
    (S.lendoExt ? 'Lendo os extratos: ' + S.lendoExt.feitos + ' de ' + S.lendoExt.total + ' (um por vez; precisa de uma aba do Portal do Cliente do Onvio aberta).' : 'O extrato é lido no portal de documentos do Onvio (uma aba do Portal do Cliente aberta).') + '</div></div>' +
    '<div class="ggu-acoes"><button type="button" class="btn btn-primary" data-ggu-ler-ext' + (!faltaLer || S.lendoExt ? ' disabled' : '') + '>' + ic('search') + 'Ler o extrato' + (faltaLer ? ' (' + faltaLer + ')' : '') + '</button>' +
    (() => { const n = prontasParaConferir().filter(t => !(S.fgts[chave(t)] && S.fgts[chave(t)].ok)).length;
      const ne = S.dados.tarefas.filter(podeEmitir).length;
      return '<button type="button" class="btn btn-primary" data-ggu-conferir' + (!n || S.conf ? ' disabled' : '') + ' title="Só as escolhidas com o extrato lido. Precisa de uma aba do FGTS Digital aberta e logada.">' + ic('check') + 'Conferir no FGTS Digital' + (n ? ' (' + n + ')' : '') + '</button>' +
        '<button type="button" class="btn btn-primary" data-ggu-emitir' + (!ne || S.emis || S.conf ? ' disabled' : '') + ' title="Só as que bateram e ainda não têm guia. Pede uma confirmação antes.">' + ic('upload') + 'Emitir guias' + (ne ? ' (' + ne + ')' : '') + '</button>' +
        (() => { const na = S.dados.tarefas.filter(podeAnexar).length, temArq = Object.values(S.guias).some(g => g && g.arquivos && g.arquivos.some(a => a.url));
          return '<button type="button" class="btn btn-primary" data-ggu-anexar' + (!na || S.anexando || S.emis ? ' disabled' : '') + ' title="Os PDFs emitidos vão aos itens da tarefa FGTS DIGITAL. Pede uma confirmação antes.">' + ic('paperclip') + 'Anexar no Gestta' + (na ? ' (' + na + ')' : '') + '</button>' +
            '<button type="button" class="btn" data-ggu-pasta' + (!temArq || S.emis ? ' disabled' : '') + ' title="Salva uma subpasta por empresa em Downloads/Guias da folha/MM-AAAA, com o relatório da competência">' + ic('download') + 'Baixar a pasta</button>'; })(); })() + '</div></div>';
  v.innerHTML = h;
}
export function ligarGuias(v, redesenhar, paraPai) {
  aoMudar = redesenhar || aoMudar; paraPaiFn = paraPai || paraPaiFn;
  v.addEventListener('click', (e) => {
    if (!v.querySelector('.ggu-topo, [data-ggu-reler]')) return;
    const t = e.target.closest('[data-ggu-reler],[data-ggu-feitas],[data-ggu-ler-ext],[data-ggu-conferir],[data-ggu-parar],[data-ggu-modo],[data-ggu-tarefa],[data-ggu-emitir],[data-ggu-emitir-ok],[data-ggu-emitir-cancelar],[data-ggu-sim],[data-ggu-nao],[data-ggu-ver],[data-ggu-anexar],[data-ggu-anexar-ok],[data-ggu-anexar-cancelar],[data-ggu-pasta]'); if (!t) return;
    if (t.dataset.gguConferir != null) { conferirFgts(); return; }
    if (t.dataset.gguEmitir != null) { S.confirmarEmissao = true; aoMudar(); return; }
    if (t.dataset.gguAnexar != null) { S.confirmarAnexo = true; aoMudar(); return; }
    if (t.dataset.gguAnexarCancelar != null) { S.confirmarAnexo = false; aoMudar(); return; }
    if (t.dataset.gguAnexarOk != null) { anexarLote(); return; }
    if (t.dataset.gguPasta != null) { baixarPasta(); return; }
    if (t.dataset.gguEmitirCancelar != null) { S.confirmarEmissao = false; aoMudar(); return; }
    if (t.dataset.gguEmitirOk != null) { emitirLote(); return; }
    if (t.dataset.gguSim) { const x = S.dados.tarefas.find(y => y.id === t.dataset.gguSim); if (x && !S.emis) emitirUma(x, true).then(() => aoMudar()); return; }
    if (t.dataset.gguNao) { const x = S.dados.tarefas.find(y => y.id === t.dataset.gguNao); if (x) { S.guias[chave(x)] = { estado: 'naoEmitir' }; aoMudar(); } return; }
    if (t.dataset.gguVer) { const [k, i] = t.dataset.gguVer.split('|'), a = S.guias[k] && S.guias[k].arquivos[Number(i)]; if (a && a.url) window.open(a.url, '_blank'); return; }
    if (t.dataset.gguParar != null) { S.parar = true; aoMudar(); return; }
    if (t.dataset.gguReler != null) { S.erro = null; S.dados = null; if (enviarFn) { const [ano, mes] = S.comp.split('-').map(Number); lerGuias(enviarFn, aoMudar, { ano, mes }, true); } return; }
    if (t.dataset.gguFeitas != null) { S.verFeitas = !S.verFeitas; aoMudar(); return; }
    if (t.dataset.gguLerExt != null) { if (!S.lendoExt) lerExtratos(); return; }
    if (t.dataset.gguModo) { const [id, m] = t.dataset.gguModo.split('|'); if (m === 'matriz') S.modo[id] = m; aoMudar(); return; }
    if (t.dataset.gguTarefa) {   // o mesmo painel da tarefa das outras abas
      const l = S.dados.tarefas.map(x => ({ _id: x.id, name: x.nome, status: x.status, due_date: x.meta, responsavel: x.responsavel, customer: { _id: x.empresa.cnpj || x.empresa.code, name: x.empresa.nome, code: x.empresa.code, cnpj: x.empresa.cnpj } }));
      const i = l.findIndex(x => x._id === t.dataset.gguTarefa); if (i >= 0) abrirPainel(l, i, paraPaiFn); return;
    }
  });
  v.addEventListener('change', (e) => {
    const t = e.target; if (!v.querySelector('.ggu-topo')) return;
    if (t.dataset.gguConcluir != null) { S.concluirDepois = t.checked; return; }
    if (t.dataset.gguSel) { t.checked ? S.sel.add(t.dataset.gguSel) : S.sel.delete(t.dataset.gguSel); aoMudar(); return; }
    if (t.dataset.gguTodas != null) { S.dados.tarefas.filter(semGuia).forEach(x => t.checked ? S.sel.add(x.id) : S.sel.delete(x.id)); aoMudar(); }
  });
}

/* Janela "Nova solicitação" (lista Geral), autorizada pelo Josué em 16/10/2026. Sempre em dois passos: preencher e
 * "Revisar e criar", depois confirmar. Quem cria é o service worker (cmd 'criar'), de dentro da aba do Onvio; o id
 * do cliente sai de uma solicitação dele (origem). Opcional: passar a vez ao cliente (trâmite Respondido).
 * Nada do que se escreve aqui é guardado. */
import { estado, itens, enviar } from '../estado.js';
import { $, $$, esc, toast } from '../util.js';
import { abrirDetalhe } from './detalhe.js';
const OC = window.OC;

let fundo = null;
let f = null;   // { clientes, cliente, travado, assunto, descricao, passarVez, dep, modelo, confirmar, enviando, erro, aoCriar }

export const novaAberta = () => !$('#dlg-nova').hidden;
export function fecharNova() {
  const d = $('#dlg-nova');
  if (d.hidden) return;
  d.hidden = true; d.innerHTML = '';
  if (fundo) { fundo.remove(); fundo = null; }
  f = null;
}

// Clientes conhecidos (das pendências lidas), cada um com uma solicitação dele para o Onvio dizer o id do cliente
function clientesConhecidos() {
  const m = new Map();
  for (const i of itens()) {
    const nome = i.cliente || i.apelido;
    if (!nome || m.has(nome)) continue;
    m.set(nome, { nome, apelido: i.apelido || '', origem: { type: i.type, num: String(i.num) } });
  }
  return [...m.values()].sort((a, b) => (a.apelido || a.nome).localeCompare(b.apelido || b.nome, 'pt-BR'));
}

// o: { origem: item da solicitação (cliente travado), assunto, descricao, passarVez, dep, aoCriar(r) }
export function abrirNova(o) {
  o = o || {};
  const clientes = clientesConhecidos();
  let cliente = '';
  if (o.origem) {
    const nome = o.origem.cliente || o.origem.apelido || '';
    cliente = nome;
    if (!clientes.some(c => c.nome === nome)) clientes.unshift({ nome, apelido: o.origem.apelido || '', origem: { type: o.origem.type, num: String(o.origem.num) } });
    else clientes.find(c => c.nome === nome).origem = { type: o.origem.type, num: String(o.origem.num) };
  }
  f = { clientes, cliente, travado: !!o.origem, assunto: o.assunto || '', descricao: o.descricao || '', passarVez: !!o.passarVez, dep: OC.DEPARTAMENTOS.includes(o.dep) ? o.dep : '', modelo: '', confirmar: false, enviando: false, erro: '', aoCriar: typeof o.aoCriar === 'function' ? o.aoCriar : null };
  const d = $('#dlg-nova');
  if (!fundo) { fundo = document.createElement('div'); fundo.className = 'fundo'; fundo.style.zIndex = 52; fundo.onclick = () => { if (!f || !f.enviando) fecharNova(); }; document.body.appendChild(fundo); }
  d.style.zIndex = 53;
  d.hidden = false;
  desenhar();
  const foco = f.travado ? (f.assunto ? '#nv-desc' : '#nv-assunto') : '#nv-cliente';
  if ($(foco)) $(foco).focus();
}

const modelosDe = dep => ((estado.settings && estado.settings.modelosCriacao) || OC.DEFAULTS.modelosCriacao).filter(m => m.dep === dep);
// O departamento escolhido tem id nas regras (criacao.departamentos)? Sem ele a criação usa o departamento do acesso.
const semIdDoDepartamento = dep => !!dep && !(((estado.settings && estado.settings.criacao && estado.settings.criacao.departamentos) || {})[dep]);
function rotCliente(c) { return c ? (c.apelido && c.apelido !== c.nome ? c.apelido + ' · ' + c.nome : c.nome) : ''; }

function desenhar() {
  const d = $('#dlg-nova');
  const c = f.clientes.find(x => x.nome === f.cliente);
  const cab = '<div class="dlg-head"><div class="tt"><h2 class="pq">Nova solicitação</h2><div class="dlg-l3">Lista Geral · o cliente vê no Portal do Cliente</div></div><button class="icon-btn" id="nv-fechar" aria-label="Fechar"><svg class="ic"><use href="#i-x"/></svg></button></div>';
  const erro = f.erro ? '<div class="faixa"><svg class="ic"><use href="#i-alert"/></svg>' + esc(f.erro) + '</div>' : '';
  if (f.confirmar) {
    const desc = f.descricao.length > 300 ? f.descricao.slice(0, 300) + '…' : f.descricao;
    d.innerHTML = cab + '<div class="dlg-body">' + erro + '<div class="acao-conf" id="nv-conf"><b>Confirme a solicitação que vai ser criada no Onvio:</b><ul>' +
      '<li>Cliente: ' + esc(rotCliente(c)) + '</li>' + (f.dep ? '<li>Departamento: ' + esc(OC.ROT_DEPARTAMENTO[f.dep]) + (semIdDoDepartamento(f.dep) ? ' <span class="today">(sem id nas regras: vale o departamento do seu acesso)</span>' : '') + '</li>' : '') + '<li>Assunto: "' + esc(f.assunto.trim()) + '"</li><li>Descrição: "' + esc(desc.trim()) + '"</li>' +
      (f.passarVez ? '<li>Logo depois, trâmite "Respondido": a vez passa ao cliente e você fica como responsável</li>' : '<li>Fica "Sem análise", na fila do escritório</li>') + '</ul>' +
      '<p class="fraco">Fica registrada no Onvio em seu nome e o cliente vê no portal. A extensão não exclui solicitações.</p></div></div>' +
      '<div class="dlg-actions"><span class="spacer"></span><button class="btn btn-sm" id="nv-voltar"' + (f.enviando ? ' disabled' : '') + '>Voltar e editar</button><button class="btn btn-sm btn-primary" id="nv-criar"' + (f.enviando ? ' disabled' : '') + '>' + (f.enviando ? 'Criando no Onvio…' : 'Confirmar e criar no Onvio') + '</button></div>';
  } else {
    const selCliente = f.travado
      ? '<div class="vinculo"><svg class="ic"><use href="#i-building"/></svg><span>Cliente: <b>' + esc(rotCliente(c)) + '</b></span></div>'
      : '<label class="field">Cliente *<select id="nv-cliente"><option value="">Escolha…</option>' + f.clientes.map(x => '<option value="' + esc(x.nome) + '"' + (x.nome === f.cliente ? ' selected' : '') + '>' + esc(rotCliente(x)) + '</option>').join('') + '</select>' +
        '<span class="field-hint">Clientes com alguma solicitação pendente lida pelo Control Onvio. Para outro cliente, crie pelo Onvio.</span></label>';
    d.innerHTML = cab + '<form class="dlg-body" id="nv-form" autocomplete="off"><div class="dlg-section">' + erro + selCliente +
      '<div class="nv-linha"><label class="field">Departamento<select id="nv-dep"><option value="">Escolha…</option>' + OC.DEPARTAMENTOS.map(k => '<option value="' + k + '"' + (f.dep === k ? ' selected' : '') + '>' + esc(OC.ROT_DEPARTAMENTO[k]) + '</option>').join('') + '</select></label>' +
        '<label class="field">Modelo<select id="nv-modelo"' + (f.dep ? '' : ' disabled') + '><option value="">' + (f.dep ? 'Sem modelo (escrever do zero)' : 'Escolha o departamento') + '</option>' + modelosDe(f.dep).map((m, n) => '<option value="' + n + '"' + (String(n) === f.modelo ? ' selected' : '') + '>' + esc(m.rot) + '</option>').join('') + '</select></label></div>' +
      (semIdDoDepartamento(f.dep) ? '<p class="field-hint today" id="nv-dep-aviso">O id do departamento ' + esc(OC.ROT_DEPARTAMENTO[f.dep]) + ' ainda não está nas regras do escritório (criacao.departamentos.' + f.dep + '): a solicitação será criada no departamento padrão do seu acesso.</p>' : '') +
      '<label class="field">Assunto *<input id="nv-assunto" maxlength="200" value="' + esc(f.assunto) + '" placeholder="Ex.: Documentos pendentes da admissão"></label>' +
      '<label class="field">Descrição *<textarea id="nv-desc" rows="8" placeholder="O que o cliente precisa saber ou fazer (texto simples)">' + esc(f.descricao) + '</textarea></label>' +
      '<label class="obs"><input type="checkbox" id="nv-vez"' + (f.passarVez ? ' checked' : '') + '><span>Passar a vez ao cliente (trâmite "Respondido" logo depois de criar)</span></label>' +
      '<p class="field-hint" style="margin:0">Para anexar arquivos, responda na solicitação depois de criada.</p>' +
    '</div></form>' +
    '<div class="dlg-actions"><span class="spacer"></span><button type="button" class="btn btn-sm" id="nv-cancelar">Cancelar</button><button type="button" class="btn btn-sm btn-primary" id="nv-revisar">Revisar e criar</button></div>';
  }
  ligar();
}

function validar() {
  if (!f.clientes.some(x => x.nome === f.cliente)) return 'Escolha o cliente.';
  if (!f.assunto.trim()) return 'Escreva o assunto.';
  if (!f.descricao.trim()) return 'Escreva a descrição.';
  const falta = OC.marcadoresPendentes(f.assunto + '\n' + f.descricao);
  if (falta.length) return 'Falta preencher: ' + falta.join(', ');
  return '';
}

function ligar() {
  const v = id => $(id);
  v('#nv-fechar').onclick = () => { if (!f.enviando) fecharNova(); };
  if (v('#nv-cliente')) v('#nv-cliente').onchange = e => { f.cliente = e.target.value; };
  if (v('#nv-dep')) v('#nv-dep').onchange = e => { f.dep = e.target.value; f.modelo = ''; desenhar(); };
  if (v('#nv-modelo')) v('#nv-modelo').onchange = e => {
    f.modelo = e.target.value;
    const m = f.modelo === '' ? null : modelosDe(f.dep)[Number(f.modelo)];
    if (m) { f.assunto = m.assunto; f.descricao = m.descricao; }       // editáveis; os "(descreva ...)" barram a criação até serem preenchidos
    desenhar();
    const campo = $('#nv-desc'); if (campo) { campo.focus(); const mk = OC.marcadoresPendentes(campo.value)[0], pos = mk ? campo.value.indexOf(mk) : -1; if (pos >= 0) campo.setSelectionRange(pos, pos + mk.length); }
  };
  if (v('#nv-assunto')) v('#nv-assunto').oninput = e => { f.assunto = e.target.value; };
  if (v('#nv-desc')) v('#nv-desc').oninput = e => { f.descricao = e.target.value; };
  if (v('#nv-vez')) v('#nv-vez').onchange = e => { f.passarVez = e.target.checked; };
  if (v('#nv-cancelar')) v('#nv-cancelar').onclick = fecharNova;
  const revisar = () => { f.erro = validar(); f.confirmar = !f.erro; desenhar(); };
  if (v('#nv-revisar')) v('#nv-revisar').onclick = revisar;
  if (v('#nv-form')) v('#nv-form').onsubmit = e => { e.preventDefault(); revisar(); };
  $$('#nv-form input, #nv-form select, #nv-form textarea').forEach(x => x.addEventListener('input', () => { if (f.erro) { f.erro = ''; const fx = $('#dlg-nova .faixa'); if (fx) fx.remove(); } }));
  if (v('#nv-voltar')) v('#nv-voltar').onclick = () => { f.confirmar = false; desenhar(); };
  if (v('#nv-criar')) v('#nv-criar').onclick = async () => {
    const c = f.clientes.find(x => x.nome === f.cliente);
    f.enviando = true; f.erro = ''; desenhar();
    const dep = f.dep;
    const r = await enviar({ cmd: 'criar', origem: c.origem, assunto: f.assunto, descricao: f.descricao, passarVez: f.passarVez, departamento: f.dep });
    if (!f) return;
    if (!r.ok) { f.enviando = false; f.confirmar = false; f.erro = 'Não foi criada: ' + (r.erro || 'o Onvio não aceitou'); desenhar(); return; }
    const depois = f.aoCriar, cli = c.apelido || c.nome;
    fecharNova();
    const quem = r.num ? 'Solicitação #' + r.num + ' criada no Onvio' : 'Solicitação criada no Onvio';
    if (r.erroTramite) toast(quem + ', mas: ' + r.erroTramite, true);
    else if (dep && r.departamentoPadrao) toast(quem + ' no departamento padrão do seu acesso: o id do ' + OC.ROT_DEPARTAMENTO[dep] + ' ainda não está nas regras', true);
    else toast(quem + (r.tramite ? ' · a vez passou ao cliente' : ''));
    if (depois) { try { await depois(r); } catch (e) { console.error(e); } }
    if (r.num) abrirDetalhe({ type: 'geral', num: r.num, cliente: cli }, null);
  };
}

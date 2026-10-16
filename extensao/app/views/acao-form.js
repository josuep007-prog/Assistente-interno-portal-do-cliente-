/* Ações no Onvio dentro do detalhe (fase 2): responder (trâmite com situação e anexos), encaminhar, definir
 * responsável e alterar expectativa. Sempre em dois passos: preencher e "Revisar e enviar", depois confirmar.
 * Quem escreve no Onvio é o service worker (cmd 'acao'), de dentro da aba do Onvio; aqui nada é guardado. */
import { itens, enviar } from '../estado.js';
import { esc, toast, $, $$ } from '../util.js';
const OC = window.OC;

const MAX_ANEXOS = 10, MAX_BYTES = 15 * 1024 * 1024;
const TITULO = { tramite: 'Responder', encaminhar: 'Encaminhar para outro usuário', responsavel: 'Definir responsável', expectativa: 'Alterar expectativa de conclusão' };
let f = null;   // { acao, texto, situacao, analista, data, arquivos: [File], confirmar, enviando, erro }

export const acaoAberta = () => !!f;
// preset (opcional): texto e situação sugeridos e aoEnviar, chamado depois que o Onvio aceitou (só na memória)
export function novaAcao(acao, preset) {
  const p = preset || {};
  f = { acao, texto: p.texto || '', situacao: p.situacao || '', analista: '', data: '', arquivos: [], confirmar: false, enviando: false, erro: '', aoEnviar: typeof p.aoEnviar === 'function' ? p.aoEnviar : null };
}
const tamanho = n => n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1).replace('.', ',') + ' MB';
const equipe = i => OC.equipeDe(itens()).filter(p => f.acao !== 'encaminhar' || p.id !== i.respId);
const nomeDe = (i, id) => (equipe(i).find(p => p.id === id) || {}).nome || '';

export function formAcao(i, obs) {
  const cab = '<div class="acao-cab"><h3>' + esc(TITULO[f.acao]) + '</h3><span class="fraco">#' + esc(i.num) + ' · ' + esc(i.apelido || i.cliente || '') + ' · ' + esc(i.typeLabel) + '</span></div>' +
    (f.erro ? '<div class="faixa"><svg class="ic"><use href="#i-alert"/></svg>' + esc(f.erro) + '</div>' : '');
  if (f.confirmar) return cab + '<div class="acao-conf" id="a-conf"><b>Confirme o que vai ser enviado ao Onvio:</b><ul>' + resumo(i).map(l => '<li>' + esc(l) + '</li>').join('') + '</ul>' +
    '<p class="fraco">Isto fica registrado no Onvio em seu nome e o cliente pode ver os trâmites. Não dá para desfazer pela extensão.</p>' +
    '<div class="acao-pe"><button class="btn btn-sm" id="a-voltar"' + (f.enviando ? ' disabled' : '') + '>Voltar e editar</button><button class="btn btn-sm btn-primary" id="a-enviar"' + (f.enviando ? ' disabled' : '') + '>' + (f.enviando ? 'Enviando ao Onvio…' : 'Confirmar envio ao Onvio') + '</button></div></div>';
  const eq = equipe(i);
  const selEq = rot => '<label class="field">' + rot + '<select id="a-analista"><option value="">Escolha…</option>' + eq.map(p => '<option value="' + esc(p.id) + '"' + (f.analista === p.id ? ' selected' : '') + '>' + esc(p.nome) + '</option>').join('') + '</select></label>' +
    (eq.length ? '' : '<p class="fraco">Nenhum analista conhecido ainda: a lista vem de quem é responsável por alguma pendência.</p>');
  let corpo = '';
  if (f.acao === 'tramite') {
    const sits = OC.situacoesTramite(i);
    corpo = '<label class="field">Situação depois do trâmite<select id="a-situacao"><option value="">Escolha…</option>' + sits.map(x => '<option value="' + x.code + '"' + (String(f.situacao) === String(x.code) ? ' selected' : '') + '>' + esc(x.rot) + '</option>').join('') + '</select></label>' +
      '<label class="field">Texto do trâmite<textarea id="a-texto" rows="7" placeholder="Escreva a resposta ao cliente (texto simples; o Onvio não usa formatação)">' + esc(f.texto) + '</textarea></label>' +
      (obs.some(o => !o.interno) ? '<button class="btn btn-sm" id="a-obs" type="button"><svg class="ic ic-sm"><use href="#i-copy"/></svg> Inserir observações para o cliente</button>' : '') +
      '<div class="acao-anexos"><label class="btn btn-sm"><svg class="ic ic-sm"><use href="#i-paperclip"/></svg> Anexar arquivos<input type="file" id="a-arquivos" multiple hidden></label><span class="fraco">até ' + MAX_ANEXOS + ' arquivos de 15 MB</span>' +
        '<div class="anexos">' + f.arquivos.map((a, n) => '<span>' + esc(a.name) + ' · ' + tamanho(a.size) + ' <button type="button" class="linkish" data-tira-arq="' + n + '" aria-label="Tirar ' + esc(a.name) + '">×</button></span>').join('') + '</div></div>' +
      (!i.resp ? '<p class="fraco">Sem responsável: no Onvio, o primeiro trâmite define você como responsável.</p>' : '');
  } else if (f.acao === 'encaminhar') {
    corpo = selEq('Encaminhar para') + '<label class="field">Comentário<textarea id="a-texto" rows="4" placeholder="Por que está encaminhando (fica no trâmite)">' + esc(f.texto) + '</textarea></label>' +
      '<p class="fraco">O Onvio registra um trâmite "Encaminhado para outro usuário"; o responsável não muda.</p>';
  } else if (f.acao === 'responsavel') {
    corpo = selEq('Novo responsável');
  } else if (f.acao === 'expectativa') {
    corpo = '<label class="field">Nova expectativa de conclusão<input type="date" id="a-data" value="' + esc(f.data) + '"></label><p class="fraco">É a data informada ao cliente; o vencimento do Control Onvio continua pelos prazos internos e legais.</p>';
  }
  return cab + '<div class="acao-form">' + corpo + '<div class="acao-pe"><button class="btn btn-sm" id="a-cancelar">Cancelar</button><button class="btn btn-sm btn-primary" id="a-revisar">Revisar e enviar</button></div></div>';
}

function resumo(i) {
  const l = [];
  if (f.acao === 'tramite') {
    const sit = OC.situacoesTramite(i).find(x => String(x.code) === String(f.situacao));
    l.push('Trâmite com a situação "' + (sit ? sit.rot : '?') + '"');
    l.push('Texto: "' + (f.texto.length > 140 ? f.texto.slice(0, 140) + '…' : f.texto) + '"');
    if (f.arquivos.length) l.push(f.arquivos.length + ' anexo(s): ' + f.arquivos.map(a => a.name).join(', '));
  } else if (f.acao === 'encaminhar') {
    l.push('Encaminhar para ' + nomeDe(i, f.analista));
    l.push('Comentário: "' + (f.texto.length > 140 ? f.texto.slice(0, 140) + '…' : f.texto) + '"');
  } else if (f.acao === 'responsavel') l.push('Responsável: ' + nomeDe(i, f.analista));
  else if (f.acao === 'expectativa') l.push('Nova expectativa: ' + f.data.split('-').reverse().join('/'));
  return l;
}

function validar() {
  if (f.acao === 'tramite') {
    if (!f.situacao) return 'Escolha a situação do trâmite.';
    if (!f.texto.trim()) return 'Escreva o texto do trâmite.';
  }
  if (f.acao === 'encaminhar') { if (!f.analista) return 'Escolha para quem encaminhar.'; if (!f.texto.trim()) return 'Escreva um comentário.'; }
  if (f.acao === 'responsavel' && !f.analista) return 'Escolha o responsável.';
  if (f.acao === 'expectativa' && !/^\d{4}-\d{2}-\d{2}$/.test(f.data)) return 'Escolha a data.';
  return '';
}

const base64 = arq => new Promise((ok, falha) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ''));
  r.onerror = () => falha(new Error('não consegui ler ' + arq.name));
  r.readAsDataURL(arq);
});

// cb: { redesenhar, cancelar, feito }
export function ligarAcao(g, i, obs, cb) {
  const v = id => $(id, g);
  // corrigiu o que faltava: o aviso some sem redesenhar (para não perder o foco)
  const limpar = () => { if (f.erro && !f.confirmar) { f.erro = ''; const x = $('.acao-cab + .faixa', g); if (x) x.remove(); } };
  $$('.acao-form input, .acao-form select, .acao-form textarea', g).forEach(x => x.addEventListener('input', limpar));
  if (v('#a-texto')) v('#a-texto').oninput = e => { f.texto = e.target.value; };
  if (v('#a-situacao')) v('#a-situacao').onchange = e => { f.situacao = e.target.value; };
  if (v('#a-analista')) v('#a-analista').onchange = e => { f.analista = e.target.value; };
  if (v('#a-data')) v('#a-data').onchange = e => { f.data = e.target.value; };
  if (v('#a-obs')) v('#a-obs').onclick = () => {
    const txt = obs.filter(o => !o.interno).map(o => '• ' + o.texto).join('\n');
    f.texto = (f.texto.trim() ? f.texto.trimEnd() + '\n\n' : '') + 'Observações importantes:\n' + txt;
    cb.redesenhar();
  };
  if (v('#a-arquivos')) v('#a-arquivos').onchange = e => {
    const novos = [...e.target.files];
    const grandes = novos.filter(a => a.size > MAX_BYTES);
    f.arquivos = f.arquivos.concat(novos.filter(a => a.size <= MAX_BYTES)).slice(0, MAX_ANEXOS);
    if (grandes.length) toast('Maior que 15 MB, ficou de fora: ' + grandes.map(a => a.name).join(', '), true);
    cb.redesenhar();
  };
  $$('[data-tira-arq]', g).forEach(b => b.onclick = () => { f.arquivos.splice(Number(b.dataset.tiraArq), 1); cb.redesenhar(); });
  if (v('#a-cancelar')) v('#a-cancelar').onclick = () => { f = null; cb.cancelar(); };
  if (v('#a-revisar')) v('#a-revisar').onclick = () => { f.erro = validar(); f.confirmar = !f.erro; cb.redesenhar(); };
  if (v('#a-voltar')) v('#a-voltar').onclick = () => { f.confirmar = false; cb.redesenhar(); };
  if (v('#a-enviar')) v('#a-enviar').onclick = async () => {
    f.enviando = true; f.erro = ''; cb.redesenhar();
    try {
      const arquivos = f.acao === 'tramite' ? await Promise.all(f.arquivos.map(async a => ({ nome: a.name, tipo: a.type, b64: await base64(a) }))) : [];
      const msg = { cmd: 'acao', type: i.type, num: String(i.num), acao: f.acao === 'encaminhar' ? 'tramite' : f.acao, texto: f.texto, situacao: f.situacao, analista: f.analista, data: f.data, arquivos };
      if (f.acao === 'encaminhar') msg.encaminharPara = f.analista;
      const r = await enviar(msg);
      if (!r.ok) throw new Error(r.erro || 'o Onvio não aceitou');
      const feito = { tramite: 'Trâmite enviado ao Onvio', encaminhar: 'Encaminhada', responsavel: 'Responsável definido', expectativa: 'Expectativa alterada' }[f.acao];
      if (r.erroAnexos) toast(feito + ', mas: ' + r.erroAnexos, true);
      else toast(feito + (r.anexos ? ' com ' + r.anexos + ' anexo(s)' : ''));
      const depois = f.aoEnviar;
      f = null;
      if (depois) { try { await depois(); } catch (e) { console.error(e); } }
      cb.feito();
    } catch (e) {
      f.enviando = false; f.confirmar = false; f.erro = 'Não foi enviado: ' + (e.message || e);
      cb.redesenhar();
    }
  };
}

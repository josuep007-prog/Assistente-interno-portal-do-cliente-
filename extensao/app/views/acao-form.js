/* Outras ações no Onvio dentro do detalhe: passar para outro analista (encaminhar ou trocar o responsável) e alterar a
 * expectativa. Em dois passos: preencher e "Revisar e enviar", depois confirmar. O trâmite de resposta ao cliente fica na
 * caixa de resposta (resposta.js). Quem escreve no Onvio é o service worker (cmd 'acao'), de dentro da aba do Onvio; aqui
 * nada é guardado. */
import { itens, enviar } from '../estado.js';
import { esc, toast, $, $$ } from '../util.js';
const OC = window.OC;

const TITULO = { passar: 'Passar para outro analista', expectativa: 'Alterar expectativa de conclusão' };
let f = null;   // { acao, modo, texto, analista, data, confirmar, enviando, erro }

export const acaoAberta = () => !!f;
export const fecharAcao = () => { f = null; };
export function novaAcao(acao, preset) {
  const p = preset || {};
  f = { acao, modo: p.modo === 'responsavel' ? 'responsavel' : 'encaminhar', texto: p.texto || '', analista: p.analista || '', data: '', confirmar: false, enviando: false, erro: '', aoEnviar: typeof p.aoEnviar === 'function' ? p.aoEnviar : null };
}
// o que cada opção de "passar" pode fazer agora, com o motivo na própria linha quando não pode
export function opcoesPassar(i) {
  return { encaminhar: OC.podeAcao('encaminhar', i), responsavel: OC.podeAcao('responsavel', i) };
}
const equipe = i => OC.equipeDe(itens()).filter(p => !(f.acao === 'passar' && f.modo === 'encaminhar') || p.id !== i.respId);
const nomeDe = (i, id) => (equipe(i).find(p => p.id === id) || {}).nome || '';

export function formAcao(i) {
  const cab = '<div class="acao-cab"><h3>' + esc(TITULO[f.acao]) + '</h3><span class="fraco">#' + esc(i.num) + ' · ' + esc(i.apelido || i.cliente || '') + ' · ' + esc(i.typeLabel) + '</span></div>' +
    (f.erro ? '<div class="faixa"><svg class="ic"><use href="#i-alert"/></svg>' + esc(f.erro) + '</div>' : '');
  if (f.confirmar) return cab + '<div class="acao-conf" id="a-conf"><b>Confirme o que vai ser enviado ao Onvio:</b><ul>' + resumo(i).map(l => '<li>' + esc(l) + '</li>').join('') + '</ul>' +
    '<p class="fraco">Isto fica registrado no Onvio em seu nome' + (f.acao === 'passar' && f.modo === 'encaminhar' ? ' e o cliente pode ver o trâmite' : '') + '. Não dá para desfazer pela extensão.</p>' +
    '<div class="acao-pe"><button class="btn btn-sm" id="a-voltar"' + (f.enviando ? ' disabled' : '') + '>Voltar e editar</button><button class="btn btn-sm btn-primary" id="a-enviar"' + (f.enviando ? ' disabled' : '') + '>' + (f.enviando ? 'Enviando ao Onvio…' : 'Confirmar envio ao Onvio') + '</button></div></div>';
  let corpo = '';
  if (f.acao === 'passar') {
    const op = opcoesPassar(i);
    if (!op[f.modo].ok) f.modo = op.encaminhar.ok ? 'encaminhar' : 'responsavel';
    const radio = (modo, rot, ajuda) => '<label class="acao-op' + (op[modo].ok ? '' : ' off') + '"><input type="radio" name="a-modo" value="' + modo + '"' + (f.modo === modo ? ' checked' : '') + (op[modo].ok ? '' : ' disabled') + '><span><b>' + rot + '</b><small>' + (op[modo].ok ? ajuda : esc(op[modo].motivo)) + '</small></span></label>';
    const eq = equipe(i);
    corpo = '<div class="acao-ops" role="radiogroup">' +
        radio('encaminhar', 'Encaminhar com um comentário', 'O Onvio registra um trâmite "Encaminhado para outro usuário"; o responsável continua o mesmo.') +
        radio('responsavel', 'Trocar o responsável', 'O colega passa a ser o responsável pela solicitação, sem trâmite.') + '</div>' +
      '<label class="field">' + (f.modo === 'encaminhar' ? 'Encaminhar para' : 'Novo responsável') + '<select id="a-analista"><option value="">Escolha…</option>' + eq.map(p => '<option value="' + esc(p.id) + '"' + (f.analista === p.id ? ' selected' : '') + '>' + esc(p.nome) + '</option>').join('') + '</select></label>' +
      (eq.length ? '' : '<p class="fraco">Nenhum analista conhecido ainda: a lista vem de quem é responsável por alguma pendência.</p>') +
      (f.modo === 'encaminhar' ? '<label class="field">Comentário<textarea id="a-texto" rows="4" placeholder="Por que está encaminhando (fica no trâmite)">' + esc(f.texto) + '</textarea></label>' : '');
  } else if (f.acao === 'expectativa') {
    corpo = '<label class="field">Nova expectativa de conclusão<input type="date" id="a-data" value="' + esc(f.data) + '"></label><p class="fraco">É a data informada ao cliente; o vencimento do Control Onvio continua pelos prazos internos e legais.</p>';
  }
  return cab + '<div class="acao-form">' + corpo + '<div class="acao-pe"><button class="btn btn-sm" id="a-cancelar">Cancelar</button><button class="btn btn-sm btn-primary" id="a-revisar">Revisar e enviar</button></div></div>';
}

function resumo(i) {
  const l = [];
  if (f.acao === 'passar' && f.modo === 'encaminhar') {
    l.push('Encaminhar para ' + nomeDe(i, f.analista));
    l.push('Comentário: "' + (f.texto.length > 140 ? f.texto.slice(0, 140) + '…' : f.texto) + '"');
  } else if (f.acao === 'passar') l.push('Responsável: ' + nomeDe(i, f.analista));
  else if (f.acao === 'expectativa') l.push('Nova expectativa: ' + f.data.split('-').reverse().join('/'));
  return l;
}

function validar() {
  if (f.acao === 'passar') {
    if (!f.analista) return f.modo === 'encaminhar' ? 'Escolha para quem encaminhar.' : 'Escolha o responsável.';
    if (f.modo === 'encaminhar' && !f.texto.trim()) return 'Escreva um comentário.';
  }
  if (f.acao === 'expectativa' && !/^\d{4}-\d{2}-\d{2}$/.test(f.data)) return 'Escolha a data.';
  return '';
}

// cb: { redesenhar, cancelar, feito }
export function ligarAcao(g, i, obs, cb) {
  const v = id => $(id, g);
  // corrigiu o que faltava: o aviso some sem redesenhar (para não perder o foco)
  const limpar = () => { if (f.erro && !f.confirmar) { f.erro = ''; const x = $('.acao-cab + .faixa', g); if (x) x.remove(); } };
  $$('.acao-form input, .acao-form select, .acao-form textarea', g).forEach(x => x.addEventListener('input', limpar));
  if (v('#a-texto')) v('#a-texto').oninput = e => { f.texto = e.target.value; };
  if (v('#a-analista')) v('#a-analista').onchange = e => { f.analista = e.target.value; };
  if (v('#a-data')) v('#a-data').onchange = e => { f.data = e.target.value; };
  $$('input[name="a-modo"]', g).forEach(r => r.onchange = () => { f.modo = r.value; f.analista = ''; f.erro = ''; cb.redesenhar(); });
  if (v('#a-cancelar')) v('#a-cancelar').onclick = () => { f = null; cb.cancelar(); };
  if (v('#a-revisar')) v('#a-revisar').onclick = () => { f.erro = validar(); f.confirmar = !f.erro; cb.redesenhar(); };
  if (v('#a-voltar')) v('#a-voltar').onclick = () => { f.confirmar = false; cb.redesenhar(); };
  if (v('#a-enviar')) v('#a-enviar').onclick = async () => {
    f.enviando = true; f.erro = ''; cb.redesenhar();
    try {
      const msg = { cmd: 'acao', type: i.type, num: String(i.num), arquivos: [] };
      if (f.acao === 'passar' && f.modo === 'encaminhar') Object.assign(msg, { acao: 'tramite', texto: f.texto, encaminharPara: f.analista, analista: f.analista });
      else if (f.acao === 'passar') Object.assign(msg, { acao: 'responsavel', analista: f.analista });
      else Object.assign(msg, { acao: 'expectativa', data: f.data });
      const r = await enviar(msg);
      if (!r.ok) throw new Error(r.erro || 'o Onvio não aceitou');
      toast(f.acao === 'expectativa' ? 'Expectativa alterada' : f.modo === 'encaminhar' ? 'Encaminhada' : 'Responsável definido');
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

/* Lembretes · pessoais, guardados no Chrome de cada um; o service worker avisa na hora marcada */
import { estado, salvarLembretes } from '../estado.js';
import { esc, fmtDataHora, toast, plural, $ } from '../util.js';
const OC = window.OC;
const p2 = n => String(n).padStart(2, '0');
const dataInput = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());

export function render(el, ctx) {
  const l = estado.lembretes || [];
  const grupo = s => l.filter(x => OC.situacaoLembrete(x) === s).sort((a, b) => a.quando.localeCompare(b.quando));
  const grupos = [['atrasado', 'Atrasados'], ['hoje', 'Hoje'], ['proximo', 'Próximos']];
  const feitos = l.filter(x => x.feito).sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 20);
  const amanha = new Date(OC.adiarLembrete({}, 'amanha').quando);

  el.innerHTML =
    '<div class="cab"><div><h1>Lembretes</h1><div class="sub">Só seus · ficam neste computador · avisam na hora marcada, mesmo com o Onvio fechado</div></div></div>' +
    '<section class="card" style="margin-bottom:14px"><h2>Novo lembrete</h2><div class="form-lembrete" style="margin-top:0">' +
      '<input type="text" id="lt" placeholder="Ex.: ligar para o cliente sobre a rescisão" maxlength="300">' +
      '<input type="date" id="ld" value="' + dataInput(amanha) + '"><input type="time" id="lh" value="09:00">' +
      '<div class="chips"><button data-q="1h">Em 1 hora</button><button data-q="amanha">Amanhã 9h</button></div>' +
      '<button class="btn btn-primary btn-sm" id="ls"><svg class="ic ic-sm"><use href="#i-plus"/></svg> Criar</button></div>' +
      '<p style="margin:8px 0 0;font-size:12px;color:var(--ink-3)">Para ligar o lembrete a uma solicitação, crie pelo botão "Lembrete" no detalhe dela.</p></section>' +
    grupos.map(([s, rot]) => { const g = grupo(s); return g.length ? '<section class="card" style="margin-bottom:14px"><h2>' + rot + ' · ' + g.length + '</h2>' + g.map(item).join('') + '</section>' : ''; }).join('') +
    (l.filter(x => !x.feito).length ? '' : '<div class="vazio">Nenhum lembrete pendente.</div>') +
    (feitos.length ? '<section class="card"><h2>Concluídos recentemente</h2>' + feitos.map(item).join('') + '</section>' : '');

  el.querySelectorAll('[data-q]').forEach(b => b.onclick = () => {
    const q = new Date(OC.adiarLembrete({}, b.dataset.q).quando);
    $('#ld', el).value = dataInput(q); $('#lh', el).value = p2(q.getHours()) + ':' + p2(q.getMinutes());
  });
  $('#ls', el).onclick = async () => {
    try {
      const n = OC.novoLembrete({ texto: $('#lt', el).value, quando: $('#ld', el).value + 'T' + ($('#lh', el).value || '09:00') + ':00' });
      await salvarLembretes(l.concat(n));
      toast('Lembrete criado para ' + fmtDataHora(n.quando));
    } catch (e) { toast(e.message, true); }
  };
  el.querySelectorAll('[data-l]').forEach(d => d.addEventListener('click', async e => {
    const b = e.target.closest('[data-a]');
    const x = l.find(y => y.id === d.dataset.l);
    if (!x) return;
    if (!b) { if (x.type && x.num) ctx.abrirDetalhe(x); return; }
    const a = b.dataset.a;
    let lista = l;
    if (a === 'feito') lista = l.map(y => y.id === x.id ? Object.assign({}, y, { feito: true }) : y);
    else if (a === 'reabrir') lista = l.map(y => y.id === x.id ? Object.assign({}, y, { feito: false, disparado: false }) : y);
    else if (a === '1h' || a === 'amanha') lista = l.map(y => y.id === x.id ? OC.adiarLembrete(y, a) : y);
    else if (a === 'excluir') lista = l.filter(y => y.id !== x.id);
    await salvarLembretes(lista);
  }));
}

function item(x) {
  const s = OC.situacaoLembrete(x);
  const cls = s === 'atrasado' ? 'late' : s === 'hoje' ? 'today' : '';
  return '<div class="item-ag ' + cls + (x.type && x.num ? ' clicavel' : '') + '" data-l="' + esc(x.id) + '"><svg class="ic"><use href="#i-clock"/></svg>' +
    '<div class="tx"><b' + (x.feito ? ' style="text-decoration:line-through;color:var(--ink-3)"' : '') + '>' + esc(x.texto) + '</b><small>' + esc(fmtDataHora(x.quando)) + (x.num ? ' · #' + esc(x.num) + (x.cliente ? ' ' + esc(x.cliente) : '') : '') + '</small></div>' +
    '<div class="acts">' + (x.feito
      ? '<button class="btn btn-sm" data-a="reabrir">Reabrir</button><button class="btn btn-sm" data-a="excluir" title="Excluir">Excluir</button>'
      : '<button class="btn btn-sm" data-a="feito" title="Marcar como feito"><svg class="ic ic-sm"><use href="#i-check"/></svg> Feito</button><button class="btn btn-sm" data-a="1h">+1 h</button><button class="btn btn-sm" data-a="amanha">Amanhã</button><button class="btn btn-sm" data-a="excluir" title="Excluir">Excluir</button>') +
    '</div></div>';
}
export const contarPendentes = () => (estado.lembretes || []).filter(x => ['atrasado', 'hoje'].includes(OC.situacaoLembrete(x))).length;
export const descrever = n => plural(n, 'lembrete', 'lembretes');

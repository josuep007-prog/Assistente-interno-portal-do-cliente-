/* Clientes · quem tem mais pendências, quem demora a responder, quem abre na aba errada */
import { itens } from '../estado.js';
import { esc, plural, $ } from '../util.js';
import { barrasEmpilhadas, ligarDicas } from '../graficos.js';
const OC = window.OC;

let filtro = '';
let ord = 'atraso';

export function render(el, ctx) {
  const it = itens();
  const cl = OC.porCliente(it);
  const comCli = cl.filter(c => c.cli > 0);
  const kpis = [
    { k: 'todos', rot: 'Clientes com pendências', val: cl.length, det: plural(it.length, 'solicitação', 'solicitações'), cls: 'soon estatico' },
    { k: 'atraso', rot: 'Com algo fora do prazo', val: cl.filter(c => c.atraso).length, det: 'clientes', cls: 'late estatico' },
    { k: 'cli', rot: 'Aguardando o cliente', val: it.filter(i => i.lado === 'cli').length, det: plural(comCli.length, 'cliente', 'clientes'), cls: 'today estatico' },
    { k: 'aba', rot: 'Possível aba errada', val: it.filter(i => i.abaProvavel).length, det: 'na lista Geral', cls: 'estatico' }
  ];
  const top = cl.slice().sort((a, b) => b.total - a.total).slice(0, 10).map(c => ({ rotulo: c.apelido || c.cliente, id: c.cliente, valores: { esc: c.esc, cli: c.cli } }));

  el.innerHTML =
    '<div class="cab"><div><h1>Clientes</h1><div class="sub">Pendências por empresa, ao vivo</div></div></div>' +
    '<div class="grade g-kpi" style="margin-bottom:14px">' + kpis.map(k => '<div class="kpi ' + k.cls + '"><span class="rot">' + k.rot + '</span><span class="val">' + k.val + '</span><span class="det">' + esc(k.det) + '</span></div>').join('') + '</div>' +
    '<div class="grade g-2i" style="margin-bottom:14px">' +
      '<section class="card"><h2>Mais pendências</h2><div id="g-top"></div></section>' +
      '<section class="card"><h2>Mais tempo sem responder</h2><div id="l-lentos"></div></section>' +
    '</div>' +
    '<div class="filtros"><input type="search" id="f" placeholder="Filtrar cliente…" value="' + esc(filtro) + '">' +
      '<select id="ord" aria-label="Ordenar"><option value="atraso">Fora do prazo primeiro</option><option value="total">Mais pendências</option><option value="dias">Mais dias aguardando o cliente</option><option value="aba">Aba errada</option></select><span class="count" id="cont"></span></div>' +
    '<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Cliente</th><th class="num">Pendências</th><th class="num">Escritório</th><th class="num">Cliente</th><th class="num">Fora do prazo</th><th class="num">Prescreve ≤ 5d</th><th class="num">Dias aguardando cliente (média)</th><th class="num">Aba errada</th></tr></thead><tbody id="corpo"></tbody></table></div>';
  $('#ord', el).value = ord;

  const lentos = comCli.filter(c => c.diasCliMedia != null).sort((a, b) => b.diasCliMedia - a.diasCliMedia).slice(0, 8);
  $('#l-lentos', el).innerHTML = lentos.length ? lentos.map(c => '<div class="item-ag clicavel" data-cli="' + esc(c.cliente) + '"><svg class="ic"><use href="#i-building"/></svg><div class="tx"><b>' + esc(c.apelido || c.cliente) + '</b><small>' + plural(c.cli, 'solicitação', 'solicitações') + ' na vez do cliente' + (c.prescreve ? ' · ' + c.prescreve + ' perto de prescrever' : '') + '</small></div><span class="mono ' + (c.diasCliMedia >= 15 ? 'late' : '') + '" style="font-weight:600">' + String(c.diasCliMedia).replace('.', ',') + 'd</span></div>').join('') : '<div class="vazio">Nenhum cliente com solicitação esperando resposta.</div>';

  const desenhar = () => {
    const w = Math.max(320, Math.round($('#g-top', el).clientWidth));
    $('#g-top', el).innerHTML = barrasEmpilhadas(top, [{ chave: 'esc', nome: 'Com o escritório', cor: 's1' }, { chave: 'cli', nome: 'Com o cliente', cor: 's2' }], { largura: w, rotuloL: 170, titulo: 'Clientes com mais pendências' });
  };
  const tabela = () => {
    const q = filtro.trim().toLowerCase();
    const k = { atraso: c => c.atraso * 1000 + c.prescreve * 100 + c.total, total: c => c.total, dias: c => c.diasCliMedia || 0, aba: c => c.abaErrada }[ord];
    const l = cl.filter(c => !q || (c.cliente + ' ' + c.apelido).toLowerCase().includes(q)).sort((a, b) => k(b) - k(a));
    $('#cont', el).textContent = plural(l.length, 'cliente', 'clientes');
    $('#corpo', el).innerHTML = l.length ? l.map(c => '<tr data-cli="' + esc(c.cliente) + '"><td><b>' + esc(c.apelido || c.cliente) + '</b>' + (c.apelido && c.apelido !== c.cliente ? '<div class="fraco">' + esc(c.cliente) + '</div>' : '') + '</td><td class="num">' + c.total + '</td><td class="num">' + c.esc + '</td><td class="num">' + c.cli + '</td><td class="num ' + (c.atraso ? 'late' : '') + '">' + c.atraso + '</td><td class="num ' + (c.prescreve ? 'late' : '') + '">' + c.prescreve + '</td><td class="num">' + (c.diasCliMedia == null ? '–' : String(c.diasCliMedia).replace('.', ',')) + '</td><td class="num">' + (c.abaErrada || '') + '</td></tr>').join('') : '<tr><td colspan="8" class="vazio">Nenhum cliente com esse filtro.</td></tr>';
    el.querySelectorAll('#corpo [data-cli]').forEach(tr => tr.addEventListener('click', () => ctx.navegar('fila', { cliente: tr.dataset.cli })));
  };
  desenhar(); tabela();
  ctx.aoRedimensionar(desenhar);
  ligarDicas(el);
  $('#f', el).addEventListener('input', e => { filtro = e.target.value; tabela(); });
  $('#ord', el).addEventListener('change', e => { ord = e.target.value; tabela(); });
  $('#g-top', el).addEventListener('click', e => { const g = e.target.closest('[data-id]'); if (g) ctx.navegar('fila', { cliente: g.dataset.id }); });
  el.querySelectorAll('#l-lentos [data-cli]').forEach(d => d.addEventListener('click', () => ctx.navegar('fila', { cliente: d.dataset.cli })));
}

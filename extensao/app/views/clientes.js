/* Clientes · quem tem mais pendências, quem demora a responder, quem abre na aba errada.
 * Abas Painel e Empresas (Cartões ou Lista, como Empresas no Departamento Pessoal). */
import { itens } from '../estado.js';
import { esc, plural, normal, $, $$ } from '../util.js';
import { barrasEmpilhadas, ligarDicas } from '../graficos.js';
const OC = window.OC;

let filtro = '';
let ord = 'atraso';
let vis = (() => { try { return localStorage.getItem('controlonvio-cli-vis') || 'cartoes'; } catch (e) { return 'cartoes'; } })();

export function render(el, ctx, params) {
  params = params || {};
  const aba = params.aba === 'empresas' ? 'empresas' : 'painel';
  const it = itens();
  const cl = OC.porCliente(it);
  ctx.cab({
    titulo: 'Clientes', sub: 'Pendências por empresa, ao vivo',
    abas: [{ id: 'painel', rot: 'Painel', href: '#/clientes' }, { id: 'empresas', rot: 'Empresas', href: '#/clientes?aba=empresas', n: cl.length }],
    aba
  });
  if (aba === 'empresas') return empresas(el, ctx, cl);

  const comCli = cl.filter(c => c.cli > 0);
  const kpis = [
    { rot: 'Clientes com pendências', val: cl.length, det: plural(it.length, 'solicitação', 'solicitações'), cls: 'estatico' },
    { rot: 'Com algo fora do prazo', val: cl.filter(c => c.atraso).length, det: 'clientes', cls: 'late estatico' },
    { rot: 'Aguardando o cliente', val: it.filter(i => i.lado === 'cli').length, det: plural(comCli.length, 'cliente', 'clientes'), cls: 'today estatico' },
    { rot: 'Possível aba errada', val: it.filter(i => i.abaProvavel).length, det: 'na lista Geral', cls: 'estatico' }
  ];
  const top = cl.slice().sort((a, b) => b.total - a.total).slice(0, 10).map(c => ({ rotulo: c.apelido || c.cliente, id: c.cliente, valores: { esc: c.esc, cli: c.cli } }));
  const lentos = comCli.filter(c => c.diasCliMedia != null).sort((a, b) => b.diasCliMedia - a.diasCliMedia).slice(0, 8);

  el.innerHTML =
    '<div class="g-kpi">' + kpis.map(k => '<div class="kpi ' + k.cls + '"><span class="rot">' + k.rot + '</span><span class="val">' + k.val + '</span><span class="det">' + esc(k.det) + '</span></div>').join('') + '</div>' +
    '<div class="grade g-2i">' +
      '<section class="card"><div class="card-h"><h3>Mais pendências</h3><span class="sub">clique para ver as do cliente</span></div><div class="card-b"><div id="g-top"></div></div></section>' +
      '<section class="card"><div class="card-h"><h3>Mais tempo sem responder</h3><span class="sub">média de dias na vez do cliente</span></div><div class="card-b" id="l-lentos">' +
        (lentos.length ? lentos.map(c => '<div class="item-ag clicavel" data-cli="' + esc(c.cliente) + '"><svg class="ic"><use href="#i-building"/></svg><div class="tx"><b>' + esc(c.apelido || c.cliente) + '</b><small>' + plural(c.cli, 'solicitação', 'solicitações') + ' na vez do cliente' + (c.prescreve ? ' · ' + c.prescreve + ' perto de prescrever' : '') + '</small></div><span class="mono ' + (c.diasCliMedia >= 15 ? 'late' : '') + '" style="font-weight:600">' + String(c.diasCliMedia).replace('.', ',') + 'd</span></div>').join('') : '<div class="vazio">Nenhum cliente com solicitação esperando resposta.</div>') + '</div></section>' +
    '</div>' +
    '<p class="card-nota"><a href="#/clientes?aba=empresas">Ver todas as empresas →</a></p>';

  const desenhar = () => {
    const w = Math.max(320, Math.round($('#g-top', el).clientWidth));
    $('#g-top', el).innerHTML = barrasEmpilhadas(top, [{ chave: 'esc', nome: 'Com o escritório', cor: 's1' }, { chave: 'cli', nome: 'Com o cliente', cor: 's2' }], { largura: w, rotuloL: 170, titulo: 'Clientes com mais pendências' });
  };
  desenhar();
  ctx.aoRedimensionar(desenhar);
  ligarDicas(el);
  $('#g-top', el).addEventListener('click', e => { const g = e.target.closest('[data-id]'); if (g) ctx.navegar('fila', { cliente: g.dataset.id }); });
  $$('#l-lentos [data-cli]', el).forEach(d => d.addEventListener('click', () => ctx.navegar('fila', { cliente: d.dataset.cli })));
}

function empresas(el, ctx, cl) {
  el.innerHTML =
    '<div class="barra"><input type="search" id="f" placeholder="Filtrar cliente…" value="' + esc(filtro) + '" aria-label="Filtrar cliente">' +
      '<span class="rotulo">Ordenar</span><select id="ord" aria-label="Ordenar"><option value="atraso">Fora do prazo primeiro</option><option value="total">Mais pendências</option><option value="dias">Mais dias aguardando o cliente</option><option value="aba">Aba errada</option><option value="nome">Nome (A–Z)</option></select>' +
      '<span class="count" id="cont"></span>' +
      '<div class="seg" role="group" aria-label="Visualização"><button data-vis="cartoes"' + (vis === 'cartoes' ? ' class="on"' : '') + '><svg class="ic"><use href="#i-grid"/></svg> Cartões</button><button data-vis="lista"' + (vis === 'lista' ? ' class="on"' : '') + '><svg class="ic"><use href="#i-list"/></svg> Lista</button></div></div>' +
    '<div id="corpo"></div>';
  $('#ord', el).value = ord;
  const tabela = () => {
    const q = normal(filtro.trim());
    const k = { atraso: c => c.atraso * 1000 + c.prescreve * 100 + c.total, total: c => c.total, dias: c => c.diasCliMedia || 0, aba: c => c.abaErrada, nome: () => 0 }[ord];
    const l = cl.filter(c => !q || normal(c.cliente + ' ' + c.apelido).includes(q)).sort((a, b) => (k(b) - k(a)) || (a.apelido || a.cliente).localeCompare(b.apelido || b.cliente, 'pt-BR'));
    $('#cont', el).textContent = plural(l.length, 'cliente', 'clientes');
    const vazio = '<div class="vazio"><b>Nenhum cliente com esse filtro</b></div>';
    if (vis === 'cartoes') {
      const max = Math.max(1, ...l.map(c => c.total));
      $('#corpo', el).innerHTML = l.length ? '<div class="cards">' + l.map(c => '<div class="sc lvl-' + (c.atraso ? 2 : c.prescreve ? 1 : 0) + '" tabindex="0" data-cli="' + esc(c.cliente) + '">' +
        '<div class="sc-cli" title="' + esc(c.cliente) + '">' + esc(c.apelido || c.cliente) + '</div>' + (c.apelido && c.apelido !== c.cliente ? '<div class="sc-sub">' + esc(c.cliente) + '</div>' : '') +
        '<div class="cli-num"><div><b>' + c.total + '</b><span>pendências</span></div><div><b' + (c.atraso ? ' class="late"' : '') + '>' + c.atraso + '</b><span>fora do prazo</span></div><div><b>' + (c.diasCliMedia == null ? '–' : String(c.diasCliMedia).replace('.', ',')) + '</b><span>dias cliente</span></div></div>' +
        '<div class="barra-mini" title="Com o escritório × com o cliente"><i style="width:' + (c.esc / max * 100) + '%;background:var(--viz-s1)"></i><i style="width:' + (c.cli / max * 100) + '%;background:var(--viz-s2)"></i></div>' +
        '<div class="sc-pe"><span>' + c.esc + ' escritório · ' + c.cli + ' cliente</span>' + (c.prescreve ? '<span class="resp late">' + c.prescreve + ' prescreve ≤ 5d</span>' : c.abaErrada ? '<span class="resp">' + c.abaErrada + ' aba errada?</span>' : '') + '</div></div>').join('') + '</div>' : '<div class="list-card">' + vazio + '</div>';
    } else {
      $('#corpo', el).innerHTML = '<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Cliente</th><th class="num">Pendências</th><th class="num">Escritório</th><th class="num">Cliente</th><th class="num">Fora do prazo</th><th class="num">Prescreve ≤ 5d</th><th class="num">Dias aguardando cliente (média)</th><th class="num">Aba errada</th></tr></thead><tbody>' +
        (l.length ? l.map(c => '<tr data-cli="' + esc(c.cliente) + '" tabindex="0"><td><b>' + esc(c.apelido || c.cliente) + '</b>' + (c.apelido && c.apelido !== c.cliente ? '<div class="fraco">' + esc(c.cliente) + '</div>' : '') + '</td><td class="num">' + c.total + '</td><td class="num">' + c.esc + '</td><td class="num">' + c.cli + '</td><td class="num ' + (c.atraso ? 'late' : '') + '">' + c.atraso + '</td><td class="num ' + (c.prescreve ? 'late' : '') + '">' + c.prescreve + '</td><td class="num">' + (c.diasCliMedia == null ? '–' : String(c.diasCliMedia).replace('.', ',')) + '</td><td class="num">' + (c.abaErrada || '') + '</td></tr>').join('') : '<tr><td colspan="8">' + vazio + '</td></tr>') + '</tbody></table></div>';
    }
    $$('#corpo [data-cli]', el).forEach(r => {
      const go = () => ctx.navegar('fila', { cliente: r.dataset.cli });
      r.addEventListener('click', go); r.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    });
  };
  tabela();
  $('#f', el).addEventListener('input', e => { filtro = e.target.value; tabela(); });
  $('#ord', el).addEventListener('change', e => { ord = e.target.value; tabela(); });
  $$('[data-vis]', el).forEach(b => b.addEventListener('click', () => {
    vis = b.dataset.vis; try { localStorage.setItem('controlonvio-cli-vis', vis); } catch (e) {}
    $$('[data-vis]', el).forEach(x => x.classList.toggle('on', x === b)); tabela();
  }));
}

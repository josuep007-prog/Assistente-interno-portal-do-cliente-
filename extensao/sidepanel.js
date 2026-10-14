/* Control Onvio · painel lateral */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const st = { snap: null, status: null, settings: Object.assign({}, OC.DEFAULTS), aba: 'minhas', texto: '', tipo: '', lado: '', resp: '', kpi: '', limite: 60, busca: [], guias: {}, clientes: {}, fguia: '' };

  /* ---------- utilidades ---------- */
  function fmtHora(iso) {
    const d = iso ? new Date(iso) : null;
    if (!d || isNaN(d)) return '';
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function toast(msg, erro) {
    const t = $('#toast'); t.textContent = msg; t.classList.toggle('err', !!erro); t.classList.add('show');
    clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 3200);
  }
  function enviar(msg) { return new Promise(res => chrome.runtime.sendMessage(msg, r => res(r || { ok: false, erro: chrome.runtime.lastError && chrome.runtime.lastError.message }))); }

  /* ---------- tema ---------- */
  function temaAtual() {
    const t = document.documentElement.getAttribute('data-theme');
    if (t) return t;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function iconeTema() { $('#btn-tema use').setAttribute('href', temaAtual() === 'dark' ? '#i-sun' : '#i-moon'); }
  $('#btn-tema').addEventListener('click', () => {
    const n = temaAtual() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', n);
    try { localStorage.setItem('controlonvio-theme', n); } catch (e) {}
    iconeTema();
  });
  iconeTema();

  /* ---------- dados da aba atual ---------- */
  function base() {
    const it = (st.snap && st.snap.items) || [];
    if (st.aba === 'minhas') return it.filter(i => i.mine);
    if (st.aba === 'semresp') return it.filter(i => !i.resp);
    return it;
  }
  function filtrar(lista, ignorarKpi) {
    const q = st.texto.trim().toLowerCase();
    return lista.filter(i => {
      if (st.tipo && i.type !== st.tipo) return false;
      if (st.lado && i.lado !== st.lado) return false;
      if (st.aba === 'equipe' && st.resp && (i.resp || '(sem responsável)') !== st.resp) return false;
      if (!ignorarKpi && st.kpi) {
        if (st.kpi === 'esc' && i.lado !== 'esc') return false;
        if (st.kpi === 'cli' && i.lado !== 'cli') return false;
        if (st.kpi === 'late' && i.nivel !== 2) return false;
        if (st.kpi === 'today' && i.nivel !== 1) return false;
      }
      if (q) {
        const alvo = [i.num, i.apelido, i.cliente, i.detalhe, i.resp, i.solicitante, i.status, i.typeLabel].join(' ').toLowerCase();
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
  }

  /* ---------- render ---------- */
  function renderSync() {
    const s = st.status || {};
    const snap = st.snap;
    const btn = $('#btn-atualizar');
    btn.classList.toggle('girando', s.estado === 'lendo');
    let tx = '';
    if (s.estado === 'lendo') tx = 'Lendo o Onvio' + (s.etapa ? ' · ' + s.etapa : '…');
    else if (snap) tx = 'Atualizado ' + fmtHora(snap.fetchedAt) + ' · a cada ' + st.settings.intervalo + ' min';
    else tx = 'Ainda sem leitura';
    $('#sync-tx').textContent = tx;
    $('#quem').textContent = snap && snap.user ? snap.user.nome : '';
    const av = $('#aviso');
    if (s.estado === 'sem_sessao' || s.estado === 'erro') {
      av.hidden = false;
      av.className = 'aviso';
      av.innerHTML = '<div><b>' + (s.estado === 'sem_sessao' ? 'Sem sessão no Onvio.' : 'Falha na última leitura.') + '</b> ' + esc(s.msg || '') + '</div>' +
        '<div><button class="btn btn-sm btn-primary" id="btn-abrir-onvio"><svg class="ic ic-sm"><use href="#i-link"/></svg> Abrir o Onvio</button></div>';
      $('#btn-abrir-onvio').onclick = () => enviar({ cmd: 'abrirOnvio' });
    } else if (s.erros && s.erros.length) {
      av.hidden = false; av.className = 'aviso warn';
      av.innerHTML = '<div><b>Algumas listas não foram lidas:</b> ' + esc(s.erros.join(' · ')) + '</div>';
    } else if (snap && snap.desconhecidos && Object.keys(snap.desconhecidos).length) {
      const txt = Object.entries(snap.desconhecidos).map(([k, v]) => OC.TYPE_BY_KEY[k].label + ': ' + Object.entries(v).map(([c, n]) => 'código ' + c + ' (' + n + ')').join(', ')).join(' · ');
      av.hidden = false; av.className = 'aviso warn';
      av.innerHTML = '<div><b>Situação que a extensão não conhece:</b> ' + esc(txt) + '. Essas solicitações aparecem com alerta amarelo e fora de "escritório" e "cliente". Avise quem mantém a extensão.</div>';
    } else av.hidden = true;
  }

  function renderBadges() {
    const it = (st.snap && st.snap.items) || [];
    const m = it.filter(i => i.mine), sr = it.filter(i => !i.resp);
    const set = (id, arr) => { const b = $(id); b.textContent = arr.length || ''; b.classList.toggle('late', arr.some(i => i.nivel === 2)); };
    set('#b-minhas', m.filter(i => i.lado === 'esc'));
    set('#b-semresp', sr);
    set('#b-equipe', it.filter(i => i.nivel === 2));
    const gs = guiasAlerta();
    const bg = $('#b-guias'); bg.textContent = gs.length || ''; bg.classList.toggle('late', gs.some(x => x.a.nivel === 2));
  }

  function renderKpis() {
    const l = filtrar(base(), true);
    const n = f => l.filter(f).length;
    const cards = [
      ['esc', 'is-soon', n(i => i.lado === 'esc'), 'Ação do escritório'],
      ['cli', 'is-ok', n(i => i.lado === 'cli'), 'Vez do cliente'],
      ['late', 'is-late', n(i => i.nivel === 2), 'Fora do prazo'],
      ['today', 'is-today', n(i => i.nivel === 1), 'Atenção']
    ];
    $('#kpis').innerHTML = cards.map(c => '<button class="kpi-card ' + c[1] + (st.kpi === c[0] ? ' on' : '') + '" data-kpi="' + c[0] + '"><span class="kpi-label">' + c[3] + '</span><span class="kpi-value">' + c[2] + '</span></button>').join('');
    $$('#kpis .kpi-card').forEach(b => b.onclick = () => { st.kpi = st.kpi === b.dataset.kpi ? '' : b.dataset.kpi; st.limite = 60; render(); });
  }

  function linha(i) {
    const pillSt = i.lado === 'esc' ? 'pill-soon' : i.lado === 'cli' ? '' : 'pill-muted';
    const sub = [i.detalhe, st.aba === 'minhas' ? i.solicitante : (i.resp || 'sem responsável')].filter(Boolean).join(' · ');
    const mot = (i.grav === 3 ? '<span class="pill pill-late" title="Crítica">G3</span>' : '').concat((i.motivos || []).map(m => '<span class="pill ' + (m.n === 2 ? 'pill-late' : 'pill-today') + '">' + esc(m.m) + '</span>').join(''));
    const lado = i.lado === 'esc' ? 'escritório' : i.lado === 'cli' ? 'cliente' : '';
    return '<div class="row lvl-' + (i.nivel || 0) + '" tabindex="0" data-k="' + esc(i.k) + '" title="Abrir no Onvio">' +
      '<div><div class="row-top"><span class="num mono">#' + esc(i.num) + '</span><span>' + esc(i.typeLabel) + '</span><span class="pill ' + pillSt + '">' + esc(i.status) + '</span></div>' +
      '<div class="cell-main">' + esc(i.apelido || i.cliente || 'Cliente não informado') + '</div>' +
      '<div class="cell-sub">' + esc(sub) + '</div></div>' +
      '<div class="row-side"><span class="dias mono">' + (i.parado || 0) + 'd</span><span>parada</span>' + (lado ? '<span>vez: ' + lado + '</span>' : '') + '</div>' +
      (mot ? '<div class="motivos">' + mot + '</div>' : '') + '</div>';
  }

  function ligarLinhas(container, fonte) {
    container.querySelectorAll('.row').forEach(r => {
      const go = () => { const it = fonte.find(x => x.k === r.dataset.k); if (it) enviar({ cmd: 'abrir', item: it }).then(() => toast('Abrindo #' + it.num + ' no Onvio')); };
      r.onclick = go; r.onkeydown = e => { if (e.key === 'Enter') go(); };
    });
  }

  function renderLista() {
    const l = filtrar(base());
    $('#count').textContent = l.length + (l.length === 1 ? ' solicitação' : ' solicitações');
    const box = $('#lista');
    if (!st.snap) { box.innerHTML = '<div class="empty">Aguardando a primeira leitura do Onvio.</div>'; return; }
    if (!l.length) {
      const msg = st.aba === 'minhas' ? 'Nenhuma solicitação pendente atribuída a você.' : st.aba === 'semresp' ? 'Todas as pendências têm responsável.' : 'Nada encontrado com esses filtros.';
      box.innerHTML = '<div class="empty">' + msg + '</div>'; return;
    }
    box.innerHTML = l.slice(0, st.limite).map(linha).join('') + (l.length > st.limite ? '<button class="mais" id="btn-mais">Mostrar mais ' + Math.min(60, l.length - st.limite) + ' de ' + (l.length - st.limite) + '</button>' : '');
    ligarLinhas(box, l);
    const m = $('#btn-mais'); if (m) m.onclick = () => { st.limite += 60; renderLista(); };
  }

  function renderAnalistas() {
    const rows = OC.porAnalista((st.snap && st.snap.items) || []);
    $('#count-an').textContent = rows.length + ' responsáveis · ' + ((st.snap && st.snap.items.length) || 0) + ' pendências';
    $('#tbl-an tbody').innerHTML = rows.map(r => '<tr data-resp="' + esc(r.resp) + '"><td title="' + esc(r.resp) + '">' + esc(r.resp) + '</td><td>' + r.esc + '</td><td>' + r.cli + '</td><td class="' + (r.g1 ? 'today' : '') + '">' + r.g1 + '</td><td class="' + (r.g2 ? 'late' : '') + '">' + r.g2 + '</td><td class="' + (r.g3 ? 'late' : '') + '">' + r.g3 + '</td><td>' + r.semPrimeiro + '</td><td>' + (r.ptMedia == null ? '–' : String(r.ptMedia).replace('.', ',')) + '</td></tr>').join('') ||
      '<tr><td colspan="8" class="empty">Sem dados.</td></tr>';
    $$('#tbl-an tbody tr[data-resp]').forEach(tr => tr.onclick = () => { st.resp = tr.dataset.resp; trocarAba('equipe'); });
  }

  /* ---------- guias não visualizadas ---------- */
  function guiasAlerta() {
    const out = [];
    for (const [pasta, v] of Object.entries(st.guias || {})) for (const x of (v.docs || [])) {
      const a = OC.avaliarGuia({ due: x.due, lido: false }, st.settings);
      if (a) out.push({ pasta, x, a, cliente: st.clientes[x.clientId] || '' });
    }
    return out.sort((p, q) => (p.a.dias - q.a.dias) || p.x.nome.localeCompare(q.x.nome));
  }
  function renderGuias() {
    const q = st.fguia.trim().toLowerCase();
    const todas = guiasAlerta();
    const l = todas.filter(g => !q || (g.cliente + ' ' + g.x.nome).toLowerCase().includes(q));
    $('#count-guias').textContent = l.length + (l.length === 1 ? ' guia' : ' guias');
    const box = $('#lista-guias');
    if (!todas.length) { box.innerHTML = '<div class="empty">Nenhuma guia não visualizada perto do vencimento nas pastas que você abriu em Documentos.</div>'; return; }
    if (!l.length) { box.innerHTML = '<div class="empty">Nada encontrado com esse filtro.</div>'; return; }
    const grupos = new Map();
    l.forEach(g => { const k = g.cliente || (g.x.clientId ? 'Cliente ' + g.x.clientId.slice(0, 8) : 'Cliente não identificado'); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(g); });
    box.innerHTML = [...grupos.entries()].map(([cli, gs]) => '<div class="grupo">' + esc(cli) + ' <span class="pill">' + gs.length + '</span></div>' + gs.map((g, n) =>
      '<div class="row lvl-' + g.a.nivel + '" tabindex="0" data-g="' + esc(g.pasta + '|' + g.x.id) + '" title="' + (g.x.link ? 'Abrir no Onvio' : '') + '">' +
      '<div><div class="cell-main">' + esc(g.x.nome) + '</div><div class="cell-sub">Vencimento ' + esc(g.a.venc.split('-').reverse().join('/')) + '</div></div>' +
      '<div class="row-side"><span class="pill ' + (g.a.nivel === 2 ? 'pill-late' : 'pill-today') + '">' + esc(g.a.motivo) + '</span></div></div>').join('')).join('');
    $$('#lista-guias .row').forEach(r => {
      const go = () => { const [pasta, id] = r.dataset.g.split('|'); const x = ((st.guias[pasta] || {}).docs || []).find(d => d.id === id); if (x && x.link) chrome.tabs.create({ url: x.link }); else toast('Sem link para esta guia', true); };
      r.onclick = go; r.onkeydown = e => { if (e.key === 'Enter') go(); };
    });
  }

  function renderRespSelect() {
    const sel = $('#f-resp');
    sel.hidden = st.aba !== 'equipe';
    const nomes = [...new Set(((st.snap && st.snap.items) || []).map(i => i.resp || '(sem responsável)'))].sort((a, b) => a.localeCompare(b));
    sel.innerHTML = '<option value="">Todos os responsáveis</option>' + nomes.map(n => '<option' + (n === st.resp ? ' selected' : '') + '>' + esc(n) + '</option>').join('');
  }

  function render() {
    renderSync(); renderBadges();
    $('#v-lista').hidden = !['minhas', 'semresp', 'equipe'].includes(st.aba);
    $('#v-analistas').hidden = st.aba !== 'analistas';
    $('#v-buscar').hidden = st.aba !== 'buscar';
    $('#v-guias').hidden = st.aba !== 'guias';
    if (!$('#v-lista').hidden) { renderRespSelect(); renderKpis(); renderLista(); }
    if (st.aba === 'analistas') renderAnalistas();
    if (st.aba === 'guias') renderGuias();
  }

  function trocarAba(a) {
    st.aba = a; st.kpi = ''; st.limite = 60;
    if (a !== 'equipe') st.resp = '';
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.aba === a));
    render();
  }

  /* ---------- controles ---------- */
  OC.TYPES.forEach(t => { const o = document.createElement('option'); o.value = t.key; o.textContent = t.label; $('#f-tipo').appendChild(o); });
  $$('.tab').forEach(t => t.addEventListener('click', () => trocarAba(t.dataset.aba)));
  $('#f-texto').addEventListener('input', e => { st.texto = e.target.value; st.limite = 60; renderKpis(); renderLista(); });
  $('#f-guia').addEventListener('input', e => { st.fguia = e.target.value; renderGuias(); });
  $('#f-tipo').addEventListener('change', e => { st.tipo = e.target.value; render(); });
  $('#f-resp').addEventListener('change', e => { st.resp = e.target.value; render(); });
  $$('#f-lado button').forEach(b => b.addEventListener('click', () => { st.lado = b.dataset.lado; $$('#f-lado button').forEach(x => x.classList.toggle('on', x === b)); render(); }));
  $('#btn-config').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('#btn-atualizar').addEventListener('click', async () => {
    st.status = { estado: 'lendo' }; renderSync();
    const r = await enviar({ cmd: 'atualizar' });
    if (!r.ok) toast(r.erro || 'Não foi possível atualizar', true); else toast('Lista atualizada');
  });

  // exportação
  $('#btn-csv').addEventListener('click', () => {
    const l = filtrar(base());
    const cab = ['Tipo', 'ID', 'Situação', 'Vez de', 'Cliente', 'Apelido', 'Empregado/Assunto', 'Responsável', 'Solicitante', 'Aberta em', 'Último trâmite', 'Expectativa', 'Dias parada', 'Dias úteis aberta', 'Prescreve em (dias)', 'Alerta', 'Gravidade', '1º trâmite (d.u., estimativa)', 'Motivos'];
    const cel = v => { const s = String(v == null ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const linhas = l.map(i => [i.typeLabel, i.num, i.status, i.lado === 'esc' ? 'Escritório' : i.lado === 'cli' ? 'Cliente' : 'Situação desconhecida', i.cliente, i.apelido, i.detalhe, i.resp, i.solicitante, fmtHora(OC.parseDate(i.created)), fmtHora(OC.parseDate(i.last)), i.due || '', i.parado, i.uteisAberto, i.prescreveEm == null ? '' : i.prescreveEm, ['', 'Atenção', 'Fora do prazo'][i.nivel || 0], i.grav ? 'G' + i.grav : '', i.ptUteis == null ? '' : i.ptUteis, (i.motivos || []).map(m => m.m).join(' | ')].map(cel).join(';'));
    const blob = new Blob(['﻿' + [cab.join(';')].concat(linhas).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    const d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = 'onvio-' + st.aba + '-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.csv';
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(l.length + ' linhas exportadas');
  });

  // busca no Onvio
  async function buscar() {
    const q = $('#q').value.trim();
    if (q.length < 2) { toast('Digite ao menos 2 caracteres', true); return; }
    const box = $('#res-busca');
    box.innerHTML = '<div class="empty">Buscando nas 10 listas…</div>';
    const r = await enviar({ cmd: 'buscar', q });
    if (!r.ok) { box.innerHTML = '<div class="empty">' + esc(r.erro || 'Falha na busca') + '</div>'; return; }
    st.busca = r.itens || [];
    box.innerHTML = st.busca.length ? st.busca.slice(0, 120).map(linha).join('') : '<div class="empty">Nada encontrado para "' + esc(q) + '".</div>';
    ligarLinhas(box, st.busca);
  }
  $('#btn-buscar').addEventListener('click', buscar);
  $('#q').addEventListener('keydown', e => { if (e.key === 'Enter') buscar(); });

  /* ---------- carga inicial e atualizações ---------- */
  chrome.storage.local.get(['snapshot', 'status', 'settings', 'guias', 'clientes'], d => {
    st.snap = d.snapshot || null; st.status = d.status || null; st.guias = d.guias || {}; st.clientes = d.clientes || {};
    st.settings = Object.assign({}, OC.DEFAULTS, d.settings || {});
    render();
    if (!st.snap && (!st.status || st.status.estado !== 'lendo')) enviar({ cmd: 'atualizar' });
  });
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    if (ch.snapshot) st.snap = ch.snapshot.newValue;
    if (ch.status) st.status = ch.status.newValue;
    if (ch.settings) st.settings = Object.assign({}, OC.DEFAULTS, ch.settings.newValue || {});
    if (ch.guias) st.guias = ch.guias.newValue || {};
    if (ch.clientes) st.clientes = ch.clientes.newValue || {};
    if (ch.snapshot || ch.settings || ch.guias || ch.clientes) render(); else renderSync();
  });
  setInterval(renderSync, 60000);
})();

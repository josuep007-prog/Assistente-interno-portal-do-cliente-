/* Control Onvio · configurações */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const NUM = ['tempoRealSeg', 'intervalo', 'primeiroTramite', 'conclusaoSimples', 'conclusaoCalculo', 'clienteSemRetorno', 'resolvidaClienteDias', 'parada', 'foraDoPortalDias', 'concluirClienteDias', 'desfazerSeg', 'prescricaoDias'];
  const BOOL = ['abrirAoEntrar', 'notificar', 'modoGestor'];
  let regras = null;          // regras do escritório guardadas (arquivo)

  // O que vale sem ajustes pessoais: padrões do código + regras do escritório.
  const base = () => OC.combinarSettings(regras, {});

  function preencher(s) {
    NUM.forEach(k => { $('#' + k).value = s[k]; });
    BOOL.forEach(k => { $('#' + k).checked = !!s[k]; });
    $('#feriados').value = (s.feriados || []).join('\n');
    $('#regrasUrl').value = s.regrasUrl || '';
  }
  function ler() {
    const s = {};
    NUM.forEach(k => { const v = Number($('#' + k).value); s[k] = Number.isFinite(v) && v >= 0 ? v : OC.DEFAULTS[k]; });
    s.intervalo = Math.max(1, s.intervalo);
    if (s.tempoRealSeg > 0) s.tempoRealSeg = Math.max(15, s.tempoRealSeg);
    BOOL.forEach(k => { s[k] = $('#' + k).checked; });
    s.feriados = $('#feriados').value.split(/\s+/).map(x => x.trim()).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x));
    s.regrasUrl = $('#regrasUrl').value.trim();
    return s;
  }
  // Grava só o que difere do padrão em vigor: assim, mudanças futuras do arquivo de regras continuam valendo.
  function soAjustes(s) {
    const b = base(), out = { __v: 2 };
    for (const [k, v] of Object.entries(s)) if (JSON.stringify(v) !== JSON.stringify(b[k])) out[k] = v;
    return out;
  }
  function estado(msg, ok) { const e = $('#estado'); e.textContent = msg; e.classList.toggle('ok', !!ok); }

  async function permitirOrigem(url) {
    if (!url) return true;
    let u; try { u = new URL(url); } catch (e) { return false; }
    if (u.protocol !== 'https:') return false;
    const origins = [u.origin + '/*'];
    return (await chrome.permissions.contains({ origins })) || chrome.permissions.request({ origins });
  }

  function mostrarRegras() {
    const e = $('#regras-estado');
    if (!regras || !regras.url) { e.textContent = 'Usando as regras embutidas na extensão.'; return; }
    const quando = d => (d ? new Date(d).toLocaleString('pt-BR') : '—');
    e.textContent = regras.regras
      ? 'Arquivo em uso: versão ' + (regras.versao || '?') + ', atualizado em ' + quando(regras.atualizadoEm) + '.' + (regras.erro ? ' Última tentativa falhou: ' + regras.erro : '')
      : (regras.erro || 'Ainda não baixado.');
  }

  const OP = window.OCOpcoes;
  const diagnostico = (snap, perfil, status, rotasAnexo) => OP.diagnostico(snap, perfil, status, rotasAnexo, regras);

  async function carregar() {
    const d = await chrome.storage.local.get(['settings', 'snapshot', 'regrasEscritorio', 'perfilSessao', 'status', 'rotasAnexo']);
    regras = d.regrasEscritorio || null;
    preencher(OC.combinarSettings(regras, d.settings));
    mostrarRegras();
    $('#diag').textContent = diagnostico(d.snapshot, d.perfilSessao, d.status, d.rotasAnexo);
  }
  carregar();

  $('#salvar').addEventListener('click', async () => {
    const s = ler();
    if (s.regrasUrl && !(await permitirOrigem(s.regrasUrl))) { estado('Sem permissão para acessar o endereço das regras (use https e aceite o pedido do Chrome).'); return; }
    await chrome.storage.local.set({ settings: soAjustes(s) });
    estado('Salvo. Vale a partir da próxima leitura.', true);
    chrome.runtime.sendMessage({ cmd: 'atualizar' });
  });
  $('#padrao').addEventListener('click', () => {
    preencher(Object.assign({}, base(), { regrasUrl: $('#regrasUrl').value.trim() }));
    estado('Padrão do escritório carregado; clique em Salvar para aplicar.');
  });

  $('#regras-cliente').addEventListener('click', () => { $('#regrasUrl').value = window.OCOpcoes.URL_REGRAS_CLIENTE; estado('Endereço preenchido; clique em Salvar e depois em Atualizar agora.'); });
  $('#regras-agora').addEventListener('click', async () => {
    const url = $('#regrasUrl').value.trim();
    if (url && !(await permitirOrigem(url))) { estado('Sem permissão para acessar o endereço das regras.'); return; }
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: Object.assign({ __v: 2 }, settings || {}, { regrasUrl: url }) });
    const r = await new Promise(res => chrome.runtime.sendMessage({ cmd: 'atualizarRegras' }, x => res(x || {})));
    await carregar();
    estado(r.ok ? 'Regras atualizadas.' : 'Não foi possível atualizar (veja a mensagem acima).', !!r.ok);
  });

  $('#testar-leitura').addEventListener('click', async () => {
    const box = $('#teste-leitura');
    box.hidden = false; box.textContent = 'Testando…';
    const r = await new Promise(res => chrome.runtime.sendMessage({ cmd: 'testarLeitura' }, x => res(x || {})));
    box.textContent = r.ok ? r.linhas.join('\n') : 'Não foi possível testar: ' + (r.erro || chrome.runtime.lastError || 'sem resposta');
  });

  $('#sondar-empregados').addEventListener('click', async () => {
    const box = $('#teste-leitura');
    box.hidden = false; box.textContent = 'Sondando a lista de empregados (uma empresa, só leitura)…';
    const r = await new Promise(res => chrome.runtime.sendMessage({ cmd: 'sondarEmpregados' }, x => res(x || {})));
    box.textContent = r.ok ? r.linhas.join('\n') : 'Não foi possível sondar: ' + (r.erro || chrome.runtime.lastError || 'sem resposta');
  });

  $('#testar-folha').addEventListener('click', async () => {
    const box = $('#teste-leitura');
    box.hidden = false; box.textContent = 'Procurando um Extrato Mensal no portal de documentos (só leitura)…';
    const r = await new Promise(res => chrome.runtime.sendMessage({ cmd: 'testarFolha' }, x => res(x || {})));
    box.textContent = r.ok ? r.linhas.join('\n') : 'Não foi possível testar: ' + (r.erro || chrome.runtime.lastError || 'sem resposta');
  });
  let folhaConfirma = 0;
  $('#folha-de-novo').addEventListener('click', async () => {
    const box = $('#teste-leitura'), b = $('#folha-de-novo');
    if (Date.now() - folhaConfirma > 8000) {             // dois cliques: o primeiro explica
      folhaConfirma = Date.now(); b.textContent = 'Clique de novo para confirmar';
      box.hidden = false; box.textContent = 'No próximo envio ao Control Hub, os extratos dos últimos 12 meses de todas as empresas são lidos outra vez, um por vez (pode levar horas). Clique de novo para confirmar.';
      setTimeout(() => { if (Date.now() - folhaConfirma >= 8000) b.textContent = 'Ler a folha de novo'; }, 8100);
      return;
    }
    folhaConfirma = 0; b.textContent = 'Ler a folha de novo';
    const r = await new Promise(res => chrome.runtime.sendMessage({ cmd: 'folhaDeNovo' }, x => res(x || {})));
    box.textContent = r.ok ? 'Pronto: o próximo envio ao Control Hub procura de novo as pastas de cada empresa e lê a folha desde 12 meses atrás.' : 'Não foi possível: ' + (r.erro || 'sem resposta');
  });

  /* ---------- aprender ações ---------- */
  const { APRENDER_MAX_MS, textoAprendido } = OP, ativo = OP.aprenderAtivo;
  async function mostrarAprender() {
    const { aprender, aprendizado } = await chrome.storage.local.get(['aprender', 'aprendizado']);
    const ligado = ativo(aprender);
    const n = (aprendizado || []).length;
    $('#aprender-ligar').textContent = ligado ? 'Desligar' : 'Ligar';
    const resta = ligado ? Math.max(0, Math.round((APRENDER_MAX_MS - (Date.now() - aprender.desde)) / 60000)) : 0;
    $('#aprender-estado').textContent = (ligado ? 'Ligado · desliga em ' + resta + ' min · ' : 'Desligado · ') + n + ' chamada(s) diferente(s) registrada(s). Abas do Onvio abertas antes de atualizar a extensão precisam de F5.';
  }
  $('#aprender-ligar').addEventListener('click', async () => {
    const { aprender } = await chrome.storage.local.get('aprender');
    await chrome.storage.local.set({ aprender: ativo(aprender) ? { ligado: false } : { ligado: true, desde: Date.now() } });
    mostrarAprender();
  });
  $('#aprender-copiar').addEventListener('click', async () => {
    const { aprendizado } = await chrome.storage.local.get('aprendizado');
    const txt = textoAprendido(aprendizado);
    try { await navigator.clipboard.writeText(txt); $('#aprender-estado').textContent = 'Copiado (' + (aprendizado || []).length + ' chamadas).'; }
    catch (e) { $('#diag').textContent = txt; $('#aprender-estado').textContent = 'Não consegui copiar: o texto foi para o Diagnóstico abaixo.'; }
  });
  $('#aprender-limpar').addEventListener('click', async () => { await chrome.storage.local.remove('aprendizado'); mostrarAprender(); });
  mostrarAprender();
  setInterval(mostrarAprender, 30000);

  /* ---------- Control Hub (opcional) ---------- */
  const { HUB_ORIGENS, MOTIVOS_HUB, msgHub } = OP;
  async function mostrarHub() {
    const { hubCfg } = await chrome.storage.local.get('hubCfg');
    const c = Object.assign({ token: '', auto: true }, hubCfg || {});
    if (document.activeElement !== $('#hubCodigo')) $('#hubCodigo').value = c.token;
    $('#hubAuto').checked = !!c.auto;
    const st = await chrome.runtime.sendMessage({ cmd: 'hubStatus' }).catch(() => null);
    const q = d => (d ? new Date(d).toLocaleString('pt-BR') : '—');
    if (!st) { $('#hub-estado').textContent = ''; return; }
    await mostrarEnvioCompleto(c);
    const u = st.ultimo;
    $('#hub-estado').textContent = (st.permitido ? 'claude.ai permitido' : 'claude.ai ainda não permitido') + ' · ' + (st.hubAberto ? (st.hubSegundoPlano ? 'Hub aberto em segundo plano (responde mesmo assim)' : 'Hub aberto e respondendo') : 'Hub não encontrado numa aba aberta') + ' · ' +
      (u ? 'último envio ' + (u.ok ? 'aceito' : 'recusado') + ' em ' + q(u.em) + (u.ok ? ' (' + u.linhas + ' de ' + u.total + ' solicitações)' : ': ' + msgHub(u)) : 'nenhum envio ainda');
  }
  async function salvarHub() {
    const token = $('#hubCodigo').value.replace(/\s+/g, '').toUpperCase();
    const { hubCfg } = await chrome.storage.local.get('hubCfg');
    const extra = {};
    if ($('#hubSyncHoras').value) extra.syncHoras = Math.min(48, Math.max(1, Number($('#hubSyncHoras').value) || 6));
    extra.syncAuto = $('#hubSyncAuto').checked;
    await chrome.storage.local.set({ hubCfg: Object.assign({}, hubCfg || {}, { token, auto: $('#hubAuto').checked }, extra) });
    return token;
  }
  /* ----- envio completo: o que enviar e o andamento ----- */
  let catsDesenhadas = false;
  function desenharCategorias(c) {
    const box = $('#hub-cats');
    if (!catsDesenhadas) {
      box.innerHTML = '';
      for (const k of OC.HUB_CATEGORIAS) {
        const lab = document.createElement('label'); lab.className = 'check'; lab.style.alignItems = 'flex-start';
        const inp = document.createElement('input'); inp.type = 'checkbox'; inp.dataset.cat = k.id; inp.style.marginTop = '2px';
        const tx = document.createElement('span'); tx.innerHTML = '<b></b><br><span style="font-weight:400; color:var(--ink-3); font-size:12px"></span>';
        tx.querySelector('b').textContent = k.nome; tx.querySelector('span').textContent = k.ajuda;
        lab.append(inp, tx); box.append(lab);
      }
      box.addEventListener('change', onCategoria);
      catsDesenhadas = true;
    }
    for (const inp of box.querySelectorAll('input[data-cat]')) {
      const k = OC.HUB_CATEGORIAS.find(x => x.id === inp.dataset.cat);
      inp.checked = c.envio && c.envio[k.id] != null ? !!c.envio[k.id] : !!k.padrao;
    }
  }
  async function gravarEnvio(id, valor) {
    const { hubCfg } = await chrome.storage.local.get('hubCfg');
    const c = Object.assign({}, hubCfg || {});
    c.envio = Object.assign({}, c.envio || {}, { [id]: valor });
    await chrome.storage.local.set({ hubCfg: c });
  }
  async function onCategoria(e) {
    const inp = e.target.closest('input[data-cat]'); if (!inp) return;
    const k = OC.HUB_CATEGORIAS.find(x => x.id === inp.dataset.cat);
    if (k.pessoal && inp.checked) { inp.checked = false; $('#hub-pessoais-aviso').hidden = false; return; }   // pede confirmação antes de ligar
    await gravarEnvio(k.id, inp.checked);
  }
  $('#hub-pessoais-sim').addEventListener('click', async () => { await gravarEnvio('pessoais', true); $('#hub-pessoais-aviso').hidden = true; await mostrarHub(); });
  $('#hub-pessoais-nao').addEventListener('click', () => { $('#hub-pessoais-aviso').hidden = true; });
  async function mostrarEnvioCompleto(c) {
    desenharCategorias(c);
    if (document.activeElement !== $('#hubSyncHoras')) $('#hubSyncHoras').value = c.syncHoras || 6;
    $('#hubSyncAuto').checked = c.syncAuto !== false;
    const { hubSync } = await chrome.storage.local.get('hubSync');
    const box = $('#hub-sync-estado');
    if (!hubSync) { box.textContent = 'Nenhum envio completo ainda.'; return; }
    const q = d => (d ? new Date(d).toLocaleString('pt-BR') : '—');
    const ok = (hubSync.resultados || []).filter(r => r.ok), mal = (hubSync.resultados || []).filter(r => !r.ok);
    const preso = hubSync.estado === 'enviando' && hubSync.pulso && Date.now() - hubSync.pulso > 240000;        // sem sinal há 4 min: o envio morreu no meio
    if (preso) hubSync.estado = 'interrompido';
    const cab = hubSync.estado === 'interrompido' ? 'Último envio interrompido. O envio automático continua de onde parou, sem reenviar o que o Hub já aceitou.' : hubSync.estado === 'enviando' ? 'Enviando… ' + (hubSync.etapa || '') + ' (' + hubSync.feito + '/' + hubSync.total + ')'
      : 'Último envio completo: ' + { ok: 'tudo aceito', parcial: 'parte aceita', erro: 'não concluído' }[hubSync.estado] + ' em ' + q(hubSync.terminouEm) + (hubSync.motivo ? ' · ' + (MOTIVOS_HUB[hubSync.motivo] || hubSync.motivo) : '');
    box.textContent = '';
    const l1 = document.createElement('div'); l1.textContent = cab + (hubSync.estado === 'enviando' ? '' : ' · ' + ok.length + ' conjuntos enviados, ' + ok.reduce((n, r) => n + (r.linhas || 0), 0).toLocaleString('pt-BR') + ' linhas'); box.append(l1);
    for (const r of mal.slice(0, 12)) { const d = document.createElement('div'); d.style.color = 'var(--brand-red)'; d.textContent = '✕ ' + r.rotulo + ': ' + (MOTIVOS_HUB[r.motivo] || r.motivo); box.append(d); }
    for (const r of ok.filter(x => x.cortado).slice(0, 6)) { const d = document.createElement('div'); d.style.color = 'var(--brand-red)'; d.textContent = '⚠ ' + r.rotulo + ': veio incompleto' + (r.porque ? ': ' + r.porque : ' (cortado)'); box.append(d); }
    for (const r of ok.filter(x => x.motivo).slice(0, 6)) { const d = document.createElement('div'); d.style.color = r.nota ? 'var(--ink-2)' : 'var(--ink-3)'; d.textContent = (r.nota ? '• ' : '⚠ ') + r.rotulo + ': ' + (MOTIVOS_HUB[r.motivo] || r.motivo); box.append(d); }
    if (mal.length > 12) { const d = document.createElement('div'); d.textContent = '… e mais ' + (mal.length - 12) + ' com problema.'; box.append(d); }
  }
  $('#hubSyncAuto').addEventListener('change', salvarHub);
  $('#hubSyncHoras').addEventListener('change', salvarHub);
  $('#hub-sincronizar').addEventListener('click', async () => {
    await salvarHub();
    $('#hub-sync-estado').textContent = 'Iniciando…';
    const r = await chrome.runtime.sendMessage({ cmd: 'hubSincronizar' }).catch(e => ({ ok: false, motivo: String(e) }));
    if (r && r.ok === false) { $('#hub-sync-estado').textContent = msgHub(r); return; }
    const acompanhar = async () => { await mostrarHub(); const { hubSync } = await chrome.storage.local.get('hubSync'); if (hubSync && hubSync.estado === 'enviando') setTimeout(acompanhar, 1500); };
    setTimeout(acompanhar, 800);
  });
  $('#hubCodigo').addEventListener('change', salvarHub);
  $('#hubAuto').addEventListener('change', salvarHub);
  $('#hub-conectar').addEventListener('click', async () => {
    const token = await salvarHub();
    if (!token) { $('#hub-estado').textContent = MOTIVOS_HUB['sem-codigo']; return; }
    const ok = (await chrome.permissions.contains({ origins: HUB_ORIGENS })) || await chrome.permissions.request({ origins: HUB_ORIGENS });
    if (!ok) { $('#hub-estado').textContent = 'Permissão do claude.ai recusada: sem ela a ponte não funciona.'; return; }
    const r = await chrome.runtime.sendMessage({ cmd: 'hubRegistrar' });
    if (!r || !r.ok) { $('#hub-estado').textContent = 'Não consegui ligar a ponte: ' + ((r && r.motivo) || 'erro'); return; }
    await mostrarHub();
  });
  $('#hub-enviar').addEventListener('click', async () => {
    await salvarHub();
    $('#hub-estado').textContent = 'Enviando…';
    const r = await chrome.runtime.sendMessage({ cmd: 'hubEnviar' }).catch(e => ({ ok: false, motivo: String(e) }));
    await mostrarHub();
    if (!r.ok) $('#hub-estado').textContent = msgHub(r) + ' · ' + $('#hub-estado').textContent;
  });
  $('#hub-copiar').addEventListener('click', async () => {
    const r = await chrome.runtime.sendMessage({ cmd: 'hubLote' }).catch(() => null);
    if (!r || !r.ok) { $('#hub-estado').textContent = MOTIVOS_HUB[(r && r.motivo) || 'sem-leitura']; return; }
    try { await navigator.clipboard.writeText(JSON.stringify(r.lote)); $('#hub-estado').textContent = 'Resumo copiado (' + r.lote.nLinhas + ' solicitações). Cole em “Entrada de dados” no Hub.'; }
    catch (e) { $('#hub-estado').textContent = 'Não consegui copiar.'; }
  });
  $('#hub-desconectar').addEventListener('click', async () => { await chrome.runtime.sendMessage({ cmd: 'hubDesconectar' }); await mostrarHub(); });
  mostrarHub();
  setInterval(mostrarHub, 15000);

  $('#copiar-diag').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#diag').textContent); $('#copiado').textContent = 'Copiado'; }
    catch (e) { $('#copiado').textContent = 'Não foi possível copiar; selecione o texto.'; }
    setTimeout(() => { $('#copiado').textContent = ''; }, 2500);
  });
})();

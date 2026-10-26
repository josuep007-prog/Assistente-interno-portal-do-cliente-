/* Control Onvio · configurações */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const NUM = ['tempoRealSeg', 'intervalo', 'primeiroTramite', 'conclusaoSimples', 'conclusaoCalculo', 'clienteSemRetorno', 'resolvidaClienteDias', 'parada', 'foraDoPortalDias', 'concluirClienteDias', 'desfazerSeg', 'prescricaoDias'];
  const BOOL = ['abrirAoEntrar', 'notificar', 'modoGestor'];
  const URL_CLIENTE = 'https://raw.githubusercontent.com/josuep007-prog/assistente-portal-regras/main/regras.json';
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

  function linhasPerfil(p, status) {
    const rot = { escritorio: 'escritório', cliente: 'CLIENTE (o Control Onvio fica bloqueado)' };
    if (!p) return [];
    return ['Perfil da sessão: ' + (rot[p.perfil] || 'não confirmado') + ' · ' + (p.motivo || '') + ' · ' + (p.em || ''),
      'Formato da sessão (só nomes de campos): ' + ((p.formato || []).join(', ') || '—')];
  }
  // Trâmites por lista: resultado da última leitura (o caminho é fixo por lista) ou ainda sem dados.
  function linhasTramites(snap) {
    const est = (snap && snap.tramites && snap.tramites.porTipo) || {};
    return ['Trâmites por lista:'].concat(OC.TYPES.map(t => {
      const e = est[t.key];
      return '  ' + t.label + ' (' + t.tramites + '): ' + (e || 'sem leitura ainda');
    }));
  }
  function diagnostico(snap, perfil, status, rotasAnexo) {
    if (status && status.estado === 'visao_cliente') return ['O Onvio está aberto com um acesso de cliente: nada é lido nem guardado.'].concat(linhasPerfil(perfil)).join('\n');
    if (!snap) return ['Ainda sem leitura do Onvio.'].concat(linhasPerfil(perfil)).join('\n');
    const l = ['Versão: ' + (snap.versao || chrome.runtime.getManifest().version) + ' · leitura: ' + snap.fetchedAt + ' · via ' + (snap.via || '?'),
      'Leitura: ' + ((snap && snap.via) || '?') + ' · ao vivo a cada ' + (OC.combinarSettings(regras, {}).tempoRealSeg || 0) + ' s',
      'Regras do escritório: ' + (regras && regras.regras ? 'arquivo versão ' + (regras.versao || '?') : 'embutidas') + (regras && regras.erro ? ' (falha na última atualização)' : ''),
      'Pendências por lista:'];
    OC.TYPES.forEach(t => l.push('  ' + t.label + ': ' + (snap.porTipo && snap.porTipo[t.key] != null ? snap.porTipo[t.key] : '—')));
    const desc = snap.desconhecidos || {};
    l.push('Códigos de situação desconhecidos: ' + (Object.keys(desc).length ? Object.entries(desc).map(([k, v]) => OC.TYPE_BY_KEY[k].label + ' ' + Object.entries(v).map(([c, n]) => 'código ' + c + ' (' + n + ')').join(', ')).join(' | ') : 'nenhum'));
    l.push('Filtro por lista (Rubricas): ' + (snap.filtroAlternativo && snap.filtroAlternativo.length ? 'o Onvio recusou o filtro por exclusão e a extensão usou a lista de códigos (' + snap.filtroAlternativo.join(', ') + ')' : 'por exclusão (tudo menos Concluído e Prescrita)'));
    const t = snap.tramites || {};
    l.push('Trâmites lidos neste ciclo: ' + (t.lidos || 0) + ' · falhas: ' + (t.falhas || 0) + ' · com 1º trâmite conhecido: ' + (snap.items || []).filter(i => i.ptUteis != null).length + ' de ' + (snap.items || []).length);
    linhasTramites(snap).forEach(x => l.push(x));
    l.push('Consideradas resolvidas (vez do cliente sem retorno e sem pedido do analista): ' + ((snap.resolvidas || []).length));
    const ra = Array.isArray(rotasAnexo) ? rotasAnexo : [];
    l.push('Baixar anexos: ' + (ra.length ? ra.length + ' caminho(s) aprendido(s) do Onvio' : 'nenhum caminho aprendido ainda (baixe um anexo pelo Onvio uma vez)'));
    ra.slice(0, 6).forEach(r => l.push('  ' + r.molde + (r.campo ? ' (endereço no campo ' + r.campo + ')' : '')));
    l.push('Possível aba errada (Geral): ' + (snap.items || []).filter(i => i.abaProvavel).length);
    l.push('Com você como responsável (filtro "atribuídas a mim" do Onvio): ' + (snap.items || []).filter(i => i.mine).length + ' de ' + (snap.items || []).length + (snap.user && snap.user.nome ? ' · usuário: ' + snap.user.nome : ''));
    if (snap.erros && snap.erros.length) l.push('Erros: ' + snap.erros.join(' | '));
    return l.concat(linhasPerfil(perfil)).join('\n');
  }

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

  $('#regras-cliente').addEventListener('click', () => { $('#regrasUrl').value = URL_CLIENTE; estado('Endereço preenchido; clique em Salvar e depois em Atualizar agora.'); });
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

  /* ---------- aprender ações ---------- */
  const APRENDER_MAX_MS = 2 * 3600 * 1000;
  const ativo = a => !!(a && a.ligado && Date.now() - (a.desde || 0) < APRENDER_MAX_MS);
  const compacto = v => { const s = JSON.stringify(v); return s && s.length > 1500 ? s.slice(0, 1500) + '…' : s; };
  function textoAprendido(lista) {
    const l = ['Control Onvio · ações aprendidas · versão ' + chrome.runtime.getManifest().version + ' · ' + new Date().toLocaleString('pt-BR'), ''];
    (lista || []).forEach((r, i) => {
      l.push((i + 1) + '. ' + r.metodo + ' ' + r.caminho + ' → ' + r.status + (r.vezes > 1 ? ' (' + r.vezes + 'x)' : '') + ' · telas: ' + (r.rotas || []).join(', '));
      if (r.query && Object.keys(r.query).length) l.push('   query: ' + compacto(r.query));
      if (r.contentTypePedido) l.push('   envia: ' + r.contentTypePedido);
      if (r.corpo) l.push('   corpo: ' + compacto(r.corpo));
      if (r.resposta) l.push('   resposta: ' + compacto(r.resposta));
    });
    if (!(lista || []).length) l.push('(nada registrado ainda)');
    return l.join('\n');
  }
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
  const HUB_ORIGENS = ['https://claude.ai/*'];
  const MOTIVOS_HUB = {
    'sem-codigo': 'Cole o código de pareamento do Hub.', 'sem-permissao': 'Falta permitir o claude.ai: clique em “Conectar ao Control Hub”.',
    'sem-leitura': 'Ainda não há leitura do Onvio para enviar. Abra o Control Onvio e aguarde a primeira leitura.',
    'sem-hub': 'O Control Hub não está aberto numa aba do claude.ai. Abra o Hub; a aba pode ficar em segundo plano, mas precisa estar aberta.', 'sem-resposta': 'O Hub não respondeu a tempo.',
    'token': 'O código de pareamento não confere com o do Hub.', 'tamanho': 'O resumo passou do limite do Hub.',
    'somente-leitura': 'Sua conta só lê o Hub: peça a quem tem permissão de edição para conectar.', 'sem-config': 'O Hub ainda não criou o código de pareamento (abra “Entrada de dados”).',
    'sem-mudanca': 'Nada mudou desde o último envio.'
  };
  const msgHub = r => r.mensagem || MOTIVOS_HUB[r.motivo] || r.motivo || 'Não foi possível enviar.';
  async function mostrarHub() {
    const { hubCfg } = await chrome.storage.local.get('hubCfg');
    const c = Object.assign({ token: '', auto: true }, hubCfg || {});
    if (document.activeElement !== $('#hubCodigo')) $('#hubCodigo').value = c.token;
    $('#hubAuto').checked = !!c.auto;
    const st = await chrome.runtime.sendMessage({ cmd: 'hubStatus' }).catch(() => null);
    const q = d => (d ? new Date(d).toLocaleString('pt-BR') : '—');
    if (!st) { $('#hub-estado').textContent = ''; return; }
    const u = st.ultimo;
    $('#hub-estado').textContent = (st.permitido ? 'claude.ai permitido' : 'claude.ai ainda não permitido') + ' · ' + (st.hubAberto ? (st.hubSegundoPlano ? 'Hub aberto em segundo plano (responde mesmo assim)' : 'Hub aberto e respondendo') : 'Hub não encontrado numa aba aberta') + ' · ' +
      (u ? 'último envio ' + (u.ok ? 'aceito' : 'recusado') + ' em ' + q(u.em) + (u.ok ? ' (' + u.linhas + ' de ' + u.total + ' solicitações)' : ': ' + msgHub(u)) : 'nenhum envio ainda');
  }
  async function salvarHub() {
    const token = $('#hubCodigo').value.replace(/\s+/g, '').toUpperCase();
    const { hubCfg } = await chrome.storage.local.get('hubCfg');
    await chrome.storage.local.set({ hubCfg: Object.assign({}, hubCfg || {}, { token, auto: $('#hubAuto').checked }) });
    return token;
  }
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

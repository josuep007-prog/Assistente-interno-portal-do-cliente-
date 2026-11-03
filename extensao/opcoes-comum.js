/* Control Onvio · o que a página de opções (options.html, aberta à parte) e a aba Configurações → Avançado do app usam em comum:
 * mensagens do Control Hub, o texto do Diagnóstico e o do "aprender ações". Script comum (sem módulo): fica em window.OCOpcoes. */
(function (g) {
  'use strict';
  const OC = g.OC;
  const MOTIVOS_HUB = {
    'sem-codigo': 'Cole o código de pareamento do Hub.', 'sem-permissao': 'Falta permitir o claude.ai: clique em “Conectar”.',
    'sem-leitura': 'Ainda não há leitura do Onvio para enviar. Abra o Control Onvio e aguarde a primeira leitura.',
    'sem-hub': 'O Control Hub não está aberto numa aba do claude.ai. Abra o Hub; a aba pode ficar em segundo plano, mas precisa estar aberta.', 'sem-resposta': 'O Hub não respondeu a tempo.',
    'token': 'O código de pareamento não confere com o do Hub.', 'tamanho': 'O resumo passou do limite do Hub.',
    'somente-leitura': 'Sua conta só lê o Hub: peça a quem tem permissão de edição para conectar.', 'sem-config': 'O Hub ainda não criou o código de pareamento (abra “Entrada de dados”).',
    'sem-mudanca': 'Nada mudou desde o último envio.', 'sem-categoria': 'Marque pelo menos um conjunto para enviar.',
    'incompleto': 'O Hub não recebeu todas as partes.', 'ciclo-perdido': 'O Hub foi recarregado no meio do envio: tente de novo.',
    'partes': 'O Hub recusou as partes (versão antiga do Hub?).', 'categoria': 'O Hub não conhece esta categoria (publique a versão nova do Hub).', 'fonte-desconhecida': 'O Hub não conhece este tipo de dado (publique a versão nova do Hub).',
    'visao-cliente': 'O Onvio está com um acesso de cliente: o envio é só da visão do escritório.'
  };
  const msgHub = r => (r && (r.mensagem || MOTIVOS_HUB[r.motivo] || r.motivo)) || 'Não foi possível enviar.';
  const quando = d => (d ? new Date(d).toLocaleString('pt-BR') : '—');

  function linhasPerfil(p) {
    const rot = { escritorio: 'escritório', cliente: 'CLIENTE (o Control Onvio fica bloqueado)' };
    if (!p) return [];
    return ['Perfil da sessão: ' + (rot[p.perfil] || 'não confirmado') + ' · ' + (p.motivo || '') + ' · ' + (p.em || ''),
      'Formato da sessão (só nomes de campos): ' + ((p.formato || []).join(', ') || '—')];
  }
  // Texto do Diagnóstico: só contagens, nomes de campo e caminhos (nunca dado de cliente).
  function diagnostico(snap, perfil, status, rotasAnexo, regras) {
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
    const est = t.porTipo || {};
    l.push('Trâmites por lista:'); OC.TYPES.forEach(x => l.push('  ' + x.label + ' (' + x.tramites + '): ' + (est[x.key] || 'sem leitura ainda')));
    l.push('Consideradas resolvidas (vez do cliente sem retorno e sem pedido do analista): ' + ((snap.resolvidas || []).length));
    const ra = Array.isArray(rotasAnexo) ? rotasAnexo : [];
    l.push('Baixar anexos: ' + (ra.length ? ra.length + ' caminho(s) aprendido(s) do Onvio' : 'nenhum caminho aprendido ainda (baixe um anexo pelo Onvio uma vez)'));
    ra.slice(0, 6).forEach(r => l.push('  ' + r.molde + (r.campo ? ' (endereço no campo ' + r.campo + ')' : '')));
    l.push('Possível aba errada (Geral): ' + (snap.items || []).filter(i => i.abaProvavel).length);
    l.push('Com você como responsável (filtro "atribuídas a mim" do Onvio): ' + (snap.items || []).filter(i => i.mine).length + ' de ' + (snap.items || []).length + (snap.user && snap.user.nome ? ' · usuário: ' + snap.user.nome : ''));
    if (snap.erros && snap.erros.length) l.push('Erros: ' + snap.erros.join(' | '));
    return l.concat(linhasPerfil(perfil)).join('\n');
  }

  /* aprender ações: liga por até 2 horas e anota só o formato das chamadas */
  const APRENDER_MAX_MS = 2 * 3600 * 1000;
  const aprenderAtivo = a => !!(a && a.ligado && Date.now() - (a.desde || 0) < APRENDER_MAX_MS);
  const aprenderResta = a => (aprenderAtivo(a) ? Math.max(0, Math.round((APRENDER_MAX_MS - (Date.now() - a.desde)) / 60000)) : 0);
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
  const ROTEIRO_APRENDER = ['Abrir a visualização (ícone "i") e trocar entre Dados e Trâmites', 'Incluir um trâmite só com texto (Trâmite Rápido e tela completa)',
    'Incluir trâmite mudando a situação (ex.: Em análise, Aguardando cliente)', 'Concluir uma solicitação', 'Definir responsável (uma e várias de uma vez)', 'Alterar a expectativa de conclusão',
    'Encaminhar para outro usuário', 'Anexar um arquivo fictício ao trâmite e excluí-lo', 'Baixar os anexos', 'Imprimir', 'Copiar o link da solicitação para o cliente (Geral)', 'Excluir uma solicitação criada só para o teste'];

  // Andamento do envio completo ao Hub em linhas (tom: ok, erro, aviso, nota) para as duas telas desenharem do seu jeito.
  function linhasEnvio(hubSync) {
    if (!hubSync) return { cab: 'Nenhum envio completo ainda.', estado: 'nunca', linhas: [] };
    const ok = (hubSync.resultados || []).filter(r => r.ok), mal = (hubSync.resultados || []).filter(r => !r.ok);
    const preso = hubSync.estado === 'enviando' && hubSync.pulso && Date.now() - hubSync.pulso > 240000;        // sem sinal há 4 min: o envio morreu no meio
    const est = preso ? 'interrompido' : hubSync.estado;
    const cab = est === 'interrompido' ? 'Último envio interrompido. O envio automático continua de onde parou, sem reenviar o que o Hub já aceitou.'
      : est === 'enviando' ? 'Enviando… ' + (hubSync.etapa || '') + ' (' + hubSync.feito + '/' + hubSync.total + ')'
      : 'Último envio completo: ' + ({ ok: 'tudo aceito', parcial: 'parte aceita', erro: 'não concluído' }[est] || est) + ' em ' + quando(hubSync.terminouEm) + (hubSync.motivo ? ' · ' + (MOTIVOS_HUB[hubSync.motivo] || hubSync.motivo) : '') +
        ' · ' + ok.length + ' conjuntos enviados, ' + ok.reduce((n, r) => n + (r.linhas || 0), 0).toLocaleString('pt-BR') + ' linhas';
    const linhas = [];
    mal.forEach(r => linhas.push({ tom: 'erro', rotulo: r.rotulo, texto: MOTIVOS_HUB[r.motivo] || r.motivo }));
    ok.filter(x => x.cortado).forEach(r => linhas.push({ tom: 'aviso', rotulo: r.rotulo, texto: 'veio incompleto (cortado)' }));
    ok.filter(x => x.motivo && !x.cortado).forEach(r => linhas.push({ tom: r.nota ? 'nota' : 'aviso', rotulo: r.rotulo, texto: MOTIVOS_HUB[r.motivo] || r.motivo }));
    ok.filter(x => !x.motivo && !x.cortado).forEach(r => linhas.push({ tom: 'ok', rotulo: r.rotulo, texto: (r.linhas || 0).toLocaleString('pt-BR') + ' linhas' }));
    return { cab, estado: est, linhas, feito: hubSync.feito, total: hubSync.total };
  }

  g.OCOpcoes = { MOTIVOS_HUB, msgHub, quando, diagnostico, APRENDER_MAX_MS, aprenderAtivo, aprenderResta, textoAprendido, ROTEIRO_APRENDER, linhasEnvio, URL_REGRAS_CLIENTE: 'https://raw.githubusercontent.com/josuep007-prog/assistente-portal-regras/main/regras.json', HUB_ORIGENS: ['https://claude.ai/*'] };
})(typeof self !== 'undefined' ? self : this);

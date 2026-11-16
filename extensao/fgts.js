/* Núcleo do FGTS Digital (OCF) · Guias da folha, fase 2: só leitura (0.118.0, Josué 13/11 e 16/11/2026).
 * Mapa em mapeamento/guias-fgts-dctfweb.md (leitura de 16/11/2026, fase 2). O site autentica pelo cookie da própria página (sem
 * cabeçalho de autorização): a extensão chama a API de dentro da aba do FGTS Digital, com a sessão que o analista abriu pelo gov.br com
 * o certificado da ControlTax. Lista fechada (OCF.leituraPermitida), conferida no service worker e de novo dentro da página.
 * NUNCA: emitir guia, adicionar débito à guia, consignados, pagar ou qualquer outra escrita (a emissão é a fase 3, depois de mapeada).
 * Da resposta saem só números, competências e números de guia: nunca CPF, nome, matrícula do trabalhador nem o cookie. */
(function (g) {
  const HOST = 'https://fgtsdigital.sistema.gov.br';
  // [método, caminho] que a extensão pode chamar; a querystring é conferida por pedido
  const PERMITIDOS = [
    ['GET', /^\/cobranca\/api\/guia-parametrizada\/debitos$/, /^(debitos(Mensais|AVencer|Vencidos|NaoParcelados|SemGuia)|competenciaApuracao(Inicial|Final)|numPagina)$/],
    ['GET', /^\/cobranca\/api\/guia-parametrizada\/dados-filtro$/, null],
    ['GET', /^\/cobranca\/api\/guia\/\d{8,20}\/totalizador$/, null],
    ['GET', /^\/proxy-api\/v2\/perfil$/, /^(tipoPerfil|niPerfil)$/],           // trocar o perfil de procurador para a empresa (a tela faz o mesmo GET)
    // 0.119.0 · emissão pela Guia Rápida (mapa fgts-digital-emissao-2026-11-16.md): o resumo da competência, o "confirma" que a tela chama
    // antes de emitir, a verificação da guia existente, os PDFs (guia, detalhe e consignado) e a reimpressão da guia
    ['GET', /^\/cobranca\/api\/guia-rapida\/v2\/\d{6}(13)?$/, /^(mensal|rescisorio|processoTrabalhista|consignado)$/],
    ['GET', /^\/cobranca\/api\/guia-rapida\/confirma$/, null],
    ['GET', /^\/cobranca\/api\/guia-rapida\/verificar-debitos-guia-existente\/[^/]+$/, /^noloading$/],
    ['GET', /^\/cobranca\/api\/download\/(detalhe|consignado)-guia-assincrono-pdf\/\d{6,20}$/, /^(uuid|primeiraChamada|noloading)$/],
    ['GET', /^\/arrecadacao\/emissao\/reimprimirGuia\/\d{6,20}$/, /^isConsignado$/]
  ];
  // A ÚNICA escrita: emitir a guia MENSAL pela Guia Rápida, corpo {} e o uuid gerado na extensão (repetido nas novas tentativas)
  const ESCRITAS = [['POST', /^\/cobranca\/api\/guia-rapida\/gerar-guia\/([^/]+)$/, /^(uuid|primeiraChamada|noloading)$/]];
  // valorFiltro = {competência},{tipo},{hashDebitos},{dtPagamento},{temConsignado}: só o tipo "mensal" passa
  function valorFiltroMensal(v) {
    let t = String(v || ''); try { t = decodeURIComponent(t); } catch (e) { return false; }
    const p = t.split(','); return p.length === 5 && /^[0-9\-\/]{4,10}$/.test(p[0]) && p[1].toLowerCase() === 'mensal' && /^\d{6,20}$/.test(p[2]) && /^\d{4}-\d{2}-\d{2}$/.test(p[3]) && /^(true|false)$/.test(p[4]);
  }
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function escritaPermitida(metodo, url, corpo) {
    let u; try { u = new URL(String(url || '')); } catch (e) { return { ok: false, motivo: 'endereço inválido' }; }
    if (u.origin !== HOST || u.username || u.password) return { ok: false, motivo: 'fora do FGTS Digital' };
    const m = String(metodo || '').toUpperCase(), r = ESCRITAS.find(x => x[0] === m && x[1].test(u.pathname));
    if (!r) return { ok: false, motivo: 'escrita fora da lista do FGTS Digital (só emitir a guia mensal pela Guia Rápida)' };
    if (!valorFiltroMensal(u.pathname.match(r[1])[1])) return { ok: false, motivo: 'só a guia mensal' };
    for (const k of u.searchParams.keys()) if (!r[2].test(k)) return { ok: false, motivo: 'parâmetro não permitido: ' + k };
    if (!UUID.test(u.searchParams.get('uuid') || '') || !/^(true|false)$/.test(u.searchParams.get('primeiraChamada') || '')) return { ok: false, motivo: 'uuid ou primeiraChamada inválido' };
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo) || Object.keys(corpo).length) return { ok: false, motivo: 'o corpo é sempre {}' };
    return { ok: true };
  }
  // o arquivo assinado do relatório (detalhe ou consignado), baixado sem credenciais, como a própria tela faz
  const ARQUIVO_HOST = 'https://storagegw.estaleiro.serpro.gov.br';
  function arquivoPermitido(url) { try { const u = new URL(url); return u.origin === ARQUIVO_HOST && /^\/cobrafgtsd-[a-z-]+-pdf-p\/[\w.-]+\.pdf$/i.test(u.pathname) && !u.username; } catch (e) { return false; } }
  // o que nunca sai, mesmo que um dia alguém ponha na lista: emitir, gerar, adicionar à guia, consignados, pagar, excluir
  const PROIBIDO = /gerar-guia|emitir|emissao|confirma|consignados|batch|pagar|pagamento|parcel|excluir|delete|cancel/i;

  function leituraPermitida(metodo, url, corpo) {
    let u; try { u = new URL(String(url || '')); } catch (e) { return { ok: false, motivo: 'endereço inválido' }; }
    if (u.origin !== HOST || u.username || u.password) return { ok: false, motivo: 'fora do FGTS Digital' };
    const m = String(metodo || 'GET').toUpperCase(), r = PERMITIDOS.find(x => x[0] === m && x[1].test(u.pathname));
    if (!r) return { ok: false, motivo: PROIBIDO.test(u.pathname) ? 'escrita no FGTS Digital não é permitida' : 'chamada fora da lista do FGTS Digital' };
    if (corpo != null) return { ok: false, motivo: 'leitura sem corpo' };
    for (const k of u.searchParams.keys()) if (!r[2] || !r[2].test(k)) return { ok: false, motivo: 'parâmetro não permitido: ' + k };
    return { ok: true };
  }
  const so = d => String(d || '').replace(/\D/g, '');
  const url = (p, q) => HOST + p + (q ? '?' + new URLSearchParams(q).toString() : '');
  const competenciaApi = (comp) => String(comp || '').replace(/^(\d{4})-(\d{2})$/, '$1$2');       // '2026-10' → '202610'
  const PEDIDOS = {
    dadosFiltro: () => ({ id: 'dadosFiltro', tipo: 'nada', metodo: 'GET', url: url('/cobranca/api/guia-parametrizada/dados-filtro') }),
    perfil: (cnpj) => ({ id: 'perfil', tipo: 'perfil', metodo: 'GET', url: url('/proxy-api/v2/perfil', { tipoPerfil: '2', niPerfil: so(cnpj) }) }),
    // sem o filtro "Sem guia emitida": a competência que já tem guia volta com guiasRelacionadas (com o filtro, volta vazia)
    debitos: (comp, pagina) => ({ id: 'debitos', tipo: 'debitos', metodo: 'GET', url: url('/cobranca/api/guia-parametrizada/debitos', {
      debitosMensais: 'true', debitosAVencer: 'true', debitosVencidos: 'true', debitosNaoParcelados: 'true',
      competenciaApuracaoInicial: competenciaApi(comp), competenciaApuracaoFinal: competenciaApi(comp), numPagina: String(pagina || 1) }) }),
    rapida: (comp) => ({ id: 'rapida', tipo: 'rapida', metodo: 'GET', url: url('/cobranca/api/guia-rapida/v2/' + competenciaApi(comp), { mensal: 'true', rescisorio: 'false', processoTrabalhista: 'false', consignado: 'true' }) }),
    confirma: () => ({ id: 'confirma', tipo: 'nada', metodo: 'GET', url: url('/cobranca/api/guia-rapida/confirma') }),
    existente: (valorFiltro) => ({ id: 'existente', tipo: 'booleano', metodo: 'GET', url: HOST + '/cobranca/api/guia-rapida/verificar-debitos-guia-existente/' + encodeURIComponent(valorFiltro) + '?noloading=' }),
    gerar: (valorFiltro, uuid, primeira) => ({ id: 'gerar', tipo: 'gerar', escrita: true, metodo: 'POST', corpo: {}, url: HOST + '/cobranca/api/guia-rapida/gerar-guia/' + encodeURIComponent(valorFiltro) + '?uuid=' + uuid + '&primeiraChamada=' + (primeira ? 'true' : 'false') + '&noloading=' }),
    relatorio: (qual, numero, uuid, primeira) => ({ id: 'rel-' + qual, tipo: 'relatorio', metodo: 'GET', url: HOST + '/cobranca/api/download/' + qual + '-guia-assincrono-pdf/' + so(numero).replace(/^0+/, '') + '?uuid=' + uuid + '&primeiraChamada=' + (primeira ? 'true' : 'false') + '&noloading=' }),
    pdfGuia: (linkPdf) => { const u = new URL(String(linkPdf || ''), HOST); return { id: 'pdfGuia', tipo: 'pdf', metodo: 'GET', url: u.origin + u.pathname + (u.searchParams.get('isConsignado') === 'true' ? '?isConsignado=true' : '') }; },
    arquivo: (u) => ({ id: 'arquivo', tipo: 'pdf', externo: true, metodo: 'GET', url: String(u || '') }),
    totalizador: (numero) => ({ id: 'totalizador', tipo: 'totalizador', metodo: 'GET', url: url('/cobranca/api/guia/' + so(numero).replace(/^0+/, '') + '/totalizador') })
  };
  const n = v => { const x = Number(v); return isFinite(x) ? x : 0; };
  // só números, competência, estabelecimento (CNPJ da empresa) e o número da guia: nada do trabalhador
  function limpar(tipo, d) {
    if (tipo === 'debitos') {
      const l = d && Array.isArray(d.debitos) ? d.debitos : [];
      return { qtdeTotal: n(d && d.qtdeTotalDebitos), itens: l.map(x => ({ competencia: so(x && x.competenciaApuracao), principal: n(x && x.vlPrincipal), total: n(x && x.vlTotal),
        encargos: Math.round((n(x && x.vlMulta) + n(x && x.vlJuros) + n(x && x.vlAtualizacaoMonetaria)) * 100) / 100,
        estabelecimento: so(x && x.estabalecimentoRemuneracao), guias: (Array.isArray(x && x.guiasRelacionadas) ? x.guiasRelacionadas : []).map(gr => String(gr && gr.numeroFormatado || '')).filter(Boolean) })) };
    }
    if (tipo === 'rapida') {
      const ags = (d && Array.isArray(d.agrupamentos) ? d.agrupamentos : []).map(a => { const t = (a && a.totalizador) || {}, ge = a && a.guiaExistente;
        return { valorFiltro: String(a && a.valorFiltro || ''), tipo: String(a && a.tipo || ''), pagamentoAte: String(a && a.pagamentoAte || ''), mensal: n(t.vlMensal), encargos: n(t.vlEncargos), total: n(t.vlTotal),
          totalGuia: n(a && a.totalGuia), totalConsignado: n(a && a.totalConsignado), contemConsignado: !!(a && a.contemConsignado), temGuiasRelacionadas: !!(a && a.temGuiasRelacionadas),
          emProcessamento: String(a && a.guiaEmProcessamento || ''), guiaExistente: ge && ge.numero ? { id: String(ge.id || ''), numero: String(ge.numero), linkPdf: String(ge.linkPdf || '') } : null,
          alertas: (Array.isArray(a && a.alertas) ? a.alertas : []).map(x => ({ codigo: String(x && x.codigo || ''), titulo: String(x && x.titulo || ''), descricao: String(x && x.descricao || '').slice(0, 400) })),
          confirmacoes: (Array.isArray(a && a.confirmacoes) ? a.confirmacoes : []).map(x => String(x).slice(0, 400)) }; });
      return { status: String(d && d.resumo && d.resumo.status || ''), agrupamentos: ags };
    }
    if (tipo === 'gerar') { const g = d && d.dadosGuia; return { gerou: !!(d && d.gerouGuia), guia: g ? { id: String(g.id || ''), numero: String(g.numero || ''), linkPdf: String(g.linkPdf || '') } : null }; }
    if (tipo === 'relatorio') return { gerou: !!(d && d.gerouDetalheGuia), url: d && arquivoPermitido(d.url) ? String(d.url) : '', nomeArquivo: String(d && d.nomeArquivo || '') };
    if (tipo === 'perfil') return d && typeof d === 'object' ? { valido: d.valido !== false, mensagem: String(d.mensagem || '').slice(0, 200) } : { valido: true, mensagem: '' };
    if (tipo === 'booleano') return { valor: d === true || d === 'true' };
    if (tipo === 'totalizador') return d && typeof d === 'object' ? { competencia: String(d.competencia || ''), numero: String(d.numero || ''), mensal: n(d.vlMensal), encargos: n(d.vlEncargos), total: n(d.vlTotal), situacao: String(d.tpSituacao || ''), temConsignado: !!d.gerouPdfConsignado } : null;
    return null;
  }
  // dentro da aba do FGTS Digital (mundo da página): uma leitura por vez, com o cookie da própria página. Sem sessão, a API devolve a
  // página de login (HTML) em vez de JSON: isso vira semSessao. O cookie e o token nunca são lidos nem devolvidos.
  async function lerNaPagina(pedidos, o) {
    const pausa = (o && o.pausa) || 300, resultados = [], MAX = 15 * 1024 * 1024;
    const b64 = (buf) => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
    // o token anti-falsificação do Angular (cookie XSRF-TOKEN) só é lido aqui, na hora de emitir, e nunca sai da página
    const xsrf = () => { try { const c = document.cookie.split(/;\s*/).find(x => x.indexOf('XSRF-TOKEN=') === 0); return c ? decodeURIComponent(c.slice(11)) : ''; } catch (e) { return ''; } };
    for (const p of pedidos || []) {
      const v = p.escrita ? escritaPermitida(p.metodo, p.url, p.corpo) : p.externo ? (arquivoPermitido(p.url) ? { ok: true } : { ok: false, motivo: 'arquivo fora do serpro' }) : leituraPermitida(p.metodo, p.url, p.corpo == null ? null : p.corpo);
      if (!v.ok) { resultados.push({ id: p.id, recusado: v.motivo }); continue; }
      if (p.externo) {      // o PDF assinado do relatório: sem credenciais, como a tela faz
        try { const r = await fetch(p.url, { credentials: 'omit' }); const buf = await r.arrayBuffer(); resultados.push({ id: p.id, status: r.status, dados: r.ok && buf.byteLength <= MAX ? { b64: b64(buf), tamanho: buf.byteLength } : null }); }
        catch (e) { resultados.push({ id: p.id, status: 0, erro: 'rede' }); }
        continue;
      }
      const r = await new Promise(ok => {
        const x = new XMLHttpRequest(); x.open(p.metodo, p.url);
        if (p.tipo === 'pdf') x.responseType = 'arraybuffer';
        x.setRequestHeader('Accept', p.tipo === 'pdf' ? 'application/pdf, */*' : 'application/json, text/plain, */*');
        if (p.escrita) { x.setRequestHeader('Content-Type', 'application/json'); const t = xsrf(); if (t) x.setRequestHeader('X-XSRF-TOKEN', t); }
        x.onload = () => ok({ status: x.status, tipo: String(x.getResponseHeader('content-type') || ''), corpo: x.response, fim: x.responseURL || '' });
        x.onerror = () => ok({ status: 0, erro: 'rede' }); x.send(p.escrita ? JSON.stringify(p.corpo) : null);
      });
      if (/\/portal\/authfgts|\/portal\/login/i.test(r.fim) || r.status === 401 || (r.status === 200 && /text\/html/i.test(r.tipo))) return { ok: false, semSessao: true, resultados };
      if (p.tipo === 'pdf') { const ok = r.status === 200 && /pdf/i.test(r.tipo) && r.corpo && r.corpo.byteLength <= MAX; resultados.push({ id: p.id, status: r.status, dados: ok ? { b64: b64(r.corpo), tamanho: r.corpo.byteLength } : null, erro: ok ? '' : (r.erro || 'não veio um PDF') }); continue; }
      let dados = null; try { dados = r.corpo ? JSON.parse(r.corpo) : null; } catch (e) {}
      const negocio = dados && dados.mensagem && dados.mensagem.codigo ? { codigo: String(dados.mensagem.codigo), titulo: String(dados.mensagem.titulo || ''), descricao: String(dados.mensagem.descricao || '').slice(0, 300) } : null;
      resultados.push({ id: p.id, status: r.status, dados: r.status >= 200 && r.status < 300 ? limpar(p.tipo, dados) : null, negocio, erro: r.erro || '' });
      await new Promise(ok => setTimeout(ok, pausa));
    }
    return { ok: true, resultados };
  }
  // o perfil aberto na aba é desta empresa? (só a comparação volta, nunca o cookie)
  function perfilAtualE(cnpj) {
    try { const c = document.cookie.split(/;\s*/).find(x => x.indexOf('fgtsd_ni_perfil=') === 0); return !!c && so(decodeURIComponent(c.split('=')[1])) === so(cnpj); } catch (e) { return false; }
  }
  // dígitos verificadores do CNPJ: a matriz é a raiz + 0001 (o FGTS Digital recusa o perfil de filial de empresa privada)
  function cnpjMatriz(cnpj) {
    const r = so(cnpj).slice(0, 8); if (r.length !== 8) return '';
    const base = r + '0001', dv = (s) => { const pesos = s.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const t = s.split('').reduce((a, c, i) => a + Number(c) * pesos[i], 0) % 11; return t < 2 ? 0 : 11 - t; };
    const d1 = dv(base), d2 = dv(base + d1); return base + d1 + d2;
  }
  // soma dos débitos mensais da competência (o principal é o que bate com o "Valor do FGTS" do extrato; juros e multa à parte).
  // Para uma filial, só os débitos do estabelecimento dela; para a matriz, todos (a guia da matriz traz todos os estabelecimentos).
  function somarDebitos(itens, cnpjEmpresa) {
    const c = so(cnpjEmpresa), filial = c.length === 14 && c.slice(8, 12) !== '0001';
    const l = (itens || []).filter(x => !filial || !x.estabelecimento || x.estabelecimento === c);
    const soma = k => Math.round(l.reduce((a, x) => a + n(x[k]), 0) * 100) / 100;
    const comGuia = l.filter(x => x.guias.length), guias = [...new Set(comGuia.flatMap(x => x.guias))];
    return { quantos: l.length, principal: soma('principal'), encargos: soma('encargos'), total: soma('total'), semGuia: l.length - comGuia.length, guias, filial };
  }
  // bate = diferença de até R$ 0,05 (Josué, 16/11/2026)
  const TOLERANCIA = 0.05;
  function comparar(esperado, achado) {
    if (typeof esperado !== 'number' || typeof achado !== 'number') return { bate: null, diferenca: null };
    const d = Math.round((achado - esperado) * 100) / 100;
    return { bate: Math.abs(d) <= TOLERANCIA + 1e-9, diferenca: d };
  }
  g.OCF = { HOST, ARQUIVO_HOST, escritaPermitida, arquivoPermitido, valorFiltroMensal, leituraPermitida, PEDIDOS, limpar, lerNaPagina, perfilAtualE, cnpjMatriz, somarDebitos, comparar, competenciaApi, TOLERANCIA };
})(typeof self !== 'undefined' ? self : globalThis);

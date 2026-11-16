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
    ['GET', /^\/proxy-api\/v2\/perfil$/, /^(tipoPerfil|niPerfil)$/]            // trocar o perfil de procurador para a empresa (a tela faz o mesmo GET)
  ];
  // o que nunca sai, mesmo que um dia alguém ponha na lista: emitir, gerar, adicionar à guia, consignados, pagar, excluir
  const PROIBIDO = /gerar-guia|emitir|emissao|confirma|consignados|batch|pagar|pagamento|parcel|excluir|delete|cancel/i;

  function leituraPermitida(metodo, url, corpo) {
    let u; try { u = new URL(String(url || '')); } catch (e) { return { ok: false, motivo: 'endereço inválido' }; }
    if (u.origin !== HOST || u.username || u.password) return { ok: false, motivo: 'fora do FGTS Digital' };
    if (PROIBIDO.test(u.pathname)) return { ok: false, motivo: 'escrita no FGTS Digital não é permitida' };
    const m = String(metodo || 'GET').toUpperCase(), r = PERMITIDOS.find(x => x[0] === m && x[1].test(u.pathname));
    if (!r) return { ok: false, motivo: 'chamada fora da lista do FGTS Digital' };
    if (corpo != null) return { ok: false, motivo: 'leitura sem corpo' };
    for (const k of u.searchParams.keys()) if (!r[2] || !r[2].test(k)) return { ok: false, motivo: 'parâmetro não permitido: ' + k };
    return { ok: true };
  }
  const so = d => String(d || '').replace(/\D/g, '');
  const url = (p, q) => HOST + p + (q ? '?' + new URLSearchParams(q).toString() : '');
  const competenciaApi = (comp) => String(comp || '').replace(/^(\d{4})-(\d{2})$/, '$1$2');       // '2026-10' → '202610'
  const PEDIDOS = {
    dadosFiltro: () => ({ id: 'dadosFiltro', tipo: 'nada', metodo: 'GET', url: url('/cobranca/api/guia-parametrizada/dados-filtro') }),
    perfil: (cnpj) => ({ id: 'perfil', tipo: 'nada', metodo: 'GET', url: url('/proxy-api/v2/perfil', { tipoPerfil: '2', niPerfil: so(cnpj) }) }),
    // sem o filtro "Sem guia emitida": a competência que já tem guia volta com guiasRelacionadas (com o filtro, volta vazia)
    debitos: (comp, pagina) => ({ id: 'debitos', tipo: 'debitos', metodo: 'GET', url: url('/cobranca/api/guia-parametrizada/debitos', {
      debitosMensais: 'true', debitosAVencer: 'true', debitosVencidos: 'true', debitosNaoParcelados: 'true',
      competenciaApuracaoInicial: competenciaApi(comp), competenciaApuracaoFinal: competenciaApi(comp), numPagina: String(pagina || 1) }) }),
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
    if (tipo === 'totalizador') return d && typeof d === 'object' ? { competencia: String(d.competencia || ''), numero: String(d.numero || ''), mensal: n(d.vlMensal), encargos: n(d.vlEncargos), total: n(d.vlTotal), situacao: String(d.tpSituacao || ''), temConsignado: !!d.gerouPdfConsignado } : null;
    return null;
  }
  // dentro da aba do FGTS Digital (mundo da página): uma leitura por vez, com o cookie da própria página. Sem sessão, a API devolve a
  // página de login (HTML) em vez de JSON: isso vira semSessao. O cookie e o token nunca são lidos nem devolvidos.
  async function lerNaPagina(pedidos, o) {
    const pausa = (o && o.pausa) || 300, resultados = [];
    for (const p of pedidos || []) {
      const v = leituraPermitida(p.metodo, p.url, p.corpo == null ? null : p.corpo);
      if (!v.ok) { resultados.push({ id: p.id, recusado: v.motivo }); continue; }
      const r = await new Promise(ok => {
        const x = new XMLHttpRequest(); x.open(p.metodo, p.url); x.setRequestHeader('Accept', 'application/json, text/plain, */*');
        x.onload = () => ok({ status: x.status, tipo: String(x.getResponseHeader('content-type') || ''), texto: x.responseText, fim: x.responseURL || '' });
        x.onerror = () => ok({ status: 0, erro: 'rede' }); x.send();
      });
      if (/\/portal\/authfgts|\/portal\/login/i.test(r.fim) || (r.status === 200 && /text\/html/i.test(r.tipo))) return { ok: false, semSessao: true, resultados };
      let dados = null; try { dados = r.texto ? JSON.parse(r.texto) : null; } catch (e) {}
      const negocio = dados && dados.mensagem && dados.mensagem.codigo ? { codigo: String(dados.mensagem.codigo), titulo: String(dados.mensagem.titulo || '') } : null;
      resultados.push({ id: p.id, status: r.status, dados: r.status === 200 ? limpar(p.tipo, dados) : null, negocio, erro: r.erro || '' });
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
  g.OCF = { HOST, leituraPermitida, PEDIDOS, limpar, lerNaPagina, perfilAtualE, cnpjMatriz, somarDebitos, comparar, competenciaApi, TOLERANCIA };
})(typeof self !== 'undefined' ? self : globalThis);

/* Mediador do MTE para o módulo Convenções (0.95.0, autorizado pelo Josué em 11/11/2026: leitura, só dados públicos de sindicato
 * e convenção). Núcleo sem chrome.*: roda no service worker, injetado na aba do Mediador (mundo da página) e nos testes.
 * Mapa: mapeamento/mediador-2026-11-11.md (duas rodadas).
 *
 * Como lê, sem contornar nada do site:
 *  - a BUSCA é feita pela própria página, como a pessoa faria: preenche CNPJ, tipo e vigência e clica em Pesquisar (o reCAPTCHA
 *    invisível do site trabalha ali, sem desafio). A extensão nunca monta nem envia a busca;
 *  - logo depois, um GET de "Exportar" (exportarConsultaAvancada, sem campos: o site usa a busca que acabou de fazer) traz todos os
 *    instrumentos de uma vez, numa tabela (HTML em iso-8859-1), sem paginar;
 *  - o texto de um instrumento: GET resumoVisualizarSalvarMsWordDoc?NrSolicitacao=MR{n}_{n} (HTML em windows-1252), com as
 *    cláusulas marcadas pelo próprio Mediador (label.textogrupo, textosubgrupo, tituloClausula, descricaoClausula);
 *  - o anexo em PDF, quando existe: GET www3.mte.gov.br/sistemas/mediador/imagemAnexo/....pdf.
 * Nada além disso: leituraPermitida recusa qualquer outro endereço ou método, aqui e de novo dentro da página. */
(function (g) {
  'use strict';
  const HOST = 'mediador.trabalho.gov.br', BASE = 'https://' + HOST + '/sistemas/mediador/';
  const URL_CONSULTA = BASE + 'ConsultarInstColetivo';
  const URL_EXPORTAR = BASE + 'ConsultarInstColetivo/exportarConsultaAvancada';
  const TIPOS = { convencao: 'Convenção Coletiva', termoAditivoConvecao: 'Termo Aditivo de Convenção Coletiva' };
  const MAX_PDF = 15 * 1024 * 1024, MAX_CLAUSULA = 8000;

  const soDig = (v) => String(v == null ? '' : v).replace(/\D/g, '');
  const cnpjValido = (v) => soDig(v).length === 14;
  // Nº da Solicitação: MR066621/2020 (na lista) ou MR066621_2020 (no endereço)
  const SOL = /^MR\d{4,8}[/_]\d{4}$/;
  const solParam = (s) => SOL.test(String(s || '').trim()) ? String(s).trim().replace('/', '_') : '';
  const urlTexto = (s) => { const p = solParam(s); return p ? BASE + 'Resumo/resumoVisualizarSalvarMsWordDoc?NrSolicitacao=' + p : ''; };

  // A lista fechada: só GET e só estes três endereços
  function leituraPermitida(metodo, url) {
    if (String(metodo || 'GET').toUpperCase() !== 'GET') return false;
    let u; try { u = new URL(String(url)); } catch (e) { return false; }
    if (u.username || u.password || u.hash) return false;
    if (u.hostname === HOST && u.protocol === 'https:') {
      if (u.pathname === '/sistemas/mediador/ConsultarInstColetivo/exportarConsultaAvancada') return !u.search;
      if (u.pathname === '/sistemas/mediador/Resumo/resumoVisualizarSalvarMsWordDoc') {
        const ks = [...u.searchParams.keys()];
        return ks.length === 1 && ks[0] === 'NrSolicitacao' && /^MR\d{4,8}_\d{4}$/.test(u.searchParams.get('NrSolicitacao'));
      }
      return false;
    }
    if (u.hostname === 'www3.mte.gov.br' && /^https?:$/.test(u.protocol)) return /^\/sistemas\/mediador\/imagemAnexo\/[A-Za-z0-9_.\-]+\.pdf$/i.test(u.pathname) && !u.search;
    return false;
  }

  // ---- HTML sem DOM (o service worker e o Node não têm DOMParser) ----
  const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ordm: 'º', ordf: 'ª', deg: '°', ndash: '–', mdash: '—', laquo: '«', raquo: '»', sect: '§', middot: '·', hellip: '…', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', bull: '•', euro: '€', copy: '©', reg: '®' };
  const LETRAS = { a: 'aàáâãä', e: 'eèéêë', i: 'iìíîï', o: 'oòóôõö', u: 'uùúûü', c: 'cç', n: 'nñ', A: 'AÀÁÂÃÄ', E: 'EÈÉÊË', I: 'IÌÍÎÏ', O: 'OÒÓÔÕÖ', U: 'UÙÚÛÜ', C: 'CÇ', N: 'NÑ' };
  const ACENTO = { grave: 1, acute: 2, circ: 3, tilde: 4, uml: 5, cedil: 1 };
  function entidade(nome) {
    if (nome[0] === '#') { const n = nome[1] === 'x' || nome[1] === 'X' ? parseInt(nome.slice(2), 16) : parseInt(nome.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
    if (ENT[nome]) return ENT[nome];
    const m = nome.match(/^([A-Za-z])(grave|acute|circ|tilde|uml|cedil)$/);
    if (m && LETRAS[m[1]]) { const ch = LETRAS[m[1]][m[2] === 'cedil' ? 1 : ACENTO[m[2]]]; if (ch) return ch; }
    return '&' + nome + ';';
  }
  const decodificar = (s) => String(s || '').replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, n) => entidade(n));
  // texto de um pedaço de HTML: quebras em <br>, </p>, </div>, </tr>; sem tags, sem scripts e estilos
  function textoDe(html, comQuebras) {
    let s = String(html || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ');
    s = comQuebras ? s.replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n') : s;
    s = decodificar(s.replace(/<[^>]*>/g, ' '));
    return comQuebras
      ? s.split('\n').map(l => l.replace(/[ \t ]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
      : s.replace(/\s+/g, ' ').trim();
  }
  // tabelas: [[células da linha]]; tabelas aninhadas não aparecem no Mediador (exportação e títulos)
  function tabelasDe(html) {
    const out = [];
    const tabs = String(html || '').match(/<table[\s\S]*?<\/table>/gi) || [];
    for (const t of tabs) {
      const linhas = (t.match(/<tr[\s\S]*?<\/tr>/gi) || []).map(tr => (tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || []).map(c => textoDe(c)));
      if (linhas.length) out.push(linhas);
    }
    return out;
  }
  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const ymd = (s) => { const m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? m[3] + '-' + m[2] + '-' + m[1] : ''; };
  function periodo(s) { const ds = String(s || '').match(/\d{2}\/\d{2}\/\d{4}/g) || []; return { ini: ymd(ds[0]), fim: ymd(ds[1]) }; }

  // ---- a exportação: a tabela com os instrumentos (cabeçalho com "Registro" e "Solicitação") ----
  const COLS_EXP = [['registro', /registro/], ['processo', /processo/], ['solicitacao', /solicitac/], ['tipo', /^tipo/], ['vigencia', /vigencia/],
    ['cnpjTrab', /cnpj.*trabalhador/], ['trabalhador', /^trabalhador/], ['cnpjEmp', /cnpj.*empregador/], ['empregador', /^empregador/]];
  function lerExportacao(html) {
    const tabs = tabelasDe(html);
    for (const t of tabs) {
      const iCab = t.findIndex(l => l.some(c => /registro/.test(semAcento(c))) && l.some(c => /solicitac/.test(semAcento(c))));
      if (iCab < 0) continue;
      const cab = t[iCab].map(semAcento), idx = {};
      COLS_EXP.forEach(([k, re]) => { const i = cab.findIndex(c => re.test(c)); if (i >= 0) idx[k] = i; });
      if (idx.registro == null || idx.solicitacao == null) continue;
      const itens = t.slice(iCab + 1).map(l => {
        const v = (k) => idx[k] != null ? String(l[idx[k]] || '').trim() : '';
        const sol = v('solicitacao').replace(/\s/g, '');
        if (!SOL.test(sol)) return null;
        const p = periodo(v('vigencia'));
        return { registro: v('registro').replace(/\s/g, ''), processo: v('processo'), solicitacao: sol, tipo: v('tipo'), vigIni: p.ini, vigFim: p.fim,
          cnpjTrab: v('cnpjTrab'), trabalhador: v('trabalhador'), cnpjEmp: v('cnpjEmp'), empregador: v('empregador') };
      }).filter(Boolean);
      return { ok: true, itens };
    }
    return { ok: false, motivo: 'formato', erro: 'a exportação do Mediador não veio no formato conhecido (tabela com Nº do Registro e Nº da Solicitação)' };
  }

  // ---- o texto do instrumento: as cláusulas marcadas pelo Mediador ----
  function lerTexto(html) {
    const h = String(html || '');
    const titulo = (h.match(/<td[^>]*class="?[^">]*\btitulo\b[^>]*>([\s\S]*?)<\/td>/i) || [])[1];
    const re = /<label[^>]*class="?(textogrupo|textosubgrupo|tituloClausula|descricaoClausula)"?[^>]*>([\s\S]*?)<\/label>/gi;
    const clausulas = []; let grupo = '', subgrupo = '', atual = null, m;
    while ((m = re.exec(h))) {
      const tipo = m[1], txt = textoDe(m[2], tipo === 'descricaoClausula');
      if (tipo === 'textogrupo') { grupo = txt; subgrupo = ''; }
      else if (tipo === 'textosubgrupo') subgrupo = txt;
      else if (tipo === 'tituloClausula') { atual = { grupo, subgrupo, titulo: txt, texto: '' }; clausulas.push(atual); }
      else if (atual && !atual.texto) atual.texto = txt.slice(0, MAX_CLAUSULA);
      else clausulas.push({ grupo, subgrupo, titulo: '', texto: txt.slice(0, MAX_CLAUSULA) });
    }
    const anexos = [...new Set((h.match(/https?:\/\/www3\.mte\.gov\.br\/sistemas\/mediador\/imagemAnexo\/[A-Za-z0-9_.\-]+\.pdf/gi) || []))].filter(u => leituraPermitida('GET', u));
    const corpo = textoDe(h, true);
    if (!clausulas.length) return { ok: !!corpo, motivo: corpo ? '' : 'formato', semMarcacao: true, titulo: textoDe(titulo || ''), clausulas: corpo ? [{ grupo: '', subgrupo: '', titulo: '', texto: corpo.slice(0, MAX_CLAUSULA * 10) }] : [], anexos };
    return { ok: true, titulo: textoDe(titulo || ''), clausulas, anexos, dataBase: dataBaseDe(clausulas) };
  }
  const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  // A data-base: a cláusula de "vigência e data-base" diz o mês (ex.: "data-base da categoria em 01º de maio")
  function dataBaseDe(clausulas) {
    for (const c of clausulas) {
      const t = semAcento(c.titulo + ' ' + c.texto);
      if (!/data[\s-]*base/.test(t)) continue;
      const depois = t.slice(t.search(/data[\s-]*base/));
      const i = MESES.findIndex(m => new RegExp('\\b' + m + '\\b').test(depois.slice(0, 200)));
      if (i >= 0) return ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][i];
    }
    return '';
  }

  // ---- quais textos guardar no Hub: por sindicato, a convenção vigente (ou a mais recente) e os aditivos dela ----
  const ehAditivo = (i) => /aditivo/i.test(semAcento(i.tipo)) || i.busca === 'termoAditivoConvecao';
  function escolherTextos(itens, hoje) {
    const dia = hoje || new Date().toISOString().slice(0, 10), porCnpj = new Map(), out = new Set();
    itens.forEach(i => { const k = soDig(i.cnpj); if (!porCnpj.has(k)) porCnpj.set(k, []); porCnpj.get(k).push(i); });
    for (const lista of porCnpj.values()) {
      const ccts = lista.filter(i => !ehAditivo(i) && i.vigIni);
      if (!ccts.length) continue;
      const cobre = ccts.filter(i => i.vigIni <= dia && (!i.vigFim || dia <= i.vigFim));
      const cct = (cobre.length ? cobre : ccts).sort((a, b) => b.vigIni.localeCompare(a.vigIni))[0];
      out.add(cct.solicitacao);
      lista.filter(i => ehAditivo(i) && i.vigIni && (!cct.vigFim || i.vigIni <= cct.vigFim) && (!i.vigFim || !cct.vigIni || i.vigFim >= cct.vigIni)).forEach(i => out.add(i.solicitacao));
    }
    return [...out];
  }

  // ---- 0.96.0 (Josué, 12/11/2026: "a extensão deve buscar a convenção específica e não sindicatos isolados"): uma convenção = o par
  // sindicato laboral × sindicato patronal. A busca é pelo CNPJ laboral e ficam só os instrumentos em que o patronal também é parte. ----
  const cnpjsDe = (v) => (String(v || '').replace(/[.\/-]/g, '').match(/\d{14}/g) || []);
  function doPar(itens, laboral, patronal) {
    const L = soDig(laboral), P = soDig(patronal);
    return (itens || []).filter(i => { const t = cnpjsDe(i.cnpjTrab), e = cnpjsDe(i.cnpjEmp), todos = t.concat(e);
      return (t.includes(L) && e.includes(P)) || (todos.includes(L) && todos.includes(P)); });
  }
  // a convenção mais recente do par (pela vigência) e os aditivos dela
  function escolherDaConvencao(itens) {
    const ccts = (itens || []).filter(i => !ehAditivo(i) && i.vigIni).sort((a, b) => b.vigIni.localeCompare(a.vigIni));
    const cct = ccts[0];
    if (!cct) return { cct: null, aditivos: [] };
    const aditivos = itens.filter(i => ehAditivo(i) && i.vigIni && i.vigIni >= cct.vigIni && (!cct.vigFim || i.vigIni <= cct.vigFim)).sort((a, b) => a.vigIni.localeCompare(b.vigIni));
    return { cct, aditivos };
  }

  // ---- o que vai ao Hub (fonte "mediador") ----
  const COLS_INSTRUMENTOS = ['CNPJ consultado', 'Busca', 'Nº do Registro', 'Nº do Processo', 'Nº da Solicitação', 'Tipo', 'Vigência início', 'Vigência fim', 'CNPJ Trabalhador', 'Trabalhador', 'CNPJ Empregador', 'Empregador'];
  const COLS_CLAUSULAS = ['Nº da Solicitação', 'Nº do Registro', 'Ordem', 'Grupo', 'Subgrupo', 'Título', 'Texto', 'Data-base', 'Anexos'];
  const cel = (v, max) => String(v == null ? '' : v).replace(/\t/g, ' ').replace(/\r?\n/g, ' ¶ ').replace(/ {2,}/g, ' ').trim().slice(0, max || 300);
  const linhasInstrumentos = (itens) => itens.map(i => [soDig(i.cnpj), i.busca, i.registro, i.processo, i.solicitacao, i.tipo, i.vigIni, i.vigFim, soDig(i.cnpjTrab), i.trabalhador, soDig(i.cnpjEmp), i.empregador].map(v => cel(v, 300)).join('\t'));
  const linhasClausulas = (textos) => textos.flatMap(t => t.clausulas.map((c, n) => [t.solicitacao, t.registro || '', n + 1, c.grupo, c.subgrupo, c.titulo, c.texto, n === 0 ? (t.dataBase || '') : '', n === 0 ? (t.anexos || []).join(' ') : ''].map((v, k) => cel(v, k === 6 ? MAX_CLAUSULA : 600)).join('\t')));

  // ---- a rodada semanal (0.95.1): uma vez por semana e, depois de uma busca com erro, só 24 h depois (sem abrir uma aba a cada envio) ----
  const SEMANA_MS = 7 * 24 * 3600e3, PAUSA_ERRO_MS = 24 * 3600e3;
  function semanalDevida(cfg, envio, agora) {
    const t = agora || Date.now(), c = cfg || {};
    if (!Array.isArray(c.cnpjs) || !c.cnpjs.length) return false;
    if (c.ultimaBusca && t - Date.parse(c.ultimaBusca) < SEMANA_MS) return false;
    const e = envio || null;
    if (e && e.estado === 'buscando' && t - (Number(e.pulso) || 0) < 10 * 60e3) return false;
    if (e && ['erro', 'cancelado'].includes(e.estado) && e.iniciouEm && t - Date.parse(e.iniciouEm) < PAUSA_ERRO_MS) return false;
    return true;
  }

  // ---- dentro da aba do Mediador (mundo da página) ----
  const dormir = (ms) => new Promise(r => setTimeout(r, ms));
  async function lerBytes(url) {
    if (!leituraPermitida('GET', url)) return { ok: false, motivo: 'recusado' };
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) return { ok: false, motivo: 'http-' + r.status, status: r.status };
    return { ok: true, buf: await r.arrayBuffer(), tipo: r.headers.get('content-type') || '' };
  }
  const decodif = (buf, tipo, padrao) => { const cs = (String(tipo).match(/charset=([\w-]+)/i) || [, padrao])[1]; try { return new TextDecoder(cs).decode(buf); } catch (e) { return new TextDecoder(padrao).decode(buf); } };
  // Busca pela própria página: preenche os campos e clica em Pesquisar; espera a resposta da busca (o XHR do site) e exporta
  async function buscarNaPagina(op) {
    const cnpj = soDig(op && op.cnpj), tipo = op && TIPOS[op.tipo] ? op.tipo : 'convencao', pausa = op && op.pausaMs != null ? op.pausaMs : 1500;
    if (!cnpjValido(cnpj)) return { ok: false, motivo: 'cnpj' };
    const $ = (id) => document.getElementById(id);
    const chk = $('chkNRCNPJ'), txt = $('txtNRCNPJ'), cboT = $('cboTPRequerimento'), cboV = $('cboSTVigencia');
    if (!txt || !cboT || !cboV) return { ok: false, motivo: 'formato', erro: 'a tela de consulta do Mediador mudou (campos de CNPJ, tipo ou vigência não encontrados)' };
    const botao = [...document.querySelectorAll('button, input[type=button], input[type=submit], a')].find(b => /^\s*pesquisar\s*$/i.test(b.value || b.textContent || ''));
    if (!botao) return { ok: false, motivo: 'formato', erro: 'o botão Pesquisar do Mediador não foi encontrado' };
    const muda = (el) => ['input', 'change'].forEach(t => el.dispatchEvent(new Event(t, { bubbles: true })));
    if (chk && !chk.checked) chk.click();
    txt.value = cnpj; muda(txt);
    cboT.value = tipo; muda(cboT);
    cboV.value = '2'; muda(cboV);      // Todos
    // espera a próxima resposta da busca do próprio site
    const resposta = new Promise((res) => {
      const XS = XMLHttpRequest.prototype.send, XO = XMLHttpRequest.prototype.open;
      let fim = null;
      const desfaz = () => { XMLHttpRequest.prototype.send = XS; XMLHttpRequest.prototype.open = XO; clearTimeout(fim); };
      XMLHttpRequest.prototype.open = function (m, url) { this.__ocm = /getConsultaAvancada/.test(String(url)); return XO.apply(this, arguments); };
      XMLHttpRequest.prototype.send = function () { if (this.__ocm) this.addEventListener('loadend', () => { desfaz(); res({ status: this.status }); }); return XS.apply(this, arguments); };
      fim = setTimeout(() => { desfaz(); res({ status: 0, tempo: true }); }, 60000);
    });
    botao.click();
    const r = await resposta;
    if (r.tempo) return { ok: false, motivo: 'sem-resposta', erro: 'a busca do Mediador não respondeu em 60 s' };
    if (r.status !== 200) return { ok: false, motivo: 'http-' + r.status, erro: 'a busca do Mediador respondeu ' + r.status };
    await dormir(pausa);
    const b = await lerBytes(URL_EXPORTAR);
    if (!b.ok) return { ok: false, motivo: b.motivo, erro: 'a exportação do Mediador falhou (' + b.motivo + ')' };
    const ex = lerExportacao(decodif(b.buf, b.tipo, 'iso-8859-1'));
    if (!ex.ok) return ex;
    return { ok: true, itens: ex.itens.map(i => Object.assign(i, { cnpj, busca: tipo })) };
  }
  async function textoNaPagina(sol) {
    const url = urlTexto(sol);
    if (!url) return { ok: false, motivo: 'solicitacao' };
    const b = await lerBytes(url);
    if (!b.ok) return { ok: false, motivo: b.motivo };
    const t = lerTexto(decodif(b.buf, b.tipo, 'windows-1252'));
    return Object.assign(t, { solicitacao: String(sol).replace('_', '/') });
  }
  async function anexoNaPagina(url) {
    const b = await lerBytes(url);
    if (!b.ok) return { ok: false, motivo: b.motivo };
    if (b.buf.byteLength > MAX_PDF) return { ok: false, motivo: 'grande', erro: 'o PDF tem mais de 15 MB' };
    const u8 = new Uint8Array(b.buf); let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return { ok: true, base64: btoa(s), tipo: 'application/pdf', tamanho: u8.length };
  }

  const OCM = { HOST, URL_CONSULTA, URL_EXPORTAR, TIPOS, SOL, solParam, urlTexto, leituraPermitida, textoDe, tabelasDe, lerExportacao, lerTexto, dataBaseDe,
    escolherTextos, ehAditivo, semanalDevida, doPar, escolherDaConvencao, COLS_INSTRUMENTOS, COLS_CLAUSULAS, linhasInstrumentos, linhasClausulas, buscarNaPagina, textoNaPagina, anexoNaPagina, soDig, cnpjValido };
  g.OCM = OCM;
  if (typeof module !== 'undefined' && module.exports) module.exports = OCM;
})(typeof self !== 'undefined' ? self : globalThis);

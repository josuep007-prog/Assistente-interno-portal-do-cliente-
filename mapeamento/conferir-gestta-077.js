/* Conferência do Gestta para a 0.77.0 (Tarefas por empresa, linha do tempo da tarefa, quadro de obrigações).
 * Rodar no console de uma aba do Gestta já logada (app.gestta.com.br), pelo Claude in Chrome ou à mão.
 * SÓ LEITURA: GET, a busca de tarefas (POST autorizado em 04/11/2026) e o relatório CUSTOMER_TASK (POST autorizado em 05/11/2026).
 * O resultado traz só NOMES de campos, TIPOS, contagens, tempos e os valores de campos de situação (type, status, reason…),
 * nunca nome de cliente, CNPJ, texto de comentário, e-mail, telefone nem o token. Cole o resultado inteiro na conversa. */
(async () => {
  const API = 'https://api.gestta.com.br';
  let tok = localStorage.getItem('ngStorage-jwt');
  try { tok = JSON.parse(tok); } catch (e) {}
  if (!tok) return console.log('Sem sessão do Gestta: faça login e rode de novo.');
  const ENUM = new Set(['type', 'subtype', 'status', 'reason', 'role', 'date_type', 'frequency', 'sphere', 'automation_type']);
  const enums = {};
  const forma = (v, k, prof) => {
    if (v == null) return 'vazio';
    if (Array.isArray(v)) return v.length ? [forma(v[0], k, prof + 1), 'itens: ' + v.length] : ['lista vazia'];
    if (typeof v === 'object') {
      if (prof > 4) return 'objeto';
      const o = {};
      for (const c of Object.keys(v).sort()) o[c] = forma(v[c], c, prof + 1);
      return o;
    }
    if (ENUM.has(k) && typeof v === 'string' && v.length < 60) { (enums[k] ||= new Set()).add(v); return 'texto (situação)'; }
    if (typeof v === 'string') return /^\d{4}-\d\d-\d\dT/.test(v) ? 'data' : /^[0-9a-f]{24}$/i.test(v) ? 'id' : 'texto';
    return typeof v === 'number' ? 'número' : typeof v === 'boolean' ? 'booleano' : typeof v;
  };
  // junta as chaves de vários registros (um só pode não ter todos os campos)
  const formaDe = (lista, k) => { const o = {}; (lista || []).slice(0, 40).forEach(x => { const f = forma(x, k, 0); if (f && typeof f === 'object' && !Array.isArray(f)) Object.assign(o, f); }); return o; };
  const ir = async (metodo, caminho, corpo) => {
    const t0 = performance.now();
    const r = await fetch(API + caminho, { method: metodo, headers: Object.assign({ Authorization: tok, Accept: 'application/json' }, corpo ? { 'Content-Type': 'application/json' } : {}), body: corpo ? JSON.stringify(corpo) : undefined });
    const texto = await r.text();
    return { status: r.status, ms: Math.round(performance.now() - t0), tipo: r.headers.get('content-type'), total: r.headers.get('x-total-records'), texto };
  };
  const hoje = new Date(), ano = hoje.getFullYear(), mes = hoje.getMonth() + 1;
  const ini = new Date(Date.UTC(ano, mes - 1, 1, 3)).toISOString(), fim = new Date(Date.UTC(ano, mes, 1, 2, 59, 59)).toISOString();
  const saida = { quando: new Date().toISOString().slice(0, 16), mes: mes + '/' + ano };

  // 1) busca de tarefas: quais campos vêm na lista (setor, responsável, data legal, template?)
  const b = await ir('POST', '/core/customer/task/search', { page: 1, limit: 50, type: ['RECURRENT', 'SERVICE_ORDER', 'ACCOUNTING'], status: ['OPEN', 'IMPEDIMENT', 'DONE'], date_type: 'DUE_DATE', start_date: ini, end_date: fim });
  let busca = {}; try { busca = JSON.parse(b.texto); } catch (e) {}
  const docs = busca.docs || [];
  saida.busca = { status: b.status, ms: b.ms, invólucro: Object.keys(busca).sort(), campos: formaDe(docs, 'tarefa') };
  saida.busca.nomesDistintosNaPagina = new Set(docs.map(d => d.name)).size;

  // 2) relatório do mês (CUSTOMER_TASK): como a resposta chega (formato, tamanho, tempo) e as chaves do 1º registro
  const rel = await ir('POST', '/core/customer/task/report', { type: 'CUSTOMER_TASK', filter: '', dates: { startDate: ini, endDate: fim } });
  const tx = rel.texto, ini1 = tx.trimStart().slice(0, 1);
  let registros = [], formato = 'desconhecido';
  try { const j = JSON.parse(tx); if (Array.isArray(j)) { formato = 'lista JSON'; registros = j; } else { formato = 'objeto JSON com ' + Object.keys(j).join(', '); registros = j.docs || j.data || j.rows || j.records || j.items || []; } }
  catch (e) { const ls = tx.split('\n').filter(Boolean); try { registros = ls.map(l => JSON.parse(l)); formato = 'uma linha JSON por registro (NDJSON)'; } catch (e2) { formato = 'não é JSON; começa com "' + ini1 + '"'; } }
  saida.relatorio = { status: rel.status, segundos: Math.round(rel.ms / 100) / 10, contentType: rel.tipo, xTotalRecords: rel.total, tamanhoKB: Math.round(tx.length / 1024), formato, registros: registros.length, campos: Object.keys(registros[0] || {}).sort() };

  // 3) detalhe e histórico de UMA tarefa (a primeira da busca, de preferência concluída e com etapas)
  const alvo = docs.find(d => d.status === 'DONE' && d.total_step) || docs.find(d => d.total_step) || docs[0];
  if (alvo) {
    const d = await ir('GET', '/core/customer/task/' + alvo._id);
    let det = {}; try { det = JSON.parse(d.texto); } catch (e) {}
    saida.detalhe = { status: d.status, ms: d.ms, campos: forma(det, 'detalhe', 0) };
    const h = await ir('GET', '/core/customer/task/' + alvo._id + '/history?page=1');
    let hist = {}; try { hist = JSON.parse(h.texto); } catch (e) {}
    const hd = hist.docs || (Array.isArray(hist) ? hist : []);
    const porTipo = {};
    hd.forEach(x => { const k = x.type || '?'; (porTipo[k] ||= []).push(x); });
    saida.historico = { status: h.status, ms: h.ms, invólucro: Array.isArray(hist) ? 'lista' : Object.keys(hist).sort(), eventos: hd.length,
      porTipo: Object.fromEntries(Object.entries(porTipo).map(([k, l]) => [k, { n: l.length, campos: formaDe(l, 'evento') }])) };
    // email_log traz destinatários: só a forma, nunca o conteúdo (o forma() já não mostra valores)
  }
  // 4) cartela do cliente da tarefa (quem atende cada setor) e documentos da tarefa
  if (alvo && alvo.customer && alvo.customer._id) {
    const c = await ir('GET', '/admin/customer/' + alvo.customer._id + '/responsible');
    let cart = []; try { cart = JSON.parse(c.texto); } catch (e) {}
    saida.cartela = { status: c.status, ms: c.ms, setores: Array.isArray(cart) ? cart.length : '?', campos: formaDe(Array.isArray(cart) ? cart : [], 'cartela') };
  }
  saida.situacoesVistas = Object.fromEntries(Object.entries(enums).map(([k, s]) => [k, [...s].sort()]));
  const txt = JSON.stringify(saida, null, 1);
  console.log(txt);
  try { await navigator.clipboard.writeText(txt); console.log('(copiado para a área de transferência)'); } catch (e) {}
  return 'pronto: copie o texto acima e cole na conversa';
})();

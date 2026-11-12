/* Tarefas do Gestta · concluir com as etapas (0.103.0, Josué 12/11/2026: "para concluir uma tarefa, seja individualmente ou em lote,
   … caso a tarefa tenha checkbox, ela deve marcá-los antes de concluir").
   Antes do DONE, cada etapa ainda não feita é marcada pelo mesmo envio já aprovado (PUT …/step/{etapa}/done), uma por vez, e só
   então a tarefa é concluída. Se uma etapa falhar, a tarefa não é concluída.
   0.105.0 (mapeado em 12/11/2026): depois das etapas, cada item (documento) sem anexo é desconsiderado, um por vez
   (PUT /es/task/{id}/document/{doc}/file/disconsider, corpo vazio), como o ⊘ "Desconsiderar" da tarefa. Falhou um, não conclui. */

// etapas que ainda faltam marcar (com o id, que é o que o Gestta aceita)
export const etapasAbertas = d => (Array.isArray(d && d.customer_task_steps) ? d.customer_task_steps : []).filter(p => p && p._id && !p.done).sort((a, b) => (a.order || 0) - (b.order || 0));
// itens (documentos) da tarefa sem anexo e ainda não desconsiderados
export const itensSemAnexo = d => (Array.isArray(d && d.company_documents) ? d.company_documents : []).filter(x => x && !x.disconsidered && !x.temArquivo);

// enviar: a função que fala com o service worker; detalhe: o detalhe já lido (senão lê agora)
export async function concluirComEtapas(enviar, id, detalhe) {
  let d = detalhe;
  if (!d) {
    const r = await enviar({ cmd: 'gesttaTarefa', id });
    if (!r || !r.ok) return { ok: false, erro: (r && r.erro) || 'não consegui ler a tarefa antes de concluir' };
    d = r.tarefa || {};
  }
  const passos = etapasAbertas(d);
  let marcadas = 0;
  for (const p of passos) {
    const r = await enviar({ cmd: 'gesttaAcao', acao: 'etapa', id, etapa: p._id, feita: true });
    if (!r || !r.ok) return { ok: false, status: r && r.status, marcadas, erro: 'etapa “' + (p.name || 'Etapa') + '”: ' + ((r && r.erro) || 'o Gestta não respondeu') + ' A tarefa não foi concluída.' };
    marcadas++;
  }
  let desconsiderados = 0;
  for (const x of itensSemAnexo(d).filter(x => x._id)) {
    const r = await enviar({ cmd: 'gesttaAcao', acao: 'desconsiderar', id, documento: x._id });
    if (!r || !r.ok) return { ok: false, status: r && r.status, marcadas, desconsiderados, erro: 'item “' + (x.name || 'Documento') + '”: ' + ((r && r.erro) || 'o Gestta não respondeu') + ' A tarefa não foi concluída.' };
    desconsiderados++;
  }
  const r = await enviar({ cmd: 'gesttaAcao', acao: 'concluir', id });
  if (!r || !r.ok) return { ok: false, status: r && r.status, marcadas, desconsiderados, erro: (r && r.erro) || 'o Gestta não respondeu' };
  return { ok: true, marcadas, desconsiderados, tarefa: r.tarefa || null };
}

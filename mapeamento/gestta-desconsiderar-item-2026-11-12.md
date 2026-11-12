# Mapeamento Gestta: desconsiderar item (documento) de uma tarefa

Data do mapeamento: 12/11/2026, aba do Gestta já logada (app.gestta.com.br).
Objetivo: a extensão Control Onvio deve, ao concluir uma tarefa (individual ou em lote), desconsiderar os itens sem anexo de cada uma (pedido do Josué em 12/11/2026).
Roteiro usado: `mapear-acoes-gestta v2` (só escuta o que a tela chama; não grava valores, nomes, CNPJ, token nem cookies).

## 1. Tarefa de teste usada

- Empresa: 9999 - EMPRESA EXEMPLO SIMPLES NACIONAL LTDA (única empresa tocada).
- As duas tarefas que já existiam ("TESTE CONTROL ONVIO", metas 12/11 e 26/11) não serviam: a de 12/11 não tinha documentos e a de 26/11 tinha só 1.
- Criei uma tarefa nova para o teste: **RESCISAO DOCUMENTOS**, nº 0000054975, departamento Pessoal, competência novembro/2026, meta 16/11/2026, responsável Josué Porfirio, **Notificar cliente: Não**.
- Ela tem 5 documentos sem anexo (0 / 5 documentos): Chave FGTS, Etiqueta AVISO INDENIZADO, Extrato de Conta do Fundo de Garantia - FGTS, Requerimento de Seguro-Desemprego - SD, FICHA DE REGISTRO DE EMPREGADOS. O checklist tem 13 etapas (0 / 13). "Atividades sem anexo" ficou 0 / 0 itens.
- Atenção ao criar tarefas de teste: ao ligar "Customizar" no formulário de Nova Tarefa, "Notificar cliente" vem **ligado** por padrão. Desliguei antes de salvar. A lista de clientes do formulário é de múltipla escolha e também traz a "10156 - EMPRESA EXEMPLO...", que é outra empresa.
- A tarefa continua aberta (não concluída) na EMPRESA EXEMPLO e pode ser excluída.

## 2. O que a tela faz

| # | Ação | Resultado |
|---|------|-----------|
| 1 | Abrir tarefa | A tela lê o detalhe (ver "Chamadas" abaixo). |
| 2 | Desconsiderar um item | Em "Atividades com anexo", cada documento sem anexo tem o ícone **⊘**, com a dica **"Desconsiderar"**, ao lado do ícone verde de enviar arquivo. Abre a confirmação **"Desconsiderar documento"**: "Realmente deseja desconsiderar o documento *X* na tarefa *Y*?", com os botões **Cancelar** e **Sim, continuar**. Depois aparecem o aviso verde "Documento *X* desconsiderado para a tarefa *Y*" e, na linha do tempo, "Documento *X* desconsiderado por *usuário*". Na linha do documento, o ⊘ e o ícone de envio somem e fica só o ícone de desfazer. O contador "0 / 5 documentos" **não mudou**. |
| 3 | Reconsiderar o item | O ícone de desfazer **↺** tem a dica **"Reconsiderar"**. Abre a confirmação **"Reconsiderar documento"**: "Realmente deseja reconsiderar o documento *X* para a tarefa *Y*?", com **Cancelar** e **Sim, continuar**. A linha volta ao normal (⊘ e envio) e a linha do tempo registra "Documento *X* reconsiderado () por *usuário*" (os parênteses vêm vazios). |
| 4 | Desconsiderar vários | **Não existe** na tela. A lista de documentos não tem caixas de seleção. O menu "Selecionar" da lista de tarefas só oferece "Transferir responsabilidade" e "Alterar status" (ações em lote de tarefas, não de documentos). A extensão terá de clicar item por item. |
| 5 | Reconsiderar vários | **Não existe**, pelo mesmo motivo. Pulado. |

## 3. Respostas do PASSO 3 (só olhando, sem concluir)

- **Concluir fica bloqueado com item sem anexo não desconsiderado? E com etapa (checkbox) não marcada?** Não verificado. Só aparece ao tentar concluir, e a regra era não concluir. O seletor de status da tarefa (hoje "Aberta") não foi aberto. Precisa de um teste dedicado.
- **Desconsiderar muda algo para o cliente (aviso, e-mail, portal)?** Não vi aviso nem e-mail. A tarefa de teste tinha "Notificar cliente: Não", então isso não vale para tarefas que notificam. O portal e as caixas de e-mail não foram conferidos.
- **Item "pede validação" pode ser desconsiderado?** Não verificado. Nenhum dos 5 documentos mostrava essa marca, e clicar no nome do documento não abriu nada.

## 4. Chamadas da API (resumo)

Servidor: `api.gestta.com.br`. Todas via XMLHttpRequest, com cabeçalhos `accept` e `authorization` (e `content-type` nas escritas).

**Desconsiderar** (uma chamada por documento):

```
PUT /es/task/{id da tarefa}/document/{id do documento}/file/disconsider
corpo: {} (vazio)
resposta: 200, text/plain, vazia
```

**Reconsiderar** (uma chamada por documento):

```
PUT /es/task/{id da tarefa}/document/{id do documento}/file/reconsider
corpo: {} (vazio)
resposta: 200, text/plain, vazia
```

**Leituras que a tela refaz depois de cada ação** (todas GET):

- `/core/customer/task/{id}`
- `/core/customer/task/{id}/history` (parâmetros: `page`, `types`)
- `/core/customer/task/{id}/collaborator`
- `/admin/customer/{id}/accountable` (parâmetro: `company_department`)

Abrir a tarefa dispara estas mesmas quatro leituras.

**Ruído sem relação com o teste:** um POST do próprio site para `www.google-analytics.com/g/collect`, e contadores de notificação e de arquivos pendentes (`/nf/notification/count`, `/es/file/count-pending`, `/es/file/count-pending/dominio`, `/es/file/count-pending/onvio`, `/core/company/release`).

Observação para a extensão: a resposta das escritas é vazia, então o sucesso se confirma pelo status 200 (ou relendo `/core/customer/task/{id}`). O id do documento vem dos dados da tarefa (`/core/customer/task/{id}`), e a forma exata desse retorno não foi anotada neste mapeamento.

## 5. Resultado bruto do `gtMapa.resultado()`

```json
{
 "roteiro": "mapear-acoes-gestta v2",
 "pagina": "/#/sidebar/task/overview/dashboard/{id}?customer={id}&type=SERVICE_ORDER&type=RECURRENT&start_date=2026-11-01T03:00:00.000Z&end_date=2026-12-01T02:59:59.999Z&status=OPEN&status=DONE&status=IMPEDIMENT&status=DISCONSIDERED&date_type=DUE_DATE&overdue=0&fine=0&on_time=0&collaborator=0&no_owner=0&email_not_sent=0&document_request_sent=0&without_external_user=0&os_workflow=1&onvio_documents_error=0",
 "quando": "2026-11-12T20:43",
 "anotacoes": [
  {"marca": "abrir tarefa", "quando": "20:40:56"},
  {"host": "api.gestta.com.br", "caminho": "/core/customer/task/{id}", "parametros": [], "via": "xhr", "metodo": "GET", "cabecalhos": ["accept", "authorization"], "acao": "abrir tarefa", "quando": "20:40:56"},
  {"host": "api.gestta.com.br", "caminho": "/core/customer/task/{id}/history", "parametros": ["page", "types"], "via": "xhr", "metodo": "GET", "cabecalhos": ["accept", "authorization"], "acao": "abrir tarefa", "quando": "20:40:56"},
  {"host": "api.gestta.com.br", "caminho": "/core/customer/task/{id}/collaborator", "parametros": [], "via": "xhr", "metodo": "GET", "cabecalhos": ["accept", "authorization"], "acao": "abrir tarefa", "quando": "20:40:56"},
  {"host": "api.gestta.com.br", "caminho": "/core/customer/task/{id}", "parametros": [], "via": "xhr", "metodo": "GET", "cabecalhos": ["accept", "authorization"], "acao": "abrir tarefa", "quando": "20:40:59"},
  {"host": "api.gestta.com.br", "caminho": "/core/customer/task/{id}/history", "parametros": ["page", "types"], "via": "xhr", "metodo": "GET", "cabecalhos": ["accept", "authorization"], "acao": "abrir tarefa", "quando": "20:40:59"},
  {"host": "api.gestta.com.br", "caminho": "/core/customer/task/{id}/collaborator", "parametros": [], "via": "xhr", "metodo": "GET", "cabecalhos": ["accept", "authorization"], "acao": "abrir tarefa", "quando": "20:40:59"},
  {"host": "www.google-analytics.com", "caminho": "/g/collect", "parametros": ["_eu", "_p", "_s", "cid", "dl", "dma", "dp", "dt", "frm", "gcd", "gtm", "ir", "ngs", "npa", "pscdl", "rcb", "sct", "seg", "sid", "sr", "tag_exp", "tfd", "tid", "uaa", "uab", "uafvl", "uam", "uamb", "uap", "uapv", "uaw", "ul", "v"], "via": "fetch", "metodo": "POST", "cabecalhos": [], "envio": "texto (1346 caracteres)", "status": 0, "resposta": "vazia", "acao": "abrir tarefa", "quando": "20:41:02"},
  {"host": "api.gestta.com.br", "caminho": "/admin/customer/{id}/accountable", "parametros": ["company_department"], "via": "xhr", "metodo": "GET", "cabecalhos": ["accept", "authorization"], "acao": "abrir tarefa", "quando": "20:41:02"},
  {"marca": "desconsiderar um item", "quando": "20:41:21"},
  {"host": "api.gestta.com.br", "caminho": "/core/customer/task/{id}", "parametros": [], "via": "xhr", "metodo": "GET", "cabecalhos": ["accept", "authorization"], "acao": "desconsiderar um item", "quando": "20:41:28"},
  {"host": "api.gestta.com.br", "caminho": "/es/task/{id}/document/{id}/file/disconsider", "parametros": [], "via": "xhr", "metodo": "PUT", "cabecalhos": ["accept", "authorization", "content-type"], "envio": {}, "status": 200, "resposta": "text/plain; charset=utf-8, 0 KB", "acao": "desconsiderar um item", "quando": "20:41:28"},
  {"host": "api.gestta.com.br", "caminho": "/core/customer/task/{id}/collaborator", "parametros": [], "via": "xhr", "metodo": "GET", "cabecalhos": ["accept", "authorization"], "acao": "desconsiderar um item", "quando": "20:41:29"},
  {"host": "api.gestta.com.br", "caminho": "/core/customer/task/{id}/history", "parametros": ["page", "types"], "via": "xhr", "metodo": "GET", "cabecalhos": ["accept", "authorization"], "acao": "desconsiderar um item", "quando": "20:41:29"},
  {"host": "api.gestta.com.br", "caminho": "/admin/customer/{id}/accountable", "parametros": ["company_department"], "via": "xhr", "metodo": "GET", "cabecalhos": ["accept", "authorization"], "acao": "desconsiderar um item", "quando": "20:41:29"},
  {"marca": "reconsiderar o item", "quando": "20:41:42"},
  {"host": "api.gestta.com.br", "caminho": "/core/customer/task/{id}", "parametros": [], "via": "xhr", "metodo": "GET", "cabecalhos": ["accept", "authorization"], "acao": "reconsiderar o item", "quando": "20:41:54"},
  {"host": "api.gestta.com.br", "caminho": "/es/task/{id}/document/{id}/file/reconsider", "parametros": [], "via": "xhr", "metodo": "PUT", "cabecalhos": ["accept", "authorization", "content-type"], "envio": {}, "status": 200, "resposta": "text/plain; charset=utf-8, 0 KB", "acao": "reconsiderar o item", "quando": "20:41:54"},
  {"host": "api.gestta.com.br", "caminho": "/core/customer/task/{id}/collaborator", "parametros": [], "via": "xhr", "metodo": "GET", "cabecalhos": ["accept", "authorization"], "acao": "reconsiderar o item", "quando": "20:41:58"},
  {"host": "api.gestta.com.br", "caminho": "/core/customer/task/{id}/history", "parametros": ["page", "types"], "via": "xhr", "metodo": "GET", "cabecalhos": ["accept", "authorization"], "acao": "reconsiderar o item", "quando": "20:41:58"},
  {"host": "api.gestta.com.br", "caminho": "/admin/customer/{id}/accountable", "parametros": ["company_department"], "via": "xhr", "metodo": "GET", "cabecalhos": ["accept", "authorization"], "acao": "reconsiderar o item", "quando": "20:41:59"},
  {"marca": "desconsiderar varios", "quando": "20:42:19"},
  {"host": "api.gestta.com.br", "caminho": "/nf/notification/count", "parametros": [], "via": "xhr", "metodo": "GET", "cabecalhos": ["accept", "authorization"], "acao": "desconsiderar varios", "quando": "20:42:22"},
  {"host": "api.gestta.com.br", "caminho": "/es/file/count-pending", "parametros": [], "via": "fetch", "metodo": "GET", "cabecalhos": ["accept", "authorization"], "acao": "desconsiderar varios", "quando": "20:42:23"},
  {"host": "api.gestta.com.br", "caminho": "/es/file/count-pending/dominio", "parametros": [], "via": "fetch", "metodo": "GET", "cabecalhos": ["accept", "authorization"], "acao": "desconsiderar varios", "quando": "20:42:23"},
  {"host": "api.gestta.com.br", "caminho": "/es/file/count-pending/onvio", "parametros": [], "via": "fetch", "metodo": "GET", "cabecalhos": ["accept", "authorization"], "acao": "desconsiderar varios", "quando": "20:42:23"},
  {"host": "api.gestta.com.br", "caminho": "/core/company/release", "parametros": [], "via": "fetch", "metodo": "GET", "cabecalhos": ["accept", "authorization"], "acao": "desconsiderar varios", "quando": "20:42:23"},
  {"host": "api.gestta.com.br", "caminho": "/nf/notification/count", "parametros": [], "via": "fetch", "metodo": "GET", "cabecalhos": ["accept", "authorization"], "acao": "desconsiderar varios", "quando": "20:42:36"},
  {"host": "api.gestta.com.br", "caminho": "/es/file/count-pending", "parametros": [], "via": "fetch", "metodo": "GET", "cabecalhos": ["accept", "authorization"], "acao": "desconsiderar varios", "quando": "20:42:36"},
  {"host": "api.gestta.com.br", "caminho": "/es/file/count-pending/dominio", "parametros": [], "via": "fetch", "metodo": "GET", "cabecalhos": ["accept", "authorization"], "acao": "desconsiderar varios", "quando": "20:42:36"},
  {"host": "api.gestta.com.br", "caminho": "/es/file/count-pending/onvio", "parametros": [], "via": "fetch", "metodo": "GET", "cabecalhos": ["accept", "authorization"], "acao": "desconsiderar varios", "quando": "20:42:36"},
  {"host": "api.gestta.com.br", "caminho": "/core/company/release", "parametros": [], "via": "fetch", "metodo": "GET", "cabecalhos": ["accept", "authorization"], "acao": "desconsiderar varios", "quando": "20:42:36"}
 ]
}
```

Nota sobre o JSON: a marca "desconsiderar varios" foi feita no passo 4, mas a ação não existe na tela. As chamadas depois dela são só leituras de contadores de notificação, sem relação com desconsiderar. A marca "reconsiderar vários" não foi usada.

## 6. Pendências para a próxima rodada

1. Descobrir se o botão Concluir bloqueia com documento sem anexo não desconsiderado e/ou com etapa do checklist não marcada (precisa tentar concluir numa tarefa de teste).
2. Conferir se desconsiderar muda algo para o cliente em uma tarefa com "Notificar cliente" ligado (e-mail e portal).
3. Testar um documento que "pede validação", se existir um template com essa opção.
4. Anotar a forma da resposta de `/core/customer/task/{id}` (campos dos documentos, incluindo o id e o estado de desconsiderado) para a extensão saber quais itens estão sem anexo e quais já foram desconsiderados.

# Mapeamento de trâmite — Onvio Portal do Cliente (visão do escritório)

Base das chamadas: `https://onvio.com.br/api/br-payroll-sr/`. GUID → `{id}`.

## Solicitações de teste usadas
Todas na EMPRESA EXEMPLO SIMPLES NACIONAL LTDA, criadas pelo Josué.
- **Cadastro empregado:** 1634. Percurso 2 → 3 (com anexo) → 4 → 7 (encaminhar) → 6. Estado final: Concluído (6).
- **Cadastro contribuinte:** 1636. Percurso 2 → 3 → 4 → 6. Estado final: Concluído (6).
- **Cadastro estagiário:** 1635. Percurso 2 → 3 → 4 → 7 (encaminhar) → 6. Estado final: Concluído (6).
- **Lançamento de rubricas:** 1761. Percurso 1 → 2 → 5 → 4 → 2 → 9 → 8. Estado final: Concluído (8).
- Nenhuma solicitação foi excluída. Nenhuma solicitação de cliente real foi tocada. Todas terminam Concluídas porque a tela não permite voltar à situação inicial.
- Em Cadastro, o primeiro envio foi tentado com anexo e travou (a página recarregou sozinha). O GET confirmou que nada foi criado, e refiz.

## Cadastro empregado

### Códigos de situação do trâmite
| Código | Situação |
|---|---|
| 2 | Enviado para o escritório |
| 3 | Aguardando o cliente |
| 4 | Respondido pelo cliente |
| 5 | Cadastro efetuado |
| 6 | Concluído |
| 7 | Encaminhado para outro usuário |

### Situações oferecidas ao incluir trâmite, por situação atual
| Situação atual | Opções oferecidas (empregado) |
|---|---|
| 2 Enviado | Aguardando o cliente, Concluído |
| 3 Aguardando o cliente | Respondido pelo Cliente |
| 4 Respondido pelo cliente | Aguardando o cliente, Concluído |
| 5 Cadastro efetuado | Aguardando o cliente, Concluído (leitura de solicitações já existentes) |
| 6 Concluído | Trâmite Rápido desabilitado; a tela não oferece |
| 7 Encaminhado | Aguardando o cliente, Concluído |
- "Cadastro efetuado" (5) nunca foi oferecido por nenhum trâmite do escritório. As 48 transições 2>5 do histórico indicam que vem de outro processo, provavelmente da integração com o Domínio.

### Chamada que inclui o trâmite
- `POST /api/br-payroll-sr/v1/employees-registrations/{id}/topics`
- Content-Type da requisição: `application/json`.
- Corpo: `description` (string), `status` (number).
- Resposta: HTTP 201, corpo vazio.
- Header `location`: `/v1/employees-registrations/{id}/topics/{id}`.
- Leitura do histórico: `GET v1/employees-registrations/{id}/topics?expand=all&itemsPerPage=1000&orderBy=created+asc&pageIndex=0` (campo `items`).
- Campos do tópico: `type`, `created`, `apiVersion`, `id`, `companyId`, `status` (number), `attachmentsExpanded`, `createdByContactExpanded`, `description` (ausente sem texto), `employeeRegistrationTopicNumber`.
- O tópico de encaminhamento traz ainda `forwardedToEmployeeExpanded` e `sequentialGroup`.

### Efeito na situação e de quem é a vez
- A solicitação (`GET v1/employees-registrations/{id}?expand=all`) tem `genericStatus` e `clientStatus`. Não existe campo `firmStatus` (só o nome do filtro).
- `genericStatus` e `clientStatus` são o status do último trâmite (2 → 3 → 4 → 6, os dois iguais).
- Exceção: ao encaminhar, `genericStatus` vai para 7 e `clientStatus` continua o que era (4). O encaminhamento mexe só no lado do escritório.
- Vez do cliente: 3 Aguardando o cliente. Vez do escritório: 2 e 4. 7 mantém o `clientStatus` anterior. Isto é inferido pelos nomes e pelo comportamento, a API não traz um campo de "vez de quem".

### Exigências de "Cadastro efetuado" e "Concluído"
- "Cadastro efetuado": a tela não oferece para o escritório. Não foi testado.
- "Concluído": com a situação selecionada e o texto vazio, o botão INCLUIR TRÂMITE já estava habilitado (testado só com Concluído). O texto não foi exigido pela tela nesse caso.
- Sem selecionar situação, o botão fica desabilitado mesmo com texto.
- Concluído é terminal: o ícone de Trâmite Rápido fica desabilitado.

### Anexo no trâmite (sequência completa)
1. `POST …/employees-registrations/{id}/topics` → 201, location do tópico.
2. `POST …/employees-registrations/{id}/topics/{id}/attachments` → 201.
   - Multipart (`FormData`), campo `file[]` (arquivo).
   - Sem Content-Type definido pela página (o navegador define o multipart).
   - Corpo da resposta vazio; location `…/topics/{id}/attachments/{id}`.
- O arquivo só sobe no clique em INCLUIR TRÂMITE.
- Campos do anexo (`attachmentsExpanded[]`): `apiVersion`, `id`, `companyId`, `name`, `staticFilePath`.

### Responsável, encaminhar e expectativa
- **Responsável automático:** ao incluir o primeiro trâmite, `staffResponsibleExpanded` (`apiVersion`, `id`, `contactId`, `name`) é preenchido com quem incluiu. Antes disso o campo não existe.
- **Definir responsável:** habilitado só sem responsável (e deixa de estar assim depois do primeiro trâmite). A chamada do diálogo (Funcionário obrigatório; SALVAR/CANCELAR) não foi capturada nem salva. A troca com responsável existente: a tela não oferece.
- **Encaminhar** (MAIS → "Encaminhado para outro usuário"): diálogo com Funcionário (combobox pesquisável, 14 opções, inclui o próprio usuário; a lista é virtualizada, então é preciso digitar para filtrar) e Comentário.
  - Chamada: o mesmo `POST …/employees-registrations/{id}/topics` (201). Corpo: `status` (number), `description` (string), `forwardedToEmployeeExpanded` ({`id`: string}).
  - Efeito: `genericStatus` 7, `clientStatus` mantido.
  - Foi feito para o próprio usuário, sem notificar colega.
  - Em 3 (Aguardando o cliente) a API recusou: HTTP 400, `Content-Type` application/json, corpo `error` com `code` 400, `message` e `errors[]` (`locationField`, `message`, `reason`). `reason` = `EmployeeRegistrationInvalidStatus`. O item de menu estava habilitado mesmo assim, e nada foi criado. Testado no estagiário, com e sem comentário; no empregado, a partir do 4, funcionou.
- **Expectativa de conclusão:** a tela não oferece.

## Cadastro contribuinte (diferenças)
- Opções oferecidas: 2 → Aguardando o cliente, Concluído. 3 → Respondido pelo Cliente. 4 → Aguardando o cliente, Concluído. 6 → ícone desabilitado.
- A chamada de trâmite é a mesma de Cadastro: `POST …/employees-registrations/{id}/topics` com o id do próprio contribuinte (não existe `…/taxpayers-registrations/{id}/topics`, retorna 404).
- Detalhe: `GET v1/taxpayers-registrations/{id}?expand=all` (`genericStatus`, `clientStatus`).
- Encaminhar e anexo não foram testados no contribuinte.

## Cadastro estagiário (diferenças)
- A chamada de trâmite é a mesma: `POST …/employees-registrations/{id}/topics` com o id do estagiário (`interns-registrations/{id}/topics` retorna 404).
- Opções oferecidas: 2 → Aguardando o cliente, Concluído. 3 → Respondido pelo Cliente. 4 e 7 → Aguardando o cliente, Concluído. "Cadastro efetuado" nunca é oferecido, embora o histórico tenha 2>5 em 64 de 84 e 5>6 em 67.
- Detalhe: `GET v1/interns-registrations/{id}?expand=all`.
- Encaminhar: 400 em 3 (`EmployeeRegistrationInvalidStatus`), 201 em 4 (`genericStatus` 7, `clientStatus` 4).

## Lançamento de rubricas

### Códigos de situação
| Código | Situação |
|---|---|
| 1 | Sem análise |
| 2 | Em análise |
| 3 | Importação realizada |
| 4 | Respondido |
| 5 | Aguardando resposta |
| 6 | Aguardando correção |
| 8 | Concluído |
| 9 | Encaminhado para outro usuário |
| 10 | Prescrita |

### Situações oferecidas, por situação atual
| Situação atual | Opções oferecidas |
|---|---|
| 1 Sem análise | Em análise, Aguardando resposta, Aguardando correção, Concluído |
| 2 Em análise | Em análise, Aguardando resposta, Aguardando correção, Concluído |
| 4 Respondido | Em análise, Aguardando resposta, Aguardando correção, Concluído |
| 5 Aguardando resposta | Respondido |
| 6 Aguardando correção | Respondido (solicitações já existentes) |
| 9 Encaminhado | Em análise, Aguardando resposta, Aguardando correção, Respondido, Concluído |
| 8 Concluído | Aguardando correção |
| 10 Prescrita | Trâmite Rápido desabilitado; a tela não oferece |

### Chamada, efeito e anexo
- `POST /api/br-payroll-sr/v1/payroll-entries/{id}/topics` — corpo `description` (string), `status` (number); 201, corpo vazio, location `/v1/payroll-entries/{id}/topics/{id}`.
- Anexo: `POST …/payroll-entries/{id}/topics/{id}/attachments` — multipart `file[]`; 201.
- Leitura: `GET v1/payroll-entries/{id}/topics?expand=all&itemsPerPage=1000&orderBy=created+asc&pageIndex=0`; solicitação em `GET v2/payroll-entries/{id}?expand=all`.
- Só existe `genericStatus` (sem `clientStatus` nem `firmStatus`). Campo do tópico: `payrollEntryTopicNumber`.
- Efeito: `genericStatus` = status do último trâmite, sem exceção. O encaminhar também move para 9.
- Responsável: automático no primeiro trâmite, com `staffResponsibleExpanded` (`created`, `changed`, `apiVersion`, `id`, `contactId`, `name`). Definir responsável fica desabilitado depois.
- Encaminhar: o mesmo POST de topics, com `forwardedToEmployeeExpanded`; situação 9. Item de menu habilitado em 1, 2 e 9 e desabilitado em 4 na 1761.
- Concluído: com texto vazio o botão já estava habilitado. O MAIS de uma solicitação concluída mostra só Imprimir.
- Expectativa: a tela não oferece.

## Não consegui / dúvidas
- Chamada de "Definir responsável": não salvei o diálogo, então só sei que o campo Funcionário é obrigatório. A troca de responsável: a tela não oferece.
- "Cadastro efetuado" (5): não consegui provocar por trâmite do escritório. A origem é provavelmente a integração com o Domínio, mas isso é hipótese.
- Encaminhar no contribuinte e anexo no contribuinte e no estagiário não foram testados. O anexo foi testado em empregado (1634) e Rubricas (1761).
- A API recusa encaminhar a partir de 3 (`EmployeeRegistrationInvalidStatus`) mesmo com o menu habilitado. Só testei isso em estagiário. Em empregado e contribuinte não testei o 3.
- O código numérico do filtro de Rubricas para "Encaminhado" é 9, por observação ao encaminhar; não li o valor direto do filtro.
- Rubricas 3 (Importação realizada) aparece em solicitações já existentes, mas não é oferecida ao escritório.
- A página recarregou sozinha várias vezes e as capturas de tela saíam em branco. Operei pela estrutura da página e conferi tudo por GET.
# Mapeamento das pendências · 2026-10-22

Empresa usada: EMPRESA EXEMPLO SIMPLES NACIONAL LTDA (código 9999, apelido "EXEMPLO | 0001-19"). Dados fictícios ("Teste Control Onvio") e arquivo fictício (teste-control-onvio.txt, 43 bytes). Nenhum dado pessoal, texto, token ou assinatura foi registrado. Caminhos: GUID → `{id}`, número → `{num}`, arquivo → `{nome}`. Base das APIs: `https://onvio.com.br/api/...`.

## Solicitações de teste criadas (IDs)

Todas concluídas por trâmite (situação Concluído) ao final.

| Lista | ID | Observação |
|---|---|---|
| Afastamento | 1460 | tipo com CAT, depois trâmite com anexo e troca de expectativa |
| Aviso Prévio de Rescisão | 617 | |
| Cálculo de Rescisão | 1167 | terminationType WORKED |
| Cálculo de Rescisão | 1168 | terminationType ABSENSE_DISPENSATION |
| Geral | 1446 | departamento Fiscal, anexo na abertura, trâmite Em análise interna com anexo |
| Aviso Prévio de Férias | 932 | meio PHONE, anexo na abertura, trâmite Em análise com anexo |
| Cálculo de Férias | 1064 | meio EMAIL, abono SIM, adiantar 13º SIM |

Já existiam e NÃO foram criados por mim: Afastamento 1459 e Aviso de Rescisão 616 (ambos "Sem análise", deixados como estavam); Cadastro 1634 a 1639 (todos Concluídos, sem anexo); Rubricas 1761 (Concluído; nele incluí trâmites Aguardando correção com anexo, Respondido e Concluído, e voltou a Concluído).

## 1. Tipo de afastamento (valores, lista x detalhe, CAT)

- Lista de tipos: `GET /api/br-payroll-sr/v1/employee-leave-types` → array simples de 39 itens `{type:"employeeLeaveTypeV1Dto", apiVersion, id:string, description:string(enum), enableCat:boolean, visible:boolean}`.
- `enableCat = true` só para os ids 3, 10 e 17. Acidente de trabalho: 3 WorkInjuryWithLeaveLongerThan15Days, 10 NewLeaveForPreviousWorkInjury, 17 WorkInjuryLeaveWith15DaysOrLess, 42 WorkInjuryLeaveLongerThan30Days, 44 WorkInjuryLeaveFor30DaysOrLess (42 e 44 sem CAT).
- Demais ids (id:enum): 2 FullRightsLeave, 4 MilitaryService, 5 MaternityLeave, 6 DiseaseWithLeaveLongerThan15Days, 7 UnpaidLeave, 11 MaternityLeaveProlongation, 12 NewLeaveForPreviousDisease, 13 SyndicalMandateExercise, 14 DisabilityRetirementForWorkInjury, 15 DisabilityRetirementForProfessionalDisease, 16 DisabilityRetirementExceptForWorkInjuryOrProfessionalDisease, 18 DiseaseLeaveWith15DaysOrLess, 19 NonCriminalAbortion, 20 MaternityLeaveForAdoptionUpTo1Year, 21 MaternityLeaveForAdoption1To4Years, 22 MaternityLeaveForAdoption4To8Years, 24 OtherLeaveTypes, 26 MaternityLeaveProlongation60Days, 27 MaternityLeaveProlongation60DaysAdoptionUpTo1Year, 28 MaternityLeaveProlongation30DaysAdoption1To4Years, 29 MaternityLeaveProlongation15DaysAdoption4To8Years, 30 InternReccess, 31 ContributorsDeath, 32 PaternityLeave, 33 LeaveDueToFGTSIrregularity, 35 Prison, 36 CourseOrQualificationProgramParticipation, 39 JustifiedAbsence, 40 IntershipTermination, 41 MaternityLeaveDueToMothersDeath, 43 DiseaseLeaveLongerThan30Days, 45 DiseaseLeaveFor30DaysOrLess, 49 ProfessionalDiseaseLeaveFor15DaysOrLess, 50 ProfessionalDiseaseLeaveLongerThan15Days.
- Lista `GET /api/br-payroll-sr/v1/employee-leave` (params: itemsPerPage, pageIndex, startIndex, orderBy, assignedtome, searchText, expand): cada item já traz, sem expand, `employeeLeaveTypeId` (number), `leaveDate` (date), `catDate` (date), `catNumber` (string), `catType` (string). `expand=employeeLeaveTypeExpanded` é aceito (200) e devolve `{apiVersion, id:string, description, enableCat, visible}`.
- Detalhe `GET /api/br-payroll-sr/v1/employee-leave/{id}?expand=all`: type "employeeLeaveV1Dto", id, companyId, created, lastUpdated, identifier, genericStatus (number), requestWay, serviceRequestType "EMPLOYEE_LEAVE", subject, description, leaveDate, catDate, catNumber, catType, employeeLeaveTypeId (number), `employeeLeaveTypeExpanded`, clientEmployeeExpanded, clientExpanded, createdByContactExpanded, attachmentsExpanded[].
- CAT: `catDate` (date, desabilitado até escolher tipo com enableCat), `catNumber` (string), `catType` (string): TYPICAL = "Típico", LABOR_SICKNESS = "Doença profissional ou do trabalho". O valor de "Trajeto" não foi capturado.
- Criação: `POST /api/br-payroll-sr/v1/employee-leave` → 201, header Location; body `{clientEmployeeExpanded{id}, clientExpanded{id}, employeeLeaveTypeExpanded{type, apiVersion, id, description, enableCat, visible, name}, description, subject, requestWay, requesterExpanded{}, leaveDate, catDate, catNumber, catType}`. Não há `employeeLeaveTypeId` no POST.

## 2. Aviso trabalhado x indenizado (aviso e cálculo, lista x detalhe)

- Aviso Prévio de Rescisão: **a tela não oferece** escolha trabalhado/indenizado/dispensado. Campos: Motivo da rescisão, "Concedido por" (`grantedBy`: EMPLOYER | EMPLOYEE), Data do aviso prévio (`adviceDate`, date), Assunto, Descrição.
  - Lista `GET /api/br-payroll-sr/v1/prior-notice-terminations`: item com `adviceDate`, `grantedBy`, `terminationReasonId` (number), serviceRequestType "PRIOR_NOTICE_TERMINATION". Detalhe `?expand=all` acrescenta `terminationReason{id:string, reason, calculation, internshipOption, priorNotice, sortOrder}`.
  - `POST /api/br-payroll-sr/v1/prior-notice-terminations` → 201; body `{clientEmployeeExpanded{id}, clientExpanded{id}, requesterExpanded{}, terminationReason{...}, requestWay, subject, description, grantedBy, adviceDate}`.
  - Motivos: `GET /api/br-payroll-sr/v1/termination-reasons`.
- Cálculo de Rescisão: campo "Tipo do aviso prévio" → `terminationType`: WORKED (trabalhando, confirmado por POST), ABSENSE_DISPENSATION (ausência/dispensa, assim mesmo, com "ABSENSE"; confirmado por POST), INDEMNIFIED (indenizado: valor informado pelo usuário, não capturei).
  - `terminationType` vem na LISTA (nível do item, mesmo sem expand) e no detalhe. Datas: `priorNoticeAdviceDate` (Data do aviso prévio, início do aviso) e `resignationDate` (Data de demissão). **Não existe** campo "último dia trabalhado". Também `terminationReasonId` (number); "Motivo eSocial" vem de `GET /api/br-payroll-sr/v1/esocial-reasons`.
  - `POST /api/br-payroll-sr/v1/termination-calculations` → 201; body `{clientEmployeeExpanded{id}, clientExpanded{id}, requesterExpanded{}, terminationReason{...}, requestWay, subject, description, terminationType, resignationDate, priorNoticeAdviceDate}`.

## 3. Departamentos (ids de DP/Fiscal/Contábil, Geral por departamento, analistas por departamento)

- `GET /api/br-default-department/v1/department?itemsPerPage=100&pageIndex=1` → página Spring `{content[], pageable, totalElements, totalPages, ...}`; item `{departmentId, companyId, code, name, departmentDefault, changed, created}`; 22 departamentos.
- Departamentos do sistema (os que a Geral oferece): Pessoal (DP06) `2CDE919421384918A2BF510E5D5F4FD6`; Fiscal (DP04) `8D6AF452F46D454C849B6C96F8CCF306`; Contábil (DP02) `26CE2C34F6F44CD99501CEAA43B93F0F`. Também existem duplicatas personalizadas: CONTÁBIL (código 2) `A0B4B8D7E3324369BC52869A28943B50`, PESSOAL (3) `79E62D04049C4E698394178A9E7A0D87`, FISCAL (8) `4D1D8C0C8840430B814A2B72FB3F8A7F`; e Patrimônio DP05, Financeiro DP03, Administrativo DP01, Registro de Empresas DP07, "Portal do Cliente" (código 14).
- Geral por departamento: `GET /api/service-requesting/v1/tickets/generic` traz só `departmentId` (guid) por item; `expand=departmentExpanded` é aceito e ignorado, `expand=all` também não traz objeto de departamento. A coluna "Departamento" da grade é resolvida no cliente pela lista de departamentos. Com o meu usuário (DP) a lista mistura departamentos: 4 distintos em 1393 itens (Pessoal 1381, Fiscal 9, Contábil 2, Portal do Cliente 1).
- `GET /api/br-payroll-sr/v1/company-department-access` → `{type:"companyDepartmentAccessV1Dto", apiVersion, id, companyId, departmentId}`; para o meu usuário devolve o departamento Pessoal (DP06). Teste com usuário de outro setor: não consegui (só tenho esse usuário).
- Listas de folha (aviso e cálculo de férias, aviso e cálculo de rescisão, afastamento, rubricas) **não têm campo de departamento** (200 itens cada, e `expand=all`).
- Analistas por departamento: o modal "Definir responsável" tem selects Departamento e Funcionário; escolher o departamento não dispara chamada. Os funcionários vêm de `POST /api/core/v3/companies/{id}/employees/search` com body `{expand:"primaryContactExpanded,employeeMainExpanded", filterSearchSort{orderBy, filter:"{groups:[{useOr:false,items:[{by:employeeMainExpanded.status.id,op:EQ,value:ACTIVE}]}]}"}, pagingDataRequest{pageIndex, itemsPerPage:100}}`; a pertinência ao departamento é filtrada no cliente por `items[].employeeMainExpanded.departments[].department{id, code, name}`.
- No modal de "Definir responsável" das listas de folha (ex.: Cálculo de Férias) existe só o select Funcionário.

## 4. Em análise nas férias (código, o que o cliente vê)

- Código do trâmite "Em análise": `status = 2` (POST de trâmite no Aviso de Férias 932 e no Afastamento 1460). Depois do trâmite o item mostra situação "Em análise" na lista.
- Outros códigos de trâmite vistos: Sem análise = 1; Em análise interna = 8 (Geral 1446); Concluído = 5 (Geral 1446); Aguardando correção = 6 (Rubricas).
- Opções do select de trâmite: Folha e Geral: Em análise, Em análise interna (Geral e Cálculo de Férias; no Aviso de Férias aparece Em análise/Respondido/Concluído), Respondido, Concluído. Rubricas: Em análise, Aguardando resposta, Aguardando correção, Concluído; em item concluído só "Aguardando correção", e a partir de "Aguardando correção" só "Respondido".
- Situações vistas nas listas de Cadastro: Enviado para o escritório, Encaminhado para outro usuário, Aguardando o cliente, Respondido pelo Cliente, Concluído. Rubricas também tem "Importação realizada".
- O que o cliente vê: **não consegui** (sem login de cliente para a empresa de teste).

## 5. Download de anexos

Padrão comum: o clique no nome do anexo faz `GET .../attachments/{id}` (XHR com header Authorization, Accept) → 200 `application/json` `{downloadUrl:string}`. O `downloadUrl` é do mesmo domínio `onvio.com.br` e termina com um token (não registrado). Há âncora com atributo `download`: baixa na hora, **não abre em nova aba**. O GET final devolve 200, `application/octet-stream`, `Content-Disposition: attachment` (sem registrar o nome), 43 bytes, sem redirect; funcionou sem o header Authorization (só cookies de sessão).

### Geral · trâmite / abertura
- Abertura: `GET /api/service-requesting/v1/tickets/{id}/attachments/{id}` → `{downloadUrl}` → `/api/service-requesting/v1/tickets/{id}/attachments/{id}/{token}`.
- Trâmite: `GET /api/service-requesting/v1/tickets/{id}/topics/{id}/attachments/{id}` → `{downloadUrl}`.
- Trâmite incluir: `POST /api/service-requesting/v1/tickets/{id}/topics` `{description, status}` → 201, depois `POST .../topics/{id}/attachments` FormData `file[]` → 201.

### Folha (Aviso de férias) · trâmite / abertura
- Abertura: `GET /api/br-payroll-sr/v1/tickets/{id}/attachments/{id}` → `{downloadUrl}` (aba Dados mostra o anexo como `{num}_{nome}`).
- Trâmite: `GET /api/br-payroll-sr/v1/tickets/{id}/topics/{id}/attachments/{id}` → `{downloadUrl}`; lista de trâmites: `GET /api/br-payroll-sr/v1/tickets/{id}/topics`.
- Nenhum `staticFilePath` nos anexos de trâmite de Geral, Aviso de Férias e Afastamento (testados 1446, 932, 1460).

### Cadastro · trâmite / abertura (staticFilePath)
- **Não consegui**: os 6 itens de teste (1634 a 1639) estão Concluídos, sem anexo, e com a situação concluída o ícone de trâmite fica desabilitado; o escritório não cria solicitação de Cadastro (**a tela não oferece** "Adicionar" em Empregados, Contribuintes nem Estagiários). Dado observado: o detalhe tem `attachmentsExpanded[]` (vazio) e nenhum campo `staticFilePath` ou similar.

### Rubricas · trâmite / abertura (staticFilePath)
- Abertura: o detalhe `GET /api/br-payroll-sr/v1/payroll-entries/{id}?expand=all` não tem anexo (sem campo de anexo); a aba Dados mostra a grade empregado × rubrica.
- Trâmite: `GET /api/br-payroll-sr/v1/payroll-entries/{id}/topics/{id}/attachments/{id}` → `{downloadUrl}` (mesmo padrão).
- **`staticFilePath` existe**: `GET /api/br-payroll-sr/v1/payroll-entries/{id}/topics?expand=all` devolve cada trâmite com `attachmentsExpanded[] {apiVersion, id, companyId, name, staticFilePath:string}`. O valor é URL absoluta no formato `https://onvio.com.br/api/storage/v1/files/Company/application/{segmento}/category/{id}/subcategory/{id}/file/{nome}`. `GET` direto nessa URL: 200, `text/plain` (tipo do próprio arquivo), 43 bytes, sem Content-Disposition, e funciona **sem cookies e sem Authorization** (testado com fetch sem credenciais).
- Incluir trâmite: `POST /api/br-payroll-sr/v1/payroll-entries/{id}/topics` `{description, status}` → 201 e `POST .../topics/{id}/attachments` (file[]) → 201. A tela de Rubricas permite incluir trâmite com anexo pelo visualizador.

### Lote
- A tela **não oferece** botão de baixar tudo (conferido no visualizador do Aviso de Férias e da Geral, nas abas Dados e Trâmites; IMPRIMIR é só impressão do navegador, sem chamada).
- Endpoint: `GET /api/br-payroll-sr/v1/tickets/{id}/attachments/batch-download/{tipo}`. `{tipo}` é o enum `ServiceRequestType` do payroll-sr: `PRIOR_NOTICE_VACATION` e `VACATION_CALCULATION` são aceitos; valores inválidos (ex.: `GENERIC`, `ticket`) dão 500 com mensagem "No enum constant ... ServiceRequestType.X". Com `{id}` do Aviso de Férias 932: Accept json → 200 corpo vazio; Accept zip ou octet-stream → 406; POST → 405. **Não consegui obter o arquivo em lote**; fica a dúvida de qual `{id}` ou parâmetro a extensão deve usar.

## 6. Criação

### Geral (serviceRequesting, requestWay, departamento)
- Campos: Cliente, Solicitante, Meio de solicitação, Departamento, Assunto, Descrição, Expectativa, anexo, Trâmite inicial (SEM ANÁLISE | RESPONDIDO).
- `POST /api/service-requesting/v1/tickets/generic` → 201, header Location `/v1/tickets/generic/{id}`; body `{serviceRequestType:"GENERIC", clientExpanded{id}, departmentId, description, subject, requestWay, requesterExpanded{}}`; anexo depois: `POST /api/service-requesting/v1/tickets/{id}/attachments` (file[]).
- `requestWay`: OTHER (Outro), PHONE (Telefone), EMAIL (E-mail, capturado no Cálculo de Férias); WEB aparece em itens da lista (criados pelo cliente).
- Opções de Departamento: Portal do Cliente, Contábil, Fiscal, Pessoal (rótulo "Departamento do Sistema"). `departmentId` muda conforme a escolha (Fiscal enviou `8D6AF452F46D454C849B6C96F8CCF306`).
- Clientes: `GET /api/br-payroll-sr/v1/clients?...&search&searchBy=code,name,contactView.nickname`; solicitante: `POST /api/core/v1/companies/{id}/contacts/{id}/relationship-views/search`.

### Folha (por lista)
- Botão **Adicionar** na visão do escritório: Afastamento, Aviso de Rescisão, Cálculo de Rescisão, Aviso de Férias e Cálculo de Férias. **A tela não oferece** em Cadastro (3 abas) e em Rubricas.
- Id do empregado: `GET /api/br-payroll-sr/v1/clients/{id}/employees?eprType=EMPLOYEE&eprType=INTERN` (array de clientEmployeeV1Dto).
- Aviso de Férias: `POST /api/br-payroll-sr/v1/prior-notice-vacations` → 201; `{clientExpanded{id}, description, subject, clientEmployeeExpanded{id}, requestWay, vacationDays:number, vacationStartDate:date, requesterExpanded{}, bonusDays:number, noticeDate, paymentDate}`; anexo de abertura `POST /api/br-payroll-sr/v1/tickets/{id}/attachments`.
- Cálculo de Férias: `POST /api/br-payroll-sr/v1/vacation-calculations` → 201; `{clientExpanded{id}, description, subject, clientEmployeeExpanded{id}, requestWay:"EMAIL", vacationDays:number, vacationStartDate:date, requesterExpanded{}, payBonusDays:boolean, payFirstInstallmentEarlier:boolean}`. Campos do formulário: Meio, Empregado, Data de início do gozo, Dias de gozo, Pagar abono pecuniário (SIM/NÃO), Adiantar 1ª parcela do 13º (SIM/NÃO), Assunto, Descrição, Expectativa, anexo.
- Afastamento, Aviso e Cálculo de Rescisão: POSTs descritos nas seções 1 e 2.
- Meio de solicitação (todas): TELEFONE → PHONE, E-MAIL → EMAIL, OUTRO → OTHER.

## 7. Ações que faltam (folha: anexo e expectativa; Rubricas: responsável; sai da lista ao concluir)

- Anexo no trâmite (folha): sequência `POST .../tickets/{id}/topics` (`{description, status}`) → 201, depois `POST .../tickets/{id}/topics/{id}/attachments` (FormData `file[]`, sem Content-Type manual) → 201. Confirmado em Afastamento, Aviso de Férias. Rubricas usa `payroll-entries/{id}/topics`. Cadastro: não consegui (itens concluídos).
- Expectativa de Conclusão: `PUT .../{recurso}/{id}/change-due-date` body `{dueDate:string(date)}` → 200. Confirmado em `employee-leave` e `vacation-calculations`. Aviso de Férias também tem o item de menu (chamada não capturada). Rubricas e Cadastro: o menu MAIS **não oferece** (Rubricas: Excluir, Encaminhado para outro usuário, Definir responsável, Imprimir).
- Definir responsável: `PUT /api/br-payroll-sr/v1/vacation-calculations/{id}/assign-staff` body `{id:guid do funcionário}` → 200 (capturado pela tela). Rubricas: `PUT /api/br-payroll-sr/v1/payroll-entries/{id}/assign-staff` body `{id}` → 200 sem corpo, testado por chamada direta só no item de teste, reatribuindo o mesmo responsável. Na tela, o botão "Definir responsável" de Rubricas ficou desabilitado nos status "Aguardando correção" e "Respondido" (não vi habilitado).
- Pendentes: o filtro "Apenas pendentes" é enviado como `filter={groups:[{useOr:false,items:[{by:firmStatus,op:IN,value:...}]}]}`. Em Rubricas: `firmStatus IN 1,2,3,4,9` (Respondido e Importação realizada contam como pendentes). O app também consulta com `firmStatus IN 0,1,2,3,4,5,6,7,9,11,12` em segundo plano (contagem).
- **Sai da lista de pendentes ao concluir?** Sim em todas as testadas: Geral (1446), Aviso de Férias (932), Cálculo de Férias (1064), Aviso de Rescisão (617), Cálculo de Rescisão (1167 e 1168), Afastamento (1460) e Rubricas (1761). Cadastro: não consegui (sem item pendente de teste).

## 8. Leitura (admissão, searchText, assignedtome)

- Data de admissão: campo `admissionDate` (date), presente na lista (sem expand) e no detalhe de `employees-registrations` (Empregados; tem também `startDate`), `interns-registrations` (Estagiários; sem `startDate`) e `taxpayers-registrations` (Contribuintes; sem `startDate`). A coluna "Data de admissão" aparece nas grades de Cadastro.
- searchText por empregado no Cálculo de Férias: **sim**, é server-side. `RONALDO DE SOUZA` → 1 resultado; `RONALDO` → 1; `EXEMPLO SIMPLES` (empresa) → items=2, totalItems=3.
- assignedtome=true no Cálculo de Férias: **sim** (filtra por responsável = usuário logado), 16 itens (totalItems 16); combinado com searchText=RONALDO → 0 (naquele momento o 1064 não estava atribuído a mim).

## Não consegui / dúvidas

- Visão do cliente (o que o cliente vê em "Em análise"): não consegui, sem login de cliente.
- Usuário de outro setor (Fiscal/Contábil) para `company-department-access` e lista Geral por departamento: não consegui.
- Cadastro (anexo na abertura, trâmite com anexo, staticFilePath, criação, "sai da lista"): não consegui; itens de teste concluídos e sem Adicionar. `departmentExpanded` aparece no Cadastro (integração) em parte dos itens e parece ser o departamento do empregado na empresa cliente, não DP/Fiscal/Contábil (incerto).
- Lote: endpoint existe, mas não consegui o arquivo (ver seção 5).
- Valores não capturados: `catType` de "Trajeto" e `terminationType` INDEMNIFIED (este vem da informação do usuário).
- `totalItems` x itens devolvidos com `searchText`: em `payroll-entries` e `employees-registrations` o total veio maior que os itens retornados (ex.: 14 total com 1 item; 10 total com 1 item), enquanto em `vacation-calculations` bateu. Vale a extensão não confiar em `totalItems` quando há searchText.
- `genericStatus` tem significados diferentes por módulo (Geral: 5 = Concluído; em Rubricas o item concluído veio com 8); não assumir tabela única.
- Download sem cookies: o `downloadUrl` do trâmite foi testado só com cookies de sessão; o `staticFilePath` foi testado sem cookies e sem Authorization.
- Transparência: (1) abri por engano o modal "Definir responsável" na linha de um cliente real do Cálculo de Férias (a lista deslocou depois de um novo item) e **cancelei sem salvar**, nada foi alterado; (2) para achar os itens da empresa 9999 em Rubricas, varri as páginas da lista em memória filtrando só `code=9999`, sem gravar nada de outros clientes; (3) um token de download apareceu uma vez numa saída de ferramenta (não usado nem registrado aqui).

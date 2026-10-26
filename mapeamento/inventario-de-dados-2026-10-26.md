# Inventário de dados do Onvio: o que uma extensão de navegador consegue extrair

Pedido do Josué em 26/10/2026: "verifique absolutamente tudo que é possível extrair com uma extensão de navegador no site do Onvio; a extensão puxa coisas que a tela normal do Onvio não mostra".

**Atualização (mesmo dia, à noite):** o Josué rodou o script no Portal do Cliente e no Onvio Gestão e mais cinco telas; o resultado está na **seção 9**, que vale mais que as marcações 🔶 das seções 1 a 8 (elas foram escritas antes da rodada).

**Ressalva importante.** Neste ambiente não há acesso ao Onvio real. As seções 1 a 8 juntam (1) o que já foi **confirmado** nos mapeamentos feitos no Chrome do Josué (`onvio-2026-10-15.md`, `pendencias-2026-10-22.md`, `portal-do-cliente.md`, `tramites-cadastro-rubricas-2026-10-19.md`, `acoes-2026-10-15.md`), (2) o que é **provável** pelo que o código do Onvio e o próprio navegador permitem e (3) o que **não foi explorado**. A prova do que realmente existe vem do script `mapeamento/inventario-onvio.js` (seção 8), que o Josué roda no Chrome dele: ele registra o formato de tudo, sem valores.

Legenda: ✅ confirmado em mapeamento · 🔶 provável, falta conferir · ⬜ não explorado.

## 1. Por que a extensão vê mais do que a tela

A tela do Onvio é só um cliente da API: a mesma página chama `https://onvio.com.br/api/...` com a sessão do usuário e mostra uma parte do que volta. A extensão, rodando na mesma sessão, recebe a **resposta inteira**, inclusive campos que nenhuma coluna ou aba exibe. Exemplos já vistos: `companyId`, `changed`, `lastStatusChanged`, `identifier` (o número) ao lado do `id` (GUID), `departmentId` na Geral, `deletedTopic`, o `contactId` do responsável, e nos Cadastros CPF (`nationalIdentity`), salário (`wage`) e os blocos pessoal/profissional inteiros. Isso é uma consequência de a API devolver o objeto completo, não de "furar" nada: o limite continua sendo o **perfil de permissão do usuário logado** (um usuário sem acesso recebe 401/403).

## 2. Canais técnicos (como uma extensão lê)

| Canal | Alcance | Estado na extensão |
|---|---|---|
| Leitura same-origin da API (`fetch` com a sessão da aba) | Tudo que o usuário pode ver na API, em JSON | ✅ É o que a extensão usa (`escolherFetcher`: `pagina`, `extensao`, `direto`). Só GET para leitura. |
| Cabeçalho `Authorization` do Onvio | Necessário para as escritas; o Onvio o coloca nas chamadas | ✅ `acao-hook.js` guarda só na memória da página; nunca gravado nem enviado ao service worker. |
| Interceptar `fetch`/XHR no mundo da página (`acao-hook.js`) | Todas as chamadas que uma tela faz, método, caminho e campos | ✅ "Modo aprender": grava só formato (nomes e tipos, nunca valores). Hoje só nas páginas do Portal do Cliente. 🔶 Para mapear o `/staff/` e outras telas precisaria de permissão/injeção nelas. |
| `performance.getEntriesByType('resource')` | Lista dos endereços já chamados pela página, sem corpo | ✅ Usado no mapeamento (`portal-do-cliente.md`); o inventário usa também. |
| DOM e controles da página (Wijmo `getControl`, Angular) | Colunas, linhas, rótulos, estado visível | ✅ `grade.js`; o inventário lista colunas (cabeçalho + campo). |
| `localStorage`/`sessionStorage`/IndexedDB da página | Preferências, rascunhos, às vezes tokens | 🔶 O inventário lista só **nomes e tamanhos** das chaves. Valores não são lidos (podem conter token). |
| Cookies | Só os não-`HttpOnly` por `document.cookie`; com a permissão `cookies` a extensão veria os nomes de todos, e os valores de sessão são sensíveis | 🔶 Não usado. Não recomendado: a sessão é do Onvio, não nossa. |
| Downloads (anexos, documentos) | Arquivos em si | ✅ `baixarAnexos` (por `downloadUrl` ou `staticFilePath`). |
| WebSocket/EventSource da página | Notificações em tempo real do Onvio (se houver) | ⬜ O inventário só informa se a página tem esses recursos. |
| Outras origens do Onvio (`*.onvio.com.br`, serviços do RoutingTable) | Serviços que não são `/api/` do mesmo host | ⬜ A extensão só tem permissão em `onvio.com.br`. |

Limites que não mudam: chamadas **não oficiais** (podem mudar sem aviso), o Onvio pode limitar o ritmo (carga: 10 chamadas por verificação), cookies `HttpOnly` não são legíveis, e a autorização só existe na memória da aba.

## 3. Catálogo por fonte

### 3.1 Listas de solicitações (10 listas) ✅
`GET {lista}?itemsPerPage&pageIndex(1)&startIndex&orderBy&assignedtome&expand=…`. Campos por item (que a extensão usa em `normalize`): `id` (GUID), `identifier` (número da tela), `genericStatus` (situação), `created`, `lastStatusChanged`, `lastUpdated`/`genericLastUpdated`/`changed`, `dueDate` (expectativa do cliente), `clientExpanded.{id,name,nickname,code}`, `staffResponsibleExpanded.{id,name}`, `requesterExpanded.name`, `departmentId`, `admissionDate`/`startDate` (Cadastro), `employeeLeaveTypeId`, `leaveDate`, `catDate` (Afastamento), `terminationType` (Cálculo de rescisão). `totalItems`/`totalPages` dão a contagem exata sem baixar tudo.
Listas: Geral, Cadastro (Empregados, Contribuintes, Estagiários), Aviso e Cálculo de férias, Aviso e Cálculo de rescisão, Afastamento, Rubricas.

### 3.2 Detalhe de cada solicitação ✅
`GET {lista}/{id}?expand=all` (Rubricas na v2). Campos de 1º nível por lista estão em `onvio-2026-10-15.md` seção 4. Destaques:
- **Geral**: `description`, `subject`, `requestWay`, `departmentId`, `companyId`, `dueDate`, `serviceRequestType`, `createdByContactExpanded`.
- **Cadastro de empregado**: `nationalIdentity` (CPF), `name`, `socialName`, `wage`, `jobPositionExpanded`, `departmentExpanded`, `costCenterExpanded`, `employeeRegistrationPersonalExpanded` (dados pessoais), `employeeRegistrationProfessionalExpanded` (dados profissionais, inclui o código do empregado no Domínio), `category`, `employmentRelationship`, `dailyHours/weeklyHours/monthlyHours`, `daysExperience`, `extensionDays/extensionEnd`, `firstJob`, `teacher`, `registration`, `frequencyCard`, `comments`.
- **Férias**: `vacationStartDate`, `noticeDate`, `paymentDate`, `bonusDays`, `vacationDays`, `payBonusDays`, `payFirstInstallmentEarlier`.
- **Rescisão**: `adviceDate`, `grantedBy`, `resignationDate`, `priorNoticeAdviceDate`, `terminationReason(+Id)`, `terminationType`, `tipoAviso` (trabalhado/indenizado).
- **Afastamento**: `leaveDate`, `employeeLeaveTypeExpanded` (`enableCat`), `catDate`, `catNumber`, `catType` (típico, doença do trabalho; "trajeto" não capturado).
- **Rubricas**: `effectiveDate`, `entryType`, `detailAbsentDay`, `detailServiceEntry`, `payrollEntryConfigurationHeaderExpanded`, `payrollEntryClientEmployeeExpanded`.
- Cadastro de contribuinte e de estagiário: 🔶 campos de 1º nível "não detalhei" no mapeamento de 15/10; o inventário cobre.

### 3.3 Trâmites ✅
`GET {base}/{id}/topics?expand=all&itemsPerPage&orderBy=created asc&pageIndex(0)`. Por trâmite: `type`, `created`, `status` (situação), `description`, `number`/`employeeRegistrationTopicNumber`/`payrollEntryTopicNumber`, `companyId`, `createdByContactExpanded` (autor), `attachmentsExpanded` (anexos). 🔶 `deletedTopic` (trâmite excluído) aparece em alguns tipos.

### 3.4 Anexos ✅
`attachmentsExpanded[]`: `id`, `name`, `companyId`, e `staticFilePath` (Cadastro e Rubricas). Download: `GET …/attachments/{id}` devolve `{ downloadUrl }` (Geral e folha). `batch-download/{tipo}`: existe (férias aceitam), mas **não foi obtido o arquivo em lote** (resposta 200 vazia; zip dá 406). Tamanho e tipo do arquivo (`mimeType`, `originalItemSize`) 🔶 só nos documentos do storage, não nos anexos de solicitação.

### 3.5 Pessoas ✅/🔶
- **Autor de um trâmite**: `createdByContactExpanded.id` → `GET core/v7/companies/{companyId}/contacts/{id}` ✅ (contato do cliente ou do escritório: nome, e-mail, telefone, cargo 🔶).
- **Usuário**: `GET profiles/v1/users/{id}` 🔶 (perfil: nome, e-mail, idioma, avatar).
- **Preferências do usuário**: `GET profiles/v1/preferences?application=…&category=…` ✅ (como a tela de solicitações é configurada para a pessoa).
- **Empregados de um cliente**: `GET br-payroll-sr/v1/clients/{clientId}/employees?eprType=EMPLOYEE&eprType=INTERN&expand=clientEmployeeRelationshipExpanded` ✅ (`name`, `status`, `hireDate`, `cpf`…). Isso é a **folha de cada empresa cliente**, hoje não exibida pelo escritório nesse formato.
- **Empregados do escritório / equipe**: `GET core/v3/companies/{id}/employees/search` ✅ (equipe com departamento).

### 3.6 Clientes e empresas ✅/🔶
`GET core/v3/companies/{id}/clients/search` ✅ (clientes do escritório: nome, apelido, código, CNPJ 🔶, status 🔶). Em `clientExpanded` de cada solicitação já vêm `id`, `name`, `nickname`, `code`.

### 3.7 Departamentos e acesso ✅
- `GET br-default-department/v1/department` → 22 departamentos (`departmentId`, `code`, `name`, `departmentDefault`, `changed`, `created`).
- `GET br-payroll-sr/v1/company-department-access` → o departamento do usuário logado (base da regra de setores). A tela não mostra isso.

### 3.8 Tabelas de domínio ✅
`employee-leave-types` (39 tipos, `enableCat`, `visible`), `termination-reasons`, `esocial-reasons`, `esocial-categories`, `employment-relationships`, `categories`. Servem para traduzir códigos (nada em inglês na tela).

### 3.9 Prescrição ✅
`service-requesting/v1/ticket-prescriptions` e `br-payroll-sr/v1/ticket-prescriptions`: regra ativa, 30 dias. A extensão calcula `prescreveEm` (informativo).

### 3.10 Documentos e comunicações (storage) ✅ mapeado, 🔶 pouco usado
- Pasta raiz do cliente (`storage/v1/projects?primaryAssociationId=…`), conteúdo (`storage/v2/Projects|Folders/{id}/children`), caminho (`ancestors`).
- Documento: `name`, `mimeType`, `originalItemSize`, `createdDate`, `modifiedDate`, **`isReadByClientUser`** (se o cliente já abriu), `customFields.dueDate` (vencimento de guias), `customFields.clientId`, `userTags`, `permissions.*`, links `staffCenterViewPath`/`clientCenterViewPath`. Pasta: `readUserCount`, `isShared`, `hasFiles`, `documentCount`.
- Comunicações (`storage/v2/requests`): `subject`, `clientName`, `sendDate`, `expirationDate`, `isViewed`, `status`, `requestType`, `recipients`, `createdBy.name`.
- Busca global de documentos (`storage/v1/containers/documents/search` e `/count`): ✅ achado no código, ⬜ não testado.

### 3.11 Sessão, permissões e roteamento ✅ (cuidado: contém tokens)
`GET security/v1/session-and-bindings`:
- `UdsSession`: `SessionId`, `PrismGuid`, `FirstName`, `LastName`, `EmailAddress`, `IpAddress`, `CreatedDateTime`, `SessionExpiresDateTime`, e **`SeamlessAuthenticationToken` e `LongToken` (tokens de acesso: a extensão nunca lê nem guarda)**.
- `UdsSessionBindings.RoutingTable`: ~850 chaves aplicativo→URL. É um **mapa de todos os serviços do Onvio** (útil para descobrir telas e módulos que ainda não olhamos).
- `FeatureResourcePermissionsMap`: grupos BRCnd, Applications, Platform, OnvioDrive, BRCertificados, Reports, BRChat, Onvio, BRAtendimento, BRProcess, OnvioSetup, OnvioBR, Settings. É a lista do que **o usuário pode** fazer (por exemplo `BRAtendimento.ServiceRequestAssignResponsible`, `ViewOthers`, `ManageOthers`; `Platform.OnvioStaffAccess` distingue escritório de cliente).
- `ApplicationConfiguration`: `CompanyId`, `ContactId`, `ContabilFirmId`, `ContabilSeqLibId`, `Licenses`, `TestFirm`, `CobaltServicesRouteMap`.
- `InfrastructureAccessControls`: lista de textos.

### 3.12 Integrações e módulos com pouca ou nenhuma exploração ⬜
Pelo RoutingTable e pelos grupos de permissão existem: **Gestta** (`service-requesting/v1/gestta/task/service-order`, ✅ achado, ⬜ não detalhado), **CND/Certidões** (`BRCnd`), **Certificados** (`BRCertificados`), **Relatórios** (`Reports`), **Chat** (`BRChat`), **Atendimento** (`BRAtendimento`), **Processos** (`BRProcess`: o Onvio Gestão de Processos), **Onvio Drive**, **Setup/Configurações**, **NF-e/fiscal** 🔶. Cada um é uma fonte nova de dados (vencimentos de certificado, certidões negativas, tarefas do Gestta, conversas), mas nenhum foi aberto. O inventário lista, por módulo, as chamadas que a tela faz quando a pessoa navega por ele.

## 4. O que a API tem e a tela não mostra

Lista do que já se sabe (confirmado) ou se espera (🔶) e que a tela normal não exibe ao analista:

1. ✅ `companyId`, `changed`, `lastStatusChanged`, `genericLastUpdated`, `apiVersion`, `type` (DTO) em todos os objetos.
2. ✅ `identifier` (número) **e** `id` (GUID): a tela mostra só o número.
3. ✅ `departmentId` das solicitações Gerais e o `departmentId` do acesso do usuário (a tela de lista não mostra o departamento do usuário).
4. ✅ Salário (`wage`), CPF (`nationalIdentity`), centro de custo, cargo, jornada, dados pessoais e profissionais completos nos Cadastros; 🔶 `integrationCode` (código do empregado no Domínio).
5. ✅ `isReadByClientUser` nos documentos: se o cliente abriu a guia, e `customFields.dueDate` (vencimento).
6. ✅ `readUserCount` das pastas.
7. ✅ Lista completa de empregados de cada cliente, com situação e data de admissão (`hireDate`).
8. ✅ `staffResponsibleExpanded.contactId`, `created`/`changed` do responsável (histórico de atribuição).
9. ✅ Permissões do usuário (`FeatureResourcePermissionsMap`) e o mapa de serviços (`RoutingTable`).
10. ✅ Regra de prescrição configurada (30 dias).
11. 🔶 `deletedTopic` e a existência de trâmites excluídos.
12. 🔶 Totais exatos (`totalItems`) de qualquer filtro sem baixar a lista.
13. 🔶 Cadastro de contribuinte/estagiário: campos que a tela de grade omite.
14. ✅ **Derivados** que a própria extensão calcula e a tela não tem: dias parada, dias úteis com a vez do escritório, 1º trâmite, quem concluiu, prazos legais (pagamento de férias e rescisão, eSocial da admissão), carga por analista, histórico de atendimento por empresa.

## 5. Sensibilidade e o que pode ser guardado (LGPD e CLAUDE.md)

| Classe | Exemplos | Regra |
|---|---|---|
| Pessoal sensível | CPF, salário, CID, dados pessoais do Cadastro, descrição e observações, anexos, e-mail/telefone de contato | **Nunca** no armazenamento da extensão, em log, teste ou commit. Podem ser **lidos na hora** e mostrados (detalhe), mas não gravados. |
| Segredo de acesso | `SeamlessAuthenticationToken`, `LongToken`, `Authorization`, `downloadUrl` assinado | Nunca lidos pelo inventário; o `Authorization` só na memória da página. |
| Operacional do escritório | ID, nº, situação, datas, cliente, responsável, departamento, tipo | Pode ser guardado (resumo), como hoje. |
| Configuração | permissões, hosts do RoutingTable, tabelas de domínio | Pode ser guardado e documentado. |

Qualquer extração nova de dado pessoal precisa de decisão do Josué e do aviso no `CLAUDE.md` antes de entrar. O inventário (`inventario-onvio.js`) guarda **só o formato** (tipos), não valores.

## 6. Riscos

- **API não oficial**: pode mudar; a extensão falha de forma visível e nunca mostra número errado em silêncio.
- **Carga**: leituras em massa de cadastro/clientes/storage podem passar do aceitável. Regra: uma leitura por vez, pausa, só sob demanda.
- **Tokens**: `session-and-bindings` contém tokens; só usar o que não é segredo (permissões, hosts, ids).
- **Escritório × cliente**: as APIs são as mesmas; com login de cliente a extensão não lê (`visao_cliente`).
- **Permissões do site**: a extensão só tem `onvio.com.br`; outros domínios do Onvio exigiriam nova permissão e revisão.
- **Termos do Onvio**: automação de leitura por extensão de uso próprio, com a sessão do usuário, sem raspagem em massa; confirmar com o Josué se há alguma política da Thomson Reuters/ControlTax antes de ampliar para clientes/storage em escala.

## 7. Extrações novas que valem a pena (proposta, nada implementado)

1. **Guias não visualizadas pelo cliente perto do vencimento** (`isReadByClientUser` + `customFields.dueDate`): alerta por cliente. ✅ já mapeado (`portal-do-cliente.md`, item 1 da lista de ideias).
2. **Quem do escritório tem acesso a quê** (permissões e departamento) para avisar "isso não é do seu setor".
3. **Contagem exata de pendências por filtro** (`totalItems` com `itemsPerPage=1`): custo baixo.
4. **Mapa de módulos do Onvio** (RoutingTable + permissões) para decidir os próximos módulos (CND, Certificados, Gestta).
5. **Resumo (sem dados pessoais) do cadastro de empregados por empresa**: só contagens (ativos, admissões nos últimos 120 dias) para a previsão de carga.
6. **Documentos novos por cliente** (storage v2, `createdDate`): fila de "o que chegou hoje".

## 8. Como rodar o inventário no Chrome do Josué

Arquivo: `mapeamento/inventario-onvio.js`. Só leitura: GET em `/api/` do mesmo site, sem valores, sem tokens, no máximo 120 leituras, 250 ms entre uma e outra.

1. Abra o Onvio logado como **escritório**: o Portal do Cliente (`https://onvio.com.br/br-portal-do-cliente/`) e depois o Onvio Gestão (`https://onvio.com.br/staff/`).
2. F12 > Console > cole o conteúdo do arquivo e Enter (se pedir, digite `allow pasting`).
3. `await __inventarioOnvio.rodar()` (cerca de 1 minuto; faz ~45 leituras).
4. `__inventarioOnvio.exportar()` baixa `inventario-onvio-<data>.json`. Antes de enviar, olhe a parte `tela` (rótulos, abas, botões) por algum nome de pessoa.
5. Navegue por telas ainda não vistas (Documentos, CND, Certificados, Relatórios, Configurações, Chat) e rode `rodar()` de novo: o campo `rede` junta o que cada tela chamou.
6. Para olhar uma leitura específica que apareceu em `rede`: `await __inventarioOnvio.sondar('/api/caminho?param=1')`.

O que o JSON traz: sessão (nomes e tipos; permissões; hosts e chaves do RoutingTable), por lista o formato do item, do detalhe e dos trâmites, o que só o detalhe tem (`soNoDetalhe`), contato/usuário/empregados do cliente (formato), tabelas de apoio, o que a página guarda no navegador (nomes de chaves, IndexedDB, caches, variáveis globais), as colunas da grade da tela aberta e as chamadas `/api/` já feitas pela página.

Teste automático do próprio script: `node testes/inventario-onvio.js` (Onvio simulado: confere só GET, limite, ausência de valores e tokens).

## 9. Resultado da rodada real de 26/10/2026

Fontes: três execuções do `inventario-onvio.js` (Portal do Cliente com 45 e com 87 leituras; Onvio Gestão `/staff/` com 45) e cinco telas extras (CND histórico e habilitação, Manifestação de NF-e, Relatórios, Configurações → Parâmetros; Documentos do Onvio Gestão). Zero erros; o único retorno diferente de 200 foi `profiles/v1/users/{id}` com 403 (o script usava o id do **contato**; o usuário tem outro id, o `userId` do contato; corrigido no script). Nenhum valor foi gravado: só tipos.

### 9.1 O que a API entrega e a tela não mostra (confirmado)

**Já na lista, sem abrir o detalhe** (a lista usa `expand` e traz muito mais que as colunas da grade):
- Todas as listas: `created` (data de abertura; a grade só mostra o último trâmite), `changed`, `companyId`, `requestWay`, `serviceRequestType`, `description` (o texto inteiro!), `clientExpanded.{code, contactId, isOnvio, allowEmployeeRegistration, sendingEsocial, detailAbsentDay, detailServiceEntry}` (como o cliente está configurado no Onvio), `staffResponsibleExpanded.contactId`, `requesterExpanded`.
- Cadastros: `nationalIdentity` (CPF), `wage` (salário), `socialName`, `clientStatus`, `employeeRegistrationType`, `lastStatusChanged`, `startDate/endDate/extensionEnd`, `comments`, jornada, `frequencyCard`, `registration`.
- Férias, rescisão e afastamento: `clientEmployeeExpanded` com **`cpf`, `hireDate`, `status`, `gender`, `jobPosition`, `employeeWorkload`, `integrationCode`** (o código do empregado no Domínio) e `integrationId`; `dueDate`; na rescisão `resignationDate`, `priorNoticeAdviceDate`, `terminationReasonId`, `terminationType`; no afastamento `leaveDate`, `employeeLeaveTypeId`.
- Rubricas: `effectiveDate`, `entryType`, `detailAbsentDay`, `detailServiceEntry`.

**Só no detalhe** (`expand=all`): `attachmentsExpanded` e `createdByContactExpanded` (todas); nos Cadastros também `employeeRegistrationPersonalExpanded` (≈37 campos: nascimento, endereço, filiação, documentos, título de eleitor, CNH, estado civil, raça, escolaridade, e-mails e telefones), `employeeRegistrationProfessionalExpanded` (PIS, carteira de trabalho, benefícios, contribuição sindical, forma de pagamento), `dependentListExpanded` (dependentes: nome, nascimento, tipo, IRRF), `jobPositionExpanded`, `departmentExpanded`, `laborUnionClientExpanded`, `workDayExpanded` (cada um com `integrationCode`) e, nos estagiários, `employeeRegistrationInternExpanded` (instituição, nível, natureza). Nas rescisões `terminationReason` completo (`calculation`, `priorNotice`, `internshipOption`) e nos afastamentos `employeeLeaveTypeExpanded` (`enableCat`).

**Trâmites**: `number`, `status`, `created`, `deletedTopic` (trâmite excluído; só Geral e folha), `createdByContactExpanded`, `attachmentsExpanded`. **Anexos**: `size`, `deletedAttachment`, `staticFilePath` (Cadastro e Rubricas); no Afastamento o anexo só tem `id` e `name`.

**Tamanho da base do escritório (`totalItems`, 26/10/2026)**: Geral 1.412 · Cadastro de empregado 1.553 · de contribuinte 5 · de estagiário 86 · Aviso de férias 923 · Cálculo de férias 1.059 · Aviso de rescisão 611 · Cálculo de rescisão 1.148 · Afastamento 1.459 · Rubricas 1.740. A contagem exata vem de uma chamada com `itemsPerPage=1`.

**Contato** (`core/v7/.../contacts/{id}`): nome completo, cargo, empresa, `userId`, `isClientCenterEnabled`, `isStaffCenterEnabled`, e-mails (com `isPrimary`), telefones, endereços, categorias, `displayAs`. Serve para saber **se quem escreveu é do escritório ou do cliente** sem depender de palavras (`isStaffCenterEnabled` × `isClientCenterEnabled`): proposta de melhoria para `OC.escritorioTramitou`.

**Empregados do cliente**: `hireDate`, `status`, `cpf`, `gender`, `jobPosition`, `employeeWorkload`, `integrationCode`, `clientEmployeeRelationshipExpanded.{eprType,name}` (EMPLOYEE × INTERN).

**Prescrição** (as duas rotas iguais): `prescribePendingTickets` + `prescribePendingTicketsDays`. **Preferência da lista**: `{ newestFirst, expandedView }`.

### 9.2 Sessão, permissões e configuração do Onvio

- **854 serviços** no `RoutingTable` (iguais no Portal e no Gestão): 677 em `onvio.com.br`, 156 em `int.onvio.com.br` (internos), e hosts externos: **Gestta** (`api.gestta.com.br`, e `ws.gestta.com.br` por WebSocket), Domínio Empresa (`dominioempresa.thomsonreuters.com`), suporte Domínio Atendimento, Pendo (telemetria do Onvio), TRID (login Thomson Reuters), GoFileRoom, e vários de outros países. A extensão **não tem nem deve ter** permissão nesses hosts.
- **Permissões** (`FeatureResourcePermissionsMap`, 11 grupos). O usuário do Josué tem `AllPermissions` e `PermissionsAdmin` em quase tudo, inclusive `ServiceRequestDelete` (excluir; **a extensão nunca usa**), `ServiceRequestManageOthers`, `ServiceRequestViewOthers`, `ServiceRequestAssignResponsible`, `ServiceRequestConclusion`, `ServiceRequestPayrollReopen`, `ServiceRequestEvaluation`, `SetupParameters`, `SetupClientUser`, `ManifestoReview/Enable`, `CNDView/CNDEnable` e **`Settings.DisplayPII`** (ver dados pessoais). Um analista comum provavelmente **não** tem várias dessas: a extensão deveria ler o mapa e esconder o que a pessoa não pode (Distribuir sem `AssignResponsible`, Equipe sem `ManageOthers`, listas sem `Service*`), em vez de descobrir pelo 403. E sem `DisplayPII` o Onvio pode mascarar CPF/salário: tratar campo ausente ou mascarado como normal.
- **164 chaves de funcionalidade** (`InfrastructureAccessControls`), por exemplo `BR_ShowOnvioMessenger`, `BR_EnableBRNotificationForAttendance`, `ClientCenterShowDueDateInDocuments`, `ClientCenter_ShowClientDocsReadToggle`: mostram o que o Onvio liga ou desliga para o escritório.
- `ApplicationConfiguration`: `CompanyId`, `ContactId`, `ContabilFirmId`, `ContabilSeqLibId`, `Licenses`, `TestFirm`, `mfa` (a conta usa MFA).
- Telas de **Configurações → Parâmetros** (rótulos): ocultar empresas inativas, editar o acesso dos usuários do escritório por empresa, enviar link de acesso aos clientes, avisos por e-mail quando o cliente não visualiza (dias antes do vencimento), **prescrever solicitações pendentes com o cliente (dias)**, avisos por e-mail na entrega, **criar uma tarefa de Solicitação de Serviços no Processos (Gestta)**, e "manter desabilitado os campos não obrigatórios" para cada campo do cadastro (matrícula, cargo, departamento, sindicato, jornada, dados bancários, PIX, endereço, documentos...). A chamada que lê esses parâmetros ainda não foi vista (a tela não refez a chamada ao ser aberta).

### 9.3 Chamadas novas descobertas (não estavam nos mapeamentos)

| Chamada | O que parece ser | Estado |
|---|---|---|
| `notification-async/v1/counters` | contadores de notificações do Onvio (sino) | a ler (`rodarExtras`) |
| `br-news/v1/categories`, `br-news/v1/articles/shared` | notícias/avisos do escritório para clientes (a permissão `NewsManagement` existe) | a ler |
| `cnd/v1/clients` | clientes habilitados em CND (ID, Cliente, Inscrição, Situação, Habilitado em) | a ler; histórico de CND ainda sem chamada vista |
| `manifesto/v1/clients` | clientes na Manifestação de NF-e; a consulta de notas (chave, emissão, número, emitente, CNPJ/CPF, valor) precisa de cliente + datas | a ler |
| `br-gestta-dashboard/v1/statistics/company/{id}/tasks` e `/liable-tasks` (parâmetros `start`, `end`) | estatísticas de tarefas do Gestta no Onvio Gestão (por responsável) | a ler; **candidato a trazer os atrasos do Processos** |
| `br-platform-preference/v1/department-alert` | alerta/preferência por departamento | a ler |
| `br-platform-preference/v1/companies/{id}/employees/handle-client-access`, `br-default-department/v1/companies/{id}/initial-data-load(/status)` | nomes sugerem **mudança de estado**; o script não faz GET neles | deixar de fora |
| `profiles/v1/accounts?active&hideNonOnvio`, `provisioning/v1/licenses`, `profiles/v1/themes` | contas, licenças e tema do escritório | a ler |
| `profiles/v2/company-preferences/applications/BR_ATENDIMENTO/categories/HIDE_INACTIVE_CLIENTS` | parâmetro "ocultar empresas inativas" | a ler |
| `notes/v1/comments/search`, `storage/v1/folders?includeTaxAccounting` | comentários e pastas de documentos | a ler (só formato) |
| `core/v3/companies/{id}/clients/{id}?expand&frp` e `/main` | ficha do cliente | `/main` a ler |
| `security/v1/jwt/sessions`, `security/v1/sessions`, `security/v2/environments`, `auth/v1/environments` | **sessão/tokens**: não ler | proibido |

Todas as "a ler" estão em `__inventarioOnvio.rodarExtras()` (mesmas travas: só GET, só `/api/`, só formato, sem valores).

### 9.4 O que o navegador guarda (só nomes e tamanhos)

- **Tokens ao alcance de qualquer script da página**: `onvio-uds-token` (local e session storage), `tr-auth-token` (sessionStorage, ≈731 bytes) e o cookie `UDSLongToken` (visível ao JavaScript). A extensão **nunca lê** esses valores (o `Authorization` que usa vem da própria chamada da página, na memória, `acao-hook.js`).
- Úteis e inofensivos: `cc-active-client` (id do cliente que está aberto na tela), `ccTheme`, `ccLanguage`, `localSettings` (≈2 KB de ajustes), `onvio.dms.itemsPerPage`, `linkAccessCounts`, `persist:viewer-default`, `persist:search-default` (pode ter termos de busca: não ler).
- IndexedDB: `onvio.dms.cache` (cache do Onvio Drive, v8) e três bases do Pendo. Service worker do Angular em `/clientcenter/pt/` e caches `ngsw:*`.
- Frameworks: Portal em **Angular 11.2.14** + Wijmo; Gestão em **Angular 13.4** + AngularJS + single-spa (`webpackChunk_onvio_staff`). A página tem WebSocket e EventSource.
- Os globais `__controlOnvioAcao` e `__controlOnvioAutorizacao` aparecem nas páginas do **Portal**, confirmando que o `acao-hook.js` está ativo ali; no Gestão **não** aparecem (de propósito: a extensão só atua no Portal).

### 9.5 Telas do Portal e do Gestão (colunas reais)

- **Solicitações → Geral** (grade Wijmo): `identifier`, Ações, `status`, `lastUpdated`, `department`, `subject`, `nickName`, `client`, `assignedTo`, `dueDate`. Menu "Mais": Excluir, Copiar link para o cliente, Encaminhar para, Definir responsável, Alterar Expectativa, Imprimir.
- **CND → Histórico**: `displayStatus`, `issueDate`, `dueDate`, `agency` (órgão), `clientId`, `client`, `inscription`; botões Renovar Certidão, Exportar. **CND → Habilitação**: `codee`, `client`, `federalNumber`, `clientEnblStatus`, `enablingDate`.
- **Manifestação de NF-e**: abas Operações, Em processamento, Falhas, Consulta; colunas `documentKey`, `emissionDate`, `documentNumber`, `doingBusinessAs`, `nationalIdentity`, `amount` (+ colunas ocultas "em processamento", "manifestação", "mensagem de rejeição").
- **Relatórios → Clientes**: filtros Ordem/ID/Razão social/Cidade/Situação (todos, ativo, inativo), botão Gerar relatório (gera arquivo; provavelmente POST).
- **Onvio Gestão → Documentos do cliente**: colunas `view.storageType`, `view.onvioApp`, `name`, `isShared`, `view.year`, `view.date`; abas Todos, do Cliente, do Escritório, Meus, Atividades Recentes, Lixeira, Comunicações. **Onvio Gestão → Processos**: painel com cartões de Cadastro de usuários, Onvio Processos, Grupos de permissões, CNDs, Documentos, Solicitações de serviços.
- A página inicial do Gestão sozinha chama as **10 listas 7 vezes** (contadores): a carga da extensão (10 chamadas por verificação) é pequena perto do que o próprio Onvio faz.

## 10. O que muda para a extensão (propostas, nada implementado)

Em ordem de valor e baixo risco:

1. **Adaptar à permissão do usuário**: ler `FeatureResourcePermissionsMap.BRAtendimento` na sessão (sem tokens) e esconder Distribuir, Equipe, ações de responsável e de reabertura de quem não pode. Hoje isso só aparece como 403.
2. **Quem escreveu o trâmite**: usar `isStaffCenterEnabled`/`isClientCenterEnabled` do contato (ou o `userId`) no lugar de palavras para decidir se a vez é do escritório. Mais exato, e já existe uma leitura por trâmite. Só o veredito, sem guardar o contato.
3. **Data de abertura (`created`)**: a extensão já guarda (`normalize`); a grade do Onvio não mostra. Dá para exibir "aberta há N dias" na lista sem nenhuma chamada nova.
4. **Código do empregado no Domínio (`integrationCode`)** já vem na lista: pode aparecer no detalhe/busca (já tem o cabeçalho "Código do empregado"); **não guardar** (identifica pessoa).
5. **Sinalizadores do cliente** (`allowEmployeeRegistration`, `sendingEsocial`, `isOnvio`): explicam por que um cadastro "não passa" (ex.: cliente sem envio eSocial) e podem virar aviso.
6. **Gestta**: as estatísticas de tarefas (`br-gestta-dashboard`) podem trazer os atrasos de Processos por responsável para o Hoje. Depende de `rodarExtras` mostrar o formato e de decidir se a extensão pode ler do Gestão (hoje só atua no Portal; é a mesma API em `onvio.com.br`, então não exige nova permissão de site).
7. **CND e Manifestação de NF-e**: listas de clientes habilitados e certidões a vencer (campo `dueDate` do histórico) viram um painel de vencimentos, igual ao das guias.
8. **Contador de notificações e notícias** (`notification-async/v1/counters`, `br-news`): só se o Josué quiser ver isso no Hoje.

Não propor: ler os tokens do armazenamento, ler `security/v1/*sessions` e `jwt`, falar com `api.gestta.com.br`/`ws.gestta.com.br`/Domínio Empresa, nem qualquer chamada de `initial-data-load` e `handle-client-access`.

### Privacidade: o que muda para a regra de armazenamento

Como a **lista** já traz CPF, salário, descrição e comentários, tudo isso passa pela memória da extensão a cada leitura. O que fica gravado continua sendo só a lista branca de `OC.normalize` (ID, situação, datas, cliente, empregado/assunto, responsável, departamento). Vale um teste que **falha se um campo novo entrar no armazenamento sem passar pela lista branca** (CPF, `wage`, `description`, `comments`, `nationalIdentity`, `cpf`).

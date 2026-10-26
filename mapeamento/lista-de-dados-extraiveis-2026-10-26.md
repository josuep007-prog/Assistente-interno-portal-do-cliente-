# Lista de tudo o que dá para extrair do Onvio hoje

Consolidado em 26/10/2026 a partir das quatro rodadas reais do `inventario-onvio.js` (Portal do Cliente e Onvio Gestão, com o usuário do escritório) e dos mapeamentos anteriores. Tudo abaixo está **confirmado** (a chamada respondeu 200 e o formato foi registrado), salvo onde diz "a confirmar". Detalhes e contexto: `inventario-de-dados-2026-10-26.md`.

Colunas: **Uso** = o que a extensão faz hoje com o dado. *Guarda* = fica no armazenamento (só os campos do resumo). *Mostra* = lido na hora e exibido, nunca gravado. *Não usa* = disponível, a extensão ainda não lê. **Sens.** = sensibilidade: **P** pessoal sensível (nunca guardar), **C** dado de cliente, **O** operacional do escritório, **T** técnico/configuração.

Como ler: toda chamada é `GET https://onvio.com.br/api/...` com a sessão do usuário; o que o usuário não pode ver volta 401/403.

## 1. Solicitações (10 listas)

Listas: Geral, Cadastro de empregado, de contribuinte e de estagiário, Aviso e Cálculo de férias, Aviso e Cálculo de rescisão, Afastamento, Rubricas. Tamanho da base em 26/10: Geral 1.412 · Cad. empregado 1.553 · contribuinte 5 · estagiário 86 · Aviso de férias 923 · Cálculo de férias 1.059 · Aviso de rescisão 611 · Cálculo de rescisão 1.148 · Afastamento 1.459 · Rubricas 1.740.

### 1.1 Em toda lista (sem abrir a solicitação)
| Dado | Campo | Uso | Sens. |
|---|---|---|---|
| ID interno (GUID) e número da tela | `id`, `identifier` | Guarda | O |
| Situação (código) | `genericStatus` | Guarda | O |
| Data de abertura | `created` | Guarda | O |
| Último trâmite | `lastUpdated`/`genericLastUpdated` | Guarda | O |
| Alterada em | `changed` | Não usa | O |
| Expectativa de conclusão do cliente | `dueDate` | Guarda | O |
| Tipo da solicitação / meio de solicitação | `serviceRequestType`, `requestWay` | Não usa | O |
| Departamento (Geral) | `departmentId` | Guarda | O |
| Assunto (Geral) | `subject` | Guarda | C |
| **Descrição completa** | `description` | Mostra (nunca guarda) | C/P |
| Cliente: nome, apelido, código, id | `clientExpanded.{name,nickname,code,id}` | Guarda | C |
| Cliente: id do contato | `clientExpanded.contactId` | Não usa | T |
| Cliente: usa Onvio | `clientExpanded.isOnvio` | Não usa | O |
| Cliente: pode cadastrar empregado | `clientExpanded.allowEmployeeRegistration` | Não usa | O |
| Cliente: envia eSocial | `clientExpanded.sendingEsocial` | Não usa | O |
| Cliente: detalha ausência / lançamento de serviço | `clientExpanded.detailAbsentDay`, `detailServiceEntry` | Não usa | O |
| Responsável: nome, id, id do contato | `staffResponsibleExpanded.{name,id,contactId}` | Guarda nome e id | O |
| Solicitante | `requesterExpanded.name` | Guarda | C |
| Empresa (office) | `companyId` | Não usa | T |

### 1.2 Cadastros (empregado, contribuinte, estagiário), já na lista
Nome, nome social, **CPF** (`nationalIdentity`), **salário** (`wage`), data de admissão/início (`admissionDate`, `startDate`), fim, fim da prorrogação, dias de experiência, dias de prorrogação, jornada diária/semanal/mensal, cartão de ponto, matrícula, primeiro emprego, professor, vínculo, categoria eSocial, tipo de cadastro, `clientStatus`, `lastStatusChanged`, observações (`comments`).
Uso: guarda a data de admissão e o nome (resumo); o resto só **mostra** no detalhe. **Sens.: P** (CPF, salário, nome, observações).

### 1.3 Férias, rescisão, afastamento, já na lista
- Empregado (`clientEmployeeExpanded`): nome, **CPF**, data de admissão, situação (ativo/inativo), sexo, cargo (código), carga horária, **código do empregado no Domínio** (`integrationCode`), `integrationId`, id. Uso: guarda só o nome; o código aparece no detalhe como "Código do empregado". **Sens.: P**.
- Rescisão: data de rescisão, data do aviso prévio, motivo (`terminationReasonId`), tipo (`terminationType`: trabalhado, indenizado, dispensa). Uso: guarda o tipo de aviso.
- Afastamento: data (`leaveDate`), tipo (`employeeLeaveTypeId`). Uso: guarda o tipo.

### 1.4 Rubricas, já na lista
Competência (`effectiveDate`), tipo de lançamento (`entryType`), indicadores de ausência e de lançamento de serviço. Uso: guarda competência e tipo.

### 1.5 Só no detalhe (`?expand=all`; 1 chamada por solicitação)
- **Todas:** anexos (`attachmentsExpanded`: id, nome, `size`, `deletedAttachment`, `staticFilePath`) e **quem abriu** (`createdByContactExpanded`). Uso: mostra.
- **Cadastro de empregado/estagiário/contribuinte:** dados pessoais (`employeeRegistrationPersonalExpanded`: nascimento, sexo, estado civil, raça, escolaridade, naturalidade, nacionalidade, filiação, RG e órgão emissor, título de eleitor, CNH, endereço completo, telefones, e-mails, tipo sanguíneo, fator RH, observações), dados profissionais (`employeeRegistrationProfessionalExpanded`: PIS, carteira de trabalho, benefícios, contribuição sindical, forma de pagamento/banco), **dependentes** (nome, nascimento, tipo, IRRF), cargo, departamento, sindicato, jornada (cada um com `integrationCode`), dados de estágio (instituição, nível, natureza). Uso: mostra. **Sens.: P**.
- **Rescisão:** motivo completo (`terminationReason`: descrição, se tem cálculo, se tem aviso prévio, se vale para estágio). **Afastamento:** tipo completo (`description`, `enableCat`; CAT: data, número, tipo). **Rubricas:** cabeçalho da configuração e empregados/eventos lançados. Uso: mostra.

### 1.6 Trâmites (`.../topics`; 1 chamada por solicitação)
Número do trâmite, situação, data, **texto** (`description`), autor (`createdByContactExpanded`), anexos, `deletedTopic` (trâmite excluído; Geral e folha). Uso: mostra e analisa (1º trâmite, vez, pedido ao cliente), cache do veredito só em memória. **Sens.: C/P**.

## 2. Pessoas e clientes

| Dado | Chamada | Campos | Uso |
|---|---|---|---|
| Contato (quem escreveu) | `core/v7/companies/{id}/contacts/{id}` | nome completo, cargo, empresa, `userId`, e-mails (com principal), telefones, endereços, categorias, **`isStaffCenterEnabled` / `isClientCenterEnabled`** | Não usa |
| Usuário | `profiles/v1/users/{userId}` | id, `email`, nome, sobrenome, idioma, `licensee` | Não usa |
| Empregados do cliente | `br-payroll-sr/v1/clients/{id}/employees` | nome, **CPF**, admissão, situação, sexo, cargo, carga, `integrationCode`, vínculo (EMPLOYEE/INTERN) | Não usa (**P**) |
| Clientes de CND (1.053) | `cnd/v1/clients` | nome, código, situação, CNPJ/CPF, **inscrição municipal e estadual**, UF, município (IBGE), `isOnvio` | Não usa |
| Clientes de NF-e (1.054) | `manifesto/v1/clients` | nome, apelido, código, ativo, situação, CNPJ/CPF, UF, `certificateExpanded` (certificado digital; conteúdo a confirmar) | Não usa |
| Ficha do cliente | `core/v3/companies/{id}/clients/{id}?expand&frp` | formato desta chamada ainda não registrado (a confirmar) | Não usa |
| Equipe do escritório | `core/v3/companies/{id}/employees/search` | nome, departamento, usuário (do mapeamento de 22/10) | Mapeado em 22/10; hoje a equipe do DP vem das regras (`equipeDP`) |

## 3. Escritório, acesso e configuração

| Dado | Chamada | Conteúdo | Uso |
|---|---|---|---|
| Departamentos (22) | `br-default-department/v1/department` | id, código, nome, padrão, criado/alterado | Usa os ids do Pessoal (de fábrica em `departamentosDP`) |
| Acesso do usuário | `br-payroll-sr/v1/company-department-access` | departamento do usuário | Guarda (setores) |
| Tipos de afastamento (39) | `br-payroll-sr/v1/employee-leave-types` | id, descrição, `enableCat`, visível | Usa (acidente) |
| Motivos de rescisão (33) | `.../termination-reasons` | id, descrição, cálculo, aviso, estágio, ordem | Usa para traduzir |
| Motivos e categorias eSocial (18 e 14), vínculos (15), categorias (10) | `.../esocial-reasons`, `esocial-categories`, `employment-relationships`, `categories` | chave de tradução e valor | Usa para traduzir |
| Prescrição | `service-requesting/v1/ticket-prescriptions` e `br-payroll-sr/v1/ticket-prescriptions` | ativa e nº de dias | Guarda a regra |
| Preferência da lista | `profiles/v1/preferences?...` | mais novas primeiro, vista expandida | Não usa |
| Parâmetro "ocultar empresas inativas" | `profiles/v2/company-preferences/.../HIDE_INACTIVE_CLIENTS` | texto de preferência | Não usa |
| Conta do escritório | `profiles/v1/accounts` | nome da conta/empresa, ids, **Staff Center e Client Center ativos, `creditHold`, `firmLock`**, produto, data de criação | Não usa |
| Configuração do escritório | `core/v3/companies/{id}/main` | proprietário, cliente-empresa, formatos de nome, moeda, aprovações | Não usa |
| Licenças | `provisioning/v1/licenses` | pares `feature`/`resource` | Não usa |
| Notícias | `br-news/v1/articles/shared`, `/categories` | título, chamada, conteúdo, publicação, visibilidade, destinatário, lido por | Não usa |

## 4. Sessão, permissões e roteamento

| Dado | Fonte | Conteúdo | Uso |
|---|---|---|---|
| Permissões do usuário | `security/v1/session-and-bindings` → `FeatureResourcePermissionsMap` | 11 grupos: BRAtendimento (28), OnvioSetup (31), OnvioDrive (28), BRCertificados, BRCnd, Reports, Platform, Applications… | Lê só o perfil escritório × cliente |
| Chaves de funcionalidade | `InfrastructureAccessControls` | 164 nomes (`BR_ShowOnvioMessenger`, `ClientCenterShowDueDateInDocuments`…) | Não usa |
| Configuração da aplicação | `ApplicationConfiguration` | `CompanyId`, `ContactId`, `ContabilFirmId`, `ContabilSeqLibId`, `Licenses`, `TestFirm`, `mfa` | Não usa |
| Mapa de serviços | `RoutingTable` | 854 serviços (677 em `onvio.com.br`, 156 internos, ~20 hosts externos como Gestta e Domínio) | Não usa |
| **Segredos (nunca ler)** | mesma chamada; `localStorage`/`sessionStorage`; cookie `UDSLongToken` | `SeamlessAuthenticationToken`, `LongToken`, `onvio-uds-token`, `tr-auth-token` | **Proibido** |

## 5. Documentos e comunicações (Onvio Drive)

| Dado | Chamada | Campos | Uso |
|---|---|---|---|
| Árvore de pastas | `storage/v1/folders?includeTaxAccounting` | nome, tipo, nº de documentos, quantos usuários leram, compartilhada, com arquivos/pastas, criado/alterado por e em, caminho para abrir | Não usa |
| Pasta raiz de um cliente | `storage/v1/projects?primaryAssociationId=...` | projeto raiz | Não usa |
| Conteúdo de pasta | `storage/v2/Projects|Folders/{id}/children` | nome, tipo MIME, tamanho, criado/alterado, **`isReadByClientUser`**, `customFields.dueDate`, `customFields.clientId`, etiquetas, permissões, links | Não usa |
| Caminho da pasta | `storage/v1/folders/{id}/ancestors` | ancestrais | Não usa |
| Comunicações | `storage/v2/requests?...` | assunto, cliente, envio, expiração, visualizada, situação, tipo, destinatários, autor | Não usa |
| Comentários | `notes/v1/comments/search` | chamada vista; formato a confirmar | Não usa |
| Grade de documentos (Gestão) | tela | colunas: tipo, aplicativo, nome, compartilhado, ano, data | Não usa |

## 6. Telas do Portal (colunas que a grade mostra)

- **Solicitações Geral:** ID, Ações, Situação, Último Trâmite, Departamento, Assunto, Apelido, Cliente, Responsável, Expectativa de Conclusão.
- **CND histórico:** situação, data de emissão, data de vencimento, órgão, ID do cliente, cliente, inscrição (a chamada do histórico ainda não foi vista: a confirmar).
- **CND habilitação:** ID, cliente, inscrição, situação, habilitado em.
- **Manifestação de NF-e:** chave de acesso, data de emissão, número, emitente, CNPJ/CPF, valor, em processamento, manifestação, mensagem de rejeição (a consulta exige cliente e período: a confirmar).
- **Relatórios (clientes):** ordem, ID, razão social, cidade, situação. Gera arquivo (provável POST: não testado).
- **Configurações → Parâmetros:** opções de prescrição, avisos por e-mail, tarefa no Processos, campos do cadastro que ficam desabilitados.

## 7. Do navegador (só nomes e tamanhos; sem valores)

Chaves de `localStorage`/`sessionStorage` (ex.: `cc-active-client` = cliente aberto na tela, `ccTheme`, `ccLanguage`, `localSettings`), IndexedDB `onvio.dms.cache`, service worker `/clientcenter/pt/`, versões do Angular (11.2.14 no Portal, 13.4 no Gestão), cookies visíveis (nomes). Uso: nenhum.

## 8. Derivados (a extensão calcula, o Onvio não mostra)

Dias parada e dias úteis com a vez do escritório · de quem é a vez (escritório × cliente) · 1º trâmite · quem concluiu · gravidade G1 a G3 e o porquê (só gestor) · prazos legais (pagamento de férias e rescisão, eSocial da admissão, acidente) · prazo prometido pelo analista · "consideradas resolvidas" · prescrição calculada · carga por analista · carteira por cliente · nota de desempenho da equipe · histórico de atendimento por empresa · responsável sugerido · possível aba errada · sugestões de ação e uso incorreto do portal · previsão por empresa.

## 9. Ainda sem formato (a descobrir)

- Gestta: `br-gestta-dashboard/v1/statistics/company/{id}/tasks` e `/liable-tasks` responderam 500 (parâmetros). Fica para depois, por decisão do Josué.
- Contadores de notificação (`notification-async/v1/counters`: 200 sem corpo legível).
- Histórico de CND, consulta de NF-e, geração de relatórios, leitura dos Parâmetros, configuração de notificações, certificados digitais, chat, Processos (Gestão), CND por cliente.
- `batch-download` de anexos em lote (200 vazio): não resolvido.

## 10. O que a extensão nunca faz com isso

Nada é lido de `security/v1/*sessions`, `jwt`, nem dos tokens do navegador; nada de `api.gestta.com.br`, `ws.gestta.com.br` ou Domínio Empresa; nada de `initial-data-load` e `handle-client-access`; nenhuma exclusão. CPF, salário, CID, descrição, observações e anexos nunca vão para o armazenamento.

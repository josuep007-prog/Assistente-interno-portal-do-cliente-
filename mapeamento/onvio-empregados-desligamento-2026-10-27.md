<!-- Investigação feita pelo Claude no Chrome (somente leitura) a partir do prompt de mapeamento/prompt-claude-chrome-empregados-2026-10-27.md. Nome de empregado removido. -->
# Investigação: de onde o Onvio tira a lista de empregados e se há informação de desligamento

Data: 27/10/2026. Portal do Cliente (visão do escritório ControlTax). Investigação somente leitura: só requisições GET e navegação em telas. Nada foi criado, salvo ou alterado. Este documento não contém CPF, PIS, nascimento, e-mail, telefone, salário, tokens nem cookies. Nomes de empregados só aparecem quando vieram dos relatórios fornecidos pelo usuário, e a conferência foi feita por nome e matrícula.

## 1. Resposta curta

1. Não encontrei nenhum campo, rota ou tela do Onvio que diga explicitamente quem foi desligado. O campo `status` do empregado só trouxe `ACTIVE` em todas as variações testadas.
2. A única informação de desligamento está nas solicitações de Rescisão (`/termination-calculations` e `/prior-notice-terminations`), e só para quem passou pelo portal. Lá existem `resignationDate`, `terminationType` e `terminationReasonId`, mas o empregado embutido na solicitação também vem `ACTIVE`.
3. Em duas empresas conferidas contra relatórios do Domínio (YB e PLANT FERTIL), a lista de empregados do Onvio ficou igual ao Domínio: todos os demitidos estavam fora da lista e todos os admitidos estavam dentro. Isso vale mesmo quando não havia solicitação de rescisão no portal.
4. Não consegui reproduzir o caso de "demitido no Domínio que continua ativo no Onvio". Preciso de uma empresa em que isso aconteça para investigar.

## 2. Rotas testadas (todas GET)

Base: `/api/br-payroll-sr/v1`. As empresas A, B e C são empresas escolhidas por mim (A e C têm empregados, B não tem pela chamada atual).

| Caminho | Parâmetros | HTTP | Itens | Observação |
|---|---|---|---|---|
| `/clients` | `itemsPerPage=100&pageIndex=1..11` | 200 | 1.054 clientes únicos | `pageIndex` é 1-based: `pageIndex=0` repete a página 1. Campos do cliente: `allowEmployeeRegistration`, `isOnvio`, `sendingEsocial`, `code`, `contactId`, `detailAbsentDay`, `detailServiceEntry`, `nickname`, `type`, `name`, `id`, `apiVersion`. |
| `/clients/{id}/employees` | nenhum | 200 | A=4, B=1 | Todos ACTIVE. Sem `eprType` no item (só com `expand`). Em B o único é PARTNER. |
| idem | chamada atual: `eprType=EMPLOYEE&eprType=INTERN&expand=clientEmployeeRelationshipExpanded` | 200 | A=4, B=0, C=2 | Todos ACTIVE. Em A: 3 EMPLOYEE e 1 INTERN. |
| idem | `expand=all` | 200 | A=4, B=0 | Acrescenta `clientExpanded`, sem campo de desligamento. |
| idem | `+status=INACTIVE`, `+status=TERMINATED`, `+includeInactive=true` | 200 | A=4, B=0 | Resultado idêntico à chamada atual: os três parâmetros são ignorados. |
| idem | `eprType=PARTNER` | 200 | A=0, B=1 | Funciona. |
| idem | `eprType=EMPLOYEE` ou `eprType=INTERN` sozinhos | 200 | B=0 | — |
| idem | `eprType=OTHER` (sozinho ou com PARTNER) | 500 | — | Valor inválido (mensagem "HTTP 404 Not Found"). |
| `/clients/{id}/employees/{empId}` | `expand=all` | 200 | 1 | Mesmos campos da lista, nenhum a mais. |
| `/clients/{id}` | — | 404 | — | Não existe detalhe do cliente. |
| `/clients/{id}/employees/count` | — | 500 | — | Interpretou "count" como id ("Invalid UUID string"). |
| `/clients/{id}/terminations` | — | 404 | — | Não existe. |
| `/clients/{id}/employee-terminations` | — | 404 | — | Não existe. |
| `/employees` | `clientId={id}` ou sem parâmetro | 200 | 107 (5 páginas de 25) | O `clientId` é ignorado. Tipo `employeeV1Dto`, só `id`, `contactId`, `name`. Não é folha de cliente. |
| `/api/core/v3/companies/{id}/employees/search` | — | 405 | — | Só aceita outro método, que não foi testado (equipe do escritório, não folha do cliente). |
| `/termination-calculations` | `expand=all`, `orderBy=lastUpdated+desc`, `filter` por `client` | 200 | 1.152 no total | Embute `clientEmployeeExpanded`. |
| `/prior-notice-terminations` | idem | 200 | 611 no total | Aviso prévio de rescisão. |
| mesmas rotas | `orderBy=resignationDate` | 500 | — | Não dá para ordenar por esse campo. |
| mesmas rotas | `filter` com `by=clientId` ou `by=companyId` | 500 | — | O filtro por cliente aceita `by=client`, `op=EQ`. |
| `/api/br-default-department/v1/companies/{id}/initial-data-load/status` | — | 200 | 1 | `{companyId, status}` com `status = "Completed"`. É por escritório, não por cliente. |

## 3. Campos encontrados

### 3.1 Empregado (`/employees`, detalhe e embutido nas solicitações)

`type` (`clientEmployeeV1Dto`), `created`, `apiVersion`, `id`, `companyId`, `integrationId` (string de 32 caracteres), `integrationCode` (número), `hireDate`, `cpf`, `name`, `gender`, `jobPosition`, `employeeWorkload`, `status` (só `ACTIVE`), `clientEmployeeRelationshipExpanded` (`eprType`, `id`, `name`) e `clientExpanded` (campos do cliente).

- `integrationCode` é a matrícula do Domínio: nos 44 admitidos da YB e nos 5 da PLANT ele foi igual à "Matrícula eSocial" do relatório.
- `eprType` observado: EMPLOYEE, INTERN, PARTNER. A chamada atual da extensão (`EMPLOYEE` e `INTERN`) esconde os sócios.
- Não há campo de situação, desligamento, data de saída, nem de última sincronização.

### 3.2 Cliente (`/clients`)

`allowEmployeeRegistration` (cliente cadastra empregado): `true` em 153 dos 1.054 clientes. `isOnvio` e `sendingEsocial`: `false` nos 1.054 (não servem para distinguir nada). `detailAbsentDay` e `detailServiceEntry` são booleanos sem relação evidente com empregados.

### 3.3 Solicitações de rescisão (única fonte de desligamento)

- `termination-calculations`: `resignationDate`, `priorNoticeAdviceDate`, `terminationType` (observados `INDEMNIFIED`, `WORKED`, `ABSENSE_DISPENSATION`), `terminationReasonId`, `genericStatus` (número), `dueDate`, `lastUpdated`, `identifier`, `requestWay`, `serviceRequestType`, `subject`, `description`.
- `prior-notice-terminations`: `adviceDate`, `grantedBy`, `terminationReasonId` e os campos gerais.
- Com `expand=all` entram `clientEmployeeExpanded` (empregado, com `status`), `clientExpanded`, `createdByContactExpanded`, `requesterExpanded`, `staffResponsibleExpanded`, `terminationReason` e `attachmentsExpanded`.
- Nas 40 solicitações mais recentes, o empregado embutido veio `ACTIVE` em 40 de 40.

## 4. Telas e rotas de dados

Cada tela de Solicitações chama a sua rota de lista, mais três chamadas fixas (status de carga inicial, preferências do usuário, alerta de departamento) e a rota `core/.../employees/search` (equipe do escritório).

| Tela (menu Solicitações de Serviço) | Rota de dados |
|---|---|
| Geral | `service-requesting/v1/tickets/generic` e `br-default-department/v1/department` |
| Cadastro de Funcionários (abas Empregados, Contribuintes, Estagiários) | `br-payroll-sr/v1/employees-registrations` (e `taxpayers-registrations`, `interns-registrations`) |
| Férias | `br-payroll-sr/v1/prior-notice-vacations` (e `vacation-calculations`) |
| Rescisão (abas Aviso Prévio e Cálculo) | `br-payroll-sr/v1/prior-notice-terminations` e `termination-calculations` |
| Afastamento de Empregado | `br-payroll-sr/v1/employee-leave` |
| Lançamento de Rubricas | `br-payroll-sr/v1/payroll-entries` |

- Nenhuma tela de lista chama `/clients/{id}/employees`, e nenhuma tem filtro de situação do empregado (ativo, inativo, desligado). A coluna "Situação" é a da solicitação.
- O detalhe de uma solicitação de rescisão mostra: empregado, CPF, motivo da rescisão, "Concedido por" e "Data do aviso prévio". Não mostra situação do empregado.

## 5. Integração com o Domínio

- Configurações > Parâmetros não menciona integração com o Domínio nem sincronização de empregados. Tem "Ocultar empresas inativas das listagens" (marcada), a seção "Configurações de Cadastro de Empregados na Folha" (campos obrigatórios) e a escolha do departamento que acessa as solicitações de Cadastro de Funcionários, Férias, Rescisão, Afastamento de Empregado e Lançamento de Rubricas.
- Nenhuma tela visitada explica quando e como os empregados chegam do Domínio, nem se desligamentos são sincronizados.
- No cliente existe `allowEmployeeRegistration`, mas ele não explica sozinho quem tem lista: em uma amostra de 8 empresas, com `true` vieram 1, 6, 10 e 11 empregados e com `false` vieram 0, 0, 16 e 2.
- Não abri as telas "Usuários de Clientes" e "Notificações do Escritório".

## 6. Conferência com relatórios do Domínio

### 6.1 YB PRESTACAO DE SERVICOS LTDA (código 953)

| Relatório | No Onvio |
|---|---|
| 44 admitidos | 44 de 44 na lista, todos ACTIVE, `integrationCode` igual à matrícula nos 44. |
| 36 demitidos | 0 de 36 na lista. |
| Outros | Lista com 45 empregados (44 + 1 sócio PARTNER). A chamada atual devolve 44. |
| Solicitações de rescisão | 35 dos 36 demitidos têm Cálculo de Rescisão (`resignationDate` de 2026-06-19 a 2026-10-20). 0 de Aviso prévio. O empregado embutido vem ACTIVE (35 de 35). O 36º (um deles) não tem solicitação e também não está na lista. |

### 6.2 PLANT FERTIL CONSULTORIA E AGRIMENSURA LTDA

A PLANT tem 8 estabelecimentos no Onvio (660, 661, 662, 789, 795, 802, 816, 817). Só o 660 (12 empregados) e o 802 (1) têm lista; os outros 6 devolvem 0.

| Relatório | No Onvio |
|---|---|
| 5 admitidos | 5 de 5 no 660, ACTIVE, `integrationCode` e `hireDate` iguais ao relatório. |
| 12 demitidos | 0 de 12 na lista. |
| Solicitações de rescisão | 0 de Cálculo e 0 de Aviso prévio (filtro `client`). Os 12 saíram da lista sem nenhuma solicitação no portal. |
| Datas `created` do 660 | 11 em 2026-04-10 e 1 em 2026-09-11. Parece uma carga inicial em 10/04/2026 e inclusões depois (o admitido em 12/09/2026 foi criado um dia antes). |
| Fora do relatório | 8 empregados ACTIVE (7 no 660, incluindo 2 sócios, e 1 no 802). O relatório só lista admitidos e demitidos do período, então não dá para saber se estão ativos no Domínio. |

A mesma pessoa aparece como admitida em 2025 e demitida em 2025 com sobrenome diferente; no Onvio só existe o registro mais recente.

Interpretação: o Onvio parece retirar o empregado da lista a partir do Domínio, e não da solicitação do portal. É inferência: a regra de retirada não é visível.

### 6.3 Quem ainda aparece depois de uma rescisão pedida

Nas 40 solicitações de Cálculo de Rescisão mais recentes, olhando 3 empresas (15 solicitações): 13 empregados já saíram da lista e 2 ainda estão. Os 2 que ficaram têm `genericStatus = 1` e solicitação criada e atualizada em 27/10/2026. Os 13 que saíram têm `genericStatus` 3, 4, 5 ou 6. Isso sugere que o empregado só sai depois que a solicitação avança ou que o Domínio registra a rescisão. A amostra é pequena e não sei o que significa cada valor de `genericStatus`.

## 7. Correções feitas durante a investigação

- Paginação de clientes: `pageIndex` é 1-based. Com `pageIndex=0..10` eu li 1.100 itens com só 1.000 únicos; lendo a página 11 o total certo é 1.054.
- `allowEmployeeRegistration = true`: 153 clientes (não 146).
- A amostra de empregados das empresas A e C é de 7 empregados distintos (não 14): A=4 e C=3 (2 pela chamada atual e 1 sócio).

## 8. O que não consegui verificar

- Um caso real de demitido no Domínio que continue ACTIVE no Onvio. Para isso preciso de uma empresa em que isso ocorra e dos nomes.
- A regra que remove o empregado da lista e o intervalo entre a rescisão no Domínio e a saída da lista.
- O significado dos valores de `genericStatus`.
- O seletor "Empregado" dentro dos formulários de nova solicitação (não abri "Adicionar" para evitar o risco de criar solicitação), e se ele usa `/clients/{id}/employees`.
- As telas "Usuários de Clientes" e "Notificações do Escritório".
- O método HTTP de cada chamada de tela: as rotas das telas foram lidas pelo registro de recursos do navegador, que não mostra o método. Nenhuma requisição além de GET foi enviada.
- Se os 8 empregados da PLANT que não constam no relatório estão realmente ativos no Domínio.
- Quantas empresas foram usadas: além do limite de 3 combinado, usei 8 de amostra, 3 no cruzamento com rescisões, a YB e os estabelecimentos da PLANT, com autorização posterior do usuário. Também li a lista completa de clientes (11 páginas) e algumas rotas de solicitações.

## 9. Próximos passos sugeridos

1. Indicar uma empresa em que demitidos do Domínio ainda aparecem como ativos no Onvio, com os nomes, para repetir esta conferência.
2. Confirmar com o suporte da Thomson Reuters como e quando o Onvio retira o empregado após a rescisão no Domínio, e o significado dos valores de `genericStatus`.
3. Se a extensão precisar de lista fiel ao Domínio, usar o `integrationCode` (matrícula do Domínio) como chave de cruzamento com os relatórios.

# Mapeamento do Portal do Cliente Onvio para a extensão

Oct 13, 2026 · @Josué

## Resumo

A extensão é viável e pode ser construída só com leitura: todas as listas de solicitações e de documentos vêm de APIs JSON que respondem com a sessão do usuário logado, sem token extra.

Foram mapeados os 6 menus de Solicitações de Serviço (10 listas no total, contando as abas), o módulo Documentos do Onvio Gestão (abas, colunas e API) e os códigos de situação de cada tipo.

Principais achados para a extensão:

- Toda lista aceita filtro e ordenação por parâmetro (`filter`, `orderBy`, `searchText`, `assignedtome`), então um painel único consegue consolidar as 10 filas em poucas chamadas.
- A regra de prescrição está ativa no escritório: solicitação pendente prescreve com 30 dias (`prescribePendingTicketsDays: 30`). A extensão pode avisar antes disso.
- Muitas solicitações pendentes estão sem responsável definido (ex.: 9 de 12 nas Gerais, 8 de 10 no Cálculo de Rescisão no dia do mapeamento).
- Cada documento traz `isReadByClientUser` e `customFields.dueDate`, o que permite alertar guia não visualizada pelo cliente perto do vencimento.
- O filtro nativo "Apenas pendentes" não serve para Lançamento de Rubricas (devolve concluídas); a extensão precisa calcular pendência por tipo.

## Navegação e rotas

O Portal do Cliente é uma aplicação Angular em `https://onvio.com.br/br-portal-do-cliente/`. O menu superior tem: Notícias, Solicitações de Serviço, Documentos, CND, Manifestação de NF-e, Relatórios e Configurações. O item Documentos não fica no Portal: ele leva ao Onvio Gestão em `https://onvio.com.br/staff/#/documents/all`.

| Menu | Aba | Rota (após /br-portal-do-cliente/) |
| --- | --- | --- |
| Geral |  | `service-requesting/general` |
| Cadastro de Funcionários | Empregados | `service-requesting/payroll-registration/employee` |
| Cadastro de Funcionários | Contribuintes | `service-requesting/payroll-registration/partner` |
| Cadastro de Funcionários | Estagiários | `service-requesting/payroll-registration/intern` |
| Férias | Aviso prévio de férias | `service-requesting/vacation/prior-notice` |
| Férias | Cálculo de férias | `service-requesting/vacation/calculation` |
| Rescisão | Aviso prévio de rescisão | `service-requesting/termination/prior-notice` |
| Rescisão | Cálculo de rescisão | `service-requesting/termination/calculation` |
| Afastamento de Empregado |  | `service-requesting/employee-leave` |
| Lançamento de Rubricas |  | `service-requesting/payroll-entries` |

Outras rotas existentes no código: `settings/clients-users` (usuários dos clientes), `settings/parameters`, `settings/notifications`, `settings/employee-clients`, `reporting`, `da-reports`, `cnd`, `news`, `boxe/*` (caixa de NF) e `manifesto/*`. Há também um espelho `contabil-service-requesting/*` com os mesmos tipos, não exposto no menu atual.

A tela de detalhe de uma solicitação abre como sobreposição ("Visualização de Solicitação de Serviço", abas Dados da Solicitação e Trâmites) sem mudar a URL. Não existe link direto por ID; a extensão terá que abrir a lista já filtrada pelo ID.

## Solicitações de Serviço: telas e ações

Todas as listas seguem o mesmo padrão de grade (Wijmo), com Atualizar, Exportar, Adicionar, pesquisa livre, seletor de colunas, paginação (10 por página por padrão) e duas caixas no topo: "Solicitações que sou responsável" e "Apenas pendentes".

| Lista | Colunas da grade | Ações no botão MAIS |
| --- | --- | --- |
| Geral | ID, Ações, Situação, Último Trâmite, Departamento, Assunto, Apelido, Cliente, Responsável, Expectativa de Conclusão | Excluir, Copiar link da solicitação para envio ao cliente, Encaminhar para, Definir responsável, Alterar Expectativa de Conclusão, Imprimir |
| Cadastro (Empregados, Contribuintes, Estagiários) | ID, Ações, Situação, Último Trâmite, Empregado, Apelido, Cliente, Responsável, Data de admissão | Excluir, Encaminhado para outro usuário, Definir responsável, Imprimir |
| Férias e Rescisão (aviso e cálculo) | ID, Ações, Situação, Último Trâmite, Empregado, Apelido, Cliente, Responsável, Expectativa de Conclusão | Excluir, Encaminhado para outro usuário, Definir responsável, Expectativa de Conclusão |
| Afastamento | ID, Ações, Situação, Último Trâmite, Empregado, Apelido, Cliente, Responsável, Expectativa de Conclusão | mesmas de Férias |
| Lançamento de Rubricas | ID, Ações, Situação, Último Trâmite, Competência, Tipo de Lançamento, Apelido, Cliente, Responsável | mesmas de Férias |

Na coluna Ações há ainda dois ícones: o de setas abre o **Trâmite Rápido** (histórico resumido + caixa para incluir trâmite com anexo e mudança de situação) e o ícone de informação abre a visualização completa.

A visualização completa mostra no cabeçalho Solicitação, Apelido, Cliente, Solicitante e Expectativa de Conclusão; na aba Dados aparecem Departamento, Cadastrado por, Assunto, Descrição, Meio de Solicitação e Anexos; a aba Trâmites traz a conversa completa.

## Situações por tipo

O campo `genericStatus` da API tem significado diferente conforme o tipo de solicitação. A extensão precisa de um dicionário por tipo.

| Código | Geral, Férias, Rescisão, Afastamento | Cadastro de Funcionários | Lançamento de Rubricas |
| --- | --- | --- | --- |
| 1 | Sem análise | não observado | não observado |
| 2 | Em análise | Enviado para o escritório | não observado |
| 3 | Aguardando resposta | Aguardando o cliente | não observado |
| 4 | Respondido | não observado | Respondido |
| 5 | Concluído | Cadastro efetuado | Aguardando resposta |
| 6 | Prescrita | Concluído | Aguardando correção |
| 8 |  |  | Concluído |
| 10 |  |  | Prescrita |

**Correção de 14/10/2026:** pelos trâmites, "Aguardando resposta" (3) significa que o cliente escreveu e o escritório precisa responder; "Respondido" (4) é a vez do cliente, e é sobre ele que corre a prescrição de 30 dias. O campo `firmStatus` usado nos filtros tem os mesmos códigos de `genericStatus`.

Todos os pares acima foram conferidos comparando a API com a grade na tela, exceto Prescrita em Férias e Rescisão (deduzida por seguir o mesmo padrão de Geral e Afastamento).

**Códigos completos (filtro "Situação" da tela, 15/10/2026):** Geral, Férias, Rescisão e Afastamento: 1 Sem análise, 2 Em análise, 3 Aguardando resposta, 4 Respondido, 5 Concluído, 6 Prescrita, 7 Encaminhado para outro usuário, 8 Em análise interna (o 9 não existe na tela). Cadastro: 1 (só no "Apenas pendentes"), 2 Enviado para o escritório, 3 Aguardando o cliente, 4 Respondido pelo Cliente, 5 Cadastro efetuado, 6 Concluído, 7 Encaminhado para outro usuário. Rubricas: 1 Sem análise, 2 Em análise, 3 Importação realizada, 4 Respondido, 5 Aguardando resposta, 6 Aguardando correção, 7 (não aparece), 8 Concluído, 9 Encaminhado para outro usuário, 10 Prescrita. "Apenas pendentes" da própria tela: `firmStatus IN 1,2,3,7,8` (padrão), `IN 1,2,4,7` (Cadastro), `IN 1,2,3,4,9` (Rubricas). A extensão usa conjuntos maiores de propósito: inclui as que estão com o cliente (4 Respondido etc.), por causa da prescrição. Em Rubricas o filtro `NE 8` + `NE 10` dá **HTTP 500**.

O código do portal tem ainda estas situações, que podem aparecer: Em análise interna, Encaminhado para outro usuário, Importação realizada e Respondido pelo Cliente. As cores usadas pelo portal: Sem análise cinza, Em análise laranja, Aguardando cinza claro, Respondido azul, Concluído verde, Prescrita vermelho, Enviado para o escritório amarelo.

O filtro nativo "Apenas pendentes" usa outro campo, `firmStatus IN 1,2,3,7,8`, que não vem no JSON da lista.

## API das solicitações

Todas as chamadas abaixo responderam 200 com `fetch` simples a partir da página do Onvio (cookie de sessão). Base: `https://onvio.com.br/api/`.

| Lista | Endpoint (GET) | expand usado pela tela | Total em 13/10/2026 |
| --- | --- | --- | --- |
| Geral | `service-requesting/v1/tickets/generic` | clientExpanded, staffResponsibleExpanded, requesterExpanded | 1.366 |
| Cadastro: Empregados | `br-payroll-sr/v1/employees-registrations` | clientExpanded, staffResponsibleExpanded | 1.527 |
| Cadastro: Contribuintes | `br-payroll-sr/v1/taxpayers-registrations` | idem | 2 |
| Cadastro: Estagiários | `br-payroll-sr/v1/interns-registrations` | idem | 83 |
| Aviso de férias | `br-payroll-sr/v1/prior-notice-vacations` | clientEmployeeExpanded, clientExpanded, staffResponsibleExpanded | 906 |
| Cálculo de férias | `br-payroll-sr/v1/vacation-calculations` | idem | 1.039 |
| Aviso de rescisão | `br-payroll-sr/v1/prior-notice-terminations` | idem | 603 |
| Cálculo de rescisão | `br-payroll-sr/v1/termination-calculations` | idem | 1.122 |
| Afastamento | `br-payroll-sr/v1/employee-leave` | idem | 1.442 |
| Rubricas | `br-payroll-sr/v1/payroll-entries` | clientExpanded, staffResponsibleExpanded | 1.722 |

**Parâmetros de lista:** `itemsPerPage` (aceitou 200), `pageIndex` (começa em 1), `startIndex`, `orderBy` (ex.: `lastUpdated desc`), `assignedtome` (true/false), `searchText` e `filter`. O `filter` é um JSON: `{"groups":[{"useOr":false,"items":[{"by":"firmStatus","op":"IN","value":"1,2,3,7,8"}]}]}`. Operadores vistos no código: EQ, NE, GT, GE, LT, LE, BW, EW, CT, NC, IN. Campos filtráveis declarados: identifier, firmStatus, clientStatus, lastUpdated, name, clientName, staffName, admissionDate, searchText.

**Resposta:** `{items:[…], itemsPerPage, pageIndex, startIndex, totalItems, totalPages}`.

**Campos úteis por item:** `id` (GUID), `identifier` (ID da tela), `genericStatus`, `lastUpdated`, `created`, `dueDate` (Expectativa de Conclusão, existe em Geral, Cálculo de férias, Cálculo de rescisão e Afastamento), `subject`, `description`, `departmentId`, `requestWay` (WEB), `clientExpanded.{code,name,nickname}`, `staffResponsibleExpanded.name`, `requesterExpanded.name`. Cadastro traz também nome, CPF, salário, admissão, experiência e observações. Rubricas traz `effectiveDate`, `entryType` e `genericLastUpdated` no lugar de `lastUpdated`.

**Trâmites (confirmado no Onvio real em 15/10/2026, ver `onvio-2026-10-15.md`):** `GET {base}/{id}/topics?expand=all&itemsPerPage=1000&orderBy=created asc&pageIndex=0`, com `{id}` = GUID do item (campo `id`), nunca o número. A base **não** é a da lista:

| Listas | Base dos trâmites |
| --- | --- |
| Geral | `service-requesting/v1/tickets` |
| Cadastro empregado, contribuinte e estagiário | `br-payroll-sr/v1/employees-registrations` |
| Aviso e cálculo de férias, aviso e cálculo de rescisão, afastamento | `br-payroll-sr/v1/tickets` |
| Lançamento de rubricas | `br-payroll-sr/v1/payroll-entries` |

O caminho da lista + `/topics` dá 404 (ex.: `prior-notice-vacations/{id}/topics`, `tickets/generic/{id}/topics`). Resposta `{items:[…], totalItems, …}`; cada trâmite traz `created`, `status`, `description`, `createdByContactExpanded.name`, `attachmentsExpanded` e um número (`number`, `employeeRegistrationTopicNumber` ou `payrollEntryTopicNumber`). Trâmite Rápido e visualização completa usam a mesma chamada. Desde a 0.12.0 a extensão usa esses caminhos fixos (o "aprender a rota" da 0.11.1 saiu).

**Detalhe (aba Dados):** `GET {lista}/{id}?expand=all`; em Rubricas é `br-payroll-sr/v2/payroll-entries/{id}`. Usado desde a 0.13.0 na aba Dados (tudo, na hora, sem guardar) e para as datas de férias e rescisão (`vacationStartDate`, `adviceDate`, `resignationDate`), que dão o prazo legal de pagamento.

**Expectativa de conclusão (`dueDate`):** é a data que o cliente informa; não é prazo do escritório e, desde a 0.13.0, não conta como vencimento.

**Distribuição (0.13.0):** lê sob demanda cada lista em todas as situações, `orderBy=lastUpdated desc`, até a primeira solicitação mais antiga que o período (no máximo 5 páginas de 200 por lista). Busca do cálculo do mesmo empregado: `searchText` com o nome na lista de cálculos (a confirmar se o Onvio busca pelo nome do empregado).

**Ações (mapeadas na empresa de teste em 15/10/2026, `acoes-2026-10-15.md`; usadas desde a 0.14.0):** trâmite `POST {tramites}/{id}/topics` `{description, status}` (201, id do trâmite no cabeçalho `location`; não existe trâmite sem situação; seletor: 2, 8, 4, 5, e depois de Respondido só 4 e 5; o 1º trâmite define o responsável); encaminhar = trâmite com `status 7` e `forwardedToExpanded` (`{departmentId, id}` na Geral, `{id}` na folha); anexo `POST {tramites}/{id}/topics/{topicId}/attachments` multipart, campo `file[]`; responsável `PUT {lista}/{id}/assign-staff` (`{departmentId, id}` na Geral, `{id}` na folha; só sem responsável na folha e não em Respondido na Geral; não há em lote); expectativa `PUT tickets/generic/{id}/change-due-date` `{dueDate}` (folha não testada). Cadastro e Rubricas: trâmite e anexo mapeados em 19/10/2026 (`tramites-cadastro-rubricas-2026-10-19.md`; os 3 Cadastros postam em `employees-registrations/{id}/topics`, Rubricas em `payroll-entries/{id}/topics`; opções por situação atual no documento); encaminhar (`status` 7 no Cadastro, 9 em Rubricas, `forwardedToEmployeeExpanded {id}`; o Cadastro dá 400 a partir do status 3) e responsável (`PUT employees-registrations/{id}/assign-staff {id}`, só sem responsável; em Rubricas o caminho `payroll-entries/{id}/assign-staff` é o mesmo padrão, a confirmar) usados desde a 0.28.0; expectativa: a tela não oferece (só a visão do cliente cria solicitações). A 1ª leitura às vezes dá 503 e a tela repete: a extensão repete uma vez.

**Ações vistas no código antes do mapeamento:** `{tipo}/assign-staff` (definir responsável), `{tipo}/change-due-date`, `{tipo}/{id}/print-detail`, download em lote de anexos `…/{id}/attachments/batch-download/{tipo}`, inclusão e exclusão de trâmite e de anexo.

**Download de anexos (a confirmar, v0.20.0):** o caminho do download não foi mapeado. Os anexos vêm em `attachmentsExpanded` (`id`, `name`; `staticFilePath` em Cadastro e Rubricas). Desde a 0.20.0 o `acao-hook.js` percebe quando o próprio Onvio baixa um anexo (GET em `…/attachments|files|download…` com resposta que não é a lista em JSON) e o service worker guarda só o molde (`OC.moldeDeAnexo`: ids viram `{segmento anterior}`, nome do arquivo vira `{nome}`, tokens não são aprendidos) em `rotasAnexo`. O botão "Anexos" do detalhe usa esse molde (`OC.urlAnexo`) num GET feito pela aba. Para mapear de vez: `mapeamento/prompt-pendencias-onvio.md` (roteiro único do que falta, 16/10/2026).

**Criar solicitação (usado desde a 0.17.0, só Geral):** `POST service-requesting/v1/tickets/generic` `{serviceRequestType, clientExpanded:{id}, departmentId, description, subject, requestWay, requesterExpanded:{}}` → 201 sem corpo (a extensão acha a nova na lista Geral pelo assunto e cliente). Os valores de `serviceRequestType` e `requestWay` usados pela tela do escritório ainda não foram anotados: a extensão copia de uma Geral recente (`?expand=all`) e o departamento vem de `company-department-access`; o arquivo de regras pode fixar (`criacao`). Confirmar com `prompt-criacao-onvio.md`. Aviso de férias: `POST br-payroll-sr/v1/prior-notice-vacations` (201, `location`), ainda não usado.

**Apoio:** `br-default-department/v1/department` (22 departamentos), `service-requesting/v1/ticket-prescriptions` e `br-payroll-sr/v1/ticket-prescriptions` (regra de prescrição: ativa, 30 dias), `br-payroll-sr/v1/company-department-access`, `core/v3/companies/{id}/employees/search` (funcionários do escritório) e `service-requesting/v1/gestta/task/service-order` (integração com o Gestta, não testada).

## Documentos (Onvio Gestão)

O módulo de documentos roda em `https://onvio.com.br/staff/#/documents/…` (AngularJS, título "Onvio Gestão"). Abas: Documentos do Cliente, Documentos do Escritório, Meus Documentos, Lixeira e Comunicações.

**Documentos do Cliente:** seletor "Ao Cliente" no topo, árvore de pastas à esquerda (Administrativo, Certidão Negativa de Débito, Contabilidade, Financeiro, Fiscal, Patrimônio, Pessoal, Registro de Empresas) e grade com Tipo, Nome, Visualizado pelo Cliente, Compartilhado, Vencimento, Comentários, Histórico, Data de Modificação, Data de Criação e Tamanho. Há filtro rápido Todos / Não Visualizados / Visualizados e os botões Novo, Upload, Abrir, Gerenciar, Nuvem e Subir um nível.

**Comunicações:** grade com Tipo, Cliente, Data de Envio, Vencimento, Expiração, Andamento, Status, Destinatário, Adicionado Por e Alterado Por.

| Uso | Endpoint | Observação |
| --- | --- | --- |
| Pasta raiz do cliente | `GET storage/v1/projects?primaryAssociationId=…&primaryAssociationType=Client` | devolve o projeto (raiz) do cliente |
| Conteúdo da raiz | `GET storage/v2/Projects/{id}/children` | params: from, pageSize, sort=name:asc, containersOnly, trashed, countDocuments, calculateLocks |
| Conteúdo de pasta | `GET storage/v2/Folders/{id}/children` | mesmos params; resposta em `data.items`, com `hasMore` |
| Caminho da pasta | `GET storage/v1/folders/{id}/ancestors` |  |
| Comunicações | `GET storage/v2/requests?requestTypes=Approval&requestTypes=Informational&requestTypes=Send&requestTypes=Outlook&sort=createdDate:desc` |  |
| Busca global de documentos | `storage/v1/containers/documents/search` e `/count` | encontrado no código, não testado |
| Clientes | `core/v3/companies/{id}/clients/search` |  |

**Campos de um documento:** `name`, `mimeType`, `originalItemSize`, `createdDate`, `modifiedDate`, `isReadByClientUser` (visualizado pelo cliente), `customFields.dueDate` (vencimento), `customFields.clientId`, `userTags`, `permissions.*`, `staffCenterViewPath` e `clientCenterViewPath` (links prontos para abrir). Pastas trazem `readUserCount`, `isShared`, `hasFiles` e `documentCount`.

**Campos de uma comunicação:** `subject`, `clientName`, `sendDate`, `expirationDate`, `isViewed`, `status`, `communicationStatus`, `requestType`, `recipients`, `createdBy.name`.

## Retrato das pendências em 13/10/2026

No dia do mapeamento havia 82 solicitações pendentes no filtro nativo, 32 delas sem responsável e 52 sem movimentação há mais de 5 dias corridos. É exatamente o que a extensão deve mostrar sem o analista precisar abrir 10 telas.

| Lista | Pendentes | Sem responsável | Parada há mais de 5 dias |
| --- | --- | --- | --- |
| Cadastro: Empregados | 25 | 3 | 18 |
| Cálculo de férias | 19 | 8 | 15 |
| Geral | 12 | 9 | 3 |
| Aviso de férias | 10 | 3 | 8 |
| Cálculo de rescisão | 10 | 8 | 4 |
| Cadastro: Estagiários | 3 | 0 | 3 |
| Aviso de rescisão | 3 | 1 | 1 |
| Afastamento | 0 | 0 | 0 |

Lançamento de Rubricas ficou fora: o filtro "Apenas pendentes" devolveu 1.574 itens, quase todos concluídos, porque os códigos desse tipo são outros.

## Proposta de funcionalidades

A proposta é começar só com leitura (fase 1), que já cobre o controle, e deixar ações que alteram dados para a fase 2. Os prazos usados nos alertas são os critérios internos já definidos no projeto: primeiro trâmite em 1 dia útil, conclusão em 3 dias úteis (simples) ou 5 (cálculo), "Aguardando o cliente" abandonado após 5 dias úteis, parada após 15 dias e prescrição em 30.

| Funcionalidade | Para quem | Dado que usa | Fase |
| --- | --- | --- | --- |
| Fila única: todas as pendências das 10 listas numa só tela, com filtro "só minhas" | Analista | listas + `assignedtome` | 1 |
| Contador no ícone da extensão com o total de pendências do usuário | Analista | idem | 1 |
| Semáforo de prazo por solicitação (verde, amarelo, vermelho) pelas regras internas | Analista e gestor | `created`, `lastUpdated`, `dueDate`, situação | 1 |
| Contagem regressiva para prescrição, com alerta aos 20 e aos 25 dias | Analista | `lastUpdated` + regra de 30 dias | 1 |
| Notificação do Chrome quando chega solicitação nova ou o cliente responde | Analista | comparação entre duas leituras | 1 |
| Busca universal por ID, empregado, cliente ou assunto em todos os tipos | Analista | `searchText` em cada lista | 1 |
| Coluna extra na grade nativa com "dias parada" e cor por gravidade | Analista | mesma resposta da grade | 1 |
| Lista de solicitações sem responsável | Gestor | `staffResponsibleExpanded` vazio | 1 |
| Painel por analista: pendentes, atrasadas por gravidade G1/G2/G3, tempo até o primeiro trâmite | Gestor | listas + trâmites | 1 |
| Exportar o consolidado em planilha (CSV) | Gestor | idem | 1 |
| Guias não visualizadas pelo cliente que vencem em até X dias, por cliente | Analista e gestor | `isReadByClientUser`, `customFields.dueDate` | 1 |
| Aviso no upload quando o nome do arquivo não traz a competência | Analista | nome do arquivo antes de enviar | 1 |
| Modelos de resposta prontos inseridos no Trâmite Rápido | Analista | tela do Trâmite Rápido | 2 |
| Definir responsável e alterar expectativa em lote | Gestor | `assign-staff`, `change-due-date` | 2 |
| Resumo pronto para WhatsApp de uma solicitação ou da fila | Analista | listas + trâmites | 2 |

Para o MVP sugiro as 5 primeiras linhas mais "sem responsável": resolvem o problema do dia a dia e não alteram nada no Onvio.

## Arquitetura técnica

Extensão Chrome em Manifest V3, em JavaScript puro (sem build), com permissão só para `https://onvio.com.br/*`. O service worker faz a coleta, o painel lateral (`chrome.sidePanel`) mostra a fila e o content script melhora as telas nativas.


O service worker usa `chrome.alarms` para ler as 10 listas com o filtro de pendentes, traduz cada `genericStatus` pelo dicionário do tipo, calcula prazo e gravidade e grava um resumo em `chrome.storage.local`. Painel, badge e content script leem só esse resumo, então abrir o painel não gera chamadas novas ao Onvio.

Arquivos previstos: `manifest.json`, `background.js` (coleta e regras), `onvio-api.js` (todas as URLs e o dicionário de situações), `sidepanel.html/js`, `content.js` e `options.html` (regras de prazo, intervalo e modo gestor).

## Pontos a validar e riscos

- [ ] **API não oficial.** São as chamadas internas do Onvio (versão do app em produção: 2025.09.18.1). Podem mudar sem aviso; isolar todas as URLs num único arquivo de configuração.
- [ ] **Cookies no service worker.** O teste foi feito de dentro da página. Confirmar que o `fetch` do service worker da extensão (com `host_permissions` para onvio.com.br) leva a sessão; se não levar, as leituras passam para o content script com a aba do Onvio aberta.
- [x] **Pendência de Rubricas.** Conferido em 15/10/2026: a tela usa `IN 1,2,3,4,9`; o NE dá HTTP 500 (a extensão usa IN).
- [x] **Códigos não observados.** Levantados em 15/10/2026 pelo filtro da tela (seção de situações); sem opção na tela: Cadastro 1 e Rubricas 7. Código desconhecido continua aparecendo como "situação desconhecida (código N)".
- [ ] **Busca global de documentos.** Testar `storage/v1/containers/documents/search`. Sem ela, a checagem de guias exige percorrer pastas de cerca de 500 clientes, o que é lento.
- [x] **Trâmites fora de Cadastro.** Resolvido em 15/10/2026 (caminhos na seção de trâmites).
- [ ] **Login de cliente x escritório.** (15/10/2026: o escritório tem `FeatureResourcePermissionsMap.Platform.OnvioStaffAccess` na sessão; falta ver um login de cliente.) As APIs de solicitações respondem às duas visões. A extensão bloqueia o acesso de cliente pela sessão (`security/v1/session-and-bindings`, campo de tipo/papel ainda não visto), por aba em `/clientcenter/` ou por `br-payroll-sr/v1/company-department-access` recusado. Confirmar com um login de cliente de teste qual sinal aparece (Diagnóstico > Perfil da sessão).
- [ ] **Perfil do usuário.** Cada pessoa só vê o que seu perfil no Onvio permite; o painel do gestor depende de um perfil com acesso a todos os departamentos.
- [ ] **Carga.** Atualizar a cada 5 a 10 minutos, só com o filtro de pendentes e 200 itens por página, nunca a base inteira.
- [ ] **LGPD.** As listas trazem CPF, salário e observações de empregados. Guardar em cache local só ID, situação, datas, cliente e responsável.
- [ ] **Distribuição.** Para os 80 funcionários, publicar como extensão privada na Chrome Web Store (visível só ao domínio, exige Google Workspace) ou instalar por política do Chrome; modo desenvolvedor serve só para o piloto.

# Prompt: mapear o que ainda falta no Onvio (atualizado em 22/10/2026)

Como usar: cole o texto abaixo no Claude com acesso ao Chrome, já logado no Onvio com o **usuário do escritório**. Depois, devolva o relatório que ele gerar.

O roteiro junta num só lugar tudo o que a extensão ainda trata como "a confirmar". Ele começa pelo que as melhorias de 22/10/2026 precisam:
- afastamento por acidente de trabalho;
- aviso trabalhado na rescisão;
- separação por departamento (DP, Fiscal, Contábil);
- situação "Em análise" nas férias.

Em seguida vêm as pendências antigas: download de anexos, valores da criação, expectativa e anexo na folha, e leituras.

O que já foi mapeado ficou fora:
- trâmites, situações e encaminhar de Cadastro e Rubricas (`tramites-cadastro-rubricas-2026-10-19.md`);
- ações da Geral e da folha (`acoes-2026-10-15.md`).

`prompt-anexos-onvio.md` e `prompt-criacao-onvio.md` continuam valendo como referência.

Dica: antes de começar, deixe o Control Onvio instalado e ligue o **modo aprender** (Configurações > Avançado). Ele registra sozinho o formato das chamadas, sem valores. No primeiro download de anexo feito pelo Onvio, também aprende o caminho do download.

---

Eu (Josué Porfírio, Processos e Automação da ControlTax) autorizo esta coleta, **só na empresa de teste**.

Você vai mapear chamadas do Onvio Portal do Cliente (https://onvio.com.br/br-portal-do-cliente/) na visão do escritório, para a extensão Control Onvio. Siga as partes na ordem. Se uma não der, anote "não consegui" e o motivo, e passe para a próxima.

## Regras (obrigatórias)

1. **Só na empresa de teste:** EMPRESA EXEMPLO SIMPLES NACIONAL LTDA, com dados fictícios ("Teste Control Onvio") e arquivos fictícios (`teste-control-onvio.txt`).
   - Nunca abra, baixe, crie ou altere nada de cliente real.
   - Se não achar a empresa de teste, pare e me avise.
2. **Nunca exclua nada** (solicitação, trâmite ou anexo). No fim, conclua por trâmite (situação Concluído) as solicitações de teste que você criou.
3. **Nada de dados pessoais no relatório.**
   - Anote só:
     - método e status HTTP;
     - caminho: GUID vira `{id}`, número vira `{num}`, nome de arquivo vira `{nome}`;
     - nomes dos parâmetros;
     - Content-Type (e Content-Disposition sem o nome do arquivo);
     - **nomes e tipos dos campos** do corpo e da resposta.
   - **Valores técnicos de enumeração podem e devem ser anotados:** códigos de situação, tipos de afastamento, tipos de aviso, ids de departamento, `serviceRequestType`, `requestWay`.
   - Nunca anote nomes, CPF, salários, textos, tokens ou assinaturas.
4. Use a leitura de requisições de rede do navegador e anote as chamadas para `onvio.com.br/api/...`. Se um arquivo vier de outro endereço, anote só o **domínio**.
5. Não invente. Se a tela não oferece a ação, escreva "a tela não oferece".

## Parte 1: tipo de afastamento (acidente de trabalho)

A extensão quer destacar e avisar quando o afastamento for **acidentário**.

1. Na tela de criar Afastamento (visão do cliente ou do escritório, o que existir), quais **tipos de afastamento** a tela oferece? Anote rótulo e **valor técnico** de cada um, principalmente o de **acidente de trabalho**. De onde vem a lista? (chamada e nomes dos campos)
2. Abra uma solicitação de Afastamento de teste. No detalhe (`GET /api/br-payroll-sr/v1/employee-leave/{id}?expand=all`), anote o formato de `employeeLeaveTypeId` e de `employeeLeaveTypeExpanded` (nomes e tipos dos campos, e o valor técnico do tipo escolhido).
3. Na **lista** (`GET /api/br-payroll-sr/v1/employee-leave?...`, a mesma que a tela da lista usa), o tipo de afastamento vem em cada item? Com qual `expand`? Teste também acrescentando `employeeLeaveTypeExpanded` ao `expand` e diga se o Onvio aceita.
4. Existe algum campo de CAT ou de acidente separado (ex.: "houve acidente", número da CAT)? Nome e tipo.

## Parte 2: aviso trabalhado × indenizado (rescisão)

A extensão quer lembrar o analista de emitir o aviso prévio quando o aviso é **trabalhado**.

1. Na tela de criar **Aviso de rescisão**, existe a escolha entre aviso **trabalhado**, **indenizado** ou **dispensado**? Anote rótulo e **valor técnico** de cada opção, e o nome do campo no `POST`.
2. No detalhe do Aviso de rescisão (`GET …/prior-notice-terminations/{id}?expand=all`), qual campo guarda essa escolha? E na **lista**, ele vem em cada item?
3. No **Cálculo de rescisão**, confirme os valores de `terminationType` (já se viu `INDEMNIFIED`; o trabalhado é `WORKED`?) e se ele vem na lista ou só no detalhe.
4. Há campo com a **data de início do aviso** ou do **último dia trabalhado** no aviso? Nome do campo.

## Parte 3: departamentos (DP, Fiscal, Contábil)

Pessoas de outros setores estão vendo demandas do DP na extensão. A suspeita é que a lista **Geral** mistura solicitações de todos os departamentos.

1. `GET /api/br-default-department/v1/department` (ou a chamada que a tela usa): anote o **id** (valor técnico) e o rótulo dos departamentos **Departamento Pessoal**, **Fiscal** e **Contábil**.
2. Na lista **Geral** (`GET /api/service-requesting/v1/tickets/generic?...`), cada item traz o departamento? Nome do campo (`departmentId`? `departmentExpanded`?) e com qual `expand`. A grade da tela tem coluna de departamento?
3. Com o seu usuário, a lista Geral mostra solicitações de **mais de um** departamento? Responda só sim/não e quantos departamentos diferentes aparecem.
4. `GET /api/br-payroll-sr/v1/company-department-access`: o `departmentId` que volta é o do **seu** departamento (DP)? Se houver um usuário de teste de outro setor, ele recebe outro id?
5. Qual chamada lista os **analistas de cada departamento** (a tela de "Definir responsável" da Geral filtra por departamento)? Método, caminho e nomes dos campos.
6. As listas da folha (férias, rescisão, afastamento, cadastro, rubricas) também trazem departamento em cada item? Se não, diga "não trazem".

## Parte 4: situação "Em análise" nas férias

A extensão vai sugerir, para cada solicitação **nova** de férias, um trâmite com a situação **Em análise** e uma mensagem padrão.

1. Numa solicitação de teste de **Aviso de férias** e outra de **Cálculo de férias** em "Sem análise": a tela oferece incluir trâmite com a situação **Em análise**? Qual o **código** enviado? (na Geral é 2)
2. O cliente vê a situação "Em análise" e o texto do trâmite na visão dele? E "Em análise interna" (8)? Responda o que a tela do cliente mostra, se tiver acesso a um login de cliente de teste.

## Parte 5: download de anexos

Faça para **Geral**, **Aviso de férias** (lista da folha, `br-payroll-sr/v1/tickets`), **Cadastro empregado** e **Lançamento de rubricas**. Se não houver solicitação de teste com anexo, crie uma.

1. **Anexo de trâmite:** abra a solicitação (visualização completa) > Trâmites e baixe um anexo. Qual chamada baixa o arquivo?
   - Anote método, caminho com `{id}` (diga qual `{id}` é a solicitação, qual é o trâmite e qual é o anexo), parâmetros e Content-Type da resposta.
2. A resposta é o próprio arquivo ou um JSON com endereço temporário? Se for JSON, anote o **nome do campo** do endereço e o domínio dele.
3. O pedido leva cabeçalho `Authorization`? Funciona aberto direto numa aba nova, sem o cabeçalho?
4. **Anexo da abertura** (aba Dados, fora dos trâmites): o caminho é diferente do anexo de trâmite? Anote como no item 1.
5. Em Cadastro e Rubricas, o campo `staticFilePath` aparece no caminho do download? Em que parte?
6. **Lote:** existe botão para baixar vários de uma vez?
   - No código aparece a chamada `…/{id}/attachments/batch-download/{tipo}`.
   - Se o botão existir, anote método, corpo (nomes e tipos) e Content-Type da resposta.

## Parte 6: criação de solicitações

1. **Geral:** crie uma solicitação de teste pela tela e anote:
   - o `POST /api/service-requesting/v1/tickets/generic` (campos e tipos);
   - os **valores** de `serviceRequestType` e `requestWay`;
   - se a tela tem campo de departamento, meio ou solicitante, e quais opções (valores técnicos);
   - se, **escolhendo outro departamento** (Fiscal ou Contábil), o `departmentId` do corpo muda para o id da Parte 3;
   - se a resposta traz cabeçalho `location`.
2. **Listas da folha** (Aviso de férias, Cálculo de férias, Aviso de rescisão, Cálculo de rescisão, Afastamento): a visão do escritório tem botão de adicionar?
   - Se não tiver, escreva "só pela visão do cliente".
   - Se tiver, crie uma de teste e anote o `POST` (caminho, campos, tipos, valores técnicos) e de onde vem o id do empregado.

## Parte 7: o que falta nas ações

1. **Folha** (Aviso de férias, Cálculo de férias, Aviso de rescisão, Cálculo de rescisão, Afastamento):
   - **anexo no trâmite:** segue a mesma sequência da Geral (`…/topics/{topicId}/attachments`, multipart, campo `file[]`)?
   - **alterar expectativa de conclusão:** a tela oferece? Anote chamada e corpo (na Geral é `PUT …/{id}/change-due-date { dueDate }`).
2. **Rubricas:** definir responsável. Anote a chamada e o corpo (a extensão supõe `payroll-entries/{id}/assign-staff`, igual ao Cadastro).
3. Em cada lista, depois de concluir por trâmite, a solicitação sai da lista de pendentes na hora? Responda só sim/não por lista.

## Parte 8: detalhes de leitura

1. **Data de admissão no Cadastro:** nas listas `GET …/employees-registrations` e `…/interns-registrations`, qual é o **nome do campo** da data de início (`admissionDate`? `startDate`?) e se ele vem na lista ou só no detalhe (`?expand=all`).
2. **Busca do cálculo pelo empregado:** na lista de Cálculo de férias, `searchText` com o nome do empregado de teste encontra a solicitação dele? Responda só sim/não e quantos resultados.
3. **"Atribuídas a mim":** o filtro `assignedtome=true` devolve as solicitações em que você é o responsável? Responda só sim/não e a contagem.

## Formato do relatório

Um único bloco de texto em Markdown:

```
# Mapeamento das pendências · <data>
## Solicitações de teste criadas (IDs)
## 1. Tipo de afastamento (valores, lista x detalhe, CAT)
## 2. Aviso trabalhado x indenizado (aviso e cálculo, lista x detalhe)
## 3. Departamentos (ids de DP/Fiscal/Contábil, Geral por departamento, analistas por departamento)
## 4. Em análise nas férias (código, o que o cliente vê)
## 5. Download de anexos
### Geral · trâmite / abertura
### Folha (Aviso de férias) · trâmite / abertura
### Cadastro · trâmite / abertura (staticFilePath)
### Rubricas · trâmite / abertura (staticFilePath)
### Lote
## 6. Criação
### Geral (serviceRequestType, requestWay, departamento)
### Folha (por lista)
## 7. Ações que faltam (folha: anexo e expectativa; Rubricas: responsável; sai da lista ao concluir)
## 8. Leitura (admissão, searchText, assignedtome)
## Não consegui / dúvidas
```

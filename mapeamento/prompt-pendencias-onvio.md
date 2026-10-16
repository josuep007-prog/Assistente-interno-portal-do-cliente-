# Prompt: mapear o que ainda falta no Onvio (16/10/2026)

Cole o texto abaixo no Claude com acesso ao Chrome, já logado no Onvio com o **usuário do escritório**, e devolva o relatório que ele gerar. Junta num só roteiro tudo o que a extensão ainda trata como "a confirmar" ou "não mapeado": download de anexos, valores da criação, ações em Cadastro e Rubricas, anexo e expectativa nas listas da folha, conclusão por trâmite em cada lista e quatro detalhes de leitura. Substitui, para quem for mapear agora, `prompt-anexos-onvio.md` e `prompt-criacao-onvio.md` (os dois continuam valendo como referência).

Dica: deixe o Control Onvio instalado e ligue o **modo aprender** (Configurações > Avançado) antes de começar. Ele registra sozinho o formato das chamadas (sem valores) e, no primeiro download de anexo feito pelo Onvio, aprende o caminho do download.

---

Eu (Josué Porfírio, Processos e Automação da ControlTax) autorizo esta coleta, **só na empresa de teste**.

Você vai mapear chamadas do Onvio Portal do Cliente (https://onvio.com.br/br-portal-do-cliente/) na visão do escritório, para a extensão Control Onvio. Siga as partes na ordem; se uma não der, anote "não consegui" e o motivo e passe para a próxima.

## Regras (obrigatórias)

1. **Só na empresa de teste:** EMPRESA EXEMPLO SIMPLES NACIONAL LTDA, com dados fictícios ("Teste Control Onvio") e arquivos fictícios (`teste-control-onvio.txt`). Nunca abra, baixe, crie ou altere nada de cliente real. Se não achar a empresa de teste, pare e me avise.
2. **Nunca exclua nada** (solicitação, trâmite ou anexo). No fim, conclua por trâmite (situação Concluído) as solicitações de teste que você criou.
3. **Nada de dados pessoais no relatório.** Anote só: método, caminho (GUID vira `{id}`, número vira `{num}`, nome de arquivo vira `{nome}`), nomes dos parâmetros, Content-Type (e Content-Disposition sem o nome do arquivo), **nomes e tipos dos campos** do corpo e da resposta e o status HTTP. **Valores técnicos de enumeração podem e devem ser anotados** (códigos de situação, `serviceRequestType`, `requestWay`, tipos). Nunca nomes, CPF, salários, textos, tokens ou assinaturas.
4. Use a leitura de requisições de rede do navegador e anote as chamadas para `onvio.com.br/api/...`. Se um arquivo vier de outro endereço, anote só o **domínio**.
5. Não invente. Se a tela não oferece a ação, escreva "a tela não oferece".

## Parte 1: download de anexos (prioridade)

Para **Geral**, **Aviso de férias** (lista da folha, `br-payroll-sr/v1/tickets`), **Cadastro empregado** e **Lançamento de rubricas** (crie a solicitação de teste com anexo, se não houver):

1. **Anexo de trâmite:** abra a solicitação (visualização completa) > Trâmites e baixe um anexo. Qual chamada baixa o arquivo? Método, caminho com `{id}` (diga qual `{id}` é a solicitação, qual é o trâmite e qual é o anexo), parâmetros e Content-Type da resposta.
2. A resposta é o próprio arquivo ou um JSON com endereço temporário? Se for JSON: **nome do campo** do endereço e domínio dele.
3. O pedido leva cabeçalho `Authorization`? Funciona aberto direto numa aba nova (sem o cabeçalho)?
4. **Anexo da abertura** (aba Dados, fora dos trâmites): o caminho é diferente do anexo de trâmite? Anote como no item 1.
5. Em Cadastro e Rubricas, o campo `staticFilePath` aparece no caminho do download? Em que parte?
6. **Lote:** existe botão para baixar vários de uma vez? Se existir, anote a chamada (no código aparece `…/{id}/attachments/batch-download/{tipo}`): método, corpo (nomes e tipos), Content-Type da resposta.

## Parte 2: criação de solicitações

1. **Geral:** crie uma solicitação de teste pela tela. Anote o `POST /api/service-requesting/v1/tickets/generic` (campos e tipos) e os **valores** de `serviceRequestType` e `requestWay`. A tela tem campo de departamento, meio ou solicitante? Quais opções (valores técnicos)? De onde vem o `departmentId` (é o de `GET /api/br-payroll-sr/v1/company-department-access`?). A resposta traz cabeçalho `location`? Dá para anexar já na criação (sequência de chamadas)?
2. **Listas da folha** (Aviso de férias, Cálculo de férias, Aviso de rescisão, Cálculo de rescisão, Afastamento): a visão do escritório tem botão de adicionar? Se não, escreva "só pela visão do cliente". Se tiver, crie uma de teste e anote o `POST` (caminho, campos, tipos, valores técnicos) e de onde vem o id do empregado (chamada que lista os empregados, nomes dos campos).

## Parte 3: ações nas listas ainda sem mapa

Em solicitações de teste de **Cadastro empregado**, **Cadastro contribuinte**, **Cadastro estagiário** e **Lançamento de rubricas**:

1. **Incluir trâmite com texto e mudando a situação:** chamada, corpo (campo do texto, campo da situação) e **quais situações a tela oferece** (rótulo e código) conforme a situação atual. É o mesmo caminho dos trâmites da leitura (`…/{id}/topics`)?
2. **Incluir trâmite com anexo:** sequência completa (upload, campo do arquivo, como liga ao trâmite).
3. **Definir responsável** (uma e várias de uma vez) e **encaminhar para outro usuário:** chamada e corpo. O Onvio deixa trocar o responsável quando já existe um?
4. **Alterar expectativa de conclusão:** a tela oferece? Chamada e corpo.

Nas listas da folha (**Aviso de férias**, **Cálculo de férias**, **Aviso de rescisão**, **Cálculo de rescisão**, **Afastamento**), confirme só o que falta:

5. **Anexo no trâmite:** mesma sequência da Geral (`…/topics/{topicId}/attachments`, multipart, campo `file[]`)?
6. **Alterar expectativa de conclusão:** a tela oferece? Chamada e corpo (na Geral é `PUT …/{id}/change-due-date { dueDate }`).

## Parte 4: concluir por trâmite em cada lista

A extensão agora sugere **Concluir** (trâmite com a situação Concluído) para solicitações resolvidas fora do portal, duplicadas ou abertas na lista errada.

1. Em **cada uma das 10 listas**, numa solicitação de teste: a tela deixa incluir trâmite com a situação **Concluído** a partir de "Sem análise", "Em análise" e "Respondido"? Qual o código enviado? Depois de concluída, a solicitação sai da lista de pendentes na hora?
2. Existe outra forma de encerrar (botão "Concluir", "Cancelar", "Arquivar")? Se existir, anote a chamada, mas **não use** "Excluir".

## Parte 5: detalhes de leitura

1. **Data de admissão no Cadastro:** na lista `GET …/employees-registrations` e `…/interns-registrations`, qual o **nome do campo** da data de início (`admissionDate`? `startDate`?) e se ele vem na lista ou só no detalhe (`?expand=all`).
2. **Data de desligamento na rescisão:** no detalhe de Aviso de rescisão e de Cálculo de rescisão, qual o nome do campo do último dia trabalhado ou do desligamento.
3. **Busca do cálculo pelo empregado:** na lista de Cálculo de férias, `searchText` com o nome do empregado de teste encontra a solicitação dele? (Responda só sim/não e quantos resultados.)
4. **"Atribuídas a mim":** o filtro `assignedtome=true` devolve as solicitações em que você é o responsável? (Só sim/não e a contagem.)

## Formato do relatório

Um único bloco de texto em Markdown:

```
# Mapeamento das pendências · <data>
## Solicitações de teste criadas (IDs)
## 1. Download de anexos
### Geral · trâmite / abertura
### Folha (Aviso de férias) · trâmite / abertura
### Cadastro · trâmite / abertura (staticFilePath)
### Rubricas · trâmite / abertura (staticFilePath)
### Lote
## 2. Criação
### Geral (valores de serviceRequestType, requestWay, departamento)
### Folha (por lista)
## 3. Ações sem mapa
### Cadastro empregado / contribuinte / estagiário
### Rubricas
### Folha: anexo no trâmite e expectativa
## 4. Concluir por trâmite (por lista)
## 5. Leitura (admissão, desligamento, searchText, assignedtome)
## Não consegui / dúvidas
```

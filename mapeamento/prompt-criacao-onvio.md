# Prompt: confirmar a criação de solicitações pelo escritório

Cole o texto abaixo no Claude com acesso ao Chrome, já logado no Onvio com o **usuário do escritório**. Devolva o relatório que ele gerar. Serve para a extensão criar solicitações sem depender de valores copiados (v0.17.0) e para abrir a criação nas listas da folha.

---

Eu (Josué Porfírio, Processos e Automação da ControlTax) autorizo esta coleta, **só na empresa de teste**.

Você vai mapear como o Onvio Portal do Cliente (https://onvio.com.br/br-portal-do-cliente/) **cria** Solicitações de Serviço pela visão do escritório.

## Regras (obrigatórias)

1. **Só na empresa de teste:** EMPRESA EXEMPLO SIMPLES NACIONAL LTDA, com dados fictícios ("Teste Control Onvio"). Nunca crie nada para cliente real. Se não achar a empresa de teste, pare e me avise.
2. **Nunca exclua nada.** No fim, conclua as solicitações de teste por trâmite (situação Concluído).
3. **Nada de dados pessoais no relatório:** método, caminho (ids viram `{id}`), Content-Type, nomes e tipos dos campos e HTTP. **Valores técnicos de enumeração podem e devem ser anotados** (ex.: `serviceRequestType`, `requestWay`, códigos de situação, tipos de afastamento). Nomes, CPF, salários e textos não.
4. Use a leitura de requisições de rede do navegador e anote só as chamadas para `onvio.com.br/api/...`.
5. Se algo não der, escreva "não consegui" e o motivo. Não invente.

## Parte 1: criação na lista Geral

1. Na lista **Geral**, clique em adicionar e crie uma solicitação de teste. Anote o `POST /api/service-requesting/v1/tickets/generic` completo: campos e tipos e os **valores** de `serviceRequestType` e `requestWay`.
2. A tela tem campo de departamento, de meio da solicitação ou de solicitante? Quais **opções** aparecem em cada um (só os valores técnicos que vão no corpo)? Crie uma segunda solicitação mudando o meio, se houver, e anote o valor.
3. De onde vem o `departmentId` (qual chamada traz a lista de departamentos, nomes dos campos)? É o mesmo de `GET /api/br-payroll-sr/v1/company-department-access`?
4. Dá para anexar arquivo já na criação? Se sim, qual a sequência de chamadas (caminho, multipart, campo do arquivo, como liga à solicitação)?
5. A resposta do `POST` traz cabeçalho `location`? Que leituras a tela faz logo depois?
6. Abra a solicitação criada (visualização completa) e anote, de `GET .../tickets/generic/{id}?expand=all`, os valores de `serviceRequestType`, `requestWay` e `genericStatus`.

## Parte 2: criação nas listas da folha (se a visão do escritório permitir)

Para **Aviso de férias**, **Aviso de rescisão**, **Cálculo de férias**, **Cálculo de rescisão** e **Afastamento**:

1. A lista do escritório tem botão de adicionar? Se não tiver, escreva "só pela visão do cliente" e pule.
2. Se tiver, crie uma de teste e anote o `POST` completo (caminho, campos, tipos e valores técnicos), de onde vem o id do empregado (`clientEmployeeExpanded.id`: qual chamada lista os empregados, nomes dos campos) e o que a resposta devolve.

## Formato do relatório

Um único bloco de texto em Markdown:

```
# Mapeamento da criação · <data>
## Solicitações de teste criadas (IDs)
## 1. Geral: POST de criação (campos, tipos e valores técnicos)
## 2. Geral: opções de departamento, meio e solicitante
## 3. Geral: departmentId (de onde vem)
## 4. Geral: anexo na criação
## 5. Geral: resposta e leituras depois
## 6. Geral: valores na solicitação criada
## 7. Folha: criação por lista
## Não consegui / dúvidas
```

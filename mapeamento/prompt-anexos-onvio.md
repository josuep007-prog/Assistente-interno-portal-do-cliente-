# Prompt: confirmar como o Onvio baixa os anexos

Cole o texto abaixo no Claude com acesso ao Chrome, já logado no Onvio com o **usuário do escritório**. Devolva o relatório que ele gerar. Serve para o botão "Anexos" do detalhe (v0.20.0) baixar os anexos que o analista escolher sem depender de aprender o caminho na primeira vez.

---

Eu (Josué Porfírio, Processos e Automação da ControlTax) autorizo esta coleta, **só na empresa de teste**.

Você vai mapear como o Onvio Portal do Cliente (https://onvio.com.br/br-portal-do-cliente/) **baixa** os anexos das Solicitações de Serviço pela visão do escritório. É só leitura: nenhuma ação altera dados.

## Regras (obrigatórias)

1. **Só na empresa de teste:** EMPRESA EXEMPLO SIMPLES NACIONAL LTDA. Se precisar de um anexo, use uma solicitação de teste já existente ou crie uma com um arquivo fictício ("teste-control-onvio.txt") e conclua por trâmite no fim. Nunca abra anexos de clientes reais.
2. **Nunca exclua nada** (nem anexo, nem trâmite).
3. **Nada de dados no relatório:** método, caminho (ids viram `{id}` e o nome do arquivo vira `{nome}`), nomes dos parâmetros, Content-Type e Content-Disposition da resposta (sem o nome do arquivo), HTTP. Nada de tokens, assinaturas, nomes ou conteúdo.
4. Use a leitura de requisições de rede do navegador e anote as chamadas para `onvio.com.br` (e, se o arquivo vier de outro endereço, só o **domínio** dele).
5. Se algo não der, escreva "não consegui" e o motivo. Não invente.

## Parte 1: anexo de um trâmite

Faça em **Geral**, **Aviso de férias** (ou outra lista da folha: tickets) e, se houver anexo de teste, **Cadastro empregado** e **Lançamento de rubricas**:

1. Abra a solicitação (visualização completa), aba Trâmites, e clique para baixar um anexo de trâmite.
2. Qual chamada baixa o arquivo? Método, caminho com `{id}` (diga qual `{id}` é a solicitação, qual é o trâmite e qual é o anexo), parâmetros e Content-Type da resposta.
3. A resposta é o próprio arquivo, ou um JSON com um endereço temporário? Se for JSON, qual o **nome do campo** que traz o endereço e qual o domínio desse endereço?
4. O pedido leva cabeçalho `Authorization`? Funciona aberto direto numa aba nova (sem o cabeçalho)?
5. O campo `staticFilePath` (Cadastro e Rubricas) aparece no caminho do download? Em que parte?

## Parte 2: anexo da abertura da solicitação

1. Na aba Dados, baixe um anexo que veio na abertura (fora dos trâmites). O caminho é diferente do anexo de trâmite? Anote como na Parte 1.

## Parte 3: download em lote

1. Existe botão para baixar vários anexos de uma vez? Se existir, anote a chamada (no código já aparece `…/{id}/attachments/batch-download/{tipo}`): método, corpo (nomes e tipos dos campos), Content-Type da resposta (zip?).
2. **Não** marque nem desmarque nada que altere a solicitação.

## Formato do relatório

Um único bloco de texto em Markdown:

```
# Mapeamento do download de anexos · <data>
## Geral · anexo de trâmite
GET /api/... (ids: {sol}, {trâmite}, {anexo}) · resposta: <Content-Type> · Authorization: sim/não · aberto direto: funciona/não
## Aviso de férias · anexo de trâmite
...
## Anexo da abertura
...
## Lote
...
## Observações
```

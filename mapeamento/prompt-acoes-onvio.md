# Prompt: mapear as ações do Onvio (fase 2) e as pendências da v0.13.0

Cole o texto abaixo no Claude com acesso ao Chrome, já logado no Onvio com o **usuário do escritório**. Devolva o relatório que ele gerar.

---

Eu (Josué Porfírio, Processos e Automação da ControlTax) autorizo esta coleta. **Pode fazer a Parte 4.**

Você vai mapear como o Onvio Portal do Cliente (https://onvio.com.br/br-portal-do-cliente/) faz as **ações** nas Solicitações de Serviço, para a extensão Control Onvio passar a responder, mudar situação, anexar e definir responsável. Vai também confirmar dois detalhes de leitura.

## Regras (obrigatórias)

1. **Ações só na empresa de teste:** EMPRESA EXEMPLO SIMPLES NACIONAL LTDA, e só em solicitações que **você mesmo criar para o teste**. Nunca mexa em solicitação de cliente real. Se não achar a empresa de teste, pare e me avise.
2. **Nunca exclua solicitação.** A única exclusão permitida é a do anexo fictício que você mesmo incluir (item 7).
3. **Nada de dados pessoais no relatório:** anote só método, caminho (troque ids por `{id}` para GUID e `{num}` para número), cabeçalho Content-Type, **nomes e tipos dos campos** (texto, número, data, booleano, lista, objeto) do corpo e da resposta e o status HTTP. **Nunca valores.** Exceção: valores técnicos de enumeração (ex.: código de situação 1, 2, 3; `"MONTHLY"`) podem ser anotados.
4. Use a leitura de requisições de rede do navegador e anote só as chamadas para `onvio.com.br/api/...`.
5. Se algo não der, escreva "não consegui" e o motivo. Não invente.

## Preparação

Na EMPRESA EXEMPLO, crie pela tela do Onvio (visão do escritório, ou peça ajuda se só der pela visão do cliente) uma solicitação de teste de cada: **Geral**, **Aviso de férias**, **Cadastro de empregado** e **Lançamento de rubricas**, com dados fictícios ("Teste Control Onvio"). Anote a chamada de criação só se ela aparecer (não é prioridade).

## Parte 4: ações (em cada solicitação de teste, quando a tela permitir)

1. **Incluir trâmite só com texto**, pela visualização completa (ícone "i" → Trâmites) e pelo Trâmite Rápido (ícone de setas). São a mesma chamada? Qual é o campo do texto e se ele aceita HTML?
2. **Incluir trâmite mudando a situação** (ex.: Em análise; depois Aguardando resposta; depois Concluído). Como a situação vai no corpo (campo e código)? Muda junto `firmStatus`/`genericStatus` da solicitação ou é outra chamada?
3. **Incluir trâmite com anexo** (arquivo fictício `teste-control-onvio.txt`). O arquivo sobe numa chamada separada antes do trâmite (qual caminho? multipart? qual campo leva o arquivo? a resposta devolve um id?) ou vai junto? Anote a **sequência completa** e o campo que liga o anexo ao trâmite. Tem limite de tamanho ou de tipo de arquivo na tela?
4. **Definir responsável**, de uma solicitação e de várias de uma vez (na lista, marcando várias). Qual chamada (`assign-staff`?) e o formato do corpo? De onde vem a lista de analistas para escolher (chamada e campos, sem nomes)?
5. **Alterar expectativa de conclusão** (`change-due-date`?): chamada e corpo.
6. **Encaminhar para outro usuário:** chamada e corpo.
7. **Excluir o anexo** do item 3 (só para ver o formato; a extensão nunca vai excluir).

Para cada ação, diga também: se a tela pede confirmação; quais chamadas de leitura ela faz logo depois (para a lista e os trâmites atualizarem); e se aparece algum cabeçalho especial obrigatório (ex.: token anti-CSRF, `x-...`), só o **nome** do cabeçalho.

## Parte 5: confirmar dois detalhes de leitura

1. **Busca do cálculo pelo nome do empregado.** Na lista **Cálculo de férias** (e depois **Cálculo de rescisão**), digite no campo de busca da tela o nome de um empregado que tenha cálculo (qualquer empresa, só leitura). A chamada leva `searchText`? A busca acha pelo nome do **empregado** ou só por cliente/assunto? Responda sim/não, sem anotar o nome.
2. **Data de desligamento na rescisão.** Abra a visualização completa de um **Aviso de rescisão** e de um **Cálculo de rescisão** (só leitura). Na chamada `GET …/{id}?expand=all`, quais campos de **data** existem (nomes, ex.: `adviceDate`, `resignationDate`, `terminationDate`, `lastWorkDay`) e qual deles é o último dia de trabalho (desligamento)? Há campo que diga se o aviso é trabalhado ou indenizado (nome e valores técnicos)?

## Limpeza

No fim, conclua as solicitações de teste (mudando a situação para Concluído por trâmite), sem excluir. Diga quais IDs de teste criou.

## Formato do relatório

Devolva **um único bloco de texto em Markdown**:

```
# Mapeamento de ações Onvio · <data>
## Solicitações de teste criadas (IDs)
## 1. Trâmite só texto
## 2. Trâmite mudando a situação (tabela: lista | código | texto da situação)
## 3. Trâmite com anexo (sequência de chamadas)
## 4. Definir responsável (uma e várias; lista de analistas)
## 5. Alterar expectativa
## 6. Encaminhar
## 7. Excluir anexo
## Cabeçalhos obrigatórios (só nomes)
## Parte 5.1 Busca do cálculo pelo nome do empregado
## Parte 5.2 Datas da rescisão
## Não consegui / dúvidas
```

Para cada ação, use o formato:

```
Método e caminho:
Content-Type:
Corpo (campo: tipo):
Resposta (campo: tipo) e HTTP:
Confirmação na tela:
Leituras logo depois:
```

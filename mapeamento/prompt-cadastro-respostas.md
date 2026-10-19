# Prompt: mapear as respostas (trâmites) do Cadastro e das Rubricas

Cole o texto abaixo no Claude com acesso ao Chrome, já logado no Onvio com o **usuário do escritório**, e devolva o relatório. Serve para liberar **Responder** em Cadastro de empregado, contribuinte e estagiário e em Lançamento de rubricas (hoje a extensão só mostra "use Abrir no Onvio"). É um recorte curto da Parte 3 de `prompt-pendencias-onvio.md`.

Alternativa sem agente: ligue o **modo aprender** (Configurações > Avançado), faça **uma** resposta em cada lista **na empresa de teste** e cole aqui o que o modo aprender registrou (só método, caminho e nomes de campos, nunca valores).

Importante: as listas do escritório **não têm "Adicionar"** em Cadastro e Rubricas (só pela visão do cliente). Precisa existir, na empresa de teste, ao menos uma solicitação de cada uma dessas listas, criada pela visão do cliente. Se não existir, o agente deve parar e avisar.

---

Eu (Josué Porfírio, Processos e Automação da ControlTax) autorizo esta coleta, **só na empresa de teste**.

Você vai mapear como o Onvio Portal do Cliente (https://onvio.com.br/br-portal-do-cliente/) **inclui um trâmite (resposta ao cliente)** nas listas **Cadastro empregado**, **Cadastro contribuinte**, **Cadastro estagiário** e **Lançamento de rubricas**, na visão do escritório, para a extensão Control Onvio.

## Regras (obrigatórias)

1. **Só na empresa de teste:** EMPRESA EXEMPLO SIMPLES NACIONAL LTDA, em solicitações de teste que já existam (as listas do escritório não criam Cadastro nem Rubricas). Se não achar a empresa de teste ou uma solicitação de teste em alguma lista, **pare naquela lista e me avise**. Nunca mexa em solicitação de cliente real.
2. **Nunca exclua nada** (solicitação, trâmite ou anexo). Ao terminar, deixe cada solicitação de teste na situação que você encontrou, se a tela permitir, ou conclua por trâmite.
3. **Nada de dados pessoais no relatório:** método, caminho (GUID vira `{id}`), nomes e tipos dos campos do corpo e da resposta, Content-Type e status HTTP. **Valores técnicos de enumeração podem e devem ser anotados** (códigos de situação, `status`). Nunca nomes, CPF, salários ou textos.
4. Use a leitura de requisições de rede do navegador e anote as chamadas para `onvio.com.br/api/...`.
5. Não invente. Se a tela não oferece a ação, escreva "a tela não oferece".

## Para cada lista (as 3 de Cadastro e Rubricas)

1. **Situações oferecidas ao incluir trâmite:** abra a solicitação (visualização completa) > Trâmites e inclua um trâmite. Para **cada situação atual** que você conseguir (por exemplo, "Sem análise", "Enviado para o escritório", "Aguardando o cliente", "Respondido pelo cliente", "Cadastro efetuado"), anote **quais situações a tela oferece para escolher** (rótulo e **código**). Em Cadastro, o filtro da lista usa: 2 Enviado para o escritório · 3 Aguardando o cliente · 4 Respondido pelo cliente · 5 Cadastro efetuado · 6 Concluído · 7 Encaminhado para outro usuário. Em Rubricas: 2 Em análise · 3 Importação realizada · 4 Respondido · 5 Aguardando resposta · 6 Aguardando correção. Confirme quais o **escritório** consegue escolher.
2. **Chamada que inclui o trâmite:** método, caminho com `{id}` (é `…/employees-registrations/{id}/topics` para as 3 de Cadastro e `…/payroll-entries/{id}/topics` para Rubricas, como na leitura?), corpo (campo do texto, campo da situação, outros campos) e resposta (status, cabeçalho `location`).
3. **Muda a situação da solicitação?** Depois do trâmite, `genericStatus` / `clientStatus` / `firmStatus` da solicitação mudam? Para qual código? O que **a vez** passa a ser (escritório ou cliente)?
4. **O que cada situação exige:** "Cadastro efetuado" e "Concluído" pedem algum campo a mais (por exemplo, data, anexo ou código do empregado no Domínio)?
5. **Anexo no trâmite:** sequência completa (upload, campo do arquivo, como liga ao trâmite).
6. **Responsável e encaminhar:** a tela deixa definir responsável (`assign-staff`?) e encaminhar para outro usuário? Chamada e corpo. O Onvio deixa trocar quando já existe um?
7. **Expectativa de conclusão:** a tela oferece alterar? Chamada e corpo.

## Formato do relatório

Um único bloco de texto em Markdown:

```
# Mapeamento de respostas em Cadastro e Rubricas · <data>
## Solicitações de teste usadas (lista e situação em que estavam)
## Cadastro empregado
### Situações oferecidas, por situação atual (rótulo e código)
### Chamada do trâmite (método, caminho, corpo, resposta)
### Efeito na situação e na vez
### Exigências de Cadastro efetuado / Concluído
### Anexo no trâmite
### Responsável, encaminhar, expectativa
## Cadastro contribuinte (só diferenças)
## Cadastro estagiário (só diferenças)
## Lançamento de rubricas
## Não consegui / dúvidas
```

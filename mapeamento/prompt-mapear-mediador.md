# Mapear o Mediador (convenções coletivas) · 11/11/2026

**Pedido do Josué (11/11/2026):** "o módulo convenções hoje está 100% manual, pensei em de alguma forma usar a extensão para puxar informações automaticamente de sindicatos cadastrados".

**Ideia:** o Mediador do MTE é onde toda convenção e todo aditivo são registrados. Se a extensão conseguir consultar o Mediador pelo CNPJ de cada sindicato em uso, o módulo Convenções do Hub passa a avisar sozinho "nova CCT registrada", e a pessoa só confere e cadastra.

**Antes de construir, falta saber:**
- se a consulta abre sem login e **sem captcha** (decide se fica automático ou se a pessoa clica em "Buscar no Mediador" e a extensão lê a página aberta);
- se os dados vêm por uma chamada por trás (mais fácil e estável) ou só no HTML da página;
- quais campos aparecem na lista (registro, processo, partes, vigência, data-base, data de registro);
- se o texto da convenção abre como página ou PDF, por um endereço fixo.

## Como rodar (no Chrome do Josué)

1. Abra `mapeamento/prompt-claude-chrome-mediador.txt`, troque `[CNPJ 1]`, `[CNPJ 2]` e `[CNPJ 3]` pelos CNPJs de 2 ou 3 sindicatos em uso (no Hub: DP › Convenções › Cadastrar Sindicato) e cole o texto inteiro no Claude in Chrome.
2. Se aparecer captcha, resolva você mesmo quando o Claude pedir: ele não deve resolver.
3. Devolva aqui o texto que o `medMapa.resultado()` imprimir e as respostas do Passo 3.

Quem preferir fazer à mão: abra a consulta do Mediador, cole `mapeamento/mapear-mediador.js` no console e siga o mesmo Passo 2.

## O que o roteiro anota (e o que não)

- **Anota a forma:** formulários (para onde vão, método, nomes, tipos e rótulos dos campos, as opções das listas do próprio site), captcha (reCAPTCHA, hCaptcha, Turnstile ou imagem com letras), tabelas (títulos das colunas, número de linhas e o **tipo** de cada célula da 1ª linha: número de registro, processo, período, data, CNPJ…), links (endereço com `{n}` no lugar dos números, texto curto como "Visualizar"/"PDF"), quadros, botões, a tecnologia da página (ASP.NET, JSF…) e as chamadas que a página faz (método, endereço, nomes dos parâmetros, forma da resposta).
- **Nunca anota:** o que foi digitado (CNPJ, nome do sindicato), o conteúdo das células, cookies. O Mediador é público e não tem dado de cliente, mas o resultado fica só com a forma, como nos mapeamentos do Onvio e do Gestta.
- O roteiro **não consulta nada sozinho**: só observa enquanto a pessoa usa o site. Teste: `node testes/mapear-mediador.js` (Mediador simulado).

## Depois do mapeamento

- **Sem captcha:** a extensão consulta sozinha, no máximo uma vez por semana, só os sindicatos em uso no Hub, e manda ao Hub os instrumentos encontrados (registro, tipo, vigência, data-base, partes, data do registro). No Hub, vira "Para decidir: nova CCT registrada", com Cadastrar ou Ignorar.
- **Com captcha:** botão "Buscar no Mediador" em cada sindicato do Hub; a pessoa resolve o captcha e a extensão lê a página aberta e preenche a convenção para conferir.
- Qualquer dos dois é uma **exceção nova** à regra "sem acesso de rede além do Onvio e do Gestta", e precisa da autorização do Josué antes, como foi com o Gestta.

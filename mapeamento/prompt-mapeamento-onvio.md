# Prompt: mapear o que falta do Onvio Portal do Cliente

Cole o texto abaixo no Claude com acesso ao Chrome (Claude in Chrome), já logado no Onvio com o **usuário do escritório**. Devolva aqui o relatório que ele gerar.

---

Você vai mapear, **só observando**, como o Onvio Portal do Cliente (https://onvio.com.br/br-portal-do-cliente/) busca os dados das Solicitações de Serviço. O objetivo é que a extensão Control Onvio da ControlTax já saia pronta para todos, sem precisar "aprender" nada na máquina de cada pessoa. Eu (Josué Porfírio, Processos e Automação) autorizo esta coleta.

## Regras (obrigatórias)

1. **Somente leitura.** Não clique em Salvar, Enviar, Incluir trâmite, Concluir, Excluir, Encaminhar, Definir responsável, Alterar expectativa, Anexar nem em nada que altere dados. Se uma tela pedir confirmação, cancele. A única exceção é a Parte 4, e só na empresa de teste.
2. **Nada de dados pessoais no relatório.** Não copie nomes de pessoas, CPF, salário, CID, descrições, textos de trâmite, nomes de arquivo nem valores. Troque IDs por `{id}` (GUID) ou `{num}` (número da solicitação). Dos JSON, anote só **nomes dos campos e tipos** (texto, número, data, booleano, lista, objeto). Nome de cliente/empresa também não: use "cliente A", "cliente B".
3. Para ver as chamadas, use a leitura de requisições de rede do navegador (network requests). Anote só as que vão para `onvio.com.br/api/...`.
4. Se algo não for possível, escreva "não consegui" e o motivo. Não invente.

## As 10 listas

| Chave | Tela (rota) | API da lista |
|---|---|---|
| geral | service-requesting/general | service-requesting/v1/tickets/generic |
| cadEmpregado | service-requesting/payroll-registration/employee | br-payroll-sr/v1/employees-registrations |
| cadContribuinte | service-requesting/payroll-registration/partner | br-payroll-sr/v1/taxpayers-registrations |
| cadEstagiario | service-requesting/payroll-registration/intern | br-payroll-sr/v1/interns-registrations |
| avisoFerias | service-requesting/vacation/prior-notice | br-payroll-sr/v1/prior-notice-vacations |
| calcFerias | service-requesting/vacation/calculation | br-payroll-sr/v1/vacation-calculations |
| avisoRescisao | service-requesting/termination/prior-notice | br-payroll-sr/v1/prior-notice-terminations |
| calcRescisao | service-requesting/termination/calculation | br-payroll-sr/v1/termination-calculations |
| afastamento | service-requesting/employee-leave | br-payroll-sr/v1/employee-leave |
| rubricas | service-requesting/payroll-entries | br-payroll-sr/v1/payroll-entries |

## Parte 1: trâmites de cada lista (prioridade máxima)

Já sabemos que `GET br-payroll-sr/v1/{lista}/{id}/topics?expand=all&itemsPerPage=1000&orderBy=created asc&pageIndex=0` funciona em Cadastro e dá **HTTP 404** em Aviso de férias. Para **cada uma das 10 listas**:

1. Abra a lista e escolha uma solicitação **que já tenha pelo menos 2 trâmites** (anote também se só encontrou com 0 ou 1).
2. Abra os trâmites de dois jeitos: pelo ícone de setas (**Trâmite Rápido**) e pela visualização completa (ícone "i" → aba **Trâmites**).
3. Anote cada chamada `GET` feita nesse momento:
   - método e caminho completo, com `{id}`/`{num}` no lugar dos identificadores (diga se o id no caminho é o GUID da solicitação, o número dela ou outro id, e de onde esse outro id vem, por exemplo de um campo da resposta da lista);
   - parâmetros da URL (nomes e valores técnicos como `expand`, `orderBy`, `itemsPerPage`; valores de busca viram `…`);
   - status HTTP;
   - formato da resposta: se é lista direta, `{ items: [...] }` ou outro invólucro; nomes e tipos dos campos de um trâmite (procure `created`, `status`, `description`, autor, anexos).
4. Diga qual dessas chamadas é a que traz a lista de trâmites.

## Parte 2: outras pendências de leitura

1. **Situações (códigos).** Em cada lista, quais valores de `genericStatus` e `firmStatus` aparecem e que texto a tela mostra para cada um. Em Cadastro faltam os códigos 1 e 4; em Rubricas, 1 a 3.
2. **Rubricas pendentes.** Qual filtro a própria tela usa para "pendentes" em Lançamento de rubricas (anote o parâmetro `filter`: só os campos `by` e `op`, sem valores de busca).
3. **"Atribuídas a mim".** Ao filtrar as solicitações atribuídas ao usuário logado, qual parâmetro vai na chamada (ex.: `assignedtome=true`) e se a resposta muda.
4. **Detalhe (aba Dados).** Ao abrir a visualização completa, quais chamadas além da lista são feitas e o formato (só nomes de campos).
5. **Sessão e perfil.** Formato (só nomes de campos) de `security/v1/session-and-bindings` e de `br-payroll-sr/v1/company-department-access`. Algum campo indica se o usuário é do escritório ou cliente, ou o perfil/departamentos dele? Diga o **nome** do campo, não o valor.
6. **Versão do Onvio.** A versão do app que aparece no rodapé, no "Sobre" ou nas chamadas (ex.: 2025.09.18.1).

## Parte 3: tela da lista (grade)

Numa lista qualquer, diga se a grade é Wijmo (`wj-flexgrid`) ou `<table>`, qual é o seletor das linhas e das células, e qual coluna mostra "Último Trâmite" (cabeçalho e posição).

## Parte 4 (só se eu disser "pode fazer a Parte 4"): ações, só na empresa de teste

Somente na **EMPRESA EXEMPLO SIMPLES NACIONAL LTDA**, em solicitações criadas para teste, faça uma vez e anote o formato da chamada (método, caminho com `{id}`, nomes e tipos dos campos do corpo e da resposta, nunca valores): incluir trâmite só com texto; incluir trâmite mudando a situação; concluir; definir responsável (uma e várias); alterar expectativa de conclusão; encaminhar; anexar arquivo fictício e excluí-lo. Sem essa frase minha, pule a Parte 4.

## Formato do relatório

Devolva **um único bloco de texto em Markdown**, nesta ordem:

```
# Mapeamento Onvio · <data> · versão do Onvio <versão>

## 1. Trâmites por lista
| Lista | Chamada dos trâmites (método + caminho com {id}/{num}) | Tipo de id | Parâmetros | HTTP | Invólucro | Campos de um trâmite |
(uma linha por lista; e, abaixo, observações: chamadas extras, ids vindos de outro campo etc.)

## 2. Situações por lista
| Lista | Código | Texto na tela |

## 3. Rubricas pendentes (filtro)
## 4. Atribuídas a mim
## 5. Detalhe (aba Dados)
## 6. Sessão e perfil (nomes de campos)
## 7. Grade
## 8. Ações (só se a Parte 4 foi feita)
## 9. Não consegui / dúvidas
```

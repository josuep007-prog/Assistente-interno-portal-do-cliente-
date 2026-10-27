<!-- Investigação do Claude no Chrome (somente leitura). Nomes de pessoas trocados por rótulos. -->
# Onvio: análise de `GET /api/br-payroll-sr/v1/employees` e lista de funcionários do escritório

Data: 27/10/2026. Método: somente leitura (GET e navegação). Nenhum POST/PUT/PATCH/DELETE, nenhum clique em Salvar/Criar/Excluir. Nenhum token, cookie, CPF, salário, e-mail ou telefone foi copiado.

## Comportamento da API (achado importante)

- `pageIndex` começa em **0**, não em 1. Com `itemsPerPage=25`, a página 0 traz os itens 0–24 e a página 4 traz 7 itens. A página 5 vem vazia. Começar em 1 faz perder os 25 primeiros.
- A paginação de 25 em 25 é **instável**. Em três leituras seguidas vieram sempre 107 itens, mas só 66, 70 e 83 ids distintos. Há itens repetidos entre páginas e itens que ficam de fora.
- Com `itemsPerPage=200&pageIndex=0` vem tudo numa resposta: 107 itens, 107 ids distintos, `totalPages=1`. Repeti três vezes e o resultado foi igual.
- Recomendação: usar `itemsPerPage` maior que `totalItems`, ou deduplicar por `id` depois de ler todas as páginas.

## 1. Quantos nomes e quais campos

- 107 itens, 107 pessoas distintas.
- Campos de cada item (todos texto): `type` (sempre `employeeV1Dto`), `apiVersion` (`V1`), `id`, `contactId`, `name`.
- Envelope: `items`, `apiVersion`, `itemsPerPage`, `pageIndex`, `startIndex`, `totalItems`, `totalPages`.

## 2. Campo de situação

Não existe. Não há ativo/inativo, nem data de saída, nem datas. Pelo cruzamento com a tela de Funcionários do Gestão (item 5), os 107 batem com a lista de **ativos**. Isso é inferência, não um campo da API.

## 3. Os três nomes

| Nome pedido | Na API | No Onvio Gestão |
|---|---|---|
| Pessoa A | Não | Existe como "A abreviado"; fora de Status = Ativo |
| Pessoa B | Não | Existe como "B abreviado"; fora de Status = Ativo |
| Pessoa C | Não | Existe como "C abreviado"; fora de Status = Ativo |

- Testei também as versões abreviadas na API: nenhuma aparece.
- O Status só tem Ativo ou Inativo. Concluo que os três estão inativos, mas não filtrei por Inativo para confirmar diretamente.
- O registro da API traz apenas `id`, `contactId` e `name`; como eles não estão na lista, não há registro a descrever.

## 4. Três pessoas ativas

Responsáveis por solicitações do dia na tela Solicitações Gerais; no Gestão estão como Ativo.

| Pessoa | Na API (`itemsPerPage=200`) |
|---|---|
| Ativa 1 | Sim |
| Ativa 2 | Sim |
| Ativa 3 | Sim |

Com páginas de 25 essa checagem não é confiável (ver "Comportamento da API").

## 5. Tela do escritório

- Caminho: Onvio Gestão (menu Minhas Aplicações > Gestão) > Configuração > Contatos > Funcionários.
- 195 registros, colunas ID e Funcionário.
- Filtro: sim, em "Editar filtro". Campos: Data de Contratação, Data de Saída, Departamentos, Escritório, Nível do Funcionário, Status, Status de acesso ao Onvio, Supervisor. Status aceita Ativo ou Inativo. Com Status = Ativo a lista cai para 108 de 195.
- Os três nomes aparecem na lista completa (abreviados) e não aparecem em Status = Ativo.
- "Usuários de Clientes" (Portal do Cliente > Configurações) lista usuários de clientes, não funcionários do escritório.
- Dos 108 ativos do Gestão, 107 batem com a API (comparação por primeiro e último nome).

## Não consegui verificar

- Status = Inativo aplicado diretamente para os três nomes (só deduzido por exclusão).
- Data de Saída dos três (não abri o registro de cada um).
- Qual é o 1 ativo do Gestão que não está na API.

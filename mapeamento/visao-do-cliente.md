# O que a extensão do cliente ensina à do escritório

Fonte: repositório `josuep007-prog/assistente-portal-controltax` (Assistente do Portal do Cliente, v1.3.1), lido em 14/10/2026. O mapa dele é a visão do **cliente**: `https://onvio.com.br/clientcenter/pt/actions/service-request/<slug>`. O nosso é a visão do **escritório**: `https://onvio.com.br/br-portal-do-cliente/service-requesting/...`. As APIs de `br-payroll-sr/v1/*` são as mesmas nas duas visões.

## Para o nosso mapa

* **Lista Geral:** o mapa do cliente deixou "API da lista (não identificada)". No escritório é `service-requesting/v1/tickets/generic`. Vale devolver essa informação ao outro projeto.
* **Lista de empregados da empresa** (cliente): `GET /api/br-payroll-sr/v1/clients/<clientId>/employees?expand=clientEmployeeRelationshipExpanded`, com `name`, `status`, `hireDate`, `cpf`. No escritório ainda não temos o equivalente confirmado (há `core/v3/companies/{id}/employees/search`, que parece ser dos funcionários do escritório). Com a lista dos empregados do cliente seria possível alertar fim de contrato de experiência (45 e 90 dias).
* **Combobox** do portal é virtualizado (`cdk-virtual-scroll-viewport`, ~13 linhas no DOM). Se um dia a extensão precisar ler listas de seleção, rolar o viewport por código.
* **Os textos que o cliente envia são padronizados** pela extensão dele, por exemplo `Atestado médico – NOME – data (dias)` no assunto. A fila do escritório pode aproveitar isso (ex.: mostrar os dias do afastamento sem abrir a solicitação). Ainda não implementado.
* **Dados de saúde (CID) ficam fora da descrição por padrão.** Do nosso lado, nunca guardar descrição, observações nem anexos.

## Prazos prometidos ao cliente (`config` do `regras.json` dele)

| Regra | Valor | Onde está do nosso lado |
|---|---|---|
| `prazoInternoDiasUteis.simples` | 3 | `conclusaoSimples` |
| `prazoInternoDiasUteis.calculo` | 5 | `conclusaoCalculo` |
| `experienciaDias` | 45 e 90 | não usado (falta a lista de empregados) |
| Aviso de férias | 30 dias de antecedência | não verificado (a lista não traz a data de início) |
| Pagamento de férias | 2 dias antes do início | idem |
| Pagamento da rescisão | 10 dias | idem |

Os números 3 e 5 já coincidem com os padrões desta extensão. Para que continuem iguais quando mudarem, aponte as regras do escritório para o mesmo arquivo (Configurações > Regras do escritório > "Usar o arquivo do portal do cliente").

## Ideias que ficaram de fora, por serem do lado do cliente

Leitura de PDF e foto por OCR, preenchimento automático, arrastar e soltar, conferência antes do envio, calculadoras, histórico e rascunho. O que faria sentido para o escritório, e ainda não foi feito: **prazos legais por solicitação** (férias com menos de 30 dias de antecedência, rescisão perto dos 10 dias), que exigem abrir cada solicitação para ler as datas.

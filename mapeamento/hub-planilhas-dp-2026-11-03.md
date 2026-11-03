# Hub · planilhas do Departamento Pessoal (03/11/2026, Hub versão 316)

Pedido do Josué: relatórios do DP com o visual do Hub e focados em gráficos e números.

## O que mudou no Hub
- `planilha.js` (novo, sem bibliotecas): gera o `.xlsx` direto (SpreadsheetML + gráficos nativos do Excel em DrawingML), `window.HubPlanilha.gerar(spec)`.
- Todos os relatórios do DP (quadro, movimento, férias, contratos, agenda, carteira, convenções, pendências) saem em Excel pelo botão "Gerar Excel com gráficos". Cada tipo monta seus gráficos (`relGraf*` em `hub.js`).
- Novos: "Planilha das empresas (Excel com gráficos)" (menu Mais) e "Planilha (Excel)" na lista de funcionários.

## Abas da planilha
1. **Painel**: faixa escura com a marca do Hub, título, indicadores em cartões e gráficos (2 por linha). Gráfico sem valor algum não entra.
2. **Dados**: a tabela do relatório, cabeçalho escuro, linhas zebradas, datas de verdade (dd/mm/aaaa), % e variação com sinal, barras nas colunas numéricas, linha de total, filtro e painel congelado.
3. **Base dos gráficos**: as tabelas que alimentam cada gráfico (podem ser editadas no Excel).
4. **Sobre**: filtros usados, notas e data de geração.

## Teste
`SAIDA=<pasta> HUB_DIR=<cópia do Hub> NODE_PATH=$(npm root -g) node testes/hub-onvio/planilhas.js`
(Playwright + Python `openpyxl`; empresas e funcionários fictícios, banco simulado). Confere abas, gráficos, filtro, painel congelado, datas e a soma do quadro.

A conferir: abrir no Excel do escritório (testado só no LibreOffice e no openpyxl).

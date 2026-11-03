# Hub · planilhas do Departamento Pessoal (03/11/2026, Hub versões 316 e 317)

Pedido do Josué: relatórios do DP com o visual do Hub e focados em gráficos e números.

## O que mudou no Hub
- `planilha.js` (novo, sem bibliotecas): gera o `.xlsx` direto (SpreadsheetML + gráficos nativos do Excel em DrawingML), `window.HubPlanilha.gerar(spec)`.
- Todos os relatórios do DP (quadro, movimento, férias, contratos, agenda, carteira, convenções, pendências) saem em Excel pelo botão "Gerar Excel com gráficos". Cada tipo monta seus gráficos (`relGraf*` em `hub.js`).
- Novos: "Planilha das empresas (Excel com gráficos)" (menu Mais) e "Planilha (Excel)" na lista de funcionários.

## Abas da planilha (enxuta desde a versão 317, pedido do Josué em 03/11/2026)
1. **Resumo**: faixa escura com a marca do Hub, título, período, **até 4 números** e **até 2 gráficos**. Só os filtros que restringem algo aparecem. Um link leva à lista.
2. **Dados**: link "Voltar ao resumo", a tabela do relatório (só as colunas que se usam: sem CNPJ onde o nome da empresa basta), cabeçalho travado, filtro em cada coluna, datas de verdade, barra só na coluna principal e linha de total.
3. **Base** (oculta): os números que alimentam os gráficos. O Excel lê dela, e quem quiser pode reexibir.

A aba "Sobre" saiu: o período e os filtros estão no Resumo.

## Período e "Ativos em uma data" (versão 317)
- O período dos relatórios é por **datas exatas** (De/Até, `AAAA-MM-DD`). Os atalhos (este mês, mês passado, 12 meses, este ano…) preenchem do 1º ao último dia. Os modelos salvos com mês (`AAAA-MM`) viram do 1º ao último dia do mês (`relAjustaDatas`).
- No relatório por períodos, o primeiro e o último mês (ou trimestre, ou ano) são cortados nas datas escolhidas (`evPeriodos` aceita mês ou data).
- Relatório novo **Ativos em uma data**: a quantidade de funcionários ativos em cada empresa no dia escolhido (`funcAtivoEm`: admitido até o dia e sem saída até o dia). Mostra o total, as empresas com ativos, ordem por nome, maiores primeiro ou por responsável, e a linha de total. Desligado sem data de saída não conta na data (aviso no relatório).

## Tela dos relatórios (versão 318)
- Filtros em três blocos lado a lado: Empresas, Período (ou Data) e Opções. Em janela estreita, eles descem.
- Os atalhos de período são botões, e o que está em uso fica marcado.
- **Data digitada:** o campo de data avisa a cada número digitado (no meio da digitação o ano passa por 0002, 0020…). Antes, cada aviso redesenhava o formulário, e o campo perdia o foco. Agora a data só vale quando está completa (ano de 1900 a 2100), e só o resultado é refeito, sem mexer no formulário (`relAtualizarResultado`). Ao sair do campo com a data incompleta, volta a data em uso. Enter confirma.

## Teste
`SAIDA=<pasta> HUB_DIR=<cópia do Hub> NODE_PATH=$(npm root -g) node testes/hub-onvio/planilhas.js`
(Playwright + Python `openpyxl`; empresas e funcionários fictícios, banco simulado). Confere as abas (Base oculta), no máximo 4 números e 2 gráficos, os links entre Resumo e Dados, filtro, cabeçalho travado, datas, a soma do quadro, os ativos de cada empresa numa data (contra os dados fictícios) e o período por datas exatas.

A conferir: abrir no Excel do escritório (testado só no LibreOffice e no openpyxl).

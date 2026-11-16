# Roteiro · o que falta mapear para as guias do FGTS (fase 2, 16/11/2026)

Para colar na extensão do Claude no Chrome, no computador com o certificado da ControlTax. Fecha o que o mapa de 16/11/2026 (`guias-fgts-dctfweb.md`) deixou em aberto. Só FGTS: a DCTFWeb continua pausada. O resultado volta para `guias-fgts-dctfweb.md`.

---

Você vai me ajudar a mapear o que falta no FGTS Digital (https://fgtsdigital.sistema.gov.br) e no Gestta para a extensão conferir e emitir a guia mensal do FGTS. Só observe as chamadas que a própria tela faz (DevTools F12 > Network, filtro Fetch/XHR, "Preserve log"; ou um registrador de chamadas na página, como da outra vez).

Não anote: token, cookie, certificado, CPF, nome de pessoa ou de empresa, CNPJ real, número de guia real nem valores em reais. Anote só: método, endereço (troque ids, CNPJs, números de guia e competências por {id}, {cnpj}, {numero}, {competencia}), nomes e tipos dos campos, códigos de situação, nomes de cabeçalhos (nunca o valor) e textos de rótulos e botões. Quando eu pedir "bate?", responda só sim/não.

Regras:
- Use a mesma empresa de teste da outra vez. Se precisar emitir, só numa competência em que emitir de novo não cause problema; se não houver, faça só as leituras e me diga onde parou.
- Nunca pague nada. Nunca clique em Emitir Guia numa competência de cliente real.
- Captcha ou escolha de certificado: resolva você e anote em que passo apareceu.

## 1. Como a extensão pode chamar o FGTS Digital
1. Numa chamada de leitura que já funcionou (`GET /cobranca/api/guia-parametrizada/debitos?...`), anote os NOMES dos cabeçalhos que a página manda (ex.: `Authorization`, `X-XSRF-TOKEN`, `X-Requested-With`), sem os valores, e se ela vai com cookie (sim/não).
2. Diga de onde a página tira o valor do cabeçalho de autorização, se houver: `localStorage`, `sessionStorage`, cookie ou resposta de alguma chamada (só o NOME da chave ou da chamada).
3. Repita a mesma leitura pelo console da página com `XMLHttpRequest` (mesmo endereço, mesmos cabeçalhos copiados da página): responde 200? (sim/não). E sem copiar os cabeçalhos, só com o cookie? (sim/não e o código).
4. Depois de quanto tempo parada a sessão cai (o contador de 30 min) e o que a API responde quando caiu (código e o nome dos campos do corpo).

## 2. Conferir sem selecionar nada (só leitura)
1. Para uma competência COM débito sem guia, faça a pesquisa da etapa 1 SEM clicar em "Adicionar à guia". Na resposta de `GET .../debitos`, a soma de `vlPrincipal` de todos os `debitos[]` (todas as páginas) bate com o "Valor do FGTS" do Extrato Mensal da mesma competência? (sim/não). E com o "Valor do FGTS" + "Valor do FGTS Aprendiz"? (sim/não)
2. Diga quantos débitos vêm por página, como pedir a página seguinte (nome do parâmetro) e se `qtdeTotalDebitos` dá o total.
3. Diga se `resumoSelecao` já vem preenchido sem selecionar nada (sim/não), e se `vlTotalPrincipal` é o total de todos ou só dos selecionados.
4. Para uma competência que JÁ tem guia emitida: a pesquisa devolve vazio, erro ou os débitos com `guiasRelacionadas` preenchido? (só o que acontece e o nome do campo)

## 3. A guia já emitida (para não emitir duas vezes)
1. Em Consulta de Guias, filtre pela competência de uma guia já emitida. Anote o corpo de `POST /cobranca/api/consultar-guias/guias` (nomes e tipos dos campos, como a competência vai) e as chaves de cada guia na resposta.
2. `GET /arrecadacao/emissao/reimprimirGuia/{numero}`: o que volta? (PDF direto, JSON com endereço, ou abre outra página; o `content-type` da resposta).
3. No PDF da guia, o "Identificador" e a "Tag" trazem a competência? (sim/não e o formato, ex. AAAAMM)

## 4. Os relatórios que vão com a guia
1. **Demonstrativo FGTS** (no Gestta é o item "Demonstrativo FGTS"): é o mesmo "Imprimir relatório FGTS em PDF" (detalhe da guia)? Abra um "Demonstrativo FGTS" já anexado numa tarefa concluída da empresa de teste e compare o título do PDF (só o título).
2. **Demonstrativo e-consignado** (item "Demonstrativo e-consignado" na tarefa): procure em que lugar do FGTS Digital ele sai. Lugares prováveis: a etapa 2 da Emissão Parametrizada (Selecionar Débitos Consignado), "Emissão de Guia de Consignados Vencidos", Consultas do Empregador, ou o ícone de opções da guia na Consulta de Guias. Anote o caminho do menu, o nome do botão, a chamada (método, endereço, nomes dos campos) e o título do PDF.
3. Se ele NÃO vem do FGTS Digital (vem do Domínio, por exemplo), diga de onde e se a tarefa costuma ficar com o item sem arquivo quando a empresa não tem consignado.
4. Para uma empresa COM empréstimo consignado (se houver alguma de teste): o valor do consignado entra no "Total da Guia" da guia mensal? (sim/não) E em qual linha do Extrato Mensal ele aparece? (só o rótulo)

## 5. Guia por filial
1. Com o perfil de procurador da MATRIZ, na pesquisa da etapa 1, dá para filtrar por estabelecimento? (sim/não; o nome do campo e de onde vem a lista)
2. Se não houver filtro: os débitos trazem `estabalecimentoRemuneracao`. Dá para marcar só os débitos de uma filial e emitir uma guia só com eles? Só responda olhando a tela (sem emitir), dizendo se a seleção por linha existe.
3. Diga se a guia emitida pela matriz traz a quebra por estabelecimento no PDF ou no detalhe (sim/não).
4. No Gestta, para uma empresa com filial que é cliente separado: existe tarefa FGTS DIGITAL na filial também? (sim/não)

## 6. Gestta
1. Numa tarefa FGTS DIGITAL ABERTA (de qualquer empresa, só olhando): a guia ainda não anexada aparece como item "FGTS Guia" sem arquivo? (sim/não) A equipe conclui a tarefa logo depois de anexar? (o que você vir no histórico: códigos)
2. Os itens "FGTS Guia" e "Demonstrativo FGTS" têm integração com o Domínio: quando o Domínio manda o arquivo, o nome dele chega de que forma? (só o padrão, ex. "Guia FGTS MM-AAAA.pdf", sem nome de empresa)

Me devolva um resumo em texto, na ordem 1 a 6, marcando o que NÃO foi possível fazer e por quê.

# Roteiro · refazer o detalhe da emissão do FGTS (16/11/2026)

O roteiro anterior emitiu uma guia, mas o detalhe das chamadas se perdeu. Este refaz **sem emitir de novo**: o que dá para ver até antes do "Emitir Guia" é observado na tela, e o resto é lido no próprio código da página. Só observação.

---

Você vai me ajudar a anotar o detalhe da emissão de guia no FGTS Digital (https://fgtsdigital.sistema.gov.br), sem emitir nada. Só observe as chamadas da tela (registrador na página; reinstale ao trocar entre /portal e /cobranca) e, onde eu pedir, leia o código JavaScript da página (Sources/Fontes do DevTools, buscando pelo nome da rota).

Não anote: token, cookie, certificado, CPF, nome de pessoa ou de empresa, CNPJ real, número de guia real nem valores em reais. Anote só: método, endereço (ids, CNPJs, números e competências como {id}, {cnpj}, {numero}, {competencia}), nomes e tipos dos campos do corpo e da resposta (em todos os níveis), parâmetros pelo nome e códigos de situação.

Regras:
- NÃO clique em "Emitir Guia". NÃO pague nada.
- Use a empresa de teste 985. Se ela não tiver débito, use a empresa em que a guia foi emitida da outra vez, só até a etapa 3 (o carrinho dela já tem 3 débitos; no fim, clique em "Reiniciar" para esvaziar e anote a chamada).

## 1. Etapa 1 (Adicionar à guia)
1. Pesquise a competência, marque os débitos e clique em "Adicionar à guia". Anote o corpo inteiro de `POST /cobranca/api/guia-parametrizada/debitos` (todos os campos de `filtro`, e o que entra em `inclusao` e `excecao` quando você marca todos e quando marca só alguns) e as chaves da resposta.
2. Anote de onde sai o `uuid` usado depois em `encargos?uuid` (resposta de qual chamada, nome do campo).

## 2. Etapas 2 e 3
1. Avançar: anote o corpo de `consignados:batch-create` (`filtro`, `ids`, `fgts`) e as chaves das respostas de `debitos-revisao`, `consignados-revisao` e `dados-filtro-consignado`.
2. Na etapa 3, anote as chaves da resposta de `agrupamentos-carrinho` e o formato de `dtPagamento`.

## 3. Emitir (pelo código, sem clicar)
No código da página, procure `gerar-guia` e `guia-rapida/confirma` e anote:
1. A ordem das chamadas ao clicar em "Emitir Guia" e o método de cada uma.
2. De onde vêm `uuid`, `tag` e **`hash`** do `gerar-guia` (campo de alguma resposta, cálculo no navegador, captcha?). Copie o nome das funções e variáveis, não valores.
3. Como a tela sabe que a guia ficou pronta (consulta de novo? quantas vezes e com que intervalo?) e de qual campo sai o número da guia nova.
4. As chaves da resposta de `gerar-guia` (pelo código ou pelo tipo declarado).

## 4. Consignado e filial (pelo que já foi visto)
1. Consignado: as duas chamadas de `consignado-guia-assincrono-pdf/{numero}` (nomes dos parâmetros e chaves das respostas), o domínio do arquivo e o título que aparece no PDF (só o título).
2. Filial: o formato de `estabalecimentoRemuneracao` (ex.: 14 dígitos sem pontuação) e o nome do parâmetro do filtro "Estabelecimento da Remuneração" na chamada `debitos`.

Me devolva um resumo em texto, na ordem 1 a 4, marcando o que não foi possível e por quê.

# Roteiro único · tudo o que falta mapear (16/11/2026)

Para colar na extensão do Claude no Chrome, no computador com o certificado da ControlTax, com o Gestta e o FGTS Digital abertos e logados. Junta o que sobrou dos roteiros anteriores. A DCTFWeb continua pausada e fica de fora. O resultado volta para `mapeamento/guias-fgts-dctfweb.md` (partes A a C) e `mapeamento/gestta-2026-11-04.md` (parte D).

---

Você vai me ajudar a mapear o que falta no FGTS Digital (https://fgtsdigital.sistema.gov.br) e no Gestta (app.gestta.com.br), só observando as chamadas que a própria tela faz (registrador de chamadas na página, como das outras vezes; o FGTS Digital tem dois sub-apps, /portal e /cobranca, e trocar entre eles recarrega a página: reinstale o registrador).

Não anote: token, cookie (valor), certificado, CPF, nome de pessoa ou de empresa, CNPJ real, número de guia real nem valores em reais. Anote só: método, endereço (troque ids, CNPJs, números de guia e competências por {id}, {cnpj}, {numero}, {competencia}), nomes e tipos dos campos do corpo e da resposta, códigos de situação e textos de rótulos, botões e mensagens. Quando eu pedir "bate?", responda só sim/não.

Regras:
- ESCRITA (emitir guia, anexar, incluir/tirar template) só na empresa de teste de código 985 no Gestta (e o CNPJ dela no FGTS Digital). Se algum passo for escrever em outra empresa, PARE e me avise.
- Nunca pague nada. Nunca clique em Emitir Guia numa empresa de cliente real.
- Partes marcadas "SÓ LEITURA" podem usar empresas reais, anotando só códigos e nomes de campos.
- Captcha ou escolha de certificado: resolva você e anote em que passo apareceu.

## A. Emissão da guia do FGTS (empresa 985)
Antes: em Emissão de Guia Parametrizada, veja se a 985 tem alguma competência com débito SEM guia emitida (o combobox de competência só lista as que têm). Se não tiver nenhuma, PARE a parte A e me diga; não emita guia de competência que já tem guia.
1. Pesquise a competência, marque todos os débitos e clique em "Adicionar à guia". Anote a chamada (método, endereço, corpo com nomes e tipos dos campos, situação) e o que mudou nos débitos (`incluido`) e no resumo.
2. Clique em Avançar até a etapa 2 (Consignado). Anote as chamadas e o corpo de `consignados:batch-create` (com e sem consignado, se houver).
3. Etapa 3 (Definir Vencimento): anote as chamadas, os campos da tela e se o vencimento padrão muda algo no corpo.
4. Etapa 4: clique em Emitir Guia. Anote TODAS as chamadas na ordem (método, endereço, parâmetros só pelo nome, corpo, situação) e as chaves da resposta de cada uma; diga de qual resposta sai o número da guia nova e se há espera (a tela consulta de novo até ficar pronta? quantas vezes e com que intervalo).
5. Depois de emitida: o PDF da guia (reimprimirGuia) e o "Imprimir relatório FGTS em PDF" já ficam disponíveis na hora? Anote se é preciso esperar.
6. Volte à pesquisa da mesma competência SEM o filtro "Sem guia emitida": os débitos vêm com `guiasRelacionadas` da guia nova? (sim/não)
7. Tente adicionar de novo os mesmos débitos a uma guia (só até a etapa 1, sem emitir): a tela deixa? Que mensagem aparece (código e título)?
8. Clique em "Reiniciar" e diga se ele chama alguma API (método e endereço).

## B. Consignado (SÓ LEITURA, qualquer empresa que tenha)
1. Em Consulta de Guias, ache uma guia com consignado (`contemConsignado` = true ou `gerouPdfConsignado` no totalizador). Anote como achou (filtro usado).
2. No ⋮ ou no detalhe da guia, gere o relatório do consignado. Anote as chamadas (deve ser `consignado-guia-assincrono-pdf/{numero}`, em duas chamadas, e depois o arquivo), as chaves das respostas, o domínio do arquivo e o TÍTULO do PDF.
3. O valor do consignado está dentro do "Total da Guia"? (sim/não) Qual linha do Extrato Mensal da mesma empresa corresponde ao consignado (só o rótulo)?
4. No Gestta, numa tarefa FGTS DIGITAL concluída dessa empresa, o item "Demonstrativo e-consignado" tem arquivo? (sim/não) O título do PDF anexado é o mesmo do passo 2? (sim/não)

## C. Filial (SÓ LEITURA, empresa real com filial)
1. Com o perfil de procurador da MATRIZ, pesquise uma competência e anote o formato do campo `estabalecimentoRemuneracao` nos débitos (só o formato, ex.: "14 dígitos sem pontuação", "com máscara", "CNPJ + nome").
2. Em "Expandir Pesquisa", filtre por "Estabelecimento da Remuneração" com o CNPJ de uma filial: anote o nome do parâmetro que entra na chamada `debitos` e se o resultado traz só os débitos da filial (sim/não).
3. A soma do principal só dos débitos da filial bate com o "Valor do FGTS" do Extrato Mensal da filial? (sim/não) E a soma de todos bate com o extrato da matriz, ou com a soma dos extratos? (diga qual)
4. No Gestta, a filial (cliente separado) tem tarefa FGTS DIGITAL própria? (sim/não; confirme pelo CNPJ, sem anotá-lo)

## D. Gestta: o que sobrou (empresa 985)
1. Numa tarefa concluída da 985 que tenha arquivo num item: o item mostra a lixeira (excluir arquivo)? (sim/não)
2. Na prévia do arquivo de um item, clique em "Download": anote a chamada (se houver) e o domínio do arquivo.
3. Inclua o template "TESTE MAPEAMENTO - NAO USAR" na 985 e depois tire. No "tirar" (`DELETE /admin/group/customer`, corpo `{ids}`), confirme de onde vem o id enviado: é o `_id` do item de `GET /admin/customer/{id}/company/task`? (sim/não)
4. Ainda no tirar: se o template já tiver tarefa gerada na empresa, que aviso aparece? Só olhe o texto; não gere tarefa para testar. Se não houver como ver sem gerar, diga que não deu.

Me devolva um resumo em texto, na ordem A a D, marcando o que NÃO foi possível fazer e por quê.

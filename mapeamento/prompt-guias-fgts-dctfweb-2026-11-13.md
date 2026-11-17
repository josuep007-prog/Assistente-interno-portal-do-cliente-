# Roteiro de mapeamento · guias de FGTS e DCTFWeb (13/11/2026)

Para colar na extensão do Claude no Chrome, no computador com o certificado da ControlTax. Serve para desenhar a função "Guias da folha" da extensão. O pedido do Josué, de 13/11/2026:
- a extensão mostra as folhas publicadas sem imposto;
- o analista escolhe as empresas;
- a extensão abre o FGTS Digital e o e-CAC, com o certificado da ControlTax;
- confere se a guia disponível bate com a folha;
- se bate, emite a guia e anexa na tarefa com a competência na frente do nome, depois que o analista aprova;
- se não bate, registra e pula para a próxima;
- no fim, o analista baixa uma pasta com todos os impostos.

Decidido na mesma conversa:
- só FGTS (FGTS Digital) e DCTFWeb (e-CAC);
- a lista sai das tarefas do Gestta;
- o analista escolhe o certificado uma vez por sessão;
- o que não bate só é registrado (não emite, não anexa).

O resultado deste roteiro vira o arquivo `mapeamento/guias-fgts-dctfweb.md`.

---

Você vai me ajudar a mapear como o Gestta, o FGTS Digital e o e-CAC (DCTFWeb) mostram e emitem as guias mensais da folha. Só observe as chamadas que a própria tela faz. Para isso, abra o DevTools (F12) > Network, filtro Fetch/XHR, e marque "Preserve log".

Não anote:
- token, cookie, certificado;
- CPF, nome de pessoa, nome de empresa nem CNPJ real;
- valores em reais.

Anote só:
- método e endereço (troque ids, CNPJs e competências por {id}, {cnpj}, {competencia} e diga de onde cada um veio);
- nomes e tipos dos campos;
- códigos de situação;
- textos de rótulos e botões das telas.

Regras:
- Use SÓ uma empresa de teste ou a própria ControlTax, numa competência já paga, em que emitir guia de novo não cause problema. Se não houver uma assim, faça só os passos de leitura e me diga onde parou.
- Nunca pague nada. Nunca transmita, retifique ou exclua declaração no e-CAC.
- Se aparecer captcha (gov.br, hCaptcha), resolva você mesmo e anote em que passo apareceu e com que frequência. A extensão nunca vai contornar captcha.
- Se em algum passo a tela for mexer em empresa de cliente real (emitir, gerar, enviar), PARE e me avise antes.

## 1. Gestta: onde estão a folha e as guias

1. Abra uma tarefa de folha de pagamento CONCLUÍDA, de uma competência recente.
   - Anote o nome do template da tarefa (ex.: "Folha de Pagamento"), o setor e se há uma tarefa separada para as guias.
2. Anote os itens de documento da tarefa da folha e os da tarefa das guias, se for outra.
   - Para cada um, anote o nome do item e se ele já tem arquivo.
   - Diga qual item recebe o extrato da folha, qual recebe a guia do FGTS e qual recebe o DARF da DCTFWeb.
3. Diga como a equipe sabe hoje que "a guia ainda não foi anexada": o item fica sem arquivo, a tarefa das guias fica aberta, ou outro jeito.
4. Abra o histórico da tarefa. Anote se a publicação do extrato aparece lá e com que tipo e situação (códigos).

## 2. Extrato da folha (Domínio, publicado no portal)

1. Abra o Extrato Mensal de uma empresa de teste.
   - Anote os RÓTULOS exatos das linhas que dão o valor a recolher de FGTS e o de INSS/DCTFWeb.
   - Exemplos do tipo de rótulo esperado: "Valor do FGTS", "Total FGTS", "INSS a recolher", "Total geral". Não copie os valores.
2. Diga se o valor do FGTS do extrato é o mesmo total que aparece na guia do FGTS Digital (sim/não, em quantas empresas você conferiu).
   - Se não for, diga o que costuma explicar a diferença (consignado, rescisão no mês, 13º, encargos).
3. Diga quais totais do extrato somados dão o valor do DARF da DCTFWeb (só os rótulos).
   - Exemplos: contribuição do segurado, patronal, RAT, terceiros, IRRF.
4. Diga se o extrato e o arquivo no portal trazem a competência e o CNPJ no texto (sim/não e o rótulo).

## 3. FGTS Digital (https://fgtsdigital.sistema.gov.br)

1. Entre com o certificado da ControlTax.
   - Anote se a janela de escolha do certificado aparece e quantas vezes por sessão.
   - Anote o tempo do timer de sessão.
2. Troque o perfil: **Trocar Perfil** > Procurador > CNPJ da MATRIZ de teste > Selecionar.
   - Anote a chamada que sai (método, endereço, corpo com nomes dos campos, situação).
   - Lembre: filial de empresa privada é recusada; a matriz traz todos os estabelecimentos.
3. Vá a **Gestão de Guias > Emissão de Guia Parametrizada** (`/cobranca/#/gestao-guias/emissao-guia-parametrizada`).
   - Deixe só **Mensal** em Tipo de Débito e a competência de teste.
   - Pesquise.
   - Anote a chamada que traz os débitos: endereço, corpo, nomes das chaves de cada débito, onde está o valor total e como vem a competência.
4. Selecione todos os débitos > **Avançar** > Definir Vencimento.
   - Anote a chamada de cada passo.
   - **Não emita ainda.** Anote o nome do botão de emitir e me pergunte antes.
5. Se eu autorizar a emissão nessa empresa de teste:
   - Emita e anote a chamada de emitir (método, endereço, corpo, situação).
   - Anote a chamada que baixa o PDF da guia e a do relatório (detalhe) da guia.
   - Diga o domínio do endereço do PDF e se ele expira.
   - Diga se emitir de novo a mesma competência gera outra guia ou devolve a mesma.
6. Diga se existe uma consulta de guias já emitidas (Gestão de Guias > Consultar) que devolve a guia e o PDF sem emitir de novo.
   - Se existir, anote a chamada.

## 4. e-CAC: DCTFWeb (https://cav.receita.fazenda.gov.br)

1. Entre pelo gov.br com o certificado da ControlTax.
   - Anote se aparece captcha e em que momento.
2. **Alterar perfil de acesso** > Procurador > CNPJ de teste.
   - Anote a chamada (ou o envio de formulário) e o que muda no endereço.
3. Abra a **DCTFWeb** (Declarações e Demonstrativos > DCTFWeb).
   - Anote o endereço do sistema (domínio próprio ou dentro do e-CAC).
4. Em Consultar Declarações, filtre a competência de teste. Anote:
   - a chamada que lista as declarações (nomes das chaves);
   - onde aparecem a situação (Ativa, Em andamento) e o "Saldo a Pagar".
5. Na declaração Ativa, clique em **Emitir Guia de Pagamento (DARF)**.
   - Anote a tela intermediária (escolha de débitos, data de acolhimento) e as chamadas.
   - **Não emita ainda.** Me pergunte.
6. Se eu autorizar a emissão:
   - Emita e anote a chamada que devolve o PDF do DARF (método, endereço, se vem o PDF direto ou um endereço).
   - Diga se o "Saldo a Pagar" da declaração é o mesmo valor do DARF.
7. Diga se há "Emitir DARF" também pelo Sicalc ou por outro caminho e qual o padrão da equipe.

## 5. Nomes dos arquivos

1. Abra a pasta de uma competência no servidor (`U:\Obrigações DP\FOPAG 2020 - 2023\<empresa>\...`) e a tarefa no Gestta. Anote como as guias estão nomeadas hoje nos dois lugares.
   - Exemplo: "DARF FGTS 10-2026.pdf", "10-2026 DARF FGTS.pdf".
   - Diga também se a guia do FGTS vai com o "DETALHE GUIA FGTS" junto.

Me devolva um resumo em texto com os itens 1 a 5, na ordem. No fim, diga quantas vezes apareceu captcha e se a escolha do certificado pediu clique toda vez.

---

## Como a extensão vai usar cada parte (a fazer depois do mapeamento, cada escrita com aprovação)

| Parte | Tipo | Como entra |
|---|---|---|
| Lista "folha publicada sem guia" (Gestta + extrato no portal do Onvio) | leitura | Tarefas de folha concluídas com o item da guia sem arquivo; valores do extrato lidos do PDF só na memória, nunca guardados |
| Débitos do FGTS Digital e saldo da DCTFWeb | leitura | Pela própria aba do site, com a sessão do analista, depois que ele escolhe o certificado; captcha = a extensão para e mostra a aba |
| Emitir guia (FGTS Digital, e-CAC) | **escrita nova no governo** | Só se o valor bate; teste com site simulado e aprovação do Josué antes de ligar |
| Anexar no item da tarefa | escrita já aprovada (`upload/direct`) | Com a confirmação do analista, nome com a competência na frente |
| Baixar a pasta | local | `chrome.downloads` numa subpasta por competência e empresa |
| Não bate | registro | Lista "não bateu" com os dois valores e a diferença, só na memória da tela (e no CSV, se o analista baixar) |

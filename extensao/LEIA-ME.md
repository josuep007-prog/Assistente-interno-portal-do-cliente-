# Control Onvio · ControlTax (v0.16.0)

Página de trabalho que fica **por cima do Onvio**, em tela cheia: filas, dashboards em tempo real, alertas e lembretes para analistas e gestores. O Onvio continua aberto por trás e mantém a sessão; é por ele que a extensão lê. Desde a v0.14.0 a extensão também **responde, encaminha, anexa e define responsável** no Onvio, sempre com confirmação e só nas listas já mapeadas; nunca exclui nada.

## Instalar (piloto)

1. Baixe o repositório (Code > Download ZIP) e descompacte numa pasta fixa (ex.: `C:\ControlTax\ControlOnvio`). Não apague a pasta depois.
2. No Chrome, abra `chrome://extensions` e ligue o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e escolha a pasta **`extensao`** (a que tem o `manifest.json`).
4. Fixe o ícone da extensão na barra (ícone de quebra-cabeça > alfinete).
5. Entre no Onvio: o Control Onvio abre por cima, em tela cheia. Precisa do Chrome 114 ou mais novo.

Para atualizar a versão: substitua os arquivos da pasta, clique em **Recarregar** no card da extensão e dê F5 na aba do Onvio.

## Como usar

- **Trilho lateral** (à esquerda, escuro, como no Control Hub): Hoje, Solicitações, Agenda e lembretes, Equipe, Clientes, Distribuir e Consultar no Onvio. Passe o mouse num ícone para ver o nome; os números vermelhos/azuis são o que pede atenção.
- **Ver Onvio** (canto superior direito) mostra a tela nativa do Onvio; o botão **Voltar ao Control Onvio**, no canto inferior direito, traz o app de volta. O ícone da extensão e o atalho **Alt+Shift+O** fazem o mesmo, e em qualquer outro site levam ao Onvio.
- **Busca** em janela central: tecla **/** ou **Ctrl+K**. Já mostra, enquanto você digita, as pendências lidas e os clientes; **Enter** busca em todas as listas do Onvio, inclusive concluídas (ou abre direto a solicitação, se você digitou o ID exato).
- Clique numa solicitação para abrir o **detalhe** (dados e trâmites lidos na hora). Setas **← →** passam para a anterior/próxima da mesma lista sem fechar. "Abrir no Onvio" leva à lista certa do Onvio já filtrada pelo ID.
- Nas listas: **↑ ↓** andam entre as linhas e **Enter** abre.
- Em Configurações dá para desligar "Abrir o Control Onvio ao entrar no Onvio".

## Telas

| Tela | Para quem | O que mostra |
| --- | --- | --- |
| **Hoje** | Analista (todos veem) | A visão do dia; o trabalho com as solicitações fica em **Solicitações**. **Carteira** no cabeçalho. Em cima, em **destaque vermelho**, as **admissões** retroativas, já passadas ou a até 2 dias úteis do início (o eSocial vence no dia anterior). **Destaque**: rosca % em dia (clicar numa parte abre as Solicitações com aquele motivo), carrossel e **Próximos passos**. **Avisos sem cálculo** em quadro de duas colunas (A avisar / Cliente avisado, com Avisar o cliente, Já avisei e Desconsiderar). **Painéis**: vencimentos de férias e rescisões (prazo legal), **sugestões de ação** (com link para resolver), **uso do portal pelo cliente** (lista errada, pedido repetido, solicitação abandonada) e **previsão de solicitações por empresa** (média das últimas 4 semanas, tendência e estimativa para 7 e 30 dias, lida na hora) |
| **Solicitações** | Analista e gestor | Onde o analista trabalha. Cartões por tipo, abas Minhas / Equipe toda / Sem responsável. Busca, vez (escritório/cliente), **Filtros** (tipo, gravidade, responsável), **Ordenar**, **Lista ou Cartões**, **Mais** (exportar CSV). Os filtros ativos aparecem como etiquetas que se tiram com um clique |
| **Agenda e lembretes** | Cada um | Calendário do mês com lembretes e expectativas de conclusão das suas solicitações; lista (atrasados, hoje, próximos, concluídos). Lembretes podem **repetir** (todo dia, todo dia útil, toda semana, todo mês) |
| **Equipe** | Gestor | Aba Painel (números, carga por responsável G1/G2/G3, entradas e saídas de 14 dias, pendências ao longo do dia, por tipo, **sugestão de distribuição** das sem analista e **próximas a prescrever**) e aba Responsáveis (**idade da fila**: mapa de calor analista × dias parada, e a carga de cada pessoa) |
| **Clientes** | Gestor e analista | Aba Painel (ranking e quem mais demora a responder) e aba Empresas (cartões ou lista, com fora do prazo, prescrição e aba errada) |
| **Consultar no Onvio** | Todos | As 10 listas do Onvio (uma aba para cada), inclusive concluídas, consultadas na hora, com busca e paginação |
| **Configurações** | Todos | Prazos, leitura ao vivo, regras do escritório, aprender ações e diagnóstico |

O **sino** do topo junta os alertas: nova solicitação para você, cliente respondeu, prescreve em até 5 dias, ficou fora do prazo, nova sem responsável e lembretes. Novidades das suas solicitações também aparecem como aviso na tela.

## Regras do semáforo (padrão, editáveis)

Vez do escritório: sem primeiro trâmite após 1 dia útil; aberta além de 3 dias úteis (simples) ou 5 (cálculo de férias e rescisão); parada há mais de 15 dias; expectativa de conclusão vencida.
Vez do cliente: sem retorno há mais de 5 dias úteis (laranja); a partir de 20 dias parada fica vermelho com a contagem até a prescrição de 30 dias.

Leitura das situações: em Geral, Férias, Rescisão e Afastamento, **Aguardando resposta** = o escritório precisa responder; **Respondido** = vez do cliente.

## Novidades da v0.16.0 (quadro dos avisos sem cálculo e detalhe mais limpo)

- **Avisos sem cálculo em quadro de duas colunas** no Hoje, logo abaixo do destaque: **A avisar** e **Cliente avisado** (aguardando o cálculo). Em cada cartão:
  - **Avisar o cliente** abre o detalhe já no formulário de resposta, com um texto pronto (empregado, cálculo que falta e data do pagamento) e a situação **Respondido** (a vez passa ao cliente). Dá para editar tudo; só vai ao Onvio depois de **Revisar e enviar** e **Confirmar envio ao Onvio**. É um trâmite no próprio aviso, que o cliente vê no portal. Enviado, o cartão passa para **Cliente avisado**.
  - **Já avisei** (avisou por telefone ou e-mail) passa para **Cliente avisado** sem escrever no Onvio; **Voltar** devolve.
  - **Desconsiderar** tira do quadro (fica em "desconsiderados", de onde volta com um clique).
  - O aviso sai do quadro sozinho quando o cálculo do empregado chega ou quando a solicitação deixa de estar pendente. A extensão guarda só o ID interno, a coluna e a hora (`semCalculoMarcas`).
  - O texto fica em `avisoSemCalculo` nas regras; o escritório pode trocar pelo arquivo de regras (chaves `{aviso}`, `{empregado}`, `{calculo}`, `{pagamento}` e `{ref}`).
- **Detalhe:** as abas (Trâmites, Dados, Para o cliente, Lembretes) não são mais achatadas quando a janela é baixa ou a solicitação tem muitos trâmites; só o corpo rola.
- **Aba Dados mais limpa:** só o que serve para atender. Saíram o bloco "Controle" (o que ele tinha já está no topo da janela, agora com "Aberta em … por …"), o cliente repetido e os campos técnicos (tipo de solicitação, meio, quem cadastrou, alterada em, datas de controle). Rótulos e valores em português (ex.: "Admissão", "Vínculo: Empregado"), sem repetição, e a descrição por último.

**Não feito: criar uma solicitação nova para o cliente.** As regras de segurança proíbem a extensão de criar solicitação, e o formato da criação não está completo no mapeamento (os valores de `serviceRequestType` e `requestWay` não foram anotados). Por isso o aviso vai como trâmite no próprio aviso. Para criar uma solicitação Geral é preciso a autorização do Josué, mapear esses valores na empresa de teste e um teste com API simulada.

## Novidades da v0.15.0 (Hoje como visão do dia)

- **Hoje sem os cartões de situação:** as situações e os cartões saíram do Hoje; o analista trabalha as solicitações em **Solicitações** (o antigo "Minha fila"). A rosca leva às Solicitações com o motivo escolhido. "Todas as solicitações" virou **Consultar no Onvio**.
- **Admissões em destaque** no topo do Hoje: retroativas (início antes do pedido), com o início já passado ou a até 2 dias úteis (`admissaoAviso`). O eSocial (S-2200) vence no dia anterior ao início. A solicitação também fica fora do prazo ou em atenção nas Solicitações.
- **Vencimentos de férias e rescisões:** pagamentos que vencem nos próximos 10 dias úteis, do mais perto.
- **Sugestões de ação** com o número e o link que resolve (admissões, críticas G3, pagamentos vencendo, avisos sem cálculo, cliente respondeu, sem responsável, perto de prescrever, lista errada).
- **Uso do portal pelo cliente:** empresas com pedidos na lista Geral que têm aba própria, pedidos repetidos em aberto e solicitações paradas esperando o cliente.
- **Previsão de solicitações por empresa:** média por semana das últimas 4 semanas, tendência (2 semanas recentes x 2 anteriores) e estimativa para os próximos 7 e 30 dias. Calcula sozinha ao abrir o Hoje (no máximo a cada 30 min), lida na hora e nunca guardada.

**A confirmar no Onvio real:** se a data de admissão vem na lista de Cadastro (`admissionDate`; em estagiário pode ser `startDate`).

## Novidades da v0.14.0 (ações no Onvio)

Feito a partir do mapeamento na empresa de teste (`mapeamento/acoes-2026-10-15.md`).

- **Responder pelo detalhe:** escolha a situação (Em análise, Em análise interna, Respondido ou Concluído; depois de Respondido, só Respondido e Concluído, como no Onvio), escreva o texto e anexe arquivos (até 10, de até 15 MB). **Inserir observações para o cliente** coloca no texto as observações de prazo da aba "Para o cliente". Antes de enviar, **Revisar e enviar** mostra o resumo e só **Confirmar envio ao Onvio** manda.
- **Encaminhar** para outro usuário (com comentário), **definir responsável** e **alterar expectativa** (só na Geral, a única testada), também com confirmação.
- **Distribuir:** **Atribuir** em cada linha (com confirmação) e **Atribuir todas**, com o resumo de quantas vão para cada pessoa. O resultado aparece na linha.
- **Onde funciona:** Geral, Aviso e Cálculo de férias, Aviso e Cálculo de rescisão e Afastamento. Cadastro e Rubricas ficam bloqueados (o botão explica) até serem mapeados. O Onvio também bloqueia: definir responsável na folha quando já tem um; na Geral, com a situação Respondido; encaminhar com Respondido.
- **Segurança:** o envio sai de dentro da aba do Onvio, com a sessão e a autorização da própria tela (a autorização fica só na memória da página, nunca é gravada). Só os endereços de trâmite, anexo do trâmite, responsável e expectativa podem receber escrita; **nunca exclui** nada nem cria solicitação. Texto e anexos não são guardados. Se o Onvio recusar, a mensagem diz o código e nada se perde do que você escreveu.
- O Onvio às vezes responde 503 na primeira leitura; a extensão tenta de novo uma vez.
- Lembrete do Onvio: o primeiro trâmite de uma solicitação sem responsável define quem respondeu como responsável.

**A confirmar no Onvio real:** o envio feito pela extensão (o mapeamento foi pela tela); anexo e expectativa nas listas de férias, rescisão e afastamento (o anexo segue o mesmo desenho da Geral; a expectativa ficou só na Geral).

## Novidades da v0.13.0 (detalhe completo, prazos legais, avisos sem cálculo, tipos e distribuição)

- **Vencimento pelo prazo legal, não pela expectativa do cliente.** A "Expectativa de conclusão" que o cliente informa deixou de contar como atraso (aparece só como informação). Contam os prazos internos e, em férias e rescisão, o **prazo legal de pagamento**: férias até 2 dias antes do início (CLT art. 145) e rescisão até 10 dias após o desligamento (CLT art. 477 §6º), antecipando fim de semana e feriado. Quando faltam **5 dias úteis** ou menos (o tempo que um analista leva num período cheio, `tempoOcupado` nas regras), a solicitação pede atenção; com 1 dia útil ou menos, fica fora do prazo. A agenda mostra os prazos legais.
- **Hoje · Avisos sem cálculo:** avisos de férias e de rescisão com o pagamento dentro desse prazo e **sem a solicitação de cálculo** do mesmo empregado no mesmo cliente. A data vem do detalhe do aviso (lido uma vez) e o cálculo só é procurado quando o prazo está perto; só datas e sim/não ficam guardados.
- **Detalhe completo:** a aba **Dados** mostra tudo o que compõe a solicitação no Onvio (dados do empregado, férias, rescisão, cadastro, rubricas, anexos da solicitação), em grupos, lido na hora e nunca guardado. Campo novo do Onvio aparece com o nome técnico, para nada ficar escondido.
- **Para o cliente:** nova aba no detalhe com observações de prazo e cuidados do que o cliente pediu (prazo de conclusão, início e pagamento das férias, prazo da rescisão, admissão no eSocial, afastamento e INSS…), já com as datas. Avisos fora do prazo vêm primeiro. **Copiar observações** copia o texto pronto com um clique, para colar na resposta. As frases ficam em `observacoes` nas regras e o escritório pode trocar pelo arquivo de regras.
- **Fila por tipo:** cartões com cada tipo de solicitação (quantas, quantas fora do prazo, de quem é a vez); um clique filtra e outro tira. Ordem rápida por **Prioridade** (a mesma do Hoje), **Empresa** (agrupada), **Mais recente** ou **Mais parada**, lembrada entre as visitas.
- **Distribuir (novo módulo):** para cada solicitação sem responsável, sugere quem **mais atendeu aquela empresa na última semana** (14 ou 30 dias, se quiser), contando as solicitações movimentadas no período. **Admissões ficam fora da conta** e vão para quem mais fez admissões. Sem histórico, vai para quem tem menos pendências. Lido na hora, nada guardado. A sugestão pode ser trocada na lista.
- **Responder, mudar situação, anexar e definir responsável por dentro da extensão:** pedidos, mas ainda **não implementados**. Eles escrevem no Onvio e precisam do formato real de cada chamada: rode a Parte 4 de `mapeamento/prompt-mapeamento-onvio.md` (só na empresa de teste) e envie o resultado. Até lá, "Abrir no Onvio".

**A confirmar no Onvio real:** a busca do cálculo pelo nome do empregado (`searchText`) e a data de desligamento no detalhe da rescisão (sem ela, o prazo conta da data do aviso, o caso mais apertado).

## Novidades da v0.12.0 (pronta de primeira: caminhos do Onvio mapeados)

Mapeamento feito no Onvio real em 15/10/2026 (`mapeamento/onvio-2026-10-15.md`). Ninguém precisa mais "ensinar" nada à extensão.

- **Trâmites em todas as listas, sem aprender nada.** O Onvio não lê os trâmites no caminho da lista: Geral usa `service-requesting/v1/tickets`, os 3 Cadastros usam `employees-registrations`, Férias, Rescisão e Afastamento usam `br-payroll-sr/v1/tickets` e Rubricas usa `payroll-entries`. Esses caminhos agora são fixos. O "aprender a rota" da 0.11.1 saiu (aviso, botão "Esquecer rotas" e o envio do caminho pelo Onvio).
- Ao atualizar, a extensão esquece as rotas antigas e os erros de trâmites guardados, então o **1º trâmite** volta a ser estimado já na próxima leitura.
- **Rubricas sem HTTP 500.** O filtro de pendentes por exclusão (diferente de 8 e 10) dava erro 500 em toda leitura antes de cair na alternativa. Agora vai direto pela lista de códigos.
- **Cadastro:** o código 7 (**Encaminhado para outro usuário**) agora é pendente do escritório (antes ficava fora da fila). Em Geral, Férias, Rescisão e Afastamento o 7 passou a aparecer com o nome completo.
- **Escritório x cliente:** a sessão do Onvio traz a permissão `Platform.OnvioStaffAccess` para o usuário do escritório; a extensão usa isso para confirmar o acesso do escritório.
- O **modo aprender** (Configurações > Aprender ações) anota o formato de qualquer chamada à API do Onvio, não só das de solicitações (continua sem valores). Serve para mapear as ações da fase 2.

**Confirmado no Onvio real:** caminhos dos trâmites das 10 listas, códigos de situação, grade Wijmo com a coluna "Último Trâmite". **A confirmar:** como a sessão aparece com um login de cliente (só o do escritório foi visto).

## Novidades da v0.11.2 (cabeçalho padronizado)

- Todas as ferramentas do cabeçalho têm a mesma altura (34 px), a mesma borda e os mesmos cantos: carteira, busca, "Ao vivo", atualizar, sino e "Ver Onvio".
- "Ao vivo" e o botão de atualizar viraram um controle só; "Ver Onvio" fica separado por um divisor e deixou de ser o botão preto, que pesava mais que o resto.
- O rótulo "Carteira" segue o padrão de rótulo pequeno em maiúsculas.

## Novidades da v0.11.1 (trâmites que davam "HTTP 404")

Em algumas listas (como **Aviso de férias**) o detalhe mostrava "Não foi possível ler os trâmites (HTTP 404)". A extensão usava para todas as listas o caminho de trâmites que só tinha sido confirmado em Cadastro.

- Agora o Control Onvio **aprende o caminho com o próprio Onvio**. Abra os trâmites de **uma** solicitação daquela lista na tela nativa do Onvio (botão **Abrir no Onvio** no detalhe) e pronto: a extensão guarda o caminho (só o endereço, nunca o conteúdo) e passa a mostrar os trâmites daquela lista. Se o detalhe estiver aberto, ele atualiza sozinho.
- Com o caminho aprendido, o **1º trâmite** dessa lista também volta a ser estimado na próxima leitura.
- Configurações > Diagnóstico mostra "**Trâmites por lista**": padrão, aprendido ou "a aprender (404)". O botão "Esquecer rotas de trâmites aprendidas" volta ao padrão.

Substituído na v0.12.0: os caminhos de trâmites passaram a ser fixos.

## Novidades da v0.11.0 (Hoje no formato de Convenções)

O Hoje da v0.10 (painel escuro com radar, pulso e mosaico) era bonito, mas não ajudava a decidir. Agora ele segue a tela **Convenções** do Departamento Pessoal do Control Hub:

- **Destaque** em cartão claro: a rosca mostra a porcentagem em dia (clicar numa parte filtra), o título diz quantas solicitações pedem sua atenção e um **carrossel** passa uma pendência por vez (a barra viva virou o carrossel; a bolinha da leitura ao vivo ficou ao lado). À direita, **Próximos passos**: lembretes de hoje e atrasados (com "Feito") e as mais urgentes, cada uma com o que fazer ("Responder o cliente", "Cobrar o cliente · prescreve em 4 dias", "Concluir hoje"…).
- **Situações** com número viram filtros, e os **cartões** aparecem agrupados por situação, como os de Convenções: barra colorida, anel com os dias parada contra o limite (parada no escritório, prescrição no cliente), situação, vez, responsável e o próximo passo no rodapé. Sem filtro aparecem só os grupos que pedem atenção; "Em dia" fica a um clique.
- **Carteira** no cabeçalho, como no Departamento Pessoal: a sua, a equipe toda, cada analista ou "Sem analista". Substitui o seletor Minhas/Equipe e o mosaico.
- Busca na carteira e visão **Cartões ou Lista**.
- Saíram o painel escuro, o radar, o pulso e o mosaico. A Equipe continua com o mapa de calor, a prescrição e a sugestão de distribuição.

## Novidades da v0.10.0 (Hoje enxuto e visual)

O Hoje tinha 11 blocos empilhados e ficou confuso. Agora ele responde uma pergunta só, "o que eu faço agora?", e o resto mudou de lugar (nada sumiu):

- **Painel escuro de controle** no topo, com a barra viva e três gráficos interativos:
  - **Anel de prioridades** no lugar dos números: cada fatia é um motivo (fora do prazo, perto de prescrever, vence hoje, cliente respondeu, em dia), com o total no centro e legenda com o número. Clicar numa fatia ou na legenda filtra a lista; o segundo clique desliga.
  - **Radar da fila**: cada solicitação é um ponto na régua de dias parada (0 a 30+), em duas faixas (escritório e cliente), com linhas tracejadas de "parada" e de prescrição tiradas das suas regras. Com filtro ativo, os pontos que não combinam apagam. Clique abre o detalhe.
  - **Pulso do dia**: a fila da equipe ao longo do dia, como cotação (▲ cresceu, ▼ diminuiu desde a primeira leitura), com entraram e saíram.
- **Lista única de prioridades** no lugar de "Para fazer agora" e "Precisa de atenção": cada solicitação aparece uma vez, com o motivo mais forte, na ordem fora do prazo → perto de prescrever → vence hoje → cliente respondeu → as demais por dias parada. Os filtros do anel e do mosaico aparecem como etiquetas com ×.
- **Mosaico da equipe** no lugar das barras por analista: um bloco por analista e um para "Sem analista" (hachurado), com tamanho proporcional às pendências e cor do pior caso. Clique filtra a lista por aquela pessoa.
- **Agenda de hoje** só com o que é de hoje (lembretes atrasados e de hoje, expectativas de conclusão), com "Feito".
- Mudaram de lugar: o mapa de calor de idade foi para **Equipe > Responsáveis**; prescrição e sugestão de distribuição, para **Equipe > Painel**; a semana fica em **Agenda**; a atividade, no **sino**.
- A **Minha fila** aceita o filtro por motivo vindo do Hoje ("Só: Fora do prazo", etc.).

## Novidades da v0.9.1 (números do Hoje: seus ou da equipe)

Os números do topo do Hoje contavam só as solicitações em que **você é o responsável** no Onvio. Quem não é responsável por nenhuma pendente (gestor, coordenação, processos) via tudo zerado, mesmo com o Onvio cheio. Agora:

- há um seletor **Minhas · N / Equipe · N** em cima dos números; sem nada com você, ele já abre na **Equipe** (com ação do escritório, fora do prazo, vencem hoje, cliente respondeu, sem analista);
- a frase embaixo da data explica de onde vêm os números;
- se a leitura voltar vazia nas 10 listas, a tela diz isso em vermelho e aponta para "Testar a leitura" (nunca zero em silêncio);
- o Diagnóstico mostra quantas pendências estão com você ("atribuídas a mim" do Onvio) e com qual usuário a leitura foi feita.

**A confirmar no Onvio real:** se o filtro "atribuídas a mim" (`assignedtome=true`) devolve as suas solicitações. Se você é responsável por alguma pendente e o Diagnóstico mostra 0 com você, me envie o Diagnóstico.

## Novidades da v0.9.0 (Hoje com a equipe)

- **Barra viva** no lugar da faixa "Ao vivo": as pendências da equipe passam como cotações da bolsa, da mais grave para a menos grave, com a bolinha de leitura (verde ao vivo, cinza parada, vermelha sem leitura) e setas ▲/▼ quando a solicitação piorou ou melhorou nas últimas 2 horas. Para ao passar o mouse; o clique abre o detalhe.
- **Solicitações por analista**, com "Sem analista" sempre em cima, barras por gravidade, sua linha em negrito e seletor Todas / Escritório / Cliente. Clique leva à fila da pessoa.
- **Placar do dia**: entraram, saíram, saldo e o tamanho da fila comparado com o fim de ontem, com a linha do dia.
- **Idade da fila**: mapa de calor analista × dias parada (0–2, 3–5, 6–15, 16–30, 31+). O clique abre a fila com o filtro "Parada há …".
- **Próximas a prescrever** (equipe toda, até 7 dias) e **sugestão de distribuição** das sem analista para quem está menos carregado (carga = pendências na vez do escritório, pesadas pela gravidade). É só sugestão: o responsável continua sendo definido no Onvio.
- Correção: a tela agora rola até o fim (um estilo antigo do painel lateral esticava a página e cortava as últimas seções).

## Novidades da v0.8.1 (só a visão do escritório)

As APIs de solicitações são as mesmas na visão do cliente e na do escritório, então, com o login de um **cliente**, a leitura "funcionava" e mostrava as solicitações da empresa dele. Agora a extensão confere o perfil do acesso antes de ler:

1. pela própria sessão do Onvio, quando ela diz o tipo do usuário;
2. por uma aba do Onvio na visão do cliente (`onvio.com.br/clientcenter/...`);
3. por um endereço que só o escritório acessa (acesso por departamento): se o Onvio recusa com a sessão válida, é cliente.

Com acesso de cliente: nada é lido, o que já tinha sido lido é apagado (os lembretes pessoais ficam), o app não abre sozinho e, se aberto pelo ícone, mostra só o aviso "Este é um acesso de cliente". Ao entrar com o login do escritório, o botão "Já entrei com o login do escritório" (ou a próxima verificação) volta ao normal.

**A confirmar no Onvio real:** qual dos três sinais aparece no login de cliente. Configurações > Diagnóstico mostra "Perfil da sessão" e o formato da sessão (só nomes de campos, sem valores); copie e envie, com um login de cliente de teste, para fixarmos a regra. Se nenhum sinal aparecer, o Diagnóstico diz "não confirmado" e a extensão não bloqueia (para não travar o escritório por uma mudança do Onvio).

## Novidades da v0.8.0 (visual e usabilidade do Control Hub)

Desenho tirado dos módulos **Departamento Pessoal** e **Portal do Cliente** do Control Hub:

- **Trilho lateral escuro** com ícones e contadores, no lugar do menu claro; o cabeçalho de cada tela tem título, **abas** e as ferramentas (busca, ao vivo, sino, Ver Onvio).
- **Hoje** no formato do Portal do Cliente: números grandes, faixa ao vivo, semana clicável, colunas "Para fazer agora" e "Precisa de atenção".
- **Barra de ferramentas** do DP nas filas: Filtros num menu com contador, Ordenar, Lista/Cartões, Mais; etiquetas dos filtros ativos.
- **Detalhe** em janela grande com abas (Trâmites, Dados, **Lembretes** da solicitação), resumo (responsável, último trâmite, dias parada, expectativa) e **anterior/próxima** sem fechar.
- **Busca em janela central** (/ ou Ctrl+K) com resultados enquanto digita.
- **Agenda do mês** e **lembretes que repetem** (janela "Novo lembrete" igual à do Hub).
- Equipe e Clientes ganharam abas (Painel / Responsáveis, Painel / Empresas em cartões).
- Continua **somente leitura**; as ações ficam para a próxima versão, depois do mapeamento.

## Novidades da v0.7.0 (a página por cima do Onvio)

- O painel de canto virou um **app em tela cheia** por cima do Onvio, com menu lateral, busca, indicador ao vivo, sino de alertas e o botão "Ver Onvio".
- **Dashboards em tempo real:** Início (analista), Equipe (gestor) e Clientes. Os gráficos usam uma paleta validada para daltonismo, com legenda e dica ao passar o mouse.
- **Detalhe da solicitação** com dados e linha do tempo dos trâmites, lidos na hora e **não guardados**.
- **Lembretes pessoais** com aviso do Chrome na hora marcada, mesmo com o Onvio fechado.
- **Alertas** guardados (os 300 mais recentes): só tipo, ID, cliente, motivo e hora.
- **Série do dia** (entradas, saídas e pendentes por hora, 60 dias) para os gráficos do gestor.
- **Guias removidas** (aba, aviso na tela de Documentos e scripts).
- Ainda **somente leitura**: os botões Responder, Definir responsável, Alterar expectativa e Anexar aparecem desabilitados até as ações serem mapeadas (Configurações > Aprender ações).

## Novidades da v0.6.0 (aprender as ações do Onvio)

Primeiro passo para a extensão virar a tela de trabalho e fazer as ações (responder, definir responsável, anexar...). Para isso ela precisa conhecer o formato das chamadas que o Onvio faz, e esse formato não é público.

**Aprender ações** (Configurações): com o modo ligado, a extensão anota o **formato** das chamadas que o próprio Onvio faz enquanto você trabalha (método, endereço com os números trocados por `{id}`, nomes e tipos dos campos enviados e recebidos). **Nunca anota valores**: textos, nomes, CPF, datas e números viram só o tipo ("texto", "texto:data", "number"). Em anexos, só o nome do campo e o tipo do arquivo. Desliga sozinho depois de 2 horas. A tela traz o roteiro de ações; use **só na empresa de teste** e depois clique em "Copiar o que foi aprendido".

## Novidades da v0.5.0 (leitura em tempo real e mais robusta)

**Tempo real.** Com o Onvio aberto e visível, a extensão confere a cada 30 segundos se algo mudou: uma chamada leve por lista (1 item, total e última movimentação). Se mudou, lê tudo de novo; se não, só registra que verificou. Além disso, a leitura completa acontece a cada 5 minutos de qualquer jeito. O rodapé do painel mostra "Ao vivo · verificado HH:MM:SS" e avisa se parar de verificar. Em **Configurações > Leitura do Onvio** dá para mudar os segundos (mínimo 15; 0 desliga) e os minutos da leitura completa.
**Atualização imediata.** Quando você faz algo no Onvio que altera solicitações (responder, definir responsável, concluir etc.), a página avisa a extensão e a leitura acontece em até 2 segundos, juntando várias ações seguidas numa só. A extensão só ouve que houve uma ação; não lê nem guarda o conteúdo.
**Carga no Onvio.** Cada pessoa com o Onvio visível faz cerca de 10 chamadas pequenas por verificação. Abas escondidas não verificam, e se duas abas verificarem em seguida a segunda é ignorada (janela de 10 s).
**Leitura mais robusta.** A extensão validava a sessão com um endereço de sessão que nunca foi confirmado, o que podia resultar em "Sem sessão no Onvio" mesmo logado. Agora a sessão é validada com a própria lista de solicitações e a leitura tenta três jeitos, na ordem: pela página do Onvio (como a própria página faz), pela extensão dentro da aba e direto. Lembra o que funcionou. Se todos falharem, o aviso diz o que cada um recebeu (por exemplo "página do Onvio: HTTP 401 · extensão na aba: HTTP 403 · direto: devolveu uma página"). O botão **Testar a leitura agora** (Configurações) mostra isso sem dados de clientes e serve para diagnóstico.

## Novidades da v0.4.0 (a extensão passa a viver dentro do Onvio)

**Só no Onvio.** O painel deixou de ser o painel lateral do Chrome e passou a ser uma coluna dentro das páginas do Onvio, como no Assistente do Portal do Cliente. Em outros sites a extensão não aparece.
**O ícone leva ao Onvio.** Dentro do Onvio, o ícone abre e fecha o painel. Em qualquer outro site, ele leva direto ao Onvio: reaproveita uma aba do Onvio que já esteja aberta ou cria uma, e abre o painel nela. O atalho **Alt+Shift+O** faz o mesmo.
**Botão flutuante.** No canto inferior direito do Onvio, a pílula "Control Onvio" mostra quantas solicitações suas aguardam ação do escritório (vermelha se alguma está fora do prazo, laranja se há atenção). Clique para abrir.
**Disposição na tela.** O painel é uma coluna fixa de 420 px à direita e, em telas de 1000 px ou mais, a página do Onvio encolhe para nada ficar escondido atrás dele (em telas menores ele cobre). Cabeçalho escuro com atualizar, tema, configurações e fechar (também fecha com Esc); abas escuras com ícone; só o conteúdo rola; rodapé com "Somente leitura" e o horário da última leitura.
**Continuidade.** O painel lembra se estava aberto na aba: ao clicar numa solicitação, a lista do Onvio abre na mesma aba e o painel continua aberto. Com o painel fechado, a página não carrega nada a mais.
**Sem permissão de painel lateral.** A permissão `sidePanel` saiu do manifesto.

## Novidades da v0.3.0 (inspiradas no Assistente do Portal do Cliente)

**Regras do escritório.** Prazos, feriados e as palavras da "aba errada" podem vir de um arquivo JSON publicado em um endereço https (Configurações > Regras do escritório). O arquivo só traz dados e é validado: número fora do limite, data inválida ou texto longo demais são ignorados, e nada é executado. Se o download falhar, vale a última cópia boa; sem endereço, valem as regras embutidas. `regras/escritorio.exemplo.json` mostra o formato. A extensão também entende o `regras.json` do Assistente do cliente (usa `prazoInternoDiasUteis` e `feriados`), então os dois lados podem prometer os mesmos prazos; o botão "Usar o arquivo do portal do cliente" preenche esse endereço. Na primeira vez o Chrome pede permissão para acessar o endereço.
**Ordem de prioridade:** padrões do código, depois o arquivo do escritório, depois o que você mudar nas configurações. A tela passa a gravar só o que você realmente mudou, para uma atualização do arquivo continuar valendo. Configurações antigas são migradas na atualização.
**Possível aba errada.** Na lista Geral, se o assunto lembra férias, rescisão, atestado, admissão, estágio ou rubricas, a linha mostra "Pode ser: …". É só uma pista (casa palavra inteira, sem acento e sem maiúsculas) e as palavras ficam nas regras.
**Fontes empacotadas.** O painel e as configurações não pedem mais nada ao Google Fonts.
**Página aberta durante a atualização.** Se a extensão for atualizada com o Onvio aberto, a marca de dias parada e o aviso de guias se desligam e pedem para recarregar (F5), em vez de falhar em silêncio.
**Copiar diagnóstico** (Configurações): texto sem nomes nem valores, para enviar ao suporte.

## Novidades da v0.2.0

**Situação desconhecida.** Se o Onvio devolver um código que a extensão não conhece, a solicitação aparece como "Situação desconhecida (código N)" com alerta amarelo, fora das contagens "escritório" e "cliente", e o painel mostra um aviso no topo. Antes, ela era tratada como vez do escritório.

**Rubricas.** A pendência passou a ser "tudo menos Concluído e Prescrita" (filtro por exclusão), o que também pega códigos novos. Se o Onvio recusar esse filtro, a extensão volta sozinha para a lista de códigos e registra isso em Configurações > Diagnóstico.

**Gravidade (aba Analistas).** G1 = atenção. G2 = fora do prazo. G3 = crítica: fora do prazo e (prescreve em até 5 dias, ou parada há 2x o limite de parada, ou aberta há 2x o prazo de conclusão). É uma definição adotada pela extensão, em um só lugar (`gravidade()` em `core.js`); ajuste se o critério interno for outro.

**1º trâmite (estimativa).** A lista não traz o histórico. A extensão lê os trâmites de cada pendência uma vez (no máximo 60 por ciclo, 4 ao mesmo tempo, com cache) e considera primeiro trâmite do escritório o primeiro depois da abertura cuja situação não seja uma que o cliente grava. Confira alguns casos na aba Trâmites do Onvio antes de usar o número para cobrar alguém. Para Geral o caminho dos trâmites ainda não foi confirmado; se falhar, a extensão para de tentar naquele tipo e mostra a falha no Diagnóstico.

**Marca na grade.** É uma marca dentro da célula Último Trâmite, e não uma coluna nova: a grade do Onvio (Wijmo) só desenha as células visíveis e redesenha ao rolar, então uma coluna criada por fora quebraria o layout. Se a marca não aparecer, abra o console da página (F12) e rode `document.dispatchEvent(new CustomEvent('controlonvio-diagnosticar'))`; ele mostra o que foi reconhecido e o que faltou.

**Guias não visualizadas.** Funciona com o que a própria tela de Documentos (Onvio Gestão) já carrega: a extensão não faz chamadas extras. Por isso só entram as pastas que você abriu. Quando o cliente visualiza a guia e você reabre a pasta, ela sai da lista. A busca global de documentos do Onvio (`storage/v1/containers/documents/search`) ainda não foi testada; só com ela seria possível varrer todos os clientes de uma vez.

**Correções.** Erro do servidor (500, 404) não aparece mais como "sem sessão"; só 401, 403 e a página de login pedem login. O mapa de notificações guarda só tipo e número e descarta o que tem mais de 24 horas.

## Privacidade

A extensão usa a sessão do Onvio de quem está logado e só vê o que o perfil da pessoa já vê. Guarda no computador apenas: o resumo das pendências (ID, situação, datas, cliente, empregado/assunto e responsável), os alertas (tipo, ID, cliente, motivo e hora), a série do dia (só contagens), os seus lembretes e a coluna de cada aviso no quadro dos avisos sem cálculo (ID interno, coluna e hora). O detalhe e os trâmites de uma solicitação são lidos na hora e não são gravados. Não guarda CPF, salário, descrição, observações nem anexos.

## Problemas comuns

- **"Sem sessão no Onvio"**: abra o Onvio e faça login; a extensão tenta de novo no próximo ciclo (ou clique em atualizar).
- **Aba Minhas vazia**: só aparecem solicitações em que você é o responsável no Onvio.

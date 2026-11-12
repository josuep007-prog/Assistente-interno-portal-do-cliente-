# Control Onvio · ControlTax (v0.100.2)

Página de trabalho que fica **por cima do Onvio**, em tela cheia: filas, dashboards em tempo real, alertas e lembretes para analistas e gestores. O Onvio continua aberto por trás e mantém a sessão; é por ele que a extensão lê. Trabalha também por cima do **Gestta** (Tarefas do Gestta: Meu dia, Empresas, Lista, Obrigações, Calendário e Fechamento do mês, com concluir, impedimento, comentário e envio de documento) e alimenta o **Control Hub** (opcional). Desde a v0.14.0 a extensão também **responde, encaminha, anexa e define responsável** no Onvio e, desde a v0.17.0, **cria solicitações Geral** para o cliente, sempre com confirmação e só nas listas já mapeadas; nunca exclui nada.

## Instalar (piloto)

1. Baixe o repositório (Code > Download ZIP) e descompacte numa pasta fixa (ex.: `C:\ControlTax\ControlOnvio`). Não apague a pasta depois.
2. No Chrome, abra `chrome://extensions` e ligue o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e escolha a pasta **`extensao`** (a que tem o `manifest.json`).
4. Fixe o ícone da extensão na barra (ícone de quebra-cabeça > alfinete).
5. Entre no Onvio e clique na bolinha com a logo (canto inferior direito) ou no ícone da extensão: o Control Onvio abre por cima, em tela cheia. Ele nunca abre sozinho. Precisa do Chrome 114 ou mais novo.

Para atualizar a versão: substitua os arquivos da pasta, clique em **Recarregar** no card da extensão e dê F5 na aba do Onvio.

## Como usar

- **Trilho lateral** (à esquerda, escuro, como no Control Hub): Hoje, Solicitações, Agenda e lembretes, Equipe (área do gestor, com senha) e Distribuir. A busca (/ ou Ctrl+K) procura nas 10 listas do Onvio, inclusive concluídas. Passe o mouse num ícone para ver o nome; os números vermelhos/azuis são o que pede atenção.
- **Ver Onvio** (canto superior direito) mostra a tela nativa do Onvio; a **bolinha** com a logo, no canto inferior direito, traz o app de volta. O ícone da extensão e o atalho **Alt+Shift+O** fazem o mesmo dentro do Portal do Cliente e, em qualquer outra página, levam ao portal (Solicitações) e abrem o app lá. O app **nunca abre sozinho**: só por esse clique.
- **Busca** em janela central: tecla **/** ou **Ctrl+K**. Já mostra, enquanto você digita, as pendências lidas e os clientes; **Enter** busca em todas as listas do Onvio, inclusive concluídas (ou abre direto a solicitação, se você digitou o ID exato).
- Clique numa solicitação para abrir o **detalhe** (dados e trâmites lidos na hora). Setas **← →** passam para a anterior/próxima da mesma lista sem fechar. "Abrir no Onvio" leva à lista certa do Onvio já filtrada pelo ID.
- Nas listas: **↑ ↓** andam entre as linhas e **Enter** abre.
- Em **Configurações** você vê as regras em vigor em linguagem simples, testa um prazo novo vendo o efeito na fila antes de salvar, e inclui feriados locais.

## Telas

| Tela | Para quem | O que mostra |
| --- | --- | --- |
| **Hoje** | Analista (todos veem) | A visão do dia; o trabalho com as solicitações fica em **Solicitações**. **Carteira** no cabeçalho. **Destaque**: rosca % em dia (clicar numa parte abre as Solicitações com aquele motivo), carrossel e **Próximos passos**. Logo abaixo, em **destaque vermelho e recolhível**, as **admissões** retroativas, já passadas ou a até 2 dias úteis do início, sem nenhum trâmite do escritório ainda (o eSocial do empregado vence no dia anterior; o do estagiário, até 15 dias depois do início). **Sugestões de ação** por solicitação (parece resolvida fora do portal, **sem retorno do cliente há mais de duas semanas**, duplicada, na lista errada, com falta de informação ou anexo que não chegou), cada uma com o trâmite já preenchido e "Não é o caso". **Painéis**: vencimentos de férias e rescisões (prazo legal), **uso do portal pelo cliente** (lista errada, pedido repetido, solicitação abandonada) e **previsão de solicitações por empresa** (média das últimas 4 semanas, tendência e estimativa para 7 e 30 dias, lida na hora) |
| **Solicitações** | Analista e gestor | Onde o analista trabalha. Abas **Minhas** (as suas e as sem responsável, na vez do escritório), **Todas**, **Respondidas** (as suas na vez do cliente, com as "consideradas resolvidas" no fim) e **Concluídas** (últimos 30 dias). Cartões de situação que filtram, busca, **Filtros**, **Ordenar**, Lista ou Cartões e ⋯ (exportar CSV). Na vez do cliente, **Concluir**; na vez do escritório, **Pôr em análise** (também em lote) |
| **Agenda e lembretes** | Cada um | Calendário do mês com lembretes e expectativas de conclusão das suas solicitações; lista (atrasados, hoje, próximos, concluídos). Lembretes podem **repetir** (todo dia, todo dia útil, toda semana, todo mês) |
| **Equipe** | Gestor (com senha) | **Área do gestor**, aberta só com a senha. Aba **Desempenho**: nota da equipe (0 a 100) e de cada analista, com entregas nos últimos 30 dias e a comparação com o período anterior, % no prazo e tempo **com o escritório** (sem a espera pelo cliente), carteira em dia, 1º trâmite e alertas evitáveis; **ranking em tabela compacta** (uma linha por pessoa, com os 5 itens da nota; quem tem poucas entregas fica sem posição; o cabeçalho ordena), **entregas no período no prazo × fora do prazo** por pessoa e o **detalhe** de cada pessoa com os pontos de atenção e o porquê de cada um. Abas **Carga de hoje** (números e gráficos da fila, próximas a prescrever) e **Responsáveis** (idade da fila e carga de cada pessoa) |
| **Configurações** | Todos | Abre numa guia à parte (engrenagem do Onvio ou do Gestta). **Aparência** (Simplificado ou Atual, claro ou escuro, botão em outros sites); **Meu setor** (Pessoal, Contábil, Fiscal ou Todos; fora do Pessoal a extensão fica mais simples); **Prazos** com a origem de cada valor e o **efeito na fila agora** antes de salvar; **Leitura e avisos**; **Feriados**; **Palavras**; **Avançado** (Control Hub, Mediador, regras do escritório, testes de leitura, aprender ações, diagnóstico) |

O **sino** do topo junta os alertas: nova solicitação para você, cliente respondeu, prescreve em até 5 dias, ficou fora do prazo, nova sem responsável e lembretes. Novidades das suas solicitações também aparecem como aviso na tela.

## Regras do semáforo (padrão, editáveis)

Vez do escritório: sem primeiro trâmite após 1 dia útil; aberta além de 3 dias úteis (simples) ou 5 (cálculo de férias e rescisão); parada há mais de 15 dias; expectativa de conclusão vencida.
Vez do cliente: sem retorno há mais de 5 dias úteis (laranja); a partir de 20 dias parada fica vermelho com a contagem até a prescrição de 30 dias.
**Resolvida sem retorno:** na vez do cliente há mais de 3 dias úteis e a última resposta do analista não pede nada ao cliente = o cliente ficou satisfeito, e a solicitação conta como resolvida (sai da fila, dos prazos e da prescrição e conta como entregue na Equipe). Se a resposta pedir algo ("aguardamos", "favor enviar", "falta"… ou uma pergunta), continua pendente; frases de cortesia ("qualquer dúvida, estamos à disposição") não contam. Nada muda no Onvio.

Leitura das situações: em Geral, Férias, Rescisão e Afastamento, **Aguardando resposta** = o escritório precisa responder; **Respondido** = vez do cliente.

## O que falta mapear no Onvio (roteiro de 22/10/2026)

`mapeamento/prompt-pendencias-onvio.md` reúne, num roteiro só (empresa de teste, só leitura do formato), o que as próximas melhorias precisam confirmar no Onvio real: tipo de afastamento (acidente de trabalho) e se vem na lista; aviso trabalhado × indenizado; ids dos departamentos DP, Fiscal e Contábil e se a lista Geral mistura departamentos (causa provável de outros setores verem demandas do DP); situação "Em análise" nas férias; download de anexos; valores da criação; anexo e expectativa na folha; e três leituras. Cole no Claude com o Chrome e devolva o relatório.

## Novidades da v0.100.2 (12/11/2026): só vai ao portal o que notifica o cliente

- Regra do Josué: só vai ao Portal do Cliente documento de tarefa que notifica o cliente ("Notificar cliente via e-mail: Sim" na tarefa, `notify_customer`). A aba Envios ao portal lê esse campo em cada tarefa da fila de erros (um GET por tarefa, só o sim/não, na memória por 30 min). Documento de tarefa que **não** notifica vai para "Não vai ao portal: sai da lista de erros", qualquer que seja o erro e mesmo que o template tenha pasta (nunca é reenviado). Tarefa que notifica e template sem pasta: "Deveria ir ao portal". Tarefa que não deu para ler: vale o nome do template, como antes, e a tela avisa quantas.
- **A conferir no Gestta real:** se `notify_customer` é mesmo o "Notificar cliente via e-mail" da tela.

## Novidades da v0.100.1 (12/11/2026): Envios ao portal lê a fila inteira

- A aba Envios ao portal (e o conjunto de envios com erro do Hub) parava de ler na primeira página com menos de 50 documentos; como o Gestta pode devolver menos por página, parte dos erros ficava de fora sem aviso. Agora a leitura segue até a fila acabar ou chegar ao total que o Gestta informa, e, se não chegar, a tela diz "Lidos N de M: a fila não veio inteira". A lista de templates tinha o mesmo risco (template com pasta fora da 1ª página parecia "sem pasta") e foi corrigida junto.

## Novidades da v0.100.0 (12/11/2026): a convenção acompanhada (Hub 351)

- **Hub 352 (12/11/2026):** "sindicatos não devem ser registrados nem acompanhados, apenas convenções". Convenções perdeu a aba Sindicatos e o bloco do Mediador por sindicato; a agenda não tem mais eventos por sindicato; a empresa mostra a convenção vinculada (ou "Sem convenção"). A extensão não muda.

- Pedido do Josué: "o analista cadastra o CNPJ da convenção e vincula quais empresas seguem aquela convenção; clica num botão para o buscador trazer os dados mais recentes e salva no módulo; a partir disso o módulo controla os prazos e busca sozinho a partir da data-base até achar a nova; se quiser, manda buscar fora de época"; "a extensão deve buscar a convenção específica e não sindicatos isolados".
- **A busca é por convenção:** o Hub pede à extensão uma convenção (o par **sindicato laboral × sindicato patronal**, os dois CNPJs obrigatórios). A extensão busca no Mediador pelo CNPJ laboral, fica só com os instrumentos em que o patronal também é parte, e devolve a convenção mais recente do par e os aditivos dela, com o texto. Nada disso fica na extensão: quem guarda é o Hub.
- **Sem a varredura de todos os sindicatos:** a busca semanal de todos os sindicatos do cadastro parou (e, no Hub, o cadastro sozinho do Hub 350 também).
- **No Hub (351), aba Acompanhar em Convenções:** Nova convenção (os dois CNPJs e as empresas que seguem ela) → busca no Mediador e salva no módulo; daí as empresas ligadas passam a ter a convenção (o vínculo é direto, começando do zero: o código do sindicato do estabelecimento não liga mais a empresa à convenção). Da data-base em diante, a busca é **diária** até achar a nova, que **espera o analista** clicar em Salvar no módulo (ou Ignorar). "Buscar no Mediador" vale a qualquer hora e salva na hora.
- **A conferir no Mediador real:** a busca pelo CNPJ laboral traz as convenções com o patronal certo nas colunas de CNPJ do trabalhador e do empregador.

## Novidades da v0.95.1 (11/11/2026): o Mediador não insiste depois de uma falha

## O que ainda falta conferir no Chrome do Josué

Itens que dependem da tela real e só podem ser conferidos numa sessão com o Chrome do Josué. Os de versões mais antigas estão em cada versão do [`HISTORICO.md`](HISTORICO.md) (procure "A confirmar" e "A conferir"); conferido um item, tire-o daqui e anote no histórico.

- **Envios ao portal (0.97.0):** conferir no Gestta real o Reenviar pela extensão (um documento com erro de envio) e o Usar a pasta (no template "TESTE MAPEAMENTO - NAO USAR"); se a semelhança de nomes acerta com os templates reais. Tirar da lista (0.98.0): conferir com um documento que ele sai da lista de erros e se o id mandado é o do item da fila (a tarefa não é afetada, confirmado pelo Josué) (se não for, o Gestta responde com falha e o documento continua na lista).
- **A conferir no Mediador real:** o preenchimento do CNPJ e o clique em Pesquisar, se o texto traz o link do anexo e se o PDF abre dentro do Hub.
- **A confirmar no Gestta real:** o envio de arquivo pela tela do Gestta leva um cabeçalho próprio (`__setxhr_`) que a extensão não manda; se o Gestta recusar o arquivo, a mensagem aparece no painel.
- A confirmar no Chrome do Josué: o Hub abrindo em segundo plano carrega e responde como numa aba visível.
- **A confirmar no Gestta real:** se `admin/customer/{id}/accountable` sem o parâmetro `company_department` devolve todos os setores (o teste da leitura mostra a contagem).
- **A conferir no Gestta real:** se a busca aceita `COMPETENCE_DATE` (senão a extensão usa o caminho pelas metas, que é mais lento) e se a `competence_date` vem no 1º dia do mês.
- **A conferir no Gestta real:** o tempo do envio completo (os dois relatórios do mês levam dezenas de segundos cada; a cartela, uns 10 minutos) e o formato do relatório (se não for lido, o conjunto das tarefas mostra o erro, nunca vai vazio).
- **A conferir no Gestta real:** os nomes dos campos do histórico (o prompt `mapeamento/prompt-conferir-gestta-077.md` traz o script de conferência).
- **A conferir no Onvio real:** se "As minhas" bate com o que o Onvio mostra como suas e quanto tempo leva "Da equipe".
- **A conferir no Chrome do Josué:** quanto tempo o relatório leva, se o formato da resposta foi lido (a tela mostra erro se não for) e se as contagens batem com o Gestta; o detalhe de uma tarefa (nomes dos campos das etapas e documentos); com um login de analista, o aviso de acesso parcial.
- **A confirmar no Onvio real** (com um login do Fiscal ou do Contábil): quais listas o Onvio recusa e com que código, se o acesso por departamento responde e se a sessão traz a marca de escritório.
- A confirmar no Onvio real: o leitor de PDF dentro da camada e os anexos de trâmite do Cadastro (que dependem do caminho aprendido).
- **A conferir no Chrome do Josué:** o botão e a camada em cada app do Gestta (clássico, admin, painel, integração e Express), o tempo da primeira leitura com o volume real e se a contagem bate com a lista do Gestta.
- **A conferir:** as 5.250 tarefas abertas ou com impedimento no mês contra a contagem da própria lista do Gestta (novembro, data de meta, todos os usuários) e, com um login de analista, quais leituras ele alcança.

## Histórico das versões

As novidades de cada versão, da mais nova (v0.95.1, 11/11/2026) à primeira, estão em [`HISTORICO.md`](HISTORICO.md). As regras em vigor e as decisões do Josué ficam no `CLAUDE.md` da raiz e em `docs/decisoes.md`.

## Privacidade

A extensão usa a sessão do Onvio de quem está logado e só vê o que o perfil da pessoa já vê. Guarda no computador apenas: o resumo das pendências (ID, situação, datas, cliente, empregado/assunto e responsável), os alertas (tipo, ID, cliente, motivo e hora), a série do dia (só contagens), os seus lembretes, e, para a avaliação da equipe, por entrega do período só números (dias com o escritório, dias até o 1º trâmite, se houve cobrança), o nome de quem concluiu e a data da última movimentação, além dos casos que o gestor tirou da conta (ID interno e data). O detalhe e os trâmites de uma solicitação são lidos na hora e não são gravados; da última resposta do analista fica só o veredito da regra de resolvida (pede algo ao cliente: sim/não). Anexos baixados vão direto para a pasta de downloads do Chrome; do download fica só o molde do caminho, sem ids nem nomes. Não guarda CPF, salário, descrição, observações nem anexos. No Gestta, o acesso da pessoa fica só dentro da página do Gestta e as tarefas só na memória da tela (o relatório do mês, na memória do Chrome, que some ao fechar). O envio ao Control Hub é opcional, pela própria pessoa: os dados vão direto à página do Hub aberta numa aba, sem passar por servidor nosso, e na extensão fica só o andamento (nomes de conjuntos e contagens). Empresas do próprio escritório nunca vão ao Hub.

## Problemas comuns

- **"Sem sessão no Onvio"**: abra o Onvio e faça login; a extensão tenta de novo no próximo ciclo (ou clique em atualizar).
- **Aba Minhas vazia**: só aparecem solicitações em que você é o responsável no Onvio.

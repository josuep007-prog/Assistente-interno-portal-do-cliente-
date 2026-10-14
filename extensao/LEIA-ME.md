# Control Onvio · ControlTax (v0.8.1)

Página de trabalho que fica **por cima do Onvio**, em tela cheia: filas, dashboards em tempo real, alertas e lembretes para analistas e gestores. O Onvio continua aberto por trás e mantém a sessão; é por ele que a extensão lê. Nesta versão a extensão ainda **só lê**: as ações (responder, definir responsável, anexar) chegam na próxima, depois do mapeamento.

## Instalar (piloto)

1. Baixe o repositório (Code > Download ZIP) e descompacte numa pasta fixa (ex.: `C:\ControlTax\ControlOnvio`). Não apague a pasta depois.
2. No Chrome, abra `chrome://extensions` e ligue o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e escolha a pasta **`extensao`** (a que tem o `manifest.json`).
4. Fixe o ícone da extensão na barra (ícone de quebra-cabeça > alfinete).
5. Entre no Onvio: o Control Onvio abre por cima, em tela cheia. Precisa do Chrome 114 ou mais novo.

Para atualizar a versão: substitua os arquivos da pasta, clique em **Recarregar** no card da extensão e dê F5 na aba do Onvio.

## Como usar

- **Trilho lateral** (à esquerda, escuro, como no Control Hub): Hoje, Minha fila, Agenda e lembretes, Equipe, Clientes e Todas as solicitações. Passe o mouse num ícone para ver o nome; os números vermelhos/azuis são o que pede atenção.
- **Ver Onvio** (canto superior direito) mostra a tela nativa do Onvio; o botão **Voltar ao Control Onvio**, no canto inferior direito, traz o app de volta. O ícone da extensão e o atalho **Alt+Shift+O** fazem o mesmo, e em qualquer outro site levam ao Onvio.
- **Busca** em janela central: tecla **/** ou **Ctrl+K**. Já mostra, enquanto você digita, as pendências lidas e os clientes; **Enter** busca em todas as listas do Onvio, inclusive concluídas (ou abre direto a solicitação, se você digitou o ID exato).
- Clique numa solicitação para abrir o **detalhe** (dados e trâmites lidos na hora). Setas **← →** passam para a anterior/próxima da mesma lista sem fechar. "Abrir no Onvio" leva à lista certa do Onvio já filtrada pelo ID.
- Nas listas: **↑ ↓** andam entre as linhas e **Enter** abre.
- Em Configurações dá para desligar "Abrir o Control Onvio ao entrar no Onvio".

## Telas

| Tela | Para quem | O que mostra |
| --- | --- | --- |
| **Hoje** | Analista | Saudação, data e números (com ação minha, fora do prazo, vencem hoje, cliente respondeu, lembretes); faixa **ao vivo** com a última novidade; **a semana** (atrasados, hoje e próximos 6 dias com lembretes e expectativas de conclusão); "Para fazer agora" (fora do prazo, vencem hoje, cliente respondeu); "Precisa de atenção" (prescrevem em breve, paradas há mais tempo, possível aba errada); agenda do dia escolhido e atividade |
| **Minha fila** | Analista e gestor | Abas Minhas / Equipe toda / Sem responsável. Busca, vez (escritório/cliente), **Filtros** (tipo, gravidade, responsável), **Ordenar**, **Lista ou Cartões**, **Mais** (exportar CSV). Os filtros ativos aparecem como etiquetas que se tiram com um clique |
| **Agenda e lembretes** | Cada um | Calendário do mês com lembretes e expectativas de conclusão das suas solicitações; lista (atrasados, hoje, próximos, concluídos). Lembretes podem **repetir** (todo dia, todo dia útil, toda semana, todo mês) |
| **Equipe** | Gestor | Aba Painel (números, carga por responsável G1/G2/G3, entradas e saídas de 14 dias, pendências ao longo do dia, por tipo, sem responsável, prescrições) e aba Responsáveis (carga de cada pessoa) |
| **Clientes** | Gestor e analista | Aba Painel (ranking e quem mais demora a responder) e aba Empresas (cartões ou lista, com fora do prazo, prescrição e aba errada) |
| **Todas as solicitações** | Todos | As 10 listas do Onvio (uma aba para cada), inclusive concluídas, consultadas na hora, com busca e paginação |
| **Configurações** | Todos | Prazos, leitura ao vivo, regras do escritório, aprender ações e diagnóstico |

O **sino** do topo junta os alertas: nova solicitação para você, cliente respondeu, prescreve em até 5 dias, ficou fora do prazo, nova sem responsável e lembretes. Novidades das suas solicitações também aparecem como aviso na tela.

## Regras do semáforo (padrão, editáveis)

Vez do escritório: sem primeiro trâmite após 1 dia útil; aberta além de 3 dias úteis (simples) ou 5 (cálculo de férias e rescisão); parada há mais de 15 dias; expectativa de conclusão vencida.
Vez do cliente: sem retorno há mais de 5 dias úteis (laranja); a partir de 20 dias parada fica vermelho com a contagem até a prescrição de 30 dias.

Leitura das situações: em Geral, Férias, Rescisão e Afastamento, **Aguardando resposta** = o escritório precisa responder; **Respondido** = vez do cliente.

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

A extensão usa a sessão do Onvio de quem está logado e só vê o que o perfil da pessoa já vê. Guarda no computador apenas: o resumo das pendências (ID, situação, datas, cliente, empregado/assunto e responsável), os alertas (tipo, ID, cliente, motivo e hora), a série do dia (só contagens) e os seus lembretes. O detalhe e os trâmites de uma solicitação são lidos na hora e não são gravados. Não guarda CPF, salário, descrição, observações nem anexos.

## Problemas comuns

- **"Sem sessão no Onvio"**: abra o Onvio e faça login; a extensão tenta de novo no próximo ciclo (ou clique em atualizar).
- **Aba Minhas vazia**: só aparecem solicitações em que você é o responsável no Onvio.

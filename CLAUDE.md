# Control Onvio · visão do escritório (ControlTax)

Extensão Chrome (Manifest V3) que é uma **página de trabalho em tela cheia por cima do Onvio** Portal do Cliente, na visão do escritório: filas das 10 listas de Solicitações de Serviço, prazos e prescrição, dashboards em tempo real (analista, gestor, clientes), detalhe com trâmites, alertas e lembretes pessoais. O Onvio fica aberto por trás e mantém a sessão. Dono: Josué Porfírio (Processos e Automação, ControlTax). Tudo que o usuário vê é em português do Brasil.

Existe uma extensão irmã, para o **cliente**: `josuep007-prog/assistente-portal-controltax` (preenche e confere as solicitações). As duas devem **prometer os mesmos prazos**: o cliente é avisado de 3 dias úteis (simples) e 5 (cálculo), e aqui o semáforo usa os mesmos números. Por isso as regras podem vir do mesmo arquivo (ver "Regras").

## Como trabalhamos

1. **Entender antes de mexer.** Qualquer mudança que dependa da tela ou da API do Onvio parte de `mapeamento/portal-do-cliente.md` (rotas, endpoints, códigos de situação, riscos). Se descobrir algo novo, atualize o mapa.
2. **Regra antes de código.** Prazo, feriado, palavra de "possível aba errada" e segundos da verificação ao vivo são dados: ficam em `DEFAULTS` (`extensao/core.js`) e podem ser sobrescritos pelo arquivo de regras do escritório (`regras/escritorio.exemplo.json` mostra o formato). Código só para mecânica nova.
3. **Testar sempre.** `node --test testes/extensao.test.js` (sem dependências). Mudou grade, shell, app ou manifesto: rode também `node testes/navegador.js` e `node testes/extensao-real.js` (precisam do Playwright: `npm i -D playwright`, ou `NODE_PATH` para uma instalação global; use o Chromium do ambiente). Tipo de regra ou fluxo novo ganha teste novo.
4. **Ao terminar:** suba `version` no `manifest.json` se mudou código, atualize `extensao/LEIA-ME.md` e o `README.md`, e faça commits pequenos, em português, um assunto por commit.

## Segurança no portal real (inegociável)

- A extensão é **somente leitura**. Nunca chamar nem automatizar: Excluir, Definir responsável, Alterar Expectativa de Conclusão, Encaminhar, incluir trâmite ou anexo, `assign-staff`, `change-due-date` e qualquer POST/PUT/DELETE. Ações em lote são a fase 2 e só com pedido explícito do Josué.
- Testes automatizados nunca falam com o Onvio real: usam API e páginas simuladas.
- Nada de dados de cliente em testes, logs ou commits. A extensão guarda só ID, situação, datas, cliente, empregado/assunto e responsável (resumo), eventos de alerta (tipo, ID, cliente, motivo, hora), série do dia (contagens) e lembretes pessoais. Detalhes e trâmites são lidos na hora e **nunca** gravados. **Nunca** CPF, salário, CID, descrição, observações nem anexos no armazenamento.
- Sem telemetria, sem API externa, sem IA em nuvem. O único acesso de rede além do Onvio é o arquivo de regras que o próprio usuário indicar (https, sem credenciais, só JSON de dados, validado em `OC.normalizarRegras`).
- Chamadas à API do Onvio são não oficiais: se mudarem, a extensão deve falhar de forma visível (aviso no painel, Diagnóstico) e nunca mostrar número errado em silêncio. Código de situação desconhecido aparece como tal.
- Não há acesso ao Chrome do Josué nem ao Onvio real neste ambiente. O que depender da tela real (grade Wijmo, trâmites da lista Geral, estimativa de 1º trâmite) fica como "a confirmar" no `LEIA-ME` até ser conferido numa sessão com o Chrome dele.

## Onde a extensão aparece

**Só no Onvio.** Não usamos o painel lateral do Chrome (`sidePanel`): o painel é uma coluna dentro das páginas `onvio.com.br/br-portal-do-cliente/*` e `onvio.com.br/staff/*`, como no Assistente do cliente. O ícone da extensão (e o atalho Alt+Shift+O) abre/fecha o painel quando a aba é do Onvio e, em qualquer outro site, **leva ao Onvio** (reaproveita uma aba aberta ou cria uma) com o painel aberto (`aoClicarNoIcone` em `background.js`). Abas abertas antes da instalação recebem o `shell.js` por injeção. Qualquer recurso que a página do Onvio precise carregar da extensão (iframe, logo, fontes do botão) tem de estar em `web_accessible_resources`.

## Arquitetura

| Arquivo | Papel |
|---|---|
| `extensao/core.js` | Núcleo sem `chrome.*`: tipos e códigos de situação, URLs, coleta, regras de prazo, gravidade (G1 a G3), 1º trâmite, métricas por analista e por cliente, série do dia, eventos, lembretes, consultas sob demanda, aba errada, validação e combinação das regras. Roda no service worker, nos scripts de conteúdo e nos testes. |
| `extensao/background.js` | Service worker: leitura periódica, cache de trâmites, contador no ícone, notificações, regras do escritório (download + cache), migração das configurações. |
| `extensao/shell.js` | Dentro do Onvio: camada em tela cheia (`html.controlonvio-cheia`) com o app em iframe (`app/app.html`); "Ver Onvio" esconde e deixa o botão "Voltar ao Control Onvio". Abre ao entrar (`abrirAoEntrar`), lembra a escolha na aba e chega escondido quando vem de "Abrir no Onvio" (`verOnvioAoCarregar`). Também pede a verificação ao vivo e repassa o modo aprender. |
| `extensao/acao-hook.js` (mundo da página) | Avisa o `shell.js` quando a página faz POST/PUT/PATCH/DELETE em solicitações, para a leitura ser imediata (aviso sem conteúdo). No **modo aprender** (Configurações, desliga em 2 h) registra o formato das chamadas: método, caminho com `{id}`, nomes e tipos dos campos, nunca valores; o `shell.js` guarda em `aprendizado` (até 300, deduplicado). É a fonte para implementar as ações. |
| `extensao/app/` | O app, em módulos ES sem build: `app.js` (rotas `#/inicio`, `#/fila`, `#/equipe`, `#/clientes`, `#/solicitacoes`, `#/lembretes`, `#/config`, `#/busca`), `estado.js` (espelho reativo do `chrome.storage.local`), `graficos.js` (SVG próprio, paleta validada pela skill dataviz), `views/*.js` (cada tela chama `ctx.cab()` para título, abas e extras do cabeçalho; `detalhe.js` e `lembrete-dlg.js` são as janelas). Visual: o do Control Hub (módulos Departamento Pessoal e Portal do Cliente): trilho escuro com etiquetas ao passar o mouse (não expande, para não cobrir o conteúdo), cabeçalho com abas, barra Filtros/Ordenar/Lista-Cartões/Mais, janelas com abas, busca em janela central (/ ou Ctrl+K). Fala com o Onvio só por mensagens ao service worker (`consultar`, `detalhe`, `buscar`, `abrir`, `atualizar`). |
| `extensao/grade.js` | Marca "Nd parada" na grade das listas (Wijmo ou tabela). Diagnóstico: `document.dispatchEvent(new CustomEvent('controlonvio-diagnosticar'))`. |
| `extensao/content.js` | Abre a lista certa já filtrada pelo ID. |
| `extensao/options.*` | Configurações, regras do escritório e Diagnóstico. |

**Leitura e tempo real:** a sessão é validada com a lista de verdade (`OC.urlSonda`), nunca com endereço de sessão. `escolherFetcher` tenta `pagina` (MAIN, na aba), `extensao` (ISOLATED, na aba) e `direto`, lembra o que funcionou (`metodoLeitura`) e, se falhar, o erro diz o que cada um recebeu. `verificarAoVivo` (pedido pelo `shell.js` a cada `tempoRealSeg`, só com a aba visível, ou na hora por ação na página) compara `OC.assinaturas` (total + última movimentação por lista) e só lê tudo se mudou ou a cada `intervalo` minutos; ignora pedidos a menos de 10 s do anterior. Nunca aumente a frequência sem pensar na carga: são 10 chamadas por pessoa por verificação.
**Ordem das configurações:** padrões do código < regras do escritório < ajustes da pessoa. A tela de configurações grava só o que difere do padrão em vigor (`__v: 2`), para mudanças futuras do arquivo de regras continuarem valendo.
**Regras:** `OC.normalizarRegras` aceita o formato do escritório (`prazos`, `feriados`, `abaErrada`) e o do Assistente do cliente (`config.prazoInternoDiasUteis`, `feriados`). Endereço informado em Configurações; permissão do site pedida em tempo de uso (`optional_host_permissions`).
**Scripts de conteúdo órfãos:** depois de atualizar a extensão, scripts já injetados perdem o acesso (`chrome.runtime.id`). `grade.js` e `docs-ponte.js` detectam, se desligam e pedem F5.

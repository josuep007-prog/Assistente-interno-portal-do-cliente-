# Assistente interno · Portal do Cliente (ControlTax)

Ferramentas internas da ControlTax para facilitar o uso e o controle do **Portal do Cliente Onvio** por analistas e gestores.

## Control Onvio (extensão do Chrome) · v0.23.0

Página de trabalho em tela cheia **por cima do Onvio Portal do Cliente**: Hoje como visão do dia (admissões em destaque, vencimentos de férias e rescisões, sugestões de ação, uso do portal pelo cliente e previsão por empresa), Solicitações (filas das 10 listas (com cartões por tipo e ordem por prioridade, empresa ou mais recente), avisos de férias e rescisão sem cálculo perto do prazo legal (Férias e Rescisões lado a lado, com criar solicitação ou responder no aviso, já avisei e desconsiderar), detalhe completo da solicitação com observações prontas para o cliente, módulo Distribuir (quem mais atendeu a empresa na semana), dashboards em tempo real (Hoje no formato da tela Convenções do Departamento Pessoal: carteira, destaque com rosca, carrossel e próximos passos, Equipe como área do gestor com senha: avaliação de desempenho e qualidade dos atendimentos), agenda, detalhe com o essencial em destaque, trâmites como conversa e anexos baixados de uma vez (o analista escolhe quais), alertas, lembretes pessoais e Configurações que mostram o efeito de cada prazo na fila antes de salvar. Solicitações na vez do cliente sem retorno há mais de 3 dias úteis, cuja última resposta não pedia nada, contam como resolvidas. O Onvio continua aberto por trás e mantém a sessão.

Só para a **visão do escritório**: com o login de um cliente a extensão fica bloqueada e não lê nada. Desde a v0.14.0 dá para **responder (com situação e anexos), encaminhar, definir responsável e alterar a expectativa** por dentro da extensão, e desde a v0.17.0 **criar solicitações Geral** para o cliente (inclusive a partir dos avisos sem cálculo), sempre com confirmação, nas listas já mapeadas (Geral, Férias, Rescisão e Afastamento). Cadastro e Rubricas continuam só leitura. Nunca exclui nada.

O código fica na pasta [`extensao/`](extensao/). Detalhes de uso, regras do semáforo e privacidade estão em [`extensao/LEIA-ME.md`](extensao/LEIA-ME.md).

### Instalar

1. Baixe o repositório: botão **Code** > **Download ZIP**, e descompacte numa pasta fixa (ex.: `C:\ControlTax\ControlOnvio`).
2. No Chrome, abra `chrome://extensions` e ligue o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha a pasta `extensao` que veio no ZIP.
4. Fixe o ícone na barra e entre no Onvio: o Control Onvio abre por cima, em tela cheia. O ícone e o atalho **Alt+Shift+O** alternam entre o app e a tela do Onvio; em outro site, levam ao Onvio.

Para atualizar: baixe de novo, substitua a pasta e clique em **Recarregar** no card da extensão.

### Estrutura

| Arquivo | Função |
| --- | --- |
| `manifest.json` | Configuração da extensão (Manifest V3) |
| `core.js` | Tipos de solicitação, códigos de situação, coleta na API do Onvio e regras de prazo |
| `background.js` | Leitura periódica, contador no ícone, notificações e abertura da solicitação no Onvio |
| `app/` | O app em si: trilho lateral, telas (Hoje, Solicitações, Agenda e lembretes, Equipe, Distribuir), detalhe e busca. Visual do Control Hub (Departamento Pessoal e Portal do Cliente) |
| `shell.js` | Camada em tela cheia com o app dentro do Onvio, botão "Voltar ao Control Onvio", verificação ao vivo, modo aprender |
| `acao-hook.js` | Percebe ações que alteram solicitações na página e pede leitura imediata (sem ler conteúdo); aprende o molde do download de anexos quando o Onvio baixa um |
| `app/` | O app: `app.html/css/js`, `estado.js` (espelho do armazenamento), `graficos.js` (SVG), `views/` (Início, fila, Equipe, Distribuir, busca, detalhe, anexos, Lembretes, Configurações) |
| `content.js` | Filtra a grade do Onvio pelo ID quando a solicitação é aberta por "Abrir no Onvio" |
| `options.html/js` | Página de opções completa (aba Avançado das Configurações): arquivo de regras, aprender ações, diagnóstico |
| `grade.js` | Marca "Nd parada" na grade das listas de Solicitações de Serviço |
| `fonts/` | Archivo e IBM Plex empacotadas (licença OFL), sem dependência de serviço externo |
| `ui.css`, `tema.js`, `logo.svg`, `icons/` | Visual no padrão Control Hub, modo claro e escuro |

### Mapeamento do portal

* [`mapeamento/portal-do-cliente.md`](mapeamento/portal-do-cliente.md): rotas, telas, APIs, códigos de situação, pendências de 13/10/2026 e riscos do Portal do Cliente Onvio e dos Documentos (Onvio Gestão).
* [`mapeamento/visao-do-cliente.md`](mapeamento/visao-do-cliente.md): o que a extensão do cliente (`assistente-portal-controltax`) ensina a esta: prazos prometidos, APIs e ideias.
* [`regras/escritorio.exemplo.json`](regras/escritorio.exemplo.json): formato do arquivo de regras do escritório (prazos, feriados, palavras de "aba errada").
* [`CLAUDE.md`](CLAUDE.md): como trabalhar neste repositório e as regras de segurança (somente leitura).
* [`mapeamento/capturar-mapa-onvio.js`](mapeamento/capturar-mapa-onvio.js): script de console que captura a estrutura das telas (seletores, colunas, botões) sem gravar dados de clientes. Útil para a coluna extra na grade nativa e para as telas de Documentos.

### Testes

```
node --test testes/extensao.test.js      # regras, prazos, dashboards, alertas, lembretes, consultas (sem dependências)
node testes/navegador.js                 # grade, camada em tela cheia e telas do app em páginas simuladas
node testes/extensao-real.js             # carrega a extensão no Chromium, com API simulada
```

Os dois últimos precisam do Playwright (`npm i -D playwright`, ou `NODE_PATH` para uma instalação global). Nenhum teste fala com o Onvio real.

### Próximos passos previstos

- Confirmar no Onvio real os valores da criação Geral (`mapeamento/prompt-criacao-onvio.md`) e mapear a criação nas listas da folha (aviso e cálculo de férias e rescisão, afastamento).
- Publicar o arquivo de regras do escritório e apontar a extensão para ele (ou para o `regras.json` do Assistente do cliente, para os prazos serem os mesmos).
- Prazos legais por solicitação (aviso de férias com 30 dias, rescisão em 10 dias) e fim de experiência, que exigem ler as datas de cada solicitação.
- Aviso de competência no nome do arquivo antes do upload.
- Confirmar o caminho dos trâmites da lista Geral e validar a estimativa de 1º trâmite com casos reais.
- Ações em lote (definir responsável, alterar expectativa de conclusão), na fase 2.

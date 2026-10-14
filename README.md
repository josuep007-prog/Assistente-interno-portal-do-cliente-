# Assistente interno · Portal do Cliente (ControlTax)

Ferramentas internas da ControlTax para facilitar o uso e o controle do **Portal do Cliente Onvio** por analistas e gestores.

## Control Onvio (extensão do Chrome) · v0.8.1

Página de trabalho em tela cheia **por cima do Onvio Portal do Cliente**: filas das 10 listas de solicitações, dashboards em tempo real para analistas (Hoje) e gestores (Equipe, Clientes), agenda, detalhe com trâmites, alertas e lembretes pessoais. O Onvio continua aberto por trás e mantém a sessão.

Só para a **visão do escritório**: com o login de um cliente a extensão fica bloqueada e não lê nada. Por enquanto **somente leitura**. As ações (responder, definir responsável, anexar) entram depois do mapeamento feito com o modo "Aprender ações".

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
| `app/` | O app em si: trilho lateral, telas (Hoje, Minha fila, Agenda e lembretes, Equipe, Clientes, Todas as solicitações), detalhe e busca. Visual do Control Hub (Departamento Pessoal e Portal do Cliente) |
| `shell.js` | Camada em tela cheia com o app dentro do Onvio, botão "Voltar ao Control Onvio", verificação ao vivo, modo aprender |
| `acao-hook.js` | Percebe ações que alteram solicitações na página e pede leitura imediata (sem ler conteúdo) |
| `app/` | O app: `app.html/css/js`, `estado.js` (espelho do armazenamento), `graficos.js` (SVG), `views/` (Início, fila, Equipe, Clientes, Solicitações, detalhe, Lembretes, Configurações) |
| `content.js` | Filtra a grade do Onvio pelo ID quando a solicitação é aberta por "Abrir no Onvio" |
| `options.html/js` | Prazos, intervalo de leitura, notificações e feriados |
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

- Mapear as ações com o modo "Aprender ações" (empresa de teste) e implementar responder, definir responsável, expectativa, encaminhar e anexos.
- Publicar o arquivo de regras do escritório e apontar a extensão para ele (ou para o `regras.json` do Assistente do cliente, para os prazos serem os mesmos).
- Prazos legais por solicitação (aviso de férias com 30 dias, rescisão em 10 dias) e fim de experiência, que exigem ler as datas de cada solicitação.
- Aviso de competência no nome do arquivo antes do upload.
- Confirmar o caminho dos trâmites da lista Geral e validar a estimativa de 1º trâmite com casos reais.
- Ações em lote (definir responsável, alterar expectativa de conclusão), na fase 2.

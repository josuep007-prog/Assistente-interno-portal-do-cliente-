# Assistente interno · Portal do Cliente (ControlTax)

Ferramentas internas da ControlTax para facilitar o uso e o controle do **Portal do Cliente Onvio** por analistas e gestores.

## Control Onvio (extensão do Chrome) · v0.4.0

Junta numa fila só as solicitações pendentes das 10 listas do Portal do Cliente (Geral, Cadastro de empregado, contribuinte e estagiário, Aviso e Cálculo de férias, Aviso e Cálculo de rescisão, Afastamento e Lançamento de rubricas), com semáforo de prazo, contagem para a prescrição e notificações. Também marca os dias parados na grade do Onvio, avisa guias não visualizadas pelo cliente perto do vencimento e traz o painel do gestor (G1/G2/G3 e 1º trâmite por analista).

Fase 1: **somente leitura**. A extensão usa a sessão do Onvio de quem está logado e não altera nada no Onvio.

O código fica na pasta [`extensao/`](extensao/). Detalhes de uso, regras do semáforo e privacidade estão em [`extensao/LEIA-ME.md`](extensao/LEIA-ME.md).

### Instalar

1. Baixe o repositório: botão **Code** > **Download ZIP**, e descompacte numa pasta fixa (ex.: `C:\ControlTax\ControlOnvio`).
2. No Chrome, abra `chrome://extensions` e ligue o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha a pasta `extensao` que veio no ZIP.
4. Fixe o ícone na barra. Clique nele: se você estiver no Onvio, o painel abre; em qualquer outro site, ele leva direto ao Onvio. Também há o botão **Control Onvio** no canto da tela do Onvio e o atalho **Alt+Shift+O**.

Para atualizar: baixe de novo, substitua a pasta e clique em **Recarregar** no card da extensão.

### Estrutura

| Arquivo | Função |
| --- | --- |
| `manifest.json` | Configuração da extensão (Manifest V3) |
| `core.js` | Tipos de solicitação, códigos de situação, coleta na API do Onvio e regras de prazo |
| `background.js` | Leitura periódica, contador no ícone, notificações e abertura da solicitação no Onvio |
| `shell.js` | Botão flutuante e coluna do painel dentro do Onvio (a página encolhe em telas largas) |
| `painel.html/js` | Painel (Minhas, Sem resp., Equipe, Analistas, Guias, Buscar, exportar CSV), exibido em iframe pelo `shell.js` |
| `content.js` | Filtra a grade do Onvio pelo ID ao abrir uma solicitação pelo painel |
| `options.html/js` | Prazos, intervalo de leitura, notificações e feriados |
| `grade.js` | Marca "Nd parada" na grade das listas de Solicitações de Serviço |
| `docs-hook.js`, `docs-ponte.js` | Guias não visualizadas: escutam a tela de Documentos (Onvio Gestão) sem chamadas extras |
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
node --test testes/extensao.test.js      # regras, prazos, guias, regras do escritório (sem dependências)
node testes/navegador.js                 # grade, guias e painel em páginas simuladas
node testes/extensao-real.js             # carrega a extensão no Chromium, com API simulada
```

Os dois últimos precisam do Playwright (`npm i -D playwright`, ou `NODE_PATH` para uma instalação global). Nenhum teste fala com o Onvio real.

### Próximos passos previstos

- Publicar o arquivo de regras do escritório e apontar a extensão para ele (ou para o `regras.json` do Assistente do cliente, para os prazos serem os mesmos).
- Prazos legais por solicitação (aviso de férias com 30 dias, rescisão em 10 dias) e fim de experiência, que exigem ler as datas de cada solicitação.
- Aviso de competência no nome do arquivo antes do upload.
- Testar a busca global de documentos (`storage/v1/containers/documents/search`) para varrer as guias de todos os clientes.
- Confirmar o caminho dos trâmites da lista Geral e validar a estimativa de 1º trâmite com casos reais.
- Ações em lote (definir responsável, alterar expectativa de conclusão), na fase 2.

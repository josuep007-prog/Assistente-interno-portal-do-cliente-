# Assistente interno · Portal do Cliente (ControlTax)

Ferramentas internas da ControlTax para facilitar o uso e o controle do **Portal do Cliente Onvio** por analistas e gestores.

## Control Onvio (extensão do Chrome) · v0.1.0

Junta numa fila só as solicitações pendentes das 10 listas do Portal do Cliente (Geral, Cadastro de empregado, contribuinte e estagiário, Aviso e Cálculo de férias, Aviso e Cálculo de rescisão, Afastamento e Lançamento de rubricas), com semáforo de prazo, contagem para a prescrição e notificações.

Fase 1: **somente leitura**. A extensão usa a sessão do Onvio de quem está logado e não altera nada no Onvio.

O código fica na pasta [`extensao/`](extensao/). Detalhes de uso, regras do semáforo e privacidade estão em [`extensao/LEIA-ME.md`](extensao/LEIA-ME.md).

### Instalar

1. Baixe o repositório: botão **Code** > **Download ZIP**, e descompacte numa pasta fixa (ex.: `C:\ControlTax\ControlOnvio`).
2. No Chrome, abra `chrome://extensions` e ligue o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha a pasta `extensao` que veio no ZIP.
4. Fixe o ícone na barra, entre no Onvio e clique no ícone para abrir o painel.

Para atualizar: baixe de novo, substitua a pasta e clique em **Recarregar** no card da extensão.

### Estrutura

| Arquivo | Função |
| --- | --- |
| `manifest.json` | Configuração da extensão (Manifest V3) |
| `core.js` | Tipos de solicitação, códigos de situação, coleta na API do Onvio e regras de prazo |
| `background.js` | Leitura periódica, contador no ícone, notificações e abertura da solicitação no Onvio |
| `sidepanel.html/js` | Painel lateral (Minhas, Sem resp., Equipe, Analistas, Buscar, exportar CSV) |
| `content.js` | Filtra a grade do Onvio pelo ID ao abrir uma solicitação pelo painel |
| `options.html/js` | Prazos, intervalo de leitura, notificações e feriados |
| `ui.css`, `tema.js`, `logo.svg`, `icons/` | Visual no padrão Control Hub, modo claro e escuro |

### Próximos passos previstos

- Guias não visualizadas pelo cliente perto do vencimento (Onvio Gestão, Documentos).
- Aviso de competência no nome do arquivo antes do upload.
- Ações em lote (definir responsável, alterar expectativa de conclusão), na fase 2.

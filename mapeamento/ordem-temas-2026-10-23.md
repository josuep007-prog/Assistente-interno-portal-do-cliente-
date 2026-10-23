# Ordem de execução: dois temas de design, Atual e Simplificado (v0.42.0)

> Cole este arquivo inteiro numa sessão nova do Claude Code com o repositório `josuep007-prog/Assistente-interno-portal-do-cliente-` aberto. Ele é autossuficiente: o contexto, as decisões já tomadas, o que fazer em cada tela, os testes e a entrega.

## 1. Contexto e decisões (Josué, 23/10/2026)

Houve reclamação de que a visão está **poluída**, principalmente em **telas pequenas**. O Josué pediu uma **mudança completa no design**, com temas que se alternam em **Configurações**. Decisões dele:

- **Dois temas:**
  - **Atual**: fica exatamente como está hoje. Não pode mudar um pixel.
  - **Simplificado**: novo.
  - O tema "Onvio" foi **cancelado**.
- **O Simplificado vem de fábrica** para quem nunca escolheu.
- **Claro e escuro valem nos dois temas.** É uma escolha separada da escolha de tema.
- **No Simplificado mudam o visual e a arrumação:**
  - menos bordas, cores e textos;
  - o secundário fica recolhido ou vira dica (`title`/ⓘ);
  - **nada some de vez**: tudo continua acessível.
- **Manter a fluidez** (transições e entradas curtas) **e a qualidade do design** (linha do Control Hub). Respeitar `prefers-reduced-motion`.
- **Telas de referência:** 1366×768, que deixa cerca de **1366×650** úteis no Chrome. Conferir também **1280×720** e **1600×900**. A tela grande não pode piorar.

Leia antes o `CLAUDE.md` do repositório, que traz as regras de segurança, a arquitetura e o jeito de trabalhar. Elas continuam valendo, em especial:
- tudo em pt-BR;
- cantos `var(--r)` (4 px) ou 3 px, e redondos só avatares e pontinhos;
- etiqueta de gravidade nunca sem o porquê;
- o analista não vê prazo interno nem gravidade.

## 2. O que o levantamento achou (para orientar)

Pixels estimados pelo CSS.

- **Solicitações** (`views/fila.js`): há cerca de **480 px antes do 1º cartão**.
  - cabeçalho ~95;
  - barra de filtros ~46;
  - título da lista ~32;
  - **grade de tipos ~215** (2 fileiras, blocos Férias e Rescisão com cabeçalho próprio);
  - chips de situação ~42;
  - título do grupo ~30.

  Em 650 px sobra uma fileira de cartões. A mesma contagem aparece em 5 lugares (aba, "N solicitações", cartão "Todos os tipos", chips, títulos de grupo). A situação aparece em 3 (chips, títulos de grupo, pílula de cada cartão).
- **Hoje** (`views/inicio.js`):
  - O destaque `.hj-hero` (sempre escuro) ocupa ~340 px e repete as contagens 4 vezes: rosca, legenda `.hj-legenda`, frase de resumo e título.
  - Tem uma 2ª bolinha "ao vivo" (`.hj-bola`) além da do cabeçalho.
  - O carrossel repete os Próximos passos.
  - Tipos, Sugestões e Previsão ficam sempre abertos, cada um com um parágrafo de ajuda (inicio.js ~105, ~155, ~166, ~172, ~212).
  - `.sug-res` repete as barras internas.
  - Há três níveis de borda nas Sugestões.
- **Detalhe** (`views/detalhe.js`, `views/resposta.js`):
  - "Vez" e "parada há" aparecem 3 vezes: `dlg-l1`, `dp-last` e `cmp-vez`.
  - `dp-last` tem 7 itens.
  - A faixa "Continua pendente…" aparece em toda solicitação na vez do cliente.
  - Na caixa: rótulo "Trâmite", linha `cmp-efeito` (repete o `title` das intenções), "atalho R".
  - A caixa lateral (≥1180 px) ignora a regra `max-height:760px`, porque `.dlg-cols.lateral .cmp.aberto .cmp-caixa textarea` ganha na especificidade. O textarea fica em 112 px.
  - A conversa mostra o tempo relativo e o absoluto juntos.
- **Moldura** (`app.html`, `app.js`, `app.css`):
  - Não há tokens de espaçamento (cerca de 200 paddings fixos em `app.css`) nem modo por altura de tela, só nas janelas.
  - O cabeçalho do Hoje quebra linha em 1366.
  - A busca aparece no trilho e no cabeçalho.
  - Decoração pesada: marca-d'água `logo.svg`, brilhos, gradiente e brilho no trilho, `backdrop-filter` no cabeçalho.
- **Equipe**: herói grande (anel de 132 px, h2 26), uma linha de ajuda em cada KPI, `.sub` em cada cartão. Ranking e gráfico empilham já em 1280.
- **Distribuir**: frase longa no cartão da distribuição automática; rótulo "SUGESTÃO" em maiúsculas.
- **Agenda**: "+ Lembrete neste dia" repete "Novo lembrete"; dias do calendário com 44 px; 3 ou 4 botões por item (Feito, +1 h, Amanhã, #nº).
- **Configurações**: uma frase de ajuda em **cada um dos 21 campos**; selo de origem "padrão" em todos; parágrafos `.fraco` em Feriados e Palavras.

## 3. Mecânica do tema

1. **Atributo `data-estilo="simples|atual"` no `<html>`**, independente do `data-theme` (claro/escuro).
   - `extensao/tema.js` já aplica o `data-theme` antes de a página aparecer e é carregado por `app/app.html` e `options.html`.
   - Faça ele aplicar também o `data-estilo`, lendo `localStorage` `controlonvio-estilo`, com padrão **`simples`**.
2. **Folha nova `extensao/app/estilo-simples.css`**, carregada em `app.html` **depois** de `app.css`.
   - **Todas** as regras ficam sob `:root[data-estilo="simples"]`, para o Atual não mudar nada.
   - Os gráficos (`app/graficos.js`) já usam `var(--…)` e seguem os tokens.
   - No `options.html` (aba Avançado, em quadro), basta uma versão mínima dos tokens (fundo e superfície) para não destoar.
   - Se o app estiver em `web_accessible_resources` no `manifest.json`, confira que a folha nova fica acessível.
3. **Diferenças de arrumação em JS** passam por `simples()` em `extensao/app/util.js`, que lê o atributo.
   - **Prefira CSS sempre que der.**
   - Textos de ajuda ganham a classe `ajuda` e o `title` no elemento pai, **nos dois temas**. O Simplificado esconde `.ajuda`.
   - O HTML continua igual, então os testes que leem `textContent` seguem passando.
4. **Configurações → aba nova "Aparência"**, a primeira aba em `views/config.js` (hoje: Prazos, Leitura e avisos, Feriados, Palavras, Avançado).
   - Dois cartões com prévia em miniatura (Atual e Simplificado). A troca vale na hora, sem "Salvar".
   - Escolha Claro ou Escuro: a mesma do botão do trilho (`#btn-tema` em `app.js`), que continua lá. Mantenha os dois sincronizados (`iconeTema()`).
   - Ao trocar de tema, redesenhe a rota atual (`desenhar()` em `app.js`, mantendo a rolagem) e chame `aoRedim` se existir.
   - A escolha fica só neste Chrome, como o claro/escuro. Não vai para `chrome.storage` nem para as regras.

## 4. Simplificado: visual

- **Tokens próprios no claro e no escuro.**
  - Fundo liso: cinza muito leve no claro, quase preto neutro no escuro.
  - Superfícies brancas ou cinza-escuro, linhas finas, tinta em 3 tons.
  - **Uma cor de destaque** (o azul de ação atual, `--blue-deep`) nos botões principais e no item ativo.
  - O vermelho ControlTax fica só na marca e em alertas.
  - As cores de situação e de prazo legal continuam, mas **só no pontinho ou no texto**, sem fundo tingido.
  - Paleta de dados (`--viz-*`) igual à atual: foi validada com a skill dataviz. Se mudar, valide de novo.
- **Espaços em tokens** (`--pad-x`, `--pad-y`, `--gap`), mais compactos.
  - Ainda menores em `@media (max-width:1440px), (max-height:820px)`.
  - Ajuste juntos os valores amarrados ao padding: `.lh{top:-18px}` (casa com o padding-top da `.vista`), `.cfg-frame{height:calc(100vh - 170px)}`, `.sino-painel{top:56px}`, `.cmp-pe{bottom:-12px}`, `.dlg-cols.lateral .cmp-cab{top:-14px; margin:-14px -20px 0}`.
- **Tipografia:** IBM Plex Sans em tudo, com títulos em 600. Archivo só nos números grandes. h1 com 17 px. As fontes já estão em `extensao/fonts/`.
- **Trilho claro:**
  - superfície e ícones em tinta, item ativo com fundo azul leve;
  - sem gradiente, sem brilho, sem sombra;
  - as etiquetas ao passar o mouse continuam;
  - no escuro, o trilho fica na superfície escura.
- **Cabeçalho** liso (sem `backdrop-filter`), **numa linha só em 1366**:
  - busca só com ícone a partir de 1440;
  - "Ao vivo" com o ponto e "hh:mm";
  - subtítulo `.mod-sub` no `title` do h1;
  - sem o separador `.mod-div`;
  - abas sublinhadas.
- **Fundo:** sem marca-d'água e sem brilhos. O **destaque do Hoje deixa de ser escuro** no Simplificado e vira um cartão comum. No Atual continua escuro.
- **Cartões e janelas:**
  - borda de 1 px, sem sombra;
  - sem a faixa colorida no topo (inclusive a verde de "sem prazo legal");
  - só uma borda esquerda de 3 px quando há prazo legal;
  - pílulas de situação com pontinho e texto, sem fundo.
- **Animações:** ficam as entradas e transições, curtas. Saem os pulsos decorativos (`.hj-bola`, `.hj-step > i`). O ponto do "ao vivo" pode continuar pulsando.

## 5. Simplificado: arrumação por tela

**Hoje** (`views/inicio.js`, `views/tipos.js`)
- Destaque compacto numa faixa:
  - rosca de 96 px com o "% em dia", título e uma linha curta de contagens;
  - Próximos passos à direita, com altura menor (268 → ~200 px).
  - Saem o carrossel, a legenda e a bolinha ao vivo do destaque. Use CSS, sem mexer no Atual.
- "Solicitações por tipo", "Sugestões de ação" e "Previsão por empresa" viram **barras recolhíveis**:
  - mesmo visual da faixa de admissões (`.hj-admissao`) e contagem na barra;
  - a escolha fica lembrada em `oc.hojeRecolhidos`, com `lerPref`/`gravarPref` (hoje locais em `inicio.js`; mova para `util.js` e exporte);
  - a Previsão vem **recolhida**.
- Ajudas viram dica. "Trâmites conferidos às…" vai para o `title` do botão atualizar. `.sug-res` some. Tire uma borda das Sugestões: fica o pontinho de cor da categoria.

**Solicitações** (`views/fila.js`, `util.js`)
- **Grade de tipos recolhida por padrão** numa faixa de uma linha:
  - chips "Geral 3 · Aviso de férias 1…", só dos tipos com pendência, com rolagem horizontal;
  - botão **"Ver cartões"**, que abre a grade atual;
  - escolha em `localStorage` `controlonvio-fila-tipos`;
  - `tiposHtml` é usado também no Hoje: lá a grade fica como está, dentro da barra recolhível.
- Some o título "A responder / Aguardando o cliente / Todas as pendências" (`.fila-cab h3`), que repete a aba. Ficam "N solicitações" e o botão "Pôr em análise (N)".
- O subtítulo perde "· pendências lidas do Onvio, ao vivo". "Ordenar" fica sem rótulo (vai para o `title`). O texto de exemplo da busca fica mais curto.
- No cartão (`cartaoItem` em `util.js`):
  - sem o "—" quando não há assunto;
  - sem o responsável na aba Minhas quando é a própria pessoa (a vista em lista já faz isso).
- Nota das "consideradas resolvidas" (aba Respondidas) vira uma linha curta com ⓘ.

**Detalhe e caixa de resposta** (`views/detalhe.js`, `views/resposta.js`, `views/acao-form.js`)
- "Vez" e "parada há" ficam **só no topo** (`dlg-l1`).
- `dp-last` mostra Responsável, Pagamento até (quando houver) e Última movimentação. Aberta em, Prescreve em e Expectativa vão para um "mais" na mesma linha.
- A faixa "Continua pendente…" vira um ícone com `title`. A "Considerada resolvida" continua visível.
- Na caixa:
  - sem o rótulo "Trâmite" e sem a linha `cmp-efeito` (o efeito vai para o `title` de cada intenção);
  - "atalho R" vai para o `title`;
  - "Guardar como modelo" entra num menu ⋯ da barra;
  - textarea lateral com **72 px** em telas baixas: corrija a especificidade.
- Conversa: só o tempo relativo, com a data completa no `title`. Sem o rótulo maiúsculo do lado quando o nome já diz.

**Equipe** (`views/equipe.js`, `views/painel-equipe.js`)
- Herói menor: anel de 96 px, h2 com 20 px.
- As ajudas dos KPIs (as `.av-d` que não são variação) e os `.sub` dos cartões viram `title`.
- Ranking e gráfico lado a lado até 1200 px.
- A nota dos Responsáveis (`.card-nota`) vira ⓘ.

**Distribuir** (`views/distribuir.js`, `views/dist-auto.js`)
- A frase do cartão automático vira uma linha de estado, com o texto completo no `title`.
- Sai o rótulo "SUGESTÃO". O "· depois: …" pode ir para o `title`, se o teste for ajustado.

**Agenda** (`views/lembretes.js`)
- Sai "+ Lembrete neste dia".
- Dias do calendário com 36 px.
- "+1 h" e "Amanhã" entram num menu "Adiar".

**Configurações** (`views/config.js`)
- A ajuda de cada campo vira ⓘ com `title`.
- O selo de origem "padrão" fica escondido: só aparece quando o valor difere.
- Parágrafos de Feriados e Palavras ficam mais curtos.

## 6. Testes

**Rodar**
- `node --test testes/extensao.test.js`. Hoje são 130 testes passando; o núcleo não deve mudar.
- `NODE_PATH=$(npm root -g) node testes/navegador.js`. Use o Chromium do ambiente; não rode `playwright install`.
  - A suíte completa é longa. Rode em segundo plano e acompanhe a saída: `setsid nohup bash -c 'NODE_PATH=$(npm root -g) node testes/navegador.js > /tmp/nav.out 2>&1; echo "FIM $?" >> /tmp/nav.out' &`.
  - Para um passo só, use a variável `SO="trecho do nome"`.
  - `CAP=<pasta>` grava as capturas de tela.
  - Cuidado: um `assert.equal(await p.$(...), null)` que falha com um ElementHandle já estourou a memória. Prefira `p.$$eval(..., e => e.length)`.
- `NODE_PATH=$(npm root -g) node testes/extensao-real.js`.

**Ajustes em `testes/navegador.js`**
- `abrirApp` (abre em **1360×860**) ganha a opção `estilo`, com padrão `simples` (como de fábrica). Ele grava `controlonvio-estilo` no `localStorage` antes de carregar.
- Os passos que dependem do Atual passam `estilo: 'atual'` ou clicam em "Ver cartões":
  - grade de tipos visível nas Solicitações;
  - `.fila-cab h3`;
  - "+ Lembrete neste dia";
  - `.sug-res`;
  - tamanhos ou visibilidade do destaque do Hoje.
- Quase tudo confere por `textContent`. Texto escondido por CSS continua passando; texto tirado do HTML quebra.

**Passos novos**
- **Aparência:**
  - trocar nas Configurações muda o `data-estilo`;
  - a escolha fica lembrada depois de recarregar;
  - o claro/escuro é independente, e o botão do trilho e a aba ficam sincronizados.
- **Tela pequena (Simplificado)**, em **1366×650** e **1280×720**, para Hoje, Solicitações, detalhe, Equipe e Configurações:
  - o 1º cartão das Solicitações começa **acima de 400 px**;
  - o cabeçalho fica numa linha (≤ 64 px sem abas);
  - não há rolagem horizontal (`scrollWidth <= clientWidth`);
  - as barras do Hoje lembram o estado;
  - captura de tela de cada uma com `CAP`.
- **Atual intacto:** abrir o Hoje e as Solicitações com `estilo: 'atual'` e conferir que a grade de tipos, o destaque escuro e a legenda estão lá.

## 7. Documentação e versão

- `extensao/manifest.json`: `"version"` 0.41.0 → **0.42.0**.
- `extensao/LEIA-ME.md`: cabeçalho "(v0.42.0)" e uma seção "## Novidades da v0.42.0 (tema Simplificado)" antes da v0.41.0. Diga o que mudou e como voltar ao Atual em Configurações → Aparência.
- `CLAUDE.md`:
  - na tabela de arquitetura, a folha `estilo-simples.css`, o `data-estilo`/`controlonvio-estilo` e a aba Aparência;
  - nos parágrafos **Fundo** e **Destaque do Hoje**, que valem para o Atual, e como fica no Simplificado.
- `README.md`: uma frase sobre os dois temas.

## 8. Entrega (jeito do projeto)

- Antes de começar: `git fetch origin main` e partir do main atualizado. Outra sessão também mescla no main.
- **Commits pequenos, em português, um assunto por commit:**
  1. mecânica do tema e aba Aparência;
  2. visual do Simplificado;
  3. arrumação do Hoje;
  4. arrumação das Solicitações;
  5. arrumação do detalhe;
  6. arrumação de Equipe, Distribuir, Agenda e Configurações;
  7. testes;
  8. docs e versão.
- Push na branch de trabalho, PR pronto para revisão e mescla, como nas versões anteriores (#39 a #56).

## 9. Verificação final

1. Capturas de **cada tela** nos **dois temas**, **claro e escuro**, em 1366×650, 1280×720 e 1600×900, conferidas uma a uma.
2. O **Atual tem de ficar idêntico** ao de antes. Tire capturas do Atual **antes** de começar (no main) e compare com as de depois.
3. As três suítes passando.
4. Mandar ao Josué as capturas do Hoje e das Solicitações, Atual × Simplificado, em 1366×650.

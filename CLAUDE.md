# Control Onvio · visão do escritório (ControlTax)

Extensão Chrome (Manifest V3) que age sobre o Onvio Portal do Cliente **na visão do escritório**: junta as pendências das 10 listas de Solicitações de Serviço, calcula prazos e prescrição, marca a grade nativa e avisa guias não visualizadas. Dono: Josué Porfírio (Processos e Automação, ControlTax). Tudo que o usuário vê é em português do Brasil.

Existe uma extensão irmã, para o **cliente**: `josuep007-prog/assistente-portal-controltax` (preenche e confere as solicitações). As duas devem **prometer os mesmos prazos**: o cliente é avisado de 3 dias úteis (simples) e 5 (cálculo), e aqui o semáforo usa os mesmos números. Por isso as regras podem vir do mesmo arquivo (ver "Regras").

## Como trabalhamos

1. **Entender antes de mexer.** Qualquer mudança que dependa da tela ou da API do Onvio parte de `mapeamento/portal-do-cliente.md` (rotas, endpoints, códigos de situação, riscos). Se descobrir algo novo, atualize o mapa.
2. **Regra antes de código.** Prazo, feriado, palavra de "possível aba errada" e dias de aviso de guia são dados: ficam em `DEFAULTS` (`extensao/core.js`) e podem ser sobrescritos pelo arquivo de regras do escritório (`regras/escritorio.exemplo.json` mostra o formato). Código só para mecânica nova.
3. **Testar sempre.** `node --test testes/extensao.test.js` (sem dependências). Mudou grade, guias, painel ou manifesto: rode também `node testes/navegador.js` e `node testes/extensao-real.js` (precisam do Playwright: `npm i -D playwright`, ou `NODE_PATH` para uma instalação global; use o Chromium do ambiente). Tipo de regra ou fluxo novo ganha teste novo.
4. **Ao terminar:** suba `version` no `manifest.json` se mudou código, atualize `extensao/LEIA-ME.md` e o `README.md`, e faça commits pequenos, em português, um assunto por commit.

## Segurança no portal real (inegociável)

- A extensão é **somente leitura**. Nunca chamar nem automatizar: Excluir, Definir responsável, Alterar Expectativa de Conclusão, Encaminhar, incluir trâmite ou anexo, `assign-staff`, `change-due-date` e qualquer POST/PUT/DELETE. Ações em lote são a fase 2 e só com pedido explícito do Josué.
- Testes automatizados nunca falam com o Onvio real: usam API e páginas simuladas.
- Nada de dados de cliente em testes, logs ou commits. A extensão guarda só ID, situação, datas, cliente, empregado/assunto, responsável e (guias) nome do arquivo, vencimento e link. **Nunca** CPF, salário, CID, observações nem anexos.
- Sem telemetria, sem API externa, sem IA em nuvem. O único acesso de rede além do Onvio é o arquivo de regras que o próprio usuário indicar (https, sem credenciais, só JSON de dados, validado em `OC.normalizarRegras`).
- Chamadas à API do Onvio são não oficiais: se mudarem, a extensão deve falhar de forma visível (aviso no painel, Diagnóstico) e nunca mostrar número errado em silêncio. Código de situação desconhecido aparece como tal.
- Não há acesso ao Chrome do Josué nem ao Onvio real neste ambiente. O que depender da tela real (grade Wijmo, trâmites da lista Geral, estimativa de 1º trâmite) fica como "a confirmar" no `LEIA-ME` até ser conferido numa sessão com o Chrome dele.

## Arquitetura

| Arquivo | Papel |
|---|---|
| `extensao/core.js` | Núcleo sem `chrome.*`: tipos e códigos de situação, URLs, coleta, regras de prazo, gravidade (G1 a G3), 1º trâmite, métricas por analista, guias, aba errada, validação e combinação das regras. Roda no service worker, nos scripts de conteúdo e nos testes. |
| `extensao/background.js` | Service worker: leitura periódica, cache de trâmites, contador no ícone, notificações, regras do escritório (download + cache), migração das configurações. |
| `extensao/sidepanel.*` | Painel lateral: Minhas, Sem resp., Equipe, Analistas, Guias, Buscar; exporta CSV. |
| `extensao/grade.js` | Marca "Nd parada" na grade das listas (Wijmo ou tabela). Diagnóstico: `document.dispatchEvent(new CustomEvent('controlonvio-diagnosticar'))`. |
| `extensao/docs-hook.js` (mundo da página) + `docs-ponte.js` | Guias não visualizadas, a partir das respostas que a tela de Documentos já carrega. Sem chamadas extras. |
| `extensao/content.js` | Abre a lista certa já filtrada pelo ID. |
| `extensao/options.*` | Configurações, regras do escritório e Diagnóstico. |

**Ordem das configurações:** padrões do código < regras do escritório < ajustes da pessoa. A tela de configurações grava só o que difere do padrão em vigor (`__v: 2`), para mudanças futuras do arquivo de regras continuarem valendo.
**Regras:** `OC.normalizarRegras` aceita o formato do escritório (`prazos`, `feriados`, `abaErrada`) e o do Assistente do cliente (`config.prazoInternoDiasUteis`, `feriados`). Endereço informado em Configurações; permissão do site pedida em tempo de uso (`optional_host_permissions`).
**Scripts de conteúdo órfãos:** depois de atualizar a extensão, scripts já injetados perdem o acesso (`chrome.runtime.id`). `grade.js` e `docs-ponte.js` detectam, se desligam e pedem F5.

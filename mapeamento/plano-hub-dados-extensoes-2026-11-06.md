# Plano: o Control Hub aproveitando os dados das extensões (Onvio e Gestta)

Levantamento de 06/11/2026, feito no Hub 322 (versão 343 do artefato). Pedido do Josué: "o Hub como um todo não foi pensado contando que poderíamos ter essa riqueza de dados vindo das extensões; faça o levantamento pensando nos mínimos detalhes". Este documento é o plano pronto para ser aplicado em outra sessão. **Nada aqui foi feito ainda.**

---

## 0. Para quem vai aplicar (ler antes de começar)

**Onde está o Hub.** Artefato https://claude.ai/artifact/SGDHdEfbJi2qBjfNRo3vXS. Arquivos principais:
- `hub.js` (~920 KB): Início, DP inteiro, Entrada de dados (lado do Hub), Onvio (`ov*`), Gestta (`gt*`), cadastro único (`cad*`), uso do banco (`uso*`), registro/desfazer (`log*`, `undo*`, `restauro*`).
- `fontes.html`: tela da Entrada de dados.
- `contabil.js`/`.html`, `fiscal.js`/`.html`, `portal.js`/`.html`, `pop.js`/`.html`, `empresas.html`, `extras.js` (painel da coordenação, mural, rotinas, log), `assistente.js`, `auth.js`.

**Como trabalhar.**
1. Ler o artefato (`Artifact` action `read`, sem `path`, e ler todas as linhas do arquivo salvo) e baixar os arquivos (`paths`) numa pasta nova do scratchpad. Outra sessão pode ter publicado depois: sempre partir da versão atual.
2. Testes (sem Onvio/Gestta reais, banco simulado): `HUB_DIR=<pasta> NODE_PATH=$(npm root -g) node testes/hub-onvio/hub-gestta.js`, `.../hub-onvio.js` (tem **26 falhas antigas** conhecidas, compare a lista de falhas antes e depois) e `.../planilhas.js`. A pasta precisa de `index.fonte.html` (cópia do `index.html` publicado) e dos arquivos dos módulos. Cada item novo ganha passo de teste.
3. Publicar só `files` alterados (`Artifact` publish com `url`, `file_path` = o `index.html` baixado e `files: {"hub.js": ...}`).
4. Registrar no repositório (`mapeamento/` e este plano) e no `CLAUDE.md` quando mudar regra; commits pequenos, em português.

**Regras que valem para todos os itens (inegociáveis).**
- **Só leitura no Onvio e no Gestta.** Nada deste plano escreve lá. "Aplicar" = gravar no Hub, com histórico.
- **Empresas do escritório nunca** (ControlTax, Dynexa, Oficina Business, Diskcontador): toda lista nova passa por `ehEscritorioProprio`, `cadExc` (excluídas) e, quando fizer sentido, `gtEmpresaFora`.
- **Banco do artefato: 5.000 documentos no total, 256 KB por documento.** Nunca gravar dado derivado (calcular na leitura a partir de `ing_partes`); nunca um documento por evento/pessoa/solicitação; todo lote com teto **por tamanho** (não por número de itens). Hoje (após Hubs 320–322) o banco deve estar perto de 3.000 documentos.
- **Dado velho ou cortado não decide nada.** Toda regra que marca, sugere ou esconde algo confere `recebidoEm` (≤ 48–72 h) e `cortado` do manifesto (`ing_dados/<fonte>~<tipo>`), como já fazem `ovCompletos` e `gtManMotivo`; sem dado, a tela diz "sem dados de X desde dd/mm hh:mm", nunca mostra zero.
- **Dados pessoais** (`pessoais-*`: CPF, salário, nomes de empregados, trâmites): só exibir, nunca gravar em `dp_empresas` nem em outra coleção, nunca no cache do navegador, nunca à IA do assistente. Fora do DP, só contagens.
- **Sugestão ≠ decisão.** O que vem da fonte aparece como sugestão com origem ("pelo Gestta", "pelo Onvio") e é aplicado por quem tem permissão (coordenação do módulo), pela Entrada de dados ou por botão "Aplicar" no próprio módulo, sempre no histórico. A aplicação automática só para tipos ligados pela coordenação.
- **Legível nos dois temas, sem rolagem horizontal, contraste ≥ 4,5:1** (o Hub segue o visual do Control Hub; conferir com captura).

**Catálogo do que já chega** (envio a cada 6 h com o Hub aberto; `ing_dados` = manifesto com colunas, `nLinhas`, `recebidoEm`, `cortado`, `versaoExt`; `ing_partes` = tabela em texto):
- Onvio, listas (todas, com histórico): Geral, Cadastro empregado/estagiário/contribuinte, Aviso e Cálculo de férias, Aviso e Cálculo de rescisão, Afastamento, Rubricas. Colunas comuns: Nº, Tipo, Situação, Vez, Aberta em, Alterada em, Último trâmite, Expectativa, **Meio**, Cliente, Código/Id do cliente, Cliente usa o Onvio, Cliente envia eSocial, Cliente cadastra empregado, Responsável, Departamento (id). Específicas: admissão/início, **Fim, Fim da prorrogação, dias de experiência**, categoria eSocial, vínculo, jornadas; início das férias, **data do aviso, data do pagamento**, abono, 1ª parcela do 13º; **data do aviso de rescisão, concedido por, motivo, tipo de aviso (trabalhado/indenizado)**, data da rescisão; **data do afastamento, tipo, data da CAT**; competência e tipo de lançamento das rubricas.
- Onvio, análise: `analise-solicitacoes` (pendentes com dias parado, d.u. até o 1º trâmite, **gravidade G1–G3, prazo legal, prometido até, prescreve em**, atraso do cliente, resolvida sem retorno, departamento) e `analise-equipe` (por responsável: pendentes, vez escritório/cliente, vermelhas, amarelas, G1–G3, sem análise, d.u. médio até o 1º trâmite, resolvidas sem retorno).
- Onvio, clientes: `clientes-cnd` (situação, CNPJ/CPF, **IM, IE, UF, município IBGE**, usa o Onvio) e `clientes-nfe` (apelido, ativo, **tem certificado, validade do certificado**).
- Onvio, escritório: departamentos, acesso, tabelas, prescrição, conta, licenças, permissões, funcionalidades, serviços, equipe ativa. Documentos: `documentos-pastas` (pastas do portal: documentos, **usuários que leram**). Notícias.
- Onvio, pessoais: `pessoais-<lista>` (assunto, descrição, empregado, CPF, admissão, cargo, carga horária…), `pessoais-empregados` (lista de empregados de cada empresa com vínculo EMPLOYEE/INTERN/PARTNER), `pessoais-folha-contribuintes` (Extrato Mensal de 12 meses: quem está na folha), `pessoais-comunicacoes` (comunicações do portal: enviada, expira, **visualizada**, destinatários), `pessoais-pendentes-dados` e `-tramites`.
- Gestta: `gestta-clientes` (CNPJ, regime, IE, UF, cidade, **Id externo = id do Onvio**, usa o portal), `gestta-cartela` (cliente × setor → responsável), `gestta-setores` (20 setores), `gestta-equipe` (nome, papel, ativo, setores, tem tarefas), `gestta-tarefas` (mês atual e anterior: tarefa, cliente, CNPJ, setor, responsável, situação, meta, conclusão, competência), `gestta-empresas-ativas`, `gestta-envios-onvio-erro` (documento que não chegou ao portal), `gestta-templates-sem-pasta`.
- **Decidido pelo Josué para as próximas rodadas** (06/11/2026): contatos de cada setor com e-mail chegam do Gestta; a categoria `pessoais` vem ligada de fábrica e **todos os analistas veem tudo** no Hub; obrigações do Fiscal marcadas pelas tarefas concluídas do Gestta; desempenho num painel por módulo no Hub e na nota da Equipe da extensão.

---

## 1. Ordem recomendada

| Fase | O quê | Por quê primeiro |
|---|---|---|
| **A. Fundação** | Itens A1–A9 (banco, leitura, saúde dos dados, freios do automático, APIs para os módulos) | Sem isso, cada recurso novo enche o banco ou lê o mesmo dado cinco vezes; hoje já estourou uma vez |
| **B. Correções do que já existe** | B1–B10 (erros e conflitos achados no levantamento) | São defeitos que já mostram número errado |
| **C. Fiscal e Contábil pelo Gestta** | C1–C8 | Decisão já tomada (obrigações pelas tarefas); maior ganho de trabalho manual evitado |
| **D. DP com as listas completas** | D1–D12 | Prazos legais que hoje não aparecem (aviso trabalhado, experiência real, afastamento, CAT) |
| **E. Portal pelo uso real** | E1–E8 | Etapas de implantação medidas por evidência, não por marcação |
| **F. Cadastro único, Início, Painel, Assistente, POP** | F1–F12 | Junta tudo numa visão; depende das APIs da fase A |
| **G. Entrada de dados para o volume novo** | G1–G6 | Decidir rápido o que importa |

Tamanhos: **P** (até meio dia), **M** (1–2 dias), **G** (3+ dias).

---

## 2. Fase A: fundação (infraestrutura de dados)

**A1. Tirar funcionários e histórico de dentro de `dp_empresas` (G).**
Hoje cada empresa do DP é um documento com funcionários e até 200 linhas de histórico; o maior tem 155 KB, e `OV_DOC_MAX` (240 KB) já recusa gravações ("apague desligados"). Com a folha completa, as maiores empresas vão bater no teto. Além disso, cada gravação faz o banco reenviar o documento inteiro a todos os Hubs abertos.
- Nova coleção `dp_func/<empId>` (repartida em `<empId>~<n>` acima de ~150 KB) e `dp_hist/<empId>~<AAAA>` (lotes por ano; na empresa ficam só os 20 últimos itens).
- Leitura sob demanda (ao abrir a ficha, a aba Funcionários ou a conferência do Onvio); contagens (ativos, pró-labore, RPA) ficam num campo resumo da empresa, atualizado ao gravar.
- Migração única, com backup antes (`cad_backup` não serve: usar `dp_bkp/<data>~<n>` com poda), e o caminho antigo continua lido até a migração terminar.
- Ajustar `normalizeDpEmpresa`, `saveOne`/`updateFields`, `ovAplicar*`, relatórios, exportações e o importador.
- Teste: empresa com 400 funcionários e 300 linhas de histórico grava e lê; documento da empresa < 30 KB.

**A2. Índice leve do DP (M).** `dp_idx/<n>` (1–3 documentos: id, nome, CNPJ, responsável, situação, contagens) para Início, Painel, Cartela, agenda e módulos. A coleção `dp_empresas` inteira só é ouvida dentro do DP. Abrir o Hub cai de ~4,5 MB para centenas de KB. Atualizar o índice em toda gravação de empresa (mesma função de persistência).

**A3. Uma camada única de leitura dos conjuntos (M).** Hoje o Onvio tem cache no navegador (`hub-ov-cache`), o Gestta não tem nenhum, `fontes.html` baixa de novo partes que o hub.js já tem (e aceita 400 partes enquanto o hub.js para em 80), e `ing_dados` é ouvido duas vezes (`ovIniciar` e `gtIniciar`).
- Uma só escuta de `ing_dados`; uma função `dadosLer(fonte, tipo)` que devolve as linhas por ciclo, com cache em IndexedDB para conjuntos **sem** dados pessoais (Onvio e Gestta) e só memória para `pessoais-*`.
- `fontes.html` passa a ler pelo `__hubApi` (sem cópia própria).
- Mesmo limite de partes nos dois lados; ao passar do limite, o conjunto aparece como cortado (nunca corta em silêncio).
- Teste: abrir Entrada de dados depois do DP não baixa nenhuma parte de novo.

**A4. API de dados para os módulos (M).** Os módulos (Contábil, Fiscal, Portal, POP, extras, assistente) hoje só veem `window.__cadastro` (empresa ativa, analistas) e não conseguem ler tarefas do Gestta nem listas do Onvio. Expor em `window.__hubApi.dados`:
- `tarefas({ mod, cnpj?, competencia?, responsavel? })`: tarefas do Gestta já com o setor convertido em módulo (`gtSetorMod`), sem empresas do escritório nem excluídas, com `estado` (aberta, atrasada = meta < hoje sem conclusão, concluída no prazo, concluída com atraso).
- `solicitacoes({ departamento?, cnpj?, responsavel?, lista? })`: das listas do Onvio, só colunas sem dado pessoal.
- `clienteInfo(cnpj)`: IE, IM, município, UF, situação, usa o Onvio, certificado (validade), Id e código do Gestta, regime, responsáveis por setor.
- `alertas({ mod })`: envios ao portal com erro, templates sem pasta (só coordenação), certificado vencendo, dado velho.
- `saude()`: idade e corte de cada conjunto (ver A6).
- Cada função devolve também `{ ok, motivo }` quando o dado não pode ser usado (velho, cortado, faltando). Teste por função com banco simulado.

**A5. Freios da aplicação automática (M).**
- Máximo por rodada (ex.: 50 alterações e 5 empresas novas por módulo); o resto fica para decidir à mão, com aviso.
- O automático do Gestta passa a ter a mesma reserva de executor do Onvio (`ing_auto/lease`): só um navegador aplica por vez.
- O automático do Gestta exige dados de até 48 h e não cortados (hoje só confere se já leu).
- "Modo prévia" de uma rodada antes de ligar: mostra o que faria, por módulo e tipo.
- Para sozinho se mais de 20% das tentativas falharem, com aviso à coordenação.
- O que já foi tentado fica registrado no banco por dia (hoje `feitas` vale só na sessão, então cada Hub aberto tenta de novo).
- O automático não cria ponto de restauração (Hub 321); em troca, "desfazer o lote" pelo histórico em lotes (A7).

**A6. Painel de saúde dos dados (M).** Na Entrada de dados (aba Conexão) e resumido no Início para a coordenação: cada conjunto com idade, ciclo, linhas, linhas na origem, cortado, versão da extensão, partes usadas/limite e quais regras dependem dele. Selo verde (≤ 12 h), amarelo (≤ 48 h), vermelho (mais velho, cortado ou faltando). Avisos no sino do mural (sem gravar no banco).

**A7. Lotes e poda de tudo que cresce por evento (P).**
- Teto por **tamanho** em todo lote: `gt_hist` fecha o lote em ~180 KB (hoje fecha em 400 itens, que podem passar de 256 KB e a gravação falha em silêncio); `hub_restauro` limita também o campo `post` a 60 KB (hoje só `antes`); `hist` do Fiscal.
- Poda central uma vez por dia (quem abrir primeiro, com reserva): `hub_log`, `hub_erros` e `auth_log` mantendo os 60 dias mais recentes lendo a lista (hoje só apaga "o dia −31", e dias sem ninguém ficam para sempre); `historico` do Portal (um documento por dia, sem teto, o maior já tem 120 KB: lotes mensais); `cad_backup/dup_*` com mais de 90 dias; `gt_hist` com mais de 12 meses; `hub_restauro` numa regra só (hoje o extras.js apaga com 7 dias e o hub.js com 3 e 150).
- Toda gravação que falhar por tamanho avisa na tela (nada de `catch` vazio).

**A8. Uso do banco barato e com alerta (M).** Hoje "Medir agora" lê todas as coleções inteiras (era ~100 MB). Manter contadores aproximados por coleção, atualizados nas gravações e na poda (`dp_config/uso_banco`), e a medição completa só sob demanda. Alertas para a coordenação: acima de 70% dos documentos, documento acima de 200 KB, conjunto acima de 60 partes. **Acima de 90%, o automático para sozinho.**

**A9. Listas de "Ignorar" sem perder decisões (P).** `dp_ov_ignorar` lê com `slice(0, 400)` e grava com `slice(-400)`: acima de 400, as decisões mais novas somem e as diferenças voltam. `gt_ignorar` perde as mais antigas. Repartir por empresa (`<cnpj>~<n>`) com teto por tamanho e guardar a "assinatura do valor" (campo + valor da fonte), para a diferença só voltar se o valor da fonte mudar.

---

## 3. Fase B: correções do que já existe

**B1. Duas fontes do Onvio na Cartela do DP (P).** A aba Onvio da Cartela e o selo das empresas (`renderCtOnvio`, `renderOvBadge`, `ovPorEmpresa`) usam o resumo antigo `ing_lotes/onvio~solicitacoes` (cortado nas mais graves), enquanto Painel e ficha usam as 10 listas: os números de pendentes divergem. Migrar para `ovSolicitacoes()`/`analise-solicitacoes` e aposentar o resumo antigo.

**B2. Pró-labore, RPA e inativos recebendo alertas de funcionário (P).** `funcEventos`/`eventosCalc` não filtram vínculo nem situação: sócio gera "fim da experiência" e "período concessivo"; quem ficou Inativo por estar fora da folha continua com prazos. Filtrar `funcGrupo(f) === 'func' && !funcFora(f)`.

**B3. Painel do DP com totais diferentes por pessoa (P).** Os alertas do cadastro só entram com a preferência "Datas e lembretes dos funcionários" ligada (guardada no navegador); os do Onvio entram sempre. Os "Próximos 30 dias" contam só o cadastro. Separar os dois blocos com rótulo e contar igual para todos.

**B4. Cadastro do DP × folha (P).** Relatórios, Cartela e Painel contam o cadastro; a ficha diz o que a folha manda. Com o automático desligado, os números diferem sem aviso. Mostrar "pela folha: N" ao lado e "N diferenças não aplicadas" com link para a Entrada de dados.

**B5. Painel da coordenação mostra o Portal com 0 empresas (P).** A carteira do Portal devolve só `{analista, frentes}` (portal.js ~7887) e o `coletar` do extras.js soma `dados.empresas` (~282/288). O Portal passa a devolver empresas e atrasos.

**B6. Assistente não filtra pelo Portal (P).** `buscar_empresas` aceita só dp, contabil e fiscal no filtro de módulo.

**B7. Mascaramento de CPF no assistente (P, segurança).** `mascarar` não age para a coordenação, só pega CPF com pontos e não passa por `l.dados` (assistente.js ~33 e ~810). Mascarar sempre (inclusive 11 dígitos seguidos) e mandar à IA só colunas de uma lista permitida: nunca `pessoais-*`, CPF, salário, observações, descrição ou texto de trâmites.

**B8. Permissão dos dados pessoais conflita com a decisão (P).** `ovPodeVerPessoais` libera só coordenação/analista do DP; o Josué decidiu que todos os analistas veem tudo. Ajustar e, junto, separar: contagens (ex.: comunicações visualizadas) para quem vê o Portal; linhas com pessoas para quem vê dados pessoais. Registrar quem abriu conjunto pessoal (no `hub_log`, em lote do dia) e mostrar ao analista o filtro "minha carteira" por padrão. **Lembrar:** o bloqueio é só na tela, o banco do artefato não tem regra por usuário; isso fica documentado no mapeamento.

**B9. Modo exemplo do Fiscal (P).** Com a carteira vazia, o Fiscal cai em dados inventados e `podeMarcar` libera tudo (risco de alguém marcar achando que grava). Trocar por estado vazio com "Trazer do Gestta" (abre a Entrada de dados filtrada no Fiscal).

**B10. Obrigações duplicadas entre Contábil e Fiscal (M).** DAS (Contábil `impostos.das` × Fiscal `pgdas`), IRPJ/CSLL trimestral e DEFIS existem nos dois: a mesma entrega é marcada em dois lugares e pode divergir. Cada obrigação ganha um módulo dono (configuração da coordenação); o outro mostra só leitura, alimentado pela marcação do dono ou pela tarefa do Gestta.

---

## 4. Fase C: Fiscal e Contábil pelo Gestta

**C1. Tabela de correspondência tarefa → etapa/obrigação (M, base de C2–C5).** No Cadastro de cada módulo, mantida pela coordenação: padrão do nome da tarefa (expressão regular, sem acento e sem diferenciar maiúsculas) + setor(es) do Gestta → chave da etapa ou obrigação (`k`). Vem com sugestões de fábrica (Fiscal: "DCTFWeb"→`dctfweb`, "EFD ICMS|SPED Fiscal"→`efdicms`, "PGDAS|DAS"→`pgdas`, "Reinf"→`reinf`, "EFD Contribui"→`efdcontrib`; Contábil: "Concilia"→conciliação, "ECD"→`ecd`, "ECF"→`ecf`, "DEFIS"→`defis`…). Abaixo, a lista de **tarefas não reconhecidas** do mês (nome, setor, quantidade) para ir completando. Guardada em `fis_config`/`ctb_config` (um documento).

**C2. Fiscal: obrigações marcadas pelas tarefas concluídas (M, decidido).** Tarefa concluída do setor Fiscal (Fiscal, Fiscal Simples Nacional, Fiscal Dominio, Fiscal Conexos, conforme `gtSetorMod`), casando CNPJ + competência + obrigação → a entrega aparece como **sugerida "pelo Gestta"** (marca de outra cor) na Agenda e em Empresas; botão "Aplicar sugestões do Gestta" por competência (e opção automática da coordenação, com os freios de A5). Grava o mínimo (`[estado, data, "gestta"]`), sem histórico por item (o `fis_emp` tem 8 documentos e estoura com histórico). Competência ausente na tarefa → não sugere (não deduzir pela data sem a regra de deslocamento da obrigação). Tarefa existente para obrigação que o catálogo diz não se aplicar (ou o contrário) → aviso "regime/atividade pode estar errado".

**C3. Contábil: fechamento marcado pelas tarefas (M).** Mesma lógica nas 6 etapas (`ETAPAS`) por competência; tarefa aberta com meta vencida → etapa em vermelho mesmo sem marcação no Hub. Etapa "folha": Extrato Mensal publicado na competência (`pessoais-folha-contribuintes`) → sugere concluída; nenhum contribuinte em 12 meses → sugere marcar "sem folha".

**C4. Guias e envio ao cliente (P).** `gestta-envios-onvio-erro` do setor (mesmo cliente e competência) → selo "não chegou ao cliente" na guia (Contábil `stImp`) e na etapa "Guia enviada" do Fiscal ("enviada com erro"); some quando sai da lista. Cliente que não usa o portal (`clientes-cnd`/Gestta) → indicador "entrega por e-mail".

**C5. Pendências do cliente pelas solicitações (P).** Solicitações da lista Geral com Departamento = Contábil ou Fiscal (ids em `escritorio-departamentos`/`departamentosSetor`) e Vez = cliente → pendência sugerida na ficha e em `abrirPendencia` (Contábil) e "aguardando cliente" na etapa "Documentos recebidos" (Fiscal). Dias parado e gravidade de `analise-solicitacoes` alimentam `cobrancasParadas`.

**C6. Certificado digital (P).** `clientes-nfe` (tem certificado, validade): cartão no Painel, coluna e filtro em Empresas/Carteira, aviso na ficha, evento na Agenda 30 dias antes; no Contábil, aviso na linha da ECD/ECF se vence antes do prazo. Crítico no Fiscal (download de NF-e, transmissões).

**C7. Fiscal: atividade, IM e prazos municipais (P).** Atividade (`ativ`) sugerida por evidência: IE (`clientes-cnd`/Gestta) ou tarefa de ICMS/EFD → comércio/indústria; IM ou tarefa de ISS → serviço; os dois → misto. IM vira diferença (hoje não é comparada). Com município IBGE e UF, o catálogo guarda o dia do ISS/ICMS por município/UF em vez de "a conferir".

**C8. Equipe e desempenho por módulo (M, decidido).** Contábil (aba Equipe) e **Fiscal (aba nova)**: por responsável no setor, tarefas abertas, concluídas no mês (no prazo/com atraso), atrasadas, ao lado da carteira do Hub; responsável da cartela ≠ responsável da tarefa → "quem está cobrindo quem" (alimenta `coberturaDe`). Produtividade passa a usar a data de conclusão no Gestta (mais fiel que a data da marcação no Hub). `revisaoCadastro` ganha: sem certificado ou vencido, regime diferente do Gestta, IM ausente com tarefa de ISS. A lógica tarefa→etapa fica no hub.js (A4), não copiada em cada módulo (hoje `feriados`, `normEmp`, `gesttaRef`, `cadMestre` e `gravarMapas` já estão repetidos).

---

## 5. Fase D: DP com as listas completas

Regras de prazo legal aparecem **escritas na tela** (apoio, não substituem a conferência). Calcular na leitura (`ovEventosBrutos`, `funcEventos`), nunca gravar.

**D1. Fim da experiência real (P).** `Fim`, `Fim da prorrogação` e dias de experiência/prorrogação do Cadastro empregado substituem a regra fixa 45/90 de `funcEventos`; alerta 5 dias antes. Sem os campos, mantém 45/90.

**D2. Fim do contrato de estagiário (P).** `Fim` do Cadastro estagiário (ou vínculo INTERN): evento "Fim do TCE", alerta 30 dias antes (hoje só existe o prazo do eSocial).

**D3. Aviso prévio (M).** Aviso de rescisão hoje não gera evento. Trabalhado: último dia = data do aviso + 30 + 3 por ano completo (admissão de `pessoais-*`/empregados), pagamento = último dia + 10; indenizado: pagamento = aviso + 10. Na Agenda e no Painel.

**D4. Férias (P).** Aviso de férias dado com menos de 30 dias do início → alerta "aviso fora do prazo"; abono e 1ª parcela do 13º como texto no evento "Pagar férias"; **juntar** aviso e cálculo da mesma pessoa + início numa data só (hoje cada solicitação gera o seu evento).

**D5. Afastamentos (M).** Usar também os concluídos recentes (hoje só a solicitação aberta conta, `ovEmpregados`): doença → "16º dia, encaminhar ao INSS" (data + 15) e prazo do S-2230; lista "afastados agora" na ficha e no Painel; situação Afastado sugerida ao funcionário.

**D6. CAT (P).** `Data da CAT` vira evento com prazo (comunicar até o 1º dia útil seguinte ao acidente, contado da data do afastamento); tipo acidente sem CAT → "CAT pendente".

**D7. Prometido e prescrição na Agenda (P).** `Prometido até` e `Prescreve em` de `analise-solicitacoes` viram eventos tipo "onvio" (hoje só etiqueta).

**D8. Ficha da empresa, aba Dados (P).** "Usa o Onvio", "Envia eSocial", "Cadastra empregado" como campos fixos e medidor novo em `GAPS`; se o cliente envia o eSocial, o evento da admissão diz "cliente transmite"; filiais de `clientes-cnd` sugerem estabelecimentos e cidade/UF; "usa o portal" do Gestta × Onvio divergente → aviso.

**D9. Ficha, aba Folha (P).** Rubricas por competência sugerem quais lançamentos a empresa manda todo mês e em que dia costuma mandar; "Quadro pela folha" com a série de 12 meses (ativos por mês, pró-labore à parte), também no relatório Quadro.

**D10. Funcionários (P).** Cargo e carga horária de `pessoais-empregados` completam campos vazios (hoje o novo entra com cargo vazio); período aquisitivo **sugerido** pela última férias concluída da pessoa (nunca automático).

**D11. Rotinas e tarefas do Pessoal (P).** Tarefas do setor Pessoal do mês ao lado das rotinas mensais digitadas (`prazos`, `dpGerais`), mostrando atrasadas/concluídas, sem apagar as rotinas. Comunicações do portal não visualizadas ou a expirar, documentos de Pessoal não lidos e envios com erro do setor Pessoal na aba Onvio da ficha.

**D12. Painel, Cartela e Relatórios (M).**
- Painel: cartões por gravidade (G1–G3, sem análise), "Gestta Pessoal do mês" (atrasadas por analista), "afastados agora", "estagiários e experiências em 30 dias", "envios com erro".
- Cartela: carga real por analista (`analise-equipe` + tarefas do Pessoal) como colunas; a régua da simulação de trocas e do aviso de cobertura passa a ser pendência real, não número de empresas; responsável no Onvio × Hub × Gestta lado a lado.
- Relatórios novos: solicitações do Onvio (volume por lista e mês, tempo até o 1º trâmite, % na vez do cliente, meio, expectativa), afastamentos e CAT, uso do portal por empresa, cumprimento de prazos legais, quadro pela folha × cadastro.
- Desempenho: memorizar por versão dos dados `ovEventos`/`ovAlertas`, indexar solicitações por pessoa, tirar o O(n²) da deduplicação em `ovDifsFunc`.

---

## 6. Fase E: Portal do Cliente pelo uso real

**Antes de E1–E4:** conferir no dado real os valores do campo **Meio** e como `documentos-pastas` se liga ao setor (nome da pasta). Uso real é **evidência**: mostra selo e sugere, não conclui etapa manual sozinho.

**E1. Habilitação pelo Onvio (P).** "Usa o Onvio" (`clientes-cnd`/`nfe`) ou "Usa o portal do Onvio" (Gestta) = sim → etapa concluída "pelo Onvio" com selo; marcada concluída e as duas fontes dizendo não → conflito. Substitui a inferência pelo primeiro contato treinado.

**E2. Contatos por setor do Gestta (M, decidido).** Os contatos chegam com e-mail e setores; casar por e-mail dentro da empresa (empresa ligada por Id externo = id do Onvio, ou CNPJ). Contato ligado ao setor X = cadastro do usuário ativo em X. O Portal grava só o que é dele (treinamento, modalidade, agendamento) por empresa + e-mail; os contatos em si ficam em `ing_partes` (hoje um documento por contato, 319). O PDF "Usuários do cliente" e o casamento por nome viram plano B. A auditoria Domínio passa a ser calculada a cada envio, sem sincronização manual. E-mail só para quem tem acesso ao Portal; nunca à IA.

**E3. Selo "Em uso" por frente (M).** Pessoal: ao menos uma solicitação aberta pelo cliente pelo portal nos últimos 60 dias, e % aberta pelo cliente × escritório no trimestre. Todas as frentes: % de comunicações visualizadas em 30 dias (abaixo de 30% com 3+ enviadas = "não lê"); algum documento lido no mês na pasta do setor. Só contagens (as comunicações são `pessoais`; ver B8).

**E4. Impedimentos e atenção (P).** Envio do Gestta com erro (um item por empresa e setor: erro, tentativas, competência, responsável; some quando sai da lista) em Impedimentos, na atenção do Hoje e na ficha; templates sem pasta num bloco "Do escritório" (só coordenação).

**E5. Frentes e analista pela cartela (P).** A cartela sugere frentes com demanda e o analista de cada frente, com "Aplicar" (o digitado vale até aceitar). A equipe do Gestta sugere quem falta cadastrar na equipe do Portal.

**E6. Adoção (M).** Por empresa: etapas concluídas × uso real → listas "concluída mas sem uso" (retreinar) e "em uso sem treinamento registrado". Por analista: % da carteira de frentes com uso real; no DP, junto com `analise-equipe`. O Foco sugere quem tem frente concluída sem uso ou erro de envio. Relatórios do Portal ganham essas séries.

**E7. Linha do tempo (P).** Cache e casamento pelo cadastro único (`__cadastro.buscar`) em vez do nome (hoje relê `historico` inteiro + 60 dias de log + 3 coleções a cada busca); eventos com origem: primeira solicitação aberta pelo cliente, primeira comunicação visualizada, erro de envio que surgiu ou foi resolvido.

**E8. Ponte do assistente do Portal (P).** `consultar("onvio")` lê os dados que chegam (não o PDF lido na sessão).

---

## 7. Fase F: cadastro único, Início, Painel, Assistente, POP

**F1. Cadastro único enriquecido (M).** Ficha e lista de Empresas mostram, calculado na leitura: IE, IM, município (IBGE), certificado e validade (Onvio); Id e código do Gestta, regime, cidade, ativo, usa o portal (Gestta); "com tarefa nos 2 meses"; responsáveis por setor; resumo do uso do portal. Filtros: certificado vencendo/sem certificado, IE/UF/município diferente entre Onvio e Gestta, ativa num sistema e inativa no outro, usa o portal. Gravar no cadastro só o **código do Gestta** (a chave de ligação); os 8 documentos aguentam poucos campos a mais. Ligar empresa sem CNPJ completo pelo Id externo/código do Onvio (hoje `cadMontar` ignora).

**F2. Início do Hub: "Pede atenção hoje" (M).** Respeitando `podeVer(mod)` e, para o analista, só a parte dele (`__auth.analista(mod)`): atrasos e vencimentos de cada módulo (mesmo `consultar` do Painel), solicitações G1/vermelhas/prestes a prescrever do próprio responsável, envios com erro dele, treinamentos de hoje, certificados vencendo, mural não lido, rotinas do dia. Selo de frescor dos dados (A6).

**F3. Painel da coordenação: desempenho por módulo (M, decidido).** DP: `analise-equipe` por analista. Contábil e Fiscal: tarefas do Gestta por responsável (mês e anterior: no prazo, vencidas, abertas) e, no Fiscal, obrigações concluídas pelas tarefas. Portal: adoção por analista, frentes concluídas em 30 dias, envios com erro. A carga (`pts`) inclui tarefas abertas e solicitações vermelhas. O relatório mensal leva as mesmas tabelas. **Combinar com a nota da Equipe da extensão** (decisão do Josué): mesma régua nos dois lugares.

**F4. Mural, rotinas e registro (P).** Sino: fonte sem chegar há mais de 12 h ou cortada (sem gravar no banco). Rotina de coleta mostra o último recebimento de cada fonte. Registro de alterações: linha "Entrada de dados" com fonte, versão da extensão e linhas.

**F5. Assistente (M).** Consultas novas: `portal_uso`, `envios_erro`, `cadastro` (IE, IM, município, certificado, situação), `solicitacoes` (só contagens por empresa, analista, gravidade e meio), `tarefas_gestta`, `contatos` (nome e setor; e-mail só no cartão da tela). Tudo pela API A4, com B7 aplicado.

**F6. POP ligado ao trabalho (M).** Campos novos no POP: `tarefasGestta` (padrões de nome), `obrigacoes` (chaves do Fiscal/Contábil), `tiposSolicitacao`. Botão "▶ POP" na etapa/obrigação/solicitação que tem procedimento. Gestão: "tarefas sem POP" (nomes de tarefa mais frequentes por setor sem POP, com volume) e "assuntos frequentes" (só contagens e nomes saneados: o POP é aberto a todos e não pode mostrar cliente nem CNPJ). Dono ou aprovador inativo no Gestta → alerta de governança. Trilha: departamento sugerido pelos setores da pessoa no Gestta.

---

## 8. Fase G: Entrada de dados para o volume novo

**G1. Fila única e por empresa (M).** Onvio e Gestta numa fila só (origem como etiqueta), agrupada por empresa e ordenada por risco: desligamento/situação a confirmar → empresa nova → correção → complemento. Complementos de campo vazio recolhidos ("N complementos seguros: aplicar todos").

**G2. Decidir por lote com prévia (M).** "Aplicar todos os complementos desta empresa", "aplicar este tipo em toda a minha carteira", "ignorar este campo nesta empresa sempre"; prévia com antes/depois agregado e quantas empresas serão gravadas.

**G3. Filtros fixos (P).** Minha carteira, módulo, analista, tipo, idade do dado, "só o que o automático não pode fazer"; lembrar a última escolha de cada pessoa (navegador).

**G4. Selo de idade e corte em cada bloco (P).** "Onvio de 06/11 14:30 · completo"; botões desativados com dado velho/cortado (A6).

**G5. "O que o automático fez desde a sua última visita" (P).** Por empresa, com link ao histórico e "desfazer o lote" (pelo histórico em lotes, A7).

**G6. Recebido e Conexão (P).** Busca geral e "ver conjunto" pela camada única (A3), com índice criado uma vez, progresso em MB e tabela paginada no navegador; a aba Conexão junta o painel de saúde (A6) e o uso do banco (A8).

---

## 9. Decisões que dependem do Josué (perguntar antes do item)

1. **A1:** pode migrar funcionários e histórico para fora da empresa do DP (com backup e período em que os dois caminhos funcionam)?
2. **A5:** limites do automático (sugestão: 50 alterações e 5 empresas novas por módulo por rodada) e se o automático de "cadastrar empresas" continua ligado (hoje cada empresa nova do DP é um documento novo).
3. **B8:** confirmar que "todos os analistas veem tudo" vale também fora do DP (Contábil, Fiscal, Portal) e se o registro de quem abriu dados pessoais deve existir.
4. **B10:** dono de cada obrigação repetida (DAS, IRPJ/CSLL, DEFIS): Contábil ou Fiscal?
5. **C2/C3:** sugestões do Gestta aplicadas à mão (botão por competência) ou também automáticas (com os freios)?
6. **D3, D5, D6:** as regras de prazo legal (aviso prévio proporcional, 16º dia, CAT, S-2230) conferidas por alguém do DP antes de entrar.
7. **E3:** limiar do selo "Em uso" (60 dias de solicitação pelo portal; 30% de comunicações visualizadas) e se "uso real" pode concluir etapa sozinho ou só sugerir.
8. **F3:** régua única de desempenho para o Painel do Hub e para a nota da Equipe da extensão.
9. **Gestta:** pedir à equipe que preencha o campo Setores das 9 pessoas ativas sem setor (Hub 322 contorna pela cartela, mas a origem fica certa).

---

## 10. Riscos gerais e como evitar

- **Encher o banco de novo:** nenhum item grava derivado; A7/A8 vigiam; todo item novo mede o tamanho do maior documento no teste.
- **Número errado em silêncio:** A6 em toda tela que usa dado das extensões; "sem dados" em vez de zero.
- **Nome de tarefa variável no Gestta:** só correspondência configurável (C1), lista de não reconhecidas, nunca marcar sem origem.
- **`gestta-tarefas` cobre só 2 meses e `analise-solicitacoes` só pendentes:** não reconstruir histórico; ausência de tarefa não vira "pendente".
- **Setores do Gestta (20, com Contábil1/2 e quatro Fiscais):** dependem de `gtSetorMod`/`gt_config`; setor mal configurado esconde ou duplica carga (mostrar na saúde dos dados os setores sem módulo).
- **Desempenho com volume:** memorizar por versão dos dados, índices por pessoa/CNPJ, listas longas desenhadas em blocos.
- **Dados pessoais e IA:** B7 antes de F5; nada pessoal no cache do navegador.

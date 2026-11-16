# Mapeamento · guias de FGTS e DCTFWeb (16/11/2026)

Resultado do roteiro de 13/11/2026, executado em 16/11/2026 numa empresa de teste (competência 09/2026 para leitura; 10/2026 para o teste de emissão no FGTS Digital). Nenhum token, cookie, CPF, nome, CNPJ, número de guia nem valor em reais: ids, CNPJs, números de guia e competências aparecem como `{id}`, `{cnpj}`, `{numero}`, `{competencia}`.

**Escopo atual: só FGTS (FGTS Digital).** O e-CAC/DCTFWeb ficou de lado por decisão do Josué (o site está em mudança e o captcha complica); o que foi observado dele está na seção 4, parcial. Não testado: validade da URL assinada do PDF; se emitir de novo a mesma competência gera outra guia ou devolve a mesma.

## Captcha e certificado
- Captcha: 1 ocorrência, na entrada da DCTFWeb (`dctfweb.cav.receita.fazenda.gov.br/.../Captcha.aspx`, hCaptcha "Sou humano" + "Prosseguir"), depois de trocar o perfil no e-CAC para procurador. Não apareceu no gov.br, no FGTS Digital nem no e-CAC. A extensão nunca resolve captcha: para e mostra a aba.
- Certificado: aparece como **balão por cima da página** (não é aba); a extensão não o enxerga e a aba fica sem responder até o analista escolher. Pediu ação 1 vez no FGTS Digital e 1 vez ao abrir a DCTFWeb; no e-CAC o gov.br reaproveitou a sessão.
- Sessão do FGTS Digital: 30 minutos (contador na tela).

## 1. Gestta: onde estão a folha e as guias
Tarefas da empresa de teste com meta em outubro/2026, competência **Setembro/2026** (a competência é o mês anterior ao da meta). Tipo `RECURRENT`, subtipo `AUTOMATIC`, setor Pessoal.

| Template da tarefa | Itens de documento |
|---|---|
| `PESSOAL \| FOLHA MENSAL (UNIFICADA)` | Extrato da Folha, Recibo de Pagamento, Guia Contribuição Assistencial Empregados, Relação de Totais Líquidos - Salário, Relação de Vencimento de Férias - Agenda de Ferias, Relação Assistencial, RPA - Recibo de pagamento Autônomo. Todos com integração Domínio e validação exigida. |
| `FGTS DIGITAL` | **FGTS Guia**, **Demonstrativo FGTS**, **Demonstrativo e-consignado** (os dois primeiros com integração Domínio). Aviso na tela: "Não há pastas de destino atreladas aos documentos indicados". |
| `PESSOAL \| DCTFWEB` | DARF DCTF WEB. |

- Cada guia fica em **tarefa separada** da folha: extrato em "Extrato da Folha" (tarefa de folha); guia do FGTS em "FGTS Guia", demonstrativo do detalhe em "Demonstrativo FGTS" e o consignado em "Demonstrativo e-consignado" (tarefa FGTS DIGITAL); DARF em "DARF DCTF WEB" (tarefa PESSOAL | DCTFWEB).
- "Guia ainda não anexada": o item aparece sem o ícone de olho (só um ícone cinza de reenvio) e o contador "x / y documentos" fica incompleto. O hábito da equipe (item sem arquivo × tarefa aberta) não foi confirmado: as tarefas da empresa de teste estavam concluídas.
- Histórico (`type/status`): `TASK/VIEWED`, `TASK/DOWNLOADED` (com `company_document`), `DOCUMENT/SENT_TO_PORTAL` (com `company_document`, `document_value`), `EMAIL/SENT`, `EMAIL/DELIVERY`. A tarefa de folha não tem `SENT_TO_PORTAL`; a publicação do extrato no Onvio não aparece no histórico do Gestta.
- Chamadas (base `https://api.gestta.com.br/`, cabeçalho `Authorization` com o valor de `localStorage['ngStorage-jwt']`, formato `JWT ...`): `GET core/customer/task/{id}` (campos como já mapeados; `company_documents[].file` vazio = sem arquivo, preenchido = URL assinada do S3 que expira), `GET core/customer/task/{id}/history`, `POST core/customer/task/search` (corpo já mapeado).
- Datas vêm em UTC: `competence_date` `...T02:59:59Z` é 23:59 do dia anterior em Brasília. Converter antes de tirar o mês.

## 2. Extrato da folha (Domínio)
Lido o extrato anexado na tarefa de folha (não o do portal Onvio).
- **Cabeçalho (por página):** "Empresa:", "CNPJ:", "Cálculo:", "Competência:" (`MM/AAAA`). Competência e CNPJ aparecem no texto.
- **Última página, bloco "INSS":** Salário contribuição empregados, Salário contribuição contribuintes, Excedente, Base total, **Segurados**, **Empresa**, **RAT**, Contribuintes, **Terceiros**, Adicional ao SENAI, **Total INSS**, Base INSS Receita Bruta, (-) Salário Família, (-) Salário Maternidade, Valores pagos a Cooperativas.
- **Bloco "FGTS, PIS e ISS":** Base do FGTS, **Valor do FGTS**, Base do FGTS Aprendiz, Valor do FGTS Aprendiz, Base FGTS Rescisório, **Valor FGTS Rescisório**, Base FGTS Resc. mês ant., Valor FGTS Resc. mês ant., Base PIS, **Valor PIS**, Base ISS, Valor ISS.
- **Blocos de IRRF** (competência do cálculo e do pagamento): Valor IRRF Mensal, Férias, Partic. Lucros, Exterior, 13º Salário, **Valor Total do IRRF**, IRRF Aluguéis, IRRF contribuintes.
- **FGTS do extrato = guia do FGTS Digital?** Sim, em 1 empresa: "Valor do FGTS" = "Valor a recolher" da guia **mensal**. O "Valor FGTS Rescisório" não entra na guia mensal (a coluna rescisória veio zerada); o rescisório sai em guia própria (`RESCISORIA`) e pode diferir do extrato.
- **DARF da DCTFWeb** (nessa empresa): total do DARF = "Total INSS" + "Valor PIS" (PIS folha, código 8301, vencimento diferente). Segurados ↔ 1082, Empresa ↔ 1138, RAT ↔ 1646, Terceiros ↔ 1170/1176/1191/1196/1200. IRRF e Salário Família/Maternidade estavam zerados (não conferidos).
- **DARF (PDF):** CNPJ completo, "Período de Apuração", "Data de Vencimento", "Número do Documento", "Nº Recibo Declaração", total.
- **Guia do FGTS (PDF):** "GFD - Guia do FGTS Digital", "Pagar este documento até", "Valor a recolher", "Identificador" (= número da guia), "Tag" (raiz do CNPJ + competência + `MENSAL`), "Composição do Documento" (FGTS Mensal, FGTS Rescisório, Indenização Compensatória, Encargos FGTS, Total) e "Total da Guia". O CPF/CNPJ do Empregador mostra só a **raiz** (8 dígitos).

## 3. FGTS Digital (`https://fgtsdigital.sistema.gov.br`)

### 3.1 Login e perfil
- "Entrar com GOV.BR" → gov.br (CPF, banco, QR code, certificado digital, certificado em nuvem). Com o certificado da ControlTax caiu em `/portal/escolhaPerfil`, sem captcha.
- **Trocar Perfil** → Perfil `Procurador` → "Empregador a ser representado" (CNPJ da **matriz**) → Definir. Demora cerca de 25 s: `GET /proxy-api/v2/perfil?tipoPerfil=2&niPerfil={cnpj}` (fica `pending`), depois `GET /proxy-api/v2/ni?tipoPerfil=2&niPerfil={cnpj}` e `GET /proxy-api/v2/ni?tipoPerfil=1&niPerfil={cnpj_procurador}`.
- O banner de cookies cobre a parte de baixo da tela; as ações funcionam com `scroll` ou por referência.
- Menu inicial: Calamidade RS, Gestão de Guias, Remunerações para Fins Rescisórios, Consultas do Empregador, Parcelamento, CVE (Estorno e Restituição), entre outros. Gestão de Guias: Emissão de Guia Rápida, **Emissão de Guia Parametrizada**, **Consulta de Guias**, Emissão de Guia de Notificação, Emissão de Guia de Consignados Vencidos.

### 3.2 Emissão de Guia Parametrizada (`/cobranca/#/gestao-guias/emissao-guia-parametrizada`)
Quatro etapas: 1 Selecionar Débitos FGTS · 2 Selecionar Débitos Consignado · 3 Definir Vencimento · 4 Emitir Guia.

**Pesquisa (etapa 1).** Filtros: Competência de Apuração (inicial/final), Vencimento do Débito, Número do Processo Trabalhista, Tipo de Débito (Mensal, Rescisório, Processo Trabalhista), Vencimento (A vencer, Vencido), Guias ("Sem guia emitida"), Parcelamento (Não Parcelado, Parcelado). A lista de competências só mostra as que têm débito **sem guia emitida**: competência com guia já emitida não aparece.

`GET /cobranca/api/guia-parametrizada/debitos?debitosMensais=true&debitosAVencer=true&debitosVencidos=true&debitosNaoParcelados=true&debitosSemGuia=true&competenciaApuracaoInicial=AAAAMM&competenciaApuracaoFinal=AAAAMM&numPagina=1`. Resposta:
- `debitos[]`: `id, incluido, guiasRelacionadas, linkFichaFinanceira, situacaoIC, competenciaApuracao, competenciaReferencia, dtVencimento, origem, cpfTrabalhador, nomeTrabalhador, estabalecimentoRemuneracao, lotacaoTributaria, localTrabalho, codigoCategoria, descCategoria, tpRemuneracao, matricula, alterouSaldo, vlSaldoOriginal, vlPrincipal, vlAtualizacaoMonetaria, vlMulta, vlJuros, vlTotal, idParcelamento` (`estabalecimentoRemuneracao` com o erro de grafia da própria API).
- `qtdeTotalDebitos`, `qtdeTotalDebitosNaGuia`, `resumoSelecao{recuperouEncargos, qtdeTotal, qtdeTrabalhadores, vlTotalPrincipal, vlTotalAtualizacaoMonetaria, vlTotalMulta, vlTotalJuros, vlTotalEncargos, vlTotal, qtdeTotalConsignado, qtdeTrabalhadoresConsignado, vlTotalConsignado, vlTotalGuia}`.
- Colunas na tela: Competência de Apuração, Competência de Referência, Vencimento do Débito, Origem, CPF do Trabalhador, Matrícula, Estabelecimento da Remuneração, Código Lotação Tributária, Número do Processo Trabalhista, Tomador de Serviços.

**Selecionar** (checkbox do cabeçalho) → **Adicionar à guia**: `POST /cobranca/api/guia-parametrizada/debitos`, seguido de `GET .../debitos` e `GET .../debitos/encargos?noloading&uuid={uuid}`. O resumo (Quantidade de Débitos, Quantidade de Trabalhadores com FGTS, Principal FGTS, Encargos FGTS, Total FGTS) aparece abaixo da tabela. **O estado da seleção fica no servidor** (`incluido`, `uuid`).

**Etapa 2 (Consignado):** **Avançar** → `GET .../dados-filtro-consignado` (devolve `400` com aviso `COB0105` "Não há débitos de consignados..." quando não há) e `POST .../consignados:batch-create` (`204`). Sem consignado, basta avançar de novo.

**Etapa 3 (Definir Vencimento):** `GET .../debitos-revisao?noloading&numPagina=1&tamPagina=5&uuid={uuid}&primeiraChamada=true` e `GET .../consignados-revisao?numPagina=1&tamPagina=5&campoOrdem=competenciaApuracao&ordem=asc`. Na tela: "Vencimento da Guia" (padrão = menor vencimento dos débitos; não pode ser posterior a ele), Principal FGTS, Atualização Monetária, Multa, Juros, Total FGTS, Total Consignado, Total da Guia, Tag (opcional).

**Etapa 4 (Emitir Guia):** **Avançar** → `GET .../agrupamentos-carrinho?dtPagamento=AAAA-MM-DD`. **Emitir Guia** → `GET /cobranca/api/guia-rapida/confirma` (`204`) e `POST .../guia-parametrizada/gerar-guia?noloading&dtPagamento=AAAA-MM-DD&uuid={uuid}&tag={tag}&hash={hash}` chamado **duas vezes** (consulta assíncrona), ambas `200`. A tela mostra o número da guia, "Vencimento da Guia", "Tag" (padrão: data e hora) e a tabela (FGTS Mensal, FGTS Rescisório, Indenização Compensatória, FGTS Processo Trabalhista, Encargos FGTS, Total), com o botão **Reiniciar**. Não testado: clicar em Emitir de novo.

### 3.3 Consulta de Guias (lista guias emitidas, sem emitir de novo)
- Filtros: Situação da Guia (Aguardando Pagamento, Paga Aguardando Individualização, Processando Pagamento, Paga Individualizada, Expirada; padrão só as não pagas e não expiradas), Número da Guia, Data do Pagamento, Vencimento da Guia (máximo 12 meses), Competência de Apuração (últimas 3, 6, 12 ou período), CPF do Trabalhador.
- `POST /cobranca/api/consultar-guias/guias`. Colunas: Número da Guia, Tipo de Guia (`MENSAL`, `RESCISORIA`), Vencimento da Guia, Data do Pagamento, Valor Total, Situação da Guia, Ações.
- O número exibido é o "Identificador" do PDF. Nas chamadas, `{numero}` é o mesmo **sem o hífen e sem o zero inicial**.
- Detalhe (ícone de olho): `GET /cobranca/api/guia/{numero}/totalizador`, `GET .../debitos?num-pagina=1&tam-pagina=10&campo-ordem=competenciaApuracao&ordem=desc` e `GET .../consignados?...`. Mostra tipo e vencimento, data da emissão, emitida por (CNPJ do procurador), data do pagamento, data da individualização, número de autenticação e situação.

### 3.4 Download (ação ⋮ "Opções de impressão" na Consulta de Guias; ícones na tela de emissão)
- **Imprimir guia:** `GET /arrecadacao/emissao/reimprimirGuia/{numero}`.
- **Relatório FGTS em PDF** (o "detalhe da guia"): `GET /cobranca/api/download/detalhe-guia-assincrono-pdf/{numero}?noloading&uuid={uuid}&primeiraChamada=true`, depois a mesma com `primeiraChamada=false`; no fim o arquivo vem de uma URL assinada em `https://storagegw.estaleiro.serpro.gov.br/cobrafgtsd-detalhe-guia-pdf-p/{raiz_cnpj}_{0numero}.pdf?response-content-disposition=...&X-Amz-...`.
- **Relatório FGTS em CSV:** `GET .../download/detalhe-guia-assincrono-csv/{numero}?noloading&uuid={uuid}`, mesma lógica, URL em `.../cobrafgtsd-detalhe-guia-csv-p/{raiz_cnpj}_{0numero}.zip`.
- Domínio do arquivo: `storagegw.estaleiro.serpro.gov.br`; `X-Amz-Expires` presente (valor não medido): baixar logo após obter a URL. Na tela de emissão, os dois ícones ao lado de "FGTS" baixam o relatório PDF e o CSV; a guia para pagamento é a reimpressão pelo número.
- **Não foi visto** um relatório separado de empréstimo consignado (ver "Em aberto" no desenho).

## 4. e-CAC / DCTFWeb: parcial, pausado
- Entrada: `https://cav.receita.fazenda.gov.br/autenticacao/login` → "Entrar com gov.br" (reaproveitou a sessão do FGTS Digital). Aviso de transição para o portal "Serviços da Receita Federal" (botão "Continuar no e-CAC por enquanto").
- **Alterar perfil de acesso:** Procurador de pessoa física (CPF), **Procurador de pessoa jurídica (CNPJ)**, CNPJ matriz atuando como CNPJ filial, Sucessor atuando como sucedida, CNPJ vinculado ao Ente Federativo. A troca recarrega o e-CAC; o cabeçalho passa a mostrar "Procurador de: {cnpj}".
- **Declarações e Demonstrativos → DCTF:** "Assinar e Transmitir DCTFWeb" (abre **nova aba**: escolha do certificado por cima e depois o captcha) e "Extrato do Processamento - DCTF". A dica do link: "entrega, retificação, geração do DARF e consultas da DCTFWeb".
- Captcha ao abrir a DCTFWeb com o perfil de procurador já definido; na segunda tentativa houve erro na tela do captcha e a aba fechou.
- **Caminho proposto pelo Josué, para depois:** entrar em "Assinar e Transmitir DCTFWeb" sem escolher perfil, habilitar a caixa que abre a barra de pesquisa, escolher as empresas e emitir em lote (evita um captcha a cada troca de perfil). Não testado.
- Não executados: consulta de declarações, saldo a pagar, emissão de DARF, comparação com o saldo, Sicalc.

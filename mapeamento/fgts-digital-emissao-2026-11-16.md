# FGTS Digital: rotas e campos da API para emissão de guia (Guia Rápida e Guia Parametrizada)

Data do levantamento: 16/11/2026
Telas:
* Guia Rápida (guia mensal da folha): `/cobranca/#/gestao-guias/emissao-guia-rapida`
* Guia Parametrizada: `/cobranca/#/gestao-guias/emissao-guia-parametrizada`
* Portal (troca de perfil): `/portal/servicos`

Método: observação das chamadas da tela com registrador de fetch e XHR (só formato dos campos, sem valores) e leitura do arquivo main do bundle JS (`/cobranca/main-XXXX.js`; o nome muda a cada versão).

Regras seguidas: nada foi emitido, nada foi pago, nenhuma API foi chamada por conta própria. Não constam aqui token, cookie, certificado, CPF, nomes de pessoa ou empresa, CNPJ real, número de guia real nem valores em reais.

Legenda de origem:
* OBSERVADO: visto na tela com o registrador ligado (método, rota, parâmetros, status e formato real da resposta).
* CÓDIGO: lido no bundle JS, não observado em execução.

---

## Parte A. Guia Rápida (guia MENSAL da folha)

### A.1 Chave das rotas (valorFiltro)

Quase todas as rotas usam um texto chamado valorFiltro, com 5 partes separadas por vírgula:

```
{dtCompetencia},{tipoDebito},{hashDebitos},{dtPagamento},{temConsignado}
```

* No débito mensal, tipoDebito é `mensal`.
* hashDebitos é um número de 11 dígitos gerado pelo servidor (vem pronto no campo valorFiltro de cada item de agrupamentos). Não é CPF.
* dtPagamento é a data de vencimento da guia (formato AAAA-MM-DD).
* temConsignado é `true` ou `false`.
* A rota que corrige agrupamento recebe essas 5 partes como parâmetros separados.

Bases de rota:
* `/cobranca/api/guia-rapida` (base da Guia Rápida)
* `/cobranca/api/guia-rapida/v2` (versão com consignado)
* `/cobranca/api/download` (PDF e CSV)
* `/cobranca/api/guia/{id}` (guia já gerada)

### A.2 Fluxo da tela, na ordem

1. Carrega a lista de folhas (competências disponíveis). A primeira vira a competência selecionada.
2. Ao pesquisar, chama os débitos da competência com os tipos marcados (mensal, rescisorio, processoTrabalhista, consignado).
3. Para cada agrupamento, busca guias relacionadas (guias já emitidas aguardando pagamento).
4. Ao clicar no olho (Detalhe da Guia a Ser Emitida), chama a prévia: totalizador, debitos, consignados e, ao expandir uma linha, detalhes-debito.
5. Ao clicar em Emitir guia (NÃO foi clicado), a tela:
   1. chama `GET confirma`;
   2. se houver alerta com código COB0027 sem confirmação, mostra o alerta e interrompe;
   3. se houver itens em `confirmacoes`, pede confirmação de cada um;
   4. se existir `guiaExistente`, chama `verificar-debitos-guia-existente` e, se válida, baixa a guia existente em vez de emitir outra;
   5. caso contrário, chama `POST gerar-guia` com um uuid v4 gerado no navegador;
   6. se a resposta vier com gerouGuia falso, repete a mesma chamada (mesmo uuid, primeiraChamada false), com espera que sobe 2 segundos a cada tentativa até o máximo de 30 segundos;
   7. quando gerouGuia vem verdadeiro, baixa o PDF pelo link da guia.

### A.3 Rotas

#### A.3.1 Lista de folhas (competências). Origem: CÓDIGO

```
GET /cobranca/api/guia-rapida/
```

Resposta: lista de objetos com `id` (competência, por exemplo AAAAMM; no 13º o final é 13), `competencia`, `datahora`, `recibo`. O código acrescenta `decimoTerceiro` no navegador (não vem da API). O primeiro item da lista é a competência selecionada por padrão. Os tipos dos campos não foram observados.

#### A.3.2 Débitos da competência (com consignado). Origem: OBSERVADO, status 200

```
GET /cobranca/api/guia-rapida/v2/{competencia}
```

Parâmetros de query: `mensal`, `rescisorio`, `processoTrabalhista`, `consignado` (booleanos). O consignado vem sempre marcado e bloqueado na tela.

Resposta:
```
resumo
  id: string (competência)
  competencia: string (competência)
  status: string (valor visto: "Aberta")
  vlTotal: number
agrupamentos[]
  valorFiltro: string
  tipo: string (valor visto: "Mensal")
  pagamentoAte: string
  detalhamentos[]
    pagamentoAte: string (data)
    competencia: string (competência)
    competenciaAnterior: string
    vencimento: string
    qtdTrabalhadores: number
    vlMensal: number
    vlRescisorio: number
    vlCompensatorio: number
    vlEncargos: number
    vlProcessoTrabalhista: number
    vlAtualizacaoMonetaria: number
    vlJuros: number
    vlMulta: number
    vlTotal: number
  totalizador
    vlMensal, vlRescisorio, vlCompensatorio, vlEncargos,
    vlProcessoTrabalhista, vlAtualizacaoMonetaria, vlJuros, vlMulta, vlTotal: number
  recuperouEncargos: boolean
  temGuiasRelacionadas: boolean
  guiaEmProcessamento: string
  guiaExistente
    id: string
    numero: string
    linkPdf: string
  alertas[]
    tipo: string (valor visto: "warn")
    codigo: string
    titulo: string
    descricao: string
  confirmacoes[]: string
  totalConsignado: number
  totalGuia: number
  contemConsignado: boolean
  qtdTrabalhadoresConsignado: number
```

Versão antiga (CÓDIGO, não usada pela tela atual): `GET /cobranca/api/guia-rapida/{competencia}` e `GET /cobranca/api/guia-rapida/{competencia}/{tipo}`.

#### A.3.3 Guias relacionadas. Origem: OBSERVADO, status 200

```
GET /cobranca/api/guia-rapida/agrupamento/{valorFiltro}/guias-relacionadas
```

Parâmetro de query: `noloading` (sem valor, só controla o indicador de carregamento da tela).

Resposta: lista de objetos
```
numeroFormatado: string
linkGuiaPdf: string
idGuia: number
```

#### A.3.4 Confirma acesso. Origem: CÓDIGO

```
GET /cobranca/api/guia-rapida/confirma
```

Chamada antes de emitir. O corpo da resposta não é usado, só o sucesso da chamada.

#### A.3.5 Verificar débitos de guia existente. Origem: CÓDIGO

```
GET /cobranca/api/guia-rapida/verificar-debitos-guia-existente/{valorFiltro}
```

Parâmetro de query: `noloading`. Resposta: boolean (true quando os débitos da guia existente continuam válidos). Em erro, a tela trata COB0010 e COB0020.

#### A.3.6 Corrigir agrupamento. Origem: CÓDIGO

```
GET /cobranca/api/guia-rapida/agrupamento/corrigir
```

Parâmetros de query: `uuid`, `dtCompetencia`, `tipoDebito`, `hashDebitos`, `dtPagamento`, `temConsignado`, `noloading`. O formato da resposta não foi observado.

#### A.3.7 Emitir guia (NÃO executado). Origem: CÓDIGO

```
POST /cobranca/api/guia-rapida/gerar-guia/{valorFiltro}
```

Parâmetros de query: `uuid` (v4 gerado no navegador, repetido nas retentativas), `primeiraChamada` (true na primeira chamada, false nas repetições), `noloading`.
Corpo: `{}` (objeto vazio).

Resposta esperada (deduzida do uso no código, não observada):
```
gerouGuia: boolean
dadosGuia
  id, numero, linkPdf
```

Retentativa: enquanto gerouGuia for falso, a tela repete o POST com o mesmo uuid e primeiraChamada false. A espera começa em 2 segundos e soma 2 segundos a cada tentativa, até 30 segundos.

Download da guia: `GET {linkPdf}` (a tela acrescenta o parâmetro `isConsignado` com valor true quando a guia é de consignado), resposta em blob, enviando credenciais. O nome do arquivo salvo é o número da guia com extensão .pdf.

#### A.3.8 Prévia e detalhe em PDF ou CSV. Origem: CÓDIGO

Antes da guia gerada:
```
GET /cobranca/api/download/previsualizar/detalhe-guia-rapida-pdf/{valorFiltro}
GET /cobranca/api/download/previsualizar/detalhe-guia-rapida-csv/{valorFiltro}
GET /cobranca/api/download/previsualizar/consignado-guia-rapida-pdf/{valorFiltro}
```

Depois da guia gerada:
```
GET /cobranca/api/download/detalhe-guia-assincrono-pdf/{valorFiltro}
GET /cobranca/api/download/detalhe-guia-assincrono-csv/{valorFiltro}
GET /cobranca/api/download/consignado-guia-assincrono-pdf/{valorFiltro}
```

Parâmetros de query: `uuid` (v4), `primeiraChamada` (true ou false), `noloading`.
Resposta: `gerouDetalheGuia` (boolean), `url`, `nomeArquivo`. Enquanto gerouDetalheGuia for falso, a tela repete com o mesmo uuid (mesma lógica de espera crescente, até 30 segundos). Quando verdadeiro, baixa `url` salvando como `nomeArquivo`.

#### A.3.9 Prévia da guia a ser emitida (ícone de olho, sem guia gerada). Origem: OBSERVADO, todas GET com status 200

Base: `/cobranca/api/guia-rapida/previsualizar/{valorFiltro}`

**/totalizador** (sem parâmetros)
```
competencia: string (competência)
pagamentoAte: string
qtdTrabalhadores: number
vlMensal, vlRescisorio, vlCompensatorio, vlProcessoTrabalhista,
vlEncargos, vlAtualizacaoMonetaria, vlJuros, vlMulta, vlTotal: number
qtdAgrupamentos: number
tpSituacao: string
dtArrecadacao: string
vlArrecadado: number
nrAutenticacao: string
gerouPdf: boolean
urlPdf: string
nomeArquivoPdf: string
gerouCsv: boolean
gerouPdfConsignado: boolean
vlTotalGuiaFgtsConsignado: number
vlSomenteConsignado: number
vlReclamatoriaTrabalhista: number
vlIndenizacaoCompensatoriaTrabalhista: number
tpGuia: string
```

**/debitos**. Parâmetros de query: `num-pagina`, `tam-pagina`, `campo-ordem`, `ordem`.
```
competencia: string (competência)
tpAgrupamento: string
pagamentoAte: string
numero: string
nrInscricaoUsuario: string
nmUsuario: string
dtEmissaoGuia: string
dhIndividualizacao: string
debitos[]
  competenciaApuracao: string (competência)
  competenciaAnterior: string
  vencimento: string
  nomeTrabalhador: string
  cpfTrabalhador: number
  vlMensal, vlRescisorio, vlCompensatorio, vlProcessoTrabalhista,
  vlEncargos, vlAtualizacaoMonetaria, vlJuros, vlMulta, vlTotal: number
  detalhes[]: (veio vazio)
```
Não há campos de paginação no objeto de resposta.

**/consignados**. Parâmetros de query: `num-pagina`, `tam-pagina`, `campo-ordem`, `ordem`.
```
competencia: string (competência)
tpAgrupamento: string
pagamentoAte: string
numero: string
nrInscricaoUsuario: string
nmUsuario: string
dtEmissaoGuia: string
dhRecebimentoConsignadoCaixa: string
consignados[]: (veio vazio, campos dos itens não observados)
qtdConsignados: number
vlTotalConsignado: number
dhArrecadacao: string
```

**/detalhes-debito** (disparada ao expandir uma linha). Parâmetros de query: `dtVencimento`, `cpfTrabalhador`. No código, também aceita `competenciaReferencia`.
Resposta: lista de objetos
```
competenciaApuracao: string (competência)
competenciaAnterior: string
vencimento: string
nomeTrabalhador: string
cpfTrabalhador: number
matricula: string
linkFichaFinanceira: string
situacaoIC: string (veio vazio, nenhum código de situação visto)
vlMensal, vlRescisorio, vlCompensatorio, vlProcessoTrabalhista,
vlEncargos, vlAtualizacaoMonetaria, vlJuros, vlMulta, vlTotal: number
idsParcelamento[]: (veio vazio)
```

#### A.3.10 Detalhe de guia já gerada. Origem: CÓDIGO

Base: `/cobranca/api/guia/{id}`

```
GET /cobranca/api/guia/{id}/totalizador
GET /cobranca/api/guia/{id}/debitos          (num-pagina, tam-pagina, campo-ordem, ordem)
GET /cobranca/api/guia/{id}/detalhes-debito  (competenciaApuracao, competenciaReferencia, dtVencimento, cpfTrabalhador)
GET /cobranca/api/guia/{id}/consignados      (num-pagina, tam-pagina, campo-ordem, ordem)
```

Os formatos de resposta devem ser iguais aos da prévia (A.3.9), mas isso não foi observado. Valores padrão do código: campo-ordem `competenciaAnterior`, ordem `desc`.

---

## Parte B. Guia Parametrizada

Base: `/cobranca/api/guia-parametrizada`. Todas as rotas desta parte vêm do CÓDIGO, exceto onde marcado OBSERVADO. Nenhuma foi vista com débito real em execução.

### B.1 Fluxo da tela (4 etapas)

1. Selecionar Débitos FGTS (pesquisa e Adicionar à guia).
2. Selecionar Débitos Consignado.
3. Definir Vencimento (revisão com a data de pagamento).
4. Emitir Guia.

### B.2 Etapa 1: pesquisa e carrinho

**Pesquisa de débitos. Origem: OBSERVADO (parâmetros e formato da resposta), status 200**

```
GET /cobranca/api/guia-parametrizada/debitos
```

Parâmetros de query, pelo nome: `debitosMensais`, `debitosRescisorios`, `debitosProcessoTrabalhista`, `debitosAVencer`, `debitosVencidos`, `debitosNaoParcelados`, `debitosParcelados`, `debitosSemGuia`, `somenteVinculoDesligadoAntecipacao`, `competenciaApuracaoInicial`, `competenciaApuracaoFinal`, `dtVencimento`, `numPagina`, `tamPagina`, `nrProcessoTrabalhista`, `tpEstabelecimentoRemuneracao`, `nrEstabelecimentoRemuneracao`, `tpTomadorServicos`, `nrTomadorServicos`, `tpLocalTrabalho`, `nrLocalTrabalho`, `lotacaoTributaria`, `cpfTrabalhador`, `matricula`, `cdCategoria`.

Regras do filtro:
* Só vão os campos com valor verdadeiro. Um booleano falso (como `somenteVinculoDesligadoAntecipacao`) não vai na query.
* Competência (`competenciaApuracaoInicial` e `competenciaApuracaoFinal`): 6 dígitos no formato AAAAMM (por exemplo, a de outubro de 2026 vai como 202610).
* `dtVencimento`: AAAA-MM-DD.
* `nrEstabelecimentoRemuneracao`, `nrTomadorServicos`, `nrLocalTrabalho`: só letras e números, sem pontuação (função de limpeza do código). O tipo vai em `tp...` (CNPJ, CAEPF ou CNO; no tomador, CNPJ, CPF ou CNO).
* Para a guia mensal: só `debitosMensais` marcado.

Resposta:
```
debitos[]
qtdeTotalDebitos: number
qtdeTotalDebitosNaGuia: number
resumoSelecao
  recuperouEncargos: boolean
  qtdeTotal: number
  qtdeTrabalhadores: number
  vlTotalPrincipal, vlTotalAtualizacaoMonetaria, vlTotalMulta,
  vlTotalJuros, vlTotalEncargos, vlTotal: number
  qtdeTotalConsignado, qtdeTrabalhadoresConsignado: number
  vlTotalConsignado, vlTotalGuia: number
```

Colunas de cada débito (pelo código): `guiasExistentes`, `parcelamentosExistentes`, `pendenciaFichaFinanceira`, `competenciaApuracao`, `competenciaReferencia`, `dtVencimento`, `origem`, `cpfTrabalhador`, `matricula`, `estabalecimentoRemuneracao` (grafia do código, sem o "e" depois do "b"), `lotacaoTributaria`, `nrProcessoTrabalhista`, `tomadorServicos`, `localTrabalho`, `codigoCategoria`, `tpRemuneracao`, `vlPrincipal`, `vlAtualizacaoMonetaria`, `vlMulta`, `vlJuros`, `vlTotal`. O id de cada débito vem em `id`.

**Adicionar à guia. Origem: CÓDIGO**

```
POST /cobranca/api/guia-parametrizada/debitos
```

Corpo: `{ filtro, inclusao, excecao }`
* Marcou só alguns: `{ filtro: null, inclusao: [ids], excecao: [] }`.
* Marcou "selecionar todos": `{ filtro: <mesmo objeto de filtro da pesquisa>, inclusao: [], excecao: [] }`.
* Marcou todos e desmarcou alguns: os ids desmarcados vão em `excecao`. Se `excecao` cobrir tudo, `filtro` volta a `null`.
* Desmarcou "todos": o corpo vira `{ inclusao: [], excecao: [] }`, sem a chave `filtro`.

Resposta usada pela tela: `qtdeTotal`, `qtdeTrabalhadores`, `vlTotalPrincipal`.

**Encargos. Origem: OBSERVADO (rota, parâmetros e chaves da resposta)**

```
GET /cobranca/api/guia-parametrizada/debitos/encargos
```

Parâmetros de query: `uuid`, `noloading`, `dtPagamento` (AAAA-MM-DD, opcional, usado na etapa 3).

O `uuid` NÃO vem de nenhuma resposta: é um UUID v4 gerado no navegador. A tela repete a chamada com o mesmo uuid enquanto a resposta não trouxer `recuperouEncargos: true`, com espera de 2 s subindo 2 s até 30 s.

Resposta:
```
recuperouEncargos: boolean
qtdeTotal, qtdeTrabalhadores: number
vlTotalPrincipal, vlTotalAtualizacaoMonetaria, vlTotalMulta,
vlTotalJuros, vlTotalEncargos, vlTotal: number
qtdeTotalConsignado, qtdeTrabalhadoresConsignado: number
vlTotalConsignado, vlTotalGuia: number
```

**Outras rotas do carrinho**

```
GET    /debitos/limpar                      (botão Reiniciar. OBSERVADO: status 204, sem corpo)
DELETE /debitos/{id}                        (excluir um débito, param noloading)
PUT    /debitos/alterar-saldo/{id}          corpo { vlSaldoAlterado, vlSaldoOriginal }
PUT    /debitos/restaurar-saldo-original/{id}   corpo {}
DELETE /consignados/{id}
GET    /dados-filtro                        (competencias[] com id AAAAMM, categorias[], guiaEmProcessamento)
GET    /dados-filtro-consignado             (competencias[])
GET    /consignados                         (pesquisa de consignados, mesmos filtros)
GET    /consignados/detalhe
```

Observação: depois do "Reiniciar", débitos que antes estavam no carrinho podem não voltar à lista (provavelmente por já terem guia emitida). Não fazer isso sem avisar o usuário.

### B.3 Etapa 2: consignados

```
POST /cobranca/api/guia-parametrizada/consignados:batch-create
```

Corpo: `{ filtro, ids, fgts }`
* `ids`: lista de ids de consignado.
* `fgts`: booleano (na carga da etapa vira o contrário de "passoAnteriorRevisarSelecao"; ao selecionar vira `false`).
* `filtro`: `null` ou `{ ...filtros do consignado, competenciaApuracaoInicial, competenciaApuracaoFinal, cpfTrabalhador, matricula, semGuiaEmitida, excecaoIds: [] }`.
* Estado inicial padrão: `{ ids: [], filtro: null, fgts: null }`.

A resposta é ignorada pela tela.

### B.4 Etapa 3: definir vencimento

```
GET /cobranca/api/guia-parametrizada/debitos-revisao
```

Parâmetros: os do filtro (com `debitosSemGuia` falso), mais `dtPagamento` (AAAA-MM-DD), `uuid` (v4 do navegador) e `primeiraChamada` (true na 1ª vez, false nas repetições). Repete com o mesmo uuid até `recuperouEncargos` ser true (2 s, +2 s, até 30 s).

Resposta (chaves usadas pela tela):
```
recuperouEncargos: boolean
dataPagamentoSugerida: string
dadosDataPagamento
  dataLimite: string
  diasNaoUteis[]: string
encargos { vlTotalPrincipal ... }
debitos
  qtdeTotalDebitos: number
  debitos[]
```

```
GET /cobranca/api/guia-parametrizada/consignados-revisao
```

Parâmetros: filtro do consignado com `dtPagamento`, `campoOrdem`, `ordem`, `numPagina`, `tamPagina`.
Resposta: `consignadosGuiaParametrizada { totalItens, dados[] { consignado, guiasRelacionadas } }`.

```
GET /cobranca/api/guia-parametrizada/debitos-valorados     (mesmo filtro mais dtPagamento; resposta com debitos[])
GET /cobranca/api/guia-parametrizada/agrupamentos-carrinho (param opcional dtPagamento, AAAA-MM-DD)
GET /cobranca/api/guia-parametrizada/verificar-debitos-guia-existente   (dtPagamento, hash)
```

`agrupamentos-carrinho`, resposta:
```
hash: (usado no gerar-guia)
agrupamentoDebito
  agrupamentos[]  (colunas: parcelamentosExistentes, competenciaApuracao, competenciaReferencia,
                   dtVencimento, qtdTrabalhadores, vlMensal, vlRescisorio, vlIndenizacaoCompensatoria,
                   vlProcessoTrabalhista, vlEncargos, vlTotal)
  totalizador
  confirmacoes[]: string
  guiaExistente   (mesmo formato de dadosGuia)
  alertas[]       (objetos com codigo e campos de mensagem)
agrupamentoConsignado
  agrupamentoConsignado[]  (colunas: competencia, vencimento, qtdTrabalhadores, vlConsignado, vlTotal)
```

### B.5 Etapa 4: emitir (NÃO executado)

Ordem ao clicar em Emitir Guia:

1. `GET /cobranca/api/guia-rapida/confirma` (sem parâmetros; só o sucesso importa).
2. Se existir `guiaExistente`, a tela baixa essa guia (consulta antes `verificar-debitos-guia-existente`).
3. Se houver `confirmacoes` não respondidas, a tela abre cada pergunta (sim ou não) e só segue depois de todas respondidas. Um alerta com código COB0027 faz a tela pular as confirmações e emitir.
4. `POST /cobranca/api/guia-parametrizada/gerar-guia`, corpo `{}`, parâmetros de query:
   * `dtPagamento`: AAAA-MM-DD.
   * `uuid`: UUID v4 gerado no navegador (reutilizado nas repetições).
   * `tag`: texto do campo da tela ou, se vazio, a data e hora atuais no formato DD/MM/AAAA HH:mm; vai com encodeURIComponent.
   * `hash`: campo `hash` da resposta de `agrupamentos-carrinho`.
   * `noloading`.
5. Se a resposta não trouxer `gerouGuia` verdadeiro, repete o POST com o mesmo uuid em 2 s, depois 4 s, 6 s, até 30 s (sem limite de tentativas).
6. Com `gerouGuia` verdadeiro: `dadosGuia { id, numero, linkPdf }`. A tela baixa `GET {linkPdf}` com `isConsignado=true`, resposta em blob, e salva como `{numero}.pdf`.

Não foi encontrado captcha no código (nenhuma ocorrência).

Erros tratados: COB0010 (recarrega os agrupamentos e mostra a mensagem), COB0020 (reinicia o fluxo), COB0101 (falha ao carregar dados do filtro), COB0105 (não há consignado), COB0062 (erro no campo de valor ao alterar saldo de um débito).

### B.6 Downloads depois da emissão

```
GET /cobranca/api/download/detalhe-guia-assincrono-pdf/{dadosGuia.id}     (params uuid, noloading)
GET /cobranca/api/download/detalhe-guia-assincrono-csv/{dadosGuia.id}
GET /cobranca/api/download/consignado-guia-assincrono-pdf/{dadosGuia.id}
```

Resposta: `gerouDetalheGuia` (boolean), `url`, `nomeArquivo`. Enquanto falso, repete com o mesmo uuid (2 s, +2 s, até 30 s). Quando verdadeiro, baixa `url` com o nome de `nomeArquivo` (sem enviar credenciais). Na Guia Rápida esses mesmos caminhos levam também `primeiraChamada`.

Prévia antes de emitir:
```
GET /cobranca/api/download/previsualizar/detalhe-guia-parametrizada         (dtPagamento, uuid, hash, noloading)
GET /cobranca/api/download/previsualizar/detalhe-guia-parametrizada-csv
GET /cobranca/api/download/previsualizar/consignado-guia-parametrizada
```

### B.7 Rotas de detalhe da parametrizada (só referência)

```
GET /cobranca/api/guia-parametrizada/detalhe/totalizador   (dtPagamento, hash)
GET /cobranca/api/guia-parametrizada/detalhe/              (dtPagamento, numPagina, tamPagina, campoOrdem, ordem)
GET /cobranca/api/guia-parametrizada/detalhe-debito/       (dtPagamento, competenciaApuracao, competenciaReferencia, dtVencimento, cpfTrabalhador)
GET /cobranca/api/guia-parametrizada/consignados/detalhe   (dtPagamento, numPagina, tamPagina, campoOrdem, ordem)
```

---

## Parte C. Troca de perfil e autenticação

### C.1 Trocar Perfil (só existe em `/portal/servicos`). Origem: CÓDIGO

```
GET /proxy-api/v2/ni       params: tipoPerfil, niPerfil     (devolve o nome do NI; a tela guarda em cookie por 30 minutos)
GET /proxy-api/v2/perfil   params: tipoPerfil, niPerfil, senha (a senha só vale para perfis administrativos)
```

Resposta de `v2/perfil`: `valido` (boolean) e `mensagem`. Se `valido` for verdadeiro, a página recarrega (o servidor guarda a empresa escolhida na sessão). Por isso o registrador se perde nessa troca.

`tipoPerfil`: 1 Meu Perfil, 2 Procurador, 3 Representante Legal perante a RFB, 9 Teste Serpro, 10 Outros, 13 Usuário por Determinação Judicial, 14 Administrador. Perfis de atendimento: 11, 12, 15, 16, 17, 18 e 19.

`niPerfil`: o CNPJ ou CPF só com dígitos. O NI do usuário logado só pode ser usado com Meu Perfil.

O FGTS Digital recusa a troca de perfil para filial de empresa privada: usar sempre a matriz (ela traz os débitos de todos os estabelecimentos).

### C.2 Autenticação. Origem: CÓDIGO

* Sessão por cookies (`withCredentials`).
* Chamadas que alteram dados (POST, PUT, DELETE) usam a proteção padrão do Angular: o cookie `XSRF-TOKEN` volta no cabeçalho `X-XSRF-TOKEN`.
* Não há cabeçalho de autorização.
* Resposta 401 significa sessão expirada. Nunca anotar valores de cookie ou cabeçalho.
* O interceptor da tela só liga e desliga o indicador de carregando (`noloading` o evita) e mostra as mensagens de erro.

---

## Parte D. Mensagens e códigos

Formato do erro da API: corpo `{ mensagem: { codigo, titulo, tipo, descricao } }`.

| Código | Significado (inferido pelo uso no código, não de texto oficial) |
|---|---|
| COB0010 | A guia ou o débito mudou desde que a tela carregou. A tela recarrega e mostra a mensagem. |
| COB0012 | Falha na geração da prévia do detalhe em PDF. A tela recarrega a folha e mostra a mensagem. |
| COB0020 | Os débitos da guia existente não estão mais disponíveis. A tela reinicia e mostra a mensagem. |
| COB0027 | Alerta que a tela trata antes da emissão (vem em `alertas`). Na Guia Rápida, enquanto não for tratado, a tela não emite. Na parametrizada, o código lido pula as confirmações e segue. Conferir os dois lados. |
| COB0062 | Erro no campo de valor ao alterar o saldo de um débito (parametrizada). |
| COB0101 | Erro ao carregar `dados-filtro` (parametrizada). |
| COB0105 | Não há consignado (parametrizada). |
| COB0063, COB0066, COB0306 | Aparecem no código, significado não lido. |

Códigos de situação vistos: `status` do resumo "Aberta"; `tipo` de agrupamento "Mensal"; `tipo` de alerta "warn". `situacaoIC` e `tpSituacao` não trouxeram valores nesta amostra.

---

## Parte E. O que NÃO foi visto

1. Resposta real do POST de emitir guia (Guia Rápida e Parametrizada): só o que o código indica.
2. Corpo e resposta reais do POST de Adicionar à guia, de `consignados:batch-create`, de `debitos-revisao`, `consignados-revisao` e `agrupamentos-carrinho`: faltou empresa de teste com débito em aberto.
3. Resposta real de `dados-filtro` e de `dados-filtro-consignado` (só as chaves usadas no código).
4. Resposta da lista de folhas da Guia Rápida e os tipos dos campos.
5. Formato dos itens de `consignados[]`, `detalhes[]` e `idsParcelamento[]`.
6. Resposta de `corrigir` e de `confirma`.
7. Valores possíveis de `situacaoIC` e `tpSituacao`.
8. Formato real do estabelecimento da remuneração na resposta (14 dígitos com ou sem pontuação). O filtro sai sem pontuação; a grade usa a coluna `estabalecimentoRemuneracao` sem máscara no código.
9. Domínio do arquivo do PDF e título dentro do PDF (dependem do valor de `url` e de uma guia real).
10. Rotas de guia gerada (`/cobranca/api/guia/{id}/...`): devem espelhar a prévia, mas não foram observadas.
11. Troca de perfil: só lida no código (a página recarrega e o registrador se perde).

Para fechar essas lacunas é preciso: uma empresa com débito mensal em aberto (e, se houver, uma com filial e uma com consignado), e uma guia já emitida para abrir o PDF pela consulta, sem emitir nada.

---

## Parte F. Cuidados ao automatizar e ao levantar

* Confirmar antes qual tela e qual tipo de débito o usuário usa. O fluxo mensal da folha é a Guia Rápida; a Guia Parametrizada é outra tela, com carrinho.
* Nunca clicar em Emitir Guia, nunca pagar e nunca chamar a API por conta própria durante o levantamento.
* A ferramenta de JavaScript do navegador do assistente bloqueia saída que pareça query string. Não contornar trocando caracteres. O caminho seguro é ler o arquivo main salvo localmente (o ambiente em nuvem não alcança o domínio do FGTS Digital).
* O Angular da tela usa XHR; o registrador precisa cobrir XHR e fetch. Navegar por hash dentro de `/cobranca` mantém o registrador; trocar de perfil ou de `/portal` para `/cobranca` o perde. Reinstale.
* Para ver o formato de um parâmetro sem expor valor, gravar só o valor mascarado (dígitos viram 9) ou um teste booleano.
* O número de 11 dígitos dentro de valorFiltro é o hashDebitos, não é CPF.
* Uma automação precisa rodar dentro da sessão do navegador ou reproduzir os cookies e o cabeçalho X-XSRF-TOKEN.
* Nunca emitir guia sem conferir que todos os débitos são do CPF e da competência pedidos. Apenas emitir e baixar, nunca efetuar pagamento.

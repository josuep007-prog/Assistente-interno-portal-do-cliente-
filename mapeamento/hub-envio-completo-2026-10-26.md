# Envio completo ao Control Hub (0.52.0, 26/10/2026)

O que a extensão entrega ao Hub, como e onde cada conjunto fica. Serve de base para definir **como cada conjunto alimenta cada módulo do Hub** (próxima etapa).

## Protocolo (ponte → Hub, `postMessage`)

Mesmo da ponte de 0.36.0 (`{ctlhub:1, de:'ext', tipo:'lote', id, token, ...}` e `ack`), com os campos novos de partes:

| Campo | Para quê |
|---|---|
| `fonte` | sempre `onvio` |
| `tipoDado` | nome do conjunto em minúsculas e hífens (`lista-geral`, `clientes-cnd`…); o resumo antigo continua `solicitacoes` |
| `categoria` | `listas`, `clientes`, `escritorio`, `documentos`, `noticias` ou `pessoais` |
| `colunas` | cabeçalho (até 80) |
| `tabela` | linhas desta parte: tab entre colunas, `\n` entre linhas (sem tab nem quebra dentro da célula) |
| `parte`, `partes`, `ciclo` | índice (0…n-1), total e identificador da remessa |
| `nLinhas`, `nLinhasTotal`, `totalNaOrigem`, `cortado` | linhas desta parte, do conjunto, no Onvio e se foi cortado |
| `titulo`, `usuario`, `extraidoEm`, `versaoExt`, `porTipo` | descrição e origem |

Até 150 mil caracteres por parte (a extensão manda até 140 mil) e até 80 partes por conjunto.

## Onde fica no Hub

- **Manifesto**: `ing_dados/onvio~<tipoDado>` com `categoria`, `titulo`, `colunas`, `nLinhas`, `totalNaOrigem`, `cortado`, `partes`, `slot` (`a` ou `b`), `ciclo`, `recebidoEm`, `extraidoEm`, `usuario`, `por`, `versaoExt`.
- **Partes**: `ing_partes/onvio~<tipoDado>~<slot><n>` com `{ ciclo, parte, tabela }`.
- **Troca sem meio-termo**: a remessa nova é escrita no slot livre e só depois o manifesto passa a apontar para ele; a remessa velha é apagada em seguida. Quem lê um manifesto sempre encontra todas as partes dele.
- O resumo das pendentes continua em `ing_lotes/onvio~solicitacoes` (único documento), que o módulo DP já usa.
- Tela **Entrada de dados** do Hub: lista os conjuntos (categoria, linhas, partes, quando) e deixa a coordenação descartar um conjunto.

## Como ler uma remessa (módulos)

1. Ler `ing_dados/onvio~<tipo>`; 2. ler as `partes` documentos `ing_partes/onvio~<tipo>~<slot><0..partes-1>`; 3. juntar as `tabela` com `\n`; 4. cada linha: `split('\t')` na ordem de `colunas`.

## Quando a extensão envia

- **Enviar tudo agora** (Configurações → Control Hub): manda tudo que está marcado, sempre.
- **Automático**: quando o Hub aparece numa aba, e a cada hora a extensão confere se já passou `syncHoras` (6) desde o último envio completo; só com o Hub aberto. O que não mudou nas últimas 24 horas não é reenviado.
- Um conjunto que falha não derruba os outros; o resultado de cada um fica em `hubSync` (só nomes e contagens).

## Segurança

Veja a exceção no `CLAUDE.md`. Resumo: tudo lido na hora, nada guardado na extensão; só GET; da sessão do Onvio saem só permissões, nomes de funcionalidades e o host de cada serviço (nunca `UdsSession`, tokens ou cookies); a categoria `pessoais` vem desligada e pede confirmação.

## Conjuntos (36)

Colunas geradas a partir do código (`OC.hubPlano`). Listas sem dados pessoais usam `lista-*`; os dados pessoais das mesmas solicitações ficam em `pessoais-*`, ligados pela coluna **Id** (e **Nº**).

### Solicitações completas (`listas`)

As 10 listas inteiras (não só as pendentes): situação, datas, cliente, responsável, departamento e campos de cada tipo. Sem dados pessoais.

- **`lista-geral`** · Solicitações · Geral (todas)
  Colunas (21): Id · Nº · Tipo · Situação · Código da situação · Vez · Aberta em · Alterada em · Último trâmite · Expectativa do cliente · Meio · Cliente · Apelido · Código do cliente · Id do cliente · Cliente usa o Onvio · Cliente envia eSocial · Cliente cadastra empregado · Responsável · Id do responsável · Departamento (id)
- **`lista-cad-empregado`** · Solicitações · Cadastro empregado (todas)
  Colunas (35): Id · Nº · Tipo · Situação · Código da situação · Vez · Aberta em · Alterada em · Último trâmite · Expectativa do cliente · Meio · Cliente · Apelido · Código do cliente · Id do cliente · Cliente usa o Onvio · Cliente envia eSocial · Cliente cadastra empregado · Responsável · Id do responsável · Departamento (id) · Admissão ou início · Fim · Fim da prorrogação · Categoria eSocial · Tipo de cadastro · Situação do cliente (código) · Vínculo · Jornada diária · Jornada semanal · Jornada mensal · Dias de experiência · Dias de prorrogação · Primeiro emprego · Professor
- **`lista-cad-contribuinte`** · Solicitações · Cadastro contribuinte (todas)
  Colunas (35): Id · Nº · Tipo · Situação · Código da situação · Vez · Aberta em · Alterada em · Último trâmite · Expectativa do cliente · Meio · Cliente · Apelido · Código do cliente · Id do cliente · Cliente usa o Onvio · Cliente envia eSocial · Cliente cadastra empregado · Responsável · Id do responsável · Departamento (id) · Admissão ou início · Fim · Fim da prorrogação · Categoria eSocial · Tipo de cadastro · Situação do cliente (código) · Vínculo · Jornada diária · Jornada semanal · Jornada mensal · Dias de experiência · Dias de prorrogação · Primeiro emprego · Professor
- **`lista-cad-estagiario`** · Solicitações · Cadastro estagiário (todas)
  Colunas (35): Id · Nº · Tipo · Situação · Código da situação · Vez · Aberta em · Alterada em · Último trâmite · Expectativa do cliente · Meio · Cliente · Apelido · Código do cliente · Id do cliente · Cliente usa o Onvio · Cliente envia eSocial · Cliente cadastra empregado · Responsável · Id do responsável · Departamento (id) · Admissão ou início · Fim · Fim da prorrogação · Categoria eSocial · Tipo de cadastro · Situação do cliente (código) · Vínculo · Jornada diária · Jornada semanal · Jornada mensal · Dias de experiência · Dias de prorrogação · Primeiro emprego · Professor
- **`lista-aviso-ferias`** · Solicitações · Aviso de férias (todas)
  Colunas (26): Id · Nº · Tipo · Situação · Código da situação · Vez · Aberta em · Alterada em · Último trâmite · Expectativa do cliente · Meio · Cliente · Apelido · Código do cliente · Id do cliente · Cliente usa o Onvio · Cliente envia eSocial · Cliente cadastra empregado · Responsável · Id do responsável · Departamento (id) · Início das férias · Data do aviso · Data do pagamento · Dias de abono · Dias de férias
- **`lista-calc-ferias`** · Solicitações · Cálculo de férias (todas)
  Colunas (25): Id · Nº · Tipo · Situação · Código da situação · Vez · Aberta em · Alterada em · Último trâmite · Expectativa do cliente · Meio · Cliente · Apelido · Código do cliente · Id do cliente · Cliente usa o Onvio · Cliente envia eSocial · Cliente cadastra empregado · Responsável · Id do responsável · Departamento (id) · Início das férias · Paga abono · Paga a 1ª parcela do 13º antes · Dias de férias
- **`lista-aviso-rescisao`** · Solicitações · Aviso de rescisão (todas)
  Colunas (24): Id · Nº · Tipo · Situação · Código da situação · Vez · Aberta em · Alterada em · Último trâmite · Expectativa do cliente · Meio · Cliente · Apelido · Código do cliente · Id do cliente · Cliente usa o Onvio · Cliente envia eSocial · Cliente cadastra empregado · Responsável · Id do responsável · Departamento (id) · Data do aviso · Concedido por · Motivo (código)
- **`lista-calc-rescisao`** · Solicitações · Cálculo de rescisão (todas)
  Colunas (25): Id · Nº · Tipo · Situação · Código da situação · Vez · Aberta em · Alterada em · Último trâmite · Expectativa do cliente · Meio · Cliente · Apelido · Código do cliente · Id do cliente · Cliente usa o Onvio · Cliente envia eSocial · Cliente cadastra empregado · Responsável · Id do responsável · Departamento (id) · Data da rescisão · Data do aviso prévio · Motivo (código) · Tipo de aviso
- **`lista-afastamento`** · Solicitações · Afastamento (todas)
  Colunas (24): Id · Nº · Tipo · Situação · Código da situação · Vez · Aberta em · Alterada em · Último trâmite · Expectativa do cliente · Meio · Cliente · Apelido · Código do cliente · Id do cliente · Cliente usa o Onvio · Cliente envia eSocial · Cliente cadastra empregado · Responsável · Id do responsável · Departamento (id) · Data do afastamento · Tipo de afastamento (código) · Data da CAT
- **`lista-rubricas`** · Solicitações · Lançamento de rubricas (todas)
  Colunas (25): Id · Nº · Tipo · Situação · Código da situação · Vez · Aberta em · Alterada em · Último trâmite · Expectativa do cliente · Meio · Cliente · Apelido · Código do cliente · Id do cliente · Cliente usa o Onvio · Cliente envia eSocial · Cliente cadastra empregado · Responsável · Id do responsável · Departamento (id) · Competência · Tipo de lançamento · Detalha ausência · Detalha serviço

### Clientes (`clientes`)

Clientes de CND e de NF-e: nome, código, CNPJ/CPF, inscrições, UF e município, certificado.

- **`clientes-cnd`** · Clientes de CND
  Colunas (11): Id · Código · Cliente · Situação · CNPJ ou CPF · Inscrição municipal · Inscrição estadual · UF · Município (IBGE) · Tipo de documento · Usa o Onvio
- **`clientes-nfe`** · Clientes de NF-e
  Colunas (11): Id · Código · Cliente · Apelido · Ativo · Situação · CNPJ ou CPF · UF · Usa o Onvio · Tem certificado · Validade do certificado

### Escritório e acesso (`escritorio`)

Departamentos, seu acesso, tabelas de apoio, prescrição, conta, licenças, permissões, funcionalidades e serviços do Onvio. Sem tokens.

- **`escritorio-departamentos`** · Escritório · Departamentos
  Colunas (6): Id · Código · Nome · Padrão · Criado em · Alterado em
- **`escritorio-acesso`** · Escritório · Acesso do usuário
  Colunas (3): Usuário · Departamento do acesso (id) · Empresa (id)
- **`escritorio-tabelas`** · Escritório · Tabelas de apoio
  Colunas (4): Tabela · Código · Descrição · Detalhes
- **`escritorio-prescricao`** · Escritório · Prescrição
  Colunas (3): Origem · Prescreve pendentes com o cliente · Dias
- **`escritorio-conta`** · Escritório · Conta e configuração do escritório
  Colunas (3): Item · Valor · Detalhes
- **`escritorio-licencas`** · Escritório · Licenças
  Colunas (2): Funcionalidade · Recurso
- **`escritorio-permissoes`** · Escritório · Permissões do usuário
  Colunas (3): Grupo · Permissão · Valor
- **`escritorio-funcionalidades`** · Escritório · Funcionalidades do Onvio
  Colunas (1): Funcionalidade
- **`escritorio-servicos`** · Escritório · Serviços do Onvio
  Colunas (2): Serviço · Endereço (host)

### Documentos (`documentos`)

Árvore de pastas do Onvio Drive (nomes, contagens, datas, quem leu).

- **`documentos-pastas`** · Documentos · pastas
  Colunas (12): Id · Nome · Tipo · Documentos · Usuários que leram · Compartilhada · Tem arquivos · Tem pastas · Criada em · Alterada em · Criada por · Alterada por

### Notícias (`noticias`)

Artigos compartilhados com os clientes.

- **`noticias-artigos`** · Notícias compartilhadas
  Colunas (9): Id · Título · Chamada · Publicada em · Publicada · Visível · Destinatário · Situação · Conteúdo

### Dados pessoais (`pessoais`) — dados pessoais, desligada por padrão

CPF, salário, nomes de empregados, assunto e descrição de todas as solicitações, dados completos e trâmites das pendentes, comunicações. Fica no banco do Hub, visível a quem acessa o Hub.

- **`pessoais-geral`** · Dados pessoais · Geral
  Colunas (5): Id · Nº · Assunto · Descrição · Solicitante
- **`pessoais-cad-empregado`** · Dados pessoais · Cadastro empregado
  Colunas (12): Id · Nº · Assunto · Descrição · Solicitante · Nome · Nome social · CPF · Salário · Observações · Matrícula · Cartão de ponto
- **`pessoais-cad-contribuinte`** · Dados pessoais · Cadastro contribuinte
  Colunas (12): Id · Nº · Assunto · Descrição · Solicitante · Nome · Nome social · CPF · Salário · Observações · Matrícula · Cartão de ponto
- **`pessoais-cad-estagiario`** · Dados pessoais · Cadastro estagiário
  Colunas (12): Id · Nº · Assunto · Descrição · Solicitante · Nome · Nome social · CPF · Salário · Observações · Matrícula · Cartão de ponto
- **`pessoais-aviso-ferias`** · Dados pessoais · Aviso de férias
  Colunas (13): Id · Nº · Assunto · Descrição · Solicitante · Empregado · CPF do empregado · Admissão do empregado · Situação do empregado · Sexo · Cargo (código) · Carga horária · Código do empregado
- **`pessoais-calc-ferias`** · Dados pessoais · Cálculo de férias
  Colunas (13): Id · Nº · Assunto · Descrição · Solicitante · Empregado · CPF do empregado · Admissão do empregado · Situação do empregado · Sexo · Cargo (código) · Carga horária · Código do empregado
- **`pessoais-aviso-rescisao`** · Dados pessoais · Aviso de rescisão
  Colunas (13): Id · Nº · Assunto · Descrição · Solicitante · Empregado · CPF do empregado · Admissão do empregado · Situação do empregado · Sexo · Cargo (código) · Carga horária · Código do empregado
- **`pessoais-calc-rescisao`** · Dados pessoais · Cálculo de rescisão
  Colunas (13): Id · Nº · Assunto · Descrição · Solicitante · Empregado · CPF do empregado · Admissão do empregado · Situação do empregado · Sexo · Cargo (código) · Carga horária · Código do empregado
- **`pessoais-afastamento`** · Dados pessoais · Afastamento
  Colunas (13): Id · Nº · Assunto · Descrição · Solicitante · Empregado · CPF do empregado · Admissão do empregado · Situação do empregado · Sexo · Cargo (código) · Carga horária · Código do empregado
- **`pessoais-rubricas`** · Dados pessoais · Lançamento de rubricas
  Colunas (5): Id · Nº · Assunto · Descrição · Solicitante
- **`pessoais-comunicacoes`** · Dados pessoais · comunicações
  Colunas (11): Id · Assunto · Cliente · Tipo · Situação · Situação da comunicação · Enviada em · Expira em · Visualizada · Destinatários · Criada por
- **`pessoais-pendentes-dados`** · Dados pessoais · dados completos das pendentes
  Colunas (6): Chave · Nº · Lista · Grupo · Campo · Valor
- **`pessoais-pendentes-tramites`** · Dados pessoais · trâmites das pendentes
  Colunas (10): Chave · Nº · Lista · Trâmite · Em · Situação · Vez · Autor · Texto · Anexos

## Limites e a confirmar

- Detalhes completos e trâmites: só das pendentes (até 300, as mais graves primeiro), uma leitura por item. As listas inteiras vêm de uma leitura por página de 200.
- Descrições, observações e textos de trâmites: até 1.500 caracteres, quebras de linha viram espaço.
- Comunicações do Drive (`pessoais-comunicacoes`) e a validade do certificado em `clientes-nfe`: formato **a confirmar** com dados reais (o inventário só viu os nomes dos campos e o certificado vazio).
- Empregados de cada cliente (`br-payroll-sr/v1/clients/{id}/employees`) **não** foram incluídos: seria uma leitura por cliente (mais de mil). Pode virar uma opção à parte.
- Gestta fora, por decisão do Josué (ainda sem formato).

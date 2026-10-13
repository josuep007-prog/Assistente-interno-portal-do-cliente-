# Mapeamento do Onvio Portal do Cliente

Base para a extensão de navegador que ajuda analistas e gestores do escritório no
uso e no controle do Portal do Cliente.

**Situação do mapeamento:** versão 0. Este documento junta o que já foi
observado em uso real (processos registrados entre 08/2026 e 09/2026). Os
seletores CSS, os endpoints de API e o formato das respostas ainda **não** foram
levantados. Para isso existe o script `capturar-mapa-onvio.js` (ver no fim).
Os itens marcados com ❓ são lacunas a confirmar na captura.

## 1. Aplicações e URLs

| Aplicação | URL base | Para que serve |
|---|---|---|
| Onvio Gestão (staff) | `https://onvio.com.br/staff/` | Tarefas, Documentos do Cliente (árvore de pastas), relatórios internos |
| Onvio Portal do Cliente | `https://onvio.com.br/br-portal-do-cliente/` | Solicitações de serviço, documentos, notícias, usuários de cliente |

Caminho até o portal: entrar no Onvio. Ele abre no Gestão. Menu sanduíche
(canto superior esquerdo) > **Portal do Cliente**, que abre em **aba nova**.

Rotas conhecidas do Portal do Cliente:

| Rota | Tela |
|---|---|
| `/br-portal-do-cliente/service-requesting/payroll-registration/employee` | Solicitações > Cadastro de Funcionários > Empregados |
| `/br-portal-do-cliente/settings/clients-users` | Configurações > Usuários de cliente |
| `/br-portal-do-cliente/settings/clients-users/edit/{guid}` | Edição de usuário de cliente (wizard de 5 etapas) |
| `/br-portal-do-cliente/reporting/users/client` | Relatórios > Usuários > Cliente (gera PDF) |
| ❓ | Rotas das demais listas de solicitação (Geral, Férias, Rescisão, Afastamento, Rubricas) |
| ❓ | Rotas de Documentos |

Endpoint conhecido: `GET /api/dominio/integration/v1/reports/client/user?status=Active&issueDate=<ISO>&timezone=-3`.
Ele devolve `application/pdf`. Isso sugere que as listas também carregam dados de
`/api/...` em JSON. ❓ Confirmar quais endpoints alimentam as listas.

## 2. Solicitações de Serviço

### 2.1 Estrutura do menu

Não é uma lista única. São **10 listas independentes**, cada uma com
contagem, paginação e filtros próprios:

```
Solicitações de Serviço
├── Geral
├── Cadastro de Funcionários
│   ├── Empregados        ← payroll-registration/employee
│   ├── Contribuintes
│   └── Estagiários
├── Férias
│   ├── Aviso Prévio de Férias
│   └── Cálculo de Férias
├── Rescisão
│   ├── Aviso Prévio de Rescisão
│   └── Cálculo de Rescisão
├── Afastamento de Empregado
└── Lançamento de Rubricas na Folha
```

### 2.2 Colunas por lista

| Lista | Colunas |
|---|---|
| Geral | ID, Situação, Último Trâmite, Departamento, Assunto, Apelido, Cliente, Responsável, Expectativa de Conclusão |
| Cadastro de Funcionários | ID, Situação, Último Trâmite, **Empregado**, **Data de admissão**, Apelido, Cliente, Responsável, Expectativa de Conclusão |
| Férias, Rescisão | ID, Situação, Último Trâmite, Empregado, Apelido, Cliente, Responsável, Expectativa de Conclusão |
| Afastamento, Rubricas | ❓ |

Coluna **Ações** em todas: ícone **"i"** abre o modal de visualização.

**Nenhuma lista mostra data de abertura nem data de conclusão.** Para tempo de
atendimento real é preciso abrir a aba Trâmites de cada solicitação.

### 2.3 Situações (variam por lista)

| Lista | Situações observadas | O que conta como "pendente" no filtro |
|---|---|---|
| Geral | Sem análise, Respondido, Em análise interna, Concluído, Prescrita | ❓ |
| Férias | idem | Sem análise |
| Cálculo de Rescisão | Aguardando resposta, Em análise, Concluído, Prescrita | inclui Aguardando resposta |
| Rubricas | idem Geral | inclui Respondido e Em análise |
| Cadastro (visão no Domínio) | "Enviado para o escritório" | ❓ |

**Prescrita** = mais de 30 dias sem resposta. Uma rotina noturna marca a
prescrição, com Último Trâmite entre 02:00 e 02:02. Nesses casos o Último Trâmite
mede a prescrição, não a inatividade. Algumas listas (Aviso Prévio de Férias)
têm itens "Sem análise" com mais de 120 dias que nunca prescreveram.

### 2.4 Filtros e paginação

* Ícone de filtro abre uma linha de filtro por coluna (Situação, Último Trâmite,
  Departamento, Assunto, Apelido, Cliente, Responsável, Expectativa).
* **Último Trâmite** filtra por **data exata**, não por intervalo. Um valor
  parcial ("07/2026") reseta o filtro sem aviso.
* **Departamento** tem entradas duplicadas ("PESSOAL" e "Pessoal (sistema)").
* **Apenas pendentes**: o checkbox só responde ao clique **no texto do rótulo**.
  Depois é preciso clicar em **Atualizar**. O estado **persiste entre listas**.
  **Não inclui Prescritas.**
* **Itens por página**: máximo 100. Campo **Ir a página**. Rodapé
  "Exibindo X a Y de N".
* **Exportar** gera .xlsx **só da página visível**, apenas com os campos de
  cabeçalho (sem descrição nem trâmites).
* Spinner de cerca de 1 s após cada ação.

### 2.5 Modal de visualização

"Visualização de Solicitação de Serviço" (ou "...de Cadastro" para Cadastro de
Funcionários). Tem duas abas:

* **DADOS DA SOLICITAÇÃO**: Departamento (selo "Departamento do Sistema",
  **inferido pelo responsável**, não escolhido pelo cliente), Cadastrado por,
  Assunto, Descrição, Meio de Solicitação, Anexos. Em Cadastro de Funcionários
  há sub-abas Geral, Profissionais, Pessoais, Dependentes e Observações.
* **TRÂMITES**: histórico `#01, #02...` com status, autor, data/hora e texto.
  Padrão comum: só "#01 Sem análise" e depois "Concluído" semanas depois, sinal de
  fila represada.

Fecha pelo botão **FECHAR** (canto superior direito).

### 2.6 Volumes (referência de 14/08/2026, acumulado)

| Lista | Total | Pendentes pelo filtro |
|---|---|---|
| Geral | 400 | 22 |
| Cadastro, Empregados | 1396 | 0 |
| Cadastro, Contribuintes | 2 | 0 |
| Cadastro, Estagiários | 79 | 0 |
| Férias, Aviso Prévio | 833 | 9 |
| Férias, Cálculo | 949 | 17 |
| Rescisão, Aviso Prévio | 562 | 0 (com prescritas escondidas) |
| Rescisão, Cálculo | 1025 | 9 (4 sem responsável) |
| Afastamento | 1344 | 0 |
| Rubricas | 1579 | 13 |

A lista Geral é menos de 6% do total. O relatório "Por Departamento" só cobre a
Geral. Os relatórios "Por Meio" e "Por Situação" não filtram por departamento.

## 3. Documentos

Menu **Documentos** com 5 guias:

| Guia | Quem vê | Uso |
|---|---|---|
| Documentos do Cliente | escritório + cliente | Pastas Globais, por Departamento e por Usuário do cliente. Recebe a integração com o Domínio |
| Documentos do Escritório | só escritório | Internos |
| Meus Documentos | só o funcionário | Pessoal |
| Lixeira | escritório | Restaurar, mostra quem excluiu e quando |
| Comunicações | escritório → cliente | Solicitar documentos, pedir aprovação, publicar para um cliente |

* Seletor **Cliente** no topo (busca por nome ou código). Árvore de pastas à
  esquerda e conteúdo à direita.
* **Novo** abre Pasta, Scan, Documento do Word e Planilha do Excel.
  **Gerenciar** abre Abrir, Excluir, Mover etc.
* Clicar no **nome** do PDF abre o visualizador inline. "Abrir" pede o
  aplicativo Onvio Link.
* Documentos com cadeado (bloqueados) existem. ❓ Regras.
* Pastas por ano são criadas automaticamente pelo sistema (`2026/01..12`).
* Padrão interno na pasta Pessoal: subpastas por tipo e, dentro delas,
  competência `MM-AAAA`.
* Arquivos até 500 MB. pdf, doc, txt, csv abrem no navegador. xls, zip e
  imagens só por download.
* O usuário de cliente com Departamento do Sistema habilitado recebe a pasta do
  departamento automaticamente. Pastas customizadas precisam de compartilhamento
  manual.
* ❓ A tela de Documentos existe nas duas URLs (`/staff` e `/br-portal-do-cliente`)?
  Confirmar qual o analista usa no dia a dia.

## 4. Usuários de cliente

`Configurações > Usuários de cliente`. O campo Cliente é obrigatório (o primeiro
clique após carregar costuma não registrar). O wizard tem 5 etapas: Geral,
Departamentos (DP01 a DP07 do sistema mais os customizados, toggle Habilitar,
nível Revisor/Contribuinte/Proprietário), Clientes, Permissões e Notificações.

## 5. Dores observadas, candidatas a funções da extensão

| # | Dor | Ideia para a extensão |
|---|---|---|
| 1 | 10 listas separadas, sem visão consolidada | Painel único com contagem de pendentes, prescritas e paradas por lista |
| 2 | "Apenas pendentes" esconde Prescritas e cada lista define pendência de um jeito | Situação normalizada (aberta / aguardando cliente / concluída / prescrita) |
| 3 | Sem data de abertura nem conclusão na lista | Ler os trâmites em segundo plano e mostrar "dias em aberto" e "dias sem movimento" |
| 4 | Filtro de data só exato, sem intervalo | Filtro por período e por "parado há mais de N dias" |
| 5 | Exportar só traz a página visível e só o cabeçalho | Exportar todas as páginas com campos de trâmite (CSV/XLSX) |
| 6 | Checkbox e itens por página difíceis de usar | Preferência fixa: 100 itens e pendentes sempre visíveis |
| 7 | Solicitações sem responsável | Destaque visual e lista "sem dono" |
| 8 | Gestor não vê carga por analista | Visão por responsável: abertas, média de dias e prescritas no mês |
| 9 | Documentos soltos fora do padrão de pastas | Verificador de padrão (Pessoal > tipo > MM-AAAA) por cliente |
| 10 | Departamento duplicado e inferido | Aviso visual quando o departamento diverge da categoria |

## 6. Próximo passo: captura

1. Abrir o portal logado, F12 > Console, colar `capturar-mapa-onvio.js`.
2. Navegar por todas as listas de 2.1 e pelas guias de Documentos. Abrir um modal
   e trocar Dados/Trâmites (com modal aberto, rodar `__mapaOnvio.capturar('modal')`).
   Usar filtro, paginação e "Apenas pendentes".
3. `__mapaOnvio.exportar()` e enviar o JSON.

Se a página recarregar (F5), o script se perde e precisa ser colado de novo. O que
já foi capturado também se perde, então exporte antes de recarregar.

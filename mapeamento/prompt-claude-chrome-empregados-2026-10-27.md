# Prompt para o Claude no Chrome: de onde sai a lista de empregados do Onvio

Uso: abra o Onvio (Portal do Cliente, visão do escritório, já logado) numa aba, abra o Claude no Chrome nessa aba e cole o texto entre as linhas. Troque os trechos `[ ... ]` antes de enviar. O objetivo é descobrir se o Onvio tem algum campo, rota ou tela que diga **quem foi desligado no Domínio**, porque a lista que a extensão lê (`br-payroll-sr/v1/clients/{id}/employees`) traz todos como `ACTIVE`.

Depois de rodar, cole a resposta na conversa com o Claude Code (a que mantém a extensão Control Onvio e o Control Hub).

---

Você vai me ajudar a investigar, **só lendo**, de onde o Onvio (Portal do Cliente do escritório ControlTax, visão do escritório, nesta aba, já logado) tira a lista de empregados de cada empresa cliente e se existe alguma informação de desligamento.

## Regras de segurança (obrigatórias)
1. **Só leitura.** Só faça requisições GET e só navegue/leia telas. Nunca use POST, PUT, PATCH ou DELETE. Nunca clique em Salvar, Enviar, Criar, Excluir, Aprovar, Importar, Sincronizar, Integrar nem em nada que altere dados. Não crie solicitação, trâmite, anexo nem responsável. Não mude configuração.
2. Não copie para a resposta: tokens, cabeçalhos de autorização (`Authorization`, `UdsSession`), cookies, CPF, salário, e-mail, telefone. Em nomes de empregados, use só os que eu listar abaixo. Para qualquer outro empregado, descreva só o formato (nomes de campos, tipos, contagens).
3. Se o Onvio pedir login ou der erro de sessão, pare e me avise. Não tente contornar.
4. Faça poucas chamadas, uma de cada vez, com uns 300 ms de pausa. Nada de varrer todas as empresas: use no máximo 3 empresas.
5. Se algo não puder ser verificado, diga "não consegui verificar" em vez de supor.

## Contexto que já conheço
- A extensão lê `GET /api/br-payroll-sr/v1/clients?itemsPerPage=100&pageIndex=N` (lista de clientes da folha) e, para cada cliente, `GET /api/br-payroll-sr/v1/clients/{id}/employees?eprType=EMPLOYEE&eprType=INTERN&expand=clientEmployeeRelationshipExpanded`. Cada empregado traz `id, name, cpf, hireDate, status, gender, jobPosition, employeeWorkload, integrationCode` e `clientEmployeeRelationshipExpanded.eprType`.
- Resultado de hoje: só 158 de 1.059 clientes devolvem empregados; **todos** vêm com `status = ACTIVE`; nas solicitações de rescisão o empregado também vem `ACTIVE`; ainda assim, 95% de quem teve rescisão não aparece mais na lista (então o Onvio retira boa parte, mas não todos).
- `integrationCode` é o código do empregado no Domínio.
- Meu problema: preciso de uma lista **fiel ao Domínio**; empregados já demitidos (às vezes sem passar pelo portal) aparecem como ativos.

## Empregados de teste (conhecidos por mim)
- Empresa: [nome da empresa e, se souber, o código]
- Demitidos no Domínio e que ainda aparecem como ativos: [nome 1], [nome 2], [nome 3]
- Ativos de verdade (controle): [nome 4], [nome 5]

## O que investigar (nesta ordem)

### A. Onde a tela mostra empregados
1. Navegue pelas telas do Onvio (Portal do Cliente, visão do escritório) que listam ou deixam escolher empregados de uma empresa: por exemplo, abrir uma solicitação existente de Aviso de férias, Cálculo de rescisão ou Cadastro de empregado, e olhar o campo "Empregado"; telas de cliente/empresa; qualquer área de "Folha", "Empregados" ou "Funcionários".
2. Em cada tela, anote: o caminho/URL da tela, se há filtro de situação (ativos, inativos, desligados), e se os empregados de teste aparecem.
3. Observe as chamadas de rede (somente as `/api/`) que cada tela faz para carregar empregados. Liste método, caminho com ids trocados por `{id}`, nomes dos parâmetros de query e status HTTP. Sem valores de ids, sem cabeçalhos.

### B. A rota que a extensão usa, com variações (só GET, em até 3 empresas)
Para a empresa de teste e mais uma empresa que hoje não devolve empregados (se houver), faça a chamada atual e as variações abaixo, e para cada uma informe: status HTTP, quantos empregados vieram e a contagem por valor de `status` (e por `eprType`):
1. `.../clients/{id}/employees` (sem parâmetros)
2. a chamada atual (`eprType=EMPLOYEE&eprType=INTERN&expand=clientEmployeeRelationshipExpanded`)
3. a mesma com `expand=all`
4. a mesma com `status=INACTIVE`, depois `status=TERMINATED`, depois `includeInactive=true`
5. com todos os `eprType` possíveis (veja a lista de valores na tela, se houver; senão tente `PARTNER`, `OTHER`)
6. o detalhe de um empregado: `.../clients/{id}/employees/{employeeId}?expand=all`
7. o detalhe do cliente: `.../clients/{id}` e, se existir, `.../clients/{id}/employees/count` ou similares
Para o item 6 e 7 liste só os **nomes dos campos e tipos** (incluindo aninhados, até 3 níveis). Destaque qualquer campo que lembre: situação, status, desligamento, rescisão, demissão, data de saída, inativo, integração, sincronização, última atualização.

### C. Os empregados de teste, um a um
Para cada nome que eu listei (e só para eles): onde aparece (telas e rotas), com que `status`, e se algum campo do detalhe indica desligamento. Se não aparece em lugar nenhum, diga onde procurou.

### D. Integração com o Domínio (por que só 158 de 1.059 empresas têm lista)
1. Procure nas telas de configuração do Onvio (visão do escritório) qualquer menção a integração com o Domínio, sincronização de empregados, importação da folha ou "cliente cadastra empregado". Só leia; não clique em Sincronizar/Integrar.
2. Anote o que a tela diz sobre **quando** e **como** os empregados chegam do Domínio (automático? só quando o cliente cadastra? só na admissão?) e se desligamentos são sincronizados.
3. Veja se existe campo no cliente (`/clients/{id}`) com data da última sincronização, integração ativa ou "usa o Onvio".

### E. Outras rotas candidatas (só GET, uma tentativa cada, em uma empresa)
Teste se existem (informe só o status HTTP e os nomes dos campos do primeiro item): `/api/br-payroll-sr/v1/employees?clientId={id}`, `/api/br-payroll-sr/v1/employees-registrations?...` (já conhecida), `/api/br-payroll-sr/v1/clients/{id}/terminations`, `/api/br-payroll-sr/v1/clients/{id}/employee-terminations`, `/api/core/v3/companies/{id}/employees/search` (esta é a **equipe do escritório**, não a folha do cliente: não confundir). Se a tela de rede mostrar outras rotas de empregados que eu não citei, liste-as também.

## Como responder
Entregue em português do Brasil, neste formato:
1. **Resposta curta (3 a 5 linhas):** existe ou não algum campo/rota/tela do Onvio que diga quem foi desligado? Se sim, qual.
2. **Tabela de rotas** testadas: método, caminho com `{id}`, parâmetros, status HTTP, quantidade de itens, observação.
3. **Campos de desligamento ou integração encontrados** (nome do campo, rota, valores distintos e contagens, intervalo de datas se for data).
4. **Os empregados de teste:** onde apareceram e com que dados (sem CPF).
5. **Sobre a integração com o Domínio:** o que as telas dizem (copie só o texto das telas, sem dados de clientes).
6. **O que não consegui verificar** e por quê.
Não envie nada além disso e não tome nenhuma ação fora do que está acima.

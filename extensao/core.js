/* Onvio Controle · núcleo (sem dependência de chrome.*)
 * Define self.OC com: tipos de solicitação, coleta, busca, regras de prazo.
 * Roda no service worker (importScripts) e também colado direto na página do Onvio para teste.
 */
(function (g) {
  'use strict';

  const ORIGIN = 'https://onvio.com.br';
  const API = ORIGIN + '/api/';
  const PORTAL = ORIGIN + '/br-portal-do-cliente/';

  // [rótulo, lado]  lado: esc = ação do escritório | cli = vez do cliente | fim = encerrada
  const ST_PADRAO = {
    1: ['Sem análise', 'esc'],
    2: ['Em análise', 'esc'],
    3: ['Aguardando resposta', 'esc'],
    4: ['Respondido', 'cli'],
    5: ['Concluído', 'fim'],
    6: ['Prescrita', 'fim'],
    7: ['Encaminhado para outro usuário', 'esc'],
    8: ['Em análise interna', 'esc'],
    9: ['Encaminhado', 'esc']
  };
  const ST_CADASTRO = {
    1: ['Sem análise', 'esc'],
    2: ['Enviado para o escritório', 'esc'],
    3: ['Aguardando o cliente', 'cli'],
    4: ['Respondido pelo cliente', 'esc'],
    5: ['Cadastro efetuado', 'cli'],
    6: ['Concluído', 'fim'],
    7: ['Encaminhado para outro usuário', 'esc']
  };
  const ST_RUBRICAS = {
    0: ['Sem análise', 'esc'],
    1: ['Sem análise', 'esc'],
    2: ['Em análise', 'esc'],
    3: ['Importação realizada', 'cli'],
    4: ['Respondido', 'cli'],
    5: ['Aguardando resposta', 'esc'],
    6: ['Aguardando correção', 'cli'],
    7: ['Em análise interna', 'esc'],
    8: ['Concluído', 'fim'],
    9: ['Encaminhado', 'esc'],
    10: ['Prescrita', 'fim'],
    11: ['Enviado para o escritório', 'esc'],
    12: ['Respondido pelo cliente', 'esc']
  };

  // pendentes: lista de códigos (filtro IN). excluir: pendente = qualquer código fora da lista
  // (filtro NE), que também pega códigos novos; se o Onvio recusar, volta para o IN. Em Rubricas o NE dá HTTP 500
  // no Onvio real (15/10/2026), por isso nenhuma família usa mais o NE.
  // clienteGrava: códigos de situação que um trâmite do CLIENTE grava (usado para achar o 1º trâmite do escritório).
  const FAMILIAS = {
    padrao: { st: ST_PADRAO, pendentes: '1,2,3,4,7,8,9', prescreve: true, clienteGrava: [1, 3] },
    cadastro: { st: ST_CADASTRO, pendentes: '1,2,3,4,5,7', prescreve: false, clienteGrava: [1, 2, 4] },
    rubricas: { st: ST_RUBRICAS, pendentes: '0,1,2,3,4,5,6,7,9,11,12', prescreve: true, clienteGrava: [0, 1, 11, 12] }
  };
  const DESCONHECIDO = code => ['Situação desconhecida (código ' + code + ')', 'desc'];

  const EXP_PADRAO = 'clientEmployeeExpanded,clientExpanded,staffResponsibleExpanded';
  const EXP_SIMPLES = 'clientExpanded,staffResponsibleExpanded';

  const TYPES = [
    { key: 'geral', label: 'Geral', path: 'service-requesting/v1/tickets/generic', expand: 'clientExpanded,staffResponsibleExpanded,requesterExpanded', route: 'service-requesting/general', tramites: 'service-requesting/v1/tickets', familia: 'padrao', calculo: false },
    { key: 'cadEmpregado', label: 'Cadastro empregado', path: 'br-payroll-sr/v1/employees-registrations', expand: EXP_SIMPLES, route: 'service-requesting/payroll-registration/employee', tramites: 'br-payroll-sr/v1/employees-registrations', familia: 'cadastro', calculo: false },
    { key: 'cadContribuinte', label: 'Cadastro contribuinte', path: 'br-payroll-sr/v1/taxpayers-registrations', expand: EXP_SIMPLES, route: 'service-requesting/payroll-registration/partner', tramites: 'br-payroll-sr/v1/employees-registrations', familia: 'cadastro', calculo: false },
    { key: 'cadEstagiario', label: 'Cadastro estagiário', path: 'br-payroll-sr/v1/interns-registrations', expand: EXP_SIMPLES, route: 'service-requesting/payroll-registration/intern', tramites: 'br-payroll-sr/v1/employees-registrations', familia: 'cadastro', calculo: false },
    { key: 'avisoFerias', label: 'Aviso de férias', path: 'br-payroll-sr/v1/prior-notice-vacations', expand: EXP_PADRAO, route: 'service-requesting/vacation/prior-notice', tramites: 'br-payroll-sr/v1/tickets', familia: 'padrao', calculo: false },
    { key: 'calcFerias', label: 'Cálculo de férias', path: 'br-payroll-sr/v1/vacation-calculations', expand: EXP_PADRAO, route: 'service-requesting/vacation/calculation', tramites: 'br-payroll-sr/v1/tickets', familia: 'padrao', calculo: true },
    { key: 'avisoRescisao', label: 'Aviso de rescisão', path: 'br-payroll-sr/v1/prior-notice-terminations', expand: EXP_PADRAO, route: 'service-requesting/termination/prior-notice', tramites: 'br-payroll-sr/v1/tickets', familia: 'padrao', calculo: false },
    { key: 'calcRescisao', label: 'Cálculo de rescisão', path: 'br-payroll-sr/v1/termination-calculations', expand: EXP_PADRAO, route: 'service-requesting/termination/calculation', tramites: 'br-payroll-sr/v1/tickets', familia: 'padrao', calculo: true },
    { key: 'afastamento', label: 'Afastamento', path: 'br-payroll-sr/v1/employee-leave', expand: EXP_PADRAO, route: 'service-requesting/employee-leave', tramites: 'br-payroll-sr/v1/tickets', familia: 'padrao', calculo: false },
    { key: 'rubricas', label: 'Lançamento de rubricas', path: 'br-payroll-sr/v1/payroll-entries', expand: EXP_SIMPLES, route: 'service-requesting/payroll-entries', detalhe: 'br-payroll-sr/v2/payroll-entries', tramites: 'br-payroll-sr/v1/payroll-entries', familia: 'rubricas', calculo: false }
  ];
  // detalhe: onde o Onvio lê a solicitação completa (aba Dados), quando não é o caminho da lista.
  // tramites: onde o Onvio lê os trâmites ({tramites}/{id}/topics, id = GUID do item). Não é o caminho da lista:
  // os 3 Cadastros usam employees-registrations; Férias, Rescisão e Afastamento usam br-payroll-sr tickets.
  const TYPE_BY_KEY = Object.fromEntries(TYPES.map(t => [t.key, t]));

  const DEFAULTS = {
    intervalo: 5,             // minutos entre leituras completas (a verificação ao vivo lê tudo antes se algo mudar)
    tempoRealSeg: 30,         // segundos entre verificações leves enquanto o Onvio está na tela (0 desliga)
    primeiroTramite: 1,       // dias úteis para o primeiro trâmite
    conclusaoSimples: 3,      // dias úteis para concluir demanda simples
    conclusaoCalculo: 5,      // dias úteis para concluir cálculo
    clienteSemRetorno: 5,     // dias úteis aguardando o cliente
    // Aguardando o cliente há mais que isso (dias úteis desde a última movimentação) e a última resposta do analista não
    // pede nada ao cliente: conta como resolvida (o cliente ficou satisfeito). 0 desliga. Pedido do Josué, 16/10/2026.
    resolvidaClienteDias: 3,
    parada: 15,               // dias corridos sem movimentação
    // Na vez do escritório e sem nenhuma movimentação há mais que isso (dias corridos): provavelmente foi resolvida fora
    // do portal (Sugestões de ação no Hoje). 0 desliga. Pedido do Josué, 16/10/2026.
    foraDoPortalDias: 30,
    // Na vez do cliente (aguardando o cliente) e sem nenhuma movimentação há mais que isso (dias corridos): sugestão de concluir
    // por falta de retorno. Onde a lista exige, primeiro registra "Respondido pelo cliente" e depois conclui. 0 desliga.
    concluirClienteDias: 14,
    // Notificação do prazo legal (pagamento de férias e rescisão): avisa quando faltam até tantos dias úteis. 0 desliga.
    avisoLegalDias: 2,
    // Casos de Sugestões de ação ligados ou desligados (false desliga). 'falta' (pedido curto demais) vem desligado.
    sugestoes: { falta: false },
    // Palavras (sem acento, minúsculas) que, no assunto ou na abertura de um aviso de rescisão, mostram que o aviso prévio é
    // trabalhado: a sugestão cria o lembrete de emitir o aviso (sem cálculo). Idem acidente de trabalho nos afastamentos.
    // Setores (22/10/2026): nomes como no Onvio de quem é do DP e id do departamento do DP. Com isso a lista Geral mostra só
    // o que é do DP (departmentId) e quem não é da equipe do DP vê só as suas solicitações. Vazios = tudo como antes.
    equipeDP: [],
    departamentoDP: '',
    // Ids do departamento Pessoal (mapeados em 22/10/2026): o do sistema (DP06) e o personalizado PESSOAL. Quem tem acesso a
    // outro departamento (company-department-access) vê só as suas solicitações; na Geral, o que é de outro departamento sai.
    departamentosDP: ['2CDE919421384918A2BF510E5D5F4FD6', '79E62D04049C4E698394178A9E7A0D87'],
    // Tipos de afastamento (employeeLeaveTypeId, que vem na lista) que são acidente de trabalho; os com CAT: 3, 10 e 17.
    acidenteTipoIds: [3, 10, 14, 17, 42, 44],
    acidenteCatIds: [3, 10, 17],
    // Prazo prometido pelo analista: palavras (sem acento) perto de uma data na última resposta do escritório
    prazoAnalistaPalavras: ['prazo', 'ate', 'entrega', 'previsao', 'retorno em', 'retornamos em', 'retornaremos em'],
    avisoTrabalhadoPalavras: ['trabalhado', 'trabalhando', 'cumprir o aviso', 'cumprindo o aviso'],
    acidentePalavras: ['acidente', 'cat', 'acidentario', 'acidentaria', 'b91', 'b 91'],
    prescricaoDias: 30,       // regra do Onvio
    prescricaoAviso: 20,      // a partir de quantos dias parada vira alerta vermelho
    tempoOcupado: 5,          // dias úteis que um analista leva para atender num período cheio: prazo legal mais perto que isso já pede ação
    admissaoAviso: 2,         // dias úteis antes do prazo do eSocial para destacar a admissão (empregado: até o dia anterior ao início)
    estagiarioPrazoDias: 15,  // estagiário: o eSocial vai até 15 dias corridos depois da admissão (pedido do Josué, 16/10/2026)
    // Área do gestor (Equipe): SHA-256 da senha, nunca o texto. Trava leve, para a tela não ficar aberta a todos;
    // não é segurança forte (o código da extensão é legível). O arquivo de regras pode trocar o resumo.
    senhaGestorSha256: '112476430c42953d49259e789d363e3c62d8bc91f775a7cc2f735fbf67418e5c',
    // Avaliação da equipe (área do gestor): pesos da nota (somam 100) e mínimo de entregas no período para ter
    // posição no ranking. Vêm do código ou do arquivo de regras; o ajuste de cada pessoa não muda (como a senha).
    pesosNota: { pontualidade: 30, ritmo: 10, emDia: 25, cuidado: 20, agilidade: 15 },
    avaliacaoMinEntregas: 5,
    pagamentoFeriasAntes: 2,  // CLT art. 145: férias pagas até 2 dias antes do início
    pagamentoRescisaoDias: 10, // CLT art. 477 §6º: verbas rescisórias em até 10 dias do término do contrato
    avisoFeriasDias: 30,      // CLT art. 135: aviso de férias com 30 dias de antecedência
    abrirAoEntrar: true,      // ao entrar no Onvio, o Control Onvio já ocupa a tela
    regrasUrl: '',            // endereço (https) de um arquivo de regras do escritório; vazio = só as embutidas
    // Geral: palavras do assunto que sugerem uma solicitação específica ("possível aba errada").
    // Sem acento e em minúsculas. A primeira entrada que casar vence, então as mais específicas vêm antes.
    abaErrada: [
      { tipo: 'calcFerias', palavras: ['calculo de ferias', 'recibo de ferias', 'pagar ferias'] },
      { tipo: 'avisoFerias', palavras: ['ferias', 'aviso de ferias', 'programar ferias'] },
      { tipo: 'calcRescisao', palavras: ['calculo de rescisao', 'verbas rescisorias', 'termo de rescisao', 'trct'] },
      { tipo: 'avisoRescisao', palavras: ['demissao', 'pedido de demissao', 'desligamento', 'aviso previo', 'justa causa', 'demitir'] },
      { tipo: 'afastamento', palavras: ['atestado', 'afastamento', 'licenca maternidade', 'licenca paternidade', 'inss', 'acidente de trabalho'] },
      { tipo: 'cadEmpregado', palavras: ['admissao', 'admitir', 'novo funcionario', 'nova contratacao', 'contratar'] },
      { tipo: 'cadEstagiario', palavras: ['estagio', 'estagiario', 'estagiaria'] },
      { tipo: 'rubricas', palavras: ['hora extra', 'horas extras', 'comissao', 'rubrica', 'variaveis da folha'] }
    ],
    // Palavras ou expressões inteiras (sem acento, minúsculas) que mostram que a resposta do analista ainda espera algo
    // do cliente. Com qualquer uma delas a solicitação continua pendente. Uma pergunta (?) também conta.
    pedidoAoCliente: [
      'aguardamos', 'aguardando', 'aguardo', 'aguarde', 'aguardar', 'favor', 'por gentileza', 'gentileza', 'precisamos', 'precisaremos',
      'necessitamos', 'necessario', 'necessaria', 'necessarios', 'falta', 'faltam', 'faltou', 'faltando', 'pendente', 'pendentes',
      'pendencia', 'pendencias', 'envie', 'enviem', 'enviar', 'encaminhe', 'encaminhar', 'informe', 'informem', 'informar',
      'confirme', 'confirmar', 'assinar', 'solicitamos', 'pedimos', 'poderia', 'poderiam', 'pode nos', 'podem nos', 'seu retorno',
      'retornar', 'anexe', 'anexar', 'complementar', 'corrigir', 'regularizar'
    ],
    // Sugestões de ação (Hoje), lidas nos trâmites na hora (o texto nunca é guardado; só qual trecho casou).
    // Trechos (sem acento, minúsculas) que indicam que a solicitação foi resolvida fora do portal.
    foraDoPortal: [
      'ja resolvido', 'ja resolvida', 'ja foi resolvido', 'ja foi resolvida', 'ja resolvemos', 'ja resolvi', 'resolvido por telefone',
      'resolvemos por telefone', 'conforme conversado por telefone', 'tratado por telefone', 'enviado por e-mail', 'enviado por email',
      'enviada por e-mail', 'enviada por email', 'enviei por e-mail', 'enviei por email', 'enviamos por e-mail', 'enviamos por email',
      'enviado pelo whatsapp', 'enviado por whatsapp', 'enviei pelo whatsapp', 'enviei por whatsapp', 'enviamos pelo whatsapp',
      'enviamos por whatsapp', 'pelo zap', 'tratado pelo whatsapp', 'pode desconsiderar', 'podem desconsiderar', 'favor desconsiderar',
      'pode cancelar', 'podem cancelar', 'pode encerrar', 'podem encerrar', 'pode finalizar', 'podem finalizar', 'pode concluir',
      'podem concluir', 'nao precisa mais', 'nao e mais necessario', 'nao sera mais necessario', 'ja foi feito', 'ja foi feita',
      'ja foi enviado', 'ja foi enviada', 'ja recebi', 'ja recebemos', 'ja enviei', 'ja enviamos'
    ],
    // Trechos que mostram que o cliente diz ter anexado algo (se nenhum arquivo veio, a sugestão é pedir de novo).
    anexoCitado: [
      'segue anexo', 'segue em anexo', 'seguem anexos', 'seguem em anexo', 'segue o anexo', 'seguem os anexos', 'em anexo', 'anexei',
      'anexado', 'anexados', 'anexada', 'anexadas', 'arquivo anexo', 'documento anexo', 'documentos anexos', 'conforme anexo'
    ],
    // Abertura da lista Geral com menos letras que isso e sem anexo: provavelmente falta informação.
    faltaInfoMinCaracteres: 25,
    // Textos sugeridos para cada caso (o analista revisa e confirma antes de enviar). {aba} e {outra} vêm do caso.
    textosSugestao: {
      fora: 'Pelo que consta, esta solicitação já foi resolvida fora do portal. Estamos concluindo por aqui. Se ainda precisar de algo, é só abrir uma nova solicitação.',
      abaErrada: 'Olá! Este pedido tem uma aba própria no Portal do Cliente: {aba}. Por favor, abra a solicitação por lá, com os campos preenchidos, para conseguirmos atender dentro do prazo. Estamos concluindo esta da lista Geral.',
      semRetorno: 'Como não tivemos retorno do cliente nas últimas semanas, estamos concluindo esta solicitação. Se ainda precisar de algo, é só abrir uma nova solicitação.',
      semRetornoEtapa: 'Registro para o encerramento: solicitação sem retorno do cliente há mais de duas semanas.',
      duplicada: 'Esta solicitação repete a nº {outra}, que já está em atendimento. Seguimos por lá e estamos concluindo esta.',
      falta: 'Olá! Para seguirmos com a solicitação, precisamos de mais informações: (descreva o que falta). Pode completar por aqui, por favor?',
      anexo: 'Olá! A mensagem fala em anexo, mas nenhum arquivo chegou. Pode anexar de novo por aqui, por favor?',
      feriasAnalise: '{saudacao}! Recebemos a solicitação de férias de {empregado} e já estamos analisando. Antes de calcular, precisamos aguardar a atualização dos empréstimos consignados, para o cálculo sair correto. O pagamento das férias deve ser feito até {pagamentoFerias} (prazo legal: 2 dias antes do início). Lembramos que o empregado precisa ser comunicado das férias com 30 dias de antecedência (aviso de férias).'
    },
    // Modelos de resposta (caixa de resposta do detalhe). Texto padrão, nunca de cliente. {variáveis}: saudacao, cliente,
    // empregado, tipo, inicio, pagamento, aba, analista, numero. O que não tiver valor fica como está e o envio é barrado
    // até a pessoa preencher. situacao: 2 Em análise, 4 Respondido (aguarda o cliente), 5 Concluído, 8 Em análise interna.
    // tipos (opcional): só aparece nesses tipos de solicitação; precisaAba: só quando a solicitação tem aba própria.
    modelosTramite: [
      { rot: 'Recebido, em análise', situacao: 2, texto: '{saudacao}! Recebemos a sua solicitação e já estamos analisando. Retornamos assim que houver novidades.' },
      { rot: 'Falta informação', situacao: 4, texto: '{saudacao}! Para seguirmos com a solicitação, precisamos de mais informações: (descreva o que falta). Pode complementar por aqui, por favor?' },
      { rot: 'Pedir documento', situacao: 4, texto: '{saudacao}! Para seguirmos, precisamos que envie: (descreva o documento). Pode anexar por aqui, por favor?' },
      { rot: 'Concluído', situacao: 5, texto: '{saudacao}! Solicitação concluída. Qualquer dúvida, estamos à disposição.' },
      { rot: 'Cálculo concluído', situacao: 5, tipos: ['calcFerias', 'calcRescisao'], texto: '{saudacao}! O {tipo} de {empregado} foi concluído e segue em anexo. O pagamento deve ser feito até {pagamento}.' },
      { rot: 'Resolvida fora do portal', situacao: 5, texto: 'Pelo que consta, esta solicitação já foi resolvida fora do portal. Estamos concluindo por aqui. Se ainda precisar de algo, é só abrir uma nova solicitação.' },
      { rot: 'Lista errada', situacao: 5, precisaAba: true, texto: '{saudacao}! Este pedido tem uma aba própria no Portal do Cliente: {aba}. Por favor, abra a solicitação por lá, com os campos preenchidos, para conseguirmos atender dentro do prazo. Estamos concluindo esta da lista Geral.' },
      { rot: 'Repete outra solicitação', situacao: 5, texto: 'Esta solicitação repete a nº {numero}, que já está em atendimento. Seguimos por lá e estamos concluindo esta.' },
      { rot: 'Férias em análise', situacao: 2, tipos: ['avisoFerias', 'calcFerias'], texto: '{saudacao}! Recebemos a solicitação de férias de {empregado} e já estamos analisando. Antes de calcular, precisamos aguardar a atualização dos empréstimos consignados, para o cálculo sair correto. O pagamento das férias deve ser feito até {pagamentoFerias} (prazo legal: 2 dias antes do início). Lembramos que o empregado precisa ser comunicado das férias com 30 dias de antecedência (aviso de férias).' },
      { rot: 'Envio da rescisão', situacao: 4, tipos: ['calcRescisao'], texto: '{saudacao}! Segue o cálculo da rescisão de {empregado}. Lembramos que o pagamento das verbas rescisórias e a entrega dos documentos ao empregado devem ser feitos em até 10 dias corridos do término do contrato (CLT, art. 477, §6º), ou seja, até {pagamentoRescisao}. Qualquer dúvida, estamos à disposição.' }
    ],
    // Segundos entre "Enviar" e a chamada ao Onvio, para a pessoa desistir (trâmite não pode ser excluído). 0 desliga.
    desfazerSeg: 5,
    // Frases de cortesia que não são pedido: são tiradas do texto antes de procurar os trechos acima.
    cortesiaCliente: [
      'qualquer duvida', 'quaisquer duvidas', 'fico a disposicao', 'ficamos a disposicao', 'estamos a disposicao',
      'permaneco a disposicao', 'ficou alguma duvida', 'restou alguma duvida', 'em caso de duvida', 'em caso de duvidas',
      'se precisar', 'caso precise', 'caso necessario'
    ],
    // Observações para o cliente no detalhe (prontas para copiar na resposta). {chaves} são preenchidas com as datas
    // da solicitação; a linha que ficar com alguma chave sem valor não aparece. O arquivo de regras pode trocar.
    observacoes: {
      todas: ['Prazo de conclusão: até {conclusao} ({diasConclusao} dias úteis a partir da abertura).'],
      avisoFerias: [
        'As férias começam em {inicio}. O aviso precisa ser entregue ao empregado com pelo menos {avisoFeriasDias} dias de antecedência (CLT, art. 135).',
        'O pagamento das férias deve ser feito até {pagamentoFerias} (no mínimo {pagamentoFeriasAntes} dias antes do início, CLT, art. 145). Para isso, o cálculo de férias precisa ser solicitado com antecedência.',
        'Se o empregado for vender 1/3 das férias (abono pecuniário) ou adiantar a 1ª parcela do 13º, informe na solicitação.'
      ],
      calcFerias: [
        'O pagamento das férias deve ser feito até {pagamentoFerias} (no mínimo {pagamentoFeriasAntes} dias antes do início, em {inicio}; CLT, art. 145).',
        'Depois do pagamento, envie o recibo de férias assinado pelo empregado.'
      ],
      avisoRescisao: [
        'Data do aviso: {aviso}. As verbas rescisórias devem ser pagas em até {pagamentoRescisaoDias} dias corridos após o término do contrato (CLT, art. 477, §6º).',
        'Para não perder o prazo, solicite o cálculo de rescisão assim que o último dia de trabalho estiver definido.',
        'Lembre de agendar o exame demissional, quando exigido.'
      ],
      calcRescisao: [
        'As verbas rescisórias devem ser pagas em até {pagamentoRescisaoDias} dias corridos após o término do contrato (CLT, art. 477, §6º).',
        'Depois do pagamento, envie o comprovante e o termo de rescisão assinado.'
      ],
      afastamento: [
        'Os primeiros 15 dias de afastamento por doença são pagos pela empresa; a partir do 16º dia, o empregado deve ser encaminhado ao INSS.',
        'Envie o atestado legível, com data, período de afastamento e assinatura do médico.'
      ],
      cadEmpregado: [
        'Início das atividades em {admissao}. A admissão precisa ser enviada ao eSocial até o dia anterior ao início, então a documentação completa deve chegar antes disso.',
        'O exame admissional deve ser feito antes do início das atividades.'
      ],
      cadEstagiario: ['O estágio precisa do termo de compromisso assinado pela empresa, pelo estagiário e pela instituição de ensino antes do início.', 'Início do estágio em {admissao}. O cadastro do estagiário no eSocial vai até {estagiarioPrazoDias} dias depois do início, então a documentação deve chegar o quanto antes.'],
      cadContribuinte: ['Informe a data de início e o valor do pró-labore ou da retirada, para o cadastro no eSocial.'],
      rubricas: ['Lançamentos da competência {competencia} precisam chegar antes do fechamento da folha; depois disso entram na competência seguinte.']
    },
    // "Pedir ao cliente para concluir" (Mais ações do detalhe, solicitação já entregue e com o cliente): cria uma solicitação Geral.
    // {numero}, {tipo}, {empregado} e {cliente} vêm da solicitação; o analista revisa antes de criar.
    pedirConcluirAssunto: 'Conclua a solicitação nº {numero} ({tipo})',
    pedirConcluirTexto: 'Olá! A solicitação nº {numero} ({tipo}{empregado}) já foi respondida pelo escritório e está só aguardando a sua conclusão no Portal do Cliente. ' +
      'Por favor, confira a resposta e conclua a solicitação. Se precisar de mais alguma coisa, é só abrir uma nova solicitação.',
    // Criar solicitação (Geral) pela extensão.
    // Texto do trâmite que passa a vez ao cliente logo depois de criar (situação Respondido)
    tramiteCriacao: 'Aguardando o retorno do cliente.',
    // Valores técnicos do corpo da criação, vistos no Onvio em 22/10/2026: tipo GENERIC, meio OTHER (Outro; também PHONE e
    // EMAIL) e os ids dos departamentos do sistema. O arquivo de regras pode trocar; vazio = descobrir no Onvio.
    criacao: { serviceRequestType: 'GENERIC', requestWay: 'OTHER', departmentId: '', departamentos: { dp: '2CDE919421384918A2BF510E5D5F4FD6', fiscal: '8D6AF452F46D454C849B6C96F8CCF306', contabil: '26CE2C34F6F44CD99501CEAA43B93F0F' } },
    // Modelos da janela "Nova solicitação" por departamento (dp, fiscal, contabil): assunto e descrição editáveis. Texto
    // padrão, nunca de cliente; "(descreva ...)" marca o que a pessoa precisa preencher antes de criar. As regras podem trocar.
    modelosCriacao: [
      { dep: 'dp', rot: 'Admissão: documentos pendentes', assunto: 'Documentos pendentes da admissão', descricao: 'Para concluir a admissão, precisamos dos seguintes documentos: (descreva os documentos). Pode anexá-los respondendo a esta solicitação, por favor?' },
      { dep: 'dp', rot: 'Férias: informar o período', assunto: 'Informações para as férias', descricao: 'Para programar as férias de (descreva o empregado), precisamos que informe o período desejado e se haverá abono pecuniário (venda de 1/3). Aguardamos o seu retorno.' },
      { dep: 'dp', rot: 'Rescisão: dados do desligamento', assunto: 'Dados do desligamento', descricao: 'Para preparar a rescisão de (descreva o empregado), precisamos da data do desligamento, do tipo de aviso prévio (trabalhado ou indenizado) e do motivo.' },
      { dep: 'dp', rot: 'Afastamento: enviar o atestado', assunto: 'Envio do atestado de afastamento', descricao: 'Recebemos a comunicação de afastamento. Por favor, envie o atestado legível, com data, período de afastamento e assinatura do médico, respondendo a esta solicitação.' },
      { dep: 'dp', rot: 'Folha: variáveis do mês', assunto: 'Variáveis da folha do mês', descricao: 'Para fechar a folha da competência (descreva a competência), precisamos das variáveis do mês: horas extras, faltas, comissões e demais lançamentos. O prazo para o envio é (descreva o prazo).' },
      { dep: 'fiscal', rot: 'Documentos fiscais do mês', assunto: 'Documentos fiscais pendentes da competência', descricao: 'Para apurar os impostos da competência (descreva a competência), precisamos das notas fiscais de entrada e de saída e dos demais documentos. Pode anexá-los respondendo a esta solicitação, por favor?' },
      { dep: 'fiscal', rot: 'Nota fiscal: esclarecer', assunto: 'Esclarecimento sobre nota fiscal', descricao: 'Sobre a nota fiscal nº (descreva o número), precisamos de mais informações: (descreva a dúvida). Pode nos responder por aqui, por favor?' },
      { dep: 'fiscal', rot: 'Guias e vencimentos', assunto: 'Guias de impostos da competência', descricao: 'As guias dos impostos da competência (descreva a competência) estão disponíveis. O vencimento é (descreva a data). Em caso de dúvida, estamos à disposição.' },
      { dep: 'fiscal', rot: 'Certidões e regularização', assunto: 'Certidões e regularização fiscal', descricao: 'Para (descreva o objetivo), precisamos que informe os dados e documentos necessários: (descreva o que falta). Aguardamos o seu retorno.' },
      { dep: 'contabil', rot: 'Extratos e comprovantes', assunto: 'Extratos bancários e comprovantes da competência', descricao: 'Para fechar a contabilidade da competência (descreva a competência), precisamos dos extratos bancários e dos comprovantes de pagamento e de recebimento. Pode anexá-los respondendo a esta solicitação, por favor?' },
      { dep: 'contabil', rot: 'Conciliação: pendências', assunto: 'Pendências de conciliação contábil', descricao: 'Na conciliação da competência (descreva a competência) ficaram lançamentos sem identificação: (descreva os lançamentos). Pode nos explicar do que se trata, por favor?' },
      { dep: 'contabil', rot: 'Demonstrações contábeis', assunto: 'Demonstrações contábeis do período', descricao: 'As demonstrações contábeis do período (descreva o período) estão prontas para a sua conferência. Pedimos a confirmação até (descreva a data).' },
      { dep: 'contabil', rot: 'Alteração societária', assunto: 'Documentos para alteração societária', descricao: 'Para a alteração societária (descreva a alteração), precisamos dos documentos dos sócios e da empresa: (descreva os documentos). Pode anexá-los respondendo a esta solicitação, por favor?' }
    ],
    notificar: true,
    modoGestor: false,
    feriados: [
      '2026-01-01', '2026-02-16', '2026-02-17', '2026-04-03', '2026-04-21', '2026-05-01', '2026-06-04',
      '2026-09-07', '2026-10-12', '2026-11-02', '2026-11-15', '2026-11-20', '2026-12-25',
      '2027-01-01', '2027-02-08', '2027-02-09', '2027-03-26', '2027-04-21', '2027-05-01', '2027-05-27',
      '2027-09-07', '2027-10-12', '2027-11-02', '2027-11-15', '2027-11-20', '2027-12-25'
    ]
  };

  /* ---------- datas ---------- */
  function parseDate(s) {
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 23, 59, 59); }
    const iso = /Z$|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z'; // a API devolve UTC sem fuso
    const d = new Date(iso);
    return isNaN(d) ? null : d;
  }
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function diasCorridos(from, now) { return from ? Math.floor((now - from) / 864e5) : 0; }
  // dias úteis completos depois de "from" até "now" (não conta o próprio dia de abertura)
  function diasUteis(from, now, feriados) {
    if (!from) return 0;
    const hol = feriados instanceof Set ? feriados : new Set(feriados || []);
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const fim = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let n = 0;
    while (d < fim) {
      d.setDate(d.getDate() + 1);
      const wd = d.getDay();
      if (wd !== 0 && wd !== 6 && !hol.has(ymd(d))) n++;
    }
    return n;
  }
  function fmtData(d) { return d ? String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') : ''; }

  /* ---------- URLs ---------- */
  function listUrl(t, o) {
    const p = new URLSearchParams();
    const per = o.per || 200, page = o.page || 1;
    p.set('itemsPerPage', per);
    p.set('pageIndex', page);
    p.set('startIndex', (page - 1) * per);
    p.set('orderBy', 'lastUpdated desc');
    p.set('assignedtome', o.mine ? 'true' : 'false');
    if (o.expand !== false) p.set('expand', t.expand);
    if (o.search) p.set('searchText', o.search);
    if (o.pendentes) {
      const fam = FAMILIAS[t.familia];
      const itens = fam.excluir && o.pendentes !== 'alt'
        ? fam.excluir.map(v => ({ by: 'firmStatus', op: 'NE', value: v }))
        : [{ by: 'firmStatus', op: 'IN', value: fam.pendentes }];
      p.set('filter', JSON.stringify({ groups: [{ useOr: false, items: itens }] }));
    }
    return API + t.path + '?' + p.toString();
  }

  async function paginar(fetcher, t, o, maxPages) {
    let page = 1, all = [];
    for (;;) {
      const d = await fetcher(listUrl(t, Object.assign({}, o, { page })));
      const items = (d && d.items) || [];
      all = all.concat(items);
      const per = o.per || 200;
      if (items.length < per || page >= (d.totalPages || 1) || page >= (maxPages || 15)) break;
      page++;
    }
    return all;
  }

  /* ---------- normalização ---------- */
  const ENTRY = { MONTHLY: 'Mensal', ADVANCE: 'Adiantamento', THIRTEENTH: '13º', VACATION: 'Férias', TERMINATION: 'Rescisão' };

  function normalize(t, r, mineSet, regras) {
    const fam = FAMILIAS[t.familia];
    const code = r.genericStatus;
    const conhecido = Object.prototype.hasOwnProperty.call(fam.st, code);
    const st = conhecido ? fam.st[code] : DESCONHECIDO(code);
    const cli = r.clientExpanded || {};
    let detalhe = '';
    if (t.key === 'geral') detalhe = r.subject || '';
    else if (t.familia === 'cadastro') detalhe = r.name || '';
    else if (t.key === 'rubricas') {
      const e = r.effectiveDate ? r.effectiveDate.slice(5, 7) + '/' + r.effectiveDate.slice(0, 4) : '';
      detalhe = [e, ENTRY[r.entryType] || r.entryType || ''].filter(Boolean).join(' · ');
    } else detalhe = (r.clientEmployeeExpanded && r.clientEmployeeExpanded.name) || r.subject || '';
    return {
      k: t.key + ':' + r.id,
      type: t.key,
      typeLabel: t.label,
      id: r.id,
      num: r.identifier,
      code,
      status: st[0],
      lado: st[1],
      desconhecido: !conhecido,
      created: r.created || r.lastStatusChanged || null,
      last: r.lastUpdated || r.genericLastUpdated || r.changed || null,
      due: r.dueDate || null,
      apelido: cli.nickname || cli.name || '',
      cliente: cli.name || '',
      codCliente: cli.code || '',
      detalhe,
      resp: (r.staffResponsibleExpanded && r.staffResponsibleExpanded.name) || '',
      respId: (r.staffResponsibleExpanded && r.staffResponsibleExpanded.id) || '',
      admissao: t.familia === 'cadastro' ? (String(r.admissionDate || r.startDate || '').slice(0, 10) || null) : null,
      solicitante: (r.requesterExpanded && r.requesterExpanded.name) || '',
      departmentId: typeof r.departmentId === 'string' ? r.departmentId : '',
      tipoAfastamento: t.key === 'afastamento' && typeof r.employeeLeaveTypeId === 'number' ? r.employeeLeaveTypeId : null,   // vem na lista
      tipoAviso: t.key === 'calcRescisao' && typeof r.terminationType === 'string' ? r.terminationType : '',                 // WORKED, INDEMNIFIED, ABSENSE_DISPENSATION
      mine: mineSet ? mineSet.has(r.id) : false,
      abaProvavel: t.key === 'geral' ? abaProvavel(detalhe, regras || DEFAULTS.abaErrada) : null
    };
  }

  /* ---------- "possível aba errada" (Geral) ---------- */
  const semAcento = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const escRe = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Devolve { tipo, label, palavra } da primeira entrada cujas palavras aparecem no assunto, ou null.
  function abaProvavel(assunto, regras) {
    const alvo = semAcento(assunto);
    if (!alvo.trim()) return null;
    for (const e of (Array.isArray(regras) ? regras : [])) {
      const t = TYPE_BY_KEY[e && e.tipo];
      if (!t || t.key === 'geral') continue;
      for (const p of e.palavras || []) {
        const w = semAcento(p).trim();
        if (w && new RegExp('(^|[^a-z0-9])' + escRe(w) + '([^a-z0-9]|$)').test(alvo)) return { tipo: t.key, label: t.label, palavra: w };
      }
    }
    return null;
  }

  /* ---------- regras ---------- */
  function evaluate(it, s, now) {
    s = Object.assign({}, DEFAULTS, s || {});
    now = now || new Date();
    const t = TYPE_BY_KEY[it.type];
    const fam = FAMILIAS[t.familia];
    const hol = new Set(s.feriados || []);
    const created = parseDate(it.created) || parseDate(it.last);
    const last = parseDate(it.last);
    const parado = diasCorridos(last, now);
    const uteisParado = diasUteis(last, now, hol);
    const uteisAberto = diasUteis(created, now, hol);
    let nivel = 0; const motivos = [];
    // o: 'cli' marca atraso de origem do cliente (pedido que já chegou tarde, ou prazo que inclui o tempo em que a vez
    // era do cliente): continua no semáforo, mas não pesa na avaliação do analista (OC.avaliarEquipe).
    // legal: motivo de prazo legal (eSocial da admissão, pagamento): é o único que o analista vê como prazo (o interno só ordena)
    const alerta = (n, m, o, legal) => { const x = { n, m }; if (o) x.o = o; if (legal) x.legal = true; motivos.push(x); if (n > nivel) nivel = n; };
    let prescreveEm = null;
    const chegouTarde = (alvo, margem) => !!(created && alvo && uteisAte(created, alvo, hol) <= margem);

    if (it.lado === 'esc') {
      if (/^Sem análise/.test(it.status)) {
        if (uteisAberto > s.primeiroTramite) alerta(2, 'Sem primeiro trâmite há ' + uteisAberto + ' d.u.');
        else if (uteisAberto === s.primeiroTramite) alerta(1, 'Primeiro trâmite vence hoje');
      }
      const lim = t.calculo ? s.conclusaoCalculo : s.conclusaoSimples;
      const vezJaFoiDoCliente = clienteRespondeu(it) ? 'cli' : undefined;   // o tempo aberto inclui a espera pelo cliente
      if (uteisAberto > lim) alerta(2, 'Aberta há ' + uteisAberto + ' d.u. (limite ' + lim + ')', vezJaFoiDoCliente);
      else if (uteisAberto === lim) alerta(1, 'Prazo de conclusão vence hoje', vezJaFoiDoCliente);
      if (parado > s.parada) alerta(2, 'Parada há ' + parado + ' dias');
      // A expectativa de conclusão (dueDate) é a do cliente: não conta como vencimento. Os prazos que contam são os
      // internos acima e o prazo legal de pagamento (férias e rescisão), aplicado em OC.verificarAvisos.
    } else if (it.lado === 'desc') {
      alerta(1, it.status + ': avise quem mantém a extensão');
    } else if (it.lado === 'cli') {
      if (fam.prescreve) {
        // prescrição é só informação (o Onvio prescreve sozinho): não gera alerta nem pesa na gravidade
        prescreveEm = Math.max(0, s.prescricaoDias - parado);
        if (uteisParado > s.clienteSemRetorno) alerta(1, 'Cliente sem retorno há ' + uteisParado + ' d.u.');
      } else {
        if (parado > s.parada) alerta(2, 'Cliente parado há ' + parado + ' dias');
        else if (uteisParado > s.clienteSemRetorno) alerta(1, 'Cliente sem retorno há ' + uteisParado + ' d.u.');
      }
    }
    // Admissão: o eSocial (S-2200) precisa ser enviado até o dia anterior ao início. Pedido com data de início anterior à
    // abertura (retroativo), início já passado ou perto destacam a solicitação, de quem quer que seja a vez.
    let admissaoAlerta = null;
    // Estagiário: o prazo do eSocial é até estagiarioPrazoDias dias corridos depois da admissão, então começar antes do
    // pedido (retroativo) ou já ter começado não é atraso por si: conta só o prazo.
    if (fam === FAMILIAS.cadastro && it.admissao && it.code !== 5 && it.code !== 6 && it.type === 'cadEstagiario') {
      const ini = diaDe(it.admissao), prazo = somaDias(ini, s.estagiarioPrazoDias);
      const faltam = uteisAte(now, prazo, hol), dp = fmtData(prazo);
      const tarde = chegouTarde(prazo, s.admissaoAviso) ? 'cli' : undefined;
      if (faltam < 0) alerta(2, 'Estágio iniciado em ' + fmtData(ini) + ': prazo do eSocial (' + dp + ') já passou', tarde, true);
      else if (faltam <= s.admissaoAviso) alerta(faltam === 0 ? 2 : 1, faltam === 0 ? 'Prazo do eSocial do estágio vence hoje (' + dp + ')' : 'Estágio: eSocial até ' + dp + ' (' + s.estagiarioPrazoDias + ' dias após o início)', tarde, true);
      if (faltam <= s.admissaoAviso) admissaoAlerta = { data: it.admissao, prazo: ymd(prazo), faltam, retro: false, estagio: true };
    } else if (fam === FAMILIAS.cadastro && it.admissao && it.code !== 5 && it.code !== 6) {
      const ini = diaDe(it.admissao), aberta = created ? new Date(created.getFullYear(), created.getMonth(), created.getDate()) : null;
      const faltam = uteisAte(now, ini, hol), dt = fmtData(ini);
      const retro = !!(aberta && ini < aberta);
      const tarde = chegouTarde(ini, s.admissaoAviso) ? 'cli' : undefined;
      if (retro) alerta(2, 'Admissão retroativa: início em ' + dt + ', pedida depois', 'cli', true);
      else if (faltam < 0) alerta(2, 'Admissão em ' + dt + ' já passou', tarde, true);
      else if (faltam <= s.admissaoAviso) alerta(faltam <= 1 ? 2 : 1, faltam === 0 ? 'Admissão hoje (' + dt + '): eSocial já fora do prazo' : 'Admissão em ' + dt + ': eSocial até o dia anterior', tarde, true);
      if (retro || faltam <= s.admissaoAviso) admissaoAlerta = { data: it.admissao, faltam, retro };
    }
    return { nivel, motivos, parado, uteisAberto, prescreveEm, admissaoAlerta, grav: gravidade(it, t, s, { nivel, parado, uteisAberto, prescreveEm }) };
  }

  /* Gravidade para o painel do gestor. 0 em dia | 1 atenção | 2 fora do prazo |
   * 3 crítica: fora do prazo e (parada há 2x o limite de parada, ou aberta há 2x o prazo de conclusão).
   * Prescrição não entra (é só informação). A gravidade ordena por trás; o analista não a vê (só a Equipe). Definição em um lugar só para ajustar depois. */
  function gravidade(it, t, s, e) {
    if (e.nivel < 2) return e.nivel;
    const lim = t.calculo ? s.conclusaoCalculo : s.conclusaoSimples;
    if (e.parado >= 2 * s.parada) return 3;
    if (it.lado === 'esc' && e.uteisAberto >= 2 * lim) return 3;
    return 2;
  }

  // Por que a solicitação ficou com essa gravidade, em palavras (mesma regra de gravidade()). Calculado na hora de
  // mostrar, a partir dos campos do item; nada é guardado. { rot, curto, texto } ou null quando está em dia.
  function porqueGravidade(it, settings) {
    if (!it || !it.grav) return null;
    const s = Object.assign({}, DEFAULTS, settings || {});
    const t = TYPE_BY_KEY[it.type] || {};
    const lim = t.calculo ? s.conclusaoCalculo : s.conclusaoSimples;
    const motivos = (n) => (it.motivos || []).filter(m => m.n === n).map(m => m.m);
    const minus = x => x.charAt(0).toLowerCase() + x.slice(1);
    const fim = x => x.replace(/\.*$/, '.');                       // "d.u." no fim não ganha outro ponto
    if (it.grav === 3) {
      const l = [], c = [];
      if (it.parado != null && it.parado >= 2 * s.parada) { l.push('parada há ' + it.parado + ' dias, o dobro do limite de ' + s.parada); c.push('parada 2× o limite'); }
      if (it.lado === 'esc' && it.uteisAberto != null && it.uteisAberto >= 2 * lim) { l.push('aberta há ' + it.uteisAberto + ' d.u., o dobro do prazo de ' + lim + ' d.u. (' + (t.calculo ? 'cálculo' : 'demanda simples') + ')'); c.push('aberta 2× o prazo'); }
      if (!l.length) motivos(2).forEach(m => { l.push(minus(m)); c.push(minus(m)); });   // leitura antiga sem os números
      return { rot: 'Crítica (G3)', curto: 'G3: ' + (c.join(' · ') || 'fora do prazo há muito tempo'), texto: fim('Crítica (G3) porque ' + (l.join('; ') || 'está fora do prazo há muito tempo')) };
    }
    if (it.grav === 2) { const m = motivos(2).map(minus); return { rot: 'Fora do prazo (G2)', curto: 'G2: ' + (m[0] || 'fora do prazo'), texto: fim('Fora do prazo (G2): ' + (m.join('; ') || 'passou do prazo interno')) }; }
    const m = motivos(1).map(minus);
    return { rot: 'Atenção (G1)', curto: 'G1: ' + (m[0] || 'atenção'), texto: fim('Atenção (G1): ' + (m.join('; ') || 'o prazo está perto')) };
  }

  /* ---------- coleta ---------- */
  // Uma chamada de verdade, pequena: serve para validar a sessão (não depende de nenhum endereço de sessão).
  function urlSonda() { return listUrl(TYPE_BY_KEY.geral, { per: 1, expand: false }); }

  // Assinatura leve de cada lista: total de pendentes + última movimentação. Se não mudou, não precisa ler tudo.
  async function assinaturaDe(fetcher, t) {
    const fam = FAMILIAS[t.familia];
    let d;
    try { d = await fetcher(listUrl(t, { per: 1, pendentes: true, expand: false })); }
    catch (e) {
      if ((e && e.auth) || !fam.excluir) throw e;
      d = await fetcher(listUrl(t, { per: 1, pendentes: 'alt', expand: false }));     // mesmo recuo de lerPendentes
    }
    const x = ((d && d.items) || [])[0];
    return String(d && d.totalItems != null ? d.totalItems : '?') + '|' + (x ? [x.id, x.lastUpdated || x.genericLastUpdated || '', x.genericStatus != null ? x.genericStatus : ''].join('|') : '-');
  }
  async function assinaturas(fetcher) {
    const out = {};
    await Promise.all(TYPES.map(async t => {
      try { out[t.key] = await assinaturaDe(fetcher, t); }
      catch (e) { if (e && e.auth) throw e; out[t.key] = null; }                       // lista que não respondeu: não conta como mudança
    }));
    return out;
  }
  function assinaturasDiferem(antes, depois) {
    if (!antes || !depois) return true;
    return Object.keys(depois).some(k => depois[k] != null && antes[k] != null && depois[k] !== antes[k]) ||
      Object.keys(depois).some(k => depois[k] != null && antes[k] == null);
  }

  async function usuario(fetcher) {
    try {
      const s = await fetcher(API + 'security/v1/session-and-bindings');
      const u = s && s.UdsSession;
      if (!u) return null;
      // departamento do acesso do usuário (company-department-access): decide o que é "do setor dele"
      let departmentId = '';
      try { const a = await fetcher(URL_SO_ESCRITORIO()); if (a && typeof a.departmentId === 'string') departmentId = a.departmentId; } catch (e) { departmentId = ''; }
      return { nome: ((u.FirstName || '') + ' ' + (u.LastName || '')).trim(), email: u.EmailAddress || '', departmentId };
    } catch (e) { return null; }
  }

  /* ---------- visão do escritório x visão do cliente ----------
   * As APIs de solicitações são as mesmas nas duas visões: com o login de um cliente a leitura "funciona" e
   * traz as solicitações da empresa dele. A extensão é só do escritório, então confere o perfil da sessão:
   *  1. a própria sessão (security/v1/session-and-bindings), quando traz um campo de tipo/papel do usuário;
   *  2. uma aba do Onvio na visão do cliente (onvio.com.br/clientcenter/...), decidido no service worker;
   *  3. um endereço que só o escritório usa (acesso por departamento): recusado (401/403) com sessão válida = cliente.
   * Sem nenhum sinal claro, não bloqueia (para não travar o escritório por uma mudança do Onvio) e o
   * Diagnóstico mostra "perfil não confirmado" com o formato da sessão (só nomes de campos, sem valores). */
  const URL_SO_ESCRITORIO = () => API + 'br-payroll-sr/v1/company-department-access';
  const CHAVE_TIPO = /^(user)?(type|kind|role|roles|profile|perfil|tipo|audience|usertype|accounttype|persona|context|product|application|app)$/i;
  const EH_CLIENTE = /\b(client|cliente|clientes|customer|contact|clientcenter|client_?user|portal_?client)\b/i;
  const EH_ESCRITORIO = /\b(staff|firm|escrit[oó]rio|employee|accountant|contador|professional|onvio_?staff|staffcenter)\b/i;
  function perfilDaSessao(s) {
    if (!s || typeof s !== 'object') return null;
    let cli = false, esc = false;
    const ver = (o, prof) => {
      if (!o || typeof o !== 'object' || prof > 4) return;
      for (const [k, v] of Object.entries(o)) {
        const kn = k.replace(/[_\s-]/g, '');
        // Permissão de plataforma que só o usuário do escritório tem (FeatureResourcePermissionsMap.Platform.OnvioStaffAccess,
        // visto no Onvio real em 15/10/2026). O valor é texto; vazio ou negativo não conta.
        if (/^(OnvioStaffAccess|DefaultStaff)$/i.test(kn) && (v === true || (typeof v === 'string' && !/^(|false|no|none|deny|denied|0)$/i.test(v.trim())))) esc = true;
        if (typeof v === 'boolean' && v === true) {
          if (/^is(client|clientuser|contact|customer|cliente)$/i.test(kn)) cli = true;
          if (/^is(staff|staffuser|firm|firmuser|employee|escritorio)$/i.test(kn)) esc = true;
        } else if ((typeof v === 'string' || Array.isArray(v)) && CHAVE_TIPO.test(kn)) {
          const txt = [].concat(v).filter(x => typeof x === 'string').join(' ').replace(/([a-z])([A-Z])/g, '$1 $2');
          if (EH_CLIENTE.test(txt)) cli = true;
          if (EH_ESCRITORIO.test(txt)) esc = true;
        } else if (v && typeof v === 'object') ver(v, prof + 1);
      }
    };
    ver(s, 0);
    return cli && !esc ? 'cliente' : esc && !cli ? 'escritorio' : null;
  }
  // Formato da sessão para o Diagnóstico: nomes e tipos dos campos; valor só dos campos de tipo/papel (curtos).
  function formatoSessao(s) {
    const out = [];
    const ver = (o, cam, prof) => {
      if (!o || typeof o !== 'object' || prof > 3 || out.length > 60) return;
      for (const [k, v] of Object.entries(o)) {
        const c = cam ? cam + '.' + k : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) { out.push(c + ':objeto'); ver(v, c, prof + 1); }
        else if (Array.isArray(v)) out.push(c + ':lista(' + v.length + ')' + (CHAVE_TIPO.test(k.replace(/[_\s-]/g, '')) ? '=' + v.filter(x => typeof x === 'string').map(x => x.slice(0, 30)).join('|') : ''));
        else out.push(c + ':' + typeof v + ((typeof v === 'string' && CHAVE_TIPO.test(k.replace(/[_\s-]/g, '')) && v.length <= 30) || typeof v === 'boolean' ? '=' + v : ''));
      }
    };
    ver(s, '', 0);
    return out;
  }
  // { perfil: 'escritorio' | 'cliente' | null, motivo, formato }. abaCliente: há aba do Onvio na visão do cliente.
  async function perfilDoAcesso(fetcher, o) {
    o = o || {};
    let sessao = null;
    try { sessao = await fetcher(API + 'security/v1/session-and-bindings'); } catch (e) { sessao = null; }
    const formato = formatoSessao(sessao);
    const pelaSessao = perfilDaSessao(sessao);
    if (pelaSessao) return { perfil: pelaSessao, motivo: 'sessão do Onvio', formato };
    if (o.abaCliente) return { perfil: 'cliente', motivo: 'aba do Onvio na visão do cliente (clientcenter)', formato };
    try { await fetcher(URL_SO_ESCRITORIO()); return { perfil: 'escritorio', motivo: 'acesso de escritório', formato }; }
    catch (e) {
      if (e && e.auth && sessao) return { perfil: 'cliente', motivo: 'o Onvio recusou um acesso que só o escritório tem', formato };
      return { perfil: null, motivo: 'não confirmado (' + (e && e.message ? e.message : e) + ')', formato };
    }
  }

  // Lê as pendentes de um tipo. Se o filtro por exclusão (NE) for recusado, repete com a lista (IN).
  async function lerPendentes(fetcher, t, out) {
    const fam = FAMILIAS[t.familia];
    const ler = modo => Promise.all([
      paginar(fetcher, t, { pendentes: modo }),
      paginar(fetcher, t, { pendentes: modo, mine: true, expand: false })
    ]);
    try { return await ler(true); }
    catch (e) {
      if ((e && e.auth) || !fam.excluir) throw e;
      out.filtroAlternativo.push(t.label);
      return ler('alt');
    }
  }

  async function collect(fetcher, settings, onProgress, extra) {
    const s = Object.assign({}, DEFAULTS, settings || {});
    const now = new Date();
    const out = { items: [], erros: [], porTipo: {}, desconhecidos: {}, filtroAlternativo: [], fetchedAt: now.toISOString(), user: null, tramites: { lidos: 0, falhas: 0, cache: {} } };
    out.user = await usuario(fetcher);
    let i = 0;
    for (const t of TYPES) {
      i++;
      if (onProgress) onProgress(i, TYPES.length, t.label);
      try {
        const [todas, minhas] = await lerPendentes(fetcher, t, out);
        const mineSet = new Set(minhas.map(r => r.id));
        const norm = todas.map(r => normalize(t, r, mineSet, s.abaErrada)).filter(x => x.lado !== 'fim');
        norm.filter(x => x.desconhecido).forEach(x => { const d = out.desconhecidos[t.key] || (out.desconhecidos[t.key] = {}); d[x.code] = (d[x.code] || 0) + 1; });
        norm.forEach(x => Object.assign(x, evaluate(x, s, now)));
        out.items = out.items.concat(norm);
        out.porTipo[t.key] = norm.length;
      } catch (e) {
        if (e && e.auth) throw e;
        out.erros.push(t.label + ': ' + (e && e.message ? e.message : e));
      }
    }
    if (extra && extra.tramites) {
      if (onProgress) onProgress(TYPES.length, TYPES.length, 'trâmites');
      await enriquecer(fetcher, out, extra.tramites, s, now);
    }
    if (extra && extra.avisos) {
      if (onProgress) onProgress(TYPES.length, TYPES.length, 'prazos legais');
      await verificarAvisos(fetcher, out, extra.avisos, s, now);
    }
    out.items.sort((a, b) => (b.nivel - a.nivel) || (b.parado - a.parado));
    return out;
  }

  /* ---------- primeiro trâmite do escritório (estimativa) ----------
   * A lista não traz o histórico. Para cada pendência que já saiu de "Sem análise", lê os trâmites
   * uma única vez (o resultado fica em cache) e procura o primeiro trâmite depois da abertura cuja
   * situação NÃO seja uma que o cliente grava. É uma estimativa: confirme com a aba Trâmites. */
  // Endereço dos trâmites (o mesmo que o Onvio usa no Trâmite Rápido e na visualização completa).
  // item: o registro do Onvio ou o item normalizado; o id é sempre o GUID (campo id), nunca o número.
  const QUERY_TRAMITES = 'expand=all&itemsPerPage=1000&orderBy=created%20asc&pageIndex=0';
  function urlTramites(t, item) {
    const id = item && typeof item === 'object' ? item.id : item;
    return API + t.tramites + '/' + encodeURIComponent(id) + '/topics?' + QUERY_TRAMITES;
  }
  function primeiroTramiteEsc(topicos, t) {
    const grava = new Set(FAMILIAS[t.familia].clienteGrava);
    const ord = (topicos || []).filter(x => x && x.created).sort((a, b) => String(a.created).localeCompare(String(b.created)));
    for (let i = 1; i < ord.length; i++) if (!grava.has(Number(ord[i].status))) return ord[i].created;
    return null;
  }
  /* ---------- vez do cliente sem retorno = resolvida ----------
   * Regra do escritório (16/10/2026): aguardando o cliente há mais de resolvidaClienteDias dias úteis desde a última
   * movimentação e a última resposta do analista não pede nada ao cliente => o cliente ficou satisfeito e a solicitação
   * conta como resolvida. Qualquer trecho de pedidoAoCliente (ou uma pergunta) mantém pendente. O texto é lido na hora
   * e nunca guardado: o cache leva só o veredito (sim/não), a data da movimentação e o trecho da lista que casou. */
  function pedeAlgoAoCliente(texto, settings) {
    const s = settings || DEFAULTS;
    let t = semAcento(String(texto || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&[a-z#0-9]+;/gi, ' ')).replace(/\s+/g, ' ');
    const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const c of s.cortesiaCliente || []) t = t.replace(new RegExp(esc(c) + '[^.!?\\n]*[.!?]?', 'g'), ' ');
    if (t.includes('?')) return { pede: true, trecho: '?' };
    for (const p of s.pedidoAoCliente || []) if (new RegExp('(^|[^a-z0-9])' + esc(p) + '($|[^a-z0-9])').test(t)) return { pede: true, trecho: p };
    return { pede: false };
  }
  // Veredito sobre o último trâmite. Se a última palavra foi do cliente (situação que o cliente grava), não está
  // resolvida: a vez é do escritório, mesmo que a situação diga o contrário.
  function vereditoResolvida(topicos, t, it, settings) {
    const grava = new Set(FAMILIAS[t.familia].clienteGrava);
    const ord = (topicos || []).filter(x => x && x.created).sort((a, b) => String(a.created).localeCompare(String(b.created)));
    const ult = ord[ord.length - 1];
    if (!ult) return { em: it.last, pede: true, trecho: 'sem trâmites' };
    if (grava.has(Number(ult.status))) return { em: it.last, pede: true, trecho: 'última palavra do cliente' };
    return Object.assign({ em: it.last }, pedeAlgoAoCliente(ult.description, settings));
  }
  function quietoNoCliente(it, s, now, hol) {
    if (!(s.resolvidaClienteDias > 0) || it.lado !== 'cli' || it.desconhecido) return false;
    const ult = parseDate(it.last);
    return !!ult && diasUteis(ult, now, hol) > s.resolvidaClienteDias;
  }
  // resumo de uma solicitação considerada resolvida (só os campos do resumo, como os itens pendentes)
  function resumoResolvida(it, now, hol) {
    const ult = parseDate(it.last);
    return {
      k: it.k, type: it.type, typeLabel: it.typeLabel, id: it.id, num: it.num, code: it.code, status: it.status, lado: 'cli',
      cliente: it.cliente, apelido: it.apelido, codCliente: it.codCliente, detalhe: it.detalhe, resp: it.resp, respId: it.respId,
      mine: it.mine, created: it.created, last: it.last, semRetorno: ult ? diasUteis(ult, now, hol) : null
    };
  }

  /* Prazo prometido pelo analista: procura uma data perto das palavras de prazoAnalistaPalavras na última resposta do
   * escritório ("retornamos até 28/10", "previsão de entrega: 05/11/2026", "prazo até o dia 30"). Devolve só a data
   * (YYYY-MM-DD) ou null; o texto nunca sai daqui. Datas no passado da própria resposta ou a mais de 180 dias não valem. */
  function prazoPrometido(topicos, t, s, now) {
    s = Object.assign({}, DEFAULTS, s || {});
    const grava = new Set(FAMILIAS[t.familia].clienteGrava);
    const ord = (topicos || []).filter(x => x && x.created && !x.deletedTopic).sort((a, b) => String(a.created).localeCompare(String(b.created)));
    let ult = null;
    ord.forEach((x, n) => { if (n > 0 && !grava.has(Number(x.status))) ult = x; });
    if (!ult) return null;
    const txt = textoPlano(ult.description), criada = parseDate(ult.created) || now || new Date();
    const base = new Date(criada.getFullYear(), criada.getMonth(), criada.getDate());
    const valida = (y, m, d) => { const x = new Date(y, m - 1, d); return x.getMonth() === m - 1 && x.getDate() === d && x >= base && x - base <= 180 * 864e5 ? x : null; };
    const achados = [];
    for (const p of s.prazoAnalistaPalavras || []) {
      const pal = escRe(semAcento(p));
      let m = new RegExp('(?:^|[^a-z0-9])' + pal + '[^0-9]{0,30}(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?').exec(txt);
      if (m) {
        const dia = Number(m[1]), mes = Number(m[2]);
        let ano = m[3] ? Number(m[3]) : base.getFullYear();
        if (ano < 100) ano += 2000;
        let x = valida(ano, mes, dia);
        if (!x && !m[3]) x = valida(ano + 1, mes, dia);
        if (x) achados.push([m.index, x]);
      }
      m = new RegExp('(?:^|[^a-z0-9])' + pal + '[^0-9]{0,25}dia (\\d{1,2})(?![0-9/])').exec(txt);
      if (m) {
        const dia = Number(m[1]);
        let x = valida(base.getFullYear(), base.getMonth() + 1, dia);
        if (!x) x = valida(base.getFullYear(), base.getMonth() + 2 > 12 ? 1 : base.getMonth() + 2, dia) || (base.getMonth() === 11 ? valida(base.getFullYear() + 1, 1, dia) : null);
        if (x) achados.push([m.index, x]);
      }
    }
    if (!achados.length) return null;
    achados.sort((a, b) => a[0] - b[0]);
    return ymd(achados[0][1]);
  }
  async function enriquecer(fetcher, out, cache, s, now) {
    out.tramites.porTipo = {};
    const LIMITE = 60, PARALELO = 4;
    const hol = new Set(s.feriados || []);
    const novo = {};
    const fila = [], quer = {};
    for (const it of out.items) {
      const c = cache[it.k] || {};
      const guarda = {};
      if (c.pt) guarda.pt = c.pt;
      if (c.pa && c.pa.l === it.last) guarda.pa = c.pa;                      // prazo prometido: só se nada mexeu desde a leitura
      const quieto = quietoNoCliente(it, s, now, hol);
      if (quieto && c.res && c.res.em === it.last) guarda.res = c.res;     // nada mudou desde o veredito
      if (c.erro && now - new Date(c.erro) < 864e5) {                        // não insiste por 1 dia
        novo[it.k] = Object.assign(guarda, { erro: c.erro });
        continue;
      }
      if (Object.keys(guarda).length) novo[it.k] = guarda;
      const pt = !guarda.pt && !/^Sem análise/.test(it.status) && !it.desconhecido;   // ainda sem trâmite do escritório
      const res = quieto && !guarda.res;
      const pa = !guarda.pa && !!it.mine && it.lado === 'esc' && !/^Sem análise/.test(it.status) && !it.desconhecido;    // só das suas, para não pesar na leitura
      if (pt || res || pa) { quer[it.k] = { pt, res, pa }; (res ? fila.unshift(it) : fila.push(it)); }
    }
    const falhou = {};
    let i = 0;
    async function worker() {
      while (i < fila.length && i < LIMITE) {
        const it = fila[i++];
        const t = TYPE_BY_KEY[it.type];
        if (falhou[t.key] >= 3) continue;                                  // endpoint do tipo não responde
        try {
          const d = await fetcher(urlTramites(t, it));
          const lista = (d && d.items) || (Array.isArray(d) ? d : []);
          out.tramites.lidos++;
          out.tramites.porTipo[t.key] = 'ok';
          const e = novo[it.k] || {};
          const pt = quer[it.k].pt ? primeiroTramiteEsc(lista, t) : null;
          if (pt) e.pt = pt; // sem achar, tenta de novo no próximo ciclo
          if (quer[it.k].res) e.res = vereditoResolvida(lista, t, it, s);
          if (quer[it.k].pa) e.pa = { l: it.last, d: prazoPrometido(lista, t, s, now) };
          if (Object.keys(e).length) novo[it.k] = e;
        } catch (e) {
          if (e && e.auth) throw e;
          out.tramites.falhas++;
          falhou[t.key] = (falhou[t.key] || 0) + 1;
          if (out.tramites.porTipo[t.key] !== 'ok') out.tramites.porTipo[t.key] = 'erro: ' + String(e && e.message || e).slice(0, 60);
          novo[it.k] = Object.assign(novo[it.k] || {}, { erro: now.toISOString() });
        }
      }
    }
    await Promise.all(Array.from({ length: PARALELO }, worker));
    out.resolvidas = [];
    out.items = out.items.filter(it => {
      const c = novo[it.k];
      if (c && c.pt) {
        it.primeiroTramite = c.pt;
        it.ptUteis = diasUteis(parseDate(it.created), parseDate(c.pt), hol);
      }
      if (c && c.pa && c.pa.l === it.last && c.pa.d) {                    // vencimento visível: o que o analista prometeu ao cliente
        const f = uteisAte(now, diaDe(c.pa.d), hol), dt = c.pa.d.slice(8, 10) + '/' + c.pa.d.slice(5, 7);
        it.prazoPrometido = c.pa.d;
        it.motivos = (it.motivos || []).concat([{ n: f < 0 ? 2 : f <= 1 ? 1 : 0, m: f < 0 ? 'Prometido até ' + dt + ' (venceu)' : f === 0 ? 'Prometido para hoje (' + dt + ')' : 'Prometido até ' + dt, legal: true, prom: true }]);
        if (f < 0 && (it.nivel || 0) < 2) it.nivel = 2;
      }
      if (c && c.res && c.res.em === it.last && quietoNoCliente(it, s, now, hol)) {
        if (!c.res.pede) { out.resolvidas.push(resumoResolvida(it, now, hol)); return false; }
        it.pedidoAoCliente = c.res.trecho || true;                         // continua pendente: o analista pediu algo
      }
      return true;
    });
    out.resolvidas.sort((a, b) => String(b.last).localeCompare(String(a.last)));
    out.tramites.cache = novo; // só o que ainda está pendente ou resolvido nesta leitura: o cache não cresce
  }

  async function search(fetcher, q, settings) {
    const s = Object.assign({}, DEFAULTS, settings || {});
    const now = new Date();
    const res = await Promise.all(TYPES.map(async t => {
      try {
        const d = await fetcher(listUrl(t, { search: q, per: 20 }));
        return ((d && d.items) || []).map(r => { const x = normalize(t, r, null, s.abaErrada); Object.assign(x, evaluate(x, s, now)); return x; });
      } catch (e) { if (e && e.auth) throw e; return []; }
    }));
    return [].concat(...res).sort((a, b) => String(b.last).localeCompare(String(a.last)));
  }

  function porAnalista(items) {
    const m = {};
    for (const it of items) {
      const k = it.resp || '(sem responsável)';
      const r = m[k] || (m[k] = { resp: k, esc: 0, cli: 0, desc: 0, vermelho: 0, amarelo: 0, total: 0, g1: 0, g2: 0, g3: 0, semPrimeiro: 0, ptSoma: 0, ptN: 0 });
      r.total++; r[it.lado === 'esc' || it.lado === 'cli' ? it.lado : 'desc']++;
      if (it.nivel === 2) r.vermelho++; else if (it.nivel === 1) r.amarelo++;
      if (it.grav >= 1 && it.grav <= 3) r['g' + it.grav]++;
      if (it.lado === 'esc' && /^Sem análise/.test(it.status)) r.semPrimeiro++;
      if (it.ptUteis != null) { r.ptSoma += it.ptUteis; r.ptN++; }
    }
    for (const r of Object.values(m)) r.ptMedia = r.ptN ? Math.round(r.ptSoma / r.ptN * 10) / 10 : null;
    return Object.values(m).sort((a, b) => (b.g3 - a.g3) || (b.vermelho - a.vermelho) || (b.total - a.total));
  }

  /* ---------- regras do escritório (arquivo editável, só dados) ----------
   * Aceita dois formatos de JSON:
   *  1. o do escritório:  { versao, prazos: {...}, feriados: [...], abaErrada: [...] }
   *  2. o do Assistente do Portal do Cliente (visão do cliente): usa config.prazoInternoDiasUteis
   *     (simples e calculo) e feriados, para os dois lados prometerem os mesmos prazos.
   * Tudo é validado: número dentro de limites, datas AAAA-MM-DD, textos curtos. Nada é executado. */
  const LIMITES = {
    primeiroTramite: [0, 30], conclusaoSimples: [1, 60], conclusaoCalculo: [1, 60], clienteSemRetorno: [1, 60], resolvidaClienteDias: [0, 30],
    parada: [1, 90], foraDoPortalDias: [0, 180], concluirClienteDias: [0, 180], desfazerSeg: [0, 15], prescricaoDias: [1, 120], prescricaoAviso: [1, 120], tempoRealSeg: [0, 600],
    tempoOcupado: [0, 30], avisoLegalDias: [0, 15], admissaoAviso: [0, 15], estagiarioPrazoDias: [0, 60], pagamentoFeriasAntes: [0, 30], pagamentoRescisaoDias: [0, 60], avisoFeriasDias: [0, 90]
  };
  const inteiro = (v, [min, max]) => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined);

  const DEPARTAMENTOS = ['dp', 'fiscal', 'contabil'];
  const ROT_DEPARTAMENTO = { dp: 'DP', fiscal: 'Fiscal', contabil: 'Contábil' };
  function normalizarRegras(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const out = { versao: String(raw.versao == null ? '' : raw.versao).slice(0, 40), config: {}, feriados: [], abaErrada: [] };
    const prazos = raw.prazos && typeof raw.prazos === 'object' ? raw.prazos : {};
    for (const k of Object.keys(LIMITES)) { const v = inteiro(prazos[k], LIMITES[k]); if (v !== undefined) out.config[k] = v; }
    const cli = raw.config && raw.config.prazoInternoDiasUteis;           // formato do Assistente do cliente
    if (cli && typeof cli === 'object') {
      const a = inteiro(cli.simples, LIMITES.conclusaoSimples), b = inteiro(cli.calculo, LIMITES.conclusaoCalculo);
      if (a !== undefined && out.config.conclusaoSimples === undefined) out.config.conclusaoSimples = a;
      if (b !== undefined && out.config.conclusaoCalculo === undefined) out.config.conclusaoCalculo = b;
    }
    if (Array.isArray(raw.feriados)) out.feriados = [...new Set(raw.feriados.filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)))].slice(0, 600);
    if (raw.observacoes && typeof raw.observacoes === 'object' && !Array.isArray(raw.observacoes)) {
      out.observacoes = {};
      for (const [k, v] of Object.entries(raw.observacoes)) {
        if ((k === 'todas' || TYPE_BY_KEY[k]) && Array.isArray(v)) out.observacoes[k] = v.filter(x => typeof x === 'string' && x.trim() && x.length <= 400).map(x => x.trim()).slice(0, 12);
      }
    }
    if (typeof raw.pedirConcluirAssunto === 'string' && raw.pedirConcluirAssunto.trim() && raw.pedirConcluirAssunto.length <= 200) out.pedirConcluirAssunto = raw.pedirConcluirAssunto.trim();
    if (typeof raw.pedirConcluirTexto === 'string' && raw.pedirConcluirTexto.trim() && raw.pedirConcluirTexto.length <= 800) out.pedirConcluirTexto = raw.pedirConcluirTexto.trim();
    if (typeof raw.tramiteCriacao === 'string' && raw.tramiteCriacao.trim() && raw.tramiteCriacao.length <= 400) out.tramiteCriacao = raw.tramiteCriacao.trim();
    if (raw.criacao && typeof raw.criacao === 'object' && !Array.isArray(raw.criacao)) {
      const c = {};
      for (const k of ['serviceRequestType', 'requestWay', 'departmentId']) if (typeof raw.criacao[k] === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(raw.criacao[k])) c[k] = raw.criacao[k];
      const dp = raw.criacao.departamentos;
      if (dp && typeof dp === 'object' && !Array.isArray(dp)) {
        const d = {};
        for (const k of DEPARTAMENTOS) if (typeof dp[k] === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(dp[k])) d[k] = dp[k];
        if (Object.keys(d).length) c.departamentos = d;
      }
      if (Object.keys(c).length) out.criacao = c;
    }
    if (Array.isArray(raw.modelosCriacao)) {
      const ms = [];
      for (const m of raw.modelosCriacao.slice(0, 40)) {
        if (!m || !DEPARTAMENTOS.includes(m.dep) || typeof m.rot !== 'string' || typeof m.assunto !== 'string' || typeof m.descricao !== 'string') continue;
        if (!m.rot.trim() || !m.assunto.trim() || !m.descricao.trim() || m.rot.length > 40 || m.assunto.length > 200 || m.descricao.length > 800) continue;
        ms.push({ dep: m.dep, rot: m.rot.trim(), assunto: m.assunto.trim(), descricao: m.descricao.trim() });
      }
      if (ms.length) out.modelosCriacao = ms;
    }
    if (Array.isArray(raw.equipeDP)) { const l = [...new Set(raw.equipeDP.filter(x => typeof x === 'string' && x.trim() && x.length <= 80).map(x => x.trim()))].slice(0, 200); if (l.length) out.equipeDP = l; }
    if (typeof raw.departamentoDP === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(raw.departamentoDP)) out.departamentoDP = raw.departamentoDP;
    if (Array.isArray(raw.departamentosDP)) { const l = [...new Set(raw.departamentosDP.filter(x => typeof x === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(x)))].slice(0, 20); if (l.length) out.departamentosDP = l; }
    for (const k of ['acidenteTipoIds', 'acidenteCatIds']) if (Array.isArray(raw[k])) { const l = [...new Set(raw[k].filter(x => Number.isInteger(x) && x > 0 && x < 1000))].slice(0, 60); if (l.length) out[k] = l; }
    for (const k of ['avisoTrabalhadoPalavras', 'acidentePalavras', 'prazoAnalistaPalavras']) {
      if (Array.isArray(raw[k])) { const l = [...new Set(raw[k].filter(p => typeof p === 'string' && p.trim() && p.length <= 40).map(p => semAcento(p).trim()))].slice(0, 40); if (l.length) out[k] = l; }
    }
    if (raw.sugestoes && typeof raw.sugestoes === 'object' && !Array.isArray(raw.sugestoes)) {
      const sg = {};
      for (const k of Object.keys(CASOS)) if (typeof raw.sugestoes[k] === 'boolean') sg[k] = raw.sugestoes[k];
      if (Object.keys(sg).length) out.sugestoes = sg;
    }
    for (const k of ['pedidoAoCliente', 'cortesiaCliente', 'foraDoPortal', 'anexoCitado']) {
      if (Array.isArray(raw[k])) out[k] = [...new Set(raw[k].filter(p => typeof p === 'string' && p.trim() && p.length <= 60).map(p => semAcento(p).trim()))].slice(0, 80);
    }
    if (Array.isArray(raw.modelosTramite)) {
      const ms = [];
      for (const m of raw.modelosTramite.slice(0, 30)) {
        if (!m || typeof m.rot !== 'string' || typeof m.texto !== 'string' || !m.rot.trim() || !m.texto.trim() || m.rot.length > 40 || m.texto.length > 800) continue;
        const o = { rot: m.rot.trim(), texto: m.texto.trim() };
        if ([2, 4, 5, 8].includes(m.situacao)) o.situacao = m.situacao;
        if (Array.isArray(m.tipos)) { const ts = m.tipos.filter(k => typeof k === 'string' && TYPE_BY_KEY[k]); if (ts.length) o.tipos = ts; }
        if (m.precisaAba === true) o.precisaAba = true;
        ms.push(o);
      }
      if (ms.length) out.modelosTramite = ms;
    }
    if (raw.textosSugestao && typeof raw.textosSugestao === 'object' && !Array.isArray(raw.textosSugestao)) {
      const ts = {};
      for (const k of Object.keys(DEFAULTS.textosSugestao)) if (typeof raw.textosSugestao[k] === 'string' && raw.textosSugestao[k].trim() && raw.textosSugestao[k].length <= 800) ts[k] = raw.textosSugestao[k].trim();
      if (Object.keys(ts).length) out.textosSugestao = ts;
    }
    if (typeof raw.senhaGestorSha256 === 'string' && /^[0-9a-f]{64}$/i.test(raw.senhaGestorSha256)) out.senhaGestorSha256 = raw.senhaGestorSha256.toLowerCase();
    if (raw.avaliacao && typeof raw.avaliacao === 'object' && !Array.isArray(raw.avaliacao)) {
      const a = {}, pe = raw.avaliacao.pesos;
      if (pe && typeof pe === 'object') {
        const p = {};
        for (const k of Object.keys(DEFAULTS.pesosNota)) { const v = inteiro(pe[k], [0, 100]); if (v !== undefined) p[k] = v; }
        if (Object.keys(p).length) a.pesos = p;
      }
      const mi = inteiro(raw.avaliacao.minEntregas, [1, 50]);
      if (mi !== undefined) a.minEntregas = mi;
      if (Object.keys(a).length) out.avaliacao = a;
    }
    if (Array.isArray(raw.abaErrada)) {
      for (const e of raw.abaErrada.slice(0, 30)) {
        const t = e && TYPE_BY_KEY[e.tipo];
        const palavras = Array.isArray(e && e.palavras) ? e.palavras.filter(p => typeof p === 'string' && p.trim() && p.length <= 60).map(p => semAcento(p).trim()).slice(0, 40) : [];
        if (t && t.key !== 'geral' && palavras.length) out.abaErrada.push({ tipo: t.key, palavras });
      }
    }
    const util = Object.keys(out.config).length || out.feriados.length || out.abaErrada.length || (out.observacoes && Object.keys(out.observacoes).length) || out.pedirConcluirAssunto || out.pedirConcluirTexto || out.tramiteCriacao || out.criacao || out.sugestoes || out.modelosCriacao || out.equipeDP || out.departamentoDP || out.departamentosDP || out.acidenteTipoIds || out.acidenteCatIds || out.prazoAnalistaPalavras || out.avisoTrabalhadoPalavras || out.acidentePalavras || out.senhaGestorSha256 || out.avaliacao || out.pedidoAoCliente || out.cortesiaCliente || out.foraDoPortal || out.anexoCitado || out.textosSugestao || out.modelosTramite;
    return util ? out : null;
  }

  // Ordem de precedência: padrões do código < regras do escritório < ajustes que a pessoa fez nas configurações.
  function combinarSettings(regrasGuardadas, usuario) {
    const base = Object.assign({}, DEFAULTS);
    const r = regrasGuardadas && regrasGuardadas.regras;
    if (r) {
      Object.assign(base, r.config || {});
      if (r.feriados && r.feriados.length) base.feriados = [...new Set(DEFAULTS.feriados.concat(r.feriados))].sort();
      if (r.abaErrada && r.abaErrada.length) base.abaErrada = r.abaErrada;
      if (r.observacoes) base.observacoes = Object.assign({}, DEFAULTS.observacoes, r.observacoes);
      if (r.pedirConcluirAssunto) base.pedirConcluirAssunto = r.pedirConcluirAssunto;
      if (r.pedirConcluirTexto) base.pedirConcluirTexto = r.pedirConcluirTexto;
      if (r.tramiteCriacao) base.tramiteCriacao = r.tramiteCriacao;
      if (r.criacao) base.criacao = Object.assign({}, DEFAULTS.criacao, r.criacao, { departamentos: Object.assign({}, DEFAULTS.criacao.departamentos, r.criacao.departamentos || {}) });
      if (r.modelosCriacao) base.modelosCriacao = r.modelosCriacao;
      if (r.avisoTrabalhadoPalavras) base.avisoTrabalhadoPalavras = r.avisoTrabalhadoPalavras;
      if (r.equipeDP) base.equipeDP = r.equipeDP;
      if (r.departamentoDP) base.departamentoDP = r.departamentoDP;
      if (r.departamentosDP) base.departamentosDP = r.departamentosDP;
      if (r.acidenteTipoIds) base.acidenteTipoIds = r.acidenteTipoIds;
      if (r.acidenteCatIds) base.acidenteCatIds = r.acidenteCatIds;
      if (r.prazoAnalistaPalavras) base.prazoAnalistaPalavras = r.prazoAnalistaPalavras;
      if (r.acidentePalavras) base.acidentePalavras = r.acidentePalavras;
      if (r.senhaGestorSha256) base.senhaGestorSha256 = r.senhaGestorSha256;
      if (r.avaliacao && r.avaliacao.pesos) base.pesosNota = Object.assign({}, DEFAULTS.pesosNota, r.avaliacao.pesos);
      if (r.avaliacao && r.avaliacao.minEntregas) base.avaliacaoMinEntregas = r.avaliacao.minEntregas;
      if (r.pedidoAoCliente) base.pedidoAoCliente = r.pedidoAoCliente;
      if (r.cortesiaCliente) base.cortesiaCliente = r.cortesiaCliente;
      if (r.foraDoPortal) base.foraDoPortal = r.foraDoPortal;
      if (r.anexoCitado) base.anexoCitado = r.anexoCitado;
      if (r.modelosTramite) base.modelosTramite = r.modelosTramite;
      if (r.textosSugestao) base.textosSugestao = Object.assign({}, DEFAULTS.textosSugestao, r.textosSugestao);
      if (r.sugestoes) base.sugestoes = Object.assign({}, DEFAULTS.sugestoes, r.sugestoes);
    }
    // a senha da área do gestor vem só do código ou das regras do escritório, nunca dos ajustes da pessoa
    return Object.assign(base, usuario || {}, { senhaGestorSha256: base.senhaGestorSha256, pesosNota: base.pesosNota, avaliacaoMinEntregas: base.avaliacaoMinEntregas, equipeDP: base.equipeDP, departamentoDP: base.departamentoDP, departamentosDP: base.departamentosDP, acidenteTipoIds: base.acidenteTipoIds, acidenteCatIds: base.acidenteCatIds });
  }

  /* ---------- setores (DP × outros departamentos) ----------
   * Com equipeDP e/ou departamentoDP nas regras: a lista Geral mostra só o que é do DP (departmentId) e quem não é da
   * equipe do DP vê só as suas solicitações (sem Todas, Equipe e Distribuir). Sem regras, nada muda. */
  function perfilSetor(settings, nome, deptoAcesso) {
    const s = Object.assign({}, DEFAULTS, settings || {});
    const eq = (s.equipeDP || []).map(x => semAcento(x).trim());
    const deps = [...new Set((s.departamentosDP || []).concat(s.departamentoDP || []).filter(Boolean).map(x => String(x).toUpperCase()))];
    if (!eq.length && !deps.length) return { ativo: false, fora: false, dep: '', deps: [] };
    const n = semAcento(nome || '').trim();
    // quem é do DP: pelo nome, se as regras trazem a equipe; senão pelo departamento do próprio acesso no Onvio
    let fora = false;
    if (eq.length && n) fora = !eq.includes(n);
    else if (deptoAcesso && deps.length) fora = !deps.includes(String(deptoAcesso).toUpperCase());
    return { ativo: true, fora, dep: deps[0] || '', deps };
  }
  function filtrarPorSetor(items, perfil) {
    if (!perfil || !perfil.ativo) return items || [];
    const deps = perfil.deps || (perfil.dep ? [perfil.dep] : []);
    return (items || []).filter(i => perfil.fora ? !!i.mine : i.mine || !(deps.length && i.type === 'geral' && i.departmentId && !deps.includes(String(i.departmentId).toUpperCase())));
  }

  /* ---------- painel por cliente (dashboard Clientes) ---------- */
  function porCliente(items) {
    const m = {};
    for (const it of items || []) {
      const k = it.cliente || it.apelido || '(cliente não informado)';
      const r = m[k] || (m[k] = { cliente: k, apelido: it.apelido || '', total: 0, esc: 0, cli: 0, atraso: 0, abaErrada: 0, diasCliSoma: 0, diasCliN: 0 });
      r.total++;
      if (it.lado === 'esc') r.esc++;
      if (it.lado === 'cli') { r.cli++; r.diasCliSoma += it.parado || 0; r.diasCliN++; }
      if (it.nivel === 2) r.atraso++;
      if (it.abaProvavel) r.abaErrada++;
    }
    for (const r of Object.values(m)) r.diasCliMedia = r.diasCliN ? Math.round(r.diasCliSoma / r.diasCliN * 10) / 10 : null;
    return Object.values(m).sort((a, b) => (b.atraso - a.atraso) || (b.total - a.total));
  }

  /* ---------- série do dia (gráficos do gestor) ----------
   * serie = { 'AAAA-MM-DD': { entradas, saidas, horas: { 'HH': pendentes } } }, 60 dias.
   * Entrada = pendência que não estava na leitura anterior; saída = a que sumiu (concluída, prescrita ou movida). */
  function atualizarSerie(serie, anterior, snap, now) {
    now = now || new Date();
    const out = Object.assign({}, serie || {});
    const dia = ymd(now), hora = String(now.getHours()).padStart(2, '0');
    const d = out[dia] = Object.assign({ entradas: 0, saidas: 0, horas: {} }, out[dia] || {});
    d.horas = Object.assign({}, d.horas, { [hora]: ((snap && snap.items) || []).length });
    if (anterior && anterior.items && snap && snap.items) {
      const antes = new Set(anterior.items.map(i => i.k)), agora = new Set(snap.items.map(i => i.k));
      for (const k of agora) if (!antes.has(k)) d.entradas++;
      for (const k of antes) if (!agora.has(k)) d.saidas++;
    }
    for (const k of Object.keys(out).sort().slice(0, -60)) delete out[k];
    return out;
  }

  /* ---------- situação em grupos, motivo e ordem da fila ----------
   * O analista não vê prazo interno nem gravidade (só a Equipe vê): a fila se ordena pelo que pede ação primeiro.
   * 1) prazo legal em até 1 d.u. (pagamento de férias e rescisão) ou admissão em destaque; 2) Sem análise (as mais
   * antigas primeiro); 3) Em análise, análise interna e encaminhadas; 4) Cliente respondeu; 5) Com o cliente.
   * Dentro de cada grupo a gravidade desempata por trás, sem aparecer. */
  const clienteRespondeu = i => i.lado === 'esc' && /^(Aguardando resposta|Respondido pelo cliente)$/.test(i.status || '');
  // Grupos de situação (cores e cartões de filtro): os códigos das 3 famílias caem em 6 grupos
  const GRUPOS_SIT = [
    { k: 'sem', rot: 'Sem análise' }, { k: 'analise', rot: 'Em análise' }, { k: 'encaminhada', rot: 'Encaminhada' },
    { k: 'respondeu', rot: 'Cliente respondeu' }, { k: 'cliente', rot: 'Com o cliente' }, { k: 'desconhecida', rot: 'Desconhecida' }
  ];
  const SIT_GRUPO = {
    padrao: { 1: 'sem', 2: 'analise', 8: 'analise', 7: 'encaminhada', 9: 'encaminhada', 3: 'respondeu', 4: 'cliente' },
    cadastro: { 1: 'sem', 2: 'encaminhada', 7: 'encaminhada', 4: 'respondeu', 3: 'cliente', 5: 'cliente' },
    rubricas: { 0: 'sem', 1: 'sem', 2: 'analise', 7: 'analise', 9: 'encaminhada', 11: 'encaminhada', 5: 'respondeu', 12: 'respondeu', 3: 'cliente', 4: 'cliente', 6: 'cliente' }
  };
  function grupoSituacao(it) {
    const t = it && TYPE_BY_KEY[it.type];
    if (!t || it.desconhecido || it.lado === 'desc') return GRUPOS_SIT[5];
    let k = it.code != null ? SIT_GRUPO[t.familia][Number(it.code)] : null;
    if (!k) {                                                   // sem código (leitura antiga): pelo texto e pela vez
      const st = it.status || '';
      k = clienteRespondeu(it) ? 'respondeu' : /^Sem análise/.test(st) ? 'sem' : /^(Encaminhado|Enviado para o escritório)/.test(st) ? 'encaminhada' : it.lado === 'cli' ? 'cliente' : 'analise';
    }
    return GRUPOS_SIT.find(g => g.k === k) || GRUPOS_SIT[5];
  }
  const MOTIVOS = [
    { k: 'legal', rot: 'Prazo legal', cor: 'crit' },
    { k: 'sem', rot: 'Sem análise', cor: 'serious' },
    { k: 'analise', rot: 'Em análise', cor: 'warn' },
    { k: 'respondeu', rot: 'Cliente respondeu', cor: 's1' },
    { k: 'cliente', rot: 'Com o cliente', cor: 'ok' }
  ];
  // Prazo legal chegando (pagamento em até 1 d.u.) ou admissão em destaque sem trâmite do escritório
  const legalUrgente = i => !!(i && (i.acidente || (i.prazoLegal && i.prazoLegal.faltam <= 1) || (i.admissaoAlerta && !escritorioTramitou(i))));
  const legalFaltam = i => Math.min(i.acidente ? -100 : 99, i.prazoLegal ? i.prazoLegal.faltam : 99, i.admissaoAlerta ? (i.admissaoAlerta.retro ? -99 : i.admissaoAlerta.faltam) : 99);
  function motivoDe(i) {
    if (legalUrgente(i)) return 'legal';
    const g = grupoSituacao(i).k;
    return g === 'sem' ? 'sem' : g === 'respondeu' ? 'respondeu' : g === 'cliente' ? 'cliente' : 'analise';
  }
  // A fila inteira na ordem de prioridade: [{ item, motivo }]
  function ordemFila(items) {
    const idx = Object.fromEntries(MOTIVOS.map((m, n) => [m.k, n]));
    const cria = i => String(i.created || '~');
    return (items || []).map(item => ({ item, motivo: motivoDe(item) })).sort((a, b) =>
      (idx[a.motivo] - idx[b.motivo]) ||
      (a.motivo === 'legal' ? legalFaltam(a.item) - legalFaltam(b.item) : 0) ||
      (a.motivo === 'sem' ? cria(a.item).localeCompare(cria(b.item)) : 0) ||
      (a.motivo !== 'legal' ? String(a.item.prazoPrometido || '9').localeCompare(String(b.item.prazoPrometido || '9')) : 0) ||      // o prometido mais perto primeiro
      ((b.item.grav || 0) - (a.item.grav || 0)) || ((b.item.parado || 0) - (a.item.parado || 0)));
  }
  // Tipos de solicitação na ordem de prioridade, para os cartões do Hoje: férias e rescisão andam em par (aviso + cálculo,
  // um bloco só). Vem primeiro o bloco com a solicitação mais urgente (prazo legal, sem análise, em análise, cliente
  // respondeu, com o cliente), depois o que tem mais delas nesse nível e mais no total; os vazios ficam no fim.
  // Devolve [{ keys: [tipos], rot: título do par ou '', itens, motivo, n }].
  const PARES_TIPO = [['avisoFerias', 'calcFerias', 'Férias'], ['avisoRescisao', 'calcRescisao', 'Rescisão']];
  function ordenarTipos(items) {
    const idx = Object.fromEntries(MOTIVOS.map((m, n) => [m.k, n]));
    const par = new Map(PARES_TIPO.flatMap(p => [[p[0], p], [p[1], p]]));
    const feitos = new Set(), blocos = [];
    TYPES.forEach((t, ordem) => {
      if (feitos.has(t.key)) return;
      const p = par.get(t.key);
      const keys = p ? [p[0], p[1]] : [t.key];
      keys.forEach(k => feitos.add(k));
      const xs = (items || []).filter(i => keys.includes(i.type));
      const ms = xs.map(motivoDe);
      const melhor = ms.length ? Math.min(...ms.map(m => idx[m])) : MOTIVOS.length;
      blocos.push({ keys, rot: p ? p[2] : '', itens: xs, motivo: ms.length ? MOTIVOS[melhor].k : '', n: ms.filter(m => idx[m] === melhor).length, ordem, nivel: melhor });
    });
    return blocos.sort((a, b) => (a.nivel - b.nivel) || (b.n - a.n) || (b.itens.length - a.itens.length) || (a.ordem - b.ordem)).map(b => { delete b.ordem; delete b.nivel; return b; });
  }
  // Lista de "o que fazer agora" (Hoje): tudo que espera o escritório ou tem prazo legal; o que está com o cliente não entra
  function prioridades(items) { return ordemFila(items).filter(p => p.motivo !== 'cliente'); }
  function contarMotivos(items) {
    const c = Object.fromEntries(MOTIVOS.map(m => [m.k, 0]));
    for (const i of items || []) c[motivoDe(i)]++;
    return c;
  }

  // Próximo passo de uma pendência, em poucas palavras (Hoje: próximos passos, carrossel e rodapé dos cartões).
  // Nunca cita prazo interno: só o prazo legal e a idade da solicitação.
  function acaoDe(i, motivo) {
    const d = i.parado || 0, dias = n => n + (n === 1 ? ' dia' : ' dias');
    const dd = ymd => ymd ? ymd.slice(8, 10) + '/' + ymd.slice(5, 7) : '';
    switch (motivo || motivoDe(i)) {
      case 'legal': {
        if (i.acidente) return i.acidenteCat === false ? 'Acidente de trabalho · conferir a CAT e o benefício' : 'Acidente de trabalho · emitir a CAT';
        if (i.prazoLegal && i.prazoLegal.faltam <= 1) return (i.prazoLegal.faltam < 0 ? 'Pagamento venceu em ' : 'Pagamento até ') + dd(i.prazoLegal.alvo) + ' (prazo legal)';
        const a = i.admissaoAlerta;
        return a ? (a.estagio ? 'eSocial do estágio até ' + dd(a.prazo) : a.retro ? 'Admissão retroativa · eSocial' : 'Admissão em ' + dd(a.data) + ' · eSocial') : 'Prazo legal';
      }
      case 'sem': return 'Fazer o 1º trâmite' + (i.uteisAberto ? ' · aberta há ' + i.uteisAberto + ' d.u.' : '');
      case 'respondeu': return 'Responder o cliente';
      case 'cliente': return 'Aguardando o cliente · ' + dias(d);
      default: return 'Dar andamento · parada há ' + dias(d);
    }
  }
  // Anel do cartão: quanto do limite já passou (vez do cliente: prescrição; do escritório: "parada").
  function progressoPrazo(i, s) {
    s = Object.assign({}, DEFAULTS, s || {});
    const limite = i.lado === 'cli' ? s.prescricaoDias : s.parada, d = Math.max(0, i.parado || 0);
    return { pct: Math.min(100, Math.round(d / Math.max(1, limite) * 100)), dias: d, limite };
  }

  /* ---------- painel da equipe na tela Hoje ---------- */
  // Tendência de cada pendência desde a leitura anterior (setas da barra viva). A marca vale por 2 horas.
  const TENDENCIA_MS = 2 * 3600000;
  function tendencias(anterior, snap, now) {
    now = now || new Date();
    if (!anterior || !anterior.items || !snap || !snap.items) return snap;   // primeira leitura: sem setas
    const antes = new Map(anterior.items.map(i => [i.k, i]));
    for (const it of snap.items) {
      const a = antes.get(it.k);
      const peso = x => (x.nivel || 0) * 10 + (x.grav || 0);
      let t = null;
      if (!a) t = 'nova';
      else if (peso(it) > peso(a)) t = 'piorou';
      else if (peso(it) < peso(a)) t = 'melhorou';
      if (t) { it.tend = t; it.tendEm = now.toISOString(); }
      else if (a.tend && a.tendEm && now - new Date(a.tendEm) < TENDENCIA_MS) { it.tend = a.tend; it.tendEm = a.tendEm; }
    }
    return snap;
  }
  // Faixas de dias parada do mapa de calor.
  const FAIXAS_IDADE = [{ de: 0, ate: 2, rot: '0–2 d' }, { de: 3, ate: 5, rot: '3–5 d' }, { de: 6, ate: 15, rot: '6–15 d' }, { de: 16, ate: 30, rot: '16–30 d' }, { de: 31, ate: null, rot: '31+ d' }];
  const faixaDe = parado => FAIXAS_IDADE.findIndex(f => (parado || 0) >= f.de && (f.ate == null || (parado || 0) <= f.ate));
  function mapaIdade(items) {
    const ordem = porAnalista(items).map(r => r.resp);
    const sem = '(sem responsável)';
    const resps = (ordem.includes(sem) ? [sem] : []).concat(ordem.filter(r => r !== sem));
    const linhas = resps.map(resp => ({ resp, por: FAIXAS_IDADE.map(() => 0), total: 0 }));
    const idx = new Map(linhas.map(l => [l.resp, l]));
    const totais = FAIXAS_IDADE.map(() => 0);
    for (const it of items) {
      const l = idx.get(it.resp || sem), f = faixaDe(it.parado);
      l.por[f]++; l.total++; totais[f]++;
    }
    return { linhas, totais };
  }
  // Para cada pendência sem responsável (da mais grave para a menos), quem está menos carregado.
  // Carga = pendências na vez do escritório, pesadas pela gravidade. Só sugestão: nada é atribuído.
  const pesoCarga = it => ({ 3: 4, 2: 3, 1: 2 }[it.grav] || 1);
  function cargaEscritorio(items) {
    const carga = new Map();
    for (const it of items) if (it.resp) carga.set(it.resp, (carga.get(it.resp) || 0) + (it.lado === 'esc' ? pesoCarga(it) : 0));
    return carga;
  }
  function sugerirDistribuicao(items) {
    const peso = pesoCarga;
    const carga = cargaEscritorio(items);
    if (!carga.size) return [];
    const sem = items.filter(i => !i.resp).sort((a, b) => ((b.nivel || 0) - (a.nivel || 0)) || ((b.grav || 0) - (a.grav || 0)) || ((b.parado || 0) - (a.parado || 0)));
    return sem.map(it => {
      const [quem, c] = [...carga.entries()].sort((a, b) => (a[1] - b[1]) || a[0].localeCompare(b[0], 'pt-BR'))[0];
      carga.set(quem, c + peso(it));
      return { k: it.k, sugerido: quem, carga: c };
    });
  }
  // Placar do dia: entradas, saídas, saldo e a fila agora comparada com o fim de ontem.
  function placarDoDia(serie, items, now) {
    now = now || new Date();
    const hoje = (serie || {})[ymd(now)] || {};
    const d = new Date(now); d.setDate(d.getDate() - 1);
    const ontem = (serie || {})[ymd(d)];
    const horas = ontem && ontem.horas ? Object.keys(ontem.horas).sort() : [];
    const filaOntem = horas.length ? ontem.horas[horas[horas.length - 1]] : null;
    const fila = (items || []).length;
    return { entradas: hoje.entradas || 0, saidas: hoje.saidas || 0, saldo: (hoje.entradas || 0) - (hoje.saidas || 0), fila, filaOntem, variacao: filaOntem == null ? null : fila - filaOntem };
  }

  /* ---------- eventos (alertas do sino e notificações) ----------
   * Compara duas leituras. Guarda só tipo, ID, cliente, motivo e hora: nada de descrição nem dados pessoais. */
  function eventos(anterior, snap, s, now) {
    s = Object.assign({}, DEFAULTS, s || {});
    if (!anterior || !anterior.items || !snap || !snap.items) return [];   // primeira leitura vira base
    const em = (now || new Date()).toISOString();
    const antes = new Map(anterior.items.concat(anterior.resolvidas || []).map(i => [i.k, i]));   // resolvida que volta não é nova
    const out = [];
    const ev = (tipo, it, titulo, meu) => out.push({ id: tipo + ':' + it.k + ':' + em, tipo, titulo, k: it.k, type: it.type, num: String(it.num), typeLabel: it.typeLabel, cliente: it.apelido || it.cliente || '', mine: meu == null ? !!it.mine : !!meu, em });
    for (const it of snap.items) {
      const a = antes.get(it.k);
      if (!a) {
        if (it.acidente && (it.mine || (s.modoGestor && !it.resp))) ev('acidente', it, 'Acidente de trabalho no afastamento', true);
        else if (it.mine) ev('nova', it, 'Nova solicitação para você');
        else if (!it.resp) ev('semresp', it, 'Nova solicitação sem responsável');
        continue;
      }
      const meu = it.mine || (s.modoGestor && !it.resp);
      if (meu && it.acidente && !a.acidente) ev('acidente', it, 'Acidente de trabalho no afastamento', true);
      if (it.mine && a.lado === 'cli' && it.lado === 'esc') ev('respondeu', it, 'Cliente respondeu');
      const lim = s.avisoLegalDias;
      if (meu && lim > 0 && it.prazoLegal && it.prazoLegal.faltam <= lim && !(a.prazoLegal && a.prazoLegal.faltam <= lim)) ev('legal', it, 'Prazo legal: pagamento ' + (it.prazoLegal.faltam < 0 ? 'venceu' : it.prazoLegal.faltam === 0 ? 'vence hoje' : 'em ' + it.prazoLegal.faltam + ' d.u.'), true);
      if (meu && it.lado === 'esc' && it.grav === 3 && !(a.lado === 'esc' && a.grav === 3)) ev('urgente', it, 'Solicitação urgente', true);
    }
    return out;
  }

  /* ---------- lembretes (pessoais, no Chrome de cada um) ---------- */
  function novoLembrete(dados, now) {
    now = now || new Date();
    const quando = new Date(dados.quando);
    if (isNaN(quando)) throw new Error('data inválida');
    const texto = String(dados.texto || '').trim().slice(0, 300);
    if (!texto) throw new Error('escreva o lembrete');
    return {
      id: 'l' + now.getTime().toString(36) + Math.random().toString(36).slice(2, 6),
      texto, quando: quando.toISOString(), criadoEm: now.toISOString(), feito: false, disparado: false,
      k: dados.k || null, type: dados.type || null, num: dados.num != null ? String(dados.num) : null, cliente: String(dados.cliente || '').slice(0, 120),
      rep: REPETICOES[dados.rep] ? dados.rep : 'nao'
    };
  }
  // Repetição de lembrete (igual à do Control Hub, sem o "a cada N").
  const REPETICOES = { nao: 'Não repete', diaria: 'Todo dia', util: 'Todo dia útil', semanal: 'Toda semana', mensal: 'Todo mês' };
  // diaMes: dia do mês original (um lembrete do dia 31 volta ao 31 depois de fevereiro).
  function proximaOcorrencia(quando, rep, feriados, diaMes) {
    const d = new Date(quando);
    if (rep === 'diaria') d.setDate(d.getDate() + 1);
    else if (rep === 'semanal') d.setDate(d.getDate() + 7);
    else if (rep === 'mensal') {
      const dia = diaMes || d.getDate();
      d.setDate(1); d.setMonth(d.getMonth() + 1);
      d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    } else if (rep === 'util') {
      const hol = new Set(feriados || []);
      do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6 || hol.has(ymd(d)));
    } else return null;
    return d;
  }
  // "Feito": o que repete pula para a próxima vez que ainda não passou; o resto é concluído.
  function concluirLembrete(l, now, feriados) {
    now = now || new Date();
    if (!l.rep || l.rep === 'nao') return Object.assign({}, l, { feito: true });
    const diaMes = l.diaMes || new Date(l.quando).getDate();
    let q = proximaOcorrencia(l.quando, l.rep, feriados, diaMes);
    for (let i = 0; q && q <= now && i < 800; i++) q = proximaOcorrencia(q, l.rep, feriados, diaMes);
    return Object.assign({}, l, { quando: q.toISOString(), feito: false, disparado: false }, l.rep === 'mensal' ? { diaMes } : {});
  }
  // modo: '1h' | 'amanha' (amanhã às 9h, pulando fim de semana)
  function adiarLembrete(l, modo, now) {
    now = now || new Date();
    let q;
    if (modo === '1h') q = new Date(now.getTime() + 3600000);
    else {
      q = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0);
      while (q.getDay() === 0 || q.getDay() === 6) q.setDate(q.getDate() + 1);
    }
    return Object.assign({}, l, { quando: q.toISOString(), disparado: false, feito: false });
  }
  function situacaoLembrete(l, now) {
    now = now || new Date();
    if (l.feito) return 'feito';
    const q = new Date(l.quando);
    if (q <= now) return 'atrasado';
    return ymd(q) === ymd(now) ? 'hoje' : 'proximo';
  }

  /* ---------- consultas sob demanda (tela Solicitações e detalhe) ---------- */
  // filtro: 'pendentes' | 'todas'; uma solicitação específica: { numero }
  function urlConsulta(t, o) {
    o = o || {};
    const p = new URLSearchParams();
    const per = Math.min(200, Math.max(1, o.per || 50)), page = Math.max(1, o.page || 1);
    p.set('itemsPerPage', per); p.set('pageIndex', page); p.set('startIndex', (page - 1) * per);
    p.set('orderBy', o.orderBy || 'lastUpdated desc');
    p.set('assignedtome', o.mine ? 'true' : 'false');
    p.set('expand', t.expand);
    if (o.search) p.set('searchText', String(o.search).slice(0, 100));
    const itens = [];
    if (o.numero != null) itens.push({ by: 'identifier', op: 'EQ', value: String(o.numero) });
    if (o.filtro === 'pendentes') {
      const fam = FAMILIAS[t.familia];
      if (fam.excluir) fam.excluir.forEach(v => itens.push({ by: 'firmStatus', op: 'NE', value: v }));
      else itens.push({ by: 'firmStatus', op: 'IN', value: fam.pendentes });
    }
    if (itens.length) p.set('filter', JSON.stringify({ groups: [{ useOr: false, items: itens }] }));
    return API + t.path + '?' + p.toString();
  }
  // Campos para a tela de detalhe. Só o que a pessoa precisa ver; nada disso é guardado.
  function detalheDe(t, r) {
    const base = normalize(t, r, null);
    return Object.assign(base, {
      assunto: r.subject || '',
      descricao: typeof r.description === 'string' ? r.description : '',
      meio: r.requestWay || '',
      departamento: (r.departmentExpanded && r.departmentExpanded.name) || '',
      admissao: r.admissionDate || null,
      competencia: r.effectiveDate || null
    });
  }
  function tramitesDe(t, d) {
    const fam = FAMILIAS[t.familia];
    const grava = new Set(fam.clienteGrava);
    const lista = (d && d.items) || (Array.isArray(d) ? d : []);
    return lista.filter(x => x && x.created && !x.deletedTopic).sort((a, b) => String(a.created).localeCompare(String(b.created))).map((x, i) => {
      const arquivos = arquivosDe(x.attachmentsExpanded, 30);
      return {
        n: i + 1,
        id: typeof x.id === 'string' ? x.id : null,          // id do trâmite (para baixar os anexos dele)
        em: x.created,
        situacao: (fam.st[x.status] || DESCONHECIDO(x.status))[0],
        // quem escreveu: pela situação que o trâmite gravou (as do cliente estão em clienteGrava); o 1º é a abertura
        lado: i === 0 || grava.has(Number(x.status)) ? 'cli' : 'esc',
        autor: (x.createdByContactExpanded && x.createdByContactExpanded.name) || (x.createdByExpanded && x.createdByExpanded.name) || '',
        texto: typeof x.description === 'string' ? x.description : '',
        anexos: arquivos.map(a => a.nome),
        arquivos
      };
    });
  }
  // Anexos de um registro do Onvio: id e nome (lidos na hora, nunca guardados).
  function arquivosDe(lista, max) {
    return (Array.isArray(lista) ? lista : []).filter(a => a && (a.name || a.fileName)).slice(0, max || 50)
      .map(a => {
        const f = { id: typeof a.id === 'string' || typeof a.id === 'number' ? String(a.id) : null, nome: String(a.name || a.fileName) };
        // Cadastro e Rubricas trazem staticFilePath: endereço do arquivo que o Onvio serve sem login (visto em 22/10/2026)
        if (typeof a.staticFilePath === 'string' && a.staticFilePath.length < 800 && /^https:\/\/onvio\.com\.br\/api\/storage\//i.test(a.staticFilePath) && leituraAnexoPermitida(a.staticFilePath)) f.direto = a.staticFilePath;
        return f;
      });
  }

  /* ---------- baixar anexos escolhendo ----------
   * O caminho de download não foi mapeado: o acao-hook.js aprende o MOLDE quando o próprio Onvio baixa um anexo
   * (GET), com os ids trocados pelo nome do segmento anterior ({tickets}, {topics}, {attachments}) e o nome do
   * arquivo por {nome}. Nada de ids, nomes ou tokens no molde. Só GET, só em onvio.com.br. */
  const SEG_TECNICO = /^(?:[a-z][a-z0-9-]*|v\d+)$/i;
  const POS_ID = /^(download|downloads|content|file|files|attachment|attachments|view|preview|raw|data|blob|stream|bytes|binary|v\d+)$/i;
  const SEG_ID = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{3,})$/i;
  function moldeDeAnexo(url) {
    let u;
    try { u = new URL(url); } catch (e) { return null; }
    if (u.protocol !== 'https:' || !/(^|\.)onvio\.com\.br$/i.test(u.hostname) || u.username || u.password) return null;
    const segs = u.pathname.split('/').map(x => { try { return decodeURIComponent(x); } catch (e) { return x; } });
    const primeiroId = segs.findIndex(x => SEG_ID.test(x));
    // Depois do primeiro id, palavra só fica se for nome de coleção (vem um id em seguida) ou uma das técnicas
    // conhecidas; o resto pode ser o nome do arquivo e vira {nome}.
    const out = segs.map((x, i) => {
      if (!x) return x;
      if (SEG_ID.test(x)) return '{' + (segs[i - 1] && SEG_TECNICO.test(segs[i - 1]) ? segs[i - 1].toLowerCase() : 'id') + '}';
      if (!SEG_TECNICO.test(x)) return '{nome}';
      if (primeiroId < 0 || i < primeiroId || SEG_ID.test(segs[i + 1] || '') || POS_ID.test(x)) return x;
      return '{nome}';
    });
    const q = [];
    for (const [k, v] of u.searchParams) {
      if (!/^[A-Za-z][\w-]{0,30}$/.test(k)) return null;
      if (SEG_ID.test(v)) q.push(k + '={id}');
      else if (/^(true|false|\d{1,4}|[a-z_-]{1,20})$/i.test(v)) q.push(k + '=' + v);
      else return null;                                            // valor que pode ser dado ou token: não aprende
    }
    const m = u.origin + out.join('/') + (q.length ? '?' + q.join('&') : '');
    return /\{(attachments?|files?|anexos?|documents?)\}|\{id\}/i.test(m) ? m.slice(0, 400) : null;
  }
  const papelDoId = nome => (/^topics?$/i.test(nome) ? 'topico' : /^(attachments?|files?|anexos?|documents?)$/i.test(nome) ? 'anexo' : nome === 'id' ? 'anexo' : 'sol');
  // Caminhos mapeados no Onvio real em 22/10/2026: GET .../attachments/{id} devolve { downloadUrl } e o arquivo vem de lá
  // (mesmo domínio, sem precisar do cabeçalho de autorização). Geral e folha: abertura e trâmite; Rubricas: trâmite (a abertura
  // não tem anexo); Cadastro: só pelo staticFilePath, ou pelo molde que a extensão aprender (a rota não foi vista).
  function rotaAnexoFixa(t, ids) {
    if (!t || !ids || !ids.sol || !ids.anexo) return null;
    const base = API + t.tramites + '/' + encodeURIComponent(ids.sol);
    const fim = '/attachments/' + encodeURIComponent(ids.anexo);
    if (ids.topico) return t.familia === 'cadastro' ? null : { url: base + '/topics/' + encodeURIComponent(ids.topico) + fim, campo: 'downloadUrl' };
    return t.familia === 'padrao' ? { url: base + fim, campo: 'downloadUrl' } : null;
  }
  // Endereço de um anexo: pela rota mapeada ou, na falta dela, pelo molde aprendido (com ou sem trâmite).
  function urlAnexo(t, ids, rotas) {
    const fixa = rotaAnexoFixa(t, ids);
    if (fixa && leituraAnexoPermitida(fixa.url)) return fixa;
    const base = API.replace(/\/$/, '');
    const cand = (rotas || []).map(r => (typeof r === 'string' ? { molde: r } : r)).filter(r => r && typeof r.molde === 'string');
    const soDoAnexo = m => (m.match(/\{[a-z-]+\}/gi) || []).every(x => papelDoId(x.slice(1, -1)) === 'anexo' || x === '{nome}');
    const nota = r => r.molde.includes(base + '/' + t.tramites + '/') ? 3 : r.molde.includes(base + '/' + t.path + '/') ? 2 : soDoAnexo(r.molde) ? 1 : 0;
    for (const r of cand.filter(r => nota(r) > 0).sort((a, b) => nota(b) - nota(a))) {
      let falta = false;
      const u = r.molde.replace(/\{([a-z-]+)\}/gi, (x, nome) => {
        if (nome === 'nome') return ids.nome ? encodeURIComponent(ids.nome) : (falta = true, '');
        const v = ids[papelDoId(nome)];
        if (!v) { falta = true; return ''; }
        return encodeURIComponent(v);
      });
      if (!falta && leituraAnexoPermitida(u)) return { url: u, campo: r.campo || null };
    }
    return null;
  }
  function leituraAnexoPermitida(url) {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' && /(^|\.)onvio\.com\.br$/i.test(u.hostname) && !u.username && !/\/(delete|remove|assign-staff|change-due-date)(\/|$)/i.test(u.pathname);
    } catch (e) { return false; }
  }

  /* ---------- datas "só dia" do Onvio (AAAA-MM-DDT00:00:00): dia local, sem fuso ---------- */
  function diaDe(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  const somaDias = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
  // dias úteis de hoje até "alvo" (negativo se já passou)
  function uteisAte(now, alvo, feriados) {
    const hoje = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return alvo >= hoje ? diasUteis(hoje, alvo, feriados) : -diasUteis(alvo, hoje, feriados);
  }
  // pagamento que cai em sábado, domingo ou feriado é antecipado para o dia útil anterior
  function utilAntes(d, feriados) {
    const hol = feriados instanceof Set ? feriados : new Set(feriados || []);
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    while (x.getDay() === 0 || x.getDay() === 6 || hol.has(ymd(x))) x.setDate(x.getDate() - 1);
    return x;
  }
  // soma n dias úteis a uma data
  function somaUteis(d, n, feriados) {
    const hol = feriados instanceof Set ? feriados : new Set(feriados || []);
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    while (n > 0) { x.setDate(x.getDate() + 1); const wd = x.getDay(); if (wd !== 0 && wd !== 6 && !hol.has(ymd(x))) n--; }
    return x;
  }

  /* ---------- detalhe completo (aba Dados) ----------
   * GET {detalhe ou lista}/{id}?expand=all traz tudo o que compõe a solicitação. É lido na hora e mostrado; nunca
   * guardado. camposDetalhe transforma o registro em grupos de campos com rótulos em português; campo novo do Onvio
   * aparece com o nome técnico traduzido de forma simples, para nada ficar escondido. */
  function urlDetalhe(t, id) { return API + (t.detalhe || t.path) + '/' + encodeURIComponent(id) + '?expand=all'; }
  const ROTULOS = {
    subject: 'Assunto', description: 'Descrição', requestWay: 'Meio da solicitação', serviceRequestType: 'Tipo de solicitação',
    created: 'Aberta em', changed: 'Alterada em', lastUpdated: 'Último trâmite', genericLastUpdated: 'Último trâmite', lastStatusChanged: 'Situação alterada em',
    dueDate: 'Expectativa de conclusão', admissionDate: 'Data de admissão', startDate: 'Início', endDate: 'Fim', extensionEnd: 'Fim da prorrogação',
    name: 'Nome', socialName: 'Nome social', nationalIdentity: 'CPF', wage: 'Salário', category: 'Categoria', comments: 'Observações',
    dailyHours: 'Horas por dia', weeklyHours: 'Horas por semana', monthlyHours: 'Horas por mês', daysExperience: 'Dias de experiência',
    extensionDays: 'Dias de prorrogação', employmentRelationship: 'Vínculo', firstJob: 'Primeiro emprego', frequencyCard: 'Cartão ponto',
    registration: 'Matrícula', teacher: 'Professor', employeeRegistrationType: 'Tipo de cadastro',
    vacationStartDate: 'Início das férias', noticeDate: 'Data do aviso', paymentDate: 'Data do pagamento', bonusDays: 'Dias de abono',
    vacationDays: 'Dias de férias', payBonusDays: 'Pagar abono', payFirstInstallmentEarlier: 'Adiantar 1ª parcela do 13º',
    adviceDate: 'Data do aviso', grantedBy: 'Aviso dado por', terminationReason: 'Motivo da rescisão', terminationType: 'Tipo de rescisão',
    resignationDate: 'Data do desligamento', priorNoticeAdviceDate: 'Data do aviso prévio', leaveDate: 'Data do afastamento',
    effectiveDate: 'Competência', entryType: 'Tipo de lançamento', detailAbsentDay: 'Faltas', detailServiceEntry: 'Lançamentos',
    clientExpanded: 'Cliente', clientEmployeeExpanded: 'Empregado', staffResponsibleExpanded: 'Responsável', requesterExpanded: 'Solicitante',
    createdByContactExpanded: 'Cadastrada por', jobPositionExpanded: 'Cargo', departmentExpanded: 'Departamento', costCenterExpanded: 'Centro de custo',
    serviceExpanded: 'Serviço', employeeLeaveTypeExpanded: 'Tipo de afastamento', payrollEntryConfigurationHeaderExpanded: 'Configuração do lançamento',
    payrollEntryClientEmployeeExpanded: 'Empregados do lançamento', employeeRegistrationPersonalExpanded: 'Dados pessoais',
    employeeRegistrationProfessionalExpanded: 'Dados profissionais', code: 'Código', nickname: 'Apelido', value: 'Valor', amount: 'Valor',
    quantity: 'Quantidade', hours: 'Horas', days: 'Dias', rubric: 'Rubrica', email: 'E-mail', phone: 'Telefone', birthDate: 'Nascimento',
    hireDate: 'Admissão', clientEmployeeRelationship: 'Vínculo', reason: 'Motivo', priorNotice: 'Tem aviso prévio', calculation: 'Pede cálculo',
    internshipOption: 'Opção de estágio', registrationNumber: 'Matrícula', pis: 'PIS', ctps: 'CTPS', cpf: 'CPF', gender: 'Sexo',
    terminationReasonExpanded: 'Motivo da rescisão', noticeType: 'Tipo do aviso', workedNotice: 'Aviso trabalhado', reduction: 'Redução da jornada',
    terminationDate: 'Data do término', lastWorkDay: 'Último dia trabalhado', clientEmployeeRelationshipExpanded: 'Vínculo', customFields: 'Campos adicionais',
    displayStatus: 'Situação', assignedTo: 'Atribuída a', isReadByClientUser: 'Lida pelo cliente', nickName: 'Apelido', clientName: 'Cliente',
    staffName: 'Responsável', mimeType: 'Tipo do arquivo', fileName: 'Arquivo', createdDate: 'Criada em', modifiedDate: 'Alterada em',
    expirationDate: 'Vencimento', sendDate: 'Enviada em', requestType: 'Tipo de solicitação', createdBy: 'Criada por', size: 'Tamanho',
    prescribePendingTicketsDays: 'Dias para prescrever', forwardedToExpanded: 'Encaminhada para', employeeRegistrationTopicNumber: 'Trâmite nº',
    payrollEntryTopicNumber: 'Trâmite nº', motherName: 'Nome da mãe', fatherName: 'Nome do pai', maritalStatus: 'Estado civil',
    educationLevel: 'Escolaridade', nationality: 'Nacionalidade', race: 'Raça/cor', address: 'Endereço', street: 'Rua', number: 'Número',
    complement: 'Complemento', neighborhood: 'Bairro', city: 'Cidade', state: 'UF', zipCode: 'CEP', country: 'País', bank: 'Banco',
    agency: 'Agência', account: 'Conta', dependents: 'Dependentes', relationship: 'Parentesco', workSchedule: 'Horário de trabalho',
    salaryType: 'Tipo de salário', paymentType: 'Forma de pagamento', experienceContract: 'Contrato de experiência', union: 'Sindicato',
    institution: 'Instituição de ensino', course: 'Curso', supervisor: 'Supervisor', scholarship: 'Bolsa', insurance: 'Seguro',
    returnDate: 'Data de retorno', cid: 'CID', doctor: 'Médico', crm: 'CRM', certificate: 'Atestado', note: 'Observação', notes: 'Observações',
    observation: 'Observação', observations: 'Observações', title: 'Título', type: 'Tipo', status: 'Situação', active: 'Ativo'
  };
  // valores técnicos (enumerações) que o Onvio manda em inglês; o que não estiver aqui aparece como veio
  const VALORES = {
    EMPLOYEE: 'Empregado', INTERN: 'Estagiário', TAXPAYER: 'Contribuinte', PARTNER: 'Sócio', DIRECTOR: 'Diretor', APPRENTICE: 'Aprendiz',
    INDEMNIFIED: 'Indenizado', WORKED: 'Trabalhado', MONTHLY: 'Mensal', HOURLY: 'Por hora', DAILY: 'Diário', WEEKLY: 'Semanal',
    EMPLOYER: 'Empregador', MALE: 'Masculino', FEMALE: 'Feminino', PORTAL: 'Portal do Cliente', EMAIL: 'E-mail', PHONE: 'Telefone',
    WEB: 'Portal (web)', MOBILE: 'Aplicativo', PRIOR_NOTICE_TERMINATION: 'Aviso prévio de rescisão', TERMINATION_CALCULATION: 'Cálculo de rescisão',
    PRIOR_NOTICE_VACATION: 'Aviso de férias', VACATION_CALCULATION: 'Cálculo de férias', EMPLOYEE_LEAVE: 'Afastamento', PAYROLL_ENTRY: 'Lançamento de rubricas',
    GENERIC: 'Geral', ADVANCE: 'Adiantamento', THIRTEENTH: '13º salário', VACATION: 'Férias', TERMINATION: 'Rescisão', SINGLE: 'Solteiro(a)',
    MARRIED: 'Casado(a)', DIVORCED: 'Divorciado(a)', WIDOWED: 'Viúvo(a)', SEPARATED: 'Separado(a)', STABLE_UNION: 'União estável', YES: 'Sim', NO: 'Não',
    NONE: 'Nenhum', OTHER: 'Outro', OTHERS: 'Outros', PENDING: 'Pendente', APPROVED: 'Aprovado', REJECTED: 'Recusado', ACTIVE: 'Ativo', INACTIVE: 'Inativo',
    SICK_LEAVE: 'Afastamento por doença', ILLNESS: 'Doença', WORK_ACCIDENT: 'Acidente de trabalho', MATERNITY_LEAVE: 'Licença-maternidade',
    PATERNITY_LEAVE: 'Licença-paternidade', MILITARY_SERVICE: 'Serviço militar', UNPAID_LEAVE: 'Licença não remunerada', PAID_LEAVE: 'Licença remunerada',
    WITH_CAUSE: 'Com justa causa', WITHOUT_CAUSE: 'Sem justa causa', WITH_JUST_CAUSE: 'Com justa causa', WITHOUT_JUST_CAUSE: 'Sem justa causa',
    RESIGNATION: 'Pedido de demissão', DISMISSAL: 'Dispensa', AGREEMENT: 'Acordo entre as partes', MUTUAL_AGREEMENT: 'Acordo entre as partes',
    END_OF_CONTRACT: 'Término de contrato', CONTRACT_END: 'Término de contrato', EXPERIENCE_END: 'Fim do contrato de experiência', DEATH: 'Falecimento',
    RETIREMENT: 'Aposentadoria', TRANSFER: 'Transferência', FULL_TIME: 'Tempo integral', PART_TIME: 'Tempo parcial', INTERMITTENT: 'Intermitente',
    TEMPORARY: 'Temporário', INDEFINITE: 'Indeterminado', DEFINITE: 'Determinado', CLT: 'CLT'
  };
  // Palavras soltas (campos e valores que o Onvio venha a mandar e ainda não estão acima): traduz palavra por palavra;
  // se sobrar alguma sem tradução, mostra como veio (melhor o nome técnico do que uma frase pela metade).
  const PALAVRAS = {
    date: 'data', start: 'início', end: 'fim', type: 'tipo', reason: 'motivo', name: 'nome', number: 'número', value: 'valor', days: 'dias',
    day: 'dia', hours: 'horas', hour: 'hora', employee: 'empregado', employer: 'empregador', client: 'cliente', company: 'empresa', staff: 'escritório',
    notice: 'aviso', prior: 'prévio', termination: 'rescisão', vacation: 'férias', leave: 'afastamento', payment: 'pagamento', salary: 'salário',
    wage: 'salário', bonus: 'abono', advance: 'adiantamento', first: 'primeiro', last: 'último', work: 'trabalho', worked: 'trabalhado', job: 'cargo',
    position: 'cargo', department: 'departamento', cost: 'custo', center: 'centro', description: 'descrição', comments: 'observações', note: 'observação',
    document: 'documento', documents: 'documentos', file: 'arquivo', files: 'arquivos', attachment: 'anexo', attachments: 'anexos', created: 'criado',
    updated: 'atualizado', changed: 'alterado', by: 'por', at: 'em', of: 'de', the: '', and: 'e', or: 'ou', with: 'com', without: 'sem', is: '', has: 'tem',
    total: 'total', amount: 'valor', quantity: 'quantidade', code: 'código', status: 'situação', request: 'solicitação', requester: 'solicitante',
    registration: 'cadastro', personal: 'pessoal', professional: 'profissional', address: 'endereço', phone: 'telefone', email: 'e-mail',
    birth: 'nascimento', mother: 'mãe', father: 'pai', dependent: 'dependente', dependents: 'dependentes', category: 'categoria', union: 'sindicato',
    contract: 'contrato', experience: 'experiência', extension: 'prorrogação', weekly: 'semanal', monthly: 'mensal', daily: 'diário', yes: 'sim', no: 'não',
    active: 'ativo', inactive: 'inativo', pending: 'pendente', other: 'outro', calculation: 'cálculo', calculate: 'calcular', entry: 'lançamento',
    entries: 'lançamentos', payroll: 'folha', rubric: 'rubrica', absent: 'falta', absence: 'falta', medical: 'médico', certificate: 'atestado',
    return: 'retorno', expected: 'previsto', due: 'prazo', expiration: 'vencimento', send: 'envio', sent: 'enviado', read: 'lido', user: 'usuário',
    internship: 'estágio', intern: 'estagiário', taxpayer: 'contribuinte', partner: 'sócio', option: 'opção', schedule: 'horário', shift: 'turno',
    indemnified: 'indenizado', reduction: 'redução', paid: 'pago', unpaid: 'não pago', count: 'quantidade', size: 'tamanho', title: 'título'
  };
  // Mais termos de DP e de cadastro que o Onvio usa nos campos (para nada aparecer em inglês)
  Object.assign(PALAVRAS, {
    marital: 'civil', education: 'escolaridade', level: 'nível', race: 'raça', color: 'cor', nationality: 'nacionalidade', gender: 'sexo', sex: 'sexo',
    zip: 'CEP', postal: 'postal', street: 'logradouro', neighborhood: 'bairro', district: 'bairro', city: 'cidade', state: 'estado', country: 'país',
    complement: 'complemento', bank: 'banco', agency: 'agência', branch: 'agência', account: 'conta', pix: 'Pix', key: 'chave', digit: 'dígito',
    voter: 'eleitor', identity: 'identidade', card: 'carteira', issuing: 'emissor', issuer: 'emissor', issue: 'emissão', issued: 'emitido', body: 'órgão',
    transport: 'transporte', voucher: 'vale', meal: 'refeição', food: 'alimentação', health: 'saúde', plan: 'plano', dental: 'odontológico',
    workload: 'carga horária', admission: 'admissão', hiring: 'contratação', hire: 'admissão', hired: 'admitido', dismissal: 'dispensa',
    contribution: 'contribuição', disability: 'deficiência', disabilities: 'deficiências', previous: 'anterior', current: 'atual', method: 'forma',
    place: 'local', series: 'série', serie: 'série', holder: 'titular', relationship: 'vínculo', kinship: 'parentesco', spouse: 'cônjuge', child: 'filho',
    children: 'filhos', retired: 'aposentado', pension: 'pensão', gross: 'bruto', net: 'líquido', discount: 'desconto', discounts: 'descontos',
    overtime: 'hora extra', night: 'noturno', shift: 'turno', allowance: 'auxílio', hazard: 'periculosidade', unhealthy: 'insalubridade',
    commission: 'comissão', gratification: 'gratificação', function: 'função', role: 'função', sector: 'setor', area: 'área', unit: 'unidade',
    reference: 'referência', competence: 'competência', period: 'período', month: 'mês', months: 'meses', year: 'ano', years: 'anos', week: 'semana',
    base: 'base', rate: 'taxa', percentage: 'percentual', percent: 'percentual', factor: 'fator', limit: 'limite', minimum: 'mínimo', maximum: 'máximo',
    initial: 'inicial', final: 'final', new: 'novo', old: 'antigo', next: 'próximo', notes: 'observações', justification: 'justificativa',
    approval: 'aprovação', approved: 'aprovado', rejected: 'recusado', signed: 'assinado', signature: 'assinatura', origin: 'origem', source: 'origem',
    destination: 'destino', channel: 'canal', way: 'meio', mode: 'modo', kind: 'tipo', group: 'grupo', grade: 'grau', stage: 'etapa', phase: 'fase',
    hours: 'horas', minutes: 'minutos', weekly: 'semanal', interval: 'intervalo', break: 'intervalo', rest: 'descanso', entry: 'entrada', exit: 'saída',
    doctor: 'médico', clinic: 'clínica', exam: 'exame', admissional: 'admissional', occupational: 'ocupacional', accident: 'acidente', illness: 'doença',
    sick: 'doença', maternity: 'maternidade', paternity: 'paternidade', military: 'militar', service: 'serviço', services: 'serviços', benefit: 'benefício',
    benefits: 'benefícios', insurance: 'seguro', life: 'vida', reason: 'motivo', cause: 'causa', just: 'justa', remuneration: 'remuneração', fixed: 'fixo',
    variable: 'variável', hourly: 'por hora', paid: 'pago', worked: 'trabalhado', social: 'social', fantasy: 'fantasia', legal: 'jurídico', trade: 'comercial',
    regime: 'regime', model: 'modelo', template: 'modelo', link: 'vínculo', apprentice: 'aprendiz', teacher: 'professor', manager: 'gestor',
    supervisor: 'supervisor', responsible: 'responsável', contact: 'contato', contacts: 'contatos', mobile: 'celular', cell: 'celular', home: 'residencial',
    commercial: 'comercial', street_number: 'número', observation: 'observação', observations: 'observações', situation: 'situação', topic: 'trâmite',
    agreement: 'acordo', between: 'entre', parties: 'as partes', party: 'parte', topics: 'trâmites', answer: 'resposta', response: 'resposta', question: 'pergunta', forwarded: 'encaminhado', assigned: 'atribuído', assignee: 'responsável'
  });
  Object.assign(ROTULOS, {
    maritalStatus: 'Estado civil', educationLevel: 'Escolaridade', schooling: 'Escolaridade', raceColor: 'Raça/cor', race: 'Raça/cor', gender: 'Sexo',
    nationality: 'Nacionalidade', birthPlace: 'Naturalidade', placeOfBirth: 'Naturalidade', motherName: 'Nome da mãe', fatherName: 'Nome do pai',
    zipCode: 'CEP', postalCode: 'CEP', street: 'Logradouro', streetNumber: 'Número', neighborhood: 'Bairro', city: 'Cidade', state: 'UF', complement: 'Complemento',
    bankCode: 'Banco', bankAgency: 'Agência', bankAccount: 'Conta', accountDigit: 'Dígito da conta', pixKey: 'Chave Pix', voterTitle: 'Título de eleitor',
    identityCard: 'RG', rg: 'RG', issuingBody: 'Órgão emissor', issueDate: 'Data de emissão', cnh: 'CNH', workCard: 'CTPS', workCardSeries: 'Série da CTPS',
    pisNumber: 'PIS', transportVoucher: 'Vale-transporte', mealVoucher: 'Vale-refeição', foodVoucher: 'Vale-alimentação', healthPlan: 'Plano de saúde',
    dentalPlan: 'Plano odontológico', workSchedule: 'Horário de trabalho', workload: 'Carga horária', admissionType: 'Tipo de admissão', contractType: 'Tipo de contrato',
    disability: 'Deficiência', disabilityType: 'Tipo de deficiência', previousEmployer: 'Empregador anterior', cbo: 'CBO', salaryType: 'Tipo de salário',
    paymentMethod: 'Forma de pagamento', terminationDate: 'Data do desligamento', lastWorkDay: 'Último dia trabalhado', returnDate: 'Data de retorno',
    expectedReturnDate: 'Retorno previsto', cid: 'CID', doctorName: 'Nome do médico', crm: 'CRM', competence: 'Competência', unionName: 'Sindicato',
    unionContribution: 'Contribuição sindical', costCenter: 'Centro de custo', jobPosition: 'Cargo', department: 'Departamento', hireDate: 'Admissão',
    clientEmployeeRelationship: 'Vínculo', employeeName: 'Empregado', clientEmployeeName: 'Empregado', rubricCode: 'Código da rubrica', rubricName: 'Rubrica',
    hoursQuantity: 'Quantidade de horas', daysQuantity: 'Quantidade de dias', basis: 'Competência'
  });
  Object.assign(VALORES, {
    WHITE: 'Branca', BLACK: 'Preta', BROWN: 'Parda', YELLOW: 'Amarela', INDIGENOUS: 'Indígena', NOT_INFORMED: 'Não informado', UNINFORMED: 'Não informado',
    ILLITERATE: 'Analfabeto', ELEMENTARY: 'Fundamental', ELEMENTARY_INCOMPLETE: 'Fundamental incompleto', ELEMENTARY_COMPLETE: 'Fundamental completo',
    HIGH_SCHOOL: 'Médio', HIGH_SCHOOL_INCOMPLETE: 'Médio incompleto', HIGH_SCHOOL_COMPLETE: 'Médio completo', COLLEGE: 'Superior',
    COLLEGE_INCOMPLETE: 'Superior incompleto', COLLEGE_COMPLETE: 'Superior completo', HIGHER_EDUCATION: 'Superior', POSTGRADUATE: 'Pós-graduação',
    MASTER: 'Mestrado', DOCTORATE: 'Doutorado', DETERMINED: 'Prazo determinado', UNDETERMINED: 'Prazo indeterminado', INDETERMINATE: 'Prazo indeterminado',
    FIXED_TERM: 'Prazo determinado', CLT: 'CLT', CHECKING: 'Corrente', SAVINGS: 'Poupança', SALARY: 'Salário', CPF: 'CPF', CNPJ: 'CNPJ', RANDOM: 'Aleatória',
    TERMINATION_BY_AGREEMENT_BETWEEN_THE_PARTIES: 'Rescisão por acordo entre as partes', TERMINATION_WITHOUT_JUST_CAUSE: 'Rescisão sem justa causa', TERMINATION_WITH_JUST_CAUSE: 'Rescisão com justa causa',
    DAY: 'Dia', NIGHT: 'Noite', PARTIAL: 'Parcial', FULL: 'Integral', OPEN: 'Aberto', CLOSED: 'Fechado', DONE: 'Concluído', CANCELED: 'Cancelado', CANCELLED: 'Cancelado'
  });
  // Em inglês o principal vem por último ("expected return date"); em português, primeiro ("data de retorno prevista").
  const ADJ = new Set(['previsto', 'pago', 'não pago', 'ativo', 'inativo', 'pendente', 'prévio', 'trabalhado', 'indenizado', 'mensal', 'semanal', 'diário', 'pessoal', 'profissional', 'médico', 'criado', 'atualizado', 'alterado', 'enviado', 'lido', 'total']);
  const ANTES = new Set(['primeiro', 'último']);
  const PREP = new Set(['por', 'em', 'de', 'e', 'ou', 'com', 'sem', 'tem', 'entre']);
  // parcial: mantém a palavra que não conhece (em vez de desistir da frase toda)
  function traduzirPalavras(lista, parcial) {
    const out = []; let conhecidas = 0;
    for (const w of lista) { const t = PALAVRAS[w.toLowerCase()]; if (t === undefined) { if (!parcial) return null; out.push(w.toLowerCase()); } else { conhecidas++; if (t) out.push(t); } }
    if (!out.length || !conhecidas) return null;
    if (out.length === 1 || out.some(w => PREP.has(w))) return out.join(' ');
    const nucleo = out[out.length - 1], resto = out.slice(0, -1).reverse();
    let frase = nucleo, antes = '';
    for (const w of resto) { if (ANTES.has(w)) antes = w + ' '; else if (ADJ.has(w)) frase += ' ' + w; else frase += ' de ' + w; }
    return antes + frase;
  }
  // Fora da aba Dados: o que já está no topo da janela (cliente, responsável, datas, solicitante) e o que só serve ao
  // sistema (tipo técnico, meio, quem cadastrou, quando foi alterada). A aba fica com o que é preciso para atender.
  const FORA_DADOS = /^(serviceRequestType|requestWay|changed|created|lastUpdated|genericLastUpdated|lastStatusChanged|dueDate|status|sortOrder|clientExpanded|staffResponsibleExpanded|requesterExpanded|createdByContactExpanded|departmentExpanded)$/;
  const OCULTO = /^(type|apiVersion|id|companyId|identifier|genericStatus|clientStatus|firmStatus|attachmentsExpanded|delete|deleted|staticFilePath|translationKey)$|Id$|Ids$/;
  const humano = k => {
    const partes = String(k).replace(/Expanded$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[\s_]+/).filter(Boolean);
    // como último recurso, traduz o que conhece e mantém só a palavra desconhecida (antes, a frase inteira ficava em inglês)
    const t = traduzirPalavras(partes) || traduzirPalavras(partes, true) || partes.join(' ');
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  const enumPt = v => { if (VALORES[v]) return VALORES[v]; const t = traduzirPalavras(v.toLowerCase().split('_'), true); return t ? t.charAt(0).toUpperCase() + t.slice(1) : v; };
  const rotulo = k => ROTULOS[k] || humano(k);
  function valorDe(k, v) {
    if (v == null || v === '') return '';
    if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
    if (typeof v === 'number') return /wage|salary|valor|amount/i.test(k) ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : String(v);
    if (typeof v === 'string') {
      if (/^\d{4}-\d{2}-\d{2}T00:00:00(\.0+)?Z?$/.test(v) || /^\d{4}-\d{2}-\d{2}$/.test(v)) { const d = diaDe(v); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear(); }
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) { const d = parseDate(v); if (d) return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
      if (/^[A-Z][A-Z_]{1,}$/.test(v)) return enumPt(v);
      // enumeração em PascalCase ("TerminationByAgreementBetweenTheParties"): vira a chave em maiúsculas e passa pelo dicionário
      if (/^[A-Z][a-z0-9]+([A-Z][a-z0-9]+)+$/.test(v)) return enumPt(v.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase());
      // enumeração em camelCase ("highSchoolComplete") ou minúsculas com _ ("not_informed"): só se for valor conhecido
      if (/^[a-z]+([A-Z][a-z]+)+$|^[a-z]+(_[a-z]+)+$/.test(v)) { const u = v.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase(); if (VALORES[u]) return VALORES[u]; }
      return v;
    }
    if (Array.isArray(v)) return v.map(x => (x && typeof x === 'object' ? x.name || x.description || x.value || '' : valorDe(k, x))).filter(Boolean).join(', ');
    if (typeof v === 'object') return v.name || v.description || (typeof v.value !== 'object' ? valorDe(k, v.value) : '') || '';
    return String(v);
  }
  // objeto "rico" (vários campos úteis) vira um grupo próprio; objeto só com nome vira uma linha
  const camposUteis = o => Object.entries(o).filter(([k, v]) => !OCULTO.test(k) && !FORA_DADOS.test(k) && v != null && v !== '' && !(Array.isArray(v) && !v.length));
  // Campos que mais importam para atender (datas que definem prazo, motivo, tipo, dias): ganham destaque sutil e vêm
  // primeiro no grupo. Salário e documentos ficam sem destaque de propósito.
  const RELEVANTE = /^(vacationStartDate|vacationEndDate|vacationDays|daysOfVacation|abonoDays|adviceDate|noticeDate|priorNotice\w*Date|priorNoticeType|resignationDate|lastWorkDay|terminationDate|terminationType|terminationReason|admissionDate|startDate|endDate|leaveDate|returnDate|expectedReturnDate|leaveDays|employeeLeaveType\w*|effectiveDate|paymentDate|competence|reason|category|employmentRelationship|subject)$/i;
  function camposDetalhe(t, d) {
    if (!d || typeof d !== 'object') return { grupos: [], anexos: [], arquivos: [] };
    const principal = { titulo: 'Solicitação', campos: [] }, grupos = [principal];
    for (const [k, v] of Object.entries(d)) {
      if (OCULTO.test(k) || FORA_DADOS.test(k) || v == null || v === '') continue;
      if (v && typeof v === 'object' && !Array.isArray(v) && camposUteis(v).length > 2) {
        const g = { titulo: rotulo(k), campos: [] };
        for (const [k2, v2] of camposUteis(v)) {
          if (v2 && typeof v2 === 'object' && !Array.isArray(v2) && camposUteis(v2).length > 2) {
            for (const [k3, v3] of camposUteis(v2)) { const x = valorDe(k3, v3); if (x) g.campos.push({ k: rotulo(k2) + ' · ' + rotulo(k3), v: x }); }
          } else { const x = valorDe(k2, v2); if (x) g.campos.push({ k: rotulo(k2), v: x, longo: /description|comments|observ/i.test(k2), destaque: RELEVANTE.test(k2) && !/subject/i.test(k2) }); }
        }
        if (g.campos.length) grupos.push(g);
        continue;
      }
      if (Array.isArray(v) && v.some(x => x && typeof x === 'object' && camposUteis(x).length > 2)) {
        const g = { titulo: rotulo(k), campos: [] };
        v.slice(0, 50).forEach((x, n) => { const linha = camposUteis(x).map(([k2, v2]) => { const y = valorDe(k2, v2); return y ? rotulo(k2) + ': ' + y : ''; }).filter(Boolean).join(' · '); if (linha) g.campos.push({ k: String(n + 1), v: linha }); });
        if (g.campos.length) grupos.push(g);
        continue;
      }
      const x = valorDe(k, v);
      if (x) principal.campos.push({ k: rotulo(k), v: x, longo: /description|comments|observ/i.test(k), destaque: RELEVANTE.test(k) });
    }
    const arquivos = arquivosDe(d.attachmentsExpanded, 50);
    const anexos = arquivos.map(a => a.nome);
    // sem repetição (mesmo rótulo e valor em dois lugares) e os textos longos (assunto, descrição) por último no grupo
    const vistos = new Set();
    grupos.forEach(g => {
      g.campos = g.campos.filter(c => { const ch = c.k + '\u0000' + c.v; if (vistos.has(ch)) return false; vistos.add(ch); return true; });
      g.campos.sort((a, b) => (a.longo ? 1 : 0) - (b.longo ? 1 : 0) || (b.destaque && !b.longo ? 1 : 0) - (a.destaque && !a.longo ? 1 : 0));
    });
    return { grupos: grupos.filter(g => g.campos.length), anexos, arquivos };
  }
  // Datas que importam para prazos e observações (só datas, sem dados pessoais)
  function datasDe(d) {
    d = d || {};
    const pick = k => (d[k] && /^\d{4}-\d{2}-\d{2}/.test(d[k]) ? String(d[k]).slice(0, 10) : null);
    return { inicio: pick('vacationStartDate'), aviso: pick('adviceDate') || pick('noticeDate') || pick('priorNoticeAdviceDate'), desligamento: pick('resignationDate'), admissao: pick('admissionDate') || pick('startDate'), competencia: pick('effectiveDate'), afastamento: pick('leaveDate'), pagamento: pick('paymentDate') };
  }

  /* ---------- prazo de pagamento de férias e rescisão ----------
   * Férias: até N dias antes do início (CLT art. 145). Rescisão: até N dias corridos após o término (CLT art. 477 §6º);
   * sem a data do desligamento, conta a partir da data do aviso (o caso mais apertado: aviso indenizado). */
  function prazoPagamento(tipo, datas, s) {
    s = Object.assign({}, DEFAULTS, s || {});
    const hol = s.feriados;
    if (/Ferias$/.test(tipo)) { const ini = diaDe(datas.inicio); return ini ? { alvo: utilAntes(somaDias(ini, -s.pagamentoFeriasAntes), hol), ref: 'início das férias em ' + fmtData(ini) } : null; }
    if (/Rescisao$/.test(tipo)) {
      const fim = diaDe(datas.desligamento), av = diaDe(datas.aviso);
      if (fim) return { alvo: utilAntes(somaDias(fim, s.pagamentoRescisaoDias), hol), ref: 'desligamento em ' + fmtData(fim) };
      if (av) return { alvo: utilAntes(somaDias(av, s.pagamentoRescisaoDias), hol), ref: 'aviso em ' + fmtData(av) + ' (sem data de desligamento: conta do aviso)' };
    }
    return null;
  }

  /* ---------- prazo legal de pagamento (férias e rescisão) ----------
   * Nas 4 listas de férias e rescisão, o vencimento que conta é o prazo legal de pagamento (não a expectativa do cliente).
   * A data vem do detalhe (lido uma vez por solicitação). Quando faltam "tempoOcupado" dias úteis ou menos (o tempo de
   * atendimento num período cheio), a solicitação ganha o motivo do prazo legal: atenção, ou fora do prazo com 1 dia útil
   * ou menos. Cache: só datas e quando leu. (A busca do cálculo do mesmo empregado, o "aviso sem cálculo", saiu em 22/10/2026.) */
  const PRAZO_LEGAL = new Set(['avisoFerias', 'calcFerias', 'avisoRescisao', 'calcRescisao']);
  // Afastamento por acidente de trabalho: as palavras aparecem no assunto, na descrição ou no tipo de afastamento do detalhe
  // (o campo do tipo, employeeLeaveTypeExpanded, ainda será confirmado no mapeamento: quando houver, o valor entra aqui)
  function temAcidente(d, s) {
    d = d || {};
    const tp = d.employeeLeaveTypeExpanded || {};
    const txt = textoPlano([d.subject, d.description, tp.name, tp.description, typeof d.leaveType === 'string' ? d.leaveType : ''].join(' '));
    return !!acharTrecho(txt, (s && s.acidentePalavras) || DEFAULTS.acidentePalavras);
  }
  // Marca o afastamento como acidente: motivo legal (CAT) no topo da fila, com o porquê
  // Pelo tipo do afastamento (employeeLeaveTypeId, que já vem na lista; mapeado em 22/10/2026): acidente de trabalho são os
  // tipos de acidenteTipoIds; os de acidenteCatIds exigem a CAT. Sem o tipo (lista antiga), vale a busca por palavras.
  const ehAcidenteTipo = (tipo, s) => Number.isInteger(tipo) && ((s && s.acidenteTipoIds) || DEFAULTS.acidenteTipoIds).includes(tipo);
  function marcarAcidente(it, s) {
    it.acidente = true;
    const cat = !Number.isInteger(it.tipoAfastamento) || ((s && s.acidenteCatIds) || DEFAULTS.acidenteCatIds).includes(it.tipoAfastamento);
    it.acidenteCat = cat;
    it.motivos = (it.motivos || []).filter(m => !m.acidente).concat([{ n: 2, m: 'Acidente de trabalho', legal: true, acidente: true, t: cat ? 'Afastamento por acidente de trabalho: a CAT (comunicação de acidente de trabalho) deve ser emitida até o 1º dia útil seguinte ao acidente' : 'Afastamento por acidente de trabalho: confira a CAT e o benefício do INSS' }]);
    if ((it.nivel || 0) < 2) { it.nivel = 2; }
    it.grav = Math.max(it.grav || 0, gravidade(it, TYPE_BY_KEY[it.type], Object.assign({}, DEFAULTS, s || {}), { nivel: 2, parado: it.parado, uteisAberto: it.uteisAberto, prescreveEm: it.prescreveEm }));
  }
  async function verificarAvisos(fetcher, out, cache, s, now) {
    const hol = new Set(s.feriados || []);
    const novo = {};
    let chamadas = 0;
    const LIMITE = 40;
    for (const it of out.items.filter(i => PRAZO_LEGAL.has(i.type) || i.type === 'afastamento')) {
      const c = Object.assign({}, cache[it.k] || {});
      try {
        if (c.erro && now - new Date(c.erro) < 864e5) { novo[it.k] = c; continue; }   // não insiste por 1 dia
        delete c.erro; delete c.calc; delete c.conf;   // sobras da busca do cálculo, que saiu
        if (it.type === 'afastamento' && Number.isInteger(it.tipoAfastamento)) {   // o tipo vem na lista: sem ler o detalhe
          if (ehAcidenteTipo(it.tipoAfastamento, s)) marcarAcidente(it, s);
          continue;
        }
        if (it.type === 'afastamento') {                        // sem o tipo na lista: lê o detalhe uma vez e guarda só o sinal
          if (c.acid === undefined && chamadas < LIMITE) { chamadas++; c.acid = temAcidente(await fetcher(urlDetalhe(TYPE_BY_KEY.afastamento, it.id)), s) ? 1 : 0; c.lido = true; }
          if (c.acid) marcarAcidente(it, s);
          novo[it.k] = c;
          continue;
        }
        const guardaAviso = it.type === 'avisoRescisao' || (it.type === 'calcRescisao' && it.tipoAviso === 'WORKED');
        const precisaAviso = guardaAviso && c.av === undefined;    // data do aviso: para o lembrete do aviso trabalhado
        if ((!c.lido || precisaAviso) && chamadas < LIMITE) {
          chamadas++;
          const dt = datasDe(await fetcher(urlDetalhe(TYPE_BY_KEY[it.type], it.id)));
          const p = prazoPagamento(it.type, dt, s);
          c.lido = true;
          if (guardaAviso) c.av = dt.aviso || null;
          if (p) { c.alvo = ymd(p.alvo); c.ref = p.ref; }
        }
        if (c.av) it.avisoEm = c.av;
        const faltam = c.alvo ? uteisAte(now, diaDe(c.alvo), hol) : null;
        if (c.alvo) it.pagamentoAte = { alvo: c.alvo, ref: c.ref };          // para a agenda e o detalhe
        // já entregue pelo analista e com o cliente (que só falta concluir): o prazo de pagamento não é mais prioridade do escritório
        const perto = faltam != null && faltam <= s.tempoOcupado && it.lado !== 'cli';
        if (perto) {
          const dt = c.alvo.slice(8, 10) + '/' + c.alvo.slice(5, 7);
          it.prazoLegal = { alvo: c.alvo, faltam, ref: c.ref };
          const n = faltam <= 1 ? 2 : 1;
          const mo = { n, m: faltam < 0 ? 'Pagamento (prazo legal) venceu em ' + dt : 'Pagamento (prazo legal) vence ' + (faltam === 0 ? 'hoje' : 'em ' + faltam + ' d.u., ' + dt), legal: true };
          const ab = parseDate(it.created);
          if (ab && uteisAte(ab, diaDe(c.alvo), hol) <= s.tempoOcupado) mo.o = 'cli';   // o pedido já chegou em cima do prazo
          it.motivos = (it.motivos || []).concat([mo]);
          if (n > (it.nivel || 0)) { it.nivel = n; it.grav = gravidade(it, TYPE_BY_KEY[it.type], s, { nivel: n, parado: it.parado, uteisAberto: it.uteisAberto, prescreveEm: it.prescreveEm }); }
        }
      } catch (e) {
        if (e && e.auth) throw e;
        c.erro = now.toISOString();
      }
      novo[it.k] = c;
    }
    out.avisos = { cache: novo };
  }

  // Pedido ao cliente para concluir uma solicitação já entregue (cria uma Geral; só na memória até o analista confirmar)
  function pedidoConcluirVars(item) {
    return { numero: String(item.num), tipo: String(item.typeLabel || 'solicitação').toLowerCase(), empregado: item.detalhe ? ' · ' + item.detalhe : '', cliente: item.apelido || item.cliente || '' };
  }
  const preencherConcluir = (modelo, vals) => String(modelo).replace(/\{(\w+)\}/g, (x, k) => (k in vals ? vals[k] : x)).replace(/\s{2,}/g, ' ').trim();
  function assuntoPedirConcluir(item, settings) {
    const s = Object.assign({}, DEFAULTS, settings || {});
    return preencherConcluir(s.pedirConcluirAssunto || DEFAULTS.pedirConcluirAssunto, pedidoConcluirVars(item)).slice(0, 200);
  }
  function textoPedirConcluir(item, settings) {
    const s = Object.assign({}, DEFAULTS, settings || {});
    return preencherConcluir(s.pedirConcluirTexto || DEFAULTS.pedirConcluirTexto, pedidoConcluirVars(item));
  }

  /* ---------- observações para o cliente (detalhe) ----------
   * Frases prontas sobre prazos e cuidados do que o cliente pediu, com as datas da solicitação. Vêm de
   * settings.observacoes (padrão + arquivo de regras); avisos calculados (fora do prazo) entram primeiro. */
  function observacoesCliente(item, datas, settings, now) {
    const s = Object.assign({}, DEFAULTS, settings || {});
    const hol = new Set(s.feriados || []);
    now = now || new Date();
    const t = TYPE_BY_KEY[item.type] || {};
    const d = datas || {};
    const fmt = x => (x ? String(x.getDate()).padStart(2, '0') + '/' + String(x.getMonth() + 1).padStart(2, '0') + '/' + x.getFullYear() : null);
    const nDias = t.calculo ? s.conclusaoCalculo : s.conclusaoSimples;
    const aberta = parseDate(item.created);
    const conclusao = aberta ? somaUteis(aberta, nDias, hol) : null;
    const ini = diaDe(d.inicio), pf = ini ? utilAntes(somaDias(ini, -s.pagamentoFeriasAntes), hol) : null;
    const comp = d.competencia ? d.competencia.slice(5, 7) + '/' + d.competencia.slice(0, 4) : null;
    const vals = {
      conclusao: fmt(conclusao), diasConclusao: nDias, inicio: fmt(ini), pagamentoFerias: fmt(pf),
      pagamentoFeriasAntes: s.pagamentoFeriasAntes, pagamentoRescisaoDias: s.pagamentoRescisaoDias, avisoFeriasDias: s.avisoFeriasDias,
      aviso: fmt(diaDe(d.aviso)), admissao: fmt(diaDe(d.admissao)), competencia: comp, estagiarioPrazoDias: s.estagiarioPrazoDias
    };
    const preencher = txt => { let falta = false; const r = txt.replace(/\{(\w+)\}/g, (_, k) => { const v = vals[k]; if (v == null) { falta = true; return ''; } return String(v); }); return falta ? null : r; };
    const out = [];
    // avisos calculados: o que já está fora do prazo ou muito perto
    if (ini && /Ferias$/.test(item.type)) {
      const corridos = Math.round((ini - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
      if (item.type === 'avisoFerias' && corridos < s.avisoFeriasDias && corridos >= 0) out.push({ id: 'alerta-aviso', alerta: true, texto: 'Atenção: faltam ' + corridos + ' dias para o início das férias (' + vals.inicio + '), menos que os ' + s.avisoFeriasDias + ' dias de antecedência do aviso exigidos pela CLT.' });
      if (pf && pf < new Date(now.getFullYear(), now.getMonth(), now.getDate())) out.push({ id: 'alerta-pagto', alerta: true, texto: 'Atenção: o prazo de pagamento das férias (' + vals.pagamentoFerias + ') já passou.' });
      else if (pf && uteisAte(now, pf, hol) <= 2) out.push({ id: 'alerta-pagto', alerta: true, texto: 'Atenção: o pagamento das férias vence em ' + vals.pagamentoFerias + '.' });
    }
    if (conclusao && conclusao < new Date(now.getFullYear(), now.getMonth(), now.getDate()) && item.lado !== 'fim') out.push({ id: 'alerta-conclusao', alerta: true, interno: true, texto: 'O prazo de conclusão (' + vals.conclusao + ') já passou: informe ao cliente a nova previsão.' });
    const obs = s.observacoes || DEFAULTS.observacoes;
    const vencida = out.some(o => o.id === 'alerta-conclusao');
    (vencida ? [] : obs.todas || []).map((txt, n) => ['todas-' + n, txt]).concat((obs[item.type] || []).map((txt, n) => [item.type + '-' + n, txt]))
      .forEach(([id, txt]) => { const r = preencher(txt); if (r) out.push({ id, texto: r }); });
    return out;
  }

  /* ---------- distribuição por empresa ----------
   * Para cada solicitação sem responsável, sugere o analista que mais atendeu aquela empresa nos últimos N dias
   * (solicitações movimentadas no período, em qualquer situação, contadas pelo responsável). As admissões (os 3
   * Cadastros) ficam fora dessa conta, porque são todas da mesma pessoa; uma admissão sem responsável vai para quem
   * mais fez admissões no período. Sem histórico no período, não sugere ninguém (a pessoa escolhe). É lido na hora
   * (sob demanda) e não é guardado. */
  const ADMISSAO = new Set(['cadEmpregado', 'cadContribuinte', 'cadEstagiario']);
  async function lerMovimentadas(fetcher, dias, now, maxPaginas) {
    now = now || new Date();
    const desde = now.getTime() - (dias || 7) * 864e5;
    const out = [], erros = [];
    await Promise.all(TYPES.map(async t => {
      try {
        for (let page = 1; page <= (maxPaginas || 5); page++) {
          const d = await fetcher(urlConsulta(t, { per: 200, page, orderBy: 'lastUpdated desc' }));
          const rs = (d && d.items) || [];
          let parou = false;
          for (const r of rs) {
            const x = normalize(t, r, null);
            const q = parseDate(x.last);
            if (q && q.getTime() < desde) { parou = true; break; }
            out.push(x);
          }
          if (parou || rs.length < 200 || page >= ((d && d.totalPages) || 1)) break;
        }
      } catch (e) { if (e && e.auth) throw e; erros.push(t.label + ': ' + (e && e.message ? e.message : e)); }
    }));
    return { itens: out, erros };
  }
  const chaveCliente = i => (i.codCliente !== '' && i.codCliente != null ? 'c' + i.codCliente : 'n' + semAcento(i.cliente || i.apelido || ''));
  function distribuirPorCliente(pendentes, movimentadas, dias) {
    const porCli = new Map(), adm = new Map();
    const soma = (m, k) => m.set(k, (m.get(k) || 0) + 1);
    for (const x of movimentadas || []) {
      if (!x.resp) continue;
      if (ADMISSAO.has(x.type)) soma(adm, x.resp);
      else { const k = chaveCliente(x); if (!porCli.has(k)) porCli.set(k, new Map()); soma(porCli.get(k), x.resp); }
    }
    const ids = new Map();
    for (const x of (movimentadas || []).concat(pendentes || [])) if (x.resp && x.respId && !ids.has(x.resp)) ids.set(x.resp, x.respId);
    const ordem = m => [...m.entries()].sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], 'pt-BR'));
    const periodo = (dias || 7) === 7 ? 'na última semana' : 'nos últimos ' + dias + ' dias';
    return (pendentes || []).filter(i => !i.resp).map(i => {
      const r = sugerir(i);
      r.respId = ids.get(r.resp) || '';
      r.alternativas.forEach(a => { a.respId = ids.get(a.resp) || ''; });
      return r;
    }).sort((a, b) => ((b.item.nivel || 0) - (a.item.nivel || 0)) || ((b.item.parado || 0) - (a.item.parado || 0)));
    function sugerir(i) {
      if (ADMISSAO.has(i.type)) {
        const o = ordem(adm);
        if (o.length) return { item: i, resp: o[0][0], n: o[0][1], motivo: 'fez ' + o[0][1] + (o[0][1] === 1 ? ' admissão ' : ' admissões ') + periodo, alternativas: o.slice(1, 4).map(([r, n]) => ({ resp: r, n })) };
      } else {
        const m = porCli.get(chaveCliente(i));
        if (m && m.size) {
          const o = ordem(m), total = o.reduce((s2, x) => s2 + x[1], 0);
          return { item: i, resp: o[0][0], n: o[0][1], motivo: 'atendeu ' + o[0][1] + ' de ' + total + ' solicitações desta empresa ' + periodo, alternativas: o.slice(1, 4).map(([r, n]) => ({ resp: r, n })) };
        }
      }
      // sem histórico no período: não sugere ninguém (pedido do Josué em 16/10/2026: só a sugestão pelo histórico)
      return { item: i, resp: '', n: 0, motivo: ADMISSAO.has(i.type) ? 'nenhuma admissão atendida ' + periodo + ': escolha o responsável' : 'ninguém atendeu esta empresa ' + periodo + ': escolha o responsável', alternativas: [], semHistorico: true };
    }
  }

  /* ---------- avaliação de desempenho e qualidade (tela Equipe, área do gestor) ----------
   * Revista em 16/10/2026 para ser justa (pedido do Josué). Para cada analista e para a equipe:
   *  - entregas: concluídas no período. O tempo que conta é o TEMPO COM O ESCRITÓRIO (dias úteis em que a vez era do
   *    escritório), lido nos trâmites de cada entrega (OC.analisarEntrega). Sem essa leitura, usa o tempo total e a
   *    entrega fica "estimada". A entrega conta para quem a concluiu (autor do trâmite de conclusão), não para o
   *    responsável atual;
   *  - pontualidade: % das entregas com tempo do escritório dentro do prazo interno (3 d.u. simples, 5 cálculo);
   *  - ritmo: tempo do escritório de cada entrega comparado com a mediana da equipe no MESMO tipo de solicitação;
   *  - carteira em dia: pendências com o escritório sem atraso agora, sem contar os de origem do cliente (motivo o: 'cli');
   *  - cuidado: G3 na vez do escritório e prescritas sem nenhuma cobrança ao cliente, por 10 solicitações;
   *  - agilidade: dias úteis até o 1º trâmite do escritório (entregas do período, pendências lidas e as que seguem
   *    "Sem análise" além do prazo, que contam o tempo até agora);
   *  - poucos dados: com poucas entregas, os percentuais são puxados para a média da equipe; abaixo de
   *    avaliacaoMinEntregas a pessoa fica sem posição no ranking. Item sem dado recebe o valor da equipe;
   *  - exceções: o gestor pode tirar um caso da conta (só o k, guardado no Chrome dele).
   * Nota (0–100) = média ponderada com DEFAULTS.pesosNota (regras podem trocar). */
  const PESOS_NOTA = DEFAULTS.pesosNota;
  function faixaNota(n) { return n == null ? { k: 'sem', rot: 'Sem dados' } : n >= 85 ? { k: 'otimo', rot: 'Excelente' } : n >= 70 ? { k: 'bom', rot: 'Bom' } : n >= 50 ? { k: 'atencao', rot: 'Atenção' } : { k: 'critico', rot: 'Precisa de apoio' }; }
  const autorDe = x => (x && ((x.createdByContactExpanded && x.createdByContactExpanded.name) || (x.createdByExpanded && x.createdByExpanded.name))) || '';
  // Lê os trâmites de UMA entrega: e = dias úteis com a vez do escritório (da abertura à conclusão), p = dias úteis até
  // o 1º trâmite do escritório, a = quem concluiu (autor do trâmite que encerrou), c = o escritório cobrou o cliente
  // enquanto a vez era dele. Sem trâmite de conclusão (resolvida por falta de retorno), conta até a última movimentação.
  function analisarEntrega(topicos, t, item, settings) {
    const s = Object.assign({}, DEFAULTS, settings || {});
    const hol = new Set(s.feriados || []);
    const fam = FAMILIAS[t.familia], grava = new Set(fam.clienteGrava);
    const ord = (topicos || []).filter(x => x && x.created && !x.deletedTopic).sort((a, b) => String(a.created).localeCompare(String(b.created)));
    const ab = parseDate(item.created) || (ord[0] && parseDate(ord[0].created));
    if (!ab) return null;
    let vez = 'esc', desde = ab, esc = 0, primeiro = null, quem = '', cobrou = false;
    for (let i = 0; i < ord.length; i++) {
      const x = ord[i], em = parseDate(x.created);
      if (!em || em < ab) continue;
      const code = Number(x.status), st = fam.st[code];
      const doEscritorio = i > 0 && !grava.has(code);
      if (doEscritorio && primeiro == null) primeiro = diasUteis(ab, em, hol);
      if (vez === 'cli' && doEscritorio) cobrou = true;
      if (vez === 'esc') esc += diasUteis(desde, em, hol);
      if (st && st[1] === 'fim') { quem = autorDe(x); vez = 'fim'; break; }
      vez = st && st[1] === 'cli' ? 'cli' : 'esc';
      desde = em;
    }
    if (vez === 'esc') { const fim = parseDate(item.last); if (fim && fim > desde) esc += diasUteis(desde, fim, hol); }
    return { e: esc, p: primeiro, a: quem, c: cobrou };
  }
  // Lê na hora os trâmites das entregas (4 por vez, no máximo `limite` novas). O cache guarda só números, o nome de
  // quem concluiu e a data da última movimentação (l), para não ler de novo o que não mudou.
  async function analisarEntregas(fetcher, entregas, cache, settings, limite) {
    const out = {}, fila = [];
    let lidas = 0, falhas = 0;
    for (const x of entregas || []) {
      if (!x || !x.k || !x.id || x.lado !== 'fim') continue;
      const c = cache && cache[x.k];
      if (c && c.l === x.last) out[x.k] = c; else fila.push(x);
    }
    let i = 0;
    const max = limite == null ? 300 : limite;
    async function worker() {
      while (i < fila.length && i < max) {
        const x = fila[i++], t = TYPE_BY_KEY[x.type];
        if (!t) continue;
        try {
          const d = await fetcher(urlTramites(t, x));
          const a = analisarEntrega((d && d.items) || (Array.isArray(d) ? d : []), t, x, settings);
          lidas++;
          if (a) out[x.k] = Object.assign({ l: x.last }, a);
        } catch (e) { if (e && (e.auth || e.cliente)) throw e; falhas++; }
      }
    }
    await Promise.all(Array.from({ length: 4 }, worker));
    return { analises: out, lidas, falhas, semLeitura: (entregas || []).filter(x => x && x.lado === 'fim' && x.k && !out[x.k]).length };
  }
  // Concluídas passam a valer para quem as concluiu (autor do trâmite de conclusão, lido em analisarEntregas), desde que
  // seja alguém da equipe conhecida; as outras ficam com o responsável. Usado pelo Distribuir ("quem mais atendeu").
  function creditarQuemConcluiu(itens, analises) {
    const conhecidos = new Set((itens || []).map(x => x && x.resp).filter(Boolean));
    return (itens || []).map(x => {
      const a = x && analises && analises[x.k];
      return a && a.a && x.lado === 'fim' && conhecidos.has(a.a) && a.a !== x.resp ? Object.assign({}, x, { resp: a.a, respId: '' }) : x;
    });
  }
  const mediana = l => { if (!l.length) return null; const o = l.slice().sort((a, b) => a - b), h = o.length >> 1; return o.length % 2 ? o[h] : (o[h - 1] + o[h]) / 2; };
  function avaliarEquipe(pendentes, movimentadas, settings, dias, now, extra) {
    const s = Object.assign({}, DEFAULTS, settings || {});
    const pesos = Object.assign({}, DEFAULTS.pesosNota, s.pesosNota || {});
    const minimo = Math.max(1, s.avaliacaoMinEntregas || DEFAULTS.avaliacaoMinEntregas);
    const analises = (extra && extra.analises) || {}, excecoes = (extra && extra.excecoes) || {};
    now = now || new Date();
    dias = dias || 7;
    const hol = new Set(s.feriados || []);
    const hoje0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const iniAtual = somaDias(hoje0, -(dias - 1)), iniAnt = somaDias(iniAtual, -dias);
    const SEM = '(sem responsável)';
    const pessoas = new Map();
    const pessoa = nome => { if (!pessoas.has(nome)) pessoas.set(nome, novo(nome)); return pessoas.get(nome); };
    function novo(nome) {
      return { resp: nome, carteira: 0, esc: 0, emDiaEsc: 0, g3: 0, g3Esc: 0, paradas: 0, respondeu: 0, agSoma: 0, agN: 0, concl: 0, noPrazo: 0, tempoSoma: 0, estimadas: 0,
        prescritas: 0, razoes: [], ant: { concl: 0, noPrazo: 0, prescritas: 0 }, porDia: {}, atencao: [], foraDoPrazo: [], evitaveis: [], lentas: [], atrasadas: [], semResposta: [] };
    }
    const equipe = novo('Equipe');
    const contar = (fn, quem) => { if (quem) fn(pessoa(quem)); fn(equipe); };
    const conhecidos = new Set((pendentes || []).concat(movimentadas || []).map(x => x && x.resp).filter(Boolean));
    let excluidas = 0;
    for (const i of pendentes || []) {
      if (i.lado === 'fim') continue;
      if (excecoes[i.k]) { excluidas++; continue; }
      const atrasoDoEscritorio = i.motivos ? i.motivos.some(m => m && m.n > 0 && m.o !== 'cli') : !!i.nivel;
      const semAnalise = i.lado === 'esc' && /^Sem análise/.test(i.status || '') && (i.uteisAberto || 0) > s.primeiroTramite;
      contar(r => {
        r.carteira++;
        if (i.lado === 'esc') { r.esc++; if (!atrasoDoEscritorio) r.emDiaEsc++; if ((i.parado || 0) > s.parada) r.paradas++; }
        if (i.grav === 3) { r.g3++; if (i.lado === 'esc') r.g3Esc++; }
        if (clienteRespondeu(i)) r.respondeu++;
        if (i.ptUteis != null) { r.agSoma += i.ptUteis; r.agN++; }
        else if (semAnalise && i.resp) { r.agSoma += i.uteisAberto; r.agN++; }   // ainda sem resposta: conta o tempo até agora
      }, i.resp);
      if (i.resp && (i.grav === 3 || (i.lado === 'esc' && (i.parado || 0) > s.parada))) pessoa(i.resp).atencao.push(i);
      if (i.resp && i.grav === 3 && i.lado === 'esc') pessoa(i.resp).evitaveis.push({ item: i, motivo: 'crítica (G3) na vez do escritório' });
      // o que pesa em "carteira em dia" e em "agilidade", para a janela de cada pessoa
      if (i.resp && i.lado === 'esc' && atrasoDoEscritorio) { const m = (i.motivos || []).filter(x => x && x.n > 0 && x.o !== 'cli').sort((a, b) => b.n - a.n)[0]; pessoa(i.resp).atrasadas.push({ item: i, motivo: m ? m.m : 'fora do prazo' }); }
      if (i.resp && semAnalise && i.ptUteis == null) pessoa(i.resp).semResposta.push({ item: i, dias: i.uteisAberto });
    }
    const vistos = new Set(), doPeriodo = [];
    for (const x of movimentadas || []) {
      if (!x || x.lado !== 'fim' || vistos.has(x.k)) continue;
      vistos.add(x.k);
      if (excecoes[x.k]) { excluidas++; continue; }
      const fim = parseDate(x.last);
      if (!fim) continue;
      const dia = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());
      const atual = dia >= iniAtual && dia <= hoje0, anterior = !atual && dia >= iniAnt && dia < iniAtual;
      if (!atual && !anterior) continue;
      const t = TYPE_BY_KEY[x.type] || {};
      const a = analises[x.k] || null;
      const quem = a && a.a && conhecidos.has(a.a) ? a.a : x.resp;
      const prescrita = /^Prescrita/.test(x.status || '');
      const ab = parseDate(x.created);
      const tempo = a ? a.e : ab ? diasUteis(ab, fim, hol) : null;
      const prazo = t.calculo ? s.conclusaoCalculo : s.conclusaoSimples;
      const noPrazo = tempo != null && tempo <= prazo;
      contar(r => {
        const alvo = atual ? r : r.ant;
        if (prescrita) {
          alvo.prescritas++;
          return;
        }
        alvo.concl++;
        if (noPrazo) alvo.noPrazo++;
        if (!atual) return;
        if (tempo != null) r.tempoSoma += tempo;
        if (!a) r.estimadas++;
        if (a && a.p != null) { r.agSoma += a.p; r.agN++; }
        const k = ymd(dia); r.porDia[k] = (r.porDia[k] || 0) + 1;
      }, quem);
      if (atual && quem && !prescrita && !noPrazo) pessoa(quem).foraDoPrazo.push({ item: x, tempo, prazo, estimado: !a });
      if (atual && !prescrita && tempo != null) doPeriodo.push({ quem, type: x.type, tempo, item: x });
    }
    // ritmo: cada entrega comparada com a mediana da equipe no mesmo tipo (no período)
    const porTipo = {};
    doPeriodo.forEach(d => (porTipo[d.type] = porTipo[d.type] || []).push(d.tempo));
    const med = Object.fromEntries(Object.entries(porTipo).map(([k, l]) => [k, mediana(l)]));
    doPeriodo.forEach(d => {
      const raz = (d.tempo + 0.5) / (med[d.type] + 0.5);
      equipe.razoes.push(raz);
      if (!d.quem) return;
      pessoa(d.quem).razoes.push(raz);
      if (raz >= 1.5 && d.tempo > med[d.type]) pessoa(d.quem).lentas.push({ item: d.item, tempo: d.tempo, normal: med[d.type], raz });
    });

    const diasLista = Array.from({ length: dias }, (_, n) => ymd(somaDias(iniAtual, n)));
    const pct = (a, b) => (b ? Math.round(a / b * 100) : null);
    const lim = v => Math.max(0, Math.min(100, Math.round(v)));
    function brutos(r) {
      const base = r.carteira + r.concl;
      const ag = r.agN ? r.agSoma / r.agN : null, raz = mediana(r.razoes);
      return {
        pontualidade: pct(r.noPrazo, r.concl),
        ritmo: raz == null ? null : lim(75 - (raz - 1) * 50),
        emDia: pct(r.emDiaEsc, r.esc),
        cuidado: base || r.prescritas ? lim(100 - 25 * r.g3Esc / Math.max(10, base) * 10) : null,
        agilidade: ag == null ? null : lim(100 - (ag - s.primeiroTramite) * 25)
      };
    }
    // com poucos casos, o valor da pessoa é puxado para o da equipe (peso do "mínimo" em casos fictícios na média)
    const puxa = (v, n, eq) => (v == null ? eq : eq == null ? v : Math.round((v * n + eq * minimo) / (n + minimo)));
    function nota(comp) {
      let soma = 0, peso = 0;
      for (const [k, w] of Object.entries(pesos)) if (comp[k] != null && w > 0) { soma += comp[k] * w; peso += w; }
      return peso ? Math.round(soma / peso) : null;
    }
    const brutoEq = brutos(equipe);
    function fechar(r, eq) {
      const b = brutos(r);
      const comp = eq ? {
        pontualidade: puxa(b.pontualidade, r.concl, brutoEq.pontualidade),
        ritmo: puxa(b.ritmo, r.razoes.length, brutoEq.ritmo),
        emDia: puxa(b.emDia, r.esc, brutoEq.emDia),
        cuidado: b.cuidado == null ? brutoEq.cuidado : b.cuidado,
        agilidade: puxa(b.agilidade, r.agN, brutoEq.agilidade)
      } : b;
      const n = nota(comp);
      const antPont = pct(r.ant.noPrazo, r.ant.concl);
      const ord = (l, f) => l.sort(f).slice(0, 10);
      return {
        resp: r.resp, nota: n, faixa: faixaNota(n), componentes: comp, brutos: b,
        poucosDados: !!eq && r.concl < minimo, estimadas: r.estimadas,
        concluidas: r.concl, noPrazo: r.noPrazo, pctNoPrazo: b.pontualidade, tempoMedio: r.concl ? Math.round(r.tempoSoma / r.concl * 10) / 10 : null,
        ritmo: r.razoes.length ? Math.round(mediana(r.razoes) * 100) / 100 : null,
        prescritas: r.prescritas, carteira: r.carteira, esc: r.esc, pctEmDia: b.emDia, g3: r.g3, g3Esc: r.g3Esc, paradas: r.paradas, respondeu: r.respondeu,
        primeiroTramite: r.agN ? Math.round(r.agSoma / r.agN * 10) / 10 : null,
        anterior: { concluidas: r.ant.concl, pctNoPrazo: antPont, prescritas: r.ant.prescritas },
        variacao: { concluidas: r.concl - r.ant.concl, pctNoPrazo: b.pontualidade == null || antPont == null ? null : b.pontualidade - antPont },
        porDia: diasLista.map(d => ({ dia: d, n: r.porDia[d] || 0 })),
        atencao: ord(r.atencao || [], (a, c) => (c.grav || 0) - (a.grav || 0) || (c.parado || 0) - (a.parado || 0)).slice(0, 8),
        foraDoPrazo: ord(r.foraDoPrazo, (a, c) => (c.tempo || 0) - (a.tempo || 0)),
        evitaveis: r.evitaveis.slice(0, 10),
        lentas: ord(r.lentas, (a, c) => c.raz - a.raz),
        atrasadas: ord(r.atrasadas, (a, c) => (c.item.nivel || 0) - (a.item.nivel || 0) || (c.item.parado || 0) - (a.item.parado || 0)),
        semResposta: ord(r.semResposta, (a, c) => (c.dias || 0) - (a.dias || 0))
      };
    }
    const analistas = [...pessoas.values()].filter(r => r.resp !== SEM).map(r => fechar(r, true))
      .sort((a, b) => (a.poucosDados - b.poucosDados) || ((b.nota == null ? -1 : b.nota) - (a.nota == null ? -1 : a.nota)) || (b.concluidas - a.concluidas) || a.resp.localeCompare(b.resp, 'pt-BR'));
    let p = 0;
    analistas.forEach(a => { a.pos = a.poucosDados ? null : ++p; });
    return { dias, de: ymd(iniAtual), ate: ymd(hoje0), equipe: fechar(equipe, false), analistas, pesos, minEntregas: minimo, medianas: med, excluidas };
  }

  /* ---------- ações no Onvio (fase 2, pedida pelo Josué em 15/10/2026) ----------
   * Formatos vistos no Onvio real (mapeamento/acoes-2026-10-15.md), na EMPRESA EXEMPLO:
   *  - trâmite (responder, mudar situação, encaminhar): POST {tramites}/{id}/topics  { description, status[, forwardedToExpanded] }
   *    -> 201, id do trâmite no cabeçalho "location". Não existe trâmite sem situação.
   *  - anexo: depois do trâmite, POST {tramites}/{id}/topics/{topicId}/attachments  multipart, campo "file[]".
   *  - responsável: PUT {lista}/{id}/assign-staff  Geral { departmentId, id }; folha { id }.
   *  - expectativa: PUT {lista}/{id}/change-due-date { dueDate } (Geral, afastamento e cálculo de férias; Cadastro e Rubricas não oferecem).
   * Geral e as listas de férias, rescisão e afastamento têm todas as ações. Cadastro (3 listas) e Rubricas (mapeados em
   *    19/10/2026) têm trâmite, anexo, encaminhar e responsável; a expectativa fica de fora (a tela não oferece):
   *      trâmite POST {tramites}/{id}/topics { description, status }; encaminhar = o mesmo POST com status 7 (Cadastro) ou 9
   *      (Rubricas) e forwardedToEmployeeExpanded { id }; responsável PUT {tramites}/{id}/assign-staff { id } (o caminho dos
   *      3 Cadastros é o do empregado; em Rubricas é o mesmo padrão, a confirmar). O Cadastro recusa (HTTP 400) encaminhar a
   *      partir de "Aguardando o cliente"; o Onvio só deixa definir responsável quando ainda não há um.
   * Nunca há exclusão. Toda escrita passa por confirmação na tela e pela checagem de escritório no service worker. */
  const FOLHA = new Set(['avisoFerias', 'calcFerias', 'avisoRescisao', 'calcRescisao', 'afastamento']);
  const CADASTRO = new Set(['cadEmpregado', 'cadContribuinte', 'cadEstagiario']);
  const ACOES = {
    tramite: k => k === 'geral' || FOLHA.has(k) || CADASTRO.has(k) || k === 'rubricas',
    anexo: k => k === 'geral' || FOLHA.has(k) || CADASTRO.has(k) || k === 'rubricas',
    encaminhar: k => k === 'geral' || FOLHA.has(k) || CADASTRO.has(k) || k === 'rubricas',
    responsavel: k => k === 'geral' || FOLHA.has(k) || CADASTRO.has(k) || k === 'rubricas',
    expectativa: k => k === 'geral' || k === 'afastamento' || k === 'calcFerias'   // confirmados no Onvio (22/10/2026); aviso de férias tem o menu, mas a chamada não foi capturada
  };
  const SEM_MAPA = 'ainda não disponível na extensão para esta lista: use "Abrir no Onvio"';
  // { ok, motivo } para mostrar o botão habilitado ou explicar por que não
  function podeAcao(acao, item) {
    const t = item && TYPE_BY_KEY[item.type];
    if (!t || !ACOES[acao]) return { ok: false, motivo: 'ação desconhecida' };
    if (!ACOES[acao](t.key)) return { ok: false, motivo: SEM_MAPA };
    if (item.lado === 'fim') return { ok: false, motivo: 'solicitação encerrada' };
    if (acao === 'responsavel') {
      if ((FOLHA.has(t.key) || CADASTRO.has(t.key) || t.key === 'rubricas') && item.resp) return { ok: false, motivo: 'o Onvio só permite definir responsável quando ainda não há um' };
      if (t.key === 'geral' && item.code === 4) return { ok: false, motivo: 'o Onvio não permite definir responsável com a situação Respondido' };
    }
    if (acao === 'encaminhar') {
      if (CADASTRO.has(t.key) && Number(item.code) === 3) return { ok: false, motivo: 'o Onvio não permite encaminhar com a situação Aguardando o cliente' };
      if (!CADASTRO.has(t.key) && Number(item.code) === 4) return { ok: false, motivo: 'o Onvio não permite encaminhar com a situação Respondido' };
    }
    return { ok: true };
  }
  // Situações que a tela do Onvio oferece ao incluir trâmite (depende da situação atual)
  // Situações que o escritório pode escolher ao incluir trâmite, por lista e situação atual (tela do Onvio, 15 e 19/10/2026).
  // Códigos que a tela não ofereceu (ou que não foram vistos) usam a regra geral da lista; o Onvio ainda valida cada pedido.
  const OPCOES_TRAMITE = {
    padrao: item => (Number(item.code) === 4 ? [4, 5] : [2, 8, 4, 5]),
    cadastro: item => (Number(item.code) === 3 ? [4] : [3, 6]),
    rubricas: item => { const c = Number(item.code); return c === 5 || c === 6 ? [4] : c === 9 ? [2, 5, 6, 4, 8] : [2, 5, 6, 8]; }
  };
  function situacoesTramite(item) {
    const t = TYPE_BY_KEY[item.type];
    const st = FAMILIAS[t.familia].st;
    return OPCOES_TRAMITE[t.familia](item).filter(c => st[c]).map(c => ({ code: c, rot: st[c][0] }));
  }
  const urlNovoTramite = (t, id) => API + t.tramites + '/' + encodeURIComponent(id) + '/topics';
  const urlAnexoTramite = (t, id, topicId) => urlNovoTramite(t, id) + '/' + encodeURIComponent(topicId) + '/attachments';
  // Cadastro e Rubricas usam o caminho dos trâmites (nos 3 Cadastros é o do empregado); as outras, o da lista
  const urlResponsavel = (t, id) => API + (t.familia === 'padrao' ? t.path : t.tramites) + '/' + encodeURIComponent(id) + '/assign-staff';
  const urlExpectativa = (t, id) => API + t.path + '/' + encodeURIComponent(id) + '/change-due-date';
  // id do trâmite criado, do cabeçalho "location" (último pedaço do caminho)
  const idDoLocation = loc => { const m = /\/([^/?#]+)\/?(?:[?#].*)?$/.exec(String(loc || '')); return m ? decodeURIComponent(m[1]) : null; };
  // Monta o pedido de uma ação. registro: o item como veio da lista do Onvio (id, departmentId). Lança erro se não puder.
  function pedidoAcao(o, registro, item) {
    const t = TYPE_BY_KEY[o.type];
    if (!t) throw new Error('tipo desconhecido');
    const id = registro && registro.id;
    if (!id) throw new Error('solicitação sem id');
    const acao = o.acao === 'tramite' && o.encaminharPara ? 'encaminhar' : o.acao;
    const pode = podeAcao(acao, item);
    if (!pode.ok) throw new Error('Não dá para ' + ({ tramite: 'incluir trâmite', encaminhar: 'encaminhar', responsavel: 'definir responsável', expectativa: 'alterar a expectativa' }[acao] || acao) + ': ' + pode.motivo);
    if (o.acao === 'tramite') {
      const texto = String(o.texto || '').trim();
      if (!texto) throw new Error('escreva o texto do trâmite');
      if (texto.length > 20000) throw new Error('texto longo demais');
      const corpo = { description: texto };
      if (o.encaminharPara) {
        corpo.status = t.familia === 'rubricas' ? 9 : 7;
        if (t.familia === 'padrao') corpo.forwardedToExpanded = t.key === 'geral' ? { departmentId: registro.departmentId || '', id: String(o.encaminharPara) } : { id: String(o.encaminharPara) };
        else corpo.forwardedToEmployeeExpanded = { id: String(o.encaminharPara) };
      } else {
        const ok = situacoesTramite(item).map(x => x.code);
        if (!ok.includes(Number(o.situacao))) throw new Error('escolha a situação do trâmite');
        corpo.status = Number(o.situacao);
      }
      return { metodo: 'POST', url: urlNovoTramite(t, id), corpo };
    }
    if (o.acao === 'responsavel') {
      if (!o.analista) throw new Error('escolha o responsável');
      return { metodo: 'PUT', url: urlResponsavel(t, id), corpo: t.key === 'geral' ? { departmentId: registro.departmentId || '', id: String(o.analista) } : { id: String(o.analista) } };
    }
    if (o.acao === 'expectativa') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(o.data || ''))) throw new Error('escolha a data');
      return { metodo: 'PUT', url: urlExpectativa(t, id), corpo: { dueDate: o.data + 'T00:00:00' } };
    }
    throw new Error('ação desconhecida');
  }
  /* ---------- criar solicitação (Geral) ----------
   * Autorizada pelo Josué em 16/10/2026. Formato mapeado na empresa de teste (acoes-2026-10-15.md):
   * POST service-requesting/v1/tickets/generic { serviceRequestType, clientExpanded: { id }, departmentId, description,
   * subject, requestWay, requesterExpanded: {} } -> 201. O id do cliente vem de uma solicitação dele lida na hora;
   * tipo, meio e departamento vêm das regras ou do próprio Onvio (modeloCriacao). Sempre com confirmação na tela. */
  const URL_CRIAR_GERAL = API + 'service-requesting/v1/tickets/generic';
  function modeloCriacao(settings, exemplo, acesso, dep) {
    const c = Object.assign({}, DEFAULTS.criacao, (settings && settings.criacao) || {});
    const ex = exemplo || {}, ac = acesso || {};
    const depId = dep && c.departamentos && typeof c.departamentos[dep] === 'string' ? c.departamentos[dep] : '';
    const m = {
      serviceRequestType: c.serviceRequestType || (typeof ex.serviceRequestType === 'string' ? ex.serviceRequestType : ''),
      requestWay: c.requestWay || (typeof ex.requestWay === 'string' ? ex.requestWay : ''),
      departmentId: depId || c.departmentId || (typeof ac.departmentId === 'string' ? ac.departmentId : '') || (typeof ex.departmentId === 'string' ? ex.departmentId : '')
    };
    m.departamentoPadrao = !!(dep && !depId);          // o departamento escolhido não tem id nas regras: vale o padrão do acesso
    m.faltam = Object.entries({ serviceRequestType: 'tipo', requestWay: 'meio', departmentId: 'departamento' }).filter(([k]) => !m[k]).map(([, v]) => v);
    return m;
  }
  function pedidoCriacao(o, clienteId, modelo) {
    const assunto = String((o && o.assunto) || '').replace(/\s+/g, ' ').trim();
    const descricao = String((o && o.descricao) || '').trim();
    if (!clienteId) throw new Error('escolha o cliente');
    if (!assunto) throw new Error('escreva o assunto');
    if (assunto.length > 200) throw new Error('assunto longo demais (até 200 caracteres)');
    if (!descricao) throw new Error('escreva a descrição');
    if (descricao.length > 20000) throw new Error('descrição longa demais');
    if (!modelo || modelo.faltam.length) throw new Error('não consegui descobrir no Onvio o ' + ((modelo && modelo.faltam) || ['tipo']).join(', ') + ' da solicitação Geral; informe em "criacao" no arquivo de regras ou crie pelo Onvio');
    return { metodo: 'POST', url: URL_CRIAR_GERAL, corpo: { serviceRequestType: modelo.serviceRequestType, clientExpanded: { id: String(clienteId) }, departmentId: modelo.departmentId, description: descricao, subject: assunto, requestWay: modelo.requestWay, requesterExpanded: {} } };
  }
  // A criação devolve 201 sem corpo: acha a nova na lista Geral (mesmo assunto e cliente, criada há pouco, a de maior número)
  function acharCriada(registros, assunto, clienteId, desde) {
    const lim = (desde instanceof Date ? desde.getTime() : Number(desde) || 0) - 10 * 60000;
    return (registros || []).filter(r => r && String(r.subject || '').trim() === String(assunto).trim() && r.clientExpanded && String(r.clientExpanded.id) === String(clienteId) && (!parseDate(r.created) || parseDate(r.created).getTime() >= lim))
      .sort((a, b) => Number(b.identifier) - Number(a.identifier))[0] || null;
  }

  // Defesa extra: só estes caminhos podem receber escrita, e nunca DELETE nem "/delete"
  const ESCRITA_OK = /^https:\/\/onvio\.com\.br\/api\/(service-requesting|br-payroll-sr)\/v1\/[a-z-]+(\/[a-z-]+)?\/[^/]+\/(topics(\/[^/]+\/attachments)?|assign-staff|change-due-date)$/;
  const escritaPermitida = (metodo, url) => ((metodo === 'POST' || metodo === 'PUT') && ESCRITA_OK.test(url) && !/delete/i.test(url)) || (metodo === 'POST' && url === URL_CRIAR_GERAL);
  // Equipe (para responsável e encaminhar): quem aparece como responsável nas pendências, com o id do Onvio
  function equipeDe(items) {
    const m = new Map();
    for (const i of items || []) if (i.respId && i.resp && !m.has(i.respId)) m.set(i.respId, i.resp);
    return [...m.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  /* ---------- painéis do Hoje ---------- */
  // Admissões em destaque: retroativas, já passadas ou perto do início (ver evaluate). Mais urgente primeiro.
  // O escritório já mexeu na solicitação? Sim quando a leitura dos trâmites achou um trâmite do escritório
  // (primeiroTramite) ou quando a situação atual é uma que só um trâmite do escritório grava (fora de clienteGrava).
  function escritorioTramitou(i) {
    if (!i) return false;
    if (i.primeiroTramite) return true;
    const t = TYPE_BY_KEY[i.type];
    if (!t || i.code == null) return false;
    return !FAMILIAS[t.familia].clienteGrava.includes(Number(i.code));
  }
  // Faixa de admissões do Hoje: só as que o escritório ainda não tocou (nenhum trâmite do escritório)
  function admissoesCriticas(items) {
    return (items || []).filter(i => i.admissaoAlerta && !escritorioTramitou(i)).sort((a, b) => (b.admissaoAlerta.retro - a.admissaoAlerta.retro) || (a.admissaoAlerta.faltam - b.admissaoAlerta.faltam));
  }
  // Prazos legais de pagamento (férias e rescisão) que vencem dentro da janela, do mais perto ao mais longe
  function vencimentosLegais(items, s, now, janela) {
    s = Object.assign({}, DEFAULTS, s || {});
    now = now || new Date();
    const hol = new Set(s.feriados || []), lim = janela == null ? s.tempoOcupado * 2 : janela;
    return (items || []).filter(i => i.pagamentoAte && i.lado !== 'fim').map(i => ({ item: i, alvo: i.pagamentoAte.alvo, ref: i.pagamentoAte.ref, faltam: uteisAte(now, diaDe(i.pagamentoAte.alvo), hol) }))
      .filter(v => v.faltam <= lim).sort((a, b) => a.faltam - b.faltam);
  }
  /* Mau uso do portal pelo cliente, por empresa: pedido na lista Geral que tem aba própria, pedido repetido em aberto
   * (mesma lista e mesmo empregado/assunto), solicitação parada do lado do cliente e perto de prescrever. */
  function malUso(items, s) {
    s = Object.assign({}, DEFAULTS, s || {});
    const m = new Map(), chave = i => i.codCliente !== '' && i.codCliente != null ? 'c' + i.codCliente : 'n' + semAcento(i.cliente || i.apelido || '');
    const reg = i => { const k = chave(i); if (!m.has(k)) m.set(k, { cliente: i.cliente || i.apelido || '—', apelido: i.apelido || '', abaErrada: [], repetidas: [], paradasCliente: [], total: 0 }); return m.get(k); };
    const vistos = new Map();
    for (const i of items || []) {
      if (i.lado === 'fim') continue;
      const r = reg(i); r.total++;
      if (i.abaProvavel) r.abaErrada.push(i);
      if (i.lado === 'cli' && (i.parado || 0) > s.parada) r.paradasCliente.push(i);
      if (i.detalhe) {
        const k = chave(i) + '|' + i.type + '|' + semAcento(i.detalhe).trim();
        if (vistos.has(k)) { r.repetidas.push(i); if (!r.repetidas.includes(vistos.get(k))) r.repetidas.push(vistos.get(k)); } else vistos.set(k, i);
      }
    }
    return [...m.values()].map(r => {
      const motivos = [];
      if (r.abaErrada.length) motivos.push(r.abaErrada.length + ' na lista Geral com aba própria');
      if (r.repetidas.length) motivos.push(r.repetidas.length + ' pedidos repetidos em aberto');
      if (r.paradasCliente.length) motivos.push(r.paradasCliente.length + ' parada' + (r.paradasCliente.length > 1 ? 's' : '') + ' esperando o cliente há mais de ' + s.parada + ' dias');
      return Object.assign(r, { motivos, pontos: r.abaErrada.length * 2 + r.repetidas.length * 2 + r.paradasCliente.length });
    }).filter(r => r.pontos > 0).sort((a, b) => b.pontos - a.pontos || a.cliente.localeCompare(b.cliente, 'pt-BR'));
  }
  /* ---------- Tramitação: caixa de resposta ----------
   * Intenções (o que acontece depois do envio) em vez de situações do Onvio, variáveis dos modelos e avisos de coerência.
   * Tudo local e só com o que a tela já leu; nada disso é guardado. */
  // [código, texto do botão, efeito (opcional: senão sai da vez que a situação dá na lista)] na ordem em que aparecem
  const INTENCOES = {
    padrao: [[4, 'Respondido · aguarda o cliente'], [2, 'Em análise'], [8, 'Em análise interna'], [5, 'Concluído · encerra']],
    cadastro: [[3, 'Aguardando o cliente'], [4, 'Respondido pelo cliente · registra o retorno', 'Registra que o cliente respondeu; a vez fica com o escritório'], [6, 'Concluído · encerra']],
    rubricas: [[4, 'Respondido · aguarda o cliente'], [6, 'Aguardando correção · pede ajuste ao cliente'], [5, 'Aguardando resposta', 'Fica "Aguardando resposta"; a lista conta a vez como do escritório (a confirmar no Onvio)'], [2, 'Em análise'], [8, 'Concluído · encerra']]
  };
  // As situações que o Onvio aceita agora (de situacoesTramite) com o texto simples e o efeito do envio
  function intencoesDe(item, settings) {
    const s = Object.assign({}, DEFAULTS, settings || {});
    const t = TYPE_BY_KEY[item && item.type];
    if (!t) return [];
    const fam = FAMILIAS[t.familia], ok = situacoesTramite(item).map(x => x.code);
    let achouCli = false;
    return INTENCOES[t.familia].filter(([c]) => ok.includes(c)).map(([c, rot, efeito]) => {
      const lado = fam.st[c][1], pedeCliente = lado === 'cli' && !achouCli;
      if (lado === 'cli') achouCli = true;
      return {
        sit: c, rot, onvio: fam.st[c][0], lado, pedeCliente,
        tom: lado === 'cli' ? 'cli' : lado === 'fim' ? 'fim' : c === 8 && t.familia === 'padrao' ? 'int' : 'esc',
        efeito: efeito || (lado === 'cli' ? 'A vez passa ao cliente' + (fam.prescreve ? '; sem retorno, prescreve em ' + s.prescricaoDias + ' dias' : '')
          : lado === 'fim' ? 'Encerra a solicitação: ela sai da fila' : 'Continua com o escritório')
      };
    });
  }
  // A situação "equivalente" de um modelo ou de um caso (escritos com os códigos da lista padrão) em outra lista
  const TIPO_DE_SIT = { 2: 'analise', 4: 'cliente', 5: 'fim', 8: 'interna' };
  const SIT_DO_TIPO = { padrao: { analise: 2, cliente: 4, fim: 5, interna: 8 }, cadastro: { cliente: 3, fim: 6 }, rubricas: { analise: 2, cliente: 4, fim: 8 } };
  // Concluir uma solicitação que está com o cliente: a lista pode não deixar concluir direto. No Cadastro (Aguardando o cliente)
  // e nas Rubricas (Aguardando correção) o Onvio só oferece "Respondido": primeiro registra o retorno e depois conclui.
  // Devolve { situacao: código de Concluído, antes: [{ situacao, rot }] } ou null (a extensão não consegue concluir).
  const RESPONDIDO_PELO_CLIENTE = { cadastro: 4, rubricas: 4 };
  function planoConclusao(item) {
    const t = TYPE_BY_KEY[item && item.type];
    if (!t || !ACOES.tramite(item.type)) return null;
    const fim = SIT_DO_TIPO[t.familia].fim, aceita = x => situacoesTramite(x).map(c => c.code);
    if (aceita(item).includes(fim)) return { situacao: fim, antes: [] };
    const resp = RESPONDIDO_PELO_CLIENTE[t.familia];
    if (resp && aceita(item).includes(resp) && aceita(Object.assign({}, item, { code: resp })).includes(fim)) return { situacao: fim, antes: [{ situacao: resp, rot: FAMILIAS[t.familia].st[resp][0] }] };
    return null;
  }
  const situacaoEquivalente = (codPadrao, item) => { const t = TYPE_BY_KEY[item && item.type]; return t ? (SIT_DO_TIPO[t.familia][TIPO_DE_SIT[codPadrao]] || null) : null; };
  const saudacaoDa = now => { const h = (now || new Date()).getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
  // valores das {variáveis}; só entram as que têm valor (as outras ficam no texto e barram o envio)
  function variaveisTramite(item, datas, settings, now, analista) {
    const d = datas || {}, v = {};
    const fmt = x => (x ? String(x.getDate()).padStart(2, '0') + '/' + String(x.getMonth() + 1).padStart(2, '0') + '/' + x.getFullYear() : '');
    v.saudacao = saudacaoDa(now);
    if (item) {
      if (item.apelido || item.cliente) v.cliente = item.apelido || item.cliente;
      if (item.detalhe && item.type !== 'geral' && item.type !== 'rubricas') v.empregado = item.detalhe;
      if (item.typeLabel) v.tipo = item.typeLabel.toLowerCase();
      if (item.abaProvavel && item.abaProvavel.label) v.aba = item.abaProvavel.label;
      const pl = item.pagamentoAte ? diaDe(item.pagamentoAte.alvo) : null;
      const pg = pl || (d && TYPE_BY_KEY[item.type] ? (x => x && x.alvo)(prazoPagamento(item.type, d, settings)) : null);
      if (pg) { v.pagamento = fmt(pg); if (/Ferias$/.test(item.type)) v.pagamentoFerias = fmt(pg); else if (/Rescisao$/.test(item.type)) v.pagamentoRescisao = fmt(pg); }
    }
    if (d.inicio) v.inicio = fmt(diaDe(d.inicio));
    if (analista) v.analista = analista;
    return v;
  }
  const preencherModelo = (texto, vars) => String(texto || '').replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] ? String(vars[k]) : m));
  // modelos que valem para esta solicitação (tipo e aba própria); a situação vem só se a lista do Onvio a aceita agora
  function modelosPara(item, settings, pessoais) {
    const s = Object.assign({}, DEFAULTS, settings || {});
    const ok = TYPE_BY_KEY[item && item.type] ? situacoesTramite(item).map(x => x.code) : [];
    return (s.modelosTramite || []).concat(Array.isArray(pessoais) ? pessoais.map(m => Object.assign({ pessoal: true }, m)) : [])
      .filter(m => (!m.tipos || m.tipos.includes(item.type)) && (!m.precisaAba || (item.abaProvavel && item.abaProvavel.label)))
      .map(m => { const c = m.situacao ? situacaoEquivalente(m.situacao, item) : null; return Object.assign({}, m, { situacao: c && ok.includes(c) ? c : null }); });
  }
  // Marcadores que a pessoa precisa preencher antes de enviar: "(descreva ...)", "{variável}" sem valor, "[preencher]"
  const RE_MARCADOR = /\(\s*descreva[^)\n]*\)|\{[^}\n]{1,40}\}|\[\s*(?:preencher|completar|xx)[^\]\n]*\]/gi;
  const marcadoresPendentes = texto => [...new Set(String(texto || '').match(RE_MARCADOR) || [])];
  // Avisos de coerência entre o texto e a situação escolhida: { bloqueia, msg }[]
  function avisosResposta(texto, situacao, settings, item) {
    const out = [], t = String(texto || '').trim(), sit = Number(situacao);
    const m = marcadoresPendentes(t);
    if (m.length) out.push({ bloqueia: true, msg: 'Falta preencher: ' + m.join(', ') });
    if (t && sit) {
      const ints = intencoesDe(item || { type: 'geral', code: 1 }, settings);
      const atual = ints.find(x => x.sit === sit), fim = ints.find(x => x.lado === 'fim'), cli = ints.find(x => x.pedeCliente);
      if (atual) {
        const pede = pedeAlgoAoCliente(t, settings).pede;
        if (pede && atual.lado === 'fim' && cli) out.push({ msg: 'O texto pede algo ao cliente, mas "' + atual.onvio + '" encerra a solicitação. Prefira "' + cli.onvio + '".' });
        else if (!pede && atual.pedeCliente && fim) out.push({ msg: 'O texto não pede nada ao cliente. Se a solicitação terminou, prefira "' + fim.onvio + '"; senão ela fica aguardando o cliente.' });
      }
    }
    return out;
  }
  // Modelo pessoal: troca de volta os valores desta solicitação por {variáveis}, para o texto guardado não levar dado de cliente
  function despersonalizar(texto, vars) {
    let t = String(texto || '');
    for (const k of ['cliente', 'empregado', 'pagamento', 'pagamentoFerias', 'pagamentoRescisao', 'inicio', 'aba', 'analista']) {
      const v = vars && vars[k];
      if (v && String(v).length >= 3) t = t.split(String(v)).join('{' + k + '}');
    }
    return t;
  }

  /* ---------- Sugestões de ação (Hoje): casos específicos, cada um com a ação pronta ----------
   * Solicitações que parecem resolvidas fora do portal, abertas errado (lista errada, repetidas) ou com falta de
   * informação do cliente. Do resumo: na vez do escritório e sem movimentação há mais de foraDoPortalDias dias,
   * pedido repetido em aberto e pedido na lista Geral com aba própria. Dos trâmites (lidos sob demanda pelo cmd
   * 'casos', só o veredito volta): trecho de foraDoPortal nas duas últimas mensagens, cliente que diz ter anexado e
   * nenhum arquivo veio, abertura da Geral curta demais e sem anexo. A ação é um trâmite já preenchido, que a pessoa
   * revisa e confirma (nunca automático). */
  const CASOS = {
    fora: { rot: 'Resolvida fora do portal?', botao: 'Concluir', situacao: 5 },     // códigos da lista padrão; situacaoEquivalente troca na lista do item
    duplicada: { rot: 'Duplicada', botao: 'Encerrar duplicada', situacao: 5 },
    abaErrada: { rot: 'Lista errada', botao: 'Orientar e concluir', situacao: 5 },
    anexo: { rot: 'Anexo não chegou', botao: 'Pedir o anexo', situacao: 4 },
    falta: { rot: 'Falta informação', botao: 'Pedir informações', situacao: 4 },
    feriasNova: { rot: 'Férias nova', botao: 'Pôr em análise', situacao: 2 },
    avisoTrabalhado: { rot: 'Aviso trabalhado', botao: 'Criar lembrete', situacao: null, lembrete: true },
    semRetorno: { rot: 'Sem retorno do cliente', botao: 'Concluir', situacao: 5, conclusao: true }     // em dois passos onde a lista exige (planoConclusao)
  };
  const ORDEM_CASOS = Object.keys(CASOS);
  const textoPlano = x => semAcento(String(x || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&[a-z#0-9]+;/gi, ' ')).replace(/\s+/g, ' ');
  const acharTrecho = (texto, lista) => (lista || []).find(p => p && new RegExp('(^|[^a-z0-9])' + escRe(p) + '($|[^a-z0-9])').test(texto)) || null;
  // Veredito de uma solicitação a partir dos trâmites (o texto não sai daqui): { tipo, trecho } ou null
  function analisarCaso(topicos, t, item, settings) {
    const s = Object.assign({}, DEFAULTS, settings || {});
    const grava = new Set(FAMILIAS[t.familia].clienteGrava);
    const ord = (topicos || []).filter(x => x && x.created && !x.deletedTopic).sort((a, b) => String(a.created).localeCompare(String(b.created)));
    if (!ord.length) return null;
    const temAnexo = x => Array.isArray(x.attachmentsExpanded) && x.attachmentsExpanded.some(a => a && (a.name || a.fileName));
    // resolvida fora do portal: dito pelo cliente ou pelo escritório nas duas últimas mensagens
    for (const x of ord.slice(-2).reverse()) { const tr = acharTrecho(textoPlano(x.description), s.foraDoPortal); if (tr) return { tipo: 'fora', trecho: tr }; }
    // aviso de rescisão com aviso prévio trabalhado (dito na abertura): lembrar de emitir o aviso, sem cálculo
    if (t.key === 'avisoRescisao') { const tr = acharTrecho(textoPlano(ord[0].description), s.avisoTrabalhadoPalavras); if (tr) return { tipo: 'avisoTrabalhado', trecho: tr }; }
    // mensagens do cliente depois da última do escritório (a 1ª é a abertura)
    let ultEsc = -1;
    ord.forEach((x, n) => { if (n > 0 && !grava.has(Number(x.status))) ultEsc = n; });
    const doCliente = ord.slice(ultEsc + 1);
    if (!doCliente.some(temAnexo)) {
      const cita = doCliente.map(x => acharTrecho(textoPlano(x.description), s.anexoCitado)).find(Boolean);
      if (cita) return { tipo: 'anexo', trecho: cita };
    }
    // Geral sem nenhuma resposta do escritório, texto curto demais e sem anexo
    if (t.key === 'geral' && ultEsc < 0 && !ord.some(temAnexo) && ord.map(x => textoPlano(x.description)).join('').replace(/[^a-z0-9]/g, '').length < s.faltaInfoMinCaracteres) return { tipo: 'falta', trecho: '' };
    return null;
  }
  // Lê os trâmites das pendências na vez do escritório (as mais recentes primeiro, até limite) e devolve os vereditos.
  // cache: { k: { l, tipo, trecho } } (l = última movimentação): o que não mudou não é lido de novo.
  async function analisarCasos(fetcher, items, cache, settings, limite) {
    const out = {}, fila = [];
    let lidas = 0, falhas = 0;
    const cand = (items || []).filter(i => i && i.k && i.id && i.lado === 'esc' && !i.desconhecido && TYPE_BY_KEY[i.type] && ACOES.tramite(i.type))
      .sort((a, b) => String(b.last || '').localeCompare(String(a.last || '')));
    for (const i of cand) { const c = cache && cache[i.k]; if (c && c.l === i.last) out[i.k] = c; else fila.push(i); }
    let n = 0;
    const max = limite == null ? 80 : limite;
    async function worker() {
      while (n < fila.length && n < max) {
        const i = fila[n++], t = TYPE_BY_KEY[i.type];
        try {
          const d = await fetcher(urlTramites(t, i));
          const a = analisarCaso((d && d.items) || (Array.isArray(d) ? d : []), t, i, settings);
          lidas++;
          out[i.k] = { l: i.last, tipo: a ? a.tipo : null, trecho: a ? a.trecho : '' };
        } catch (e) { if (e && (e.auth || e.cliente)) throw e; falhas++; }
      }
    }
    await Promise.all(Array.from({ length: 4 }, worker));
    return { analises: out, lidas, falhas, candidatas: cand.length, semLeitura: cand.filter(i => !out[i.k]).length };
  }
  // Lista de casos para o painel, do mais forte ao mais fraco. ignorados: { k: { l } } (a pessoa disse "não é o caso";
  // volta se a solicitação mexer). Cada caso: { k, item, tipo, rot, porque, botao, acao: { situacao, texto }, pode }
  function casosSugeridos(items, analises, settings, ignorados) {
    const s = Object.assign({}, DEFAULTS, settings || {});
    const tx = Object.assign({}, DEFAULTS.textosSugestao, s.textosSugestao || {});
    const pend = (items || []).filter(i => i && i.k && i.lado !== 'fim' && !i.desconhecido);
    const casos = new Map();
    const desligado = tipo => !!(s.sugestoes && s.sugestoes[tipo] === false);
    const add = (i, tipo, extra) => {
      if (desligado(tipo)) return;
      const ig = ignorados && ignorados[i.k];
      if (ig && ig.l === i.last) return;
      const atual = casos.get(i.k);
      if (atual && ORDEM_CASOS.indexOf(atual.tipo) <= ORDEM_CASOS.indexOf(tipo)) return;
      casos.set(i.k, Object.assign({ k: i.k, item: i, tipo }, extra));
    };
    if (s.foraDoPortalDias > 0) for (const i of pend) if (i.lado === 'esc' && (i.parado || 0) > s.foraDoPortalDias) add(i, 'fora', { porque: 'Sem resposta do escritório há ' + i.parado + ' dias: provavelmente resolvida fora do portal' });
    for (const i of pend) {
      const a = analises && analises[i.k];
      if (!a || !a.tipo || a.l !== i.last || !CASOS[a.tipo]) continue;
      if (a.tipo === 'fora' && i.lado !== 'esc') continue;
      add(i, a.tipo, a.tipo === 'avisoTrabalhado' ? {} : { porque: a.tipo === 'fora' ? 'Um trâmite recente indica que foi resolvida fora do portal' : a.tipo === 'anexo' ? 'O cliente fala em anexo, mas nenhum arquivo chegou' : 'Pedido curto demais e sem anexo: falta informação para atender', trecho: a.trecho || '' });
    }
    const chave = i => (i.codCliente !== '' && i.codCliente != null ? 'c' + i.codCliente : 'n' + semAcento(i.cliente || i.apelido || '')) + '|' + i.type + '|' + semAcento(i.detalhe || '').trim();
    const grupos = new Map();
    for (const i of pend) if (String(i.detalhe || '').trim()) { const k = chave(i); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(i); }
    for (const g of grupos.values()) {
      if (g.length < 2) continue;
      g.sort((a, b) => Number(a.num) - Number(b.num));
      for (const i of g.slice(1)) add(i, 'duplicada', { outra: g[0].num, porque: 'Repete a nº ' + g[0].num + ' (mesmo cliente, lista e ' + (i.type === 'geral' ? 'assunto' : 'empregado') + '), ainda em aberto' });
    }
    // férias novas (Sem análise): pôr em análise e avisar dos consignados e do prazo de pagamento
    for (const i of pend) if ((i.type === 'avisoFerias' || i.type === 'calcFerias') && i.lado === 'esc' && grupoSituacao(i).k === 'sem') add(i, 'feriasNova', { porque: 'Solicitação de férias nova, ainda sem análise: pôr em análise e avisar o cliente do prazo de pagamento' });
    // aviso de rescisão com aviso prévio trabalhado: lembrete de emitir o aviso (assunto/empregado aqui; abertura pelos trâmites)
    for (const i of pend) if (i.type === 'avisoRescisao' && acharTrecho(textoPlano(i.detalhe), s.avisoTrabalhadoPalavras)) add(i, 'avisoTrabalhado', {});
    // cálculo de rescisão com aviso trabalhado (terminationType WORKED, que já vem na lista): lembrar de emitir o aviso, sem calcular agora
    for (const i of pend) if (i.type === 'calcRescisao' && i.tipoAviso === 'WORKED' && i.lado === 'esc') add(i, 'avisoTrabalhado', {});
    // aguardando o cliente há mais de duas semanas: sugestão de concluir por falta de retorno (o plano de passos sai do item)
    if (s.concluirClienteDias > 0) for (const i of pend) if (i.lado === 'cli' && (i.parado || 0) > s.concluirClienteDias) add(i, 'semRetorno', { porque: 'Aguardando o cliente há ' + i.parado + ' dias, sem retorno: pode ser concluída' });
    for (const i of pend) if (i.abaProvavel) add(i, 'abaErrada', { aba: i.abaProvavel.label, porque: 'Aberta na lista Geral, mas tem aba própria: ' + i.abaProvavel.label });
    return [...casos.values()].map(c => {
      const def = CASOS[c.tipo];
      if (def.lembrete) {                                          // aviso trabalhado: não é trâmite, é um lembrete pessoal
        const lem = lembreteAvisoTrabalhado(c.item, s, new Date());
        return Object.assign(c, { rot: def.rot, botao: def.botao, pode: { ok: true }, porque: 'Aviso prévio trabalhado: lembrar de emitir o aviso (sem cálculo)' + (lem.semData ? ' · a data do aviso não foi lida: lembrete para o próximo dia útil' : ' · lembrete para ' + lem.dia), acao: { lembrete: lem } });
      }
      if (def.conclusao) {                                         // concluir por falta de retorno: 1 ou 2 passos, conforme a lista
        const plano = planoConclusao(c.item), p0 = podeAcao('tramite', c.item);
        const pode = !p0.ok ? p0 : plano ? p0 : { ok: false, motivo: 'a extensão não consegue concluir esta lista a partir da situação atual: conclua pelo Onvio' };
        return Object.assign(c, { rot: def.rot, botao: def.botao, pode, acao: plano ? { situacao: String(plano.situacao), texto: String(tx.semRetorno || ''), antes: plano.antes.map(a => ({ situacao: String(a.situacao), rot: a.rot, texto: String(tx.semRetornoEtapa || '') })) } : { situacao: '', texto: String(tx.semRetorno || ''), antes: [] } });
      }
      const pode = podeAcao('tramite', c.item);
      const sits = pode.ok ? situacoesTramite(c.item).map(x => x.code) : [];
      const alvo = situacaoEquivalente(def.situacao, c.item);
      const texto = String(tx[({ feriasNova: 'feriasAnalise' })[c.tipo] || c.tipo] || '').replace(/\{aba\}/g, c.aba || '').replace(/\{outra\}/g, c.outra == null ? '' : String(c.outra));
      return Object.assign(c, { rot: def.rot, botao: def.botao, pode, acao: { situacao: alvo && sits.includes(alvo) ? String(alvo) : '', texto } });
    }).sort((a, b) => ORDEM_CASOS.indexOf(a.tipo) - ORDEM_CASOS.indexOf(b.tipo) || (b.item.parado || 0) - (a.item.parado || 0));
  }
  // Lembrete pessoal do aviso trabalhado: no dia útil antes da data do aviso (às 9h); sem a data, no próximo dia útil
  function lembreteAvisoTrabalhado(item, s, now) {
    const hol = new Set((s && s.feriados) || []);
    const hoje = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const av = item.avisoEm ? diaDe(item.avisoEm) : null;
    let dia = av ? utilAntes(somaDias(av, -1), hol) : somaUteis(hoje, 1, hol);
    if (dia < hoje) dia = hoje;
    const quando = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), 9, 0, 0);
    const pt = x => String(x.getDate()).padStart(2, '0') + '/' + String(x.getMonth() + 1).padStart(2, '0');
    return { texto: 'Emitir o aviso prévio trabalhado (sem cálculo) · #' + item.num + ' ' + (item.apelido || item.cliente || '') + (item.detalhe ? ' · ' + item.detalhe : ''), quando: quando.toISOString(), dia: pt(dia), semData: !av, k: item.k, type: item.type, num: String(item.num), cliente: item.apelido || item.cliente || '' };
  }
  // "Não é o caso": guarda só o k e a última movimentação (volta se a solicitação mexer); até 300, nada com mais de 180 dias
  function ignorarCaso(marcas, k, item, now) {
    const l = Object.assign({}, marcas || {});
    now = now || new Date();
    if (item) l[k] = { l: item.last || '', em: now.toISOString() }; else delete l[k];
    const lim = now.getTime() - 180 * 864e5;
    for (const [x, v] of Object.entries(l)) if (!v || !v.em || new Date(v.em).getTime() < lim) delete l[x];
    return Object.fromEntries(Object.entries(l).sort((a, b) => b[1].em.localeCompare(a[1].em)).slice(0, 300));
  }
  /* Previsão de solicitações por empresa: a partir das abertas nos últimos N dias (todas as situações, lidas na hora),
   * média por semana, tendência (2 semanas mais recentes x 2 anteriores) e estimativa para os próximos 7 e 30 dias,
   * pesando mais as semanas recentes. É estimativa simples, não promessa. */
  function previsaoPorEmpresa(itens, now, dias) {
    now = now || new Date(); dias = dias || 28;
    const desde = now.getTime() - dias * 864e5, meio = now.getTime() - 14 * 864e5;
    const m = new Map();
    for (const i of itens || []) {
      const cr = parseDate(i.created);
      if (!cr || cr.getTime() < desde) continue;
      const k = i.codCliente !== '' && i.codCliente != null ? 'c' + i.codCliente : 'n' + semAcento(i.cliente || i.apelido || '');
      if (!m.has(k)) m.set(k, { cliente: i.cliente || i.apelido || '—', apelido: i.apelido || '', total: 0, recentes: 0, anteriores: 0, tipos: {} });
      const r = m.get(k);
      r.total++; if (cr.getTime() >= meio) r.recentes++; else r.anteriores++;
      r.tipos[i.typeLabel || i.type] = (r.tipos[i.typeLabel || i.type] || 0) + 1;
    }
    const semanas = dias / 7;
    const lista = [...m.values()].map(r => {
      const porSemana = r.total / semanas;
      const ponderada = (r.recentes / 2) * 0.6 + (r.anteriores / Math.max(1, semanas - 2)) * 0.4;
      const tend = r.recentes > r.anteriores * 1.25 + 0.5 ? 'sobe' : r.anteriores > r.recentes * 1.25 + 0.5 ? 'desce' : 'estavel';
      const tipos = Object.entries(r.tipos).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, n]) => ({ tipo: t, n }));
      return { cliente: r.cliente, apelido: r.apelido, total: r.total, porSemana: Math.round(porSemana * 10) / 10, prox7: Math.round(ponderada), prox30: Math.round(ponderada * 30 / 7), tendencia: tend, tipos };
    }).sort((a, b) => b.prox30 - a.prox30 || b.total - a.total || a.cliente.localeCompare(b.cliente, 'pt-BR'));
    return { dias, empresas: lista, total: lista.reduce((s2, r) => s2 + r.total, 0), prox30: lista.reduce((s2, r) => s2 + r.prox30, 0) };
  }

  g.OC = { ORIGIN, API, PORTAL, TYPES, TYPE_BY_KEY, FAMILIAS, DEFAULTS, listUrl, collect, search, evaluate, normalize, parseDate, diasUteis, porAnalista, fmtData, gravidade, primeiroTramiteEsc, urlTramites, abaProvavel, porCliente, atualizarSerie, eventos, clienteRespondeu, MOTIVOS, GRUPOS_SIT, grupoSituacao, perfilSetor, filtrarPorSetor, prazoPrometido, DEPARTAMENTOS, ROT_DEPARTAMENTO, temAcidente, ordemFila, motivoDe, prioridades, ordenarTipos, PARES_TIPO, contarMotivos, acaoDe, progressoPrazo, tendencias, FAIXAS_IDADE, faixaDe, mapaIdade, cargaEscritorio, sugerirDistribuicao, placarDoDia, novoLembrete, adiarLembrete, situacaoLembrete, perfilDaSessao, formatoSessao, perfilDoAcesso, URL_SO_ESCRITORIO, REPETICOES, proximaOcorrencia, concluirLembrete, urlConsulta, detalheDe, tramitesDe, urlDetalhe, camposDetalhe, datasDe, prazoPagamento, verificarAvisos, assuntoPedirConcluir, textoPedirConcluir, URL_CRIAR_GERAL, modeloCriacao, pedidoCriacao, acharCriada, observacoesCliente, traduzirCampo: k => rotulo(k), traduzirValor: (k, v) => valorDe(k, v), admissoesCriticas, escritorioTramitou, porqueGravidade, moldeDeAnexo, urlAnexo, rotaAnexoFixa, leituraAnexoPermitida, arquivosDe, pedeAlgoAoCliente, vereditoResolvida, vencimentosLegais, malUso, CASOS, planoConclusao, analisarCaso, analisarCasos, casosSugeridos, ignorarCaso, intencoesDe, variaveisTramite, preencherModelo, modelosPara, marcadoresPendentes, avisosResposta, despersonalizar, previsaoPorEmpresa, lerMovimentadas, ACOES, podeAcao, situacoesTramite, pedidoAcao, urlNovoTramite, urlAnexoTramite, urlResponsavel, urlExpectativa, idDoLocation, escritaPermitida, equipeDe, distribuirPorCliente, avaliarEquipe, analisarEntrega, analisarEntregas, creditarQuemConcluiu, faixaNota, ADMISSAO, diaDe, uteisAte, somaUteis, ymd, normalizarRegras, combinarSettings, LIMITES, urlSonda, assinaturas, assinaturasDiferem };
})(typeof self !== 'undefined' ? self : this);

/* Conjuntos do Onvio FICTÍCIOS (nomes, CNPJs e datas inventados), gerados com as funções reais da extensão
 * (OC.tabelaLista, OC.tabelaPessoais, OC.tabelaCnd, OC.tabelaNfe), para o teste do Hub ler o mesmo formato que a extensão envia. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function carregarCore() {
  const ctx = { console, URL, URLSearchParams }; ctx.self = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'extensao', 'core.js'), 'utf8'), ctx);
  return ctx.OC;
}
const OC = carregarCore();
const dia = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); const p = x => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const iso = (n, hm) => dia(n) + 'T' + (hm || '10:00:00');

const CLIENTES = {
  orion: { id: 'c-orion', code: '900', name: 'ORION COMERCIO LTDA', nickname: 'ORION', isOnvio: true, sendingEsocial: false, allowEmployeeRegistration: true },
  vega: { id: 'c-vega', code: '901', name: 'VEGA SERVICOS ME', nickname: 'VEGA', isOnvio: true, sendingEsocial: true, allowEmployeeRegistration: false },
  zeta: { id: 'c-zeta', code: '902', name: 'ZETA TRANSPORTES LTDA', nickname: 'ZETA', isOnvio: true, sendingEsocial: false, allowEmployeeRegistration: false },
  lira: { id: 'c-lira', code: '903', name: 'LIRA PADARIA LTDA', nickname: 'LIRA', isOnvio: true, sendingEsocial: false, allowEmployeeRegistration: false },
  omega: { id: 'c-omega', code: '904', name: 'OMEGA SERVICOS LTDA', nickname: 'OMEGA', isOnvio: true, sendingEsocial: false, allowEmployeeRegistration: false }
};
const ANA = { id: 'u-ana', name: 'Ana Teste' };
const emp = (nome, cod, adm) => ({ name: nome, cpf: '00000000000', hireDate: adm, status: 'ATIVO', gender: 'F', jobPosition: 'A1', employeeWorkload: '220', integrationCode: cod });
const base = (id, n, st, cli, extra) => Object.assign({ id, identifier: n, genericStatus: st, created: iso(-5), changed: iso(-1), lastUpdated: iso(-2), requestWay: 'PORTAL', clientExpanded: cli, staffResponsibleExpanded: ANA, departmentId: 'd-dp' }, extra);

// 3 empresas no Onvio; as duas primeiras existem no DP do teste (a terceira, ZETA, não)
const ITENS = {
  geral: [
    base('g1', 704, 5, CLIENTES.orion, { changed: iso(-20), subject: 'Documentos do mês', description: 'Segue em anexo.', requesterExpanded: { name: 'Contato da ORION' } }),
    base('g2', 706, 1, CLIENTES.zeta, { subject: 'Dúvida de folha', description: 'Olá', requesterExpanded: { name: 'Contato da ZETA' } }),
    base('g4', 708, 1, CLIENTES.lira, { subject: 'Pergunta', description: 'Olá', requesterExpanded: { name: 'Contato da LIRA' } }),
    base('g5', 709, 1, CLIENTES.omega, { subject: 'Primeiro contato', description: 'Olá', requesterExpanded: { name: 'Contato da OMEGA' } })
  ],
  cadEmpregado: [
    base('cad1', 703, 1, CLIENTES.vega, { admissionDate: dia(3), name: 'Novo Funcionario', clientEmployeeExpanded: null, subject: 'Admissão', description: '' })
  ],
  avisoFerias: [
    base('f1', 701, 1, CLIENTES.orion, { vacationStartDate: dia(10), noticeDate: dia(-1), paymentDate: dia(8), vacationDays: 20, bonusDays: 10, clientEmployeeExpanded: emp('Maria Souza', '101', '2024-03-01'), subject: 'Férias da Maria', description: 'Férias em 20 dias' }),
    base('f2', 707, 4, CLIENTES.vega, { vacationStartDate: dia(30), vacationDays: 30, clientEmployeeExpanded: emp('Joao Lima', '301', '2023-05-02'), subject: 'Férias do João' })
  ],
  calcRescisao: [
    base('r1', 702, 1, CLIENTES.orion, { resignationDate: dia(-3), terminationReasonId: 'm1', terminationType: 'WORKED', clientEmployeeExpanded: emp('Beltrano Silva', '202', '2022-02-01'), subject: 'Rescisão do Beltrano' })
  ],
  afastamento: [
    base('a1', 705, 2, CLIENTES.orion, { leaveDate: dia(-2), employeeLeaveTypeId: '3', clientEmployeeExpanded: emp('Maria Souza', '101', '2024-03-01'), subject: 'Atestado' })
  ]
};
ITENS.cadEmpregado[0].clientEmployeeExpanded = undefined;

function tabelas() {
  const out = {};
  for (const [k, itens] of Object.entries(ITENS)) {
    const t = OC.TYPE_BY_KEY[k], slug = OC.slugHub(k);
    out['lista-' + slug] = { categoria: 'listas', ...OC.tabelaLista(t, itens) };
    out['pessoais-' + slug] = { categoria: 'pessoais', ...OC.tabelaPessoais(t, itens) };
  }
  // as listas sem solicitação do teste vêm vazias (com cabeçalho), como a extensão manda
  for (const k of Object.keys(OC.TYPE_BY_KEY)) {
    const slug = OC.slugHub(k);
    if (!out['lista-' + slug]) out['lista-' + slug] = { categoria: 'listas', ...OC.tabelaLista(OC.TYPE_BY_KEY[k], []) };
  }
  out['clientes-cnd'] = { categoria: 'clientes', ...OC.tabelaCnd([
    { id: 'c-orion', code: '900', clientName: 'ORION COMERCIO LTDA', clientStatus: 'ACTIVE', nationalIdentity: '11222333000181', municipalInscription: '12345', stateInscription: '987654', stateInitials: 'SP', cityIbgeIdentifier: '3550308', documentType: 'CNPJ', isOnvio: true },
    { id: 'c-vega', code: '901', clientName: 'VEGA SERVICOS ME', clientStatus: 'ACTIVE', nationalIdentity: '22333444000192', municipalInscription: '', stateInscription: '', stateInitials: 'SP', cityIbgeIdentifier: '3550308', documentType: 'CNPJ', isOnvio: true },
    { id: 'c-zeta', code: '902', clientName: 'ZETA TRANSPORTES LTDA', clientStatus: 'ACTIVE', nationalIdentity: '33444555000103', municipalInscription: '', stateInscription: '55555', stateInitials: 'MG', cityIbgeIdentifier: '3106200', documentType: 'CNPJ', isOnvio: true },
    { id: 'c-lira', code: '903', clientName: 'LIRA PADARIA LTDA', clientStatus: 'ACTIVE', nationalIdentity: '44555666000104', municipalInscription: '777', stateInscription: '', stateInitials: 'SP', cityIbgeIdentifier: '3509502', documentType: 'CNPJ', isOnvio: true },
    { id: 'c-ct', code: '1', clientName: 'CONTROLTAX CONSULTORIA E NEGOCIOS LTDA', clientStatus: 'ACTIVE', nationalIdentity: '10870633000104', municipalInscription: '', stateInscription: '', stateInitials: 'ES', cityIbgeIdentifier: '3205309', documentType: 'CNPJ', isOnvio: true },
    { id: 'c-dyn', code: '6', clientName: 'DYNEXA TRIBUTARIO & GESTAO ESTRATEGICA LTDA', clientStatus: 'ACTIVE', nationalIdentity: '17339246000195', municipalInscription: '', stateInscription: '', stateInitials: 'ES', cityIbgeIdentifier: '3205309', documentType: 'CNPJ', isOnvio: true },
    { id: 'c-omega', code: '904', clientName: 'OMEGA SERVICOS LTDA', clientStatus: 'ACTIVE', nationalIdentity: '55666777000105', municipalInscription: '888', stateInscription: '999', stateInitials: 'RJ', cityIbgeIdentifier: '3304557', documentType: 'CNPJ', isOnvio: true }
  ]) };
  out['clientes-nfe'] = { categoria: 'clientes', ...OC.tabelaNfe([
    { id: 'c-orion', code: '900', name: 'ORION COMERCIO LTDA', nickname: 'ORION', active: true, clientStatus: 'ACTIVE', nationalIdentity: '11222333000181', uf: 'SP', isOnvio: true, certificateExpanded: { expirationDate: dia(20) + 'T00:00:00' } },
    { id: 'c-of', code: '7', name: 'OFICINA BUSINESS APOIO ADMINISTRATIVO LTDA', nickname: 'OFICINA | 0001-07', active: true, clientStatus: 'ACTIVE', nationalIdentity: '40035488000107', uf: 'ES', isOnvio: true },
    { id: 'c-dk', code: '615', name: 'DISKCONTADOR SERVICOS CONTABEIS LTDA', nickname: 'DISKCONTADOR 0001-17', active: true, clientStatus: 'ACTIVE', nationalIdentity: '47261129000117', uf: 'ES', isOnvio: true }
  ]) };
  out['escritorio-tabelas'] = { categoria: 'escritorio', colunas: ['Tabela', 'Código', 'Descrição', 'Detalhes'], linhas: [
    'Tipos de afastamento\t3\tDoença (até 15 dias)\tgera CAT: não · visível: sim',
    'Motivos de rescisão\tm1\tPedido de demissão\tcálculo: sim · aviso prévio: sim · estágio: não'
  ] };
  out['pessoais-pendentes-dados'] = { categoria: 'pessoais', colunas: ['Chave', 'Nº', 'Lista', 'Grupo', 'Campo', 'Valor'], linhas: [
    'avisoFerias:f1\t701\tAviso de férias\tFérias\tInício das férias\t' + dia(10),
    'avisoFerias:f1\t701\tAviso de férias\tFérias\tDias de abono\t10',
    'avisoFerias:f1\t701\tAviso de férias\tEmpregado\tNome\tMaria Souza'
  ] };
  out['pessoais-pendentes-tramites'] = { categoria: 'pessoais', colunas: ['Chave', 'Nº', 'Lista', 'Trâmite', 'Em', 'Situação', 'Vez', 'Autor', 'Texto', 'Anexos'], linhas: [
    'avisoFerias:f1\t701\tAviso de férias\t1\t' + dia(-1) + ' 09:00\tSem análise\tcliente\tContato da ORION\tOlá, segue o aviso de férias da Maria.\t',
    'avisoFerias:f1\t701\tAviso de férias\t2\t' + dia(0) + ' 08:30\tEm análise\tescritório\tAna Teste\tRecebido, vamos calcular.\t'
  ] };
  out['analise-solicitacoes'] = { categoria: 'analise', colunas: ['Chave', 'Lista', 'Nº', 'Situação', 'Vez', 'Cliente', 'Responsável', 'Aberta em', 'Última movimentação', 'Dias parado', 'D.u. parado', 'D.u. aberta', 'D.u. até o 1º trâmite', 'Gravidade', 'Prazo legal', 'Motivos', 'Prometido até', 'Prescreve em', 'Atraso do cliente', 'Resolvida sem retorno', 'Departamento'], linhas: [
    'avisoFerias:f1\tAviso de férias\t701\tSem análise\tescritório\tORION\tAna Teste\t' + dia(-5) + '\t' + dia(-1) + '\t1\t1\t4\t\tG2\tsim\tAberta há 4 d.u. (limite 3)\t' + dia(2) + '\t\tnão\t\t7'
  ] };
  return out;
}

// DP do teste: ORION e VEGA existem; ZETA não
function empresas() {
  const f = (id, nome, codigo, adm, extra) => Object.assign({ id, nome, cargo: 'Auxiliar', codigo, admissao: adm, status: 'Ativo', aquisitivo: '', feriasInicio: '', feriasFim: '', rescisao: '', salario: '', obs: '' }, extra);
  return [
    { id: 'e-orion', cod: '55', nome: 'ORION COMERCIO LTDA', cnpj: '11.222.333/0001-81', codigoDominio: '55', tributacao: 'Simples Nacional', responsavel: 'Ana Teste', situacao: 'Ativa', uf: 'São Paulo/SP',
      funcionarios: [f('f-maria', 'Maria Souza', '101', '2024-03-01'), f('f-beltrano', 'Beltrano Silva', '', '2022-02-02')], historico: [], lembretes: [], prazos: [] },
    { id: 'e-vega', cod: '56', nome: 'VEGA SERVICOS ME', cnpj: '22.333.444/0001-92', codigoDominio: '56', tributacao: 'Simples Nacional', responsavel: 'Bruno Teste', situacao: 'Ativa', uf: 'São Paulo/SP', funcionarios: [], historico: [], lembretes: [], prazos: [] },
    { id: 'e-ct', cod: '1', nome: 'CONTROLTAX GESTAO LTDA', cnpj: '10.870.633/0001-04', codigoDominio: '1', tributacao: 'Lucro Presumido', responsavel: 'Ana Teste', situacao: 'Ativa', uf: 'Espírito Santo', funcionarios: [f('f-ct1', 'Fulano Do Escritorio', '1', '2020-01-01'), f('f-ct2', 'Ciclana Do Escritorio', '2', '2021-01-01')], historico: [], lembretes: [], prazos: [] },
    { id: 'e-dyn', cod: '6', nome: 'DYNEXA TRIBUTARIO & GESTAO ESTRATEGICA LTDA', cnpj: '17.339.246/0001-95', codigoDominio: '6', tributacao: 'Lucro Presumido', responsavel: 'Ana Teste', situacao: 'Ativa', uf: 'Espírito Santo', funcionarios: [f('f-dy1', 'Beltrano Dynexa', '3', '2022-01-01')], historico: [], lembretes: [], prazos: [] },
    { id: 'e-lira', cod: '58', nome: 'LIRA PADARIA', cnpj: '', codigoDominio: '58', tributacao: 'Simples Nacional', responsavel: 'Ana Teste', situacao: 'Ativa', uf: 'Campinas/RJ', funcionarios: [f('f-erica', 'Erica Teste', '26', '2024-06-06'), f('f-diego', 'Diego Teste', '', '2025-02-03')], historico: [], lembretes: [], prazos: [] }
  ];
}

// A folha inteira de cada cliente (pessoais-empregados), gerada pela tarefa real da extensão (OC.hubPlano) com uma API simulada:
// quem nunca teve solicitação também vem. NOVA CLIENTE não está no DP nem nos clientes de CND (só aparece aqui).
async function empregados(soNomes) {
  const dto = (id, name, cod, adm, status, extra) => Object.assign({ id, name, cpf: '00000000000', hireDate: adm, status: status || 'ACTIVE', gender: 'F', jobPosition: 'A1', employeeWorkload: '220', integrationCode: cod, clientEmployeeRelationshipExpanded: { eprType: 'EMPLOYEE' } }, extra);
  const porCliente = {
    'c-orion': [dto('o1', 'Maria Souza', '101', '2024-03-01'), dto('o2', 'Beltrano Silva', '202', '2022-02-01'), dto('o3', 'Carlos Sem Pedido', '105', '2021-06-01'), dto('o4', 'Dona Antiga', '99', '2018-01-10', 'INACTIVE')],
    'c-vega': [dto('v1', 'Joao Lima', '301', '2023-05-02'), dto('v2', 'Antiga Colega', '302', '2020-02-02', 'INACTIVE')],
    'c-lira': [dto('l1', 'Lira Funcionaria', '401', '2022-09-05'), dto('l2', 'Erica Teste', '26', '2025-02-03'), dto('l3', 'Diego Teste', '26', '2024-06-06')],   // Erica e Diego: no DP as datas estão trocadas e os dois têm o código 26 no Onvio (numerações de filiais diferentes se cruzam)
    'c-nova': [dto('n1', 'Nova Um', '501', '2024-01-02'), dto('n2', 'Nova Dois', '502', '2024-02-03', 'ACTIVE', { clientEmployeeRelationshipExpanded: { eprType: 'INTERN' } })]
  };
  const clientes = [{ id: 'c-orion', code: 900, name: 'ORION COMERCIO LTDA' }, { id: 'c-vega', code: 901, name: 'VEGA SERVICOS ME' }, { id: 'c-lira', code: 903, name: 'LIRA PADARIA LTDA' }, { id: 'c-nova', code: 950, name: 'NOVA CLIENTE SA' }];
  const f = async url => {
    const u = new URL(url), m = /clients\/([^/]+)\/employees$/.exec(u.pathname);
    if (m) return porCliente[m[1]] || [];
    if (/br-payroll-sr\/v1\/clients$/.test(u.pathname)) return { items: clientes, totalItems: clientes.length, totalPages: 1 };
    throw new Error('sem rota ' + u.pathname);
  };
  if (soNomes) for (const k of Object.keys(porCliente)) porCliente[k] = porCliente[k].filter(x => soNomes.includes(x.name));     // só quem aparece nas solicitações do teste
  const t = OC.hubPlano(['pessoais']).find(x => x.id === 'pessoais:empregados');
  const [c] = await t.executar(f, { pausa: null });
  return { categoria: 'pessoais', colunas: c.colunas, linhas: c.linhas };
}

const itens = () => JSON.parse(JSON.stringify(ITENS));         // cópia das solicitações do teste (para montar conjuntos novos)
const CLI = CLIENTES;
module.exports = { tabelas, empregados, empresas, itens, CLI, emp, dia, OC };

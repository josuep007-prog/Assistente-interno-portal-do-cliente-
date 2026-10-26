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
    { id: 'c-omega', code: '904', clientName: 'OMEGA SERVICOS LTDA', clientStatus: 'ACTIVE', nationalIdentity: '55666777000105', municipalInscription: '888', stateInscription: '999', stateInitials: 'RJ', cityIbgeIdentifier: '3304557', documentType: 'CNPJ', isOnvio: true }
  ]) };
  out['clientes-nfe'] = { categoria: 'clientes', ...OC.tabelaNfe([
    { id: 'c-orion', code: '900', name: 'ORION COMERCIO LTDA', nickname: 'ORION', active: true, clientStatus: 'ACTIVE', nationalIdentity: '11222333000181', uf: 'SP', isOnvio: true, certificateExpanded: { expirationDate: dia(20) + 'T00:00:00' } }
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
  return out;
}

// DP do teste: ORION e VEGA existem; ZETA não
function empresas() {
  const f = (id, nome, codigo, adm, extra) => Object.assign({ id, nome, cargo: 'Auxiliar', codigo, admissao: adm, status: 'Ativo', aquisitivo: '', feriasInicio: '', feriasFim: '', rescisao: '', salario: '', obs: '' }, extra);
  return [
    { id: 'e-orion', cod: '55', nome: 'ORION COMERCIO LTDA', cnpj: '11.222.333/0001-81', codigoDominio: '55', tributacao: 'Simples Nacional', responsavel: 'Ana Teste', situacao: 'Ativa', uf: 'São Paulo/SP',
      funcionarios: [f('f-maria', 'Maria Souza', '101', '2024-03-01'), f('f-beltrano', 'Beltrano Silva', '', '2022-02-02')], historico: [], lembretes: [], prazos: [] },
    { id: 'e-vega', cod: '56', nome: 'VEGA SERVICOS ME', cnpj: '22.333.444/0001-92', codigoDominio: '56', tributacao: 'Simples Nacional', responsavel: 'Bruno Teste', situacao: 'Ativa', uf: 'São Paulo/SP', funcionarios: [], historico: [], lembretes: [], prazos: [] },
    { id: 'e-lira', cod: '58', nome: 'LIRA PADARIA', cnpj: '', codigoDominio: '58', tributacao: 'Simples Nacional', responsavel: 'Ana Teste', situacao: 'Ativa', uf: 'Campinas/RJ', funcionarios: [], historico: [], lembretes: [], prazos: [] }
  ];
}

module.exports = { tabelas, empresas, dia, OC };

# Extrato Mensal FICTÍCIO (dados inventados) no mesmo arranjo do relatório do Domínio, para o teste do leitor de PDF.
import sys
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
out = sys.argv[1]
c = canvas.Canvas(out, pagesize=A4); c.setTitle('Extrato Mensal'); c.setAuthor('teste')
W, H = A4
def cab(pag):
    c.setFont('Helvetica-Bold', 9)
    c.drawString(30, H-40, 'Empresa: EMPRESA FICTICIA DE TESTE LTDA'); c.drawString(380, H-40, 'CNPJ: 00.000.000/0001-00')
    c.setFont('Helvetica', 8)
    c.drawString(30, H-52, 'Cálculo: Folha Mensal'); c.drawString(250, H-52, 'Competência: 09/2026'); c.drawString(480, H-52, 'Página: %d/2' % pag)
def pessoa(y, cod, nome, cpf, adm, vinc, cargo, evts):
    c.setFont('Helvetica-Bold', 8)
    c.drawString(30, y, cod); c.drawString(60, y, nome); c.drawString(300, y, cpf); c.drawString(400, y, adm)
    c.setFont('Helvetica', 8)
    c.drawString(60, y-11, 'Vínculo: ' + vinc); c.drawString(200, y-11, 'Cargo: ' + cargo); c.drawString(380, y-11, 'Salário: 1.000,00')
    for i, (ec, en, ev) in enumerate(evts):
        c.drawString(60, y-24-11*i, ec); c.drawString(90, y-24-11*i, en); c.drawRightString(520, y-24-11*i, ev)
    return y - 40 - 11*len(evts)
cab(1)
y = H-80
y = pessoa(y, '12', 'FULANO DE TAL FICTICIO', '111.222.333-44', '01/02/2020', 'Celetista', 'AUXILIAR', [('8781', 'HORAS NORMAIS', '2.000,00')])
y = pessoa(y, '15', 'SICRANA SOCIA FICTICIA', '222.333.444-55', '01/01/2015', 'Diretor', 'SOCIO ADMINISTRADOR', [('1', 'PRO LABORE DIAS', '5.000,00'), ('903', 'INSS', '550,00')])
c.showPage(); cab(2); y = H-80
y = pessoa(y, '21', 'BELTRANO AUTONOMO FICTICIO', '333.444.555-66', '10/08/2026', 'Autônomo', 'PEDREIRO', [('9', 'INSS AUTONOMO', '110,00')])
c.setFont('Helvetica', 8); c.drawString(30, y-10, 'Total de Contribuintes: 2'); c.drawString(250, y-10, 'Total de Empregados: 1')
c.save()

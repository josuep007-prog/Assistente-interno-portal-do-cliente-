# Guias da folha · decisões e desenho (16/11/2026)

Função pedida pelo Josué em 13/11/2026. O mapa dos sites (FGTS Digital e e-CAC) sai do roteiro `prompt-guias-fgts-dctfweb-2026-11-13.md` (PR #208) e do complemento `prompt-guias-fgts-complemento-2026-11-16.md`; vira `guias-fgts-dctfweb.md` quando o resultado chegar. Este arquivo guarda o que já está decidido e o desenho da tela.

## Decidido (Josué, 13/11/2026 e 16/11/2026)
- Só FGTS (FGTS Digital) e DCTFWeb (e-CAC). DAE doméstico fora.
- A lista de "folha publicada sem guia" sai das tarefas do Gestta; o valor esperado sai do Extrato Mensal do portal de documentos (pdf.js do offscreen, só na memória).
- Certificado: o analista escolhe uma vez por sessão; o resto é automático. Captcha nunca é contornado: a extensão para, mostra a aba e continua quando o analista resolver.
- **Nome do arquivo no Gestta: `MM-AAAA DARF FGTS.pdf`** (competência na frente). No servidor segue o padrão do servidor (`DARF FGTS MM-AAAA.pdf`), porque a pasta baixada é para salvar lá.
- **Valor que não bate:** só registrar, com os dois valores e a diferença, **só na memória da tela e no relatório da pasta baixada** (nunca em `chrome.storage`). Não emite, não anexa, não comenta na tarefa.
- **Bate = diferença de até R$ 0,05** (5 centavos) entre o valor do extrato e o da guia.
- **Pasta final com subpastas** (competência e empresa): precisa da permissão `downloads` (pedida na hora, opcional).
- **Emissão aprovada** como etapa (fase 3), ação por ação: emitir guia do FGTS e DARF da DCTFWeb. Nunca pagar, transmitir, retificar nem excluir declaração.
- **DCTFWeb sempre pela matriz.**
- **FGTS: o analista escolhe por empresa** entre uma guia só para a matriz (traz todos os estabelecimentos) ou uma guia por filial.
- **Pacote do FGTS = três PDFs**, todos emitidos, conferidos e anexados na tarefa: a guia, o relatório do valor da guia (detalhe) e o relatório do empréstimo consignado. Mais o DARF da DCTFWeb: **quatro arquivos por empresa**.

## Em aberto (precisa do Josué ou do mapa)
1. Nome dos dois relatórios do FGTS no Gestta (sugestão: `MM-AAAA DETALHE GUIA FGTS.pdf` e `MM-AAAA CONSIGNADO FGTS.pdf`) e do DARF (`MM-AAAA DARF DCTFWEB.pdf`).
2. O que significa "conferido" em cada relatório: o detalhe tem de fechar com o valor da guia? o consignado tem de bater com a linha de consignado do extrato?
3. Guia por filial: em qual tarefa do Gestta ela é anexada (a da matriz ou a da filial, se a filial é cliente separado)?
4. Quais itens da tarefa recebem cada arquivo (o roteiro, passo 1, mapeia).

## Desenho da tela (aba "Guias da folha" nas Tarefas do Gestta)
Quatro faixas, de cima para baixo, o analista nunca perde onde está:
1. **Passos** (trilho no topo): 1 Escolher · 2 Conferir · 3 Emitir · 4 Anexar · 5 Baixar. O passo atual fica destacado e cada passo mostra um número (ex.: "Conferir 4/12").
2. **Andamento** (cartão fixo enquanto processa): empresa atual, etapa (extrato lido, débito no FGTS Digital, saldo na DCTFWeb, comparação, emissão), barra, **Parar**. Se o site pede captcha ou certificado, o cartão vira aviso ("Resolva na aba do FGTS Digital") com **Continuar**.
3. **Empresas** (tabela com caixas): empresa, folha publicada, esperado de FGTS e de DARF (do extrato), **modo do FGTS** (Matriz única ou Por filial), e uma linha de cinco pontos por empresa (extrato, FGTS, DCTFWeb, comparação, emissão) com a cor de cada um; estado final: Bateu, Não bateu, Parou, Erro, Anexada.
4. **Resultado** em duas listas: **Bateu** (os quatro arquivos de cada empresa, com visualização do PDF e o estado: emitido, conferido, anexado) e **Não bateu** (os dois valores, a diferença e o motivo provável). Embaixo, **Aprovar e anexar** (uma confirmação para o lote, com a lista dos arquivos e das tarefas) e **Baixar a pasta**.
Regras de tela: os dois estilos (Atual e Simplificado), claro e escuro, contraste medido; nada sem texto (estado nunca só por cor: ícone e palavra).

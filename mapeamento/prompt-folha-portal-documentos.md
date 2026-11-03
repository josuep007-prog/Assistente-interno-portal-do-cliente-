# Roteiro: relatórios da folha no portal de documentos do Onvio (só leitura)

**Regra do Josué (03/11/2026):** o contribuinte (sócio com pró-labore, autônomo/RPA) é **ativo só nos meses em que aparece na folha**, e pode aparecer de forma intermitente (ativo em agosto, fora em setembro, ativo em outubro). A lista de contribuintes do Onvio não é confiável para isso: tem contribuintes sem atividade que não foram desligados no Domínio. Ela continua dizendo só **quem é** contribuinte de cada empresa; a folha diz em **quais competências** ele esteve ativo. Todos os relatórios da folha vão para o portal e devem ser lidos (também servirão, depois, para conferir a folha com os impostos). Vale para todas as empresas.

Cole o texto abaixo no Claude com acesso ao Chrome, já logado no Onvio com o **usuário do escritório**, e devolva o relatório. Serve para a extensão ler os relatórios da folha que o escritório publica no portal de documentos (Onvio Drive): primeiro para conferir os contribuintes (quem teve pró-labore ou RPA na folha), depois para conferir a folha com os impostos.

---

Você vai mapear, **só lendo**, onde e como ficam os relatórios da folha de pagamento no portal de documentos do Onvio (https://onvio.com.br/), na visão do escritório ControlTax.

## Regras (inegociáveis)

- Só navegar e fazer requisições GET. Não enviar, mover, renomear, apagar nem compartilhar nada. Não clicar em Excluir, Mover, Enviar ou Compartilhar.
- Use primeiro a empresa de teste (EMPRESA EXEMPLO SIMPLES NACIONAL LTDA). Se ela não tiver folha publicada, escolha **uma** empresa-cliente que tenha folha com pró-labore e **duas** com só empregados; não abra outras.
- No relatório, **não copie** nome de pessoa, CPF, valor, salário, nome de empresa nem token. Troque por `EMPRESA A`, `PESSOA 1` e `R$ X`. Endereços de API: troque ids por `{id}`.
- Abra o DevTools (Rede, filtro "Fetch/XHR") para ver as chamadas.

## O que descobrir

1. **Caminho até a folha.** Partindo do cliente, quais pastas levam aos relatórios da folha (ex.: `Pessoal > 2026 > 10`)? O nome das pastas segue um padrão por ano e mês? Isso vale nas três empresas?
2. **Quais relatórios existem por competência.** Liste os tipos de arquivo que aparecem num mês: folha de pagamento, resumo, extrato mensal, recibos, pró-labore, RPA, guias (INSS/DCTFWeb, FGTS, IRRF), relação de líquidos, provisões e outros. Para cada um, informe o padrão do nome do arquivo (ex.: `FOLHA_{código}_{mm}{aaaa}.pdf`) e a extensão (PDF, XLS ou outra).
3. **Chamadas de API.**
   - Pasta raiz do cliente: `storage/v1/projects?primaryAssociationId=...`
   - Conteúdo de uma pasta: `storage/v2/Projects|Folders/{id}/children`, com os nomes dos campos do item (id, nome, tipo, data, tamanho, criado por) e a paginação.
   - A chamada que **baixa** ou **abre** um arquivo: método, caminho, se devolve o arquivo direto ou um `downloadUrl`, e de qual domínio.
   - Se existe busca de documentos (`storage/v1/containers/documents/search`): teste uma busca por nome de relatório ("folha") e informe o formato do pedido e da resposta. Só se for GET; se for POST, apenas anote, sem enviar.
4. **O PDF tem texto?** Abra um relatório de folha e um de pró-labore. Dá para selecionar e copiar o texto? Diga se cada um é PDF com texto ou imagem escaneada. Informe também onde ficam, no texto, o **código e o nome** de cada pessoa (ex.: "linha começa com o código do empregado") e a **competência**, sem copiar os dados.
5. **Quem é contribuinte na folha.** Como o relatório separa empregados de contribuintes (sócios, pró-labore, autônomos/RPA): título de seção, coluna "vínculo", relatório à parte? Algum desses relatórios lista só contribuintes?
6. **Quando sai.** Para as três empresas, em que dia do mês os relatórios da competência anterior aparecem no portal (data de criação dos arquivos)?
7. **Tamanho.** Quantos arquivos há por competência e o tamanho típico de cada um.

## Formato do relatório

Um documento em Markdown com as seções 1 a 7 acima, mais uma tabela "Rotas" (método, caminho com `{id}`, para que serve, status HTTP) e uma lista "Não consegui" com o que ficou de fora e por quê.

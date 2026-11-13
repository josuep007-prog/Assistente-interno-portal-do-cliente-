# Roteiro de mapeamento · Gestta: arquivo do item, e-mails com falha, remetente e templates da empresa (13/11/2026)

Para colar na extensão do Claude no Chrome, com o Gestta aberto e logado. Serve para a fase 2 da aba **Saúde** e do **arquivo do item** (extensão 0.110.0). O resultado volta para `mapeamento/gestta-2026-11-04.md`.

---

Você vai me ajudar a mapear algumas telas do Gestta (app.gestta.com.br), só olhando as chamadas que a própria tela faz. Não anote token, cookie, nome de cliente, CNPJ, nome de arquivo real nem e-mail: só método, endereço (troque ids por {id} e diga de onde cada id veio), nomes e tipos dos campos, códigos de situação e números.

Regras:
- Use SÓ a empresa de teste 9999 (EMPRESA EXEMPLO) e o template "TESTE MAPEAMENTO - NAO USAR". Se algum passo for mexer em outra empresa ou outro template, PARE e me avise.
- Crie no computador um PDF fictício com o texto "TESTE CONTROL ONVIO" (sem dado de ninguém) para os passos de arquivo.
- Não envie nada para cliente de verdade.

Antes de começar: DevTools (F12) > Network, filtro Fetch/XHR, marque "Preserve log".

## 1. Arquivo de um item da tarefa
1. Abra uma tarefa ABERTA da empresa 9999 que tenha um item de documento. Anexe o PDF de teste nesse item pela própria tela.
2. Recarregue a tarefa. Na resposta de `GET /core/customer/task/{id}`, dentro de `company_documents[]`, anote como vem o arquivo anexado: o nome do campo (`file`, `files` ou outro), se é objeto ou lista e os nomes e tipos dos campos de cada arquivo (nome do arquivo, data, quem anexou, endereço). Não anote os valores.
3. Clique no arquivo para abrir ou baixar. Anote a chamada que sai (método e endereço) e, se a resposta trouxer um endereço para baixar, só o domínio dele (ex.: `s3.amazonaws.com`) e se tem prazo de validade no endereço.
4. Exclua o arquivo de teste pela própria tela da tarefa. Anote a chamada (método, endereço, corpo, situação HTTP) e diga se o endereço leva o id do arquivo ou só o do item. Recarregue e confirme que o item ficou sem arquivo.

## 2. E-mails que não saíram
1. No Painel novo (dashboard), procure o indicador "E-mail não enviado" (atenção). Clique nele e anote a chamada que traz a LISTA: método, endereço, corpo (nomes e tipos dos campos) e as chaves da resposta (de cada item: tarefa, cliente, setor, motivo, data; só os nomes).
2. Na tela de tarefas (lista clássica), veja se há filtro de "e-mail não enviado". Se houver, ligue-o e anote se a busca `POST /core/customer/task/search` leva um campo novo no corpo (o nome e o tipo, ex.: `email_not_sent: true`).
3. Abra o histórico de uma tarefa da 9999 que avisa o cliente e anote, nos eventos do tipo EMAIL, os valores possíveis de `status` e de `reason` que aparecerem (esses são códigos, pode anotar).

## 3. Remetente do e-mail do escritório
1. Em Cadastros (admin), procure onde o Gestta configura quem envia o e-mail ao cliente (por setor ou por usuário). Anote o caminho do menu e a chamada GET que traz essa configuração (só os nomes dos campos).
2. Diga se algum setor aparece sem remetente configurado (só sim/não e quantos).

## 4. Tarefas de uma empresa
1. Abra a empresa 9999 em Cadastros > Clientes. Anote o endereço da página da empresa (troque o id por {id}) e as abas que ela tem.
2. Na aba Tarefas (ou "Geração de tarefas"), anote a chamada que lista os templates da empresa.
3. Inclua o template "TESTE MAPEAMENTO - NAO USAR" na empresa 9999 e anote a chamada (método, endereço, corpo, situação HTTP).
4. Tire esse mesmo template da empresa 9999 e anote a chamada.
5. Abra o template "TESTE MAPEAMENTO - NAO USAR" em Cadastros > Tarefas e anote a chamada que lista as empresas que recebem o template (deve ser `GET /admin/company/task/{id}/customer`): os nomes das chaves de cada item e se vem paginado.

Me devolva um resumo em texto com os itens 1 a 4, na ordem.

---

## Resultado do roteiro único (13/11/2026)

Os passos 0 a 4 de `prompt-gestta-faltante-2026-11-13.md` foram executados e estão no fim de `gestta-2026-11-04.md` (seção "Mapeado em 13/11/2026, passos 0 a 4"). O que sobrou: abrir o link Download da prévia, ver uma tarefa concluída com arquivo, o aviso ao tirar template com tarefa gerada e o `id` do `DELETE /admin/group/customer`.

## Situação depois da leitura de 13/11/2026

Os itens **2** (lista de e-mails, `email_not_sent` na busca) e **3** (remetente: um só para o escritório; aviso de DKIM) foram respondidos e entraram na extensão 0.115.0. O item **4.1 e 4.2** (página da empresa e `GET admin/customer/{id}/company/task`) também. **Seguem travados** pelo template de teste que não existe: **1.2 a 1.4** (arquivo do item), **4.3 e 4.4** (incluir e tirar template) e **4.5**. Para destravar, o Josué decide: criar o "TESTE MAPEAMENTO - NAO USAR" ou autorizar o "TESTE CONTROL ONVIO" da 9999. Pendente também: valores de `status` e `reason` de um evento `EMAIL` (2.3), que só existem numa tarefa que já enviou e-mail.

## O que a extensão faz com cada resposta

| Item | Hoje (0.110.0) | Depois do mapeamento |
|---|---|---|
| 1.2 campos do arquivo | Mostra o nome do arquivo se vier em `file`/`files` com `name`, `file_name` ou `original_name`; senão, "✓ com arquivo" | Ajusta o molde ao formato real |
| 1.3 abrir/baixar | Não existe | **Ver** o arquivo dentro da extensão (leitura: entra direto, blob só na memória) |
| 1.4 excluir | Não existe | **Excluir** o arquivo do item: escrita nova, só com aprovação do Josué, confirmação com o nome do arquivo e nunca em tarefa concluída |
| 2 lista de e-mails | **0.115.0:** a lista direta (busca com `email_not_sent`, corpo da tela, 30 dias) chega sozinha; o motivo vem do histórico pelo botão | (feito) |
| 3 remetente | **0.115.0:** aviso de domínio não verificado ou DKIM falhando (remetente único; não há por setor) | (feito) |
| 4 templates da empresa | Só sugere (falta, sobra) e abre a empresa no Gestta | Aplicar ou tirar o template pela extensão: escrita nova, com aprovação, em lote com uma confirmação |

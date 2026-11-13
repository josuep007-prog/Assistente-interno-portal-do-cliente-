# Roteiro único · o que falta mapear no Gestta (13/11/2026)

Para colar na extensão do Claude no Chrome, com o Gestta (app.gestta.com.br) aberto e logado. Fecha de uma vez o que a leitura de 13/11/2026 deixou travado: arquivo do item, incluir e tirar template de uma empresa, os valores dos e-mails e três conferências da Saúde (0.115.0). O resultado volta para `mapeamento/gestta-2026-11-04.md`.

---

Você vai me ajudar a mapear algumas telas do Gestta, só olhando as chamadas que a própria tela faz (DevTools F12 > Network, filtro Fetch/XHR, marque "Preserve log"; cada app do Gestta é uma página separada, então reinstale o registro de chamadas ao trocar de app). Não anote token, cookie, nome de cliente, CNPJ, nome de arquivo real nem e-mail de ninguém: só método, endereço (troque ids por {id} e diga de onde vem cada um), nomes e tipos dos campos do corpo e da resposta, e a situação HTTP. Valores só onde eu pedir (são códigos).

Regras:
- Tudo que ESCREVE (passos 0, 1, 4) é só na empresa de teste 9999 (EMPRESA EXEMPLO) e só no template "TESTE MAPEAMENTO - NAO USAR". Se algum passo for mexer em outra empresa ou outro template, PARE e me avise.
- NÃO clique em "Gerar tarefas", "Remover tarefas" nem "Remover tarefas abertas ignorando suas interações" na aba Geração de tarefas.
- Não envie nada para cliente de verdade e não conclua nenhuma tarefa que avise o cliente.
- Os passos 2 e 3 são SÓ LEITURA e podem usar qualquer empresa, mas anote apenas códigos (status, reason, contagens), nunca nomes.
- No fim, deixe a 9999 como estava: arquivo de teste excluído, template tirado da empresa. O template de teste pode ficar no sistema.
- Crie no computador um PDF fictício com o texto "TESTE CONTROL ONVIO" (sem dado de ninguém).

## 0. Template de teste
1. Em Configure (engrenagem no fim do menu lateral) > Tarefas recorrentes > Gerenciar, procure "TESTE MAPEAMENTO - NAO USAR". Se não existir, crie: setor Pessoal, recorrente, mensal, SEM "notificar cliente por e-mail" e SEM WhatsApp, com UM item de documento (use um template de documento qualquer que já exista, sem pasta de portal se possível).
2. Anote a chamada de criar o template (método, endereço, corpo, situação) só se você criou agora.

## 1. Arquivo de um item da tarefa
1. Inclua o template de teste na 9999 (passo 4.3 abaixo) e gere/abra uma tarefa ABERTA dele pelo caminho normal da tela (se a única forma for "Gerar tarefas", me avise em vez de clicar). Se já existir uma tarefa aberta do "TESTE CONTROL ONVIO" na 9999, pode usar essa só para este passo 1.
2. Anexe o PDF de teste no item pela própria tela. Anote a chamada de anexar (método, endereço, corpo/formulário com os nomes dos campos, situação).
3. Recarregue a tarefa. Em `GET /core/customer/task/{id}`, dentro de `company_documents[]`, anote como vem o arquivo: nome do campo (`file`, `files` ou outro), se é objeto ou lista, e os nomes e tipos dos campos de cada arquivo (nome, data, autor, tamanho, id; NÃO copie o endereço nem o nome real).
4. Clique no arquivo para abrir ou baixar. Anote a chamada (método e endereço) e, se a resposta trouxer um endereço para baixar, só o DOMÍNIO dele (ex.: `s3.amazonaws.com`) e se o endereço tem prazo de validade.
5. Exclua o arquivo de teste pela própria tela. Anote a chamada (método, endereço, corpo, situação HTTP) e diga se o endereço leva o id do arquivo ou só o do item. Recarregue e confirme que o item ficou sem arquivo.
6. Diga se a tela deixa excluir o arquivo de uma tarefa CONCLUÍDA (só sim/não; não conclua nada para testar: olhe uma já concluída da 9999 e veja se o botão aparece).

## 2. E-mails: valores e conferências (só leitura)
1. Abra o Painel novo (dashboard-v2) > "Pontos de atenção" > "Tarefas com falhas de envio últimos 30 dias" e clique em "E-mail" (abre a lista clássica já filtrada). Anote o corpo EXATO de `POST /core/customer/task/search` que a tela manda, nome por nome, e diga se ele leva `start_date` e `end_date` (e, se levar, o intervalo em dias entre eles, sem as datas). Anote o `total` da resposta e o número que o painel mostra.
2. Repita a mesma busca tirando `start_date` e `end_date` (se a tela deixar editar ou se o filtro de período existir) e diga se o `total` muda e para quanto.
3. Para até 5 tarefas dessa lista (de qualquer empresa), abra o histórico (`GET /core/customer/task/{id}/history?page=`) e anote só os eventos do tipo EMAIL: `status` e `reason` (códigos) e os nomes das chaves do evento. Se um evento tiver `email_log`, anote só os nomes das chaves, nunca os valores. Liste todos os valores diferentes de `status` e de `reason` que aparecerem.
4. Em `GET /admin/company/email/domain`, anote os valores (são códigos) de `verified`, `domain_status` e `dkim_status`. Não anote `domain`, `email`, `domain_txt_name` nem `domain_txt_value`.

## 3. Pequenas conferências (só leitura)
1. `GET /admin/customer/count-without-task`: o formato da resposta (número solto ou objeto, e o nome da chave).
2. `GET /admin/company/task?limit=&page=`: as chaves de paginação da resposta (`totalDocs`, `totalPages`, `page`...) e o limite máximo aceito de `limit`.
3. `GET /admin/company/task/{id}/customer` (de qualquer template que tenha várias empresas): as chaves de cada item, se vem paginado e como (nomes das chaves e limite), e se traz só ativas ou todas.
4. `GET /admin/customer/{id}/company/task` da 9999: as chaves de cada item (já mapeado, só confirme se a lista vem paginada).

## 4. Tarefas de uma empresa (escrita só na 9999 e só no template de teste)
1. Abra a 9999 em Cadastros > Clientes > aba Tarefas (`.../customer/edit/{id}/task`).
2. Anote a chamada que lista os templates da empresa (já mapeada: confirme).
3. **Inclua** o template "TESTE MAPEAMENTO - NAO USAR" na 9999 pela própria tela e anote a chamada (método, endereço, corpo com nomes e tipos, situação HTTP, e as chaves da resposta). Diga se a tela inclui vários de uma vez (e, se incluir, o corpo para vários).
4. **Tire** esse mesmo template da 9999 e anote a chamada (método, endereço, corpo, situação). Diga se a tela tira vários de uma vez.
5. Diga o que a tela avisa ao tirar um template que já tem tarefa gerada (só o texto do aviso, sem nomes).
6. Abra o template no catálogo e anote a chamada que lista as empresas que o recebem (deve ser `GET /admin/company/task/{id}/customer`).
7. Confirme que a 9999 voltou a ter só o que tinha antes (o "TESTE CONTROL ONVIO").

Me devolva um resumo em texto, na ordem 0 a 4, marcando o que NÃO foi possível fazer e por quê.

---

## O que a extensão faz com cada resposta

| Item | Hoje (0.115.0) | Depois do mapeamento |
|---|---|---|
| 1.3 campos do arquivo | "✓ com arquivo" (o molde tenta `file`/`files`) | Mostra o nome do arquivo logo abaixo do item |
| 1.4 abrir/baixar | Não existe | **Ver** dentro da extensão (leitura; o arquivo só na memória) |
| 1.5, 1.6 excluir | Não existe | **Excluir o arquivo**: escrita nova, só com aprovação do Josué, confirmação com o nome e nunca em tarefa concluída |
| 2.1, 2.2 corpo da tela e período | Janela de 30 dias (palpite: o mapa não listava as datas) | Ajusta a janela para bater com o painel |
| 2.3 status e reason do e-mail | Traduz `NOT_SENT`, `NOT_SENT_NO_CUSTOMER_ACCOUNTABLE`, `SENT`, `DELIVERY` | Traduz todos os motivos reais |
| 2.4 estado do domínio | Reconhece verified/success/ok como bom e failed/erro como falha | Troca pelos valores reais |
| 3 formatos | Aceita número solto ou `{count}`; pagina por `totalPages` | Ajusta o que divergir |
| 4.3, 4.4 incluir e tirar template | Só sugere (falta, sobra) e abre a empresa no Gestta | **Aplicar ou tirar o template pela extensão**: escrita nova, com aprovação do Josué, em lote com uma confirmação, uma empresa por vez |

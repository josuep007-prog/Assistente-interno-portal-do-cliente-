# Control Onvio · ControlTax (v0.1.0)

Extensão do Chrome que junta numa fila só as solicitações pendentes do Portal do Cliente Onvio, com prazos, alerta de prescrição e notificações. Fase 1: **somente leitura**, nada é alterado no Onvio.

## Instalar (piloto)

1. Baixe o repositório (Code > Download ZIP) ou o arquivo `ControlOnvio_v0.1.0.zip` e descompacte numa pasta fixa (ex.: `C:\ControlTax\ControlOnvio`). Não apague a pasta depois.
2. No Chrome, abra `chrome://extensions`.
3. Ligue o **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** e escolha a pasta que contém o `manifest.json` (no repositório, a pasta `extensao`).
5. Fixe o ícone da extensão na barra (ícone de quebra-cabeça > alfinete).
6. Entre no Onvio normalmente. Clique no ícone: o painel lateral abre e faz a primeira leitura.

Para atualizar a versão: substitua os arquivos da pasta e clique em **Recarregar** no card da extensão em `chrome://extensions`.

## O que tem

| Recurso | Onde |
| --- | --- |
| Fila única das 10 listas (Geral, Cadastro x3, Férias x2, Rescisão x2, Afastamento, Rubricas) | Painel lateral |
| Abas Minhas, Sem resp., Equipe, Analistas e Buscar | Painel lateral |
| Semáforo por solicitação (faixa vermelha ou laranja, com o motivo) | Cada linha |
| Contagem para prescrição (30 dias) | Linhas na vez do cliente |
| Contador no ícone: minhas solicitações com ação do escritório | Ícone da extensão |
| Notificações: nova para você, cliente respondeu, prescreve em 5 dias, nova sem responsável (modo gestor) | Chrome |
| Clique na linha abre a lista certa do Onvio já filtrada pelo ID | Onvio |
| Exportar a visão atual em CSV (abre no Excel) | Rodapé do painel |
| Prazos, intervalo e feriados editáveis | Engrenagem do painel |

## Regras do semáforo (padrão, editáveis)

Vez do escritório: sem primeiro trâmite após 1 dia útil; aberta além de 3 dias úteis (simples) ou 5 (cálculo de férias e rescisão); parada há mais de 15 dias; expectativa de conclusão vencida.
Vez do cliente: sem retorno há mais de 5 dias úteis (laranja); a partir de 20 dias parada fica vermelho com a contagem até a prescrição de 30 dias.

Leitura das situações: em Geral, Férias, Rescisão e Afastamento, **Aguardando resposta** = o escritório precisa responder; **Respondido** = vez do cliente.

## Privacidade

A extensão usa a sessão do Onvio de quem está logado e só vê o que o perfil da pessoa já vê. Guarda no computador apenas ID, situação, datas, cliente, empregado/assunto e responsável. Não guarda CPF, salário nem anexos.

## Problemas comuns

- **"Sem sessão no Onvio"**: abra o Onvio e faça login; a extensão tenta de novo no próximo ciclo (ou clique em atualizar).
- **Aba Minhas vazia**: só aparecem solicitações em que você é o responsável no Onvio.

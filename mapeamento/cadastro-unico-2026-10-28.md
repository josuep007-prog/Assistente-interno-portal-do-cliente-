# Cadastro único de empresas do Hub (28/10/2026)

Pedido do Josué: revisar todos os cadastros de empresas do Hub e deixá-los unificados e integrados. Decisões dele: **base = clientes do Onvio + exceções**, **duplicadas e sem CNPJ só propostas (nada fundido ou apagado sozinho)** e **tudo de uma vez**.

## Diagnóstico (dados reais de 28/10/2026, só leitura)

Quatro cadastros separados, sem ligação entre si:

| Onde | Coleção | Empresas | Chave |
|---|---|---|---|
| DP | `dp_empresas` | 256 | ids de 4 formatos (slug, número+slug, uuid, `onv-`) |
| Contábil | `ctb_emp` | 350 (em baldes `b0` a `b7`) | CNPJ em 14 dígitos (`c<cnpj>`; sem CNPJ: `n<slug>`) |
| Portal do Cliente | `empresas` | 494 | slug do nome |
| Fiscal | `fis_emp` | 0 (módulo ainda em modo exemplo) | igual ao Contábil |

- 642 CNPJs diferentes no total e só 87 nos três cadastros (Portal∩Contábil 243, Portal∩DP 125, Contábil∩DP 140). 430 clientes do Onvio não estão em nenhum cadastro do Hub; 29 CNPJs do Hub não são clientes do Onvio.
- Em 96 das 125 empresas que estão no Portal e no DP o nome é diferente.
- DP: 7 CNPJs em dois documentos (a Mercocamp 0010-24 tem o cadastro com 260 funcionários e outro vazio), 7 documentos sem CNPJ (6 empregadores domésticos e o `MERCOCAMP … SA`, cliente 166). Contábil: 23 sem CNPJ.
- ControlTax, Dynexa, Oficina e Diskcontador continuam gravados nos cadastros (o Hub só os esconde desde o 292).

## O que foi feito (Hub 300)

- **Cadastro único** `cadastro_empresas`, em baldes `b0` a `b7` (como o Contábil, para nenhum documento passar de 256 KB), uma entrada por CNPJ (14 caracteres): `razao`, `apelido` (do Onvio), `codigoOnvio`/`codigosOnvio`, `codigoDominio` (do DP), `uf`, `situacao` (`ativa`, `inativa`, `fora-do-onvio`), `origem` (`onvio`/`hub`), `raiz` (matriz e filiais), `vinculos` (`dp`, `ctb`, `portal`, `fis`: ids dos documentos de cada módulo, o principal primeiro) e `modulos`. **Nada nos cadastros dos módulos é alterado.**
- **Entrada de dados → aba "Cadastro único"** (só a coordenação gera): `Ver relatório` (lê os quatro cadastros e não grava), `Fazer backup dos 4 cadastros` (`cad_backup`, um backup só, em pacotes de até ~230 KB; **gerar exige backup**) e `Gerar/Atualizar`. O relatório lista: duplicadas no mesmo módulo (com a sugestão de qual manter: a que tem mais funcionários no DP), sem CNPJ completo (com candidatos pelo nome), empregadores domésticos, fora do Onvio, nomes diferentes e empresas do escritório (fora). Só grava os CNPJs que mudaram; gerar de novo não regrava.
- **DP:** o nome no padrão "apelido | final do CNPJ" vem do cadastro único; a ficha ganhou a seção **Cadastro único** (razão, apelido, códigos, matriz e filiais e "Está em": atalhos para abrir a empresa no Contábil, Portal e Fiscal); criar empresa pela tela ou pela Entrada de dados também registra no cadastro único.
- **API para os módulos** (`window.parent.__cadastro`): `get`, `nome`, `razao`, `vinculos`, `registrar`, `abrir`. **Contábil, Fiscal e Portal** (`contabil.js`, `fiscal.js`, `portal.js`) agora avisam o cadastro único quando uma empresa é criada ou salva neste módulo (`cadMestre`, só avisa; nunca altera a empresa). **Antes de a coordenação gerar o cadastro, nada disso grava.**
- Escritório: ControlTax, Dynexa, Oficina e Diskcontador ficam de fora do cadastro (`ehEscritorioProprio`).

## O que ficou para depois (decisão a tomar)

- **Contábil, Fiscal e Portal ainda mostram o nome do próprio módulo.** Os formulários deles gravam de volta o `nome` exibido; trocar o nome na tela sem um campo à parte corromperia a razão social deles. Precisa de um campo de exibição separado em cada módulo.
- **Fundir as duplicadas e dar CNPJ aos cadastros sem CNPJ** é decisão manual (o relatório só propõe).
- **Restaurar o backup** é manual (copiar os pacotes de `cad_backup` de volta); não há botão.
- Sem teste automático dos três módulos (o repositório só testa o Hub).

## Unificar empresas duplicadas do DP (Hub 301, 28/10/2026)

Pedido do Josué ao ver "ADEGA SC | 0002-66" duas vezes na lista de ligar cliente a empresa do DP. No banco: 7 CNPJs com duas empresas no DP. Seis são **gêmeas criadas no mesmo instante** (mesmo `order`, ids uuid, uma com os funcionários e a outra só com a nota "cadastrada a partir do Onvio"): a aplicação automática rodando em dois navegadores ao mesmo tempo, antes do executor único. A sétima é a Mercocamp (001024), cadastro antigo × cadastro atual.

- Entrada de dados → Cadastro único → Ver relatório → "Duplicadas no mesmo módulo" (DP): botão **Unificar A em B** por par (só coordenação). B é a que fica: a com mais funcionários, e no empate a que tem vínculo do Onvio.
- Antes de gravar, a janela mostra quem fica, quem sai e o que passa para a que fica (campos vazios, linhas que só a outra tem, observações e histórico), mais o vínculo do Onvio que será redirecionado.
- Ordem das gravações, parando na primeira falha sem apagar nada: cópia da descartada em `cad_backup/dup_<id>` → empresa que fica → `dp_config/onvio` (vínculos) → exclusão da descartada. A que fica ganha uma nota no histórico.
- Recusa: CNPJs completos diferentes, documento resultante acima de 240 KB, descartada acima de 235 KB, sem permissão de coordenação.
- Lembretes pessoais (`data/users/...`) ligados à descartada perdem o vínculo com a empresa (são privados de cada pessoa; o aviso está na janela).
- Contábil, Fiscal e Portal não são alterados.
- Para voltar atrás: o documento original da descartada fica em `cad_backup/dup_<id>` (campo `dados`).
- Teste: passo "Cadastro único de empresas" em `testes/hub-onvio/hub-onvio.js`.

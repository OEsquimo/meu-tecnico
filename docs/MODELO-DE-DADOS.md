# Modelo de dados (Firestore)

Datas "de dia" são texto `AAAA-MM-DD`; momentos são `Timestamp`; dinheiro é **centavos inteiros**.

| Caminho | Quem lê | Quem grava | Campos principais |
|---|---|---|---|
| `donosApp/{uid}` | o próprio uid | **ninguém** (só no Console) | marca quem é dono do app |
| `config/regras` | logados | dono do app | diasTeste, descontoLancamentoAtivo/Percentual, whatsappVendas, instrucoesPagamento |
| `planos/{id}` | logados | dono | nome, precoCentavos, limiteClientes (999999 = ilimitado), financeiroCompleto, ativo, ordem, descricao |
| `usuarios/{uid}` | o próprio | cria o próprio (cadastro/convite); admin bloqueia técnico | empresaId, papel `admin`\|`tecnico`, ativo, nome, equipeId? |
| `empresas/{empresaId}` (id = uid do admin) | membros ativos e dono | admin (config), contador (acoplado ao cliente), dono (plano/validade/bloqueio) | nome, donoUid, emailAdmin, nomeAdmin, planoId, planoAte, testeEstendidoAte, bloqueada, contadorClientes, ultimoClienteId, permiteTecnicoCliente, diasAvisoRetorno, mensagemWhatsapp, criadoEm |
| `…/equipe/{id}` | admin (lista); convite por link; **o técnico lê o próprio cadastro** | admin; técnico aceita convite | nome, telefone, status `convite`\|`ativo`\|`bloqueado`, uid, **verValores**, **alterarValores** (booleanos; padrão falso; alterar implica ver) |
| `…/tiposServico/{id}` | membros | admin | nome, geraRetorno, retornoPadraoMeses (0/3/4/6/12), duracaoMin (15–720, padrão 60; tipos antigos sem o campo usam 60), ativo, ordem |
| `…/clientes/{id}` | admin (e técnico se liberado) | idem; criar/excluir só junto do contador | nome, whatsapp, observacoes, enderecos[≤20], criadoPor |
| `…/aparelhos/{id}` | membros | membros (criar/editar); admin exclui | clienteId, enderecoId, tipo, btus, nome, descricao, ativo |
| `…/servicos/{id}` | admin; técnico só os dele (qualquer um dos técnicos do serviço) | admin; técnico só conclui o serviço onde é um dos técnicos | dados copiados (clienteNome, clienteWhatsapp, local, aparelhoResumo, tipoServicoNome, tecnicoNome…), status `agendado`\|`concluido`\|`cancelado`, dataAgendada, descricao, pago, valorDefinido, dataConclusao, garantiaAte, retornoMeses, dataRetorno, retornoSituacao, ultimoAvisoEm, origemRetornoId, **tecnicoUids / tecnicosNomes** (lista de técnicos; ≥1) e **ocupacaoPorTecnico** `{uid: minutos}`; `tecnicoUid`/`tecnicoNome` = o primeiro (compatibilidade e consultas; serviço antigo só tem estes), **agendamentoId** (liga as linhas da mesma visita; serviço antigo = ele mesmo), **obsAgendamento / obsAparelho / obsServico** (observações), **duracaoMin**, **ocupacaoMin** (tempo total do técnico na visita; usado na checagem de horário), **ordem**. Cada linha = 1 serviço de 1 aparelho; `tipoServicoId` vazio = "Serviço a definir" |
| `…/valores/{servicoId}` | admin; técnico liberado lê só o dos serviços dele (um por vez) | admin; técnico com `alterarValores` só **cria**, no lote em que conclui o próprio serviço | **valorCentavos** (= total = base + extras − desconto), baseCentavos, extras[{descricao, valorCentavos}] (≤20), descontoCentavos, tipoNome, dataConclusao |
| `…/precos/{tipoId}` | admin; técnico liberado (ver/alterar) | admin | valorCentavos (valor padrão do tipo de serviço; sem documento = sem preço padrão) |

## Decisões importantes
- **Valores e preços padrão em coleções separadas**: o Firestore não esconde campos dentro de um documento; assim o técnico só lê dinheiro se o administrador liberou (`verValores`/`alterarValores` no cadastro dele). O preço padrão fica fora de `tiposServico` porque todo técnico lê os tipos.
- **Vários técnicos por serviço**: as consultas do técnico rodam duas buscas (`tecnicoUids array-contains` e `tecnicoUid ==`) e unem o resultado, porque serviços antigos não têm a lista. Índices novos em `firestore.indexes.json`.
- As regras não somam listas: conferem só o formato do valor; o total é calculado pelo app (e o administrador pode corrigir).
- **Contador de clientes** (`contadorClientes`) é alterado no **mesmo lote** que cria/exclui o cliente; as regras conferem isso (não dá para burlar o limite do plano).
- **Dados copiados no serviço**: o técnico não lê a ficha do cliente; o histórico fica fiel à época; economiza leituras.
- **Tipos padrão** são criados num segundo lote (as regras só reconhecem o admin depois do primeiro lote).
- Índices: `firestore.indexes.json`.
- Backup JSON inclui clientes, aparelhos, serviços, tipos e valores (valores só no backup do admin).

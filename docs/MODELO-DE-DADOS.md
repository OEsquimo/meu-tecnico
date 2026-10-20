# Modelo de dados (Firestore)

Datas "de dia" são texto `AAAA-MM-DD`; momentos são `Timestamp`; dinheiro é **centavos inteiros**.

| Caminho | Quem lê | Quem grava | Campos principais |
|---|---|---|---|
| `donosApp/{uid}` | o próprio uid | **ninguém** (só no Console) | marca quem é dono do app |
| `config/regras` | logados | dono do app | diasTeste, descontoLancamentoAtivo/Percentual, whatsappVendas, instrucoesPagamento |
| `planos/{id}` | logados | dono | nome, precoCentavos, limiteClientes (999999 = ilimitado), financeiroCompleto, ativo, ordem, descricao |
| `usuarios/{uid}` | o próprio | cria o próprio (cadastro/convite); admin bloqueia técnico | empresaId, papel `admin`\|`tecnico`, ativo, nome, equipeId? |
| `empresas/{empresaId}` (id = uid do admin) | membros ativos e dono | admin (config), contador (acoplado ao cliente), dono (plano/validade/bloqueio) | nome, donoUid, emailAdmin, nomeAdmin, planoId, planoAte, testeEstendidoAte, bloqueada, contadorClientes, ultimoClienteId, permiteTecnicoCliente, diasAvisoRetorno, mensagemWhatsapp, criadoEm |
| `…/equipe/{id}` | admin (lista); convite por link | admin; técnico aceita convite | nome, telefone, status `convite`\|`ativo`\|`bloqueado`, uid |
| `…/tiposServico/{id}` | membros | admin | nome, geraRetorno, retornoPadraoMeses (0/3/4/6/12), ativo, ordem |
| `…/clientes/{id}` | admin (e técnico se liberado) | idem; criar/excluir só junto do contador | nome, whatsapp, observacoes, enderecos[≤2], criadoPor |
| `…/aparelhos/{id}` | membros | membros (criar/editar); admin exclui | clienteId, enderecoId, tipo, btus, nome, descricao, ativo |
| `…/servicos/{id}` | admin; técnico só os dele | admin; técnico só conclui o próprio | dados copiados (clienteNome, clienteWhatsapp, local, aparelhoResumo, tipoServicoNome, tecnicoNome…), status `agendado`\|`concluido`\|`cancelado`, dataAgendada, descricao, pago, valorDefinido, dataConclusao, garantiaAte, retornoMeses, dataRetorno, retornoSituacao, ultimoAvisoEm, origemRetornoId |
| `…/valores/{servicoId}` | **só admin** | admin | valorCentavos, tipoNome, dataConclusao |

## Decisões importantes
- **Valores em coleção separada**: o Firestore não esconde campos dentro de um documento; assim o técnico nunca consegue ler dinheiro.
- **Contador de clientes** (`contadorClientes`) é alterado no **mesmo lote** que cria/exclui o cliente; as regras conferem isso (não dá para burlar o limite do plano).
- **Dados copiados no serviço**: o técnico não lê a ficha do cliente; o histórico fica fiel à época; economiza leituras.
- **Tipos padrão** são criados num segundo lote (as regras só reconhecem o admin depois do primeiro lote).
- Índices: `firestore.indexes.json`.
- Backup JSON inclui clientes, aparelhos, serviços, tipos e valores (valores só no backup do admin).

# Regras de negócio

## Perfis
- **Dono do app**: cria planos, regras globais e gerencia contas (ativar, trocar plano, estender teste, bloquear). Não vê clientes nem serviços das empresas.
- **Administrador**: dono da empresa; vê tudo da empresa, inclusive valores e Financeiro.
- **Técnico**: vê só os serviços atribuídos a ele, **sem valores**; conclui serviço (descrição + "cliente pagou? sim/não"); cadastra clientes só se o admin liberar.

## Cliente, endereço e aparelho
Cliente tem até **2 endereços** (CEP/ViaCEP, busca por rua, GPS ou manual) e vários aparelhos. WhatsApp do cliente é a base do lembrete.

## Serviço
`agendado → concluído` (ou `cancelado`). Ao concluir: garantia de **90 dias** (CDC art. 26). Se o tipo "gera retorno" (limpeza, manutenção preventiva) o usuário escolhe **3, 4, 6 ou 12 meses** (já vem o padrão do tipo) e nasce um lembrete.

### Agendamento (visita) com vários aparelhos e serviços
- **Uma data e uma hora por agendamento** (editáveis). Cada serviço tem o **seu técnico**.
- Pode agendar só com **cliente, dia, hora e técnico**. Aparelhos e serviços são opcionais no agendamento.
- Tela em cartões: um cartão por aparelho e, dentro dele, um por serviço. **Só dá para adicionar serviço depois de escolher/cadastrar o aparelho.** Cada nível tem seu campo de observações (agendamento, aparelho, serviço); ficam recolhidas atrás de "+ Observação" e abrem sozinhas se já têm texto.
- Na lista de técnicos aparecem **só os livres** no dia/hora. Livre = nenhum outro serviço agendado dele se sobrepõe ao intervalo [hora, hora + duração]. O mesmo técnico pode fazer vários serviços da mesma visita (as durações se somam). Sem técnico livre: aviso e o botão Agendar fica bloqueado. A checagem é repetida na hora de salvar.
- **Duração padrão por tipo de serviço**, editável em Tipos de serviço (padrão 60 min).
- O serviço tem botão **Editar**: troca o tipo e a duração só daquele serviço (a duração padrão vem do tipo, editável na área administrativa). A disponibilidade do técnico usa a duração ajustada.
- **Erros**: qualquer pendência mostra a mensagem junto do item, rola a tela até ele e coloca o cursor; o botão Agendar nunca fica desativado. Avisos rápidos somem sozinhos (um toque fecha), sem botão de fechar.
- Cliente, aparelhos e serviços podem ser editados/removidos na tela de agendamento. "Remover" tira só do agendamento; excluir o cadastro é feito na ficha do cliente (com confirmação).
- **Conclusão**: cada serviço tem seu botão "Concluir serviço". **Não conclui sem aparelho** (o técnico escolhe um do cliente ou cadastra na hora). Se o agendamento foi feito sem serviço, o tipo é escolhido na conclusão. O técnico pode adicionar um serviço na visita (depois de escolher o aparelho).
- Retornos continuam por aparelho × serviço (um lembrete por linha concluída que gera retorno).
- Serviços antigos (sem `agendamentoId`) continuam funcionando como uma visita de uma linha.

## Retornos
Estados: `pendente`, `agendado`, `recusado`, `feito`. Aparecem na tela Retornos quando `dataRetorno ≤ hoje + dias de aviso` (padrão **15**, configurável). Ações: **WhatsApp** (abre o app com a mensagem pronta; o envio é manual), **Agendar** (cria serviço com origem no retorno → `agendado`; ao concluir → `feito`; se cancelar volta a `pendente`), **Adiar** 7/15/30 dias, **Não quer mais** (`recusado`).
Mensagem editável com `{nome} {empresa} {servico} {aparelho}`.

## Planos e limites
- Conta nova = plano **Grátis** + **teste** (dias definidos pelo dono, padrão 7) com clientes ilimitados e Financeiro completo.
- Depois do teste: Grátis (limite do plano grátis, padrão 10; sem Financeiro completo).
- Plano pago **vigente** (`planoAte` no futuro): limite do plano. **Vencido**: não cadastra clientes novos (continua usando o resto e pode baixar o backup).
- **Bloqueada**: só backup e exclusão da conta.
- Tudo configurável pelo dono: preços, limites, Financeiro completo, dias de teste, desconto de lançamento, WhatsApp de vendas, instruções de pagamento.
- Pagamento v1: manual (Pix) + ativação pelo dono (+30 dias).
- A mesma lógica está em `dominio/planos.js` (mensagens) e em `firestore.rules` (que é quem vale).

## Financeiro
Períodos Hoje/Semana/Mês/Ano. Recebido = serviços pagos com valor; A receber = não pagos; serviços **sem valor** (feitos por técnicos) aparecem numa lista para o admin preencher. Plano sem Financeiro completo vê só o resumo do dia.

## Conta e dados (LGPD)
Backup JSON em todos os planos. Exclusão de conta apaga tudo (exige senha e digitar EXCLUIR). Textos legais em `textos-legais.js` são **modelo** — revisar com advogado.

## Comportamento técnico
Gravações recusadas offline e com limite de 15 s (nada fica "fantasma" na fila); leituras podem usar o cache; telas sempre com carregamento e botão "Tentar de novo"; barra de progresso ao abrir.

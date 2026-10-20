# Regras de negócio

## Perfis
- **Dono do app**: cria planos, regras globais e gerencia contas (ativar, trocar plano, estender teste, bloquear). Não vê clientes nem serviços das empresas.
- **Administrador**: dono da empresa; vê tudo da empresa, inclusive valores e Financeiro.
- **Técnico**: vê só os serviços atribuídos a ele, **sem valores**; conclui serviço (descrição + "cliente pagou? sim/não"); cadastra clientes só se o admin liberar.

## Cliente, endereço e aparelho
Cliente tem até **2 endereços** (CEP/ViaCEP, busca por rua, GPS ou manual) e vários aparelhos. WhatsApp do cliente é a base do lembrete.

## Serviço
`agendado → concluído` (ou `cancelado`). Ao concluir: garantia de **90 dias** (CDC art. 26). Se o tipo "gera retorno" (limpeza, manutenção preventiva) o usuário escolhe **3, 4, 6 ou 12 meses** (já vem o padrão do tipo) e nasce um lembrete.

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

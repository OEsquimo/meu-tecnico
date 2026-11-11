# Regras de negócio

## Perfis
- **Dono do app**: cria planos, regras globais e gerencia contas (ativar, trocar plano, estender teste, bloquear). Não vê clientes nem serviços das empresas.
- **Administrador**: dono da empresa; vê tudo da empresa, inclusive valores e Financeiro.
- **Técnico**: vê só os serviços em que é um dos técnicos; conclui serviço ("cliente pagou? sim/não" e, se quiser, o que foi feito); cadastra clientes só se o admin liberar. **Valores** dependem do cadastro dele (padrão: desligado): *Pode ver valores* (vê o valor, para responder o cliente) e *Pode alterar valor e extras* (muda valor, extras e desconto ao concluir; quem altera também vê). Nenhum técnico vê o Financeiro.

## Cliente, endereço e aparelho
Cliente tem **quantos endereços precisar** (limite técnico de 20, não mostrado) (CEP/ViaCEP, busca por rua, GPS ou manual) e vários aparelhos. Aparelho tem marca, modelo, número de série e data de instalação (opcionais). WhatsApp do cliente é a base do lembrete.

## Serviço
`agendado → concluído` (ou `cancelado`). Ao concluir: garantia de **90 dias** (CDC art. 26). Se o tipo "gera retorno" (limpeza, manutenção preventiva) o usuário escolhe **3, 4, 6 ou 12 meses** (já vem o padrão do tipo) e nasce um lembrete.

### Agendamento (visita) com vários aparelhos e serviços
- **Uma data e uma hora por agendamento** (editáveis). Cada serviço tem **um ou mais técnicos (pelo menos um)**; os livres aparecem como caixinhas.
- **Cartão por visita** na Agenda e no Início: cliente e endereço uma vez; serviços agrupados por aparelho, cada um com seus técnicos e o próprio "Concluir"; "Ir até o cliente" uma vez; "Editar" (só administrador) leva à edição. O técnico vê só os serviços dele na visita.
- Pode agendar só com **cliente, dia, hora e técnico**. Aparelhos e serviços são opcionais no agendamento.
- Tela em cartões: um cartão por aparelho e, dentro dele, um por serviço. **Só dá para adicionar serviço depois de escolher/cadastrar o aparelho.** Cada nível tem seu campo de observações (agendamento, aparelho, serviço); ficam recolhidas atrás de "+ Observação" e abrem sozinhas se já têm texto.
- Na lista de técnicos aparecem **só os livres** no dia/hora. Livre = nenhum outro serviço agendado dele se sobrepõe ao intervalo [hora, hora + duração]. O mesmo técnico pode fazer vários serviços da mesma visita (as durações se somam). Sem técnico livre: aviso e o botão Agendar fica bloqueado. A checagem é repetida na hora de salvar.
- **Duração padrão por tipo de serviço**, editável em Tipos de serviço (padrão 60 min).
- O serviço tem botão **Editar**: troca o tipo e a duração só daquele serviço (a duração padrão vem do tipo, editável na área administrativa). A disponibilidade do técnico usa a duração ajustada.
- **Erros**: qualquer pendência mostra a mensagem junto do item, rola a tela até ele e coloca o cursor; o botão Agendar nunca fica desativado. Avisos rápidos somem sozinhos (um toque fecha), sem botão de fechar.
- Cliente, aparelhos e serviços podem ser editados/removidos na tela de agendamento. "Remover" tira só do agendamento; excluir o cadastro é feito na ficha do cliente (com confirmação).
- **Conclusão**: cada serviço tem seu botão "Concluir serviço". **Não conclui sem aparelho** (o técnico escolhe um do cliente ou cadastra na hora). Se o agendamento foi feito sem serviço, o tipo é escolhido na conclusão. O técnico pode adicionar um serviço na visita (depois de escolher o aparelho).
- **Serviço com vários técnicos**: qualquer um deles pode concluir; a conclusão vale para o serviço inteiro. No Financeiro o valor é **dividido igualmente** entre os técnicos (centavos que sobram vão para o primeiro) e o serviço conta para cada um. Na agenda, cada técnico fica ocupado pelo tempo dele na visita.
- Retornos continuam por aparelho × serviço (um lembrete por linha concluída que gera retorno).
- Serviços antigos (sem `agendamentoId`) continuam funcionando como uma visita de uma linha.

## Valores do serviço
- **Valor padrão** por tipo de serviço (opcional), em Tipos de serviço (criar, editar, remover; excluir o tipo apaga o preço).
- Ao concluir, o valor **já vem preenchido** com o padrão; dá para mudar, somar **extras** (descrição + valor, quantos precisar) e dar **desconto**. **Total = valor + extras − desconto** (nunca negativo), mostrado na hora e também no total da visita.
- "O que foi feito?" fica no fim da tela e é **opcional**.
- Técnico sem *alterar*: conclui sem valor e o administrador confirma depois (Financeiro > Concluídos sem valor, ou "Informar/Corrigir valor" no serviço). O administrador corrige valor, extras e desconto de serviço concluído quando quiser.
- Excluir o serviço ou o agendamento apaga também o valor e os extras. O Financeiro soma o total (valor + extras − desconto).

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

## Pacote 3 — status, botões e histórico

- **Status**: Agendado (azul), Reagendado (roxo), Concluído (verde), Atrasado (vermelho), Cancelado (amarelo). Pendente aparece como Cancelado com a linha "Motivo: …".
- **Reagendar** não é mais um botão: editar um Cancelado com nova data/hora o torna **Reagendado** (confere de novo se o técnico está livre); sem mudar data/hora continua Cancelado. Reagendado segue roxo até ser concluído ou cancelado de novo (campo `reagendado`).
- **Botões**: Agendado/Reagendado/Atrasado → Concluir (ao lado de cada serviço), Editar, Cancelar, Excluir; Cancelado → Editar, Excluir; técnico só conclui os próprios serviços.
- **Concluído**: só o administrador corrige (descrição, valor, extras, pago) ou exclui, com confirmação dupla. Excluir restaura o lembrete de retorno de origem para "pendente". As regras do banco ainda permitem ao admin alterar concluídos; a proteção é do app.
- **Aparelhos**: ficha do cliente mostra "Ver aparelhos (N)". "Novo aparelho" vindo de um agendamento já leva o endereço (não pergunta). Excluir aparelho: com agendamento aberto recusa; com histórico de serviços fica oculto (`ativo:false`); sem histórico apaga de vez.
- **Excluir cliente**: com serviços concluídos o cliente é **arquivado** (`arquivado:true`, some das listas; agendamentos abertos removidos; retornos pendentes viram "recusado"; histórico e financeiro preservados). Ele continua ocupando uma vaga do plano. Sem concluídos, apaga de vez e libera a vaga.

## Pacote 4 — técnico e WhatsApp
- Na tela do agendamento, quando já existe botão de **Cobrar** (admin), o botão "WhatsApp" simples sai (era duplicado). "Ir até o cliente" ocupa uma linha inteira.
- Serviço que o **técnico acrescenta em campo** recebe a marca `adicionadoPeloTecnico`. Enquanto estiver agendado, só esse técnico pode **Editar** (trocar o tipo de serviço) e **Excluir** (com confirmação). Serviço agendado pelo administrador ou já concluído, o técnico nunca altera (usa "Não deu para fazer"). O administrador continua podendo tudo.

## Pacote 5 — serviço incluído em campo fica visível ao administrador
- Todo serviço que o técnico acrescenta no local mostra o selo **"Incluído pelo técnico"** (Agenda, Início, detalhes, ficha do cliente) e, depois de concluído, a lista de Concluídos indica "incluído pelo técnico". O valor entra pelo preço padrão do tipo de serviço: o administrador deve conferir.
- O Início do administrador mostra o aviso "<Técnico> incluiu N serviço(s) em campo" enquanto o administrador não tiver aberto o agendamento (campo `vistoPeloAdmin`; o técnico cria sempre como `false`, só o administrador muda para `true`). Ao abrir o agendamento, o aviso some.

## Pacote 6 — informar aparelhos e serviços
- Em **Agendar**, o cartão do cliente mostra só o nome (largura toda) com **Editar** (ícone de lápis); abaixo, o link pequeno **"Não é o cliente?"** reabre a busca. Sem iniciais, telefone nem botão Trocar.
- Atendimento agendado **sem aparelho e/ou sem serviço** ("Serviço a definir"): o botão vira **"Informar serviço"** (cartões, ficha do cliente) ou "Informar aparelho e serviço" (detalhes). Tocar em Concluir nessa linha mostra aviso amigável e leva à tela **Aparelhos e serviços** (`#/informar/:id`).
- Ordem: 1) escolher o aparelho do cliente (um só já vem escolhido) ou cadastrar um novo; 2) marcar um ou mais serviços para ele; "+ Aparelho" repete. O 1º par preenche a linha "a definir"; os demais viram linhas novas na visita. Cada linha é concluída pelo Concluir de sempre (uma por vez).
- Se quem informa é o técnico, as linhas ficam marcadas **"Incluído pelo técnico"** (o administrador é avisado no Início) e ele pode editar/excluir o que informou, enquanto agendado. O único serviço aberto da visita não é excluído por ele (use "Não deu para fazer").

## Pacote 7 — depois de concluir
- Ao concluir um serviço, se a visita ainda tem serviço aberto (do técnico, se for técnico), o app volta para o detalhe da visita para concluir o resto. Se era o último (ou o resto ficou "pendente"), vai para o Início.

## Pacote 8 — ajustes
- Tela "Aparelhos e serviços": o botão "+ Cadastrar aparelho novo" tem espaço em cima e embaixo.
- Tela "Concluir serviço": mostra também o aparelho (sem endereço).
- Depois de excluir um serviço (concluído ou adicionado) ou um agendamento: se sobrou serviço na visita, o app continua nela; se não sobrou nenhum, vai para o Início.

## Pacote 9 — horário de funcionamento e seletor de dia, hora e técnicos
- **Horário de funcionamento (Administrativa):** para cada dia da semana, aberto/fechado e hora de abrir e fechar. Padrão: segunda a sábado, 07:00–18:00; domingo fechado. Guardado em `empresas/{id}.expediente`. Valem para todos os técnicos (horário e folga por técnico ficam para depois).
- **Seletor de dia, hora e técnicos (tela cheia):** calendário em cima (só dias com horário livre ficam ativos, com um ponto; dias passados e sem vaga ficam apagados), horários livres do dia no meio (de 30 em 30 minutos, dentro do expediente, sem passar do fechamento) e, embaixo, os técnicos livres naquele horário (um ou mais; o primeiro livre já vem marcado). Carrega só os agendamentos do mês que está na tela; trocar de mês limpa o dia escolhido.
- **Onde é usado:** Agendar, Editar agendamento e Reagendar. Nessas telas o campo "Quando" (botão) substitui os campos soltos de dia, hora e técnicos da visita. O técnico de cada serviço continua podendo ser trocado no cartão do serviço, só entre os livres.
- **Duração usada para achar vaga:** o serviço mais longo da visita (60 minutos se ainda não há serviço). A conferência por técnico e por serviço continua valendo ao salvar.
- **Reagendar um cancelado:** salvar reagenda (vira "Reagendado"), inclusive no mesmo dia e hora, desde que o técnico esteja livre. Se o técnico do serviço está ocupado nesse horário, outro técnico livre assume; se ninguém está livre, o app não salva e mostra o motivo.

## Pacote 10 — cartão da visita, avisos e dias lotados
- **Cartão da visita** (Início e Agenda): o nome do cliente fica em cima, à esquerda; à direita, o status e, logo abaixo, a hora numa caixinha azul (nas visitas atrasadas, a data vai junto). O endereço vem embaixo, com a largura toda do cartão.
- **Aviso do técnico:** enquanto o dia e a hora não foram escolhidos, o cartão do serviço mostra um aviso cinza ("Escolha o dia e o horário em 'Quando' para ver os técnicos livres."). O aviso amarelo "Nenhum técnico está livre nesse dia e horário" só aparece depois de escolher dia e hora e de fato não haver técnico livre.
- **Agendamento cancelado:** ao editar, o aviso diz "Este agendamento está cancelado. Confira o dia e a hora (pode manter os mesmos)." Depois de salvar, a mensagem é "Agendamento reagendado." e o status fica Reagendado. Edição comum continua com "Agendamento atualizado."
- **Um calendário só** (Agenda e seletor de dia/hora usam o mesmo componente). **Um ponto por dia:** **azul** = o dia tem agendamento (status agendado) e ainda cabe outro serviço; **vermelho** = dia lotado (aberto, ainda não acabou e não dá mais para COMEÇAR nenhum serviço: ver Pacote 10c). O vermelho substitui o azul. Dia sem agendamento não tem ponto. Sem legenda. Dia selecionado: ponto branco (azul) ou rosado (vermelho). Leitor de tela: "N visita(s)" e "dia lotado".
- **Seletor:** dia fechado e dia passado ficam apagados e desligados (mostram azul se tiverem visita). Dia lotado pode ser tocado e mostra "Nenhum horário livre neste dia." (Confirmar desligado). 
- **Agenda:** todos os dias são tocáveis (visitas passadas = atrasadas, continuam azuis). O **vermelho só aparece para o administrador**; técnico comum vê só o azul. Com o filtro de técnico ligado, os pontos falam só daquele técnico (azul = visitas dele; vermelho = dia lotado para ele). Se a lista de técnicos não carregar, não há vermelho. O mês é buscado com 1 dia de folga antes e depois.

## Pacote 10c — hora extra, vermelho único e limpeza de telas
- **Hora extra:** o serviço pode terminar depois do fechamento. Os horários de início vão do abrir até **30 minutos antes de fechar** (fechando às 17:00, o último início é 16:30), qualquer que seja a duração. O serviço não fica "pela metade".
- **Aviso discreto:** no seletor, ao escolher um horário cujo serviço termina depois do fechamento, uma linha pequena e cinza (sem fundo e sem ícone): "Termina às 20:00, depois do expediente." (ou "depois da meia-noite"). Não bloqueia nada.
- **Dia seguinte livre:** a ocupação do técnico vale só até a **meia-noite do dia em que o serviço começa**. Um serviço longo no fim do dia não deixa o técnico ocupado no dia seguinte.
- **Vermelho único:** dia lotado = dia aberto, que ainda não acabou, em que **nenhum horário de início** (até 30 min antes de fechar) tem técnico livre (conta com 30 minutos). A regra é a mesma na Agenda e no seletor, e **não depende** da duração do serviço em montagem; por isso os dois calendários nunca divergem. Vale também ao editar e reagendar (o seletor é o mesmo). Filtro de técnico, vermelho só para o administrador e "sem vermelho se os técnicos não carregarem" continuam como no Pacote 10b.
- **Dia azul sem vaga para este serviço:** num dia aberto, não lotado, onde o serviço em montagem não cabe, o dia pode ser tocado e o seletor diz "Nenhum horário livre neste dia para este serviço. Escolha outro dia."
- **Agenda:** título "Agenda" centralizado; um único botão "Agendar" (só administrador), dentro do cartão do calendário, embaixo dos dias; abre Agendar no dia escolhido. Dia sem serviço mostra só "Nenhum serviço neste dia.".
- **Agendar:** não há mais aviso amarelo embaixo repetindo "Escolha o cliente." / "Escolha o dia e a hora."; o cartão "Escolher dia e horário" fica amarelo, com ícone de aviso, até a escolha. Tocar em Agendar sem escolher mostra o erro no campo.
- **Detalhe da visita:** não repete o que o cabeçalho e o cartão de cima já dizem (nome do serviço e situação numa visita de um serviço só; técnicos quando todos os serviços têm os mesmos).
- **Equipe:** o texto agora diz que os valores só aparecem para quem o administrador liberar. **Termos de uso** e **Política de privacidade** ficam só em Minha conta. Configurações: "Voltar ao lembrete padrão" e "Voltar à cobrança padrão".

## Pacote 10d — dia vermelho pelo menor serviço e "Informar serviço" simples

- **Vermelho:** o dia fica vermelho quando não cabe nem o MENOR serviço cadastrado (ativo; 60 min se não há tipos). A mesma regra vale na Agenda e no seletor, e não depende do serviço que está sendo agendado. Hora extra continua permitida (o serviço pode começar até 30 min antes de fechar e terminar depois).
- **Informar serviço:** a visita sem aparelho/serviço mostra o texto "Aparelho e serviço ainda não foram informados" e o botão "Informar aparelho e serviço" (nos cartões da Agenda/Início e na ficha do cliente o botão segue "Informar serviço"), que abre as mesmas perguntas do "Adicionar aparelhos e serviços" ("Em qual aparelho?" → "Qual serviço?"). A tela antiga `/informar/:id` foi removida; o endereço redireciona para `#/servico/:id?informar=1`, que abre a primeira pergunta. A linha "Serviço a definir" é consumida (preenchida) pelo primeiro serviço informado.
- **"Adicionar aparelhos e serviços"** só aparece quando a visita já tem pelo menos um serviço de verdade.
- **Excluir serviço e aparelho** continua só no Editar do agendamento: não há botão "Excluir" dentro do serviço nem "Remover da visita" no aparelho.

## Pacote 11 — pausa de almoço e limite de horas por técnico

- **Onde se configura:** Administrativa > Horário de funcionamento (mesma tela dos dias e horários). Guardado em `empresas/{id}.almoco = { ativo, de, ate }` e `empresas/{id}.limiteHorasDia` (número; 0 = sem limite). Valem para todos os técnicos. Padrão: almoço 12:00–13:00, ligado, e 8 horas por dia.
- **Pausa de almoço:** o técnico fica indisponível nesse intervalo. Um serviço de até 4 horas não começa dentro do almoço nem o atravessa (encostar no 12:00 ou começar às 13:00 pode). Serviço maior que 4 horas pode atravessar (senão nunca caberia). Almoço desligado = sem pausa.
- **Limite diário:** soma do tempo que o técnico já tem no dia (uma vez por visita, sem contar o agendamento em edição). Se o novo serviço fizesse passar do limite, o técnico não aparece como livre naquele horário. Exatamente no limite cabe. Dia ainda vazio: um serviço maior que o limite pode ser feito.
- **Dia vermelho:** a regra é a mesma de antes (não cabe nem o menor serviço), mas agora considera almoço e limite. Ex.: instalações de 2h30 com limite de 8 h: 3 por dia, e o dia fica vermelho.
- **Ao salvar o agendamento** o app confere de novo e avisa: "estaria no horário de almoço" ou "passaria do limite de horas de serviço do dia".
- Serviços já agendados não mudam; as regras valem para novos agendamentos e edições.

## Pacote 12 — dados do administrador e "Eu atendo serviços"

- **Meus dados (`#/equipe/eu`):** o cartão "Você" da Equipe abre a edição de Nome (obrigatório) e WhatsApp (opcional, válido quando preenchido). O administrador não tem Bloquear nem Remover. Nome e WhatsApp ficam em `usuarios/{uid}` (as regras permitem ao próprio administrador mudar só `nome` e `telefone`).
- **Eu atendo serviços:** interruptor guardado em `empresas/{id}.adminAtende` (ligado quando não existe, para não mudar nada de quem já usa o app). Só muda quando o administrador mexe: nunca é ligado nem travado sozinho. Desligado, o administrador não aparece na lista de técnicos ao agendar nem na conta do dia vermelho; sem nenhum técnico a atender, o dia simplesmente não tem horários. Serviços já agendados com ele não mudam. A Equipe mostra "Administrador · não atende serviços".

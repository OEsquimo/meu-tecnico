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
- **Serviço com vários técnicos**: qualquer um deles pode concluir; a conclusão vale para o serviço inteiro. O Financeiro **não mostra mais "Por técnico"** (pacote 21: a empresa não paga por técnico). Na agenda, cada técnico fica ocupado pelo tempo dele na visita.
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

## Pacote 13 — Ferramentas e link de horários para o cliente

- **Ferramentas:** quadrado "Ferramentas" no Início (mesma aparência dos outros) abre a lista de ferramentas. A lista fica em `nucleo/ferramentas.js`: cada ferramenta é uma linha com o `acesso` (`admin` ou `membro`). Para criar outra (ex.: calculadora de BTU) basta a tela, a rota e uma linha ali. O técnico só vê as ferramentas liberadas para ele (hoje nenhuma: o quadrado nem aparece para ele).
- **Enviar horários ao cliente** (`#/ferramentas/horarios`, só administrador): serviço opcional ("Não sei ainda · 1 h" por padrão; só serve para reservar o tempo certo), mensagem pronta, botão "Enviar pelo WhatsApp" (abre a lista de contatos do WhatsApp, sem escolher cliente) e "Copiar mensagem". Se o administrador não tem WhatsApp cadastrado, a tela pede o número na hora (o pedido do cliente chega nele).
- **O link:** `#/horarios?...` é uma página do próprio app, sem login e sem menu. Os horários livres dos **próximos 14 dias** vão compactados dentro do endereço (técnicos somados; valem as regras de expediente, almoço, limite de horas, horário passado e dia fechado). **Vale 7 dias** a partir do dia em que foi gerado. O link não guarda nenhum dado de cliente. Na etapa 1 o link não se atualiza: um horário que ficou ocupado depois só é percebido pelo administrador ao abrir o pedido.
- **Página do cliente:** uma tela só, com 3 passos: 1) dia (calendário; dias sem horário apagados), 2) horário (Manhã/Tarde), 3) dados: **Nome obrigatório**, **WhatsApp opcional** (se preenchido, precisa ser válido). Botão "Pedir este horário" (a página não diz que agendou). Depois aparece "Quase lá!": o cliente toca em "Enviar no WhatsApp" e aperta Enviar; o pedido vai para o WhatsApp do administrador. Não pergunta aparelho nem serviço (isso se combina na conversa). Link cortado, vencido ou sem horários mostra um texto simples e, quando dá, um botão para falar com o técnico no WhatsApp.
- **Pedido no WhatsApp do administrador:** traz dia, hora, nome (e WhatsApp, e serviço quando o administrador escolheu) e o botão "Técnico: abrir no app".
- **Agendar com o pedido** (`#/agendar?pedido=1&data=&hora=&nome=&whatsapp=`): dia e hora já vêm preenchidos e aparece o aviso verde "Pedido do cliente". O cliente é escolhido sozinho se existe um cadastro com o mesmo WhatsApp; senão aparecem dois botões: "Cadastrar cliente novo" (abre o cadastro com nome e WhatsApp preenchidos; o endereço o administrador completa e, depois de cadastrar, volta ao Agendar com o pedido) e "Buscar cliente já cadastrado" (só ao tocar abre a busca já com o nome do pedido e a lista dos cadastrados). A lista de nomes não aparece antes disso: cliente novo é o caso mais comum. Se o horário pedido já passou ou já foi ocupado, o aviso amarelo diz isso e a hora fica vazia para escolher outra. O agendamento pode ser salvo sem aparelho e sem serviço (informados depois).
- **Destino depois do login:** quem toca num link interno sem estar logado cai no login; depois de entrar vai para onde queria (guardado só na aba, por 30 minutos), **se o papel puder abrir a tela**. O técnico que entra pelo link do Agendar vai para o Início. Login normal continua indo para o Início.
- **Segurança:** o link só mostra horários livres. Para o administrador abrir o Agendar é preciso login de administrador (rota e regras do servidor). Nada é gravado quando o cliente usa a página.
- **Fica para a etapa 2 (precisa do Firebase de verdade):** link fixo para a mensagem automática do WhatsApp Business, horários sempre atualizados, pedido que chega ao app mesmo com o administrador offline, tela "Pedidos de horário" (Confirmar / Falar no WhatsApp / Escolher outro horário), validação e confirmação do número do cliente ("Corrigir número"). Esses pontos ainda não existem.

## Pacote 14 — duplicidades e avanço entre campos
- **Cliente duplicado (cadastro novo):** ao cadastrar, o app compara o WhatsApp (só números, com ou sem 55) e os endereços (rua + número + cidade, sem acento, maiúscula ou abreviação como "R."/"Av."; complemento diferente = endereço diferente) com os clientes já cadastrados. Se algo coincide, aparece "Já existe um cliente cadastrado com essas informações. Deseja consultar o cadastro existente?" com **Consultar o cadastro existente**, **Cadastrar mesmo assim** e **Voltar e conferir**. Nunca bloqueia nem junta clientes sozinho. Vindo de um pedido do cliente, "Consultar" volta ao Agendar já com esse cliente. Só vale para cliente novo (editar não avisa).
- **Agendamento duplicado:** (regra substituída no Pacote 15 — ver abaixo: um aparelho só tem um agendamento aberto.)
- **Informar serviço depois (administrador):** se o serviço aumenta o tempo da visita e o técnico fica ocupado em outro atendimento nesse período, o app avisa e manda editar o agendamento (trocar técnico ou horário). O técnico que já está no local não é barrado.
- **Avanço entre campos:** Enter num campo preenchido vai ao próximo (no último, ou com campo vazio/inválido, envia como antes); WhatsApp com 11 dígitos digitados passa sozinho ao próximo campo. Nunca apaga o que foi digitado nem pula para listas ou botões. Vale no cadastro de cliente e na página do cliente do link de horários.

## Pacote 15 — calendário único, técnico equilibrado, regra por aparelho e atraso do técnico
- **Fluxo pela Agenda (três páginas):** 1) Agenda: tocar no dia mostra os agendamentos dele; o botão embaixo do calendário acompanha o dia ("Agendar hoje" / "Agendar em dd/mm"; sem botão em dia que já passou). 2) **+ Agendar** abre a tela flutuante com os horários livres do dia e os técnicos livres naquele horário (o técnico com menos serviço já vem marcado; com um só técnico livre aparece só o nome; sem horário livre aparece "Ver próximo dia livre"). Confirmando, vai para a escolha do **cliente** (busca + botão "Cadastrar cliente novo"; depois de cadastrar volta com o dia, a hora e o técnico). 3) Tela de Agendar **sem calendário**: no alto o resumo (dia da Agenda, hora e técnico) com "Alterar horário" (reabre a tela flutuante do mesmo dia); depois endereço, aparelhos e serviços (opcionais), observação e Agendar. O botão voltar da tela de Agendar reabre a Agenda no dia escolhido (vale 10 minutos, e não vale depois de salvar). Horários livres calculados com 1 h (ainda não há serviço); se um serviço acrescentado depois aumentar o tempo e o técnico estiver ocupado, o app avisa ao salvar.
- **Outros caminhos** (ficha do cliente, pedido do cliente pelo link, Editar agendamento, Reagendar): não passam pela Agenda e mantêm o calendário dentro do card "Quando" + a tela flutuante com horários e técnicos. No link do cliente o técnico não aparece.
- **Técnico pré-selecionado:** entre os livres, o que tem menos serviço no dia; empate: menos visitas; depois ordem alfabética.
- **Agenda — histórico:** dias passados ficam cinza (ainda dá para tocar e consultar). Ponto verde = teve serviço concluído; amarelo = atrasado ou cancelado (os dois pontos se ocorreram os dois). Dia passado não tem botão Agendar. Azul/vermelho continuam só para hoje e futuro.
- **Um aparelho, um agendamento aberto:** enquanto o serviço de um aparelho não for concluído (ou cancelado), não se cria outro agendamento para ele; precisando de mais um serviço, edita-se o agendamento existente. O aviso oferece "Abrir agendamento". Outros aparelhos do mesmo cliente não são afetados; "Serviço a definir" não entra na regra. Substitui a regra de agendamento duplicado do Pacote 14. Trava definitiva no servidor fica para o Firebase.
- **Atraso do técnico:** se o técnico passou mais de 10 min do fim previsto e o próximo atendimento dele começa em até 30 min, o sistema passa o agendamento para outro técnico livre (o mais equilibrado). Sem técnico livre, o agendamento fica **Atrasado** (marca `atrasoPorTecnico`) para o administrador avisar o cliente e, se preciso, reagendar. Salvar o agendamento de novo limpa a marca. O administrador vê no Início "Agendamento de X passou para Y" e, no agendamento, "Passou de <técnico> (atraso)".
- **Limitação:** a conferência de atrasos roda quando o administrador abre o Início (não há servidor rodando sozinho ainda).

## Pacote 16 — página Serviços (só administrador)
- **Onde:** aba **Serviços** no menu, logo depois da Agenda (`#/servicos`). O técnico não vê a aba nem abre a página. Para o administrador, a aba **Concluídos** saiu do menu (os concluídos ficam em Serviços → Concluídos; a tela antiga continua no atalho "Concluídos" do Início). O técnico continua com a aba Concluídos.
- **Status em menu suspenso:** Agendados (padrão), Concluídos, Cancelados, Pendentes, Reagendados e Todos. **Excluídos não existem na lista:** excluir apaga o agendamento de vez e não sobra registro.
- **Agendados:** período "A partir de hoje" (sem filtro de mês), do que será feito primeiro para o mais distante (hoje antes de amanhã). Os **atrasados vêm primeiro**, com o selo vermelho "Atrasado" no lugar de "Agendado".
- **Demais status:** um mês de cada vez (setas), do mais recente para o mais antigo, pela data do agendamento. "Cancelados" inclui os pendentes (um pendente é um cancelado com a marca de pendente e aparece com o selo "Pendente"); "Reagendados" são os que ganharam nova data.
- **30 por vez:** abre com 30; "Ver mais 30" lê mais 30 e some quando não há mais.
- **Cartão:** cliente, serviço, técnico e data (sem hora, aparelho nem motivo); tocar abre o serviço completo. Sem contagens nos status (para a página ficar leve).
- **Índices novos (precisam ser publicados):** `status + dataAgendada (decrescente)` (Concluídos e Cancelados), `status + pendente + dataAgendada` e `reagendado + dataAgendada`. Comando: `npx firebase-tools@latest deploy --only firestore:indexes --project meu-tecnico-app-d2977`. Sem eles, Pendentes e Reagendados dão erro.

## Pacote 18 — escolher o cliente mais limpo e editar os meus dados
- **Escolher o cliente (fluxo pela Agenda):** enquanto o cliente não foi escolhido, o dia, a hora e o técnico aparecem só como **uma linha de texto** ("Quarta-feira, 16 de dezembro às 09:00 · Marcos"), sem cartão e sem botão. Depois de escolher o cliente, aparece o cartão **Quando** com o botão **Alterar horário**. "Não é o cliente?" volta para a linha de texto.
- **Minha conta (administrador):** botão **Editar meus dados**. Abre a tela de Meus dados (`#/equipe/eu?de=conta`) com **Nome**, **Nome da empresa** e **WhatsApp**, e ao salvar volta para Minha conta. O mesmo formulário continua acessível por Equipe → Você (e volta para a Equipe). A Minha conta passa a mostrar o telefone.
- **E-mail e papel** só aparecem; não se editam (trocar o e-mail do login ficou de fora de propósito).
- **Onde o nome fica salvo:** no vínculo do usuário (`usuarios/{uid}`: nome e telefone) e na empresa (`nome` e `nomeAdmin`, que o dono do app vê).
- **Regras do Firebase mudaram:** o administrador pode atualizar `nomeAdmin` da própria empresa (texto de 1 a 100 letras). **É preciso publicar as regras:** `npx firebase-tools@latest deploy --only firestore:rules --project meu-tecnico-app-d2977`.

## Pacote 19 — aviso ao cliente pelo WhatsApp (só administrador)
- **Quando oferece:** depois de **agendar** (novo agendamento), de **reagendar** (salvar um agendamento cancelado, ou mudar o dia ou a hora de um agendado) e de **cancelar** (nas telas Início, Agenda, Cliente e Agendamento). Editar sem mudar dia nem hora **não pergunta**.
- **Como funciona:** abre uma janela com a mensagem pronta e o botão **Avisar no WhatsApp** (abre o WhatsApp do cliente; o administrador só toca em enviar) ou **Agora não**. O app **não envia nada sozinho**. A tela só segue (ex.: vai para o agendamento) depois da resposta.
- **Sem telefone válido** no cliente, ou para quem **não é administrador**, a janela não aparece.
- **Mensagem:** variáveis `{nome}` (primeiro nome), `{servico}` (serviços da visita; "Serviço a definir" não entra), `{data}`, `{hora}` e `{empresa}`. **O endereço do cliente nunca entra.** Sem serviço, os parênteses vazios somem.
- **Textos editáveis** em Configurações → "Aviso ao cliente pelo WhatsApp" (agendado, cancelado, reagendado), com prévia e "Voltar ao aviso padrão". Texto vazio volta ao modelo pronto; máximo 600 letras. Ficam na empresa: `avisoAgendado`, `avisoCancelado`, `avisoReagendado`.
- **Regras do Firebase mudaram:** o administrador pode gravar esses 3 campos (texto, até 600 letras). **É preciso publicar as regras:** `npx firebase-tools@latest deploy --only firestore:rules --project meu-tecnico-app-d2977`.

## Pacote 20 — avisos por WhatsApp para cliente e técnicos, e avanço entre campos
- **Painel de avisos (só administrador):** depois de agendar, reagendar ou cancelar, abre um painel só com botões: **"Mensagem para <cliente>"** e **"Mensagem técnico <nome>"** (um por técnico da visita, menos o próprio administrador). Só aparece o botão de quem tem WhatsApp válido; sem nenhum, o painel não abre. O botão é cinza depois de tocado (só um sinal na tela; continua funcionando para enviar de novo; nada é salvo).
- **O app nunca envia sozinho:** o botão abre o WhatsApp com a mensagem pronta e a pessoa aperta enviar.
- **Mensagem do cliente:** formato com emojis (data, horário, serviços, técnico, endereço), editável em Configurações (variáveis `{nome} {servico} {data} {hora} {tecnico} {endereco} {empresa}` e `{link}` no cancelamento). Linha sem informação some. **Até 3 serviços diferentes** são listados; mais que isso a linha de serviços some (mensagem genérica). Modelos antigos do pacote 19 são trocados pelos novos. No **cancelamento** vai o link para o cliente escolher outro dia/hora (o mesmo de Ferramentas), se houver WhatsApp do administrador e horários livres.
- **Mensagem do técnico (texto fixo):** só os dados da visita dele: cliente, data, horário, endereço, link do WhatsApp do cliente, o número escrito (para ligar) e o link `#/servico/<id>` do app; **sem lista de serviços**. Reagendamento mostra data/horário anterior e novo. Cancelamento não leva link do app.
- **Avanço entre campos** (Aparelho, Concluir serviço, Funcionário, Configurações, além do cadastro de cliente do Pacote 14): Enter num campo preenchido leva o cursor ao próximo; campo vazio obrigatório não avança; WhatsApp completo passa sozinho; em texto longo o Enter continua sendo quebra de linha. As demais telas ficam para o Pacote 21.
- **As regras do Firebase não mudaram** neste pacote (não precisa publicar regras).

## Pacote 21 — atrasos, atualização do técnico, conta do técnico e ajustes
- **Atraso (técnico):** o técnico que abre o app e passou do tempo de um serviço só **marca** o próximo agendamento dele de hoje como atrasado (ele só vê os próprios serviços; não troca de técnico). O **administrador**, ao abrir o Início, troca o técnico dos agendamentos atrasados se houver alguém livre; sem ninguém livre, o agendamento continua marcado para ele avisar o cliente. Regras do Firebase: `tecnicoMarcaAtraso` (só `atrasoPorTecnico: true`, nome opcional e `atualizadoEm` = hora do servidor).
- **Atualização automática (só técnico):** Início e Agenda se atualizam ao voltar para o app e a cada 1 minuto (mínimo 20 s entre atualizações), sem piscar e mantendo a rolagem. Não atualiza com janela aberta nem com campo em uso. A conferência de atraso roda só ao abrir a tela, não a cada minuto.
- **Menu do técnico:** item **Conta** (rota `/conta`), onde ele troca a senha e **sai** do app.
- **Convite pendente:** o administrador pode **editar nome e WhatsApp** do técnico convidado (botão "Editar dados" na tela do convite). Sem Bloquear nem Remover enquanto o convite está pendente; o link do convite continua o mesmo.
- **Mensagem do técnico:** o endereço vai escrito e com links do **Google Maps** e do **Waze** (ponto exato quando o endereço tem coordenadas). No cancelamento não vão links.
- **Financeiro:** sem o card "Por técnico".
- **Avanço entre campos:** Enter leva ao próximo campo também em Entrar, Criar conta, Recuperar senha, Expediente, Tipo de serviço, Valor, Convite, Enviar horários, Meus dados e demais formulários.
- **Regras do Firebase mudaram** (`tecnicoMarcaAtraso`): publicar `npx firebase-tools@latest deploy --only firestore:rules --project meu-tecnico-app-d2977`.


## Pacote 22 — Cartões só com o resumo; tocar abre a página do agendamento

- Em toda lista de agendamentos (Início, Agenda, ficha do cliente, Serviços concluídos) cada agendamento é UM cartão só com o resumo, de qualquer status (Agendado, Reagendado, Atrasado, Cancelado, Concluído): cliente, status, hora (no concluído, o dia em que foi feito), endereço, serviço(s) e técnico(s). Mais de um serviço: todos, sem repetir o nome.
- Tocar no cartão abre a página do agendamento (`#/servico/<id>`), com o cliente, todos os aparelhos e serviços e todos os botões (Concluir, Informar, Editar, Cancelar, Excluir, Ir até o cliente, Ligar, WhatsApp, cobrança, pago...). Os botões do administrador NÃO ficam mais no cartão.
- Serviços concluídos: um cartão por agendamento (linhas da mesma visita juntas). Busca e filtros valem por linha: a visita aparece se alguma linha combina. "Carregar mais" reagrupa. O resumo não mostra valores.
- Técnico em campo: nas listas do dia continua vendo "Ir até o cliente" e "Concluir" no próprio cartão (com vários serviços abertos, "Concluir" abre a página para escolher).
- O destaque vermelho dos atrasados e os avisos "Passou de..." e "avisou atraso" continuam no cartão.
- Nada mudou nas regras do Firestore: não há deploy de regras neste pacote.

## Pacote 23 — "Informar o serviço" e dados completos na página do cliente

- **Botão da linha "Serviço a definir":** sem aparelho = "Informar aparelho e serviço" (pergunta os dois). Com aparelho e sem serviço = "Informar o serviço": não pergunta o aparelho e só oferece os serviços que ESSE aparelho ainda não tem na visita (os já informados saem da lista; vale por aparelho, cada aparelho tem o seu botão). Se todos já foram informados, o botão some e aparece o aviso. O mesmo vale para o técnico (o serviço continua "incluído pelo técnico"). Nas listas, o cartão do técnico usa os mesmos textos.
- **Página do cliente (link de horários), passo 3:** Nome, **WhatsApp** e **endereço** obrigatórios (rua, número e cidade); bairro, complemento, estado e **ponto de referência** opcionais. Botão "Usar minha localização": antes de pedir a permissão do aparelho, pergunta "Você está no local do atendimento?". Sim = GPS + Nominatim preenchem rua, bairro, cidade e estado (o número o cliente digita). Não = o botão some e o endereço é à mão. Falha do GPS ou da internet = mensagem e preenchimento à mão (o botão continua).
- **Ponto no mapa:** só vai na mensagem (link do Google Maps) se o endereço veio do GPS e o cliente NÃO mudou a rua nem a cidade depois.
- **Mensagem do pedido** ganha 📍 endereço, 📌 referência e 🗺️ mapa. O botão "Técnico: abrir no app" leva tudo no endereço do link; o Agendar mostra endereço e referência no aviso "Pedido do cliente", e "Cadastrar cliente novo" já vem com o endereço preenchido (a referência vai para as observações). Nada é guardado no banco pela página pública. Regras do Firestore não mudam.

## Pacote 24 — o cliente escolhe o serviço; Agenda mostra concluídos/cancelados de hoje

- **Enviar horários (administrador):** não escolhe mais o serviço. O link leva os nomes dos tipos de serviço cadastrados (`ts`), e o cliente escolhe na página.
- **Página do cliente:** primeiro "Qual serviço você precisa?" (um ou vários, só o nome; "Não sei ainda" vale sozinho e é exclusivo), depois dia, horário e dados. Sem escolher, não envia. Serviços são só informativos: não preenchem o agendamento (sem valores, total ou tempo nesta etapa).
- **Mensagem do pedido:** linha 🔧 com os serviços logo após o WhatsApp; o link "Técnico: abrir no app" fica no fim, separado por uma linha em branco. O Agendar mostra "Serviços pedidos: …" no aviso "Pedido do cliente".
- **Agenda:** concluídos e cancelados aparecem também no dia de hoje, no dia em que estavam agendados.
- Regras do Firestore não mudam.

## Pacote 25 — links curtos, aviso que preenche o agendamento, "Informar o aparelho"

- **Links curtos:** o link de horários (e o do aviso de cancelamento ao cliente) vira `#/h/<código>`, e o "Técnico: abrir no app" do pedido vira `#/p/<código>` (10 letras/números). O texto longo fica guardado em `linksCurtos/{código}` no Firestore.
  - `horarios`: criado pelo administrador; qualquer pessoa com o código lê (não dá para listar); vale 8 dias.
  - `pedido`: criado pela página do cliente (sem login), só citando o código de um link de horários da MESMA empresa; só o administrador da empresa lê; vale 30 dias. Ninguém altera.
  - Se não der para gravar (sem internet, regras ainda não publicadas), o app usa o link comprido de antes. Links compridos antigos continuam funcionando. Na demonstração os links continuam compridos (teste com `?demo=1&curtos=1`).
  - Opcional: no console do Firebase, uma política de TTL em `linksCurtos` pelo campo `expiraEm` apaga os registros vencidos sozinha.
- **Mensagem do técnico:** só o link do Google Maps (sem Waze).
- **Aviso "Pedido do cliente" (Agendar):** tocar nele (ou no botão "Preencher o agendamento com o pedido") coloca os serviços pedidos no agendamento SEM aparelho. Sem cliente escolhido, pede para escolher/cadastrar. "Não sei ainda" não coloca nada ("Serviço a definir").
- **"Informar o aparelho":** linha com serviço e sem aparelho mostra esse botão (administrador e técnico). Pergunta só o aparelho; o mesmo serviço não entra duas vezes no mesmo aparelho; aparelho com outro agendamento aberto é recusado. Sem aparelho não conclui (regra que já existia).
- Regras do Firestore mudam (nova coleção `linksCurtos`): publicar as regras depois do merge.

## Pacote 26 — retorno, WhatsApp da equipe, Concluídos do técnico, backup

- **Selo de retorno do serviço concluído:** mostra o prazo realmente usado na conclusão (ex.: "Retorno em 12 meses"). Agendado e cancelado continuam mostrando o prazo padrão do tipo.
- **Mensagem de retorno (WhatsApp):** variáveis novas `{tempo}` (há quanto tempo foi o último serviço: "12 dias", "6 meses", "1 ano e 2 meses"; sem data: "algum tempo") e `{data}` (dia do último serviço). Texto padrão novo: "Já faz {tempo} da última {servico} do seu ar-condicionado ({aparelho}). Está na hora de fazer de novo…". Empresa que ainda tem guardado o texto padrão ANTIGO (nunca editou) passa a usar o novo; quem editou mantém o texto exatamente como escreveu.
- **Equipe:** a lista mostra o WhatsApp de cada funcionário ("sem WhatsApp" quando não há número válido); a tela do convite mostra o WhatsApp do convidado.
- **Concluídos (técnico):** a lista se atualiza sozinha (a cada minuto e ao voltar para o app), sem mexer nos filtros.
- **Backup:** passa a levar os campos que faltavam dos serviços (atraso avisado pelo técnico, troca de técnico) e as configurações da empresa (avisos ao cliente, expediente, almoço, limite de horas, administrador atende, técnico cadastra cliente). Essas configurações vão no arquivo, mas a restauração continua devolvendo só os dados (clientes, aparelhos, serviços, valores, preços), como antes. Um teste confere que os campos do backup são os mesmos que as regras do Firestore aceitam.
- Regras do Firestore não mudam neste pacote.

## Pacote 27 — iniciar serviço, avisos de atraso, horários e Desempenho

- **Iniciar serviço (técnico e administrador):** botão no cartão da visita (a partir de 1 h antes do horário marcado) e na página do serviço (administrador). Grava `iniciadoEm`. Enquanto há visita iniciada e não concluída, uma **barra fixa "Em serviço"** (com Concluir) aparece em todas as telas do técnico. O administrador vê "Em andamento desde HH:MM".
- **"Você já começou?"** (só dentro do horário previsto, depois de 10 min do horário marcado, sem início): "Sim, iniciar agora", "Comecei às…" (hora que já passou) ou "Ainda não cheguei" (um toque, sem motivo; a pergunta volta em 15 min).
- **"Serviço esperando concluir"** (depois do fim previsto + 10 min): "Já terminei" abre a conclusão; "Ainda estou no serviço" pede o motivo (obrigatório) e "Quanto tempo falta?" (15 min, 30 min, 1 hora, mais de 1 hora) e avisa o administrador. Vale o prazo informado; depois dele o aviso volta. Os dois avisos nunca aparecem juntos (só uma visita por vez mostra aviso).
- **Atraso automático:** só vale para quem tocou em Iniciar ou respondeu "Ainda estou no serviço". Sem isso o app NÃO troca o técnico nem marca o próximo agendamento sozinho (só avisa). Os horários livres para marcação não mudam.
- **Conclusão com horários:** o app sugere início (o mais tarde entre o horário marcado e o fim do serviço anterior, nunca depois da conclusão) e conclusão (agora; se já passou do prazo, início + duração prevista). Só é gravado o que a pessoa confirmar. Erros que bloqueiam: conclusão antes do início, horário no futuro, dia fora do intervalo. Pedem confirmação: menos de 5 min, mais de 12 h, sobreposição com o serviço anterior. Motivo do atraso é opcional (Trânsito, Serviço demorou mais, Falta de peça, Cliente atrasou, Outro + detalhe).
- **Financeiro:** o serviço entra no dia da conclusão informada. Serviços esperando conclusão NÃO entram nos totais; o Financeiro mostra um aviso amarelo com "Ver serviços" (tela Esperando conclusão, só administrador, com Concluir e Ver serviço).
- **Corrigir horários (administrador):** na página do serviço concluído: dia, início, conclusão e motivo. Mudar o dia da conclusão recalcula garantia e retorno e move o serviço de período no Financeiro.
- **Desempenho (Administrativa, só administrador):** por técnico (semana, mês, ano): concluídos, tempo médio, atrasos, retornos (serviços de retorno concluídos, isto é, com `origemRetornoId`) e deslocamento médio; por tipo de serviço com comparação com a equipe (só com 3+ serviços: "X% mais rápido / mais lento / na média"); motivos dos atrasos. Deslocamento = fim de uma visita → início da próxima no mesmo dia, descontando o almoço; o 1º do dia não tem; intervalos acima de 2 h ficam fora. Serviços sem início/conclusão confirmados ou com mais de 12 h ficam fora das médias (mas contam como concluídos). Sem GPS.
- Campos novos em `servicos`: `iniciadoEm`, `atrasoMotivo`, `atrasoDetalhe`, `atrasoFalta`, `atrasoInformadoEm`. **Regras do Firestore mudam: publicar as regras depois do merge.**

## Pacote 28 — retorno sem pergunta e "Próximo serviço"

- **Concluir não pergunta mais o prazo de retorno.** O serviço grava sempre o prazo configurado no tipo de serviço (3, 4, 6 ou 12 meses; sem prazo configurado vale 6). O selo "Retorno em X meses" e o aviso de retorno seguem esse prazo.
- **Meus serviços (técnico):** sem serviço aberto hoje, aparece "Próximo serviço": a próxima visita agendada dele, de qualquer dia futuro, com a data em cima. Sem Iniciar e sem Concluir (o Iniciar só existe no próprio dia); tocar no cartão abre o serviço. Sem nenhum serviço futuro, continua "Nada para hoje".

## Pacote 29 — Horário não conferido
- **Conferido ou não:** ao concluir, o horário vale como **conferido** se o técnico tocou em Iniciar, marcou **"Conferi os horários"** ou mudou algum horário sugerido (início, conclusão ou dia). Se concluiu aceitando os horários sugeridos sem conferir, o serviço é gravado com `horariosConferidos = false` e ganha o selo **"Horário não conferido"** (visto pelo administrador e pelo técnico). Corrigir horários (administrador) grava `horariosConferidos = true`.
- **Serviços antigos** (sem o campo): valem como conferidos se têm início registrado; sem início, a regra não se aplica (ficam fora da contagem).
- **Efeito:** serviço não conferido continua **concluído** e entra no **Financeiro**, mas fica fora do tempo médio, da comparação com a equipe e do deslocamento.
- **Indicador "Horários informados: X de Y serviços":** administrador no Desempenho (lista e detalhe do técnico, com aviso quando há não conferidos); técnico em Concluídos (só os dele). A correção de horários continua só com o administrador.
- **Limite:** o app registra o que a pessoa fez na tela (tocou Iniciar, marcou "Conferi", mudou um horário); não prova que o horário é real.
- Campo novo `horariosConferidos` (booleano) em `servicos`: regras do Firestore (técnico na conclusão e administrador) e backup.

## Pacote 30 — Mensagens e status do agendamento
- **Reagendamento ao técnico:** a mensagem mostra só **Nova data** e **Novo horário** (a data/horário anterior não vai).
- **Link curto do Google Maps (mensagem ao técnico):** `#/m/<código>`, que abre o Google Maps no endereço. O app guarda o endereço em `linksCurtos` (tipo `mapa`, vale **30 dias**, criado só pelo administrador; lido por quem tem o código). Se não der para gravar, a mensagem usa o link comprido do Google Maps de antes. Link vencido ou inexistente: a tela avisa e orienta usar "Ir até o cliente". Na demonstração só com `?demo=1&curtos=1`. O link "Ver no app" (`#/servico/<id>`) continua como está. Cancelamento não leva mapa.
- **Selo do agendamento:** *Agendado* (azul) antes do horário; *Atrasado* (vermelho) passou do horário **sem iniciar** (continua assim mesmo depois do tempo previsto); *Em andamento* (verde) depois de **Iniciar**; *Tempo excedido* (laranja) quando o serviço iniciado passa do **tempo previsto** + 10 min de tolerância. O tempo previsto é a soma dos serviços da visita (por técnico) e conta do **início real** (não do horário marcado). "Ainda estou no serviço" com prazo extra volta para *Em andamento* até o prazo acabar. Serviço iniciado não conta como "atrasado" nos avisos e contadores.
- **Aviso "Serviço esperando concluir" e lista do administrador:** também contam do início real quando o serviço foi iniciado (sem início, do horário marcado). Os horários livres para marcação continuam só horário marcado + duração.


## Pacote 31 — A receber e pagamento parcial

- **Lista "A receber"**: Serviços → status "A receber" (sem filtro de mês; atalho no Início com bolinha = número de visitas; no Financeiro, "Total geral a receber ›"). Um cartão por visita, do mais antigo ao mais novo: cliente, data ("há N dias"), serviços pendentes (parcial: "pagou R$ X · falta R$ Y"), dívida. Botões "Abrir serviço", "Cobrar cliente" (WhatsApp, só o saldo; registra "Cobrado em") e "Recebi".
- **Pagamento parcial** (só administrador): valor + dia (padrão hoje; não pode ser futuro), sem forma de pagamento. Registrado na visita ("Recebi um valor": o app abate dos serviços na ordem e mostra a divisão antes de confirmar) ou por serviço. Fica em `valores/{servicoId}.pagamentos` (até 30) e `ultimoPagamentoEm`; `servicos.pago` = quitado.
- Regras: (1) o "recebido" do Financeiro conta no dia de cada pagamento; (2) serviço antigo pago = um pagamento do valor todo na data de conclusão; (3) técnico "cliente pagou? sim" = pagamento total na conclusão; (4) administrador corrige ou apaga pagamento (com confirmação; o saldo recalcula); (5) pagamento maior que o saldo é bloqueado; (6) a cobrança leva só o saldo; (7) o valor do serviço não pode ficar abaixo do já pago.
- As regras do Firestore conferem só o formato (lista até 30, data); a soma é conferida pelo app. Depois de aprovar o pacote, rode `regras`.

## Pacote 32 — Serviço concluído mais enxuto (administrador)

- Cada serviço concluído mostra um resumo (concluído em, o que foi feito, valor, já pago / falta pagar, garantia, retorno) e "Ver detalhes" recolhido (início, horários, tempo no cliente, atraso, quem concluiu, composição do valor, cobrança). O técnico vê a tela de antes.
- Pagamentos são linhas tocáveis: tocar abre "Corrigir valor ou dia" / "Apagar pagamento". Os botões do serviço: Corrigir descrição (antigo Editar), Corrigir horários, Corrigir valor (ou Informar valor) e Excluir (confirmação dupla).
- A visita tem um bloco "Falta receber" com "Registrar pagamento" (um serviço) ou "Recebi um valor" (vários) e "Cobrar cliente" (só o saldo). Some quando tudo está pago. Saíram: Marcar como pago, Marcar como a receber e "Cobrar no WhatsApp" por serviço, "Cliente pagou?" (admin) e "Ir até o cliente" em visita concluída.
- Pagar, corrigir ou apagar um pagamento atualiza só o serviço alterado (sem recarregar a visita). As regras do Firestore não mudam.

## Pacote 33 — Serviço concluído: valores, Editar e status

- **Topo**: visita toda concluída não mostra Telefone nem Local (ficam no cadastro do cliente). Mantém Quando, Cliente e Técnicos.
- **Valores (administrador)**: "Valor do serviço" é sempre o valor integral e não cai com pagamento parcial. Com pagamento parcial aparecem "Valor pago" e "Valor a pagar"; nada pago mostra só "Valor a pagar"; quitado mostra só "Valor do serviço" (o histórico de pagamentos fica em "Ver detalhes"). "Valor a pagar" nunca é negativo.
- **Selo "Concluído a receber"**: calculado (serviço concluído, com valor definido e não quitado). Continua concluído para garantia, retorno e histórico; vira "Concluído" ao quitar. Serviço sem valor continua "Concluído".
- **Editar** (só administrador; antigo "Corrigir descrição"): Tipo de serviço (só os tipos cadastrados; não muda valor nem pagamentos; o Desempenho passa a contar no novo tipo), O que foi feito e Informar pagamento (só com saldo). Pagamento acima do saldo é bloqueado e cada pagamento é gravado com data e hora, preservando os anteriores. Registrar pagamento, Recebi, Cobrar cliente, Corrigir horários, Corrigir valor e Excluir continuam.
- **Excluir** serviço concluído pede uma confirmação (a segunda saiu).
- Renomear um tipo no cadastro não altera os serviços já concluídos (o nome fica gravado em cada serviço). As regras do Firestore não mudam.

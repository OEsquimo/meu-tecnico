// =============================================================================
// SERVIÇOS — agendamentos, conclusão, histórico e retornos
// =============================================================================
// Um "serviço" nasce AGENDADO (administrador agenda), e depois é CONCLUÍDO
// (técnico ou administrador preenche o que foi feito). Se for um tipo que gera
// retorno (limpeza/manutenção preventiva), o app calcula a data do lembrete.
//
// DADOS COPIADOS PARA DENTRO DO SERVIÇO: nome/WhatsApp do cliente, endereço
// (texto), resumo do aparelho, nome do tipo e nome do técnico. Motivos:
//   1. o técnico não tem acesso à ficha dos clientes, mas precisa saber onde ir;
//   2. o histórico fica fiel ao que era na época, mesmo se o cliente mudar;
//   3. economiza leituras do banco (plano grátis do Firebase tem limite diário).
// VALORES EM DINHEIRO ficam em outra coleção (valores/): o administrador lê tudo; o técnico só
// o que o administrador liberou (ver ./equipe.js e firestore.rules).
// =============================================================================

import { ler, listar, gravar, operacao as op, novoId, AGORA } from '../nucleo/banco.js';
import { invalidarCache } from '../nucleo/cache.js';
import { ErroApp } from '../nucleo/erros.js';
import { PAGINA_HISTORICO, DURACAO_PADRAO_MIN } from '../nucleo/constantes.js';
import { camposDeConclusao, localDoServico, STATUS, NOME_SERVICO_A_DEFINIR, ehLinhaSemServico, chaveDoAgendamento, duracaoDoServico, camposDosTecnicos, tecnicosDoServico, nomesDosTecnicos, linhasEditaveis } from '../dominio/servicos.js';
import { motivoDeIndisponibilidade } from '../dominio/agenda.js';
import { separarRetornos, limiteConsultaRetornos, adiarRetorno } from '../dominio/retornos.js';
import { combinarDataHora, paraISO, inicioDoDia } from '../dominio/datas.js';
import { resumoDoAparelho } from '../dominio/aparelhos.js';
import { documentoDeValores, lerDocumentoDeValores } from '../dominio/valores.js';

const caminho = (empresaId) => `empresas/${empresaId}/servicos`;
const caminhoValores = (empresaId) => `empresas/${empresaId}/valores`;

// -----------------------------------------------------------------------------
// AGENDAR / EDITAR / CANCELAR / EXCLUIR  (administrador)
// -----------------------------------------------------------------------------

/** Técnicos de uma linha: lista nova (`tecnicos`) ou o técnico único das telas e dos serviços antigos. */
const tecnicosDaLinha = (l) => l.tecnicos ?? (l.tecnico ? [l.tecnico] : []);

/** Campos copiados do cliente/aparelho/tipo/técnicos para dentro do serviço. */
function camposCopiados({ cliente, endereco, aparelho, tipo, tecnico, tecnicos }) {
  return {
    clienteId: cliente.id,
    clienteNome: cliente.nome,
    clienteWhatsapp: cliente.whatsapp,
    local: localDoServico(endereco),
    localLat: endereco?.lat ?? null,
    localLng: endereco?.lng ?? null,
    enderecoId: endereco?.id ?? null,
    aparelhoId: aparelho?.id ?? null,
    aparelhoResumo: aparelho ? resumoDoAparelho(aparelho) : '',
    tipoServicoId: tipo?.id ?? '',
    tipoServicoNome: tipo?.nome ?? NOME_SERVICO_A_DEFINIR,
    geraRetorno: tipo?.geraRetorno === true,
    duracaoMin: tipo?.duracaoMin ?? DURACAO_PADRAO_MIN,
    ...camposDosTecnicos(tecnicos ?? (tecnico ? [tecnico] : [])),
  };
}

/**
 * Agenda um serviço. Se veio de um lembrete de retorno (origemRetornoId), o
 * retorno antigo passa a "agendado" no mesmo lote.
 * @returns {Promise<string>} id do serviço
 */
export async function agendarServico({ empresaId, cliente, endereco, aparelho, tipo, tecnico, data, hora, descricao = '', origemRetornoId = null }) {
  const id = novoId(caminho(empresaId));
  const documento = {
    ...camposCopiados({ cliente, endereco, aparelho, tipo, tecnico }),
    status: STATUS.AGENDADO,
    dataAgendada: combinarDataHora(data, hora),
    descricao,
    pago: false,
    valorDefinido: false,
    criadoEm: AGORA,
    atualizadoEm: AGORA,
  };
  if (origemRetornoId) documento.origemRetornoId = origemRetornoId;
  const operacoes = [op.criar(`${caminho(empresaId)}/${id}`, documento)];
  if (origemRetornoId) {
    operacoes.push(op.atualizar(`${caminho(empresaId)}/${origemRetornoId}`, { retornoSituacao: 'agendado', atualizadoEm: AGORA }));
  }
  await gravar(operacoes);
  invalidarCache(`${empresaId}:servicos`);
  return id;
}

/** Altera um agendamento (data, hora, técnico, tipo, aparelho, local, observação). */
export async function atualizarAgendamento({ empresaId, servico, cliente, endereco, aparelho, tipo, tecnico, data, hora, descricao = '' }) {
  if (servico.status !== STATUS.AGENDADO) {
    throw new ErroApp('Só dá para editar serviços que ainda estão agendados.', 'servico-fechado');
  }
  await gravar([op.atualizar(`${caminho(empresaId)}/${servico.id}`, {
    ...camposCopiados({ cliente, endereco, aparelho, tipo, tecnico }),
    dataAgendada: combinarDataHora(data, hora),
    descricao,
    atualizadoEm: AGORA,
  })]);
  invalidarCache(`${empresaId}:servicos`);
}

/** Cancela um agendamento. Se ele veio de um retorno, o retorno volta para a lista de pendentes. */
export async function cancelarAgendamento(empresaId, servico) {
  const operacoes = [op.atualizar(`${caminho(empresaId)}/${servico.id}`, { status: STATUS.CANCELADO, atualizadoEm: AGORA })];
  if (servico.origemRetornoId) {
    operacoes.push(op.atualizar(`${caminho(empresaId)}/${servico.origemRetornoId}`, { retornoSituacao: 'pendente', atualizadoEm: AGORA }));
  }
  await gravar(operacoes);
  invalidarCache(`${empresaId}:servicos`);
}

/**
 * Exclui o serviço (e o valor dele). Só administrador.
 * Serviço concluído só sai com `permitirConcluido: true` (a tela pede confirmação dupla):
 * ele some do histórico e do financeiro. Se ele fechou um lembrete de retorno, o lembrete volta a pendente.
 */
export async function excluirServico(empresaId, servicoId, { permitirConcluido = false } = {}) {
  const atual = await ler(`${caminho(empresaId)}/${servicoId}`);
  if (atual?.status === STATUS.CONCLUIDO && !permitirConcluido) {
    throw new ErroApp('Para excluir um serviço concluído, confirme que ele sai do histórico e do financeiro.', 'servico-concluido');
  }
  const operacoes = [op.apagar(`${caminho(empresaId)}/${servicoId}`), op.apagar(`${caminhoValores(empresaId)}/${servicoId}`)];
  if (atual?.status === STATUS.CONCLUIDO && atual.origemRetornoId) {
    operacoes.push(op.atualizar(`${caminho(empresaId)}/${atual.origemRetornoId}`, { retornoSituacao: 'pendente', atualizadoEm: AGORA }));
  }
  await gravar(operacoes);
  invalidarCache(`${empresaId}:servicos`);
}

// -----------------------------------------------------------------------------
// AGENDAMENTO COMPLETO (vários aparelhos, vários serviços, um técnico por serviço)
// -----------------------------------------------------------------------------
// Uma visita = um "agendamento" com data e hora únicas. Cada linha é um serviço
// de um aparelho, com seu técnico. Linhas da mesma visita compartilham
// `agendamentoId`, `dataAgendada` e `obsAgendamento`.
// -----------------------------------------------------------------------------

/** Minutos que cada técnico fica ocupado nesta visita (soma dos serviços em que ele está). */
function minutosPorTecnico(linhas) {
  const minutos = new Map(); // tecnicoUid -> minutos ocupados nesta visita
  for (const l of linhas) {
    for (const t of tecnicosDaLinha(l)) {
      if (!t?.uid) continue;
      minutos.set(t.uid, (minutos.get(t.uid) || 0) + (l.duracaoMin || DURACAO_PADRAO_MIN));
    }
  }
  return minutos;
}

/** Confere, no banco, se cada técnico escolhido está livre. Lança ErroApp com o nome de quem não está. */
export async function verificarDisponibilidade({ empresaId, inicio, linhas, ignorarAgendamento = null, regras = null }) {
  const minutos = minutosPorTecnico(linhas);
  if (minutos.size === 0) return;
  // Serviços agendados do dia anterior ao seguinte (cobre quem começou antes e passa do horário).
  const de = new Date(inicio.getTime() - 24 * 3600000);
  const ate = new Date(inicio.getTime() + 24 * 3600000);
  const agendados = await listarAgendados({ empresaId, de, ate });
  for (const [uid, total] of minutos) {
    const motivo = motivoDeIndisponibilidade(uid, inicio, total, agendados, ignorarAgendamento, regras);
    if (motivo) {
      const nome = linhas.flatMap(tecnicosDaLinha).find((t) => t?.uid === uid)?.nome || 'O técnico';
      if (motivo === 'almoco') throw new ErroApp(`${nome} estaria no horário de almoço. Escolha outro horário.`, 'tecnico-almoco');
      if (motivo === 'limite') throw new ErroApp(`${nome} passaria do limite de horas de serviço do dia. Escolha outro dia, outro horário ou outro técnico.`, 'tecnico-limite');
      throw new ErroApp(`${nome} já tem outro serviço nesse horário. Escolha outro técnico ou outro horário.`, 'tecnico-ocupado');
    }
  }
}

/**
 * Cria OU edita um agendamento inteiro, de uma vez (tudo ou nada).
 * @param {object} p
 * @param {string|null} p.agendamentoId  null = novo
 * @param {object[]} p.existentes        linhas já gravadas desse agendamento (ao editar)
 * @param {object} p.cliente
 * @param {object|null} p.endereco
 * @param {object|null} p.tecnico        técnico do agendamento (usado quando não há linhas)
 * @param {string} p.data  AAAA-MM-DD
 * @param {string} p.hora  HH:MM
 * @param {string} p.observacao
 * @param {Array<{id?:string, aparelho:object|null, tipo:object|null, tecnico:object|null, duracaoMin?:number, obsAparelho?:string, obsServico?:string}>} p.linhas
 * @param {string|null} p.origemRetornoId
 * @param {string[]} p.preservar  ids de linhas abertas que a tela não consegue mostrar (aparelho ou tipo excluído):
 *                                não são apagadas; só acompanham o novo dia/hora e a observação.
 * @returns {Promise<string>} id do agendamento
 */
export async function salvarAgendamento({ empresaId, agendamentoId = null, existentes = [], cliente, endereco, tecnico = null, tecnicos = null, data, hora, observacao = '', linhas, origemRetornoId = null, preservar = [], regras = null }) {
  const inicio = combinarDataHora(data, hora);
  const editando = Boolean(agendamentoId);
  // Editar mexe nas linhas agendadas; se o agendamento foi cancelado, nas canceladas (reagendar).
  const abertas = linhasEditaveis(existentes);
  const fechadas = existentes.filter((l) => !abertas.includes(l));
  const cancelado = abertas.length > 0 && abertas.every((l) => l.status === STATUS.CANCELADO);
  // Salvar um agendamento cancelado o reagenda, mesmo com o mesmo dia e hora (o cliente pode querer o mesmo horário).
  // Antes de gravar, verificarDisponibilidade confere se os técnicos estão livres nesse horário.
  const reagendando = cancelado;
  if (editando && abertas.length === 0) {
    throw new ErroApp('Só dá para editar serviços que ainda estão agendados ou aguardando reagendamento.', 'servico-fechado');
  }
  // Pendentes de uma visita que já teve serviços concluídos viram um agendamento NOVO:
  // a visita original fica só com o que foi feito (registro e garantia).
  const separar = reagendando && fechadas.some((l) => l.status === STATUS.CONCLUIDO);
  const id = (agendamentoId && !separar) ? agendamentoId : novoId(caminho(empresaId));
  const limpaPendencia = reagendando ? { pendente: false, motivoPendencia: '', reagendado: true } : {};
  const herdaReagendado = abertas.some((l) => l.reagendado === true);

  // Sem nenhum aparelho/serviço: uma linha "Serviço a definir" só com o técnico.
  // Cada serviço tem uma lista de técnicos (pelo menos um); quem vier sem técnico usa os do agendamento.
  const padrao = tecnicos ?? (tecnico ? [tecnico] : []);
  let todas = linhas.map((l) => ({ ...l, tecnicos: tecnicosDaLinha(l).length > 0 ? tecnicosDaLinha(l) : padrao }));
  if (todas.length === 0 && preservar.length === 0) todas = [{ aparelho: null, tipo: null, tecnicos: padrao, duracaoMin: DURACAO_PADRAO_MIN }];
  for (const l of todas) {
    l.duracaoMin = l.duracaoMin || l.tipo?.duracaoMin || DURACAO_PADRAO_MIN;
    if (tecnicosDaLinha(l).filter((t) => t?.uid).length === 0) {
      throw new ErroApp('Escolha pelo menos um técnico para cada serviço.', 'sem-tecnico');
    }
  }

  await verificarDisponibilidade({ empresaId, inicio, linhas: todas, ignorarAgendamento: editando ? (agendamentoId || id) : null, regras });
  const minutos = minutosPorTecnico(todas);

  const operacoes = [];
  const mantidas = new Set();
  todas.forEach((l, ordem) => {
    const campos = {
      ...camposCopiados({ cliente, endereco, aparelho: l.aparelho, tipo: l.tipo, tecnicos: l.tecnicos }),
      duracaoMin: l.duracaoMin,
      ...ocupacaoDaLinha(l, minutos),
      agendamentoId: id,
      obsAgendamento: observacao,
      ordem,
      dataAgendada: inicio,
      obsAparelho: l.obsAparelho || '',
      obsServico: l.obsServico || '',
      descricao: '',
      atualizadoEm: AGORA,
    };
    if (l.id && abertas.some((a) => a.id === l.id)) {
      mantidas.add(l.id);
      const antiga = abertas.find((a) => a.id === l.id);
      operacoes.push(op.atualizar(`${caminho(empresaId)}/${l.id}`, reagendando ? { ...campos, status: STATUS.AGENDADO, ...limpaPendencia } : campos));
      // Reagendado: o lembrete de retorno que o cancelamento devolveu para "pendente" volta a "agendado".
      if (reagendando && antiga?.origemRetornoId) operacoes.push(op.atualizar(`${caminho(empresaId)}/${antiga.origemRetornoId}`, { retornoSituacao: 'agendado', atualizadoEm: AGORA }));
    } else {
      const novo = novoId(caminho(empresaId));
      // Serviço acrescentado a um cancelado que continua cancelado nasce cancelado.
      const documento = { ...campos, status: cancelado && !reagendando ? STATUS.CANCELADO : STATUS.AGENDADO, pago: false, valorDefinido: false, criadoEm: AGORA };
      if (reagendando || herdaReagendado) documento.reagendado = true;
      if (origemRetornoId && !editando && ordem === 0) documento.origemRetornoId = origemRetornoId;
      operacoes.push(op.criar(`${caminho(empresaId)}/${novo}`, documento));
    }
  });
  // Linhas abertas que o administrador tirou da tela são removidas.
  for (const a of abertas) {
    if (mantidas.has(a.id)) continue;
    if (preservar.includes(a.id)) {
      operacoes.push(op.atualizar(`${caminho(empresaId)}/${a.id}`, { agendamentoId: id, obsAgendamento: observacao, dataAgendada: inicio, ...(reagendando ? { status: STATUS.AGENDADO, ...limpaPendencia } : {}), atualizadoEm: AGORA }));
      continue;
    }
    operacoes.push(op.apagar(`${caminho(empresaId)}/${a.id}`));
    // Linha que veio de um lembrete de retorno: o lembrete volta para a lista de pendentes.
    if (a.origemRetornoId) operacoes.push(op.atualizar(`${caminho(empresaId)}/${a.origemRetornoId}`, { retornoSituacao: 'pendente', atualizadoEm: AGORA }));
  }
  // Linhas já concluídas/canceladas continuam como estão (só acompanham a observação geral).
  for (const f of fechadas) {
    if (separar) continue;
    operacoes.push(op.atualizar(`${caminho(empresaId)}/${f.id}`, { obsAgendamento: observacao, atualizadoEm: AGORA }));
  }
  if (origemRetornoId && !editando) {
    operacoes.push(op.atualizar(`${caminho(empresaId)}/${origemRetornoId}`, { retornoSituacao: 'agendado', atualizadoEm: AGORA }));
  }
  await gravar(operacoes);
  invalidarCache(`${empresaId}:servicos`);
  return id;
}

/** Tempo que cada técnico da linha fica ocupado (por técnico) e o maior deles (`ocupacaoMin`, usado por serviços antigos). */
function ocupacaoDaLinha(l, minutos) {
  const porTecnico = {};
  for (const t of tecnicosDaLinha(l)) if (t?.uid) porTecnico[t.uid] = minutos.get(t.uid) || l.duracaoMin;
  return { ocupacaoPorTecnico: porTecnico, ocupacaoMin: Math.max(l.duracaoMin, ...Object.values(porTecnico)) };
}

/** Todas as linhas de um agendamento (inclui serviços antigos, que são um agendamento de uma linha). */
export async function listarLinhasDoAgendamento(empresaId, servico, { tecnicoUid = null } = {}) {
  // Serviço antigo (sem agendamentoId): o grupo dele é ele mesmo + os serviços adicionados depois
  // (que usam o id dele como agendamentoId).
  const chave = chaveDoAgendamento(servico);
  // O técnico só pode ler os serviços dele: a consulta precisa dizer isso (regra do Firestore).
  const onde = [['agendamentoId', '==', chave]];
  const lista = tecnicoUid
    ? await listarDoTecnico(empresaId, tecnicoUid, onde, {})
    : await listar(caminho(empresaId), { onde });
  if (servico.id && !lista.some((l) => l.id === servico.id)) lista.push(servico);
  return lista.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
}

/** Cancela todas as linhas ainda agendadas de um agendamento. */
export async function cancelarAgendamentoCompleto(empresaId, linhas) {
  const operacoes = [];
  for (const l of linhas.filter((x) => x.status === STATUS.AGENDADO)) {
    operacoes.push(op.atualizar(`${caminho(empresaId)}/${l.id}`, { status: STATUS.CANCELADO, reagendado: false, atualizadoEm: AGORA }));
    if (l.origemRetornoId) operacoes.push(op.atualizar(`${caminho(empresaId)}/${l.origemRetornoId}`, { retornoSituacao: 'pendente', atualizadoEm: AGORA }));
  }
  await gravar(operacoes);
  invalidarCache(`${empresaId}:servicos`);
}

/**
 * Exclui um agendamento (e os valores de cada linha). Só administrador.
 * Serviços JÁ CONCLUÍDOS nunca são excluídos: o histórico e a garantia ficam
 * guardados. Também não mexe no cliente nem nos aparelhos dele.
 * @returns {Promise<number>} quantas linhas foram excluídas
 */
export async function excluirAgendamentoCompleto(empresaId, linhas) {
  const operacoes = [];
  const excluiveis = linhas.filter((l) => l.status !== STATUS.CONCLUIDO);
  if (excluiveis.length === 0) {
    throw new ErroApp('Serviços concluídos não podem ser excluídos: ficam guardados no histórico.', 'servico-concluido');
  }
  for (const l of excluiveis) {
    operacoes.push(op.apagar(`${caminho(empresaId)}/${l.id}`), op.apagar(`${caminhoValores(empresaId)}/${l.id}`));
    if (l.status === STATUS.AGENDADO && l.origemRetornoId) {
      operacoes.push(op.atualizar(`${caminho(empresaId)}/${l.origemRetornoId}`, { retornoSituacao: 'pendente', atualizadoEm: AGORA }));
    }
  }
  await gravar(operacoes);
  invalidarCache(`${empresaId}:servicos`);
  return excluiveis.length;
}

/**
 * Na visita, adiciona mais um serviço (de um aparelho já escolhido). Usado pelo técnico
 * (e pelo administrador) na hora do atendimento. A nova linha herda dia, hora, cliente e local.
 */
export async function adicionarServicoNaVisita({ empresaId, base, aparelho, tipo, tecnico = null, tecnicos = null, linhasDaVisita = [] }) {
  if (!aparelho) throw new ErroApp('Escolha ou cadastre o aparelho antes de adicionar um serviço.', 'sem-aparelho');
  if (!tipo) throw new ErroApp('Escolha o tipo de serviço.', 'sem-tipo');
  const id = novoId(caminho(empresaId));
  const agendamentoId = chaveDoAgendamento(base);
  const operacoes = [];
  // Técnicos do novo serviço: os informados; senão os do serviço de origem.
  const uidsBase = tecnicosDoServico(base);
  const nomesBase = nomesDosTecnicos(base);
  const escolhidos = tecnicos ?? (tecnico ? [tecnico] : uidsBase.map((uid, i) => ({ uid, nome: nomesBase[i] || '' })));
  const donos = camposDosTecnicos(escolhidos);
  const duracao = tipo.duracaoMin ?? DURACAO_PADRAO_MIN;
  // Tempo total de cada técnico nesta visita (os serviços que ele já tinha + este).
  const abertas = [base, ...linhasDaVisita].filter((l, i, a) => a.findIndex((x) => x.id === l.id) === i)
    .filter((l) => l.status === STATUS.AGENDADO);
  const ocupacaoPorTecnico = {};
  for (const uid of donos.tecnicoUids) {
    ocupacaoPorTecnico[uid] = abertas.filter((l) => tecnicosDoServico(l).includes(uid)).reduce((soma, l) => soma + duracaoDoServico(l), 0) + duracao;
  }
  // Serviço antigo (sem agendamentoId) não é alterado: a nova linha usa o id dele como agendamentoId.
  operacoes.push(op.criar(`${caminho(empresaId)}/${id}`, {
    clienteId: base.clienteId,
    clienteNome: base.clienteNome,
    clienteWhatsapp: base.clienteWhatsapp ?? '',
    local: base.local || '',
    localLat: base.localLat ?? null,
    localLng: base.localLng ?? null,
    enderecoId: base.enderecoId ?? null,
    aparelhoId: aparelho.id,
    aparelhoResumo: resumoDoAparelho(aparelho),
    tipoServicoId: tipo.id,
    tipoServicoNome: tipo.nome,
    geraRetorno: tipo.geraRetorno === true,
    duracaoMin: duracao,
    ocupacaoMin: Math.max(duracao, ...Object.values(ocupacaoPorTecnico)),
    ocupacaoPorTecnico,
    ...donos,
    agendamentoId,
    obsAgendamento: base.obsAgendamento || '',
    ordem: 99,
    status: STATUS.AGENDADO,
    dataAgendada: base.dataAgendada,
    descricao: '',
    pago: false,
    valorDefinido: false,
    // Marca o serviço acrescentado em campo pelo técnico: só ele pode corrigir/excluir antes de concluir.
    ...(tecnico ? { adicionadoPeloTecnico: true, vistoPeloAdmin: false } : {}),
    criadoEm: AGORA,
    atualizadoEm: AGORA,
  }));
  await gravar(operacoes);
  invalidarCache(`${empresaId}:servicos`);
  return id;
}

/**
 * O técnico corrige o serviço que ELE acrescentou (ainda agendado): troca o tipo e/ou o aparelho.
 * Não mexe em data, técnicos, duração nem valores.
 */
export async function corrigirServicoAdicionado({ empresaId, servico, tipo = null, aparelho = null }) {
  if (servico?.adicionadoPeloTecnico !== true || servico.status !== STATUS.AGENDADO) {
    throw new ErroApp('Só dá para corrigir um serviço que você acrescentou e que ainda está agendado.', 'servico-nao-editavel');
  }
  const mudancas = { atualizadoEm: AGORA };
  if (tipo) Object.assign(mudancas, { tipoServicoId: tipo.id, tipoServicoNome: tipo.nome, geraRetorno: tipo.geraRetorno === true });
  if (aparelho) Object.assign(mudancas, { aparelhoId: aparelho.id, aparelhoResumo: resumoDoAparelho(aparelho) });
  await gravar([op.atualizar(`${caminho(empresaId)}/${servico.id}`, mudancas)]);
  invalidarCache(`${empresaId}:servicos`);
}

/**
 * "Informar aparelhos e serviços": o atendimento foi agendado sem isso. `itens` = [{ aparelho, tipos: [tipo...] }].
 * O 1º par (aparelho + serviço) preenche a linha "a definir"; os demais viram linhas novas na mesma visita.
 * Se o técnico informa, tudo fica marcado como "incluído pelo técnico" (o administrador é avisado).
 * Pares que já existem na visita são ignorados (se a gravação for repetida não duplica).
 */
export async function informarAparelhosEServicos({ empresaId, servico, itens, tecnico = null }) {
  if (servico.status !== STATUS.AGENDADO) throw new ErroApp('Este serviço já foi fechado.', 'servico-fechado');
  if (itens.some((i) => !i.aparelho)) throw new ErroApp('Escolha ou cadastre o aparelho.', 'sem-aparelho');
  if (itens.some((i) => i.tipos.length === 0)) throw new ErroApp('Escolha pelo menos um serviço para cada aparelho.', 'sem-tipo');
  const linhas = await listarLinhasDoAgendamento(empresaId, servico, { tecnicoUid: tecnico?.uid || null });
  const pares = itens.flatMap((i) => i.tipos.map((tipo) => ({ aparelho: i.aparelho, tipo })));
  const novos = pares.filter((p) => !linhas.some((l) => l.id !== servico.id && l.status === STATUS.AGENDADO && l.aparelhoId === p.aparelho.id && l.tipoServicoId === p.tipo.id));
  if (novos.length === 0) throw new ErroApp('Esses serviços já estão nesta visita.', 'servico-repetido');
  const [primeiro, ...resto] = novos;
  for (const p of resto) {
    await adicionarServicoNaVisita({ empresaId, base: servico, aparelho: p.aparelho, tipo: p.tipo, tecnico, linhasDaVisita: linhas });
  }
  await gravar([op.atualizar(`${caminho(empresaId)}/${servico.id}`, {
    aparelhoId: primeiro.aparelho.id,
    aparelhoResumo: resumoDoAparelho(primeiro.aparelho),
    tipoServicoId: primeiro.tipo.id,
    tipoServicoNome: primeiro.tipo.nome,
    geraRetorno: primeiro.tipo.geraRetorno === true,
    ...(tecnico ? { adicionadoPeloTecnico: true, vistoPeloAdmin: false } : {}),
    atualizadoEm: AGORA,
  })]);
  invalidarCache(`${empresaId}:servicos`);
  return novos.length;
}

/**
 * "Informar serviço" numa visita: escolhe o aparelho e o serviço. Se a visita ainda tem uma linha
 * "Serviço a definir" (agendada sem aparelho/serviço), essa linha é CONSUMIDA (recebe o aparelho e o serviço, e a
 * duração do serviço); senão o serviço entra como linha nova. O técnico que informa deixa tudo "incluído pelo técnico".
 * `linhasDaVisita` = todas as linhas da visita. Devolve o id da linha que recebeu o serviço.
 */
export async function informarServicoNaVisita({ empresaId, linhasDaVisita, aparelho, tipo, tecnico = null }) {
  if (!aparelho) throw new ErroApp('Escolha ou cadastre o aparelho.', 'sem-aparelho');
  if (!tipo) throw new ErroApp('Escolha o tipo de serviço.', 'sem-tipo');
  const abertas = linhasDaVisita.filter((l) => l.status === STATUS.AGENDADO);
  if (abertas.length === 0) throw new ErroApp('Este agendamento já foi fechado.', 'servico-fechado');
  if (abertas.some((l) => l.aparelhoId === aparelho.id && l.tipoServicoId === tipo.id)) {
    throw new ErroApp('Este serviço já está neste aparelho, nesta visita.', 'servico-repetido');
  }
  // A linha "a definir" que recebe o serviço: a do mesmo aparelho, senão a sem aparelho, senão qualquer uma.
  const semServico = abertas.filter(ehLinhaSemServico);
  const alvo = semServico.find((l) => l.aparelhoId === aparelho.id) || semServico.find((l) => !l.aparelhoId) || semServico[0];
  if (!alvo) {
    const referencia = abertas.find((l) => tecnico && tecnicosDoServico(l).includes(tecnico.uid)) || abertas[0];
    return adicionarServicoNaVisita({ empresaId, base: referencia, aparelho, tipo, tecnico, linhasDaVisita });
  }
  const duracao = tipo.duracaoMin ?? DURACAO_PADRAO_MIN;
  const preenchida = { ...alvo, duracaoMin: duracao };
  const minutos = minutosPorTecnico(abertas.map((l) => (l.id === alvo.id ? preenchida : l)));
  const operacoes = abertas.map((l) => {
    const linha = l.id === alvo.id ? preenchida : l;
    const campos = { ...ocupacaoDaLinha({ ...linha, duracaoMin: duracaoDoServico(linha) }, minutos), atualizadoEm: AGORA };
    if (l.id === alvo.id) {
      Object.assign(campos, {
        aparelhoId: aparelho.id,
        aparelhoResumo: resumoDoAparelho(aparelho),
        tipoServicoId: tipo.id,
        tipoServicoNome: tipo.nome,
        geraRetorno: tipo.geraRetorno === true,
        duracaoMin: duracao,
        ...(tecnico ? { adicionadoPeloTecnico: true, vistoPeloAdmin: false } : {}),
      });
    }
    return op.atualizar(`${caminho(empresaId)}/${l.id}`, campos);
  });
  await gravar(operacoes);
  invalidarCache(`${empresaId}:servicos`);
  return alvo.id;
}

/** Serviços que o técnico acrescentou em campo e que o administrador ainda não viu (só administrador). */
export function listarIncluidosNaoVistos({ empresaId }) {
  return listar(caminho(empresaId), {
    onde: [['adicionadoPeloTecnico', '==', true], ['vistoPeloAdmin', '==', false]],
    limite: 50,
  });
}

/** O administrador abriu o agendamento: os serviços incluídos pelo técnico passam a "vistos". */
export async function marcarIncluidosComoVistos(empresaId, linhas) {
  const novos = linhas.filter((l) => l.adicionadoPeloTecnico === true && l.vistoPeloAdmin !== true);
  if (novos.length === 0) return 0;
  await gravar(novos.map((l) => op.atualizar(`${caminho(empresaId)}/${l.id}`, { vistoPeloAdmin: true })));
  invalidarCache(`${empresaId}:servicos`);
  return novos.length;
}

/** O técnico exclui o serviço que ELE acrescentou e que ainda está agendado (não existe valor para apagar). */
export async function excluirServicoAdicionado(empresaId, servico) {
  if (servico?.adicionadoPeloTecnico !== true || servico.status !== STATUS.AGENDADO) {
    throw new ErroApp('Só dá para excluir um serviço que você acrescentou e que ainda está agendado.', 'servico-nao-editavel');
  }
  await gravar([op.apagar(`${caminho(empresaId)}/${servico.id}`)]);
  invalidarCache(`${empresaId}:servicos`);
}

// -----------------------------------------------------------------------------
// CONSULTAS
// -----------------------------------------------------------------------------

export function buscarServico(empresaId, id) {
  return ler(`${caminho(empresaId)}/${id}`);
}

/**
 * Serviços agendados entre duas datas (de inclusive, ate exclusive).
 * O técnico passa tecnicoUid: o servidor só devolve os serviços dele.
 */
export function listarAgendados({ empresaId, de = null, ate = null, tecnicoUid = null }) {
  const onde = [['status', '==', STATUS.AGENDADO]];
  if (de) onde.push(['dataAgendada', '>=', de]);
  if (ate) onde.push(['dataAgendada', '<', ate]);
  const opcoes = { ordenarPor: [['dataAgendada', 'asc']], limite: 300 };
  return tecnicoUid ? listarDoTecnico(empresaId, tecnicoUid, onde, opcoes) : listar(caminho(empresaId), { onde, ...opcoes });
}

/**
 * Serviços em que o técnico trabalha. São DUAS consultas juntas (o servidor exige que a
 * consulta diga que é "do técnico"): serviços novos, que guardam a lista `tecnicoUids`, e
 * serviços antigos, que têm só `tecnicoUid`. Os resultados são unidos sem repetir.
 */
async function listarDoTecnico(empresaId, uid, onde, opcoes) {
  const [novos, antigos] = await Promise.all([
    listar(caminho(empresaId), { ...opcoes, onde: [['tecnicoUids', 'array-contains', uid], ...onde] }),
    listar(caminho(empresaId), { ...opcoes, onde: [['tecnicoUid', '==', uid], ...onde] }),
  ]);
  const porId = new Map();
  for (const s of [...novos, ...antigos]) porId.set(s.id, s);
  const lista = [...porId.values()];
  const [campo, sentido] = opcoes.ordenarPor?.[0] || [];
  if (campo) {
    const valor = (s) => { const v = s[campo]; return v instanceof Date ? v.getTime() : v; };
    lista.sort((a, b) => (valor(a) > valor(b) ? 1 : valor(a) < valor(b) ? -1 : 0) * (sentido === 'desc' ? -1 : 1));
  }
  return opcoes.limite ? lista.slice(0, opcoes.limite) : lista;
}

/** Agendados que já passaram da data e ainda não foram concluídos. */
export function listarAtrasados({ empresaId, tecnicoUid = null, agora = new Date() }) {
  return listarAgendados({ empresaId, ate: inicioDoDia(agora), tecnicoUid });
}

/** Cancelados que esperam uma nova data (mais recentes primeiro). Só administrador. */
export function listarAguardandoReagendamento({ empresaId, limite = 100 }) {
  return listar(caminho(empresaId), {
    onde: [['status', '==', STATUS.CANCELADO]],
    ordenarPor: [['dataAgendada', 'desc']],
    limite,
  });
}

/**
 * Serviços concluídos, do mais recente para o mais antigo. `de` (inclusive) e `ate`
 * (exclusive) limitam pelo dia da conclusão.
 */
export function listarHistorico({ empresaId, tecnicoUid = null, limite = PAGINA_HISTORICO, de = null, ate = null }) {
  const onde = [['status', '==', STATUS.CONCLUIDO]];
  if (de) onde.push(['dataConclusao', '>=', de]);
  if (ate) onde.push(['dataConclusao', '<', ate]);
  const opcoes = { ordenarPor: [['dataConclusao', 'desc']], limite };
  return tecnicoUid ? listarDoTecnico(empresaId, tecnicoUid, onde, opcoes) : listar(caminho(empresaId), { onde, ...opcoes });
}

/** Todos os serviços de um cliente (qualquer situação), mais recentes primeiro. Só administrador. */
export async function listarServicosDoCliente(empresaId, clienteId) {
  const lista = await listar(caminho(empresaId), { onde: [['clienteId', '==', clienteId]] });
  return lista.sort((a, b) => (b.dataAgendada?.getTime() ?? 0) - (a.dataAgendada?.getTime() ?? 0));
}

/** Serviços concluídos que ainda não têm valor informado (feitos por técnicos). Só administrador. */
export function listarSemValor(empresaId) {
  return listar(caminho(empresaId), {
    onde: [['status', '==', STATUS.CONCLUIDO], ['valorDefinido', '==', false]],
    ordenarPor: [['dataConclusao', 'desc']],
    limite: 100,
  });
}

// -----------------------------------------------------------------------------
// CONCLUIR SERVIÇO
// -----------------------------------------------------------------------------

/**
 * Conclui o serviço. Quem preenche decide o que grava:
 *   * ADMINISTRADOR informa o valor -> grava também em valores/{id};
 *   * TÉCNICO não informa valor (só "cliente pagou? sim/não").
 * @param {object} p
 * @param {object} p.servico      o serviço agendado
 * @param {'admin'|'tecnico'} p.papel
 * @param {string} p.nomeQuemConcluiu
 * @param {object} p.dados { descricao, pago, retornoMeses, aparelho (objeto ou null), valorCentavos (só admin), dataConclusaoISO (só admin, opcional) }
 */
export async function concluirServico({ empresaId, servico, papel, nomeQuemConcluiu, dados }) {
  if (servico.status !== STATUS.AGENDADO) {
    throw new ErroApp('Este serviço já foi concluído ou cancelado.', 'servico-fechado');
  }
  if (dados.exigirAparelho && !dados.aparelho && !servico.aparelhoId) {
    throw new ErroApp('Escolha ou cadastre o aparelho antes de concluir o serviço.', 'sem-aparelho');
  }
  const tipoFinal = dados.tipo || null; // só quando o serviço ainda estava "a definir"
  if (!servico.tipoServicoId && !tipoFinal) {
    throw new ErroApp('Escolha o tipo de serviço antes de concluir.', 'sem-tipo');
  }
  const ehAdmin = papel === 'admin';
  // Quem define o valor ao concluir: o administrador, ou o técnico com a permissão "alterar valor e extras".
  const defineValor = ehAdmin || dados.podeAlterarValores === true;
  const agora = new Date();
  const concluidoEm = ehAdmin && dados.dataConclusaoISO ? combinarDataHora(dados.dataConclusaoISO, `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`) : agora;
  if (concluidoEm.getTime() > agora.getTime() + 60000) {
    throw new ErroApp('A data de conclusão não pode ser no futuro.', 'data-futura');
  }

  const campos = {
    ...(tipoFinal && !servico.tipoServicoId ? {
      tipoServicoId: tipoFinal.id, tipoServicoNome: tipoFinal.nome, geraRetorno: tipoFinal.geraRetorno === true,
      duracaoMin: tipoFinal.duracaoMin ?? DURACAO_PADRAO_MIN,
    } : {}),
    ...camposDeConclusao({ geraRetorno: (tipoFinal && !servico.tipoServicoId ? tipoFinal.geraRetorno : servico.geraRetorno) === true, retornoMeses: dados.retornoMeses ?? null, concluidoEm }),
    descricao: dados.descricao,
    pago: dados.pago === true,
    aparelhoId: dados.aparelho?.id ?? servico.aparelhoId ?? null,
    aparelhoResumo: dados.aparelho ? resumoDoAparelho(dados.aparelho) : (servico.aparelhoResumo || ''),
    concluidoPorNome: nomeQuemConcluiu || '',
    atualizadoEm: AGORA,
  };

  const operacoes = [];
  // Valor: dados.valores = { baseCentavos, extras, descontoCentavos } (ou o antigo dados.valorCentavos).
  const valores = dados.valores ?? (Number.isInteger(dados.valorCentavos) ? dados.valorCentavos : null);
  if (defineValor && valores !== null) {
    campos.valorDefinido = true;
    operacoes.push(op.definir(`${caminhoValores(empresaId)}/${servico.id}`, {
      ...documentoDeValores(valores),
      tipoNome: tipoFinal && !servico.tipoServicoId ? tipoFinal.nome : servico.tipoServicoNome,
      dataConclusao: concluidoEm,
      atualizadoEm: AGORA,
    }));
  }
  if (ehAdmin) {
    if (servico.origemRetornoId) {
      operacoes.push(op.atualizar(`${caminho(empresaId)}/${servico.origemRetornoId}`, { retornoSituacao: 'feito', atualizadoEm: AGORA }));
    }
  }
  operacoes.unshift(op.atualizar(`${caminho(empresaId)}/${servico.id}`, campos));
  await gravar(operacoes);
  invalidarCache(`${empresaId}:servicos`);
  return campos;
}

/** Lê o valor gravado de um serviço (formato novo ou antigo) ou null. */
export async function buscarValores(empresaId, servicoId) {
  return lerDocumentoDeValores(await ler(`${caminhoValores(empresaId)}/${servicoId}`));
}

/**
 * O administrador informa (ou corrige) o valor de um serviço já concluído.
 * `valores`: número em centavos (antigo) ou { baseCentavos, extras, descontoCentavos }.
 */
export async function definirValor(empresaId, servico, valores) {
  await gravar([
    op.definir(`${caminhoValores(empresaId)}/${servico.id}`, {
      ...documentoDeValores(valores),
      tipoNome: servico.tipoServicoNome,
      dataConclusao: servico.dataConclusao,
      atualizadoEm: AGORA,
    }),
    op.atualizar(`${caminho(empresaId)}/${servico.id}`, { valorDefinido: true, atualizadoEm: AGORA }),
  ]);
}

/** Marca como pago / a receber. */
export async function marcarPago(empresaId, servicoId, pago) {
  await gravar([op.atualizar(`${caminho(empresaId)}/${servicoId}`, { pago, atualizadoEm: AGORA })]);
}

/** O administrador edita a descrição de um serviço concluído. */
export async function editarDescricao(empresaId, servicoId, descricao) {
  await gravar([op.atualizar(`${caminho(empresaId)}/${servicoId}`, { descricao, atualizadoEm: AGORA })]);
}

// -----------------------------------------------------------------------------
// RETORNOS (lembretes de limpeza / manutenção preventiva) — só administrador
// -----------------------------------------------------------------------------

/**
 * Lista os retornos pendentes que já estão "em tempo" (vencidos ou dentro dos
 * dias de aviso). Retorna { vencidos, proximos }.
 */
export async function listarRetornos({ empresaId, hojeISO, diasAviso }) {
  const limite = limiteConsultaRetornos(hojeISO, diasAviso);
  const lista = await listar(caminho(empresaId), {
    onde: [['retornoSituacao', '==', 'pendente'], ['dataRetorno', '<=', limite]],
    ordenarPor: [['dataRetorno', 'asc']],
    limite: 200,
  });
  return separarRetornos(lista, hojeISO, diasAviso);
}

/** Quantos retornos estão em tempo (número da bolinha vermelha na tela inicial). */
export async function contarRetornos({ empresaId, hojeISO, diasAviso }) {
  const { vencidos, proximos } = await listarRetornos({ empresaId, hojeISO, diasAviso });
  return vencidos.length + proximos.length;
}

/** Anota que o aviso foi aberto no WhatsApp (para o administrador lembrar quem já avisou). */
export async function registrarAviso(empresaId, servicoId) {
  await gravar([op.atualizar(`${caminho(empresaId)}/${servicoId}`, { ultimoAvisoEm: AGORA, atualizadoEm: AGORA })]);
}

/** Anota que a cobrança foi aberta no WhatsApp (não marca como pago). Só administrador. */
export async function registrarCobranca(empresaId, servicoIds) {
  await gravar(servicoIds.map((id) => op.atualizar(`${caminho(empresaId)}/${id}`, { cobradoEm: AGORA, atualizadoEm: AGORA })));
}

/** Técnico (ou admin) diz que o serviço não deu para fazer hoje: fica pendente, aguardando reagendamento. */
export async function marcarPendente(empresaId, servicoIds, motivo = '') {
  const m = String(motivo || '').trim().slice(0, 200);
  await gravar(servicoIds.map((id) => op.atualizar(`${caminho(empresaId)}/${id}`, { status: 'cancelado', pendente: true, motivoPendencia: m, atualizadoEm: AGORA })));
}

/** "Adiar": empurra o lembrete alguns dias. */
export async function adiarRetornoDoServico(empresaId, servico, dias, hojeISO = paraISO(new Date())) {
  const novo = adiarRetorno(servico.dataRetorno, hojeISO, dias);
  await gravar([op.atualizar(`${caminho(empresaId)}/${servico.id}`, { dataRetorno: novo, atualizadoEm: AGORA })]);
  return novo;
}

/** "Não quer mais": encerra o lembrete (o cliente não será mais avisado deste aparelho). */
export async function recusarRetorno(empresaId, servicoId) {
  await gravar([op.atualizar(`${caminho(empresaId)}/${servicoId}`, { retornoSituacao: 'recusado', atualizadoEm: AGORA })]);
}

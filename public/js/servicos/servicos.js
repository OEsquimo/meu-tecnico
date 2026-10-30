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
// VALORES EM DINHEIRO ficam em outra coleção (valores/), só o administrador lê.
// =============================================================================

import { ler, listar, gravar, operacao as op, novoId, AGORA } from '../nucleo/banco.js';
import { invalidarCache } from '../nucleo/cache.js';
import { ErroApp } from '../nucleo/erros.js';
import { LIMITE_HISTORICO, DURACAO_PADRAO_MIN } from '../nucleo/constantes.js';
import { camposDeConclusao, localDoServico, STATUS, NOME_SERVICO_A_DEFINIR, chaveDoAgendamento, duracaoDoServico } from '../dominio/servicos.js';
import { tecnicoEstaLivre } from '../dominio/agenda.js';
import { separarRetornos, limiteConsultaRetornos, adiarRetorno } from '../dominio/retornos.js';
import { combinarDataHora, paraISO, inicioDoDia } from '../dominio/datas.js';
import { resumoDoAparelho } from '../dominio/aparelhos.js';

const caminho = (empresaId) => `empresas/${empresaId}/servicos`;
const caminhoValores = (empresaId) => `empresas/${empresaId}/valores`;

// -----------------------------------------------------------------------------
// AGENDAR / EDITAR / CANCELAR / EXCLUIR  (administrador)
// -----------------------------------------------------------------------------

/** Campos copiados do cliente/aparelho/tipo/técnico para dentro do serviço. */
function camposCopiados({ cliente, endereco, aparelho, tipo, tecnico }) {
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
    tecnicoUid: tecnico?.uid ?? null,
    tecnicoNome: tecnico?.nome ?? '',
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

/** Exclui o serviço (e o valor dele). Só administrador. */
export async function excluirServico(empresaId, servicoId) {
  await gravar([op.apagar(`${caminho(empresaId)}/${servicoId}`), op.apagar(`${caminhoValores(empresaId)}/${servicoId}`)]);
  invalidarCache(`${empresaId}:servicos`);
}

// -----------------------------------------------------------------------------
// AGENDAMENTO COMPLETO (vários aparelhos, vários serviços, um técnico por serviço)
// -----------------------------------------------------------------------------
// Uma visita = um "agendamento" com data e hora únicas. Cada linha é um serviço
// de um aparelho, com seu técnico. Linhas da mesma visita compartilham
// `agendamentoId`, `dataAgendada` e `obsAgendamento`.
// -----------------------------------------------------------------------------

/** Confere, no banco, se cada técnico escolhido está livre. Lança ErroApp com o nome de quem não está. */
function minutosPorTecnico(linhas) {
  const minutos = new Map(); // tecnicoUid -> minutos ocupados nesta visita
  for (const l of linhas) {
    if (!l.tecnico?.uid) continue;
    minutos.set(l.tecnico.uid, (minutos.get(l.tecnico.uid) || 0) + (l.duracaoMin || DURACAO_PADRAO_MIN));
  }
  return minutos;
}

export async function verificarDisponibilidade({ empresaId, inicio, linhas, ignorarAgendamento = null }) {
  const minutos = minutosPorTecnico(linhas);
  if (minutos.size === 0) return;
  // Serviços agendados do dia anterior ao seguinte (cobre quem começou antes e passa do horário).
  const de = new Date(inicio.getTime() - 24 * 3600000);
  const ate = new Date(inicio.getTime() + 24 * 3600000);
  const agendados = await listarAgendados({ empresaId, de, ate });
  for (const [uid, total] of minutos) {
    if (!tecnicoEstaLivre(uid, inicio, total, agendados, ignorarAgendamento)) {
      const nome = linhas.find((l) => l.tecnico?.uid === uid)?.tecnico?.nome || 'O técnico';
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
export async function salvarAgendamento({ empresaId, agendamentoId = null, existentes = [], cliente, endereco, tecnico = null, data, hora, observacao = '', linhas, origemRetornoId = null, preservar = [] }) {
  const inicio = combinarDataHora(data, hora);
  const editando = Boolean(agendamentoId);
  const fechadas = existentes.filter((l) => l.status !== STATUS.AGENDADO);
  const abertas = existentes.filter((l) => l.status === STATUS.AGENDADO);
  if (editando && abertas.length === 0) {
    throw new ErroApp('Só dá para editar serviços que ainda estão agendados.', 'servico-fechado');
  }
  const id = agendamentoId || novoId(caminho(empresaId));

  // Sem nenhum aparelho/serviço: uma linha "Serviço a definir" só com o técnico.
  let todas = linhas.map((l) => ({ ...l, tecnico: l.tecnico ?? tecnico }));
  if (todas.length === 0 && preservar.length === 0) todas = [{ aparelho: null, tipo: null, tecnico, duracaoMin: DURACAO_PADRAO_MIN }];
  for (const l of todas) l.duracaoMin = l.duracaoMin || l.tipo?.duracaoMin || DURACAO_PADRAO_MIN;

  await verificarDisponibilidade({ empresaId, inicio, linhas: todas, ignorarAgendamento: editando ? id : null });
  const minutos = minutosPorTecnico(todas);

  const operacoes = [];
  const mantidas = new Set();
  todas.forEach((l, ordem) => {
    const campos = {
      ...camposCopiados({ cliente, endereco, aparelho: l.aparelho, tipo: l.tipo, tecnico: l.tecnico }),
      duracaoMin: l.duracaoMin,
      ocupacaoMin: minutos.get(l.tecnico?.uid) || l.duracaoMin,
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
      operacoes.push(op.atualizar(`${caminho(empresaId)}/${l.id}`, campos));
    } else {
      const novo = novoId(caminho(empresaId));
      const documento = { ...campos, status: STATUS.AGENDADO, pago: false, valorDefinido: false, criadoEm: AGORA };
      if (origemRetornoId && !editando && ordem === 0) documento.origemRetornoId = origemRetornoId;
      operacoes.push(op.criar(`${caminho(empresaId)}/${novo}`, documento));
    }
  });
  // Linhas abertas que o administrador tirou da tela são removidas.
  for (const a of abertas) {
    if (mantidas.has(a.id)) continue;
    if (preservar.includes(a.id)) {
      operacoes.push(op.atualizar(`${caminho(empresaId)}/${a.id}`, { agendamentoId: id, obsAgendamento: observacao, dataAgendada: inicio, atualizadoEm: AGORA }));
      continue;
    }
    operacoes.push(op.apagar(`${caminho(empresaId)}/${a.id}`));
    // Linha que veio de um lembrete de retorno: o lembrete volta para a lista de pendentes.
    if (a.origemRetornoId) operacoes.push(op.atualizar(`${caminho(empresaId)}/${a.origemRetornoId}`, { retornoSituacao: 'pendente', atualizadoEm: AGORA }));
  }
  // Linhas já concluídas/canceladas continuam como estão (só acompanham a observação geral).
  for (const f of fechadas) {
    operacoes.push(op.atualizar(`${caminho(empresaId)}/${f.id}`, { obsAgendamento: observacao, atualizadoEm: AGORA }));
  }
  if (origemRetornoId && !editando) {
    operacoes.push(op.atualizar(`${caminho(empresaId)}/${origemRetornoId}`, { retornoSituacao: 'agendado', atualizadoEm: AGORA }));
  }
  await gravar(operacoes);
  invalidarCache(`${empresaId}:servicos`);
  return id;
}

/** Todas as linhas de um agendamento (inclui serviços antigos, que são um agendamento de uma linha). */
export async function listarLinhasDoAgendamento(empresaId, servico, { tecnicoUid = null } = {}) {
  // Serviço antigo (sem agendamentoId): o grupo dele é ele mesmo + os serviços adicionados depois
  // (que usam o id dele como agendamentoId).
  const chave = chaveDoAgendamento(servico);
  // O técnico só pode ler os serviços dele: a consulta precisa dizer isso (regra do Firestore).
  const onde = [['agendamentoId', '==', chave]];
  if (tecnicoUid) onde.unshift(['tecnicoUid', '==', tecnicoUid]);
  const lista = await listar(caminho(empresaId), { onde });
  if (servico.id && !lista.some((l) => l.id === servico.id)) lista.push(servico);
  return lista.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
}

/** Cancela todas as linhas ainda agendadas de um agendamento. */
export async function cancelarAgendamentoCompleto(empresaId, linhas) {
  const operacoes = [];
  for (const l of linhas.filter((x) => x.status === STATUS.AGENDADO)) {
    operacoes.push(op.atualizar(`${caminho(empresaId)}/${l.id}`, { status: STATUS.CANCELADO, atualizadoEm: AGORA }));
    if (l.origemRetornoId) operacoes.push(op.atualizar(`${caminho(empresaId)}/${l.origemRetornoId}`, { retornoSituacao: 'pendente', atualizadoEm: AGORA }));
  }
  await gravar(operacoes);
  invalidarCache(`${empresaId}:servicos`);
}

/** Exclui um agendamento inteiro (e os valores de cada linha). Só administrador. */
export async function excluirAgendamentoCompleto(empresaId, linhas) {
  const operacoes = [];
  for (const l of linhas) {
    operacoes.push(op.apagar(`${caminho(empresaId)}/${l.id}`), op.apagar(`${caminhoValores(empresaId)}/${l.id}`));
    if (l.status === STATUS.AGENDADO && l.origemRetornoId) {
      operacoes.push(op.atualizar(`${caminho(empresaId)}/${l.origemRetornoId}`, { retornoSituacao: 'pendente', atualizadoEm: AGORA }));
    }
  }
  await gravar(operacoes);
  invalidarCache(`${empresaId}:servicos`);
}

/**
 * Na visita, adiciona mais um serviço (de um aparelho já escolhido). Usado pelo técnico
 * (e pelo administrador) na hora do atendimento. A nova linha herda dia, hora, cliente e local.
 */
export async function adicionarServicoNaVisita({ empresaId, base, aparelho, tipo, tecnico, linhasDaVisita = [] }) {
  if (!aparelho) throw new ErroApp('Escolha ou cadastre o aparelho antes de adicionar um serviço.', 'sem-aparelho');
  if (!tipo) throw new ErroApp('Escolha o tipo de serviço.', 'sem-tipo');
  const id = novoId(caminho(empresaId));
  const agendamentoId = chaveDoAgendamento(base);
  const operacoes = [];
  const donoUid = tecnico?.uid ?? base.tecnicoUid ?? null;
  const duracao = tipo.duracaoMin ?? DURACAO_PADRAO_MIN;
  // Tempo total do técnico nesta visita (os serviços que ele já tinha + este).
  const jaTinha = [base, ...linhasDaVisita].filter((l, i, a) => a.findIndex((x) => x.id === l.id) === i)
    .filter((l) => l.status === STATUS.AGENDADO && l.tecnicoUid === donoUid)
    .reduce((soma, l) => soma + duracaoDoServico(l), 0);
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
    ocupacaoMin: jaTinha + duracao,
    tecnicoUid: donoUid,
    tecnicoNome: tecnico?.nome ?? base.tecnicoNome ?? '',
    agendamentoId,
    obsAgendamento: base.obsAgendamento || '',
    ordem: 99,
    status: STATUS.AGENDADO,
    dataAgendada: base.dataAgendada,
    descricao: '',
    pago: false,
    valorDefinido: false,
    criadoEm: AGORA,
    atualizadoEm: AGORA,
  }));
  await gravar(operacoes);
  invalidarCache(`${empresaId}:servicos`);
  return id;
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
  if (tecnicoUid) onde.unshift(['tecnicoUid', '==', tecnicoUid]);
  if (de) onde.push(['dataAgendada', '>=', de]);
  if (ate) onde.push(['dataAgendada', '<', ate]);
  return listar(caminho(empresaId), { onde, ordenarPor: [['dataAgendada', 'asc']], limite: 300 });
}

/** Agendados que já passaram da data e ainda não foram concluídos. */
export function listarAtrasados({ empresaId, tecnicoUid = null, agora = new Date() }) {
  return listarAgendados({ empresaId, ate: inicioDoDia(agora), tecnicoUid });
}

/** Histórico: serviços concluídos, do mais recente para o mais antigo. */
export function listarHistorico({ empresaId, tecnicoUid = null, limite = LIMITE_HISTORICO }) {
  const onde = [['status', '==', STATUS.CONCLUIDO]];
  if (tecnicoUid) onde.unshift(['tecnicoUid', '==', tecnicoUid]);
  return listar(caminho(empresaId), { onde, ordenarPor: [['dataConclusao', 'desc']], limite });
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
  if (ehAdmin) {
    campos.valorDefinido = true;
    operacoes.push(op.definir(`${caminhoValores(empresaId)}/${servico.id}`, {
      valorCentavos: dados.valorCentavos,
      tipoNome: tipoFinal && !servico.tipoServicoId ? tipoFinal.nome : servico.tipoServicoNome,
      dataConclusao: concluidoEm,
      atualizadoEm: AGORA,
    }));
    if (servico.origemRetornoId) {
      operacoes.push(op.atualizar(`${caminho(empresaId)}/${servico.origemRetornoId}`, { retornoSituacao: 'feito', atualizadoEm: AGORA }));
    }
  }
  operacoes.unshift(op.atualizar(`${caminho(empresaId)}/${servico.id}`, campos));
  await gravar(operacoes);
  invalidarCache(`${empresaId}:servicos`);
  return campos;
}

/** O administrador informa (ou corrige) o valor de um serviço já concluído. */
export async function definirValor(empresaId, servico, valorCentavos) {
  await gravar([
    op.definir(`${caminhoValores(empresaId)}/${servico.id}`, {
      valorCentavos,
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

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
import { LIMITE_HISTORICO } from '../nucleo/constantes.js';
import { camposDeConclusao, localDoServico, STATUS } from '../dominio/servicos.js';
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
    tipoServicoId: tipo.id,
    tipoServicoNome: tipo.nome,
    geraRetorno: tipo.geraRetorno === true,
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
  const ehAdmin = papel === 'admin';
  const agora = new Date();
  const concluidoEm = ehAdmin && dados.dataConclusaoISO ? combinarDataHora(dados.dataConclusaoISO, `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`) : agora;
  if (concluidoEm.getTime() > agora.getTime() + 60000) {
    throw new ErroApp('A data de conclusão não pode ser no futuro.', 'data-futura');
  }

  const campos = {
    ...camposDeConclusao({ geraRetorno: servico.geraRetorno === true, retornoMeses: dados.retornoMeses ?? null, concluidoEm }),
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
      tipoNome: servico.tipoServicoNome,
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

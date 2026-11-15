// =============================================================================
// LISTA DE SERVIÇOS (página "Serviços", só administrador) — regras puras
// =============================================================================
// Uma página para ver os serviços por situação: Agendados (padrão), Concluídos,
// Cancelados, Pendentes, Reagendados e Todos. Excluídos não aparecem: ao excluir,
// o agendamento é apagado de vez e não sobra registro.
//   * Agendados: do mais próximo para o mais distante (os atrasados vêm primeiro);
//     não tem filtro de mês ("a partir de hoje", todos os que ainda estão agendados).
//   * Demais: do mais recente para o mais antigo, sempre dentro de UM mês.
// Este arquivo só monta a consulta e decide selos/ordem; quem lê o banco é servicos/servicos.js.
// =============================================================================

import { STATUS, estaAtrasado, seloDoServico } from './servicos.js';

export const STATUS_DA_LISTA = [
  { valor: 'agendado', rotulo: 'Agendados' },
  { valor: 'concluido', rotulo: 'Concluídos' },
  { valor: 'cancelado', rotulo: 'Cancelados' },
  { valor: 'pendente', rotulo: 'Pendentes' },
  { valor: 'reagendado', rotulo: 'Reagendados' },
  { valor: 'todos', rotulo: 'Todos' },
];

export const STATUS_PADRAO_DA_LISTA = 'agendado';

export function statusValido(valor) {
  return STATUS_DA_LISTA.some((s) => s.valor === valor) ? valor : STATUS_PADRAO_DA_LISTA;
}

/** Só os Agendados ignoram o mês (mostram todos os futuros e os atrasados). */
export function usaFiltroDeMes(status) {
  return statusValido(status) !== 'agendado';
}

/** Primeiro dia do mês (inclusive) e do mês seguinte (exclusive). mesIndice: 0 a 11. */
export function periodoDoMes(ano, mesIndice) {
  return { de: new Date(ano, mesIndice, 1, 0, 0, 0, 0), ate: new Date(ano, mesIndice + 1, 1, 0, 0, 0, 0) };
}

/** Mês anterior (delta -1) ou seguinte (+1), virando o ano quando precisa. */
export function mesVizinho({ ano, mes }, delta) {
  const d = new Date(ano, mes + delta, 1);
  return { ano: d.getFullYear(), mes: d.getMonth() };
}

/**
 * Monta a consulta ao banco para a lista.
 * Todas as consultas usam índices declarados em firestore.indexes.json.
 */
export function montarConsultaDaLista({ status, ano, mes, limite }) {
  const s = statusValido(status);
  if (s === 'agendado') {
    return { onde: [['status', '==', STATUS.AGENDADO]], ordenarPor: [['dataAgendada', 'asc']], limite };
  }
  const { de, ate } = periodoDoMes(ano, mes);
  const onde = [];
  if (s === 'concluido') onde.push(['status', '==', STATUS.CONCLUIDO]);
  if (s === 'cancelado') onde.push(['status', '==', STATUS.CANCELADO]);
  if (s === 'pendente') onde.push(['status', '==', STATUS.CANCELADO], ['pendente', '==', true]);
  if (s === 'reagendado') onde.push(['reagendado', '==', true]);
  onde.push(['dataAgendada', '>=', de], ['dataAgendada', '<', ate]);
  return { onde, ordenarPor: [['dataAgendada', 'desc']], limite };
}

/** Atrasados primeiro (do mais antigo ao mais novo), depois o resto na ordem de data. */
export function ordenarAgendados(lista, agora = new Date()) {
  const tempo = (s) => (s.dataAgendada instanceof Date ? s.dataAgendada.getTime() : 0);
  const atrasados = lista.filter((s) => estaAtrasado(s, agora)).sort((a, b) => tempo(a) - tempo(b));
  const resto = lista.filter((s) => !estaAtrasado(s, agora)).sort((a, b) => tempo(a) - tempo(b));
  return [...atrasados, ...resto];
}

/** Selo do cartão: o do serviço, mas um cancelado com a marca de pendente aparece como "Pendente". */
export function seloDaLista(servico, agora = new Date()) {
  if (servico.status === STATUS.CANCELADO && servico.pendente === true) return { texto: 'Pendente', tom: 'amarelo' };
  return seloDoServico(servico, agora);
}

/** Pode haver mais? Se veio menos do que o pedido, acabou. */
export function haMais(quantidadeLida, limite) {
  return quantidadeLida >= limite;
}

// =============================================================================
// VALORES E FINANCEIRO — leitura dos dados e montagem dos totais
// =============================================================================
// Só o administrador chega aqui. Para cada período buscamos:
//   * os serviços CONCLUÍDOS do período (coleção servicos);
//   * os valores desses serviços (coleção valores, 1 documento por serviço).
// Depois dominio/financeiro.js faz as contas (por tipo, por dia/semana/mês).
// =============================================================================

import { listar } from '../nucleo/banco.js';
import { periodoDe, resumir, serieDoPeriodo } from '../dominio/financeiro.js';

/** Serviços concluídos com dataConclusao em [inicio, fim). */
export function listarConcluidosDoPeriodo(empresaId, inicio, fim) {
  return listar(`empresas/${empresaId}/servicos`, {
    onde: [['status', '==', 'concluido'], ['dataConclusao', '>=', inicio], ['dataConclusao', '<', fim]],
    ordenarPor: [['dataConclusao', 'desc']],
    limite: 2000,
  });
}

/** Valores com dataConclusao em [inicio, fim) -> { [servicoId]: centavos }. */
export async function listarValoresDoPeriodo(empresaId, inicio, fim) {
  const lista = await listar(`empresas/${empresaId}/valores`, {
    onde: [['dataConclusao', '>=', inicio], ['dataConclusao', '<', fim]],
    limite: 2000,
  });
  const mapa = {};
  for (const v of lista) mapa[v.id] = v.valorCentavos;
  return mapa;
}

/**
 * Carrega tudo para a tela do Financeiro.
 * @param {'hoje'|'semana'|'mes'|'ano'} tipoPeriodo
 * @returns {Promise<{periodo, servicos, valores, resumo, serie}>}
 */
export async function carregarFinanceiro(empresaId, tipoPeriodo, referencia = new Date()) {
  const periodo = periodoDe(tipoPeriodo, referencia);
  const [servicos, valores] = await Promise.all([
    listarConcluidosDoPeriodo(empresaId, periodo.inicio, periodo.fim),
    listarValoresDoPeriodo(empresaId, periodo.inicio, periodo.fim),
  ]);
  return {
    periodo,
    servicos,
    valores,
    resumo: resumir(servicos, valores),
    serie: serieDoPeriodo(servicos, valores, tipoPeriodo, referencia),
  };
}

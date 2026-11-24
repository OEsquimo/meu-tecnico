// =============================================================================
// VALORES E FINANCEIRO — leitura dos dados e montagem dos totais
// =============================================================================
// Só o administrador chega aqui. Para cada período buscamos:
//   * os serviços CONCLUÍDOS do período (coleção servicos);
//   * os valores desses serviços (coleção valores, 1 documento por serviço).
// Depois dominio/financeiro.js faz as contas (por tipo, por dia/semana/mês).
// =============================================================================

import { listar } from '../nucleo/banco.js';
import { periodoDe, resumir, resumirComPagamentos, serieDoPeriodo } from '../dominio/financeiro.js';
import { lerDocumentoDeValores } from '../dominio/valores.js';

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

/** Documentos de valores completos com dataConclusao em [inicio, fim). */
function listarDocsDoPeriodo(empresaId, inicio, fim) {
  return listar(`empresas/${empresaId}/valores`, { onde: [['dataConclusao', '>=', inicio], ['dataConclusao', '<', fim]], limite: 2000 });
}

/** Documentos com algum pagamento a partir de `inicio` (campo ultimoPagamentoEm; consulta de um campo só). */
function listarDocsComPagamentoDesde(empresaId, inicio) {
  return listar(`empresas/${empresaId}/valores`, { onde: [['ultimoPagamentoEm', '>=', inicio]], limite: 2000 });
}

/**
 * Carrega tudo para a tela do Financeiro.
 * @param {'hoje'|'semana'|'mes'|'ano'} tipoPeriodo
 * @returns {Promise<{periodo, servicos, valores, resumo, serie}>}
 */
export async function carregarFinanceiro(empresaId, tipoPeriodo, referencia = new Date()) {
  const periodo = periodoDe(tipoPeriodo, referencia);
  const [servicos, valores, docsDoPeriodo, docsComPagamento] = await Promise.all([
    listarConcluidosDoPeriodo(empresaId, periodo.inicio, periodo.fim),
    listarValoresDoPeriodo(empresaId, periodo.inicio, periodo.fim),
    listarDocsDoPeriodo(empresaId, periodo.inicio, periodo.fim),
    listarDocsComPagamentoDesde(empresaId, periodo.inicio),
  ]);
  const docs = {};
  for (const d of [...docsDoPeriodo, ...docsComPagamento]) docs[d.id] = { ...lerDocumentoDeValores(d), dataConclusao: d.dataConclusao, tipoNome: d.tipoNome };
  return {
    periodo,
    servicos,
    valores,
    resumo: resumirComPagamentos(servicos, docs, periodo),
    serie: serieDoPeriodo(servicos, valores, tipoPeriodo, referencia),
  };
}

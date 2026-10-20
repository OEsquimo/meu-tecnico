// =============================================================================
// AGENDA — montagem do calendário e agrupamento por dia (funções puras)
// =============================================================================

import { paraISO, diasNoMes } from './datas.js';

/** Cabeçalho do calendário (a semana começa no domingo, como no Brasil). */
export const DIAS_DA_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/**
 * Células do calendário de um mês: começa com espaços vazios até o dia da
 * semana do dia 1. Cada célula: { iso: '2026-10-17', dia: 17 } ou { iso: null } (vazia).
 */
export function gradeDoMes(ano, mesIndice) {
  const primeiro = new Date(ano, mesIndice, 1).getDay(); // 0 = domingo
  const total = diasNoMes(ano, mesIndice);
  const celulas = [];
  for (let i = 0; i < primeiro; i += 1) celulas.push({ iso: null, dia: null });
  for (let d = 1; d <= total; d += 1) celulas.push({ iso: paraISO(new Date(ano, mesIndice, d)), dia: d });
  return celulas;
}

/** Agrupa serviços por dia: { '2026-10-17': [servico, ...] }, ordenados por horário. */
export function agruparPorDia(servicos) {
  const grupos = {};
  for (const s of servicos) {
    const dia = paraISO(s.dataAgendada);
    (grupos[dia] ||= []).push(s);
  }
  for (const lista of Object.values(grupos)) {
    lista.sort((a, b) => a.dataAgendada.getTime() - b.dataAgendada.getTime());
  }
  return grupos;
}

/** Mês anterior/seguinte: devolve { ano, mes } (mes de 0 a 11). */
export function mesVizinho(ano, mes, passo) {
  const d = new Date(ano, mes + passo, 1);
  return { ano: d.getFullYear(), mes: d.getMonth() };
}

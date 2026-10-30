// =============================================================================
// AGENDA — montagem do calendário e agrupamento por dia (funções puras)
// =============================================================================

import { paraISO, diasNoMes } from './datas.js';
import { chaveDoAgendamento, duracaoDoServico, STATUS } from './servicos.js';

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

// -----------------------------------------------------------------------------
// DISPONIBILIDADE DO TÉCNICO
// -----------------------------------------------------------------------------
// Um técnico está LIVRE em [inicio, inicio + duração) quando nenhum outro
// serviço agendado dele ocupa parte desse intervalo. Serviços do próprio
// agendamento que está sendo montado/editado não contam como conflito (o mesmo
// técnico pode fazer vários serviços na mesma visita; as durações se somam).
// -----------------------------------------------------------------------------

const MINUTO = 60000;

/**
 * Fim de uma linha agendada. Usa `ocupacaoMin` (tempo TOTAL do técnico nesta visita,
 * somando os serviços dele) quando existe; senão a duração do próprio serviço.
 */
export function fimDoServico(servico) {
  const total = Number(servico.ocupacaoMin);
  const minutos = Number.isFinite(total) && total > 0 ? Math.max(total, duracaoDoServico(servico)) : duracaoDoServico(servico);
  return new Date(servico.dataAgendada.getTime() + minutos * MINUTO);
}

/** Os dois intervalos [aIni,aFim) e [bIni,bFim) se sobrepõem? (encostar não conta) */
export function intervalosSeSobrepoem(aIni, aFim, bIni, bFim) {
  return aIni.getTime() < bFim.getTime() && bIni.getTime() < aFim.getTime();
}

/**
 * Esse técnico está livre?
 * @param {string} tecnicoUid
 * @param {Date} inicio        começo da visita
 * @param {number} duracaoMin  minutos que ele ficará ocupado nesta visita (soma dos serviços dele)
 * @param {object[]} agendados linhas com status 'agendado' (de qualquer técnico)
 * @param {string|null} ignorarAgendamento chave do agendamento em edição (não conta como conflito)
 */
export function tecnicoEstaLivre(tecnicoUid, inicio, duracaoMin, agendados, ignorarAgendamento = null) {
  const fim = new Date(inicio.getTime() + duracaoMin * MINUTO);
  return !agendados.some((s) => s.status === STATUS.AGENDADO
    && s.tecnicoUid === tecnicoUid
    && s.dataAgendada instanceof Date
    && (!ignorarAgendamento || chaveDoAgendamento(s) !== ignorarAgendamento)
    && intervalosSeSobrepoem(inicio, fim, s.dataAgendada, fimDoServico(s)));
}

/** Filtra a lista de técnicos ({uid,nome}) deixando só os livres. */
export function tecnicosLivres({ tecnicos, agendados, inicio, duracaoMin, ignorarAgendamento = null }) {
  return tecnicos.filter((t) => tecnicoEstaLivre(t.uid, inicio, duracaoMin, agendados, ignorarAgendamento));
}

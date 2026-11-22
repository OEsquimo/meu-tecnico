// =============================================================================
// RETORNOS (lembretes de limpeza e manutenção preventiva) — funções puras
// =============================================================================
// Um "retorno" nasce quando um serviço de um tipo que gera retorno
// (Limpeza, Manutenção preventiva...) é concluído. O técnico escolhe o prazo
// (3, 4, 6 ou 12 meses) e o app calcula o DIA do retorno.
// O retorno aparece na lista "Retornos" a partir de (dia do retorno - dias de aviso).
// =============================================================================

import { somarDias, somarMeses, diasEntre } from './datas.js';
import { GARANTIA_DIAS, PRAZOS_RETORNO_MESES } from '../nucleo/constantes.js';

/** Dia do retorno = dia da conclusão + N meses. */
export function calcularDataRetorno(diaConclusaoISO, meses) {
  if (!PRAZOS_RETORNO_MESES.includes(meses)) {
    throw new Error(`Prazo de retorno inválido: ${meses}`);
  }
  return somarMeses(diaConclusaoISO, meses);
}

/** Fim da garantia legal (90 dias) a partir do dia da conclusão. */
export function calcularGarantiaAte(diaConclusaoISO) {
  return somarDias(diaConclusaoISO, GARANTIA_DIAS);
}

/**
 * Classifica um retorno em relação a hoje:
 *   'vencido' -> o dia do retorno já chegou ou passou
 *   'proximo' -> faltam até "diasAviso" dias (já está em tempo de avisar)
 *   'futuro'  -> ainda não é hora de avisar
 * "dias" é negativo quando está atrasado.
 */
export function classificarRetorno(dataRetornoISO, hojeISO, diasAviso) {
  const dias = diasEntre(hojeISO, dataRetornoISO);
  if (dias <= 0) return { estado: 'vencido', dias };
  if (dias <= diasAviso) return { estado: 'proximo', dias };
  return { estado: 'futuro', dias };
}

/** Último dia que precisa ser consultado no banco para trazer os retornos "em tempo". */
export function limiteConsultaRetornos(hojeISO, diasAviso) {
  return somarDias(hojeISO, diasAviso);
}

/**
 * Separa a lista de serviços com retorno pendente em vencidos e próximos,
 * ordenados do mais antigo para o mais novo. "Futuros" são descartados.
 */
export function separarRetornos(servicos, hojeISO, diasAviso) {
  const vencidos = [];
  const proximos = [];
  for (const s of servicos) {
    if (!s.dataRetorno || s.retornoSituacao !== 'pendente') continue;
    const { estado, dias } = classificarRetorno(s.dataRetorno, hojeISO, diasAviso);
    if (estado === 'vencido') vencidos.push({ ...s, diasParaRetorno: dias });
    else if (estado === 'proximo') proximos.push({ ...s, diasParaRetorno: dias });
  }
  const porData = (a, b) => (a.dataRetorno < b.dataRetorno ? -1 : a.dataRetorno > b.dataRetorno ? 1 : 0);
  vencidos.sort(porData);
  proximos.sort(porData);
  return { vencidos, proximos };
}

/**
 * Novo dia de retorno quando o administrador toca em "Adiar".
 * Conta a partir de hoje se o retorno já estava atrasado.
 */
export function adiarRetorno(dataRetornoISO, hojeISO, dias) {
  const base = dataRetornoISO > hojeISO ? dataRetornoISO : hojeISO;
  return somarDias(base, dias);
}

/** Opções de adiamento mostradas na tela (dias). */
export const OPCOES_ADIAR_DIAS = [7, 15, 30];

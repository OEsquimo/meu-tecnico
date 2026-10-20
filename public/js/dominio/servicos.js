// =============================================================================
// SERVIÇOS — regras do ciclo de vida do serviço (funções puras)
// =============================================================================
// Ciclo: agendado -> concluído (ou cancelado).
// Ao concluir um serviço de tipo que "gera retorno" (limpeza, manutenção
// preventiva...), o app calcula a data do retorno e abre o lembrete.
// Todo serviço concluído ganha garantia legal de 90 dias (CDC art. 26).
// =============================================================================

import { paraISO } from './datas.js';
import { calcularDataRetorno, calcularGarantiaAte } from './retornos.js';

export const STATUS = { AGENDADO: 'agendado', CONCLUIDO: 'concluido', CANCELADO: 'cancelado' };

/** O serviço está agendado e o horário já passou sem ser concluído? */
export function estaAtrasado(servico, agora = new Date()) {
  return servico.status === STATUS.AGENDADO
    && servico.dataAgendada instanceof Date
    && servico.dataAgendada.getTime() < agora.getTime();
}

/** Texto e cor do selo de situação do serviço. */
export function seloDoServico(servico, agora = new Date()) {
  if (servico.status === STATUS.CONCLUIDO) return { texto: 'Concluído', tom: 'verde' };
  if (servico.status === STATUS.CANCELADO) return { texto: 'Cancelado', tom: '' };
  if (estaAtrasado(servico, agora)) return { texto: 'Atrasado', tom: 'vermelho' };
  return { texto: 'Agendado', tom: 'azul' };
}

/**
 * Calcula os campos que dependem da conclusão.
 * @param {object} p
 * @param {boolean} p.geraRetorno   o tipo de serviço gera lembrete de retorno?
 * @param {number|null} p.retornoMeses 3, 4, 6 ou 12 (escolhido pelo usuário)
 * @param {Date} p.concluidoEm      quando foi concluído
 */
export function camposDeConclusao({ geraRetorno, retornoMeses, concluidoEm }) {
  const dia = paraISO(concluidoEm);
  const base = {
    status: STATUS.CONCLUIDO,
    dataConclusao: concluidoEm,
    garantiaAte: calcularGarantiaAte(dia),
  };
  if (geraRetorno && retornoMeses) {
    return {
      ...base,
      retornoMeses,
      dataRetorno: calcularDataRetorno(dia, retornoMeses),
      retornoSituacao: 'pendente',
    };
  }
  return { ...base, retornoMeses: null, dataRetorno: null, retornoSituacao: null };
}

/** Guarda o "resumo do local" que vai dentro do serviço (o técnico não lê a ficha do cliente). */
export function localDoServico(endereco) {
  if (!endereco) return '';
  const rua = [endereco.rua, endereco.numero].filter(Boolean).join(', ');
  return [rua, endereco.complemento, endereco.bairro, [endereco.cidade, endereco.uf].filter(Boolean).join('/')]
    .filter(Boolean)
    .join(' · ');
}

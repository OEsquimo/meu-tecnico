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
import { DURACAO_PADRAO_MIN } from '../nucleo/constantes.js';

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

// -----------------------------------------------------------------------------
// AGENDAMENTO COM VÁRIOS APARELHOS E SERVIÇOS
// -----------------------------------------------------------------------------
// Cada "linha" (documento em servicos/) é UM serviço de UM aparelho. Linhas que
// fazem parte da mesma visita compartilham o mesmo `agendamentoId`. Serviços
// antigos (sem agendamentoId) formam um agendamento de uma linha só.
// Linha "vazia" = agendamento feito só com cliente, dia, hora e técnico (sem
// serviço ainda): tem tipoServicoId '' e tipoServicoNome 'Serviço a definir'.
// -----------------------------------------------------------------------------

export const NOME_SERVICO_A_DEFINIR = 'Serviço a definir';

/** Identificador do agendamento a que a linha pertence (serviços antigos: o próprio id). */
export function chaveDoAgendamento(servico) {
  return servico.agendamentoId || servico.id;
}

/** A linha ainda não tem serviço escolhido (agendamento só com cliente/dia/hora/técnico)? */
export function ehLinhaSemServico(servico) {
  return !servico.tipoServicoId;
}

/** Duração em minutos (serviços antigos, sem duração: o padrão). */
export function duracaoDoServico(servico) {
  const n = Number(servico.duracaoMin);
  return Number.isFinite(n) && n > 0 ? n : DURACAO_PADRAO_MIN;
}

/**
 * Agrupa linhas em agendamentos. Devolve uma lista (ordenada pelo horário) de
 * { chave, linhas, dataAgendada, status, clienteId, clienteNome, observacao }.
 * O status do grupo: "agendado" se alguma linha ainda está agendada; senão
 * "concluido" se alguma foi concluída; senão "cancelado".
 */
export function agruparAgendamentos(linhas) {
  const mapa = new Map();
  for (const l of linhas) {
    const chave = chaveDoAgendamento(l);
    if (!mapa.has(chave)) mapa.set(chave, []);
    mapa.get(chave).push(l);
  }
  const grupos = [];
  for (const [chave, lista] of mapa) {
    lista.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || String(a.aparelhoResumo || '').localeCompare(String(b.aparelhoResumo || '')));
    const status = lista.some((l) => l.status === STATUS.AGENDADO) ? STATUS.AGENDADO
      : lista.some((l) => l.status === STATUS.CONCLUIDO) ? STATUS.CONCLUIDO : STATUS.CANCELADO;
    const primeira = lista[0];
    grupos.push({
      chave, linhas: lista, status,
      dataAgendada: primeira.dataAgendada,
      clienteId: primeira.clienteId, clienteNome: primeira.clienteNome,
      observacao: primeira.obsAgendamento || '',
    });
  }
  grupos.sort((a, b) => (a.dataAgendada?.getTime?.() ?? 0) - (b.dataAgendada?.getTime?.() ?? 0));
  return grupos;
}

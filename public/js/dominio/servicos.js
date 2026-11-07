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

export const MOTIVOS_PENDENCIA = [
  'Faltou peça ou material',
  'O cliente pediu outro dia',
  'Faltou tempo',
];

/** Resumo de uma visita: "2 concluídos · 1 pendente". */
export function resumoDaVisita(linhas) {
  const c = linhas.filter((l) => l.status === STATUS.CONCLUIDO).length;
  const p = linhas.filter((l) => l.status === STATUS.CANCELADO && l.pendente === true).length;
  const partes = [];
  if (c) partes.push(`${c} ${c === 1 ? 'concluído' : 'concluídos'}`);
  if (p) partes.push(`${p} ${p === 1 ? 'pendente' : 'pendentes'}`);
  return partes.join(' · ');
}

/**
 * Linhas que a tela de editar mexe: as ainda agendadas; se não sobrou nenhuma,
 * as canceladas (editar um cancelado com data ou horário novos é o reagendamento).
 * Linhas concluídas nunca entram.
 */
export function linhasEditaveis(linhas) {
  const agendadas = linhas.filter((l) => l.status === STATUS.AGENDADO);
  return agendadas.length > 0 ? agendadas : linhas.filter((l) => l.status === STATUS.CANCELADO);
}

/** O serviço está agendado e o horário já passou sem ser concluído? */
export function estaAtrasado(servico, agora = new Date()) {
  return servico.status === STATUS.AGENDADO
    && servico.dataAgendada instanceof Date
    && servico.dataAgendada.getTime() < agora.getTime();
}

/**
 * Texto e cor do selo de situação (sempre curto, vai no canto do cartão):
 * Concluído (verde), Cancelado (amarelo), Atrasado (vermelho),
 * Reagendado (roxo: era cancelado e ganhou nova data) e Agendado (azul).
 */
export function seloDoServico(servico, agora = new Date()) {
  if (servico.status === STATUS.CONCLUIDO) return { texto: 'Concluído', tom: 'verde' };
  if (servico.status === STATUS.CANCELADO) return { texto: 'Cancelado', tom: 'amarelo' };
  if (estaAtrasado(servico, agora)) return { texto: 'Atrasado', tom: 'vermelho' };
  if (servico.reagendado === true) return { texto: 'Reagendado', tom: 'roxo' };
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

// -----------------------------------------------------------------------------
// TÉCNICOS DO SERVIÇO (um serviço pode ter mais de um técnico)
// -----------------------------------------------------------------------------
// O serviço guarda a lista completa em `tecnicoUids` / `tecnicosNomes` e, para os
// serviços antigos e para as consultas, também o primeiro em `tecnicoUid` / `tecnicoNome`.
// Serviços antigos têm só `tecnicoUid`: as funções abaixo tratam os dois formatos.
// -----------------------------------------------------------------------------

/** Uids dos técnicos do serviço (sem repetir). */
export function tecnicosDoServico(servico) {
  if (Array.isArray(servico.tecnicoUids) && servico.tecnicoUids.length > 0) return [...new Set(servico.tecnicoUids)];
  return servico.tecnicoUid ? [servico.tecnicoUid] : [];
}

/** Nomes dos técnicos do serviço, na mesma ordem de tecnicosDoServico. */
export function nomesDosTecnicos(servico) {
  const uids = tecnicosDoServico(servico);
  if (Array.isArray(servico.tecnicosNomes) && servico.tecnicosNomes.length === uids.length && uids.length > 0) return servico.tecnicosNomes;
  return uids.length === 1 && servico.tecnicoNome ? [servico.tecnicoNome] : uids.map((_, i) => (i === 0 && servico.tecnicoNome) || '');
}

/** Este técnico faz parte do serviço? */
export function servicoTemTecnico(servico, uid) {
  return Boolean(uid) && tecnicosDoServico(servico).includes(uid);
}

/** Campos gravados no serviço a partir da lista [{ uid, nome }]. */
export function camposDosTecnicos(tecnicos) {
  const lista = [];
  for (const t of tecnicos || []) {
    if (t?.uid && !lista.some((x) => x.uid === t.uid)) lista.push({ uid: t.uid, nome: t.nome || '' });
  }
  return {
    tecnicoUid: lista[0]?.uid ?? null,
    tecnicoNome: lista[0]?.nome ?? '',
    tecnicoUids: lista.map((t) => t.uid),
    tecnicosNomes: lista.map((t) => t.nome),
  };
}

/** "Rafael, Marcos" (ou "Rafael e Marcos"). */
export function textoDosTecnicos(servico) {
  const nomes = nomesDosTecnicos(servico).filter(Boolean);
  if (nomes.length <= 1) return nomes[0] || '';
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

/**
 * Divide um valor em centavos igualmente entre `partes` pessoas. Os centavos que sobram
 * vão um a um para as primeiras (ex.: 1000 em 3 -> [334, 333, 333]). A soma é sempre o total.
 */
export function dividirCentavos(totalCentavos, partes) {
  const n = Math.max(1, Math.floor(partes));
  const base = Math.floor(totalCentavos / n);
  const resto = totalCentavos - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0));
}

/** A linha ainda não tem serviço escolhido (agendamento só com cliente/dia/hora/técnico)? */
export function ehLinhaSemServico(servico) {
  return !servico.tipoServicoId;
}

/** Falta informar o aparelho ou o serviço? Então não dá para concluir ainda: antes, "Informar serviço". */
export function precisaInformarAparelhoEServico(servico) {
  return !servico.tipoServicoId || !servico.aparelhoId;
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

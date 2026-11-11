// =============================================================================
// AGENDA — montagem do calendário e agrupamento por dia (funções puras)
// =============================================================================

import { paraISO, diasNoMes } from './datas.js';
import { chaveDoAgendamento, duracaoDoServico, tecnicosDoServico, STATUS } from './servicos.js';
import { horaParaMinutos } from './expediente.js';

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

/** Meia-noite que encerra o dia de `data` (00:00 do dia seguinte). */
function fimDoDia(data) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate() + 1);
}

/** O serviço pode passar do fechamento (hora extra), mas a ocupação vale só até a meia-noite do dia em que ele começa: no dia seguinte o técnico está livre. */
function limitarAoDia(inicio, fim) {
  const limite = fimDoDia(inicio);
  return fim.getTime() > limite.getTime() ? limite : fim;
}

/**
 * Fim de uma linha agendada para um técnico. Usa o tempo TOTAL daquele técnico nesta visita
 * (`ocupacaoPorTecnico[uid]`, a soma dos serviços dele) quando existe; senão `ocupacaoMin`
 * (serviços antigos, um técnico só); senão a duração do próprio serviço.
 */
export function fimDoServico(servico, tecnicoUid = null) {
  const doTecnico = tecnicoUid && servico.ocupacaoPorTecnico ? Number(servico.ocupacaoPorTecnico[tecnicoUid]) : NaN;
  const total = Number.isFinite(doTecnico) && doTecnico > 0 ? doTecnico : Number(servico.ocupacaoMin);
  const minutos = Number.isFinite(total) && total > 0 ? Math.max(total, duracaoDoServico(servico)) : duracaoDoServico(servico);
  return limitarAoDia(servico.dataAgendada, new Date(servico.dataAgendada.getTime() + minutos * MINUTO));
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
export function tecnicoEstaLivre(tecnicoUid, inicio, duracaoMin, agendados, ignorarAgendamento = null, regras = null) {
  return motivoDeIndisponibilidade(tecnicoUid, inicio, duracaoMin, agendados, ignorarAgendamento, regras) === '';
}

/** Serviços AGENDADOS do técnico, sem o agendamento em edição. */
function agendadosDoTecnico(tecnicoUid, agendados, ignorarAgendamento) {
  return agendados.filter((s) => s.status === STATUS.AGENDADO
    && tecnicosDoServico(s).includes(tecnicoUid)
    && s.dataAgendada instanceof Date
    && (!ignorarAgendamento || chaveDoAgendamento(s) !== ignorarAgendamento));
}

/** Serviço de até 4 h não atravessa o almoço; os mais longos (um dia inteiro de instalação) podem, senão nunca caberiam. */
const MAXIMO_QUE_RESPEITA_ALMOCO_MIN = 240;

/**
 * Por que o técnico NÃO está livre: 'ocupado' (outro serviço no horário), 'almoco' (o serviço bateria na pausa de
 * almoço) ou 'limite' (passaria do limite de horas de serviço do dia). '' = livre.
 * `regras`: { almoco: { ativo, de, ate }, limiteMin } (dominio/expediente.js, regrasDaEmpresa); sem `regras`, só vale o horário ocupado.
 */
export function motivoDeIndisponibilidade(tecnicoUid, inicio, duracaoMin, agendados, ignorarAgendamento = null, regras = null) {
  const fim = limitarAoDia(inicio, new Date(inicio.getTime() + duracaoMin * MINUTO));
  const dele = agendadosDoTecnico(tecnicoUid, agendados, ignorarAgendamento);
  if (dele.some((s) => intervalosSeSobrepoem(inicio, fim, s.dataAgendada, fimDoServico(s, tecnicoUid)))) return 'ocupado';
  if (!regras) return '';
  const almoco = regras.almoco;
  if (almoco?.ativo && duracaoMin <= MAXIMO_QUE_RESPEITA_ALMOCO_MIN) {
    const dia = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
    const ini = new Date(dia.getTime() + horaParaMinutos(almoco.de) * MINUTO);
    const ate = new Date(dia.getTime() + horaParaMinutos(almoco.ate) * MINUTO);
    if (intervalosSeSobrepoem(inicio, fim, ini, ate)) return 'almoco';
  }
  if (regras.limiteMin > 0) {
    // Tempo que ele já tem nesse dia, uma vez por visita (as linhas da mesma visita dividem o tempo do técnico).
    const visitas = new Map();
    for (const s of dele) {
      if (s.dataAgendada.toDateString() !== inicio.toDateString()) continue;
      const chave = chaveDoAgendamento(s);
      const minutos = (fimDoServico(s, tecnicoUid).getTime() - s.dataAgendada.getTime()) / MINUTO;
      visitas.set(chave, Math.max(visitas.get(chave) || 0, minutos));
    }
    const jaTem = [...visitas.values()].reduce((t, m) => t + m, 0);
    // Dia sem nada: um serviço maior que o limite ainda pode ser feito (senão nunca caberia).
    if (jaTem > 0 && jaTem + duracaoMin > regras.limiteMin) return 'limite';
  }
  return '';
}

/** Filtra a lista de técnicos ({uid,nome}) deixando só os livres. */
export function tecnicosLivres({ tecnicos, agendados, inicio, duracaoMin, ignorarAgendamento = null, regras = null }) {
  return tecnicos.filter((t) => tecnicoEstaLivre(t.uid, inicio, duracaoMin, agendados, ignorarAgendamento, regras));
}

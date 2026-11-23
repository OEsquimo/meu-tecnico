// =============================================================================
// TEMPO DO SERVIÇO — iniciar, concluir, horários sugeridos e validação (funções puras)
// =============================================================================
// Pacote 27. O técnico toca em "Iniciar serviço" quando chega e em "Concluir" quando termina.
// Se esquecer um dos dois (ou os dois), o app SUGERE os horários e só grava o que a pessoa confirma.
//
// Regras combinadas:
//   * Os horários livres para marcação NÃO dependem de Iniciar/Concluir (só horário marcado + duração).
//   * "Você já começou?" só aparece dentro do tempo previsto; passou do previsto (+ tolerância) é
//     "Serviço esperando concluir". Nunca os dois avisos juntos para o mesmo serviço.
//   * Início sugerido: o horário marcado, ou a hora em que o serviço anterior terminou (a mais tarde);
//     nunca depois da conclusão. Conclusão sugerida: agora, ou início + duração prevista se já passou do prazo.
//   * Serviço com mais de 12 h fica fora das médias; o que não tem horários confirmados também.
// =============================================================================

import { combinarDataHora, paraISO, hojeISO } from './datas.js';
import { fimDoServico } from './agenda.js';
import { STATUS, tecnicosDoServico } from './servicos.js';

const MIN = 60000;

/** Depois do fim previsto, esperar um pouco antes de dizer que o serviço está "esperando concluir" (igual ao aviso de atraso). */
export const TOLERANCIA_ESPERANDO_MIN = 10;
/** "Você já começou?" aparece depois do horário marcado mais esta tolerância. */
export const TOLERANCIA_INICIO_MIN = 10;
/** Serviço com mais tempo que isso fica fora das médias do Desempenho. */
export const LIMITE_MEDIA_MIN = 12 * 60;
/** Serviço mais curto que isso pede confirmação ("Serviço de 3 min. Está certo?"). */
export const DURACAO_MINIMA_MIN = 5;
/** O deslocamento entre dois serviços acima disso não entra na média (passou o dia fora, por exemplo). */
export const DESLOCAMENTO_MAXIMO_MIN = 120;
/** Mínimo de serviços do mesmo tipo para comparar o técnico com a equipe. */
export const MINIMO_PARA_COMPARAR = 3;

export const MOTIVOS_ATRASO = ['Trânsito', 'Serviço demorou mais', 'Falta de peça', 'Cliente atrasou', 'Outro'];
/** "Quanto tempo falta?" no aviso "Ainda estou no serviço": valor guardado, texto e minutos até perguntar de novo. */
export const FALTAS_ATRASO = [
  { valor: '15', rotulo: '15 min', minutos: 15 },
  { valor: '30', rotulo: '30 min', minutos: 30 },
  { valor: '60', rotulo: '1 hora', minutos: 60 },
  { valor: 'mais', rotulo: 'Mais de 1 hora', minutos: 120 },
];

// ---------------------------------------------------------------------------------------------
// Situação de uma visita para o técnico
// ---------------------------------------------------------------------------------------------

/** Linhas ABERTAS (agendadas) da visita que são deste técnico (sem uid: todas as abertas). */
export function linhasAbertas(linhas, uid = null) {
  return linhas.filter((l) => l.status === STATUS.AGENDADO && (!uid || tecnicosDoServico(l).includes(uid)));
}

/** O início informado (o mais antigo entre as linhas abertas que têm início), ou null. */
export function inicioDaVisita(linhas) {
  const inicios = linhas.map((l) => l.iniciadoEm?.getTime?.()).filter((n) => Number.isFinite(n));
  return inicios.length ? new Date(Math.min(...inicios)) : null;
}

/** Fim previsto da visita (o mais tarde entre as linhas). */
export function fimPrevistoDaVisita(linhas, uid = null) {
  const fins = linhas.filter((l) => l.dataAgendada instanceof Date).map((l) => fimDoServico(l, uid).getTime());
  return fins.length ? new Date(Math.max(...fins)) : null;
}

/** O técnico respondeu "Ainda estou no serviço" e o prazo que ele deu (15 min, 30 min...) ainda não acabou? */
export function atrasoInformadoValendo(linhas, agora) {
  return linhas.some((l) => {
    const em = l.atrasoInformadoEm?.getTime?.();
    if (!Number.isFinite(em)) return false;
    const minutos = FALTAS_ATRASO.find((f) => f.valor === l.atrasoFalta)?.minutos ?? 30;
    return agora.getTime() < em + minutos * MIN;
  });
}

/**
 * Em que pé está uma visita aberta, na visão de quem atende:
 *   'em-servico'         tocou em Iniciar (ou disse que ainda está no serviço) e está dentro do prazo
 *   'esperando-concluir' passou do fim previsto (+ tolerância) sem concluir
 *   'perguntar-inicio'   passou do horário marcado (+ tolerância) sem iniciar, ainda dentro do previsto
 *   'agendado'           ainda não chegou a hora
 *   null                 não há linha aberta
 */
export function situacaoDaVisita(linhas, agora = new Date(), uid = null) {
  const abertas = linhasAbertas(linhas, uid);
  if (abertas.length === 0) return null;
  const marcado = abertas.map((l) => l.dataAgendada).filter((d) => d instanceof Date).sort((a, b) => a - b)[0];
  const fim = fimPrevistoDaVisita(abertas, uid);
  const iniciada = inicioDaVisita(abertas) !== null;
  const noPrazo = fim ? agora.getTime() <= fim.getTime() + TOLERANCIA_ESPERANDO_MIN * MIN : true;
  if (!noPrazo) {
    // Passou do previsto: se a pessoa já avisou que ainda está lá, vale o prazo que ela deu.
    if (atrasoInformadoValendo(abertas, agora)) return 'em-servico';
    return 'esperando-concluir';
  }
  if (iniciada) return 'em-servico';
  if (marcado && agora.getTime() >= marcado.getTime() + TOLERANCIA_INICIO_MIN * MIN) return 'perguntar-inicio';
  return 'agendado';
}

// ---------------------------------------------------------------------------------------------
// Horários sugeridos
// ---------------------------------------------------------------------------------------------

/**
 * Início sugerido quando o técnico esqueceu de iniciar:
 *   o horário marcado ou a hora em que o serviço anterior terminou (a mais tarde),
 *   mas nunca depois da conclusão (se passasse, sugere a conclusão menos a duração prevista).
 * Devolve { data: Date, ajustada: boolean } (ajustada = foi preciso recuar para caber antes da conclusão).
 */
export function sugerirInicio({ marcado, fimAnterior = null, conclusao = null, duracaoMin = 60 }) {
  let base = marcado;
  if (fimAnterior && fimAnterior.getTime() > base.getTime()) base = fimAnterior;
  if (conclusao && base.getTime() >= conclusao.getTime()) {
    const recuado = new Date(conclusao.getTime() - Math.max(15, duracaoMin) * MIN);
    // Não recua para antes do serviço anterior terminar, nem para antes da meia-noite do dia.
    const piso = fimAnterior && fimAnterior.getTime() < conclusao.getTime() ? fimAnterior : new Date(conclusao.getFullYear(), conclusao.getMonth(), conclusao.getDate());
    return { data: recuado.getTime() < piso.getTime() ? piso : recuado, ajustada: true };
  }
  return { data: base, ajustada: false };
}

/**
 * Conclusão sugerida: agora; mas se o serviço já passou do prazo (esqueceu de concluir), início + duração prevista
 * (nunca no futuro).
 */
export function sugerirConclusao({ inicio, duracaoMin = 60, agora = new Date(), passouDoPrazo = false }) {
  if (!passouDoPrazo || !inicio) return agora;
  const previsto = new Date(inicio.getTime() + duracaoMin * MIN);
  return previsto.getTime() > agora.getTime() ? agora : previsto;
}

/** Texto "HH:MM" de uma data (para o campo de hora). */
export function horaDeCampo(data) {
  return `${String(data.getHours()).padStart(2, '0')}:${String(data.getMinutes()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------------------------
// Validação dos horários digitados
// ---------------------------------------------------------------------------------------------

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Confere dia, hora de início e hora de conclusão.
 *  * `erros`: bloqueiam (o botão fica apagado): { inicio, conclusao, dia }.
 *  * `confirmacoes`: estranho, mas possível; o app pergunta antes de gravar: [{ codigo, texto }].
 * @param {object} p
 * @param {string} p.diaISO         dia do serviço (conclusão)
 * @param {string} p.inicio         "HH:MM"
 * @param {string} p.conclusao      "HH:MM"
 * @param {Date}   p.agora
 * @param {string} [p.diaMarcadoISO] dia em que o serviço estava marcado (a data não pode ser antes disso)
 * @param {Date|null} [p.fimAnterior] quando o serviço anterior do mesmo técnico terminou
 */
export function validarHorarios({ diaISO, inicio, conclusao, agora = new Date(), diaMarcadoISO = null, fimAnterior = null }) {
  const erros = {};
  const confirmacoes = [];
  const hoje = hojeISO(agora);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(diaISO || '')) erros.dia = 'Informe o dia do serviço.';
  else if (diaISO > hoje) erros.dia = 'Esse dia ainda não chegou.';
  else if (diaMarcadoISO && diaISO < diaMarcadoISO) erros.dia = 'O início precisa ser no dia do serviço ou depois.';
  if (!HORA.test(inicio || '')) erros.inicio = 'Informe a hora de início.';
  if (!HORA.test(conclusao || '')) erros.conclusao = 'Informe a hora de conclusão.';
  if (Object.keys(erros).length > 0) return { valido: false, erros, confirmacoes, inicio: null, conclusao: null };

  const dInicio = combinarDataHora(diaISO, inicio);
  const dConclusao = combinarDataHora(diaISO, conclusao);
  const limite = agora.getTime() + MIN;
  if (dInicio.getTime() > limite) erros.inicio = 'Esse horário ainda não chegou.';
  if (dConclusao.getTime() > limite) erros.conclusao = 'Esse horário ainda não chegou.';
  if (!erros.inicio && !erros.conclusao && dConclusao.getTime() <= dInicio.getTime()) erros.conclusao = 'A conclusão não pode ser antes do início.';
  if (Object.keys(erros).length > 0) return { valido: false, erros, confirmacoes, inicio: dInicio, conclusao: dConclusao };

  const minutos = Math.round((dConclusao.getTime() - dInicio.getTime()) / MIN);
  if (minutos < DURACAO_MINIMA_MIN) confirmacoes.push({ codigo: 'curto', texto: `Serviço de ${minutos} min. Está certo?` });
  if (minutos > LIMITE_MEDIA_MIN) confirmacoes.push({ codigo: 'longo', texto: `Serviço de ${textoDeMinutos(minutos)}. Fica fora da média do Desempenho. Confirmar?` });
  if (fimAnterior && dInicio.getTime() < fimAnterior.getTime() - MIN && paraISO(fimAnterior) === diaISO) {
    confirmacoes.push({ codigo: 'sobrepoe', texto: `O serviço anterior terminou às ${horaDeCampo(fimAnterior)}. O início está certo?` });
  }
  return { valido: true, erros, confirmacoes, inicio: dInicio, conclusao: dConclusao };
}

/** "1h 05", "45 min", "2 h". */
export function textoDeMinutos(minutos) {
  const m = Math.max(0, Math.round(minutos));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} h` : `${h}h ${String(r).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------------------------
// Tempo no cliente de um serviço concluído
// ---------------------------------------------------------------------------------------------

/**
 * Os horários deste serviço concluído foram informados/conferidos? (Pacote 29)
 *   true  = o técnico iniciou o serviço, conferiu ou corrigiu os horários (ou o administrador corrigiu);
 *   false = concluiu aceitando os horários sugeridos sem conferir ("Horário não conferido");
 *   null  = não se aplica (serviço sem horários, anterior a esta função).
 * Serviços concluídos antes do Pacote 29 não têm o campo: valem como conferidos se têm início registrado.
 */
export function horarioConferido(servico) {
  if (servico.horariosConferidos === true) return true;
  if (servico.horariosConferidos === false) return false;
  return servico.iniciadoEm instanceof Date ? true : null;
}

/**
 * Tempo no cliente, em minutos, de um serviço concluído: conclusão menos início. Só vale com início informado,
 * conclusão depois do início e no máximo 12 h (senão null: fica fora das médias).
 */
export function tempoNoCliente(servico) {
  if (servico.status !== STATUS.CONCLUIDO) return null;
  if (horarioConferido(servico) === false) return null; // horário só sugerido: fora das médias
  const ini = servico.iniciadoEm?.getTime?.();
  const fim = servico.dataConclusao?.getTime?.();
  if (!Number.isFinite(ini) || !Number.isFinite(fim) || fim <= ini) return null;
  const minutos = Math.round((fim - ini) / MIN);
  return minutos > LIMITE_MEDIA_MIN ? null : minutos;
}

/**
 * Linhas da MESMA visita são feitas uma depois da outra: o início de cada uma, depois da primeira, é a conclusão da
 * anterior. Devolve a lista com `iniciadoEm` ajustado (e sem horário confirmado quando não dá para saber).
 */
export function sequenciarLinhasDaVisita(linhas) {
  const concluidas = linhas.filter((l) => l.status === STATUS.CONCLUIDO && l.dataConclusao instanceof Date)
    .sort((a, b) => a.dataConclusao - b.dataConclusao);
  let anterior = null;
  return concluidas.map((l) => {
    const inicio = anterior && l.iniciadoEm instanceof Date && anterior.getTime() > l.iniciadoEm.getTime() ? anterior : l.iniciadoEm;
    anterior = l.dataConclusao;
    return { ...l, iniciadoEm: inicio || null };
  });
}

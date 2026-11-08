// =============================================================================
// EXPEDIENTE (horário de funcionamento da empresa) — funções puras
// =============================================================================
// O administrador define, para cada dia da semana, se a empresa atende e em que
// horário. O seletor de dia e hora do agendamento só oferece horários dentro disso.
// Guardado em empresas/{id}.expediente = { seg: { aberto: true, de: '07:00', ate: '18:00' }, ... }
// =============================================================================

import { ehHoraValida, deISO } from './datas.js';

/** Chaves dos dias, na ordem de Date.getDay() (0 = domingo). */
export const DIAS_DA_SEMANA_CHAVES = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
export const ROTULOS_DOS_DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

/** De quanto em quanto tempo começam os horários oferecidos (minutos). */
export const PASSO_AGENDA_MIN = 30;

const HORA_DE_ABRIR = '07:00';
const HORA_DE_FECHAR = '18:00';

/** Padrão: segunda a sábado, das 07:00 às 18:00; domingo fechado. */
export function expedientePadrao() {
  return Object.fromEntries(DIAS_DA_SEMANA_CHAVES.map((chave) => [chave, { aberto: chave !== 'dom', de: HORA_DE_ABRIR, ate: HORA_DE_FECHAR }]));
}

/** "07:30" -> 450 (minutos desde meia-noite). */
export function horaParaMinutos(hora) {
  const [h, m] = String(hora).split(':').map(Number);
  return h * 60 + m;
}

/** 450 -> "07:30". */
export function minutosParaHora(minutos) {
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
}

/** Expediente da empresa, completando com o padrão o que faltar (empresa antiga, sem expediente salvo). */
export function expedienteDaEmpresa(empresa) {
  const padrao = expedientePadrao();
  const salvo = empresa?.expediente;
  if (!salvo || typeof salvo !== 'object') return padrao;
  const resultado = {};
  for (const chave of DIAS_DA_SEMANA_CHAVES) {
    const d = salvo[chave];
    const valido = d && typeof d.aberto === 'boolean' && ehHoraValida(d.de) && ehHoraValida(d.ate);
    resultado[chave] = valido ? { aberto: d.aberto, de: d.de, ate: d.ate } : padrao[chave];
  }
  return resultado;
}

/** Funcionamento de um dia "AAAA-MM-DD": { aberto, de, ate }. */
export function expedienteDoDia(expediente, iso) {
  return expediente[DIAS_DA_SEMANA_CHAVES[deISO(iso).getDay()]];
}

/**
 * Horários de início oferecidos num dia: do abrir até o fechar, de 30 em 30 minutos,
 * só os que terminam até a hora de fechar (considerando a duração do serviço).
 */
export function horariosDoDia(expediente, iso, duracaoMin) {
  const dia = expedienteDoDia(expediente, iso);
  if (!dia?.aberto) return [];
  const fim = horaParaMinutos(dia.ate);
  const horarios = [];
  for (let inicio = horaParaMinutos(dia.de); inicio + duracaoMin <= fim; inicio += PASSO_AGENDA_MIN) horarios.push(minutosParaHora(inicio));
  return horarios;
}

/**
 * Confere o que o administrador preencheu. `entrada`: { seg: { aberto, de, ate }, ... }.
 * Devolve { valido, erros, dados }. Erros por campo: "seg-de", "seg-ate" e "geral".
 */
export function validarExpediente(entrada) {
  const erros = {};
  const dados = {};
  let algumAberto = false;
  for (const chave of DIAS_DA_SEMANA_CHAVES) {
    const d = entrada?.[chave] || {};
    const aberto = d.aberto === true;
    const de = String(d.de ?? '').trim();
    const ate = String(d.ate ?? '').trim();
    dados[chave] = { aberto, de, ate };
    if (!aberto) continue; // dia fechado: o horário não importa
    algumAberto = true;
    if (!ehHoraValida(de)) { erros[`${chave}-de`] = 'Informe a hora de abrir.'; continue; }
    if (!ehHoraValida(ate)) { erros[`${chave}-ate`] = 'Informe a hora de fechar.'; continue; }
    if (horaParaMinutos(ate) - horaParaMinutos(de) < PASSO_AGENDA_MIN) erros[`${chave}-ate`] = 'Feche pelo menos 30 minutos depois de abrir.';
  }
  if (!algumAberto) erros.geral = 'Deixe pelo menos um dia aberto.';
  // Dia fechado guarda um horário válido (padrão), para a tela sempre ter o que mostrar ao reabrir.
  for (const chave of DIAS_DA_SEMANA_CHAVES) {
    const d = dados[chave];
    if (!d.aberto && (!ehHoraValida(d.de) || !ehHoraValida(d.ate))) { d.de = HORA_DE_ABRIR; d.ate = HORA_DE_FECHAR; }
  }
  return { valido: Object.keys(erros).length === 0, erros, dados };
}

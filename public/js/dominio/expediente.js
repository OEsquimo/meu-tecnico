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
 * Horários de início oferecidos num dia: do abrir até 30 minutos antes de fechar, de 30 em 30 minutos.
 * O serviço pode terminar depois do fechamento (hora extra): ele não fica "pela metade" só porque
 * passou da hora. Por isso a duração do serviço NÃO limita o horário de início.
 */
export function horariosDoDia(expediente, iso) {
  const dia = expedienteDoDia(expediente, iso);
  if (!dia?.aberto) return [];
  const fim = horaParaMinutos(dia.ate);
  const horarios = [];
  for (let inicio = horaParaMinutos(dia.de); inicio + PASSO_AGENDA_MIN <= fim; inicio += PASSO_AGENDA_MIN) horarios.push(minutosParaHora(inicio));
  return horarios;
}

/**
 * Esse horário de início passa do fechamento (hora extra)? Devolve o texto do fim ("20:00", ou
 * "depois da meia-noite" quando o serviço passa de 24h) ou null quando termina dentro do expediente.
 */
export function fimDepoisDoExpediente(expediente, iso, hora, duracaoMin) {
  const dia = expedienteDoDia(expediente, iso);
  if (!dia?.aberto || !hora) return null;
  const fim = horaParaMinutos(hora) + Number(duracaoMin);
  if (fim <= horaParaMinutos(dia.ate)) return null;
  return fim >= 24 * 60 ? 'depois da meia-noite' : minutosParaHora(fim);
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

// -----------------------------------------------------------------------------
// REGRAS DE TRABALHO DO TÉCNICO (pausa de almoço e limite de horas por dia)
// -----------------------------------------------------------------------------
// Valem para todos os técnicos da empresa. Guardadas em empresas/{id}:
//   almoco: { ativo: true, de: '12:00', ate: '13:00' }   e   limiteHorasDia: 8 (0 = sem limite)
// -----------------------------------------------------------------------------

export const LIMITE_HORAS_PADRAO = 8;
export const LIMITE_HORAS_MAXIMO = 24;

/** Padrão: almoço das 12:00 às 13:00 e 8 horas de serviço por técnico por dia. */
export function regrasDeTrabalhoPadrao() {
  return { almoco: { ativo: true, de: '12:00', ate: '13:00' }, limiteMin: LIMITE_HORAS_PADRAO * 60 };
}

/** Regras da empresa, completando com o padrão o que faltar. `limiteMin` 0 = sem limite. */
export function regrasDaEmpresa(empresa) {
  const padrao = regrasDeTrabalhoPadrao();
  const a = empresa?.almoco;
  const almocoValido = a && typeof a.ativo === 'boolean' && ehHoraValida(a.de) && ehHoraValida(a.ate) && horaParaMinutos(a.ate) > horaParaMinutos(a.de);
  const horas = Number(empresa?.limiteHorasDia);
  const limiteValido = empresa && empresa.limiteHorasDia !== undefined && empresa.limiteHorasDia !== null && Number.isFinite(horas) && horas >= 0 && horas <= LIMITE_HORAS_MAXIMO;
  return {
    almoco: almocoValido ? { ativo: a.ativo, de: a.de, ate: a.ate } : padrao.almoco,
    limiteMin: limiteValido ? Math.round(horas * 60) : padrao.limiteMin,
  };
}

/**
 * Confere o que o administrador preencheu. `entrada`: { almocoAtivo, de, ate, limiteHoras }.
 * Devolve { valido, erros, dados } com dados no formato guardado: { almoco, limiteHorasDia }.
 */
export function validarRegrasDeTrabalho(entrada) {
  const erros = {};
  const ativo = entrada?.almocoAtivo === true;
  const de = String(entrada?.de ?? '').trim();
  const ate = String(entrada?.ate ?? '').trim();
  const texto = String(entrada?.limiteHoras ?? '').trim().replace(',', '.');
  if (ativo) {
    if (!ehHoraValida(de)) erros['almoco-de'] = 'Informe a hora em que o almoço começa.';
    else if (!ehHoraValida(ate)) erros['almoco-ate'] = 'Informe a hora em que o almoço termina.';
    else if (horaParaMinutos(ate) <= horaParaMinutos(de)) erros['almoco-ate'] = 'O almoço precisa terminar depois de começar.';
  }
  const horas = texto === '' ? 0 : Number(texto);
  if (!Number.isFinite(horas) || horas < 0 || horas > LIMITE_HORAS_MAXIMO) erros.limiteHoras = `Informe de 0 a ${LIMITE_HORAS_MAXIMO} horas (0 = sem limite).`;
  const padrao = regrasDeTrabalhoPadrao().almoco;
  const dadosAlmoco = ativo || (ehHoraValida(de) && ehHoraValida(ate) && horaParaMinutos(ate) > horaParaMinutos(de)) ? { ativo, de, ate } : { ativo: false, de: padrao.de, ate: padrao.ate };
  return { valido: Object.keys(erros).length === 0, erros, dados: { almoco: dadosAlmoco, limiteHorasDia: Math.round(horas * 100) / 100 } };
}

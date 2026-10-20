// =============================================================================
// DATAS — funções puras (não dependem de tela nem de Firebase)
// =============================================================================
// Convenções do projeto:
//   * "Dia" (sem hora) é guardado como TEXTO "AAAA-MM-DD" (ex.: "2026-10-17").
//     Isso evita o clássico erro de fuso horário que "pula" um dia.
//   * "Momento" (com hora) é um objeto Date (no banco vira Timestamp).
//   * Todas as contas usam o fuso do aparelho do usuário (Brasil: -03:00).
// =============================================================================

const NOMES_MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
const NOMES_DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

const doisDigitos = (n) => String(n).padStart(2, '0');

/** Converte um Date em "AAAA-MM-DD" usando o fuso local. */
export function paraISO(data) {
  return `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}`;
}

/** Dia de hoje em "AAAA-MM-DD". O parâmetro permite testar com uma data fixa. */
export function hojeISO(agora = new Date()) {
  return paraISO(agora);
}

/** Verifica se o texto é um dia válido no formato "AAAA-MM-DD" (rejeita 2026-02-31). */
export function ehISOValido(texto) {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [a, m, d] = texto.split('-').map(Number);
  const data = new Date(a, m - 1, d);
  return data.getFullYear() === a && data.getMonth() === m - 1 && data.getDate() === d;
}

/** Converte "AAAA-MM-DD" em Date local à meia-noite. */
export function deISO(iso) {
  if (!ehISOValido(iso)) throw new Error(`Data inválida: ${iso}`);
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
}

/** Soma (ou subtrai) dias a um dia "AAAA-MM-DD". */
export function somarDias(iso, dias) {
  const data = deISO(iso);
  data.setDate(data.getDate() + dias);
  return paraISO(data);
}

/**
 * Soma meses a um dia "AAAA-MM-DD" sem "estourar" o mês.
 * Ex.: 31/01 + 1 mês = 28/02 (ou 29/02 em ano bissexto), nunca 03/03.
 */
export function somarMeses(iso, meses) {
  const [a, m, d] = iso.split('-').map(Number);
  const alvo = new Date(a, m - 1 + meses, 1);
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(d, ultimoDia));
  return paraISO(alvo);
}

/** Quantos dias de "isoA" até "isoB" (positivo se B é depois de A). */
export function diasEntre(isoA, isoB) {
  const ms = deISO(isoB).getTime() - deISO(isoA).getTime();
  return Math.round(ms / 86400000);
}

/** Início do dia (00:00:00.000) de um Date. */
export function inicioDoDia(data) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate(), 0, 0, 0, 0);
}

/** Início do dia seguinte — usado como limite "exclusivo" em consultas de período. */
export function inicioDoDiaSeguinte(data) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate() + 1, 0, 0, 0, 0);
}

/** Segunda-feira da semana de uma data (a semana vai de segunda a domingo). */
export function inicioDaSemana(data) {
  const base = inicioDoDia(data);
  const diaSemana = base.getDay(); // 0 = domingo
  const voltar = diaSemana === 0 ? 6 : diaSemana - 1;
  base.setDate(base.getDate() - voltar);
  return base;
}

export function inicioDoMes(data) {
  return new Date(data.getFullYear(), data.getMonth(), 1);
}

export function inicioDoAno(data) {
  return new Date(data.getFullYear(), 0, 1);
}

/** Junta um dia "AAAA-MM-DD" e uma hora "HH:MM" em um Date local. */
export function combinarDataHora(iso, hora) {
  const base = deISO(iso);
  const [h, min] = (hora || '00:00').split(':').map(Number);
  base.setHours(h || 0, min || 0, 0, 0);
  return base;
}

/** Verifica "HH:MM" válido (00:00 a 23:59). */
export function ehHoraValida(texto) {
  return typeof texto === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(texto);
}

/** Formata o dia como "17/10/2026". Aceita "AAAA-MM-DD" ou Date. */
export function formatarDataBR(valor) {
  if (!valor) return '';
  const iso = typeof valor === 'string' ? valor : paraISO(valor);
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

/** Formata a hora como "14:30". */
export function formatarHora(data) {
  return `${doisDigitos(data.getHours())}:${doisDigitos(data.getMinutes())}`;
}

/** "17/10/2026 às 14:30". */
export function formatarDataHoraBR(data) {
  return `${formatarDataBR(data)} às ${formatarHora(data)}`;
}

/** "Sábado, 17 de outubro". */
export function formatarDiaExtenso(valor) {
  const data = typeof valor === 'string' ? deISO(valor) : valor;
  const nome = NOMES_DIAS[data.getDay()];
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}, ${data.getDate()} de ${NOMES_MESES[data.getMonth()]}`;
}

/** "Outubro de 2026" (cabeçalho do calendário). */
export function formatarMesAno(ano, mesIndice) {
  const nome = NOMES_MESES[mesIndice];
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} de ${ano}`;
}

/** Converte "dd/mm/aaaa" digitado em "AAAA-MM-DD" (ou null se inválido). */
export function deDataBRParaISO(texto) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((texto || '').trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  return ehISOValido(iso) ? iso : null;
}

/** Quantos dias tem o mês (mesIndice 0 a 11). */
export function diasNoMes(ano, mesIndice) {
  return new Date(ano, mesIndice + 1, 0).getDate();
}

/** Texto curto "há 3 dias" / "hoje" / "ontem" a partir de dois dias ISO. */
export function textoRelativo(isoDia, hoje) {
  const d = diasEntre(isoDia, hoje);
  if (d === 0) return 'hoje';
  if (d === 1) return 'ontem';
  if (d === -1) return 'amanhã';
  if (d > 1) return `há ${d} dias`;
  return `em ${-d} dias`;
}

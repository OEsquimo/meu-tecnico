// =============================================================================
// TELEFONE / WHATSAPP — funções puras
// =============================================================================

/** Mantém só os números de um texto. */
export function somenteDigitos(texto) {
  return String(texto ?? '').replace(/\D/g, '');
}

/**
 * Valida e normaliza um telefone brasileiro para o formato internacional do
 * WhatsApp, sem "+": 55 + DDD + número. Retorna null se for inválido.
 *   "(11) 91234-5678"  -> "5511912345678"
 *   "11 3456-7890"     -> "551134567890"
 *   "+55 11 91234-5678" -> "5511912345678"
 */
export function normalizarWhatsappBR(texto) {
  let d = somenteDigitos(texto);
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  const numero = d.slice(2);
  // Celular (9 dígitos) começa com 9; fixo (8 dígitos) começa de 2 a 5.
  if (numero.length === 9 && numero[0] !== '9') return null;
  if (numero.length === 8 && !/[2-5]/.test(numero[0])) return null;
  return `55${d}`;
}

/** Mostra "(11) 91234-5678" a partir de qualquer texto/dígitos válidos. */
export function formatarTelefone(texto) {
  let d = somenteDigitos(texto);
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(texto ?? '');
}

/** Máscara para digitação: vai formatando enquanto a pessoa digita. */
export function mascararTelefoneDigitando(texto) {
  const d = somenteDigitos(texto).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// =============================================================================
// DINHEIRO — funções puras
// =============================================================================
// REGRA DE OURO: dinheiro é SEMPRE guardado em CENTAVOS (número inteiro).
// Nunca guardamos 150.50; guardamos 15050. Isso evita erros de arredondamento
// do JavaScript (0,1 + 0,2 = 0,30000000000000004).
// =============================================================================

/**
 * Converte o que o usuário digitou ("150", "150,5", "1.234,56", "R$ 80") em
 * centavos inteiros. Retorna null quando o texto não é um valor válido.
 */
export function reaisParaCentavos(texto) {
  if (typeof texto === 'number') {
    return Number.isFinite(texto) && texto >= 0 ? Math.round(texto * 100) : null;
  }
  if (typeof texto !== 'string') return null;
  let limpo = texto.replace(/R\$/gi, '').replace(/\s/g, '');
  if (limpo === '') return null;
  // Formato brasileiro: ponto separa milhar e vírgula separa centavos.
  if (limpo.includes(',')) {
    limpo = limpo.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) {
    // "1.234" sem vírgula = mil duzentos e trinta e quatro (não 1,234)
    limpo = limpo.replace(/\./g, '');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;
  const valor = Math.round(parseFloat(limpo) * 100);
  return Number.isSafeInteger(valor) ? valor : null;
}

/** Formata centavos como "R$ 1.234,56". */
export function formatarReais(centavos) {
  const n = Number.isFinite(centavos) ? centavos : 0;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n / 100);
}

/** Centavos como texto editável ("1234,56") para preencher um campo. */
export function centavosParaCampo(centavos) {
  if (!Number.isFinite(centavos)) return '';
  return (centavos / 100).toFixed(2).replace('.', ',');
}

/** Soma uma lista de centavos de forma segura. */
export function somarCentavos(lista) {
  return lista.reduce((total, n) => total + (Number.isFinite(n) ? n : 0), 0);
}

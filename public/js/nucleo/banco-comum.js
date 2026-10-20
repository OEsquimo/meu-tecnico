// =============================================================================
// BANCO-COMUM — peças compartilhadas pelos "adaptadores" de banco de dados
// =============================================================================
// O app não fala direto com o Firestore: ele usa a camada "banco.js", que usa um
// ADAPTADOR. Existem dois adaptadores com o MESMO formato:
//   * adaptador-firestore.js -> o banco de verdade (Firebase), usado em produção;
//   * adaptador-memoria.js   -> banco falso na memória, usado em testes e no
//                               "modo demonstração" (?demo=1).
// Vantagem: dá para testar todas as telas sem internet e sem Firebase.
// Este arquivo NÃO importa nenhum outro.
// =============================================================================

/**
 * Valor especial "agora, pelo relógio do servidor". Use ao gravar datas de
 * criação/atualização. No Firestore vira serverTimestamp().
 */
export const AGORA = Object.freeze({ __valorEspecial: 'agora' });

export function ehAgora(valor) {
  return valor === AGORA;
}

/** Gera um identificador aleatório (20 letras/números), parecido com os do Firestore. */
export function gerarId(tamanho = 20) {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(tamanho);
  globalThis.crypto.getRandomValues(bytes);
  let id = '';
  for (const b of bytes) id += alfabeto[b % alfabeto.length];
  return id;
}

/** "empresas/abc/clientes" -> ['empresas','abc','clientes'] */
export function segmentos(caminho) {
  return String(caminho).split('/').filter(Boolean);
}

/** Verdadeiro para objetos "simples" ({}), falso para Date, Timestamp, null etc. */
export function ehObjetoSimples(valor) {
  if (valor === null || typeof valor !== 'object') return false;
  const proto = Object.getPrototypeOf(valor);
  return proto === Object.prototype || proto === null;
}

/** Copia profunda que entende Date (structuredClone também entende, mas isto é explícito). */
export function clonar(valor) {
  if (valor instanceof Date) return new Date(valor.getTime());
  if (Array.isArray(valor)) return valor.map(clonar);
  if (ehObjetoSimples(valor)) {
    const copia = {};
    for (const [k, v] of Object.entries(valor)) copia[k] = clonar(v);
    return copia;
  }
  return valor;
}

/** Operadores de comparação aceitos nas consultas (iguais aos do Firestore). */
export const OPERADORES = ['==', '!=', '<', '<=', '>', '>=', 'in', 'array-contains'];

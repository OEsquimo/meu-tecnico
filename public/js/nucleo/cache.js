// =============================================================================
// CACHE DA SESSÃO — guarda listas já carregadas por alguns minutos
// =============================================================================
// Por quê? O plano grátis do Firebase tem um limite diário de leituras. Sem
// cache, abrir "Clientes" várias vezes lê todos os clientes várias vezes.
// Com cache, lê uma vez e reaproveita por VALIDADE_CACHE_MS.
// Toda gravação chama invalidarCache() para a próxima leitura vir atualizada.
// =============================================================================

import { VALIDADE_CACHE_MS } from './constantes.js';

const guardados = new Map(); // chave -> { quando, valor }
const emVoo = new Map(); // chave -> promessa (evita pedir o mesmo dado 2x ao mesmo tempo)

/**
 * Devolve o valor do cache ou chama "produtor" para buscá-lo.
 * @param {string} chave  ex.: 'abc:clientes'
 * @param {() => Promise<any>} produtor função que busca no banco
 * @param {number} validadeMs quanto tempo vale (padrão: 2 minutos)
 */
export async function comCache(chave, produtor, validadeMs = VALIDADE_CACHE_MS) {
  const item = guardados.get(chave);
  if (item && Date.now() - item.quando < validadeMs) return item.valor;
  if (emVoo.has(chave)) return emVoo.get(chave);
  const promessa = (async () => {
    try {
      const valor = await produtor();
      guardados.set(chave, { quando: Date.now(), valor });
      return valor;
    } finally {
      emVoo.delete(chave);
    }
  })();
  emVoo.set(chave, promessa);
  return promessa;
}

/** Apaga do cache tudo que começa com o prefixo (ou tudo, se não passar prefixo). */
export function invalidarCache(prefixo = '') {
  for (const chave of [...guardados.keys()]) {
    if (chave.startsWith(prefixo)) guardados.delete(chave);
  }
}

export function limparCache() {
  guardados.clear();
  emVoo.clear();
}

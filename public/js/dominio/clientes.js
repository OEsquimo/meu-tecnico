// =============================================================================
// CLIENTES — busca e ordenação (funções puras)
// =============================================================================

import { textoParaBusca } from '../nucleo/ui-texto.js';
import { somenteDigitos } from './telefone.js';

export function ordenarPorNome(lista) {
  return [...lista].sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR', { sensitivity: 'base' }));
}

/** Procura por nome, telefone (só números) e rua/bairro. Sem termo, devolve tudo. */
export function filtrarClientes(lista, termo) {
  const t = textoParaBusca(termo);
  if (!t) return lista;
  const digitos = somenteDigitos(termo);
  return lista.filter((c) => {
    if (textoParaBusca(c.nome).includes(t)) return true;
    if (digitos.length >= 3 && somenteDigitos(c.whatsapp).includes(digitos)) return true;
    return (c.enderecos || []).some((e) =>
      textoParaBusca(`${e.rua} ${e.bairro} ${e.cidade}`).includes(t));
  });
}

/** Procura o endereço de um cliente pelo id (ou o primeiro, se não achar). */
export function enderecoDoCliente(cliente, enderecoId) {
  const lista = cliente?.enderecos || [];
  return lista.find((e) => e.id === enderecoId) || lista[0] || null;
}

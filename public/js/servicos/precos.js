// =============================================================================
// PREÇOS PADRÃO DOS TIPOS DE SERVIÇO — empresas/{id}/precos/{tipoId}
// =============================================================================
// Ficam numa coleção À PARTE de tiposServico porque todo técnico lê os tipos, mas
// o preço só é lido pelo administrador e pelos técnicos que ele liberou.
// Guardado em centavos. Sem documento = tipo sem preço padrão.
// =============================================================================

import { listar, gravar, operacao as op, AGORA } from '../nucleo/banco.js';
import { comCache, invalidarCache } from '../nucleo/cache.js';

const caminho = (empresaId) => `empresas/${empresaId}/precos`;

/** { tipoId: centavos } de todos os tipos que têm preço padrão. */
export function listarPrecos(empresaId) {
  return comCache(`${empresaId}:precos`, async () => {
    const lista = await listar(caminho(empresaId));
    return Object.fromEntries(lista.filter((p) => Number.isInteger(p.valorCentavos)).map((p) => [p.id, p.valorCentavos]));
  });
}

/** Define o preço padrão do tipo (centavos) ou remove (null). */
export async function definirPreco(empresaId, tipoId, centavos) {
  const ref = `${caminho(empresaId)}/${tipoId}`;
  await gravar([centavos === null || centavos === undefined
    ? op.apagar(ref)
    : op.definir(ref, { valorCentavos: centavos, atualizadoEm: AGORA })]);
  invalidarCache(`${empresaId}:precos`);
}

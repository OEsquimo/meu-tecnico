// =============================================================================
// APARELHOS — acesso a dados (CRUD)
// =============================================================================
// Cada aparelho pertence a um cliente (e a um dos endereços dele). Aparelho não
// tem telefone nem endereço digitado: por isso o técnico pode ler e cadastrar
// aparelhos mesmo sem poder ver a ficha do cliente.
// =============================================================================

import { ler, listar, gravar, operacao as op, novoId, AGORA } from '../nucleo/banco.js';
import { invalidarCache, comCache } from '../nucleo/cache.js';
import { resumoDoAparelho } from '../dominio/aparelhos.js';
import { ErroApp } from '../nucleo/erros.js';

const caminho = (empresaId) => `empresas/${empresaId}/aparelhos`;

/** Aparelhos de um cliente, ordenados pelo resumo (nome/tipo). */
export function listarAparelhosDoCliente(empresaId, clienteId) {
  return comCache(`${empresaId}:aparelhos:${clienteId}`, async () => {
    const lista = await listar(caminho(empresaId), { onde: [['clienteId', '==', clienteId]] });
    // Aparelho excluído que já teve serviço fica guardado (ativo: false), só some da lista.
    return lista.filter((a) => a.ativo !== false).sort((a, b) => resumoDoAparelho(a).localeCompare(resumoDoAparelho(b), 'pt-BR'));
  });
}

export function buscarAparelho(empresaId, id) {
  return ler(`${caminho(empresaId)}/${id}`);
}

/** Cria o aparelho e devolve o id. dados: { tipo, btus, nome, descricao, enderecoId } */
export async function criarAparelho(empresaId, clienteId, dados) {
  const id = novoId(caminho(empresaId));
  await gravar([op.criar(`${caminho(empresaId)}/${id}`, {
    clienteId,
    enderecoId: dados.enderecoId ?? null,
    tipo: dados.tipo,
    btus: dados.btus ?? null,
    nome: dados.nome ?? '',
    descricao: dados.descricao ?? '',
    ativo: true,
    criadoEm: AGORA,
    atualizadoEm: AGORA,
  })]);
  invalidarCache(`${empresaId}:aparelhos:${clienteId}`);
  return id;
}

export async function atualizarAparelho(empresaId, aparelho, dados) {
  await gravar([op.atualizar(`${caminho(empresaId)}/${aparelho.id}`, {
    enderecoId: dados.enderecoId ?? null,
    tipo: dados.tipo,
    btus: dados.btus ?? null,
    nome: dados.nome ?? '',
    descricao: dados.descricao ?? '',
    atualizadoEm: AGORA,
  })]);
  invalidarCache(`${empresaId}:aparelhos:${aparelho.clienteId}`);
}

/**
 * Exclui o aparelho. Só administrador.
 *  - Aparelho com agendamento aberto: recusa (cancele ou exclua o agendamento antes).
 *  - Aparelho que já teve serviço: some da lista, mas fica guardado (ativo: false) para o histórico.
 *  - Aparelho sem nenhum serviço: apaga de verdade.
 * @returns {Promise<'apagado'|'arquivado'>}
 */
export async function excluirAparelho(empresaId, aparelho) {
  const servicos = await listar(`empresas/${empresaId}/servicos`, { onde: [['aparelhoId', '==', aparelho.id]] });
  if (servicos.some((s) => s.status === 'agendado')) {
    throw new ErroApp('Este aparelho tem agendamento aberto. Cancele ou exclua o agendamento antes de excluir o aparelho.', 'aparelho-em-uso');
  }
  let resultado = 'apagado';
  if (servicos.length > 0) {
    await gravar([op.atualizar(`${caminho(empresaId)}/${aparelho.id}`, { ativo: false, atualizadoEm: AGORA })]);
    resultado = 'arquivado';
  } else {
    await gravar([op.apagar(`${caminho(empresaId)}/${aparelho.id}`)]);
  }
  invalidarCache(`${empresaId}:aparelhos:${aparelho.clienteId}`);
  return resultado;
}

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

const caminho = (empresaId) => `empresas/${empresaId}/aparelhos`;

/** Aparelhos de um cliente, ordenados pelo resumo (nome/tipo). */
export function listarAparelhosDoCliente(empresaId, clienteId) {
  return comCache(`${empresaId}:aparelhos:${clienteId}`, async () => {
    const lista = await listar(caminho(empresaId), { onde: [['clienteId', '==', clienteId]] });
    return lista.sort((a, b) => resumoDoAparelho(a).localeCompare(resumoDoAparelho(b), 'pt-BR'));
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

/** Exclui o aparelho. Os serviços antigos continuam com o resumo dele guardado. Só administrador. */
export async function excluirAparelho(empresaId, aparelho) {
  await gravar([op.apagar(`${caminho(empresaId)}/${aparelho.id}`)]);
  invalidarCache(`${empresaId}:aparelhos:${aparelho.clienteId}`);
}

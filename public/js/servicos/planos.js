// =============================================================================
// PLANOS E PAINEL DO DONO — dados que só o dono do aplicativo altera
// =============================================================================
// Estas funções só funcionam para quem tem o documento donosApp/{uid} (criado
// por você no console do Firebase). Para qualquer outra pessoa, as regras do
// Firestore recusam a gravação.
// =============================================================================

import { listar, ler, gravar, operacao as op, AGORA } from '../nucleo/banco.js';
import { PLANOS_PADRAO, REGRAS_PADRAO } from '../nucleo/constantes.js';

export async function listarPlanos() {
  const lista = await listar('planos');
  return lista.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
}

export function lerRegras() {
  return ler('config/regras');
}

/** Cria/atualiza um plano. dados: { nome, precoCentavos, limiteClientes, financeiroCompleto, ativo, descricao, ordem } */
export async function salvarPlano(id, dados) {
  await gravar([op.definir(`planos/${id}`, {
    nome: dados.nome,
    precoCentavos: dados.precoCentavos,
    limiteClientes: dados.limiteClientes,
    financeiroCompleto: dados.financeiroCompleto,
    ativo: dados.ativo,
    ordem: dados.ordem ?? 99,
    descricao: dados.descricao ?? '',
    atualizadoEm: AGORA,
  })]);
}

export async function excluirPlano(id) {
  await gravar([op.apagar(`planos/${id}`)]);
}

/** Salva as regras globais (dias de teste, desconto de lançamento, contato de vendas). */
export async function salvarRegras(dados) {
  await gravar([op.definir('config/regras', {
    diasTeste: dados.diasTeste,
    descontoLancamentoAtivo: dados.descontoLancamentoAtivo,
    descontoLancamentoPercentual: dados.descontoLancamentoPercentual,
    whatsappVendas: dados.whatsappVendas ?? '',
    instrucoesPagamento: dados.instrucoesPagamento ?? '',
    atualizadoEm: AGORA,
  })]);
}

/** Primeiro uso do painel: cria os planos e as regras padrão. */
export async function criarPlanosEregrasPadrao() {
  const operacoes = PLANOS_PADRAO.map((p) => op.definir(`planos/${p.id}`, {
    nome: p.nome,
    precoCentavos: p.precoCentavos,
    limiteClientes: p.limiteClientes,
    financeiroCompleto: p.financeiroCompleto,
    ativo: p.ativo,
    ordem: p.ordem,
    descricao: p.descricao,
    atualizadoEm: AGORA,
  }));
  operacoes.push(op.definir('config/regras', {
    ...REGRAS_PADRAO, whatsappVendas: '', instrucoesPagamento: '', atualizadoEm: AGORA,
  }));
  await gravar(operacoes);
}

/** Todas as empresas (só dono do app). Dados da conta, nunca clientes. */
export async function listarEmpresas() {
  const lista = await listar('empresas');
  return lista.sort((a, b) => (b.criadoEm?.getTime() ?? 0) - (a.criadoEm?.getTime() ?? 0));
}

/**
 * Muda plano/validade/teste/bloqueio de uma empresa.
 * campos: qualquer combinação de { planoId, planoAte, testeEstendidoAte, bloqueada }
 */
export async function atualizarContaDaEmpresa(empresaId, campos) {
  await gravar([op.atualizar(`empresas/${empresaId}`, campos)]);
}

/** Renova o plano: soma "dias" à validade atual (ou a partir de hoje, se já venceu). */
export function novaValidade(planoAteAtual, dias = 30, agora = new Date()) {
  const base = planoAteAtual instanceof Date && planoAteAtual.getTime() > agora.getTime() ? planoAteAtual : agora;
  return new Date(base.getTime() + dias * 86400000);
}

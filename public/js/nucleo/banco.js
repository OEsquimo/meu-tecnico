// =============================================================================
// BANCO — a única porta de acesso ao banco de dados para o resto do app
// =============================================================================
// Todas as telas e serviços chamam as funções daqui. Elas:
//   * usam o adaptador escolhido na abertura (Firestore ou memória);
//   * ligam a barra de progresso;
//   * têm TEMPO LIMITE (o app nunca fica "pensando" para sempre);
//   * recusam gravar sem internet (evita gravações "fantasma" que ficam na
//     fila do aparelho e aparecem duplicadas horas depois);
//   * devolvem erros já traduzidos (ver erros.js).
// =============================================================================

import { AGORA } from './banco-comum.js';
import { ErroApp } from './erros.js';
import { iniciarProgresso, concluirProgresso } from './progresso.js';
import { TIMEOUT_REDE_MS } from './constantes.js';

export { AGORA };

let adaptador = null;
let tempoLimiteMs = TIMEOUT_REDE_MS;

/** Escolhe o adaptador (chamado uma vez em principal.js ou nos testes). */
export function definirAdaptadorBanco(novo, { tempoLimite } = {}) {
  adaptador = novo;
  if (tempoLimite) tempoLimiteMs = tempoLimite;
}

function exigirAdaptador() {
  if (!adaptador) throw new ErroApp('O banco de dados ainda não foi iniciado.', 'sem-banco');
  return adaptador;
}

function estaOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** Corre contra o relógio: se a operação passar do limite, vira erro de "timeout". */
async function comTempoLimite(promessa, mensagem) {
  let relogio;
  const limite = new Promise((_, rejeitar) => {
    relogio = setTimeout(() => rejeitar(new ErroApp(mensagem, 'timeout')), tempoLimiteMs);
  });
  try {
    return await Promise.race([promessa, limite]);
  } finally {
    clearTimeout(relogio);
  }
}

async function executar(funcao, mensagemTimeout) {
  iniciarProgresso();
  try {
    return await comTempoLimite(Promise.resolve().then(funcao), mensagemTimeout);
  } finally {
    concluirProgresso();
  }
}

/** Gera um id novo para um documento da coleção. */
export function novoId(caminhoColecao) {
  return exigirAdaptador().novoId(caminhoColecao);
}

/** Lê um documento: { id, ...dados } ou null. */
export function ler(caminho) {
  return executar(
    () => exigirAdaptador().ler(caminho),
    'A conexão está lenta e não conseguimos carregar. Tente de novo.',
  );
}

/**
 * Lista documentos de uma coleção.
 * consulta = { onde: [[campo, operador, valor]], ordenarPor: [[campo, 'asc'|'desc']], limite }
 */
export function listar(caminhoColecao, consulta = {}) {
  return executar(
    () => exigirAdaptador().listar(caminhoColecao, consulta),
    'A conexão está lenta e não conseguimos carregar a lista. Tente de novo.',
  );
}

/** Grava várias operações de uma vez (tudo ou nada). */
export function gravar(operacoes) {
  if (!Array.isArray(operacoes) || operacoes.length === 0) return Promise.resolve();
  if (operacoes.length > 450) {
    throw new ErroApp('Muitos registros de uma vez. Divida a operação em partes.', 'lote-grande');
  }
  if (estaOffline()) {
    throw new ErroApp('Você está sem internet. Conecte-se para salvar — nada foi alterado.', 'sem-rede');
  }
  return executar(
    () => exigirAdaptador().gravar(operacoes),
    'A conexão está lenta. Confira a lista antes de tentar salvar de novo, para não duplicar.',
  );
}

/** Atalhos para montar operações de gravação. */
export const operacao = {
  /** Cria (ou substitui) um documento inteiro. */
  definir: (caminho, dados) => ({ tipo: 'definir', caminho, dados }),
  /** Cria um documento novo (mesmo efeito de "definir"; deixa a intenção clara). */
  criar: (caminho, dados) => ({ tipo: 'criar', caminho, dados }),
  /** Altera só os campos informados (o documento precisa existir). */
  atualizar: (caminho, dados) => ({ tipo: 'atualizar', caminho, dados }),
  /** Junta os campos aos que já existem (cria se não existir). */
  mesclar: (caminho, dados) => ({ tipo: 'mesclar', caminho, dados }),
  apagar: (caminho) => ({ tipo: 'apagar', caminho }),
};

/** Divide uma lista em pedaços (para gravar em vários lotes de até 400). */
export function emPedacos(lista, tamanho = 400) {
  const saida = [];
  for (let i = 0; i < lista.length; i += tamanho) saida.push(lista.slice(i, i + tamanho));
  return saida;
}

/** Nome do adaptador em uso ('firestore' ou 'memoria'), útil para avisos na tela. */
export function nomeDoAdaptador() {
  return adaptador ? adaptador.nome : null;
}

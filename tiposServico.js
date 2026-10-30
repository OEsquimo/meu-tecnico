// =============================================================================
// TIPOS DE SERVIÇO — Limpeza, Instalação, Carga de gás... (editáveis)
// =============================================================================
// O administrador pode criar outros tipos. Cada tipo diz se "gera retorno"
// (lembrete de limpeza/manutenção) e qual o prazo padrão sugerido.
// O nome do tipo é COPIADO para cada serviço: apagar ou renomear um tipo não
// altera o histórico.
// =============================================================================

import { gravar, operacao as op, novoId } from '../nucleo/banco.js';
import { DURACAO_PADRAO_MIN } from '../nucleo/constantes.js';
import { recarregarTipos, sessao } from '../nucleo/sessao.js';

const caminho = (empresaId) => `empresas/${empresaId}/tiposServico`;

export async function criarTipo(empresaId, { nome, geraRetorno, retornoPadraoMeses, duracaoMin = DURACAO_PADRAO_MIN }) {
  const maior = Math.max(0, ...sessao.tipos.map((t) => t.ordem ?? 0));
  const id = novoId(caminho(empresaId));
  await gravar([op.criar(`${caminho(empresaId)}/${id}`, { nome, geraRetorno, retornoPadraoMeses, duracaoMin, ativo: true, ordem: maior + 1 })]);
  await recarregarTipos();
  return id;
}

export async function atualizarTipo(empresaId, tipo, { nome, geraRetorno, retornoPadraoMeses, duracaoMin, ativo }) {
  await gravar([op.definir(`${caminho(empresaId)}/${tipo.id}`, {
    nome, geraRetorno, retornoPadraoMeses, duracaoMin: duracaoMin ?? tipo.duracaoMin ?? DURACAO_PADRAO_MIN, ativo: ativo ?? tipo.ativo ?? true, ordem: tipo.ordem ?? 0,
  })]);
  await recarregarTipos();
}

export async function excluirTipo(empresaId, id) {
  await gravar([op.apagar(`${caminho(empresaId)}/${id}`)]);
  await recarregarTipos();
}

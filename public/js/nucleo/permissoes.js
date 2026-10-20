// =============================================================================
// PERMISSÕES — o que cada papel pode ver e fazer NA TELA
// =============================================================================
// IMPORTANTE: isto só decide o que MOSTRAR. A segurança de verdade está em
// firestore.rules (o servidor recusa mesmo que alguém mexa no JavaScript).
// Mantemos as duas coerentes: se mudar uma regra aqui, mude lá também.
//
// Papéis:
//   admin   -> dono da empresa: vê tudo, inclusive valores e financeiro
//   tecnico -> funcionário: só os serviços atribuídos a ele, sem valores
//   dono do aplicativo (você) -> painel separado (/dono), definido no console
// =============================================================================

export const PAPEL = { ADMIN: 'admin', TECNICO: 'tecnico' };

/** "s" é o objeto de sessão (sessao.js). Funções puras: fáceis de testar. */
export const ehAdmin = (s) => s?.estado === 'pronto' && s.papel === PAPEL.ADMIN;

/**
 * Administrador mesmo com a conta BLOQUEADA. Serve só para liberar o backup e a
 * exclusão da própria conta (direito de portabilidade/eliminação — LGPD).
 */
export const ehAdminMesmoBloqueado = (s) => (s?.estado === 'pronto' || s?.estado === 'conta-bloqueada') && s.papel === PAPEL.ADMIN;
export const ehTecnico = (s) => s?.estado === 'pronto' && s.papel === PAPEL.TECNICO;
export const ehDonoDoApp = (s) => s?.ehDonoApp === true;

/** Só o administrador vê valores em dinheiro (e o técnico nunca). */
export const podeVerValores = ehAdmin;
export const podeVerFinanceiro = ehAdmin;
export const podeGerirEquipe = ehAdmin;
export const podeGerirTiposDeServico = ehAdmin;
export const podeVerRetornos = ehAdmin;
export const podeAgendar = ehAdmin;

/** O técnico só cadastra clientes se o administrador liberou nas configurações. */
export function podeGerirClientes(s) {
  if (ehAdmin(s)) return true;
  return ehTecnico(s) && s.empresa?.permiteTecnicoCliente === true;
}

/** Só o administrador exclui clientes, serviços e aparelhos. */
export const podeExcluir = ehAdmin;

/**
 * Regra de acesso de cada rota (ver rotas.js):
 *   'publico' | 'logado' | 'membro' | 'admin' | 'clientes' | 'dono'
 */
export function acessoPermitido(requisito, s) {
  switch (requisito) {
    case 'publico': return true;
    case 'logado': return !!s?.usuario;
    case 'membro': return ehAdmin(s) || ehTecnico(s);
    case 'admin': return ehAdmin(s);
    case 'clientes': return podeGerirClientes(s);
    case 'dono': return ehDonoDoApp(s);
    default: return false;
  }
}

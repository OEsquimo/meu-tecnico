// =============================================================================
// ERROS — transforma erros técnicos em mensagens claras, em português
// =============================================================================
// Regra do projeto: o usuário NUNCA vê "FirebaseError: ..." ou código de erro.
// Toda mensagem diz O QUE aconteceu e O QUE FAZER.
// =============================================================================

/** Erro "nosso", já com mensagem pronta para mostrar na tela. */
export class ErroApp extends Error {
  /**
   * @param {string} mensagem texto para o usuário
   * @param {string} codigo   identificador curto (ex.: 'sem-rede', 'limite-clientes')
   */
  constructor(mensagem, codigo = 'app', causa = null) {
    super(mensagem);
    this.name = 'ErroApp';
    this.codigo = codigo;
    this.causa = causa;
  }
}

const MENSAGENS = {
  // --- Login (Firebase Auth) ---
  'auth/invalid-credential': 'E-mail ou senha incorretos. Confira e tente de novo.',
  'auth/wrong-password': 'Senha incorreta. Tente de novo ou toque em "Esqueci a senha".',
  'auth/user-not-found': 'Não existe conta com este e-mail.',
  'auth/invalid-email': 'Este e-mail não parece certo. Confira se digitou tudo.',
  'auth/email-already-in-use': 'Já existe uma conta com este e-mail. Toque em "Entrar" ou use "Esqueci a senha".',
  'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
  'auth/too-many-requests': 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.',
  'auth/network-request-failed': 'Sem conexão com a internet. Confira o sinal e tente de novo.',
  'auth/user-disabled': 'Esta conta foi desativada. Fale com o suporte.',
  'auth/requires-recent-login': 'Por segurança, entre de novo no app e repita a operação.',
  'auth/operation-not-allowed': 'O login por e-mail e senha ainda não foi ativado no Firebase. Veja o guia de publicação.',
  'auth/no-current-user': 'Você não está conectado. Entre de novo.',
  // --- Banco de dados (Firestore) ---
  'permission-denied': 'Você não tem permissão para fazer isso. Se acha que é um erro, saia e entre de novo.',
  unavailable: 'Sem conexão com o servidor agora. Confira a internet e tente de novo.',
  'deadline-exceeded': 'A conexão está muito lenta. Tente de novo em instantes.',
  'resource-exhausted': 'O sistema atingiu o limite de uso por hoje. Tente de novo amanhã ou fale com o suporte.',
  'failed-precondition': 'O sistema ainda não está totalmente preparado (falta criar um índice no Firebase). Fale com o suporte.',
  'not-found': 'Não encontramos este registro. Ele pode ter sido apagado.',
  'already-exists': 'Este registro já existe.',
  unauthenticated: 'Sua sessão expirou. Entre de novo.',
  aborted: 'Outra alteração aconteceu ao mesmo tempo. Tente de novo.',
  cancelled: 'A operação foi cancelada. Tente de novo.',
};

/** Texto amigável para qualquer erro (do Firebase, do navegador ou nosso). */
export function traduzirErro(erro) {
  if (!erro) return 'Algo deu errado. Tente de novo.';
  if (erro instanceof ErroApp) return erro.message;
  const codigo = String(erro.code || '').replace(/^firestore\//, '');
  if (MENSAGENS[codigo]) return MENSAGENS[codigo];
  if (erro.name === 'TypeError' && /fetch|network/i.test(erro.message || '')) {
    return 'Sem conexão com a internet. Confira o sinal e tente de novo.';
  }
  return 'Algo deu errado. Tente de novo; se continuar, fale com o suporte.';
}

/** O erro foi falta de internet/servidor? (usado para mostrar a tela "Sem conexão") */
export function ehErroDeRede(erro) {
  if (!erro) return false;
  if (erro instanceof ErroApp) return erro.codigo === 'sem-rede' || erro.codigo === 'timeout';
  const codigo = String(erro.code || '').replace(/^firestore\//, '');
  return ['unavailable', 'deadline-exceeded', 'auth/network-request-failed'].includes(codigo)
    || (erro.name === 'TypeError' && /fetch|network/i.test(erro.message || ''));
}

/** O erro foi "sem permissão"? (ajuda a mostrar mensagem de plano/limite) */
export function ehErroDePermissao(erro) {
  return !!erro && String(erro.code || '').replace(/^firestore\//, '') === 'permission-denied';
}

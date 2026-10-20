// =============================================================================
// AUTENTICAÇÃO — login por e-mail e senha
// =============================================================================
// Camada fina sobre o adaptador de login (Firebase Auth ou memória). As telas
// chamam estas funções; os erros chegam com .code do Firebase e são traduzidos
// por traduzirErro() (erros.js).
// =============================================================================

import { ErroApp } from './erros.js';
import { comProgresso } from './progresso.js';

let adaptador = null;

export function definirAdaptadorAuth(novo) {
  adaptador = novo;
}

function a() {
  if (!adaptador) throw new ErroApp('O login ainda não foi iniciado.', 'sem-auth');
  return adaptador;
}

/** Avisa quando alguém entra ou sai. Retorna a função para parar de observar. */
export function observarLogin(callback) {
  return a().observar(callback);
}

export const usuarioAtual = () => a().usuarioAtual();
export const entrar = (email, senha) => comProgresso(a().entrar(String(email).trim(), senha));
export const criarLogin = (email, senha) => comProgresso(a().criar(String(email).trim(), senha));
export const sair = () => comProgresso(a().sair());
export const redefinirSenha = (email) => comProgresso(a().redefinirSenha(String(email).trim()));
export const reautenticar = (senha) => comProgresso(a().reautenticar(senha));
export const excluirLogin = () => comProgresso(a().excluirUsuario());

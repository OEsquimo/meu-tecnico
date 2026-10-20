// =============================================================================
// FIREBASE — carrega o SDK e cria os adaptadores de banco e de login
// =============================================================================
// O SDK é baixado direto dos servidores do Google (gstatic.com) como módulo
// ES, então o projeto NÃO precisa de "npm install" nem de empacotador (build).
// A versão fica em constantes.js (VERSAO_SDK_FIREBASE).
//
// A configuração (apiKey, projectId...) vem de js/configuracao/firebase-config.js,
// um arquivo que você cria copiando o firebase-config.exemplo.js.
// =============================================================================

import { VERSAO_SDK_FIREBASE } from './constantes.js';
import { criarAdaptadorFirestore } from './adaptador-firestore.js';

/**
 * Lê a configuração do Firebase. Retorna null quando o arquivo não existe ou
 * ainda tem os valores de exemplo (app "não configurado").
 */
export async function carregarConfiguracao() {
  try {
    const modulo = await import('../configuracao/firebase-config.js');
    const c = modulo.firebaseConfig;
    if (!c || !c.apiKey || !c.projectId) return null;
    if (String(c.apiKey).startsWith('COLE_AQUI') || String(c.projectId).startsWith('SEU-')) return null;
    return c;
  } catch {
    return null;
  }
}

/** Cria o adaptador de LOGIN em cima do Firebase Auth. */
function criarAdaptadorAuthFirebase(authInstancia, a) {
  const foto = (u) => (u ? { uid: u.uid, email: u.email, nome: u.displayName || null } : null);
  return {
    nome: 'firebase',
    observar: (callback) => a.onAuthStateChanged(authInstancia, (u) => callback(foto(u))),
    usuarioAtual: () => foto(authInstancia.currentUser),
    async entrar(email, senha) {
      const r = await a.signInWithEmailAndPassword(authInstancia, email, senha);
      return foto(r.user);
    },
    async criar(email, senha) {
      const r = await a.createUserWithEmailAndPassword(authInstancia, email, senha);
      return foto(r.user);
    },
    sair: () => a.signOut(authInstancia),
    redefinirSenha: (email) => a.sendPasswordResetEmail(authInstancia, email),
    async reautenticar(senha) {
      const u = authInstancia.currentUser;
      if (!u) throw Object.assign(new Error('sem usuário'), { code: 'auth/no-current-user' });
      const credencial = a.EmailAuthProvider.credential(u.email, senha);
      await a.reauthenticateWithCredential(u, credencial);
    },
    async excluirUsuario() {
      const u = authInstancia.currentUser;
      if (!u) throw Object.assign(new Error('sem usuário'), { code: 'auth/no-current-user' });
      await a.deleteUser(u);
    },
  };
}

/** Baixa o SDK, inicia o Firebase e devolve os dois adaptadores. */
export async function iniciarFirebase(config) {
  const base = `https://www.gstatic.com/firebasejs/${VERSAO_SDK_FIREBASE}`;
  const [moduloApp, moduloAuth, moduloFirestore] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`),
  ]);

  const aplicativo = moduloApp.initializeApp(config);

  const authInstancia = moduloAuth.getAuth(aplicativo);
  authInstancia.languageCode = 'pt-BR'; // e-mails do Firebase (senha) em português

  // Cache local no aparelho: permite CONSULTAR dados sem internet.
  // Se o navegador não suportar (ex.: aba anônima), segue sem cache persistente.
  let db;
  try {
    db = moduloFirestore.initializeFirestore(aplicativo, {
      localCache: moduloFirestore.persistentLocalCache({
        tabManager: moduloFirestore.persistentMultipleTabManager(),
      }),
    });
  } catch {
    db = moduloFirestore.getFirestore(aplicativo);
  }

  return {
    banco: criarAdaptadorFirestore(db, moduloFirestore),
    auth: criarAdaptadorAuthFirebase(authInstancia, moduloAuth),
  };
}

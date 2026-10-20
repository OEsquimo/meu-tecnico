// =============================================================================
// CONFIGURAÇÃO DO FIREBASE — ARQUIVO DE EXEMPLO
// =============================================================================
// COMO USAR:
//   1. Copie este arquivo para "firebase-config.js" (mesma pasta).
//   2. Troque os valores abaixo pelos do SEU projeto Firebase
//      (Console do Firebase > Configurações do projeto > Seus apps > Config do SDK).
//   3. Nunca coloque aqui senhas, chaves de "conta de serviço" ou tokens privados.
//
// Estes valores NÃO são segredos: o que protege os dados são as regras do
// Firestore (firestore.rules) e o login. Mesmo assim, o "firebase-config.js"
// real está no .gitignore para cada ambiente ter o seu.
// =============================================================================

export const firebaseConfig = {
  apiKey: 'COLE_AQUI_A_API_KEY',
  authDomain: 'SEU-PROJETO.firebaseapp.com',
  projectId: 'SEU-PROJETO',
  storageBucket: 'SEU-PROJETO.firebasestorage.app',
  messagingSenderId: 'COLE_AQUI',
  appId: 'COLE_AQUI',
};

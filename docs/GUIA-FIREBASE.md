# Guia: colocar o Meu Técnico no ar (Firebase, plano grátis)

Tempo: ~30 minutos. Não precisa programar. Você precisa de uma conta Google, de um computador com **Node.js 20+** e do projeto (esta pasta).

> A **chave do Firebase** (apiKey etc.) que você vai copiar **não é segredo**; quem protege os dados são o login e as regras. Mesmo assim ela fica fora do Git. **Nunca** envie senhas, "conta de serviço" ou tokens para ninguém (nem para o Claude).

## 1. Criar o projeto
1. Acesse https://console.firebase.google.com → **Adicionar projeto** → nome (ex.: `meu-tecnico-prod`). Pode desativar o Google Analytics.
2. Em **Configurações do projeto (engrenagem) → Seus apps → Web (`</>`)**: registre um app (ex.: "web"). **Não** marque Hosting aqui. Copie o bloco `firebaseConfig`.
3. Copie `public/js/configuracao/firebase-config.exemplo.js` para `public/js/configuracao/firebase-config.js` e cole os seus valores.

## 2. Ligar o login
**Build → Authentication → Primeiros passos → E-mail/senha → Ativar.**
Em **Settings → Authorized domains**, confira que `SEU-PROJETO.web.app` está na lista (vem por padrão).

## 3. Criar o banco
**Build → Firestore Database → Criar banco de dados** → modo **produção** → local **southamerica-east1 (São Paulo)**. (A região não muda depois.)

## 4. Publicar regras, índices e o app
No terminal, dentro da pasta do projeto:
```bash
npm install
npx firebase login
npx firebase use --add          # escolha o projeto e dê o apelido "default"
npx firebase deploy --only firestore:rules,firestore:indexes
npx firebase deploy --only hosting
```
O endereço final aparece no terminal (`https://SEU-PROJETO.web.app`). Índices podem levar alguns minutos para ficar prontos; até lá algumas telas mostram "Tentar de novo".

## 5. Tornar-se o dono do aplicativo (uma vez)
1. Abra o app no endereço acima e **crie a sua conta** (Criar conta). Ela será uma empresa comum.
2. No Console: **Authentication → Users** → copie o **UID** do seu usuário.
3. **Firestore Database → Iniciar coleção** → ID da coleção `donosApp` → ID do documento = **o seu UID** → adicione um campo qualquer (ex.: `criadoEm`, tipo timestamp).
4. Saia e entre de novo: o app abre o **Painel do dono**. (Para usar o app como técnico, use outro e-mail.)
5. Em **Planos**, toque em **Criar planos e regras padrão**. Ajuste preços, limites, dias de teste, WhatsApp de vendas e instruções de pagamento (ex.: chave Pix).

## 6. Cobrança (versão 1: manual)
O cliente escolhe um plano em **Meu plano** e fala com você pelo WhatsApp. Ao receber o Pix, no Painel do dono → **Contas** → abra a empresa → **Ativar / renovar +30 dias** (e **Trocar plano**).

## 7. Instalar no Android
Abra o endereço no Chrome → menu ⋮ → **Instalar aplicativo**. Funciona como app, com ícone próprio.

## 8. Cuidados com o plano grátis (Spark)
Cotas diárias: 50 mil leituras, 20 mil gravações. O app reduz leituras com cache de 2 min, mas o **Financeiro** lê 2 documentos por serviço do período. Acompanhe em **Firestore → Uso**. Se passar, a cota volta no dia seguinte; o plano Blaze (pago por uso) resolve — configure alerta de orçamento antes de ativá-lo.

## 9. Testar em segurança antes de vender
- Rode `npm run teste:regras` (emulador) e confirme que tudo passa.
- Crie 2 contas de teste e confirme que uma **não** vê os dados da outra.
- Crie um técnico por convite e confirme que ele **não** vê valores nem o Financeiro.
- Faça um backup (Administrativa → Backup) e restaure em outra conta de teste.

## Problemas comuns
| Sintoma | O que fazer |
|---|---|
| Tela "Firebase não configurado" | falta o `firebase-config.js` (passo 1.3) e novo `deploy --only hosting` |
| "Permissão negada" ao cadastrar | publique as regras (passo 4); confira se o plano/teste não venceu |
| Lista não carrega / "índice necessário" | aguarde a criação dos índices (passo 4) ou abra o link do erro no console |
| Não aparece o Painel do dono | passo 5: UID certo, coleção `donosApp`, e sair/entrar de novo |

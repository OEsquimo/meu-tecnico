# Guia: ligar o Meu Técnico ao Firebase só com o celular (Android + Termux)

Este guia vale para quem usa o app pelo GitHub Pages (`https://oesquimo.github.io/meu-tecnico/`) e não tem computador. O Firebase vira o **banco de dados e o login** do app; a hospedagem continua no GitHub Pages (não use o Firebase Hosting).

> A **chave do Firebase** (apiKey etc.) **não é segredo** e pode ser enviada para o Claude e ficar no GitHub. **Nunca** envie senhas, "conta de serviço", códigos de login do Firebase ou tokens do GitHub para ninguém.

## Parte A — No navegador do celular (console do Firebase)
Abra https://console.firebase.google.com (Chrome, de preferência com "Site para computador" ligado no menu ⋮) e entre com a sua conta Google.

1. **Criar o projeto:** *Adicionar projeto* → nome `meu-tecnico-app` (ou outro) → pode desligar o Google Analytics → *Criar projeto*.
2. **Registrar o app web:** na tela inicial do projeto toque no ícone **`</>`** (Web) → apelido `web` → **não** marque Hosting → *Registrar app*. Vai aparecer um bloco `const firebaseConfig = { ... }`. **Copie esse bloco inteiro e mande para o Claude** (é o que gera o arquivo `firebase-config.js`).
3. **Ligar o login:** menu **Build → Authentication → Primeiros passos → E-mail/senha → Ativar → Salvar**.
4. **Liberar o endereço do app:** em **Authentication → Settings → Domínios autorizados → Adicionar domínio** → `oesquimo.github.io`. (Sem isso o login falha no GitHub Pages.)
5. **Criar o banco:** **Build → Firestore Database → Criar banco de dados** → local **southamerica-east1 (São Paulo)** (não muda depois) → modo **produção** → Criar.

## Parte B — Publicar as regras de segurança (Termux)
As regras (`firestore.rules`) são o que impede um cliente de ver os dados de outro. **Sem elas publicadas o banco fica fechado** (nada funciona); **nunca** troque por "modo teste".

Primeiro instale as ferramentas (uma vez), um comando por vez:
```
pkg install nodejs -y
```
```
cd ~/meu-tecnico-limpo
```
```
npx firebase-tools@latest login --no-localhost
```
O Firebase mostra um link: abra no navegador, entre na sua conta, copie o **código** que aparece e cole no Termux. (O código é só seu: não envie para ninguém.)

Depois publique as regras e os índices (troque `SEU-PROJECT-ID` pelo `projectId` do bloco copiado):
```
npx firebase-tools@latest deploy --only firestore:rules,firestore:indexes --project SEU-PROJECT-ID
```
Se o Termux travar ou faltar memória, plano B: no console abra **Firestore Database → Regras**, apague tudo, cole o conteúdo do arquivo `firestore.rules` e toque em **Publicar**. Os índices também podem ser criados na hora: quando uma tela mostrar "índice necessário", abra o link do erro e toque em Criar.

## Parte C — Colocar a configuração no app
O Claude gera o arquivo `public/js/configuracao/firebase-config.js` com o bloco que você mandou. Você envia pelo mesmo fluxo de sempre (zip → Termux → pull request → merge). Depois do merge, abra o app **sem** `?demo=1`: `https://oesquimo.github.io/meu-tecnico/`. (O modo demonstração continua existindo em `?demo=1`.)

## Parte D — Tornar-se o dono do aplicativo (uma vez)
1. No app, **crie a sua conta** (Criar conta) com o seu e-mail. Ela vira uma empresa comum.
2. No console: **Authentication → Users** → copie o **UID** do seu usuário.
3. **Firestore Database → Iniciar coleção** → ID da coleção `donosApp` → ID do documento = o seu **UID** → adicione um campo qualquer (ex.: `criadoEm`, tipo timestamp) → Salvar.
4. No app, saia e entre de novo: abre o **Painel do dono**. Em **Planos**, toque em **Criar planos e regras padrão**.
5. Para usar o app como administrador de uma empresa, use **outro e-mail** (conta de teste).

## Parte E — Convidar o técnico
Em **Equipe**, cadastre o técnico → o app abre o WhatsApp com o link do convite → ela abre o link, cria a senha e passa a ver só os serviços dela. Isso só funciona depois das partes A a C.

## Parte F — Testes antes de usar de verdade
- No GitHub, o job **"Regras de segurança do Firestore"** precisa estar verde antes da Parte B.
- Crie 2 contas de teste e confirme que uma **não** vê os dados da outra.
- Crie um técnico por convite e confirme que ele **não** vê valores nem o Financeiro.
- Faça um backup (Administrativa → Backup) e restaure em outra conta de teste.

## Cuidados com o plano grátis (Spark)
Cotas diárias: 50 mil leituras e 20 mil gravações. Acompanhe em **Firestore → Uso**. Se passar, a cota volta no dia seguinte.

## Problemas comuns
| Sintoma | O que fazer |
|---|---|
| "Aplicativo ainda não configurado" | falta o `firebase-config.js` (Parte C) ou o cache: feche e abra o app duas vezes |
| Login dá erro de domínio | falta `oesquimo.github.io` nos domínios autorizados (A.4) |
| "Permissão negada" | publique as regras (Parte B) |
| Lista não carrega / "índice necessário" | aguarde os índices ou abra o link do erro e toque em Criar |
| Não aparece o Painel do dono | Parte D: UID certo, coleção `donosApp`, e sair/entrar de novo |

# Estado do projeto — Meu Técnico

> Documento vivo. **Atualizar ao final de cada etapa importante** (ver "Histórico").
> Última atualização: 2026-10-19 (noite) — etapa 5 (melhorias menores concluídas; aguardando validação com Firebase real pelo usuário).

## 1. O que é
App (PWA Android) para técnicos/empresas de ar-condicionado: clientes (até 2 endereços) → aparelhos → serviços; agenda; lembrete de retorno por WhatsApp (envio manual, botão abre wa.me com texto pronto); financeiro; planos; painel do dono do app; equipe (técnicos).
Stack: JavaScript/HTML/CSS puro (módulos ES, sem bundler), Firebase (Auth + Firestore + Hosting), custo zero para começar. Código comentado em português. Nome provisório: "Meu Técnico".

## 2. Regras de negócio decididas
- Multi-tenant: 1 backend; `usuarios/{uid}` → `empresaId` + papel `admin` | `tecnico`. Empresa id = uid do admin.
- Técnico vê só os próprios serviços, **sem valores** (valores em coleção separada `valores`, só admin lê). Só marca "cliente pagou? sim/não". Só cadastra cliente se o admin ativar a opção.
- Convite de técnico por link (WhatsApp). Um login pertence a uma empresa só.
- Garantia 90 dias; retornos em 3/4/6/12 meses; aviso de retorno 15 dias antes (configurável).
- Estados de retorno: pendente | agendado | recusado | feito.
- Plano grátis inclui tudo, exceto Financeiro completo; limite de clientes por plano (grátis 10, básico 20, médio 30, avançado 50, ilimitado). Limites, preços, dias de teste (padrão 7), desconto e recursos são **configuráveis pelo dono do app**.
- Limite de clientes imposto nas regras do Firestore (contador na mesma batch).
- Dinheiro em centavos inteiros; dias como "AAAA-MM-DD".
- Sem fotos, sem anúncios. Backup JSON (exportar/importar) em todos os planos.
- Escritas recusadas offline; timeout de 15 s; app nunca pode travar (tela de erro com "Tentar de novo").
- Cobrança v1: ativação manual do plano pelo dono (Pix). Região Firestore: São Paulo.

## 3. Concluído
- Config e infra: `firestore.rules`, `firestore.indexes.json`, `firebase.json` (CSP), `.gitignore`, `package.json`, ícones PWA, `manifest`, `service-worker.js`, `index.html` (carrega os 3 CSS de telas), CSS (base, componentes, telas, telas-clientes, telas-servicos, telas-admin), `scripts/servir-local.mjs` (porta 5173).
- Núcleo (`public/js/nucleo/`), domínio (`dominio/`, 14 módulos) e serviços de dados (`servicos/`, 11 módulos).
- **Todas as 38 telas das rotas** em `public/js/telas/` (auth, convite, vínculo, início, agenda, agendar, serviço, concluir, histórico, retornos, clientes (4), aparelho, financeiro, administrativa, tipos de serviço (2), configurações, plano, backup, conta, equipe (4 telas), painel do dono (3)). Módulos de apoio: `_auxiliar-admin.js`, `clientes-comum.js`, `servicos-comum.js`.
- `scripts/verificar-projeto.mjs`: imports resolvem, nomes exportados existem, rotas têm tela, sem estilo/handler inline → **passa (84 arquivos)**.
- `testes/telas/fumaca.py` (24 rotas em 3 perfis: sem erro de console/CSP, sem tela presa, técnico sem valores em R$) e `testes/telas/fluxos.py` (cliente, convite, concluir como técnico sem campo de valor, dono) → **passam em modo demo**.
- `testes/unitarios` (23 testes passam: domínio, serviços com banco em memória, backup ida-e-volta, acesso por papel nas rotas). Bug corrigido: admin de conta bloqueada não alcançava Backup/Excluir conta.
- `testes/regras/regras.test.mjs` (16 cenários) escrito, **NUNCA executado** (precisa de emulador/Java/npm). `firestore.rules` revisado à mão contra o que o app grava: sem divergência.
- Documentos: README, ARQUITETURA, GUIA-FIREBASE, MODELO-DE-DADOS, REGRAS-DE-NEGOCIO, PARECER-FINAL (matriz de rastreabilidade, checklist antes de vender).
- Limite: tudo foi verificado só com o adaptador de memória (`?demo=1`). Firebase real e regras de segurança NÃO foram exercitados.

## 4. Pendências
**Só o usuário consegue fazer:** criar o projeto Firebase e publicar (docs/GUIA-FIREBASE.md); rodar `npm install && npm run teste:regras`; testar em Android real (PWA, GPS, WhatsApp, contatos); revisão jurídica dos textos legais; decidir cobrança/Play Store.
**Melhorias conhecidas:** considerar verificação de e-mail/App Check; commit inicial (repo sem commits; só quando o usuário pedir). Já resolvidas na etapa 5: janela própria para informar valor no Financeiro (testada em demo, com validação), campo de dias de `configuracoes.js` sem `maxlength` indevido, ícones PWA conferidos visualmente.

## 5. Próximo passo exato
1. Usuário: seguir docs/GUIA-FIREBASE.md (passos 1–5) e enviar o resultado/erros (nunca senhas).
2. Usuário: `npm install && npm run teste:regras`; corrigir qualquer falha (pode ser do teste ou da regra).
3. Claude (quando pedido): commit inicial; ajustes que surgirem do teste real.

## 6. Histórico
- 2026-10-17: decisões de produto fechadas; usuário autorizou criar ("Pode criar").
- 2026-10-18: núcleo, domínio, serviços de dados e telas de autenticação concluídos; criado este documento.
- 2026-10-19: escritas as 26 telas restantes; verificador estático e testes de tela em modo demo passando; CSS das telas declarado no index e no service worker.
- 2026-10-19: testes unitários (23), testes de regras (escritos, não executados), README e docs, parecer final; corrigido bug da conta bloqueada.
- 2026-10-19 (noite): retomada sem alterar o que estava validado; Financeiro ganhou janela própria para o valor; ícones conferidos; verificador, 23 testes unitários e testes de tela seguem passando.

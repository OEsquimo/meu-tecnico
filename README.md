# Meu Técnico (nome provisório)

Aplicativo (PWA para Android) para técnicos e empresas de ar-condicionado: **clientes → endereços (até 2) → aparelhos → serviços**, agenda, lembretes de retorno (limpeza/manutenção) enviados manualmente por WhatsApp, financeiro, planos, equipe de técnicos e painel do dono do aplicativo.

JavaScript/HTML/CSS puro (sem bundler) + Firebase (Auth, Firestore, Hosting). Custo zero para começar (plano Spark).

## Começando (3 comandos, sem Firebase)
```bash
node scripts/servir-local.mjs        # abre http://localhost:5173
# abra  http://localhost:5173/?demo=1  → modo demonstração (dados de exemplo, sem internet/Firebase)
```
Contas demo (senha `demo123`): `demo@meutecnico.app` (administrador), `tecnico@meutecnico.app` (técnico), `dono@meutecnico.app` (dono do app).

## Para colocar no ar de verdade
Siga **docs/GUIA-FIREBASE.md** (passo a passo, sem programar).

## Verificações
| Comando | O que faz | Precisa de |
|---|---|---|
| `npm run verificar` | imports, rotas, CSP (sem estilo/handler inline) | Node |
| `npm test` | testes unitários (regras de negócio, serviços, rotas) | Node 20+ |
| `npm run teste:telas` | abre as telas num navegador em modo demo | Python + Playwright + Chromium |
| `npm run teste:regras` | testa `firestore.rules` no emulador | `npm install`, Java, Firebase CLI |

## Mapa das pastas
```
public/                 ← tudo que vai para o ar (Firebase Hosting)
  index.html, manifest.webmanifest, service-worker.js, icones/, css/
  js/nucleo/            base: banco, login, sessão, rotas, UI, componentes
  js/dominio/           regras de negócio puras (datas, dinheiro, planos, retornos…)
  js/servicos/          leitura/gravação no banco (uma pasta por assunto)
  js/telas/             uma tela por arquivo (rotas em nucleo/rotas.js)
  js/configuracao/      firebase-config.js (SEU, fora do Git) e o exemplo
firestore.rules         segurança do banco (a "porta" de verdade)
firestore.indexes.json  índices das consultas
firebase.json           Hosting + cabeçalhos de segurança (CSP) + emulador
scripts/                servidor local, verificador, gerador de ícones
testes/                 unitarios/, telas/, regras/
docs/                   guias e documentação
```

## Documentação
- `docs/ESTADO-DO-PROJETO.md` — estado atual, pendências e próximo passo (atualizado a cada etapa)
- `docs/GUIA-FIREBASE.md` — criar e publicar
- `docs/ARQUITETURA.md` — como escrever/alterar telas
- `docs/MODELO-DE-DADOS.md` — coleções do banco
- `docs/REGRAS-DE-NEGOCIO.md` — o que o app decide e por quê

## Aviso
Termos de uso e política de privacidade (`public/js/telas/textos-legais.js`) são **modelos** com campos `[COMPLETAR]`; precisam de revisão de advogado antes de vender.

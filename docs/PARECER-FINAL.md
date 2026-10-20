# Parecer técnico — Meu Técnico v1.0 (pré-lançamento)

Data: 2026-10-19. Legenda: ✅ verificado · 🟡 parcial / só em modo demo · ⛔ BLOQUEADO (não dá para verificar no ambiente de desenvolvimento) · ❌ não feito.

## Resumo
O código de todas as funcionalidades combinadas está escrito e passa nas verificações possíveis **sem Firebase real**. **Não está pronto para vender** até: (1) o emulador de regras ser rodado e passar, (2) um teste real no Firebase (guia), (3) revisão jurídica dos textos, (4) teste em celular Android. Nenhum bloqueador de arquitetura conhecido.

## Matriz de rastreabilidade (requisito → onde está → como foi verificado)
| Requisito | Implementação | Verificação |
|---|---|---|
| Clientes com até 2 endereços (CEP, rua, GPS, manual) | telas `cliente-form`, `servicos/cep.js`, `dominio/endereco.js` | 🟡 tela em demo; APIs ViaCEP/Nominatim não chamadas aqui |
| Aparelhos por cliente | `aparelho-form`, `servicos/aparelhos.js` | 🟡 demo + unit (exclusão em cascata) |
| Serviços: agendar, concluir, histórico | `agendar`, `servico`, `concluir-servico`, `historico` | ✅ unit (serviços) · ✅ fluxo em demo |
| Técnico sem ver valores | coleção `valores` separada + telas + regras | ✅ unit/demo (UI) · ⛔ regras (emulador) |
| Agenda | `agenda.js`, `dominio/agenda.js` | ✅ unit + demo |
| Retorno com aviso por WhatsApp manual | `retornos.js`, `dominio/retornos.js`, `whatsapp.js` | ✅ unit · 🟡 abertura real do WhatsApp não testada |
| Financeiro (Hoje/Semana/Mês/Ano) | `financeiro.js`, `dominio/financeiro.js` | ✅ unit (cálculo) · 🟡 tela demo |
| Planos, teste, limite de clientes | `dominio/planos.js` + `firestore.rules` | ✅ unit (app) · ⛔ regras (espelho) |
| Painel do dono (planos, regras, contas) | `dono-*.js`, `servicos/planos.js` | 🟡 demo |
| Equipe, convite por link, bloqueio | `equipe*.js`, `convite*.js`, `servicos/equipe.js` | ✅ demo (convite) · ⛔ regras do aceite |
| Backup JSON (exportar/importar) | `backup.js`, `servicos/backup.js`, `dominio/backup.js` | ✅ unit (ida e volta) |
| LGPD: exclusão de conta, termos | `conta.js`, `excluirContaCompleta`, `textos-legais.js` | 🟡 fluxo demo/ unit parcial · ❌ revisão jurídica |
| Nunca travar; progresso ao abrir; offline | `principal.js`, `banco.js`, telas com "Tentar de novo" | 🟡 demo (sem teste de rede real) |
| PWA instalável | manifest, service worker, ícones | 🟡 arquivos conferidos pelo verificador; ícones conferidos visualmente; instalação não testada |
| Zero custo / sem fotos / sem anúncios | arquitetura | ✅ por inspeção |

## Verificações executadas (2026-10-19)
- ✅ `scripts/verificar-projeto.mjs`: imports/exports, rotas→telas, sem estilo/handler inline (CSP).
- ✅ `node --test testes/unitarios/*.test.mjs`: **23 testes passam** (domínio, serviços com banco em memória, backup ida-e-volta, acesso por papel nas rotas).
- ✅ `testes/telas/fumaca.py` e `fluxos.py`: 24 rotas em 3 perfis sem erro de console/CSP; técnico sem campo/valor.
- ⛔ `testes/regras/regras.test.mjs` (16 cenários): escrito, **nunca executado** (npm/emulador indisponíveis).
- Bug real encontrado pelos testes e corrigido: administrador de conta **bloqueada** não alcançava Backup/Excluir conta (portabilidade LGPD).

## Auditoria de segurança
- ✅ Revisão manual de `firestore.rules` contra os campos que o app grava (clientes, aparelhos, serviços, valores, empresa, equipe, tipos, planos, regras): sem divergência encontrada. ⛔ Sintaxe e comportamento não validados por emulador.
- ✅ Sem segredos no repositório; `firebase-config.js` no `.gitignore` (chave web não é segredo).
- ✅ CSP restritiva em `firebase.json`; HTML sempre escapado (`html\`\``, testado); sem `innerHTML` de dados crus.
- Riscos conhecidos/aceitos: SDK Firebase carregado do CDN do Google (sem bundler); convite é um link com id aleatório (quem tem o link entra); cadastro aberto (sem verificação de e-mail) — considerar ativar verificação e App Check antes de escalar; Spark: cotas diárias podem esgotar com muitos usuários.
- ✅ `financeiro.js`: valor agora é pedido numa janela própria com validação (antes usava `window.prompt`).

## Banco de dados
Modelo em `docs/MODELO-DE-DADOS.md`; 8 índices em `firestore.indexes.json` (não implantados/validados). Contador de clientes acoplado por lote; tipos padrão em 2º lote. Risco: consultas novas sem índice exigirão atualizar o arquivo.

## Dependências
Runtime: nenhuma (Firebase SDK 10.14.1 via gstatic). Dev: `firebase`, `@firebase/rules-unit-testing`, `firebase-tools` (não instaladas aqui; versões a confirmar com `npm install`).

## Ambientes e deploy
Um projeto Firebase "prod" basta para começar; recomendável um segundo ("dev") com `firebase use`. Passo a passo em `docs/GUIA-FIREBASE.md`. Play Store (TWA) é opcional e posterior; exige termos/privacidade publicados em URL e revisão de conformidade.

## GitHub (repositório privado)
Pronto para versionar: `.gitignore` correto, sem segredos. **Nenhum commit feito** (aguardando sua ordem). Sugestão: commit inicial + branch `main` protegida.

## Antes de vender (checklist)
1. `npm install && npm run teste:regras` → tudo verde. 2. Seguir o guia e testar com 2 empresas + 1 técnico. 3. Testar no Android real (instalar PWA, GPS, WhatsApp, contatos, offline). 4. Preencher/validar termos e política com advogado. 5. Definir cobrança (Pix manual na v1) e suporte. 6. Alerta de orçamento no Firebase.

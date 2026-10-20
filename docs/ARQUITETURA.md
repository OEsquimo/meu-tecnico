# Arquitetura — guia para escrever/alterar telas

## Camadas (quem pode importar quem)
`dominio/` (regras puras, sem rede/DOM) ← `servicos/` (leitura/escrita no banco) ← `telas/` (HTML + eventos).
`nucleo/` é a base (banco, sessão, UI, rotas). Telas nunca chamam Firestore direto: usam `servicos/`.

## Padrão de tela
Arquivo `public/js/telas/<nome>.js` com `export default async function montar(ctx)`.
`ctx = { raiz, params, consulta, extras, rota, sessao, ir, voltar, recarregar, ativo }`.
- `raiz`: elemento onde desenhar (`mostrar(raiz, html\`...\`)`). `html` escapa tudo que é interpolado; use `bruto()` só para HTML já seguro.
- `ir('/caminho')` navega; `voltar()`; `recarregar()` redesenha a tela.
- A função pode retornar uma função de limpeza.
- Rotas já declaradas em `nucleo/rotas.js` (não mudar nomes de arquivo).
- Exemplo completo de formulário: `telas/entrar.js`, `telas/criar-conta.js`.

## Regras obrigatórias de UI
- **Sem** `style="..."`, `onclick=`, `<script>` inline (CSP bloqueia). Use classes de `css/componentes.css` e `css/telas.css`; valor dinâmico via `--altura`/`--largura` (ver `aplicarEstilosDinamicos`). Classes novas vão em `css/telas.css`.
- Eventos: `aoClicar(raiz, { acao: (el) => ... })` com `data-acao="acao"`; formulários com `aoEnviar(form, fn)`.
- Botões que gravam: `comCarregando(botao, async () => ...)`. Erros: `mostrarErrosNosCampos(form, {campo: msg, geral: msg})` ou `toast(msg,'erro')`; `traduzirErro(e)` dá texto em português.
- Validar com `dominio/validacoes.js` (retorna `{valido, erros, dados}`) antes de gravar.
- Listas: mostrar `esqueletos()` enquanto carrega; `estadoVazio()` quando vazio; **sempre** try/catch com mensagem e botão "Tentar de novo" (o app nunca pode travar em "carregando").
- Telas enxutas, textos curtos, botões grandes (mobile 360px), português do Brasil.
- Respeitar papel: técnico não vê valores nem telas de admin (`nucleo/permissoes.js`). Nunca confiar só na UI: as regras do Firestore também barram.
- Dinheiro: `dominio/dinheiro.js` (centavos). Datas: `dominio/datas.js` (strings AAAA-MM-DD, `paraISO`).
- Listas usam `comCache`/`invalidarCache` (`nucleo/cache.js`) via serviços; após gravar, invalidar o cache correspondente (os serviços já fazem quando aplicável — conferir).
- Comentários em português, cabeçalho explicando a tela.

## Dados
`empresaId = sessao.vinculo.empresaId`; `sessao.papel`, `sessao.empresa`, `sessao.tipos`, `sessao.usuario.uid`. Funções disponíveis: `servicos/*.js` (ver exports). Modelo: `docs/MODELO-DE-DADOS.md` (a escrever) e `firestore.rules`.

## Verificação
`node --check arquivo.js`; servidor local `node scripts/servir-local.mjs` (porta 5173); abrir `http://localhost:5173/?demo=1` (contas demo: demo@meutecnico.app admin, tecnico@meutecnico.app, dono@meutecnico.app; senha demo123). Chromium+Playwright (python) em /opt/pw-browsers.

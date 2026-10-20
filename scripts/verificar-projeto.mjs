// =============================================================================
// VERIFICAÇÃO ESTÁTICA DO PROJETO (sem dependências): node scripts/verificar-projeto.mjs
// =============================================================================
// Confere: (1) todo import relativo aponta para um arquivo que existe;
// (2) todo nome importado é realmente exportado; (3) toda rota de rotas.js tem
// arquivo de tela; (4) nada de estilo/evento inline (o CSP bloquearia);
// (5) arquivos do index.html/manifest/service worker existem.
// Sai com código 1 se achar problema.
// =============================================================================
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const RAIZ = resolve(new URL('..', import.meta.url).pathname);
const PUBLICO = join(RAIZ, 'public');
const problemas = [];
const falha = (m) => problemas.push(m);

function listar(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? listar(p) : [p];
  });
}

const jsArquivos = listar(join(PUBLICO, 'js')).filter((f) => f.endsWith('.js'));
const textoDe = (f) => readFileSync(f, 'utf8');
const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// nomes exportados por arquivo
const exportados = new Map();
for (const f of jsArquivos) {
  const t = semComentarios(textoDe(f));
  const nomes = new Set();
  for (const m of t.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z0-9_$]+)/g)) nomes.add(m[1]);
  for (const m of t.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const parte of m[1].split(',')) {
      const nome = parte.trim().split(/\s+as\s+/).pop();
      if (nome) nomes.add(nome);
    }
  }
  if (/export\s+default/.test(t)) nomes.add('default');
  exportados.set(f, nomes);
}

for (const f of jsArquivos) {
  const t = semComentarios(textoDe(f));
  const rel = f.replace(`${RAIZ}/`, '');
  for (const m of t.matchAll(/import\s*(?:([\s\S]*?)\s*from\s*)?['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const alvo = resolve(dirname(f), m[2]);
    if (!existsSync(alvo)) { falha(`${rel}: import não encontrado: ${m[2]}`); continue; }
    const chaves = /\{([^}]*)\}/.exec(m[1] || '');
    if (chaves) {
      for (const parte of chaves[1].split(',')) {
        const nome = parte.trim().split(/\s+as\s+/)[0];
        if (nome && !exportados.get(alvo)?.has(nome)) falha(`${rel}: '${nome}' não é exportado por ${m[2]}`);
      }
    }
  }
  // CSP: nada de handlers inline em HTML escrito nos .js
  if (/\son(click|change|input|submit|load|error)\s*=/.test(t)) falha(`${rel}: handler inline (onclick=...) — o CSP bloqueia`);
  if (/<[a-z][^>]*\sstyle\s*=/.test(t)) falha(`${rel}: atributo style="" inline — o CSP bloqueia (use classes/data-largura)`);
}

// rotas -> telas
const rotas = textoDe(join(PUBLICO, 'js/nucleo/rotas.js'));
for (const m of rotas.matchAll(/import\('(\.\.\/telas\/[^']+)'\)/g)) {
  if (!existsSync(resolve(join(PUBLICO, 'js/nucleo'), m[1]))) falha(`rotas.js: tela inexistente ${m[1]}`);
}
// telas de rota exportam default
for (const m of rotas.matchAll(/import\('\.\.\/telas\/([^']+)'\)/g)) {
  const f = join(PUBLICO, 'js/telas', m[1]);
  if (existsSync(f) && !exportados.get(f)?.has('default')) falha(`telas/${m[1]}: falta export default`);
}

// index.html / manifest / service worker
const indice = textoDe(join(PUBLICO, 'index.html')).replace(/<!--[\s\S]*?-->/g, '');
if (/\sstyle\s*=|\son[a-z]+\s*=/.test(indice)) falha('index.html: estilo/handler inline');
for (const m of indice.matchAll(/(?:href|src)="([^"#:]+)"/g)) {
  if (!existsSync(join(PUBLICO, m[1]))) falha(`index.html: arquivo inexistente ${m[1]}`);
}
const sw = textoDe(join(PUBLICO, 'service-worker.js'));
for (const m of sw.matchAll(/'\.\/([^']+)'/g)) {
  if (!existsSync(join(PUBLICO, m[1]))) falha(`service-worker.js: arquivo inexistente ${m[1]}`);
}
const manifesto = JSON.parse(textoDe(join(PUBLICO, 'manifest.webmanifest')));
for (const i of manifesto.icons || []) {
  if (!existsSync(join(PUBLICO, i.src))) falha(`manifest: ícone inexistente ${i.src}`);
}

if (problemas.length) {
  console.error(`✗ ${problemas.length} problema(s):\n- ${problemas.join('\n- ')}`);
  process.exit(1);
}
console.log(`✓ Projeto consistente (${jsArquivos.length} arquivos JS verificados).`);

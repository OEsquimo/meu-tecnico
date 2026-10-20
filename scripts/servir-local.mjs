// =============================================================================
// SERVIDOR LOCAL — para abrir o app no computador sem instalar nada
// =============================================================================
// Uso:   node scripts/servir-local.mjs [porta]        (padrão: 5173)
// Depois abra:  http://localhost:5173/?demo=1   (modo demonstração, sem Firebase)
//
// Imita o Firebase Hosting: serve a pasta "public/", aplica os MESMOS cabeçalhos
// de segurança do firebase.json (inclusive a política CSP — assim erros de
// "estilo inline" aparecem aqui, antes de publicar) e devolve index.html para
// endereços desconhecidos.
// =============================================================================

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publica = path.join(raiz, 'public');
const porta = Number(process.argv[2]) || 5173;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/** Cabeçalhos globais ("source": "**") do firebase.json. */
function cabecalhosGlobais() {
  try {
    const config = JSON.parse(readFileSync(path.join(raiz, 'firebase.json'), 'utf-8'));
    const regra = (config.hosting?.headers || []).find((h) => h.source === '**');
    return Object.fromEntries((regra?.headers || []).map((h) => [h.key, h.value]));
  } catch {
    return {};
  }
}

const globais = cabecalhosGlobais();

const servidor = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${porta}`);
    let caminho = path.normalize(decodeURIComponent(url.pathname));
    if (caminho.endsWith('/')) caminho += 'index.html';
    let arquivo = path.join(publica, caminho);
    if (!arquivo.startsWith(publica)) {
      res.writeHead(403).end('Proibido');
      return;
    }
    let dados;
    try {
      const info = await stat(arquivo);
      if (info.isDirectory()) arquivo = path.join(arquivo, 'index.html');
      dados = await readFile(arquivo);
    } catch {
      // Como no Hosting: qualquer endereço desconhecido recebe o index.html
      if (path.extname(caminho)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado');
        return;
      }
      arquivo = path.join(publica, 'index.html');
      dados = await readFile(arquivo);
    }
    res.writeHead(200, {
      ...globais,
      'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(dados);
  } catch (erro) {
    res.writeHead(500).end(String(erro));
  }
});

servidor.listen(porta, () => {
  console.log(`Meu Técnico rodando em http://localhost:${porta}/  (modo demonstração: http://localhost:${porta}/?demo=1)`);
});

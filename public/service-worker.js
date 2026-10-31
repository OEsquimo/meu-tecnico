/* =============================================================================
   SERVICE WORKER — deixa o app abrir rápido e funcionar (para consulta) offline
   =============================================================================
   Estratégia:
     * Arquivos do próprio app (HTML/CSS/JS/ícones): "stale-while-revalidate" —
       responde com o que já está guardado e atualiza em segundo plano.
     * SDK do Firebase (gstatic.com): guardado na primeira vez e reaproveitado.
     * Banco de dados / login (firestore.googleapis.com, identitytoolkit...):
       NUNCA passam por aqui — o próprio Firebase cuida do cache dos dados.
     * Navegação: se estiver sem internet, serve o index.html guardado.
   Para forçar todo mundo a baixar de novo, aumente VERSAO_CACHE.
   ========================================================================== */

const VERSAO_CACHE = 'meu-tecnico-v3';
const CACHE_APP = `${VERSAO_CACHE}-app`;
const CACHE_SDK = `${VERSAO_CACHE}-sdk`;

const ARQUIVOS_BASE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/base.css',
  './css/componentes.css',
  './css/telas.css',
  './css/telas-clientes.css',
  './css/telas-servicos.css',
  './css/telas-admin.css',
  './js/principal.js',
  './icones/icone-192.png',
  './icones/icone-512.png',
  './icones/favicon-32.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_APP)
      .then((cache) => cache.addAll(ARQUIVOS_BASE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(
        nomes.filter((n) => !n.startsWith(VERSAO_CACHE)).map((n) => caches.delete(n)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);

  // SDK do Firebase: cache primeiro
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    evento.respondWith(
      caches.open(CACHE_SDK).then(async (cache) => {
        const guardado = await cache.match(pedido);
        if (guardado) return guardado;
        const resposta = await fetch(pedido);
        if (resposta.ok) cache.put(pedido, resposta.clone());
        return resposta;
      }),
    );
    return;
  }

  // Só mexe em arquivos do próprio app
  if (url.origin !== self.location.origin) return;

  // Abrir uma "página": tenta a rede e, sem internet, usa o index.html guardado
  if (pedido.mode === 'navigate') {
    evento.respondWith(
      fetch(pedido).catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))),
    );
    return;
  }

  // Demais arquivos: stale-while-revalidate
  evento.respondWith(
    caches.open(CACHE_APP).then(async (cache) => {
      const guardado = await cache.match(pedido);
      const daRede = fetch(pedido)
        .then((resposta) => {
          if (resposta.ok) cache.put(pedido, resposta.clone());
          return resposta;
        })
        .catch(() => guardado);
      return guardado || daRede;
    }),
  );
});

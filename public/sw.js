// Service worker do PedidoFlow.
//
// CORREÇÃO (PEDIDO 45 — "PWA/offline real"): antes só cacheava 2
// arquivos (manifest + 1 ícone) — recarregar a página sem rede
// simplesmente não funcionava, nenhum offline de verdade existia.
// Agora usa cache EM TEMPO DE EXECUÇÃO (não uma lista fixa de
// arquivos — os bundles do Next.js têm nome com hash que muda a cada
// build, impossível prever de antemão):
//
//   - `/_next/static/**` (JS/CSS com hash, IMUTÁVEL por natureza) →
//     cache-first: uma vez baixado, nunca precisa de rede de novo pra
//     aquele arquivo específico.
//   - Navegação (HTML de página, ex.: abrir /entregador) →
//     network-first com fallback pro cache: tenta a rede primeiro
//     (pra sempre ter a versão mais nova quando há conexão), mas se a
//     rede falhar, serve a ÚLTIMA versão que deu certo — é isto que
//     mantém o app abrindo mesmo sem sinal.
//   - `/api/**` → NUNCA cacheado, sempre rede. Dados de pedido/entrega
//     têm que vir sempre atualizados; cachear isso indiscriminadamente
//     seria mostrar informação desatualizada como se fosse atual.
const CACHE_SHELL = "pedidoflow-shell-v2";
const CACHE_RUNTIME = "pedidoflow-runtime-v2";
const ARQUIVOS_SHELL = ["/manifest.json", "/icons/icon-maskable-512.png", "/icons/icon-192.png", "/icons/icon-512.png"];

// Páginas que precisam continuar abrindo offline depois da primeira
// visita — o entregador é o perfil que realmente trabalha com conexão
// instável na rua (PEDIDO 45: "implementar offline real para perfil
// Entregador"). As demais telas (PDV, Admin) assumem rede — não faz
// sentido operar caixa/estoque sem conexão de verdade com o banco.
const ROTAS_OFFLINE_PRIORITARIAS = ["/entregador", "/entregador/scanear", "/entregador/qrcode", "/entregador/pagamento", "/entregador/carrinho", "/entregador/relatorio"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE_SHELL)
      .then((cache) => cache.addAll(ARQUIVOS_SHELL))
      .then(() =>
        // Pré-aquece o cache das rotas do entregador na instalação —
        // se o entregador nunca abriu uma tela específica antes de
        // perder sinal, ela já está pronta mesmo assim.
        caches.open(CACHE_RUNTIME).then((cache) =>
          Promise.all(
            ROTAS_OFFLINE_PRIORITARIAS.map((rota) =>
              fetch(rota)
                .then((resp) => (resp.ok ? cache.put(rota, resp) : null))
                .catch(() => null)
            )
          )
        )
      )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(chaves.filter((c) => c !== CACHE_SHELL && c !== CACHE_RUNTIME).map((c) => caches.delete(c)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (evento) => {
  const url = new URL(evento.request.url);

  // Nunca intercepta chamadas de API nem outras origens — sempre rede,
  // sem exceção. Dados privados/sensíveis nunca passam pelo cache do SW.
  if (url.pathname.startsWith("/api/") || url.origin !== self.location.origin) return;

  // Só intercepta GET — POST/PATCH/DELETE sempre vão direto pra rede
  // (o SW nunca decide sozinho "responder" uma escrita).
  if (evento.request.method !== "GET") return;

  // Assets do Next.js com hash: cache-first (imutável por natureza —
  // o NOME do arquivo muda se o CONTEÚDO mudar, então servir do cache
  // nunca serve uma versão desatualizada por engano).
  if (url.pathname.startsWith("/_next/static/")) {
    evento.respondWith(
      caches.match(evento.request).then(
        (doCache) =>
          doCache ??
          fetch(evento.request).then((resposta) => {
            if (resposta.ok) {
              const clone = resposta.clone();
              caches.open(CACHE_RUNTIME).then((cache) => cache.put(evento.request, clone));
            }
            return resposta;
          })
      )
    );
    return;
  }

  // Shell estático pré-cacheado (manifest, ícones): cache-first.
  if (ARQUIVOS_SHELL.includes(url.pathname)) {
    evento.respondWith(caches.match(evento.request).then((resp) => resp ?? fetch(evento.request)));
    return;
  }

  // Navegação (abrir uma página): network-first com fallback pro
  // cache. Só guarda no cache de execução as rotas prioritárias do
  // entregador — não enche o cache com toda página que alguém visitou
  // uma vez (Admin, PDV etc. não precisam funcionar offline).
  if (evento.request.mode === "navigate") {
    const prioritaria = ROTAS_OFFLINE_PRIORITARIAS.some((rota) => url.pathname === rota || url.pathname.startsWith(`${rota}/`));
    evento.respondWith(
      fetch(evento.request)
        .then((resposta) => {
          if (resposta.ok && prioritaria) {
            const clone = resposta.clone();
            caches.open(CACHE_RUNTIME).then((cache) => cache.put(evento.request, clone));
          }
          return resposta;
        })
        .catch(() => caches.match(evento.request).then((doCache) => doCache ?? caches.match("/entregador")))
    );
  }
});

/**
 * Hook de inicialização do Next.js — roda UMA VEZ quando o processo do
 * servidor sobe (https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation).
 *
 * PEDIDO 63 ("tempo real"): o sistema de eventos em tempo real (SSE —
 * `src/lib/eventos-tempo-real.ts`) usa um `EventEmitter` em memória.
 * Funciona perfeitamente com UM processo Node — não funciona entre
 * múltiplos processos/workers (PM2 modo cluster, múltiplas instâncias
 * atrás de um load balancer): um evento emitido no processo A nunca
 * chega em quem está conectado via SSE no processo B.
 *
 * Implementar um pub/sub de verdade (Postgres LISTEN/NOTIFY ou Redis)
 * ficou fora do escopo desta correção — é uma mudança de arquitetura
 * maior, arriscada de fazer sem um ambiente pra testar de verdade. Em
 * vez de fingir que resolvi, este aviso GARANTE que o problema apareça
 * claramente no log assim que alguém tentar rodar em modo cluster, em
 * vez de falhar silenciosamente (eventos "sumindo" às vezes, dependendo
 * de qual processo atende cada aba).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  conferirVariaveisObrigatorias();

  const indicadoresMultiProcesso = [
    // PM2 em modo cluster define isto com o índice da instância.
    process.env.NODE_APP_INSTANCE,
    // PM2 também define isto.
    process.env.pm_id,
    // Comum em orquestradores atrás de load balancer com >1 réplica.
    process.env.WEB_CONCURRENCY && Number(process.env.WEB_CONCURRENCY) > 1 ? process.env.WEB_CONCURRENCY : undefined,
  ].filter(Boolean);

  if (indicadoresMultiProcesso.length > 0) {
    console.warn(
      "\n⚠️  ATENÇÃO — possível deploy com MAIS DE UM PROCESSO detectado.\n" +
        "   O PedidoFlow usa eventos em tempo real (SSE) baseados em memória\n" +
        "   de UM ÚNICO PROCESSO (ver src/lib/eventos-tempo-real.ts, PEDIDO 63).\n" +
        "   Em modo cluster/múltiplas instâncias, atualizações em tempo real\n" +
        "   (cozinha, mesas, entregas, impressão) podem não chegar a todo\n" +
        "   mundo — dependendo de qual processo atende cada conexão.\n" +
        "   Rode como UM ÚNICO processo Node (sem PM2 cluster, sem múltiplas\n" +
        "   réplicas) até um pub/sub compartilhado (Redis/Postgres LISTEN-\n" +
        "   NOTIFY) ser implementado.\n"
    );
  }
}

/**
 * Conferência de ambiente na SUBIDA do processo — falha alto, cedo e com
 * mensagem clara, em vez de quebrar no meio de um atendimento.
 *
 * POR QUE ISTO EXISTE: as variáveis abaixo não são "opcionais com
 * fallback"; sem elas o sistema sobe normalmente e só quebra quando
 * alguém tenta usar a funcionalidade — no meio de um pedido real. O caso
 * mais perigoso é `SECRETS_MASTER_KEY`: ela é a chave AES que decifra
 * token do WhatsApp, credenciais fiscais e DATABASE_URL de tenant
 * dedicado. Se ela vier vazia (ou DIFERENTE da usada quando os segredos
 * foram gravados), tudo isso vira lixo indecifrável — e o erro só
 * aparece na primeira mensagem de cliente ou na primeira nota fiscal.
 */
function conferirVariaveisObrigatorias() {
  const producao = process.env.NODE_ENV === "production";
  const faltando: string[] = [];
  const avisos: string[] = [];

  if (!process.env.DATABASE_URL) faltando.push("DATABASE_URL — conexão com o PostgreSQL.");

  const chaveMestra = process.env.SECRETS_MASTER_KEY ?? "";
  if (!chaveMestra) {
    faltando.push(
      "SECRETS_MASTER_KEY — chave AES do cofre de segredos (token do WhatsApp, credenciais fiscais, banco dedicado). Gere com: openssl rand -hex 32"
    );
  } else if (chaveMestra.length < 32) {
    faltando.push("SECRETS_MASTER_KEY está curta demais (mínimo 32 caracteres). Gere com: openssl rand -hex 32");
  }

  // Rotas de emergência: ligadas sem token forte é pior que desligadas.
  if (process.env.EMERGENCIA_HABILITADA === "1" && (process.env.EMERGENCIA_TOKEN ?? "").length < 32) {
    faltando.push("EMERGENCIA_HABILITADA=1 exige EMERGENCIA_TOKEN com 32+ caracteres (ou remova EMERGENCIA_HABILITADA).");
  }
  if (producao && process.env.EMERGENCIA_HABILITADA === "1") {
    avisos.push(
      "EMERGENCIA_HABILITADA=1 em PRODUÇÃO. As rotas /api/emergencia/* estão abertas para quem tiver o token. Desligue assim que terminar de usar."
    );
  }

  if (producao && !process.env.APP_URL) {
    avisos.push("APP_URL não definida — links em e-mails de recuperação de senha podem sair errados.");
  }
  if (producao && process.env.DEMO_MODE === "1") {
    avisos.push("DEMO_MODE=1 em produção. Confirme se é isso mesmo que você quer.");
  }

  for (const aviso of avisos) console.warn(`⚠️  ${aviso}`);

  if (faltando.length > 0) {
    const texto =
      "\n❌ Variáveis de ambiente obrigatórias ausentes ou inválidas:\n" +
      faltando.map((f) => `   - ${f}`).join("\n") +
      "\n\nVeja .env.example. O processo NÃO vai subir assim: melhor falhar\n" +
      "no deploy do que no meio de um pedido de cliente.\n";
    console.error(texto);
    if (producao) throw new Error("Configuração de ambiente incompleta — veja o log acima.");
  }
}

/**
 * Deduplicador em memória de eventos/webhooks — idempotência (PEDIDO:
 * auditoria de segurança — ALTO).
 *
 * A Meta reenvia um webhook se não receber 200 a tempo (ou em retries),
 * e um mesmo payload pode chegar 2x. Sem deduplicação, um pedido real
 * seria criado DUAS vezes. A chave é o `wamid` (id globalmente único da
 * mensagem WhatsApp).
 *
 * Adequado para uma instância única (mesma premissa do rate-limit de
 * `src/lib/rate-limit.ts`). Para múltiplas instâncias, troque o Map por
 * Redis (mesma assinatura). Marcamos ANTES de processar: se o processo
 * cair no meio, o reenvio é ignorado — melhor duplicar uma mensagem do
 * que criar um pedido duplicado.
 */
const TTL_PADRAO_MS = 24 * 60 * 60 * 1000; // reenvios da Meta ocorrem em minutos/horas
const processados = new Map<string, number>();

// Limpa entradas antigas periodicamente para não vazar memória.
setInterval(() => {
  const agora = Date.now();
  for (const [chave, marcadoEm] of processados) {
    if (agora - marcadoEm >= TTL_PADRAO_MS) processados.delete(chave);
  }
}, 5 * 60 * 1000).unref?.();

/**
 * Retorna `true` se `chave` já foi vista na janela (evento duplicado —
 * deve ser ignorado). Na primeira ocorrência, marca e retorna `false`.
 */
export function eventoJaProcessado(chave: string, ttlMs: number = TTL_PADRAO_MS): boolean {
  const agora = Date.now();
  const marcadoEm = processados.get(chave);
  if (marcadoEm !== undefined && agora - marcadoEm < ttlMs) return true;
  processados.set(chave, agora);
  return false;
}

/** Número de eventos atualmente marcados (diagnóstico). */
export function tamanhoFilaProcessados(): number {
  return processados.size;
}

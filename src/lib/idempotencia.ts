/**
 * Chaves de idempotência — formato único, compartilhado por servidor e
 * cliente (PDV, garçom, delivery).
 *
 * REGRA (itens 1 e 2 da auditoria): a chave é um UUID v4 gerado por
 * TENTATIVA de envio, nunca derivada do conteúdo (pedido+valor+forma).
 * Uma chave derivada do conteúdo faria dois eventos LEGÍTIMOS e idênticos
 * — duas pessoas pagando R$50 em dinheiro na mesma conta, ou dois pedidos
 * iguais de balcão em sequência — colidirem, e o segundo sumiria.
 */

/** UUID v4 conforme RFC 4122 (versão 4, variante 8/9/a/b). */
export const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ehUuidV4(valor: unknown): boolean {
  return typeof valor === "string" && UUID_V4_REGEX.test(valor.trim());
}

/**
 * Gera um UUID v4 para usar como chave de idempotência.
 *
 * Usa `crypto.randomUUID()` quando disponível (browsers modernos e
 * Node ≥ 19 em contexto seguro). O fallback NÃO é "qualquer string
 * aleatória": ele monta um UUID v4 formalmente válido a partir de
 * `crypto.getRandomValues`, porque o servidor REJEITA (400) qualquer
 * chave que não seja UUID v4 — um fallback com formato livre faria o
 * pedido/pagamento falhar exatamente nos navegadores mais antigos, que
 * são os que mais precisam de proteção contra retry.
 */
export function novaChaveIdempotencia(): string {
  const c: Crypto | undefined = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // versão 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

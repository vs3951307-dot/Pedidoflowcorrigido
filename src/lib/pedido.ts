/**
 * Tipos de pedido e formas de pagamento — fonte única usada pelo PDV
 * (venda, salão, retirada, caixa) e pelo Garçom.
 *
 * Enums estáticos deliberadamente (não vêm de API): são as mesmas opções
 * em todo o sistema, e mudam junto com regra de negócio/schema (não são
 * "configuração da empresa"). O backend valida contra estes mesmos
 * valores (`src/lib/schemas/*`) — mudar aqui exige mudar lá também.
 */

export const TIPOS_PEDIDO = [
  { value: "balcao", label: "Balcão" },
  { value: "viagem", label: "Viagem" },
  { value: "delivery", label: "Delivery" },
] as const;

export type TipoPedido = (typeof TIPOS_PEDIDO)[number]["value"];

export const FORMAS_PAGAMENTO = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
  { value: "pix", label: "Pix" },
] as const;

export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number]["value"];

/** Rótulo amigável de uma forma de pagamento ("pix" → "Pix"). */
export function rotuloFormaPagamento(forma: FormaPagamento) {
  return FORMAS_PAGAMENTO.find((f) => f.value === forma)?.label ?? forma;
}

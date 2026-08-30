/**
 * Regra única de precificação de item de pedido — usada tanto pelo PDV
 * (`api/pedidos/route.ts`) quanto pelo motor do atendente WhatsApp
 * (`lib/atendente/motor.ts`). Nunca confia em preço vindo do cliente:
 * a base sempre vem do cadastro (produto/tamanho) e os adicionais do
 * cadastro de adicionais.
 */
export interface TamanhoComPreco {
  nome: string;
  valor: number;
}

export interface AdicionalComPreco {
  nome: string;
  /** Preço UNITÁRIO do adicional (do cadastro) — nunca já multiplicado. */
  preco: number;
  /**
   * Quantas vezes o adicional foi pedido (ex.: bacon 3x). Ausente = 1.
   *
   * CORREÇÃO (bug confirmado): antes esta função só somava `preco`, e o
   * cliente compensava mandando `preco * quantidade` — mas o servidor
   * SEMPRE recalcula o preço pelo cadastro e descartava esse valor, então
   * 3x bacon era cobrado como 1x. A quantidade agora é parte do contrato.
   */
  quantidade?: number;
}

export function calcularPrecoItem(params: {
  precoBaseProduto: number;
  tamanho?: TamanhoComPreco | null;
  adicionais: AdicionalComPreco[];
}): number {
  const base = params.tamanho ? params.tamanho.valor : params.precoBaseProduto;
  const totalAdicionais = params.adicionais.reduce(
    (soma, a) => soma + a.preco * Math.max(1, Math.floor(a.quantidade ?? 1)),
    0
  );
  return Math.round((base + totalAdicionais) * 100) / 100;
}

export function calcularTotalItens(itens: { precoUnit: number; quantidade: number }[]): number {
  return Math.round(itens.reduce((acc, i) => acc + i.precoUnit * i.quantidade, 0) * 100) / 100;
}

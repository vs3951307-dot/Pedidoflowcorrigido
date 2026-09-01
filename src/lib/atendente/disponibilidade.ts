/**
 * Disponibilidade de produto por estoque (ficha técnica — PEDIDO 21).
 *
 * Consulta a tabela ponte `ProdutoInsumo` para saber se um produto PODE
 * ser fabricado com o estoque atual.Produtos SEM ficha técnica são
 * considerados disponíveis (sem controle de insumo).
 *
 * Segurança: NUNCA decrementa estoque — apenas LE. O débito real acontece
 * apenas quando o pedido é confirmado (src/lib/pedidos/criar-pedido.ts).
 */

import { prisma } from "@/lib/prisma";

export interface ResultadoDisponibilidade {
  /** true se o produto pode ser feito agora. */
  disponivel: boolean;
  /** Motivo da indisponibilidade (ex.: "Estoque baixo de Molho de Tomate"). */
  motivo?: string;
  /** Lista de insumos e seus estoques (preenchida quando há ficha técnica). */
  insumos?: {
    nome: string;
    quantidadeAtual: number;
    quantidadeMinima: number;
    unidade: string;
  }[];
}

/**
 * Verifica se um produto pode ser fabricado com o estoque atual.
 *
 * - Sem registros em ProdutoInsumo → retorna `{ disponivel: true }`
 *   (produto sem controle de estoque por ingrediente).
 * - Com ficha técnica → verifica CADA insumo: se `quantidade` >= `minimo`.
 *   Se algum estiver abaixo, retorna `{ disponivel: false, motivo }`.
 */
export async function verificarDisponibilidade(
  empresaId: string,
  produtoId: string
): Promise<ResultadoDisponibilidade> {
  const vinculos = await prisma.produtoInsumo.findMany({
    where: { empresaId, produtoId },
    include: {
      estoqueProduto: {
        select: {
          id: true,
          nome: true,
          quantidade: true,
          minimo: true,
          unidade: true,
          ativo: true,
        },
      },
    },
  });

  // Sem ficha técnica → assume disponível (sem controle de ingrediente).
  if (vinculos.length === 0) {
    return { disponivel: true };
  }

  const insumos = vinculos.map((v) => ({
    nome: v.estoqueProduto.nome,
    quantidadeAtual: v.estoqueProduto.quantidade,
    quantidadeMinima: v.estoqueProduto.minimo,
    unidade: v.estoqueProduto.unidade,
  }));

  // Verifica cada insumo: estoque atual >= mínimo E item ativo.
  for (const v of vinculos) {
    const ep = v.estoqueProduto;
    if (!ep.ativo) {
      return {
        disponivel: false,
        motivo: `${ep.nome} está fora de estoque`,
        insumos,
      };
    }
    if (ep.quantidade < ep.minimo) {
      return {
        disponivel: false,
        motivo: `Estoque baixo de *${ep.nome}* (${ep.quantidade} ${ep.unidade}, mínimo ${ep.minimo})`,
        insumos,
      };
    }
  }

  return { disponivel: true, insumos };
}

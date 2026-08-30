/**
 * Reexporta os tipos do módulo PDV a partir das fontes únicas reais:
 * cardápio em `src/lib/catalogo.ts` (dados de `GET /api/catalogo`) e
 * tipos de pedido/pagamento em `src/lib/pedido.ts`. Este arquivo existe só
 * para não quebrar imports antigos que apontam para `mock-data` — não tem
 * mock nenhum, é puro re-export de tipos.
 */

export {
  CATEGORIAS,
  PRODUTOS,
  type Categoria,
  type ItemPedido,
  type Produto,
} from "@/lib/catalogo";

export {
  FORMAS_PAGAMENTO,
  TIPOS_PEDIDO,
  type FormaPagamento,
  type TipoPedido,
} from "@/lib/pedido";

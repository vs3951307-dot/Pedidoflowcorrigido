/**
 * Reexporta os tipos do módulo Garçom a partir das fontes únicas reais:
 * cardápio em `src/lib/catalogo.ts` e mesas em `src/lib/mesas.ts` (dados
 * de `GET /api/catalogo` e `GET /api/mesas`). Este arquivo existe só para
 * não quebrar imports antigos que apontam para `mock-data` — não tem mock
 * nenhum, é puro re-export de tipos.
 */

export {
  CATEGORIAS,
  PRODUTOS,
  type Categoria,
  type ItemPedido,
  type Produto,
} from "@/lib/catalogo";

export { MESAS_INICIAIS, type Mesa } from "@/lib/mesas";

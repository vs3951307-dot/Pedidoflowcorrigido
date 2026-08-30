/**
 * Catálogo compartilhado do PedidoFlow — fonte única de TIPOS de produtos,
 * categorias e itens usados pelos módulos PDV, Garçom e demais.
 *
 * Os dados de verdade vêm de `GET /api/catalogo` (Prisma → Postgres); os
 * `PRODUTOS`/`CATEGORIAS` abaixo são só o estado vazio inicial usado como
 * fallback do `useApi` até a resposta real chegar.
 */

export interface Produto {
  id: string;
  nome: string;
  descricao: string;
  preco: number;
  categoria: string;
  emoji: string;
  ativo?: boolean;
  destaque?: boolean;
  /** Foto real do produto (upload) — quando ausente, usa `emoji`. */
  fotoUrl?: string | null;
  /** Sabores disponíveis (pizzas). */
  sabores?: SaborPizza[];
  /** Tamanhos com preços (pizzas/porções). */
  tamanhos?: TamanhoPizza[];
  /** Adicionais/acréscimos (borda recheada, extra queijo etc.). */
  adicionais?: AdicionalPizza[];
}

export interface CategoriaDetalhada {
  id: string;
  nome: string;
  ordem: number;
  /** Grupo de sabores (pizza): usado para agrupar categorias de pizza. */
  grupoSabores?: string | null;
}

export interface SaborPizza {
  id: string;
  nome: string;
  tipo?: "tradicional" | "especial" | "doce";
}

export interface TamanhoPizza {
  id: string;
  nome: string;
  preco: number;
  fatorPreco?: number;
  /** Limite de sabores deste tamanho (vem do banco: Tamanho.maxSabores). */
  maxSabores?: number;
}

export interface AdicionalPizza {
  id: string;
  nome: string;
  /** Preço UNITÁRIO do adicional (do cadastro) — nunca já multiplicado. */
  preco: number;
  /** Quantas vezes foi pedido (bacon 2x). Ausente = 1. O servidor
   *  recalcula o preço pelo cadastro e multiplica por esta quantidade. */
  quantidade?: number;
}

export interface ItemPedido {
  /** Id único da linha no pedido (não do produto — o mesmo produto pode
   * aparecer em duas linhas se tiver observações diferentes). */
  uid: string;
  produtoId: string;
  nome: string;
  precoUnit: number;
  quantidade: number;
  observacao?: string;
  /** Tamanho escolhido (pizza/porção). */
  tamanhoId?: string;
  tamanhoNome?: string;
  /** Sabores escolhidos (até 3 para Família, até 2 para outros). */
  sabores?: SaborPizza[];
  /** Adicionais escolhidos (acréscimo). */
  adicionais?: AdicionalPizza[];
}

/** Escolha de uma pizza/porção vinda do `PizzaPickerDialog` (sem o uid da linha). */
export type SelecaoPizza = Omit<ItemPedido, "uid">;

/**
 * Nomes de categoria vêm do banco (GET /api/catalogo). Sem lista fixa de
 * exemplo — cada empresa tem seu próprio cardápio.
 */
export const CATEGORIAS: readonly string[] = [];

export type Categoria = string;

/**
 * Limite de sabores por tamanho NÃO é mais hardcoded aqui: vem de
 * `Tamanho.maxSabores` no banco (ETAPA 1). O front lê `tamanho.maxSabores`
 * do catálogo. Mantém-se um fallback defensivo caso o dado não venha.
 */
export const MAX_SABORES_PADRAO = 2;

/**
 * Gera um uid único para uma linha de pedido.
 */
export function criarUid(produtoId: string) {
  return `${produtoId}-${Date.now()}-${Math.random()}`;
}

/** Soma o total em reais e a quantidade de itens de um pedido. */
export function calcularTotais(itens: ItemPedido[]) {
  return itens.reduce(
    (acc, i) => ({
      total: acc.total + i.precoUnit * i.quantidade,
      totalItens: acc.totalItens + i.quantidade,
    }),
    { total: 0, totalItens: 0 }
  );
}

/**
 * Catalogo APIs:
 *
 * - `categorias`: nomes únicos de produto que existem na empresa (vindos de GET /api/catalogo)
 * - `categoriasDetalhadas`: categorias com id/ordem (vindos de GET /api/catalogo)
 * - `produtos`: listagens completas de produtos para esta empresa (vindos de GET /api/catalogo)
 */
export interface CatalogoApi {
  categorias: string[];
  categoriasDetalhadas: CategoriaDetalhada[];
  produtos: Produto[];
  adicionais: AdicionalPizza[];
}

/**
 * Placeholder para catálogo de produto — sem dados de exemplo, vem do backend.
 * Deve ser importado por hooks como `useApi<CatalogoApi>` que buscam /api/catalogo.
 */
export const PRODUTOS: Produto[] = [];

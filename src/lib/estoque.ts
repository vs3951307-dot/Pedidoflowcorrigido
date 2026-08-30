/**
 * Estoque — tipos e valores-padrão (vazios) usados como fallback enquanto
 * `GET /api/estoque` e `GET /api/estoque/movimentacoes` carregam ou se
 * falharem. Nunca preencha estas constantes com dado de exemplo: um
 * fallback "realista" (fornecedor, valor, produto fictícios) é
 * indistinguível de dado real para quem está usando o sistema de verdade.
 */

export type StatusEstoque = "ok" | "baixo" | "esgotado";

export type StatusEntrada = "recebido" | "pendente" | "cancelada";

export type StatusNotaFiscal = "conferida" | "pendente" | "cancelada";

export interface ProdutoEstoque {
  id: string;
  nome: string;
  categoria: string;
  unidade: string;
  /** Quantidade disponível hoje. */
  estoque: number;
  /** Ponto de reposição — abaixo disso o item fica em alerta. */
  minimo: number;
  custoUnitario: number;
  /** Ativar/desativar sem apagar histórico de movimentações. */
  ativo: boolean;
  /** Caminho público da foto, quando cadastrada. */
  fotoUrl?: string | null;
  /** Se o produto já tem foto cadastrada (aba Fotos). */
  temFoto: boolean;
}

export interface EntradaEstoque {
  id: string;
  data: string;
  produto: string;
  quantidade: number;
  unidade: string;
  fornecedor: string;
  custoUnitario: number;
  valorTotal: number;
  responsavel: string;
  status: StatusEntrada;
}

export interface NotaFiscalEntrada {
  numero: string;
  serie: string;
  fornecedor: string;
  emissao: string;
  itens: number;
  valor: number;
  status: StatusNotaFiscal;
}

export interface CategoriaEstoque {
  categoria: string;
  valor: number;
  cor: string;
}

export interface ResumoEstoque {
  label: string;
  valor: string;
  hint?: string;
  tendencia?: { value: string; positive: boolean };
}

/** Sem dado de exemplo: fica vazio até a resposta real de `GET /api/estoque`. */
export const RESUMO_ESTOQUE: ResumoEstoque[] = [];

/** Sem dado de exemplo: fica vazio até a resposta real de `GET /api/estoque`. */
export const PRODUTOS_ESTOQUE: ProdutoEstoque[] = [];

/** Sem dado de exemplo: fica vazio até a resposta real de `GET /api/estoque`. */
export const VALOR_POR_CATEGORIA: CategoriaEstoque[] = [];

/** Sem dado de exemplo: fica vazio até a resposta real de `GET /api/estoque/movimentacoes`. */
export const ENTRADAS_ESTOQUE: EntradaEstoque[] = [];

/** Sem dado de exemplo: fica vazio até existir integração com NF-e de entrada. */
export const NOTAS_FISCAIS: NotaFiscalEntrada[] = [];

/**
 * Relatórios do Administrador — contratos de dados por canal (Delivery,
 * Salão, Retirada) e por tema (Financeiro, Produtos, Entregadores).
 *
 * Os valores vêm do backend (`GET /api/relatorios?visao=...`); nada aqui
 * é dado de exemplo — os arrays ficam vazios e cada tela mostra estado
 * vazio de verdade quando a API não retorna dados.
 */

export interface ResumoRelatorio {
  label: string;
  /** Já formatado para exibição (ex.: "R$ 9.842,00"). */
  valor: string;
  hint?: string;
  tendencia?: { value: string; positive: boolean };
}

/* ------------------------------- Delivery ------------------------------- */

export type StatusEntrega = "entregue" | "rota" | "preparo";

export interface EntregaDia {
  dia: string;
  pedidos: number;
  valor: number;
  tempoMedio: number;
}

export interface EntregaBairro {
  bairro: string;
  pedidos: number;
  valor: number;
  tempoMedio: number;
}

export interface EntregaRecente {
  id: string;
  hora: string;
  cliente: string;
  bairro: string;
  endereco: string;
  entregador: string;
  valor: number;
  status: StatusEntrega;
  tempo: number;
}

export const RESUMO_DELIVERY: ResumoRelatorio[] = [];

export const ENTREGAS_POR_DIA: EntregaDia[] = [];

export const ENTREGAS_POR_BAIRRO: EntregaBairro[] = [];

export const ULTIMAS_ENTREGAS: EntregaRecente[] = [];

/* --------------------------------- Salão -------------------------------- */

export type StatusMesaRelatorio = "ocupada" | "livre" | "reservada";

export interface MesaDesempenho {
  mesa: string;
  pedidos: number;
  valor: number;
  tempoMedio: number;
  status: StatusMesaRelatorio;
}

export const RESUMO_SALAO: ResumoRelatorio[] = [];

export const SALAO_VENDAS_POR_HORARIO: { hora: string; valor: number }[] = [];

export const OCUPACAO_SALAO = [];

export const SALAO_MESAS: MesaDesempenho[] = [];

/* -------------------------------- Retirada ------------------------------ */

export type StatusRetirada = "pronta" | "preparo" | "retirada" | "cancelada";

export interface RetiradaDia {
  dia: string;
  pedidos: number;
  valor: number;
}

export interface RetiradaRecente {
  id: string;
  hora: string;
  cliente: string;
  itens: number;
  valor: number;
  status: StatusRetirada;
  tempoPreparo: number;
}

export const RESUMO_RETIRADA: ResumoRelatorio[] = [];

export const RETIRADAS_POR_DIA: RetiradaDia[] = [];

export const RETIRADAS_STATUS = [];

export const ULTIMAS_RETIRADAS: RetiradaRecente[] = [];

/* ------------------------------- Financeiro ------------------------------ */

export type TipoLancamento = "entrada" | "saida";

export interface Lancamento {
  data: string;
  descricao: string;
  categoria: string;
  tipo: TipoLancamento;
  valor: number;
}

export interface DiaFluxo {
  label: string;
  receitas: number;
  despesas: number;
}

export interface CategoriaDespesa {
  categoria: string;
  valor: number;
  cor: string;
}

export const RESUMO_FINANCEIRO: ResumoRelatorio[] = [];

export const FLUXO_14_DIAS: DiaFluxo[] = [];

export const DESPESAS_POR_CATEGORIA: CategoriaDespesa[] = [];

export const LANCAMENTOS: Lancamento[] = [];

/* -------------------------------- Produtos ------------------------------- */

export interface CategoriaProduto {
  categoria: string;
  itens: number;
  faturamento: number;
  cor: string;
}

export interface ProdutoPeriodo {
  nome: string;
  categoria: string;
  vendas: number;
  faturamento: number;
}

export const RESUMO_PRODUTOS: ResumoRelatorio[] = [];

export const PRODUTOS_POR_CATEGORIA: CategoriaProduto[] = [];

export const TOP_PRODUTOS_PERIODO: ProdutoPeriodo[] = [];

/* ------------------------------- Entregadores ---------------------------- */

export type StatusEntregador = "ativo" | "rota" | "folga";

export interface EntregadorDesempenho {
  nome: string;
  entregas: number;
  km: number;
  tempoMedio: number;
  gorjetas: number;
  avaliacao: number;
  status: StatusEntregador;
}

export const RESUMO_ENTREGADORES: ResumoRelatorio[] = [];

export const ENTREGADORES_RANKING: EntregadorDesempenho[] = [];

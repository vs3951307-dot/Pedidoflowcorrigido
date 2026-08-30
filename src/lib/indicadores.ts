/**
 * Tipos do Dashboard do Administrador. Os DADOS vêm sempre de
 * `GET /api/dashboard` (ver `src/app/admin/page.tsx`) — este arquivo não
 * exporta nenhum valor, só os formatos, para não repetir o erro anterior de
 * ter aqui números de exemplo realistas o bastante para passar por reais.
 */

export interface KpiDashboard {
  chave: string;
  label: string;
  /** Já formatado para exibição (ex.: "R$ 4.872,50"). */
  valor: string;
  hint?: string;
  /** Variação vs. período anterior — `value` já formatado (ex.: "12,4%"). */
  tendencia?: { value: string; positive: boolean };
}

export interface PontoHora {
  hora: string;
  valor: number;
}

export interface SerieDia {
  label: string;
  faturamento: number;
  pedidos: number;
}

export interface FatiaMix {
  chave: string;
  rotulo: string;
  valor: number;
  /** Cor hexa dos tokens do Design System (ver tailwind.config.ts). */
  cor: string;
}

export interface ProdutoTop {
  nome: string;
  vendas: number;
}

export type StatusPedidoDashboard = "concluido" | "andamento" | "pendente" | "cancelado";

export interface PedidoRecente {
  id: string;
  hora: string;
  cliente: string;
  itens: number;
  valor: number;
  status: StatusPedidoDashboard;
}

/**
 * Mesas e status do salão — fonte única de TIPOS usada pelos módulos PDV
 * e Garçom.
 *
 * Os dados de verdade vêm de `GET /api/mesas` (Prisma → Postgres); o
 * `MESAS` abaixo é só o estado vazio inicial usado como fallback do
 * `useApi` até a resposta real chegar.
 */

export type TableStatus = "livre" | "aguardando" | "enviado" | "conta" | "ocupada";

export interface Mesa {
  id: number;
  status: TableStatus;
  /** Lugares da mesa (configurados na aba "Mesas" de Configurações). */
  capacidade?: number;
  /** Minutos desde a abertura da mesa (undefined quando "livre").
   * Mesas abertas nesta sessão usam `abertaEm` (timestamp real); as do mock
   * usam `elapsedMinutes` fixo por enquanto. */
  elapsedMinutes?: number;
  /** Timestamp (Date.now()) de quando a mesa foi aberta nesta sessão. */
  abertaEm?: number;
  pessoas?: number;
  garcom?: string;
}

/** As mesas vêm do backend (GET /api/mesas) — nenhuma mesa de exemplo. */
export const MESAS_INICIAIS: Mesa[] = [];

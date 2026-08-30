import { assinarEventosTempoReal, emitirEventoTempoReal } from "@/lib/eventos-tempo-real";

/**
 * Compat: painel da cozinha (KDS) — PEDIDO 15, adaptado para multiempresa.
 *
 * Qualquer mudança que afete a produção (pedido criado, status de
 * produção alterado, pedido pago/entregue) chama `emitirMudancaKds(empresaId)`;
 * a rota SSE `/api/kds/eventos` escuta (apenas da MESMA empresa) e avisa
 * os painéis abertos.
 */

export function emitirMudancaKds(empresaId: string) {
  emitirEventoTempoReal(empresaId, "kds");
  emitirEventoTempoReal(empresaId, "pedido");
}

/** Assina mudanças de produção da empresa; retorna a função para cancelar. */
export function assinarMudancaKds(empresaId: string, aoMudar: () => void): () => void {
  return assinarEventosTempoReal(empresaId, () => aoMudar());
}

import { EventEmitter } from "node:events";

/**
 * Pub/sub em memória para sincronização em tempo real (SSE) — agora
 * multiempresa. Cada evento é publicado em um canal isolado por
 * `empresaId`: uma empresa NUNCA recebe eventos de outra (mesmo
 * processo, mesma instância — o isolamento é pelo nome do canal).
 *
 * Único processo (instância local) — suficiente para o app standalone.
 * Se no futuro a plataforma rodar em múltiplas instâncias, trocar este
 * EventEmitter por um pub/sub externo (Redis, etc.) mantendo a mesma
 * assinatura (`emitirEventoTempoReal` / `assinarEventosTempoReal`).
 */

export type TopicoEvento = "kds" | "mesa" | "entrega" | "impressao" | "pedido";

export interface EventoTempoReal {
  topico: TopicoEvento;
  dados?: unknown;
}

const emissor = new EventEmitter();
// Muitas conexões SSE simultâneas (uma por dispositivo/aba) são normais.
emissor.setMaxListeners(0);

function canalDaEmpresa(empresaId: string) {
  return `empresa:${empresaId}`;
}

export function emitirEventoTempoReal(empresaId: string, topico: TopicoEvento, dados?: unknown) {
  emissor.emit(canalDaEmpresa(empresaId), { topico, dados } satisfies EventoTempoReal);
}

/** Assina eventos de UMA empresa; retorna a função para cancelar. */
export function assinarEventosTempoReal(
  empresaId: string,
  aoReceber: (evento: EventoTempoReal) => void
): () => void {
  const canal = canalDaEmpresa(empresaId);
  emissor.on(canal, aoReceber);
  return () => {
    emissor.off(canal, aoReceber);
  };
}

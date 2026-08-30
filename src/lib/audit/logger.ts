/**
 * Logger de Auditoria
 * 
 * Registra eventos críticos do sistema para rastreamento e conformidade.
 * Em modo PILOTO, dados são marcados para filtragem em relatórios financeiros.
 */
import { getPilotModeStatus } from "@/lib/pilot/mode";

interface DadosAuditivos {
  evento: string;
  usuarioId?: string;
  empresaId: string;
  pedidoId?: string;
  pagamentoId?: string;
  detalhes?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

export function logAuditoria(dados: DadosAuditivos): void {
  const { enabled } = getPilotModeStatus();
  const registro: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    evento: dados.evento,
    usuarioId: dados.usuarioId,
    empresaId: dados.empresaId,
    pedidoId: dados.pedidoId,
    pagamentoId: dados.pagamentoId,
    detalhes: dados.detalhes,
    ip: dados.ip,
    userAgent: dados.userAgent,
  };

  // Em modo piloto, adiciona marcação para identificação posterior
  if (enabled) {
    (registro as Record<string, unknown>).modoPiloto = true;
    (registro as Record<string, unknown>).observacao = "[TESTE] - Dados não devem ser incluídos em relatórios financeiros";
  }

  // Log no console (em produção seria enviado a um serviço de observabilidade)
  // eslint-disable-next-line no-console
  console.log(`[AUDIT] ${dados.evento}`, registro);
}

/**
 * Log de criação de pedido
 */
export function logPedidoCriado(empresaId: string, usuarioId: string, pedidoId: string, canal: string): void {
  logAuditoria({
    evento: "PEDIDO_CRIADO",
    usuarioId,
    empresaId,
    pedidoId,
    detalhes: { canal },
  });
}

/**
 * Log de atualização de status de pedido
 */
export function logPedidoStatusAtualizado(empresaId: string, usuarioId: string, pedidoId: string, statusAnterior: string, statusNovo: string): void {
  logAuditoria({
    evento: "PEDIDO_STATUS_ATUALIZADO",
    usuarioId,
    empresaId,
    pedidoId,
    detalhes: { statusAnterior, statusNovo },
  });
}

/**
 * Log de confirmação de pagamento
 */
export function logPagamentoConfirmado(empresaId: string, usuarioId: string, pagamentoId: string, forma: string): void {
  logAuditoria({
    evento: "PAGAMENTO_CONFIRMADO",
    usuarioId,
    empresaId,
    pagamentoId,
    detalhes: { forma },
  });
}

/**
 * Log de exclusão/cancelamento de pedido
 */
export function logPedidoCancelado(empresaId: string, usuarioId: string, pedidoId: string, motivo: string): void {
  logAuditoria({
    evento: "PEDIDO_CANCELADO",
    usuarioId,
    empresaId,
    pedidoId,
    detalhes: { motivo },
  });
}
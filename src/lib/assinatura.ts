/**
 * Lógica central de ASSINATURA + CARÊNCIA (PEDIDO: "carência de 7 dias
 * corridos antes de bloquear empresa vencida").
 *
 * Antes, o bloqueio por vencimento era BINÁRIO: se `vencimentoEm` já
 * tivesse passado, a empresa era bloqueada na hora — sem carência, sem
 * aviso. A regra comercial exige 7 DIAS CORRIDOS de tolerância após o
 * vencimento antes de efetivamente suspender o uso normal:
 *
 *   vencimentoEm = 10/09
 *   carenciaAte  = 16/09 (10/09 + 7 dias)
 *   até 16/09 inclusive → empresa em CARÊNCIA (opera normalmente, banner)
 *   a partir de 17/09      → empresa SUSPENSA ao uso normal (dados intactos)
 *
 * Credencial de confiabilidade do horário: sempre usa o horário do
 * SERVIDOR (new Date()), nunca o do cliente.
 */

/** Período de carência após o vencimento, em dias corridos. */
export const CARENCIA_DIAS = 7;

/** Ciclo padrão de assinatura (mensal), em dias. */
export const CICLO_PADRAO_DIAS = 30;

export type EstadoAssinatura =
  | "ativa" // em dia (ou ainda dentro do vencimento)
  | "carência" // vencido, mas dentro dos 7 dias de tolerância (opera)
  | "vencida" // vencido e carência esgotada (bloqueado ao uso normal)
  | "sem_plano"; // sem vencimento cadastrado (não avaliável)

export interface SituacaoAssinatura {
  estado: EstadoAssinatura;
  vencimentoEm: Date | null;
  carenciaAte: Date | null;
  /** Dias corridos restantes de carência (0 se não está em carência). */
  diasRestantesCarencia: number;
  /** true quando a data é 3 dias (ou menos) antes de vencer a carência. */
  alertaUrgente: boolean;
}

/**
 * Recomenda/esclarece a carenciaAte a partir do vencimento, aplicando
 * o padrão de 7 dias corridos. Usado ao criar/editar assinatura.
 */
export function calcularCarenciaAte(vencimentoEm: Date | null): Date | null {
  if (!vencimentoEm) return null;
  return new Date(vencimentoEm.getTime() + CARENCIA_DIAS * 24 * 60 * 60 * 1000);
}

/**
 * Calcula a situação de assinatura de uma empresa a partir dos campos de
 * assinatura. Não depende de `status` (string em pt) — a carência é um
 * estado derivado do calendário, não um valor armazenado.
 */
export function situacaoAssinatura(empresa: {
  vencimentoEm: Date | null;
  carenciaAte: Date | null;
}): SituacaoAssinatura {
  const agora = Date.now();
  const vencimentoEm = empresa.vencimentoEm;
  if (!vencimentoEm) return { estado: "sem_plano", vencimentoEm: null, carenciaAte: null, diasRestantesCarencia: 0, alertaUrgente: false };

  // Se ainda não venceu → ativa.
  if (vencimentoEm.getTime() > agora) {
    return {
      estado: "ativa",
      vencimentoEm,
      carenciaAte: empresa.carenciaAte,
      diasRestantesCarencia: 0,
      alertaUrgente: false,
    };
  }

  // Vencido → depende da carência. Se carenciaAte for null por legado,
  // assume o padrão derivado do vencimento.
  const carenciaAte = empresa.carenciaAte ?? calcularCarenciaAte(vencimentoEm);
  const fimCarencia = carenciaAte ? carenciaAte.getTime() : vencimentoEm.getTime();
  const diasRestantes = Math.ceil((fimCarencia - agora) / (24 * 60 * 60 * 1000));

  if (fimCarencia >= agora) {
    // Em carência: ainda opera, mas com aviso.
    return {
      estado: "carência",
      vencimentoEm,
      carenciaAte,
      diasRestantesCarencia: Math.max(0, diasRestantes),
      alertaUrgente: diasRestantes <= 3,
    };
  }

  // Carência esgotada → vencida (bloqueada ao uso normal, dados intactos).
  return {
    estado: "vencida",
    vencimentoEm,
    carenciaAte,
    diasRestantesCarencia: 0,
    alertaUrgente: true,
  };
}

/**
 * true quando a empresa pode usar o sistema NORMALMENTE (ativa ou em
 * carência). false = vencida esgotada ou status bloqueado/excluido.
 */
export function podeUsarNormalmente(empresa: {
  status: string;
  vencimentoEm: Date | null;
  carenciaAte: Date | null;
}): boolean {
  if (empresa.status === "bloqueada" || empresa.status === "excluida") return false;
  const sit = situacaoAssinatura(empresa);
  return sit.estado !== "vencida";
}

/**
 * Mensagem de bloqueio amigável quando a empresa NÃO pode usar (carência
 * esgotada), mantendo a semântica de que os dados não são apagados.
 */
export function mensagemBloqueioAssinatura(empresa: { vencimentoEm: Date | null; carenciaAte: Date | null }): string {
  const sit = situacaoAssinatura(empresa);
  if (sit.estado === "vencida") {
    return "Sua assinatura está vencida e o período de carência terminou. Regularize o pagamento para continuar usando o PedidoFlow — seus dados estão preservados.";
  }
  return "Esta empresa está suspensa ou inativa. Fale com o suporte do PedidoFlow.";
}

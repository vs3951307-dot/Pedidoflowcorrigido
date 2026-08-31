import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CARENCIA_DIAS,
  situacaoAssinatura,
  calcularCarenciaAte,
  podeUsarNormalmente,
  mensagemBloqueioAssinatura,
} from "@/lib/assinatura";

/**
 * Testes da lógica de ASSINATURA + CARÊNCIA (PEDIDO: "carência de 7 dias
 * corridos antes de bloquear empresa vencida").
 *
 * Cobrem exatamente os limites que o requisito pede, com precisão de UM
 * DIA:
 *   - vencimento 10/09 12:00 → carenciaAte 17/09 12:00 (10/09 + 7 dias)
 *   - até 17/09 inclusive   → empresa em CARÊNCIA (opera + aviso)
 *   - a partir de 18/09     → empresa VENCIDA (bloqueada, dados intactos)
 *
 * Usam horário do servidor. O "agora" é fixado com fake timers para o
 * resultado ser determinístico independente da hora em que a suíte roda.
 */

const AGORA = new Date("2026-09-15T12:00:00.000Z"); // "hoje" fixo dos testes

/** Empresa com vencimento/carência em datas absolutas (ISO). */
function empresa(vencimentoEm: string | null, carenciaAte: string | null = null) {
  return {
    vencimentoEm: vencimentoEm ? new Date(vencimentoEm) : null,
    carenciaAte: carenciaAte ? new Date(carenciaAte) : null,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("calcularCarenciaAte", () => {
  it("soma exatamente 7 dias corridos ao vencimento", () => {
    expect(CARENCIA_DIAS).toBe(7);
    const carencia = calcularCarenciaAte(new Date("2026-09-10T12:00:00.000Z"))!;
    expect(carencia.toISOString()).toBe("2026-09-17T12:00:00.000Z");
  });

  it("devolve null quando não há vencimento", () => {
    expect(calcularCarenciaAte(null)).toBeNull();
  });
});

describe("situacaoAssinatura", () => {
  it("ativa quando ainda não venceu", () => {
    expect(situacaoAssinatura(empresa("2026-09-20T12:00:00.000Z")).estado).toBe("ativa");
  });

  it("sem_plano quando não há vencimento", () => {
    expect(situacaoAssinatura(empresa(null)).estado).toBe("sem_plano");
  });

  it("vencido mas DENTRO da carência → estado 'carência' e libera uso", () => {
    const sit = situacaoAssinatura(empresa("2026-09-10T12:00:00.000Z", "2026-09-17T12:00:00.000Z"));
    expect(sit.estado).toBe("carência");
    expect(sit.diasRestantesCarencia).toBe(2); // 15 → 17 = 2 dias
    expect(sit.alertaUrgente).toBe(true); // resta <= 3 dias
  });

  it("no PRÓPRIO dia do fim da carência ainda conta como carência (>= agora)", () => {
    const sit = situacaoAssinatura(empresa("2026-09-08T12:00:00.000Z", "2026-09-15T12:00:00.000Z"));
    expect(sit.estado).toBe("carência");
    expect(sit.diasRestantesCarencia).toBe(0);
  });

  it("primeiro dia APÓS a carência → 'vencida' (bloqueada)", () => {
    const sit = situacaoAssinatura(empresa("2026-09-08T12:00:00.000Z", "2026-09-14T12:00:00.000Z"));
    expect(sit.estado).toBe("vencida");
    expect(sit.alertaUrgente).toBe(true);
  });

  it("carência usa horário do SERVIDOR, não o de fora (fiabilidade)", () => {
    // Vencimento amanhã por 1 minuto (no passado a partir de agora fixado).
    const sit = situacaoAssinatura(empresa("2026-09-15T12:01:00.000Z")); // vencimento 1min no futuro
    expect(sit.estado).toBe("ativa");
    const sit2 = situacaoAssinatura(empresa("2026-09-15T11:59:00.000Z")); // 1min no passado
    // carenciaAte não informado → derivado = vencido + 7 dias → carência.
    expect(sit2.estado).toBe("carência");
  });
});

describe("podeUsarNormalmente", () => {
  it("bloqueada/excluida nunca pode usar, mesmo com plano em dia", () => {
    expect(podeUsarNormalmente({ ...empresa("2026-09-20T12:00:00.000Z"), status: "bloqueada" })).toBe(false);
    expect(podeUsarNormalmente({ ...empresa("2026-09-20T12:00:00.000Z"), status: "excluida" })).toBe(false);
  });

  it("ativa em dia pode usar", () => {
    expect(podeUsarNormalmente({ ...empresa("2026-09-20T12:00:00.000Z"), status: "ativa" })).toBe(true);
  });

  it("em carência PODE usar (tolerância de 7 dias não bloqueia)", () => {
    expect(podeUsarNormalmente({ ...empresa("2026-09-10T12:00:00.000Z", "2026-09-17T12:00:00.000Z"), status: "ativa" })).toBe(true);
  });

  it("vencida (carência esgotada) NÃO pode usar", () => {
    expect(podeUsarNormalmente({ ...empresa("2026-09-08T12:00:00.000Z", "2026-09-14T12:00:00.000Z"), status: "ativa" })).toBe(false);
  });
});

describe("mensagemBloqueioAssinatura", () => {
  it("menciona o prazo de carência e que os dados estão preservados", () => {
    const mensagem = mensagemBloqueioAssinatura(empresa("2026-09-08T12:00:00.000Z", "2026-09-14T12:00:00.000Z"));
    expect(mensagem).toContain("carência");
    expect(mensagem.toLowerCase()).toContain("preservados");
  });
});

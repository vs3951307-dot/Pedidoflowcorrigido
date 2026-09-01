/**
 * Logger de eventos de IA (Fase 6 — Observabilidade).
 *
 * Registra cada chamada de IA (interpretação, beautifier, agente, FSM)
 * no banco de dados para auditoria, debugging e analytics.
 *
 * O registro é fire-and-forget: nunca bloqueia o fluxo principal.
 * Se o banco estiver indisponível, o evento é perdido silenciosamente.
 */

import { prisma } from "@/lib/prisma";

/* --------------------------------- Tipos ---------------------------------- */

export type TipoEventoIA = "interpretacao" | "beautifier" | "agente" | "fsm";

export interface EventoIARegistrar {
  empresaId: string;
  tipo: TipoEventoIA;
  etapa: string;
  input: string;
  output: string;
  tokensEntrada?: number;
  tokensSaida?: number;
  latenciaMs?: number;
  toolsChamadas?: string[];
  erro?: string;
  duracaoMs?: number;
}

/* --------------------------------- Logger --------------------------------- */

/**
 * Registra um evento de IA no banco de dados.
 *
 * Executa em background (fire-and-forget) — NÃO bloqueia o fluxo.
 * Se o banco estiver indisponível, o erro é engolido silenciosamente.
 */
export async function registrarEventoIA(evento: EventoIARegistrar): Promise<void> {
  try {
    await prisma.eventoIA.create({
      data: {
        empresaId: evento.empresaId,
        tipo: evento.tipo,
        etapa: evento.etapa,
        input: evento.input.slice(0, 2000), // truncado para segurança
        output: evento.output.slice(0, 5000),
        tokensEntrada: evento.tokensEntrada ?? 0,
        tokensSaida: evento.tokensSaida ?? 0,
        latenciaMs: evento.latenciaMs ?? 0,
        toolsChamadas: evento.toolsChamadas ? JSON.stringify(evento.toolsChamadas) : null,
        erro: evento.erro ?? null,
        duracaoMs: evento.duracaoMs ?? 0,
      },
    });
  } catch {
    // Fire-and-forget: se o banco caiu, o evento é perdido silenciosamente.
    // Em produção, seria útil ter um fallback para arquivo local ou fila.
  }
}

/**
 * Wrapper para medir latência de uma operação e registrar o evento.
 *
 * Uso:
 *   const resultado = await comEventoIA(empresaId, "agente", etapa, input, async () => {
 *     return await agenteProcessar(...);
 *   });
 */
export async function comEventoIA<T>(
  empresaId: string,
  tipo: TipoEventoIA,
  etapa: string,
  input: string,
  operacao: () => Promise<T>,
  extra?: { tokensEntrada?: number; tokensSaida?: number; toolsChamadas?: string[] }
): Promise<T> {
  const inicio = Date.now();
  let output = "";
  let erro: string | undefined;
  let resultado: T;

  try {
    resultado = await operacao();
    output = typeof resultado === "string" ? resultado : JSON.stringify(resultado);
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
    output = `[ERRO] ${erro}`;
    throw e;
  } finally {
    const duracaoMs = Date.now() - inicio;
    registrarEventoIA({
      empresaId,
      tipo,
      etapa,
      input,
      output,
      latenciaMs: duracaoMs,
      duracaoMs,
      toolsChamadas: extra?.toolsChamadas,
      erro,
      tokensEntrada: extra?.tokensEntrada,
      tokensSaida: extra?.tokensSaida,
    }).catch(() => null);
  }

  return resultado;
}

/**
 * Retorna estatísticas de uso de IA para uma empresa.
 * Útil para dashboards e alertas de custo.
 */
export async function estatisticasIA(
  empresaId: string,
  desde?: Date
): Promise<{
  totalEventos: number;
  porTipo: Record<TipoEventoIA, number>;
  tokensTotais: { entrada: number; saida: number };
  latenciaMediaMs: number;
  erros: number;
}> {
  const filtro: Record<string, unknown> = { empresaId };
  if (desde) filtro.criadoEm = { gte: desde };

  const eventos = await prisma.eventoIA.findMany({
    where: filtro,
    select: {
      tipo: true,
      tokensEntrada: true,
      tokensSaida: true,
      latenciaMs: true,
      erro: true,
    },
  });

  const porTipo: Record<TipoEventoIA, number> = {
    interpretacao: 0,
    beautifier: 0,
    agente: 0,
    fsm: 0,
  };
  let tokensEntrada = 0;
  let tokensSaida = 0;
  let latenciaTotal = 0;
  let erros = 0;

  for (const e of eventos) {
    porTipo[e.tipo as TipoEventoIA] = (porTipo[e.tipo as TipoEventoIA] ?? 0) + 1;
    tokensEntrada += e.tokensEntrada;
    tokensSaida += e.tokensSaida;
    latenciaTotal += e.latenciaMs;
    if (e.erro) erros++;
  }

  return {
    totalEventos: eventos.length,
    porTipo,
    tokensTotais: { entrada: tokensEntrada, saida: tokensSaida },
    latenciaMediaMs: eventos.length > 0 ? Math.round(latenciaTotal / eventos.length) : 0,
    erros,
  };
}

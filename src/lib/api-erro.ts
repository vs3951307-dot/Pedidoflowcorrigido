import { NextRequest, NextResponse } from "next/server";
import { tenantALS } from "@/lib/tenant-context";

const EH_DEV = process.env.NODE_ENV !== "production";

/**
 * Log de erro — em desenvolvimento, imprime a exceção REAL de forma bem
 * visível (mensagem + stack trace completo, com separadores), para
 * nunca esconder a causa de um 500 atrás de "Erro interno". Em
 * produção, usa um log estruturado em uma linha (mais fácil de agregar
 * em ferramentas de log).
 */
function redator(texto: string | undefined): string {
  if (!texto) return texto ?? "";
  return texto
    .replace(/postgresql:\/\/[^:\s]+:[^@\s]+@[^\s]+/gi, "postgresql://***:***@***")
    .replace(/(Bearer|ApiKey|Token|Secret|Password|Senha)\s*[:=]\s*[^\s,;"]+/gi, "$1=***")
    .replace(/([?&](key|token|secret|password|senha)=)[^&]+/gi, "$1***");
}

export function logErro(contexto: string, erro: unknown, extra?: Record<string, unknown>) {
  const mensagem = redator(erro instanceof Error ? erro.message : String(erro));
  const stack = redator(erro instanceof Error ? erro.stack : undefined);

  if (EH_DEV) {
    console.error(
      `\n========== ERRO REAL — ${contexto} ==========\n` +
        `Mensagem: ${mensagem}\n` +
        (extra ? `Contexto extra: ${JSON.stringify(extra)}\n` : "") +
        (stack ? `Stack:\n${stack}\n` : "") +
        `================================================\n`
    );
    return;
  }

  console.error(
    JSON.stringify({
      nivel: "error",
      contexto,
      mensagem,
      stack,
      timestamp: new Date().toISOString(),
      ...extra,
    })
  );
}

/**
 * Envolve um handler de rota (`GET`/`POST`/...) para capturar exceções
 * não tratadas, logar e devolver 500 padronizado — sem vazar detalhes
 * internos (stack trace) para o cliente. O erro REAL sempre aparece no
 * terminal do servidor (ver `logErro` acima) — nunca escondido.
 */
export function comTratamentoDeErro<T extends unknown[]>(
  nomeRota: string,
  handler: (req: NextRequest, ...args: T) => Promise<Response>
) {
  return async (req: NextRequest, ...args: T): Promise<Response> => {
    // Executa a rota inteira dentro de um store de requisição mutável
    // (ver tenant-context.ts): autorizar()/exigirRota() preenchem o
    // contextoTenant nele, e TODA a cadeia assíncrona da rota enxerga o
    // mesmo objeto — sem depender da propagação frágil de enterWith().
    try {
      return await tenantALS.run({ contextoTenant: null }, () => handler(req, ...args));
    } catch (erro) {
      logErro(nomeRota, erro, { url: req.nextUrl?.pathname });
      return NextResponse.json(
        { erro: "Erro interno. Tente novamente em instantes." },
        { status: 500 }
      );
    }
  };
}

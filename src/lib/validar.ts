import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Valida `corpo` contra `schema`. Em caso de erro, devolve uma
 * NextResponse 400 pronta (mesmo formato `{ erro }` usado no resto da
 * API) — em caso de sucesso, devolve os dados já tipados.
 */
export function validarCorpo<T extends z.ZodTypeAny>(
  schema: T,
  corpo: unknown
): { ok: true; dados: z.infer<T> } | { ok: false; resposta: NextResponse } {
  const resultado = schema.safeParse(corpo);
  if (!resultado.success) {
    const primeiro = resultado.error.issues[0];
    const campo = primeiro?.path.join(".") || "corpo";
    return {
      ok: false,
      resposta: NextResponse.json(
        { erro: `Campo inválido: ${campo} — ${primeiro?.message ?? "valor inválido"}.` },
        { status: 400 }
      ),
    };
  }
  return { ok: true, dados: resultado.data };
}

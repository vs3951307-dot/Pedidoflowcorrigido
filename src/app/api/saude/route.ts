import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verificarLimite, ipDaRequisicao } from "@/lib/rate-limit";

// Health check precisa refletir o estado ATUAL do banco a cada chamada —
// nunca um snapshot congelado no build.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const limite = verificarLimite({ chave: `saude:${ipDaRequisicao(req)}`, maximo: 10, janelaMs: 60_000 });
  if (!limite.permitido) {
    return NextResponse.json(
      { status: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limite.reiniciaEm / 1000)) } }
    );
  }

  const inicio = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      banco: "conectado",
      tempoRespostaMs: Date.now() - inicio,
      timestamp: new Date().toISOString(),
    });
  } catch (erro) {
    return NextResponse.json(
      { status: "erro", banco: "indisponível", timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}

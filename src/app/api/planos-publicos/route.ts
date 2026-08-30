import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseModulos } from "@/lib/modulos";

/**
 * Planos ativos, para a landing page comercial (PEDIDO 12/13) — pública,
 * sem autenticação, sem dados sensíveis (só nome/preço/módulos/descrição,
 * o mesmo que qualquer visitante veria numa página de preços).
 *
 * Sempre dinâmica: planos são editáveis em runtime pelo Super Admin —
 * um snapshot estático no build ficaria desatualizado.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const planos = await prisma.plano.findMany({
    where: { ativo: true },
    orderBy: { ordem: "asc" },
  });
  return NextResponse.json({
    planos: planos.map((p) => ({
      nome: p.nome,
      preco: p.preco,
      moeda: p.moeda,
      descricao: p.descricao,
      modulos: parseModulos(p.modulosPadrao),
      iaIncluida: p.iaIncluida,
    })),
  });
}

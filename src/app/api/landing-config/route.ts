import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseModulos } from "@/lib/modulos";
import { parseLandingConteudo, LANDING_PADRAO } from "@/lib/landing-config";

/**
 * GET /api/landing-config — pública, sem autenticação. Junta o
 * conteúdo editável (textos/identidade visual, via Super Admin) com os
 * PLANOS REAIS ativos (nome/preço/módulos vêm sempre do banco — nunca
 * fixos aqui, conforme pedido explícito).
 *
 * Sempre dinâmica: o conteúdo é editável em runtime pelo Super Admin e
 * os planos mudam — um snapshot estático no build serviria dados
 * desatualizados e ainda dependeria do banco estar de pé ao compilar.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const [registro, planos] = await Promise.all([
    prisma.landingConfig.findUnique({ where: { id: "landing" } }),
    prisma.plano.findMany({ where: { ativo: true }, orderBy: { ordem: "asc" } }),
  ]);

  const conteudo = registro ? parseLandingConteudo(registro.conteudo) : LANDING_PADRAO;

  return NextResponse.json({
    conteudo,
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

import { NextRequest, NextResponse } from "next/server";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { prisma } from "@/lib/prisma";
import { autorizar } from "@/lib/acesso";

/** Trilha de auditoria DESTA empresa: autenticação e ações administrativas. */
async function GETTenant(req: NextRequest) {
  const acesso = await autorizar("auditoria");
  if (!acesso.ok) return acesso.resposta;

  const params = req.nextUrl.searchParams;
  const limite = Math.min(200, Number(params.get("limite") ?? 100));
  const acao = params.get("acao");

  const registros = await prisma.auditoria.findMany({
    where: { empresaId: acesso.empresaId, ...(acao ? { acao } : {}) },
    orderBy: { criadoEm: "desc" },
    take: limite,
  });

  return NextResponse.json({
    registros: registros.map((r) => ({
      id: r.id,
      criadoEm: r.criadoEm.toISOString(),
      acao: r.acao,
      detalhe: r.detalhe,
      usuarioNome: r.usuarioNome,
      ip: r.ip,
    })),
  });
}

export const GET = comTratamentoDeErro("auditoria.GET", GETTenant);

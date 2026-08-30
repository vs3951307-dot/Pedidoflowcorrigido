import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizar } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";

/**
 * GET /api/copiloto/historico — últimas interações do Copiloto da
 * Empresa (consultas feitas, ações aplicadas e comandos bloqueados),
 * sempre filtrado pela empresa da SESSÃO — nunca da requisição. Usa a
 * trilha de auditoria, que o próprio copiloto alimenta.
 */
export const GET = comTratamentoDeErro("copiloto.historico.GET", async () => {
  const acesso = await autorizar("admin");
  if (!acesso.ok) return acesso.resposta;

  const registros = await prisma.auditoria.findMany({
    where: {
      empresaId: acesso.empresaId,
      acao: { startsWith: "copiloto" },
    },
    orderBy: { criadoEm: "desc" },
    take: 50,
  });

  return NextResponse.json({
    historico: registros.map((r) => ({
      id: r.id,
      acao: r.acao,
      detalhe: r.detalhe,
      usuarioNome: r.usuarioNome,
      criadoEm: r.criadoEm,
    })),
  });
});

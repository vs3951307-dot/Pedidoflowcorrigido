import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizarSuperAdmin } from "@/lib/super-admin/auth";
import { comTratamentoDeErro } from "@/lib/api-erro";

/** GET /api/superadmin/copiloto/historico — últimas ações aplicadas (PEDIDO 8: auditoria + desfazer). */
export const GET = comTratamentoDeErro("superadmin.copiloto.historico.GET", async () => {
  const acesso = await autorizarSuperAdmin();
  if (!acesso.ok) return acesso.resposta;

  const registros = await prisma.historicoCopiloto.findMany({
    orderBy: { criadoEm: "desc" },
    take: 50,
  });

  return NextResponse.json({
    historico: registros.map((r) => ({
      id: r.id,
      superAdminNome: r.superAdminNome,
      empresaNome: r.empresaNome,
      instrucaoOriginal: r.instrucaoOriginal,
      sucesso: r.sucesso,
      desfeito: Boolean(r.desfeitoEm),
      criadoEm: r.criadoEm,
    })),
  });
});

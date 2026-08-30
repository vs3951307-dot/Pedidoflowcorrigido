import { NextRequest, NextResponse } from "next/server";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { prisma } from "@/lib/prisma";
import { autorizar } from "@/lib/acesso";

/**
 * Cancela um item de impressão pendente/em erro (ex.: comanda duplicada
 * por engano), desta empresa. Somente administrador. Não altera
 * registros concluídos.
 */
async function POSTTenant(_req: NextRequest, { params }: { params: { id: string } }) {
  const acesso = await autorizar("impressao");
  if (!acesso.ok) return acesso.resposta;
  if (acesso.usuario.papel !== "ADMINISTRADOR") {
    return NextResponse.json({ erro: "Somente o administrador pode cancelar impressões." }, { status: 403 });
  }

  const atual = await prisma.filaImpressao.findFirst({ where: { id: params.id, empresaId: acesso.empresaId } });
  if (!atual) {
    return NextResponse.json({ erro: "Item de impressão não encontrado." }, { status: 404 });
  }
  if (atual.status === "concluido") {
    return NextResponse.json({ erro: "Impressão já concluída não pode ser cancelada." }, { status: 409 });
  }

  const registro = await prisma.filaImpressao.update({
    where: { id: atual.id },
    data: { status: "cancelado" },
  });

  return NextResponse.json({ ok: true, id: registro.id, status: registro.status });
}

export const POST = comTratamentoDeErro("impressao.cancelar.POST", POSTTenant);

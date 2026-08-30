import { NextRequest, NextResponse } from "next/server";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { prisma } from "@/lib/prisma";
import { autorizar } from "@/lib/acesso";

/**
 * GET /api/fiscal/documentos/[id] — detalhe do documento fiscal DESTA
 * empresa (inclui XML e URLs de DANFE/QR Code quando o provedor forneceu).
 */
async function GETTenant(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const acesso = await autorizar("fiscal");
  if (!acesso.ok) return acesso.resposta;
  const { id } = await params;

  const documento = await prisma.documentoFiscal.findFirst({
    where: { id, empresaId: acesso.empresaId },
    include: {
      pedido: {
        select: { id: true, numero: true, canal: true, total: true, criadoEm: true, clienteNome: true },
      },
    },
  });
  if (!documento) {
    return NextResponse.json({ erro: "Documento fiscal não encontrado." }, { status: 404 });
  }
  return NextResponse.json({ documento });
}

export const GET = comTratamentoDeErro("fiscal.documento.GET", GETTenant);

import { NextRequest, NextResponse } from "next/server";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { autorizar, registrarAuditoria } from "@/lib/acesso";
import { cancelarDocumentoFiscal } from "@/lib/fiscal/consulta";

/**
 * POST /api/fiscal/documentos/[id]/cancelamento — cancela NFC-e
 * autorizada (desta empresa). Body: { motivo }. Restrito ao ADMINISTRADOR.
 */
async function POSTTenant(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const acesso = await autorizar("fiscal");
  if (!acesso.ok) return acesso.resposta;
  if (acesso.usuario.papel !== "ADMINISTRADOR") {
    return NextResponse.json({ erro: "Cancelamento restrito ao Administrador." }, { status: 403 });
  }
  const { id } = await params;
  const corpo = await req.json().catch(() => ({}));
  const motivo = String(corpo.motivo ?? "").trim();

  try {
    const { resultado } = await cancelarDocumentoFiscal(acesso.empresaId, id, motivo, {
      id: acesso.usuario.id,
      nome: acesso.usuario.nome,
    });
    await registrarAuditoria(
      "nfce_cancelamento",
      `Cancelamento NFC-e ${id}: ${resultado.status}${resultado.xMotivo ? ` (${resultado.xMotivo})` : ""}`,
      acesso.usuario,
      undefined,
      acesso.empresaId
    );
    return NextResponse.json({ ok: resultado.status === "cancelado", fiscal: resultado });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Falha no cancelamento.";
    return NextResponse.json({ erro: mensagem }, { status: 400 });
  }
}

export const POST = comTratamentoDeErro("fiscal.cancelamento.POST", POSTTenant);

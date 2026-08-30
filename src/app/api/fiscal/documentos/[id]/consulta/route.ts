import { NextRequest, NextResponse } from "next/server";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { autorizar } from "@/lib/acesso";
import { consultarDocumentoFiscal } from "@/lib/fiscal/consulta";

/**
 * POST /api/fiscal/documentos/[id]/consulta — consulta o status da NFC-e
 * no provedor/SEFAZ e atualiza o registro local (sempre desta empresa).
 */
async function POSTTenant(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const acesso = await autorizar("fiscal");
  if (!acesso.ok) return acesso.resposta;
  const { id } = await params;

  try {
    const { resultado } = await consultarDocumentoFiscal(acesso.empresaId, id, {
      id: acesso.usuario.id,
      nome: acesso.usuario.nome,
    });
    return NextResponse.json({ ok: resultado.status === "autorizado", fiscal: resultado });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Falha na consulta.";
    return NextResponse.json({ erro: mensagem }, { status: 400 });
  }
}

export const POST = comTratamentoDeErro("fiscal.consulta.POST", POSTTenant);

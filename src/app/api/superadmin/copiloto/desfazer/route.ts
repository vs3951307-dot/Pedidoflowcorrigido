import { NextRequest, NextResponse } from "next/server";
import { autorizarSuperAdmin } from "@/lib/super-admin/auth";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { desfazerHistorico } from "@/lib/ia-admin";

/** POST /api/superadmin/copiloto/desfazer — reverte uma alteração aplicada (PEDIDO 8). Body: { historicoId }. */
export const POST = comTratamentoDeErro("superadmin.copiloto.desfazer.POST", async (req: NextRequest) => {
  const acesso = await autorizarSuperAdmin();
  if (!acesso.ok) return acesso.resposta;

  const corpo = await req.json().catch(() => ({}));
  const historicoId = String(corpo.historicoId ?? "");
  if (!historicoId) {
    return NextResponse.json({ erro: "Informe o registro do histórico a desfazer." }, { status: 400 });
  }

  const resultado = await desfazerHistorico(historicoId);
  if (!resultado.ok) {
    return NextResponse.json({ erro: resultado.motivo ?? "Não foi possível desfazer." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
});

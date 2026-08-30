import { NextRequest, NextResponse } from "next/server";
import { autorizarSuperAdmin } from "@/lib/super-admin/auth";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { completarAcaoPendente } from "@/lib/ia-admin";

/**
 * POST /api/superadmin/copiloto/completar — preenche um campo que
 * faltava numa ação específica de uma proposta pendente (ex.: e-mail
 * de um novo usuário) antes de confirmar. Nunca cria uma ação nova —
 * só complementa uma que o Copiloto já propôs e está guardada no
 * servidor sob o `actionId`.
 */
export const POST = comTratamentoDeErro("superadmin.copiloto.completar.POST", async (req: NextRequest) => {
  const acesso = await autorizarSuperAdmin();
  if (!acesso.ok) return acesso.resposta;

  const corpo = await req.json().catch(() => ({}));
  const actionId = String(corpo.actionId ?? "");
  const indice = Number(corpo.indice ?? -1);
  const camposAdicionais = corpo.campos && typeof corpo.campos === "object" ? corpo.campos : {};

  if (!actionId || indice < 0) {
    return NextResponse.json({ erro: "Requisição inválida." }, { status: 400 });
  }

  const resultado = await completarAcaoPendente(actionId, acesso.superAdmin.id, indice, camposAdicionais);
  if (!resultado.ok) {
    return NextResponse.json({ erro: resultado.motivo }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
});

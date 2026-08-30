import { NextRequest, NextResponse } from "next/server";
import { COOKIE_SUPERADMIN, encerrarSessaoSuperAdmin, limparCookieSuperAdmin } from "@/lib/super-admin/auth";
import { comTratamentoDeErro } from "@/lib/api-erro";

export const POST = comTratamentoDeErro("superadmin.auth.logout.POST", async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE_SUPERADMIN)?.value;
  if (token) await encerrarSessaoSuperAdmin(token).catch(() => null);
  const resposta = NextResponse.json({ ok: true });
  limparCookieSuperAdmin(resposta);
  return resposta;
});

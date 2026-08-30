import { NextResponse } from "next/server";
import { autorizarSuperAdmin } from "@/lib/super-admin/auth";
import { comTratamentoDeErro } from "@/lib/api-erro";

export const GET = comTratamentoDeErro("superadmin.auth.me.GET", async () => {
  const acesso = await autorizarSuperAdmin();
  if (!acesso.ok) return acesso.resposta;
  return NextResponse.json({ superAdmin: acesso.superAdmin });
});

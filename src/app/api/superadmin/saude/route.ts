import { NextResponse } from "next/server";
import { autorizarSuperAdmin } from "@/lib/super-admin/auth";
import { obterDiagnosticoPlataforma } from "@/lib/diagnostico-plataforma";
import { comTratamentoDeErro } from "@/lib/api-erro";

/**
 * Diagnóstico/saúde da plataforma (Super Admin) — PEDIDO 14/18 (Copiloto
 * Supremo usa a MESMA função, `obterDiagnosticoPlataforma()`, para
 * responder perguntas em linguagem natural sem duplicar a lógica nem
 * arriscar respostas divergentes do que esta tela mostra).
 */
export const GET = comTratamentoDeErro("superadmin.saude.GET", async () => {
  const acesso = await autorizarSuperAdmin();
  if (!acesso.ok) return acesso.resposta;
  const diagnostico = await obterDiagnosticoPlataforma();
  return NextResponse.json(diagnostico);
});

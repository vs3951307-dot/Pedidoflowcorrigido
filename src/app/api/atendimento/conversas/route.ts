import { NextResponse } from "next/server";
import { autorizar } from "@/lib/acesso";
import { listarConversas } from "@/lib/atendente/motor";
import { comTratamentoDeErro } from "@/lib/api-erro";

/** Lista as conversas do atendimento DESTA empresa. Requer a permissão "atendimento". */
export const GET = comTratamentoDeErro("atendimento.conversas.GET", async () => {
  const acesso = await autorizar("atendimento");
  if (!acesso.ok) return acesso.resposta;
  const conversas = await listarConversas(acesso.empresaId);
  return NextResponse.json({ conversas });
});

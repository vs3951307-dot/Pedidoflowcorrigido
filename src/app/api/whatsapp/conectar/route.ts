import { NextRequest, NextResponse } from "next/server";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { autorizar } from "@/lib/acesso";
import {
  carregarConfiguracaoWhatsApp,
  testarConexaoWhatsApp,
} from "@/lib/atendente/whatsapp-api";

/**
 * Conecta/valida o WhatsApp DESTA empresa (painel admin → Configurações
 * → WhatsApp).
 *
 * Consulta a API oficial da Meta (sem enviar mensagens) para confirmar
 * que o token e o phone number id estão corretos, retornando o número
 * verificado e o nome cadastrado. Nada é simulado: sem credenciais reais,
 * a Meta responde erro e o painel mostra o motivo.
 */
async function POSTTenant(_req: NextRequest) {
  const acesso = await autorizar("configuracoes");
  if (!acesso.ok) return acesso.resposta;

  const config = await carregarConfiguracaoWhatsApp(acesso.empresaId);
  if (!config) {
    return NextResponse.json(
      {
        ok: false,
        erro:
          "Nenhuma credencial configurada. Preencha o token de acesso e o phone number ID no painel (ou no .env, para a empresa padrão).",
      },
      { status: 400 }
    );
  }

  const resultado = await testarConexaoWhatsApp(config);
  return NextResponse.json(
    { ok: resultado.ok, teste: resultado },
    { status: resultado.ok ? 200 : 502 }
  );
}

export const POST = comTratamentoDeErro("whatsapp.conectar.POST", POSTTenant);

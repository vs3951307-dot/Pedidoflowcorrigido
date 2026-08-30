import { NextRequest, NextResponse } from "next/server";
import { autorizar } from "@/lib/acesso";
import { receberMensagemWhatsApp } from "@/lib/atendente/motor";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { verificarLimite } from "@/lib/rate-limit";

const TAMANHO_MAXIMO_TEXTO = 4096;
const TAMANHO_MAXIMO_TELEFONE = 20;

/**
 * Envia uma mensagem como cliente para uma conversa (modo simulação ou
 * qualquer origem). Usado pelo painel de atendimento e por testes.
 * Requer a permissão "atendimento" e o módulo "whatsapp" contratado.
 */
export const POST = comTratamentoDeErro("atendimento.mensagem.POST", async (req: NextRequest) => {
  const acesso = await autorizar("atendimento");
  if (!acesso.ok) return acesso.resposta;

  // Rate limit por usuário (painel de atendimento) — auditoria de segurança.
  const limite = verificarLimite({ chave: `atendimento:${acesso.usuario.id}`, maximo: 30, janelaMs: 60_000 });
  if (!limite.permitido) {
    return NextResponse.json({ erro: "Muitas mensagens em pouco tempo. Aguarde um instante." }, { status: 429 });
  }

  const corpo = await req.json().catch(() => null);
  const telefone = typeof corpo?.telefone === "string" ? corpo.telefone.trim().slice(0, TAMANHO_MAXIMO_TELEFONE) : "";
  const texto = typeof corpo?.texto === "string" ? corpo.texto.trim().slice(0, TAMANHO_MAXIMO_TEXTO) : "";
  const origem = corpo?.origem === "whatsapp" ? "whatsapp" : "simulacao";

  if (!telefone || !texto) {
    return NextResponse.json({ erro: "telefone e texto são obrigatórios." }, { status: 400 });
  }

  const resultado = await receberMensagemWhatsApp(acesso.empresaId, telefone, texto, origem);
  return NextResponse.json(resultado);
});

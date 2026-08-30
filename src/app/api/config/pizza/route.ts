import { NextRequest, NextResponse } from "next/server";
import { autorizar } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { prisma } from "@/lib/prisma";
import { lerConfigPizza } from "@/lib/impressao";

/**
 * GET /api/config/pizza — regra de preço de pizza da empresa.
 *
 * ETAPA 1: sem fallback. Se a empresa não tiver a chave "pizza"
 * configurada, recusa com 409 — quem usar a regra (criação de pedido)
 * também deve recusar, jamais chutar um valor.
 */
export const GET = comTratamentoDeErro("config.pizza.GET", async () => {
  const acesso = await autorizar("salao");
  if (!acesso.ok) return acesso.resposta;

  const config = await lerConfigPizza(acesso.empresaId);
  if (!config) {
    return NextResponse.json(
      { erro: "regra de preço de pizza não configurada para esta empresa" },
      { status: 409 }
    );
  }

  return NextResponse.json(config);
});

/** Salva a regra de preço de pizza (usado por Configurações/Admin). */
export const POST = comTratamentoDeErro("config.pizza.POST", async (req: NextRequest) => {
  const acesso = await autorizar("admin");
  if (!acesso.ok) return acesso.resposta;

  const corpo = await req.json().catch(() => ({}));
  const acrescimo = Number(corpo?.acrescimoPorSaborPremium ?? corpo?.precoEspecialSegundoSabor);
  const permitir = corpo?.permitirMisturarDoceSalgada === undefined ? true : Boolean(corpo.permitirMisturarDoceSalgada);

  if (isNaN(acrescimo) || acrescimo < 0) {
    return NextResponse.json({ erro: "acrescimoPorSaborPremium inválido." }, { status: 400 });
  }

  await prisma.configuracao.upsert({
    where: { empresaId_chave: { empresaId: acesso.empresaId, chave: "pizza" } },
    update: {
      valor: JSON.stringify({ acrescimoPorSaborPremium: Math.max(0, acrescimo), permitirMisturarDoceSalgada: permitir }),
    },
    create: {
      empresaId: acesso.empresaId,
      chave: "pizza",
      valor: JSON.stringify({ acrescimoPorSaborPremium: Math.max(0, acrescimo), permitirMisturarDoceSalgada: permitir }),
    },
  });

  return NextResponse.json({ ok: true });
});

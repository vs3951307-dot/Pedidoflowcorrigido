import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { autorizar } from "@/lib/acesso";
import { calcularTaxaEntrega, lerConfigTaxaEntrega } from "@/lib/delivery";
import { comTratamentoDeErro } from "@/lib/api-erro";

const paramsSchema = z.object({
  bairro: z.string().trim().max(60).nullable().optional(),
  total: z.coerce.number().nonnegative().max(1000000).default(0),
});

/** Calcula a taxa de entrega pelas regras configuradas (?bairro=&total=). */
export const GET = comTratamentoDeErro("entrega.taxa.GET", async (req: NextRequest) => {
  const acesso = await autorizar("pdv", "salao", "clientes");
  if (!acesso.ok) return acesso.resposta;

  const validado = paramsSchema.safeParse({
    bairro: req.nextUrl.searchParams.get("bairro")?.trim() || null,
    total: req.nextUrl.searchParams.get("total") ?? "0",
  });
  if (!validado.success) {
    return NextResponse.json({ erro: "Parâmetros inválidos." }, { status: 400 });
  }
  const { bairro, total } = validado.data;

  const config = await lerConfigTaxaEntrega(acesso.empresaId);
  const resultado = calcularTaxaEntrega(config, bairro, total);

  return NextResponse.json({
    taxa: resultado.taxa,
    regra: resultado.regra,
    gratuito: resultado.gratuito,
  });
});

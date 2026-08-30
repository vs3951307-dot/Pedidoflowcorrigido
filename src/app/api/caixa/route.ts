import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizar } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";

function formatarMovimentacao(m: { id: string; tipo: string; valor: number; descricao: string; metodo: string | null; criadoEm: Date }) {
  return {
    id: m.id,
    // "abertura" vira "entrada" para o Caixa do PDV (contrato do caixa-context)
    tipo: m.tipo === "abertura" ? ("entrada" as const) : (m.tipo as "venda" | "troco" | "sangria" | "entrada"),
    valor: m.valor,
    descricao: m.descricao,
    metodo: m.metodo ?? undefined,
    criadoEm: m.criadoEm.toISOString(),
  };
}

export const GET = comTratamentoDeErro("caixa.GET", async () => {
  const acesso = await autorizar("caixa");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;
  const inicioHoje = new Date();
  inicioHoje.setHours(0, 0, 0, 0);

  const caixa = await prisma.caixa.findFirst({
    where: { empresaId, status: "aberto" },
    orderBy: { abertoEm: "desc" },
  });

  const movimentacoes = caixa
    ? await prisma.movimentacaoCaixa.findMany({
        where: { empresaId, caixaId: caixa.id },
        orderBy: { criadoEm: "asc" },
      })
    : await prisma.movimentacaoCaixa.findMany({
        where: { empresaId, criadoEm: { gte: inicioHoje } },
        orderBy: { criadoEm: "asc" },
      });

  return NextResponse.json({
    aberto: Boolean(caixa),
    saldoInicial: caixa?.saldoInicial ?? 0,
    aberturaEm: caixa?.abertoEm.toISOString() ?? null,
    movimentacoes: movimentacoes.map(formatarMovimentacao),
  });
});

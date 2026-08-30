import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizar } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";

const TIPOS = ["sangria", "entrada", "troco"];

export const POST = comTratamentoDeErro("caixa.movimentacoes.POST", async (req: NextRequest) => {
  const acesso = await autorizar("caixa");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;
  const corpo = await req.json().catch(() => ({}));
  const tipo = String(corpo.tipo ?? "");
  const valor = Number(corpo.valor);
  if (!TIPOS.includes(tipo) || !Number.isFinite(valor) || valor <= 0) {
    return NextResponse.json({ erro: "Tipo ou valor de movimentação inválidos." }, { status: 400 });
  }

  const caixa = await prisma.caixa.findFirst({ where: { empresaId, status: "aberto" }, orderBy: { abertoEm: "desc" } });
  if (!caixa) {
    return NextResponse.json({ erro: "Nenhum caixa aberto." }, { status: 409 });
  }

  const movimentacao = await prisma.movimentacaoCaixa.create({
    data: {
      empresaId,
      caixaId: caixa.id,
      tipo,
      valor,
      metodo: corpo.metodo ? String(corpo.metodo) : null,
      descricao: String(corpo.descricao ?? (tipo === "sangria" ? "Sangria" : tipo === "entrada" ? "Entrada extra" : "Troco")),
    },
  });

  return NextResponse.json(
    {
      ok: true,
      movimentacao: {
        id: movimentacao.id,
        tipo,
        valor,
        descricao: movimentacao.descricao,
        metodo: movimentacao.metodo ?? undefined,
        criadoEm: movimentacao.criadoEm.toISOString(),
      },
    },
    { status: 201 }
  );
});

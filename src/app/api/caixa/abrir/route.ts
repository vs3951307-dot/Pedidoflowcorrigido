import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { autorizar, registrarAuditoria } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";

const caixaAbrirSchema = z.object({
  saldoInicial: z.coerce.number().min(0).max(1_000_000).default(0),
});

export const POST = comTratamentoDeErro("caixa.abrir.POST", async (req: NextRequest) => {
  const acesso = await autorizar("caixa");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;
  const corpo = await req.json().catch(() => ({}));

  const parsed = caixaAbrirSchema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json({ erro: "Saldo inicial inválido." }, { status: 400 });
  }
  const saldoInicial = parsed.data.saldoInicial;

  // Checagem "de conveniência" — dá uma mensagem rápida no caso comum
  // (sem corrida). A garantia de verdade contra dois caixas abertos ao
  // mesmo tempo é o índice único parcial no banco (ver migration
  // 20260806210000_caixa_aberto_unico) — capturado abaixo.
  const existente = await prisma.caixa.findFirst({ where: { empresaId, status: "aberto" } });
  if (existente) {
    return NextResponse.json({ erro: "Já existe um caixa aberto." }, { status: 409 });
  }

  let caixa;
  try {
    caixa = await prisma.caixa.create({
      data: { empresaId, saldoInicial, abertoEm: new Date(), status: "aberto" },
    });
  } catch (erro) {
    // P2002 aqui só acontece na corrida genuína: dois pedidos passaram
    // pelo `findFirst` acima ao mesmo tempo (nenhum viu caixa aberto
    // ainda) e um perdeu a corrida no `create` — o banco barrou o
    // segundo. É uma condição ESPERADA sob concorrência, não um erro
    // interno de verdade — por isso 409 amigável, nunca 500.
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      return NextResponse.json({ erro: "Já existe um caixa aberto." }, { status: 409 });
    }
    throw erro;
  }

  await prisma.movimentacaoCaixa.create({
    data: {
      empresaId,
      caixaId: caixa.id,
      tipo: "abertura",
      valor: saldoInicial,
      descricao: "Abertura de caixa",
    },
  });
  await registrarAuditoria("caixa_aberto", `Caixa aberto (saldo inicial R$ ${saldoInicial.toFixed(2).replace(".", ",")})`, acesso.usuario, undefined, empresaId);

  return NextResponse.json({ ok: true, caixa: { id: caixa.id, abertoEm: caixa.abertoEm.toISOString(), saldoInicial } }, { status: 201 });
});

import { NextRequest, NextResponse } from "next/server";
import { prisma, plataformaPrisma } from "@/lib/prisma";
import { encontrarEmpresaPorTokenAgente } from "@/lib/impressao";
import { ativarTenant } from "@/lib/tenant-db";

/**
 * Confirmação do agente local: a impressão SAÍU na impressora (todas as
 * vias).
 *
 * CORREÇÃO (PEDIDO 4): não basta mais estar "pendente" ou "processando"
 * — exige o `claimId` do lease atual. Isso garante que só o agente que
 * de fato reivindicou o trabalho (e ainda detém o lease) pode concluí-lo.
 * Um agente "zumbi" que perdeu o lease para outro (por timeout de
 * verdade, não confirmação simultânea) recebe 409 e NÃO consegue marcar
 * como concluído um trabalho que já foi/está sendo reimpresso por outro.
 *
 * Idempotente: se o item JÁ está `concluido` com o mesmo `claimId`
 * (retry de rede do próprio agente, ex.: confirmou mas a resposta se
 * perdeu), devolve sucesso sem re-processar — não é erro.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const token = req.headers.get("x-agente-token") ?? "";
  const empresaId = await encontrarEmpresaPorTokenAgente(token);
  if (!empresaId) {
    return NextResponse.json({ erro: "Token de agente inválido ou não configurado." }, { status: 401 });
  }

  // Ativa o tenant desta empresa ANTES de acessar modelos de tenant
  const empresa = await plataformaPrisma.empresa.findUnique({
    where: { id: empresaId },
    select: { id: true, schemaBanco: true, databaseUrlSecreta: true, slug: true },
  });
  if (!empresa) {
    return NextResponse.json({ erro: "Empresa não encontrada." }, { status: 404 });
  }
  ativarTenant(empresa);

  const corpo = await req.json().catch(() => ({}));
  const claimId = String(corpo.claimId ?? "");

  const atual = await prisma.filaImpressao.findFirst({ where: { id: params.id, empresaId } });
  if (!atual) {
    return NextResponse.json({ erro: "Item de impressão não encontrado." }, { status: 404 });
  }

  // Idempotência: mesmo agente confirmando de novo o que ele mesmo já
  // concluiu (ex.: a resposta HTTP se perdeu na rede, ele reenviou).
  if (atual.status === "concluido" && claimId && atual.claimId === claimId) {
    return NextResponse.json({ ok: true, id: atual.id, status: atual.status, idempotente: true });
  }

  if (!claimId) {
    return NextResponse.json({ erro: "claimId é obrigatório para concluir." }, { status: 400 });
  }
  if (atual.status !== "processando") {
    return NextResponse.json(
      { erro: `Item não está em processamento (status atual: ${atual.status}).` },
      { status: 409 }
    );
  }
  if (atual.claimId !== claimId) {
    // Outro agente já reivindicou este trabalho (lease expirou e foi
    // pego de novo) — este agente está "atrasado" e não pode confirmar
    // por cima de quem detém o lease agora.
    return NextResponse.json(
      { erro: "Lease deste trabalho não pertence mais a este agente — outro processo já assumiu." },
      { status: 409 }
    );
  }

  const registro = await prisma.filaImpressao.update({
    where: { id: atual.id },
    data: { status: "concluido", concluidoEm: new Date() },
  });

  return NextResponse.json({ ok: true, id: registro.id, status: registro.status });
}

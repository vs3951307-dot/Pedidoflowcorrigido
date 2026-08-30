import { NextRequest, NextResponse } from "next/server";
import { prisma, plataformaPrisma } from "@/lib/prisma";
import { encontrarEmpresaPorTokenAgente } from "@/lib/impressao";
import { ativarTenant } from "@/lib/tenant-db";

const MAX_TENTATIVAS = 3;

/**
 * Falha reportada pelo agente local (ex.: impressora sem papel/offline),
 * sempre restrita à empresa dona do token.
 *
 * CORREÇÃO (PEDIDO 3/4): exige o `claimId` do lease atual, igual ao
 * `/concluir` — um agente que já perdeu o lease (outro assumiu por
 * timeout de verdade) não pode mais reportar erro sobre um trabalho que
 * não é mais dele; isso evitaria, por exemplo, que um agente lento
 * "cancele" por engano o progresso de quem já está imprimindo de novo.
 *
 * A impressão NUNCA é marcada como concluída aqui: incrementa tentativas
 * e guarda o erro; volta a `pendente` (liberando o lease, `claimId=null`)
 * até o limite, depois fica `erro` (visível no painel para reimpressão
 * manual).
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
  const mensagem = String(corpo.mensagem ?? "Falha ao imprimir.").slice(0, 500);
  const claimId = String(corpo.claimId ?? "");

  const atual = await prisma.filaImpressao.findFirst({ where: { id: params.id, empresaId } });
  if (!atual) {
    return NextResponse.json({ erro: "Item de impressão não encontrado." }, { status: 404 });
  }
  if (atual.status === "concluido" || atual.status === "cancelado") {
    return NextResponse.json(
      { erro: `Item já ${atual.status}; não é possível reportar erro.` },
      { status: 409 }
    );
  }
  if (atual.status === "processando" && claimId && atual.claimId !== claimId) {
    return NextResponse.json(
      { erro: "Lease deste trabalho não pertence mais a este agente — outro processo já assumiu." },
      { status: 409 }
    );
  }

  const tentativas = atual.tentativas + 1;
  const novoStatus = tentativas >= MAX_TENTATIVAS ? "erro" : "pendente";
  const registro = await prisma.filaImpressao.update({
    where: { id: atual.id },
    // Libera o lease ao voltar pra pendente/erro — outro agente (ou o
    // mesmo, na próxima tentativa) pode reivindicar de novo normalmente.
    data: { tentativas, erro: mensagem, status: novoStatus, claimId: null, leaseAte: null },
  });

  return NextResponse.json({ ok: true, id: registro.id, status: registro.status, tentativas: registro.tentativas });
}

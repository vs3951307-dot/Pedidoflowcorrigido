import { NextRequest, NextResponse } from "next/server";
import { prisma, plataformaPrisma } from "@/lib/prisma";
import { encontrarEmpresaPorTokenAgente, LEASE_DURACAO_MS } from "@/lib/impressao";
import { ativarTenant } from "@/lib/tenant-db";

/**
 * POST /api/impressao/fila/[id]/heartbeat — o agente RENOVA o lease
 * enquanto ainda está imprimindo de verdade (PEDIDO 2: "implementar
 * heartbeat/renovação de lease enquanto o agente estiver imprimindo.
 * Somente considerar abandonado quando realmente perder o lease").
 *
 * Sem isto, um trabalho com 3 vias numa impressora lenta, ou um spooler
 * do Windows engasgado, poderia ultrapassar um timeout fixo e ser
 * reivindicado por OUTRO agente enquanto o primeiro ainda está
 * imprimindo — causando impressão duplicada. Com heartbeat, o lease só
 * expira de verdade quando o agente realmente para de responder.
 *
 * Exige o `claimId` exato devolvido pela reivindicação (PEDIDO 3: "só o
 * agente/computador que reivindicou pode renovar") — um agente antigo
 * que perdeu o lease não consegue renová-lo de volta só por insistir.
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
  if (!claimId) {
    return NextResponse.json({ erro: "claimId é obrigatório para renovar o lease." }, { status: 400 });
  }

  const leaseAte = new Date(Date.now() + LEASE_DURACAO_MS);
  const resultado = await prisma.filaImpressao.updateMany({
    where: { id: params.id, empresaId, status: "processando", claimId },
    data: { leaseAte },
  });

  if (resultado.count === 0) {
    // O lease já não é mais deste agente (outro reivindicou por expiração,
    // ou o trabalho já terminou) — o agente deve PARAR de imprimir/tentar
    // concluir, não insistir.
    return NextResponse.json({ ok: true, renovado: false });
  }
  return NextResponse.json({ ok: true, renovado: true, leaseSegundos: Math.round(LEASE_DURACAO_MS / 1000) });
}

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma, plataformaPrisma } from "@/lib/prisma";
import { encontrarEmpresaPorTokenAgente, LEASE_DURACAO_MS } from "@/lib/impressao";
import { ativarTenant } from "@/lib/tenant-db";

/**
 * POST /api/impressao/fila/[id]/processando — o agente RESERVA o
 * trabalho com um LEASE de verdade antes de tentar imprimir (PEDIDO 1-2:
 * "implementar um mecanismo robusto de LEASE/LOCK", "não usar timeout
 * cego de 60 segundos").
 *
 * Reivindicação atômica: `updateMany` com
 *   WHERE status = 'pendente' OR (status = 'processando' AND leaseAte < agora)
 * — uma única instrução condicional no banco, sem janela de corrida
 * entre "checar" e "escrever" (dois agentes reivindicando ao mesmo
 * tempo: só um `updateMany` afeta a linha; o outro recebe `count: 0`).
 *
 * Devolve um `claimId` novo — só quem apresenta esse valor exato consegue
 * renovar (`/heartbeat`), concluir (`/concluir`) ou reportar erro
 * (`/erro`) deste trabalho depois. Isso é o que impede um agente "zumbi"
 * (que perdeu o lease por lentidão) de ainda conseguir confirmar depois
 * que outro agente já reivindicou de novo — ele não tem o `claimId` novo.
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

  const computador = req.headers.get("x-agente-computador")?.trim() || null;

  const claimId = randomBytes(16).toString("hex");
  const agora = new Date();
  const leaseAte = new Date(agora.getTime() + LEASE_DURACAO_MS);

  const resultado = await prisma.filaImpressao.updateMany({
    where: {
      id: params.id,
      empresaId,
      OR: [
        { status: "pendente" },
        { status: "processando", leaseAte: { lt: agora } },
        { status: "processando", leaseAte: null },
      ],
    },
    data: { status: "processando", claimId, leaseAte, processandoPor: computador, processandoEm: agora },
  });

  if (resultado.count === 0) {
    // Não é erro: outro agente já detém o lease (ou o item nem existe
    // mais/não pertence a esta empresa/já terminou). O chamador NÃO deve
    // imprimir neste caso.
    const atual = await prisma.filaImpressao.findFirst({ where: { id: params.id, empresaId }, select: { status: true } });
    return NextResponse.json({ ok: true, reivindicado: false, status: atual?.status ?? "desconhecido" });
  }

  return NextResponse.json({ ok: true, reivindicado: true, status: "processando", claimId, leaseSegundos: Math.round(LEASE_DURACAO_MS / 1000) });
}

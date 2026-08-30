import { NextRequest, NextResponse } from "next/server";
import { prisma, plataformaPrisma } from "@/lib/prisma";
import { encontrarEmpresaPorTokenAgente } from "@/lib/impressao";
import { ativarTenant } from "@/lib/tenant-db";

/**
 * POST /api/impressao/agente/deteccao — o agente local reporta quais
 * impressoras o Windows enxerga nesta máquina (PEDIDO 5: "o painel web
 * deve conseguir mostrar as impressoras detectadas pelo agente para o
 * administrador selecionar"). Body: `{ computador, impressoras: string[] }`.
 *
 * Autenticação igual à da fila (`x-agente-token`) — a empresa é sempre
 * determinada pelo token, nunca por um campo `empresaId` no corpo.
 */
export async function POST(req: NextRequest) {
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
  const computador = String(corpo.computador ?? "").trim();
  const lista = Array.isArray(corpo.impressoras) ? corpo.impressoras.map(String).slice(0, 50) : [];

  if (!computador) {
    return NextResponse.json({ erro: "Informe o nome do computador." }, { status: 400 });
  }

  // Cache de descoberta (não é cadastro definitivo — o Admin ainda
  // escolhe qual dessas vira uma Impressora de verdade). TTL implícito:
  // sobrescrito a cada chamada do agente, então uma impressora que sumiu
  // do Windows também some daqui na próxima detecção.
  await prisma.configuracao.upsert({
    where: { empresaId_chave: { empresaId, chave: `impressoras_detectadas:${computador}` } },
    update: { valor: JSON.stringify({ impressoras: lista, atualizadoEm: new Date().toISOString() }) },
    create: {
      empresaId,
      chave: `impressoras_detectadas:${computador}`,
      valor: JSON.stringify({ impressoras: lista, atualizadoEm: new Date().toISOString() }),
    },
  });

  return NextResponse.json({ ok: true, recebidas: lista.length });
}

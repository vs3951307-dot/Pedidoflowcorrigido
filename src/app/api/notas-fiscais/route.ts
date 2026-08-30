import { NextRequest, NextResponse } from "next/server";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { prisma } from "@/lib/prisma";
import { autorizar } from "@/lib/acesso";

async function GETTenant() {
  const acesso = await autorizar("notas_fiscais");
  if (!acesso.ok) return acesso.resposta;
  const notas = await prisma.notaFiscal.findMany({
    where: { empresaId: acesso.empresaId },
    orderBy: { emissao: "desc" },
  });
  return NextResponse.json({
    notas: notas.map((n) => ({
      id: n.id,
      numero: n.numero,
      serie: n.serie,
      fornecedor: n.fornecedor,
      emissao: n.emissao.toISOString(),
      itens: n.itens,
      valor: n.valor,
      status: n.status,
      documentoCaminho: n.documentoCaminho,
      documentoMime: n.documentoMime,
      documentoNome: n.documentoNome,
    })),
  });
}

async function POSTTenant(req: NextRequest) {
  const acesso = await autorizar("notas_fiscais");
  if (!acesso.ok) return acesso.resposta;
  const corpo = await req.json().catch(() => ({}));
  const numero = String(corpo.numero ?? "").trim();
  const fornecedor = String(corpo.fornecedor ?? "").trim();
  if (!numero || !fornecedor) {
    return NextResponse.json({ erro: "Informe número e fornecedor." }, { status: 400 });
  }

  // Whitelist de status (auditoria de segurança): valores arbitrários não
  // são aceitos — mesmo o banco ser String, só estes são válidos.
  const STATUS_VALIDOS = ["conferida", "pendente", "cancelada"] as const;
  const status = String(corpo.status ?? "conferida");
  const statusValido = STATUS_VALIDOS.includes(status as (typeof STATUS_VALIDOS)[number])
    ? status
    : "conferida";

  const nota = await prisma.notaFiscal.create({
    data: {
      empresaId: acesso.empresaId,
      numero,
      serie: String(corpo.serie ?? "1").slice(0, 20),
      fornecedor: fornecedor.slice(0, 200),
      emissao: corpo.emissao ? new Date(String(corpo.emissao)) : new Date(),
      itens: Math.max(0, Math.trunc(Number(corpo.itens ?? 0) || 0)),
      valor: Math.max(0, Number(corpo.valor ?? 0) || 0),
      status: statusValido,
    },
  });
  return NextResponse.json({ ok: true, nota }, { status: 201 });
}

export const GET = comTratamentoDeErro("notas-fiscais.GET", GETTenant);
export const POST = comTratamentoDeErro("notas-fiscais.POST", POSTTenant);

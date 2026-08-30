import { NextRequest, NextResponse } from "next/server";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { prisma } from "@/lib/prisma";
import { autorizar } from "@/lib/acesso";

/**
 * GET /api/fiscal/documentos — registros fiscais das vendas (NFC-e) DESTA
 * empresa. Filtros: pedidoId, status, de/ate (ISO). Não expõe o conteúdo
 * do XML na listagem (só na consulta individual).
 */
async function GETTenant(req: NextRequest) {
  const acesso = await autorizar("fiscal");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const url = new URL(req.url);
  const pedidoId = url.searchParams.get("pedidoId")?.trim();
  const status = url.searchParams.get("status")?.trim();
  const de = url.searchParams.get("de");
  const ate = url.searchParams.get("ate");

  const where: Record<string, unknown> = { empresaId };
  if (pedidoId) where.pedidoId = pedidoId;
  if (status) where.status = status;
  if (de || ate) {
    where.emitidaEm = {
      ...(de ? { gte: new Date(de) } : {}),
      ...(ate ? { lte: new Date(ate) } : {}),
    };
  }

  const documentos = await prisma.documentoFiscal.findMany({
    where,
    include: {
      pedido: { select: { id: true, numero: true, canal: true, total: true, criadoEm: true } },
    },
    orderBy: { criadoEm: "desc" },
    take: 200,
  });

  return NextResponse.json({
    documentos: documentos.map((d) => ({
      id: d.id,
      pedidoId: d.pedidoId,
      pedidoNumero: d.pedido?.numero ?? null,
      canal: d.pedido?.canal ?? null,
      total: d.pedido?.total ?? null,
      status: d.status,
      ambiente: d.ambiente,
      provedor: d.provedor,
      numero: d.numero,
      serie: d.serie,
      chave: d.chave,
      protocolo: d.protocolo,
      cStat: d.cStat,
      xMotivo: d.xMotivo,
      tentativas: d.tentativas,
      emitidaEm: d.emitidaEm,
      autorizadaEm: d.autorizadaEm,
      canceladaEm: d.canceladaEm,
      motivoCancelamento: d.motivoCancelamento,
      criadoEm: d.criadoEm,
    })),
  });
}

export const GET = comTratamentoDeErro("fiscal.documentos.GET", GETTenant);

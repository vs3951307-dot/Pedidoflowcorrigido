import { NextRequest, NextResponse } from "next/server";
import { autorizar } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/acesso";
import { gerarBackupCompleto } from "@/lib/backup";

/**
 * GET /api/backups — retorna registros de backup da empresa ativa.
 */
export const GET = comTratamentoDeErro("backups.GET", async () => {
  const acesso = await autorizar("backups");
  if (!acesso.ok) return acesso.resposta;

  const backups = await prisma.backup.findMany({
    where: { empresaId: acesso.empresaId },
    orderBy: { data: "desc" },
  });

  return NextResponse.json({
    ultimoBackup: backups[0]
      ? {
          data: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(backups[0].data),
          hora: new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(backups[0].data),
          tamanho: backups[0].tamanho,
          destino: backups[0].destino,
        }
      : null,
    backups: backups.map((b) => ({
      id: b.id,
      data: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(b.data),
      hora: new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(b.data),
      tipo: b.tipo === "automatico" ? "automático" : "manual",
      tamanho: b.tamanho,
      destino: b.destino,
      status: b.status,
    })),
  });
});

/**
 * POST /api/backups — gera um backup manual COMPLETO para a empresa ativa.
 * A geração em si (PEDIDOS 28/29) mora em `src/lib/backup.ts`, reaproveitada
 * também pelo arquivamento de empresa no Super Admin (PEDIDO 71).
 */
export const POST = comTratamentoDeErro("backups.POST", async (_req: NextRequest) => {
  const acesso = await autorizar("backups");
  if (!acesso.ok) return acesso.resposta;

  const resultado = await gerarBackupCompleto(acesso.empresaId, "manual");
  if (!resultado.ok) {
    return NextResponse.json({ erro: resultado.erro }, { status: 500 });
  }

  await registrarAuditoria(
    "backup_manual",
    `Backup completo gerado (${resultado.tamanho})`,
    acesso.usuario,
    undefined,
    acesso.empresaId
  );
  return NextResponse.json({ ok: true, backup: { id: resultado.backupId, tamanho: resultado.tamanho, destino: resultado.destino } }, { status: 201 });
});

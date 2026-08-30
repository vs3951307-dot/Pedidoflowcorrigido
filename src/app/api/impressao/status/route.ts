import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizar } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";

/**
 * GET /api/impressao/status — quando o agente local consultou a fila pela
 * última vez. Faltava por completo: o admin não tinha como distinguir
 * "impressora ligada mas sem nada pra imprimir agora" de "agente nunca
 * rodou/parou de rodar" — os dois pareciam a mesma fila vazia.
 *
 * "Offline" = mais de 2x o intervalo de polling padrão do agente (3s ×
 * 10 = 30s de folga generosa) sem nenhuma consulta.
 */
const LIMITE_OFFLINE_MS = 30_000;

export const GET = comTratamentoDeErro("impressao.status.GET", async () => {
  const acesso = await autorizar("configuracoes");
  if (!acesso.ok) return acesso.resposta;

  const config = await prisma.configuracao.findUnique({
    where: { empresaId_chave: { empresaId: acesso.empresaId, chave: "impressao_status" } },
  });

  if (!config) {
    return NextResponse.json({ conectado: false, ultimoContatoEm: null, segundosAtras: null });
  }

  let ultimoContatoEm: string | null = null;
  try {
    ultimoContatoEm = JSON.parse(config.valor)?.ultimoContatoEm ?? null;
  } catch {
    ultimoContatoEm = null;
  }

  if (!ultimoContatoEm) {
    return NextResponse.json({ conectado: false, ultimoContatoEm: null, segundosAtras: null });
  }

  const passados = Date.now() - new Date(ultimoContatoEm).getTime();
  return NextResponse.json({
    conectado: passados < LIMITE_OFFLINE_MS,
    ultimoContatoEm,
    segundosAtras: Math.round(passados / 1000),
  });
});

import { NextRequest, NextResponse } from "next/server";
import { autorizar } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { prisma } from "@/lib/prisma";
import { configuracaoSalvarSchema } from "@/lib/schemas/admin";

/**
 * GET /api/configuracoes — retorna todas as configurações da empresa ativa (todas as chaves).
 *
 * Sem mocks: toda configuração vinda do banco PostgreSQL/Prisma.
 */
export const GET = comTratamentoDeErro("configuracoes.GET", async () => {
  const acesso = await autorizar("configuracoes");
  if (!acesso.ok) return acesso.resposta;

  const configs = await prisma.configuracao.findMany({
    where: { empresaId: acesso.empresaId },
    select: {
      chave: true,
      valor: true,
      atualizadoEm: true,
    },
  });

  // Mapear chaves para formatos esperados pelo frontend
  const mapeado: Record<string, any> = {};
  for (const cfg of configs) {
    try {
      mapeado[cfg.chave] = JSON.parse(cfg.valor);
    } catch {
      mapeado[cfg.chave] = cfg.valor;
    }
  }

  return NextResponse.json(mapeado);
});

/**
 * PUT /api/configuracoes — atualiza uma configuração (chave/valor) para a empresa ativa.
 *
 * O corpo espera: { chave: string, valor: any }.
 */
export const PUT = comTratamentoDeErro("configuracoes.PUT", async (req: NextRequest) => {
  const acesso = await autorizar("configuracoes");
  if (!acesso.ok) return acesso.resposta;

  const corpo = await req.json().catch(() => ({}));

  // Whitelist: a chave de configuração é validada contra um catálogo
  // fechado (configuracaoSalvarSchema) — um valor arbitrário não pode ser
  // gravado sob qualquer nome (auditoria de segurança). Configurações com
  // endpoint dedicado (ex.: WhatsApp) não passam por aqui.
  const parseado = configuracaoSalvarSchema.safeParse(corpo);
  if (!parseado.success) {
    return NextResponse.json({ erro: "Chave de configuração não permitida." }, { status: 400 });
  }
  const { chave, valor } = parseado.data;

  await prisma.configuracao.upsert({
    where: { empresaId_chave: { empresaId: acesso.empresaId, chave } },
    update: { valor: JSON.stringify(valor), atualizadoEm: new Date() },
    create: {
      empresaId: acesso.empresaId,
      chave,
      valor: JSON.stringify(valor),
    },
  });

  return NextResponse.json({ ok: true });
});

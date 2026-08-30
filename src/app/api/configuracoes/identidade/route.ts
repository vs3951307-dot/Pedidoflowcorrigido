import { NextRequest, NextResponse } from "next/server";
import { autorizar } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/configuracoes/identidade — retorna logo e tema da empresa.
 */
export const GET = comTratamentoDeErro("identidade.GET", async () => {
  const acesso = await autorizar("configuracoes");
  if (!acesso.ok) return acesso.resposta;

  const empresa = await prisma.empresa.findUnique({
    where: { id: acesso.empresaId },
    select: { logoUrl: true, tema: true, nome: true },
  });

  if (!empresa) {
    return NextResponse.json({ erro: "Empresa não encontrada." }, { status: 404 });
  }

  const tema = empresa.tema && typeof empresa.tema === "object" ? empresa.tema : {};

  return NextResponse.json({
    nome: empresa.nome,
    logoUrl: empresa.logoUrl ?? null,
    tema,
  });
});

/**
 * PUT /api/configuracoes/identidade — atualiza logo e tema da empresa.
 *
 * Body: { logoUrl?: string | null, corPrimaria?: string, corSecundaria?: string, mensagemSplash?: string }
 */
export const PUT = comTratamentoDeErro("identidade.PUT", async (req: NextRequest) => {
  const acesso = await autorizar("configuracoes");
  if (!acesso.ok) return acesso.resposta;

  const corpo = await req.json().catch(() => ({}));

  const atualizacao: Record<string, unknown> = {};

  if ("logoUrl" in corpo) {
    atualizacao.logoUrl = corpo.logoUrl ? String(corpo.logoUrl).trim() : null;
  }

  if ("corPrimaria" in corpo || "corSecundaria" in corpo || "mensagemSplash" in corpo) {
    const existente = await prisma.empresa.findUnique({
      where: { id: acesso.empresaId },
      select: { tema: true },
    });
    const temaAtual = (existente?.tema && typeof existente.tema === "object" ? existente.tema : {}) as Record<string, unknown>;

    const novoTema = { ...temaAtual };
    if ("corPrimaria" in corpo) {
      novoTema.corPrimaria = corpo.corPrimaria ? String(corpo.corPrimaria).trim() : undefined;
    }
    if ("corSecundaria" in corpo) {
      novoTema.corSecundaria = corpo.corSecundaria ? String(corpo.corSecundaria).trim() : undefined;
    }
    if ("mensagemSplash" in corpo) {
      novoTema.mensagemSplash = corpo.mensagemSplash ? String(corpo.mensagemSplash).trim() : undefined;
    }
    atualizacao.tema = JSON.stringify(novoTema);
  }

  if (Object.keys(atualizacao).length === 0) {
    return NextResponse.json({ erro: "Nenhum dado para atualizar." }, { status: 400 });
  }

  await prisma.empresa.update({
    where: { id: acesso.empresaId },
    data: atualizacao,
  });

  return NextResponse.json({ ok: true });
});

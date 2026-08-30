import { NextRequest, NextResponse } from "next/server";
import { autorizar, registrarAuditoria } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { prisma } from "@/lib/prisma";

interface CategoriaApi {
  id: string;
  nome: string;
  ordem: number;
  ativo: boolean;
}

/**
 * GET /api/categorias — lista todas as categorias do cardápio da empresa,
 * com ordem configurável e status ativo/inativo.
 */
export const GET = comTratamentoDeErro("categorias.GET", async () => {
  const acesso = await autorizar("catalogo");
  if (!acesso.ok) return acesso.resposta;

  const categorias = await prisma.categoria.findMany({
    where: { empresaId: acesso.empresaId },
    select: { id: true, nome: true, ordem: true, ativo: true },
    orderBy: { ordem: "asc" },
  });

  const resposta: CategoriaApi[] = categorias.map((c) => ({
    id: c.id,
    nome: c.nome,
    ordem: c.ordem,
    ativo: c.ativo,
  }));

  return NextResponse.json(resposta);
});

/**
 * POST /api/categorias — cria uma nova categoria.
 */
export const POST = comTratamentoDeErro("categorias.POST", async (req: NextRequest) => {
  const acesso = await autorizar("catalogo_editar");
  if (!acesso.ok) return acesso.resposta;

  const corpo = await req.json().catch(() => ({}));
  const { nome, ordem } = corpo;

  if (!nome || typeof nome !== "string" || nome.trim().length === 0) {
    return NextResponse.json({ erro: "Nome da categoria é obrigatório." }, { status: 400 });
  }

  const categoria = await prisma.categoria.create({
    data: {
      empresaId: acesso.empresaId,
      nome: nome.trim(),
      ordem: typeof ordem === "number" ? ordem : 0,
    },
  });

  registrarAuditoria(
    "categoria.criar",
    `Categoria "${categoria.nome}" criada (ordem ${categoria.ordem})`,
    acesso.usuario,
    req.headers.get("x-forwarded-for") ?? undefined,
    acesso.empresaId
  );

  return NextResponse.json({ ok: true, categoria }, { status: 201 });
});

/**
 * PATCH /api/categorias/ordem — atualiza a ordem em lote de categorias ativas.
 */
export const PATCH = comTratamentoDeErro("categorias.PATCH", async (req: NextRequest) => {
  const acesso = await autorizar("catalogo_editar");
  if (!acesso.ok) return acesso.resposta;

  const corpo = await req.json().catch(() => ({}));
  const { ordenacao } = corpo as { ordenacao?: { id: string; ordem: number }[] };

  if (Array.isArray(ordenacao)) {
    for (const item of ordenacao) {
      await prisma.categoria.update({
        where: { id: item.id },
        data: { ordem: item.ordem },
      });
    }
    registrarAuditoria(
      "categoria.ordenar",
      `Ordem de ${ordenacao.length} categoria(s) atualizada`,
      acesso.usuario,
      req.headers.get("x-forwarded-for") ?? undefined,
      acesso.empresaId
    );
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ erro: "Payload de ordenação inválido." }, { status: 400 });
});

import { NextRequest, NextResponse } from "next/server";
import { autorizar, registrarAuditoria } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/categorias/[id] — atualiza nome, ordem ou status (ativo/inativo).
 * Deleta categoria: DELETE /api/categorias/[id]
 */
export const PATCH = comTratamentoDeErro("categorias.PATCH", async (req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizar("catalogo_editar");
  if (!acesso.ok) return acesso.resposta;

  const { id } = params;
  const corpo = await req.json().catch(() => ({}));
  const { nome, ordem, ativo } = corpo;

  const categoria = await prisma.categoria.findUnique({
    where: { id },
  });

  if (!categoria || categoria.empresaId !== acesso.empresaId) {
    return NextResponse.json({ erro: "Categoria não encontrada." }, { status: 404 });
  }

  const atualizacao: { nome?: string; ordem?: number; ativo?: boolean } = {};
  if (typeof nome === "string" && nome.trim().length > 0 && nome !== categoria.nome) {
    atualizacao.nome = nome.trim();
  }
  if (typeof ordem === "number" && ordem !== categoria.ordem) {
    atualizacao.ordem = ordem;
  }
  if (typeof ativo === "boolean" && ativo !== categoria.ativo) {
    atualizacao.ativo = ativo;
  }

  if (Object.keys(atualizacao).length === 0) {
    return NextResponse.json({ ok: true, categoria });
  }

  const atualizada = await prisma.categoria.update({
    where: { id },
    data: atualizacao,
  });

  const partes: string[] = [];
  if (atualizacao.nome) partes.push(`nome "${categoria.nome}" → "${atualizacao.nome}"`);
  if (atualizacao.ordem !== undefined) partes.push(`ordem → ${atualizacao.ordem}`);
  if (atualizacao.ativo !== undefined) partes.push(`ativo → ${atualizacao.ativo}`);

  registrarAuditoria(
    "categoria.atualizar",
    `Categoria "${categoria.nome}" atualizada (${partes.join(", ")})`,
    acesso.usuario,
    req.headers.get("x-forwarded-for") ?? undefined,
    acesso.empresaId
  );

  return NextResponse.json({ ok: true, categoria: atualizada });
});

/**
 * DELETE /api/categorias/[id] — remove uma categoria.
 * Os produtos vinculados ficam com categoriaId = null (não são deletados).
 */
export const DELETE = comTratamentoDeErro("categorias.DELETE", async (req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizar("catalogo_editar");
  if (!acesso.ok) return acesso.resposta;

  const { id } = params;

  const categoria = await prisma.categoria.findUnique({
    where: { id },
    include: { _count: { select: { produtos: true } } },
  });

  if (!categoria || categoria.empresaId !== acesso.empresaId) {
    return NextResponse.json({ erro: "Categoria não encontrada." }, { status: 404 });
  }

  if (categoria._count.produtos > 0) {
    return NextResponse.json(
      { erro: `A categoria "${categoria.nome}" tem ${categoria._count.produtos} produto(s) vinculado(s). Remova-os primeiro.` },
      { status: 409 }
    );
  }

  await prisma.categoria.delete({ where: { id } });

  registrarAuditoria(
    "categoria.excluir",
    `Categoria "${categoria.nome}" excluída`,
    acesso.usuario,
    req.headers.get("x-forwarded-for") ?? undefined,
    acesso.empresaId
  );

  return NextResponse.json({ ok: true });
});

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizar, registrarAuditoria } from "@/lib/acesso";
import { validarCorpo } from "@/lib/validar";
import { estoqueAtualizarSchema } from "@/lib/schemas/estoque";
import { comTratamentoDeErro } from "@/lib/api-erro";

/**
 * PATCH /api/estoque/[id] — edita um item de estoque (nome, categoria,
 * unidade, mínimo, custo) e/ou ativa/desativa. Faltava por completo: só
 * dava para CRIAR (`POST /api/estoque`) e lançar movimentação — nunca
 * corrigir um cadastro nem desativar um item que parou de ser comprado.
 */
export const PATCH = comTratamentoDeErro("estoque.id.PATCH", async (req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizar("estoque");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const corpoBruto = await req.json().catch(() => ({}));
  const validado = validarCorpo(estoqueAtualizarSchema, corpoBruto);
  if (!validado.ok) return validado.resposta;
  const corpo = validado.dados;

  const existente = await prisma.estoqueProduto.findFirst({ where: { id: params.id, empresaId } });
  if (!existente) {
    return NextResponse.json({ erro: "Item de estoque não encontrado." }, { status: 404 });
  }

  // Nome único por empresa (mesma regra do cadastro) — evita duplicar item
  // ao renomear para um nome que já existe em outro registro.
  if (corpo.nome && corpo.nome.toLowerCase() !== existente.nome.toLowerCase()) {
    const duplicado = await prisma.estoqueProduto.findFirst({
      where: { empresaId, nome: { equals: corpo.nome, mode: "insensitive" }, NOT: { id: existente.id } },
    });
    if (duplicado) {
      return NextResponse.json({ erro: `Já existe um item de estoque chamado "${corpo.nome}".` }, { status: 409 });
    }
  }

  const produto = await prisma.estoqueProduto.update({
    where: { id: existente.id },
    data: corpo,
  });

  await registrarAuditoria(
    corpo.ativo !== undefined && Object.keys(corpo).length === 1
      ? corpo.ativo
        ? "estoque_ativado"
        : "estoque_desativado"
      : "estoque_atualizado",
    produto.nome,
    acesso.usuario,
    undefined,
    empresaId
  );

  return NextResponse.json({ ok: true, produto });
});

/**
 * DELETE /api/estoque/[id] — exclui um item de estoque SE ele nunca teve
 * nenhuma movimentação registrada (entrada/saída). Com movimentação, a
 * exclusão apagaria o histórico de compras/uso do item silenciosamente —
 * em vez disso, devolve 409 e orienta a desativar (PATCH `ativo: false`),
 * que mantém o item fora das listas de compra sem apagar nada.
 */
export const DELETE = comTratamentoDeErro("estoque.id.DELETE", async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizar("estoque");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const existente = await prisma.estoqueProduto.findFirst({ where: { id: params.id, empresaId } });
  if (!existente) {
    return NextResponse.json({ erro: "Item de estoque não encontrado." }, { status: 404 });
  }

  const totalMovimentacoes = await prisma.movimentacaoEstoque.count({ where: { produtoId: existente.id } });
  if (totalMovimentacoes > 0) {
    return NextResponse.json(
      {
        erro: `"${existente.nome}" tem ${totalMovimentacoes} movimentação(ões) registrada(s) e não pode ser excluído — desative o item em vez de excluir.`,
      },
      { status: 409 }
    );
  }

  await prisma.estoqueProduto.delete({ where: { id: existente.id } });
  await registrarAuditoria("estoque_excluido", existente.nome, acesso.usuario, undefined, empresaId);
  return NextResponse.json({ ok: true });
});

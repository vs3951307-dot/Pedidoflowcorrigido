import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizar, registrarAuditoria } from "@/lib/acesso";
import { validarCorpo } from "@/lib/validar";
import { produtoAtualizarSchema } from "@/lib/schemas/produto";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { verificarLimiteProdutos } from "@/lib/limites-plano";

export const PATCH = comTratamentoDeErro("produtos.PATCH", async (req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizar("catalogo_editar");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;
  const corpoBruto = await req.json().catch(() => ({}));
  const validado = validarCorpo(produtoAtualizarSchema, corpoBruto);
  if (!validado.ok) return validado.resposta;
  const corpo = validado.dados;

  const existente = await prisma.produto.findFirst({ where: { id: params.id, empresaId } });
  if (!existente) {
    return NextResponse.json({ erro: "Produto não encontrado." }, { status: 404 });
  }

  // PEDIDO 69 (mesmo princípio do 35): reativar um produto desativado
  // também precisa respeitar o limite do plano — senão dava pra furar
  // o limite de criação simplesmente reativando em vez de criar.
  if (corpo.ativo === true && !existente.ativo) {
    const limite = await verificarLimiteProdutos(empresaId);
    if (!limite.permitido) {
      return NextResponse.json(
        {
          erro: `Limite de ${limite.limite} produto(s) ativo(s) do seu plano atingido. Desative outro produto ou fale com o suporte para ampliar o plano.`,
        },
        { status: 402 }
      );
    }
  }

  const dados: Record<string, unknown> = {};
  if (corpo.nome !== undefined) dados.nome = corpo.nome;
  if (corpo.descricao !== undefined) dados.descricao = corpo.descricao;
  if (corpo.preco !== undefined) dados.preco = corpo.preco;
  if (corpo.emoji !== undefined) dados.emoji = corpo.emoji;
  if (corpo.destaque !== undefined) dados.destaque = corpo.destaque;
  if (corpo.ativo !== undefined) dados.ativo = corpo.ativo;
  if (corpo.ncm !== undefined) dados.ncm = corpo.ncm.trim();
  if (corpo.cest !== undefined) dados.cest = corpo.cest.trim();
  if (corpo.csosn !== undefined) dados.csosn = corpo.csosn.trim();
  if (corpo.cfop !== undefined) dados.cfop = corpo.cfop.trim();
  if (corpo.unidade !== undefined) dados.unidade = corpo.unidade.trim();

  const produto = await prisma.produto.update({
    where: { id: existente.id },
    data: dados,
  });
  await registrarAuditoria("produto_atualizado", produto.nome, acesso.usuario, undefined, empresaId);
  return NextResponse.json({ ok: true, produto });
});

export const DELETE = comTratamentoDeErro("produtos.DELETE", async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizar("catalogo_editar");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const existente = await prisma.produto.findFirst({ where: { id: params.id, empresaId } });
  if (!existente) {
    return NextResponse.json({ erro: "Produto não encontrado." }, { status: 404 });
  }

  await prisma.itemPedido.deleteMany({ where: { produtoId: existente.id } });
  await prisma.precoTamanho.deleteMany({ where: { produtoId: existente.id } });
  await prisma.produtoSabor.deleteMany({ where: { produtoId: existente.id } });
  await prisma.produto.delete({ where: { id: existente.id } });
  await registrarAuditoria("produto_excluido", existente.nome, acesso.usuario, undefined, empresaId);
  return NextResponse.json({ ok: true });
});

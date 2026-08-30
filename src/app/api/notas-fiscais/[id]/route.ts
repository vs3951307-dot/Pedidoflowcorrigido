import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizar } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";

/**
 * GET /api/notas-fiscais/[id] — detalhe de uma nota fiscal de entrada.
 * Faltava por completo (o botão "Ver" avisava "vai vir com o backend").
 *
 * O modelo `NotaFiscal` guarda só o AGREGADO (itens, valor total) — não há
 * linha a linha de produtos no schema atual. O detalhe real e verificável
 * que dá pra mostrar é: os dados da nota + quais movimentações de estoque
 * foram lançadas vinculadas a ela (`MovimentacaoEstoque.notaId`), que é
 * exatamente o que confere "os itens dessa nota entraram no estoque?".
 */
export const GET = comTratamentoDeErro("notas-fiscais.id.GET", async (_req, { params }: { params: { id: string } }) => {
  const acesso = await autorizar("notas_fiscais");
  if (!acesso.ok) return acesso.resposta;

  const nota = await prisma.notaFiscal.findFirst({
    where: { id: params.id, empresaId: acesso.empresaId },
  });
  if (!nota) {
    return NextResponse.json({ erro: "Nota fiscal não encontrada." }, { status: 404 });
  }

  const movimentacoes = await prisma.movimentacaoEstoque.findMany({
    where: { empresaId: acesso.empresaId, notaId: nota.id },
    include: { produto: { select: { nome: true, unidade: true } } },
    orderBy: { criadoEm: "asc" },
  });

  return NextResponse.json({
     nota: {
       id: nota.id,
       numero: nota.numero,
       serie: nota.serie,
       fornecedor: nota.fornecedor,
       emissao: nota.emissao.toISOString(),
       itens: nota.itens,
       valor: nota.valor,
       status: nota.status,
       documentoCaminho: nota.documentoCaminho,
       documentoMime: nota.documentoMime,
       documentoNome: nota.documentoNome,
     },
    movimentacoesVinculadas: movimentacoes.map((m) => ({
      id: m.id,
      produto: m.produto.nome,
      quantidade: m.quantidade,
      unidade: m.produto.unidade,
      valorTotal: m.valorTotal ?? 0,
      responsavel: m.responsavel,
      criadoEm: m.criadoEm.toISOString(),
    })),
  });
});

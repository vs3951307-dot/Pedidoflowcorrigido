import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizar } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";

/** Entradas e saídas de estoque DESTA empresa. */
export const GET = comTratamentoDeErro("estoque.movimentacoes.GET", async () => {
  const acesso = await autorizar("estoque");
  if (!acesso.ok) return acesso.resposta;
  const movimentacoes = await prisma.movimentacaoEstoque.findMany({
    where: { empresaId: acesso.empresaId },
    include: { produto: true },
    orderBy: { criadoEm: "desc" },
    take: 100,
  });
  return NextResponse.json({
    entradas: movimentacoes
      .filter((m) => m.tipo === "entrada")
      .map((m) => ({
        id: m.id,
        produto: m.produto.nome,
        quantidade: m.quantidade,
        unidade: m.produto.unidade,
        fornecedor: m.fornecedor,
        valor: m.valorTotal ?? 0,
        responsavel: m.responsavel,
        notaId: m.notaId,
        criadoEm: m.criadoEm.toISOString(),
      })),
    saidas: movimentacoes
      .filter((m) => m.tipo === "saida")
      .map((m) => ({
        id: m.id,
        produto: m.produto.nome,
        quantidade: m.quantidade,
        unidade: m.produto.unidade,
        responsavel: m.responsavel,
        criadoEm: m.criadoEm.toISOString(),
      })),
  });
});

/** Registra entrada/saída e atualiza a quantidade em estoque (desta empresa). */
export const POST = comTratamentoDeErro("estoque.movimentacoes.POST", async (req: NextRequest) => {
  const acesso = await autorizar("estoque");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;
  const corpo = await req.json().catch(() => ({}));
  const produtoId = String(corpo.produtoId ?? "");
  const tipo = String(corpo.tipo ?? "entrada");
  const quantidade = Number(corpo.quantidade);
  const notaId = corpo.notaId ? String(corpo.notaId) : null;

  if (!produtoId || !["entrada", "saida"].includes(tipo) || !Number.isFinite(quantidade) || quantidade <= 0) {
    return NextResponse.json({ erro: "Dados de movimentação inválidos." }, { status: 400 });
  }
  if (notaId) {
    const nota = await prisma.notaFiscal.findFirst({ where: { id: notaId, empresaId } });
    if (!nota) {
      return NextResponse.json({ erro: "Nota fiscal informada não encontrada." }, { status: 404 });
    }
  }

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const produto = await tx.estoqueProduto.findFirst({ where: { id: produtoId, empresaId } });
      if (!produto) {
        throw new Error("produto-nao-encontrado");
      }

      // CORREÇÃO (PEDIDO 73 — "duas vendas simultâneas não podem gerar
      // atualização perdida"): antes, a nova quantidade era calculada a
      // partir de uma LEITURA anterior (`produto.quantidade - x`) e
      // gravada depois — duas saídas concorrentes liam a MESMA
      // quantidade antes de qualquer uma escrever, e a segunda escrita
      // "pisava" na primeira (perde uma das duas baixas). Agora usa
      // `increment`/`decrement`, que o Postgres traduz para
      // `UPDATE ... SET quantidade = quantidade + N` — atômico, a
      // linha fica bloqueada durante o UPDATE, chamadas concorrentes
      // são serializadas pelo próprio banco.
      //
      // A checagem de saldo suficiente pra saída também precisa ser
      // condicional NO BANCO, não numa leitura antiga: `updateMany`
      // com `WHERE quantidade >= N` só aplica a baixa se ainda houver
      // saldo NO MOMENTO EXATO do UPDATE — `count === 0` decide se foi
      // por falta de saldo (corrida real) ou produto sumiu.
      let atualizado: { quantidade: number };
      if (tipo === "entrada") {
        atualizado = await tx.estoqueProduto.update({
          where: { id: produto.id },
          data: { quantidade: { increment: quantidade } },
        });
      } else {
        const resultadoUpdate = await tx.estoqueProduto.updateMany({
          where: { id: produto.id, empresaId, quantidade: { gte: quantidade } },
          data: { quantidade: { decrement: quantidade } },
        });
        if (resultadoUpdate.count === 0) {
          throw new Error("estoque-insuficiente");
        }
        const relido = await tx.estoqueProduto.findFirst({ where: { id: produto.id }, select: { quantidade: true } });
        atualizado = { quantidade: relido?.quantidade ?? 0 };
      }

      const mov = await tx.movimentacaoEstoque.create({
        data: {
          empresaId,
          produtoId,
          tipo,
          quantidade,
          fornecedor: corpo.fornecedor ? String(corpo.fornecedor) : null,
          valorTotal: tipo === "entrada" && corpo.valorTotal ? Number(corpo.valorTotal) : null,
          // Responsável é sempre quem está autenticado — nunca um valor
          // enviado pelo cliente (evitava que qualquer usuário registrasse
          // a entrada em nome de outra pessoa).
          responsavel: acesso.usuario.nome,
          notaId,
        },
      });
      return { mov, atualizado };
    }, { timeout: 30_000 });

    return NextResponse.json(
      {
        ok: true,
        movimentacao: {
          id: resultado.mov.id,
          tipo,
          quantidade,
          estoqueAtual: resultado.atualizado.quantidade,
        },
      },
      { status: 201 }
    );
  } catch (e) {
    if (e instanceof Error && e.message === "produto-nao-encontrado") {
      return NextResponse.json({ erro: "Produto de estoque não encontrado." }, { status: 404 });
    }
    if (e instanceof Error && e.message === "estoque-insuficiente") {
      return NextResponse.json({ erro: "Estoque insuficiente para esta saída." }, { status: 409 });
    }
    throw e;
  }
});

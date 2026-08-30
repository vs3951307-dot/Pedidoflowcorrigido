import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizar } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";

/** Estoque: itens com status, resumo e valor por categoria — mesmo contrato
 *  de `src/lib/estoque.ts`. */
export const GET = comTratamentoDeErro("estoque.GET", async () => {
  const acesso = await autorizar("estoque");
  if (!acesso.ok) return acesso.resposta;
  const itens = await prisma.estoqueProduto.findMany({
    where: { empresaId: acesso.empresaId },
    orderBy: { nome: "asc" },
    include: { _count: { select: { movimentacoes: true } } },
  });

  const produtos = itens.map((p) => {
    const status = p.quantidade <= 0 ? "esgotado" : p.quantidade <= p.minimo ? "baixo" : "ok";
    return {
      id: p.id,
      nome: p.nome,
      categoria: p.categoria,
      unidade: p.unidade,
      estoque: p.quantidade,
      minimo: p.minimo,
      custoUnitario: p.custoUnitario,
      ativo: p.ativo,
      fotoUrl: p.fotoUrl,
      temFoto: !!p.fotoUrl,
      status,
    };
  });

  const valorPorCategoria: { categoria: string; valor: number }[] = [];
  const mapa: Record<string, number> = {};
  for (const p of itens) {
    mapa[p.categoria] = (mapa[p.categoria] ?? 0) + p.quantidade * p.custoUnitario;
  }
  for (const [categoria, valor] of Object.entries(mapa)) {
    valorPorCategoria.push({ categoria, valor: Math.round(valor * 100) / 100 });
  }

  const valorTotal = produtos.reduce((acc, p) => acc + p.estoque * p.custoUnitario, 0);
  const baixo = produtos.filter((p) => p.status === "baixo").length;
  const esgotados = produtos.filter((p) => p.status === "esgotado").length;
  const itensTotais = produtos.reduce((acc, p) => acc + p.estoque, 0);

  return NextResponse.json({
    resumo: {
      valorTotal: Math.round(valorTotal * 100) / 100,
      baixo,
      esgotados,
      itensTotais,
    },
    produtos,
    valorPorCategoria,
  });
});

/**
 * POST /api/estoque — cria um novo item monitorado (ex.: "Farinha de trigo
 * 5kg"). Sem esta rota não havia NENHUMA forma de começar a controlar
 * estoque pelo navegador — só dava para lançar movimentação de um item que
 * já existisse (`POST /api/estoque/movimentacoes`), e nada criava o item em
 * si. Se vier com `estoqueInicial > 0`, registra também a primeira entrada
 * (auditoria consistente: todo estoque > 0 tem uma movimentação de origem).
 */
export const POST = comTratamentoDeErro("estoque.POST", async (req: NextRequest) => {
  const acesso = await autorizar("estoque");
  if (!acesso.ok) return acesso.resposta;

  const corpo = await req.json().catch(() => ({}));
  const nome = String(corpo.nome ?? "").trim();
  const categoria = String(corpo.categoria ?? "").trim();
  const unidade = String(corpo.unidade ?? "").trim();
  const minimo = Number(corpo.minimo);
  const custoUnitario = Number(corpo.custoUnitario);
  const estoqueInicial = Number(corpo.estoqueInicial ?? 0);

  if (!nome) return NextResponse.json({ erro: "Nome do item é obrigatório." }, { status: 400 });
  if (!categoria) return NextResponse.json({ erro: "Categoria é obrigatória." }, { status: 400 });
  if (!unidade) return NextResponse.json({ erro: "Unidade é obrigatória (ex.: kg, un, pct)." }, { status: 400 });
  if (!Number.isFinite(minimo) || minimo < 0) {
    return NextResponse.json({ erro: "Estoque mínimo deve ser um número maior ou igual a zero." }, { status: 400 });
  }
  if (!Number.isFinite(custoUnitario) || custoUnitario < 0) {
    return NextResponse.json({ erro: "Custo unitário deve ser um número maior ou igual a zero." }, { status: 400 });
  }
  if (!Number.isFinite(estoqueInicial) || estoqueInicial < 0) {
    return NextResponse.json({ erro: "Estoque inicial deve ser um número maior ou igual a zero." }, { status: 400 });
  }

  const existente = await prisma.estoqueProduto.findFirst({
    where: { empresaId: acesso.empresaId, nome: { equals: nome, mode: "insensitive" } },
  });
  if (existente) {
    return NextResponse.json({ erro: `Já existe um item de estoque chamado "${nome}".` }, { status: 409 });
  }

  const produto = await prisma.$transaction(async (tx) => {
    const criado = await tx.estoqueProduto.create({
      data: {
        empresaId: acesso.empresaId,
        nome,
        categoria,
        unidade,
        quantidade: estoqueInicial,
        minimo,
        custoUnitario,
      },
    });
    if (estoqueInicial > 0) {
      await tx.movimentacaoEstoque.create({
        data: {
          empresaId: acesso.empresaId,
          produtoId: criado.id,
          tipo: "entrada",
          quantidade: estoqueInicial,
          valorTotal: estoqueInicial * custoUnitario,
          responsavel: acesso.usuario.nome,
        },
      });
    }
    return criado;
  }, { timeout: 30_000 });

  return NextResponse.json({ ok: true, produto }, { status: 201 });
});

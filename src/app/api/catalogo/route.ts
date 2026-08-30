import { NextRequest, NextResponse } from "next/server";
import { autorizar } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { prisma } from "@/lib/prisma";
import { verificarLimiteProdutos } from "@/lib/limites-plano";

/**
 * GET /api/catalogo — retorna o cardápio da empresa ativa (produtos + categorias).
 *
 * Conforme o design original, este é o ponto central de verdade para dados
 * de produto de cada tenant — sem caches, sem dados simulados.
 */
export const GET = comTratamentoDeErro("catalogo.GET", async () => {
  const acesso = await autorizar("catalogo");
  if (!acesso.ok) return acesso.resposta;

  const produtos = await prisma.produto.findMany({
      where: { empresaId: acesso.empresaId },
      select: {
        id: true,
        nome: true,
        descricao: true,
        preco: true,
        emoji: true,
        destaque: true,
        ativo: true,
        ncm: true,
        cest: true,
        csosn: true,
        cfop: true,
        unidade: true,
        fotoUrl: true,
        categoria: { select: { nome: true } },
        sabores: {
          select: {
            sabor: { select: { id: true, nome: true, tipo: true } },
          },
          where: { sabor: { ativo: true } },
        },
        precos: {
          select: {
            // `maxSabores` PRECISA estar aqui: o map abaixo lê
            // `pt.tamanho.maxSabores`, e sem o campo no select ele vinha
            // sempre `undefined` — o front caía no fallback (2) e a
            // Família nunca aceitava 3 sabores.
            tamanho: { select: { id: true, nome: true, fatorPreco: true, maxSabores: true } },
            valor: true,
          },
        },
      },
    });

    const categorias = await prisma.categoria.findMany({
      where: { empresaId: acesso.empresaId, ativo: true },
      select: { id: true, nome: true, ordem: true, grupoSabores: true },
      orderBy: { ordem: "asc" },
    });

    const adicionais = await prisma.adicional.findMany({
      where: { empresaId: acesso.empresaId, ativo: true },
      select: { id: true, nome: true, preco: true, categoriaId: true },
    });

    // -----------------------------------------------------------------
    // Lista GLOBAL de sabores, com o preço de cada um em cada tamanho.
    //
    // POR QUE ISTO É NECESSÁRIO: no cadastro, "Pizzas salgadas" e "Pizzas
    // especiais" são PRODUTOS diferentes, cada um com seus sabores. O
    // seletor do PDV só mostrava `produto.sabores` — ou seja, dentro de
    // "Pizzas salgadas" era impossível escolher um sabor especial como
    // segunda metade. Meio a meio tradicional + especial, que é o pedido
    // mais comum de uma pizzaria, simplesmente não existia na tela.
    //
    // O backend já resolve sabor por NOME em qualquer produto
    // (`precoPorSaborNome` em criar-pedido.ts e em mesas/[id]/itens), então
    // ele sempre aceitou a mistura. Faltava a UI ter os dados.
    //
    // `precoPorTamanho` é indexado pelo NOME do tamanho (Média/Grande/
    // Família) porque é assim que o servidor resolve o preço — o id do
    // tamanho pertence ao produto, o nome é compartilhado.
    const saboresDisponiveis = new Map<
      string,
      { id: string; nome: string; tipo: string; precoPorTamanho: Record<string, number>; produtoNome: string }
    >();
    for (const p of produtos as any[]) {
      if (!p.sabores || p.sabores.length === 0) continue;
      const precoPorTamanho: Record<string, number> = {};
      for (const pt of p.precos ?? []) precoPorTamanho[pt.tamanho.nome] = pt.valor;
      for (const ps of p.sabores) {
        // Chave pelo nome em minúsculas: é a mesma chave que o servidor usa
        // para achar o preço. Sabor repetido em dois produtos fica com o
        // primeiro — igual ao comportamento do servidor.
        const chave = String(ps.sabor.nome).toLowerCase();
        if (saboresDisponiveis.has(chave)) continue;
        saboresDisponiveis.set(chave, {
          id: ps.sabor.id,
          nome: ps.sabor.nome,
          tipo: ps.sabor.tipo,
          precoPorTamanho,
          produtoNome: p.nome,
        });
      }
    }

    return NextResponse.json({
      categorias: categorias.map((c) => c.nome),
      categoriasDetalhadas: categorias,
      adicionais,
      saboresDisponiveis: [...saboresDisponiveis.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
      produtos: (produtos as unknown[]).map((p: any) => {
        const { categoria, sabores, precos, ...resto } = p;
        return {
          ...resto,
          categoria: categoria.nome,
          sabores: sabores.map((ps: any) => ({ id: ps.sabor.id, nome: ps.sabor.nome, tipo: ps.sabor.tipo })),
          tamanhos: precos.map((pt: any) => ({ id: pt.tamanho.id, nome: pt.tamanho.nome, preco: pt.valor, fatorPreco: pt.tamanho.fatorPreco, maxSabores: pt.tamanho.maxSabores })),
        };
      }),
    });
});

/**
 * POST /api/catalogo — cria um novo produto para a empresa ativa.
 *
 * A requisição espera um objeto com campos: nome, descricao, preco, categoria, emoji, destaque (opcional).
 * Todas as validações são feitas no hook `comTratamentoDeErro` automaticamente.
 */
export const POST = comTratamentoDeErro("catalogo.POST", async (req: NextRequest) => {
  // CORREÇÃO: criar produto exige "catalogo_editar" (mesma permissão do
  // PATCH/DELETE em /api/produtos/[id]) — antes usava "catalogo", a
  // permissão de LEITURA que Caixa e Garçom também têm (só pra
  // consultar o cardápio na hora de vender). Com o bug, qualquer Caixa
  // ou Garçom conseguia criar produtos novos no cardápio.
  const acesso = await autorizar("catalogo_editar");
  if (!acesso.ok) return acesso.resposta;

  const corpo = await req.json().catch(() => ({}));
  const { nome, descricao, preco, categoria, emoji, destaque } = corpo;

  if (!nome || typeof nome !== "string" || nome.trim().length === 0) {
    return NextResponse.json({ erro: "Nome do produto é obrigatório." }, { status: 400 });
  }
  if (typeof preco !== "number" || preco < 0) {
    return NextResponse.json({ erro: "Preço deve ser um número maior ou igual a zero." }, { status: 400 });
  }
  if (!categoria || typeof categoria !== "string") {
    return NextResponse.json({ erro: "Categoria é obrigatória." }, { status: 400 });
  }

  // PEDIDO 69: limite de produtos do plano — antes não existia campo
  // nem checagem nenhuma para isto.
  const limite = await verificarLimiteProdutos(acesso.empresaId);
  if (!limite.permitido) {
    return NextResponse.json(
      {
        erro: `Limite de ${limite.limite} produto(s) ativo(s) do seu plano atingido. Desative um produto existente ou fale com o suporte para ampliar o plano.`,
      },
      { status: 402 }
    );
  }

  const categoriaRecord = await prisma.categoria.upsert({
    where: { empresaId_nome: { empresaId: acesso.empresaId, nome: categoria } },
    update: {},
    create: {
      empresaId: acesso.empresaId,
      nome: categoria,
    },
  });

  const produto = await prisma.produto.create({
    data: {
      empresaId: acesso.empresaId,
      nome: nome.trim(),
      descricao: descricao?.trim() || "",
      preco,
      categoriaId: categoriaRecord.id,
      emoji: emoji?.trim() || "📦",
      destaque: !!destaque,
    },
  });

  return NextResponse.json({ ok: true, produto }, { status: 201 });
});
import { prisma } from "@/lib/prisma";
import {
  emojiParaCategoria,
  type AdicionalImportacao,
  type ItemCardapioImportacao,
} from "@/lib/cardapio/analisar-texto";

/**
 * Importação em massa do cardápio (usada por POST /api/catalogo/importar).
 *
 * Regras:
 * - Produtos que já existem na empresa (nome, ignorando acentos/caixa) são
 *   PULADOS — evita duplicar o cardápio ao importar duas vezes o mesmo PDF.
 * - Categorias e tamanhos são reutilizados (get-or-create) por nome.
 * - Produtos importados ganham `preco` = menor tamanho (base para o PDV,
 *   Salão e Garçom) e um `PrecoTamanho` por tamanho (preço por tamanho para
 *   o atendente WhatsApp).
 * - Sabores reconhecidos são cadastrados e vinculados aos produtos de
 *   categorias de pizza (ex.: "Pizzas salgadas").
 */

function normalizarParaComparar(texto: string): string {
  return texto.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export interface ResultadoImportacao {
  criados: number;
  ignorados: string[];
}

export async function importarCardapio(
  empresaId: string,
  itens: ItemCardapioImportacao[],
  adicionais: AdicionalImportacao[],
  sabores: string[]
): Promise<ResultadoImportacao> {
  const existentes = await prisma.produto.findMany({
    where: { empresaId },
    select: { nome: true },
  });
  const nomesExistentes = new Set(existentes.map((p) => normalizarParaComparar(p.nome)));

  const aImportar: ItemCardapioImportacao[] = [];
  const ignorados: string[] = [];
  for (const item of itens) {
    const chave = normalizarParaComparar(item.nome);
    if (nomesExistentes.has(chave)) {
      ignorados.push(item.nome);
      continue;
    }
    nomesExistentes.add(chave);
    aImportar.push(item);
  }

  const saboresValidos = sabores
    .map((s) => s.trim().slice(0, 60))
    .filter((s) => s.length > 0);

  const criados = await prisma.$transaction(async (tx) => {
    let total = 0;

    const saboresProntos = await Promise.all(
      saboresValidos.map((nome) =>
        tx.sabor.upsert({
          where: { empresaId_nome: { empresaId, nome } },
          update: {},
          create: { empresaId, nome },
        })
      )
    );

    for (const item of aImportar) {
      const categoria = await tx.categoria.upsert({
        where: { empresaId_nome: { empresaId, nome: item.categoria } },
        update: {},
        create: { empresaId, nome: item.categoria },
      });

      const precos: { tamanhoId: string; valor: number }[] = [];
      for (const t of item.tamanhos) {
        const tamanho = await tx.tamanho.upsert({
          where: { empresaId_nome: { empresaId, nome: t.nome } },
          update: {},
          create: { empresaId, nome: t.nome },
        });
        precos.push({ tamanhoId: tamanho.id, valor: t.valor });
      }

      const produto = await tx.produto.create({
        data: {
          empresaId,
          nome: item.nome,
          descricao: item.descricao ?? "",
          preco: Math.min(...precos.map((p) => p.valor)),
          emoji: emojiParaCategoria(item.categoria),
          categoriaId: categoria.id,
          precos: { create: precos },
        },
      });

      // Sabores valem para pizzas — vincula todos os sabores reconhecidos
      // aos produtos de categoria de pizza (o PDV/WhatsApp oferecem então
      // a escolha de sabor na hora de montar o pedido).
      if (normalizarParaComparar(item.categoria).includes("pizza") && saboresProntos.length > 0) {
        await tx.produtoSabor.createMany({
          data: saboresProntos.map((sabor) => ({ produtoId: produto.id, saborId: sabor.id })),
          skipDuplicates: true,
        });
      }

      total += 1;
    }

    for (const adicional of adicionais) {
      await tx.adicional.upsert({
        where: { empresaId_nome: { empresaId, nome: adicional.nome } },
        update: { preco: adicional.valor },
        create: { empresaId, nome: adicional.nome, preco: adicional.valor, ativo: true },
      });
    }

    return total;
  }, { timeout: 30_000 });

  return { criados, ignorados };
}

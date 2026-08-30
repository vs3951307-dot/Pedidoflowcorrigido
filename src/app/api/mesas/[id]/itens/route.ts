import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizar } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { emitirEventoTempoReal } from "@/lib/eventos-tempo-real";
import { proximoNumeroPedido } from "@/lib/contador";
import { calcularPrecoItem, calcularTotalItens } from "@/lib/precificacao";
import { calcularPrecoItem as calcularPrecoPizza, validarMisturaSabores } from "@/lib/preco-pizza";
import { lerConfigPizza } from "@/lib/impressao";

class ErroComanda extends Error {}

/**
 * POST /api/mesas/[id]/itens — persiste itens da comanda da mesa.
 *
 * A comanda de salão é um Pedido (canal "salao", mesa, status aberto). O
 * PDV adiciona/adjusta/remove itens ESCRIVENDO no pedido aberto da mesa
 * (criando-o no primeiro item). Sem isto, os itens só existiam em memória
 * e sumiam ao recarregar (bug confirmado).
 *
 * Corpo: { acao: "adicionar"|"atualizar"|"remover", item?, uid?, quantidade? }
 *
 * - "adicionar":  `item` com produtoId/nome/quantidade/observacao/tamanhoNome/
 *                 sabores/adicionais. Preço é SEMPRE recalculado no servidor
 *                 (produto + tamanho + adicionais do cadastro) — nunca o enviado.
 * - "atualizar":  `uid` + `quantidade` (0 ou negativo remove a linha).
 * - "remover":    `uid` da linha a remover.
 */
export const POST = comTratamentoDeErro("mesas.id.itens.POST", async (req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizar("salao");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;
  const numero = Number(params.id);

  const mesa = await prisma.mesa.findUnique({ where: { empresaId_numero: { empresaId, numero } } });
  if (!mesa) {
    return NextResponse.json({ erro: "Mesa não encontrada." }, { status: 404 });
  }

  const corpo = await req.json().catch(() => ({}));
  const acao = String(corpo.acao ?? "");
  if (!["adicionar", "atualizar", "remover"].includes(acao)) {
    return NextResponse.json({ erro: "Ação inválida. Use adicionar, atualizar ou remover." }, { status: 400 });
  }

  let resultado: { id: string; criadoEm: Date; total: number; itens: unknown[] };
  try {
    resultado = await prisma.$transaction(async (tx) => {
      const pedidoAberto = await tx.pedido.findFirst({
        where: { empresaId, canal: "salao", mesaId: mesa.id, status: { notIn: ["concluido", "cancelado"] } },
        include: { itens: true },
      });

      let pedido = pedidoAberto;
      if (acao === "adicionar" && !pedido) {
        pedido = await tx.pedido.create({
          data: {
            empresaId,
            numero: await proximoNumeroPedido(tx, empresaId),
            canal: "salao",
            status: "andamento",
            producao: "recebido",
            recebidoEm: new Date(),
            mesaId: mesa.id,
            total: 0,
          },
          include: { itens: true },
        });
      }
      if (!pedido) {
        throw new ErroComanda("Mesa sem comanda aberta. Adicione um item para começar.");
      }

      if (acao === "adicionar") {
        const bruto = (corpo.item ?? {}) as {
          produtoId?: string;
          nome?: string;
          quantidade?: number;
          observacao?: string;
          tamanhoNome?: string;
          sabores?: unknown;
          adicionais?: unknown;
        };
        const produtoId = String(bruto.produtoId ?? "");
        const produto = await tx.produto.findUnique({
          where: { id: produtoId },
          include: { precos: { include: { tamanho: true } } },
        });
        if (!produto || produto.empresaId !== empresaId) {
          throw new ErroComanda(`Produto inexistente no cadastro: "${bruto.nome ?? "Item"}". Atualize o cardápio.`);
        }

        const configPizza = await lerConfigPizza(empresaId);

        // Todos os produtos que são pizzas, para resolver o preço de CADA
        // sabor escolhido (cada sabor é um Produto próprio).
        const pizzaCandidatos = await tx.produto.findMany({
          where: { empresaId, sabores: { some: {} } },
          include: { precos: { include: { tamanho: true } }, sabores: { include: { sabor: { select: { id: true, nome: true, tipo: true } } } } },
        });
        const precoPorSaborNome = new Map<string, { saborId: string; tipo: string; precos: Map<string, number> }>();
        for (const p of pizzaCandidatos) {
          const mapT = new Map<string, number>();
          for (const pt of p.precos) mapT.set(pt.tamanho.nome, pt.valor);
          for (const ps of p.sabores) {
            precoPorSaborNome.set(ps.sabor.nome.toLowerCase(), {
              saborId: ps.sabor.id,
              tipo: ps.sabor.tipo,
              precos: mapT,
            });
          }
        }

        const sabores = Array.isArray(bruto.sabores)
          ? bruto.sabores
              .map((s: unknown) => (typeof s === "string" ? s : (s as { nome?: string }).nome ?? ""))
              .filter((s: string) => s.length > 0)
          : [];

        // O preço do adicional NUNCA vem do cliente (é resolvido pelo nome
        // no cadastro), mas a QUANTIDADE precisa vir — é a única parte que
        // só o cliente sabe. Antes o cliente mandava `preco * quantidade` e
        // o servidor descartava: 3x bacon virava 1x bacon na conta.
        const adicionais = Array.isArray(bruto.adicionais)
          ? bruto.adicionais
              .map((a: unknown) => {
                const b = a as { nome?: string; quantidade?: number; id?: string };
                return {
                  nome: String(b.nome ?? ""),
                  adicionalId: b.id ? String(b.id) : null,
                  quantidade: Math.max(1, Math.floor(Number(b.quantidade ?? 1)) || 1),
                };
              })
              .filter((a) => a.nome.length > 0)
          : [];
        const adicionaisDb = await tx.adicional.findMany({
          where: { empresaId, nome: { in: adicionais.map((a) => a.nome) } },
        });
        const precoAdicionalPorNome = new Map(adicionaisDb.map((a) => [a.nome, a.preco]));
        const adicionalPorNome = new Map(adicionaisDb.map((a) => [a.nome, a]));
        // Nome que não existe no cadastro de adicionais é REJEITADO, não
        // cobrado a zero: silenciosamente valer R$ 0,00 esconde cardápio
        // desatualizado e vira prejuízo repetido.
        const desconhecido = adicionais.find((a) => !precoAdicionalPorNome.has(a.nome));
        if (desconhecido) {
          throw new ErroComanda(`Adicional inexistente no cadastro: "${desconhecido.nome}". Atualize o cardápio.`);
        }
        const adicionaisFinal = adicionais.map((a) => ({
          adicionalId: a.adicionalId ?? adicionalPorNome.get(a.nome)?.id ?? null,
          nome: a.nome,
          preco: precoAdicionalPorNome.get(a.nome) ?? 0,
          quantidade: a.quantidade,
        }));

        let base = produto.preco;
        const tamanhoNome = bruto.tamanhoNome ? String(bruto.tamanhoNome) : null;
        let maxSabores = 1;
        if (tamanhoNome) {
          const pt = produto.precos.find((p) => p.tamanho.nome === tamanhoNome);
          if (pt) {
            base = pt.valor;
            maxSabores = pt.tamanho.maxSabores ?? 1;
          }
        }

        let precoUnit: number;
        let saboresEstruturados: { saborId: string; nome: string; tipo: string }[] | null = null;
        if (sabores.length > 0) {
          // Pizza: regra única de preço (MAIOR entre sabores + acréscimo por
          // sabor premium adicional). Preço gravado é sempre o recalculado.
          const saboresParaCalc = sabores.map((nome) => {
            const info = precoPorSaborNome.get(nome.toLowerCase());
            const precoNoTamanho = info && tamanhoNome ? (info.precos.get(tamanhoNome) ?? 0) : base;
            return { saborId: info?.saborId ?? "", tipo: info?.tipo ?? "tradicional", precoNoTamanho };
          });
          const qtdPremium = saboresParaCalc.filter((s) => s.tipo !== "tradicional").length;
          // Regra não configurada + 2+ sabores premium => recusar (nunca chutar).
          if (!configPizza && qtdPremium >= 2) {
            throw new ErroComanda("regra de preço de pizza não configurada para esta empresa");
          }
          const acrescimo = configPizza?.acrescimoPorSaborPremium ?? 0;
          const permitirMistura = configPizza?.permitirMisturarDoceSalgada ?? true;
          const erroMistura = validarMisturaSabores(saboresParaCalc, permitirMistura);
          if (erroMistura) {
            throw new ErroComanda(erroMistura);
          }
          const resultado = calcularPrecoPizza({
            sabores: saboresParaCalc,
            adicionais: adicionaisFinal,
            quantidade: Math.max(1, Number(bruto.quantidade ?? 1)),
            acrescimoPorSaborPremium: acrescimo,
            maxSabores,
          });
          if ("erro" in resultado) {
            throw new ErroComanda(resultado.erro);
          }
          precoUnit = resultado.precoUnitario;
          saboresEstruturados = saboresParaCalc.map((s, i) => ({ saborId: s.saborId, nome: sabores[i], tipo: s.tipo }));
        } else {
          precoUnit = calcularPrecoItem({
            precoBaseProduto: produto.preco,
            tamanho: tamanhoNome ? { nome: tamanhoNome, valor: base } : null,
            adicionais: adicionaisFinal,
          });
        }
        const quantidade = Math.max(1, Number(bruto.quantidade ?? 1));

        const nomeItem = String(bruto.nome ?? produto.nome);
        const saboresJson = saboresEstruturados && saboresEstruturados.length > 0 ? JSON.stringify(saboresEstruturados) : null;
        const adicionaisJson = adicionaisFinal.length > 0 ? JSON.stringify(adicionaisFinal) : null;
        const observacaoItem = bruto.observacao ? String(bruto.observacao) : null;

        // Merge só quando a linha é REALMENTE a mesma coisa.
        //
        // CORREÇÃO (bug confirmado): antes bastava `produtoId` + `precoUnit`
        // iguais. Duas pizzas do mesmo tamanho e preço com SABORES
        // diferentes (calabresa e marguerita, R$ 50 cada) viravam uma linha
        // só, com o nome da primeira — a cozinha produzia duas calabresas.
        // O mesmo valia para observações diferentes ("sem cebola").
        const existente = pedido.itens.find(
          (i) =>
            i.produtoId === produtoId &&
            i.precoUnit === precoUnit &&
            i.nome === nomeItem &&
            (i.tamanho ?? null) === tamanhoNome &&
            (i.sabores ?? null) === saboresJson &&
            (i.adicionais ?? null) === adicionaisJson &&
            (i.observacao ?? null) === observacaoItem
        );
        if (existente) {
          await tx.itemPedido.update({
            where: { id: existente.id },
            data: { quantidade: existente.quantidade + quantidade },
          });
        } else {
          await tx.itemPedido.create({
            data: {
              pedidoId: pedido.id,
              produtoId,
              nome: nomeItem,
              precoUnit,
              quantidade,
              tamanho: tamanhoNome,
              sabores: saboresJson,
              adicionais: adicionaisJson,
              observacao: observacaoItem,
              meioAMeio: sabores.length > 1,
            },
          });
        }
      } else if (acao === "atualizar") {
        const item = pedido.itens.find((i) => i.id === String(corpo.uid ?? ""));
        if (!item) throw new ErroComanda("Item não encontrado na comanda.");
        const quantidade = Number(corpo.quantidade ?? 0);
        if (quantidade <= 0) {
          await tx.itemPedido.delete({ where: { id: item.id } });
        } else {
          await tx.itemPedido.update({ where: { id: item.id }, data: { quantidade } });
        }
      } else {
        const item = pedido.itens.find((i) => i.id === String(corpo.uid ?? ""));
        if (!item) throw new ErroComanda("Item não encontrado na comanda.");
        await tx.itemPedido.delete({ where: { id: item.id } });
      }

      const atualizado = await tx.pedido.findFirstOrThrow({
        where: { id: pedido.id },
        include: { itens: true },
      });
      const total = calcularTotalItens(atualizado.itens);
      await tx.pedido.update({ where: { id: atualizado.id }, data: { total } });
      return { id: atualizado.id, criadoEm: atualizado.criadoEm, total, itens: atualizado.itens };
    }, { timeout: 30_000 });
  } catch (e) {
    if (e instanceof ErroComanda) {
      return NextResponse.json({ erro: e.message }, { status: 400 });
    }
    throw e;
  }

  emitirEventoTempoReal(empresaId, "pedido", { mesaId: numero });

  return NextResponse.json({
    ok: true,
    comanda: {
      id: resultado.id,
      abertaEm: resultado.criadoEm.toISOString(),
      total: resultado.total,
      itens: (resultado.itens as { id: string; produtoId: string; nome: string; precoUnit: number; quantidade: number; tamanho: string | null; sabores: string | null; adicionais: string | null; observacao: string | null }[]).map((i) => ({
        uid: i.id,
        produtoId: i.produtoId,
        nome: i.nome,
        precoUnit: i.precoUnit,
        quantidade: i.quantidade,
        tamanho: i.tamanho,
        sabores: i.sabores ? JSON.parse(i.sabores) : [],
        adicionais: i.adicionais ? JSON.parse(i.adicionais) : [],
        observacao: i.observacao,
      })),
    },
  });
});

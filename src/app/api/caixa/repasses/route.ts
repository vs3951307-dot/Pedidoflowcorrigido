import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizar, registrarAuditoria } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";

/**
 * GET /api/caixa/repasses — dinheiro recebido por Garçons (fora do caixa
 * físico) que ainda não foi entregue ao Caixa (PEDIDO 12: "rastrear
 * garçom, mesa, pedido, valor, horário"). Agrupado por quem recebeu.
 */
export const GET = comTratamentoDeErro("caixa.repasses.GET", async () => {
  const acesso = await autorizar("caixa");
  if (!acesso.ok) return acesso.resposta;

  const pendentes = await prisma.pagamento.findMany({
    where: { empresaId: acesso.empresaId, forma: "dinheiro", repassadoAoCaixa: false, status: "confirmado" },
    include: { pedido: { select: { numero: true, mesaId: true, mesa: { select: { numero: true } } } } },
    orderBy: { criadoEm: "asc" },
  });

  const porPessoa = new Map<string, { recebidoPorNome: string; total: number; itens: typeof pendentes }>();
  for (const p of pendentes) {
    const chave = p.recebidoPorId ?? p.recebidoPorNome ?? "desconhecido";
    const atual = porPessoa.get(chave) ?? { recebidoPorNome: p.recebidoPorNome ?? "—", total: 0, itens: [] };
    atual.total += p.valor;
    atual.itens.push(p);
    porPessoa.set(chave, atual);
  }

  return NextResponse.json({
    totalPendente: pendentes.reduce((soma, p) => soma + p.valor, 0),
    porPessoa: [...porPessoa.entries()].map(([recebidoPorId, dados]) => ({
      recebidoPorId,
      recebidoPorNome: dados.recebidoPorNome,
      total: dados.total,
      pagamentos: dados.itens.map((p) => ({
        id: p.id,
        valor: p.valor,
        pedidoNumero: p.pedido.numero,
        mesaNumero: p.pedido.mesa?.numero ?? null,
        criadoEm: p.criadoEm,
      })),
    })),
  });
});

/**
 * POST /api/caixa/repasses — Caixa confirma que recebeu FISICAMENTE o
 * dinheiro de um ou mais pagamentos pendentes.
 *
 * CORREÇÃO (itens 41/42 — "ao confirmar repasse: gerar movimentação
 * adequada"): antes, isto só marcava `repassadoAoCaixa = true` — o
 * dinheiro nunca entrava na movimentação de caixa em NENHUM momento
 * (nem no pagamento original, que corrigimos pra não gerar mais; nem
 * aqui, que não gerava nada). Agora É AQUI que a movimentação "venda"
 * é criada — no momento em que o dinheiro realmente chega na gaveta,
 * não no momento em que o garçom/entregador o recebeu na rua/mesa.
 *
 * Exige caixa aberto: sem caixa, não tem onde registrar a entrada
 * física — devolve erro claro (nunca 500) em vez de silenciosamente
 * confirmar sem afetar o saldo esperado.
 */
export const POST = comTratamentoDeErro("caixa.repasses.POST", async (req: NextRequest) => {
  const acesso = await autorizar("caixa");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const corpo = await req.json().catch(() => ({}));
  const ids = Array.isArray(corpo.pagamentoIds) ? corpo.pagamentoIds.map(String) : [];
  if (ids.length === 0) {
    return NextResponse.json({ erro: "Informe ao menos um pagamento." }, { status: 400 });
  }

  const caixa = await prisma.caixa.findFirst({ where: { empresaId, status: "aberto" }, orderBy: { abertoEm: "desc" } });
  if (!caixa) {
    return NextResponse.json({ erro: "Abra o caixa antes de confirmar o repasse." }, { status: 409 });
  }

  const pendentes = await prisma.pagamento.findMany({
    where: { id: { in: ids }, empresaId, forma: "dinheiro", repassadoAoCaixa: false },
    include: { pedido: { select: { numero: true } } },
  });
  if (pendentes.length === 0) {
    return NextResponse.json({ ok: true, confirmados: 0 });
  }

  const resultado = await prisma.$transaction(async (tx) => {
    // updateMany condicional: se outro Caixa já confirmou ALGUM desses
    // ids entre o findMany acima e agora, `repassadoAoCaixa: false` no
    // WHERE garante que só os que ainda estão pendentes são afetados —
    // sem risco de gerar duas movimentações pro mesmo pagamento.
    const atualizados = await tx.pagamento.updateMany({
      where: { id: { in: pendentes.map((p) => p.id) }, empresaId, forma: "dinheiro", repassadoAoCaixa: false },
      data: { repassadoAoCaixa: true },
    });
    if (atualizados.count > 0) {
      await tx.movimentacaoCaixa.createMany({
        data: pendentes.map((p) => ({
          empresaId,
          caixaId: caixa.id,
          tipo: "venda" as const,
          valor: p.valor,
          metodo: "dinheiro",
          descricao: `Repasse — Pedido #${p.pedido.numero} (recebido por ${p.recebidoPorNome ?? "—"})`,
        })),
      });
    }
    return atualizados.count;
  }, { timeout: 30_000 });

  await registrarAuditoria(
    "repasse_dinheiro_confirmado",
    `${resultado} pagamento(s) confirmados como repassados ao caixa`,
    acesso.usuario,
    undefined,
    empresaId
  );

  return NextResponse.json({ ok: true, confirmados: resultado });
});

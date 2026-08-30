import { prisma } from "@/lib/prisma";
import { emitirMudancaKds } from "@/lib/kds-eventos";
import { emitirEventoTempoReal } from "@/lib/eventos-tempo-real";

/**
 * Conclusão de entrega (PEDIDO 17/21) — regra compartilhada entre o
 * PATCH /api/entregas/[id] (botão na rota) e a confirmação por código
 * escaneado (POST /api/entregas/confirmar-codigo).
 *
 * CORREÇÃO (item 43 — "concluir entrega não significa pagamento
 * automático"): antes, QUALQUER pagamento pendente (Pix, cartão,
 * dinheiro) era confirmado automaticamente só porque a entrega terminou
 * — inventando uma confirmação bancária que não aconteceu de verdade.
 * Agora:
 *   - DINHEIRO: confirmado junto com a entrega, porque coletar dinheiro
 *     É PARTE do ato físico de entregar (o entregador está lá, na mão) —
 *     mas com `recebidoPorId`/`repassadoAoCaixa: false` (item 42), nunca
 *     afetando o caixa físico até o repasse.
 *   - PIX/CARTÃO: a entrega conclui normalmente, mas o pagamento continua
 *     `pendente` — precisa de confirmação própria e separada (ver
 *     `PATCH /api/pagamentos/[id]`), porque só o entregador dizendo "eu
 *     entreguei" não prova que o Pix caiu ou o cartão não foi recusado.
 */
export interface EntregaParaConcluir {
  id: string;
  pedidoId: string;
  iniciadaEm: Date | null;
  pedido: {
    numero: number;
    trocoPara: number | null;
    pagamentos: { id: string; forma: string; valor: number; status: string }[];
  };
}

export async function concluirEntregaNoCaixa(
  empresaId: string,
  entrega: EntregaParaConcluir,
  quemConcluiu?: { id: string; nome: string }
) {
  const atualizada = await prisma.$transaction(async (tx) => {
    const entregue = await tx.entrega.update({
      where: { id: entrega.id },
      data: {
        status: "entregue",
        concluidaEm: new Date(),
        iniciadaEm: entrega.iniciadaEm ?? new Date(),
      },
    });

    // Pedido sai da produção (finalizado) — independente do pagamento,
    // que agora é rastreado separadamente (item 43).
    await tx.pedido.update({
      where: { id: entrega.pedidoId },
      data: { status: "concluido", producao: "finalizado", finalizadoEm: new Date() },
    });

    // Só DINHEIRO é auto-confirmado (coletado fisicamente na entrega).
    // Pix/cartão ficam `pendente`, aguardando confirmação própria.
    const pagamentoPendente = entrega.pedido.pagamentos.find(
      (p) => p.status === "pendente" && p.forma === "dinheiro"
    );
    if (pagamentoPendente) {
      const caixa = await tx.caixa.findFirst({
        where: { empresaId, status: "aberto" },
        orderBy: { abertoEm: "desc" },
      });
      const dinheiroSemCaixa = !caixa;
      if (!dinheiroSemCaixa) {
        await tx.pagamento.update({
          where: { id: pagamentoPendente.id },
          data: {
            status: "confirmado",
            recebidoPorId: quemConcluiu?.id ?? null,
            recebidoPorNome: quemConcluiu?.nome ?? null,
            // Dinheiro recebido na rua pelo entregador: não afeta o
            // caixa físico até o repasse (item 42) — a movimentação
            // "venda" só é criada em `POST /api/caixa/repasses`.
            repassadoAoCaixa: false,
          },
        });
      }
    }

    return entregue;
  }, { timeout: 30_000 });

  emitirMudancaKds(empresaId);
  emitirEventoTempoReal(empresaId, "entrega", { id: atualizada.id, status: atualizada.status });
  return atualizada;
}

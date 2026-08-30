import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Confirmação do pagamento recebido NA ENTREGA (PEDIDO 17) — regra de
 * negócio pura, sem HTTP, para poder ser exercitada por testes de
 * concorrência reais (`__tests__/confirmar-pagamento-entrega.test.ts`).
 *
 * ---------------------------------------------------------------------
 * ITEM 2 DA AUDITORIA — o que foi REMOVIDO daqui e por quê.
 *
 * Existia uma função `checkPagamentoDuplicidade` que, antes de confirmar
 * QUALQUER pagamento, procurava "algum OUTRO pagamento confirmado nesta
 * empresa nos últimos 5 segundos" e, se achasse, respondia 409:
 *
 *     prisma.pagamento.findFirst({ where: {
 *       empresaId, id_ne: paramsId, status: "confirmado",
 *       atualizadoEm: { gte: new Date(Date.now() - 5_000) },
 *     }})
 *
 * Três defeitos, todos graves:
 *
 *   1. O critério NÃO envolvia o pagamento que estava sendo confirmado —
 *      era "qualquer outro pagamento da empresa". Numa pizzaria em
 *      horário de pico, o pagamento do cliente da mesa 3 derrubava o
 *      pagamento LEGÍTIMO do cliente da mesa 7 e a entrega do
 *      entregador X derrubava a do entregador Y, só por caírem no mesmo
 *      intervalo de 5 segundos. Ou seja: bloqueava exatamente o que NÃO
 *      devia bloquear.
 *   2. Janela de tempo não é exclusão mútua. Duas confirmações do MESMO
 *      pagamento de fato simultâneas não enxergam uma à outra (nenhuma
 *      commitou ainda) e passam as duas — então nem o caso que a função
 *      dizia resolver era resolvido, e o valor entrava duas vezes no
 *      caixa.
 *   3. Filtrava por `atualizadoEm`, campo que não existe em `Pagamento`,
 *      com o operador `id_ne`, que não existe no Prisma — dois erros de
 *      TypeScript que provavam que aquele caminho nunca tinha rodado.
 *
 * O QUE ENTROU NO LUGAR: um UPDATE CONDICIONAL ATÔMICO sobre ESTE
 * pagamento (`status: { not: "confirmado" }` no `where`). O Postgres
 * serializa dois UPDATEs concorrentes na MESMA linha; o segundo reavalia
 * a condição, casa com 0 linhas e é rejeitado. Nenhum outro pagamento —
 * de nenhum outro cliente, mesa, pedido ou empresa — participa da
 * decisão, e a movimentação de caixa roda no máximo uma vez.
 * ---------------------------------------------------------------------
 */

export const FORMAS_VALIDAS_ENTREGA = ["dinheiro", "pix", "cartao", "credito", "debito"] as const;

export interface UsuarioDaConfirmacao {
  id: string;
  nome: string;
  papel: string;
}

export type ResultadoConfirmacao =
  | { ok: true; pagamento: { id: string; status: "confirmado"; valor: number; forma: string } }
  | { ok: false; status: number; erro: string; codigo?: string };

export async function confirmarPagamentoEntrega(
  empresaId: string,
  usuario: UsuarioDaConfirmacao,
  pagamentoId: string,
  corpo: { forma?: unknown; troco?: unknown }
): Promise<ResultadoConfirmacao> {
  const pagamento = await prisma.pagamento.findFirst({
    where: { id: pagamentoId, empresaId },
    include: { pedido: { include: { entrega: { include: { entregador: true } } } } },
  });
  if (!pagamento) {
    return { ok: false, status: 404, erro: "Pagamento não encontrado.", codigo: "NOT_FOUND" };
  }

  // Checagem antecipada: mensagem clara sem trabalho à toa. NÃO é a
  // proteção contra concorrência — essa é o `updateMany` condicional.
  if (pagamento.status === "confirmado") {
    return { ok: false, status: 409, erro: "Pagamento já confirmado.", codigo: "ALREADY_APPLIED" };
  }

  // O entregador só confirma pagamentos das próprias entregas — por ID.
  if (usuario.papel === "ENTREGADOR" && pagamento.pedido.entrega?.entregador?.usuarioId !== usuario.id) {
    return { ok: false, status: 403, erro: "Você não tem permissão para confirmar este pagamento." };
  }

  const troco = Math.max(0, Number(corpo.troco ?? 0));
  const formaInformada = corpo.forma === undefined ? undefined : String(corpo.forma);
  if (
    formaInformada !== undefined &&
    !FORMAS_VALIDAS_ENTREGA.includes(formaInformada as (typeof FORMAS_VALIDAS_ENTREGA)[number])
  ) {
    return { ok: false, status: 400, erro: "Forma de pagamento inválida." };
  }

  const caixa = await prisma.caixa.findFirst({
    where: { empresaId, status: "aberto" },
    orderBy: { abertoEm: "desc" },
  });
  const formaFinal = formaInformada ?? pagamento.forma;
  if (formaFinal === "dinheiro" && !caixa) {
    return { ok: false, status: 409, erro: "Pagamento em dinheiro exige caixa aberto." };
  }

  const confirmado = await prisma.$transaction(
    async (tx) => {
      // Dinheiro recebido pelo entregador precisa de repasse físico
      // depois; Pix/cartão não têm dinheiro físico envolvido, então já
      // nascem reconciliados (mesma regra do garçom, item 41).
      const precisaRepasse = formaFinal === "dinheiro";

      const aplicado = await tx.pagamento.updateMany({
        where: { id: pagamento.id, empresaId, status: { not: "confirmado" } },
        data: {
          status: "confirmado",
          ...(formaInformada !== undefined ? { forma: formaFinal } : {}),
          recebidoPorId: usuario.id,
          recebidoPorNome: usuario.nome,
          repassadoAoCaixa: !precisaRepasse,
        },
      });
      if (aplicado.count === 0) return false;

      if (caixa) {
        const dados: Prisma.MovimentacaoCaixaCreateManyInput[] = [];
        if (!precisaRepasse) {
          dados.push({
            empresaId,
            caixaId: caixa.id,
            tipo: "venda",
            valor: pagamento.valor,
            metodo: formaFinal,
            descricao: `Pedido #${pagamento.pedido.numero} — pagamento na entrega`,
          });
        }
        if (troco > 0) {
          dados.push({
            empresaId,
            caixaId: caixa.id,
            tipo: "troco",
            valor: troco,
            metodo: formaFinal,
            descricao: `Troco — Pedido #${pagamento.pedido.numero}`,
          });
        }
        if (dados.length > 0) {
          await tx.movimentacaoCaixa.createMany({ data: dados });
        }
      }
      return true;
    },
    { timeout: 30_000 }
  );

  // Perdeu a corrida: outra requisição confirmou este MESMO pagamento
  // primeiro. Nenhum valor foi lançado duas vezes no caixa.
  if (!confirmado) {
    return { ok: false, status: 409, erro: "Pagamento já confirmado.", codigo: "ALREADY_APPLIED" };
  }

  return {
    ok: true,
    pagamento: { id: pagamento.id, status: "confirmado", valor: pagamento.valor, forma: formaFinal },
  };
}

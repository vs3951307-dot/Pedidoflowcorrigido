import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizar } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";

/**
 * GET /api/entregas/repasse — quanto o ENTREGADOR logado está com em mãos
 * (dinheiro recebido na entrega, ainda não confirmado pelo Caixa).
 *
 * É a mesma informação de `GET /api/caixa/repasses`, mas essa rota exige o
 * recurso "caixa" — que o papel ENTREGADOR não tem (só "entregas" e
 * "pagamentos_entrega", ver `src/lib/permissao.ts`). Sem uma rota própria,
 * o entregador nunca conseguiria ver o próprio repasse pendente, mesmo
 * sendo só o dado dele. A confirmação em si continua sendo feita pelo
 * Caixa (ver `RepassesPendentes`, em `/pdv`) — o entregador só consulta.
 */
export const GET = comTratamentoDeErro("entregas.repasse.GET", async () => {
  const acesso = await autorizar("pagamentos_entrega");
  if (!acesso.ok) return acesso.resposta;

  const pendentes = await prisma.pagamento.findMany({
    where: {
      empresaId: acesso.empresaId,
      recebidoPorId: acesso.usuario.id,
      forma: "dinheiro",
      repassadoAoCaixa: false,
      status: "confirmado",
    },
    include: { pedido: { select: { numero: true } } },
    orderBy: { criadoEm: "asc" },
  });

  return NextResponse.json({
    total: pendentes.reduce((soma, p) => soma + p.valor, 0),
    pagamentos: pendentes.map((p) => ({
      id: p.id,
      valor: p.valor,
      pedidoNumero: p.pedido.numero,
      criadoEm: p.criadoEm,
    })),
  });
});

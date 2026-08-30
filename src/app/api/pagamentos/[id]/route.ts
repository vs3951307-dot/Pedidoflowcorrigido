import { NextRequest, NextResponse } from "next/server";
import { autorizar } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { confirmarPagamentoEntrega } from "@/lib/pagamentos/confirmar-pagamento-entrega";

/**
 * Confirma o pagamento recebido na entrega (PEDIDO 17).
 *
 * CORREÇÃO (item 42, mesmo princípio do garçom — item 41): dinheiro
 * recebido pelo entregador NA RUA não é dinheiro físico na gaveta do
 * caixa — só vira "venda" na movimentação de caixa quando o Caixa
 * confirmar o REPASSE (`POST /api/caixa/repasses`), que já sabe
 * encontrar esses pagamentos por `repassadoAoCaixa: false`. Pix/cartão
 * continuam confirmando na hora — não têm dinheiro físico envolvido.
 *
 * A regra (incluindo a proteção contra dupla confirmação — item 2 da
 * auditoria) vive em `src/lib/pagamentos/confirmar-pagamento-entrega.ts`,
 * exercitada por testes de concorrência contra um PostgreSQL real. Esta
 * rota só autoriza e traduz o resultado em HTTP.
 */
export const PATCH = comTratamentoDeErro("pagamentos.PATCH", async (req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizar("pagamentos_entrega", "admin");
  if (!acesso.ok) return acesso.resposta;

  const corpo = await req.json().catch(() => ({}));
  const resultado = await confirmarPagamentoEntrega(acesso.empresaId, acesso.usuario, params.id, corpo);

  if (!resultado.ok) {
    return NextResponse.json(
      resultado.codigo ? { erro: resultado.erro, codigo: resultado.codigo } : { erro: resultado.erro },
      { status: resultado.status }
    );
  }

  return NextResponse.json({ ok: true, pagamento: resultado.pagamento });
});

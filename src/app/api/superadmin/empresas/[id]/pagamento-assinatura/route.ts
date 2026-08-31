import { NextRequest, NextResponse } from "next/server";
import { autorizarSuperAdmin } from "@/lib/super-admin/auth";
import { validarCorpo } from "@/lib/validar";
import { pagamentoAssinaturaSchema } from "@/lib/schemas/superadmin";
import { registrarPagamentoAssinatura } from "@/lib/super-admin/assinatura";
import { comTratamentoDeErro } from "@/lib/api-erro";

/**
 * POST /api/superadmin/empresas/[id]/pagamento-assinatura
 *
 * Registra um pagamento da ASSINATURA da empresa e REATIVA o ciclo:
 * novo `vencimentoEm` (= hoje + cicloDias), `carenciaAte` (vencimento +
 * 7 dias) e `status` volta a "ativa". Preserva todos os dados da empresa/
 * tenant — registra um pagamento NUNCA apaga nada.
 *
 * Idempotente por `idempotencyKey` (por empresa) para retry seguro.
 */
export const POST = comTratamentoDeErro(
  "superadmin.empresas.pagamentoAssinatura.POST",
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const acesso = await autorizarSuperAdmin();
    if (!acesso.ok) return acesso.resposta;

    const corpoBruto = await req.json().catch(() => ({}));
    const validado = validarCorpo(pagamentoAssinaturaSchema, corpoBruto);
    if (!validado.ok) return validado.resposta;
    const dados = validado.dados;

    const resultado = await registrarPagamentoAssinatura({
      empresaId: params.id,
      valor: dados.valor,
      forma: dados.forma,
      cicloDias: dados.cicloDias,
      pagoEm: dados.pagoEm ? new Date(dados.pagoEm) : undefined,
      idempotencyKey: dados.idempotencyKey,
      registradoPor: acesso.superAdmin.id,
      observacoes: dados.observacoes,
    });

    if (!resultado.ok) {
      return NextResponse.json({ erro: resultado.erro }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      jaExistia: resultado.jaExistia,
      mensagem: resultado.mensagem,
      pagamentoId: resultado.pagamentoId,
      novoVencimentoEm: resultado.novoVencimentoEm,
      carenciaAte: resultado.carenciaAte,
      status: resultado.status,
    });
  }
);

/**
 * Lógica de assinatura do Super Admin (plataforma).
 *
 * - `registrarPagamentoAssinatura`: registra um pagamento da assinatura de
 *   uma empresa e REATIVA o ciclo: recalcula `planoInicioEm = agora`,
 *   `vencimentoEm = agora + cicloDias`, `carenciaAte = vencimentoEm + 7` e
 *   volta o `status` para "ativa" — sem nunca apagar dados.
 *
 * O registro do pagamento e a atualização da empresa acontecem numa única
 * transação na plataforma (ambos são models de plataforma — ver
 * `src/lib/prisma.ts` / `DELEGATES_PLATAFORMA`).
 */
import { prisma, plataformaPrisma } from "@/lib/prisma";
import { calcularCarenciaAte } from "@/lib/assinatura";
import { registrarAuditoriaSuperAdmin } from "@/lib/super-admin/auth";

export interface RegistrarPagamentoParams {
  empresaId: string;
  valor: number;
  forma: string;
  cicloDias?: number;
  pagoEm?: Date;
  idempotencyKey?: string;
  registradoPor?: string;
  observacoes?: string;
}

export interface ResultadoRegistroPagamento {
  ok: true;
  novoVencimentoEm: Date;
  carenciaAte: Date | null;
  status: string;
  pagamentoId: string;
  jaExistia: boolean;
  mensagem: string;
}

/**
 * Registra um pagamento de assinatura e reativa a empresa. Idempotente por
 * `(empresaId, idempotencyKey)`: se a mesma chave já foi usada, devolve o
 * pagamento existente sem duplicar (o mesmo padrão do `Pagamento` de pedido).
 */
export async function registrarPagamentoAssinatura(
  params: RegistrarPagamentoParams
): Promise<ResultadoRegistroPagamento | { ok: false; erro: string }> {
  const empresa = await plataformaPrisma.empresa.findUnique({ where: { id: params.empresaId } });
  if (!empresa) return { ok: false, erro: "Empresa não encontrada." };

  const cicloDias = params.cicloDias && params.cicloDias > 0 ? params.cicloDias : 30;
  const agora = params.pagoEm ?? new Date();
  const novoVencimentoEm = new Date(agora.getTime() + cicloDias * 24 * 60 * 60 * 1000);
  const carenciaAte = calcularCarenciaAte(novoVencimentoEm);

  // Se tiver idempotencyKey, procura pagamento já registrado p/ esta empresa.
  if (params.idempotencyKey) {
    const existente = await plataformaPrisma.assinaturaPagamento.findUnique({
      where: { empresaId_idempotencyKey: { empresaId: params.empresaId, idempotencyKey: params.idempotencyKey } },
    });
    if (existente) {
      return {
        ok: true,
        novoVencimentoEm: empresa.vencimentoEm ?? novoVencimentoEm,
        carenciaAte: empresa.carenciaAte,
        status: empresa.status,
        pagamentoId: existente.id,
        jaExistia: true,
        mensagem: "Pagamento já registrado anteriormente (mesma chave de idempotência). Nada duplicado.",
      };
    }
  }

  const resultado = await prisma.$transaction(async (tx) => {
    const pagamento = await tx.assinaturaPagamento.create({
      data: {
        empresaId: params.empresaId,
        forma: params.forma,
        valor: params.valor,
        moeda: "BRL",
        pagoEm: agora,
        cicloDias,
        idempotencyKey: params.idempotencyKey ?? null,
        registradoPor: params.registradoPor ?? null,
        observacoes: params.observacoes ?? null,
      },
    });

    const empresaAtualizada = await tx.empresa.update({
      where: { id: params.empresaId },
      data: {
        // Reativa (mesmo que estivesse "suspensa"/"vencida") e reinicia o
        // ciclo. Dados operacionais nunca são tocados — só os campos de
        // assinatura.
        status: "ativa",
        planoInicioEm: agora,
        vencimentoEm: novoVencimentoEm,
        carenciaAte,
      },
    });

    return { pagamento, empresaAtualizada };
  }, { timeout: 30_000 });

  await registrarAuditoriaSuperAdmin(
    "assinatura_pagamento",
    `Pagamento de assinatura registrado para ${empresa.nome}: R$ ${params.valor.toFixed(2)} (${params.forma}). Novo vencimento: ${novoVencimentoEm.toISOString().slice(0, 10)}.`,
    params.registradoPor ?? "superadmin"
  );

  return {
    ok: true,
    novoVencimentoEm: resultado.empresaAtualizada.vencimentoEm!,
    carenciaAte: resultado.empresaAtualizada.carenciaAte,
    status: resultado.empresaAtualizada.status,
    pagamentoId: resultado.pagamento.id,
    jaExistia: false,
    mensagem: "Pagamento registrado e assinatura reativada.",
  };
}

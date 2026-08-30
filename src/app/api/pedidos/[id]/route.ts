import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizar } from "@/lib/acesso";
import { emitirMudancaKds } from "@/lib/kds-eventos";
import { comTratamentoDeErro } from "@/lib/api-erro";

const STATUS_VALIDOS = ["andamento", "preparando", "concluido", "cancelado", "pronto", "retirado", "conta"];
const PRODUCAO_VALIDA = ["recebido", "em_preparo", "pronto", "finalizado"];
// Avanço permitido na produção: recebido → em_preparo → pronto → finalizado.
const PROXIMO_ESTAGIO: Record<string, string> = {
  recebido: "em_preparo",
  em_preparo: "pronto",
  pronto: "finalizado",
};

export const PATCH = comTratamentoDeErro("pedidos.PATCH", async (req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizar("pdv", "salao", "kds", "admin");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const corpo = await req.json().catch(() => ({}));
  const producao = corpo.producao ? String(corpo.producao) : null;
  const status = corpo.status ? String(corpo.status) : null;

  const pedidoAtual = await prisma.pedido.findFirst({ where: { id: params.id, empresaId } });
  if (!pedidoAtual) {
    return NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 });
  }

  // Cozinha (KDS): controla apenas o estágio de produção, sempre em frente.
  if (acesso.usuario.papel === "COZINHA") {
    const alvo = producao ?? (status === "preparando" ? "em_preparo" : status === "pronto" ? "pronto" : null);
    if (!alvo || !PRODUCAO_VALIDA.includes(alvo)) {
      return NextResponse.json(
        { erro: "Estágio de produção inválido. Use recebido, em_preparo, pronto ou finalizado." },
        { status: 400 }
      );
    }
    if (alvo !== pedidoAtual.producao && alvo !== PROXIMO_ESTAGIO[pedidoAtual.producao]) {
      return NextResponse.json(
        { erro: `A produção só avança em ordem: de ${pedidoAtual.producao} para ${PROXIMO_ESTAGIO[pedidoAtual.producao] ?? "finalizado"}.` },
        { status: 409 }
      );
    }

    const dados: Record<string, unknown> = { producao: alvo };
    if (alvo === "em_preparo") dados.preparoIniciadoEm = pedidoAtual.preparoIniciadoEm ?? new Date();
    if (alvo === "pronto") dados.prontoEm = pedidoAtual.prontoEm ?? new Date();
    const pedido = await prisma.pedido.update({ where: { id: pedidoAtual.id }, data: dados });
    emitirMudancaKds(empresaId);
    return NextResponse.json({ ok: true, pedido: { id: pedido.id, producao: pedido.producao } });
  }

  // Demais papéis (caixa/admin/garçom): status negocial; a produção
  // acompanha — pedido concluído/retirado/cancelado sai do painel.
  if (!status || !STATUS_VALIDOS.includes(status)) {
    return NextResponse.json({ erro: "Status inválido." }, { status: 400 });
  }

  const dados: Record<string, unknown> = { status };
  if (["concluido", "retirado", "cancelado"].includes(status)) {
    dados.producao = "finalizado";
    dados.finalizadoEm = new Date();
  } else if (status === "pronto" && pedidoAtual.producao === "recebido") {
    dados.producao = "pronto";
    dados.prontoEm = new Date();
  }
  const producaoAntes = pedidoAtual.producao;
  const pedido = await prisma.pedido.update({ where: { id: pedidoAtual.id }, data: dados });
  if (pedido.producao !== producaoAntes) emitirMudancaKds(empresaId);
  return NextResponse.json({ ok: true, pedido: { id: pedido.id, status: pedido.status, producao: pedido.producao } });
});

/** Cancela o pedido (mantém o registro, muda o status e sai do KDS). */
export const DELETE = comTratamentoDeErro("pedidos.DELETE", async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizar("pdv", "salao", "admin");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const existente = await prisma.pedido.findFirst({ where: { id: params.id, empresaId } });
  if (!existente) {
    return NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 });
  }

  const pedido = await prisma.pedido.update({
    where: { id: existente.id },
    data: { status: "cancelado", producao: "finalizado", finalizadoEm: new Date() },
  });
  emitirMudancaKds(empresaId);
  return NextResponse.json({ ok: true, pedido: { id: pedido.id, status: pedido.status, producao: pedido.producao } });
});

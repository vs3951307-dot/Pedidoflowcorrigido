import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizar } from "@/lib/acesso";
import { emitirMudancaKds } from "@/lib/kds-eventos";
import { emitirEventoTempoReal } from "@/lib/eventos-tempo-real";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { concluirEntregaNoCaixa } from "@/lib/concluir-entrega";

/**
 * Entrega [id] (PEDIDO 17), sempre restrita à empresa da sessão:
 * - `{ entregadorId }` → atribui entregador (aguardando → preparo)
 * - `{ status: "rota" }` → sai para entrega (só a partir de preparo)
 * - `{ status: "entregue" }` → conclui (só de rota; finaliza o pedido e
 *   confirma o pagamento pendente, registrando a venda no caixa)
 * - `{ status: "cancelada", ocorrencia? }` → cancela (só se não entregue)
 * - `{ ocorrencia }` → registra ocorrência sem mudar o status
 */
export const PATCH = comTratamentoDeErro("entregas.id.PATCH", async (req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizar("entregas", "admin", "pdv");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const entregaExistente = await prisma.entrega.findFirst({
    where: { id: params.id, empresaId },
    include: { entregador: true, pedido: { include: { pagamentos: true } } },
  });
  if (!entregaExistente) {
    return NextResponse.json({ erro: "Entrega não encontrada." }, { status: 404 });
  }
  // Entregador só altera entregas atribuídas a ele — por ID, nunca por
  // nome (dois entregadores com nome parecido, ou erro de digitação no
  // cadastro, quebravam este isolamento antes).
  if (
    acesso.usuario.papel === "ENTREGADOR" &&
    entregaExistente.entregador?.usuarioId !== acesso.usuario.id
  ) {
    return NextResponse.json(
      { erro: "Você não tem permissão para alterar esta entrega." },
      { status: 403 }
    );
  }

  const corpo = await req.json().catch(() => ({}));
  const status = corpo.status ? String(corpo.status) : null;
  const ocorrencia = corpo.ocorrencia ? String(corpo.ocorrencia).trim() : null;
  const entregadorId = corpo.entregadorId ? String(corpo.entregadorId) : null;

  // Atribuição de entregador: aguardando → preparo.
  if (entregadorId) {
    if (entregaExistente.status === "entregue" || entregaExistente.status === "cancelada") {
      return NextResponse.json(
        { erro: "Entrega concluída ou cancelada não pode ser atribuída." },
        { status: 409 }
      );
    }
    const entregador = await prisma.entregador.findFirst({ where: { id: entregadorId, empresaId } });
    if (!entregador || !entregador.ativo) {
      return NextResponse.json({ erro: "Entregador inválido." }, { status: 400 });
    }
    // Corrida entre dois entregadores "pegando" a mesma entrega ao mesmo
    // tempo: o updateMany só aplica se o status ainda for o esperado — o
    // segundo request perde (count 0) e recebe 409, em vez de os dois
    // "vencerem" e a entrega ficar em estado inconsistente.
    const resultado = await prisma.entrega.updateMany({
      where: { id: entregaExistente.id, empresaId, status: entregaExistente.status },
      data: { entregadorId, status: entregaExistente.status === "aguardando" ? "preparo" : entregaExistente.status },
    });
    if (resultado.count === 0) {
      return NextResponse.json({ erro: "Esta entrega já foi atribuída por outro dispositivo." }, { status: 409 });
    }
    const novoStatus = entregaExistente.status === "aguardando" ? "preparo" : entregaExistente.status;
    emitirEventoTempoReal(empresaId, "entrega", { id: entregaExistente.id, status: novoStatus, entregadorId });
    return NextResponse.json({ ok: true, entrega: { id: entregaExistente.id, status: novoStatus, entregador: entregador.nome } });
  }

  // Ocorrência avulsa (sem mudança de status).
  if (ocorrencia && !status) {
    const atualizada = await prisma.entrega.update({
      where: { id: entregaExistente.id },
      data: { ocorrencia },
    });
    emitirEventoTempoReal(empresaId, "entrega", { id: atualizada.id, status: atualizada.status });
    return NextResponse.json({ ok: true, entrega: { id: atualizada.id, status: atualizada.status, ocorrencia: atualizada.ocorrencia } });
  }

  if (!status) {
    return NextResponse.json({ erro: "Informe uma ação: entregadorId, status ou ocorrencia." }, { status: 400 });
  }

  const statusAtual = entregaExistente.status;
  if (status === "rota") {
    if (statusAtual !== "preparo") {
      return NextResponse.json(
        { erro: "Para sair para entrega, a entrega precisa estar atribuída (preparo)." },
        { status: 409 }
      );
    }
    const atualizada = await prisma.entrega.update({
      where: { id: entregaExistente.id },
      data: { status: "rota", iniciadaEm: new Date(), ...(ocorrencia ? { ocorrencia } : {}) },
    });
    emitirEventoTempoReal(empresaId, "entrega", { id: atualizada.id, status: atualizada.status });
    return NextResponse.json({ ok: true, entrega: { id: atualizada.id, status: atualizada.status, iniciadaEm: atualizada.iniciadaEm?.toISOString() ?? null } });
  }

  if (status === "entregue") {
    if (statusAtual !== "rota" && statusAtual !== "preparo") {
      // PEDIDO 47: distinguir "já concluída antes" (idempotente — a
      // fila offline pode dropar essa ação com segurança) de qualquer
      // OUTRO estado inválido (ex.: cancelada — falha real, precisa
      // ficar visível, nunca tratada como sucesso silencioso).
      return NextResponse.json(
        { erro: "Só é possível concluir uma entrega que está na rota.", codigo: statusAtual === "entregue" ? "ALREADY_APPLIED" : "INVALID_STATE" },
        { status: 409 }
      );
    }
    const concluida = await concluirEntregaNoCaixa(
      empresaId,
      {
        id: entregaExistente.id,
        pedidoId: entregaExistente.pedidoId,
        iniciadaEm: entregaExistente.iniciadaEm,
        pedido: entregaExistente.pedido,
      },
      { id: acesso.usuario.id, nome: acesso.usuario.nome }
    );
    if (ocorrencia) {
      await prisma.entrega.update({ where: { id: entregaExistente.id }, data: { ocorrencia } });
    }
    return NextResponse.json({ ok: true, entrega: { id: concluida.id, status: concluida.status, concluidaEm: concluida.concluidaEm?.toISOString() ?? null } });
  }

  if (status === "cancelada") {
    if (statusAtual === "entregue") {
      return NextResponse.json(
        { erro: "Entrega já concluída não pode ser cancelada." },
        { status: 409 }
      );
    }
    const entrega = await prisma.entrega.update({
      where: { id: entregaExistente.id },
      data: { status: "cancelada", ocorrencia: ocorrencia ?? "Cancelada" },
    });
    await prisma.pedido.update({
      where: { id: entregaExistente.pedidoId },
      data: { status: "cancelado", producao: "finalizado", finalizadoEm: new Date() },
    });
    emitirMudancaKds(empresaId);
    emitirEventoTempoReal(empresaId, "entrega", { id: entrega.id, status: entrega.status });
    return NextResponse.json({ ok: true, entrega: { id: entrega.id, status: entrega.status, ocorrencia: entrega.ocorrencia } });
  }

  return NextResponse.json({ erro: "Status de entrega inválido." }, { status: 400 });
});

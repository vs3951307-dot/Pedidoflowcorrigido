import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizar } from "@/lib/acesso";
import { emitirEventoTempoReal } from "@/lib/eventos-tempo-real";
import { comTratamentoDeErro } from "@/lib/api-erro";

/**
 * PUT /api/mesas/[id] — cria (ou ajusta a capacidade de) uma mesa do
 * salão, onde `[id]` é o NÚMERO operacional da mesa. Usado pela aba
 * "Mesas" de Configurações. Idempotente: se a mesa já existe, só
 * atualiza a capacidade — nunca apaga nem reinicia o status.
 */
export const PUT = comTratamentoDeErro("mesas.id.PUT", async (req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizar("salao");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;
  const numero = Number(params.id);
  if (!Number.isInteger(numero) || numero < 1 || numero > 999) {
    return NextResponse.json({ erro: "Número de mesa inválido." }, { status: 400 });
  }
  const corpo = await req.json().catch(() => ({}));
  const capacidade = Number.isInteger(corpo.capacidade)
    ? Math.min(50, Math.max(1, corpo.capacidade))
    : 4;

  const mesa = await prisma.mesa.upsert({
    where: { empresaId_numero: { empresaId, numero } },
    update: { capacidade },
    create: { empresaId, numero, capacidade, status: "livre" },
  });

  emitirEventoTempoReal(empresaId, "mesa", { id: mesa.numero, status: mesa.status });
  return NextResponse.json({
    ok: true,
    mesa: { id: mesa.numero, status: mesa.status, capacidade: mesa.capacidade },
  });
});

/**
 * DELETE /api/mesas/[id] — remove uma mesa do salão (por número). Só
 * mesas LIVRES, sem comanda/pedido em andamento, podem ser removidas —
 * nunca uma mesa com clientes (evita "sumir" com a comanda na tela).
 */
export const DELETE = comTratamentoDeErro("mesas.id.DELETE", async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizar("salao");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;
  const numero = Number(params.id);

  const mesa = await prisma.mesa.findUnique({ where: { empresaId_numero: { empresaId, numero } } });
  if (!mesa) {
    return NextResponse.json({ erro: "Mesa não encontrada." }, { status: 404 });
  }

  const pedidoEmAndamento = await prisma.pedido.findFirst({
    where: { empresaId, canal: "salao", mesaId: mesa.id, status: { notIn: ["concluido", "cancelado"] } },
    select: { id: true },
  });
  if (pedidoEmAndamento || mesa.status !== "livre") {
    return NextResponse.json(
      { erro: "Só é possível remover mesas livres, sem comanda em andamento.", codigo: "CONFLICT" },
      { status: 409 }
    );
  }

  await prisma.mesa.delete({ where: { id: mesa.id } });
  emitirEventoTempoReal(empresaId, "mesa", { id: numero, status: "removida" });
  return NextResponse.json({ ok: true });
});

/** Abre/fecha ou atualiza o status de uma mesa (usado por PDV e Garçom). */
export const PATCH = comTratamentoDeErro("mesas.id.PATCH", async (req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizar("salao");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;
  const numero = Number(params.id);
  const corpo = await req.json().catch(() => ({}));
  const mesa = await prisma.mesa.findUnique({ where: { empresaId_numero: { empresaId, numero } } });
  if (!mesa) {
    return NextResponse.json({ erro: "Mesa não encontrada." }, { status: 404 });
  }

  const dados: Record<string, unknown> = {};
  if (typeof corpo.status === "string") dados.status = corpo.status;
  if (typeof corpo.pessoas === "number") dados.pessoas = corpo.pessoas;
  if (typeof corpo.garcom === "string") dados.garcom = corpo.garcom;
  if (corpo.abrir === true) {
    dados.status = "aguardando";
    dados.pessoas = Number(corpo.pessoas) || 2;
    // O garçom é o usuário autenticado (nome real da sessão).
    dados.garcom = String(corpo.garcom ?? acesso.usuario.nome);
    dados.abertaEm = new Date();
  }
  if (corpo.fechar === true) {
    dados.status = "livre";
    dados.pessoas = null;
    dados.garcom = null;
    dados.abertaEm = null;
    // Cancela pedidos de salão ainda em aberto desta mesa (sem pagamento).
    // Pedidos PAGOS já estão "concluido" (fora deste filtro) — não são
    // tocados. Sem isto, ao liberar a mesa o pedido ficava órfão e, ao
    // reabrir, o PDV reutilizava a comanda ANTIGA (itens do cliente
    // anterior) em vez de começar do zero.
    await prisma.pedido.updateMany({
      where: { empresaId, mesaId: mesa.id, canal: "salao", status: { notIn: ["concluido", "cancelado"] } },
      data: { status: "cancelado" },
    });
  }

  const atualizada = await prisma.mesa.update({ where: { id: mesa.id }, data: dados });
  emitirEventoTempoReal(empresaId, "mesa", {
    id: atualizada.numero,
    status: atualizada.status,
  });
  return NextResponse.json({
    ok: true,
    mesa: {
      id: atualizada.numero,
      status: atualizada.status === "pedido_enviado" ? "enviado" : atualizada.status,
      pessoas: atualizada.pessoas ?? undefined,
      garcom: atualizada.garcom ?? undefined,
      abertaEm: atualizada.abertaEm ? atualizada.abertaEm.getTime() : undefined,
    },
  });
});

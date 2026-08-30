import { NextRequest, NextResponse } from "next/server";
import { autorizar } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/mesas — retorna as mesas da empresa ativa (PDV e Garçom).
 *
 * CORREÇÃO (bug confirmado): antes devolvia um ARRAY diretamente, mas
 * `salao-context.tsx` (PDV) e `garcom-context.tsx` sempre esperaram
 * `{ mesas: [...], comandas: {...} }` — o contrato nunca bateu de
 * verdade com o que os dois consumidores liam.
 *
 * CORREÇÃO (id interno vs número operacional): antes o campo `id` desta
 * resposta era o ID INTERNO do banco (autoincrement), enquanto
 * `PATCH /api/mesas/[id]` sempre tratou o parâmetro da URL como
 * `mesa.numero` — dois significados diferentes para "id" em endpoints
 * irmãos. Agora `id`, em TODA API pública deste módulo, é sempre
 * `mesa.numero` (o número que a equipe usa operacionalmente); o ID
 * interno do banco nunca é exposto ao frontend.
 *
 * `comandas` é indexado pelo MESMO `id` (= numero) e traz o pedido em
 * andamento daquela mesa, quando houver — é o que permite ao PDV/Garçom
 * mostrar itens e total sem uma segunda chamada.
 */
export const GET = comTratamentoDeErro("salao.GET", async () => {
  const acesso = await autorizar("salao");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const mesas = await prisma.mesa.findMany({
    where: { empresaId },
    orderBy: { numero: "asc" },
    select: {
      numero: true,
      capacidade: true,
      status: true,
      abertaEm: true,
      pessoas: true,
      garcom: true,
    },
  });

  // Pedido em ANDAMENTO de cada mesa (canal salão, ainda não fechado) —
  // é o que vira "comanda" na tela. Uma mesa tem no máximo um pedido
  // aberto por vez no fluxo atual (fechar libera a mesa).
  const pedidosAbertos = await prisma.pedido.findMany({
    where: { empresaId, canal: "salao", mesaId: { not: null }, status: { notIn: ["concluido", "cancelado"] } },
    include: { itens: true, mesa: { select: { numero: true } } },
  });

  const comandas: Record<
    number,
    { id: string; itens: unknown[]; total: number; abertaEm: string | null }
  > = {};
  for (const pedido of pedidosAbertos) {
    const numero = pedido.mesa?.numero;
    if (numero === undefined || numero === null) continue;
    comandas[numero] = {
      id: pedido.id,
      total: pedido.total,
      abertaEm: pedido.criadoEm.toISOString(),
      itens: pedido.itens.map((i) => ({
        uid: i.id,
        produtoId: i.produtoId,
        nome: i.nome,
        precoUnit: i.precoUnit,
        quantidade: i.quantidade,
        tamanho: i.tamanho,
        sabores: i.sabores ? JSON.parse(i.sabores) : [],
        adicionais: i.adicionais ? JSON.parse(i.adicionais) : [],
        observacao: i.observacao,
      })),
    };
  }

  return NextResponse.json({
    mesas: mesas.map((m) => ({
      id: m.numero,
      status: m.status === "pedido_enviado" ? "enviado" : m.status,
      capacidade: m.capacidade,
      pessoas: m.pessoas ?? undefined,
      garcom: m.garcom ?? undefined,
      abertaEm: m.abertaEm ? m.abertaEm.getTime() : undefined,
    })),
    comandas,
  });
});

/**
 * POST /api/mesas — abre uma mesa para atendimento (PDV/Garçom).
 * Espera { mesaId, pessoas } no corpo, onde `mesaId` é o NÚMERO
 * operacional da mesa (mesmo `id` devolvido pelo GET acima) — nunca o
 * id interno do banco.
 */
export const POST = comTratamentoDeErro("salao.POST", async (req: NextRequest) => {
  const acesso = await autorizar("salao");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const corpo = await req.json().catch(() => ({}));
  const { mesaId, pessoas } = corpo;

  if (!mesaId || typeof mesaId !== "number" || !pessoas || typeof pessoas !== "number" || pessoas < 1) {
    return NextResponse.json({ erro: "Número da mesa e quantidade válida de pessoas são obrigatórios." }, { status: 400 });
  }

  const mesaExiste = await prisma.mesa.findUnique({
    where: { empresaId_numero: { empresaId, numero: mesaId } },
  });

  if (!mesaExiste) {
    return NextResponse.json({ erro: "Mesa não encontrada para esta empresa." }, { status: 404 });
  }

  const mesa = await prisma.mesa.update({
    where: { id: mesaExiste.id },
    data: { status: "aguardando", abertaEm: new Date(), pessoas },
  });

  return NextResponse.json({ ok: true, mesa: { id: mesa.numero, status: mesa.status, pessoas: mesa.pessoas ?? undefined } }, { status: 200 });
});
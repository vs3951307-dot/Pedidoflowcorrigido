import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { autorizar } from "@/lib/acesso";
import { STATUS_ENTREGA } from "@/lib/delivery";
import { emitirEventoTempoReal } from "@/lib/eventos-tempo-real";
import { comTratamentoDeErro } from "@/lib/api-erro";

/**
 * Entregas (PEDIDO 17) — contrato de `src/lib/entregador.ts` e do painel
 * Delivery do PDV. O entregador vê apenas as próprias entregas; caixa e
 * admin veem todas (incluindo as que aguardam atribuição). Sempre
 * restrito à empresa da sessão.
 */
export const GET = comTratamentoDeErro("entregas.GET", async (req: NextRequest) => {
  const acesso = await autorizar("entregas", "pdv", "admin");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const params = req.nextUrl.searchParams;
  const entregadorBusca = params.get("entregador");
  const status = params.get("status");

  const where: Record<string, unknown> = { empresaId };
  if (acesso.usuario.papel === "ENTREGADOR") {
    // O entregador vê SÓ as próprias entregas — por ID (via `usuarioId`),
    // nunca por nome. O bug anterior usava `contains` no nome: um
    // entregador chamado "Ana" via entregas de "Mariana", "Juliana" etc.
    // (qualquer nome que CONTIVESSE "Ana") — vazamento real entre
    // entregadores diferentes da mesma empresa.
    const entregadorProprio = await prisma.entregador.findFirst({
      where: { empresaId, usuarioId: acesso.usuario.id },
      select: { id: true },
    });
    // Sem cadastro de entregador vinculado, não vê NENHUMA entrega — a
    // alternativa seria mostrar tudo (pior) ou nada (seguro por padrão).
    where.entregadorId = entregadorProprio?.id ?? "__nenhum__";
  } else if (entregadorBusca) {
    // Busca por nome é só uma conveniência do Admin/Caixa filtrando a
    // tela — nunca decide isolamento de segurança (isso é sempre por ID).
    where.entregador = { nome: { contains: entregadorBusca } };
  }
  if (status && STATUS_ENTREGA.includes(status as (typeof STATUS_ENTREGA)[number])) {
    where.status = status;
  }

  const entregas = await prisma.entrega.findMany({
    where,
    include: {
      pedido: { include: { itens: true, pagamentos: true } },
      entregador: true,
    },
    orderBy: { criadoEm: "desc" },
    take: 100,
  });

  // Backfill preguiçoso: entregas criadas ANTES desta correção não têm
  // `codigoQr` ainda — gera e persiste agora, em vez de devolver um QR
  // baseado no número sequencial (o problema que estamos corrigindo).
  const semCodigo = entregas.filter((e) => !e.codigoQr);
  if (semCodigo.length > 0) {
    await Promise.all(
      semCodigo.map((e) =>
        prisma.entrega
          .update({ where: { id: e.id }, data: { codigoQr: randomBytes(12).toString("hex") } })
          .then((atualizada) => {
            e.codigoQr = atualizada.codigoQr;
          })
          .catch(() => {})
      )
    );
  }

  return NextResponse.json({
    entregas: entregas.map((e) => ({
      id: e.id,
      pedidoId: e.pedidoId,
      numeroPedido: e.pedido.numero,
      /** Token imprevisível pro QR que o entregador escaneia (PEDIDO 15) —
       *  nunca mais o número sequencial do pedido. */
      codigoQr: e.codigoQr,
      cliente: e.pedido.clienteNome ?? "Cliente",
      telefone: e.telefone ?? e.pedido.clienteTelefone,
      endereco: e.endereco,
      bairro: e.bairro,
      complemento: e.complemento,
      referencia: e.referencia,
      status: e.status,
      previsao: e.previsao,
      km: e.km,
      gorjeta: e.gorjeta,
      entregador: e.entregador?.nome ?? null,
      ocorrencia: e.ocorrencia,
      iniciadaEm: e.iniciadaEm ? e.iniciadaEm.toISOString() : null,
      criadoEm: e.criadoEm.toISOString(),
      concluidaEm: e.concluidaEm ? e.concluidaEm.toISOString() : null,
      itens: e.pedido.itens.map((i) => ({
        nome: i.nome,
        quantidade: i.quantidade,
        precoUnit: i.precoUnit,
      })),
      valor: e.pedido.total,
      taxaEntrega: e.pedido.taxaEntrega,
      observacao: e.pedido.observacao,
      trocoPara: e.pedido.trocoPara,
      formaPagamentoEntrega: e.pedido.formaPagamentoEntrega,
      pagamento: e.pedido.pagamentos[0] ? { forma: e.pedido.pagamentos[0].forma, valor: e.pedido.pagamentos[0].valor, status: e.pedido.pagamentos[0].status, id: e.pedido.pagamentos[0].id } : null,
    })),
  });
});

/** Cria a entrega de um pedido delivery; `entregadorId` é opcional —
 *  sem entregador, a entrega fica `aguardando` atribuição. */
export const POST = comTratamentoDeErro("entregas.POST", async (req: NextRequest) => {
  const acesso = await autorizar("admin", "pdv");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const corpo = await req.json().catch(() => ({}));
  const pedidoId = String(corpo.pedidoId ?? "");
  if (!pedidoId) {
    return NextResponse.json({ erro: "Informe o pedido." }, { status: 400 });
  }

  const pedido = await prisma.pedido.findFirst({
    where: { id: pedidoId, empresaId },
    include: { entrega: true },
  });
  if (!pedido) {
    return NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 });
  }
  if (pedido.entrega) {
    return NextResponse.json({ erro: "Este pedido já possui entrega." }, { status: 409 });
  }

  let entregadorId: string | null = null;
  if (corpo.entregadorId) {
    const entregador = await prisma.entregador.findFirst({
      where: { id: String(corpo.entregadorId), empresaId },
    });
    if (!entregador || !entregador.ativo) {
      return NextResponse.json({ erro: "Entregador inválido." }, { status: 400 });
    }
    entregadorId = entregador.id;
  }

  const entrega = await prisma.entrega.create({
    data: {
      empresaId,
      pedidoId,
      entregadorId,
      // Token imprevisível pra assumir via QR (PEDIDO 15) — nunca o
      // número sequencial do pedido, que é fácil de adivinhar/incrementar.
      codigoQr: randomBytes(12).toString("hex"),
      endereco: String(corpo.endereco ?? ""),
      bairro: String(corpo.bairro ?? ""),
      complemento: corpo.complemento ? String(corpo.complemento) : null,
      referencia: corpo.referencia ? String(corpo.referencia) : null,
      telefone: corpo.telefone ? String(corpo.telefone) : pedido.clienteTelefone,
      status: entregadorId ? "preparo" : "aguardando",
      previsao: corpo.previsao ? String(corpo.previsao) : pedido.previsao ?? null,
    },
  });
  emitirEventoTempoReal(empresaId, "entrega", { id: entrega.id, status: entrega.status });
  return NextResponse.json({ ok: true, entrega: { id: entrega.id, status: entrega.status } }, { status: 201 });
});

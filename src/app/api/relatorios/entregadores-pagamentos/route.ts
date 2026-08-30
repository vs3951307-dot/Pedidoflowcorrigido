import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { autorizar } from "@/lib/acesso";

const arredondar = (v: number) => Math.round(v * 100) / 100;

const DIAS_POR_PERIODO: Record<string, number> = { hoje: 0, "7dias": 7, "30dias": 30, "90dias": 90 };

function inicioDia(offsetDias: number) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDias);
  d.setHours(0, 0, 0, 0);
  return d;
}

function fimDia(data: Date) {
  const d = new Date(data);
  d.setHours(23, 59, 59, 999);
  return d;
}

const ROTULO_PERIODO: Record<string, string> = {
  hoje: "Hoje",
  "7dias": "Últimos 7 dias",
  "30dias": "Últimos 30 dias",
  "90dias": "Últimos 90 dias",
};

function normalizarForma(forma: string | null | undefined): "dinheiro" | "cartao" | "pix" {
  if (!forma) return "pix";
  const f = forma.toLowerCase();
  if (f === "dinheiro") return "dinheiro";
  if (f === "pix") return "pix";
  return "cartao"; // credito | debito | cartao
}

const VAZIO = { dinheiro: 0, cartao: 0, pix: 0, total: 0 };

type TotaisPorForma = { dinheiro: number; cartao: number; pix: number; total: number };

function acumular(alvo: TotaisPorForma, valor: number, forma: string | null | undefined) {
  const normalizada = normalizarForma(forma);
  alvo[normalizada] = arredondar(alvo[normalizada] + valor);
  alvo.total = arredondar(alvo.total + valor);
}

async function GETTenant(req: NextRequest) {
  const acesso = await autorizar("admin", "entregas");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const periodo = (req.nextUrl.searchParams.get("periodo") ?? "hoje").toLowerCase();
  const dias = DIAS_POR_PERIODO[periodo] ?? 0;
  const de = inicioDia(dias);
  const ate = fimDia(de);

  const [entregadoresCadastro, entregas] = await Promise.all([
    prisma.entregador.findMany({
      where: { empresaId },
      select: { id: true, nome: true, ativo: true, statusHoje: true },
      orderBy: { nome: "asc" },
    }),
    prisma.entrega.findMany({
      where: {
        empresaId,
        criadoEm: { gte: de, lte: ate },
        entregadorId: { not: null },
      },
      include: {
        entregador: { select: { id: true, nome: true } },
        pedido: {
          select: {
            numero: true,
            total: true,
            taxaEntrega: true,
            clienteNome: true,
            pagamentos: {
              select: { id: true, forma: true, valor: true, troco: true, status: true, repassadoAoCaixa: true },
            },
          },
        },
      },
      orderBy: { criadoEm: "desc" },
    }),
  ]);

  const porEntregador = new Map<string, {
    id: string;
    nome: string;
    statusHoje: string;
    ativo: boolean;
    entregas: number;
    recebido: { dinheiro: number; cartao: number; pix: number; total: number };
    aConferir: { dinheiro: number; cartao: number; pix: number; total: number };
    detalhes: Array<{
      id: string;
      numeroPedido: number;
      cliente: string | null;
      valor: number;
      forma: string | null;
      status: string;
      troco: number;
      repassadoAoCaixa: boolean;
      criadoEm: string;
    }>;
  }>();
  for (const e of entregadoresCadastro) {
    porEntregador.set(e.id, {
      id: e.id,
      nome: e.nome,
      statusHoje: e.statusHoje,
      ativo: e.ativo,
      entregas: 0,
      recebido: { ...VAZIO },
      aConferir: { ...VAZIO },
      detalhes: [],
    });
  }
  const totalRecebido = { ...VAZIO };
  const totalAConferir = { ...VAZIO };

  for (const entrega of entregas) {
    if (!entrega.entregador) continue;
    const id = entrega.entregador.id;
    const atual = porEntregador.get(id) ?? {
      id,
      nome: entrega.entregador.nome,
      statusHoje: "ativo",
      ativo: true,
      entregas: 0,
      recebido: { ...VAZIO },
      aConferir: { ...VAZIO },
      detalhes: [],
    };
    atual.entregas += 1;

    const pagamento = entrega.pedido.pagamentos[0] ?? null;
    if (pagamento && pagamento.status === "confirmado") {
      acumular(atual.recebido, pagamento.valor, pagamento.forma);
      acumular(totalRecebido, pagamento.valor, pagamento.forma);
    } else if (pagamento) {
      acumular(atual.aConferir, pagamento.valor, pagamento.forma);
      acumular(totalAConferir, pagamento.valor, pagamento.forma);
    }

    atual.detalhes.push({
      id: entrega.id,
      numeroPedido: entrega.pedido.numero,
      cliente: entrega.pedido.clienteNome,
      valor: arredondar(pagamento?.valor ?? entrega.pedido.total + entrega.pedido.taxaEntrega),
      forma: pagamento?.forma ?? null,
      status: pagamento?.status ?? "sem_pagamento",
      troco: arredondar(pagamento?.troco ?? 0),
      repassadoAoCaixa: pagamento?.repassadoAoCaixa ?? true,
      criadoEm: entrega.criadoEm.toISOString(),
    });
    porEntregador.set(id, atual);
  }

  const entregadores = Array.from(porEntregador.values())
    .map((e) => ({
      ...e,
      recebido: { ...e.recebido },
      aConferir: { ...e.aConferir },
    }))
    .sort((a, b) => b.recebido.total - a.recebido.total || b.entregas - a.entregas);

  const ativos = entregadoresCadastro.filter((e) => e.ativo).length;
  const emAtividade = entregadores.filter((e) => e.ativo && e.statusHoje !== "folga").length;

  return NextResponse.json({
    periodo,
    rotulo: ROTULO_PERIODO[periodo] ?? "Hoje",
    recebido: totalRecebido,
    aConferir: totalAConferir,
    entregadores,
    totalEntregas: entregas.length,
    resumo: {
      cadastrados: entregadoresCadastro.length,
      ativos,
      emAtividade,
    },
  });
}

export const GET = comTratamentoDeErro("relatorios.entregadoresPagamentos.GET", GETTenant);

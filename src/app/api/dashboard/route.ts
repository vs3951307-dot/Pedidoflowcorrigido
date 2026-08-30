import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatBRL } from "@/lib/utils";
import { autorizar } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";

const brl = (v: number) => formatBRL(v);

function inicioDia(offsetDias: number) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDias);
  d.setHours(0, 0, 0, 0);
  return d;
}

const CORES_FORMAS: Record<string, string> = {
  dinheiro: "#2E8B57",
  pix: "#953C2A",
  credito: "#6E4FA6",
  debito: "#3459B4",
};

const STATUS_DASHBOARD: Record<string, "concluido" | "andamento" | "pendente" | "cancelado"> = {
  concluido: "concluido",
  retirado: "concluido",
  pronto: "concluido",
  andamento: "andamento",
  conta: "andamento",
  cancelado: "cancelado",
};

function pctVariacao(atual: number, anterior: number) {
  if (anterior <= 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

export const GET = comTratamentoDeErro("dashboard.GET", async () => {
  const acesso = await autorizar("admin");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;
  const hoje = inicioDia(0);
  const ontem = inicioDia(1);
  const ha14Dias = inicioDia(13);

  const [pedidosHoje, pedidosOntem, pedidos14, pagamentosHoje, itens14, mesas] = await Promise.all([
    prisma.pedido.findMany({ where: { empresaId, criadoEm: { gte: hoje } }, include: { mesa: true, itens: true } }),
    prisma.pedido.findMany({ where: { empresaId, criadoEm: { gte: ontem, lt: hoje } } }),
    prisma.pedido.findMany({
      where: { empresaId, criadoEm: { gte: ha14Dias }, status: { not: "cancelado" } },
      include: { itens: true },
    }),
    prisma.pagamento.findMany({ where: { empresaId, criadoEm: { gte: hoje }, status: "confirmado" } }),
    prisma.itemPedido.findMany({
      where: { pedido: { empresaId, criadoEm: { gte: ha14Dias }, status: { not: "cancelado" } } },
      include: { produto: { include: { categoria: true } } },
    }),
    prisma.mesa.findMany({ where: { empresaId } }),
  ]);

  const validosHoje = pedidosHoje.filter((p) => p.status !== "cancelado");
  const validosOntem = pedidosOntem.filter((p) => p.status !== "cancelado");
  const concluidosHoje = validosHoje.filter((p) => p.status === "concluido" || p.status === "retirado");
  const concluidosOntem = validosOntem.filter((p) => p.status === "concluido" || p.status === "retirado");

  const fatHoje = validosHoje.reduce((acc, p) => acc + p.total, 0);
  const fatOntem = validosOntem.reduce((acc, p) => acc + p.total, 0);
  const ticketHoje = concluidosHoje.length ? fatHoje / concluidosHoje.length : 0;
  const ticketOntem = concluidosOntem.length ? fatOntem / concluidosOntem.length : 0;

  const ocupadas = mesas.filter((m) => m.status !== "livre").length;
  const kpis = [
    {
      chave: "faturamento",
      label: "Faturamento hoje",
      valor: brl(fatHoje),
      hint: `vs. ontem (${brl(fatOntem)})`,
      tendencia: (() => {
        const v = pctVariacao(fatHoje, fatOntem);
        return v === null ? undefined : { value: `${Math.abs(v).toFixed(1).replace(".", ",")}%`, positive: v >= 0 };
      })(),
    },
    {
      chave: "pedidos",
      label: "Pedidos hoje",
      valor: String(validosHoje.length),
      hint: `${validosHoje.filter((p) => p.canal === "salao").length} no salão · ${validosHoje.filter((p) => p.canal !== "salao").length} retirada/delivery`,
      tendencia: (() => {
        const v = pctVariacao(validosHoje.length, validosOntem.length);
        return v === null ? undefined : { value: `${Math.abs(v).toFixed(1).replace(".", ",")}%`, positive: v >= 0 };
      })(),
    },
    {
      chave: "ticket",
      label: "Ticket médio",
      valor: brl(ticketHoje),
      hint: "por pedido concluído",
      tendencia: (() => {
        const v = pctVariacao(ticketHoje, ticketOntem);
        return v === null ? undefined : { value: `${Math.abs(v).toFixed(1).replace(".", ",")}%`, positive: v >= 0 };
      })(),
    },
    {
      chave: "ocupacao",
      label: "Mesas em uso",
      valor: `${ocupadas} de ${mesas.length}`,
      hint: `taxa de ocupação de ${Math.round((ocupadas / Math.max(1, mesas.length)) * 100)}%`,
      tendencia: undefined,
    },
  ];

  const vendasPorHora: { hora: string; valor: number }[] = [];
  for (let h = 11; h <= 23; h++) {
    const total = validosHoje
      .filter((p) => new Date(p.criadoEm).getHours() === h)
      .reduce((acc, p) => acc + p.total, 0);
    vendasPorHora.push({ hora: `${h}h`, valor: Math.round(total) });
  }

  const serie14Dias: { label: string; faturamento: number; pedidos: number }[] = [];
  for (let d = 13; d >= 0; d--) {
    const inicio = inicioDia(d);
    const fim = inicioDia(d - 1);
    const doDia = pedidos14.filter((p) => p.criadoEm >= inicio && p.criadoEm < fim);
    const label = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(inicio);
    serie14Dias.push({
      label,
      faturamento: Math.round(doDia.reduce((acc, p) => acc + p.total, 0)),
      pedidos: doDia.length,
    });
  }

  const formasMix = Object.entries(CORES_FORMAS).map(([forma, cor]) => {
    const valor = pagamentosHoje.filter((p) => p.forma === forma).reduce((acc, p) => acc + p.valor, 0);
    const rotulos: Record<string, string> = { dinheiro: "Dinheiro", pix: "Pix", credito: "Crédito", debito: "Débito" };
    return { chave: forma, rotulo: rotulos[forma] ?? forma, valor: Math.round(valor * 100) / 100, cor };
  });

  const vendasPorProduto = new Map<string, number>();
  for (const i of itens14) {
    vendasPorProduto.set(i.nome, (vendasPorProduto.get(i.nome) ?? 0) + i.quantidade);
  }
  const topProdutos = [...vendasPorProduto.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([nome, vendas]) => ({ nome, vendas }));

  const ultimosPedidos = [...validosHoje]
    .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime())
    .slice(0, 7)
    .map((p) => ({
      id: `P-${p.numero}`,
      hora: new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(p.criadoEm),
      cliente: p.mesa ? `Mesa ${String(p.mesa.numero).padStart(2, "0")}` : (p.clienteNome ?? "Balcão"),
      itens: p.itens.reduce((acc, i) => acc + i.quantidade, 0),
      valor: p.total,
      status: STATUS_DASHBOARD[p.status] ?? "pendente",
    }));

  return NextResponse.json({
    kpis,
    vendasPorHora,
    serie14Dias,
    formasPagamentoMix: formasMix,
    topProdutos,
    ultimosPedidos,
  });
});

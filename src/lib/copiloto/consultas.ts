import { prisma } from "@/lib/prisma";

export interface DefinicaoConsulta {
  descricao: string;
  parametros: Record<string, "string" | "number">;
  /** `empresaId` é injetado pela rota (sessão) — NUNCA vem da pergunta/IA. */
  executar: (empresaId: string, params: Record<string, unknown>) => Promise<unknown>;
  /** Converte o resultado bruto em texto legível para o usuário (chat). */
  resumir: (dados: unknown) => string;
}

/** Catálogo fechado de consultas somente-leitura que o copiloto pode
 *  executar. A IA escolhe uma chave daqui — nunca gera SQL. Toda consulta
 *  é sempre filtrada pela empresa da sessão (multiempresa). */
export const CONSULTAS: Record<string, DefinicaoConsulta> = {
  vendas_por_periodo: {
    descricao: "Total de vendas e número de pedidos nos últimos N dias",
    parametros: { dias: "number" },
    async executar(empresaId, { dias }) {
      const desde = new Date();
      desde.setDate(desde.getDate() - Number(dias ?? 7));
      const pedidos = await prisma.pedido.findMany({
        where: { empresaId, criadoEm: { gte: desde }, status: { not: "cancelado" } },
        select: { total: true, canal: true, criadoEm: true },
      });
      const totalVendas = pedidos.reduce((s, p) => s + p.total, 0);
      return { periodoDias: dias, totalPedidos: pedidos.length, totalVendas };
    },
    resumir(dados) {
      const d = dados as { periodoDias: number; totalPedidos: number; totalVendas: number };
      return `Nos últimos ${d.periodoDias} dias você teve ${d.totalPedidos} pedidos e faturou R$ ${Number(d.totalVendas).toFixed(2)}.`;
    },
  },
  produtos_mais_vendidos: {
    descricao: "Top produtos por quantidade vendida em um período",
    parametros: { dias: "number", limite: "number" },
    async executar(empresaId, { dias, limite }) {
      const desde = new Date();
      desde.setDate(desde.getDate() - Number(dias ?? 30));
      const itens = await prisma.itemPedido.groupBy({
        by: ["nome"],
        where: { pedido: { empresaId, criadoEm: { gte: desde }, status: { not: "cancelado" } } },
        _sum: { quantidade: true },
        orderBy: { _sum: { quantidade: "desc" } },
        take: Number(limite ?? 10),
      });
      return itens.map((i) => ({ produto: i.nome, quantidade: i._sum.quantidade ?? 0 }));
    },
    resumir(dados) {
      const lista = dados as { produto: string; quantidade: number }[];
      if (lista.length === 0) return "Nenhum produto vendido neste período.";
      const top = lista
        .slice(0, 5)
        .map((p) => `${p.quantidade}x ${p.produto}`)
        .join(", ");
      return `Mais vendidos: ${top}.`;
    },
  },
  pedidos_atrasados: {
    descricao: "Pedidos em produção há mais tempo que o normal (KDS)",
    parametros: {},
    async executar(empresaId) {
      const limite = new Date(Date.now() - 20 * 60 * 1000); // 20 min
      const pedidos = await prisma.pedido.findMany({
        where: { empresaId, producao: { in: ["recebido", "em_preparo"] }, recebidoEm: { lt: limite } },
        select: { numero: true, canal: true, recebidoEm: true, producao: true },
        orderBy: { recebidoEm: "asc" },
      });
      return pedidos;
    },
    resumir(dados) {
      const lista = dados as { numero: string; canal: string; recebidoEm: Date; producao: string }[];
      if (lista.length === 0) return "Nenhum pedido atrasado na cozinha no momento.";
      const detalhes = lista
        .slice(0, 5)
        .map((p) => `Pedido ${p.numero} (${p.canal}) esperando há ~20min`)
        .join("; ");
      return `${lista.length} pedido(s) aguardando há mais de 20 min: ${detalhes}.`;
    },
  },
  caixa_aberto_atual: {
    descricao: "Situação do caixa aberto no momento (se houver)",
    parametros: {},
    async executar(empresaId) {
      const caixa = await prisma.caixa.findFirst({
        where: { empresaId, status: "aberto" },
        include: { movimentacoes: true },
      });
      if (!caixa) return { aberto: false };
      // Aproximação do movimento: entradas/abertura/vendas somam;
      // sangrias e trocos subtraem.
      const totalMovimentacoes = caixa.movimentacoes.reduce(
        (s, m) => s + (m.tipo === "sangria" || m.tipo === "troco" ? -m.valor : m.valor),
        0
      );
      return { aberto: true, abertoEm: caixa.abertoEm, totalMovimentacoes };
    },
    resumir(dados) {
      const d = dados as { aberto: boolean; abertoEm?: Date; totalMovimentacoes?: number };
      if (!d.aberto) return "Nenhum caixa está aberto no momento.";
      const hora = d.abertoEm ? new Date(d.abertoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";
      return `Caixa aberto desde ${hora}. Movimento somado: R$ ${Number(d.totalMovimentacoes ?? 0).toFixed(2)}.`;
    },
  },
  estoque_baixo: {
    descricao: "Produtos de estoque abaixo do mínimo cadastrado",
    parametros: {},
    async executar(empresaId) {
      const produtos = await prisma.estoqueProduto.findMany({
        where: { empresaId, quantidade: { lte: prisma.estoqueProduto.fields.minimo } },
        select: { nome: true, quantidade: true, minimo: true },
      });
      return produtos;
    },
    resumir(dados) {
      const lista = dados as { nome: string; quantidade: number; minimo: number }[];
      if (lista.length === 0) return "Nenhum item de estoque abaixo do mínimo cadastrado.";
      const itens = lista.slice(0, 8).map((p) => `${p.nome} (${p.quantidade}/${p.minimo})`).join("; ");
      return `${lista.length} item(ns) abaixo do mínimo: ${itens}.`;
    },
  },

  entregas_do_periodo: {
    descricao: "Quantidade de entregas por status nos últimos N dias",
    parametros: { dias: "number" },
    async executar(empresaId, { dias }) {
      const desde = new Date();
      desde.setDate(desde.getDate() - Number(dias ?? 1));
      const entregas = await prisma.entrega.findMany({
        where: { empresaId, criadoEm: { gte: desde } },
        select: { status: true },
      });
      const porStatus: Record<string, number> = {};
      for (const e of entregas) porStatus[e.status] = (porStatus[e.status] ?? 0) + 1;
      return { periodoDias: dias ?? 1, total: entregas.length, porStatus };
    },
    resumir(dados) {
      const d = dados as { periodoDias: number; total: number; porStatus: Record<string, number> };
      const statuses = Object.entries(d.porStatus)
        .map(([s, n]) => `${s}: ${n}`)
        .join(", ");
      return `Nos últimos ${d.periodoDias} dia(s), ${d.total} entrega(s) registrada(s) — ${statuses}.`;
    },
  },
  desempenho_entregadores: {
    descricao: "Quantidade de entregas concluídas por entregador em um período",
    parametros: { dias: "number" },
    async executar(empresaId, { dias }) {
      const desde = new Date();
      desde.setDate(desde.getDate() - Number(dias ?? 30));
      const entregas = await prisma.entrega.findMany({
        where: { empresaId, status: "entregue", concluidaEm: { gte: desde }, entregadorId: { not: null } },
        select: { entregador: { select: { nome: true } } },
      });
      const porEntregador: Record<string, number> = {};
      for (const e of entregas) {
        const nome = e.entregador?.nome ?? "—";
        porEntregador[nome] = (porEntregador[nome] ?? 0) + 1;
      }
      return Object.entries(porEntregador)
        .map(([entregador, entregas]) => ({ entregador, entregas }))
        .sort((a, b) => b.entregas - a.entregas);
    },
    resumir(dados) {
      const lista = dados as { entregador: string; entregas: number }[];
      if (lista.length === 0) return "Nenhuma entrega concluída por entregador no período.";
      return lista
        .slice(0, 5)
        .map((e) => `${e.entregador}: ${e.entregas} entrega(s)`)
        .join("; ");
    },
  },
  comparativo_periodos: {
    descricao: "Compara vendas do período atual (N dias) com o período anterior de mesmo tamanho",
    parametros: { dias: "number" },
    async executar(empresaId, { dias }) {
      const tamanho = Number(dias ?? 30);
      const inicioAtual = new Date();
      inicioAtual.setDate(inicioAtual.getDate() - tamanho);
      const inicioAnterior = new Date();
      inicioAnterior.setDate(inicioAnterior.getDate() - tamanho * 2);

      const [atual, anterior] = await Promise.all([
        prisma.pedido.findMany({
          where: { empresaId, criadoEm: { gte: inicioAtual }, status: { not: "cancelado" } },
          select: { total: true },
        }),
        prisma.pedido.findMany({
          where: { empresaId, criadoEm: { gte: inicioAnterior, lt: inicioAtual }, status: { not: "cancelado" } },
          select: { total: true },
        }),
      ]);
      const totalAtual = atual.reduce((s, p) => s + p.total, 0);
      const totalAnterior = anterior.reduce((s, p) => s + p.total, 0);
      const variacaoPercentual = totalAnterior > 0 ? ((totalAtual - totalAnterior) / totalAnterior) * 100 : null;
      return {
        periodoDias: tamanho,
        atual: { totalPedidos: atual.length, totalVendas: totalAtual },
        anterior: { totalPedidos: anterior.length, totalVendas: totalAnterior },
        variacaoPercentual,
      };
    },
    resumir(dados) {
      const d = dados as {
        periodoDias: number;
        atual: { totalPedidos: number; totalVendas: number };
        anterior: { totalPedidos: number; totalVendas: number };
        variacaoPercentual: number | null;
      };
      const variacao = d.variacaoPercentual === null ? "sem base de comparação" : `${d.variacaoPercentual.toFixed(1)}%`;
      return `Últimos ${d.periodoDias} dias: R$ ${Number(d.atual.totalVendas).toFixed(2)} (${d.atual.totalPedidos} pedidos). Período anterior: R$ ${Number(d.anterior.totalVendas).toFixed(2)}. Variação: ${variacao}.`;
    },
  },
};

export function listarConsultasDisponiveis() {
  return Object.entries(CONSULTAS).map(([chave, c]) => ({
    chave,
    descricao: c.descricao,
    parametros: c.parametros,
  }));
}

/**
 * Sanitiza/clampa os parâmetros ANTES de executar uma consulta — os
 * valores vêm da IA (ou das palavras-chave) e não podem causar queries
 * absurdas/ilegais (ex.: dias negativos, limite gigante, NaN). Aplicado
 * pela rota na única chamada de `executar` (auditoria de segurança).
 * A IA nunca decide o range — só o valor dentro de limites fixos.
 */
export function sanitizarParametros(
  definicao: DefinicaoConsulta,
  params: Record<string, unknown>
): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const [chave, tipo] of Object.entries(definicao.parametros)) {
    const bruto = params?.[chave];
    if (tipo === "number") {
      const numero = Number(bruto);
      const valido = Number.isFinite(numero);
      if (chave === "dias") {
        saida[chave] = valido ? Math.min(Math.max(Math.trunc(numero), 1), 365) : 7;
      } else if (chave === "limite") {
        saida[chave] = valido ? Math.min(Math.max(Math.trunc(numero), 1), 50) : 10;
      } else {
        saida[chave] = valido ? numero : null;
      }
    } else {
      saida[chave] = typeof bruto === "string" ? bruto.slice(0, 200) : null;
    }
  }
  return saida;
}

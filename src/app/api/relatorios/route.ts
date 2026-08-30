import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatBRL } from "@/lib/utils";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { autorizar } from "@/lib/acesso";

const brl = (v: number) => formatBRL(v);
const arredondar = (v: number) => Math.round(v * 100) / 100;

function inicioDia(offsetDias: number) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDias);
  d.setHours(0, 0, 0, 0);
  return d;
}

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
function rotuloDia(data: Date) {
  return `${DIAS_SEMANA[data.getDay()]} ${String(data.getDate()).padStart(2, "0")}`;
}

function pct(atual: number, anterior: number) {
  if (anterior <= 0) return undefined;
  const v = ((atual - anterior) / anterior) * 100;
  return { value: `${Math.abs(v).toFixed(1).replace(".", ",")}%`, positive: v >= 0 };
}

/**
 * Período do relatório (PEDIDO: "implementar filtros por período").
 * Aceita `?periodo=hoje|7dias|30dias|90dias` — cai em 7 dias se ausente ou
 * inválido, preservando o comportamento anterior à mudança.
 */
const DIAS_POR_PERIODO: Record<string, number> = { hoje: 0, "7dias": 7, "30dias": 30, "90dias": 90 };
function diasDoPeriodo(valor: string | null): number {
  return DIAS_POR_PERIODO[valor ?? ""] ?? 7;
}

function tempoDePrevisao(previsao: string | null) {
  const n = Number.parseInt(previsao ?? "", 10);
  return Number.isFinite(n) ? n : 35;
}

async function GETTenant(req: NextRequest) {
  const visao = req.nextUrl.searchParams.get("visao") ?? "delivery";

  // Autorização depende da ABA pedida: só a visão "entregadores" tem
  // qualquer relação com o módulo Entregador. Nas demais (financeiro,
  // produtos, salão, retirada...), pedir o recurso "entregas" aqui
  // faria o módulo Entregador ser exigido para relatórios que não têm
  // nada a ver com entrega — por isso o recurso muda conforme a aba,
  // em vez de uma lista fixa cobrindo tudo de uma vez.
  const acesso = visao === "entregadores" ? await autorizar("admin", "entregas") : await autorizar("admin");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;
  // O entregador só consulta o próprio desempenho.
  if (acesso.usuario.papel === "ENTREGADOR" && visao !== "entregadores") {
    return NextResponse.json(
      { erro: "Você não tem permissão para esta visão de relatório." },
      { status: 403 }
    );
  }
  const dias = diasDoPeriodo(req.nextUrl.searchParams.get("periodo"));
  // Nome mantido (`ha7Dias`/`ha14Dias`) para minimizar o diff no resto do
  // arquivo — mas agora refletem o período pedido, não mais um valor fixo.
  // "ha14Dias" é o dobro da janela, para as séries/comparativos que
  // precisam de um histórico maior que o período em si (ex.: fluxo diário).
  const ha7Dias = inicioDia(Math.max(dias, 1));
  const ha14Dias = inicioDia(Math.max(dias * 2 - 1, 1));
  const hoje = inicioDia(0);

  /* ----------------------------- Delivery ----------------------------- */
  if (visao === "delivery") {
    const [pedidos, ultimas] = await Promise.all([
      prisma.pedido.findMany({
        where: { empresaId, canal: "delivery", criadoEm: { gte: ha7Dias }, status: { not: "cancelado" } },
        include: { itens: true, entrega: { include: { entregador: true } } },
      }),
      prisma.pedido.findMany({
        where: { empresaId, canal: "delivery", entrega: { isNot: null } },
        include: { entrega: { include: { entregador: true } } },
        orderBy: { criadoEm: "desc" },
        take: 6,
      }),
    ]);

    // PEDIDO 72: "não contar pagamento pendente como receita". `pedidos`
    // inclui tudo que não foi cancelado (correto para contagem/tempo
    // médio); FATURAMENTO só conta o que já foi PAGO
    // (`status === "concluido"`, setado quando o pagamento é confirmado).
    const pedidosPagos = pedidos.filter((p) => p.status === "concluido");
    const fat = pedidosPagos.reduce((acc, p) => acc + p.total, 0);
    const ticket = pedidosPagos.length ? fat / pedidosPagos.length : 0;
    const tempos = pedidos.map((p) => tempoDePrevisao(p.entrega?.previsao ?? null));
    const tempoMedio = tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : 0;

    const entregasPorDia: { dia: string; pedidos: number; valor: number; tempoMedio: number }[] = [];
    for (let d = 6; d >= 0; d--) {
      const inicio = inicioDia(d);
      const fim = inicioDia(d - 1);
      const doDia = pedidos.filter((p) => p.criadoEm >= inicio && p.criadoEm < fim);
      const temposDoDia = doDia.map((p) => tempoDePrevisao(p.entrega?.previsao ?? null));
      entregasPorDia.push({
        dia: rotuloDia(inicio),
        pedidos: doDia.length,
        valor: arredondar(doDia.filter((p) => p.status === "concluido").reduce((acc, p) => acc + p.total, 0)),
        tempoMedio: temposDoDia.length ? Math.round(temposDoDia.reduce((a, b) => a + b, 0) / temposDoDia.length) : 0,
      });
    }

    const porBairro = new Map<string, { pedidos: number; valor: number; tempos: number[] }>();
    for (const p of pedidos) {
      const bairro = p.entrega?.bairro || "Centro";
      const atual = porBairro.get(bairro) ?? { pedidos: 0, valor: 0, tempos: [] };
      atual.pedidos += 1;
      atual.valor += p.total;
      atual.tempos.push(tempoDePrevisao(p.entrega?.previsao ?? null));
      porBairro.set(bairro, atual);
    }
    const entregasPorBairro = [...porBairro.entries()]
      .map(([bairro, v]) => ({
        bairro,
        pedidos: v.pedidos,
        valor: arredondar(v.valor),
        tempoMedio: v.tempos.length ? Math.round(v.tempos.reduce((a, b) => a + b, 0) / v.tempos.length) : 0,
      }))
      .sort((a, b) => b.pedidos - a.pedidos)
      .slice(0, 5);

    const ultimasEntregas = ultimas
      .filter((p) => p.entrega)
      .map((p, idx) => ({
        id: `E-${String(p.numero).slice(-3)}`,
        hora: new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(p.criadoEm),
        cliente: p.clienteNome ?? "Cliente",
        bairro: p.entrega!.bairro || "Centro",
        endereco: p.entrega!.endereco,
        entregador: p.entrega!.entregador?.nome.split(" ")[0] ?? "Não atribuído",
        valor: p.total,
        status: p.entrega!.status as "entregue" | "rota" | "preparo" | "aguardando",
        tempo: tempoDePrevisao(p.entrega!.previsao),
      }))
      .filter((_, i) => i < 6);

    return NextResponse.json({
      resumo: [
        { label: "Pedidos", valor: String(pedidos.length), tendencia: pct(pedidos.length, 0) },
        { label: "Faturamento", valor: brl(fat), tendencia: pct(fat, 0) },
        { label: "Ticket médio", valor: brl(ticket), tendencia: pct(ticket, 0) },
        { label: "Tempo médio", valor: `${tempoMedio} min`, hint: "média da última semana" },
      ],
      entregasPorDia,
      entregasPorBairro,
      ultimasEntregas,
    });
  }

  /* ------------------------------ Salão ------------------------------- */
  if (visao === "salao") {
    const [pedidos, mesas] = await Promise.all([
      prisma.pedido.findMany({
        where: { empresaId, canal: "salao", criadoEm: { gte: ha7Dias }, status: { not: "cancelado" } },
        include: { mesa: true },
      }),
      prisma.mesa.findMany({ where: { empresaId }, orderBy: { numero: "asc" } }),
    ]);

    // PEDIDO 72: "não contar pagamento pendente como receita". `pedidos`
    // inclui tudo que não foi cancelado (correto para contagem/tempo
    // médio); FATURAMENTO só conta o que já foi PAGO
    // (`status === "concluido"`, setado quando o pagamento é confirmado).
    const pedidosPagos = pedidos.filter((p) => p.status === "concluido");
    const fat = pedidosPagos.reduce((acc, p) => acc + p.total, 0);
    const ticket = pedidosPagos.length ? fat / pedidosPagos.length : 0;
    const ocupadas = mesas.filter((m) => m.status !== "livre").length;

    const vendasPorHorario: { hora: string; valor: number }[] = [];
    for (let h = 11; h <= 23; h++) {
      const valor = pedidos
        .filter((p) => p.criadoEm >= hoje && new Date(p.criadoEm).getHours() === h && p.status === "concluido")
        .reduce((acc, p) => acc + p.total, 0);
      vendasPorHorario.push({ hora: `${h}h`, valor: Math.round(valor) });
    }

    const porMesa = new Map<number, { pedidos: number; valor: number; tempos: number[] }>();
    for (const p of pedidos) {
      if (!p.mesa) continue;
      const atual = porMesa.get(p.mesa.numero) ?? { pedidos: 0, valor: 0, tempos: [] };
      atual.pedidos += 1;
      if (p.status === "concluido") atual.valor += p.total;
      if (p.finalizadoEm) {
        atual.tempos.push(Math.round((p.finalizadoEm.getTime() - p.criadoEm.getTime()) / 60000));
      }
      porMesa.set(p.mesa.numero, atual);
    }
    const salaoMesas = [...porMesa.entries()]
      .map(([numero, v]) => {
        const mesa = mesas.find((m) => m.numero === numero);
        return {
          mesa: `Mesa ${String(numero).padStart(2, "0")}`,
          pedidos: v.pedidos,
          valor: arredondar(v.valor),
          tempoMedio: v.tempos.length ? Math.round(v.tempos.reduce((a, b) => a + b, 0) / v.tempos.length) : null,
          status: (mesa && mesa.status !== "livre" ? "ocupada" : "livre") as "ocupada" | "livre" | "reservada",
        };
      })
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 6);

    return NextResponse.json({
      resumo: [
        { label: "Faturamento", valor: brl(fat), tendencia: pct(fat, 0) },
        { label: "Pedidos", valor: String(pedidos.length), tendencia: pct(pedidos.length, 0) },
        { label: "Ticket médio", valor: brl(ticket), tendencia: pct(ticket, 0) },
        { label: "Ocupação agora", valor: `${Math.round((ocupadas / Math.max(1, mesas.length)) * 100)}%`, hint: `${ocupadas} de ${mesas.length} mesas em uso` },
      ],
      vendasPorHorario,
      ocupacaoSalao: [
        { chave: "ocupadas", rotulo: "Mesas ocupadas", valor: ocupadas, cor: "#953C2A" },
        { chave: "livres", rotulo: "Mesas livres", valor: mesas.length - ocupadas, cor: "#2E8B57" },
      ],
      salaoMesas,
    });
  }

  /* ----------------------------- Retirada ----------------------------- */
  if (visao === "retirada") {
    const [pedidos, ultimas] = await Promise.all([
      prisma.pedido.findMany({ where: { empresaId, canal: "retirada", criadoEm: { gte: ha7Dias } }, include: { itens: true } }),
      prisma.pedido.findMany({ where: { empresaId, canal: "retirada" }, include: { itens: true }, orderBy: { criadoEm: "desc" }, take: 6 }),
    ]);

    const validos = pedidos.filter((p) => p.status !== "cancelado");
    // PEDIDO 72: faturamento só conta pedidos PAGOS.
    const pagos = validos.filter((p) => p.status === "concluido");
    const fat = pagos.reduce((acc, p) => acc + p.total, 0);
    const ticket = pagos.length ? fat / pagos.length : 0;

    const retiradasPorDia: { dia: string; pedidos: number; valor: number }[] = [];
    for (let d = 6; d >= 0; d--) {
      const inicio = inicioDia(d);
      const fim = inicioDia(d - 1);
      const doDia = validos.filter((p) => p.criadoEm >= inicio && p.criadoEm < fim);
      retiradasPorDia.push({
        dia: rotuloDia(inicio),
        pedidos: doDia.length,
        valor: arredondar(doDia.filter((p) => p.status === "concluido").reduce((acc, p) => acc + p.total, 0)),
      });
    }

    const statusDefs: { chave: string; rotulo: string; status: string; cor: string }[] = [
      { chave: "retirada", rotulo: "Retiradas", status: "retirado", cor: "#953C2A" },
      { chave: "pronta", rotulo: "Prontas", status: "pronto", cor: "#2E8B57" },
      { chave: "preparo", rotulo: "Em preparo", status: "andamento", cor: "#B8790F" },
      { chave: "cancelada", rotulo: "Canceladas", status: "cancelado", cor: "#6E4FA6" },
    ];
    const retiradasStatus = statusDefs.map((s) => ({
      chave: s.chave,
      rotulo: s.rotulo,
      valor: pedidos.filter((p) => p.status === s.status).length,
      cor: s.cor,
    }));

    const statusRecente: Record<string, "pronta" | "preparo" | "retirada" | "cancelada"> = {
      pronto: "pronta",
      andamento: "preparo",
      retirado: "retirada",
      cancelado: "cancelada",
    };
    const ultimasRetiradas = ultimas.map((p) => ({
      id: `R-${String(p.numero).slice(-3)}`,
      hora: new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(p.criadoEm),
      cliente: p.clienteNome ?? "Cliente",
      itens: p.itens.reduce((acc, i) => acc + i.quantidade, 0),
      valor: p.total,
      status: statusRecente[p.status] ?? "preparo",
      tempoPreparo: p.finalizadoEm ? Math.max(0, Math.round((p.finalizadoEm.getTime() - p.criadoEm.getTime()) / 60000)) : null,
    }));

    return NextResponse.json({
      resumo: [
        { label: "Pedidos", valor: String(validos.length), tendencia: pct(validos.length, 0) },
        { label: "Faturamento", valor: brl(fat), tendencia: pct(fat, 0) },
        { label: "Ticket médio", valor: brl(ticket), tendencia: pct(ticket, 0) },
        { label: "Tempo de preparo", valor: "22 min", hint: "média da última semana" },
      ],
      retiradasPorDia,
      retiradasStatus,
      ultimasRetiradas,
    });
  }

  /* ---------------------------- Financeiro ---------------------------- */
  if (visao === "financeiro") {
    const [pedidos, notas] = await Promise.all([
      prisma.pedido.findMany({ where: { empresaId, criadoEm: { gte: ha14Dias }, status: { not: "cancelado" } } }),
      prisma.notaFiscal.findMany({ where: { empresaId, emissao: { gte: ha14Dias }, status: { not: "cancelada" } } }),
    ]);

    // PEDIDO 72: faturamento/receita só conta pedidos PAGOS.
    const pedidosPagos = pedidos.filter((p) => p.status === "concluido");
    const receitas = pedidosPagos.reduce((acc, p) => acc + p.total, 0);
    const despesasNotas = notas.reduce((acc, n) => acc + n.valor, 0);
    // Antes era um valor FIXO (R$ 3.500) para toda e qualquer empresa.
    // Agora vem da mesma configuração "empresa" usada em
    // Admin > Configurações — 0 se o Admin nunca preencheu (honesto: "não
    // sei"), nunca um número inventado.
    const configEmpresa = await prisma.configuracao.findUnique({
      where: { empresaId_chave: { empresaId, chave: "empresa" } },
    });
    let despesaFolhaMensal = 0;
    if (configEmpresa) {
      try {
        const valor = JSON.parse(configEmpresa.valor);
        despesaFolhaMensal = Number(valor?.despesaFolhaMensal) || 0;
      } catch {
        despesaFolhaMensal = 0;
      }
    }
    const folha = despesaFolhaMensal * (Math.max(dias, 1) / 30);
    const despesas = despesasNotas + folha;
    const lucro = receitas - despesas;
    const margem = receitas > 0 ? (lucro / receitas) * 100 : 0;

    const pontosFluxo = Math.min(Math.max(dias * 2 - 1, 1), 60);
    const fluxo14Dias: { label: string; receitas: number; despesas: number }[] = [];
    for (let d = pontosFluxo - 1; d >= 0; d--) {
      const inicio = inicioDia(d);
      const fim = inicioDia(d - 1);
      const doDia = pedidosPagos.filter((p) => p.criadoEm >= inicio && p.criadoEm < fim);
      const notasDoDia = notas.filter((n) => n.emissao >= inicio && n.emissao < fim);
      fluxo14Dias.push({
        label: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(inicio),
        receitas: Math.round(doDia.reduce((acc, p) => acc + p.total, 0)),
        despesas: Math.round(notasDoDia.reduce((acc, n) => acc + n.valor, 0) + folha / pontosFluxo),
      });
    }

    // Só categorias com FONTE DE DADOS real. "Aluguel", "Energia" e
    // "Entregadores" eram números fixos inventados, sem nenhum lançamento
    // por trás — removidos em vez de mantidos como decoração plausível.
    const despesasPorCategoria = [
      { categoria: "Insumos", valor: Math.round(despesasNotas), cor: "#953C2A" },
      ...(folha > 0 ? [{ categoria: "Folha de pagamento", valor: Math.round(folha), cor: "#3459B4" }] : []),
    ];

    const pontosLancamentos = Math.min(Math.max(dias, 1), 30);
    const lancamentos: { data: string; descricao: string; categoria: string; tipo: "entrada" | "saida"; valor: number }[] = [];
    const rotuloData = (d: Date) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(d);
    for (let d = pontosLancamentos - 1; d >= 0; d--) {
      const inicio = inicioDia(d);
      const fim = inicioDia(d - 1);
      const doDia = pedidosPagos.filter((p) => p.criadoEm >= inicio && p.criadoEm < fim);
      if (doDia.length) {
        lancamentos.push({
          data: rotuloData(inicio),
          descricao: "Vendas do dia (caixa)",
          categoria: "Vendas",
          tipo: "entrada",
          valor: arredondar(doDia.reduce((acc, p) => acc + p.total, 0)),
        });
      }
      for (const n of notas.filter((n) => n.emissao >= inicio && n.emissao < fim)) {
        lancamentos.push({
          data: rotuloData(inicio),
          descricao: `Fornecedor — ${n.fornecedor}`,
          categoria: "Insumos",
          tipo: "saida",
          valor: n.valor,
        });
      }
    }
    // Só lança "Folha" no extrato se a empresa configurou um valor real —
    // sem isso, era uma transação inventada aparecendo entre as reais.
    if (folha > 0) {
      lancamentos.push({
        data: rotuloData(inicioDia(1)),
        descricao: "Folha de pagamento (estimativa mensal, proporcional ao período)",
        categoria: "Folha",
        tipo: "saida",
        valor: arredondar(folha),
      });
    }
    lancamentos.sort((a, b) => b.data.localeCompare(a.data) || b.tipo.localeCompare(a.tipo));

    return NextResponse.json({
      resumo: [
        { label: `Receitas (${dias === 0 ? "hoje" : dias + " dias"})`, valor: brl(receitas), tendencia: pct(receitas, 0) },
        {
          label: "Despesas",
          valor: brl(despesas),
          hint:
            despesas > 0
              ? `insumos ${Math.round((despesasNotas / despesas) * 100)}%${folha > 0 ? ` · folha ${Math.round((folha / despesas) * 100)}%` : ""}`
              : "sem despesas registradas no período",
        },
        { label: "Lucro líquido", valor: brl(lucro), tendencia: pct(lucro, 0) },
        { label: "Margem", valor: `${margem.toFixed(1).replace(".", ",")}%`, tendencia: pct(margem, 0) },
      ],
      fluxo14Dias,
      despesasPorCategoria,
      lancamentos: lancamentos.slice(0, pontosLancamentos),
    });
  }

  /* ------------------------------ Produtos ---------------------------- */
  if (visao === "produtos") {
    const itens = await prisma.itemPedido.findMany({
      where: { pedido: { empresaId, criadoEm: { gte: ha14Dias }, status: "concluido" } },
      include: { produto: { include: { categoria: true } } },
    });

    const itensVendidos = itens.reduce((acc, i) => acc + i.quantidade, 0);
    const fat = itens.reduce((acc, i) => acc + i.precoUnit * i.quantidade, 0);
    const ticketItem = itensVendidos ? fat / itensVendidos : 0;

    const CORES_CATEGORIAS: Record<string, string> = {
      "Pizzas salgadas": "#953C2A",
      "Pizzas doces": "#953C2A",
      Bebidas: "#3459B4",
      Sobremesas: "#6E4FA6",
      Entradas: "#2E8B57",
    };
    const porCategoria = new Map<string, { itens: number; faturamento: number }>();
    for (const i of itens) {
      const nome = i.produto?.categoria.nome ?? "Outros";
      const atual = porCategoria.get(nome) ?? { itens: 0, faturamento: 0 };
      atual.itens += i.quantidade;
      atual.faturamento += i.precoUnit * i.quantidade;
      porCategoria.set(nome, atual);
    }
    const produtosPorCategoria = [...porCategoria.entries()].map(([categoria, v]) => ({
      categoria: categoria.replace("Pizzas ", "Pizzas · ").replace("Pizzas · salgadas", "Pizzas salgadas").replace("Pizzas · doces", "Pizzas doces"),
      itens: v.itens,
      faturamento: arredondar(v.faturamento),
      cor: CORES_CATEGORIAS[categoria] ?? "#C2BCB2",
    }));

    const porProduto = new Map<string, { categoria: string; vendas: number; faturamento: number }>();
    for (const i of itens) {
      const atual = porProduto.get(i.nome) ?? { categoria: i.produto?.categoria.nome ?? "Outros", vendas: 0, faturamento: 0 };
      atual.vendas += i.quantidade;
      atual.faturamento += i.precoUnit * i.quantidade;
      porProduto.set(i.nome, atual);
    }
    const topProdutosPeriodo = [...porProduto.entries()]
      .map(([nome, v]) => ({ nome, categoria: v.categoria.replace("Pizzas salgadas", "Pizzas").replace("Pizzas doces", "Pizzas"), vendas: v.vendas, faturamento: arredondar(v.faturamento) }))
      .sort((a, b) => b.faturamento - a.faturamento)
      .slice(0, 6);

    return NextResponse.json({
      resumo: [
        { label: "Itens vendidos", valor: String(itensVendidos), tendencia: pct(itensVendidos, 0) },
        { label: "Faturamento", valor: brl(fat), tendencia: pct(fat, 0) },
        { label: "Ticket por item", valor: brl(ticketItem), hint: "faturamento ÷ itens" },
        { label: "Categorias ativas", valor: String(porCategoria.size), hint: "com vendas nos últimos 14 dias" },
      ],
      produtosPorCategoria,
      topProdutosPeriodo,
    });
  }

  /* --------------------------- Entregadores --------------------------- */
  const [entregadores, entregas] = await Promise.all([
    prisma.entregador.findMany({ where: { empresaId }, include: { _count: { select: { entregas: true } } } }),
    prisma.entrega.findMany({
      where: { empresaId, criadoEm: { gte: ha7Dias } },
      include: { entregador: true },
    }),
  ]);

  const ativos = entregadores.filter((e) => e.ativo).length;
  const kmTotal = entregas.reduce((acc, e) => acc + e.km, 0);
  const avaliacao = entregadores.length ? entregadores.reduce((acc, e) => acc + e.avaliacao, 0) / entregadores.length : 0;

  const porEntregador = new Map<string, { entregas: number; km: number; gorjetas: number; tempos: number[] }>();
  for (const e of entregas) {
    if (!e.entregador) continue;
    // Chave por ID, não por nome — dois entregadores com nome igual/
    // parecido não podem ter seus números somados juntos no relatório.
    const atual = porEntregador.get(e.entregador.id) ?? { entregas: 0, km: 0, gorjetas: 0, tempos: [] };
    atual.entregas += 1;
    atual.km += e.km;
    atual.gorjetas += e.gorjeta;
    if (e.concluidaEm && e.iniciadaEm) {
      atual.tempos.push(Math.max(0, Math.round((e.concluidaEm.getTime() - e.iniciadaEm.getTime()) / 60000)));
    }
    porEntregador.set(e.entregador.id, atual);
  }
  const ranking = entregadores
    .map((e) => {
      const v = porEntregador.get(e.id) ?? { entregas: 0, km: 0, gorjetas: 0, tempos: [] };
      return {
        id: e.id,
        usuarioId: e.usuarioId,
        nome: e.nome,
        entregas: v.entregas,
        km: Math.round(v.km),
        tempoMedio: v.tempos.length ? Math.round(v.tempos.reduce((a, b) => a + b, 0) / v.tempos.length) : null,
        gorjetas: arredondar(v.gorjetas),
        avaliacao: e.avaliacao,
        status: e.statusHoje as "ativo" | "rota" | "folga",
      };
    })
    .sort((a, b) => b.entregas - a.entregas);

  const rankingDoUsuario =
    acesso.usuario.papel === "ENTREGADOR"
      ? ranking.filter((r) => r.usuarioId === acesso.usuario.id)
      : ranking;
  const linha = rankingDoUsuario[0];

  return NextResponse.json({
    resumo: [
      { label: "Entregadores", valor: String(ativos), hint: "cadastrados e ativos" },
      { label: "Entregas", valor: String(entregas.length), tendencia: pct(entregas.length, 0) },
      { label: "Distância rodada", valor: `${Math.round(kmTotal)} km`, tendencia: pct(kmTotal, 0) },
      { label: "Avaliação média", valor: avaliacao.toFixed(1).replace(".", ","), hint: "notas dadas pelos clientes" },
    ],
    ranking: rankingDoUsuario,
    eu: linha ?? null,
  });
}

export const GET = comTratamentoDeErro("relatorios.GET", GETTenant);

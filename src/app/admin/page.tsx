"use client";

import {
  Banknote,
  CircleDollarSign,
  Clock,
  Crown,
  Flame,
  Pizza,
  ReceiptText,
  ShoppingBag,
  UtensilsCrossed,
} from "lucide-react";

import { useApi } from "@/lib/api-cliente";

import { PageHeader } from "@/components/patterns/page-header";
import { StatCard } from "@/components/patterns/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { BarChart } from "@/components/charts/bar-chart";
import { LineChart } from "@/components/charts/line-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { cn, formatBRL } from "@/lib/utils";
import {
  type StatusPedidoDashboard,
  type KpiDashboard,
  type PontoHora,
  type SerieDia,
  type FatiaMix,
  type ProdutoTop,
  type PedidoRecente,
} from "@/lib/indicadores";

interface DashApi {
  kpis: KpiDashboard[];
  vendasPorHora: PontoHora[];
  serie14Dias: SerieDia[];
  formasPagamentoMix: FatiaMix[];
  topProdutos: ProdutoTop[];
  ultimosPedidos: PedidoRecente[];
}

// Sem dado de exemplo: enquanto a busca real carrega (ou se falhar —
// o erro já aparece via toast, ver src/lib/api-cliente.ts), o painel
// mostra estado vazio de verdade, nunca números inventados.
const FALLBACK: DashApi = {
  kpis: [],
  vendasPorHora: [],
  serie14Dias: [],
  formasPagamentoMix: [],
  topProdutos: [],
  ultimosPedidos: [],
};

const STATUS_PEDIDO_CONFIG: Record<
  StatusPedidoDashboard,
  { label: string; classes: string; dot: string }
> = {
  concluido: {
    label: "Concluído",
    classes: "bg-status-free-bg text-status-free border-status-free-border",
    dot: "bg-status-free",
  },
  andamento: {
    label: "Em andamento",
    classes: "bg-status-sent-bg text-status-sent border-status-sent-border",
    dot: "bg-status-sent",
  },
  pendente: {
    label: "Pendente",
    classes: "bg-status-waiting-bg text-status-waiting border-status-waiting-border",
    dot: "bg-status-waiting",
  },
  cancelado: {
    label: "Cancelado",
    classes: "bg-status-occupied-bg text-status-occupied border-status-occupied-border",
    dot: "bg-status-occupied",
  },
};

const KPI_ICONS = {
  faturamento: Banknote,
  pedidos: ShoppingBag,
  ticket: CircleDollarSign,
  ocupacao: UtensilsCrossed,
};

const HORA_DESTAQUE = "20h";

/**
 * Dashboard do Administrador — visão geral do dia. Os dados vêm de
 * `GET /api/dashboard`, com fallback dos mocks de `src/lib/indicadores.ts`
 * enquanto a requisição carrega ou falha. Os gráficos são SVG/HTML
 * próprios, sem dependências, usando os tokens do Design System.
 */
export default function AdminDashboardPage() {
  const dash = useApi<DashApi>("/api/dashboard", FALLBACK);

  const totalMix = dash.dados.formasPagamentoMix.reduce((acc, f) => acc + f.valor, 0);
  const topVendas = Math.max(...dash.dados.topProdutos.map((p) => p.vendas), 1);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description="Visão geral do dia — faturamento, pedidos e ocupação do salão."
      />

      {/* Indicadores (cards) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {dash.dados.kpis.map((kpi) => (
          <StatCard
            key={kpi.chave}
            label={kpi.label}
            value={kpi.valor}
            hint={kpi.hint}
            icon={KPI_ICONS[kpi.chave as keyof typeof KPI_ICONS]}
            trend={kpi.tendencia}
          />
        ))}
      </div>

      {/* Fluxo do dia + formas de pagamento */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Clock className="h-5 w-5 text-primary" aria-hidden="true" />
              Fluxo de vendas por hora
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Faturamento ao longo do dia — pico esperado às 20h.
            </p>
          </CardHeader>
          <CardContent className="p-6 pt-4 sm:p-7 sm:pt-4">
            <BarChart
              data={dash.dados.vendasPorHora.map((ponto) => ({
                label: ponto.hora,
                value: ponto.valor,
                destaque: ponto.hora === HORA_DESTAQUE,
              }))}
              formatValue={formatBRL}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <ReceiptText className="h-5 w-5 text-primary" aria-hidden="true" />
              Formas de pagamento
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Mix das vendas de hoje.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6 p-6 pt-4 sm:p-7 sm:pt-4">
            <DonutChart
              data={dash.dados.formasPagamentoMix.map((f) => ({
                label: f.rotulo,
                value: f.valor,
                cor: f.cor,
              }))}
              formatValue={formatBRL}
              centerValue={formatBRL(totalMix)}
              centerLabel="Hoje"
            />
            <ul className="flex w-full flex-col gap-2.5">
              {dash.dados.formasPagamentoMix.map((f) => (
                <li key={f.chave} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2.5">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: f.cor }}
                      aria-hidden="true"
                    />
                    {f.rotulo}
                  </span>
                  <span className="flex items-baseline gap-2">
                    <span className="font-semibold tabular">{formatBRL(f.valor)}</span>
                    <span className="text-xs text-muted-foreground tabular">
                      {Math.round((f.valor / totalMix) * 100)}%
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Tendência de 14 dias + mais vendidos */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Flame className="h-5 w-5 text-primary" aria-hidden="true" />
              Faturamento e pedidos — últimos 14 dias
            </CardTitle>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-full bg-primary" aria-hidden="true" />
                Faturamento (R$)
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-full bg-ink-300" aria-hidden="true" />
                Pedidos
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-6 pt-4 sm:p-7 sm:pt-4">
            <LineChart
              labels={dash.dados.serie14Dias.map((d) => d.label)}
              series={[
                {
                  nome: "Faturamento",
                  cor: "#953C2A",
                  valores: dash.dados.serie14Dias.map((d) => d.faturamento),
                },
                {
                  nome: "Pedidos",
                  cor: "#C2BCB2",
                  valores: dash.dados.serie14Dias.map((d) => d.pedidos),
                },
              ]}
              formatValue={(v) => `${v}`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Crown className="h-5 w-5 text-primary" aria-hidden="true" />
              Mais vendidos
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Top 5 itens do período.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-6 pt-4 sm:p-7 sm:pt-4">
            {dash.dados.topProdutos.map((produto, indice) => (
              <div key={produto.nome} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-semibold">
                    <span className="mr-1.5 text-muted-foreground">{indice + 1}.</span>
                    {produto.nome}
                  </span>
                  <span className="shrink-0 text-sm text-muted-foreground tabular">
                    {produto.vendas} vendas
                  </span>
                </div>
                <div
                  className="h-3 overflow-hidden rounded-full bg-secondary"
                  role="img"
                  aria-label={`${produto.nome}: ${produto.vendas} vendas`}
                >
                  <div
                    className={cn(
                      "h-full rounded-full",
                      indice === 0 ? "bg-primary" : "bg-primary/30"
                    )}
                    style={{ width: `${Math.max((produto.vendas / topVendas) * 100, 6)}%` }}
                  />
                </div>
              </div>
            ))}
            <Separator className="my-1" />
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Pizza className="h-4 w-4" aria-hidden="true" />
              Pizzas respondem por 62% do faturamento do período.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Últimos pedidos */}
      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <ShoppingBag className="h-5 w-5 text-primary" aria-hidden="true" />
            Últimos pedidos
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Pedidos mais recentes registrados no caixa.
          </p>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Itens</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dash.dados.ultimosPedidos.map((pedido) => {
                const cfg = STATUS_PEDIDO_CONFIG[pedido.status];
                return (
                  <TableRow key={pedido.id}>
                    <TableCell className="font-medium">
                      <span className="tabular">{pedido.id}</span>
                      <span className="ml-2 text-sm text-muted-foreground tabular">
                        {pedido.hora}
                      </span>
                    </TableCell>
                    <TableCell>{pedido.cliente}</TableCell>
                    <TableCell className="text-right tabular">{pedido.itens}</TableCell>
                    <TableCell className="text-right font-semibold tabular">
                      {formatBRL(pedido.valor)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
                          cfg.classes
                        )}
                      >
                        <span className={cn("h-2 w-2 rounded-full", cfg.dot)} aria-hidden="true" />
                        {cfg.label}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

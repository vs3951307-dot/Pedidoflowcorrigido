"use client";

import { Banknote, CircleDollarSign, MapPin, ShoppingBag, Timer } from "lucide-react";

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
import { LineChart } from "@/components/charts/line-chart";
import { cn, formatBRL } from "@/lib/utils";
import { useApi } from "@/lib/api-cliente";
import { usePeriodoRelatorio } from "../_lib/periodo-context";
import {
  RESUMO_DELIVERY,
  ENTREGAS_POR_DIA,
  ENTREGAS_POR_BAIRRO,
  ULTIMAS_ENTREGAS,
  type StatusEntrega,
  type ResumoRelatorio,
  type EntregaDia,
  type EntregaBairro,
  type EntregaRecente,
} from "@/lib/relatorios";

const STATUS_ENTREGA_CONFIG: Record<StatusEntrega, { label: string; classes: string; dot: string }> =
  {
    entregue: {
      label: "Entregue",
      classes: "bg-status-free-bg text-status-free border-status-free-border",
      dot: "bg-status-free",
    },
    rota: {
      label: "Em rota",
      classes: "bg-status-sent-bg text-status-sent border-status-sent-border",
      dot: "bg-status-sent",
    },
    preparo: {
      label: "Em preparo",
      classes: "bg-status-waiting-bg text-status-waiting border-status-waiting-border",
      dot: "bg-status-waiting",
    },
  };

const RESUMO_ICONS = [ShoppingBag, Banknote, CircleDollarSign, Timer];

interface RelatorioDeliveryApi {
  resumo: ResumoRelatorio[];
  entregasPorDia: EntregaDia[];
  entregasPorBairro: EntregaBairro[];
  ultimasEntregas: EntregaRecente[];
}

const DELIVERY_FALLBACK: RelatorioDeliveryApi = {
  resumo: RESUMO_DELIVERY,
  entregasPorDia: ENTREGAS_POR_DIA,
  entregasPorBairro: ENTREGAS_POR_BAIRRO,
  ultimasEntregas: ULTIMAS_ENTREGAS,
};

/**
 * Relatório de Delivery — canal de vendas. Resumo, evolução por dia,
 * top bairros e últimas entregas. Os dados vêm de
 * `GET /api/relatorios?visao=delivery`, com fallback dos mocks de
 * `src/lib/relatorios.ts`.
 */
export function RelatorioDelivery() {
  const periodo = usePeriodoRelatorio();
  const dados = useApi<RelatorioDeliveryApi>(`/api/relatorios?visao=delivery&periodo=${periodo}`, DELIVERY_FALLBACK);

  const { resumo, entregasPorDia, entregasPorBairro, ultimasEntregas } = dados.dados;

  const totalBairros = entregasPorBairro.reduce((acc, b) => acc + b.valor, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {resumo.map((metrica, i) => (
          <StatCard
            key={metrica.label}
            label={metrica.label}
            value={metrica.valor}
            hint={metrica.hint}
            icon={RESUMO_ICONS[i]}
            trend={metrica.tendencia}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <ShoppingBag className="h-5 w-5 text-primary" aria-hidden="true" />
              Entregas por dia
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
              labels={entregasPorDia.map((d) => d.dia)}
              series={[
                {
                  nome: "Faturamento",
                  cor: "#953C2A",
                  valores: entregasPorDia.map((d) => d.valor),
                },
                {
                  nome: "Pedidos",
                  cor: "#C2BCB2",
                  valores: entregasPorDia.map((d) => d.pedidos),
                },
              ]}
              formatValue={(v) => `${v}`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <MapPin className="h-5 w-5 text-primary" aria-hidden="true" />
              Top bairros
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Onde as entregas mais rendem.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-6 pt-4 sm:p-7 sm:pt-4">
            {entregasPorBairro.map((bairro, indice) => (
              <div key={bairro.bairro} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-semibold">
                    <span className="mr-1.5 text-muted-foreground">{indice + 1}.</span>
                    {bairro.bairro}
                  </span>
                  <span className="shrink-0 text-sm text-muted-foreground tabular">
                    {formatBRL(bairro.valor)}
                  </span>
                </div>
                <div
                  className="h-3 overflow-hidden rounded-full bg-secondary"
                  role="img"
                  aria-label={`${bairro.bairro}: ${formatBRL(bairro.valor)}`}
                >
                  <div
                    className={cn(
                      "h-full rounded-full",
                      indice === 0 ? "bg-primary" : "bg-primary/30"
                    )}
                    style={{ width: `${Math.max((bairro.valor / totalBairros) * 100, 6)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground tabular">
                  {bairro.pedidos} pedidos · {bairro.tempoMedio} min médios
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Timer className="h-5 w-5 text-primary" aria-hidden="true" />
            Últimas entregas
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Pedidos de delivery mais recentes.
          </p>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Bairro</TableHead>
                <TableHead>Entregador</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ultimasEntregas.map((entrega) => {
                const cfg = STATUS_ENTREGA_CONFIG[entrega.status];
                return (
                  <TableRow key={entrega.id}>
                    <TableCell className="font-medium">
                      <span className="tabular">{entrega.id}</span>
                      <span className="ml-2 text-sm text-muted-foreground tabular">
                        {entrega.hora}
                      </span>
                    </TableCell>
                    <TableCell>{entrega.cliente}</TableCell>
                    <TableCell>{entrega.bairro}</TableCell>
                    <TableCell>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          `${entrega.endereco}, ${entrega.bairro}`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Abrir ${entrega.endereco}, ${entrega.bairro} no Google Maps`}
                        className="inline-flex items-center gap-1 font-medium text-primary hover:underline underline-offset-4"
                      >
                        <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                        {entrega.entregador}
                      </a>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular">
                      {formatBRL(entrega.valor)}
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

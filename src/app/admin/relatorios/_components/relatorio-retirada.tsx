"use client";

import { Banknote, CircleDollarSign, PackageCheck, Timer } from "lucide-react";

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
import { BarChart } from "@/components/charts/bar-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { cn, formatBRL } from "@/lib/utils";
import { useApi } from "@/lib/api-cliente";
import { usePeriodoRelatorio } from "../_lib/periodo-context";
import {
  RESUMO_RETIRADA,
  RETIRADAS_POR_DIA,
  RETIRADAS_STATUS,
  ULTIMAS_RETIRADAS,
  type StatusRetirada,
  type ResumoRelatorio,
  type RetiradaDia,
  type RetiradaRecente,
} from "@/lib/relatorios";

const STATUS_RETIRADA_CONFIG: Record<
  StatusRetirada,
  { label: string; classes: string; dot: string }
> = {
  retirada: {
    label: "Retirada",
    classes: "bg-status-sent-bg text-status-sent border-status-sent-border",
    dot: "bg-status-sent",
  },
  pronta: {
    label: "Pronta",
    classes: "bg-status-free-bg text-status-free border-status-free-border",
    dot: "bg-status-free",
  },
  preparo: {
    label: "Em preparo",
    classes: "bg-status-waiting-bg text-status-waiting border-status-waiting-border",
    dot: "bg-status-waiting",
  },
  cancelada: {
    label: "Cancelada",
    classes: "bg-status-occupied-bg text-status-occupied border-status-occupied-border",
    dot: "bg-status-occupied",
  },
};

const RESUMO_ICONS = [PackageCheck, Banknote, CircleDollarSign, Timer];

interface RelatorioRetiradaApi {
  resumo: ResumoRelatorio[];
  retiradasPorDia: RetiradaDia[];
  retiradasStatus: { chave: string; rotulo: string; valor: number; cor: string }[];
  ultimasRetiradas: RetiradaRecente[];
}

const RETIRADA_FALLBACK: RelatorioRetiradaApi = {
  resumo: RESUMO_RETIRADA,
  retiradasPorDia: RETIRADAS_POR_DIA,
  retiradasStatus: RETIRADAS_STATUS,
  ultimasRetiradas: ULTIMAS_RETIRADAS,
};

/**
 * Relatório de Retirada — canal de retirada no balcão. Resumo,
 * movimento por dia, status das retiradas e últimas retiradas. Os dados
 * vêm de `GET /api/relatorios?visao=retirada`, com fallback dos mocks de
 * `src/lib/relatorios.ts`.
 */
export function RelatorioRetirada() {
  const periodo = usePeriodoRelatorio();
  const dados = useApi<RelatorioRetiradaApi>(`/api/relatorios?visao=retirada&periodo=${periodo}`, RETIRADA_FALLBACK);

  const { resumo, retiradasPorDia, retiradasStatus, ultimasRetiradas } = dados.dados;

  const totalStatus = retiradasStatus.reduce((acc, s) => acc + s.valor, 0);

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
              <PackageCheck className="h-5 w-5 text-primary" aria-hidden="true" />
              Retiradas por dia
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Faturamento de retirada ao longo da semana — sábado é o pico.
            </p>
          </CardHeader>
          <CardContent className="p-6 pt-4 sm:p-7 sm:pt-4">
            <BarChart
              data={retiradasPorDia.map((dia) => ({
                label: dia.dia,
                value: dia.valor,
                destaque: dia.dia === "Sáb 01",
              }))}
              formatValue={formatBRL}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <CircleDollarSign className="h-5 w-5 text-primary" aria-hidden="true" />
              Status das retiradas
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Situação dos pedidos de retirada no período.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6 p-6 pt-4 sm:p-7 sm:pt-4">
            <DonutChart
              data={retiradasStatus.map((s) => ({ label: s.rotulo, value: s.valor, cor: s.cor }))}
              formatValue={(v) => `${v} pedidos`}
              centerValue={`${totalStatus}`}
              centerLabel="pedidos"
            />
            <ul className="flex w-full flex-col gap-2.5">
              {retiradasStatus.map((s) => (
                <li key={s.chave} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2.5">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: s.cor }}
                      aria-hidden="true"
                    />
                    {s.rotulo}
                  </span>
                  <span className="flex items-baseline gap-2">
                    <span className="font-semibold tabular">{s.valor}</span>
                    <span className="text-xs text-muted-foreground tabular">
                      {Math.round((s.valor / totalStatus) * 100)}%
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Timer className="h-5 w-5 text-primary" aria-hidden="true" />
            Últimas retiradas
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Pedidos de retirada mais recentes.
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
                <TableHead className="text-right">Preparo</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ultimasRetiradas.map((retirada) => {
                const cfg = STATUS_RETIRADA_CONFIG[retirada.status];
                return (
                  <TableRow key={retirada.id}>
                    <TableCell className="font-medium">
                      <span className="tabular">{retirada.id}</span>
                      <span className="ml-2 text-sm text-muted-foreground tabular">
                        {retirada.hora}
                      </span>
                    </TableCell>
                    <TableCell>{retirada.cliente}</TableCell>
                    <TableCell className="text-right tabular">{retirada.itens}</TableCell>
                    <TableCell className="text-right font-semibold tabular">
                      {formatBRL(retirada.valor)}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {retirada.tempoPreparo === null ? "—" : `${retirada.tempoPreparo} min`}
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

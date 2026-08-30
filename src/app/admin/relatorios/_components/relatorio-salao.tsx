"use client";

import { Banknote, CircleDollarSign, LayoutGrid, UtensilsCrossed } from "lucide-react";

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
  RESUMO_SALAO,
  SALAO_VENDAS_POR_HORARIO,
  OCUPACAO_SALAO,
  SALAO_MESAS,
  type StatusMesaRelatorio,
  type ResumoRelatorio,
  type MesaDesempenho,
} from "@/lib/relatorios";

const STATUS_MESA_CONFIG: Record<
  StatusMesaRelatorio,
  { label: string; classes: string; dot: string }
> = {
  ocupada: {
    label: "Ocupada",
    classes: "bg-status-sent-bg text-status-sent border-status-sent-border",
    dot: "bg-status-sent",
  },
  livre: {
    label: "Livre",
    classes: "bg-status-free-bg text-status-free border-status-free-border",
    dot: "bg-status-free",
  },
  reservada: {
    label: "Reservada",
    classes: "bg-status-waiting-bg text-status-waiting border-status-waiting-border",
    dot: "bg-status-waiting",
  },
};

const RESUMO_ICONS = [Banknote, UtensilsCrossed, CircleDollarSign, LayoutGrid];

interface RelatorioSalaoApi {
  resumo: ResumoRelatorio[];
  vendasPorHorario: { hora: string; valor: number }[];
  ocupacaoSalao: { chave: string; rotulo: string; valor: number; cor: string }[];
  salaoMesas: MesaDesempenho[];
}

const SALAO_FALLBACK: RelatorioSalaoApi = {
  resumo: RESUMO_SALAO,
  vendasPorHorario: SALAO_VENDAS_POR_HORARIO,
  ocupacaoSalao: OCUPACAO_SALAO,
  salaoMesas: SALAO_MESAS,
};

/**
 * Relatório de Salão — canal presencial. Resumo, vendas por horário,
 * ocupação e desempenho por mesa. Os dados vêm de
 * `GET /api/relatorios?visao=salao`, com fallback dos mocks de
 * `src/lib/relatorios.ts`.
 */
export function RelatorioSalao() {
  const periodo = usePeriodoRelatorio();
  const dados = useApi<RelatorioSalaoApi>(`/api/relatorios?visao=salao&periodo=${periodo}`, SALAO_FALLBACK);

  const { resumo, vendasPorHorario, ocupacaoSalao, salaoMesas } = dados.dados;

  const totalOcupacao = ocupacaoSalao.reduce((acc, m) => acc + m.valor, 0);

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
              <UtensilsCrossed className="h-5 w-5 text-primary" aria-hidden="true" />
              Vendas do salão por horário
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Faturamento ao longo do dia — pico esperado às 20h.
            </p>
          </CardHeader>
          <CardContent className="p-6 pt-4 sm:p-7 sm:pt-4">
            <BarChart
              data={vendasPorHorario.map((ponto) => ({
                label: ponto.hora,
                value: ponto.valor,
                destaque: ponto.hora === "20h",
              }))}
              formatValue={formatBRL}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <LayoutGrid className="h-5 w-5 text-primary" aria-hidden="true" />
              Ocupação do salão
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Mesas em uso agora.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6 p-6 pt-4 sm:p-7 sm:pt-4">
            <DonutChart
              data={ocupacaoSalao.map((m) => ({ label: m.rotulo, value: m.valor, cor: m.cor }))}
              formatValue={(v) => `${v} mesas`}
              centerValue={`${ocupacaoSalao[0].valor} de ${totalOcupacao}`}
              centerLabel="em uso"
            />
            <ul className="flex w-full flex-col gap-2.5">
              {ocupacaoSalao.map((m) => (
                <li key={m.chave} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2.5">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: m.cor }}
                      aria-hidden="true"
                    />
                    {m.rotulo}
                  </span>
                  <span className="font-semibold tabular">{m.valor} mesas</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <LayoutGrid className="h-5 w-5 text-primary" aria-hidden="true" />
            Desempenho por mesa
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Mesas com maior movimento no período.
          </p>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mesa</TableHead>
                <TableHead className="text-right">Pedidos</TableHead>
                <TableHead className="text-right">Faturamento</TableHead>
                <TableHead className="text-right">Tempo médio</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salaoMesas.map((mesa) => {
                const cfg = STATUS_MESA_CONFIG[mesa.status];
                return (
                  <TableRow key={mesa.mesa}>
                    <TableCell className="font-medium">{mesa.mesa}</TableCell>
                    <TableCell className="text-right tabular">{mesa.pedidos}</TableCell>
                    <TableCell className="text-right font-semibold tabular">
                      {formatBRL(mesa.valor)}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {mesa.tempoMedio === null ? "—" : `${mesa.tempoMedio} min`}
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

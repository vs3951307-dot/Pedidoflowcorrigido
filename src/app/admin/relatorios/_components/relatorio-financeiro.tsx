"use client";

import { ArrowDownRight, ArrowUpRight, Banknote, Percent, PiggyBank, Wallet } from "lucide-react";

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
import { DonutChart } from "@/components/charts/donut-chart";
import { cn, formatBRL } from "@/lib/utils";
import { useApi } from "@/lib/api-cliente";
import { usePeriodoRelatorio } from "../_lib/periodo-context";
import {
  RESUMO_FINANCEIRO,
  FLUXO_14_DIAS,
  DESPESAS_POR_CATEGORIA,
  LANCAMENTOS,
  type ResumoRelatorio,
  type DiaFluxo,
  type CategoriaDespesa,
  type Lancamento,
} from "@/lib/relatorios";

const RESUMO_ICONS = [Banknote, Wallet, PiggyBank, Percent];

interface RelatorioFinanceiroApi {
  resumo: ResumoRelatorio[];
  fluxo14Dias: DiaFluxo[];
  despesasPorCategoria: CategoriaDespesa[];
  lancamentos: Lancamento[];
}

const FINANCEIRO_FALLBACK: RelatorioFinanceiroApi = {
  resumo: RESUMO_FINANCEIRO,
  fluxo14Dias: FLUXO_14_DIAS,
  despesasPorCategoria: DESPESAS_POR_CATEGORIA,
  lancamentos: LANCAMENTOS,
};

/**
 * Relatório Financeiro — saúde do caixa. Resumo, fluxo de 14 dias,
 * composição das despesas e lançamentos do período. Os dados vêm de
 * `GET /api/relatorios?visao=financeiro`, com fallback dos mocks de
 * `src/lib/relatorios.ts`.
 */
export function RelatorioFinanceiro() {
  const periodo = usePeriodoRelatorio();
  const dados = useApi<RelatorioFinanceiroApi>(
    `/api/relatorios?visao=financeiro&periodo=${periodo}`,
    FINANCEIRO_FALLBACK
  );

  const { resumo, fluxo14Dias, despesasPorCategoria, lancamentos } = dados.dados;

  const totalDespesas = despesasPorCategoria.reduce((acc, d) => acc + d.valor, 0);

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
              <PiggyBank className="h-5 w-5 text-primary" aria-hidden="true" />
              Fluxo de caixa — últimos 14 dias
            </CardTitle>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-full bg-primary" aria-hidden="true" />
                Receitas (R$)
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-full bg-ink-300" aria-hidden="true" />
                Despesas (R$)
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-6 pt-4 sm:p-7 sm:pt-4">
            <LineChart
              labels={fluxo14Dias.map((d) => d.label)}
              series={[
                {
                  nome: "Receitas",
                  cor: "#953C2A",
                  valores: fluxo14Dias.map((d) => d.receitas),
                },
                {
                  nome: "Despesas",
                  cor: "#C2BCB2",
                  valores: fluxo14Dias.map((d) => d.despesas),
                },
              ]}
              formatValue={formatBRL}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Wallet className="h-5 w-5 text-primary" aria-hidden="true" />
              Despesas por categoria
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Para onde vai o dinheiro.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6 p-6 pt-4 sm:p-7 sm:pt-4">
            <DonutChart
              data={despesasPorCategoria.map((d) => ({
                label: d.categoria,
                value: d.valor,
                cor: d.cor,
              }))}
              formatValue={formatBRL}
              centerValue={formatBRL(totalDespesas)}
              centerLabel="despesas"
            />
            <ul className="flex w-full flex-col gap-2.5">
              {despesasPorCategoria.map((d) => (
                <li key={d.categoria} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2.5">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: d.cor }}
                      aria-hidden="true"
                    />
                    {d.categoria}
                  </span>
                  <span className="flex items-baseline gap-2">
                    <span className="font-semibold tabular">{formatBRL(d.valor)}</span>
                    <span className="text-xs text-muted-foreground tabular">
                      {Math.round((d.valor / totalDespesas) * 100)}%
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
            <Banknote className="h-5 w-5 text-primary" aria-hidden="true" />
            Lançamentos do período
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Movimentações registradas no caixa.
          </p>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lancamentos.map((lancamento) => {
                const entrada = lancamento.tipo === "entrada";
                return (
                  <TableRow key={`${lancamento.data}-${lancamento.descricao}`}>
                    <TableCell className="tabular">{lancamento.data}</TableCell>
                    <TableCell className="font-medium">{lancamento.descricao}</TableCell>
                    <TableCell className="text-muted-foreground">{lancamento.categoria}</TableCell>
                    <TableCell className="text-right">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 text-sm font-semibold",
                          entrada ? "text-status-free" : "text-status-occupied"
                        )}
                      >
                        {entrada ? (
                          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <ArrowDownRight className="h-4 w-4" aria-hidden="true" />
                        )}
                        {entrada ? "Entrada" : "Saída"}
                      </span>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-semibold tabular",
                        entrada ? "text-status-free" : "text-status-occupied"
                      )}
                    >
                      {entrada ? "+" : "−"} {formatBRL(lancamento.valor)}
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

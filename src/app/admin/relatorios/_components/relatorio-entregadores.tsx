"use client";

import { Bike, MapPin, ShoppingBag, Star } from "lucide-react";

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
import { cn, formatBRL } from "@/lib/utils";
import { useApi } from "@/lib/api-cliente";
import { usePeriodoRelatorio } from "../_lib/periodo-context";
import {
  RESUMO_ENTREGADORES,
  ENTREGADORES_RANKING,
  type StatusEntregador,
  type ResumoRelatorio,
  type EntregadorDesempenho,
} from "@/lib/relatorios";

const STATUS_ENTREGADOR_CONFIG: Record<
  StatusEntregador,
  { label: string; classes: string; dot: string }
> = {
  rota: {
    label: "Em rota",
    classes: "bg-status-sent-bg text-status-sent border-status-sent-border",
    dot: "bg-status-sent",
  },
  ativo: {
    label: "Ativo",
    classes: "bg-status-free-bg text-status-free border-status-free-border",
    dot: "bg-status-free",
  },
  folga: {
    label: "Folga",
    classes: "bg-status-waiting-bg text-status-waiting border-status-waiting-border",
    dot: "bg-status-waiting",
  },
};

const RESUMO_ICONS = [Bike, ShoppingBag, MapPin, Star];

interface RelatorioEntregadoresApi {
  resumo: ResumoRelatorio[];
  ranking: EntregadorDesempenho[];
}

const ENTREGADORES_FALLBACK: RelatorioEntregadoresApi = {
  resumo: RESUMO_ENTREGADORES,
  ranking: ENTREGADORES_RANKING,
};

/**
 * Relatório de Entregadores — desempenho individual da equipe de entrega.
 * Resumo, entregas por dia da semana, ranking e detalhamento por
 * entregador. Os dados vêm de `GET /api/relatorios?visao=entregadores`,
 * com fallback dos mocks de `src/lib/relatorios.ts`.
 */
export function RelatorioEntregadores() {
  const periodo = usePeriodoRelatorio();
  const dados = useApi<RelatorioEntregadoresApi>(
    `/api/relatorios?visao=entregadores&periodo=${periodo}`,
    ENTREGADORES_FALLBACK
  );

  const { resumo, ranking } = dados.dados;

  const totalEntregas = ranking.reduce((acc, e) => acc + e.entregas, 0);
  const totalGorjetas = ranking.reduce((acc, e) => acc + e.gorjetas, 0);
  const topEntregas = Math.max(...ranking.map((e) => e.entregas), 1);

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

      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Bike className="h-5 w-5 text-primary" aria-hidden="true" />
            Entregas por entregador
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Ricardo lidera o ranking do período.
          </p>
        </CardHeader>
        <CardContent className="p-6 pt-4 sm:p-7 sm:pt-4">
          <BarChart
            data={ranking.map((entregador, indice) => ({
              label: entregador.nome.split(" ")[0],
              value: entregador.entregas,
              destaque: indice === 0,
            }))}
            formatValue={(v) => `${v} entregas`}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <ShoppingBag className="h-5 w-5 text-primary" aria-hidden="true" />
            Ranking do período
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Desempenho individual — {totalEntregas} entregas e{" "}
            {formatBRL(totalGorjetas)} em gorjetas.
          </p>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-right">#</TableHead>
                <TableHead>Entregador</TableHead>
                <TableHead className="w-44">Entregas</TableHead>
                <TableHead className="text-right">Distância</TableHead>
                <TableHead className="text-right">Tempo médio</TableHead>
                <TableHead className="text-right">Gorjetas</TableHead>
                <TableHead className="text-right">Avaliação</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranking.map((entregador, indice) => {
                const cfg = STATUS_ENTREGADOR_CONFIG[entregador.status];
                return (
                  <TableRow key={entregador.nome}>
                    <TableCell className="text-right text-muted-foreground tabular">
                      {indice + 1}
                    </TableCell>
                    <TableCell className="font-medium">{entregador.nome}</TableCell>
                    <TableCell>
                      <div
                        className="flex items-center gap-3"
                        role="img"
                        aria-label={`${entregador.entregas} entregas`}
                      >
                        <div className="h-3 flex-1 overflow-hidden rounded-full bg-secondary">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              indice === 0 ? "bg-primary" : "bg-primary/30"
                            )}
                            style={{
                              width: `${Math.max((entregador.entregas / topEntregas) * 100, 6)}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm font-semibold tabular">{entregador.entregas}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular">{entregador.km} km</TableCell>
                    <TableCell className="text-right tabular">
                      {entregador.tempoMedio === null ? "—" : `${entregador.tempoMedio} min`}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {formatBRL(entregador.gorjetas)}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      <span className="inline-flex items-center gap-1 font-semibold">
                        <Star
                          className="h-4 w-4 fill-status-waiting text-status-waiting"
                          aria-hidden="true"
                        />
                        {entregador.avaliacao.toFixed(1).replace(".", ",")}
                      </span>
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

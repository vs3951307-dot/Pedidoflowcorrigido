"use client";

import { Banknote, Layers, Pizza, Tag } from "lucide-react";

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
import { DonutChart } from "@/components/charts/donut-chart";
import { cn, formatBRL } from "@/lib/utils";
import { useApi } from "@/lib/api-cliente";
import { usePeriodoRelatorio } from "../_lib/periodo-context";
import {
  RESUMO_PRODUTOS,
  PRODUTOS_POR_CATEGORIA,
  TOP_PRODUTOS_PERIODO,
  type ResumoRelatorio,
  type CategoriaProduto,
  type ProdutoPeriodo,
} from "@/lib/relatorios";

const RESUMO_ICONS = [Pizza, Banknote, Tag, Layers];

interface RelatorioProdutosApi {
  resumo: ResumoRelatorio[];
  produtosPorCategoria: CategoriaProduto[];
  topProdutosPeriodo: ProdutoPeriodo[];
}

const PRODUTOS_FALLBACK: RelatorioProdutosApi = {
  resumo: RESUMO_PRODUTOS,
  produtosPorCategoria: PRODUTOS_POR_CATEGORIA,
  topProdutosPeriodo: TOP_PRODUTOS_PERIODO,
};

/**
 * Relatório de Produtos — mix de vendas por item. Resumo, participação
 * por categoria, ranking de mais vendidos e detalhamento por produto.
 * Os dados vêm de `GET /api/relatorios?visao=produtos`, com fallback dos
 * mocks de `src/lib/relatorios.ts`.
 */
export function RelatorioProdutos() {
  const periodo = usePeriodoRelatorio();
  const dados = useApi<RelatorioProdutosApi>(`/api/relatorios?visao=produtos&periodo=${periodo}`, PRODUTOS_FALLBACK);

  const { resumo, produtosPorCategoria, topProdutosPeriodo } = dados.dados;

  const totalItens = produtosPorCategoria.reduce((acc, c) => acc + c.itens, 0);
  const totalFaturamento = produtosPorCategoria.reduce((acc, c) => acc + c.faturamento, 0);
  const topVendas = Math.max(...topProdutosPeriodo.map((p) => p.vendas), 1);

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
        <Card>
          <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Layers className="h-5 w-5 text-primary" aria-hidden="true" />
              Vendas por categoria
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Itens vendidos no período.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6 p-6 pt-4 sm:p-7 sm:pt-4">
            <DonutChart
              data={produtosPorCategoria.map((c) => ({
                label: c.categoria,
                value: c.itens,
                cor: c.cor,
              }))}
              formatValue={(v) => `${v} itens`}
              centerValue={`${totalItens}`}
              centerLabel="itens"
            />
            <ul className="flex w-full flex-col gap-2.5">
              {produtosPorCategoria.map((c) => (
                <li key={c.categoria} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2.5">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: c.cor }}
                      aria-hidden="true"
                    />
                    {c.categoria}
                  </span>
                  <span className="flex items-baseline gap-2">
                    <span className="font-semibold tabular">{c.itens} itens</span>
                    <span className="text-xs text-muted-foreground tabular">
                      {Math.round((c.itens / totalItens) * 100)}%
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Pizza className="h-5 w-5 text-primary" aria-hidden="true" />
              Mais vendidos do período
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Top 6 itens — líder em destaque.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-6 pt-4 sm:p-7 sm:pt-4">
              {topProdutosPeriodo.map((produto, indice) => (
              <div key={produto.nome} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-semibold">
                    <span className="mr-1.5 text-muted-foreground">{indice + 1}.</span>
                    {produto.nome}
                    <span className="ml-2 text-xs font-medium text-muted-foreground">
                      {produto.categoria}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm text-muted-foreground tabular">
                    {produto.vendas} vendas · {formatBRL(produto.faturamento)}
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
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Tag className="h-5 w-5 text-primary" aria-hidden="true" />
            Detalhamento por produto
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Vendas, faturamento e participação de cada item.
          </p>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Vendas</TableHead>
                <TableHead className="text-right">Faturamento</TableHead>
                <TableHead className="w-48">Participação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
            {topProdutosPeriodo.map((produto, indice) => (
                <TableRow key={produto.nome}>
                  <TableCell className="font-medium">{produto.nome}</TableCell>
                  <TableCell className="text-muted-foreground">{produto.categoria}</TableCell>
                  <TableCell className="text-right tabular">{produto.vendas}</TableCell>
                  <TableCell className="text-right font-semibold tabular">
                    {formatBRL(produto.faturamento)}
                  </TableCell>
                  <TableCell>
                    <div
                      className="flex items-center gap-3"
                      role="img"
                      aria-label={`${Math.round((produto.faturamento / totalFaturamento) * 100)}% do faturamento`}
                    >
                      <div className="h-3 flex-1 overflow-hidden rounded-full bg-secondary">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            indice === 0 ? "bg-primary" : "bg-primary/30"
                          )}
                          style={{
                            width: `${Math.max(
                              (produto.faturamento / totalFaturamento) * 100,
                              4
                            )}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground tabular">
                        {Math.round((produto.faturamento / totalFaturamento) * 100)}%
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

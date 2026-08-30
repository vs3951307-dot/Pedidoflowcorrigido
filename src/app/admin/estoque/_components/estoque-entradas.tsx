"use client";

import { PackagePlus } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { cn, formatBRL } from "@/lib/utils";
import { useApi } from "@/lib/api-cliente";
import { ENTRADAS_ESTOQUE, type StatusEntrada, type EntradaEstoque } from "@/lib/estoque";

interface MovimentacaoEntrada {
  id: string;
  produto: string;
  quantidade: number;
  unidade: string;
  fornecedor?: string;
  valor: number;
  responsavel?: string;
  criadoEm: string;
}

interface MovimentacoesApi {
  entradas: MovimentacaoEntrada[];
  saidas: unknown[];
}

const STATUS_ENTRADA_CONFIG: Record<StatusEntrada, { label: string; classes: string; dot: string }> =
  {
    recebido: {
      label: "Recebido",
      classes: "bg-status-free-bg text-status-free border-status-free-border",
      dot: "bg-status-free",
    },
    pendente: {
      label: "Pendente",
      classes: "bg-status-waiting-bg text-status-waiting border-status-waiting-border",
      dot: "bg-status-waiting",
    },
    cancelada: {
      label: "Cancelada",
      classes: "bg-status-occupied-bg text-status-occupied border-status-occupied-border",
      dot: "bg-status-occupied",
    },
  };

function formatarData(valor: string): string {
  const data = new Date(valor);
  if (!Number.isNaN(data.getTime())) {
    const dia = data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const hora = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return `${dia} · ${hora}`;
  }
  return valor;
}

/**
 * Aba Entrada — lançamentos de reposição de mercadoria. A confirmação
 * incrementa o estoque do produto; pendências ficam em alerta.
 * Dados de `GET /api/estoque/movimentacoes`, com fallback em
 * `src/lib/estoque.ts`.
 */
export function EstoqueEntradas() {
  const { dados } = useApi<MovimentacoesApi>("/api/estoque/movimentacoes", {
    entradas: ENTRADAS_ESTOQUE.map((entrada) => ({
      id: entrada.id,
      produto: entrada.produto,
      quantidade: entrada.quantidade,
      unidade: entrada.unidade,
      fornecedor: entrada.fornecedor,
      valor: entrada.valorTotal,
      responsavel: entrada.responsavel,
      criadoEm: entrada.data,
    })),
    saidas: [],
  });

  const entradas: EntradaEstoque[] = dados.entradas.map((entrada) => ({
    id: entrada.id,
    data: formatarData(entrada.criadoEm),
    produto: entrada.produto,
    quantidade: entrada.quantidade,
    unidade: entrada.unidade,
    fornecedor: entrada.fornecedor ?? "—",
    custoUnitario: entrada.quantidade > 0 ? entrada.valor / entrada.quantidade : 0,
    valorTotal: entrada.valor,
    responsavel: entrada.responsavel ?? "—",
    status: "recebido",
  }));

  return (
    <Card>
      <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
        <CardTitle className="flex items-center gap-2 text-xl">
          <PackagePlus className="h-5 w-5 text-primary" aria-hidden="true" />
          Entradas de mercadorias
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Reposições registradas — recebido, pendente ou cancelado.
        </p>
      </CardHeader>
      <CardContent className="p-0 sm:p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lançamento</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead className="text-right">Quantidade</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead className="text-right">Custo unit.</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entradas.map((entrada) => {
              const cfg = STATUS_ENTRADA_CONFIG[entrada.status];
              return (
                <TableRow key={entrada.id}>
                  <TableCell>
                    <span className="font-medium tabular">{entrada.id}</span>
                    <span className="ml-2 text-sm text-muted-foreground tabular">
                      {entrada.data}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">{entrada.produto}</TableCell>
                  <TableCell className="text-right tabular">
                    {entrada.quantidade} {entrada.unidade}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{entrada.fornecedor}</TableCell>
                  <TableCell className="text-right tabular">
                    {formatBRL(entrada.custoUnitario)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular">
                    {formatBRL(entrada.valorTotal)}
                  </TableCell>
                  <TableCell>{entrada.responsavel}</TableCell>
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
  );
}

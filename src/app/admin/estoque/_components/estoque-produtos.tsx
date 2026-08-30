"use client";

import * as React from "react";
import { toast } from "sonner";
import { Boxes, Pencil, PackageSearch, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { api, useApi } from "@/lib/api-cliente";
import {
  RESUMO_ESTOQUE,
  PRODUTOS_ESTOQUE,
  VALOR_POR_CATEGORIA,
  type StatusEstoque,
  type ProdutoEstoque,
} from "@/lib/estoque";

interface ProdutoEstoqueApi extends ProdutoEstoque {
  status?: StatusEstoque;
}

interface CategoriaApi {
  categoria: string;
  valor: number;
  cor?: string;
}

interface RespostaEstoque {
  resumo: unknown;
  produtos: ProdutoEstoqueApi[];
  valorPorCategoria: CategoriaApi[];
}

const CORES_CATEGORIA = ["#953C2A", "#3459B4", "#6E4FA6", "#2E8B57"];

const STATUS_ESTOQUE_CONFIG: Record<StatusEstoque, { label: string; classes: string; dot: string }> =
  {
    ok: {
      label: "Em dia",
      classes: "bg-status-free-bg text-status-free border-status-free-border",
      dot: "bg-status-free",
    },
    baixo: {
      label: "Abaixo do mínimo",
      classes: "bg-status-waiting-bg text-status-waiting border-status-waiting-border",
      dot: "bg-status-waiting",
    },
    esgotado: {
      label: "Esgotado",
      classes: "bg-status-occupied-bg text-status-occupied border-status-occupied-border",
      dot: "bg-status-occupied",
    },
  };

const COR_BARRA: Record<StatusEstoque, string> = {
  ok: "#2E8B57",
  baixo: "#B8790F",
  esgotado: "#B23B2E",
};

function statusDoProduto(estoque: number, minimo: number): StatusEstoque {
  if (estoque === 0) return "esgotado";
  if (estoque <= minimo) return "baixo";
  return "ok";
}

interface FormularioEstoque {
  nome: string;
  categoria: string;
  unidade: string;
  minimo: string;
  custoUnitario: string;
}

function paraFormulario(produto: ProdutoEstoqueApi): FormularioEstoque {
  return {
    nome: produto.nome,
    categoria: produto.categoria,
    unidade: produto.unidade,
    minimo: String(produto.minimo),
    custoUnitario: produto.custoUnitario.toFixed(2).replace(".", ","),
  };
}

function interpretarNumero(texto: string): number | null {
  const normalizado = texto.trim().replace(/\./g, "").replace(",", ".");
  const valor = Number(normalizado);
  return Number.isFinite(valor) && valor >= 0 ? valor : null;
}

/**
 * Aba Produtos — inventário monitorado. Valor em estoque por categoria
 * (rosca), tabela com nível de estoque, e agora edição, ativar/desativar
 * e exclusão segura (antes só existia leitura — nem editar um cadastro
 * com erro de digitação era possível).
 * Dados de `GET /api/estoque`, com fallback em `src/lib/estoque.ts`.
 */
export function EstoqueProdutos() {
  const { dados, recarregar } = useApi<RespostaEstoque>("/api/estoque", {
    resumo: RESUMO_ESTOQUE,
    produtos: PRODUTOS_ESTOQUE,
    valorPorCategoria: VALOR_POR_CATEGORIA,
  });

  const [editando, setEditando] = React.useState<ProdutoEstoqueApi | null>(null);
  const [formulario, setFormulario] = React.useState<FormularioEstoque | null>(null);
  const [enviando, setEnviando] = React.useState(false);
  const [excluindo, setExcluindo] = React.useState<ProdutoEstoqueApi | null>(null);

  const valorPorCategoria: (CategoriaApi & { cor: string })[] = dados.valorPorCategoria.map((c, i) => ({
    ...c,
    cor: c.cor ?? CORES_CATEGORIA[i % CORES_CATEGORIA.length],
  }));
  const totalValor = valorPorCategoria.reduce((acc, c) => acc + c.valor, 0);

  function abrirEdicao(produto: ProdutoEstoqueApi) {
    setEditando(produto);
    setFormulario(paraFormulario(produto));
  }

  async function salvarEdicao() {
    if (!editando || !formulario) return;
    const minimo = interpretarNumero(formulario.minimo);
    const custoUnitario = interpretarNumero(formulario.custoUnitario);
    if (!formulario.nome.trim() || !formulario.categoria.trim() || !formulario.unidade.trim()) {
      toast.error("Preencha nome, categoria e unidade.");
      return;
    }
    if (minimo === null) {
      toast.error("Informe um estoque mínimo válido.");
      return;
    }
    if (custoUnitario === null) {
      toast.error("Informe um custo unitário válido.");
      return;
    }

    setEnviando(true);
    try {
      await api(`/api/estoque/${editando.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          nome: formulario.nome.trim(),
          categoria: formulario.categoria.trim(),
          unidade: formulario.unidade.trim(),
          minimo,
          custoUnitario,
        }),
      });
      toast.success(`"${formulario.nome.trim()}" atualizado.`);
      setEditando(null);
      recarregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar.");
    } finally {
      setEnviando(false);
    }
  }

  async function alternarAtivo(produto: ProdutoEstoqueApi) {
    try {
      await api(`/api/estoque/${produto.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ativo: !produto.ativo }),
      });
      toast.success(produto.ativo ? `"${produto.nome}" desativado.` : `"${produto.nome}" ativado.`);
      recarregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível alterar a situação.");
    }
  }

  async function confirmarExclusao() {
    if (!excluindo) return;
    try {
      await api(`/api/estoque/${excluindo.id}`, { method: "DELETE" });
      toast.success(`"${excluindo.nome}" excluído.`);
      setExcluindo(null);
      recarregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível excluir.");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Boxes className="h-5 w-5 text-primary" aria-hidden="true" />
            Valor em estoque por categoria
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Custo das mercadorias disponíveis.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6 p-6 pt-4 sm:p-7 sm:pt-4">
          {valorPorCategoria.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sem itens cadastrados ainda.
            </p>
          ) : (
            <>
              <DonutChart
                data={valorPorCategoria.map((c) => ({ label: c.categoria, value: c.valor, cor: c.cor }))}
                formatValue={formatBRL}
                centerValue={formatBRL(totalValor)}
                centerLabel="em estoque"
              />
              <ul className="flex w-full flex-col gap-2.5">
                {valorPorCategoria.map((c) => (
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
                      <span className="font-semibold tabular">{formatBRL(c.valor)}</span>
                      <span className="text-xs text-muted-foreground tabular">
                        {totalValor > 0 ? Math.round((c.valor / totalValor) * 100) : 0}%
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <PackageSearch className="h-5 w-5 text-primary" aria-hidden="true" />
            Produtos monitorados
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Nível atual versus ponto de reposição.
          </p>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          {dados.produtos.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground sm:px-7">
              Nenhum item de estoque cadastrado ainda. Use "Nova entrada" para começar.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="w-56">Estoque</TableHead>
                  <TableHead className="text-right">Mínimo</TableHead>
                  <TableHead className="text-right">Custo unit.</TableHead>
                  <TableHead className="text-right">Em estoque</TableHead>
                  <TableHead className="text-right">Situação</TableHead>
                  <TableHead className="w-28 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dados.produtos.map((produto) => {
                  const status = produto.status ?? statusDoProduto(produto.estoque, produto.minimo);
                  const cfg = STATUS_ESTOQUE_CONFIG[status];
                  const referencia = Math.max(produto.minimo * 2, 1);
                  const largura = Math.min((produto.estoque / referencia) * 100, 100);
                  return (
                    <TableRow key={produto.id} className={cn(produto.ativo === false && "opacity-50")}>
                      <TableCell>
                        <span className="font-medium">{produto.nome}</span>
                        <span className="ml-2 text-sm text-muted-foreground">
                          {produto.categoria} · {produto.unidade}
                        </span>
                        {produto.ativo === false ? (
                          <span className="ml-2 inline-flex items-center rounded-full border border-status-occupied-border bg-status-occupied-bg px-2 py-0.5 text-[11px] font-semibold text-status-occupied">
                            Inativo
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-3 flex-1 overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full"
                              style={{ backgroundColor: COR_BARRA[status], width: `${largura}%` }}
                            />
                          </div>
                          <span className="text-sm font-semibold tabular">
                            {produto.estoque} {produto.unidade}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular">
                        {produto.minimo} {produto.unidade}
                      </TableCell>
                      <TableCell className="text-right tabular">
                        {formatBRL(produto.custoUnitario)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular">
                        {formatBRL(produto.estoque * produto.custoUnitario)}
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
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => abrirEdicao(produto)}>
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title={produto.ativo === false ? "Ativar" : "Desativar"}
                            onClick={() => alternarAtivo(produto)}
                          >
                            {produto.ativo === false ? "Ativar" : "Desativar"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setExcluindo(produto)}>
                            <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editando} onOpenChange={(aberto) => !aberto && setEditando(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar "{editando?.nome}"</DialogTitle>
            <DialogDescription>Corrige o cadastro sem afetar o histórico de movimentações.</DialogDescription>
          </DialogHeader>
          {formulario ? (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ed-nome">Nome</Label>
                  <Input
                    id="ed-nome"
                    value={formulario.nome}
                    onChange={(e) => setFormulario({ ...formulario, nome: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ed-categoria">Categoria</Label>
                  <Input
                    id="ed-categoria"
                    value={formulario.categoria}
                    onChange={(e) => setFormulario({ ...formulario, categoria: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ed-unidade">Unidade</Label>
                  <Input
                    id="ed-unidade"
                    value={formulario.unidade}
                    onChange={(e) => setFormulario({ ...formulario, unidade: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ed-minimo">Mínimo</Label>
                  <Input
                    id="ed-minimo"
                    inputMode="decimal"
                    value={formulario.minimo}
                    onChange={(e) => setFormulario({ ...formulario, minimo: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ed-custo">Custo (R$)</Label>
                  <Input
                    id="ed-custo"
                    inputMode="decimal"
                    value={formulario.custoUnitario}
                    onChange={(e) => setFormulario({ ...formulario, custoUnitario: e.target.value })}
                  />
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditando(null)} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={salvarEdicao} disabled={enviando}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!excluindo} onOpenChange={(aberto) => !aberto && setExcluindo(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir "{excluindo?.nome}"?</DialogTitle>
            <DialogDescription>
              Só é possível excluir itens sem nenhuma movimentação registrada. Se este item já teve
              entrada ou saída, use "Desativar" em vez de excluir.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExcluindo(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmarExclusao}>
              Sim, excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

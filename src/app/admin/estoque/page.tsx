"use client";

import * as React from "react";
import { toast } from "sonner";
import { Banknote, Boxes, FileText, Images, PackagePlus, TriangleAlert } from "lucide-react";

import { PageHeader } from "@/components/patterns/page-header";
import { StatCard } from "@/components/patterns/stat-card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, useApi } from "@/lib/api-cliente";
import { formatBRL } from "@/lib/utils";
import {
  RESUMO_ESTOQUE,
  PRODUTOS_ESTOQUE,
  VALOR_POR_CATEGORIA,
  type ProdutoEstoque,
  type CategoriaEstoque,
  type ResumoEstoque,
} from "@/lib/estoque";
import { EstoqueProdutos } from "./_components/estoque-produtos";
import { EstoqueEntradas } from "./_components/estoque-entradas";
import { EstoqueFotos } from "./_components/estoque-fotos";
import { EstoqueNotas } from "./_components/estoque-notas";

interface ResumoEstoqueApi {
  valorTotal: number;
  baixo: number;
  esgotados: number;
  itensTotais: number;
}

interface RespostaEstoque {
  resumo: ResumoEstoqueApi | ResumoEstoque[];
  produtos: ProdutoEstoque[];
  valorPorCategoria: CategoriaEstoque[];
}

const RESUMO_ICONS = [Banknote, TriangleAlert, Boxes, PackagePlus];

const ABAS = [
  { valor: "produtos", rotulo: "Produtos", icone: Boxes },
  { valor: "entrada", rotulo: "Entradas", icone: PackagePlus },
  { valor: "fotos", rotulo: "Fotos", icone: Images },
  { valor: "notas", rotulo: "Nota fiscal", icone: FileText },
];

/**
 * Estoque — produtos monitorados, entradas de mercadorias, fotos e notas
 * fiscais de entrada. Resumo do estoque fica sempre visível no topo.
 *
 * Upload de fotos e detalhe de nota fiscal de entrada ainda não têm tela
 * própria (ver cada aba) — cadastro de item e lançamento de entrada, que
 * eram os bloqueadores reais para usar o estoque, já estão nesta página.
 */
export default function EstoquePage() {
  const { dados, recarregar } = useApi<RespostaEstoque>("/api/estoque", {
    resumo: RESUMO_ESTOQUE,
    produtos: PRODUTOS_ESTOQUE,
    valorPorCategoria: VALOR_POR_CATEGORIA,
  });
  const [dialogoAberto, setDialogoAberto] = React.useState(false);
  const [tick, setTick] = React.useState(0);

  const resumo: ResumoEstoque[] = Array.isArray(dados.resumo)
    ? dados.resumo
    : [
        {
          label: "Valor em estoque",
          valor: formatBRL(dados.resumo.valorTotal),
          hint: "custo das mercadorias disponíveis",
        },
        {
          label: "Itens abaixo do mínimo",
          valor: String(dados.resumo.baixo),
          hint: "produtos em alerta de reposição",
        },
        {
          label: "Produtos esgotados",
          valor: String(dados.resumo.esgotados),
          hint: "sem estoque disponível",
        },
        {
          label: "Produtos monitorados",
          valor: String(dados.resumo.itensTotais),
          hint: "insumos, bebidas, embalagens e limpeza",
        },
      ];

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Estoque"
        description="Produtos monitorados, entradas, fotos e notas fiscais."
        actions={
          <Button onClick={() => setDialogoAberto(true)}>
            <PackagePlus className="h-4 w-4" aria-hidden="true" />
            Nova entrada
          </Button>
        }
      />

      <NovaEntradaDialog
        open={dialogoAberto}
        onOpenChange={setDialogoAberto}
        produtos={dados.produtos}
        aoConcluir={() => {
          recarregar();
          setTick((t) => t + 1);
        }}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

      <Tabs defaultValue="produtos">
        <TabsList className="h-auto w-full flex-wrap gap-1 rounded-xl p-1.5 sm:w-fit">
          {ABAS.map((aba) => {
            const Icon = aba.icone;
            return (
              <TabsTrigger key={aba.valor} value={aba.valor} className="gap-2 px-4 py-2">
                <Icon className="h-4 w-4" aria-hidden="true" />
                {aba.rotulo}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="produtos" className="mt-6">
          <EstoqueProdutos key={tick} />
        </TabsContent>
        <TabsContent value="entrada" className="mt-6">
          <EstoqueEntradas key={tick} />
        </TabsContent>
        <TabsContent value="fotos" className="mt-6">
          <EstoqueFotos />
        </TabsContent>
        <TabsContent value="notas" className="mt-6">
          <EstoqueNotas />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Interpreta "12,5" ou "12.5" como número; `null` se não for válido. */
function interpretarNumero(texto: string): number | null {
  const normalizado = texto.trim().replace(/\./g, "").replace(",", ".");
  const valor = Number(normalizado);
  return Number.isFinite(valor) && valor >= 0 ? valor : null;
}

/**
 * Diálogo de "Nova entrada": ou lança reposição de um item que já existe
 * (`POST /api/estoque/movimentacoes`), ou cadastra um item novo do zero
 * (`POST /api/estoque`, que não existia até esta correção — sem ela não
 * havia NENHUMA forma de começar a monitorar estoque pelo navegador).
 */
function NovaEntradaDialog({
  open,
  onOpenChange,
  produtos,
  aoConcluir,
}: {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  produtos: ProdutoEstoque[];
  aoConcluir: () => void;
}) {
  const [modo, setModo] = React.useState<"existente" | "novo">(
    produtos.length > 0 ? "existente" : "novo"
  );
  const [produtoId, setProdutoId] = React.useState<string>("");
  const [quantidade, setQuantidade] = React.useState("");
  const [fornecedor, setFornecedor] = React.useState("");
  const [custoUnitario, setCustoUnitario] = React.useState("");
  const [nome, setNome] = React.useState("");
  const [categoria, setCategoria] = React.useState("");
  const [unidade, setUnidade] = React.useState("");
  const [minimo, setMinimo] = React.useState("");
  const [notaId, setNotaId] = React.useState<string>("");
  const [enviando, setEnviando] = React.useState(false);
  const notasFiscais = useApi<{ notas: { id: string; numero: string; fornecedor: string }[] }>(
    "/api/notas-fiscais",
    { notas: [] }
  );

  function limpar() {
    setProdutoId("");
    setQuantidade("");
    setFornecedor("");
    setCustoUnitario("");
    setNome("");
    setCategoria("");
    setUnidade("");
    setMinimo("");
    setNotaId("");
  }

  async function salvar() {
    const qtd = interpretarNumero(quantidade);
    if (qtd === null || qtd <= 0) {
      toast.error("Informe uma quantidade válida, maior que zero.");
      return;
    }

    setEnviando(true);
    try {
      if (modo === "existente") {
        if (!produtoId) {
          toast.error("Escolha o item de estoque.");
          return;
        }
        await api("/api/estoque/movimentacoes", {
          method: "POST",
          body: JSON.stringify({
            produtoId,
            tipo: "entrada",
            quantidade: qtd,
            fornecedor: fornecedor.trim() || undefined,
            valorTotal: custoUnitario ? qtd * (interpretarNumero(custoUnitario) ?? 0) : undefined,
            notaId: notaId || undefined,
          }),
        });
        toast.success("Entrada registrada.");
      } else {
        const custo = interpretarNumero(custoUnitario);
        const min = interpretarNumero(minimo);
        if (!nome.trim() || !categoria.trim() || !unidade.trim()) {
          toast.error("Preencha nome, categoria e unidade do novo item.");
          return;
        }
        if (custo === null) {
          toast.error("Informe um custo unitário válido.");
          return;
        }
        await api("/api/estoque", {
          method: "POST",
          body: JSON.stringify({
            nome: nome.trim(),
            categoria: categoria.trim(),
            unidade: unidade.trim(),
            minimo: min ?? 0,
            custoUnitario: custo,
            estoqueInicial: qtd,
          }),
        });
        toast.success(`"${nome.trim()}" cadastrado no estoque.`);
      }
      limpar();
      onOpenChange(false);
      aoConcluir();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível registrar a entrada.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova entrada de mercadoria</DialogTitle>
          <DialogDescription>
            Lance a reposição de um item que já existe, ou cadastre um item novo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {produtos.length > 0 ? (
            <div className="flex gap-2 rounded-lg border border-border p-1">
              <Button
                type="button"
                size="sm"
                variant={modo === "existente" ? "primary" : "ghost"}
                className="flex-1"
                onClick={() => setModo("existente")}
              >
                Item existente
              </Button>
              <Button
                type="button"
                size="sm"
                variant={modo === "novo" ? "primary" : "ghost"}
                className="flex-1"
                onClick={() => setModo("novo")}
              >
                Item novo
              </Button>
            </div>
          ) : null}

          {modo === "existente" ? (
            <div className="flex flex-col gap-1.5">
              <Label>Item de estoque</Label>
              <Select value={produtoId} onValueChange={setProdutoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha o item" />
                </SelectTrigger>
                <SelectContent>
                  {produtos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome} ({formatBRL(p.custoUnitario)}/{p.unidade})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="estoque-nome">Nome</Label>
                  <Input
                    id="estoque-nome"
                    placeholder="Ex.: Farinha de trigo 5kg"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="estoque-categoria">Categoria</Label>
                  <Input
                    id="estoque-categoria"
                    placeholder="Ex.: Insumos"
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="estoque-unidade">Unidade</Label>
                  <Input
                    id="estoque-unidade"
                    placeholder="Ex.: kg, un, pct"
                    value={unidade}
                    onChange={(e) => setUnidade(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="estoque-minimo">Estoque mínimo</Label>
                  <Input
                    id="estoque-minimo"
                    inputMode="decimal"
                    placeholder="Ex.: 10"
                    value={minimo}
                    onChange={(e) => setMinimo(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="estoque-quantidade">
                {modo === "existente" ? "Quantidade recebida" : "Estoque inicial"}
              </Label>
              <Input
                id="estoque-quantidade"
                inputMode="decimal"
                placeholder="Ex.: 20"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="estoque-custo">Custo unitário (R$)</Label>
              <Input
                id="estoque-custo"
                inputMode="decimal"
                placeholder="Ex.: 18,90"
                value={custoUnitario}
                onChange={(e) => setCustoUnitario(e.target.value)}
              />
            </div>
          </div>

          {modo === "existente" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="estoque-fornecedor">Fornecedor (opcional)</Label>
              <Input
                id="estoque-fornecedor"
                placeholder="Ex.: Atacadão"
                value={fornecedor}
                onChange={(e) => setFornecedor(e.target.value)}
              />
            </div>
          ) : null}

          {modo === "existente" && notasFiscais.dados.notas.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Label>Vincular a uma nota fiscal (opcional)</Label>
              <Select value={notaId} onValueChange={setNotaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Nenhuma nota selecionada" />
                </SelectTrigger>
                <SelectContent>
                  {notasFiscais.dados.notas.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      NF-e {n.numero} — {n.fornecedor}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={enviando}>
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Clock, Printer, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/patterns/status-badge";
import { EmptyState } from "@/components/patterns/empty-state";
import { FloatingCartBar } from "@/components/patterns/floating-cart-bar";
import { formatBRL, formatElapsed } from "@/lib/utils";
import { calcularTotais } from "@/lib/catalogo";
import { useRelogio } from "@/hooks/use-relogio";
import { useGarcom } from "@/app/garcom/_lib/garcom-context";
import type { Mesa, Produto } from "@/app/garcom/_lib/mock-data";
import { CatalogoProdutos } from "@/app/garcom/_components/catalogo-produtos";
import { PedidoCart } from "@/app/garcom/_components/pedido-cart";

/** Minutos decorridos: mesas abertas nesta sessão contam pelo relógio real;
 * as do mock usam o valor fixo de `elapsedMinutes`. */
function elapsedDe(mesa: Mesa, agora: Date) {
  if (mesa.abertaEm) {
    return Math.max(0, Math.floor((agora.getTime() - mesa.abertaEm) / 60_000));
  }
  return mesa.elapsedMinutes;
}

export default function PedidoMesaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const mesaId = Number(params.id);

  const {
    mesas,
    pedidos,
    observacoesGerais,
    adicionarProduto,
    atualizarQuantidade,
    atualizarObservacaoItem,
    removerItem,
    definirObservacaoGeral,
    enviarPedido,
  } = useGarcom();

  const mesa = mesas.find((m) => m.id === mesaId);
  const itens = pedidos[mesaId] ?? [];
  const observacaoGeral = observacoesGerais[mesaId] ?? "";

  const [carrinhoAberto, setCarrinhoAberto] = React.useState(false);
  const [imprimirAberto, setImprimirAberto] = React.useState(false);
  const agora = useRelogio();

  const { total: totalPedido, totalItens } = calcularTotais(itens);
  const elapsedMin = mesa ? elapsedDe(mesa, agora) : undefined;

  function handleAdicionar(
    produto: Produto,
    escolha?: { tamanhoId: string; tamanhoNome: string; precoUnit: number; quantidade?: number; sabores: Produto["sabores"]; adicionais: Produto["adicionais"]; observacao?: string }
  ) {
    adicionarProduto(mesaId, produto, escolha);
    toast.success(`${produto.nome} adicionado.`, { duration: 1500 });
  }

  function handleSalvar() {
    if (itens.length === 0) return;
    enviarPedido(mesaId);
    toast.success(`Pedido da mesa ${String(mesaId).padStart(2, "0")} enviado para a cozinha.`);
    setCarrinhoAberto(false);
    router.push("/garcom");
  }

  function handleImprimir() {
    if (itens.length === 0) return;
    setImprimirAberto(true);
  }

  if (!mesa) {
    return (
      <EmptyState
        title="Mesa não encontrada"
        description="Ela pode ter sido removida ou o número está incorreto."
        actionLabel="Voltar para Mesas"
        onAction={() => router.push("/garcom")}
      />
    );
  }

  // Acesso direto a uma mesa livre (sem passar pelo diálogo "Abrir mesa" da
  // grade) — orienta o garçom a voltar e abrir a mesa antes de lançar itens.
  if (mesa.status === "livre") {
    return (
      <EmptyState
        icon={Users}
        title={`Mesa ${String(mesa.id).padStart(2, "0")} está livre`}
        description="Volte para Mesas e toque nesta mesa para abri-la antes de lançar um pedido."
        actionLabel="Voltar para Mesas"
        onAction={() => router.push("/garcom")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-24 lg:pb-0">
      {/* Cabeçalho da mesa */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Voltar para Mesas"
            onClick={() => router.push("/garcom")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.01em] text-foreground sm:text-3xl">
              Mesa {String(mesa.id).padStart(2, "0")}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {typeof mesa.pessoas === "number" && (
                <span className="flex items-center gap-1.5">
                  <Users className="h-4 w-4" />
                  {mesa.pessoas} {mesa.pessoas === 1 ? "pessoa" : "pessoas"}
                </span>
              )}
              {typeof elapsedMin === "number" && (
                <span className="flex items-center gap-1.5 tabular">
                  <Clock className="h-4 w-4" />
                  {formatElapsed(elapsedMin)}
                </span>
              )}
            </div>
          </div>
        </div>
        <StatusBadge status={mesa.status} />
      </div>

      <Separator />

      {/* Catálogo + carrinho (lg+: lado a lado / mobile: carrinho em Sheet) */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_23rem]">
        <CatalogoProdutos onAdicionar={handleAdicionar} />

        <Card className="hidden self-start lg:sticky lg:top-6 lg:block">
          <div className="flex flex-col gap-5 p-6 sm:p-7">
            <h2 className="text-xl font-semibold tracking-[-0.01em]">Pedido atual</h2>
            <PedidoCart
              itens={itens}
              observacaoGeral={observacaoGeral}
              podeEnviar={itens.length > 0}
              onQuantidade={(uid, q) => atualizarQuantidade(mesaId, uid, q)}
              onObservacaoItem={(uid, obs) => atualizarObservacaoItem(mesaId, uid, obs)}
              onRemover={(uid) => removerItem(mesaId, uid)}
              onObservacaoGeral={(texto) => definirObservacaoGeral(mesaId, texto)}
              onSalvar={handleSalvar}
              onImprimir={handleImprimir}
            />
          </div>
        </Card>
      </div>

      {/* Barra flutuante (mobile) para abrir o pedido */}
      <FloatingCartBar
        totalItens={totalItens}
        total={totalPedido}
        onClick={() => setCarrinhoAberto(true)}
      />

      {/* Pedido atual (mobile) */}
      <Sheet open={carrinhoAberto} onOpenChange={setCarrinhoAberto}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto scrollbar-thin">
          <SheetTitle>Pedido — Mesa {String(mesa.id).padStart(2, "0")}</SheetTitle>
          <PedidoCart
            itens={itens}
            observacaoGeral={observacaoGeral}
            podeEnviar={itens.length > 0}
            onQuantidade={(uid, q) => atualizarQuantidade(mesaId, uid, q)}
            onObservacaoItem={(uid, obs) => atualizarObservacaoItem(mesaId, uid, obs)}
            onRemover={(uid) => removerItem(mesaId, uid)}
            onObservacaoGeral={(texto) => definirObservacaoGeral(mesaId, texto)}
            onSalvar={handleSalvar}
            onImprimir={handleImprimir}
          />
        </SheetContent>
      </Sheet>

      {/* Pré-visualização de impressão */}
      <Dialog open={imprimirAberto} onOpenChange={setImprimirAberto}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Comanda — Mesa {String(mesa.id).padStart(2, "0")}</DialogTitle>
            <DialogDescription>
              Pré-visualização do que será enviado para a impressora da cozinha.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-dashed border-border bg-secondary/40 p-4 font-mono text-sm">
            <p className="font-semibold">Comanda</p>
            <p className="text-muted-foreground">
              Mesa {String(mesa.id).padStart(2, "0")} · {mesa.pessoas ?? "-"} pessoas
            </p>
            <Separator className="my-2" />
            <ul className="flex flex-col gap-1.5">
              {itens.map((item) => (
                <li key={item.uid}>
                  <div className="flex justify-between gap-2">
                    <span>
                      {item.quantidade}x {item.nome}
                    </span>
                    <span className="tabular">{formatBRL(item.precoUnit * item.quantidade)}</span>
                  </div>
                  {item.observacao && (
                    <p className="pl-4 text-xs italic text-muted-foreground">
                      obs: {item.observacao}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <Separator className="my-2" />
            {observacaoGeral && (
              <p className="mb-2 text-xs italic text-muted-foreground">
                Obs. geral: {observacaoGeral}
              </p>
            )}
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span className="tabular">{formatBRL(totalPedido)}</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setImprimirAberto(false)}>
              Fechar
            </Button>
            <Button
              onClick={() => {
                // Isto imprime a PRÉ-VISUALIZAÇÃO via diálogo do navegador —
                // não é a fila real da cozinha (essa é criada quando o
                // pedido é enviado com "Enviar para a cozinha", e vai para
                // o agente de impressão térmica de verdade). Por isso o
                // texto avisa exatamente isso, em vez de fingir que a
                // comanda já saiu na impressora da cozinha.
                window.print();
                setImprimirAberto(false);
              }}
            >
              <Printer className="h-5 w-5" />
              Imprimir pré-visualização
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

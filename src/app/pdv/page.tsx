"use client";

import * as React from "react";
import { toast } from "sonner";
import { Banknote, Bike, Package, Printer, Send, ShoppingBag, Trash2, UtensilsCrossed, X } from "lucide-react";

import { PageHeader } from "@/components/patterns/page-header";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ToggleButton } from "@/components/ui/toggle-button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { FloatingCartBar } from "@/components/patterns/floating-cart-bar";
import { FilaImpressao } from "@/components/impressao/fila-impressao";
import { ItemPedidoRow } from "@/components/patterns/item-pedido-row";
import { Separator } from "@/components/ui/separator";
import { calcularTotais, type SelecaoPizza } from "@/lib/catalogo";
import { usePdv } from "@/app/pdv/_lib/pdv-context";
import type { Produto } from "@/app/pdv/_lib/mock-data";
import { useCobranca } from "@/app/pdv/_lib/use-cobranca";
import { useAtalhosTeclado } from "@/hooks/use-atalhos-teclado";
import { CatalogoProdutos } from "@/app/pdv/_components/catalogo-produtos";
import { PagamentoDialog } from "@/app/pdv/_components/pagamento-dialog";
import { NfceDialog } from "@/app/pdv/_components/nfce-dialog";
import { SalaoView } from "@/app/pdv/_components/salao-view";
import { RetiradaView } from "@/app/pdv/_components/retirada-view";
import { DeliveryView } from "@/app/pdv/_components/delivery-view";
import { CaixaView } from "@/app/pdv/_components/caixa-view";

const MODULOS = [
  { value: "balcao", label: "Balcão", icon: ShoppingBag },
  { value: "salao", label: "Salão", icon: UtensilsCrossed },
  { value: "retirada", label: "Retirada", icon: Package },
  { value: "delivery", label: "Delivery", icon: Bike },
  { value: "caixa", label: "Caixa", icon: Banknote },
] as const;

type Modulo = (typeof MODULOS)[number]["value"];

export default function PdvPedidoPage() {
  const [modulo, setModulo] = React.useState<Modulo>("balcao");

  return (
    <Tabs
      value={modulo}
      onValueChange={(v) => setModulo(v as Modulo)}
      className="flex flex-col gap-6"
    >
      <TabsList className="h-auto w-full justify-start gap-1.5 overflow-x-auto p-1.5 sm:w-auto sm:flex-wrap sm:justify-center">
        {MODULOS.map((m) => {
          const Icon = m.icon;
          return (
            <TabsTrigger key={m.value} value={m.value} className="shrink-0">
              <Icon className="h-4 w-4" />
              {m.label}
            </TabsTrigger>
          );
        })}
      </TabsList>

      <TabsContent value="balcao" className="mt-0 flex flex-col gap-6 pb-24 lg:pb-0">
        <ModuloBalcao />
      </TabsContent>

      <TabsContent value="salao" className="mt-0">
        <SalaoView />
      </TabsContent>

      <TabsContent value="retirada" className="mt-0">
        <RetiradaView />
      </TabsContent>

      <TabsContent value="delivery" className="mt-0">
        <DeliveryView />
      </TabsContent>

      <TabsContent value="caixa" className="mt-0">
        <CaixaView />
      </TabsContent>
    </Tabs>
  );
}

function ModuloBalcao() {
  const {
    itens,
    clienteNome,
    tipoPedido,
    formaPagamento,
    observacao,
    adicionarProduto,
    atualizarQuantidade,
    removerItem,
    definirClienteNome,
    definirTipoPedido,
    definirFormaPagamento,
    definirObservacao,
    limparPedido,
    finalizarPedido,
  } = usePdv();

  const cobranca = useCobranca();

  const [catalogoAberto, setCatalogoAberto] = React.useState(false);
  const [filaAberta, setFilaAberta] = React.useState(false);
  const [confirmarLimpar, setConfirmarLimpar] = React.useState(false);
  const [comandaAberta, setComandaAberta] = React.useState(false);

  const { total: totalPedido, totalItens } = calcularTotais(itens);

  function handleAdicionar(produto: Produto, escolha?: SelecaoPizza) {
    adicionarProduto(produto, escolha);
    toast.success(`${escolha?.nome ?? produto.nome} adicionado.`, { duration: 1500 });
  }

  function handleFinalizar() {
    if (itens.length === 0) {
      toast.error("Adicione itens ao pedido antes de finalizar.");
      return;
    }
    if (formaPagamento === null) {
      toast.error("Selecione uma forma de pagamento antes de finalizar.");
      return;
    }
    const canal =
      tipoPedido === "viagem" ? "retirada" : tipoPedido === "delivery" ? "delivery" : "balcao";
    cobranca.abrirPagamento(
      {
        contexto: "Balcão",
        clienteNome: clienteNome.trim() || undefined,
        itens,
        total: totalPedido,
        canal,
      },
      () => {
        finalizarPedido();
        toast.success("Pedido registrado com sucesso.");
      }
    );
  }

  function handleLimpar() {
    limparPedido();
    setConfirmarLimpar(false);
    toast.info("Pedido limpo.");
  }

  useAtalhosTeclado([
    {
      tecla: "F2",
      acao: () => handleFinalizar(),
      descricao: "Abrir pagamento",
    },
    {
      tecla: "F4",
      acao: () => {
        limparPedido();
        toast.info("Nova venda iniciada.");
      },
      descricao: "Nova venda",
    },
    {
      tecla: "Escape",
      acao: () => {
        setCatalogoAberto(false);
        setFilaAberta(false);
        setConfirmarLimpar(false);
      },
      descricao: "Fechar diálogo / cancelar",
    },
    {
      tecla: "k",
      ctrl: true,
      acao: () => document.getElementById("pdv-busca-produto")?.focus(),
      descricao: "Buscar produto",
    },
  ]);

  const renderComanda = (needsClose?: () => void) => (
    <>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* Cliente */}
        <div className="flex flex-col gap-2">
          <label htmlFor="cliente-nome" className="text-sm font-medium text-foreground/90">
            Cliente (opcional)
          </label>
          <div className="relative">
            <ShoppingBag
              className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              id="cliente-nome"
              type="text"
              placeholder="Nome do cliente"
              value={clienteNome}
              onChange={(e) => definirClienteNome(e.target.value)}
              className="w-full rounded-xl border border-border pl-12 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        {/* Tipo de pedido */}
        <div className="mt-4 flex flex-wrap gap-2">
          {["balcao", "viagem", "delivery"].map((tipo) => (
            <Button
              key={tipo}
              type="button"
              size="sm"
              variant={tipoPedido === tipo ? "primary" : "outline"}
              onClick={() => definirTipoPedido(tipo as typeof tipoPedido)}
            >
              {tipo === "balcao" ? "Balcão" : tipo === "viagem" ? "Viagem" : "Delivery"}
            </Button>
          ))}
        </div>

        <Separator className="my-4" />

        {/* Itens */}
        {itens.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
              <ShoppingBag size={30} className="text-slate-400" />
            </div>
            <p className="text-base font-bold text-foreground">Pedido vazio</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Selecione um produto para montar o pedido.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {itens.map((item) => (
              <ItemPedidoRow
                key={item.uid}
                item={item}
                compacto
                onQuantidade={atualizarQuantidade}
                onRemover={removerItem}
              />
            ))}
          </ul>
        )}

        <Separator className="my-4" />

        {/* Observação */}
        <div className="flex flex-col gap-2">
          <label htmlFor="obs-balcao" className="text-sm font-medium text-foreground/90">
            Observações (opcional)
          </label>
          <textarea
            id="obs-balcao"
            placeholder="Ex.: sem cebola, embalar para viagem..."
            value={observacao}
            onChange={(e) => definirObservacao(e.target.value)}
            className="w-full rounded-xl border border-border p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
            rows={3}
          />
        </div>

        {/* Forma de pagamento */}
        <div className="mt-4 flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground/90">Forma de pagamento</span>
          <div className="grid grid-cols-2 gap-2">
            {FORMAS_PAGAMENTO.map((forma) => (
              <ToggleButton
                key={forma.value}
                pressed={formaPagamento === forma.value}
                onClick={() => definirFormaPagamento(forma.value as "pix" | "dinheiro" | "credito" | "debito")}
              >
                {forma.label}
              </ToggleButton>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200 bg-white px-5 py-4">
        {/* Total */}
        <div className="flex items-end justify-between border-b border-dashed border-slate-200 pb-3">
          <span className="text-sm font-bold text-foreground">
            {totalItens} {totalItens === 1 ? "item" : "itens"}
          </span>
          <span className="text-2xl font-black tracking-tight text-slate-950">
            {formatBRL(totalPedido)}
          </span>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() => {
              needsClose?.();
              handleFinalizar();
            }}
            disabled={itens.length === 0 || formaPagamento === null}
          >
            <Send className="h-5 w-5" />
            Finalizar pedido
          </Button>
          <Button
            type="button"
            variant="outline"
            size="md"
            className="w-full"
            onClick={() => {
              needsClose?.();
              setConfirmarLimpar(true);
            }}
            disabled={itens.length === 0}
          >
            <Trash2 className="h-5 w-5" />
            Limpar pedido
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <>
      <PageHeader
        title="Novo pedido"
        description="Clique em um produto para montar o pedido. A comanda fica ao lado (barra fixa no celular)."
        actions={
          <Button variant="outline" size="sm" onClick={() => setFilaAberta(true)}>
            <Printer className="h-4 w-4" aria-hidden="true" />
            Impressão
          </Button>
        }
      />

      <Dialog open={filaAberta} onOpenChange={(abrir) => !abrir && setFilaAberta(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Impressão — fila do caixa</DialogTitle>
          </DialogHeader>
          <div className="max-h-[65vh] overflow-auto">
            <FilaImpressao destino="caixa" />
          </div>
        </DialogContent>
      </Dialog>

      {/* Grid: catálogo | comanda fixa (desktop) */}
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        {/* Catálogo — scrolla sozinho */}
        <div className="min-w-0 flex-1">
          <Card>
            <div className="flex flex-col gap-4 p-6 sm:p-8">
              <h2 className="text-xl font-semibold tracking-[-0.01em]">Cardápio</h2>
              <CatalogoProdutos onAdicionar={handleAdicionar} />
            </div>
          </Card>
        </div>

        {/* Comanda — fixa à direita (desktop) */}
        <div className="hidden w-full shrink-0 lg:sticky lg:top-6 lg:flex lg:h-[calc(100vh-8rem)] lg:w-[23rem] lg:flex-col lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:shadow-soft">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Comanda do balcão
              </p>
              <h2 className="mt-0.5 text-lg font-bold text-foreground">
                {clienteNome.trim() || "Novo pedido"}
              </h2>
            </div>
          </div>
          {renderComanda()}
        </div>
      </div>

      {/* Mobile: barra fixa + drawer da comanda em tela cheia */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[110] lg:hidden">
        <button
          onClick={() => setComandaAberta(true)}
          className="pointer-events-auto mx-auto mb-3 flex w-[calc(100%-24px)] items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-900 px-5 py-4 text-white shadow-2xl"
        >
          <span className="text-sm font-bold">
            {itens.length === 0
              ? "Comanda vazia"
              : `Comanda · ${totalItens} item${totalItens > 1 ? "ns" : ""}`}
          </span>
          <span className="flex items-center gap-2">
            <span className="text-lg font-black">{formatBRL(totalPedido)}</span>
            <span className="rounded-lg bg-white/20 px-2.5 py-1 text-xs font-bold">Ver comanda</span>
          </span>
        </button>

        {comandaAberta && (
          <div className="pointer-events-auto fixed inset-0 z-[120] flex flex-col bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500 text-sm font-black text-white">
                  <ShoppingBag size={18} />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Balcão</p>
                  <h2 className="text-base font-bold text-slate-900">{clienteNome.trim() || "Novo pedido"}</h2>
                </div>
              </div>
              <button
                onClick={() => setComandaAberta(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500"
              >
                <X size={19} />
              </button>
            </div>
            {renderComanda(() => setComandaAberta(false))}
          </div>
        )}
      </div>

      {/* Fluxo comum de cobrança */}
      <PagamentoDialog
        open={cobranca.pagamentoAberto}
        onOpenChange={cobranca.setPagamentoAberto}
        titulo="Confirmar venda"
        descricao="Confira os itens e a forma de pagamento antes de confirmar a venda."
        contexto={cobranca.cobranca?.contexto ?? ""}
        clienteNome={cobranca.cobranca?.clienteNome}
        itens={cobranca.cobranca?.itens ?? []}
        total={cobranca.cobranca?.total ?? 0}
        saldoRestante={cobranca.saldoRestante}
        permitirDividir
        formaInicial={formaPagamento}
        caixaAberto={cobranca.caixaAberto}
        onConfirmar={cobranca.confirmarPagamento}
      />
      <NfceDialog cupom={cobranca.cupom} onConcluir={cobranca.concluir} />

      <Dialog open={confirmarLimpar} onOpenChange={setConfirmarLimpar}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Limpar o pedido?</DialogTitle>
            <DialogDescription>
              Todos os itens, observações e dados do cliente serão removidos.
              Essa ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmarLimpar(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleLimpar}>
              Sim, limpar pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const FORMAS_PAGAMENTO = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
  { value: "pix", label: "Pix" },
];

function formatBRL(valor: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}

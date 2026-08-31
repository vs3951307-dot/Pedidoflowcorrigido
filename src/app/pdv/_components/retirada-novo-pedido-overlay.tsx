"use client";

import * as React from "react";
import { X, ShoppingBag, User, ChefHat, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { formatBRL } from "@/lib/utils";
import { CatalogoProdutos } from "@/app/pdv/_components/catalogo-produtos";
import { ItemPedidoRow } from "@/components/patterns/item-pedido-row";
import type { ItemPedido, Produto, SelecaoPizza } from "@/lib/catalogo";

interface RetiradaNovoPedidoOverlayProps {
  aberto: boolean;
  nomeCliente: string;
  onNomeClienteChange: (v: string) => void;
  itens: ItemPedido[];
  observacao: string;
  onObservacaoChange: (v: string) => void;
  onAdicionarProduto: (produto: Produto, escolha?: SelecaoPizza) => void;
  onQuantidade: (uid: string, quantidade: number) => void;
  onRemover: (uid: string) => void;
  onFechar: () => void;
  onContinuar: () => void;
  total: number;
}

/**
 * RetiradaNovoPedidoOverlay — novo pedido de retirada em TELA CHEIA, no
 * mesmo padrão do overlay de Mesas: produtos de um lado e a comanda no
 * outro. No celular, vira barra inferior fixa + comanda em tela cheia.
 */
export function RetiradaNovoPedidoOverlay({
  aberto,
  nomeCliente,
  onNomeClienteChange,
  itens,
  observacao,
  onObservacaoChange,
  onAdicionarProduto,
  onQuantidade,
  onRemover,
  onFechar,
  onContinuar,
  total,
}: RetiradaNovoPedidoOverlayProps) {
  const [drawerAberto, setDrawerAberto] = React.useState(false);

  React.useEffect(() => {
    if (aberto) setDrawerAberto(false);
  }, [aberto]);

  if (!aberto) return null;

  const itensVazio = itens.length === 0;

  const renderComanda = (needsClose?: () => void) => (
    <>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {itensVazio ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
              <ShoppingBag size={30} className="text-slate-400" />
            </div>
            <p className="font-bold text-slate-700">Comanda vazia</p>
            <p className="mt-1 max-w-[240px] text-sm leading-5 text-slate-400">
              Selecione um produto ao lado para montar a retirada.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {itens.map((item) => (
              <ItemPedidoRow
                key={item.uid}
                item={item}
                compacto
                onQuantidade={onQuantidade}
                onRemover={onRemover}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-slate-200 px-5 py-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="retirada-obs-overlay">Observações (opcional)</Label>
          <Textarea
            id="retirada-obs-overlay"
            placeholder="Ex.: cortar em 8 fatias, embalar para viagem..."
            value={observacao}
            onChange={(e) => onObservacaoChange(e.target.value)}
            className="min-h-[4.5rem] resize-none"
          />
        </div>

        <div className="mt-4 flex items-end justify-between border-t border-dashed border-slate-200 pt-4">
          <span className="font-bold text-slate-700">
            {itens.length} {itens.length === 1 ? "item" : "itens"}
          </span>
          <span className="text-2xl font-black tracking-tight text-slate-950">
            {formatBRL(total)}
          </span>
        </div>

        <div className="mt-4">
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={!nomeCliente.trim() || itensVazio}
            onClick={() => {
              needsClose?.();
              onContinuar();
            }}
          >
            <Send className="h-5 w-5" />
            Continuar para pagamento
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* ============================================= */}
      {/* OVERLAY (DESKTOP): catálogo | comanda         */}
      {/* ============================================= */}
      <div className="fixed inset-0 z-40 bg-slate-950/55 p-2 backdrop-blur-[3px] md:p-5">
        <div className="mx-auto flex h-full max-w-[1750px] flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-[#f7f8fa] shadow-2xl lg:flex-row">
          {/* CATÁLOGO - LADO ESQUERDO */}
          <section className="flex min-w-0 flex-1 flex-col">
            <header className="flex min-h-[82px] items-center justify-between border-b border-slate-200 bg-white px-5 md:px-7 lg:hidden">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
                  Novo pedido
                </p>
                <h1 className="text-xl font-bold text-slate-900">Retirada</h1>
              </div>
              <button
                onClick={onFechar}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <X size={21} />
              </button>
            </header>

            {/* Cliente + fechar (desktop) */}
            <div className="grid gap-4 border-b border-slate-200 bg-white px-5 pb-5 pt-5 md:px-7 lg:grid-cols-[1fr_auto] lg:items-end">
              <div className="flex flex-col gap-2">
                <Label htmlFor="retirada-cliente-overlay">Nome do cliente</Label>
                <div className="relative">
                  <User
                    className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="retirada-cliente-overlay"
                    placeholder="Ex.: João da Silva"
                    value={nomeCliente}
                    onChange={(e) => onNomeClienteChange(e.target.value)}
                    className="h-12 pl-12"
                  />
                </div>
              </div>
              <Button variant="outline" onClick={onFechar} className="hidden lg:inline-flex">
                <X className="h-4 w-4" />
                Cancelar
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto bg-white p-5 md:p-7">
              <p className="mb-4 text-sm font-medium text-slate-500">
                Clique em um produto para montar a retirada. A comanda fica à direita.
              </p>
              <CatalogoProdutos onAdicionar={onAdicionarProduto} />
            </div>
          </section>

          {/* COMANDA - LADO DIREITO */}
          <aside className="hidden w-[390px] shrink-0 flex-col border-l border-slate-200 bg-white lg:flex xl:w-[430px]">
            <div className="border-b border-slate-200 px-5 py-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Comanda da retirada
                  </p>
                  <h2 className="mt-1 text-xl font-extrabold text-slate-900">
                    {nomeCliente.trim() || "Cliente"}
                  </h2>
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-emerald-700">
                  <ChefHat size={16} />
                  <span className="text-sm font-bold">Nova</span>
                </div>
              </div>
            </div>
            {renderComanda()}
          </aside>
        </div>
      </div>

      {/* ============================================= */}
      {/* MOBILE: barra inferior + comanda (drawer)     */}
      {/* ============================================= */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[110] lg:hidden">
        <button
          onClick={() => setDrawerAberto(true)}
          className="pointer-events-auto mx-auto mb-3 flex w-[calc(100%-24px)] items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-900 px-5 py-4 text-white shadow-2xl"
        >
          <span className="text-sm font-bold">
            {itensVazio ? "Comanda vazia" : `Comanda · ${itens.length} item${itens.length > 1 ? "ns" : ""}`}
          </span>
          <span className="flex items-center gap-2">
            <span className="text-lg font-black">{formatBRL(total)}</span>
            <span className="rounded-lg bg-white/20 px-2.5 py-1 text-xs font-bold">Ver comanda</span>
          </span>
        </button>

        {drawerAberto && (
          <div className="pointer-events-auto fixed inset-0 z-[120] flex flex-col bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500 text-sm font-black text-white">
                  <ShoppingBag size={18} />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">Retirada</p>
                  <h2 className="text-base font-bold text-slate-900">{nomeCliente.trim() || "Cliente"}</h2>
                </div>
              </div>
              <button
                onClick={() => setDrawerAberto(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500"
              >
                <X size={19} />
              </button>
            </div>
            {renderComanda(() => setDrawerAberto(false))}
          </div>
        )}
      </div>
    </>
  );
}

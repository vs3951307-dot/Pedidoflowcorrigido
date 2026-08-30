"use client";

import * as React from "react";
import { Minus, Plus, StickyNote, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatBRL } from "@/lib/utils";
import type { ItemPedido } from "@/lib/catalogo";

interface ItemPedidoRowProps {
  item: ItemPedido;
  /** Opcionais: quando ausentes, a linha fica somente leitura (ex.: comanda
   * cobrada no PDV, cupom NFC-e). */
  onQuantidade?: (uid: string, quantidade: number) => void;
  onRemover?: (uid: string) => void;
  /** Quando presente, habilita o campo de observação por item (Garçom). */
  onObservacao?: (uid: string, observacao: string) => void;
  /** Variante compacta (PDV): controles menores e botão "Remover" com texto. */
  compacto?: boolean;
}

/**
 * ItemPedidoRow — linha de item de pedido (nome, preço unitário, subtotal,
 * stepper de quantidade e remover). Usada no PDV e no Garçom; no Garçom
 * também permite observação por item. Sem `onQuantidade`/`onRemover` vira
 * somente leitura (comanda do Salão, cupom NFC-e).
 */
export function ItemPedidoRow({
  item,
  onQuantidade,
  onRemover,
  onObservacao,
  compacto = false,
}: ItemPedidoRowProps) {
  const [obsAberto, setObsAberto] = React.useState(false);
  const mostrarObservacao = obsAberto || Boolean(item.observacao);
  const editavel = Boolean(onQuantidade && onRemover);

  return (
    <li className={cn("flex flex-col gap-3 rounded-xl border border-border bg-card", compacto ? "p-3.5" : "p-4")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold leading-tight text-foreground">{item.nome}</p>
          <p className="text-sm text-muted-foreground tabular">{formatBRL(item.precoUnit)} un.</p>
        </div>
        <span className="shrink-0 font-semibold tabular text-foreground">
          {formatBRL(item.precoUnit * item.quantidade)}
        </span>
      </div>

      {editavel && (
        <div className="flex items-center justify-between gap-3">
          <div className={cn("flex items-center", compacto ? "gap-2" : "gap-3")}>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={compacto ? "h-9 w-9" : "h-10 w-10"}
              aria-label={`Diminuir quantidade de ${item.nome}`}
              onClick={() => onQuantidade?.(item.uid, item.quantidade - 1)}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span
              className={cn("text-center font-semibold tabular", compacto ? "w-5" : "w-6 text-lg")}
            >
              {item.quantidade}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={compacto ? "h-9 w-9" : "h-10 w-10"}
              aria-label={`Aumentar quantidade de ${item.nome}`}
              onClick={() => onQuantidade?.(item.uid, item.quantidade + 1)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-1">
            {onObservacao && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn("px-3 text-muted-foreground", mostrarObservacao && "text-primary")}
                onClick={() => setObsAberto((v) => !v)}
              >
                <StickyNote className="h-4 w-4" />
                Observação
              </Button>
            )}
            {compacto ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="px-3 text-muted-foreground hover:text-destructive"
                onClick={() => onRemover?.(item.uid)}
              >
                <Trash2 className="h-4 w-4" />
                Remover
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-muted-foreground hover:text-destructive"
                aria-label={`Remover ${item.nome}`}
                onClick={() => onRemover?.(item.uid)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      {mostrarObservacao && onObservacao && (
        <Textarea
          placeholder="Ex.: sem cebola, ponto da carne bem passado..."
          value={item.observacao ?? ""}
          onChange={(e) => onObservacao(item.uid, e.target.value)}
          className="min-h-[4rem] text-sm"
          autoFocus={obsAberto}
        />
      )}
    </li>
  );
}

import { ShoppingBag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/utils";

interface FloatingCartBarProps {
  totalItens: number;
  total: number;
  onClick: () => void;
}

/**
 * FloatingCartBar — barra fixa inferior (mobile) para abrir o resumo do
 * pedido/comanda. Mostra a contagem de itens e o total acumulado.
 */
export function FloatingCartBar({ totalItens, total, onClick }: FloatingCartBarProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card p-4 shadow-lifted lg:hidden">
      <Button
        type="button"
        size="lg"
        className="w-full justify-between px-5"
        onClick={onClick}
      >
        <span className="flex items-center gap-2">
          <ShoppingBag className="h-5 w-5" />
          {totalItens === 0
            ? "Ver pedido"
            : `${totalItens} ${totalItens === 1 ? "item" : "itens"}`}
        </span>
        <span className="tabular">{formatBRL(total)}</span>
      </Button>
    </div>
  );
}

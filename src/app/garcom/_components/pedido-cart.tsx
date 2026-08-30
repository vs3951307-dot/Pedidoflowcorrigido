"use client";

import { Printer, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/patterns/empty-state";
import { ItemPedidoRow } from "@/components/patterns/item-pedido-row";
import { cn, formatBRL } from "@/lib/utils";
import { calcularTotais } from "@/lib/catalogo";
import type { ItemPedido } from "@/app/garcom/_lib/mock-data";

interface PedidoCartProps {
  itens: ItemPedido[];
  observacaoGeral: string;
  podeEnviar: boolean;
  onQuantidade: (uid: string, quantidade: number) => void;
  onObservacaoItem: (uid: string, observacao: string) => void;
  onRemover: (uid: string) => void;
  onObservacaoGeral: (texto: string) => void;
  onSalvar: () => void;
  onImprimir: () => void;
  className?: string;
}

/**
 * PedidoCart — pedido atual da mesa: itens lançados, observações (por item
 * e geral) e as ações de Salvar (enviar para a cozinha) e Imprimir.
 * Usado tanto no painel fixo (telas grandes) quanto dentro da Sheet inferior
 * (mobile) — por isso não assume nada sobre o contêiner ao redor.
 */
export function PedidoCart({
  itens,
  observacaoGeral,
  podeEnviar,
  onQuantidade,
  onObservacaoItem,
  onRemover,
  onObservacaoGeral,
  onSalvar,
  onImprimir,
  className,
}: PedidoCartProps) {
  const { total } = calcularTotais(itens);

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {itens.length === 0 ? (
        <EmptyState
          title="Pedido vazio"
          description="Toque em um produto ao lado para adicionar à comanda."
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {itens.map((item) => (
            <ItemPedidoRow
              key={item.uid}
              item={item}
              onQuantidade={onQuantidade}
              onObservacao={onObservacaoItem}
              onRemover={onRemover}
            />
          ))}
        </ul>
      )}

      <Separator />

      <div className="flex flex-col gap-2">
        <label htmlFor="observacao-geral" className="text-sm font-medium text-foreground/90">
          Observações do pedido
        </label>
        <Textarea
          id="observacao-geral"
          placeholder="Ex.: cliente com pressa, aniversariante na mesa, entregar tudo junto..."
          value={observacaoGeral}
          onChange={(e) => onObservacaoGeral(e.target.value)}
          className="min-h-[5rem]"
        />
      </div>

      <div className="flex items-center justify-between text-lg font-bold">
        <span>Total</span>
        <span className="tabular">{formatBRL(total)}</span>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full sm:w-auto"
          onClick={onImprimir}
          disabled={itens.length === 0}
        >
          <Printer className="h-5 w-5" />
          Imprimir
        </Button>
        <Button
          type="button"
          size="lg"
          className="w-full flex-1"
          onClick={onSalvar}
          disabled={!podeEnviar}
        >
          <Send className="h-5 w-5" />
          Salvar e enviar para a cozinha
        </Button>
      </div>
    </div>
  );
}

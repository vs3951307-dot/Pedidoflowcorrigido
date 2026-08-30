"use client";

import { CreditCard, ShoppingBag, Trash2, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ToggleButton } from "@/components/ui/toggle-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/patterns/empty-state";
import { ItemPedidoRow } from "@/components/patterns/item-pedido-row";
import { cn, formatBRL } from "@/lib/utils";
import { calcularTotais } from "@/lib/catalogo";
import {
  FORMAS_PAGAMENTO,
  TIPOS_PEDIDO,
  type FormaPagamento,
  type ItemPedido,
  type TipoPedido,
} from "@/app/pdv/_lib/mock-data";

interface ResumoPedidoProps {
  itens: ItemPedido[];
  clienteNome: string;
  tipoPedido: TipoPedido;
  formaPagamento: FormaPagamento | null;
  observacao: string;
  onQuantidade: (uid: string, quantidade: number) => void;
  onRemover: (uid: string) => void;
  onClienteNome: (nome: string) => void;
  onTipoPedido: (tipo: TipoPedido) => void;
  onFormaPagamento: (forma: FormaPagamento) => void;
  onObservacao: (texto: string) => void;
  onLimpar: () => void;
  onFinalizar: () => void;
  className?: string;
}

/**
 * ResumoPedido — pedido atual do PDV: cliente, tipo de venda, itens
 * lançados, forma de pagamento e as ações de Limpar / Finalizar pedido.
 * Usado tanto no painel fixo (telas grandes) quanto dentro da Sheet inferior
 * (mobile) — por isso não assume nada sobre o contêiner ao redor.
 */
export function ResumoPedido({
  itens,
  clienteNome,
  tipoPedido,
  formaPagamento,
  observacao,
  onQuantidade,
  onRemover,
  onClienteNome,
  onTipoPedido,
  onFormaPagamento,
  onObservacao,
  onLimpar,
  onFinalizar,
  className,
}: ResumoPedidoProps) {
  const { total, totalItens } = calcularTotais(itens);
  const podeFinalizar = itens.length > 0 && formaPagamento !== null;

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {/* Cliente */}
      <div className="flex flex-col gap-2">
        <label htmlFor="cliente-nome" className="text-sm font-medium text-foreground/90">
          Cliente (opcional)
        </label>
        <div className="relative">
          <User
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="cliente-nome"
            placeholder="Nome do cliente"
            value={clienteNome}
            onChange={(e) => onClienteNome(e.target.value)}
            className="pl-12"
          />
        </div>
      </div>

      {/* Tipo de pedido */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground/90">Tipo de pedido</span>
        <div className="grid grid-cols-3 gap-2">
          {TIPOS_PEDIDO.map((tipo) => (
            <ToggleButton
              key={tipo.value}
              pressed={tipoPedido === tipo.value}
              onClick={() => onTipoPedido(tipo.value)}
            >
              {tipo.label}
            </ToggleButton>
          ))}
        </div>
      </div>

      <Separator />

      {/* Itens */}
      {itens.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="Pedido vazio"
          description="Toque em um produto ao lado para adicionar ao pedido."
        />
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

      <Separator />

      {/* Observações */}
      <div className="flex flex-col gap-2">
        <label htmlFor="observacao-pedido" className="text-sm font-medium text-foreground/90">
          Observações do pedido
        </label>
        <Textarea
          id="observacao-pedido"
          placeholder="Ex.: sem cebola, entregar tudo junto, embalar para viagem..."
          value={observacao}
          onChange={(e) => onObservacao(e.target.value)}
          className="min-h-[4.5rem]"
        />
      </div>

      {/* Forma de pagamento */}
      <div className="flex flex-col gap-2">
        <span className="flex items-center gap-2 text-sm font-medium text-foreground/90">
          <CreditCard className="h-4 w-4" />
          Forma de pagamento
        </span>
        <div className="grid grid-cols-2 gap-2">
          {FORMAS_PAGAMENTO.map((forma) => (
            <ToggleButton
              key={forma.value}
              pressed={formaPagamento === forma.value}
              onClick={() => onFormaPagamento(forma.value)}
            >
              {forma.label}
            </ToggleButton>
          ))}
        </div>
      </div>

      <Separator />

      {/* Total */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {totalItens} {totalItens === 1 ? "item" : "itens"}
          </span>
        </div>
        <div className="flex items-center justify-between text-lg font-bold">
          <span>Total</span>
          <span className="tabular">{formatBRL(total)}</span>
        </div>
      </div>

      {/* Ações */}
      <div className="flex flex-col gap-3">
        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={onFinalizar}
          disabled={!podeFinalizar}
        >
          <ShoppingBag className="h-5 w-5" />
          Finalizar pedido
        </Button>
        <Button
          type="button"
          variant="outline"
          size="md"
          className="w-full"
          onClick={onLimpar}
          disabled={itens.length === 0}
        >
          <Trash2 className="h-5 w-5" />
          Limpar pedido
        </Button>
      </div>
    </div>
  );
}

"use client";

import { Plus } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatBRL } from "@/lib/utils";
import type { Produto, AdicionalPizza, SaborPizza, SelecaoPizza } from "@/lib/catalogo";
import { PizzaPickerDialog } from "@/app/pdv/_components/pizza-picker-dialog";

interface ProdutoCardProps {
  produto: Produto;
  adicionais?: AdicionalPizza[];
  acrescimoPorSaborPremium?: number;
  onAdicionar: (produto: Produto, escolha?: SelecaoPizza) => void;
  className?: string;
}

export function ProdutoCard({
  produto,
  adicionais = [],
  acrescimoPorSaborPremium,
  onAdicionar,
  className,
}: ProdutoCardProps) {
  const [pickerAberto, setPickerAberto] = React.useState(false);
  const temOpcoes = (produto.sabores?.length ?? 0) > 0 || (produto.tamanhos?.length ?? 0) > 0;

  function abrirOuAdicionar() {
    if (temOpcoes) {
      setPickerAberto(true);
      return;
    }
    onAdicionar(produto);
  }

  function confirmarEscolha(escolha: SelecaoPizza) {
    onAdicionar(produto, escolha);
    setPickerAberto(false);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Adicionar ${produto.nome}`}
      onClick={abrirOuAdicionar}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          abrirOuAdicionar();
        }
      }}
      className={cn(
        "group flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lifted focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/10",
        className
      )}
    >
      {/* Placeholder com emoji */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-secondary">
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-secondary to-muted text-6xl">
          {produto.emoji || "🍽️"}
        </div>
        {produto.destaque && (
          <Badge variant="primary" className="absolute left-2 top-2">
            Destaque
          </Badge>
        )}
      </div>

      {/* Conteúdo */}
      <div className="flex flex-1 flex-col items-center gap-1.5 p-4 text-center">
        <h3 className="text-sm font-semibold leading-tight text-foreground">{produto.nome}</h3>

        {produto.descricao && (
          <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
            {produto.descricao}
          </p>
        )}

        <p className="mt-1 text-base font-bold tabular text-foreground">
          {formatBRL(produto.preco)}
        </p>

        {temOpcoes && (
          <p className="text-[11px] text-muted-foreground">
            {produto.tamanhos && produto.tamanhos.length > 0
              ? `Opções: ${produto.tamanhos.map((t) => t.nome).join(" · ")}`
              : `${produto.sabores?.length ?? 0} sabores`}
          </p>
        )}

        <Button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            abrirOuAdicionar();
          }}
          className="mt-auto w-full"
          aria-label={`Adicionar ${produto.nome} à comanda`}
        >
          <Plus className="h-4 w-4" />
          Adicionar
        </Button>
      </div>

      <PizzaPickerDialog
        open={pickerAberto}
        onOpenChange={setPickerAberto}
        produto={produto}
        adicionais={adicionais}
        acrescimoPorSaborPremium={acrescimoPorSaborPremium}
        onConfirmar={confirmarEscolha}
      />
    </div>
  );
}

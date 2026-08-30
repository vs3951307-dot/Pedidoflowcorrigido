"use client";

import * as React from "react";
import { Armchair, Clock } from "lucide-react";
import { cn, formatBRL, formatElapsed } from "@/lib/utils";
import { STATUS_CONFIG, type TableStatus } from "@/components/patterns/status-badge";

interface TableCardProps {
  number: number | string;
  status: TableStatus;
  elapsedMinutes?: number;
  /** Valor atual da comanda (quando ocupada) — PEDIDO: mostrar o valor na grade. */
  valor?: number;
  /** Pulsa suavemente o rótulo de status (usar em no máximo uma mesa por
   * tela — ex.: a mesa "aguardando" há mais tempo). */
  pulse?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * TableCard — o bloco central do Salão (grade de mesas). Cor de fundo e
 * borda mudam por status; número grande e legível a distância, como no
 * app de referência. Toda a área é clicável — alvo de toque generoso.
 */
export function TableCard({
  number,
  status,
  elapsedMinutes,
  valor,
  pulse,
  onClick,
  className,
}: TableCardProps) {
  const cfg = STATUS_CONFIG[status];

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 p-4 text-center transition-transform",
        "hover:-translate-y-0.5 hover:shadow-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15",
        cfg.bg,
        cfg.border,
        className
      )}
    >
      <Armchair className={cn("h-6 w-6", cfg.text)} />
      <span className={cn("text-3xl font-bold tracking-[-0.01em] tabular", cfg.text)}>
        {String(number).padStart(2, "0")}
      </span>
      <span
        className={cn(
          "text-sm font-semibold uppercase tracking-wide",
          cfg.text,
          pulse && "animate-ember-pulse rounded-full"
        )}
      >
        {cfg.label}
      </span>
      {typeof elapsedMinutes === "number" && (
        <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {formatElapsed(elapsedMinutes)}
        </span>
      )}
      {typeof valor === "number" && valor > 0 && (
        <span className="text-xs font-bold tabular text-foreground">{formatBRL(valor)}</span>
      )}
    </button>
  );
}

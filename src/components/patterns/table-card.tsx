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
  /** Versão compacta apenas em telas pequenas (celular) — para grades
   * densas como a do Garçom. No desktop (≥md) mantém o layout normal. */
  compactMobile?: boolean;
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
  compactMobile = false,
}: TableCardProps) {
  const cfg = STATUS_CONFIG[status];

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full flex-col items-center justify-center border-2 text-center transition-transform",
        compactMobile
          ? "aspect-square gap-0.5 rounded-xl p-1.5 sm:aspect-[4/3] sm:gap-1.5 sm:rounded-2xl sm:p-4"
          : "aspect-[4/3] gap-1.5 rounded-2xl p-4",
        "hover:-translate-y-0.5 hover:shadow-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15",
        cfg.bg,
        cfg.border,
        className
      )}
    >
      <Armchair
        className={cn(
          "h-4 w-4 sm:h-6 sm:w-6",
          compactMobile && "hidden sm:block",
          cfg.text
        )}
      />
      <span
        className={cn(
          "font-bold tracking-[-0.01em] tabular",
          compactMobile ? "text-xl sm:text-3xl" : "text-3xl",
          cfg.text
        )}
      >
        {String(number).padStart(2, "0")}
      </span>
      <span
        className={cn(
          "font-semibold uppercase tracking-wide",
          compactMobile ? "text-[9px] sm:text-sm" : "text-sm",
          cfg.text,
          pulse && "animate-ember-pulse rounded-full"
        )}
      >
        {cfg.label}
      </span>
      {typeof elapsedMinutes === "number" && (
        <span
          className={cn(
            "flex items-center gap-1 font-medium text-muted-foreground",
            compactMobile ? "hidden text-[9px] sm:flex sm:text-xs" : "text-xs"
          )}
        >
          <Clock className="h-3.5 w-3.5" />
          {formatElapsed(elapsedMinutes)}
        </span>
      )}
      {typeof valor === "number" && valor > 0 && (
        <span
          className={cn(
            "font-bold tabular text-foreground",
            compactMobile ? "text-[9px] sm:text-xs" : "text-xs"
          )}
        >
          {formatBRL(valor)}
        </span>
      )}
    </button>
  );
}

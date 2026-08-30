import { Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TableStatus } from "@/lib/mesas";

export type { TableStatus };

const STATUS_CONFIG: Record<
  TableStatus,
  { label: string; dot: string; text: string; bg: string; border: string }
> = {
  livre: {
    label: "Livre",
    dot: "text-status-free",
    text: "text-status-free",
    bg: "bg-status-free-bg",
    border: "border-status-free-border",
  },
  aguardando: {
    label: "Aguardando",
    dot: "text-status-waiting",
    text: "text-status-waiting",
    bg: "bg-status-waiting-bg",
    border: "border-status-waiting-border",
  },
  enviado: {
    label: "Pedido enviado",
    dot: "text-status-sent",
    text: "text-status-sent",
    bg: "bg-status-sent-bg",
    border: "border-status-sent-border",
  },
  conta: {
    label: "Pedindo conta",
    dot: "text-status-bill",
    text: "text-status-bill",
    bg: "bg-status-bill-bg",
    border: "border-status-bill-border",
  },
  ocupada: {
    label: "Ocupada",
    dot: "text-status-occupied",
    text: "text-status-occupied",
    bg: "bg-status-occupied-bg",
    border: "border-status-occupied-border",
  },
};

interface StatusBadgeProps {
  status: TableStatus;
  className?: string;
  /** Se verdadeiro, o ponto pulsa suavemente — use para chamar atenção
   * (ex.: mesa aguardando há muito tempo). Use com moderação. */
  pulse?: boolean;
}

/** Selo de status de mesa — mesma paleta usada nos cartões e na legenda. */
export function StatusBadge({ status, className, pulse }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold",
        cfg.bg,
        cfg.text,
        cfg.border,
        className
      )}
    >
      <Circle
        className={cn("h-2.5 w-2.5 fill-current", cfg.dot, pulse && "animate-ember-pulse rounded-full")}
      />
      {cfg.label}
    </span>
  );
}

export { STATUS_CONFIG };

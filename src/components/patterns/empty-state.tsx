import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon?: React.ElementType;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

/** Estado vazio — usado quando não há mesas/pedidos/resultados para mostrar. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-secondary/40 px-6 py-16 text-center",
        className
      )}
    >
      {Icon && (
        <div className="mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-card shadow-soft">
          <Icon className="h-7 w-7 text-muted-foreground" />
        </div>
      )}
      <h3 className="text-xl font-semibold">{title}</h3>
      {description && (
        <p className="max-w-sm text-base text-muted-foreground">{description}</p>
      )}
      {actionLabel && (
        <Button onClick={onAction} size="md" className="mt-3">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

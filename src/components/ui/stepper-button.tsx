"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Controle de quantidade +/- padronizado.
 * - Alturas e ícones controlados via CSS custom properties (data-ui-scale no <html>).
 */
interface StepperButtonProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
}

function StepperButton({
  value,
  onChange,
  min = 0,
  max = Infinity,
  disabled = false,
  className,
}: StepperButtonProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <button
        type="button"
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        aria-label="Diminuir"
        style={{ width: "var(--stepper-btn)", height: "var(--stepper-btn)" }}
        className={cn(
          "flex items-center justify-center rounded-full border border-border text-muted-foreground transition-all duration-150",
          "hover:bg-secondary hover:text-foreground active:scale-95",
          "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15",
          "disabled:cursor-not-allowed disabled:opacity-30"
        )}
      >
        <Minus style={{ width: "var(--stepper-icon)", height: "var(--stepper-icon)" }} />
      </button>
      <span className="w-8 text-center text-sm font-bold tabular">{value}</span>
      <button
        type="button"
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        aria-label="Aumentar"
        style={{ width: "var(--stepper-btn)", height: "var(--stepper-btn)" }}
        className={cn(
          "flex items-center justify-center rounded-full border border-border text-muted-foreground transition-all duration-150",
          "hover:bg-secondary hover:text-foreground active:scale-95",
          "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15",
          "disabled:cursor-not-allowed disabled:opacity-30"
        )}
      >
        <Plus style={{ width: "var(--stepper-icon)", height: "var(--stepper-icon)" }} />
      </button>
    </div>
  );
}

export { StepperButton };

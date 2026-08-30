"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Botão de seleção toggável (ex: forma de pagamento, tipo de pedido, categorias).
 * - Alturas controladas via CSS custom properties (data-ui-scale no <html>).
 */
interface ToggleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  pressed?: boolean;
  size?: "sm" | "md";
}

const toggleSizeStyles: Record<string, React.CSSProperties> = {
  md: { height: "var(--toggle-h-md)", paddingLeft: 12, paddingRight: 12, fontSize: 12 },
  sm: { height: "var(--toggle-h-sm)", paddingLeft: 8, paddingRight: 8, fontSize: 11 },
};

const ToggleButton = React.forwardRef<HTMLButtonElement, ToggleButtonProps>(
  ({ className, pressed = false, size = "md", children, style, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        aria-pressed={pressed}
        className={cn(
          "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border-2 font-semibold transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15",
          "active:scale-[0.97]",
          pressed
            ? "border-primary bg-primary-50 text-primary-700 shadow-sm"
            : "border-border bg-card text-foreground/80 hover:bg-secondary active:bg-secondary/80",
          className
        )}
        style={{ ...toggleSizeStyles[size ?? "md"], ...style }}
        {...props}
      >
        {children}
      </button>
    );
  }
);
ToggleButton.displayName = "ToggleButton";

export { ToggleButton };

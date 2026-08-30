import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Botões PedidoFlow
 * - Alturas controladas via CSS custom properties (data-ui-scale no <html>).
 * - Mobile: áreas de toque generosas; Desktop: tamanhos reduzidos.
 * - Cantos generosos (rounded-xl), nunca 0.
 */
const sizeStyles: Record<string, React.CSSProperties> = {
  sm:  { height: "var(--btn-h-sm)",  paddingLeft: 10, paddingRight: 10, fontSize: 12 },
  md:  { height: "var(--btn-h-md)",  paddingLeft: 14, paddingRight: 14, fontSize: 13 },
  lg:  { height: "var(--btn-h-lg)",  paddingLeft: 16, paddingRight: 16, fontSize: 14 },
  xl:  { height: "var(--btn-h-xl)",  paddingLeft: 20, paddingRight: 20, fontSize: 16 },
  icon:     { height: "var(--btn-h-md)",  width: "var(--btn-h-md)" },
  "icon-sm":{ height: "var(--btn-h-sm)",  width: "var(--btn-h-sm)" },
  "icon-lg":{ height: "var(--btn-h-lg)",  width: "var(--btn-h-lg)" },
};

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold tracking-[-0.01em] transition-all duration-150 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground shadow-soft hover:bg-primary-700 active:bg-primary-800 active:scale-[0.98]",
        secondary:
          "bg-secondary text-secondary-foreground border border-border hover:bg-ink-100 active:bg-ink-200",
        outline:
          "border-2 border-border bg-transparent text-foreground hover:bg-secondary active:bg-secondary/80",
        ghost: "text-foreground hover:bg-secondary active:bg-secondary/80",
        destructive:
          "bg-destructive text-destructive-foreground hover:opacity-90 active:scale-[0.98]",
        "outline-destructive":
          "border-2 border-destructive/30 bg-transparent text-destructive hover:bg-destructive/5 active:bg-destructive/10",
        success:
          "bg-status-free text-white shadow-soft hover:opacity-90 active:scale-[0.98]",
        link: "text-primary underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        sm: "",
        md: "",
        lg: "",
        xl: "",
        icon: "",
        "icon-sm": "",
        "icon-lg": "",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "sm",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size = "sm", asChild = false, style, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        style={{ ...sizeStyles[size ?? "sm"], ...style }}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };

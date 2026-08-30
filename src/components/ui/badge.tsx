import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium border transition-colors",
  {
    variants: {
      variant: {
        default: "bg-secondary text-secondary-foreground border-border",
        primary: "bg-primary-50 text-primary-700 border-primary-200",
        free: "bg-status-free-bg text-status-free border-status-free-border",
        waiting:
          "bg-status-waiting-bg text-status-waiting border-status-waiting-border",
        sent: "bg-status-sent-bg text-status-sent border-status-sent-border",
        bill: "bg-status-bill-bg text-status-bill border-status-bill-border",
        occupied:
          "bg-status-occupied-bg text-status-occupied border-status-occupied-border",
        secondary: "bg-secondary text-secondary-foreground border-border",
        destructive: "bg-destructive text-destructive-foreground border-destructive/50",
        outline: "bg-transparent text-foreground border-border",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

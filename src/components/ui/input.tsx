import * as React from "react";
import { cn } from "@/lib/utils";

/** Input — alto (h-14), texto grande, foco visível e nítido. */
export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-14 w-full rounded-xl border-2 border-border bg-card px-4 text-base text-foreground placeholder:text-muted-foreground/70",
          "transition-colors duration-150 outline-none",
          "focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };

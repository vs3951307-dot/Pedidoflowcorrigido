import * as React from "react";
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ModuleCard — cartão grande de seleção (empresa → módulo, ou qualquer
 * outra navegação de "escolha o destino"). Área de toque generosa,
 * ícone com destaque de marca e seta indicando avanço.
 */
export interface ModuleCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  className?: string;
}

const ModuleCard = React.forwardRef<HTMLAnchorElement, ModuleCardProps>(
  ({ icon: Icon, title, description, href, className }, ref) => {
    return (
      <Link
        ref={ref}
        href={href}
        className={cn(
          "group flex flex-col gap-6 rounded-2xl border border-border bg-card p-6 text-left shadow-card",
          "transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lifted",
          "focus-visible:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15",
          "sm:p-7",
          className
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary transition-colors duration-150 group-hover:bg-primary group-hover:text-primary-foreground">
            <Icon className="h-7 w-7" aria-hidden="true" />
          </div>
          <ChevronRight
            className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-primary"
            aria-hidden="true"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <h3 className="text-xl font-semibold tracking-[-0.01em] text-foreground">
            {title}
          </h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </Link>
    );
  }
);
ModuleCard.displayName = "ModuleCard";

export { ModuleCard };

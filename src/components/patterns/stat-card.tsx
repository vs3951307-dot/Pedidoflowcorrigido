import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ElementType;
  trend?: { value: string; positive: boolean };
  className?: string;
}

/** StatCard — número grande em destaque, usado em Relatórios e no topo do Salão. */
export function StatCard({ label, value, hint, icon: Icon, trend, className }: StatCardProps) {
  return (
    <Card className={cn(className)}>
      <CardContent className="flex items-start justify-between gap-4 p-6 sm:p-7">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          <span className="font-mono text-4xl font-semibold tracking-[-0.01em] tabular">
            {value}
          </span>
          {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
          {trend && (
            <span
              className={cn(
                "text-sm font-semibold",
                trend.positive ? "text-status-free" : "text-status-occupied"
              )}
            >
              {trend.positive ? "↑" : "↓"} {trend.value}
            </span>
          )}
        </div>
        {Icon && (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-50">
            <Icon className="h-6 w-6 text-primary-700" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

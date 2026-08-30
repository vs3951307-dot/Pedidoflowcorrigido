import { cn } from "@/lib/utils";

export interface BarChartDatum {
  label: string;
  value: number;
  /** Barra em destaque (cor cheia da marca) — ex.: hora atual. */
  destaque?: boolean;
}

interface BarChartProps {
  data: BarChartDatum[];
  formatValue: (value: number) => string;
  /** Altura do corpo das barras (sem os rótulos), em px. */
  height?: number;
  className?: string;
}

/**
 * BarChart — gráfico de barras verticais em HTML/CSS (sem dependências),
 * com as cores do Design System. Barra em `destaque` usa o "Brasa" cheio;
 * as demais ficam em tom de marca suave e acendem no hover. Valores ficam
 * na dica nativa (hover/teclado) — gráfico de leitura rápida, sem ruído.
 */
export function BarChart({ data, formatValue, height = 208, className }: BarChartProps) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div
      className={cn("flex items-end gap-2 sm:gap-3", className)}
      style={{ height }}
      role="img"
      aria-label={`Gráfico de barras: ${data.map((d) => `${d.label} ${formatValue(d.value)}`).join("; ")}`}
    >
      {data.map((d) => (
        <div
          key={d.label}
          className="group flex h-full flex-1 flex-col items-center gap-2"
          title={`${d.label} — ${formatValue(d.value)}`}
        >
          <div className="flex w-full flex-1 items-end">
            <div
              className={cn(
                "w-full rounded-t-lg transition-colors duration-150",
                d.destaque
                  ? "bg-primary"
                  : "bg-primary/20 group-hover:bg-primary/45 group-focus-within:bg-primary/45"
              )}
              style={{ height: `${Math.max((d.value / max) * 100, 2)}%` }}
            />
          </div>
          <span className="text-xs font-medium text-muted-foreground tabular">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

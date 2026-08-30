import { cn } from "@/lib/utils";

export interface DonutSlice {
  label: string;
  value: number;
  /** Cor hexa dos tokens do DS (ver tailwind.config.ts). */
  cor: string;
}

interface DonutChartProps {
  data: DonutSlice[];
  formatValue: (value: number) => string;
  size?: number;
  thickness?: number;
  /** Rótulo curto no centro (ex.: "Hoje"). */
  centerLabel?: string;
  /** Valor no centro, já formatado. */
  centerValue?: string;
  className?: string;
}

/**
 * DonutChart — gráfico de rosca em SVG puro (sem dependências). A legenda
 * fica com o chamador (o donut mostra o total no centro). Cada fatia tem
 * dica nativa no hover. Cores hexa dos tokens do Design System.
 */
export function DonutChart({
  data,
  formatValue,
  size = 176,
  thickness = 26,
  centerLabel,
  centerValue,
  className,
}: DonutChartProps) {
  const total = data.reduce((acc, d) => acc + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;

  let acumulado = 0;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      role="img"
      aria-label={`Gráfico de rosca: ${data.map((d) => `${d.label} ${formatValue(d.value)}`).join("; ")}`}
    >
      {/* Trilha de fundo */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="hsl(var(--border))"
        strokeWidth={thickness}
      />

      {/* Fatias */}
      {data.map((d) => {
        const comprimento = (d.value / total) * c;
        const deslocamento = -acumulado;
        acumulado += comprimento;
        return (
          <circle
            key={d.label}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={d.cor}
            strokeWidth={thickness}
            strokeDasharray={`${comprimento} ${c - comprimento}`}
            strokeDashoffset={deslocamento}
            transform={`rotate(-90 ${cx} ${cy})`}
          >
            <title>
              {d.label}: {formatValue(d.value)} ({Math.round((d.value / total) * 100)}%)
            </title>
          </circle>
        );
      })}

      {/* Centro */}
      {centerValue && (
        <text
          x={cx}
          y={cy - (centerLabel ? 4 : -4)}
          textAnchor="middle"
          fontSize={22}
          fontWeight={700}
          fill="hsl(var(--foreground))"
          className="tabular"
          style={{ fontFamily: "inherit", fontVariantNumeric: "tabular-nums" }}
        >
          {centerValue}
        </text>
      )}
      {centerLabel && (
        <text
          x={cx}
          y={cy + 18}
          textAnchor="middle"
          fontSize={12}
          fill="hsl(var(--muted-foreground))"
          style={{ fontFamily: "inherit" }}
        >
          {centerLabel}
        </text>
      )}
    </svg>
  );
}

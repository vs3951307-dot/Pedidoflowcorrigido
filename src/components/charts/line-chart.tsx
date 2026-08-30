import { cn } from "@/lib/utils";

export interface LineChartSeries {
  nome: string;
  /** Cor hexa dos tokens do DS (ver tailwind.config.ts). */
  cor: string;
  valores: number[];
}

interface LineChartProps {
  labels: string[];
  series: LineChartSeries[];
  formatValue: (value: number) => string;
  className?: string;
}

const W = 640;
const H = 240;
const PAD = 10;

/**
 * LineChart — gráfico de linhas em SVG puro (sem dependências), com área
 * suave sob a primeira série, pontos visíveis e dica nativa por ponto.
 * As cores vêm dos tokens do Design System (hexa). Renderiza em qualquer
 * largura: o `viewBox` fixo escala com o contêiner.
 */
export function LineChart({ labels, series, formatValue, className }: LineChartProps) {
  const todosOsValores = series.flatMap((s) => s.valores);
  const max = Math.max(...todosOsValores, 1);
  const n = labels.length;

  const x = (i: number) => PAD + (i * (W - PAD * 2)) / Math.max(n - 1, 1);
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);

  // Rótulos do eixo X a cada ~2 posições (sem amontoar em telas pequenas).
  const passoRotulos = n > 8 ? 2 : 1;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={cn("h-auto w-full", className)}
      role="img"
      aria-label={`Gráfico de linhas: ${series.map((s) => s.nome).join(", ")}`}
    >
      {/* Linhas de grade horizontais */}
      {[0.25, 0.5, 0.75, 1].map((fracao) => (
        <line
          key={fracao}
          x1={PAD}
          x2={W - PAD}
          y1={y(max * fracao)}
          y2={y(max * fracao)}
          stroke="hsl(var(--border))"
          strokeWidth={1}
          strokeDasharray="3 5"
        />
      ))}

      {series.map((serie, sIdx) => {
        const pontos = serie.valores.map((v, i) => `${x(i)},${y(v)}`).join(" ");
        const area = `${PAD},${H - PAD} ${pontos} ${x(n - 1)},${H - PAD}`;

        return (
          <g key={serie.nome}>
            {sIdx === 0 && (
              <polygon points={area} fill={serie.cor} fillOpacity={0.08} stroke="none" />
            )}
            <polyline
              points={pontos}
              fill="none"
              stroke={serie.cor}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {serie.valores.map((v, i) => (
              <circle
                key={`${serie.nome}-${labels[i]}`}
                cx={x(i)}
                cy={y(v)}
                r={3.5}
                fill="hsl(var(--card))"
                stroke={serie.cor}
                strokeWidth={2.5}
              >
                <title>
                  {labels[i]} · {serie.nome}: {formatValue(v)}
                </title>
              </circle>
            ))}
          </g>
        );
      })}

      {/* Rótulos do eixo X */}
      {labels.map((label, i) =>
        i % passoRotulos === 0 || i === n - 1 ? (
          <text
            key={label}
            x={x(i)}
            y={H - 4}
            textAnchor="middle"
            fontSize={11}
            fill="hsl(var(--muted-foreground))"
            style={{ fontFamily: "inherit" }}
          >
            {label}
          </text>
        ) : null
      )}
    </svg>
  );
}

"use client";

import { toast } from "sonner";
import { BarChart3, Bike, Mail, MapPin, Star, Timer } from "lucide-react";

import { PageHeader } from "@/components/patterns/page-header";
import { StatCard } from "@/components/patterns/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart } from "@/components/charts/bar-chart";
import { cn, formatBRL } from "@/lib/utils";
import { useApi } from "@/lib/api-cliente";
import { ENTREGAS_SEMANA, RESUMO_ENTREGADOR, type EntregaDiaSemana } from "@/lib/entregador";
import { ENTREGADORES_RANKING, type EntregadorDesempenho, type ResumoRelatorio } from "@/lib/relatorios";

interface EntregaApi {
  id: string;
  pedidoId: string;
  numeroPedido: string;
  cliente: string;
  endereco: string;
  bairro: string;
  status: "preparo" | "rota" | "entregue" | "cancelada";
  previsao: string;
  km: number;
  gorjeta: number;
  entregador: string;
  criadoEm: string;
  concluidaEm: string | null;
  itens: { nome: string; quantidade: number; precoUnit: number }[];
  valor: number;
  pagamento: {
    id?: string;
    forma: string;
    valor: number;
    status: "confirmado" | "pendente" | "divergente";
  } | null;
}

interface RespostaEntregas {
  entregas: EntregaApi[];
}

const ENTREGAS_FALLBACK: RespostaEntregas = { entregas: [] };

interface RelatorioEntregadoresApi {
  resumo: ResumoRelatorio[];
  ranking: EntregadorDesempenho[];
  eu?: EntregadorDesempenho | null;
}

const RELATORIO_FALLBACK: RelatorioEntregadoresApi = {
  resumo: RESUMO_ENTREGADOR,
  ranking: ENTREGADORES_RANKING,
};

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function agruparPorDiaSemana(entregas: EntregaApi[]): EntregaDiaSemana[] {
  const porDia = new Array<number>(7).fill(0);
  for (const entrega of entregas) {
    porDia[new Date(entrega.criadoEm).getDay()] += 1;
  }
  return DIAS_SEMANA.map((dia, indice) => ({ dia, entregas: porDia[indice] }));
}

/**
 * Relatório — desempenho individual do entregador na semana: entregas
 * por dia, quilometragem, gorjetas e avaliação. Os totais vêm de
 * `GET /api/relatorios?visao=entregadores` (o servidor devolve apenas a
 * linha do usuário autenticado) e o gráfico semanal de
 * `GET /api/entregas` (só as próprias entregas).
 */
export default function RelatorioPage() {
  const relatorio = useApi<RelatorioEntregadoresApi>(
    "/api/relatorios?visao=entregadores",
    RELATORIO_FALLBACK
  );
  const entregas = useApi<RespostaEntregas>("/api/entregas", ENTREGAS_FALLBACK);

  const ricardo = relatorio.dados.eu ?? relatorio.dados.ranking[0] ?? null;

  const resumoPeriodo = [
    {
      label: "Entregas na semana",
      valor: `${ricardo?.entregas ?? 0}`,
      hint: "média de 11,9 por dia",
      icone: Bike,
      tendencia: { value: "6,1%", positive: true },
    },
    {
      label: "Quilômetros na semana",
      valor: `${ricardo?.km ?? 0} km`,
      hint: "frente à média de 148 km",
      icone: MapPin,
    },
    {
      label: "Gorjetas na semana",
      valor: formatBRL(ricardo?.gorjetas ?? 0),
      hint: "R$ 30,60 por dia em média",
      icone: Timer,
    },
    {
      label: "Avaliação média",
      valor: (ricardo?.avaliacao ?? 0).toFixed(1).replace(".", ","),
      hint: "87 avaliações recebidas",
      icone: Star,
      tendencia: { value: "0,1", positive: true },
    },
  ];

  const entregasSemana =
    entregas.dados.entregas.length > 0
      ? agruparPorDiaSemana(entregas.dados.entregas)
      : ENTREGAS_SEMANA;

  const melhorDia = entregasSemana.reduce((a, b) => (b.entregas > a.entregas ? b : a));

  const avaliacao = ricardo?.avaliacao ?? 4.8;
  const avaliacaoTexto = avaliacao.toFixed(1).replace(".", ",");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Meu relatório"
        description="Seu desempenho da semana — entregas, distância, gorjetas e avaliação."
        actions={
          <Button
            variant="outline"
            onClick={() =>
              toast.info(
                "Envio por e-mail ainda não está disponível — o PedidoFlow não tem um provedor de e-mail configurado neste momento.",
                { duration: 6000 }
              )
            }
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            Enviar por e-mail
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {resumoPeriodo.map((metrica) => (
          <StatCard
            key={metrica.label}
            label={metrica.label}
            value={metrica.valor}
            hint={metrica.hint}
            icon={metrica.icone}
            trend={metrica.tendencia}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <BarChart3 className="h-5 w-5 text-primary" aria-hidden="true" />
              Entregas por dia da semana
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Sábado foi o dia mais movimentado.
            </p>
          </CardHeader>
          <CardContent className="p-6 pt-4 sm:p-7 sm:pt-4">
            <BarChart
              data={entregasSemana.map((dia) => ({
                label: dia.dia,
                value: dia.entregas,
                destaque: dia.dia === melhorDia.dia,
              }))}
              formatValue={(v) => `${v} entregas`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Star className="h-5 w-5 text-primary" aria-hidden="true" />
              Avaliação dos clientes
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 p-6 pt-4 sm:p-7 sm:pt-4">
            <div className="flex items-end gap-2">
              <span className="font-mono text-6xl font-semibold tabular">{avaliacaoTexto}</span>
              <span className="pb-1.5 text-sm text-muted-foreground">/ 5,0</span>
            </div>
            <div className="flex gap-1" role="img" aria-label={`Avaliação ${avaliacaoTexto} de 5`}>
              {[1, 2, 3, 4, 5].map((estrela) => (
                <Star
                  key={estrela}
                  className={cn(
                    "h-6 w-6",
                    estrela <= Math.round(avaliacao) ? "fill-status-waiting text-status-waiting" : "fill-muted text-muted"
                  )}
                  aria-hidden="true"
                />
              ))}
            </div>
            <ul className="flex w-full flex-col gap-2.5 border-t border-border pt-4 text-sm">
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Melhor dia</span>
                <span className="font-semibold">
                  {melhorDia.dia} — {melhorDia.entregas} entregas
                </span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Tempo médio por entrega</span>
                <span className="font-semibold tabular">
                  {ricardo?.tempoMedio == null ? "—" : `${ricardo.tempoMedio} min`}
                </span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Pico de entregas</span>
                <span className="font-semibold tabular">19h – 21h</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

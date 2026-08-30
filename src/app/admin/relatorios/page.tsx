"use client";

import * as React from "react";
import { toast } from "sonner";
import { Bike, FileDown, FileText, LayoutGrid, PackageCheck, Pizza, Wallet } from "lucide-react";

import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-cliente";
import { PeriodoRelatorioProvider, type PeriodoRelatorio } from "./_lib/periodo-context";
import { RelatorioDelivery } from "./_components/relatorio-delivery";
import { RelatorioSalao } from "./_components/relatorio-salao";
import { RelatorioRetirada } from "./_components/relatorio-retirada";
import { RelatorioFinanceiro } from "./_components/relatorio-financeiro";
import { RelatorioProdutos } from "./_components/relatorio-produtos";
import { RelatorioEntregadores } from "./_components/relatorio-entregadores";

const PERIODOS: { valor: PeriodoRelatorio; rotulo: string }[] = [
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "7dias", rotulo: "7 dias" },
  { valor: "30dias", rotulo: "30 dias" },
  { valor: "90dias", rotulo: "90 dias" },
];

const ABAS = [
  { valor: "delivery", rotulo: "Delivery", icone: Bike },
  { valor: "salao", rotulo: "Salão", icone: LayoutGrid },
  { valor: "retirada", rotulo: "Retirada", icone: PackageCheck },
  { valor: "financeiro", rotulo: "Financeiro", icone: Wallet },
  { valor: "produtos", rotulo: "Produtos", icone: Pizza },
  { valor: "entregadores", rotulo: "Entregadores", icone: Bike },
];

interface RelatorioResumoApi {
  resumo?: { label: string; valor: string; hint?: string }[];
}

function csvEscapar(valor: string): string {
  if (/[",\n]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`;
  return valor;
}

function baixarArquivo(conteudo: string, nomeArquivo: string, tipo: string) {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Relatórios — seis visões consolidadas. Período e exportação eram
 * placeholder (o botão só mostrava um toast "vai vir com o backend").
 *
 * Exportação (CSV e PDF) usa os cartões de `resumo` — é o único formato
 * garantidamente presente e com o mesmo formato nas seis visões (ver
 * `GET /api/relatorios`). Não inclui as tabelas linha-a-linha de cada aba
 * (formatos diferentes por visão) para não arriscar um exportador
 * genérico que quebra silenciosamente numa delas.
 */
export default function RelatoriosPage() {
  const [periodo, setPeriodo] = React.useState<PeriodoRelatorio>("7dias");
  const [abaAtiva, setAbaAtiva] = React.useState("delivery");
  const [exportando, setExportando] = React.useState(false);

  async function buscarResumoAtual(): Promise<{ titulo: string; resumo: { label: string; valor: string; hint?: string }[] }> {
    const aba = ABAS.find((a) => a.valor === abaAtiva)!;
    const dados = await api<RelatorioResumoApi>(`/api/relatorios?visao=${abaAtiva}&periodo=${periodo}`);
    return { titulo: aba.rotulo, resumo: dados.resumo ?? [] };
  }

  async function exportarCSV() {
    setExportando(true);
    try {
      const { titulo, resumo } = await buscarResumoAtual();
      if (resumo.length === 0) {
        toast.error("Sem dados para exportar neste período.");
        return;
      }
      const linhas = ["Indicador,Valor,Observação", ...resumo.map((r) => [r.label, r.valor, r.hint ?? ""].map(csvEscapar).join(","))];
      baixarArquivo(linhas.join("\n"), `relatorio-${abaAtiva}-${periodo}.csv`, "text/csv;charset=utf-8");
      toast.success(`CSV de "${titulo}" gerado.`);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível exportar.");
    } finally {
      setExportando(false);
    }
  }

  async function exportarPDF() {
    setExportando(true);
    try {
      const { titulo, resumo } = await buscarResumoAtual();
      if (resumo.length === 0) {
        toast.error("Sem dados para exportar neste período.");
        return;
      }
      const janela = window.open("", "_blank", "width=800,height=900");
      if (!janela) {
        toast.error("O navegador bloqueou a janela de impressão — permita pop-ups para este site.");
        return;
      }
      const rotuloPeriodo = PERIODOS.find((p) => p.valor === periodo)?.rotulo ?? periodo;
      const linhas = resumo
        .map(
          (r) =>
            `<tr><td>${r.label}</td><td style="text-align:right;font-weight:600">${r.valor}</td><td style="color:#666">${r.hint ?? ""}</td></tr>`
        )
        .join("");
      janela.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
        <title>Relatório ${titulo} — PedidoFlow</title>
        <style>
          body { font-family: system-ui, sans-serif; padding: 32px; color: #1a1a1a; }
          h1 { font-size: 20px; margin-bottom: 4px; }
          p.periodo { color: #666; margin-top: 0; margin-bottom: 24px; }
          table { width: 100%; border-collapse: collapse; }
          td { padding: 10px 8px; border-bottom: 1px solid #e5e5e5; }
        </style>
      </head><body>
        <h1>Relatório — ${titulo}</h1>
        <p class="periodo">Período: ${rotuloPeriodo} · Gerado em ${new Date().toLocaleString("pt-BR")}</p>
        <table>${linhas}</table>
      </body></html>`);
      janela.document.close();
      // Aguarda o layout da nova janela renderizar antes de chamar print()
      // — chamar antes disso costuma abrir a caixa de diálogo com página em branco.
      janela.onload = () => janela.print();
      setTimeout(() => janela.print(), 300);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível gerar o PDF.");
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Relatórios"
        description="Visão consolidada por canal e por tema."
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={exportando}>
                <FileDown className="h-4 w-4" aria-hidden="true" />
                Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={exportarCSV}>
                <FileDown className="h-4 w-4" aria-hidden="true" />
                Exportar CSV (resumo)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={exportarPDF}>
                <FileText className="h-4 w-4" aria-hidden="true" />
                Exportar PDF (resumo)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <div
        className="mb-6 flex w-fit flex-wrap gap-1 rounded-xl bg-muted p-1"
        role="group"
        aria-label="Período do relatório"
      >
        {PERIODOS.map((p) => (
          <button
            key={p.valor}
            onClick={() => setPeriodo(p.valor)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10",
              p.valor === periodo
                ? "bg-card text-foreground shadow-soft"
                : "text-muted-foreground hover:text-foreground"
            )}
            aria-pressed={p.valor === periodo}
          >
            {p.rotulo}
          </button>
        ))}
      </div>

      <PeriodoRelatorioProvider periodo={periodo}>
        <Tabs defaultValue="delivery" onValueChange={setAbaAtiva}>
          <TabsList className="h-auto w-full flex-wrap gap-1 rounded-xl p-1.5 sm:w-fit">
            {ABAS.map((aba) => {
              const Icon = aba.icone;
              return (
                <TabsTrigger key={aba.valor} value={aba.valor} className="gap-2 px-4 py-2">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {aba.rotulo}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="delivery" className="mt-6">
            <RelatorioDelivery />
          </TabsContent>
          <TabsContent value="salao" className="mt-6">
            <RelatorioSalao />
          </TabsContent>
          <TabsContent value="retirada" className="mt-6">
            <RelatorioRetirada />
          </TabsContent>
          <TabsContent value="financeiro" className="mt-6">
            <RelatorioFinanceiro />
          </TabsContent>
          <TabsContent value="produtos" className="mt-6">
            <RelatorioProdutos />
          </TabsContent>
          <TabsContent value="entregadores" className="mt-6">
            <RelatorioEntregadores />
          </TabsContent>
        </Tabs>
      </PeriodoRelatorioProvider>
    </div>
  );
}

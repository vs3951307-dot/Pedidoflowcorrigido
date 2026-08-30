"use client";

import React from "react";
import { toast } from "sonner";
import { Eye, Printer, RotateCcw, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/patterns/empty-state";
import { api, useApi } from "@/lib/api-cliente";
import { cn } from "@/lib/utils";
import { VisualizacaoImpressao } from "./visualizacao-impressao";

interface ItemFila {
  id: string;
  tipo: string;
  destino: string;
  referencia: string;
  vias: number;
  status: string;
  tentativas: number;
  erro: string | null;
  criadoPor: string | null;
  criadoEm: string;
  concluidoEm: string | null;
  conteudo: string;
}

interface FilaApi {
  itens: ItemFila[];
}

const ROTULOS_TIPO: Record<string, string> = {
  "pedido-cozinha": "Comanda cozinha",
  "pedido-balcao": "Comanda balcão",
  retirada: "Comanda retirada",
  delivery: "Comanda delivery",
  cupom: "Cupom do cliente",
  "fechamento-caixa": "Fechamento de caixa",
  teste: "Teste de impressão",
};

const CONFIG_STATUS: Record<string, { label: string; classes: string }> = {
  pendente: {
    label: "Pendente",
    classes: "bg-status-waiting-bg text-status-waiting border-status-waiting-border",
  },
  processando: {
    label: "Processando",
    classes: "bg-primary-50 text-primary-700 border-primary-200",
  },
  concluido: {
    label: "Concluída",
    classes: "bg-status-free-bg text-status-free border-status-free-border",
  },
  erro: {
    label: "Erro",
    classes: "bg-status-occupied-bg text-status-occupied border-status-occupied-border",
  },
  cancelado: {
    label: "Cancelada",
    classes: "bg-muted text-muted-foreground border-border",
  },
};

function rotuloReferencia(referencia: string, tipo: string): string {
  if (tipo === "teste") return "Impressora";
  if (referencia.startsWith("pedido:")) return `Pedido nº ${referencia.slice(7)}`;
  if (referencia.startsWith("caixa:")) return "Fechamento de caixa";
  return referencia;
}

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Painel da fila de impressão: status de cada item, visualização 80 mm
 * no navegador, reimpressão manual e cancelamento (admin). Atualiza
 * sozinho a cada 10 s enquanto aberto.
 */
export function FilaImpressao({ destino }: { destino?: "cozinha" | "caixa" }) {
  const { dados, recarregar } = useApi<FilaApi>(
    `/api/impressao${destino ? `?destino=${destino}` : ""}`,
    { itens: [] }
  );

  // Polling leve enquanto o painel está aberto (o agente externo
  // também pode concluir itens a qualquer momento).
  React.useEffect(() => {
    const id = window.setInterval(recarregar, 10_000);
    return () => window.clearInterval(id);
  }, [recarregar]);

  const [visualizado, setVisualizado] = React.useState<ItemFila | null>(null);
  const [ocupado, setOcupado] = React.useState(false);

  const reimprimir = async (item: ItemFila) => {
    setOcupado(true);
    try {
      const resposta = await api<{ ok: boolean }>("/api/impressao", {
        method: "POST",
        body: JSON.stringify({ tipo: item.tipo, referencia: item.referencia }),
      });
      toast.success(resposta.ok ? "Reimpressão enfileirada." : "Não foi possível reimprimir.");
      recarregar();
    } catch {
      toast.error("Falha ao enfileirar a reimpressão.");
    } finally {
      setOcupado(false);
    }
  };

  const cancelar = async (item: ItemFila) => {
    setOcupado(true);
    try {
      await api<{ ok: boolean }>(`/api/impressao/${item.id}/cancelar`, { method: "POST" });
      toast.success("Impressão cancelada.");
      recarregar();
    } catch {
      toast.error("Somente o administrador pode cancelar impressões.");
    } finally {
      setOcupado(false);
    }
  };

  if (dados.itens.length === 0) {
    return (
      <EmptyState
        title="Nenhuma impressão na fila"
        description="Comandas, cupons e fechamentos de caixa aparecem aqui com o status de cada envio."
      />
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {dados.itens.map((item) => {
          const cfg = CONFIG_STATUS[item.status] ?? CONFIG_STATUS.pendente;
          const pendenteOuErro = item.status === "pendente" || item.status === "erro";
          return (
            <Card key={item.id} className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {ROTULOS_TIPO[item.tipo] ?? item.tipo}
                    <Badge variant="outline" className={cn("border", cfg.classes)}>
                      {cfg.label}
                    </Badge>
                    {item.vias > 1 && (
                      <span className="text-xs font-normal text-muted-foreground">{item.vias} vias</span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {rotuloReferencia(item.referencia, item.tipo)} · destino{" "}
                    {item.destino === "cozinha" ? "cozinha" : "caixa"} · {formatarData(item.criadoEm)}
                  </p>
                  {item.tentativas > 0 && (
                    <p className="text-xs text-muted-foreground">{item.tentativas} tentativa(s)</p>
                  )}
                  {item.erro && (
                    <p className="text-xs font-medium text-status-occupied">{item.erro}</p>
                  )}
                  {item.status === "concluido" && (
                    <p className="text-xs text-muted-foreground">Concluída às {formatarData(item.concluidoEm)}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setVisualizado(item)}>
                    <Eye className="h-4 w-4" aria-hidden="true" />
                    Visualizar
                  </Button>
                  {pendenteOuErro && (
                    <>
                      <Button size="sm" variant="outline" disabled={ocupado} onClick={() => reimprimir(item)}>
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                        Reimprimir
                      </Button>
                      <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => cancelar(item)}>
                        <XCircle className="h-4 w-4" aria-hidden="true" />
                        Cancelar
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {item.status === "pendente" && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                  Aguardando o agente de impressão local.
                </p>
              )}
            </Card>
          );
        })}
      </div>

      {visualizado && (
        <VisualizacaoImpressao
          aberto
          aoFechar={() => setVisualizado(null)}
          titulo={ROTULOS_TIPO[visualizado.tipo] ?? visualizado.tipo}
          conteudo={visualizado.conteudo}
        />
      )}
    </>
  );
}

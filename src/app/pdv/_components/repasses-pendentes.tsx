"use client";

import * as React from "react";
import { toast } from "sonner";
import { HandCoins } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/utils";
import { api, useApi } from "@/lib/api-cliente";

interface PagamentoPendente {
  id: string;
  valor: number;
  pedidoNumero: number;
  mesaNumero: number | null;
  criadoEm: string;
}

interface RepassesApi {
  totalPendente: number;
  porPessoa: { recebidoPorId: string; recebidoPorNome: string; total: number; pagamentos: PagamentoPendente[] }[];
}

const FALLBACK: RepassesApi = { totalPendente: 0, porPessoa: [] };

/**
 * Repasses pendentes (PEDIDO 12): dinheiro que um Garçom recebeu numa
 * mesa pelo celular e ainda não entregou ao Caixa. Mostra quanto cada
 * garçom está com em mãos; o Caixa confirma quando recebe de verdade.
 */
export function RepassesPendentes() {
  const { dados, recarregar } = useApi<RepassesApi>("/api/caixa/repasses", FALLBACK);
  const [confirmando, setConfirmando] = React.useState<string | null>(null);

  async function confirmarRepasse(recebidoPorId: string, pagamentoIds: string[]) {
    setConfirmando(recebidoPorId);
    try {
      await api("/api/caixa/repasses", { method: "POST", body: JSON.stringify({ pagamentoIds }) });
      toast.success("Repasse confirmado.");
      recarregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao confirmar repasse.");
    } finally {
      setConfirmando(null);
    }
  }

  if (dados.porPessoa.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 p-5 pb-2">
        <HandCoins className="h-5 w-5 text-primary" aria-hidden="true" />
        <CardTitle className="text-base">Dinheiro para repassar ao caixa</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 p-5 pt-2">
        {dados.porPessoa.map((pessoa) => (
          <div
            key={pessoa.recebidoPorId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
          >
            <div>
              <p className="font-semibold text-foreground">{pessoa.recebidoPorNome}</p>
              <p className="text-sm text-muted-foreground">
                {pessoa.pagamentos.length} pagamento(s) em dinheiro ·{" "}
                {pessoa.pagamentos
                  .map((p) => `Pedido #${p.pedidoNumero}${p.mesaNumero ? ` (mesa ${p.mesaNumero})` : ""}`)
                  .join(", ")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold tabular text-foreground">{formatBRL(pessoa.total)}</span>
              <Button
                size="sm"
                disabled={confirmando === pessoa.recebidoPorId}
                onClick={() => confirmarRepasse(pessoa.recebidoPorId, pessoa.pagamentos.map((p) => p.id))}
              >
                Confirmar recebido
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

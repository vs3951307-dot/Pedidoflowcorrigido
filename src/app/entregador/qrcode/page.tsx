"use client";

import * as React from "react";
import { toast } from "sonner";
import { QrCode, ShieldCheck, Wallet, Loader2 } from "lucide-react";

import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatBRL } from "@/lib/utils";
import { api, useApi } from "@/lib/api-cliente";
import { CodigoQr } from "@/components/patterns/codigo-qr";

const PASSOS = [
  {
    titulo: "Exiba o QR Code",
    descricao: "Mostre a tela para o cliente conferir o pedido e o valor.",
  },
  {
    titulo: "Cliente paga por fora",
    descricao: "Pix do celular dele, dinheiro ou cartão — o pagamento acontece fora do PedidoFlow.",
  },
  {
    titulo: "Confirme manualmente",
    descricao: "Só depois de receber de verdade, toque em \"Confirmar pagamento\".",
  },
];

const FORMA_LABEL: Record<string, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  cartao: "Cartão",
  credito: "Crédito",
  debito: "Débito",
};

interface EntregaApi {
  id: string;
  numeroPedido: number;
  cliente: string;
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

/**
 * QR Code — tela de cobrança na entrega. Mostra a próxima entrega em
 * rota com pagamento pendente e um QR real (mesma biblioteca do QR de
 * confirmação de entrega) codificando os dados do pedido. A confirmação
 * do pagamento usa a API real (`PATCH /api/pagamentos/:id`) — a mesma
 * usada pelo botão equivalente no PDV.
 *
 * NOTA: o QR aqui identifica o pedido/valor para o cliente conferir —
 * não é (ainda) um BR Code Pix bancário validado pelo Bacen; isso exige
 * as credenciais financeiras da empresa (chave Pix, banco) e fica para
 * quando essa integração for priorizada.
 */
export default function QrCodePage() {
  const { dados, recarregar } = useApi<RespostaEntregas>("/api/entregas?status=rota", ENTREGAS_FALLBACK);
  const [confirmando, setConfirmando] = React.useState(false);

  const comPagamentoPendente = dados.entregas.filter((e) => e.pagamento && e.pagamento.status === "pendente");
  const entrega = comPagamentoPendente[0] ?? null;

  async function confirmarPagamento() {
    if (!entrega?.pagamento?.id) return;
    setConfirmando(true);
    try {
      await api(`/api/pagamentos/${entrega.pagamento.id}`, { method: "PATCH", body: JSON.stringify({}) });
      toast.success(`Pagamento do pedido #${entrega.numeroPedido} confirmado!`);
      recarregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao confirmar pagamento.");
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="QR Code"
        description="Confirmação manual do pagamento na entrega — o QR só identifica o pedido."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <QrCode className="h-5 w-5 text-primary" aria-hidden="true" />
              Confira o pedido com o cliente
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Próxima entrega da rota com pagamento pendente.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6 p-6 pt-4 sm:p-7 sm:pt-4">
            {!entrega ? (
              <EmptyState
                icon={Wallet}
                title="Nenhum pagamento pendente"
                description="Todas as entregas em rota já estão pagas ou não há entregas no momento."
              />
            ) : (
              <>
                <div className="flex w-full flex-col items-center gap-2 rounded-2xl border border-border bg-card p-6 sm:flex-row sm:justify-center sm:gap-8">
                  <CodigoQr
                    valor={`pedidoflow:v1:pedido:${entrega.numeroPedido}:${entrega.valor.toFixed(2)}`}
                    tamanho={176}
                    className="rounded-xl border border-border"
                  />
                  <div className="flex flex-col items-center gap-1 text-center sm:items-start sm:text-left">
                    <span className="text-sm text-muted-foreground">Pedido</span>
                    <span className="font-mono text-2xl font-semibold tabular">
                      #{String(entrega.numeroPedido).padStart(3, "0")}
                    </span>
                    <span className="text-sm text-muted-foreground">{entrega.cliente}</span>
                    <span className="mt-2 font-mono text-3xl font-semibold tabular">
                      {formatBRL(entrega.valor)}
                    </span>
                    <span className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-status-waiting-border bg-status-waiting-bg px-3 py-1 text-xs font-semibold text-status-waiting">
                      <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                      {FORMA_LABEL[entrega.pagamento?.forma ?? "pix"] ?? "Pix"} · aguardando confirmação
                    </span>
                  </div>
                </div>
                <div className="flex w-full flex-col gap-3 sm:flex-row">
                  <Button className="flex-1" onClick={() => void confirmarPagamento()} disabled={confirmando}>
                    {confirmando ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    )}
                    Confirmar pagamento
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={() => recarregar()}>
                    <QrCode className="h-4 w-4" aria-hidden="true" />
                    Atualizar
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
              Como funciona
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5 p-6 pt-4 sm:p-7 sm:pt-4">
            {PASSOS.map((passo, indice) => (
              <div key={passo.titulo} className="flex gap-3">
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                    "bg-primary-50 text-primary-700"
                  )}
                >
                  {indice + 1}
                </span>
                <div>
                  <p className="text-sm font-semibold">{passo.titulo}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{passo.descricao}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

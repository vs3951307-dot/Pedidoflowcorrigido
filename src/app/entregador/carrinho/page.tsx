"use client";

import { toast } from "sonner";
import { Banknote, CheckCheck, CreditCard, MapPin, Navigation, PackageCheck, ShoppingBag } from "lucide-react";

import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatBRL } from "@/lib/utils";
import { api, useApi } from "@/lib/api-cliente";
import { CARRINHO_ENTREGAS, type PedidoCarrinho } from "@/lib/entregador";

const FORMA_PAGAMENTO_CONFIG = {
  pix: {
    rotulo: "Pix",
    classes: "bg-status-free-bg text-status-free border-status-free-border",
    icone: Banknote,
  },
  dinheiro: {
    rotulo: "Dinheiro",
    classes: "bg-status-waiting-bg text-status-waiting border-status-waiting-border",
    icone: Banknote,
  },
  cartao: {
    rotulo: "Cartão",
    classes: "bg-status-sent-bg text-status-sent border-status-sent-border",
    icone: CreditCard,
  },
} as const;

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

interface PedidoCarrinhoRota extends PedidoCarrinho {
  entregaId?: string;
  statusEntrega?: "preparo" | "rota" | "entregue" | "cancelada";
}

const FORMA_CARTAO: Record<string, PedidoCarrinho["forma"]> = {
  pix: "pix",
  dinheiro: "dinheiro",
  cartao: "cartao",
  credito: "cartao",
  debito: "cartao",
};

function mapearPedidos(entregas: EntregaApi[]): PedidoCarrinhoRota[] {
  return entregas
    .filter((entrega) => entrega.status !== "cancelada")
    .map((entrega) => ({
      id: entrega.numeroPedido,
      entregaId: entrega.id,
      cliente: entrega.cliente,
      endereco: entrega.endereco,
      bairro: entrega.bairro,
      itens: entrega.itens.reduce((total, item) => total + item.quantidade, 0),
      valor: entrega.valor,
      forma: FORMA_CARTAO[entrega.pagamento?.forma ?? "pix"] ?? "pix",
      status: entrega.status === "entregue" ? "entregue" : "a_entregar",
      statusEntrega: entrega.status,
    }));
}

/**
 * Carrinho — entregas atribuídas ao entregador nesta rota, com endereço,
 * valor e forma de pagamento de cada pedido. Os pedidos vêm de
 * `GET /api/entregas`, com fallback dos mocks de
 * `src/lib/entregador.ts`; a confirmação usa `PATCH /api/entregas/[id]`.
 */
export default function CarrinhoPage() {
  const { dados, recarregar } = useApi<RespostaEntregas>(
    "/api/entregas",
    ENTREGAS_FALLBACK
  );

  const pedidos: PedidoCarrinhoRota[] =
    dados.entregas.length > 0 ? mapearPedidos(dados.entregas) : CARRINHO_ENTREGAS;

  const valorTotal = pedidos.reduce(
    (acc, pedido) => acc + (pedido.status === "a_entregar" ? pedido.valor : 0),
    0
  );

  function confirmarEntrega(pedido: PedidoCarrinhoRota) {
    const entregaId = pedido.entregaId;
    if (!entregaId) {
      toast.info("Confirmação indisponível no modo demonstração.");
      return;
    }
    api(`/api/entregas/${entregaId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "entregue" }),
    })
      .then(() => {
        toast.success(`Entrega ${pedido.id} confirmada.`);
        recarregar();
      })
      .catch((erro: Error) => toast.error(erro.message));
  }

  function iniciarEntrega(pedido: PedidoCarrinhoRota) {
    const entregaId = pedido.entregaId;
    if (!entregaId) {
      toast.info("Ação indisponível no modo demonstração.");
      return;
    }
    api(`/api/entregas/${entregaId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "rota" }),
    })
      .then(() => {
        toast.success(`Pedido ${pedido.id} saiu para entrega.`);
        recarregar();
      })
      .catch((erro: Error) => toast.error(erro.message));
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Carrinho de entregas"
        description={`${pedidos.filter((p) => p.status === "a_entregar").length} pedidos na rota · ${formatBRL(valorTotal)} a receber.`}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {pedidos.map((pedido) => {
          const forma = FORMA_PAGAMENTO_CONFIG[pedido.forma];
          const FormaIcone = forma.icone;
          return (
            <Card
              key={pedido.id}
              className={cn(pedido.status === "entregue" && "opacity-70")}
            >
              <CardHeader className="p-5 pb-0 sm:p-6 sm:pb-0">
                <CardTitle className="flex items-center justify-between gap-2 text-lg">
                  <span className="flex items-center gap-2">
                    {pedido.status === "entregue" ? (
                      <CheckCheck className="h-5 w-5 text-status-free" aria-hidden="true" />
                    ) : (
                      <ShoppingBag className="h-5 w-5 text-primary" aria-hidden="true" />
                    )}
                    <span className="tabular">{pedido.id}</span>
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
                      pedido.status === "entregue"
                        ? "bg-status-free-bg text-status-free border-status-free-border"
                        : "bg-status-sent-bg text-status-sent border-status-sent-border"
                    )}
                  >
                    {pedido.status === "entregue" ? "Entregue" : "A entregar"}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 p-5 pt-3 sm:p-6 sm:pt-3">
                <div>
                  <p className="font-semibold">{pedido.cliente}</p>
                  <p className="mt-0.5 flex items-start gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    {pedido.endereco} · {pedido.bairro}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground tabular">{pedido.itens} itens</span>
                  <span className="font-mono text-xl font-semibold tabular">
                    {formatBRL(pedido.valor)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
                      forma.classes
                    )}
                  >
                    <FormaIcone className="h-3.5 w-3.5" aria-hidden="true" />
                    {forma.rotulo}
                  </span>
                  {pedido.status === "a_entregar" && (
                    <>
                      {pedido.statusEntrega === "preparo" && (
                        <Button size="sm" variant="outline" onClick={() => iniciarEntrega(pedido)}>
                          <Navigation className="h-4 w-4" aria-hidden="true" />
                          Iniciar entrega
                        </Button>
                      )}
                      <Button
                        size="sm"
                        onClick={() => confirmarEntrega(pedido)}
                        disabled={pedido.statusEntrega === "preparo"}
                        title={pedido.statusEntrega === "preparo" ? "Inicie a entrega primeiro" : undefined}
                      >
                        <PackageCheck className="h-4 w-4" aria-hidden="true" />
                        Confirmar entrega
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

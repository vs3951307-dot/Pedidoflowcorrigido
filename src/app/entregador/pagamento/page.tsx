"use client";

import * as React from "react";
import { toast } from "sonner";
import { AlertTriangle, Banknote, CheckCheck, CreditCard, Landmark, Timer, Wallet } from "lucide-react";

import { PageHeader } from "@/components/patterns/page-header";
import { StatCard } from "@/components/patterns/stat-card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { cn, formatBRL, formatHora } from "@/lib/utils";
import { api, useApi } from "@/lib/api-cliente";
import { PAGAMENTOS_ENTREGADOR } from "@/lib/entregador";

const FORMA_ICONE = {
  pix: Banknote,
  dinheiro: Banknote,
  cartao: CreditCard,
} as const;

const STATUS_PAGAMENTO_CONFIG = {
  confirmado: {
    label: "Confirmado",
    classes: "bg-status-free-bg text-status-free border-status-free-border",
    dot: "bg-status-free",
  },
  pendente: {
    label: "A confirmar",
    classes: "bg-status-waiting-bg text-status-waiting border-status-waiting-border",
    dot: "bg-status-waiting",
  },
  divergente: {
    label: "Divergente",
    classes: "bg-status-occupied-bg text-status-occupied border-status-occupied-border",
    dot: "bg-status-occupied",
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

interface PagamentoRota {
  id: string;
  pedido: string;
  cliente: string;
  forma: "pix" | "dinheiro" | "cartao";
  valor: number;
  hora: string;
  status: "confirmado" | "pendente" | "divergente";
}

const FORMA_CARTAO: Record<string, PagamentoRota["forma"]> = {
  pix: "pix",
  dinheiro: "dinheiro",
  cartao: "cartao",
  credito: "cartao",
  debito: "cartao",
};

function mapearPagamentos(entregas: EntregaApi[]): PagamentoRota[] {
  const pagamentos: PagamentoRota[] = [];
  for (const entrega of entregas) {
    const pagamento = entrega.pagamento;
    if (!pagamento) continue;
    pagamentos.push({
      id: pagamento.id ?? entrega.id,
      pedido: entrega.numeroPedido,
      cliente: entrega.cliente,
      forma: FORMA_CARTAO[pagamento.forma] ?? "pix",
      valor: pagamento.valor,
      hora: formatHora(new Date(entrega.criadoEm)),
      status: pagamento.status,
    });
  }
  return pagamentos;
}

const soma = (lista: PagamentoRota[]) => lista.reduce((acc, p) => acc + p.valor, 0);

/**
 * Pagamento — recebimentos feitos na entrega (pix, dinheiro, cartão).
 * Cada cobrança entra nesta lista com situação própria. Os pagamentos
 * vêm do campo `pagamento` de `GET /api/entregas`,
 * com fallback dos mocks de `src/lib/entregador.ts`; a confirmação usa
 * `PATCH /api/pagamentos/[id]` (sem id próprio no contrato, usa o id da
 * entrega).
 */
export default function PagamentoPage() {
  const { dados, recarregar } = useApi<RespostaEntregas>(
    "/api/entregas",
    ENTREGAS_FALLBACK
  );
  const [repasseAberto, setRepasseAberto] = React.useState(false);
  const repasse = useApi<{ total: number; pagamentos: { id: string; valor: number; pedidoNumero: number; criadoEm: string }[] }>(
    "/api/entregas/repasse",
    { total: 0, pagamentos: [] }
  );

  const pagamentos: PagamentoRota[] =
    dados.entregas.length > 0 ? mapearPagamentos(dados.entregas) : PAGAMENTOS_ENTREGADOR;

  const confirmados = pagamentos.filter((p) => p.status === "confirmado");
  const pendentes = pagamentos.filter((p) => p.status === "pendente");
  const divergentes = pagamentos.filter((p) => p.status === "divergente");

  const resumo = [
    {
      label: "Recebido hoje",
      valor: formatBRL(soma(confirmados)),
      hint: `${confirmados.length} pagamentos confirmados`,
      icone: Wallet,
    },
    {
      label: "A confirmar",
      valor: formatBRL(soma(pendentes)),
      hint: `${pendentes.length} pagamentos pendentes`,
      icone: Timer,
    },
    {
      label: "Divergências",
      valor: formatBRL(soma(divergentes)),
      hint: `${divergentes.length} pagamento(s) para conferir`,
      icone: AlertTriangle,
    },
    {
      label: "Total do dia",
      valor: formatBRL(soma(pagamentos)),
      hint: "confirmados + pendentes",
      icone: Landmark,
    },
  ];

  function confirmarPagamento(pagamento: PagamentoRota) {
    api(`/api/pagamentos/${pagamento.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "confirmado" }),
    })
      .then(() => {
        toast.success(`Pagamento ${pagamento.id} confirmado.`);
        recarregar();
      })
      .catch((erro: Error) => toast.error(erro.message));
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pagamentos"
        description="Cobranças recebidas na rota de hoje — confirme cada uma ao entregar."
        actions={
          <Button
            variant="outline"
            onClick={() => setRepasseAberto(true)}
          >
            <Landmark className="h-4 w-4" aria-hidden="true" />
            Repasse do dia
          </Button>
        }
      />

      <Dialog open={repasseAberto} onOpenChange={setRepasseAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dinheiro para repassar ao caixa</DialogTitle>
            <DialogDescription>
              Isto é só consulta — quem confirma o recebimento é o Caixa, na tela dele.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-2xl font-bold tabular text-foreground">
              {formatBRL(repasse.dados.total)}
            </p>
            {repasse.dados.pagamentos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum valor em dinheiro pendente de repasse no momento.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {repasse.dados.pagamentos.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <span className="text-muted-foreground">Pedido #{p.pedidoNumero}</span>
                    <span className="font-semibold tabular">{formatBRL(p.valor)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {resumo.map((metrica) => (
          <StatCard
            key={metrica.label}
            label={metrica.label}
            value={metrica.valor}
            hint={metrica.hint}
            icon={metrica.icone}
          />
        ))}
      </div>

      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Banknote className="h-5 w-5 text-primary" aria-hidden="true" />
            Cobranças da rota
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Lista de pagamentos na ordem das entregas.
          </p>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cobrança</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Forma</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Hora</TableHead>
                <TableHead className="text-right">Status</TableHead>
                <TableHead className="w-28 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagamentos.map((pagamento) => {
                const cfg = STATUS_PAGAMENTO_CONFIG[pagamento.status];
                const IconeForma = FORMA_ICONE[pagamento.forma];
                return (
                  <TableRow key={pagamento.id}>
                    <TableCell className="font-medium tabular">{pagamento.id}</TableCell>
                    <TableCell className="tabular">{pagamento.pedido}</TableCell>
                    <TableCell>{pagamento.cliente}</TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium capitalize">
                        <IconeForma className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        {pagamento.forma}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular">
                      {formatBRL(pagamento.valor)}
                    </TableCell>
                    <TableCell className="text-right tabular">{pagamento.hora}</TableCell>
                    <TableCell className="text-right">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
                          cfg.classes
                        )}
                      >
                        <span className={cn("h-2 w-2 rounded-full", cfg.dot)} aria-hidden="true" />
                        {cfg.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {pagamento.status === "confirmado" ? (
                        <span className="inline-flex items-center gap-1 text-sm text-status-free">
                          <CheckCheck className="h-4 w-4" aria-hidden="true" />
                          Ok
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant={pagamento.status === "divergente" ? "outline" : "primary"}
                          onClick={() => confirmarPagamento(pagamento)}
                        >
                          {pagamento.status === "divergente" ? "Conferir" : "Confirmar"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

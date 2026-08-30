"use client";

import * as React from "react";
import { toast } from "sonner";
import { CheckCircle2, Package, Plus, Phone, Trash2, UtensilsCrossed } from "lucide-react";

import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { ItemPedidoRow } from "@/components/patterns/item-pedido-row";
import { ConfirmarAcao } from "@/components/patterns/confirmar-acao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { cn, formatBRL, formatHora } from "@/lib/utils";
import { calcularTotais, type ItemPedido, type Produto, type SelecaoPizza } from "@/lib/catalogo";
import { CatalogoProdutos } from "@/app/pdv/_components/catalogo-produtos";
import {
  useRetirada,
  type PedidoRetirada,
  type StatusRetirada,
} from "@/app/pdv/_lib/retirada-context";
import { useCobranca } from "@/app/pdv/_lib/use-cobranca";
import { PagamentoDialog } from "@/app/pdv/_components/pagamento-dialog";
import { NfceDialog } from "@/app/pdv/_components/nfce-dialog";

const STATUS_CONFIG: Record<
  StatusRetirada,
  { label: string; badge: string; dot: string }
> = {
  pendente: {
    label: "Pendente",
    badge: "bg-status-waiting-bg text-status-waiting border-status-waiting-border",
    dot: "bg-status-waiting",
  },
  pronto: {
    label: "Pronto",
    badge: "bg-status-sent-bg text-status-sent border-status-sent-border",
    dot: "bg-status-sent",
  },
  retirado: {
    label: "Retirado",
    badge: "bg-status-free-bg text-status-free border-status-free-border",
    dot: "bg-status-free",
  },
};

const FILTROS: { value: "todos" | StatusRetirada; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "pendente", label: "Pendentes" },
  { value: "pronto", label: "Prontos" },
  { value: "retirado", label: "Retirados" },
];

/**
 * RetiradaView — pedidos para o cliente levar (pizza para viagem): criar
 * pedido com o catálogo, cobrar na hora (fluxo comum → caixa + NFC-e) e
 * acompanhar o status até a retirada.
 */
export function RetiradaView() {
  const { pedidos, adicionarPedido, marcarPronto, marcarRetirado, cancelarPedido } =
    useRetirada();
  const cobranca = useCobranca();

  const [filtro, setFiltro] = React.useState<(typeof FILTROS)[number]["value"]>("todos");
  const [novoAberto, setNovoAberto] = React.useState(false);

  // Rascunho do novo pedido de retirada
  const [nomeCliente, setNomeCliente] = React.useState("");
  const [itensRascunho, setItensRascunho] = React.useState<ItemPedido[]>([]);
  const [observacao, setObservacao] = React.useState("");

  const { total: totalRascunho, totalItens } = calcularTotais(itensRascunho);

  const pedidosFiltrados =
    filtro === "todos" ? pedidos : pedidos.filter((p) => p.status === filtro);

  function handleAdicionarProduto(produto: Produto, escolha?: SelecaoPizza) {
    setItensRascunho((prev) => {
      const novo: ItemPedido = {
        uid: `${produto.id}-${Date.now()}-${Math.random()}`,
        produtoId: produto.id,
        nome: escolha?.nome ?? produto.nome,
        precoUnit: escolha?.precoUnit ?? produto.preco,
        quantidade: escolha?.quantidade ?? 1,
        observacao: escolha?.observacao,
        tamanhoId: escolha?.tamanhoId,
        tamanhoNome: escolha?.tamanhoNome,
        sabores: escolha?.sabores,
        adicionais: escolha?.adicionais,
      };
      const chave = (i: ItemPedido) =>
        [
          i.produtoId,
          i.tamanhoNome ?? "",
          i.nome,
          i.precoUnit,
          JSON.stringify(i.sabores ?? null),
          JSON.stringify(i.adicionais ?? null),
          i.observacao ?? "",
        ].join("|");
      const existente = prev.find((i) => chave(i) === chave(novo));
      if (existente) {
        return prev.map((i) =>
          i.uid === existente.uid ? { ...i, quantidade: i.quantidade + novo.quantidade } : i
        );
      }
      return [...prev, novo];
    });
    toast.success(`${escolha?.nome ?? produto.nome} adicionado.`, { duration: 1500 });
  }

  function handleQuantidade(uid: string, quantidade: number) {
    setItensRascunho((prev) =>
      quantidade <= 0 ? prev.filter((i) => i.uid !== uid) : prev.map((i) => (i.uid === uid ? { ...i, quantidade } : i))
    );
  }

  function handleRemover(uid: string) {
    setItensRascunho((prev) => prev.filter((i) => i.uid !== uid));
  }

  function fecharNovo() {
    setNovoAberto(false);
    setNomeCliente("");
    setItensRascunho([]);
    setObservacao("");
  }

  function irParaPagamento() {
    if (!nomeCliente.trim() || itensRascunho.length === 0) return;
    const itensSnapshot = itensRascunho;
    const nomeSnapshot = nomeCliente.trim();
    const obsSnapshot = observacao;
    cobranca.abrirPagamento(
      {
        contexto: `Retirada — ${nomeSnapshot}`,
        clienteNome: nomeSnapshot,
        itens: itensSnapshot,
        total: totalRascunho,
        canal: "retirada",
      },
      (pedidoCriado) => {
        if (pedidoCriado) {
          adicionarPedido({
            id: pedidoCriado.id,
            numero: pedidoCriado.numero,
            clienteNome: nomeSnapshot,
            itens: itensSnapshot,
            observacao: obsSnapshot,
          });
        }
        fecharNovo();
        toast.success(
          `Retirada nº ${String(pedidoCriado?.numero ?? 0).padStart(3, "0")} criada.`
        );
      }
    );
  }

  function handleMarcarPronto(pedido: PedidoRetirada) {
    marcarPronto(pedido.id);
    toast.success(`Retirada nº ${String(pedido.numero).padStart(3, "0")} marcada como pronta.`);
  }

  function handleMarcarRetirado(pedido: PedidoRetirada) {
    marcarRetirado(pedido.id);
    toast.success(`Retirada nº ${String(pedido.numero).padStart(3, "0")} entregue ao cliente.`);
  }

  function handleCancelar(pedido: PedidoRetirada) {
    cancelarPedido(pedido.id);
    toast.info(`Retirada nº ${String(pedido.numero).padStart(3, "0")} cancelada.`);
  }

  const contagem = (status: "todos" | StatusRetirada) =>
    status === "todos" ? pedidos.length : pedidos.filter((p) => p.status === status).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Retirada"
        description="Pedidos para o cliente levar, com pagamento na hora e acompanhamento até a entrega."
        actions={
          <Button onClick={() => setNovoAberto(true)}>
            <Plus className="h-5 w-5" />
            Novo pedido
          </Button>
        }
      />

      {/* Filtro + lista */}
      <Tabs
        value={filtro}
        onValueChange={(v) => setFiltro(v as typeof filtro)}
        className="flex flex-col gap-6"
      >
        <TabsList className="h-auto flex-wrap gap-1.5 p-1.5">
          {FILTROS.map((f) => (
            <TabsTrigger key={f.value} value={f.value}>
              {f.label}
              <span className="ml-1.5 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold tabular text-muted-foreground">
                {contagem(f.value)}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={filtro} className="mt-0">
          {pedidosFiltrados.length === 0 ? (
            <EmptyState
              icon={Package}
              title={
                pedidos.length === 0
                  ? "Nenhum pedido de retirada"
                  : "Nenhum pedido neste status"
              }
              description={
                pedidos.length === 0
                  ? "Crie o primeiro pedido de retirada com o botão \"Novo pedido\"."
                  : "Escolha outro filtro para ver os demais pedidos."
              }
              actionLabel={pedidos.length === 0 ? "Novo pedido" : undefined}
              onAction={pedidos.length === 0 ? () => setNovoAberto(true) : undefined}
            />
          ) : (
            <ul className="flex flex-col gap-4">
              {pedidosFiltrados.map((pedido) => {
                const pedidoTotais = calcularTotais(pedido.itens);
                const cfg = STATUS_CONFIG[pedido.status];
                return (
                  <li
                    key={pedido.id}
                    className={cn(
                      "flex flex-col gap-4 rounded-2xl border-2 bg-card p-5 sm:p-6",
                      pedido.status === "retirado" ? "border-border opacity-70" : "border-border"
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-col gap-1">
                        <p className="text-lg font-bold tracking-[-0.01em]">
                          Retirada nº {String(pedido.numero).padStart(3, "0")}
                        </p>
                        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Phone className="h-4 w-4" />
                          {pedido.clienteNome} · {formatHora(new Date(pedido.criadoEm))}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold",
                          cfg.badge
                        )}
                      >
                        <span className={cn("h-2.5 w-2.5 rounded-full", cfg.dot)} />
                        {cfg.label}
                      </span>
                    </div>

                    <Separator />

                    <ul className="flex flex-col gap-2">
                      {pedido.itens.map((item) => (
                        <li key={item.uid} className="flex justify-between gap-2 text-sm">
                          <span>
                            {item.quantidade}x {item.nome}
                          </span>
                          <span className="tabular">
                            {formatBRL(item.precoUnit * item.quantidade)}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {pedido.observacao && (
                      <p className="text-sm text-muted-foreground">
                        Obs.: {pedido.observacao}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-sm text-muted-foreground">
                          {pedidoTotais.totalItens}{" "}
                          {pedidoTotais.totalItens === 1 ? "item" : "itens"}
                        </span>
                        <span className="text-lg font-bold tabular">
                          {formatBRL(pedidoTotais.total)}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {pedido.status === "pendente" && (
                          <>
                            <ConfirmarAcao
                              trigger={
                                <Button variant="outline" size="sm">
                                  <Trash2 className="h-4 w-4" />
                                  Cancelar
                                </Button>
                              }
                              titulo="Cancelar esta retirada?"
                              descricao={`A retirada nº ${String(pedido.numero).padStart(3, "0")} será cancelada e não pode ser desfeita.`}
                              textoConfirmar="Sim, cancelar"
                              aoConfirmar={() => handleCancelar(pedido)}
                            />
                            <Button size="sm" onClick={() => handleMarcarPronto(pedido)}>
                              <UtensilsCrossed className="h-4 w-4" />
                              Marcar pronto
                            </Button>
                          </>
                        )}
                        {pedido.status === "pronto" && (
                          <Button size="sm" onClick={() => handleMarcarRetirado(pedido)}>
                            <CheckCircle2 className="h-4 w-4" />
                            Entregar ao cliente
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      {/* Novo pedido de retirada */}
      <Dialog open={novoAberto} onOpenChange={(open) => !open && fecharNovo()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto scrollbar-thin sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Novo pedido de retirada</DialogTitle>
            <DialogDescription>
              Monte o pedido e informe o nome do cliente para chamar na
              entrega. O pagamento é feito agora, no balcão.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="cliente-retirada">Nome do cliente</Label>
            <Input
              id="cliente-retirada"
              placeholder="Ex.: João da Silva"
              value={nomeCliente}
              onChange={(e) => setNomeCliente(e.target.value)}
            />
          </div>

          <Separator />

          <CatalogoProdutos onAdicionar={handleAdicionarProduto} />

          <Separator />

          {itensRascunho.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum item adicionado ainda.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {itensRascunho.map((item) => (
                <ItemPedidoRow
                  key={item.uid}
                  item={item}
                  compacto
                  onQuantidade={handleQuantidade}
                  onRemover={handleRemover}
                />
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="obs-retirada">Observações (opcional)</Label>
            <Textarea
              id="obs-retirada"
              placeholder="Ex.: cortar em 8 fatias, embalar para viagem..."
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className="min-h-[4.5rem]"
            />
          </div>

          <div className="flex items-center justify-between text-lg font-bold">
            <span>Total</span>
            <span className="tabular">{formatBRL(totalRascunho)}</span>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={fecharNovo}>
              Cancelar
            </Button>
            <Button
              disabled={!nomeCliente.trim() || itensRascunho.length === 0}
              onClick={irParaPagamento}
            >
              Continuar para pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fluxo comum de cobrança */}
      <PagamentoDialog
        open={cobranca.pagamentoAberto}
        onOpenChange={cobranca.setPagamentoAberto}
        titulo="Pagamento da retirada"
        descricao="Confira a forma de pagamento e confirme a cobrança."
        contexto={cobranca.cobranca?.contexto ?? ""}
        clienteNome={cobranca.cobranca?.clienteNome}
        itens={cobranca.cobranca?.itens ?? []}
        total={cobranca.cobranca?.total ?? 0}
        saldoRestante={cobranca.saldoRestante}
        permitirDividir
        caixaAberto={cobranca.caixaAberto}
        onConfirmar={cobranca.confirmarPagamento}
      />
      <NfceDialog cupom={cobranca.cupom} onConcluir={cobranca.concluir} />
    </div>
  );
}

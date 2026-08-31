"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Bike,
  CheckCircle2,
  MapPin,
  Navigation,
  Package,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Send,
  ShoppingBag,
  Trash2,
  Truck,
  User,
  UserRound,
  X,
} from "lucide-react";

import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { ItemPedidoRow } from "@/components/patterns/item-pedido-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { api, useApi } from "@/lib/api-cliente";
import { novaChaveIdempotencia } from "@/lib/idempotencia";
import { useEventosTempoReal } from "@/lib/usar-eventos-tempo-real";
import { CodigoQr } from "@/components/patterns/codigo-qr";
import { calcularTotais, type ItemPedido, type Produto, type SelecaoPizza } from "@/lib/catalogo";
import { CatalogoProdutos } from "@/app/pdv/_components/catalogo-produtos";
import { useCobranca } from "@/app/pdv/_lib/use-cobranca";
import { PagamentoDialog } from "@/app/pdv/_components/pagamento-dialog";
import { NfceDialog } from "@/app/pdv/_components/nfce-dialog";

interface EntregaApi {
  id: string;
  endereco: string;
  bairro: string;
  complemento: string | null;
  referencia: string | null;
  telefone: string | null;
  status: "aguardando" | "preparo" | "rota" | "entregue" | "cancelada";
  previsao: string | null;
  ocorrencia: string | null;
  iniciadaEm: string | null;
  concluidaEm: string | null;
  entregador: string | null;
  entregadorId: string | null;
  codigoQr: string | null;
}

interface PedidoDeliveryApi {
  id: string;
  numero: number;
  canal: string;
  status: string;
  producao: string;
  clienteNome: string | null;
  clienteTelefone: string | null;
  observacao: string | null;
  previsao: string | null;
  taxaEntrega: number;
  trocoPara: number;
  formaPagamentoEntrega: string | null;
  total: number;
  criadoEm: string;
  itens: ItemPedido[];
  pagamentos: { id: string; forma: string; valor: number; troco: number; status: string }[];
  entrega: EntregaApi | null;
}

interface PedidosApi {
  pedidos: PedidoDeliveryApi[];
}

interface ClienteBusca {
  id: string;
  nome: string;
  telefone: string | null;
  enderecos: { id: string; rotulo: string | null; rua: string; bairro: string; complemento: string | null; referencia: string | null }[];
}

interface EntregadorApi {
  id: string;
  nome: string;
  ativo: boolean;
  statusHoje: string;
}

const FILTROS = [
  { value: "todos", label: "Todos" },
  { value: "aguardando", label: "Aguardando entregador" },
  { value: "preparo", label: "Em preparo" },
  { value: "rota", label: "Na rota" },
  { value: "entregue", label: "Entregues" },
  { value: "cancelada", label: "Canceladas" },
] as const;

type Filtro = (typeof FILTROS)[number]["value"];

const STATUS_ENTREGA_CONFIG: Record<
  EntregaApi["status"],
  { label: string; badge: string; dot: string }
> = {
  aguardando: {
    label: "Aguardando entregador",
    badge: "bg-status-waiting-bg text-status-waiting border-status-waiting-border",
    dot: "bg-status-waiting",
  },
  preparo: {
    label: "Em preparo",
    badge: "bg-status-waiting-bg text-status-waiting border-status-waiting-border",
    dot: "bg-status-waiting",
  },
  rota: {
    label: "Na rota",
    badge: "bg-status-sent-bg text-status-sent border-status-sent-border",
    dot: "bg-status-sent",
  },
  entregue: {
    label: "Entregue",
    badge: "bg-status-free-bg text-status-free border-status-free-border",
    dot: "bg-status-free",
  },
  cancelada: {
    label: "Cancelada",
    badge: "bg-status-occupied-bg text-status-occupied border-status-occupied-border",
    dot: "bg-status-occupied",
  },
};

const FORMAS_ENTREGA = [
  { value: "pix", label: "Pix" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "credito", label: "Crédito" },
  { value: "debito", label: "Débito" },
];

const ROTULOS_FORMA: Record<string, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  credito: "Crédito",
  debito: "Débito",
};

const FALLBACK_PEDIDOS: PedidosApi = { pedidos: [] };
const FALLBACK_ENTREGADORES: { entregadores: EntregadorApi[] } = { entregadores: [] };

function descricaoPagamento(p: PedidoDeliveryApi): string {
  const pago = p.pagamentos.find((pg) => pg.status === "confirmado");
  const pendente = p.pagamentos.find((pg) => pg.status === "pendente");
  if (pago) return `Pago — ${ROTULOS_FORMA[pago.forma] ?? pago.forma}`;
  if (pendente) {
    const troco = p.trocoPara > 0 ? ` · troco para ${formatBRL(p.trocoPara)}` : "";
    return `Pagar na entrega — ${ROTULOS_FORMA[pendente.forma] ?? pendente.forma}${troco}`;
  }
  if (p.formaPagamentoEntrega) {
    const troco = p.trocoPara > 0 ? ` · troco para ${formatBRL(p.trocoPara)}` : "";
    return `Pagar na entrega — ${ROTULOS_FORMA[p.formaPagamentoEntrega] ?? p.formaPagamentoEntrega}${troco}`;
  }
  return "Aguardando pagamento";
}

/**
 * Delivery (PEDIDO 17) — fluxo operacional de entregas: criar pedido com
 * cliente/endereço completos, taxa por bairro configurável, pagamento na
 * hora ou na entrega, atribuição de entregador e acompanhamento até a
 * entrega. Fonte: `GET /api/pedidos?canal=delivery` + `PATCH /api/entregas`.
 */
export function DeliveryView() {
  const { dados, recarregar } = useApi<PedidosApi>(
    "/api/pedidos?canal=delivery&periodo=hoje&limite=100",
    FALLBACK_PEDIDOS
  );
  // Sincronização entre dispositivos: quando um entregador (ou outro PDV)
  // pega/atualiza uma entrega, esta tela recarrega sozinha — a entrega já
  // atribuída não fica "disponível" em dois aparelhos ao mesmo tempo.
  useEventosTempoReal(["entrega", "pedido"], recarregar);
  const cobranca = useCobranca();

  const [filtro, setFiltro] = React.useState<Filtro>("todos");
  const [novoAberto, setNovoAberto] = React.useState(false);
  const [atribuirEntrega, setAtribuirEntrega] = React.useState<PedidoDeliveryApi | null>(null);
  const [cancelarEntrega, setCancelarEntrega] = React.useState<PedidoDeliveryApi | null>(null);

  const pedidos = dados.pedidos.filter((p) => p.status !== "cancelado");
  const filtrados = filtro === "todos" ? pedidos : pedidos.filter((p) => p.entrega?.status === filtro);

  const aguardando = pedidos.filter((p) => p.entrega?.status === "aguardando").length;
  const naRota = pedidos.filter((p) => p.entrega?.status === "rota").length;

  function handleAtribuir(entregaId: string, entregadorId: string) {
    api(`/api/entregas/${entregaId}`, {
      method: "PATCH",
      body: JSON.stringify({ entregadorId }),
    })
      .then(() => {
        toast.success("Entregador atribuído à entrega.");
        setAtribuirEntrega(null);
        recarregar();
      })
      .catch((erro: Error) => toast.error(erro.message));
  }

  function handleCancelarEntrega(pedido: PedidoDeliveryApi, ocorrencia?: string) {
    if (!pedido.entrega) return;
    api(`/api/entregas/${pedido.entrega.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "cancelada", ocorrencia }),
    })
      .then(() => {
        toast.info(`Entrega do pedido nº ${pedido.numero} cancelada.`);
        setCancelarEntrega(null);
        recarregar();
      })
      .catch((erro: Error) => toast.error(erro.message));
  }

  const contagem = (f: Filtro) =>
    f === "todos" ? pedidos.length : pedidos.filter((p) => p.entrega?.status === f).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Delivery"
        description={`${aguardando} aguardando entregador · ${naRota} na rota — pedidos de hoje.`}
        actions={
          <Button onClick={() => setNovoAberto(true)}>
            <Plus className="h-5 w-5" />
            Novo pedido
          </Button>
        }
      />

      <Tabs value={filtro} onValueChange={(v) => setFiltro(v as Filtro)} className="flex flex-col gap-6">
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
          {filtrados.length === 0 ? (
            <EmptyState
              icon={Bike}
              title={
                pedidos.length === 0
                  ? "Nenhum pedido de delivery"
                  : "Nenhum pedido neste status"
              }
              description={
                pedidos.length === 0
                  ? "Crie o primeiro pedido de entrega com o botão \"Novo pedido\"."
                  : "Escolha outro filtro para ver os demais pedidos."
              }
              actionLabel={pedidos.length === 0 ? "Novo pedido" : undefined}
              onAction={pedidos.length === 0 ? () => setNovoAberto(true) : undefined}
            />
          ) : (
            <ul className="flex flex-col gap-4">
              {filtrados.map((pedido) => {
                const pedidoTotais = calcularTotais(pedido.itens);
                const entrega = pedido.entrega;
                const cfg = entrega ? STATUS_ENTREGA_CONFIG[entrega.status] : STATUS_ENTREGA_CONFIG.aguardando;
                const finalizada = entrega?.status === "entregue" || entrega?.status === "cancelada";
                return (
                  <li
                    key={pedido.id}
                    className={cn(
                      "flex flex-col gap-4 rounded-2xl border-2 bg-card p-5 sm:p-6",
                      finalizada ? "border-border opacity-70" : "border-border"
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-col gap-1">
                        <p className="text-lg font-bold tracking-[-0.01em]">
                          Pedido nº {String(pedido.numero).padStart(3, "0")}
                        </p>
                        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <Phone className="h-4 w-4" />
                            {pedido.clienteNome} · {pedido.clienteTelefone ?? "sem telefone"}
                          </span>
                          <span className="tabular">
                            {formatHora(new Date(pedido.criadoEm))}
                          </span>
                          {pedido.previsao && <span>Previsão: {pedido.previsao}</span>}
                        </p>
                      </div>
                      {entrega && (
                        <div className="flex items-center gap-3">
                          {!finalizada && (
                            <CodigoQr
                              valor={
                                entrega.codigoQr
                                  ? `pedidoflow:v1:entrega:${entrega.codigoQr}`
                                  : `#${pedido.numero}`
                              }
                              tamanho={56}
                              className="rounded-lg border border-border"
                            />
                          )}
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
                      )}
                    </div>

                    {entrega && (
                      <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-secondary/40 p-4 text-sm">
                        <p className="flex items-start gap-2 font-medium">
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <span>
                            {entrega.endereco}
                            {entrega.complemento ? ` — ${entrega.complemento}` : ""} · {entrega.bairro}
                          </span>
                        </p>
                        {entrega.referencia && (
                          <p className="pl-6 text-muted-foreground">
                            Referência: {entrega.referencia}
                          </p>
                        )}
                        <p className="pl-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <UserRound className="h-4 w-4" />
                            {entrega.entregador ?? "Aguardando entregador"}
                          </span>
                          {entrega.ocorrencia && (
                            <span className="text-status-occupied">Ocorrência: {entrega.ocorrencia}</span>
                          )}
                        </p>
                      </div>
                    )}

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
                      <p className="text-sm text-muted-foreground">Obs.: {pedido.observacao}</p>
                    )}

                    <div className="flex flex-col gap-1.5 text-sm">
                      <div className="flex justify-between gap-2 text-muted-foreground">
                        <span>Itens ({pedidoTotais.totalItens})</span>
                        <span className="tabular">{formatBRL(pedidoTotais.total)}</span>
                      </div>
                      {pedido.taxaEntrega > 0 && (
                        <div className="flex justify-between gap-2 text-muted-foreground">
                          <span>Taxa de entrega</span>
                          <span className="tabular">{formatBRL(pedido.taxaEntrega)}</span>
                        </div>
                      )}
                      <div className="flex justify-between gap-2 text-base font-bold">
                        <span>Total</span>
                        <span className="tabular">{formatBRL(pedido.total)}</span>
                      </div>
                      <p className="text-muted-foreground">{descricaoPagamento(pedido)}</p>
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                      {!finalizada && entrega && (
                        <>
                          {entrega.status === "aguardando" && (
                            <Button size="sm" onClick={() => setAtribuirEntrega(pedido)}>
                              <Bike className="h-4 w-4" />
                              Atribuir entregador
                            </Button>
                          )}
                          {entrega.status === "preparo" && (
                            <Button
                              size="sm"
                              onClick={() =>
                                api(`/api/entregas/${entrega.id}`, {
                                  method: "PATCH",
                                  body: JSON.stringify({ status: "rota" }),
                                })
                                  .then(() => {
                                    toast.success("Pedido saiu para entrega.");
                                    recarregar();
                                  })
                                  .catch((erro: Error) => toast.error(erro.message))
                              }
                            >
                              <Navigation className="h-4 w-4" />
                              Saiu para entrega
                            </Button>
                          )}
                          {entrega.status === "rota" && (
                            <Button
                              size="sm"
                              onClick={() =>
                                api(`/api/entregas/${entrega.id}`, {
                                  method: "PATCH",
                                  body: JSON.stringify({ status: "entregue" }),
                                })
                                  .then(() => {
                                    toast.success("Entrega concluída.");
                                    recarregar();
                                  })
                                  .catch((erro: Error) => toast.error(erro.message))
                              }
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Concluir entrega
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCancelarEntrega(pedido)}
                          >
                            <Trash2 className="h-4 w-4" />
                            Cancelar
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <NovoPedidoDelivery
        aberto={novoAberto}
        onFechar={() => setNovoAberto(false)}
        onCriado={() => {
          setNovoAberto(false);
          recarregar();
        }}
        cobranca={cobranca}
      />

      {/* Atribuir entregador */}
      <Dialog open={atribuirEntrega !== null} onOpenChange={(open) => !open && setAtribuirEntrega(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Atribuir entregador</DialogTitle>
            <DialogDescription>
              Pedido nº {atribuirEntrega ? String(atribuirEntrega.numero).padStart(3, "0") : ""} —
              escolha quem leva a entrega.
            </DialogDescription>
          </DialogHeader>
          <SeletorEntregador
            onEscolher={(id) => {
              if (atribuirEntrega?.entrega) handleAtribuir(atribuirEntrega.entrega.id, id);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Cancelar entrega */}
      <Dialog open={cancelarEntrega !== null} onOpenChange={(open) => !open && setCancelarEntrega(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancelar entrega?</DialogTitle>
            <DialogDescription>
              O pedido nº {cancelarEntrega ? String(cancelarEntrega.numero).padStart(3, "0") : ""}
              será cancelado e sairá da produção.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelarEntrega(null)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelarEntrega && handleCancelarEntrega(cancelarEntrega, "Cancelado pelo caixa")}
            >
              Sim, cancelar entrega
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PagamentoDialog
        open={cobranca.pagamentoAberto}
        onOpenChange={cobranca.setPagamentoAberto}
        titulo="Pagamento do delivery"
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

function SeletorEntregador({ onEscolher }: { onEscolher: (entregadorId: string) => void }) {
  const { dados } = useApi<{ entregadores: EntregadorApi[] }>("/api/entregadores", FALLBACK_ENTREGADORES);
  const ativos = dados.entregadores.filter((e) => e.ativo);
  const [selecionado, setSelecionado] = React.useState("");

  return (
    <div className="flex flex-col gap-4">
      <Select value={selecionado} onValueChange={setSelecionado}>
        <SelectTrigger>
          <SelectValue placeholder="Selecione o entregador" />
        </SelectTrigger>
        <SelectContent>
          {ativos.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.nome}
              {e.statusHoje === "rota" ? " (em rota)" : e.statusHoje === "folga" ? " (folga)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <DialogFooter>
        <Button disabled={!selecionado} onClick={() => onEscolher(selecionado)}>
          <Bike className="h-4 w-4" />
          Atribuir
        </Button>
      </DialogFooter>
    </div>
  );
}

/** Dialog de novo pedido de delivery — cliente, endereço, itens e pagamento. */
function NovoPedidoDelivery({
  aberto,
  onFechar,
  onCriado,
  cobranca,
}: {
  aberto: boolean;
  onFechar: () => void;
  onCriado: () => void;
  cobranca: ReturnType<typeof useCobranca>;
}) {
  const [nomeCliente, setNomeCliente] = React.useState("");
  const [telefone, setTelefone] = React.useState("");
  const [rua, setRua] = React.useState("");
  const [bairro, setBairro] = React.useState("");
  const [complemento, setComplemento] = React.useState("");
  const [referencia, setReferencia] = React.useState("");
  const [previsao, setPrevisao] = React.useState("");
  const [observacao, setObservacao] = React.useState("");
  const [itensRascunho, setItensRascunho] = React.useState<ItemPedido[]>([]);
  const [forma, setForma] = React.useState("pix");
  const [pagarNaEntrega, setPagarNaEntrega] = React.useState(false);
  const [trocoPara, setTrocoPara] = React.useState("");
  const [buscando, setBuscando] = React.useState(false);
  const [resultados, setResultados] = React.useState<ClienteBusca[]>([]);
  const [clienteSelecionado, setClienteSelecionado] = React.useState<ClienteBusca | null>(null);

  const { total: totalItens } = calcularTotais(itensRascunho);
  const [taxa, setTaxa] = React.useState<{ taxa: number; regra: string; gratuito: boolean }>({ taxa: 0, regra: "", gratuito: false });

  // Busca de cliente pelo telefone/nome (cadastro rápido + histórico).
  const buscarClientes = React.useCallback(async (texto: string) => {
    if (texto.trim().length < 3) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    try {
      const dados = await api<{ clientes: ClienteBusca[] }>(`/api/clientes?q=${encodeURIComponent(texto)}`);
      setResultados(dados.clientes);
    } catch {
      setResultados([]);
    } finally {
      setBuscando(false);
    }
  }, []);

  const buscarTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleBuscar(texto: string) {
    if (buscarTimer.current) clearTimeout(buscarTimer.current);
    buscarTimer.current = setTimeout(() => buscarClientes(texto), 350);
  }

  // Taxa por bairro (regra configurada no sistema).
  React.useEffect(() => {
    if (!bairro.trim()) {
      setTaxa({ taxa: 0, regra: "", gratuito: false });
      return;
    }
    api<{ taxa: number; regra: string; gratuito: boolean }>(
      `/api/entrega/taxa?bairro=${encodeURIComponent(bairro.trim())}&total=${totalItens}`
    )
      .then(setTaxa)
      .catch((erro) => {
        toast.error(
          `Não foi possível calcular a taxa de entrega: ${erro instanceof Error ? erro.message : "falha desconhecida"}`
        );
      });
  }, [bairro, totalItens]);

  const total = Math.round((totalItens + taxa.taxa) * 100) / 100;

  function usarCliente(c: ClienteBusca) {
    setClienteSelecionado(c);
    setNomeCliente(c.nome);
    setTelefone(c.telefone ?? "");
    const casa = c.enderecos[0];
    if (casa) {
      setRua(casa.rua);
      setBairro(casa.bairro);
      setComplemento(casa.complemento ?? "");
      setReferencia(casa.referencia ?? "");
    }
    setResultados([]);
  }

  function limparSelecao() {
    setClienteSelecionado(null);
    setNomeCliente("");
    setTelefone("");
    setRua("");
    setBairro("");
    setComplemento("");
    setReferencia("");
  }

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

  /**
   * Chave de idempotência do pedido "pagar na entrega" (item 1). Vive
   * enquanto o diálogo estiver aberto com o mesmo rascunho: retentativas
   * do MESMO pedido reusam a chave; fechar o diálogo (pedido criado ou
   * cancelado) zera, para que o próximo delivery tenha chave nova.
   */
  const chavePedidoNaEntrega = React.useRef<string | null>(null);

  function fechar() {
    onFechar();
    limparSelecao();
    setItensRascunho([]);
    setObservacao("");
    setPrevisao("");
    setPagarNaEntrega(false);
    setTrocoPara("");
    setForma("pix");
    setTaxa({ taxa: 0, regra: "", gratuito: false });
    chavePedidoNaEntrega.current = null;
  }

  const valido = nomeCliente.trim() && telefone.trim() && rua.trim() && bairro.trim() && itensRascunho.length > 0;

  // Pagar agora: fluxo comum de cobrança (pedido + pagamento + NFC-e).
  function pagarAgora() {
    if (!valido) return;
    const itensSnapshot = itensRascunho;
    const entrega = {
      endereco: rua.trim(),
      bairro: bairro.trim(),
      complemento: complemento.trim() || undefined,
      referencia: referencia.trim() || undefined,
      previsao: previsao.trim() || undefined,
    };
    cobranca.abrirPagamento(
      {
        contexto: `Delivery — ${nomeCliente.trim()}`,
        clienteNome: nomeCliente.trim(),
        itens: itensSnapshot,
        total,
        canal: "delivery",
        entrega,
        trocoPara: pagarNaEntrega ? Number(trocoPara) || 0 : 0,
        formaPagamentoEntrega: forma,
        observacao: observacao.trim() || undefined,
      },
      () => {
        fechar();
        onCriado();
        toast.success("Pedido de delivery registrado e pago.");
      }
    );
  }

  // Pagar na entrega: cria o pedido com pagamento pendente.
  async function confirmarNaEntrega() {
    if (!valido) return;
    // Item 1 da auditoria: a chave nasce no PRIMEIRO clique e só é
    // liberada quando o pedido é criado. Duplo clique e retentativa
    // depois de erro de rede mandam a MESMA chave — o servidor devolve o
    // pedido já criado em vez de abrir um segundo delivery para o mesmo
    // cliente.
    if (!chavePedidoNaEntrega.current) chavePedidoNaEntrega.current = novaChaveIdempotencia();
    try {
      await api("/api/pedidos", {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: chavePedidoNaEntrega.current,
          canal: "delivery",
          cliente: { nome: nomeCliente.trim(), telefone: telefone.trim() },
          itens: itensRascunho.map((i) => ({
            produtoId: i.produtoId,
            nome: i.nome,
            precoUnit: i.precoUnit,
            quantidade: i.quantidade,
          })),
          observacao: observacao.trim() || undefined,
          entrega: {
            endereco: rua.trim(),
            bairro: bairro.trim(),
            complemento: complemento.trim() || undefined,
            referencia: referencia.trim() || undefined,
            previsao: previsao.trim() || undefined,
          },
          pagarNaEntrega: true,
          formaPagamentoEntrega: forma,
          trocoPara: forma === "dinheiro" ? Number(trocoPara) || 0 : 0,
        }),
      });
      fechar();
      onCriado();
      toast.success("Pedido de delivery criado — pagamento na entrega.");
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível criar o pedido.");
    }
  }

  const [drawerAberto, setDrawerAberto] = React.useState(false);

  React.useEffect(() => {
    if (aberto) setDrawerAberto(false);
  }, [aberto]);

  if (!aberto) return null;

  const itensVazio = itensRascunho.length === 0;

  const renderComanda = (needsClose?: () => void) => (
    <>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {itensVazio ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
              <ShoppingBag size={30} className="text-slate-400" />
            </div>
            <p className="font-bold text-slate-700">Comanda vazia</p>
            <p className="mt-1 max-w-[240px] text-sm leading-5 text-slate-400">
              Selecione um produto para montar a entrega.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {itensRascunho.map((item) => (
              <ItemPedidoRow
                key={item.uid}
                item={item}
                compacto
                onQuantidade={handleQuantidade}
                onRemover={(uid) => handleQuantidade(uid, 0)}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-slate-200 px-5 py-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label>Forma de pagamento</Label>
            <Select value={forma} onValueChange={setForma}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMAS_ENTREGA.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-slate-700">Pagar na entrega</span>
              <span className="max-w-[220px] text-xs leading-4 text-slate-400">
                O pagamento fica pendente e é confirmado ao concluir a entrega.
              </span>
            </div>
            <Switch checked={pagarNaEntrega} onCheckedChange={setPagarNaEntrega} aria-label="Pagar na entrega" />
          </div>

          {pagarNaEntrega && forma === "dinheiro" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="del-troco-ov">Troco para</Label>
              <Input
                id="del-troco-ov"
                type="number"
                step="0.01"
                placeholder="Ex.: 100,00"
                value={trocoPara}
                onChange={(e) => setTrocoPara(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-1.5 border-t border-dashed border-slate-200 pt-4 text-sm">
          <div className="flex justify-between text-slate-500">
            <span>Itens</span>
            <span className="tabular">{formatBRL(totalItens)}</span>
          </div>
          <div className="flex justify-between text-slate-500">
            <span>Taxa de entrega ({bairro.trim() || "bairro"})</span>
            <span className="tabular">
              {taxa.gratuito ? "Grátis" : taxa.regra ? formatBRL(taxa.taxa) : "—"}
            </span>
          </div>
          <div className="mt-1 flex items-end justify-between">
            <span className="text-sm font-bold text-slate-700">
              Total · {itensRascunho.length} {itensRascunho.length === 1 ? "item" : "itens"}
            </span>
            <span className="text-2xl font-black tracking-tight text-slate-950">
              {formatBRL(total)}
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {pagarNaEntrega ? (
            <Button
              type="button"
              size="lg"
              className="w-full"
              disabled={!valido}
              onClick={() => {
                needsClose?.();
                confirmarNaEntrega();
              }}
            >
              <Package className="h-5 w-5" />
              Confirmar — pagar na entrega
            </Button>
          ) : (
            <Button
              type="button"
              size="lg"
              className="w-full"
              disabled={!valido}
              onClick={() => {
                needsClose?.();
                pagarAgora();
              }}
            >
              <Send className="h-5 w-5" />
              Continuar para pagamento
            </Button>
          )}
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* ============================================= */}
      {/* OVERLAY (DESKTOP): formulário | comanda       */}
      {/* ============================================= */}
      <div className="fixed inset-0 z-40 bg-slate-950/55 p-2 backdrop-blur-[3px] md:p-5">
        <div className="mx-auto flex h-full max-w-[1750px] flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-[#f7f8fa] shadow-2xl lg:flex-row">
          {/* FORMULÁRIO + CATÁLOGO - LADO ESQUERDO */}
          <section className="flex min-w-0 flex-1 flex-col">
            <header className="flex min-h-[82px] items-center justify-between border-b border-slate-200 bg-white px-5 md:px-7 lg:hidden">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
                  Novo pedido
                </p>
                <h1 className="text-xl font-bold text-slate-900">Delivery</h1>
              </div>
              <button
                onClick={fechar}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <X size={21} />
              </button>
            </header>

            {/* Cliente + endereço + fechar (desktop) */}
            <div className="max-h-[52vh] overflow-y-auto border-b border-slate-200 bg-white px-5 pb-5 pt-5 md:px-7 lg:max-h-none lg:flex-none">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Cliente e endereço de entrega
                </p>
                <Button variant="outline" onClick={fechar} className="hidden lg:inline-flex">
                  <X className="h-4 w-4" />
                  Cancelar
                </Button>
              </div>

              {/* Busca de cliente */}
              <div className="relative mt-3 flex flex-col gap-2">
                <Label>Buscar cliente (telefone ou nome)</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Ex.: 11988112233 ou Maria"
                    onChange={(e) => handleBuscar(e.target.value)}
                  />
                  {buscando && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      buscando…
                    </span>
                  )}
                </div>
                {resultados.length > 0 && (
                  <ul className="absolute top-full z-10 mt-1 flex w-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-soft">
                    {resultados.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="flex w-full flex-col gap-0.5 px-4 py-3 text-left text-sm hover:bg-secondary"
                          onClick={() => usarCliente(c)}
                        >
                          <span className="font-semibold">{c.nome}</span>
                          <span className="text-xs text-muted-foreground">
                            {c.telefone ?? "sem telefone"} · {c.enderecos[0]?.rua ?? "sem endereço"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {clienteSelecionado && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="self-start text-muted-foreground"
                    onClick={limparSelecao}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Novo cliente (limpar seleção)
                  </Button>
                )}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="del-nome">Nome do cliente *</Label>
                  <Input
                    id="del-nome"
                    placeholder="Ex.: Maria Souza"
                    value={nomeCliente}
                    onChange={(e) => setNomeCliente(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="del-fone">Telefone *</Label>
                  <Input
                    id="del-fone"
                    placeholder="Ex.: (11) 98811-2233"
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                <Label htmlFor="del-rua">Endereço *</Label>
                <Input
                  id="del-rua"
                  placeholder="Ex.: Rua das Flores, 217"
                  value={rua}
                  onChange={(e) => setRua(e.target.value)}
                />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="del-bairro">Bairro *</Label>
                  <Input
                    id="del-bairro"
                    placeholder="Ex.: Jd. das Flores"
                    value={bairro}
                    onChange={(e) => setBairro(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="del-compl">Complemento</Label>
                  <Input
                    id="del-compl"
                    placeholder="Ex.: apto 32"
                    value={complemento}
                    onChange={(e) => setComplemento(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="del-ref">Referência</Label>
                  <Input
                    id="del-ref"
                    placeholder="Ex.: perto da padaria"
                    value={referencia}
                    onChange={(e) => setReferencia(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="del-prev">Previsão</Label>
                  <Input
                    id="del-prev"
                    placeholder="Ex.: 35–45 min"
                    value={previsao}
                    onChange={(e) => setPrevisao(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="del-obs">Observações</Label>
                  <Input
                    id="del-obs"
                    placeholder="Ex.: sem cebola"
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-white p-5 md:p-7">
              <p className="mb-4 flex items-center gap-1.5 text-sm font-medium text-slate-500">
                <Truck className="h-4 w-4" />
                Clique em um produto para montar a entrega. A comanda fica à direita.
              </p>
              <CatalogoProdutos onAdicionar={handleAdicionarProduto} />
            </div>
          </section>

          {/* COMANDA - LADO DIREITO */}
          <aside className="hidden w-[390px] shrink-0 flex-col border-l border-slate-200 bg-white lg:flex xl:w-[430px]">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Comanda do delivery
                </p>
                <h2 className="mt-1 text-xl font-extrabold text-slate-900">
                  {nomeCliente.trim() || "Cliente"}
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  {rua.trim() ? `${rua} · ${bairro.trim() || "—"}` : "Endereço não informado"}
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-orange-50 px-3 py-2 text-orange-700">
                <Truck size={16} />
                <span className="text-sm font-bold">Entrega</span>
              </div>
            </div>
            {renderComanda()}
          </aside>
        </div>
      </div>

      {/* ============================================= */}
      {/* MOBILE: barra inferior + comanda (drawer)     */}
      {/* ============================================= */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[110] lg:hidden">
        <button
          onClick={() => setDrawerAberto(true)}
          className="pointer-events-auto mx-auto mb-3 flex w-[calc(100%-24px)] items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-900 px-5 py-4 text-white shadow-2xl"
        >
          <span className="text-sm font-bold">
            {itensVazio ? "Comanda vazia" : `Comanda · ${itensRascunho.length} item${itensRascunho.length > 1 ? "ns" : ""}`}
          </span>
          <span className="flex items-center gap-2">
            <span className="text-lg font-black">{formatBRL(total)}</span>
            <span className="rounded-lg bg-white/20 px-2.5 py-1 text-xs font-bold">Ver comanda</span>
          </span>
        </button>

        {drawerAberto && (
          <div className="pointer-events-auto fixed inset-0 z-[120] flex flex-col bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500 text-sm font-black text-white">
                  <Truck size={18} />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">Delivery</p>
                  <h2 className="text-base font-bold text-slate-900">{nomeCliente.trim() || "Cliente"}</h2>
                </div>
              </div>
              <button
                onClick={() => setDrawerAberto(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500"
              >
                <X size={19} />
              </button>
            </div>
            {renderComanda(() => setDrawerAberto(false))}
          </div>
        )}
      </div>
    </>
  );
}

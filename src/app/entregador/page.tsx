"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Bike,
  CircleCheck,
  CircleDashed,
  DownloadCloud,
  Flag,
  MapPin,
  Navigation,
  PackageCheck,
  Phone,
  ScanLine,
  Star,
  Wallet,
} from "lucide-react";

import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatBRL } from "@/lib/utils";
import { api, useApi } from "@/lib/api-cliente";
import { type ParadaRota, type StatusParada } from "@/lib/entregador";
import { useEventosTempoReal } from "@/lib/usar-eventos-tempo-real";
import { baixarRotaOffline } from "@/lib/offline-entregador";
import { Banknote, CreditCard, QrCode } from "lucide-react";

const STATUS_PARADA_CONFIG: Record<StatusParada, { label: string; classes: string; dot: string }> =
  {
    concluido: {
      label: "Concluído",
      classes: "bg-status-free-bg text-status-free border-status-free-border",
      dot: "bg-status-free",
    },
    atual: {
      label: "Na rota",
      classes: "bg-status-sent-bg text-status-sent border-status-sent-border",
      dot: "bg-status-sent",
    },
    pendente: {
      label: "Pendente",
      classes: "bg-status-waiting-bg text-status-waiting border-status-waiting-border",
      dot: "bg-status-waiting",
    },
  };

const formaPagamentoIcon = {
  pix: "💳 Pix",
  dinheiro: "💵 Dinheiro",
  cartao: "💳 Cartão",
  null: "—",
  undefined: "—",
};

const formaPagamentoClass = {
  pix: "bg-primary/20 text-primary",
  dinheiro: "bg-amber/20 text-amber",
  cartao: "bg-blue/20 text-blue",
  null: "bg-muted/20 text-muted-foreground",
  undefined: "bg-muted/20 text-muted-foreground",
};

const getStatusPagamento = (pagamento: { status: string } | null) => {
  if (!pagamento) return { status: "pendente", label: "Pendente" };
  if (pagamento.status === "confirmado") return { status: "confirmado", label: "Confirmado" };
  return { status: "pendente", label: "A confirmar" };
};

interface EntregaApi {
  id: string;
  pedidoId: string;
  numeroPedido: string;
  cliente: string;
  telefone: string | null;
  endereco: string;
  bairro: string;
  complemento: string | null;
  referencia: string | null;
  status: "aguardando" | "preparo" | "rota" | "entregue" | "cancelada";
  previsao: string | null;
  km: number;
  gorjeta: number;
  entregador: string | null;
  ocorrencia: string | null;
  iniciadaEm: string | null;
  criadoEm: string;
  concluidaEm: string | null;
  itens: { nome: string; quantidade: number; precoUnit: number }[];
  valor: number;
  taxaEntrega: number;
  trocoPara: number;
  formaPagamentoEntrega: string | null;
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

const STATUS_PARADA: Record<EntregaApi["status"], StatusParada> = {
  entregue: "concluido",
  rota: "atual",
  preparo: "pendente",
  aguardando: "pendente",
  cancelada: "pendente",
};

const OCORRENCIAS_SUGERIDAS = [
  "Cliente não atendeu",
  "Endereço não encontrado",
  "Recusa do cliente",
  "Cliente ausente",
  "Trânsito/atraso",
  "Outro",
];

function mapearParadas(entregas: EntregaApi[]): ParadaRota[] {
  return entregas
    .filter((entrega) => entrega.status !== "cancelada")
    .sort(
      (a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime()
    )
    .map((entrega, indice) => ({
      ordem: indice + 1,
      tipo: "entrega",
      cliente: entrega.cliente,
      endereco: entrega.endereco,
      bairro: entrega.bairro,
      previsao: entrega.previsao ?? "—",
      status: STATUS_PARADA[entrega.status],
      pagamento: entrega.pagamento,
    }));
}

function montarUrlMapa(endereco: string, bairro: string): { maps: string; waze: string } {
  const destino = encodeURIComponent(`${endereco}, ${bairro}`.trim());
  return {
    maps: `https://www.google.com/maps/dir/?api=1&destination=${destino}`,
    waze: `https://waze.com/ul?q=${destino}`,
  };
}

/**
 * Minha rota — a tela inicial do entregador (PEDIDO 17): paradas do dia
 * com ações por entrega (iniciar, concluir, registrar ocorrência,
 * como chegar) e resumo real calculado das entregas atribuídas.
 */
export default function MinhaRotaPage() {
  const { dados, recarregar } = useApi<RespostaEntregas>("/api/entregas", ENTREGAS_FALLBACK);
  // Sincronização entre dispositivos: se outro entregador pegar/concluir
  // uma entrega (ou o PDV atribuir uma nova), esta rota atualiza sozinha.
  useEventosTempoReal(["entrega"], recarregar);

  // Sem dado de exemplo: sem entregas atribuídas, a rota fica vazia de
  // verdade (nunca mostra uma rota fictícia no lugar do estado real).
  const paradas = mapearParadas(dados.entregas);
  const [ocorrenciaDe, setOcorrenciaDe] = React.useState<EntregaApi | null>(null);
  const [pagandoDe, setPagandoDe] = React.useState<EntregaApi | null>(null);

  const aEntregar = dados.entregas.filter((e) => ["preparo", "rota"].includes(e.status));
  const concluidas = dados.entregas.filter((e) => e.status === "entregue");
  const valorAReceber = aEntregar.reduce((acc, e) => acc + e.valor, 0);
  const recebido = concluidas.reduce((acc, e) => acc + e.valor, 0);

  function mudarStatus(entrega: EntregaApi, status: "rota" | "entregue") {
    api(`/api/entregas/${entrega.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    })
      .then(() => {
        toast.success(
          status === "rota"
            ? `Entrega ${entrega.cliente} iniciada — boa rota!`
            : `Entrega ${entrega.cliente} concluída.`
        );
        recarregar();
      })
      .catch((erro: Error) => toast.error(erro.message));
  }

  function registrarOcorrencia(texto: string) {
    if (!ocorrenciaDe) return;
    api(`/api/entregas/${ocorrenciaDe.id}`, {
      method: "PATCH",
      body: JSON.stringify({ ocorrencia: texto }),
    })
      .then(() => {
        toast.info("Ocorrência registrada.");
        setOcorrenciaDe(null);
        recarregar();
      })
      .catch((erro: Error) => toast.error(erro.message));
  }

  function confirmarPagamentoEntrega(entrega: EntregaApi, forma?: string) {
    if (!entrega.pagamento) return;
    api(`/api/pagamentos/${entrega.pagamento.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "confirmado", forma }),
    })
      .then(() => {
        toast.success(`Pagamento da entrega ${entrega.cliente} confirmado.`);
        setPagandoDe(null);
        recarregar();
      })
      .catch((erro: Error) => toast.error(erro.message));
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Rotas dos clientes"
        description="Suas entregas em ordem — toque no nome do cliente para abrir o caminho no Google Maps."
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-secondary/40 p-4">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {concluidas.length} de {concluidas.length + aEntregar.length} entregas concluídas
          </p>
          <p className="text-sm text-muted-foreground">
            {formatBRL(valorAReceber)} a receber na rota · {formatBRL(recebido)} já recebido
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            baixarRotaOffline(
              dados.entregas.map((e) => ({
                id: e.id,
                numeroPedido: Number(e.numeroPedido),
                cliente: e.cliente,
                telefone: e.telefone,
                endereco: e.endereco,
                bairro: e.bairro,
                complemento: e.complemento,
                referencia: e.referencia,
                itens: e.itens,
                valor: e.valor,
                formaPagamento: e.pagamento?.forma ?? e.formaPagamentoEntrega ?? null,
                observacao: e.ocorrencia,
                status: e.status,
              }))
            );
            toast.success("Rota baixada para uso offline.");
          }}
        >
          <DownloadCloud className="h-4 w-4" aria-hidden="true" />
          Baixar rota para uso offline
        </Button>
      </div>

      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <MapPin className="h-5 w-5 text-primary" aria-hidden="true" />
            Rota de hoje
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {concluidas.length} de {concluidas.length + aEntregar.length} entregas concluídas —
            {aEntregar.length > 0 ? " próxima parada em destaque." : " rota concluída."}
          </p>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"
            role="img"
            aria-label={`${concluidas.length} de ${concluidas.length + aEntregar.length} entregas concluídas`}
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width: `${concluidas.length + aEntregar.length > 0 ? (concluidas.length / (concluidas.length + aEntregar.length)) * 100 : 0}%`,
              }}
            />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col p-6 pt-4 sm:p-7 sm:pt-4">
          {paradas.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-muted/30 p-8 text-center">
              <MapPin className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium text-foreground">Nenhuma entrega na sua rota ainda</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Escaneie o QR de um pedido em <strong>Escanear</strong> para assumir a entrega — ela
                aparece aqui com o endereço e o botão <em>Como chegar</em>.
              </p>
              <Button asChild variant="outline" size="sm">
                <a href="/entregador/scanear">
                  <ScanLine className="h-4 w-4" aria-hidden="true" />
                  Ir para Escanear
                </a>
              </Button>
            </div>
          ) : (
            <ol className="flex flex-col">
            {paradas.map((parada, indice) => {
              const cfg = STATUS_PARADA_CONFIG[parada.status];
              const ultima = indice === paradas.length - 1;
              const entrega = dados.entregas.find(
                (e) => e.cliente === parada.cliente && e.status !== "cancelada"
              );
              const cancelada = dados.entregas.find(
                (e) => e.cliente === parada.cliente && e.status === "cancelada"
              );
              const mapsUrl = entrega?.endereco
                ? montarUrlMapa(entrega.endereco, entrega.bairro).maps
                : null;
              return (
                <li key={`${parada.cliente}-${parada.ordem}`} className="relative flex gap-4 pb-6 last:pb-0">
                  {/* Linha conectora + marcador */}
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2",
                        parada.status === "concluido"
                          ? "border-status-free bg-status-free-bg text-status-free"
                          : parada.status === "atual"
                            ? "border-primary bg-primary text-primary-foreground shadow-soft"
                            : "border-border bg-secondary text-muted-foreground"
                      )}
                    >
                      {parada.status === "concluido" ? (
                        <CircleCheck className="h-5 w-5" aria-hidden="true" />
                      ) : (
                        <MapPin className="h-5 w-5" aria-hidden="true" />
                      )}
                    </span>
                    {!ultima && <span className="w-0.5 flex-1 bg-border" aria-hidden="true" />}
                  </div>

                  {/* Conteúdo da parada */}
                  <div
                    className={cn(
                      "flex flex-1 flex-col gap-3 rounded-xl border p-4",
                      parada.status === "atual"
                        ? "border-primary/40 bg-primary-50"
                        : "border-border bg-card"
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {mapsUrl ? (
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline-offset-2 hover:underline"
                        >
                          <Navigation className="h-4 w-4" aria-hidden="true" />
                          {parada.ordem}. {parada.cliente}
                        </a>
                      ) : (
                        <span className="text-sm font-semibold">
                          {parada.ordem}. {parada.cliente}
                        </span>
                      )}
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
                          cfg.classes
                        )}
                      >
                        <span className={cn("h-2 w-2 rounded-full", cfg.dot)} aria-hidden="true" />
                        {cfg.label}
                      </span>
</div>
<div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
                      <p className="flex items-start gap-1.5">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        {parada.endereco} · {parada.bairro}
                      </p>
                      {entrega?.complemento && <p className="pl-6">{entrega.complemento}</p>}
                      {entrega?.referencia && (
                        <p className="pl-6">Referência: {entrega.referencia}</p>
                      )}
                      {entrega?.telefone && (
                        <p className="flex items-center gap-1.5 pl-6">
                          <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                          {entrega.telefone}
                        </p>
                      )}
                      {entrega?.pagamento && (
                        <p className="mt-1 text-xs font-medium">
                          <span className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
                            entrega.pagamento?.forma === "pix"
                              ? "bg-primary/20 text-primary"
                              : entrega.pagamento?.forma === "dinheiro"
                                ? "bg-amber/20 text-amber"
                                : entrega.pagamento?.forma === "cartao"
                                  ? "bg-blue/20 text-blue"
                                  : "bg-muted/20 text-muted-foreground"
                          )}>
                            {entrega.pagamento?.forma === "pix"
                              ? "💳 Pix"
                              : entrega.pagamento?.forma === "dinheiro"
                                ? "💵 Dinheiro"
                                : entrega.pagamento?.forma === "cartao"
                                  ? "💳 Cartão"
                                  : "—"}
                          </span>
                          {entrega.pagamento?.status !== "confirmado"
                            ? "A confirmar"
                            : "Confirmado"}
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground tabular">
                      Previsão: {parada.previsao}
                      {parada.status === "atual" && (
                        <span className="ml-2 inline-flex items-center gap-1 text-status-sent">
                          <CircleDashed className="h-3.5 w-3.5" aria-hidden="true" />
                          na entrega agora
                        </span>
                      )}
                    </p>
                    {entrega?.ocorrencia && (
                      <p className="text-xs text-status-occupied">Ocorrência: {entrega.ocorrencia}</p>
                    )}
                    {cancelada?.ocorrencia && (
                      <p className="text-xs text-status-occupied">
                        Cancelada: {cancelada.ocorrencia}
                      </p>
                    )}
                    {entrega && parada.status !== "concluido" && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {entrega.status === "preparo" && (
                          <Button size="sm" onClick={() => mudarStatus(entrega, "rota")}>
                            <Navigation className="h-4 w-4" aria-hidden="true" />
                            Iniciar entrega
                          </Button>
                        )}
                        {entrega.status === "rota" && (
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => mudarStatus(entrega, "entregue")}>
                              <PackageCheck className="h-4 w-4" aria-hidden="true" />
                              Concluir entrega
                            </Button>
                            {entrega.pagamento && entrega.pagamento.status !== "confirmado" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setPagandoDe(entrega)}
                              >
                                <Wallet className="h-4 w-4" aria-hidden="true" />
                                Pagar
                              </Button>
                            )}
                          </div>
                        )}
                        {["preparo", "rota", "aguardando"].includes(entrega.status) && (
                          <Button variant="outline" size="sm" onClick={() => setOcorrenciaDe(entrega)}>
                            <Flag className="h-4 w-4" aria-hidden="true" />
                            Ocorrência
                          </Button>
                        )}
                      </div>
                    )}
                    {entrega && mapsUrl && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button variant="outline" size="sm" asChild>
                          <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                            <MapPin className="h-4 w-4" aria-hidden="true" />
                            Abrir localização
                          </a>
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Dialog de ocorrência */}
      <OcorrenciaDialog
        entrega={ocorrenciaDe}
        onFechar={() => setOcorrenciaDe(null)}
        onSalvar={registrarOcorrencia}
      />

      {/* Dialog de pagamento — escolher como o cliente pagou */}
      <PagamentoDialog
        entrega={pagandoDe}
        onFechar={() => setPagandoDe(null)}
        onConfirmar={confirmarPagamentoEntrega}
      />
    </div>
  );
}

function PagamentoDialog({
  entrega,
  onFechar,
  onConfirmar,
}: {
  entrega: EntregaApi | null;
  onFechar: () => void;
  onConfirmar: (entrega: EntregaApi, forma: string) => void;
}) {
  const [forma, setForma] = React.useState("dinheiro");
  const [enviando, setEnviando] = React.useState(false);

  React.useEffect(() => {
    if (entrega?.pagamento?.forma) setForma(entrega.pagamento.forma);
    setEnviando(false);
  }, [entrega]);

  return (
    <Dialog open={entrega !== null} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Como o cliente pagou?</DialogTitle>
          <DialogDescription>
            {entrega ? (
              <>
                <strong>{entrega.cliente}</strong> — valor de{" "}
                <strong>{formatBRL(entrega.valor)}</strong>. Selecione a forma de pagamento.
              </>
            ) : (
              "Selecione como o cliente pagou na entrega."
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2">
          <Button
            type="button"
            variant={forma === "dinheiro" ? "primary" : "outline"}
            className="flex h-auto flex-col items-center gap-1 py-4"
            onClick={() => setForma("dinheiro")}
          >
            <Banknote className="h-6 w-6" aria-hidden="true" />
            Dinheiro
          </Button>
          <Button
            type="button"
            variant={forma === "cartao" || forma === "credito" || forma === "debito" ? "primary" : "outline"}
            className="flex h-auto flex-col items-center gap-1 py-4"
            onClick={() => setForma("cartao")}
          >
            <CreditCard className="h-6 w-6" aria-hidden="true" />
            Cartão
          </Button>
          <Button
            type="button"
            variant={forma === "pix" ? "primary" : "outline"}
            className="flex h-auto flex-col items-center gap-1 py-4"
            onClick={() => setForma("pix")}
          >
            <QrCode className="h-6 w-6" aria-hidden="true" />
            Pix
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            disabled={enviando || !entrega}
            onClick={() => {
              if (!entrega) return;
              setEnviando(true);
              onConfirmar(entrega, forma);
            }}
          >
            <Wallet className="h-4 w-4" aria-hidden="true" />
            Confirmar pagamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OcorrenciaDialog({
  entrega,
  onFechar,
  onSalvar,
}: {
  entrega: EntregaApi | null;
  onFechar: () => void;
  onSalvar: (texto: string) => void;
}) {
  const [texto, setTexto] = React.useState("");

  React.useEffect(() => {
    if (entrega) setTexto("");
  }, [entrega]);

  return (
    <Dialog open={entrega !== null} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar ocorrência</DialogTitle>
          <DialogDescription>
            {entrega
              ? `Entrega de ${entrega.cliente} — descreva o que aconteceu.`
              : "Descreva o que aconteceu na entrega."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Ocorrência frequente</Label>
            <Select
              value=""
              onValueChange={(v) => setTexto((atual) => (atual ? atual : v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Escolha uma opção…" />
              </SelectTrigger>
              <SelectContent>
                {OCORRENCIAS_SUGERIDAS.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ocorrencia-texto">Detalhes</Label>
            <Textarea
              id="ocorrencia-texto"
              placeholder="Ex.: cliente pediu para deixar na portaria; não respondeu o interfone…"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              className="min-h-[5rem]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button disabled={!texto.trim()} onClick={() => onSalvar(texto.trim())}>
            <Flag className="h-4 w-4" aria-hidden="true" />
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

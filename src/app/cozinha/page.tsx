"use client";

import * as React from "react";
import { toast } from "sonner";
import { CheckCheck, ChefHat, Flame, Hourglass, Printer, RefreshCw, Volume2, VolumeX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { FilaImpressao } from "@/components/impressao/fila-impressao";
import { cn, formatBRL, formatElapsed, formatHora } from "@/lib/utils";
import { useRelogio } from "@/hooks/use-relogio";
import { api, useApi } from "@/lib/api-cliente";

type Producao = "recebido" | "em_preparo" | "pronto";

interface ItemKds {
  uid: string;
  nome: string;
  quantidade: number;
  precoUnit: number;
  tamanho: string | null;
  sabores: string[];
  adicionais: { nome: string; preco: number }[];
  observacao: string | null;
}

interface PedidoKds {
  id: string;
  numero: number;
  canal: string;
  producao: Producao;
  recebidoEm: string;
  preparoIniciadoEm: string | null;
  prontoEm: string | null;
  clienteNome: string | null;
  mesaNumero: number | null;
  observacao: string | null;
  total: number;
  itens: ItemKds[];
}

const CANAL_ROTULO: Record<string, string> = {
  balcao: "Balcão",
  salao: "Salão",
  retirada: "Retirada",
  delivery: "Delivery",
};

const COLUNAS: Record<
  Producao,
  { titulo: string; icone: typeof Hourglass; contador: string; badge: string; dot: string }
> = {
  recebido: {
    titulo: "Recebidos",
    icone: Hourglass,
    contador: "text-status-waiting",
    badge: "bg-status-waiting-bg text-status-waiting border-status-waiting-border",
    dot: "bg-status-waiting",
  },
  em_preparo: {
    titulo: "Em preparo",
    icone: Flame,
    contador: "text-status-sent",
    badge: "bg-status-sent-bg text-status-sent border-status-sent-border",
    dot: "bg-status-sent",
  },
  pronto: {
    titulo: "Prontos",
    icone: CheckCheck,
    contador: "text-status-free",
    badge: "bg-status-free-bg text-status-free border-status-free-border",
    dot: "bg-status-free",
  },
};

const ORDEM: Producao[] = ["recebido", "em_preparo", "pronto"];

const PROXIMO_LABEL: Record<Producao, string> = {
  recebido: "Iniciar preparo",
  em_preparo: "Marcar pronto",
  pronto: "Pronto ✓",
};

const NOVO_EM_MS = 60_000; // pedido recebido há menos de 1 min = "NOVO"
const ALTA_ESPERA_MIN = 15; // recebido há mais de 15 min = prioridade alta

function tocarAlerta() {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => void ctx.close();
  } catch {
    // áudio indisponível — alerta segue visual
  }
}

/**
 * KDS — painel da cozinha em tempo real (PEDIDO 15).
 * Colunas por estágio (recebido → em preparo → pronto), horário e tempo
 * decorrido de cada pedido, prioridade por tempo de espera, alerta sonoro
 * configurável (salvo no navegador) e atualização via SSE
 * (`/api/kds/eventos`) com fallback de polling.
 */
export default function CozinhaPage() {
  const { dados, carregando, recarregar } = useApi<{ pedidos: PedidoKds[] }>(
    "/api/pedidos",
    { pedidos: [] }
  );
  const [filaAberta, setFilaAberta] = React.useState(false);
  const agora = useRelogio(30_000);

  // Alerta sonoro configurável (preferência local do navegador).
  const [somLigado, setSomLigado] = React.useState(false);
  React.useEffect(() => {
    setSomLigado(localStorage.getItem("kds-som") === "on");
  }, []);

  // Detecção de pedidos novos (evita repetir o alerta a cada atualização).
  const idsConhecidos = React.useRef<Set<string> | null>(null);

  // SSE: recarrega a cada mudança de produção; se a conexão cair, polling.
  React.useEffect(() => {
    let temporizador: number | null = null;
    let fechado = false;

    const viaPolling = () => {
      if (fechado) return;
      if (temporizador !== null) window.clearInterval(temporizador);
      temporizador = window.setInterval(() => recarregar(), 10_000);
    };

    const fonte = new EventSource("/api/kds/eventos");
    const aoMudar = () => recarregar();
    fonte.addEventListener("mudanca", aoMudar);
    fonte.addEventListener("error", () => {
      if (fechado) return;
      // Conexão caiu (ex.: proxy/timeout) → mantém o painel vivo por polling.
      fonte.close();
      viaPolling();
    });
    fonte.onopen = () => {
      if (temporizador !== null) {
        window.clearInterval(temporizador);
        temporizador = null;
      }
    };

    return () => {
      fechado = true;
      if (temporizador !== null) window.clearInterval(temporizador);
      fonte.close();
    };
  }, [recarregar]);

  // Alerta visual (badge NOVO) + sonoro para pedidos que acabaram de chegar.
  React.useEffect(() => {
    const pedidos = dados.pedidos;
    if (pedidos.length === 0) return;
    const jaConhecidos = idsConhecidos.current;
    if (jaConhecidos === null) {
      idsConhecidos.current = new Set(pedidos.map((p) => p.id));
      return;
    }
    const novatos = pedidos.filter(
      (p) => p.producao === "recebido" && !jaConhecidos.has(p.id)
    );
    for (const p of novatos) jaConhecidos.add(p.id);
    if (novatos.length > 0 && somLigado) {
      novatos.forEach(() => tocarAlerta());
      toast.success(
        novatos.length === 1
          ? `Pedido #${novatos[0].numero} chegou na cozinha.`
          : `${novatos.length} pedidos novos na cozinha.`
      );
    }
  }, [dados.pedidos, somLigado]);

  const [atualizando, setAtualizando] = React.useState<string | null>(null);

  async function avancar(pedido: PedidoKds) {
    if (pedido.producao === "pronto") return;
    const proximo: Producao = pedido.producao === "recebido" ? "em_preparo" : "pronto";
    setAtualizando(pedido.id);
    try {
      await api(`/api/pedidos/${pedido.id}`, {
        method: "PATCH",
        body: JSON.stringify({ producao: proximo }),
      });
      toast.success(
        proximo === "pronto"
          ? `Pedido #${pedido.numero} pronto.`
          : `Pedido #${pedido.numero} em preparo.`
      );
      recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível atualizar o pedido.");
    } finally {
      setAtualizando(null);
    }
  }

  // Sem duplicados (defesa extra contra o mesmo pedido duas vezes na lista).
  const pedidosUnicos = React.useMemo(() => {
    const vistos = new Set<string>();
    return dados.pedidos.filter((p) => (vistos.has(p.id) ? false : (vistos.add(p.id), true)));
  }, [dados.pedidos]);

  const porColuna = React.useMemo(() => {
    const grupos: Record<Producao, PedidoKds[]> = { recebido: [], em_preparo: [], pronto: [] };
    for (const pedido of pedidosUnicos) {
      if (pedido.producao in grupos) grupos[pedido.producao].push(pedido);
    }
    // Quem espera há mais tempo vai primeiro (prioridade por espera).
    grupos.recebido.sort((a, b) => a.recebidoEm.localeCompare(b.recebidoEm));
    grupos.em_preparo.sort((a, b) =>
      (a.preparoIniciadoEm ?? a.recebidoEm).localeCompare(b.preparoIniciadoEm ?? b.recebidoEm)
    );
    grupos.pronto.sort((a, b) => (a.prontoEm ?? a.recebidoEm).localeCompare(b.prontoEm ?? b.recebidoEm));
    return grupos;
  }, [pedidosUnicos]);

  function minutosDesde(iso: string | null) {
    if (!iso) return 0;
    return Math.max(0, Math.floor((agora.getTime() - new Date(iso).getTime()) / 60_000));
  }

  const totalEmProducao = pedidosUnicos.length;
  const vazio = !carregando && totalEmProducao === 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Cozinha — produção"
        description="Pedidos em tempo real: recebidos, em preparo e prontos para sair."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const ligar = !somLigado;
                setSomLigado(ligar);
                localStorage.setItem("kds-som", ligar ? "on" : "off");
                if (ligar) tocarAlerta();
              }}
              aria-pressed={somLigado}
              title={somLigado ? "Alerta sonoro ligado" : "Alerta sonoro desligado"}
            >
              {somLigado ? (
                <Volume2 className="h-4 w-4" aria-hidden="true" />
              ) : (
                <VolumeX className="h-4 w-4" aria-hidden="true" />
              )}
              {somLigado ? "Som ligado" : "Som desligado"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setFilaAberta(true)}>
              <Printer className="h-4 w-4" aria-hidden="true" />
              Impressão
            </Button>
            <Button variant="outline" size="sm" onClick={recarregar}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Atualizar
            </Button>
          </div>
        }
      />

      <Dialog open={filaAberta} onOpenChange={(abrir) => !abrir && setFilaAberta(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Impressão — fila da cozinha</DialogTitle>
          </DialogHeader>
          <div className="max-h-[65vh] overflow-auto">
            <FilaImpressao destino="cozinha" />
          </div>
        </DialogContent>
      </Dialog>

      {carregando && totalEmProducao === 0 ? (
        <Card className="flex items-center justify-center gap-3 p-10 text-muted-foreground">
          <ChefHat className="h-6 w-6 animate-pulse" aria-hidden="true" />
          Carregando a produção…
        </Card>
      ) : vazio ? (
        <EmptyState
          title="Nenhum pedido em produção"
          description="Quando os pedidos chegarem, eles aparecem aqui em tempo real."
        />
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-3">
          {ORDEM.map((estagio) => {
            const coluna = COLUNAS[estagio];
            const Icone = coluna.icone;
            const lista = porColuna[estagio];
            return (
              <section
                key={estagio}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-secondary/40 p-4"
                aria-label={coluna.titulo}
              >
                <header className="flex items-center justify-between gap-2 px-1">
                  <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    <Icone className={cn("h-4 w-4", coluna.contador)} aria-hidden="true" />
                    {coluna.titulo}
                  </h2>
                  <span className="rounded-full bg-card px-2.5 py-0.5 text-sm font-bold tabular">
                    {lista.length}
                  </span>
                </header>

                {lista.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                    Nenhum pedido aqui
                  </p>
                ) : (
                  lista.map((pedido) => {
                    const novo = estagio === "recebido" && minutosDesde(pedido.recebidoEm) === 0;
                    const altaEspera =
                      estagio !== "pronto" && minutosDesde(pedido.recebidoEm) >= ALTA_ESPERA_MIN;
                    const espera = minutosDesde(pedido.recebidoEm);
                    const emPreparoMin = estagio === "em_preparo"
                      ? minutosDesde(pedido.preparoIniciadoEm)
                      : 0;
                    const cfg = COLUNAS[estagio];
                    return (
                      <Card
                        key={pedido.id}
                        className={cn(
                          "flex flex-col",
                          novo && "ring-2 ring-status-waiting/50"
                        )}
                      >
                        <CardHeader className="flex-row items-start justify-between gap-3 p-4 pb-2">
                          <div className="flex flex-col gap-1">
                            <p className="text-base font-bold tracking-[-0.01em] text-foreground">
                              Pedido #{pedido.numero}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {CANAL_ROTULO[pedido.canal] ?? pedido.canal}
                              {pedido.mesaNumero ? ` · Mesa ${pedido.mesaNumero}` : ""}
                              {pedido.clienteNome ? ` · ${pedido.clienteNome}` : ""}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                              cfg.badge
                            )}
                          >
                            <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} aria-hidden="true" />
                            {estagio === "recebido" ? "Recebido" : estagio === "em_preparo" ? "Em preparo" : "Pronto"}
                          </span>
                        </CardHeader>
                        <CardContent className="flex flex-1 flex-col gap-3 p-4 pt-1">
                          <p className="flex items-center justify-between gap-2 text-xs text-muted-foreground tabular">
                            <span>
                              Recebido às {formatHora(new Date(pedido.recebidoEm))}
                            </span>
                            <span className={cn("font-semibold", altaEspera && "text-status-waiting")}>
                              {formatElapsed(espera)}
                            </span>
                          </p>
                          {estagio === "em_preparo" ? (
                            <p className="text-xs text-muted-foreground tabular">
                              Em preparo há {formatElapsed(emPreparoMin)}
                            </p>
                          ) : null}

                          {(novo || altaEspera) && (
                            <div className="flex flex-wrap gap-1.5">
                              {novo && (
                                <span className="inline-flex animate-pulse items-center rounded-full bg-status-waiting-bg px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-status-waiting">
                                  Novo
                                </span>
                              )}
                              {altaEspera && (
                                <span className="inline-flex items-center rounded-full border border-status-waiting-border bg-status-waiting-bg px-2.5 py-0.5 text-xs font-semibold text-status-waiting">
                                  Alta espera
                                </span>
                              )}
                            </div>
                          )}

                          <ul className="flex flex-col gap-2.5">
                            {pedido.itens.map((item) => (
                              <li key={item.uid} className="text-sm">
                                <p className="text-foreground">
                                  <span className="font-semibold">{item.quantidade}×</span>{" "}
                                  {item.nome}
                                  {item.tamanho ? (
                                    <span className="ml-1 rounded bg-secondary px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                                      {item.tamanho}
                                    </span>
                                  ) : null}
                                </p>
                                {item.sabores.length > 0 && (
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    Sabores: {item.sabores.join(" + ")}
                                  </p>
                                )}
                                {item.adicionais.length > 0 && (
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    {item.adicionais.map((a) => `+ ${a.nome}`).join(" · ")}
                                  </p>
                                )}
                                {item.observacao ? (
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    Obs.: {item.observacao}
                                  </p>
                                ) : null}
                              </li>
                            ))}
                          </ul>

                          {pedido.observacao ? (
                            <p className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
                              Observação: {pedido.observacao}
                            </p>
                          ) : null}

                          <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3">
                            <p className="text-sm text-muted-foreground tabular">
                              Total{" "}
                              <span className="font-semibold text-foreground">
                                {formatBRL(pedido.total)}
                              </span>
                            </p>
                            <Button
                              size="sm"
                              onClick={() => avancar(pedido)}
                              disabled={
                                atualizando === pedido.id || pedido.producao === "pronto"
                              }
                            >
                              {PROXIMO_LABEL[pedido.producao]}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

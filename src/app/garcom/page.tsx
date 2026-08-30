"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Minus, Plus, UtensilsCrossed } from "lucide-react";

import { PageHeader } from "@/components/patterns/page-header";
import { TableCard } from "@/components/patterns/table-card";
import { EmptyState } from "@/components/patterns/empty-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { STATUS_CONFIG, type TableStatus } from "@/components/patterns/status-badge";
import { useRelogio } from "@/hooks/use-relogio";
import { useGarcom } from "@/app/garcom/_lib/garcom-context";
import type { Mesa } from "@/app/garcom/_lib/mock-data";

const FILTROS: { value: "todas" | TableStatus; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "livre", label: "Livres" },
  { value: "aguardando", label: "Aguardando" },
  { value: "enviado", label: "Enviadas" },
  { value: "conta", label: "Conta" },
  { value: "ocupada", label: "Ocupadas" },
];

/** Minutos decorridos: mesas abertas nesta sessão contam pelo relógio real;
 * as do mock usam o valor fixo de `elapsedMinutes`. */
function elapsedDe(mesa: Mesa, agora: Date) {
  if (mesa.abertaEm) {
    return Math.max(0, Math.floor((agora.getTime() - mesa.abertaEm) / 60_000));
  }
  return mesa.elapsedMinutes;
}

export default function GarcomMesasPage() {
  const router = useRouter();
  const { mesas, abrirMesa } = useGarcom();
  const agora = useRelogio();

  const [filtro, setFiltro] = React.useState<(typeof FILTROS)[number]["value"]>("todas");
  const [mesaParaAbrir, setMesaParaAbrir] = React.useState<Mesa | null>(null);
  const [pessoas, setPessoas] = React.useState(2);

  const mesasFiltradas =
    filtro === "todas" ? mesas : mesas.filter((m) => m.status === filtro);

  // A mesa "aguardando" há mais tempo ganha o pulso — no máximo uma por tela
  // (ver DESIGN_SYSTEM.md → Movimento).
  const mesaPulso = mesasFiltradas.reduce<Mesa | null>((antiga, mesa) => {
    if (mesa.status !== "aguardando") return antiga;
    const elapsed = elapsedDe(mesa, agora) ?? 0;
    const elapsedAntiga = antiga ? elapsedDe(antiga, agora) ?? 0 : -1;
    return elapsed > elapsedAntiga ? mesa : antiga;
  }, null);

  function handleClickMesa(mesa: Mesa) {
    if (mesa.status === "livre") {
      setPessoas(2);
      setMesaParaAbrir(mesa);
      return;
    }
    router.push(`/garcom/mesa/${mesa.id}`);
  }

  function confirmarAberturaMesa() {
    if (!mesaParaAbrir) return;
    abrirMesa(mesaParaAbrir.id, pessoas);
    toast.success(`Mesa ${String(mesaParaAbrir.id).padStart(2, "0")} aberta.`);
    const id = mesaParaAbrir.id;
    setMesaParaAbrir(null);
    router.push(`/garcom/mesa/${id}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Mesas"
        description="Toque em uma mesa livre para abrir, ou em uma mesa ocupada para ver o pedido."
      />

      {/* Filtro por status + grade */}
      <Tabs
        value={filtro}
        onValueChange={(v) => setFiltro(v as typeof filtro)}
        className="flex flex-col gap-6"
      >
        <TabsList className="h-auto flex-wrap gap-1.5 p-1.5">
          {FILTROS.map((f) => (
            <TabsTrigger key={f.value} value={f.value}>
              {f.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Legenda de status */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          {(Object.keys(STATUS_CONFIG) as TableStatus[]).map((status) => (
            <span key={status} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${STATUS_CONFIG[status].bg} border ${STATUS_CONFIG[status].border}`} />
              {STATUS_CONFIG[status].label}
            </span>
          ))}
        </div>

        <TabsContent value={filtro} className="mt-0">
          {mesasFiltradas.length === 0 ? (
            <EmptyState
              icon={UtensilsCrossed}
              title="Nenhuma mesa neste status"
              description="Escolha outro filtro para ver as demais mesas do salão."
            />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {mesasFiltradas.map((mesa) => (
                <TableCard
                  key={mesa.id}
                  number={mesa.id}
                  status={mesa.status}
                  elapsedMinutes={elapsedDe(mesa, agora)}
                  pulse={mesaPulso?.id === mesa.id}
                  onClick={() => handleClickMesa(mesa)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Abrir mesa */}
      <Dialog
        open={mesaParaAbrir !== null}
        onOpenChange={(open) => !open && setMesaParaAbrir(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Abrir mesa {mesaParaAbrir ? String(mesaParaAbrir.id).padStart(2, "0") : ""}
            </DialogTitle>
            <DialogDescription>
              Informe quantas pessoas vão sentar para começar o pedido.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-2">
            <span className="text-sm font-medium text-muted-foreground">
              Número de pessoas
            </span>
            <div className="flex items-center gap-5">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Diminuir número de pessoas"
                onClick={() => setPessoas((p) => Math.max(1, p - 1))}
              >
                <Minus className="h-5 w-5" />
              </Button>
              <span className="w-16 text-center text-4xl font-bold tabular">{pessoas}</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Aumentar número de pessoas"
                onClick={() => setPessoas((p) => Math.min(20, p + 1))}
              >
                <Plus className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMesaParaAbrir(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmarAberturaMesa}>Abrir mesa e lançar pedido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

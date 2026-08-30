"use client";

import * as React from "react";
import { toast } from "sonner";
import { Armchair, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmarAcao } from "@/components/patterns/confirmar-acao";
import { cn } from "@/lib/utils";
import { api, useApi } from "@/lib/api-cliente";
import type { Mesa } from "@/lib/mesas";

const STATUS_ROTULO: Record<string, string> = {
  livre: "Livre",
  aguardando: "Aguardando pedido",
  enviado: "Pedido enviado",
  conta: "Conta",
  ocupada: "Ocupada",
};

const STATUS_COR: Record<string, { texto: string; fundo: string; borda: string; bolinha: string }> = {
  livre: { texto: "text-status-free", fundo: "bg-status-free-bg", borda: "border-status-free-border", bolinha: "bg-status-free" },
  aguardando: { texto: "text-status-waiting", fundo: "bg-status-waiting-bg", borda: "border-status-waiting-border", bolinha: "bg-status-waiting" },
  enviado: { texto: "text-status-sent", fundo: "bg-status-sent-bg", borda: "border-status-sent-border", bolinha: "bg-status-sent" },
  conta: { texto: "text-status-bill", fundo: "bg-status-bill-bg", borda: "border-status-bill-border", bolinha: "bg-status-bill" },
  ocupada: { texto: "text-status-occupied", fundo: "bg-status-occupied-bg", borda: "border-status-occupied-border", bolinha: "bg-status-occupied" },
};

/**
 * Mesas — cadastro/remoção das mesas do salão (PDV/Salão e app Garçom).
 * Cada mesa tem número e capacidade; só mesas LIVRES podem ser removidas.
 * As mudanças são salvas no banco e refletem em tempo real no PDV e no
 * Garçom (evento "mesa" → recarga automática dos dois lados).
 */
export function ConfigMesas() {
  const { dados, recarregar } = useApi<{ mesas: Mesa[] }>("/api/mesas", { mesas: [] });
  const mesas = dados.mesas;
  const livres = mesas.filter((m) => m.status === "livre").length;

  const [dialogoAberto, setDialogoAberto] = React.useState(false);
  const [numero, setNumero] = React.useState("");
  const [capacidade, setCapacidade] = React.useState("4");
  const [enviando, setEnviando] = React.useState(false);

  function abrirNovo() {
    // Sugere o próximo número livre para o operador (ex.: 13 se 1–12 usados).
    const usados = new Set(mesas.map((m) => m.id));
    let proximo = 1;
    while (usados.has(proximo)) proximo++;
    setNumero(String(proximo));
    setCapacidade("4");
    setDialogoAberto(true);
  }

  async function salvar() {
    const num = Number(numero);
    const cap = Number(capacidade);
    if (!Number.isInteger(num) || num < 1) {
      toast.error("Informe um número de mesa válido.");
      return;
    }
    if (!Number.isInteger(cap) || cap < 1) {
      toast.error("Informe uma capacidade válida (mínimo 1 pessoa).");
      return;
    }
    setEnviando(true);
    try {
      await api(`/api/mesas/${num}`, {
        method: "PUT",
        body: JSON.stringify({ capacidade: cap }),
      });
      toast.success(`Mesa ${String(num).padStart(2, "0")} salva.`);
      setDialogoAberto(false);
      recarregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar a mesa.");
    } finally {
      setEnviando(false);
    }
  }

  async function remover(mesa: Mesa) {
    try {
      await api(`/api/mesas/${mesa.id}`, { method: "DELETE" });
      toast.success(`Mesa ${String(mesa.id).padStart(2, "0")} removida.`);
      recarregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível remover a mesa.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {livres} de {mesas.length} mesas livres.
        </p>
        <Button onClick={abrirNovo}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nova mesa
        </Button>
      </div>

      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Armchair className="h-5 w-5 text-primary" aria-hidden="true" />
            Mesas do salão
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            As mudanças aparecem na hora no PDV (aba Salão) e no app do Garçom. Só mesas livres podem ser removidas.
          </p>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          {mesas.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground sm:px-7">
              Nenhuma mesa cadastrada. Clique em “Nova mesa” para montar o salão.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mesa</TableHead>
                  <TableHead>Capacidade</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Ocupação atual</TableHead>
                  <TableHead className="w-24 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mesas.map((mesa) => {
                  const rotulo = STATUS_ROTULO[mesa.status] ?? mesa.status;
                  const cor = STATUS_COR[mesa.status] ?? STATUS_COR.livre;
                  return (
                    <TableRow key={mesa.id}>
                      <TableCell>
                        <span className="font-medium">{String(mesa.id).padStart(2, "0")}</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {mesa.capacidade ?? 4} {mesa.capacidade && mesa.capacidade > 1 ? "pessoas" : "pessoa"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
                            cor.fundo,
                            cor.texto,
                            cor.borda
                          )}
                        >
                          <span className={cn("h-2 w-2 rounded-full", cor.bolinha)} aria-hidden="true" />
                          {rotulo}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {mesa.status === "livre" ? (
                          "—"
                        ) : (
                          <span className="text-sm">
                            {mesa.pessoas ?? "?"} pessoas{mesa.garcom ? ` · ${mesa.garcom}` : ""}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {mesa.status === "livre" ? (
                          <ConfirmarAcao
                            trigger={
                              <Button size="sm" variant="ghost">
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                                Excluir
                              </Button>
                            }
                            titulo={`Remover a mesa ${String(mesa.id).padStart(2, "0")}?`}
                            descricao="A mesa será removida do salão e não pode ser desfeita. (Se quiser voltar, cadastre de novo com o mesmo número.)"
                            textoConfirmar="Sim, remover"
                            aoConfirmar={() => remover(mesa)}
                          />
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled
                            title="Libere a mesa (feche a comanda) antes de remover."
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            Excluir
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogoAberto} onOpenChange={setDialogoAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova mesa</DialogTitle>
            <DialogDescription>
              O número é o identificador usado pela equipe no salão, no PDV e no app do Garçom.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mesa-numero">Número</Label>
              <Input
                id="mesa-numero"
                inputMode="numeric"
                placeholder="Ex.: 13"
                value={numero}
                onChange={(e) => setNumero(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mesa-capacidade">Capacidade (pessoas)</Label>
              <Input
                id="mesa-capacidade"
                inputMode="numeric"
                placeholder="Ex.: 4"
                value={capacidade}
                onChange={(e) => setCapacidade(e.target.value.replace(/\D/g, ""))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogoAberto(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={enviando}>
              {enviando ? "Salvando…" : "Salvar mesa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

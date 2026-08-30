"use client";

import * as React from "react";
import { toast } from "sonner";
import { CloudUpload, Database, HardDrive, MapPin, RefreshCcw, Wifi, WifiOff } from "lucide-react";

import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/patterns/empty-state";
import { cn } from "@/lib/utils";
import {
  lerRotaOffline,
  lerFilaOffline,
  sincronizarFilaOffline,
  type RotaOffline,
  type AcaoOffline,
} from "@/lib/offline-entregador";

const PASSOS_OFFLINE = [
  {
    titulo: "Baixe a rota antes de sair",
    descricao: "Na tela \"Minha rota\", toque em \"Baixar rota para uso offline\".",
  },
  {
    titulo: "Confirmações ficam na fila",
    descricao: "Sem sinal, escanear/confirmar entrega guarda a ação neste aparelho.",
  },
  {
    titulo: "Sincroniza ao reconectar",
    descricao: "A fila é enviada sozinha assim que a internet volta (ou toque em \"Sincronizar agora\").",
  },
];

const ROTULO_ACAO: Record<AcaoOffline["tipo"], string> = {
  "confirmar-codigo": "Confirmação de entrega (QR/código)",
  "confirmar-entrega": "Confirmação de entrega",
  "confirmar-pagamento": "Confirmação de pagamento",
};

/**
 * Modo offline — mostra a rota realmente baixada neste aparelho
 * (ver src/lib/offline-entregador.ts) e a fila de ações pendentes de
 * sincronização, com envio real ao reconectar.
 */
export default function OfflinePage() {
  const [online, setOnline] = React.useState(true);
  const [rota, setRota] = React.useState<RotaOffline | null>(null);
  const [fila, setFila] = React.useState<AcaoOffline[]>([]);
  const [sincronizando, setSincronizando] = React.useState(false);

  const atualizar = React.useCallback(() => {
    setRota(lerRotaOffline());
    setFila(lerFilaOffline());
  }, []);

  React.useEffect(() => {
    setOnline(navigator.onLine);
    atualizar();
    const aoFicarOnline = () => {
      setOnline(true);
      sincronizar();
    };
    const aoFicarOffline = () => setOnline(false);
    window.addEventListener("online", aoFicarOnline);
    window.addEventListener("offline", aoFicarOffline);
    return () => {
      window.removeEventListener("online", aoFicarOnline);
      window.removeEventListener("offline", aoFicarOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sincronizar() {
    setSincronizando(true);
    try {
      const resultado = await sincronizarFilaOffline();
      if (resultado.enviados > 0) {
        toast.success(`${resultado.enviados} ação(ões) sincronizada(s).`);
      }
      if (resultado.falharam > 0) {
        toast.error(`${resultado.falharam} ação(ões) ainda não sincronizaram — tente de novo com internet estável.`);
      }
      if (resultado.enviados === 0 && resultado.falharam === 0) {
        toast.info("Nada pendente para sincronizar.");
      }
    } catch {
      toast.error("Falha ao sincronizar. Tente novamente.");
    } finally {
      setSincronizando(false);
      atualizar();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Modo offline"
        description="Rota baixada neste aparelho e ações pendentes de sincronização."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              {online ? (
                <Wifi className="h-5 w-5 text-status-free" aria-hidden="true" />
              ) : (
                <WifiOff className="h-5 w-5 text-status-waiting" aria-hidden="true" />
              )}
              Estado da conexão
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5 p-6 pt-4 sm:p-7 sm:pt-4">
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-border p-5">
              <div className="flex items-center gap-4">
                <span
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-xl",
                    online ? "bg-status-free-bg text-status-free" : "bg-status-waiting-bg text-status-waiting"
                  )}
                >
                  {online ? <Wifi className="h-5 w-5" aria-hidden="true" /> : <WifiOff className="h-5 w-5" aria-hidden="true" />}
                </span>
                <div>
                  <p className="font-semibold">{online ? "Conectado" : "Offline"}</p>
                  <p className="text-sm text-muted-foreground">
                    {fila.length} {fila.length === 1 ? "ação aguardando" : "ações aguardando"} envio.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-border p-5">
              <HardDrive className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              {rota ? (
                <div>
                  <p className="font-semibold">Rota baixada</p>
                  <p className="text-sm text-muted-foreground">
                    {rota.entregas.length} entrega(s) · atualizada em{" "}
                    {new Date(rota.baixadaEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="font-semibold">Nenhuma rota baixada ainda</p>
                  <p className="text-sm text-muted-foreground">
                    Vá em &quot;Minha rota&quot; e toque em &quot;Baixar rota para uso offline&quot;.
                  </p>
                </div>
              )}
            </div>

            <Button className="w-full sm:w-fit" variant="outline" onClick={sincronizar} disabled={sincronizando}>
              <CloudUpload className="h-4 w-4" aria-hidden="true" />
              {sincronizando ? "Sincronizando…" : "Sincronizar agora"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <HardDrive className="h-5 w-5 text-primary" aria-hidden="true" />
              Como funciona
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5 p-6 pt-4 sm:p-7 sm:pt-4">
            {PASSOS_OFFLINE.map((passo, indice) => (
              <div key={passo.titulo} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-primary-700">
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

      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Database className="h-5 w-5 text-primary" aria-hidden="true" />
            Fila de sincronização
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {fila.length} {fila.length === 1 ? "ação" : "ações"} aguardando envio ao servidor.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 p-6 pt-4 sm:p-7 sm:pt-4">
          {fila.length === 0 ? (
            <EmptyState icon={MapPin} title="Fila vazia" description="Nenhuma ação pendente de sincronização." />
          ) : (
            fila.map((acao) => (
              <div
                key={acao.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                    <RefreshCcw className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{ROTULO_ACAO[acao.tipo]}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(acao.criadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-status-waiting-border bg-status-waiting-bg px-3 py-1 text-xs font-semibold text-status-waiting">
                  <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Aguardando envio
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

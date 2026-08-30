"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Keyboard,
  Loader2,
  Navigation,
  ScanLine,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApi } from "@/lib/api-cliente";
import { useEventosTempoReal } from "@/lib/usar-eventos-tempo-real";
import { confirmarCodigoComFila, lerRotaOffline } from "@/lib/offline-entregador";

interface EntregaApi {
  id: string;
  numeroPedido: number;
  codigoQr: string;
  cliente: string;
  endereco: string;
  bairro: string;
  status: "preparo" | "rota" | "entregue" | "cancelada";
}

interface RespostaEntregas {
  entregas: EntregaApi[];
}

const ENTREGAS_FALLBACK: RespostaEntregas = { entregas: [] };

/**
 * Escanear — leitor de QR do entregador para ASSUMIR uma entrega
 * (correção de função: antes, escanear já CONCLUÍA a entrega e o
 * pagamento — o QR da comanda significa "eu peguei este pedido pra
 * sair", não "esta venda foi paga"). Depois de assumir, "iniciar rota"
 * e "confirmar entrega" continuam na tela principal do Entregador,
 * como ações separadas.
 */
export default function EscanearPage() {
  const router = useRouter();
  const { dados, recarregar } = useApi<RespostaEntregas>("/api/entregas", ENTREGAS_FALLBACK);
  const entregas = dados.entregas ?? [];
  const emRota = entregas.filter((e) => e.status === "rota" || e.status === "preparo");
  // Sincronização entre dispositivos: se outro entregador pegar/concluir
  // uma entrega, esta lista atualiza sozinha (a entrega some daqui).
  useEventosTempoReal(["entrega"], recarregar);

  const areaLeitor = React.useRef<HTMLDivElement>(null);
  const [leitorAtivo, setLeitorAtivo] = React.useState(false);
  const [iniciando, setIniciando] = React.useState(false);
  const [erroCamera, setErroCamera] = React.useState<string | null>(null);
  const [manual, setManual] = React.useState("");
  const [confirmando, setConfirmando] = React.useState(false);
  const scannerRef = React.useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const processando = React.useRef(false);

  const pararLeitor = React.useCallback(async () => {
    setLeitorAtivo(false);
    try {
      await scannerRef.current?.stop();
      scannerRef.current?.clear();
    } catch {
      /* câmera já parada */
    }
    scannerRef.current = null;
  }, []);

  const confirmar = React.useCallback(
    async (codigo: string) => {
      const codigoLimpo = codigo.trim();
      if (!codigoLimpo) return;
      setConfirmando(true);
      try {
        const resultado = await confirmarCodigoComFila(codigoLimpo);
        if (resultado.offline) {
          // Sem internet: a confirmação entrou na fila local (ver
          // "Modo offline") e será enviada de verdade assim que a
          // conexão voltar — nunca finge sucesso do servidor.
          const rota = lerRotaOffline();
          const numero = codigoLimpo.match(/(\d{1,9})/)?.[1] ?? codigoLimpo;
          const daRota = rota?.entregas.find((e) => String(e.numeroPedido) === numero);
          setManual("");
          toast.info(`Sem internet — confirmação do pedido #${numero} salva para sincronizar depois.`);
          return;
        }
        // Recarrega a lista para saber o cliente/número assumidos de verdade.
        await recarregar();
        setManual("");
        const numeroConfirmado = resultado.entrega?.numero ?? codigoLimpo;
        toast.success(`Entrega do pedido #${numeroConfirmado} assumida — indo para a sua rota…`);
        router.push("/entregador");
      } catch (erro) {
        toast.error(erro instanceof Error ? erro.message : "Falha ao confirmar entrega");
      } finally {
        setConfirmando(false);
      }
    },
    [recarregar, router]
  );

  const iniciarLeitor = React.useCallback(async () => {
    setErroCamera(null);
    setIniciando(true);
    try {
      const modulo = await import("html5-qrcode");
      const Html5Qrcode = modulo.Html5Qrcode;
      const scanner = new Html5Qrcode("leitor-qr");
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (texto) => {
          if (processando.current) return;
          processando.current = true;
          setManual(texto);
          await confirmar(texto);
          processando.current = false;
        },
        () => {
          /* quadros sem QR — ignora */
        }
      );
      setLeitorAtivo(true);
    } catch (e) {
      setErroCamera(
        e instanceof Error
          ? e.message.includes("NotFound") || e.message.includes("NotAllowed")
            ? "Câmera indisponível ou sem permissão — use o código manual abaixo."
            : e.message
          : "Não foi possível iniciar a câmera."
      );
    } finally {
      setIniciando(false);
    }
  }, [confirmar]);

  React.useEffect(() => {
    return () => {
      void pararLeitor();
    };
  }, [pararLeitor]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Escanear"
        description="Leia o QR do cliente (ou digite o código) para confirmar a entrega."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <ScanLine className="h-5 w-5 text-primary" aria-hidden="true" />
              Leitor de QR
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Escaneie o QR da comanda para ASSUMIR a entrega — isso ainda não conclui nem paga.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-6 pt-4 sm:p-7 sm:pt-4">
            <div
              id="leitor-qr"
              ref={areaLeitor}
              className={`overflow-hidden rounded-2xl border bg-muted/40 ${
                leitorAtivo ? "" : "hidden"
              }`}
            />
            {!leitorAtivo && !erroCamera && (
              <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-muted/30 text-center">
                <Camera className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                <p className="max-w-56 text-sm text-muted-foreground">
                  Aponte a câmera para o QR do cliente.
                </p>
              </div>
            )}
            {erroCamera && (
              <p className="flex items-center gap-2 rounded-xl border border-status-waiting-border bg-status-waiting-bg p-3 text-xs text-status-waiting">
                <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {erroCamera}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              {leitorAtivo ? (
                <Button variant="outline" onClick={() => void pararLeitor()}>
                  <CameraOff className="h-4 w-4" aria-hidden="true" />
                  Parar câmera
                </Button>
              ) : (
                <Button onClick={() => void iniciarLeitor()} disabled={iniciando}>
                  {iniciando ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Camera className="h-4 w-4" aria-hidden="true" />
                  )}
                  Iniciar câmera
                </Button>
              )}
            </div>
            <div className="flex flex-col gap-1.5 border-t pt-4">
              <Label className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
                Ou digite o código do pedido
              </Label>
              <div className="flex gap-2">
                <Input
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  placeholder="ex.: 1158"
                  inputMode="numeric"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void confirmar(manual);
                  }}
                  aria-label="Código do pedido"
                />
                <Button onClick={() => void confirmar(manual)} disabled={confirmando || !manual.trim()}>
                  {confirmando ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  )}
                  Confirmar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
            <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
              <CardTitle className="flex items-center gap-2 text-xl">
                <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
                Suas entregas em rota
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                O código é o número do pedido que aparece na comanda do cliente.
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 p-6 pt-4 sm:p-7 sm:pt-4">
              {emRota.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma entrega em rota no momento.
                </p>
              ) : (
                emRota.map((entrega) => (
                  <div
                    key={entrega.id}
                    className="flex items-center justify-between gap-3 rounded-xl border p-3"
                  >
                    <div className="flex min-w-0 flex-col">
                      <p className="font-mono text-sm font-semibold tabular">
                        #{entrega.numeroPedido}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{entrega.cliente}</p>
                    </div>
                    <code className="shrink-0 rounded bg-muted px-2 py-1 font-mono text-xs">
                      #{entrega.numeroPedido}
                    </code>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Ao escanear, você assume a entrega — ela passa a ser sua. Finalizar o pedido e
            confirmar o pagamento continuam sendo ações separadas, na tela principal do Entregador.
          </p>
      </div>
    </div>
  );
}

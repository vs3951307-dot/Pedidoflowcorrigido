"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  ExternalLink,
  FileDigit,
  Loader2,
  RefreshCw,
  Search,
  TriangleAlert,
  XCircle,
} from "lucide-react";

import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-cliente";
import { formatBRL, formatDataHora } from "@/lib/utils";
import { formatarChave } from "@/lib/fiscal/chave";
import { STATUS_FISCAL_ROTULOS, type StatusDocumentoFiscal } from "@/lib/fiscal/tipos";

interface DocumentoLista {
  id: string;
  pedidoId: string;
  pedidoNumero: number | null;
  canal: string | null;
  total: number | null;
  status: StatusDocumentoFiscal;
  ambiente: string;
  provedor: string;
  numero: number | null;
  serie: number | null;
  chave: string | null;
  protocolo: string | null;
  cStat: string | null;
  xMotivo: string | null;
  tentativas: number;
  emitidaEm: string | null;
  autorizadaEm: string | null;
  canceladaEm: string | null;
  motivoCancelamento: string | null;
  criadoEm: string;
}

interface DocumentoDetalhe extends DocumentoLista {
  xml: string | null;
  danfeUrl: string | null;
  qrcodeUrl: string | null;
  qrcodeTexto: string | null;
  erro: string | null;
  pedido?: { numero: number; canal: string | null; total: number | null; clienteNome: string | null };
}

const STATUSES: StatusDocumentoFiscal[] = [
  "autorizado",
  "pendente",
  "enviado",
  "rejeitado",
  "cancelado",
  "nao_configurado",
  "erro",
];

const VARIANTE_POR_STATUS: Record<StatusDocumentoFiscal, "free" | "waiting" | "sent" | "bill" | "occupied" | "default"> = {
  autorizado: "free",
  pendente: "waiting",
  enviado: "sent",
  rejeitado: "occupied",
  cancelado: "default",
  nao_configurado: "waiting",
  erro: "occupied",
};

export default function FiscalPage() {
  const [statusFiltro, setStatusFiltro] = React.useState<string>("");
  const [busca, setBusca] = React.useState("");
  const [documentos, setDocumentos] = React.useState<DocumentoLista[] | null>(null);
  const [carregando, setCarregando] = React.useState(false);
  const [detalhe, setDetalhe] = React.useState<DocumentoDetalhe | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = React.useState(false);
  const [consultando, setConsultando] = React.useState(false);
  const [cancelando, setCancelando] = React.useState(false);
  const [motivo, setMotivo] = React.useState("");

  async function carregar() {
    setCarregando(true);
    try {
      const params = new URLSearchParams();
      if (statusFiltro) params.set("status", statusFiltro);
      const buscaTrim = busca.trim();
      if (buscaTrim && /^\d+$/.test(buscaTrim)) {
        const resposta = await api<{ documentos: DocumentoLista[] }>(
          `/api/fiscal/documentos?${params.toString()}`
        );
        const todos = resposta.documentos;
        setDocumentos(
          todos.filter((d) => String(d.pedidoNumero ?? "") === buscaTrim)
        );
        return;
      }
      const resposta = await api<{ documentos: DocumentoLista[] }>(
        `/api/fiscal/documentos?${params.toString()}`
      );
      setDocumentos(resposta.documentos);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao carregar documentos fiscais.");
      setDocumentos([]);
    } finally {
      setCarregando(false);
    }
  }

  React.useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFiltro]);

  async function abrirDetalhe(documento: DocumentoLista) {
    setCarregandoDetalhe(true);
    setDetalhe(null);
    try {
      const resposta = await api<{ documento: DocumentoDetalhe }>(
        `/api/fiscal/documentos/${documento.id}`
      );
      setDetalhe(resposta.documento);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao carregar o documento.");
    } finally {
      setCarregandoDetalhe(false);
    }
  }

  async function consultar(documento: DocumentoDetalhe) {
    setConsultando(true);
    try {
      const resposta = await api<{ ok: boolean; fiscal: { status: StatusDocumentoFiscal; xMotivo?: string; protocolo?: string } }>(
        `/api/fiscal/documentos/${documento.id}/consulta`,
        { method: "POST" }
      );
      toast.success(
        resposta.ok
          ? "NFC-e autorizada pelo provedor."
          : `Status atual: ${STATUS_FISCAL_ROTULOS[resposta.fiscal.status]}${resposta.fiscal.xMotivo ? ` — ${resposta.fiscal.xMotivo}` : ""}`
      );
      setDetalhe(null);
      carregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha na consulta.");
    } finally {
      setConsultando(false);
    }
  }

  async function cancelar(documento: DocumentoDetalhe) {
    if (motivo.trim().length < 15) {
      toast.error("Informe uma justificativa com pelo menos 15 caracteres.");
      return;
    }
    setCancelando(true);
    try {
      const resposta = await api<{ ok: boolean; fiscal: { status: StatusDocumentoFiscal; xMotivo?: string } }>(
        `/api/fiscal/documentos/${documento.id}/cancelamento`,
        { method: "POST", body: JSON.stringify({ motivo: motivo.trim() }) }
      );
      toast.success(
        resposta.ok
          ? "NFC-e cancelada junto ao provedor."
          : `Status: ${STATUS_FISCAL_ROTULOS[resposta.fiscal.status]}${resposta.fiscal.xMotivo ? ` — ${resposta.fiscal.xMotivo}` : ""}`
      );
      setDetalhe(null);
      setMotivo("");
      carregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha no cancelamento.");
    } finally {
      setCancelando(false);
    }
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Fiscal"
        description="Documentos NFC-e das vendas — situação real junto ao provedor/SEFAZ."
        actions={
          <Button variant="outline" onClick={carregar} disabled={carregando}>
            <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} aria-hidden="true" />
            Atualizar
          </Button>
        }
      />

      <Card className="mb-6">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                className="pl-9"
                placeholder="Número do pedido…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && carregar()}
                aria-label="Buscar por número do pedido"
              />
            </div>
          </div>
          <div className="sm:w-56">
            <Select value={statusFiltro} onValueChange={setStatusFiltro}>
              <SelectTrigger aria-label="Filtrar por status">
                <SelectValue placeholder="Todos os status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos os status</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_FISCAL_ROTULOS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {documentos === null || carregando ? (
            <div className="flex items-center justify-center gap-2 p-10 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Carregando documentos…
            </div>
          ) : documentos.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">
              Nenhum documento fiscal encontrado. As vendas registram o documento
              mesmo sem configuração (status “não configurado”).
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {documentos.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => abrirDetalhe(d)}
                    className="flex w-full flex-col gap-2 p-4 text-left transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <FileDigit className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        <span className="font-semibold">
                          {d.pedidoNumero ? `Pedido nº ${d.pedidoNumero}` : "Pedido sem número"}
                        </span>
                        <Badge variant={VARIANTE_POR_STATUS[d.status]} className="text-xs">
                          {STATUS_FISCAL_ROTULOS[d.status]}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDataHora(new Date(d.criadoEm))}
                        {d.canal ? ` · ${d.canal}` : ""}
                        {d.ambiente === "producao" ? " · Produção" : " · Homologação"}
                        {d.numero ? ` · NFC-e nº ${d.numero}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-sm">
                      {typeof d.total === "number" && (
                        <span className="tabular">{formatBRL(d.total)}</span>
                      )}
                      {d.protocolo && (
                        <span className="hidden font-mono text-xs text-status-free md:inline">
                          {d.protocolo}
                        </span>
                      )}
                      {(d.cStat || d.xMotivo) && (
                        <span className="hidden max-w-52 truncate text-xs text-status-occupied lg:inline">
                          {d.xMotivo || `cStat ${d.cStat}`}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={carregandoDetalhe || detalhe !== null} onOpenChange={(open) => !open && setDetalhe(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto max-w-xl">
          {carregandoDetalhe && (
            <div className="flex items-center justify-center gap-2 p-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Carregando…
            </div>
          )}
          {detalhe && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  NFC-e {detalhe.numero ? `nº ${detalhe.numero}` : "sem número"}
                  <Badge variant={VARIANTE_POR_STATUS[detalhe.status]}>{STATUS_FISCAL_ROTULOS[detalhe.status]}</Badge>
                </DialogTitle>
                <DialogDescription>
                  {detalhe.serie ? `Série ${detalhe.serie}` : "Sem série"} ·{" "}
                  {detalhe.ambiente === "producao" ? "Produção" : "Homologação"} ·{" "}
                  {detalhe.provedor || "provedor não identificado"} ·{" "}
                  {formatDataHora(new Date(detalhe.criadoEm))}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-3 text-sm">
                {detalhe.pedidoNumero && (
                  <p>
                    Pedido nº <strong>{detalhe.pedidoNumero}</strong>
                    {detalhe.pedido?.clienteNome ? ` — Cliente: ${detalhe.pedido.clienteNome}` : ""}
                    {typeof detalhe.total === "number" ? ` — Total: ${formatBRL(detalhe.total)}` : ""}
                  </p>
                )}
                {detalhe.chave && (
                  <div className="rounded-lg bg-muted p-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Chave de acesso
                    </p>
                    <p className="break-all font-mono text-xs">{formatarChave(detalhe.chave)}</p>
                  </div>
                )}
                {detalhe.protocolo && (
                  <p>
                    Protocolo de autorização: <span className="font-mono">{detalhe.protocolo}</span>
                  </p>
                )}
                {detalhe.autorizadaEm && (
                  <p className="text-xs text-muted-foreground">
                    Autorizada em {formatDataHora(new Date(detalhe.autorizadaEm))}
                  </p>
                )}
                {detalhe.emitidaEm && (
                  <p className="text-xs text-muted-foreground">
                    Emitida em {formatDataHora(new Date(detalhe.emitidaEm))} · tentativas: {detalhe.tentativas}
                  </p>
                )}
                {detalhe.canceladaEm && (
                  <p className="text-xs text-muted-foreground">
                    Cancelada em {formatDataHora(new Date(detalhe.canceladaEm))}
                    {detalhe.motivoCancelamento ? ` — ${detalhe.motivoCancelamento}` : ""}
                  </p>
                )}
                {(detalhe.cStat || detalhe.xMotivo) && (
                  <p className="rounded-lg border border-status-occupied-border bg-status-occupied-bg p-3 text-xs text-status-occupied">
                    cStat {detalhe.cStat ?? "—"} — {detalhe.xMotivo ?? "sem motivo"}
                  </p>
                )}
                {detalhe.erro && (
                  <p className="rounded-lg border border-status-waiting-border bg-status-waiting-bg p-3 text-xs text-status-waiting">
                    <TriangleAlert className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                    {detalhe.erro}
                  </p>
                )}
                <Separator />
                <div className="flex flex-wrap gap-2 text-xs">
                  {detalhe.danfeUrl && (
                    <a
                      href={detalhe.danfeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-primary underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      DANFE (PDF)
                    </a>
                  )}
                  {detalhe.qrcodeUrl && (
                    <a
                      href={detalhe.qrcodeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-primary underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      QR Code
                    </a>
                  )}
                  {!detalhe.danfeUrl && !detalhe.qrcodeUrl && (
                    <span className="text-muted-foreground">
                      Sem DANFE/QR Code (provedor não retornou links).
                    </span>
                  )}
                </div>
                {detalhe.qrcodeTexto && (
                  <p className="break-all font-mono text-[10px] text-muted-foreground">{detalhe.qrcodeTexto}</p>
                )}
                {detalhe.xml && (
                  <details className="rounded-lg border border-border">
                    <summary className="cursor-pointer p-2 text-xs font-semibold text-muted-foreground">
                      XML da NFC-e
                    </summary>
                    <pre className="max-h-56 overflow-auto p-3 text-[10px] leading-relaxed">{detalhe.xml}</pre>
                  </details>
                )}
                {detalhe.status === "autorizado" && (
                  <>
                    <Separator />
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="motivo-cancelamento" className="text-sm font-medium text-muted-foreground">
                        Justificativa do cancelamento (mín. 15 caracteres)
                      </Label>
                      <Textarea
                        id="motivo-cancelamento"
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        placeholder="Ex.: erro de digitação no item, desistência do cliente…"
                        rows={2}
                      />
                    </div>
                  </>
                )}
              </div>

              <DialogFooter className="gap-2">
                {detalhe.status === "autorizado" && (
                  <Button
                    variant="destructive"
                    onClick={() => cancelar(detalhe)}
                    disabled={cancelando || motivo.trim().length < 15}
                  >
                    {cancelando ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <XCircle className="h-4 w-4" aria-hidden="true" />
                    )}
                    Cancelar NFC-e
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => consultar(detalhe)}
                  disabled={consultando}
                >
                  {consultando ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  )}
                  Consultar status
                </Button>
                <Button onClick={() => setDetalhe(null)}>Fechar</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

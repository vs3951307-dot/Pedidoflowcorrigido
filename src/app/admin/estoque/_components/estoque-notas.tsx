"use client";

import * as React from "react";
import { toast } from "sonner";
import { Eye, FileText, Plus } from "lucide-react";

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
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { cn, formatBRL } from "@/lib/utils";
import { api, useApi } from "@/lib/api-cliente";
import { type StatusNotaFiscal } from "@/lib/estoque";

interface NotaFiscalApi {
  id: string;
  numero: string;
  serie: string;
  fornecedor: string;
  emissao: string;
  itens: number;
  valor: number;
  status: StatusNotaFiscal;
  documentoCaminho: string | null;
  documentoMime: string | null;
  documentoNome: string | null;
}

interface NotasFiscaisApi {
  notas: NotaFiscalApi[];
}

interface DetalheNota {
  nota: NotaFiscalApi;
  movimentacoesVinculadas: {
    id: string;
    produto: string;
    quantidade: number;
    unidade: string;
    valorTotal: number;
    responsavel: string;
    criadoEm: string;
  }[];
}

function urlDoDocumento(nota: NotaFiscalApi): string | null {
  if (!nota.documentoCaminho) return null;
  return `/api/copiloto/anexo?caminho=${encodeURIComponent(nota.documentoCaminho)}`;
}

function IconeDocumento(mime: string) {
  if (mime.startsWith("image/")) return <Eye className="h-4 w-4" />;
  if (mime === "application/pdf") return <FileText className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

const STATUS_NOTA_CONFIG: Record<StatusNotaFiscal, { label: string; classes: string; dot: string }> = {
  conferida: {
    label: "Conferida",
    classes: "bg-status-free-bg text-status-free border-status-free-border",
    dot: "bg-status-free",
  },
  pendente: {
    label: "Pendente",
    classes: "bg-status-waiting-bg text-status-waiting border-status-waiting-border",
    dot: "bg-status-waiting",
  },
  cancelada: {
    label: "Cancelada",
    classes: "bg-status-occupied-bg text-status-occupied border-status-occupied-border",
    dot: "bg-status-occupied",
  },
};

function formatarData(valor: string): string {
  const data = new Date(valor);
  if (!Number.isNaN(data.getTime())) {
    return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }
  return valor;
}

function formatarDataHora(valor: string): string {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return `${data.toLocaleDateString("pt-BR")} · ${data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

function interpretarNumero(texto: string): number | null {
  const normalizado = texto.trim().replace(/\./g, "").replace(",", ".");
  const valor = Number(normalizado);
  return Number.isFinite(valor) && valor >= 0 ? valor : null;
}

/**
 * Aba Nota Fiscal — notas fiscais de entrada dos fornecedores. Antes só
 * listava (com dado de exemplo); "Ver" e "Nova nota" eram decorativos.
 * Agora cria (`POST /api/notas-fiscais`) e mostra detalhe real
 * (`GET /api/notas-fiscais/[id]`), incluindo as movimentações de estoque
 * vinculadas a cada nota.
 */
export function EstoqueNotas() {
  const { dados, recarregar } = useApi<NotasFiscaisApi>("/api/notas-fiscais", { notas: [] });
  const [novaAberta, setNovaAberta] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);
  const [numero, setNumero] = React.useState("");
  const [serie, setSerie] = React.useState("1");
  const [fornecedor, setFornecedor] = React.useState("");
  const [itensQtd, setItensQtd] = React.useState("");
  const [valor, setValor] = React.useState("");

  const [detalheId, setDetalheId] = React.useState<string | null>(null);
  const [detalhe, setDetalhe] = React.useState<DetalheNota | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = React.useState(false);

  React.useEffect(() => {
    if (!detalheId) {
      setDetalhe(null);
      return;
    }
    setCarregandoDetalhe(true);
    api<DetalheNota>(`/api/notas-fiscais/${detalheId}`)
      .then(setDetalhe)
      .catch((erro) => {
        toast.error(erro instanceof Error ? erro.message : "Não foi possível carregar o detalhe.");
        setDetalheId(null);
      })
      .finally(() => setCarregandoDetalhe(false));
  }, [detalheId]);

  async function criarNota() {
    const valorNum = interpretarNumero(valor);
    const itensNum = interpretarNumero(itensQtd);
    if (!numero.trim() || !fornecedor.trim()) {
      toast.error("Informe número e fornecedor.");
      return;
    }
    if (valorNum === null) {
      toast.error("Informe um valor total válido.");
      return;
    }

    setEnviando(true);
    try {
      await api("/api/notas-fiscais", {
        method: "POST",
        body: JSON.stringify({
          numero: numero.trim(),
          serie: serie.trim() || "1",
          fornecedor: fornecedor.trim(),
          itens: itensNum ?? 0,
          valor: valorNum,
        }),
      });
      toast.success(`NF-e ${numero.trim()} registrada.`);
      setNovaAberta(false);
      setNumero("");
      setSerie("1");
      setFornecedor("");
      setItensQtd("");
      setValor("");
      recarregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível registrar a nota.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setNovaAberta(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nova nota
        </Button>
      </div>

      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
            Notas fiscais de entrada
          </CardTitle>
          <p className="text-sm text-muted-foreground">NF-e emitidas pelos fornecedores.</p>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          {dados.notas.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground sm:px-7">
              Nenhuma nota fiscal registrada ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nota</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead className="text-right">Emissão</TableHead>
                  <TableHead className="text-right">Itens</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                  <TableHead className="w-16 text-center">Anexo</TableHead>
                  <TableHead className="w-24 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dados.notas.map((nota) => {
                  const cfg = STATUS_NOTA_CONFIG[nota.status];
                  return (
                    <TableRow key={nota.id}>
                      <TableCell className="font-medium">
                        <span className="tabular">NF-e {nota.numero}</span>
                        <span className="ml-2 text-sm text-muted-foreground">série {nota.serie}</span>
                      </TableCell>
                      <TableCell>{nota.fornecedor}</TableCell>
                      <TableCell className="text-right tabular">{formatarData(nota.emissao)}</TableCell>
                      <TableCell className="text-right tabular">{nota.itens}</TableCell>
                      <TableCell className="text-right font-semibold tabular">{formatBRL(nota.valor)}</TableCell>
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
                      <TableCell className="text-center">
                        {nota.documentoCaminho ? (
                          <a
                            href={urlDoDocumento(nota)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={nota.documentoNome ?? "Ver documento"}
                            className="inline-flex items-center justify-center rounded-lg border border-border bg-secondary/40 p-1.5 text-foreground transition-colors hover:bg-secondary"
                            title={nota.documentoNome ?? "Ver documento"}
                            onClick={(e) => e.preventDefault()}
                          >
                            {IconeDocumento(nota.documentoMime ?? "")}
                          </a>
                        ) : (
                          <span className="text-xs italic text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDetalheId(nota.id)}
                          disabled={enviando}
                        >
                          <Eye className="h-4 w-4" aria-hidden="true" />
                          Ver
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={novaAberta} onOpenChange={setNovaAberta}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova nota fiscal de entrada</DialogTitle>
            <DialogDescription>Registro do documento — não conecta ao SEFAZ, é lançamento manual.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-[1fr_5rem] gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nf-numero">Número</Label>
                <Input id="nf-numero" value={numero} onChange={(e) => setNumero(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nf-serie">Série</Label>
                <Input id="nf-serie" value={serie} onChange={(e) => setSerie(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nf-fornecedor">Fornecedor</Label>
              <Input id="nf-fornecedor" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nf-itens">Qtd. de itens</Label>
                <Input id="nf-itens" inputMode="numeric" value={itensQtd} onChange={(e) => setItensQtd(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nf-valor">Valor total (R$)</Label>
                <Input id="nf-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNovaAberta(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={criarNota} disabled={enviando}>
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detalheId} onOpenChange={(aberto) => !aberto && setDetalheId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>NF-e {detalhe?.nota.numero ?? "..."}</DialogTitle>
            <DialogDescription>{detalhe?.nota.fornecedor}</DialogDescription>
          </DialogHeader>
          {carregandoDetalhe || !detalhe ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-border p-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Emissão</p>
                  <p className="font-semibold">{formatarData(detalhe.nota.emissao)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Valor total</p>
                  <p className="font-semibold">{formatBRL(detalhe.nota.valor)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Itens declarados</p>
                  <p className="font-semibold">{detalhe.nota.itens}</p>
                </div>
                 <div>
                   <p className="text-muted-foreground">Status</p>
                   <p className="font-semibold">{STATUS_NOTA_CONFIG[detalhe.nota.status].label}</p>
                 </div>
               </div>

              {detalhe.nota.documentoCaminho && (
                <div>
                  <p className="mb-2 text-sm font-medium text-foreground">Documento original</p>
                  {detalhe.nota.documentoMime?.startsWith("image/") && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={urlDoDocumento(detalhe.nota)!}
                      alt={detalhe.nota.documentoNome ?? "Foto do documento"}
                      className="max-h-64 w-full rounded-xl border border-border object-contain"
                    />
                  )}
                  {detalhe.nota.documentoMime === "application/pdf" && (
                    <a
                      href={urlDoDocumento(detalhe.nota)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-4 py-3 text-sm font-medium text-foreground hover:bg-secondary"
                    >
                      <FileText className="h-5 w-5" />
                      {detalhe.nota.documentoNome ?? "Abrir PDF"}
                    </a>
                  )}
                  {!detalhe.nota.documentoMime?.startsWith("image/") &&
                    detalhe.nota.documentoMime !== "application/pdf" && (
                      <a
                        href={urlDoDocumento(detalhe.nota)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-4 py-3 text-sm font-medium text-foreground hover:bg-secondary"
                      >
                        {IconeDocumento(detalhe.nota.documentoMime ?? "")}
                        {detalhe.nota.documentoNome ?? "Abrir documento"}
                      </a>
                    )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Armazenado de forma privada e segura — acesso restrito a este administrador.
                  </p>
                </div>
              )}

              <div>
                <p className="mb-2 text-sm font-medium text-foreground">
                  Movimentações de estoque vinculadas a esta nota
                </p>
                {detalhe.movimentacoesVinculadas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma entrada de estoque foi lançada vinculada a esta nota ainda. Ao registrar
                    uma "Nova entrada" na aba Produtos, selecione esta nota para vinculá-la.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {detalhe.movimentacoesVinculadas.map((m) => (
                      <li key={m.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                        <span>
                          {m.produto} — {m.quantidade} {m.unidade}
                          <span className="ml-2 text-xs text-muted-foreground">{formatarDataHora(m.criadoEm)}</span>
                        </span>
                        <span className="font-semibold tabular">{formatBRL(m.valorTotal)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { ExternalLink, Printer } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatBRL } from "@/lib/utils";
import { rotuloFormaPagamento } from "@/lib/pedido";
import { formatarChave } from "@/lib/fiscal/chave";
import { STATUS_FISCAL_ROTULOS, type StatusDocumentoFiscal } from "@/lib/fiscal/tipos";
import type { CupomVenda } from "@/app/pdv/_lib/use-cobranca";

interface NfceDialogProps {
  cupom: CupomVenda | null;
  onConcluir: () => void;
}

const STATUS_SEM_FISCAL: StatusDocumentoFiscal[] = [
  "nao_configurado",
  "pendente",
  "enviado",
  "rejeitado",
  "erro",
];

function AvisoFiscal({ cupom }: { cupom: CupomVenda }) {
  const status = cupom.fiscal?.status ?? null;
  const erro = cupom.fiscal?.erro ?? null;

  if (!status) {
    return (
      <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
        Emissão fiscal automática desativada. Esta venda não gerou NFC-e —
        confira as configurações em Admin → Configurações → NFC-e.
      </p>
    );
  }

  switch (status) {
    case "nao_configurado":
      return (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
          <strong>NFC-e não emitida.</strong> A integração fiscal não está
          configurada ({erro ?? "verifique o ambiente de configuração"}). A venda
          foi registrada normalmente, mas o documento ficou{" "}
          <em>não configurado</em> — re-tente após configurar o provedor em
          Admin → Fiscal.
        </p>
      );
    case "rejeitado":
      return (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs leading-relaxed text-red-800">
          <strong>NFC-e rejeitada pela SEFAZ.</strong>{" "}
          {cupom.fiscal?.retorno?.xMotivo ?? erro ?? "Consulte o documento no Admin → Fiscal."}
        </p>
      );
    case "pendente":
    case "enviado":
      return (
        <p className="rounded-lg border border-blue-300 bg-blue-50 p-3 text-xs leading-relaxed text-blue-800">
          <strong>Emissão fiscal em processamento.</strong> A NFC-e foi enviada
          ao autorizador e aguarda retorno. Consulte o documento em Admin → Fiscal.
        </p>
      );
    case "erro":
      return (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs leading-relaxed text-red-800">
          <strong>Falha técnica na emissão da NFC-e.</strong> {erro ?? "Consulte o documento em Admin → Fiscal."}
        </p>
      );
    default:
      return null;
  }
}

function BlocoAutorizada({ cupom }: { cupom: CupomVenda }) {
  const retorno = cupom.fiscal?.retorno;
  return (
    <div className="flex flex-col gap-0.5 text-[11px] leading-relaxed">
      {retorno?.chave && (
        <>
          <p>Chave de acesso</p>
          <p className="break-all font-mono tabular">{formatarChave(retorno.chave)}</p>
        </>
      )}
      {retorno?.protocolo && (
        <p className="mt-1.5">Protocolo de autorização: {retorno.protocolo}</p>
      )}
      {retorno?.qrcodeUrl && (
        <p className="mt-2">
          {/* Imagem do QR Code quando o provedor fornece a URL */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={retorno.qrcodeUrl}
            alt="QR Code da NFC-e"
            className="mx-auto h-28 w-28"
            referrerPolicy="no-referrer"
          />
        </p>
      )}
      {retorno?.qrcodeTexto && (
        <p className="mt-1.5 break-all font-mono">{retorno.qrcodeTexto}</p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {retorno?.danfeUrl && (
          <a
            href={retorno.danfeUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary underline"
          >
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            DANFE (PDF)
          </a>
        )}
        {retorno?.xml && (
          <span className="inline-flex items-center text-muted-foreground">
            XML disponível no Admin → Fiscal
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * NfceDialog — pós-pagamento: mostra o cupom da venda com o status fiscal
 * REAL (PEDIDO 19). Chave/protocolo/QR Code aparecem apenas quando a NFC-e
 * foi AUTORIZADA pelo provedor/SEFAZ; sem configuração ou com rejeição o
 * aviso correspondente é exibido — nunca se simula sucesso.
 */
export function NfceDialog({ cupom, onConcluir }: NfceDialogProps) {
  const statusFiscal = cupom?.fiscal?.status ?? null;
  const autorizada = statusFiscal === "autorizado";
  const exibirAviso = !cupom || statusFiscal === null || STATUS_SEM_FISCAL.includes(statusFiscal);

  return (
    <Dialog open={cupom !== null} onOpenChange={(open) => !open && onConcluir()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pagamento aprovado</DialogTitle>
          <DialogDescription>
            {autorizada
              ? "NFC-e autorizada pela SEFAZ."
              : "Venda registrada — confira a situação fiscal abaixo."}
          </DialogDescription>
        </DialogHeader>

        {cupom && (
          <div className="print-area flex flex-col rounded-xl border border-border bg-white p-5 text-sm text-neutral-900">
            {/* Cabeçalho da empresa (dados reais do banco) */}
            <div className="text-center">
              <p className="text-base font-bold uppercase leading-tight">
                {cupom.empresa?.razaoSocial ?? "EMPRESA"}
              </p>
              {cupom.empresa?.cnpj && (
                <p className="mt-1 text-xs">CNPJ {cupom.empresa.cnpj}</p>
              )}
              {cupom.empresa?.rua && (
                <p className="text-xs">
                  {cupom.empresa.rua} — {cupom.empresa.cidade}
                  {cupom.empresa.uf ? `/${cupom.empresa.uf}` : ""}
                </p>
              )}
            </div>

            <Separator className="my-3" />

            <div className="flex items-center justify-between">
              <span className="font-bold">
                {autorizada && cupom.fiscal?.retorno?.numero
                  ? `NFC-e nº ${cupom.fiscal.retorno.numero}`
                  : `Pedido nº ${cupom.contexto}`}
              </span>
              {autorizada && cupom.fiscal?.retorno?.serie && (
                <span>Série {cupom.fiscal.retorno.serie}</span>
              )}
            </div>
            <p className="mt-1 text-xs">Emissão: {new Date().toLocaleString("pt-BR")}</p>
            <p className="mt-1 text-xs">
              {cupom.contexto}
              {cupom.clienteNome ? ` — Cliente: ${cupom.clienteNome}` : ""}
            </p>

            <Separator className="my-3" />

            {/* Itens */}
            <ul className="flex flex-col gap-1.5">
              {cupom.itens.map((item) => (
                <li key={item.uid} className="flex justify-between gap-2 text-xs">
                  <span>
                    {item.quantidade}x {item.nome}
                    {item.observacao ? ` (${item.observacao})` : ""}
                  </span>
                  <span className="tabular">
                    {formatBRL(item.precoUnit * item.quantidade)}
                  </span>
                </li>
              ))}
            </ul>

            <Separator className="my-3" />

            <div className="flex justify-between text-base font-bold">
              <span>Total</span>
              <span className="tabular">{formatBRL(cupom.total)}</span>
            </div>
            <div className="mt-1 flex justify-between text-xs">
              <span>Pagamento</span>
              <span>{rotuloFormaPagamento(cupom.forma)}</span>
            </div>
            {typeof cupom.valorRecebido === "number" && (
              <div className="mt-1 flex justify-between text-xs">
                <span>Valor recebido</span>
                <span className="tabular">{formatBRL(cupom.valorRecebido)}</span>
              </div>
            )}
            {typeof cupom.troco === "number" && cupom.troco > 0 && (
              <div className="mt-1 flex justify-between text-xs">
                <span>Troco</span>
                <span className="tabular">{formatBRL(cupom.troco)}</span>
              </div>
            )}

            <Separator className="my-3" />

            {autorizada ? (
              <BlocoAutorizada cupom={cupom} />
            ) : (
              <AvisoFiscal cupom={cupom} />
            )}

            {statusFiscal && (
              <p className="mt-3 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Situação fiscal: {STATUS_FISCAL_ROTULOS[statusFiscal]}
              </p>
            )}
            {!exibirAviso && !autorizada && (
              <p className="mt-1 text-center text-[10px] text-muted-foreground">
                Comprovante de venda — sem validade fiscal.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-5 w-5" />
            Imprimir
          </Button>
          <Button onClick={onConcluir}>Concluir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

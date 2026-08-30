"use client";

import { Printer, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface VisualizacaoImpressaoProps {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  conteudo: string;
}

/**
 * Pré-visualização do conteúdo térmico 80 mm com impressão pelo
 * navegador (`window.print`). A área `.print-area` é o que sai no
 * papel (CSS em `globals.css`); o restante da interface fica oculto.
 */
export function VisualizacaoImpressao({ aberto, aoFechar, titulo, conteudo }: VisualizacaoImpressaoProps) {
  return (
    <Dialog open={aberto} onOpenChange={(abrir) => !abrir && aoFechar()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto rounded-xl border border-border bg-white p-4">
          <pre className="print-area mx-auto w-[80mm] whitespace-pre-wrap font-mono text-[11px] leading-tight text-neutral-900">
            {conteudo}
          </pre>
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={aoFechar}>
            <X className="h-4 w-4" aria-hidden="true" />
            Fechar
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4" aria-hidden="true" />
            Imprimir no navegador
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

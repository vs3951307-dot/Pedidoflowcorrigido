"use client";

import { useEffect } from "react";

import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Fronteira de erro do módulo Entregador (App Router).captura exceções
 * de renderização no client (ex.: falha de hidratação) e mostra uma tela
 * recuperável com o botão "Tentar de novo" — em vez do crash genérico
 * "Application error: a client-side exception has occurred".
 */
export default function EntregadorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Erro já registrado no console do navegador; nada mais a fazer aqui.
    console.error("Erro no módulo Entregador:", error);
  }, [error]);

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
        <AlertTriangle className="h-10 w-10 text-status-occupied" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="text-base font-semibold">Algo deu errado nesta tela</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Não foi possível exibir esta página. Você pode tentar novamente — se o erro persistir,
            anote a mensagem abaixo e relate ao suporte.
          </p>
        </div>
        {error.message ? (
          <p className="max-w-md break-words rounded-lg bg-muted px-3 py-2 text-left font-mono text-xs text-muted-foreground">
            {error.message}
          </p>
        ) : null}
        {error.digest ? (
          <p className="text-xs text-muted-foreground">Código: {error.digest}</p>
        ) : null}
        <Button onClick={reset}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Tentar de novo
        </Button>
      </CardContent>
    </Card>
  );
}

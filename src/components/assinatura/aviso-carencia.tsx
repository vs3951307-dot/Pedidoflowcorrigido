"use client";

import * as React from "react";
import { AlarmClock } from "lucide-react";

/**
 * Banner de CARÊNCIA de assinatura exibido ao usuário da empresa quando a
 * assinatura venceu mas ainda está dentro dos 7 dias de tolerância
 * (o uso normal segue permitido, só com o aviso).
 *
 * Consome `assinaturaWarning`/`diasRestantesCarencia` vindos de
 * `exigirRota()` (src/lib/acesso.ts) nos layouts de módulo. Sem carência,
 * renderiza nada.
 */
export function AvisoCarencia({
  ativo,
  diasRestantes,
}: {
  ativo: boolean;
  diasRestantes: number;
}) {
  if (!ativo || diasRestantes <= 0) return null;

  return (
    <div className="border-b border-amber-300/60 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <div className="mx-auto flex max-w-6xl items-center gap-2">
        <AlarmClock className="h-4 w-4 shrink-0" />
        <span>
          <strong>Assinatura em carência:</strong> seu plano venceu. {diasRestantes === 1 ? "Resta 1 dia" : `Restam ${diasRestantes} dias`} para regularizar antes da suspensão — fale com o suporte para renovar.
        </span>
      </div>
    </div>
  );
}

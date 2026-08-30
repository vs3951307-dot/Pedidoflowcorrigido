"use client";

import * as React from "react";

/**
 * Retorna a data/hora atual, atualizada a cada `intervaloMs` (padrão 30s).
 * Usada no AppShell (relógio do Header) e para o tempo decorrido das mesas.
 */
export function useRelogio(intervaloMs = 30_000) {
  const [agora, setAgora] = React.useState(() => new Date());

  React.useEffect(() => {
    const id = window.setInterval(() => setAgora(new Date()), intervaloMs);
    return () => window.clearInterval(id);
  }, [intervaloMs]);

  return agora;
}

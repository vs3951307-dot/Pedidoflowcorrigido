"use client";

import * as React from "react";

/**
 * Retorna a data/hora atual, atualizada a cada `intervaloMs` (padrão 30s).
 * Usada no AppShell (relógio do Header) e para o tempo decorrido das mesas.
 *
 * É segura para SSR/Hidratação: durante renderização no servidor e na
 * primeira renderização no cliente retorna uma referência estável (epoch),
 * então o relógio real só aparece depois do `useEffect` (mount). Sem isso,
 * servidor e cliente renderizavam horas/segundos diferentes e o React
 * falhava a hidratação (erros #425/#418/#423), deixando a tela "travada"
 * e cliques sem resposta.
 */
export function useRelogio(intervaloMs = 30_000) {
  const [agora, setAgora] = React.useState<Date | null>(null);

  React.useEffect(() => {
    setAgora(new Date());
    const id = window.setInterval(() => setAgora(new Date()), intervaloMs);
    return () => window.clearInterval(id);
  }, [intervaloMs]);

  return agora ?? new Date(0);
}

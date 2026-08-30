"use client";

import * as React from "react";

export type PeriodoRelatorio = "hoje" | "7dias" | "30dias" | "90dias";

const PeriodoContext = React.createContext<PeriodoRelatorio>("7dias");

export function PeriodoRelatorioProvider({
  periodo,
  children,
}: {
  periodo: PeriodoRelatorio;
  children: React.ReactNode;
}) {
  return <PeriodoContext.Provider value={periodo}>{children}</PeriodoContext.Provider>;
}

/** Usado por cada aba de relatório para montar a query string com o período. */
export function usePeriodoRelatorio(): PeriodoRelatorio {
  return React.useContext(PeriodoContext);
}

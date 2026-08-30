"use client";

import { usePathname } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";

const ENTREGADOR_NAV_ITEMS = [
  { label: "Rotas dos clientes", href: "/entregador", icon: "navigation" },
  { label: "Escanear", href: "/entregador/scanear", icon: "scan-line" },
  { label: "Carrinho", href: "/entregador/carrinho", icon: "shopping-bag" },
  { label: "Relatório", href: "/entregador/relatorio", icon: "bar-chart" },
];

export function EntregadorCasca({
  greetingName,
  empresaNome,
  empresaId,
  empresaLogoUrl,
  empresaTema,
  children,
}: {
  greetingName: string;
  empresaNome?: string;
  empresaId?: string;
  empresaLogoUrl?: string | null;
  empresaTema?: Record<string, unknown> | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <AppShell
      greetingName={greetingName}
      empresaNome={empresaNome}
      empresaId={empresaId}
      empresaLogoUrl={empresaLogoUrl}
      empresaTema={empresaTema}
      navItems={ENTREGADOR_NAV_ITEMS}
      activeHref={pathname}
    >
      {children}
    </AppShell>
  );
}

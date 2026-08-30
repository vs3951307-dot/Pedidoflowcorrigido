import { AppShell } from "@/components/layout/app-shell";
import { PdvProvider } from "@/app/pdv/_lib/pdv-context";
import { CaixaProvider } from "@/app/pdv/_lib/caixa-context";
import { RetiradaProvider } from "@/app/pdv/_lib/retirada-context";
import { SalaoProvider } from "@/app/pdv/_lib/salao-context";
import { exigirRota } from "@/lib/acesso";

const PDV_NAV_ITEMS = [
  { label: "Novo pedido", href: "/pdv", icon: "shopping-bag" },
  { label: "Atendimento", href: "/atendimento", icon: "message-circle" },
];

/**
 * Casca do módulo PDV (PEDIDO 14): exige sessão com permissão "pdv"
 * (Caixa/Administrador) e saúda o usuário autenticado.
 */
export default async function PdvLayout({ children }: { children: React.ReactNode }) {
  const usuario = await exigirRota("pdv");

  return (
    <CaixaProvider>
      <RetiradaProvider>
        <SalaoProvider>
          <PdvProvider>
            <AppShell
              greetingName={usuario.nome}
              empresaNome={usuario.empresaNome}
              empresaId={usuario.empresaId}
              empresaLogoUrl={usuario.empresaLogoUrl}
              empresaTema={usuario.empresaTema}
              navItems={PDV_NAV_ITEMS}
              activeHref="/pdv"
              notificationCount={0}
            >
              {children}
            </AppShell>
          </PdvProvider>
        </SalaoProvider>
      </RetiradaProvider>
    </CaixaProvider>
  );
}

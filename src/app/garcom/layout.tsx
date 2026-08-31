import { AppShell } from "@/components/layout/app-shell";
import { AvisoCarencia } from "@/components/assinatura/aviso-carencia";
import { GarcomProvider } from "@/app/garcom/_lib/garcom-context";
import { exigirRota } from "@/lib/acesso";
import { temPermissao } from "@/lib/permissao";

const GARCOM_NAV_ITEMS = [{ label: "Mesas", href: "/garcom", icon: "layout-grid" }];

/**
 * Casca do módulo Garçom (PEDIDO 14): exige sessão com permissão "salao"
 * (Garçom/Administrador) e saúda o usuário autenticado.
 */
export default async function GarcomLayout({ children }: { children: React.ReactNode }) {
  const usuario = await exigirRota("salao");

  return (
    <>
      <AvisoCarencia ativo={usuario.assinaturaWarning} diasRestantes={usuario.diasRestantesCarencia} />
      <GarcomProvider>
      <AppShell
        greetingName={usuario.nome}
        empresaNome={usuario.empresaNome}
        empresaId={usuario.empresaId}
        empresaLogoUrl={usuario.empresaLogoUrl}
        empresaTema={usuario.empresaTema}
        navItems={GARCOM_NAV_ITEMS}
        activeHref="/garcom"
        notificationCount={2}
        copilotoDisponivel={usuario.modulosAtivos.includes("copiloto") && temPermissao(usuario, "admin")}
      >
        {children}
      </AppShell>
    </GarcomProvider>
    </>
  );
}

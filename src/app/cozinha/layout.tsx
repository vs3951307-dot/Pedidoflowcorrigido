import { AppShell } from "@/components/layout/app-shell";
import { AvisoCarencia } from "@/components/assinatura/aviso-carencia";
import { exigirRota } from "@/lib/acesso";
import { temPermissao } from "@/lib/permissao";

const COZINHA_NAV_ITEMS = [{ label: "Produção", href: "/cozinha", icon: "chef" }];

/**
 * Casca do módulo Cozinha/KDS (PEDIDO 14): exige sessão com permissão
 * "kds" (Cozinha/Administrador) e saúda o usuário autenticado.
 */
export default async function CozinhaLayout({ children }: { children: React.ReactNode }) {
  const usuario = await exigirRota("kds");

  return (
    <>
      <AvisoCarencia ativo={usuario.assinaturaWarning} diasRestantes={usuario.diasRestantesCarencia} />
      <AppShell
      greetingName={usuario.nome}
      empresaNome={usuario.empresaNome}
      empresaId={usuario.empresaId}
      empresaLogoUrl={usuario.empresaLogoUrl}
      empresaTema={usuario.empresaTema}
      navItems={COZINHA_NAV_ITEMS}
      activeHref="/cozinha"
      notificationCount={0}
      copilotoDisponivel={usuario.modulosAtivos.includes("copiloto") && temPermissao(usuario, "admin")}
    >
      {children}
    </AppShell>
    </>
  );
}

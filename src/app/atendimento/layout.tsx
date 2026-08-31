import { AppShell } from "@/components/layout/app-shell";
import { AvisoCarencia } from "@/components/assinatura/aviso-carencia";
import { exigirRota } from "@/lib/acesso";
import { temPermissao } from "@/lib/permissao";

const ATENDIMENTO_NAV_ITEMS = [
  { label: "Atendimento", href: "/atendimento", icon: "message-circle" },
];

/**
 * Casca do módulo Atendimento (PEDIDO 18): exige sessão com a permissão
 * "atendimento" (Administrador e Caixa) e saúda o usuário autenticado.
 */
export default async function AtendimentoLayout({ children }: { children: React.ReactNode }) {
  const usuario = await exigirRota("atendimento");

  return (
    <>
      <AvisoCarencia ativo={usuario.assinaturaWarning} diasRestantes={usuario.diasRestantesCarencia} />
      <AppShell
      greetingName={usuario.nome}
      empresaNome={usuario.empresaNome}
      empresaId={usuario.empresaId}
      empresaLogoUrl={usuario.empresaLogoUrl}
      empresaTema={usuario.empresaTema}
      navItems={ATENDIMENTO_NAV_ITEMS}
      activeHref="/atendimento"
      notificationCount={0}
      copilotoDisponivel={usuario.modulosAtivos.includes("copiloto") && temPermissao(usuario, "admin")}
    >
      {children}
    </AppShell>
    </>
  );
}

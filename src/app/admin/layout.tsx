import { AppShell } from "@/components/layout/app-shell";
import { AvisoCarencia } from "@/components/assinatura/aviso-carencia";
import { exigirRota } from "@/lib/acesso";
import { temPermissao } from "@/lib/permissao";

const ADMIN_NAV_ITEMS = [
  { label: "Dashboard", href: "/admin", icon: "layout-dashboard" },
  { label: "Atendimento", href: "/atendimento", icon: "message-circle", modulo: "whatsapp" },
  { label: "Relatórios", href: "/admin/relatorios", icon: "bar-chart" },
  { label: "Copiloto", href: "/admin/copiloto", icon: "bot", modulo: "copiloto" },
  { label: "Estoque", href: "/admin/estoque", icon: "boxes", modulo: "estoque" },
  { label: "Fiscal", href: "/admin/fiscal", icon: "file-digit", modulo: "fiscal" },
  { label: "Configurações", href: "/admin/configuracoes", icon: "settings" },
  { label: "Entregadores Pagamentos", href: "/admin/entregadores-pagamentos", icon: "wallet" },
] as const;

/**
 * Casca do módulo Administrador (PEDIDO 14): exige sessão com permissão
 * "admin" (apenas Administrador) e saúda o usuário autenticado.
 *
 * CORREÇÃO (PEDIDO 34 — "menus do Admin não devem mostrar recurso
 * desativado pelo plano"): antes, `ADMIN_NAV_ITEMS` era uma lista FIXA —
 * "Atendimento", "Estoque" e "Fiscal" apareciam no menu mesmo quando a
 * empresa não tinha esses módulos contratados (clicar levava a uma
 * página que funcionava mal, sem nem cair no bloqueio de módulo — ver
 * os `layout.tsx` novos em estoque/fiscal). Agora o menu só mostra o
 * que a empresa realmente tem contratado.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const usuario = await exigirRota("admin");
  const navItems = ADMIN_NAV_ITEMS.filter((item) => !("modulo" in item) || usuario.modulosAtivos.includes(item.modulo));

  return (
    <>
      <AvisoCarencia ativo={usuario.assinaturaWarning} diasRestantes={usuario.diasRestantesCarencia} />
      <AppShell
      greetingName={usuario.nome}
      empresaNome={usuario.empresaNome}
      empresaId={usuario.empresaId}
      empresaLogoUrl={usuario.empresaLogoUrl}
      empresaTema={usuario.empresaTema}
      navItems={navItems}
      activeHref="/admin"
      notificationCount={0}
      copilotoDisponivel={usuario.modulosAtivos.includes("copiloto") && temPermissao(usuario, "admin")}
    >
      {children}
    </AppShell>
    </>
  );
}

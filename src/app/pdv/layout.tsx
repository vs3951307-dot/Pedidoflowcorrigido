import { AppShell } from "@/components/layout/app-shell";
import { AvisoCarencia } from "@/components/assinatura/aviso-carencia";
import { PdvProvider } from "@/app/pdv/_lib/pdv-context";
import { CaixaProvider } from "@/app/pdv/_lib/caixa-context";
import { RetiradaProvider } from "@/app/pdv/_lib/retirada-context";
import { SalaoProvider } from "@/app/pdv/_lib/salao-context";
import { exigirRota } from "@/lib/acesso";
import { temPermissao } from "@/lib/permissao";

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
    <>
      <AvisoCarencia ativo={usuario.assinaturaWarning} diasRestantes={usuario.diasRestantesCarencia} />
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
              copilotoDisponivel={usuario.modulosAtivos.includes("copiloto") && temPermissao(usuario, "admin")}
            >
              {children}
            </AppShell>
          </PdvProvider>
        </SalaoProvider>
      </RetiradaProvider>
    </CaixaProvider>
    </>
  );
}

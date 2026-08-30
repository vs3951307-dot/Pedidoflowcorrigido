"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Sidebar, defaultNavItems, type NavItem } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { useRelogio } from "@/hooks/use-relogio";
import { TenantSplashScreen, useSplashOnce } from "@/components/tenant-splash";

interface AppShellProps {
  greetingName: string;
  empresaNome?: string;
  empresaId?: string;
  empresaLogoUrl?: string | null;
  empresaTema?: Record<string, unknown> | null;
  navItems?: NavItem[];
  activeHref?: string;
  notificationCount?: number;
  children: React.ReactNode;
}

const DIAS_SEMANA = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

/**
 * AppShell — casca padrão de qualquer tela autenticada do PedidoFlow.
 * Desktop/tablet: sidebar fixa. Mobile: sidebar vira um Sheet (gaveta).
 * O relógio/data do Header vem de um relógio real, atualizado a cada 30s.
 */
export function AppShell({
  greetingName,
  empresaNome,
  empresaId,
  empresaLogoUrl,
  empresaTema,
  navItems = defaultNavItems,
  activeHref,
  notificationCount = 0,
  children,
}: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  const { showSplash, hide, minimumShowMs } = useSplashOnce(empresaId ?? null);

  const agora = useRelogio();
  const time = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const date = agora.toLocaleDateString("pt-BR");
  const weekday = DIAS_SEMANA[agora.getDay()];

  // Fecha a gaveta mobile quando a navegação muda de rota.
  React.useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const corPrimaria = (empresaTema?.corPrimaria as string) ?? null;
  const corSecundaria = (empresaTema?.corSecundaria as string) ?? null;
  const mensagemSplash = (empresaTema?.mensagemSplash as string) ?? null;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Splash screen — overlay, não bloqueia renderização do conteúdo */}
      {showSplash && empresaId && (
        <TenantSplashScreen
          nomeEmpresa={empresaNome ?? "PedidoFlow"}
          logoUrl={empresaLogoUrl}
          corPrimaria={corPrimaria}
          corSecundaria={corSecundaria}
          mensagem={mensagemSplash}
          onFinish={hide}
          durationMs={minimumShowMs}
        />
      )}

      <div className="hidden lg:block">
        <Sidebar items={navItems} activeHref={activeHref} empresaNome={empresaNome} empresaId={empresaId} />
      </div>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
          <Sidebar
            items={navItems}
            activeHref={activeHref}
            empresaNome={empresaNome}
            empresaId={empresaId}
            onNavigate={(href) => {
              setMobileNavOpen(false);
              router.push(href);
            }}
            className="w-full border-r-0"
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          greetingName={greetingName}
          date={date}
          time={time}
          weekday={weekday}
          notificationCount={notificationCount}
          onMenuClick={() => setMobileNavOpen(true)}
          onNotificationsClick={() =>
            toast.info("Nenhuma notificação nova no momento.")
          }
        />
        <main className="flex-1 overflow-y-auto scrollbar-thin px-5 py-6 sm:px-8 sm:py-8 lg:ml-72">
          {children}
        </main>
      </div>
    </div>
  );
}

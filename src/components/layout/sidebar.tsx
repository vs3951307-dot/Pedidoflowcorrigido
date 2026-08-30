"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Bike,
  Bot,
  Boxes,
  ChefHat,
  FileDigit,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  MessageCircle,
  Navigation,
  Pizza,
  QrCode,
  ScanLine,
  Settings,
  ShoppingBag,
  Wallet,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-cliente";
import { AlterarSenhaDialog } from "@/components/layout/alterar-senha-dialog";
import { clearSplashSession } from "@/components/tenant-splash";

export interface NavItem {
  label: string;
  href: string;
  /** Nome do ícone (string) — layouts (server) não podem enviar funções. */
  icon: string;
}

/** Catálogo de ícones da navegação, resolvido no client. */
const ICONES_NAVEGACAO: Record<string, LucideIcon> = {
  "layout-grid": LayoutGrid,
  "bar-chart": BarChart3,
  settings: Settings,
  "shopping-bag": ShoppingBag,
  chef: ChefHat,
  "layout-dashboard": LayoutDashboard,
  boxes: Boxes,
  navigation: Navigation,
  qrcode: QrCode,
  "scan-line": ScanLine,
  wallet: Wallet,
  "wifi-off": WifiOff,
  bike: Bike,
  "file-digit": FileDigit,
  "message-circle": MessageCircle,
  bot: Bot,
};

export const defaultNavItems: NavItem[] = [
  { label: "Salão", href: "/salao", icon: "layout-grid" },
  { label: "Relatórios", href: "/relatorios", icon: "bar-chart" },
  { label: "Configurações", href: "/configuracoes", icon: "settings" },
];

interface SidebarProps {
  items?: NavItem[];
  activeHref?: string;
  /** Nome da empresa logada — nunca fixo no código (multiempresa). */
  empresaNome?: string;
  /** ID da empresa — usado para limpar splash no logout. */
  empresaId?: string;
  /** Sobrescreve a navegação padrão (ex.: fechar gaveta antes de navegar). */
  onNavigate?: (href: string) => void;
  onLogout?: () => void;
  className?: string;
}

/**
 * Sidebar — navegação principal em telas médias/grandes.
 * Ícone grande + rótulo sempre visível (nunca "só ícone"): reduz a carga de
 * memorização para usuários com menos familiaridade digital.
 */
export function Sidebar({
  items = defaultNavItems,
  activeHref,
  empresaNome,
  empresaId,
  onNavigate,
  onLogout,
  className,
}: SidebarProps) {
  const router = useRouter();
  const [senhaDialogAberto, setSenhaDialogAberto] = React.useState(false);

  function handleNavigate(href: string) {
    if (onNavigate) {
      onNavigate(href);
    } else {
      router.push(href);
    }
  }

  async function handleLogout() {
    if (onLogout) {
      onLogout();
      return;
    }
    if (empresaId) clearSplashSession(empresaId);
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // segue para o login mesmo sem confirmação do servidor
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 bottom-0 w-72 shrink-0 border-r border-border bg-card shadow-lg flex flex-col",
        "data-[state=closed]:w-16",
        className
      )}
      aria-label="Menu lateral principal"
    >
      <div className="flex items-center gap-3 px-2 pb-8">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Pizza className="h-6 w-6" />
        </div>
        <div className="leading-tight">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            PedidoFlow
          </p>
          <p className="truncate text-lg font-bold tracking-[-0.01em]" title={empresaNome}>
            {empresaNome ?? "Minha empresa"}
          </p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto scrollbar-thin scrollbar-track-muted-200 scrollbar-thumb-muted-200">
        {items.map((item) => {
          const isActive = activeHref === item.href;
          const Icon = ICONES_NAVEGACAO[item.icon] ?? LayoutGrid;
          return (
            <button
              key={item.href}
              onClick={() => handleNavigate(item.href)}
              className={cn(
                "flex h-14 items-center gap-3 rounded-xl px-4 text-left text-base font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10",
                isActive
                  ? "bg-primary text-primary-foreground shadow-soft"
                  : "text-foreground/80 hover:bg-secondary"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <button
        onClick={() => setSenhaDialogAberto(true)}
        className="mb-2 flex h-14 items-center gap-3 rounded-xl border border-border px-4 text-base font-medium text-foreground/80 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10"
      >
        <KeyRound className="h-5 w-5" />
        Alterar senha
      </button>
      <button
        onClick={handleLogout}
        className="flex h-14 items-center gap-3 rounded-xl border border-border px-4 text-base font-medium text-foreground/80 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10"
      >
        <LogOut className="h-5 w-5" />
        Sair do sistema
      </button>
      <AlterarSenhaDialog open={senhaDialogAberto} onOpenChange={setSenhaDialogAberto} />
    </aside>
  );
}

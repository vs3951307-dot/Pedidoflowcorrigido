"use client";

import * as React from "react";
import { Bell, Menu, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface HeaderProps {
  greetingName: string;
  date: string;
  time: string;
  weekday: string;
  notificationCount?: number;
  onMenuClick?: () => void;
  onNotificationsClick?: () => void;
  className?: string;
}

/** Retorna saudação e ícone conforme o horário — mesma lógica das duas telas de referência. */
function getGreeting(hour: number) {
  if (hour < 6) return { label: "Boa madrugada", Icon: Moon };
  if (hour < 12) return { label: "Bom dia", Icon: Sun };
  if (hour < 18) return { label: "Boa tarde", Icon: Sun };
  return { label: "Boa noite", Icon: Moon };
}

/**
 * Header — saudação pessoal + relógio/data sempre visíveis (referência de
 * contexto constante, útil para quem trabalha em turnos) e acesso rápido a
 * notificações. Em telas pequenas, o botão de menu abre a Sidebar em Sheet.
 */
export function Header({
  greetingName,
  date,
  time,
  weekday,
  notificationCount = 0,
  onMenuClick,
  onNotificationsClick,
  className,
}: HeaderProps) {
  const hour = parseInt(time.split(":")[0] ?? "12", 10);
  const { label, Icon } = getGreeting(hour);

  return (
    <header
      className={cn(
        "flex items-center justify-between gap-4 border-b border-border bg-card px-5 py-5 sm:px-8",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMenuClick}
          aria-label="Abrir menu"
        >
          <Menu className="h-6 w-6" />
        </Button>
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Icon className="h-4 w-4" />
            {label},
          </p>
          <h1 className="text-2xl font-bold tracking-[-0.01em] sm:text-3xl">
            {greetingName}!
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden flex-col items-end rounded-xl border border-border bg-secondary/60 px-4 py-2 text-right sm:flex">
          <span className="font-mono text-lg font-semibold tabular">{time}</span>
          <span className="text-xs text-muted-foreground">
            {date} · {weekday}
          </span>
        </div>

        <Button
          variant="secondary"
          size="icon"
          className="relative"
          onClick={onNotificationsClick}
          aria-label="Notificações"
        >
          <Bell className="h-5 w-5" />
          {notificationCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {notificationCount}
            </span>
          )}
        </Button>
      </div>
    </header>
  );
}

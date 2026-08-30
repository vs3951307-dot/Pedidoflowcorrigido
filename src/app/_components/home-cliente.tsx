"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bike, ChefHat, Crown, LogOut, Monitor, UtensilsCrossed, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ModuleCard, type ModuleCardProps } from "@/components/patterns/module-card";
import { api } from "@/lib/api-cliente";
import { TenantSplashScreen, useSplashOnce, clearSplashSession } from "@/components/tenant-splash";

interface ModuloDaHome {
  icon: string;
  title: string;
  description: string;
  href: string;
}

interface HomeClienteProps {
  nome: string;
  papel: string;
  empresaId?: string;
  empresaNome?: string;
  empresaLogoUrl?: string | null;
  empresaTema?: Record<string, unknown> | null;
  modulos: ModuloDaHome[];
}

const ICONES: Record<string, LucideIcon> = {
  monitor: Monitor,
  utensils: UtensilsCrossed,
  bike: Bike,
  chef: ChefHat,
  crown: Crown,
};

export function HomeCliente({
  nome,
  papel,
  empresaId,
  empresaNome,
  empresaLogoUrl,
  empresaTema,
  modulos,
}: HomeClienteProps) {
  const router = useRouter();
  const { showSplash, hide, minimumShowMs } = useSplashOnce(empresaId ?? null);

  const iniciais = nome
    .split(" ")
    .map((parte) => parte.charAt(0))
    .slice(0, 2)
    .join("");

  const corPrimaria = (empresaTema?.corPrimaria as string) ?? null;
  const corSecundaria = (empresaTema?.corSecundaria as string) ?? null;
  const mensagemSplash = (empresaTema?.mensagemSplash as string) ?? null;

  async function handleSair() {
    if (empresaId) clearSplashSession(empresaId);
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // mesmo sem resposta, encerra localmente
    }
    toast.success("Sessão encerrada.");
    router.push("/login");
  }

  return (
    <main className="min-h-screen bg-background">
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

      <div className="container flex flex-col gap-10 py-10 sm:py-14">
        {/* Cabeçalho */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
              <span className="text-lg font-bold">{iniciais}</span>
            </div>
            <div>
              <p className="text-lg font-bold leading-tight tracking-[-0.01em] text-foreground">
                Olá, {nome}
              </p>
              <p className="text-sm text-muted-foreground">
                {papel} · Escolha um módulo para continuar
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSair}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sair
          </Button>
        </header>

        {/* Seleção de módulo */}
        <section className="flex flex-col gap-5">
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.01em] text-foreground sm:text-3xl">
              Selecione um módulo
            </h1>
            <p className="mt-1 text-base text-muted-foreground">
              Cada módulo abre com as ferramentas certas para a sua função.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {modulos.map((modulo) => {
              const Icone = ICONES[modulo.icon] ?? Monitor;
              const props: Omit<ModuleCardProps, "className"> = {
                icon: Icone,
                title: modulo.title,
                description: modulo.description,
                href: modulo.href,
              };
              return <ModuleCard key={modulo.title} {...props} />;
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

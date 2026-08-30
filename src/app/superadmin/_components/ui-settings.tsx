"use client";

import * as React from "react";
import { Palette, Monitor, Smartphone, ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useUISettings, type UIScale } from "@/contexts/ui-settings-context";
import { cn } from "@/lib/utils";

const scaleOptions: { value: UIScale; label: string; desc: string; icon: React.ReactNode }[] = [
  { value: "compacto", label: "Compacto", desc: "Botões menores, mais conteúdo visível", icon: <ArrowDown className="h-4 w-4" /> },
  { value: "normal", label: "Normal", desc: "Padrão equilibrado", icon: <Monitor className="h-4 w-4" /> },
  { value: "ampliado", label: "Ampliado", desc: "Botões maiores, fácil para toque", icon: <ArrowUp className="h-4 w-4" /> },
];

export function UISettingsPanel() {
  const { scale, setScale } = useUISettings();

  return (
    <div className="space-y-6">
      <Card className="bg-neutral-900 border-neutral-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="h-4 w-4 text-amber-400" />
            Escala de Botões
          </CardTitle>
          <CardDescription>
            Controla o tamanho de todos os botões, toggles e steppers do sistema em tempo real.
            A preferência é salva automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {scaleOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setScale(opt.value)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all duration-150 text-left",
                  scale === opt.value
                    ? "border-amber-400 bg-amber-400/10 text-amber-300"
                    : "border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-500 hover:bg-neutral-750"
                )}
              >
                <div className="flex items-center gap-2">
                  {opt.icon}
                  <span className="font-semibold text-sm">{opt.label}</span>
                </div>
                <span className="text-xs text-center">{opt.desc}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-neutral-900 border-neutral-800">
        <CardHeader>
          <CardTitle className="text-base">Pré-visualização</CardTitle>
          <CardDescription>Veja como ficam os componentes com a escala selecionada.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs text-neutral-500 mb-2 font-medium uppercase tracking-wider">Botões</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="primary">Primary SM</Button>
              <Button size="md" variant="primary">Primary MD</Button>
              <Button size="lg" variant="primary">Primary LG</Button>
              <Button size="md" variant="secondary">Secondary</Button>
              <Button size="md" variant="outline">Outline</Button>
              <Button size="md" variant="ghost">Ghost</Button>
              <Button size="md" variant="destructive">Destructive</Button>
              <Button size="md" variant="success">Success</Button>
            </div>
          </div>

          <div>
            <p className="text-xs text-neutral-500 mb-2 font-medium uppercase tracking-wider">Toggle Buttons</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border-2 border-primary bg-primary-50 text-primary-700 font-semibold shadow-sm"
                style={{ height: "var(--toggle-h-md)", paddingLeft: 12, paddingRight: 12, fontSize: 12 }}>
                <Smartphone className="h-3.5 w-3.5" /> Pix (ativo)
              </span>
              <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border-2 border-border bg-card text-foreground/80 font-semibold"
                style={{ height: "var(--toggle-h-md)", paddingLeft: 12, paddingRight: 12, fontSize: 12 }}>
                <Smartphone className="h-3.5 w-3.5" /> Dinheiro
              </span>
            </div>
          </div>

          <div>
            <p className="text-xs text-neutral-500 mb-2 font-medium uppercase tracking-wider">Stepper</p>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <button type="button" style={{ width: "var(--stepper-btn)", height: "var(--stepper-btn)" }}
                  className="flex items-center justify-center rounded-full border border-border text-muted-foreground">
                  <ArrowDown style={{ width: "var(--stepper-icon)", height: "var(--stepper-icon)" }} />
                </button>
                <span className="w-8 text-center text-sm font-bold tabular">3</span>
                <button type="button" style={{ width: "var(--stepper-btn)", height: "var(--stepper-btn)" }}
                  className="flex items-center justify-center rounded-full border border-border text-muted-foreground">
                  <ArrowUp style={{ width: "var(--stepper-icon)", height: "var(--stepper-icon)" }} />
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

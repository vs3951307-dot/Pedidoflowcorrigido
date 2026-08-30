"use client";

import * as React from "react";
import { toast } from "sonner";
import { Pizza, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-cliente";

interface ConfigPizza {
  acrescimoPorSaborPremium: number;
  permitirMisturarDoceSalgada: boolean;
}

const PADRAO: ConfigPizza = { acrescimoPorSaborPremium: 10, permitirMisturarDoceSalgada: true };

export function ConfigPizzaPreco({ className }: { className?: string }) {
  const [acrescimo, setAcrescimo] = React.useState<number>(PADRAO.acrescimoPorSaborPremium);
  const [permitir, setPermitir] = React.useState<boolean>(PADRAO.permitirMisturarDoceSalgada);
  const [carregando, setCarregando] = React.useState(true);
  const [salvando, setSalvando] = React.useState(false);
  const [configurado, setConfigurado] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const r = await fetch("/api/config/pizza");
        if (r.ok) {
          const d = (await r.json()) as Partial<ConfigPizza>;
          if (ativo) {
            setAcrescimo(Number(d.acrescimoPorSaborPremium ?? PADRAO.acrescimoPorSaborPremium));
            setPermitir(d.permitirMisturarDoceSalgada ?? PADRAO.permitirMisturarDoceSalgada);
            setConfigurado(true);
          }
        } else if (r.status === 409) {
          if (ativo) setConfigurado(false);
        }
      } catch {
        if (ativo) setConfigurado(false);
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  async function salvar() {
    if (isNaN(acrescimo) || acrescimo < 0) {
      toast.error("Acréscimo inválido. Use um valor maior ou igual a zero.");
      return;
    }
    setSalvando(true);
    try {
      await api("/api/config/pizza", {
        method: "POST",
        body: JSON.stringify({
          acrescimoPorSaborPremium: acrescimo,
          permitirMisturarDoceSalgada: permitir,
        }),
      });
      setConfigurado(true);
      toast.success("Regra de preço de pizza salva.");
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ErrorBoundary>
      <div className={cn("flex flex-col gap-6", className)}>
        <Card>
          <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Pizza className="h-5 w-5 text-primary" aria-hidden="true" />
              Regra de preço de pizza
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Define como o valor de uma pizza é calculado quando há mais de um sabor.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-6 p-6 sm:p-7">
            {carregando ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : (
              <>
                {configurado === false && (
                  <p className="rounded-xl border border-status-waiting-border bg-status-waiting-bg px-4 py-3 text-sm text-status-waiting">
                    Ainda não configurada. Até salvar, o PDV recusa pedidos com 2+ sabores
                    premium (sabor especial/doce). Salve para liberar.
                  </p>
                )}

                <div className="flex flex-col gap-2">
                  <Label htmlFor="acrescimo-pizza">
                    Acréscimo por sabor premium adicional (R$)
                  </Label>
                  <Input
                    id="acrescimo-pizza"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    className="max-w-[12rem]"
                    value={Number.isNaN(acrescimo) ? "" : acrescimo}
                    onChange={(e) => setAcrescimo(parseFloat(e.target.value))}
                  />
                  <p className="text-sm text-muted-foreground">
                    Preço da pizza = <strong>maior</strong> preço entre os sabores escolhidos
                    + este acréscimo × (nº de sabores premium − 1) + adicionais. Sabores
                    tradicionais não contam como premium; especiais e doces contam.
                  </p>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="misturar-doce" className="text-base">
                      Permitir misturar sabores doces e salgados
                    </Label>
                    <span className="text-sm text-muted-foreground">
                      Se desligado, o sistema recusa itens com sabores doces e salgados juntos.
                    </span>
                  </div>
                  <Switch
                    id="misturar-doce"
                    checked={permitir}
                    onCheckedChange={setPermitir}
                    aria-label="Permitir misturar sabores doces e salgados"
                  />
                </div>

                <div className="flex justify-end">
                  <Button onClick={salvar} disabled={salvando}>
                    <Save className="h-4 w-4" aria-hidden="true" />
                    {salvando ? "Salvando…" : "Salvar regra"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </ErrorBoundary>
  );
}

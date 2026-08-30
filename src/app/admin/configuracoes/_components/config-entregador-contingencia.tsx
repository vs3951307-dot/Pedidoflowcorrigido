"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, MessageSquareWarning, Send } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, useApi } from "@/lib/api-cliente";

interface ConfigApi {
  config?: { contingencia_entregador?: { ativa?: boolean } };
}

interface EntregadoresApi {
  entregadores: { id: string; nome: string; ativo: boolean }[];
}

/**
 * Contingência via WhatsApp para o entregador (PEDIDO 9/19) — DESATIVADA
 * por padrão. O fluxo principal continua sendo o app do Entregador; isto
 * só existe para emergência (app indisponível). Quando desativada, a
 * rota de envio recusa a chamada e nada é enviado.
 */
export function ConfigEntregadorContingencia() {
  const { dados, recarregar } = useApi<ConfigApi>("/api/configuracoes", {});
  const { dados: entregadoresData } = useApi<EntregadoresApi>("/api/entregadores", { entregadores: [] });
  const [ativa, setAtiva] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);
  const [entregadorId, setEntregadorId] = React.useState<string>("");
  const [enviando, setEnviando] = React.useState(false);

  React.useEffect(() => {
    setAtiva(Boolean(dados.config?.contingencia_entregador?.ativa));
  }, [dados]);

  async function salvar(novoValor: boolean) {
    setAtiva(novoValor);
    setSalvando(true);
    try {
      await api("/api/configuracoes", {
        method: "PUT",
        body: JSON.stringify({ chave: "contingencia_entregador", valor: { ativa: novoValor } }),
      });
      toast.success(novoValor ? "Contingência ativada." : "Contingência desativada.");
      recarregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao salvar.");
      setAtiva(!novoValor);
    } finally {
      setSalvando(false);
    }
  }

  async function enviarAgora() {
    if (!entregadorId) {
      toast.error("Escolha um entregador.");
      return;
    }
    setEnviando(true);
    try {
      const resp = await api<{ ok: boolean; entregasEnviadas: number }>("/api/entregas/contingencia-whatsapp", {
        method: "POST",
        body: JSON.stringify({ entregadorId }),
      });
      toast.success(`Rota enviada por WhatsApp (${resp.entregasEnviadas} entrega(s)).`);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao enviar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4 py-6">
          <div className="flex items-start gap-3">
            <MessageSquareWarning className="mt-0.5 h-5 w-5 shrink-0 text-status-waiting" aria-hidden="true" />
            <div>
              <p className="font-semibold text-foreground">Contingência via WhatsApp</p>
              <p className="text-sm text-muted-foreground">
                Opção de emergência para quando o app do Entregador estiver indisponível. O fluxo
                principal continua sendo o aplicativo — use isto só quando necessário. Desativada
                por padrão: enquanto estiver desligada, nada é enviado.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border p-4">
            <Label htmlFor="contingencia-switch" className="cursor-pointer font-medium">
              Permitir envio de rota por WhatsApp (contingência)
            </Label>
            <Switch id="contingencia-switch" checked={ativa} onCheckedChange={salvar} disabled={salvando} />
          </div>
        </CardContent>
      </Card>

      {ativa && (
        <Card>
          <CardContent className="flex flex-col gap-4 py-6">
            <p className="font-semibold text-foreground">Enviar rota agora</p>
            <p className="text-sm text-muted-foreground">
              Envia as entregas ativas do entregador escolhido para o WhatsApp cadastrado dele.
              Requer telefone cadastrado no Entregador e o WhatsApp da empresa configurado.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Select value={entregadorId} onValueChange={setEntregadorId}>
                <SelectTrigger className="sm:w-64">
                  <SelectValue placeholder="Escolha o entregador" />
                </SelectTrigger>
                <SelectContent>
                  {entregadoresData.entregadores
                    .filter((e) => e.ativo)
                    .map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nome}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button onClick={enviarAgora} disabled={enviando}>
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Enviar rota por WhatsApp
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

"use client";

import * as React from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Printer, RefreshCw, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FilaImpressao } from "@/components/impressao/fila-impressao";
import { cn } from "@/lib/utils";
import { api, useApi } from "@/lib/api-cliente";

interface TokenApi {
  configurado: boolean;
  mascarado: string | null;
}

interface StatusAgenteApi {
  conectado: boolean;
  ultimoContatoEm: string | null;
  segundosAtras: number | null;
}

/**
 * Fila de impressão (todos os destinos) + token do agente local.
 *
 * O token NUNCA aparece em texto puro depois de criado (PEDIDO: "o token
 * do agente deve aparecer completo somente quando for criado. Depois,
 * mostrar mascarado."). Antes, `impressao.agenteToken` vinha em texto
 * puro sempre que a tela carregava, via `/api/configuracoes` genérico —
 * agora usa um endpoint dedicado (`/api/impressao/agente-token`) que só
 * devolve o valor completo na resposta do POST de geração, nunca no GET.
 */
export function ConfigFilaImpressao() {
  const { dados: tokenInfo, recarregar: recarregarToken } = useApi<TokenApi>("/api/impressao/agente-token", {
    configurado: false,
    mascarado: null,
  });
  const [gerando, setGerando] = React.useState(false);
  const [tokenRevelado, setTokenRevelado] = React.useState<string | null>(null);

  const status = useApi<StatusAgenteApi>("/api/impressao/status", {
    conectado: false,
    ultimoContatoEm: null,
    segundosAtras: null,
  });
  React.useEffect(() => {
    const id = setInterval(() => status.recarregar(), 10_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function gerarToken() {
    if (
      tokenInfo.configurado &&
      !confirm("Já existe um token configurado. Gerar um novo invalida o atual — todo agente rodando com o token antigo para de funcionar até você atualizar. Continuar?")
    ) {
      return;
    }
    setGerando(true);
    try {
      const resposta = await api<{ token: string }>("/api/impressao/agente-token", { method: "POST" });
      setTokenRevelado(resposta.token);
      recarregarToken();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível gerar o token.");
    } finally {
      setGerando(false);
    }
  }

  function copiar() {
    if (!tokenRevelado) return;
    navigator.clipboard?.writeText(tokenRevelado);
    toast.success("Token copiado.");
  }

  const temToken = tokenInfo.configurado;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-3 p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
              <Printer className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-semibold">Componente externo: agente de impressão local</p>
              <p className="text-sm text-muted-foreground">
                O sistema enfileira o conteúdo pronto para térmica 80 mm; quem imprime de
                verdade é um agente instalado na máquina da impressora (polling na fila).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            Token do agente:{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">
              {temToken ? tokenInfo.mascarado : "não configurado"}
            </code>
            <Button size="sm" variant="outline" onClick={gerarToken} disabled={gerando}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {temToken ? "Gerar novo token" : "Gerar token"}
            </Button>
            <span className="text-xs">
              (header <code className="rounded bg-muted px-1 py-0.5">x-agente-token</code> em{" "}
              <code className="rounded bg-muted px-1 py-0.5">GET /api/impressao/fila</code>)
            </span>
          </div>

          <div
            className={cn(
              "flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium",
              !temToken
                ? "border-border bg-secondary/40 text-muted-foreground"
                : status.dados.conectado
                  ? "border-status-free-border bg-status-free-bg text-status-free"
                  : "border-status-occupied-border bg-status-occupied-bg text-status-occupied"
            )}
          >
            {!temToken ? (
              <>
                <WifiOff className="h-4 w-4" aria-hidden="true" />
                Gere um token acima para o agente conseguir se conectar.
              </>
            ) : status.dados.conectado ? (
              <>
                <span className="h-2 w-2 rounded-full bg-status-free" aria-hidden="true" />
                Agente conectado — última consulta há {status.dados.segundosAtras}s.
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4" aria-hidden="true" />
                {status.dados.ultimoContatoEm
                  ? `Agente offline — sem contato há ${status.dados.segundosAtras}s. Trabalhos continuam na fila até ele reconectar.`
                  : "Agente nunca se conectou. Rode scripts/agente-impressao/agente.mjs na máquina da impressora."}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <FilaImpressao />

      <Dialog open={!!tokenRevelado} onOpenChange={(aberto) => !aberto && setTokenRevelado(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Token gerado</DialogTitle>
            <DialogDescription>
              Copie agora — por segurança, ele não será mostrado por completo de novo. Configure este
              valor como <code>AGENTE_TOKEN</code> no computador da impressora.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted p-3">
            <code className="flex-1 break-all text-sm">{tokenRevelado}</code>
            <Button size="sm" variant="outline" onClick={copiar}>
              <Copy className="h-4 w-4" aria-hidden="true" />
              Copiar
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setTokenRevelado(null)}>Já copiei, fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

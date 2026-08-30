"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  MessageCircle,
  Phone,
  PlugZap,
  Save,
  ShieldCheck,
  TriangleAlert,
  Unplug,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, useApi } from "@/lib/api-cliente";

interface StatusWhatsApp {
  configurado: boolean;
  fonte: "env" | "banco" | null;
  provedor: string;
  telefone: string | null;
  phoneNumberId: string | null;
  verifyTokenConfigurado: boolean;
  assinaturaConfigurada: boolean;
  faltando: string[];
  urlWebhook: string;
  urlBase: string;
  metodo: "env" | "banco" | null;
}

interface ResultadoConexao {
  ok: boolean;
  teste?: {
    ok: boolean;
    nome?: string;
    numero?: string;
    erro?: string;
  };
}

const FALLBACK: StatusWhatsApp = {
  configurado: false,
  fonte: null,
  provedor: "WhatsApp Cloud API (Meta)",
  telefone: null,
  phoneNumberId: null,
  verifyTokenConfigurado: false,
  assinaturaConfigurada: false,
  faltando: [],
  urlWebhook: "/api/whatsapp/webhook",
  urlBase: "https://graph.facebook.com/v21.0",
  metodo: null,
};

/**
 * Conexão do WhatsApp (PEDIDO 18/21).
 *
 * A integração usa a API oficial WhatsApp Business Cloud (Meta). As
 * credenciais podem ser definidas aqui no painel (gravadas no banco) ou
 * no .env (que tem precedência). "Conectar" valida as credenciais contra
 * a Meta sem enviar mensagens — nada é simulado.
 */
export function ConfigWhatsApp() {
  const { dados, recarregar } = useApi<StatusWhatsApp>("/api/whatsapp/config", FALLBACK);
  const config = dados ?? FALLBACK;

  const [telefone, setTelefone] = React.useState("");
  const [verifyToken, setVerifyToken] = React.useState("");
  const [accessToken, setAccessToken] = React.useState("");
  const [appSecret, setAppSecret] = React.useState("");
  const [phoneNumberId, setPhoneNumberId] = React.useState("");
  const [provedor, setProvedor] = React.useState("WhatsApp Cloud API (Meta)");
  const [salvando, setSalvando] = React.useState(false);
  const [conectando, setConectando] = React.useState(false);
  const [desconectando, setDesconectando] = React.useState(false);
  const [resultado, setResultado] = React.useState<ResultadoConexao["teste"] | null>(null);
  const [copiado, setCopiado] = React.useState(false);

  const urlWebhookCompleta =
    typeof window !== "undefined"
      ? `${window.location.origin}${config.urlWebhook}`
      : config.urlWebhook;

  const salvar = async () => {
    setSalvando(true);
    try {
      await api("/api/whatsapp/config", {
        method: "PUT",
        body: JSON.stringify({ telefone, verifyToken, accessToken, appSecret, phoneNumberId, provedor }),
      });
      toast.success("Configuração do WhatsApp salva.");
      setVerifyToken("");
      setAccessToken("");
      setAppSecret("");
      await recarregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao salvar configuração");
    } finally {
      setSalvando(false);
    }
  };

  const conectar = async () => {
    setConectando(true);
    setResultado(null);
    try {
      await api("/api/whatsapp/config", {
        method: "PUT",
        body: JSON.stringify({ telefone, verifyToken, accessToken, appSecret, phoneNumberId, provedor }),
      });
      const resposta = await api<ResultadoConexao>("/api/whatsapp/conectar", { method: "POST" });
      setResultado(resposta.teste ?? null);
      toast.success(
        resposta.ok ? "WhatsApp conectado com sucesso!" : "Falha na conexão — veja o detalhe abaixo."
      );
      setVerifyToken("");
      setAccessToken("");
      setAppSecret("");
      await recarregar();
    } catch (erro) {
      setResultado({ ok: false, erro: erro instanceof Error ? erro.message : "Falha ao conectar" });
      toast.error(erro instanceof Error ? erro.message : "Falha ao conectar");
    } finally {
      setConectando(false);
    }
  };

  const desconectar = async () => {
    setDesconectando(true);
    try {
      await api("/api/whatsapp/config", { method: "DELETE" });
      toast.success("WhatsApp desconectado (configuração do painel removida).");
      await recarregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao desconectar");
    } finally {
      setDesconectando(false);
    }
  };

  const copiarUrl = async () => {
    try {
      await navigator.clipboard.writeText(urlWebhookCompleta);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("Não foi possível copiar a URL.");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div
        className={`flex items-center gap-3 rounded-2xl border p-4 ${
          config.configurado
            ? "border-status-free-border bg-status-free-bg"
            : "border-status-waiting-border bg-status-waiting-bg"
        }`}
      >
        {config.configurado ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-status-free" aria-hidden="true" />
        ) : (
          <TriangleAlert className="h-5 w-5 shrink-0 text-status-waiting" aria-hidden="true" />
        )}
        <div className="flex flex-col gap-0.5">
          <p className={`text-sm font-semibold ${config.configurado ? "text-status-free" : "text-status-waiting"}`}>
            {config.configurado
              ? `WhatsApp conectado — ${config.telefone ?? "número verificado"} (${
                  config.fonte === "env" ? "via .env" : "via painel"
                }).`
              : "WhatsApp NÃO conectado — o atendimento segue em modo simulação."}
          </p>
          {config.configurado && config.phoneNumberId && (
            <p className="text-xs text-muted-foreground">
              Phone number ID: <code className="rounded bg-muted px-1 py-0.5 text-xs">{config.phoneNumberId}</code>
              {config.verifyTokenConfigurado ? " · webhook com verify token" : " · falta o verify token no webhook"}
            </p>
          )}
          {!config.configurado &&
            config.faltando.map((item) => (
              <p key={item} className="text-xs text-muted-foreground">
                {item}
              </p>
            ))}
        </div>
      </div>

      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <PlugZap className="h-5 w-5 text-primary" aria-hidden="true" />
            Conectar número
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Credenciais da API oficial do WhatsApp Business (Meta), gravadas no banco. Campos de
            token vazios mantêm o valor já salvo.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 p-6 pt-4 sm:grid-cols-2 sm:p-7 sm:pt-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium text-muted-foreground">
              Telefone comercial (ex.: (11) 4002-8922)
            </Label>
            <Input
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(11) 4002-8922"
              aria-label="Telefone comercial"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium text-muted-foreground">Provedor</Label>
            <Input
              value={provedor}
              onChange={(e) => setProvedor(e.target.value)}
              aria-label="Provedor"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium text-muted-foreground">
              Token de acesso permanente (access token)
            </Label>
            <Input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={config.configurado && config.fonte === "banco" ? "••••• (mantém o atual)" : ""}
              aria-label="Token de acesso"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium text-muted-foreground">
              Phone number ID
            </Label>
            <Input
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              placeholder={config.configurado && config.fonte === "banco" ? config.phoneNumberId ?? "" : ""}
              aria-label="Phone number ID"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label className="text-sm font-medium text-muted-foreground">
              Verify token do webhook (ex.: rozeno-2026)
            </Label>
            <Input
              value={verifyToken}
              onChange={(e) => setVerifyToken(e.target.value)}
              placeholder={config.configurado && config.fonte === "banco" ? "••••• (mantém o atual)" : ""}
              aria-label="Verify token"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label className="text-sm font-medium text-muted-foreground">
              App Secret do app da Meta (valida a assinatura do webhook)
            </Label>
            <Input
              type="password"
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              placeholder={
                config.assinaturaConfigurada ? "••••• (mantém o atual)" : "Obrigatório para o webhook aceitar mensagens"
              }
              aria-label="App Secret"
            />
            <p className="text-xs text-muted-foreground">
              {config.assinaturaConfigurada
                ? "Assinatura do webhook configurada."
                : "Sem o App Secret, o webhook recusa os POSTs da Meta (403) — nenhuma mensagem real é aceita."}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <MessageCircle className="h-5 w-5 text-primary" aria-hidden="true" />
            Webhook
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Cadastre esta URL no app da Meta (WhatsApp → Configuração do webhook) com o mesmo
            verify token:
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 p-6 pt-4 sm:p-7 sm:pt-4">
          <div className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2">
            <code className="flex-1 truncate text-xs">{urlWebhookCompleta}</code>
            <Button variant="outline" size="sm" onClick={copiarUrl} type="button">
              {copiado ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-status-free" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {copiado ? "Copiado" : "Copiar"}
            </Button>
          </div>
          <ol className="flex list-inside list-decimal flex-col gap-1 text-xs text-muted-foreground">
            <li>Crie o app em developers.facebook.com e adicione o produto WhatsApp.</li>
            <li>Associe o número comercial e gere o token de acesso permanente.</li>
            <li>Cole o token e o phone number ID acima e clique em Conectar.</li>
            <li>No webhook da Meta, use a URL acima com o verify token cadastrado.</li>
            <li>O robô de atendimento responde sozinho em /atendimento.</li>
          </ol>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-status-free" aria-hidden="true" />
            Integração exclusiva pela API oficial da Meta — sem Baileys ou whatsapp-web.js (evita
            banimento do número).
          </p>
        </CardContent>
      </Card>

      {resultado && (
        <div
          className={`flex flex-col gap-1 rounded-2xl border p-4 text-sm ${
            resultado.ok
              ? "border-status-free-border bg-status-free-bg text-status-free"
              : "border-status-waiting-border bg-status-waiting-bg text-status-waiting"
          }`}
        >
          <p className="font-semibold">
            {resultado.ok ? "Conectado com sucesso!" : "Falha na conexão."}
          </p>
          {resultado.ok && (
            <p className="text-xs">
              Número verificado: <strong>{resultado.numero}</strong> — {resultado.nome}
            </p>
          )}
          {resultado.erro && <p className="text-xs">{resultado.erro}</p>}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        <Button
          variant="outline"
          onClick={desconectar}
          disabled={desconectando || !config.configurado || config.fonte === "env"}
          title={
            config.fonte === "env"
              ? "Configurado via .env — remova as variáveis WHATSAPP_* do arquivo"
              : "Remove a configuração do painel"
          }
        >
          {desconectando ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Unplug className="h-4 w-4" aria-hidden="true" />
          )}
          Desconectar
        </Button>
        <Button variant="outline" onClick={salvar} disabled={salvando}>
          {salvando ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="h-4 w-4" aria-hidden="true" />
          )}
          Salvar
        </Button>
        <Button onClick={conectar} disabled={conectando}>
          {conectando ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Phone className="h-4 w-4" aria-hidden="true" />
          )}
          Conectar
        </Button>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
        As credenciais ficam no banco; para removê-las de vez, use Desconectar ou apague as
        variáveis do .env.
      </p>
    </div>
  );
}

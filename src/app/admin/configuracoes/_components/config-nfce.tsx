"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  FileDigit,
  FlaskConical,
  KeyRound,
  Loader2,
  PlugZap,
  Save,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api, useApi } from "@/lib/api-cliente";
import type { StatusConfiguracaoFiscal } from "@/lib/fiscal/tipos";

interface ConfigFiscalApi {
  config: StatusConfiguracaoFiscal;
}

interface ResultadoTeste {
  ok: boolean;
  teste?: {
    conectado: boolean;
    ambiente: "producao" | "homologacao";
    provedor?: string;
    cStat?: string;
    xMotivo?: string;
    erro?: string;
  };
}

const FALLBACK_CONFIG: StatusConfiguracaoFiscal = {
  configurado: false,
  ambiente: "homologacao",
  ambienteFonte: "banco",
  provedor: "",
  urlBase: "",
  faltando: [],
  observacoes: [],
  emitirAutomatico: true,
  serie: null,
  proximoNumero: null,
};

/**
 * Configuração da NFC-e (PEDIDO 19).
 *
 * O que fica no banco (editável aqui): ambiente, série, numeração, logo,
 * emissão automática e identificação do provedor.
 * O que fica no .env (NUNCA no banco): NFCe_PROVEDOR_URL, NFCe_TOKEN,
 * NFCe_CSC, NFCe_CSC_ID, NFCe_CERT_PATH, NFCe_CERT_SENHA, NFCe_AMBIENTE.
 * O painel mostra o estado real de `GET /api/fiscal/config` e permite
 * testar a conectividade com `POST /api/fiscal/teste` — nada é simulado.
 */
export function ConfigNfce() {
  const { dados } = useApi<ConfigFiscalApi>("/api/fiscal/config", {
    config: FALLBACK_CONFIG,
  });
  const config = dados.config;

  const [serie, setSerie] = React.useState("");
  const [proximoNumero, setProximoNumero] = React.useState("");
  const [ambiente, setAmbiente] = React.useState<"producao" | "homologacao">("homologacao");
  const [logo, setLogo] = React.useState(true);
  const [emitirAutomatico, setEmitirAutomatico] = React.useState(true);
  const [salvando, setSalvando] = React.useState(false);
  const [testando, setTestando] = React.useState(false);
  const [resultadoTeste, setResultadoTeste] = React.useState<ResultadoTeste["teste"] | null>(null);

  React.useEffect(() => {
    if (!config) return;
    setSerie(String(config.serie ?? 1));
    setProximoNumero(String(config.proximoNumero ?? 1));
    setAmbiente(config.ambiente);
    setLogo(true);
    setEmitirAutomatico(config.emitirAutomatico);
  }, [config]);

  const salvar = async () => {
    setSalvando(true);
    try {
      await api("/api/configuracoes", {
        method: "PUT",
        body: JSON.stringify({
          chave: "nfce",
          valor: {
            serie: Number(serie) || 1,
            proximoNumero: Number(proximoNumero) || 1,
            ambiente,
            logo,
            emitirAutomatico,
          },
        }),
      });
      toast.success("Configuração NFC-e salva.");
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao salvar configuração NFC-e");
    } finally {
      setSalvando(false);
    }
  };

  const testar = async () => {
    setTestando(true);
    setResultadoTeste(null);
    try {
      const resposta = await api<ResultadoTeste>("/api/fiscal/teste", { method: "POST" });
      setResultadoTeste(resposta.teste ?? null);
      toast.success(
        resposta.ok
          ? "Conectado ao provedor fiscal."
          : "Falha na conexão — veja o detalhe abaixo."
      );
    } catch (erro) {
      setResultadoTeste({ conectado: false, ambiente: ambiente, erro: String(erro) });
      toast.error(erro instanceof Error ? erro.message : "Falha ao testar conexão");
    } finally {
      setTestando(false);
    }
  };

  const configurado = config?.configurado ?? false;
  const faltando = config?.faltando ?? [];
  const observacoes = config?.observacoes ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div
        className={`flex items-center gap-3 rounded-2xl border p-4 ${
          configurado
            ? "border-status-free-border bg-status-free-bg"
            : "border-status-waiting-border bg-status-waiting-bg"
        }`}
      >
        {configurado ? (
          <ShieldCheck className="h-5 w-5 shrink-0 text-status-free" aria-hidden="true" />
        ) : (
          <TriangleAlert className="h-5 w-5 shrink-0 text-status-waiting" aria-hidden="true" />
        )}
        <div className="flex flex-col gap-0.5">
          <p className={`text-sm font-semibold ${configurado ? "text-status-free" : "text-status-waiting"}`}>
            {configurado
              ? `Integração configurada — ambiente ${config.ambiente === "producao" ? "PRODUÇÃO" : "HOMOLOGAÇÃO"}.`
              : "Integração NÃO configurada — nenhuma NFC-e será emitida (a venda segue normal)."}
          </p>
          {!configurado && faltando.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Falta: {faltando.join(" · ")}
            </p>
          )}
          {observacoes.map((obs) => (
            <p key={obs} className="text-xs text-muted-foreground">
              {obs}
            </p>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <FileDigit className="h-5 w-5 text-primary" aria-hidden="true" />
            Emissão
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Série, numeração e ambiente de emissão do cupom fiscal (gravados no banco).
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 p-6 pt-4 sm:grid-cols-2 sm:p-7 sm:pt-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium text-muted-foreground">
              Ambiente (usado quando NFCe_AMBIENTE não está definido no .env)
            </Label>
            <Select value={ambiente} onValueChange={(valor) => setAmbiente(valor as "producao" | "homologacao")}>
              <SelectTrigger aria-label="Ambiente">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="producao">Produção</SelectItem>
                <SelectItem value="homologacao">Homologação (testes)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium text-muted-foreground">Série</Label>
            <Input value={serie} onChange={(e) => setSerie(e.target.value)} inputMode="numeric" aria-label="Série" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium text-muted-foreground">Próximo número</Label>
            <Input
              value={proximoNumero}
              onChange={(e) => setProximoNumero(e.target.value)}
              inputMode="numeric"
              aria-label="Próximo número"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium text-muted-foreground">Logo no cupom</Label>
            <div className="flex h-9 items-center">
              <Switch checked={logo} onCheckedChange={setLogo} aria-label="Logo no cupom" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium text-muted-foreground">Emitir ao finalizar venda</Label>
            <div className="flex h-9 items-center">
              <Switch
                checked={emitirAutomatico}
                onCheckedChange={setEmitirAutomatico}
                aria-label="Emitir ao finalizar venda"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <KeyRound className="h-5 w-5 text-primary" aria-hidden="true" />
            Credenciais e provedor
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Definidas no arquivo <code className="rounded bg-muted px-1 py-0.5 text-xs">.env</code> do
            servidor — nunca no banco de dados:
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 p-6 pt-4 sm:p-7 sm:pt-4">
          <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            {[
              ["NFCe_PROVEDOR_URL", "URL da API do provedor fiscal"],
              ["NFCe_TOKEN", "Token de acesso (Authorization: Bearer)"],
              ["NFCe_CSC", "Código de segurança do contribuinte (SEFAZ)"],
              ["NFCe_CSC_ID", "Id do CSC"],
              ["NFCe_CERT_PATH / NFCe_CERT_SENHA", "Certificado digital A1 (.pfx) — obrigatório só em produção"],
              ["NFCe_AMBIENTE", "homologacao | producao — tem precedência sobre o selecionado acima"],
            ].map(([variavel, descricao]) => (
              <li key={variavel} className="flex items-baseline gap-2">
                <code className="shrink-0 rounded bg-muted px-1 py-0.5 text-xs">{variavel}</code>
                <span className="text-xs">{descricao}</span>
              </li>
            ))}
          </ul>
          {config?.urlBase && (
            <p className="mt-2 text-xs text-muted-foreground">
              Provedor configurado: <strong>{config.provedor}</strong> ({config.urlBase})
              {config.ambienteFonte === "env"
                ? " — ambiente definido pelo .env."
                : " — ambiente definido no banco."}
            </p>
          )}
        </CardContent>
      </Card>

      {resultadoTeste && (
        <div
          className={`flex flex-col gap-1 rounded-2xl border p-4 text-sm ${
            resultadoTeste.conectado
              ? "border-status-free-border bg-status-free-bg text-status-free"
              : "border-status-waiting-border bg-status-waiting-bg text-status-waiting"
          }`}
        >
          <p className="font-semibold">
            {resultadoTeste.conectado ? "Conectado ao provedor." : "Falha na conexão."}
          </p>
          {resultadoTeste.cStat && (
            <p className="text-xs">cStat: {resultadoTeste.cStat} — {resultadoTeste.xMotivo}</p>
          )}
          {resultadoTeste.erro && <p className="text-xs">{resultadoTeste.erro}</p>}
          <p className="text-xs text-muted-foreground">
            Ambiente do teste: {resultadoTeste.ambiente}
          </p>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        <Button
          variant="outline"
          onClick={testar}
          disabled={testando || !configurado}
          title={configurado ? "Testa a conexão sem emitir nota" : "Configure o .env primeiro"}
        >
          {testando ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <PlugZap className="h-4 w-4" aria-hidden="true" />
          )}
          Testar conexão
        </Button>
        <Button onClick={salvar} disabled={salvando}>
          {salvando ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="h-4 w-4" aria-hidden="true" />
          )}
          Salvar
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Em ambiente de homologação as notas não valem para o Fisco.
        <FlaskConical className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" />
      </p>
    </div>
  );
}

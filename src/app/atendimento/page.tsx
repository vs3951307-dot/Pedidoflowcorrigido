"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Bot,
  HandHeart,
  MessageSquare,
  Phone,
  RotateCw,
  Send,
  Square,
  UserRound,
  UserRoundCog,
  Wallet,
} from "lucide-react";

import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { api, useApi } from "@/lib/api-cliente";

type OrigemConversa = "whatsapp" | "simulacao";

interface ConversaLista {
  id: string;
  telefone: string;
  nome: string | null;
  status: string;
  etapa: string;
  atendimentoHumano: boolean;
  origem: OrigemConversa;
  pedidoId: string | null;
  criadoEm: string;
  atualizadoEm: string;
  ultimaPergunta: string | null;
}

interface Mensagem {
  id: string;
  de: "cliente" | "sistema" | "humano";
  texto: string;
  criadoEm: string;
}

interface PedidoVinculado {
  id: string;
  numero: number;
  total: number;
  canal: string;
  status: string;
}

interface ConversaDetalhe extends ConversaLista {
  mensagens: Mensagem[];
  pedido: PedidoVinculado | null;
}

const STATUS_LABEL: Record<string, string> = {
  nova: "Nova",
  em_andamento: "Em andamento",
  aguardando_confirmacao: "Aguardando confirmação",
  pedido_criado: "Pedido criado",
  humana: "Atendimento humano",
  encerrada: "Encerrada",
};

const STATUS_COR: Record<string, string> = {
  nova: "bg-sky-100 text-sky-800",
  em_andamento: "bg-amber-100 text-amber-800",
  aguardando_confirmacao: "bg-violet-100 text-violet-800",
  pedido_criado: "bg-emerald-100 text-emerald-800",
  humana: "bg-blue-100 text-blue-800",
  encerrada: "bg-muted text-muted-foreground",
};

function formatarData(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatarTelefone(tel: string): string {
  const d = tel.replace(/\D/g, "");
  if (d.length >= 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return tel;
}

function Bolha({ mensagem }: { mensagem: Mensagem }) {
  const ehCliente = mensagem.de === "cliente";
  const ehHumano = mensagem.de === "humano";
  const ehSistema = mensagem.de === "sistema";

  const estilo = ehCliente
    ? "self-end bg-primary text-primary-foreground"
    : ehHumano
      ? "self-end bg-emerald-100 text-emerald-950"
      : "self-start bg-muted text-foreground";

  const rotulo = ehCliente
    ? "Cliente"
    : ehHumano
      ? "Atendente humano"
      : "Robô";
  const Icone = ehCliente ? UserRound : ehHumano ? UserRoundCog : Bot;

  return (
    <div className={`flex max-w-[85%] flex-col gap-1 rounded-2xl px-3 py-2 text-sm ${estilo}`}>
      <span className={`flex items-center gap-1 text-[11px] font-medium ${ehCliente || ehHumano ? "opacity-70" : "text-muted-foreground"}`}>
        <Icone className="h-3 w-3" aria-hidden="true" />
        {rotulo} · {formatarData(mensagem.criadoEm)}
      </span>
      <span className="whitespace-pre-wrap break-words">{mensagem.texto}</span>
    </div>
  );
}

/**
 * Atendimento — conversas do WhatsApp (PEDIDO 18). Robô conduz o fluxo
 * com dados reais do banco; atendente pode assumir (humano), responder,
 * devolver ao robô ou encerrar. Simulador permite testar sem WhatsApp real.
 */
export default function AtendimentoPage() {
  const { dados, recarregar } = useApi<{ conversas: ConversaLista[] }>(
    "/api/atendimento/conversas",
    { conversas: [] }
  );

  const [conversaId, setConversaId] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<ConversaDetalhe | null>(null);
  const [telefoneSim, setTelefoneSim] = useState("11987654321");
  const [textoSim, setTextoSim] = useState("");
  const [textoHumano, setTextoHumano] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [operando, setOperando] = useState(false);

  const selecionar = useCallback(async (id: string) => {
    setConversaId(id);
    try {
      const { conversa } = await api<{ conversa: ConversaDetalhe }>(`/api/atendimento/conversas/${id}`);
      setDetalhe(conversa);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar conversa");
    }
  }, []);

  // Atualiza a conversa aberta quando a lista muda (nova mensagem no robô).
  useEffect(() => {
    if (!conversaId) return;
    api<{ conversa: ConversaDetalhe }>(`/api/atendimento/conversas/${conversaId}`)
      .then(({ conversa }) => setDetalhe(conversa))
      .catch(() => undefined);
  }, [conversaId, dados]);

  const enviarSimulacao = async () => {
    const texto = textoSim.trim();
    if (!texto) return;
    setEnviando(true);
    try {
      const r = await api<{ conversaId: string }>("/api/atendimento/mensagem", {
        method: "POST",
        body: JSON.stringify({ telefone: telefoneSim.trim(), texto, origem: "simulacao" }),
      });
      setTextoSim("");
      toast.success("Mensagem enviada ao robô.");
      recarregar();
      await selecionar(r.conversaId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar mensagem");
    } finally {
      setEnviando(false);
    }
  };

  const operar = async (corpo: Record<string, unknown>, sucesso: string) => {
    if (!conversaId) return;
    setOperando(true);
    try {
      const { conversa } = await api<{ conversa: ConversaDetalhe }>(
        `/api/atendimento/conversas/${conversaId}`,
        { method: "PATCH", body: JSON.stringify(corpo) }
      );
      setDetalhe(conversa);
      toast.success(sucesso);
      recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na operação");
    } finally {
      setOperando(false);
    }
  };

  const responderHumano = async () => {
    const texto = textoHumano.trim();
    if (!texto || !conversaId) return;
    setOperando(true);
    try {
      await api(`/api/atendimento/conversas/${conversaId}`, {
        method: "PATCH",
        body: JSON.stringify({ mensagemHumano: texto }),
      });
      setTextoHumano("");
      toast.success("Resposta enviada como atendente.");
      recarregar();
      const { conversa } = await api<{ conversa: ConversaDetalhe }>(
        `/api/atendimento/conversas/${conversaId}`
      );
      setDetalhe(conversa);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao responder");
    } finally {
      setOperando(false);
    }
  };

  const conversaAtual = useMemo(
    () => dados.conversas.find((c) => c.id === conversaId) ?? detalhe ?? null,
    [dados.conversas, conversaId, detalhe]
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Atendimento WhatsApp"
        description="Robô conduz o pedido com dados reais; o atendente acompanha e pode assumir a conversa."
        actions={
          <Button variant="outline" onClick={recarregar}>
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            Atualizar
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="p-5 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Phone className="h-4 w-4 text-primary" aria-hidden="true" />
                Conversas
              </CardTitle>
            </CardHeader>
            <CardContent className="flex max-h-[520px] flex-col gap-2 overflow-y-auto p-5 pt-3">
              {dados.conversas.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nenhuma conversa ainda. Use o simulador ao lado para começar.
                </p>
              )}
              {dados.conversas.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selecionar(c.id)}
                  className={`flex flex-col gap-1 rounded-xl border p-3 text-left transition-colors ${
                    conversaId === c.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">
                      {c.nome ?? formatarTelefone(c.telefone)}
                    </span>
                    {c.atendimentoHumano ? (
                      <HandHeart className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
                    ) : (
                      <Bot className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    )}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {c.ultimaPergunta ?? "—"}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5 pt-1">
                    <Badge className={`${STATUS_COR[c.status] ?? "bg-muted"} font-medium`}>
                      {STATUS_LABEL[c.status] ?? c.status}
                    </Badge>
                    {c.origem === "whatsapp" && (
                      <Badge variant="outline" className="font-medium">WhatsApp real</Badge>
                    )}
                    {c.pedidoId && (
                      <Badge variant="outline" className="gap-1 font-medium text-emerald-700">
                        <Wallet className="h-3 w-3" aria-hidden="true" />
                        Pedido
                      </Badge>
                    )}
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-5 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4 text-primary" aria-hidden="true" />
                Simulador de cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 p-5 pt-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm font-medium text-muted-foreground">Telefone</Label>
                <Input
                  value={telefoneSim}
                  onChange={(e) => setTelefoneSim(e.target.value)}
                  aria-label="Telefone do cliente simulado"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm font-medium text-muted-foreground">Mensagem do cliente</Label>
                <Textarea
                  value={textoSim}
                  onChange={(e) => setTextoSim(e.target.value)}
                  placeholder="Ex.: quero uma pizza de calabresa"
                  rows={3}
                  aria-label="Mensagem do cliente simulado"
                />
              </div>
              <Button onClick={enviarSimulacao} disabled={enviando || !textoSim.trim()}>
                <Send className="h-4 w-4" aria-hidden="true" />
                Enviar para o robô
              </Button>
              <p className="text-xs text-muted-foreground">
                Testa o fluxo completo sem WhatsApp real. A conversa aparece na lista.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="p-6 pb-3">
            {conversaAtual ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    {conversaAtual.nome ?? formatarTelefone(conversaAtual.telefone)}
                    {conversaAtual.atendimentoHumano ? (
                      <Badge className="bg-blue-100 font-medium text-blue-800">Humano</Badge>
                    ) : (
                      <Badge className="bg-muted font-medium text-muted-foreground">Robô</Badge>
                    )}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {formatarTelefone(conversaAtual.telefone)} · etapa {conversaAtual.etapa} · atualizada em{" "}
                    {formatarData(conversaAtual.atualizadoEm)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!conversaAtual.atendimentoHumano && conversaAtual.status !== "encerrada" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={operando}
                      onClick={() => operar({ humana: true }, "Você assumiu o atendimento.")}
                    >
                      <HandHeart className="h-4 w-4" aria-hidden="true" />
                      Assumir
                    </Button>
                  )}
                  {conversaAtual.atendimentoHumano && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={operando}
                      onClick={() => operar({ humana: false }, "Devolvido ao robô.")}
                    >
                      <Bot className="h-4 w-4" aria-hidden="true" />
                      Devolver ao robô
                    </Button>
                  )}
                  {conversaAtual.status !== "encerrada" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={operando}
                      onClick={() => operar({ encerrar: true }, "Conversa encerrada.")}
                    >
                      <Square className="h-4 w-4" aria-hidden="true" />
                      Encerrar
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <CardTitle className="text-lg">Conversa</CardTitle>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-6 pt-2">
            {!conversaAtual ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Selecione uma conversa para acompanhar, responder ou usar o simulador.
              </p>
            ) : (
              <>
                <div className="flex max-h-[420px] min-h-[260px] flex-col gap-2 overflow-y-auto rounded-xl bg-muted/30 p-4">
                  {detalhe?.mensagens.length === 0 && (
                    <p className="m-auto text-sm text-muted-foreground">Sem mensagens ainda.</p>
                  )}
                  {detalhe?.mensagens.map((m) => <Bolha key={m.id} mensagem={m} />)}
                </div>

                {detalhe?.pedido && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                    <Wallet className="h-4 w-4" aria-hidden="true" />
                    Pedido #{detalhe.pedido.numero} ({detalhe.pedido.canal}) — R${" "}
                    {detalhe.pedido.total.toFixed(2).replace(".", ",")} ·{" "}
                    <span className="font-medium">{detalhe.pedido.status}</span>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium text-muted-foreground">
                    Responder como atendente humano
                  </Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Textarea
                      value={textoHumano}
                      onChange={(e) => setTextoHumano(e.target.value)}
                      placeholder="Escreva a resposta do atendente..."
                      rows={2}
                      className="flex-1"
                      aria-label="Resposta do atendente humano"
                    />
                    <Button
                      onClick={responderHumano}
                      disabled={operando || !textoHumano.trim() || !conversaAtual}
                      className="sm:w-auto"
                    >
                      <Send className="h-4 w-4" aria-hidden="true" />
                      Responder
                    </Button>
                  </div>
                  {conversaAtual.origem === "whatsapp" && (
                    <p className="text-xs text-muted-foreground">
                      A resposta será enviada pelo WhatsApp oficial se configurado (ver .env).
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

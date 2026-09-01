"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Bot,
  Bug,
  ChevronDown,
  ChevronUp,
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
  estado?: string;
}

const STATUS_LABEL: Record<string, string> = {
  nova: "Nova",
  em_andamento: "Em andamento",
  aguardando_confirmacao: "Aguardando confirmacao",
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

const QUICK_REPLIES = [
  { label: "oi", texto: "oi" },
  { label: "quero pizza", texto: "quero pizza" },
  { label: "cardapio", texto: "cardapio" },
  { label: "calabresa", texto: "calabresa" },
  { label: "grande", texto: "grande" },
  { label: "sim", texto: "sim" },
  { label: "pix", texto: "pix" },
  { label: "entrega", texto: "entrega" },
  { label: "cancelar", texto: "cancelar" },
];

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

  const estilo = ehCliente
    ? "self-end bg-primary text-primary-foreground"
    : ehHumano
      ? "self-end bg-emerald-100 text-emerald-950"
      : "self-start bg-muted text-foreground";

  const rotulo = ehCliente ? "Cliente" : ehHumano ? "Atendente humano" : "Robo";
  const Icone = ehCliente ? UserRound : ehHumano ? UserRoundCog : Bot;

  return (
    <div className={`flex max-w-[85%] flex-col gap-1 rounded-2xl px-3 py-2 text-sm ${estilo}`}>
      <span className={`flex items-center gap-1 text-[11px] font-medium ${ehCliente || ehHumano ? "opacity-70" : "text-muted-foreground"}`}>
        <Icone className="h-3 w-3" aria-hidden="true" />
        {rotulo} - {formatarData(mensagem.criadoEm)}
      </span>
      <span className="whitespace-pre-wrap break-words">{mensagem.texto}</span>
    </div>
  );
}

/**
 * Atendimento - conversas do WhatsApp. Robo conduz o fluxo com dados
 * reais do banco; atendente pode assumir (humano), responder, devolver
 * ao robo ou encerrar. Simulador permite testar sem WhatsApp real.
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
  const [debugAberto, setDebugAberto] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  // Auto-scroll para ultima mensagem
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [detalhe?.mensagens]);

  // Auto-polling: atualiza a conversa aberta a cada 3s
  useEffect(() => {
    if (!conversaId) return;
    const timer = setInterval(() => {
      api<{ conversa: ConversaDetalhe }>(`/api/atendimento/conversas/${conversaId}`)
        .then(({ conversa }) => setDetalhe(conversa))
        .catch(() => undefined);
    }, 3000);
    return () => clearInterval(timer);
  }, [conversaId]);

  const selecionar = useCallback(async (id: string) => {
    setConversaId(id);
    try {
      const { conversa } = await api<{ conversa: ConversaDetalhe }>(`/api/atendimento/conversas/${id}`);
      setDetalhe(conversa);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar conversa");
    }
  }, []);

  const enviarSimulacao = async (textoOverride?: string) => {
    const texto = (textoOverride ?? textoSim).trim();
    if (!texto) return;
    setEnviando(true);
    try {
      const r = await api<{ conversaId: string }>("/api/atendimento/mensagem", {
        method: "POST",
        body: JSON.stringify({ telefone: telefoneSim.trim(), texto, origem: "simulacao" }),
      });
      setTextoSim("");
      toast.success("Mensagem enviada ao robo.");
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
      toast.error(e instanceof Error ? e.message : "Falha na operacao");
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

  // Parse estado para debug
  const estadoDebug = useMemo(() => {
    if (!detalhe?.estado) return null;
    try {
      return JSON.parse(detalhe.estado);
    } catch {
      return null;
    }
  }, [detalhe?.estado]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Atendimento WhatsApp"
        description="Robo conduz o pedido com dados reais; o atendente acompanha e pode assumir a conversa."
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
                  Nenhuma conversa ainda. Use o simulador abaixo para comecar.
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

              {/* Historico recente no simulador */}
              {detalhe && detalhe.mensagens.length > 0 && (
                <div className="flex flex-col gap-1 rounded-lg bg-muted/50 p-2 text-xs">
                  <span className="font-medium text-muted-foreground">Historico:</span>
                  {detalhe.mensagens.slice(-4).map((m) => (
                    <span key={m.id} className="truncate">
                      <span className="font-medium">{m.de === "cliente" ? "Voce" : "Bot"}:</span>{" "}
                      {m.texto.slice(0, 80)}{m.texto.length > 80 ? "..." : ""}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label className="text-sm font-medium text-muted-foreground">Mensagem do cliente</Label>
                <Textarea
                  value={textoSim}
                  onChange={(e) => setTextoSim(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      enviarSimulacao();
                    }
                  }}
                  placeholder="Ex.: quero uma pizza de calabresa"
                  rows={3}
                  aria-label="Mensagem do cliente simulado"
                />
              </div>

              {/* Respostas rapidas */}
              <div className="flex flex-wrap gap-1.5">
                {QUICK_REPLIES.map((qr) => (
                  <Button
                    key={qr.label}
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={enviando}
                    onClick={() => enviarSimulacao(qr.texto)}
                  >
                    {qr.label}
                  </Button>
                ))}
              </div>

              <Button onClick={() => enviarSimulacao()} disabled={enviando || !textoSim.trim()}>
                <Send className="h-4 w-4" aria-hidden="true" />
                Enviar para o robo
              </Button>
              <p className="text-xs text-muted-foreground">
                Use os botoes rapidos ou digite. Enter envia. A conversa aparece na lista.
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
                      <Badge className="bg-muted font-medium text-muted-foreground">Robo</Badge>
                    )}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {formatarTelefone(conversaAtual.telefone)} - etapa {conversaAtual.etapa} - atualizada em{" "}
                    {formatarData(conversaAtual.atualizadoEm)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!conversaAtual.atendimentoHumano && conversaAtual.status !== "encerrada" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={operando}
                      onClick={() => operar({ humana: true }, "Voce assumiu o atendimento.")}
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
                      onClick={() => operar({ humana: false }, "Devolvido ao robo.")}
                    >
                      <Bot className="h-4 w-4" aria-hidden="true" />
                      Devolver ao robo
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
                Selecione uma conversa para acompanhar ou use o simulador.
              </p>
            ) : (
              <>
                {/* Chat com auto-scroll */}
                <div
                  ref={chatRef}
                  className="flex max-h-[420px] min-h-[260px] flex-col gap-2 overflow-y-auto rounded-xl bg-muted/30 p-4"
                >
                  {detalhe?.mensagens.length === 0 && (
                    <p className="m-auto text-sm text-muted-foreground">Sem mensagens ainda.</p>
                  )}
                  {detalhe?.mensagens.map((m) => <Bolha key={m.id} mensagem={m} />)}
                </div>

                {detalhe?.pedido && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                    <Wallet className="h-4 w-4" aria-hidden="true" />
                    Pedido #{detalhe.pedido.numero} ({detalhe.pedido.canal}) - R${" "}
                    {detalhe.pedido.total.toFixed(2).replace(".", ",")} -{" "}
                    <span className="font-medium">{detalhe.pedido.status}</span>
                  </div>
                )}

                {/* Responder como humano */}
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
                      A resposta sera enviada pelo WhatsApp oficial se configurado.
                    </p>
                  )}
                </div>

                {/* Painel de Debug */}
                <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50">
                  <button
                    type="button"
                    onClick={() => setDebugAberto(!debugAberto)}
                    className="flex w-full items-center justify-between p-3 text-sm font-medium text-amber-800"
                  >
                    <span className="flex items-center gap-2">
                      <Bug className="h-4 w-4" aria-hidden="true" />
                      Debug - FSM
                    </span>
                    {debugAberto ? (
                      <ChevronUp className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                  {debugAberto && (
                    <div className="space-y-2 border-t border-amber-200 px-3 pb-3 pt-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Etapa:</span>
                        <Badge className="bg-amber-100 font-mono text-amber-800">{conversaAtual.etapa}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Status:</span>
                        <Badge className={`${STATUS_COR[conversaAtual.status] ?? "bg-muted"} font-mono`}>
                          {conversaAtual.status}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Origem:</span>
                        <span className="font-mono">{conversaAtual.origem}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Humano:</span>
                        <span className="font-mono">{conversaAtual.atendimentoHumano ? "sim" : "nao"}</span>
                      </div>
                      {estadoDebug && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Carrinho:</span>
                            <span className="font-mono">
                              {Array.isArray(estadoDebug.itens) ? estadoDebug.itens.length : 0} itens
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Canal:</span>
                            <span className="font-mono">{estadoDebug.canal ?? "—"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Endereco:</span>
                            <span className="font-mono">
                              {estadoDebug.endereco
                                ? `${estadoDebug.endereco.rua}, ${estadoDebug.endereco.bairro}`
                                : "—"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Pagamento:</span>
                            <span className="font-mono">{estadoDebug.formaPagamento ?? "—"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Cliente:</span>
                            <span className="font-mono">{estadoDebug.cliente?.nome ?? "—"}</span>
                          </div>
                        </>
                      )}
                    </div>
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

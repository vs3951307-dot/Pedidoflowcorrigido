"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Bot,
  Building2,
  FileText,
  History,
  Image as ImageIcon,
  Loader2,
  Mic,
  PackageSearch,
  Paperclip,
  PiggyBank,
  Send,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  UtensilsCrossed,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/patterns/page-header";

interface ResultadoAcao {
  ok: boolean;
  mensagem: string;
}

interface DadosNota {
  numero: string;
  serie?: string;
  fornecedor: string;
  emissao: string;
  itens: { nome: string; quantidade: number; valorTotal: number }[];
  valor: number;
}

interface RespostaCopiloto {
  modo?: "consulta" | "confirmacao" | "aplicado" | "bloqueado" | "anexo_guardado";
  erro?: string;
  consulta?: string;
  pergunta?: string;
  dados?: unknown;
  resumo?: string;
  actionId?: string | null;
  rotulos?: string[];
  aviso?: string;
  mensagens?: string[];
  resultados?: ResultadoAcao[];
  motivo?: string;
  mensagem?: string;
  tipoAnexo?: "imagem" | "audio" | "pdf" | "documento" | string;
  anexoCaminho?: string | null;
  nota?: DadosNota | null;
  itensSemEstoque?: string[];
}

interface AnexoUi {
  nome: string;
  tipo: string;
  base64?: string;
}

interface Mensagem {
  id: string;
  autor: "voce" | "copiloto";
  texto: string;
  anexo?: AnexoUi | null;
  resposta?: RespostaCopiloto;
  confirmada?: boolean;
}

const ATALHOS = [
  { texto: "Como foi o faturamento hoje?", icone: PiggyBank },
  { texto: "Quais os mais vendidos da semana?", icone: TrendingUp },
  { texto: "Tem pedido atrasado na cozinha?", icone: ShoppingBag },
  { texto: "O caixa está aberto?", icone: Sparkles },
  { texto: "Estoque abaixo do mínimo?", icone: PackageSearch },
  { texto: "Chegaram 10 cocas 2L", icone: Building2 },
  { texto: "Acabou calabresa", icone: UtensilsCrossed },
];

const MIMES_PERMITIDOS = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/amr",
  "audio/aac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/opus",
  "audio/webm",
];
const TAMANHO_MAXIMO_ANEXO_BYTES = 15 * 1024 * 1024;

async function chamar<T>(url: string, init?: RequestInit): Promise<T> {
  const resposta = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(corpo.erro ?? "Falha na requisição.");
  return corpo as T;
}

function novoId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function lerArquivoComoBase64(arquivo: File): Promise<AnexoUi> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve({ nome: arquivo.name, tipo: arquivo.type, base64: String(leitor.result) });
    leitor.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    leitor.readAsDataURL(arquivo);
  });
}

function urlDoAnexo(caminho: string): string {
  return `/api/copiloto/anexo?caminho=${encodeURIComponent(caminho)}`;
}

export function CopilotoEmpresa({ nomeUsuario, empresaNome }: { nomeUsuario: string; empresaNome: string }) {
  const [persona, setPersona] = React.useState<{ nome?: string; tom?: string; apresentacao?: string } | null>(null);
  const primeiroNome = nomeUsuario.split(" ")[0];

  function montarBoasVindas(): string {
    if (persona?.apresentacao) {
      return persona.apresentacao
        .replace("{usuario}", primeiroNome)
        .replace("{empresa}", empresaNome)
        .replace("{copiloto}", persona.nome?.trim() || "Copiloto");
    }
    const apelido = persona?.nome?.trim() || "Copiloto";
    switch (persona?.tom) {
      case "formal":
        return `Bom dia, ${primeiroNome}. Sou o ${apelido} da ${empresaNome}. Como posso ajudar?`;
      case "profissional":
        return `Olá, ${primeiroNome}! Sou o ${apelido} da ${empresaNome}. Pergunte sobre vendas, pedidos, estoque ou operação do dia a dia.`;
      case "descontraido":
        return `E aí, ${primeiroNome}! 👋 Sou o ${apelido} da ${empresaNome}. Manda a dúvida que eu resolvo!`;
      default:
        return `Olá, ${primeiroNome}! 😊 Sou o ${apelido} da ${empresaNome}. Pergunte sobre vendas, pedidos, estoque, caixa e entregas — ou dê comandos do dia a dia, que eu proponho e você confirma. Você também pode enviar uma foto, áudio ou PDF de nota fiscal.`;
    }
  }

  const [mensagens, setMensagens] = React.useState<Mensagem[]>([
    {
      id: novoId(),
      autor: "copiloto",
      texto: montarBoasVindas(),
    },
  ]);
  const [entrada, setEntrada] = React.useState("");
  const [anexoPendente, setAnexoPendente] = React.useState<AnexoUi | null>(null);
  const [enviando, setEnviando] = React.useState(false);
  const [mostrarHistorico, setMostrarHistorico] = React.useState(false);
  const inputArquivoRef = React.useRef<HTMLInputElement>(null);
  const fimRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    fetch("/api/configuracoes").then((r) => r.json()).then((c) => {
      if (c?.copiloto_empresa) {
        setPersona(c.copiloto_empresa);
      }
    }).catch(() => {});
  }, []);

  React.useEffect(() => {
    if (!persona) return;
    setMensagens((prev) => {
      if (prev.length !== 1 || prev[0].autor !== "copiloto") return prev;
      return [{ ...prev[0], texto: montarBoasVindas() }];
    });
  }, [persona]);React.useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, mostrarHistorico]);

  async function enviar(textoForcado?: string) {
    const texto = (textoForcado ?? entrada).trim();
    if ((!texto && !anexoPendente) || enviando) return;
    const anexo = anexoPendente;
    setEntrada("");
    setAnexoPendente(null);
    setMensagens((prev) => [...prev, { id: novoId(), autor: "voce", texto, anexo }]);
    setEnviando(true);
    try {
      const corpo: Record<string, unknown> = {};
      if (texto) corpo.pergunta = texto;
      if (anexo) corpo.anexo = { nome: anexo.nome, tipo: anexo.tipo, base64: anexo.base64 };
      const resposta = await chamar<RespostaCopiloto>("/api/copiloto", {
        method: "POST",
        body: JSON.stringify(corpo),
      });
      const textoResposta =
        resposta.modo === "confirmacao"
          ? "Encontrei uma operação. Confira abaixo antes de eu aplicar."
          : resposta.modo === "aplicado"
            ? "Feito!"
            : resposta.modo === "bloqueado"
              ? `Não posso fazer isso: ${resposta.motivo}`
              : resposta.modo === "anexo_guardado"
                ? resposta.mensagem ?? "Arquivo guardado."
                : resposta.resumo ?? resposta.erro ?? "Não consegui responder.";
      setMensagens((prev) => [...prev, { id: novoId(), autor: "copiloto", texto: textoResposta, resposta }]);
    } catch (erro) {
      const mensagemErro = erro instanceof Error ? erro.message : "Falha ao falar com o Copiloto.";
      setMensagens((prev) => [...prev, { id: novoId(), autor: "copiloto", texto: `⚠ ${mensagemErro}` }]);
    } finally {
      setEnviando(false);
    }
  }

  async function escolherArquivo(arquivo?: File) {
    if (!arquivo) return;
    if (!MIMES_PERMITIDOS.includes(arquivo.type)) {
      toast.error("Envie PDF, imagem (JPEG/PNG/WebP) ou áudio.");
      return;
    }
    if (arquivo.size > TAMANHO_MAXIMO_ANEXO_BYTES) {
      toast.error("Arquivo maior que 15MB — escolha um arquivo menor.");
      return;
    }
    try {
      setAnexoPendente(await lerArquivoComoBase64(arquivo));
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível ler o arquivo.");
    }
  }

  async function confirmar(msg: Mensagem, selecionados: number[]) {
    if (!msg.resposta?.actionId) return;
    setEnviando(true);
    try {
      const resultado = await chamar<RespostaCopiloto>("/api/copiloto", {
        method: "POST",
        body: JSON.stringify({ confirmar: true, actionId: msg.resposta.actionId, selecionados }),
      });
      setMensagens((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, confirmada: true } : m)).concat({
          id: novoId(),
          autor: "copiloto",
          texto: (resultado.mensagens ?? []).join("\n") || "Alterações aplicadas.",
        })
      );
      toast.success("Alterações aplicadas.");
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao aplicar.");
    } finally {
      setEnviando(false);
    }
  }

  function cancelar(msg: Mensagem) {
    setMensagens((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, confirmada: true } : m)).concat({
        id: novoId(),
        autor: "copiloto",
        texto: "Sem problema — não apliquei nada.",
      })
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Copiloto da Empresa"
        description="Assistente por conversa para consultar e administrar a sua operação. Alterações sempre exigem a sua confirmação — envie fotos, áudios ou PDF de nota fiscal."
        actions={
          <Button variant="outline" size="sm" onClick={() => setMostrarHistorico((v) => !v)}>
            <History className="h-4 w-4" />
            Histórico
          </Button>
        }
      />

      {mostrarHistorico ? (
        <HistoricoCopiloto onFechar={() => setMostrarHistorico(false)} />
      ) : (
        <Card className="flex flex-col">
          <div className="flex gap-2 overflow-x-auto border-b border-border px-4 py-3">
            {ATALHOS.map((atalho) => (
              <button
                key={atalho.texto}
                onClick={() => enviar(atalho.texto)}
                disabled={enviando}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
              >
                <atalho.icone className="h-3.5 w-3.5" />
                {atalho.texto}
              </button>
            ))}
          </div>

          <div className="flex max-h-[55vh] min-h-[45vh] flex-col gap-4 overflow-y-auto p-4 sm:p-6">
            {mensagens.map((msg) => (
              <BolhaMensagem key={msg.id} msg={msg} enviando={enviando} onConfirmar={confirmar} onCancelar={() => cancelar(msg)} />
            ))}
            <div ref={fimRef} />
          </div>

          <form
            className="flex flex-col gap-2 border-t border-border p-4 sm:p-6"
            onSubmit={(e) => {
              e.preventDefault();
              enviar();
            }}
          >
            {anexoPendente && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm">
                <IconeAnexo tipo={anexoPendente.tipo} />
                <span className="min-w-0 flex-1 truncate text-foreground">{anexoPendente.nome}</span>
                <button
                  type="button"
                  onClick={() => setAnexoPendente(null)}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  aria-label="Remover anexo"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <input
                ref={inputArquivoRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf,audio/mpeg,audio/ogg,audio/wav,audio/amr,audio/aac,audio/mp4,audio/x-m4a,audio/opus,audio/webm"
                className="hidden"
                onChange={(e) => {
                  escolherArquivo(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => inputArquivoRef.current?.click()}
                disabled={enviando}
                className="h-12 w-12 shrink-0"
                aria-label="Anexar arquivo"
              >
                <Paperclip className="h-5 w-5" />
              </Button>
              <Textarea
                value={entrada}
                onChange={(e) => setEntrada(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    enviar();
                  }
                }}
                placeholder="Pergunte, dê comandos — ou envie foto/áudio/PDF da nota fiscal"
                rows={1}
                className="min-h-[48px] flex-1 resize-none"
                disabled={enviando}
              />
              <Button type="submit" size="icon" disabled={enviando || (!entrada.trim() && !anexoPendente)} className="h-12 w-12 shrink-0">
                {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}

function IconeAnexo({ tipo }: { tipo: string }) {
  if (tipo.startsWith("image/")) return <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />;
  if (tipo.startsWith("audio/")) return <Mic className="h-4 w-4 shrink-0 text-muted-foreground" />;
  return <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

function BolhaMensagem({
  msg,
  enviando,
  onConfirmar,
  onCancelar,
}: {
  msg: Mensagem;
  enviando: boolean;
  onConfirmar: (msg: Mensagem, selecionados: number[]) => void;
  onCancelar: () => void;
}) {
  const rotulos = msg.resposta?.rotulos ?? [];
  const [selecionados, setSelecionados] = React.useState<number[]>(rotulos.map((_, i) => i));

  if (msg.autor === "voce") {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[85%] flex-col gap-1.5 rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-primary-foreground sm:max-w-[70%]">
          {msg.texto && <p className="whitespace-pre-line text-sm">{msg.texto}</p>}
          {msg.anexo && (
            <div className="flex items-center gap-2 rounded-lg bg-primary-foreground/15 px-3 py-2 text-sm">
              <IconeAnexo tipo={msg.anexo.tipo} />
              <span className="min-w-0 truncate">{msg.anexo.nome}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  const precisaConfirmar = msg.resposta?.modo === "confirmacao" && rotulos.length > 0 && !msg.confirmada;
  const mostrouAnexo = msg.resposta?.anexoCaminho;

  return (
    <div className="flex justify-start">
      <div className="flex max-w-[92%] items-start gap-2.5 sm:max-w-[78%]">
        <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Bot className="h-4 w-4" />
        </span>
        <div className="flex flex-col gap-2 rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-3">
          {msg.texto && <p className="whitespace-pre-line text-sm text-foreground">{msg.texto}</p>}

          {mostrouAnexo && <AnexoVisivel resposta={msg.resposta!} />}

          {msg.resposta?.nota && <PreviewNota nota={msg.resposta.nota} />}

          {msg.resposta?.dados !== undefined && <DetalhesConsulta dados={msg.resposta.dados} />}

          {precisaConfirmar && (
            <div className="mt-1 flex flex-col gap-2 rounded-xl border border-border bg-secondary/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                O que você quer registrar?
              </p>
              <ul className="flex flex-col gap-1.5">
                {rotulos.map((rotulo, i) => (
                  <li key={i}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-0.5 text-sm text-foreground hover:bg-secondary">
                      <input
                        type="checkbox"
                        checked={selecionados.includes(i)}
                        onChange={(e) =>
                          setSelecionados((prev) =>
                            e.target.checked ? [...prev, i] : prev.filter((idx) => idx !== i)
                          )
                        }
                        className="h-4 w-4 rounded border-border accent-primary"
                      />
                      {rotulo}
                    </label>
                  </li>
                ))}
              </ul>
              {msg.resposta?.itensSemEstoque && msg.resposta.itensSemEstoque.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {msg.resposta.itensSemEstoque.length} item(ns) da nota não foram encontrados no estoque e não
                  entrarão: {msg.resposta.itensSemEstoque.slice(0, 3).join(", ")}
                  {msg.resposta.itensSemEstoque.length > 3 ? "…" : ""}
                </p>
              )}
              {msg.resposta?.aviso && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                  {msg.resposta.aviso}
                </p>
              )}
              <div className="mt-1 flex gap-2">
                <Button size="sm" onClick={() => onConfirmar(msg, selecionados)} disabled={enviando || selecionados.length === 0}>
                  Confirmar selecionados
                </Button>
                <Button size="sm" variant="outline" onClick={onCancelar} disabled={enviando}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Exibição do arquivo guardado (imagem, áudio, PDF/documento). */
function AnexoVisivel({ resposta }: { resposta: RespostaCopiloto }) {
  const caminho = resposta.anexoCaminho;
  if (!caminho) return null;
  const url = urlDoAnexo(caminho);
  if (resposta.tipoAnexo === "imagem") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Anexo enviado" className="max-h-64 rounded-xl border border-border object-contain" />
      </a>
    );
  }
  if (resposta.tipoAnexo === "audio") {
    return <audio controls src={url} className="mt-1 w-full max-w-xs" />;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
    >
      <FileText className="h-4 w-4" />
      Ver documento
    </a>
  );
}

/** Prévia confidencial dos dados interpretados da nota fiscal (não é o documento completo). */
function PreviewNota({ nota }: { nota: DadosNota }) {
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-xl border border-border bg-secondary/40 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-semibold text-foreground">{nota.fornecedor}</span>
        <Badge variant="secondary">NF-e {nota.numero}{nota.serie && nota.serie !== "1" ? ` (série ${nota.serie})` : ""}</Badge>
        <span className="text-xs text-muted-foreground">
          {nota.emissao ? new Date(nota.emissao).toLocaleDateString("pt-BR") : "—"}
        </span>
        <span className="font-semibold text-foreground">R$ {Number(nota.valor).toFixed(2)}</span>
      </div>
      {nota.itens.length > 0 && (
        <ul className="flex flex-col gap-0.5 border-t border-border pt-2">
          {nota.itens.map((item, i) => (
            <li key={i} className="flex items-center justify-between gap-3 text-xs text-foreground">
              <span className="min-w-0 truncate">{item.nome}</span>
              <span className="shrink-0 text-muted-foreground">
                {item.quantidade} un · R$ {Number(item.valorTotal).toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Detalhes adicionais da consulta, exibidos abaixo do resumo quando existem. */
function DetalhesConsulta({ dados }: { dados: unknown }) {
  const lista = Array.isArray(dados) ? dados : null;
  if (!lista || lista.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1">
      {lista.slice(0, 6).map((item, i) => (
        <li key={i} className="text-xs text-muted-foreground">
          {typeof item === "object" && item !== null ? JSON.stringify(item) : String(item)}
        </li>
      ))}
    </ul>
  );
}

interface HistoricoItem {
  id: string;
  acao: string;
  detalhe: string | null;
  usuarioNome: string | null;
  criadoEm: string;
}

const ROTULOS_ACAO: Record<string, string> = {
  "copiloto.consulta": "Consulta",
  "copiloto.anexo": "Anexo recebido",
  "copiloto.audio_transcrito": "Áudio transcrito",
  "copiloto_bloqueado": "Comando bloqueado",
  "copiloto_entrada_estoque": "Entrada de estoque",
  "copiloto_ajuste_estoque": "Ajuste de estoque",
  "copiloto_disponibilidade_produto": "Disponibilidade",
  "copiloto_disponibilidade_sabor": "Disponibilidade (sabor)",
};

function HistoricoCopiloto({ onFechar }: { onFechar: () => void }) {
  const [itens, setItens] = React.useState<HistoricoItem[] | null>(null);

  React.useEffect(() => {
    chamar<{ historico: HistoricoItem[] }>("/api/copiloto/historico")
      .then((resp) => setItens(resp.historico))
      .catch((erro) => {
        toast.error(erro instanceof Error ? erro.message : "Falha ao carregar histórico.");
        setItens([]);
      });
  }, []);

  return (
    <Card>
      <CardContent className="py-4">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Histórico de interações do Copiloto</p>
          <Button variant="ghost" size="sm" onClick={onFechar}>
            Voltar ao chat
          </Button>
        </div>
        {itens === null ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : itens.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma interação registrada ainda.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {itens.map((item) => (
              <div key={item.id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant="secondary">{ROTULOS_ACAO[item.acao] ?? item.acao}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {item.usuarioNome ? `${item.usuarioNome} · ` : ""}
                    {new Date(item.criadoEm).toLocaleString("pt-BR")}
                  </span>
                </div>
                {item.detalhe && <p className="mt-2 text-xs text-muted-foreground">{item.detalhe}</p>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

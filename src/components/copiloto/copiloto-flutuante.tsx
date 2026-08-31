"use client";

import * as React from "react";
import { Bot, History, Loader2, Send, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface RespostaCopiloto {
  modo?: "consulta" | "confirmacao" | "aplicado" | "bloqueado" | "anexo_guardado";
  erro?: string;
  consulta?: string;
  pergunta?: string;
  resumo?: string;
  rotulos?: string[];
  aviso?: string;
  motivo?: string;
  mensagem?: string;
}

interface Mensagem {
  id: string;
  autor: "voce" | "copiloto";
  texto: string;
}

const ATALHOS = [
  "Como foi o faturamento hoje?",
  "O caixa está aberto?",
  "Quais os mais vendidos da semana?",
  "Estoque abaixo do mínimo?",
  "Tem pedido atrasado na cozinha?",
];

async function chamarCopiloto(pergunta: string): Promise<RespostaCopiloto> {
  const resposta = await fetch("/api/copiloto", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pergunta }),
  });
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(corpo.erro ?? "Falha ao falar com o assistente.");
  return corpo as RespostaCopiloto;
}

function extrairTexto(resposta: RespostaCopiloto): string {
  if (resposta.modo === "confirmacao") return "Encontrei uma operação. Confira na tela de Administração antes de eu aplicar.";
  if (resposta.modo === "aplicado") return "Feito!";
  if (resposta.modo === "bloqueado") return `Não posso fazer isso: ${resposta.motivo ?? "operação não permitida."}`;
  if (resposta.modo === "anexo_guardado") return resposta.mensagem ?? "Arquivo guardado.";
  if (resposta.resumo) return resposta.resumo;
  if (resposta.erro) return resposta.erro;
  return "Não consegui responder agora. Tente reformular a pergunta.";
}

function novoId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Assistente virtual flutuante (suporte) — botão com ícone de robô no canto
 * da tela que abre um chat com o Copiloto da Empresa, sem sair da página.
 * Exibido apenas pelo AppShell para usuários com o módulo Copiloto ativo.
 */
export function CopilotoFlutuante({
  nomeUsuario,
  empresaNome,
}: {
  nomeUsuario: string;
  empresaNome?: string;
}) {
  const [aberto, setAberto] = React.useState(false);
  const [mensagens, setMensagens] = React.useState<Mensagem[]>([]);
  const [entrada, setEntrada] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);
  const [inicializado, setInicializado] = React.useState(false);
  const [mostrarHistorico, setMostrarHistorico] = React.useState(false);
  const fimRef = React.useRef<HTMLDivElement>(null);
  const primeiroNome = nomeUsuario.split(" ")[0];

  React.useEffect(() => {
    if (aberto && !inicializado) {
      setInicializado(true);
      setMensagens([
        {
          id: novoId(),
          autor: "copiloto",
          texto: `Olá, ${primeiroNome}! 👋 Sou o assistente da ${empresaNome ?? "empresa"}. Pergunte sobre vendas, pedidos, estoque, caixa e entregas — ou dê comandos do dia a dia. Para operações além de consultas, confirme na área de Administração.`,
        },
      ]);
    }
  }, [aberto, inicializado, primeiroNome, empresaNome]);

  React.useEffect(() => {
    if (fimRef.current) fimRef.current.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, aberto, mostrarHistorico]);

  async function enviar(textoForcado?: string) {
    const texto = (textoForcado ?? entrada).trim();
    if (!texto || enviando) return;
    setEntrada("");
    setMensagens((prev) => [...prev, { id: novoId(), autor: "voce", texto }]);
    setEnviando(true);
    try {
      const resposta = await chamarCopiloto(texto);
      setMensagens((prev) => [...prev, { id: novoId(), autor: "copiloto", texto: extrairTexto(resposta) }]);
    } catch (erro) {
      setMensagens((prev) => [
        ...prev,
        { id: novoId(), autor: "copiloto", texto: `⚠ ${erro instanceof Error ? erro.message : "Falha ao falar com o assistente."}` },
      ]);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setAberto((v) => !v)}
        aria-label={aberto ? "Fechar assistente" : "Abrir assistente virtual de suporte"}
        className={cn(
          "fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl transition-transform hover:scale-105",
          "bg-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
        )}
      >
        {aberto ? <X className="h-7 w-7" /> : <Bot className="h-7 w-7" />}
      </button>

      {aberto && (
        <div className="fixed bottom-24 right-5 z-50 flex w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between gap-2 border-b border-border bg-primary px-4 py-3 text-primary-foreground">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
                <Bot className="h-5 w-5" />
              </span>
              <div className="leading-tight">
                <p className="text-sm font-semibold">Assistente {empresaNome ? `da ${empresaNome}` : "da empresa"}</p>
                <p className="text-xs text-primary-foreground/80">Suporte e consultas em tempo real</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMostrarHistorico((v) => !v)}
              className="text-primary-foreground hover:bg-white/15 hover:text-white"
              aria-label="Histórico"
            >
              <History className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex h-[380px] flex-col">
            {mostrarHistorico ? (
              <HistoricoFlutuante onFechar={() => setMostrarHistorico(false)} />
            ) : (
              <>
                <div className="flex gap-2 overflow-x-auto border-b border-border px-3 py-2">
                  {ATALHOS.map((atalho) => (
                    <button
                      key={atalho}
                      onClick={() => enviar(atalho)}
                      disabled={enviando}
                      className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                    >
                      <Sparkles className="h-3 w-3" />
                      {atalho}
                    </button>
                  ))}
                </div>

                <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
                  {mensagens.map((msg) => (
                    <BolhaFlutuante key={msg.id} msg={msg} />
                  ))}
                  {enviando && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Assistente pensando…
                    </div>
                  )}
                  <div ref={fimRef} />
                </div>

                <form
                  className="flex items-end gap-2 border-t border-border p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    enviar();
                  }}
                >
                  <Textarea
                    value={entrada}
                    onChange={(e) => setEntrada(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        enviar();
                      }
                    }}
                    placeholder="Pergunte qualquer coisa…"
                    rows={1}
                    className="min-h-[40px] flex-1 resize-none"
                    disabled={enviando}
                  />
                  <Button type="submit" size="icon" disabled={enviando || !entrada.trim()} className="h-10 w-10 shrink-0">
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function BolhaFlutuante({ msg }: { msg: Mensagem }) {
  if (msg.autor === "voce") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
          {msg.texto}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="flex max-w-[92%] items-start gap-2">
        <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Bot className="h-4 w-4" />
        </span>
        <div className="rounded-2xl rounded-bl-sm border border-border bg-secondary/40 px-3.5 py-2 text-sm text-foreground">
          <p className="whitespace-pre-line">{msg.texto}</p>
        </div>
      </div>
    </div>
  );
}

interface HistoricoItem {
  id: string;
  acao: string;
  detalhe: string | null;
  usuarioNome: string | null;
  criadoEm: string;
}

function HistoricoFlutuante({ onFechar }: { onFechar: () => void }) {
  const [itens, setItens] = React.useState<HistoricoItem[] | null>(null);

  React.useEffect(() => {
    fetch("/api/copiloto/historico")
      .then((r) => r.json())
      .then((resp) => setItens(resp.historico ?? []))
      .catch(() => setItens([]));
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <p className="text-sm font-semibold text-foreground">Histórico de interações</p>
        <Button variant="ghost" size="sm" onClick={onFechar}>
          Voltar
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {itens === null ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : itens.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma interação ainda.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {itens.map((item) => (
              <div key={item.id} className="rounded-xl border border-border p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-foreground">{item.acao}</span>
                  <span className="text-muted-foreground">{new Date(item.criadoEm).toLocaleString("pt-BR")}</span>
                </div>
                {item.detalhe && <p className="mt-1 text-muted-foreground">{item.detalhe}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Bot,
  Building2,
  ChevronLeft,
  History,
  Loader2,
  Palette,
  Send,
  ShieldAlert,
  Sparkles,
  Undo2,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface AcaoAdmin {
  tipo: string;
  nomeSugerido?: string;
  slugSugerido?: string;
  modulosSugeridos?: string[];
  [chave: string]: unknown;
}

interface RespostaCopiloto {
  ok: boolean;
  modo: "resposta" | "proposta" | "ambiguo" | "aplicado";
  resumo: string;
  actionId?: string | null;
  acoesPropostas?: AcaoAdmin[];
  rotulos?: string[];
  instrucaoOriginal?: string;
  especificacao?: string;
  precisaConfirmacao?: boolean;
  empresasCandidatas?: { id: string; nome: string }[];
  historicoId?: string | null;
}

interface Mensagem {
  id: string;
  autor: "voce" | "copiloto";
  texto: string;
  resposta?: RespostaCopiloto;
  confirmada?: boolean;
}

const ATALHOS = [
  { texto: "Liste minhas empresas", icone: Building2 },
  { texto: "Teve algum erro hoje?", icone: ShieldAlert },
  { texto: "Mostre a saúde da plataforma", icone: Sparkles },
  { texto: "Mude a cor primária da empresa X para vermelho escuro", icone: Palette },
  { texto: "Crie um plano chamado Profissional", icone: Wallet },
];

async function chamar<T>(url: string, init?: RequestInit): Promise<T> {
  const resposta = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(corpo.erro ?? "Falha na requisição.");
  return corpo as T;
}

function novoId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function CopilotoSupremo({ nomeSuperAdmin }: { nomeSuperAdmin: string }) {
  const router = useRouter();
  const [mensagens, setMensagens] = React.useState<Mensagem[]>([
    {
      id: novoId(),
      autor: "copiloto",
      texto: `Olá, ${nomeSuperAdmin.split(" ")[0]}! Sou o Copiloto Supremo — posso configurar empresas, módulos, planos, tema e a landing page, além de diagnosticar problemas na plataforma. O que você precisa?`,
    },
  ]);
  const [entrada, setEntrada] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);
  const [mostrarHistorico, setMostrarHistorico] = React.useState(false);
  const fimRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  async function enviar(textoForcado?: string) {
    const texto = (textoForcado ?? entrada).trim();
    if (!texto || enviando) return;
    setEntrada("");
    setMensagens((prev) => [...prev, { id: novoId(), autor: "voce", texto }]);
    setEnviando(true);
    try {
      const resposta = await chamar<RespostaCopiloto>("/api/superadmin/copiloto", {
        method: "POST",
        body: JSON.stringify({ instrucao: texto }),
      });
      setMensagens((prev) => [...prev, { id: novoId(), autor: "copiloto", texto: resposta.resumo, resposta }]);
    } catch (erro) {
      const mensagemErro = erro instanceof Error ? erro.message : "Falha ao falar com o Copiloto.";
      setMensagens((prev) => [...prev, { id: novoId(), autor: "copiloto", texto: `⚠ ${mensagemErro}` }]);
    } finally {
      setEnviando(false);
    }
  }

  async function confirmar(msg: Mensagem) {
    if (!msg.resposta?.actionId) return;
    setEnviando(true);
    try {
      const resultado = await chamar<RespostaCopiloto>("/api/superadmin/copiloto", {
        method: "POST",
        body: JSON.stringify({ confirmar: true, actionId: msg.resposta.actionId }),
      });
      setMensagens((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, confirmada: true } : m)).concat({
          id: novoId(),
          autor: "copiloto",
          texto: resultado.resumo,
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
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => router.push("/superadmin")}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Bot className="h-5 w-5" />
            </span>
            <div className="leading-tight">
              <p className="font-bold">Copiloto Supremo</p>
              <p className="text-xs text-muted-foreground">Administração da plataforma</p>
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setMostrarHistorico((v) => !v)}>
          <History className="h-4 w-4" />
          Histórico
        </Button>
      </header>

      {mostrarHistorico ? (
        <HistoricoCopiloto onFechar={() => setMostrarHistorico(false)} />
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto border-b border-border px-4 py-3 sm:px-6">
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

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
            {mensagens.map((msg) => (
              <BolhaMensagem key={msg.id} msg={msg} enviando={enviando} onConfirmar={() => confirmar(msg)} onCancelar={() => cancelar(msg)} />
            ))}
            <div ref={fimRef} />
          </div>

          <form
            className="flex items-end gap-2 border-t border-border p-4 sm:p-6"
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
              placeholder="Ex.: Ative o módulo de entregadores na Pastelaria X"
              rows={1}
              className="min-h-[48px] flex-1 resize-none"
              disabled={enviando}
            />
            <Button type="submit" size="icon" disabled={enviando || !entrada.trim()} className="h-12 w-12 shrink-0">
              {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </Button>
          </form>
        </>
      )}
    </div>
  );
}

function BolhaMensagem({
  msg,
  enviando,
  onConfirmar,
  onCancelar,
}: {
  msg: Mensagem;
  enviando: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  if (msg.autor === "voce") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-primary-foreground sm:max-w-[70%]">
          {msg.texto}
        </div>
      </div>
    );
  }

  const precisaConfirmar =
    msg.resposta?.modo === "proposta" && msg.resposta.precisaConfirmacao && !msg.confirmada;
  const ehAmbiguo = msg.resposta?.modo === "ambiguo" && !msg.confirmada;
  const acaoCriarEmpresa = msg.resposta?.acoesPropostas?.find((a) => a.tipo === "sugestao_criar_empresa");
  const indiceAcaoCriarUsuario = msg.resposta?.acoesPropostas?.findIndex((a) => a.tipo === "criar_usuario" && !a.email) ?? -1;
  const acaoCriarUsuario = indiceAcaoCriarUsuario >= 0 ? msg.resposta?.acoesPropostas?.[indiceAcaoCriarUsuario] : undefined;

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-3 sm:max-w-[75%]">
        <p className="whitespace-pre-line text-sm text-foreground">{msg.texto}</p>

        {acaoCriarEmpresa && !msg.confirmada ? (
          <FormularioCriarEmpresa acao={acaoCriarEmpresa} onConcluido={onCancelar} />
        ) : acaoCriarUsuario && !msg.confirmada ? (
          <FormularioEmailUsuario
            acao={acaoCriarUsuario}
            actionId={msg.resposta?.actionId}
            indice={indiceAcaoCriarUsuario}
            onConcluido={onCancelar}
          />
        ) : (
          <>
            {precisaConfirmar && (
          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-border bg-secondary/40 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ações propostas
            </p>
            <ul className="flex flex-col gap-1">
              {msg.resposta?.rotulos?.map((rotulo, i) => {
                const acao = msg.resposta?.acoesPropostas?.[i];
                const ehCor = acao?.tipo === "alterar_tema" && typeof acao.valor === "string" && /^#/.test(acao.valor);
                return (
                  <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                    {ehCor && (
                      <span
                        className="h-4 w-4 shrink-0 rounded-full border border-border"
                        style={{ backgroundColor: String(acao?.valor) }}
                        aria-hidden="true"
                      />
                    )}
                    • {rotulo}
                  </li>
                );
              })}
            </ul>
            <div className="mt-1 flex gap-2">
              <Button size="sm" onClick={onConfirmar} disabled={enviando}>
                Confirmar
              </Button>
              <Button size="sm" variant="outline" onClick={onCancelar} disabled={enviando}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {msg.resposta?.especificacao && (
          <details className="mt-3 rounded-xl border border-border bg-secondary/30 p-3">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ver especificação técnica gerada
            </summary>
            <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap text-xs text-foreground">
              {msg.resposta.especificacao}
            </pre>
          </details>
        )}

        {ehAmbiguo && (
          <div className="mt-3 flex flex-wrap gap-2">
            {msg.resposta?.empresasCandidatas?.map((e) => (
              <Badge key={e.id} variant="outline" className="cursor-default">
                {e.nome}
              </Badge>
            ))}
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Formulário inline que aparece quando o Copiloto propõe criar uma
 * empresa (PEDIDO 2): módulos já vêm sugeridos e editáveis; só falta o
 * administrador inicial. Ao enviar, chama a API REAL de criação de
 * empresa (a mesma usada na aba "Empresas") — o Copiloto nunca
 * reimplementa essa lógica crítica por conta própria.
 */
function FormularioCriarEmpresa({ acao, onConcluido }: { acao: AcaoAdmin; onConcluido: () => void }) {
  const [nome, setNome] = React.useState(acao.nomeSugerido ?? "");
  const [slug, setSlug] = React.useState(acao.slugSugerido ?? "");
  const [modulos, setModulos] = React.useState<string[]>(acao.modulosSugeridos ?? []);
  const [adminNome, setAdminNome] = React.useState("Administrador");
  const [adminEmail, setAdminEmail] = React.useState("");
  const [adminSenha, setAdminSenha] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);
  const [criado, setCriado] = React.useState(false);

  async function criar() {
    if (!nome.trim() || !slug.trim() || !adminEmail.trim() || adminSenha.length < 8) {
      toast.error("Preencha nome, slug, e-mail do administrador e uma senha com pelo menos 8 caracteres.");
      return;
    }
    setEnviando(true);
    try {
      await chamar("/api/superadmin/empresas", {
        method: "POST",
        body: JSON.stringify({
          nome,
          slug,
          modulos,
          adminNome,
          adminEmail,
          adminSenha,
        }),
      });
      toast.success(`Empresa "${nome}" criada.`);
      setCriado(true);
      onConcluido();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao criar empresa.");
    } finally {
      setEnviando(false);
    }
  }

  if (criado) return null;

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-xl border border-border bg-secondary/40 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Confirmar nova empresa</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da empresa" />
        <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug-da-empresa" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {modulos.map((m) => (
          <Badge key={m} variant="secondary" className="cursor-pointer" onClick={() => setModulos((prev) => prev.filter((x) => x !== m))}>
            {m} ✕
          </Badge>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Input value={adminNome} onChange={(e) => setAdminNome(e.target.value)} placeholder="Nome do administrador" />
        <Input value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="E-mail do administrador" type="email" />
        <Input value={adminSenha} onChange={(e) => setAdminSenha(e.target.value)} placeholder="Senha inicial" type="password" />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={criar} disabled={enviando}>
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Criar empresa
        </Button>
        <Button size="sm" variant="outline" onClick={onConcluido} disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

/**
 * Formulário inline mínimo: quando o Copiloto propõe criar um usuário
 * mas não conseguiu extrair um e-mail da instrução, pede só isso antes
 * de confirmar — sem reinterpretar a instrução do zero.
 */
function FormularioEmailUsuario({
  acao,
  actionId,
  indice,
  onConcluido,
}: {
  acao: AcaoAdmin;
  actionId?: string | null;
  indice: number;
  onConcluido: () => void;
}) {
  const [email, setEmail] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);

  async function confirmar() {
    if (!email.trim() || !email.includes("@")) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    if (!actionId) {
      toast.error("Proposta expirada — peça a ação de novo.");
      return;
    }
    setEnviando(true);
    try {
      // 1) Completa o campo que faltava NA PROPOSTA GUARDADA NO SERVIDOR
      //    (nunca reenviamos a lista de ações inteira).
      await chamar("/api/superadmin/copiloto/completar", {
        method: "POST",
        body: JSON.stringify({ actionId, indice, campos: { email } }),
      });
      // 2) Confirma normalmente, só com o actionId.
      const resultado = await chamar<RespostaCopiloto>("/api/superadmin/copiloto", {
        method: "POST",
        body: JSON.stringify({ confirmar: true, actionId }),
      });
      toast.success(resultado.resumo);
      onConcluido();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao criar usuário.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl border border-border bg-secondary/40 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Informe o e-mail de {String(acao.nome)}
      </p>
      <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@empresa.com.br" type="email" />
      <div className="flex gap-2">
        <Button size="sm" onClick={confirmar} disabled={enviando}>
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Criar acesso
        </Button>
        <Button size="sm" variant="outline" onClick={onConcluido} disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

interface HistoricoItem {
  id: string;
  superAdminNome: string;
  empresaNome: string | null;
  instrucaoOriginal: string;
  sucesso: boolean;
  desfeito: boolean;
  criadoEm: string;
}

function HistoricoCopiloto({ onFechar }: { onFechar: () => void }) {
  const [itens, setItens] = React.useState<HistoricoItem[] | null>(null);
  const [desfazendo, setDesfazendo] = React.useState<string | null>(null);

  const carregar = React.useCallback(async () => {
    try {
      const resp = await chamar<{ historico: HistoricoItem[] }>("/api/superadmin/copiloto/historico");
      setItens(resp.historico);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao carregar histórico.");
      setItens([]);
    }
  }, []);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  async function desfazer(id: string) {
    setDesfazendo(id);
    try {
      await chamar("/api/superadmin/copiloto/desfazer", { method: "POST", body: JSON.stringify({ historicoId: id }) });
      toast.success("Alteração desfeita.");
      carregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao desfazer.");
    } finally {
      setDesfazendo(null);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Histórico de alterações do Copiloto</p>
        <Button variant="ghost" size="sm" onClick={onFechar}>
          Voltar ao chat
        </Button>
      </div>
      {itens === null ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma alteração registrada ainda.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {itens.map((item) => (
            <Card key={item.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div>
                  <p className="text-sm font-medium text-foreground">&quot;{item.instrucaoOriginal}&quot;</p>
                  <p className="text-xs text-muted-foreground">
                    {item.empresaNome ? `${item.empresaNome} · ` : ""}
                    {new Date(item.criadoEm).toLocaleString("pt-BR")} · {item.superAdminNome}
                  </p>
                </div>
                {item.desfeito ? (
                  <Badge variant="outline">Desfeito</Badge>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => desfazer(item.id)} disabled={desfazendo === item.id}>
                    {desfazendo === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                    Desfazer
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

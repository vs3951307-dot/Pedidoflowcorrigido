"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bot, Building2, Plus, ShieldAlert, ShieldCheck, LogOut, Loader2, RefreshCw, Palette, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MODULOS, type Modulo } from "@/lib/modulos";
import { LandingEditor } from "@/app/superadmin/_components/landing-editor";
import { ConstrutorPlanos } from "@/app/superadmin/_components/construtor-planos";
import { CentralDeIa } from "@/app/superadmin/_components/central-ia";
import { UISettingsPanel } from "@/app/superadmin/_components/ui-settings";

interface EmpresaResumo {
  id: string;
  nome: string;
  slug: string;
  status: string;
  plano: string;
  planoCodigo: string;
  modulos: string[];
  trialFimEm: string | null;
  vencimentoEm: string | null;
  ultimaAtividadeEm: string | null;
  criadoEm: string;
  usuarios: number;
  pedidos: number;
}

interface DiagnosticoEmpresa {
  id: string;
  nome: string;
  status: string;
  online: boolean;
  ultimaAtividadeEm: string | null;
  pedidos24h: number;
  whatsappConfigurado: boolean;
  impressaoConfigurada: boolean;
  fiscalConfigurado: boolean;
  problemas: string[];
  saudavel: boolean;
}

async function chamar<T>(url: string, init?: RequestInit): Promise<T> {
  const resposta = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(corpo.erro ?? "Falha na requisição.");
  return corpo as T;
}

const ROTULO_STATUS: Record<string, string> = {
  ativa: "Ativa",
  bloqueada: "Bloqueada",
  suspensa: "Suspensa",
  teste: "Período de teste",
  excluida: "Excluída",
};

function BadgeStatus({ status }: { status: string }) {
  const variante: "free" | "waiting" | "bill" =
    status === "ativa" ? "free" : status === "teste" ? "waiting" : "bill";
  return <Badge variant={variante}>{ROTULO_STATUS[status] ?? status}</Badge>;
}

export function PainelSuperAdmin({ nomeSuperAdmin }: { nomeSuperAdmin: string }) {
  const router = useRouter();
  const [empresas, setEmpresas] = React.useState<EmpresaResumo[]>([]);
  const [diagnostico, setDiagnostico] = React.useState<DiagnosticoEmpresa[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [dialogAberto, setDialogAberto] = React.useState(false);

  const carregar = React.useCallback(async () => {
    setCarregando(true);
    try {
      const [respEmpresas, respSaude] = await Promise.all([
        chamar<{ empresas: EmpresaResumo[] }>("/api/superadmin/empresas"),
        chamar<{ empresas: DiagnosticoEmpresa[] }>("/api/superadmin/saude"),
      ]);
      setEmpresas(respEmpresas.empresas);
      setDiagnostico(respSaude.empresas);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao carregar dados.");
    } finally {
      setCarregando(false);
    }
  }, []);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  async function sair() {
    await fetch("/api/superadmin/auth/logout", { method: "POST" }).catch(() => null);
    router.push("/superadmin/login");
    router.refresh();
  }

  async function alterarStatus(id: string, status: string) {
    try {
      await chamar(`/api/superadmin/empresas/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      toast.success("Status atualizado.");
      carregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao atualizar.");
    }
  }

  async function alterarPlano(id: string, plano: "basico" | "profissional" | "completo") {
    try {
      await chamar(`/api/superadmin/empresas/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ plano }),
      });
      toast.success("Plano atualizado.");
      carregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao atualizar plano.");
    }
  }

  // PEDIDO 71: arquivar exige confirmação do nome + gera backup
  // automático — nunca passa pelo PATCH genérico de status (o backend
  // já recusa `status: "excluida"` ali, isto aqui é o caminho certo).
  const [arquivarAlvo, setArquivarAlvo] = React.useState<{ id: string; nome: string } | null>(null);
  const [confirmacaoNome, setConfirmacaoNome] = React.useState("");
  const [arquivando, setArquivando] = React.useState(false);

  async function confirmarArquivamento() {
    if (!arquivarAlvo) return;
    setArquivando(true);
    try {
      await chamar(`/api/superadmin/empresas/${arquivarAlvo.id}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmarNome: confirmacaoNome }),
      });
      toast.success(`"${arquivarAlvo.nome}" excluída — backup gerado antes, dados preservados.`);
      setArquivarAlvo(null);
      setConfirmacaoNome("");
      carregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao arquivar.");
    } finally {
      setArquivando(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-amber-400" />
          <div>
            <h1 className="text-xl font-semibold">PedidoFlow — Super Admin</h1>
            <p className="text-sm text-neutral-400">Olá, {nomeSuperAdmin}.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" size="sm" onClick={() => router.push("/superadmin/copiloto")}>
            <Bot className="mr-2 h-4 w-4" />
            Copiloto Supremo
          </Button>
          <Button variant="outline" size="sm" onClick={carregar} disabled={carregando}>
            <RefreshCw className={`mr-2 h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={sair}>
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </header>

      <Tabs defaultValue="empresas">
        <TabsList>
          <TabsTrigger value="empresas">Empresas ({empresas.length})</TabsTrigger>
          <TabsTrigger value="planos">Planos</TabsTrigger>
          <TabsTrigger value="saude">
            Saúde {diagnostico.some((d) => !d.saudavel) ? `(${diagnostico.filter((d) => !d.saudavel).length} com alerta)` : ""}
          </TabsTrigger>
          <TabsTrigger value="landing">Landing page</TabsTrigger>
          <TabsTrigger value="central-ia">Central de IA</TabsTrigger>
          <TabsTrigger value="aparencia">
            <Palette className="mr-1.5 h-3.5 w-3.5" />
            Aparência
          </TabsTrigger>
        </TabsList>

        <TabsContent value="empresas" className="mt-4">
          <div className="mb-4 flex justify-end">
            <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Nova empresa
                </Button>
              </DialogTrigger>
              <DialogContent>
                <FormularioNovaEmpresa
                  aoCriar={() => {
                    setDialogAberto(false);
                    carregar();
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-3">
            {empresas.map((empresa) => (
              <Card key={empresa.id} className="group cursor-pointer transition-colors hover:border-primary/50" onClick={() => router.push(`/superadmin/empresas/${empresa.id}`)}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{empresa.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        /{empresa.slug} · plano {empresa.plano} · {empresa.usuarios} usuário(s) · {empresa.pedidos} pedido(s)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <BadgeStatus status={empresa.status} />
                    <Select value={empresa.status} onValueChange={(v) => alterarStatus(empresa.id, v)}>
                      <SelectTrigger className="w-[180px]" onClick={(e) => e.stopPropagation()}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ativa">Ativar</SelectItem>
                        <SelectItem value="teste">Período de teste</SelectItem>
                        <SelectItem value="bloqueada">Bloquear</SelectItem>
                        <SelectItem value="suspensa">Suspender</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={empresa.planoCodigo} onValueChange={(v) => alterarPlano(empresa.id, v as "basico" | "profissional" | "completo")}>
                      <SelectTrigger className="w-[150px]" onClick={(e) => e.stopPropagation()}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="basico">Básico</SelectItem>
                        <SelectItem value="profissional">Profissional</SelectItem>
                        <SelectItem value="completo">Completo</SelectItem>
                      </SelectContent>
                    </Select>
                    {empresa.status !== "excluida" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={(e) => { e.stopPropagation(); setArquivarAlvo({ id: empresa.id, nome: empresa.nome }); }}
                      >
                        Excluir
                      </Button>
                    ) : (
                      <Badge variant="outline" className="border-destructive text-destructive">
                        Excluída
                      </Badge>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                </CardContent>
              </Card>
            ))}
            {empresas.length === 0 && !carregando && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma empresa cadastrada ainda. Clique em &quot;Nova empresa&quot; para começar.
              </p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="saude" className="mt-4">
          <div className="grid gap-3">
            {diagnostico.map((d) => (
              <Card key={d.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="flex items-center gap-3">
                    {d.saudavel ? (
                      <ShieldCheck className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <ShieldAlert className="h-5 w-5 text-red-500" />
                    )}
                    <div>
                      <p className="font-medium">{d.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.online ? "Online agora" : "Offline"} · {d.pedidos24h} pedido(s) nas últimas 24h ·{" "}
                        WhatsApp {d.whatsappConfigurado ? "configurado" : "não configurado"} · Impressão{" "}
                        {d.impressaoConfigurada ? "configurada" : "não configurada"} · Fiscal{" "}
                        {d.fiscalConfigurado ? "configurado" : "não configurado"}
                      </p>
                      {d.problemas.length > 0 && (
                        <ul className="mt-1 list-inside list-disc text-xs text-red-500">
                          {d.problemas.map((p) => (
                            <li key={p}>{p}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {diagnostico.length === 0 && !carregando && (
              <p className="py-8 text-center text-sm text-muted-foreground">Sem empresas para diagnosticar.</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="landing" className="mt-4">
          <LandingEditor />
        </TabsContent>

        <TabsContent value="planos" className="mt-4">
          <ConstrutorPlanos />
        </TabsContent>

        <TabsContent value="central-ia" className="mt-4">
          <CentralDeIa />
        </TabsContent>

        <TabsContent value="aparencia" className="mt-4">
          <UISettingsPanel />
        </TabsContent>
      </Tabs>

      <Dialog
        open={!!arquivarAlvo}
        onOpenChange={(aberto) => {
          if (!aberto) {
            setArquivarAlvo(null);
            setConfirmacaoNome("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir "{arquivarAlvo?.nome}"?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Um backup completo é gerado automaticamente antes de excluir. A empresa deixa de
            conseguir logar, mas nenhum dado é apagado — pode ser reativada depois.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirmar-nome">
              Digite <strong>{arquivarAlvo?.nome}</strong> para confirmar
            </Label>
            <Input id="confirmar-nome" value={confirmacaoNome} onChange={(e) => setConfirmacaoNome(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setArquivarAlvo(null)} disabled={arquivando}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={arquivando || confirmacaoNome !== arquivarAlvo?.nome}
              onClick={confirmarArquivamento}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function slugificar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function FormularioNovaEmpresa({ aoCriar }: { aoCriar: () => void }) {
  const [nome, setNome] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugManual, setSlugManual] = React.useState(false);
  const [plano, setPlano] = React.useState<"basico" | "profissional" | "completo">("basico");
  const [adminNome, setAdminNome] = React.useState("");
  const [adminEmail, setAdminEmail] = React.useState("");
  const [adminSenha, setAdminSenha] = React.useState("");
  const [trialDias, setTrialDias] = React.useState("14");
  const [modulos, setModulos] = React.useState<Modulo[]>(["pdv", "estoque", "relatorios", "impressao"]);
  const [enviando, setEnviando] = React.useState(false);

  // A partir do nome, geramos o identificador automaticamente — o super
  // admin não precisa "inventar" o slug (que só aceita minúsculas, números
  // e hífens). Se ele editar o slug à mão, paramos de sobrescrever.
  function handleNome(v: string) {
    setNome(v);
    if (!slugManual) setSlug(slugificar(v));
  }

  // Sanitiza a digitação manual do slug em tempo real, removendo qualquer
  // caractere que a validação (minúsculas/números/hífens) rejeitaria.
  function handleSlugManual(v: string) {
    setSlugManual(true);
    setSlug(slugificar(v) || v.toLowerCase().replace(/[^a-z0-9-]/g, ""));
  }

  function alternarModulo(m: Modulo) {
    setModulos((atual) => (atual.includes(m) ? atual.filter((x) => x !== m) : [...atual, m]));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      await chamar("/api/superadmin/empresas", {
        method: "POST",
        body: JSON.stringify({
          nome,
          slug: slugificar(slug) || slugificar(nome),
          plano,
          modulos,
          trialDias: Number(trialDias) || 0,
          adminNome,
          adminEmail,
          adminSenha,
        }),
      });
      toast.success("Empresa criada com sucesso.");
      aoCriar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao criar empresa.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Cadastrar nova empresa</DialogTitle>
      </DialogHeader>
      <form className="flex flex-col gap-4" onSubmit={enviar}>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Nome da empresa</Label>
            <Input value={nome} onChange={(e) => handleNome(e.target.value)} placeholder="Pastelaria do João" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Identificador (slug)</Label>
            <Input value={slug} onChange={(e) => handleSlugManual(e.target.value)} placeholder="pastelaria-do-joao" required />
            <p className="text-xs text-muted-foreground">
              Gerado automaticamente do nome — só minúsculas, números e hífens. Edite se quiser.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Plano</Label>
            <Select value={plano} onValueChange={(v) => setPlano(v as typeof plano)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="basico">Básico</SelectItem>
                <SelectItem value="profissional">Profissional</SelectItem>
                <SelectItem value="completo">Completo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Dias de teste grátis</Label>
            <Input type="number" min={0} value={trialDias} onChange={(e) => setTrialDias(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Módulos habilitados</Label>
          <div className="flex flex-wrap gap-2">
            {MODULOS.map((m) => (
              <button
                type="button"
                key={m}
                onClick={() => alternarModulo(m)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  modulos.includes(m) ? "border-primary-500 bg-primary-50 text-primary-700" : "border-border text-muted-foreground"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Nome do administrador</Label>
            <Input value={adminNome} onChange={(e) => setAdminNome(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>E-mail do administrador</Label>
            <Input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Senha inicial do administrador</Label>
          <Input type="password" value={adminSenha} onChange={(e) => setAdminSenha(e.target.value)} minLength={8} required />
        </div>

        <Button type="submit" disabled={enviando}>
          {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Criar empresa
        </Button>
      </form>
    </>
  );
}

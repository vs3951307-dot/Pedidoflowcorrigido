"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  Loader2,
  Save,
  Users,
  ShoppingCart,
  Calendar,
  CreditCard,
  Palette,
  Settings,
  Eye,
  EyeOff,
  Trash2,
  Plus,
  Pencil,
  UserPlus,
  Bot,
  MessageCircle,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MODULOS, type Modulo } from "@/lib/modulos";
import { formatBRL } from "@/lib/utils";

interface EmpresaDetalhe {
  id: string;
  nome: string;
  slug: string;
  razaoSocial: string | null;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  status: string;
  plano: string;
  planoId: string | null;
  planoNome: string | null;
  modulos: string[];
  tema: Record<string, string>;
  textos: Record<string, string>;
  menuConfig: { chave: string; rotulo: string; visivel: boolean; ordem?: number }[];
  trialFimEm: string | null;
  vencimentoEm: string | null;
  carenciaAte: string | null;
  ultimaAtividadeEm: string | null;
  observacoes: string | null;
  criadoEm: string;
  usuarios: { id: string; nome: string; email: string; papel: string; ativo: boolean; ultimoAcesso: string | null }[];
  totalPedidos: number;
  totalClientes: number;
  schemaBanco: string | null;
  bancoDedicado: boolean;
  databaseUrlMascarada: string | null;
  limiteMensagensIA: number | null;
  usoIAMesAtual: number;
}

interface Plano {
  id: string;
  nome: string;
  slug: string;
  ativo: boolean;
}

const ROTULO_STATUS: Record<string, string> = {
  ativa: "Ativa",
  bloqueada: "Bloqueada",
  suspensa: "Suspensa",
  teste: "Teste",
  excluida: "Excluída",
};

const ROTULO_PAPEL: Record<string, string> = {
  ADMINISTRADOR: "Admin",
  CAIXA: "Caixa",
  GARCOM: "Garçom",
  COZINHA: "Cozinha",
  ENTREGADOR: "Entregador",
};

const PAPEIS = ["ADMINISTRADOR", "CAIXA", "GARCOM", "COZINHA", "ENTREGADOR"];

const COR_SALVAR = "bg-emerald-600 hover:bg-emerald-700";

async function chamar<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  const c = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(c.erro ?? "Falha na requisição.");
  return c as T;
}

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtDataHora(iso: string | null): string {
  if (!iso) return "Nunca";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function DetalheEmpresa({ empresaId }: { empresaId: string }) {
  const router = useRouter();
  const [empresa, setEmpresa] = React.useState<EmpresaDetalhe | null>(null);
  const [planos, setPlanos] = React.useState<Plano[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [salvando, setSalvando] = React.useState(false);

  const carregar = React.useCallback(async () => {
    setCarregando(true);
    try {
      const [respEmp, respPlanos] = await Promise.all([
        chamar<{ empresa: EmpresaDetalhe }>(`/api/superadmin/empresas/${empresaId}`),
        chamar<{ planos: Plano[] }>("/api/superadmin/planos"),
      ]);
      setEmpresa(respEmp.empresa);
      setPlanos(respPlanos.planos);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao carregar.");
    } finally {
      setCarregando(false);
    }
  }, [empresaId]);

  React.useEffect(() => { carregar(); }, [carregar]);

  async function salvar(campos: Record<string, unknown>) {
    setSalvando(true);
    try {
      await chamar(`/api/superadmin/empresas/${empresaId}`, {
        method: "PATCH",
        body: JSON.stringify(campos),
      });
      toast.success("Salvo com sucesso.");
      carregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando || !empresa) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/superadmin")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Building2 className="h-6 w-6 text-amber-400" />
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{empresa.nome}</h1>
          <p className="text-sm text-muted-foreground">/{empresa.slug}</p>
        </div>
        <Badge variant={empresa.status === "ativa" ? "free" : empresa.status === "teste" ? "waiting" : "bill"}>
          {ROTULO_STATUS[empresa.status] ?? empresa.status}
        </Badge>
      </header>

      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados"><Settings className="mr-1 h-3.5 w-3.5" /> Dados</TabsTrigger>
          <TabsTrigger value="modulos"><CreditCard className="mr-1 h-3.5 w-3.5" /> Plano e Módulos</TabsTrigger>
          <TabsTrigger value="tema"><Palette className="mr-1 h-3.5 w-3.5" /> Tema</TabsTrigger>
          <TabsTrigger value="whatsapp-ia"><MessageCircle className="mr-1 h-3.5 w-3.5" /> WhatsApp IA</TabsTrigger>
          <TabsTrigger value="copiloto-ia"><Bot className="mr-1 h-3.5 w-3.5" /> Copiloto IA</TabsTrigger>
          <TabsTrigger value="usuarios"><Users className="mr-1 h-3.5 w-3.5" /> Usuários ({empresa.usuarios.length})</TabsTrigger>
          <TabsTrigger value="stats"><ShoppingCart className="mr-1 h-3.5 w-3.5" /> Estatísticas</TabsTrigger>
        </TabsList>

        <TabsContent value="dados" className="mt-4">
          <DadosEmpresa empresa={empresa} salvando={salvando} onSalvar={salvar} />
        </TabsContent>

        <TabsContent value="modulos" className="mt-4">
          <PlanoModulos empresa={empresa} planos={planos} salvando={salvando} onSalvar={salvar} />
        </TabsContent>

        <TabsContent value="tema" className="mt-4">
          <TemaEmpresa empresa={empresa} salvando={salvando} onSalvar={salvar} />
        </TabsContent>

        <TabsContent value="whatsapp-ia" className="mt-4">
          <PersonaEditor empresaId={empresa.id} tipo="atendente" empresaNome={empresa.nome} />
        </TabsContent>

        <TabsContent value="copiloto-ia" className="mt-4">
          <PersonaEditor empresaId={empresa.id} tipo="copiloto" empresaNome={empresa.nome} />
        </TabsContent>

        <TabsContent value="usuarios" className="mt-4">
          <UsuariosEmpresa empresa={empresa} onRecarregar={carregar} />
        </TabsContent>

        <TabsContent value="stats" className="mt-4">
          <EstatsEmpresa empresa={empresa} empresaId={empresa.id} onRecarregar={carregar} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SecaoCard({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function DadosEmpresa({ empresa, salvando, onSalvar }: { empresa: EmpresaDetalhe; salvando: boolean; onSalvar: (c: Record<string, unknown>) => void }) {
  const [nome, setNome] = React.useState(empresa.nome);
  const [slug, setSlug] = React.useState(empresa.slug);
  const [razao, setRazao] = React.useState(empresa.razaoSocial ?? "");
  const [cnpj, setCnpj] = React.useState(empresa.cnpj ?? "");
  const [telefone, setTelefone] = React.useState(empresa.telefone ?? "");
  const [email, setEmail] = React.useState(empresa.email ?? "");
  const [status, setStatus] = React.useState(empresa.status);
  const [obs, setObs] = React.useState(empresa.observacoes ?? "");
  const [trialFim, setTrialFim] = React.useState(empresa.trialFimEm ? empresa.trialFimEm.slice(0, 10) : "");
  const [vencimento, setVencimento] = React.useState(empresa.vencimentoEm ? empresa.vencimentoEm.slice(0, 10) : "");

  const alterado = nome !== empresa.nome || slug !== empresa.slug || razao !== (empresa.razaoSocial ?? "") ||
    cnpj !== (empresa.cnpj ?? "") || telefone !== (empresa.telefone ?? "") || email !== (empresa.email ?? "") ||
    status !== empresa.status || obs !== (empresa.observacoes ?? "") ||
    trialFim !== (empresa.trialFimEm ? empresa.trialFimEm.slice(0, 10) : "") ||
    vencimento !== (empresa.vencimentoEm ? empresa.vencimentoEm.slice(0, 10) : "");

  function salvarDados() {
    const dados: Record<string, unknown> = {};
    if (nome !== empresa.nome) dados.nome = nome;
    if (slug !== empresa.slug) dados.slug = slug;
    if (razao !== (empresa.razaoSocial ?? "")) dados.razaoSocial = razao || null;
    if (cnpj !== (empresa.cnpj ?? "")) dados.cnpj = cnpj || null;
    if (telefone !== (empresa.telefone ?? "")) dados.telefone = telefone || null;
    if (email !== (empresa.email ?? "")) dados.email = email || null;
    if (status !== empresa.status) dados.status = status;
    if (obs !== (empresa.observacoes ?? "")) dados.observacoes = obs || null;
    if (trialFim !== (empresa.trialFimEm ? empresa.trialFimEm.slice(0, 10) : "")) dados.trialFimEm = trialFim || null;
    if (vencimento !== (empresa.vencimentoEm ? empresa.vencimentoEm.slice(0, 10) : "")) dados.vencimentoEm = vencimento || null;
    onSalvar(dados);
  }

  return (
    <div className="flex flex-col gap-4">
      <SecaoCard titulo="Dados Cadastrais">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nome da empresa">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </Field>
          <Field label="Slug (identificador)">
            <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
          </Field>
          <Field label="Razão Social">
            <Input value={razao} onChange={(e) => setRazao(e.target.value)} placeholder="Opcional" />
          </Field>
          <Field label="CNPJ">
            <Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
          </Field>
          <Field label="Telefone">
            <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(00) 00000-0000" />
          </Field>
          <Field label="E-mail">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contato@empresa.com" />
          </Field>
        </div>
      </SecaoCard>

      <SecaoCard titulo="Status e Vigência">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Status">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ativa">Ativa</SelectItem>
                <SelectItem value="teste">Teste</SelectItem>
                <SelectItem value="bloqueada">Bloqueada</SelectItem>
                <SelectItem value="suspensa">Suspensa</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Fim do Trial">
            <Input type="date" value={trialFim} onChange={(e) => setTrialFim(e.target.value)} />
          </Field>
          <Field label="Vencimento">
            <Input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
          </Field>
        </div>
      </SecaoCard>

      <SecaoCard titulo="Observações">
        <Textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Notas internas sobre esta empresa..." rows={3} />
      </SecaoCard>

      {alterado && (
        <div className="flex justify-end">
          <Button onClick={salvarDados} disabled={salvando} className={COR_SALVAR}>
            {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar alterações
          </Button>
        </div>
      )}
    </div>
  );
}

function PlanoModulos({ empresa, planos, salvando, onSalvar }: { empresa: EmpresaDetalhe; planos: Plano[]; salvando: boolean; onSalvar: (c: Record<string, unknown>) => void }) {
  const [modulos, setModulos] = React.useState<string[]>(empresa.modulos);
  const [planoId, setPlanoId] = React.useState(empresa.planoId ?? "_nenhum");

  const alterado = JSON.stringify(modulos.sort()) !== JSON.stringify(empresa.modulos.sort()) || planoId !== (empresa.planoId ?? "_nenhum");

  function alternarModulo(m: string) {
    setModulos((atual) => atual.includes(m) ? atual.filter((x) => x !== m) : [...atual, m]);
  }

  function salvarModulos() {
    onSalvar({
      modulos,
      planoId: planoId === "_nenhum" ? null : planoId,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <SecaoCard titulo="Plano">
        <Field label="Plano contratado">
          <Select value={planoId} onValueChange={setPlanoId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_nenhum">Nenhum</SelectItem>
              {planos.filter((p) => p.ativo).map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </SecaoCard>

      <SecaoCard titulo="Módulos Habilitados">
        <div className="flex flex-wrap gap-2">
          {MODULOS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => alternarModulo(m)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                modulos.includes(m)
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  : "border-border text-muted-foreground hover:border-muted-foreground"
              }`}
            >
              {modulos.includes(m) ? <Eye className="mr-1 inline h-3 w-3" /> : <EyeOff className="mr-1 inline h-3 w-3" />}
              {m}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Clique para ativar/desativar. Módulos desativados bloqueiam o menu e a API correspondente.
        </p>
      </SecaoCard>

      {alterado && (
        <div className="flex justify-end">
          <Button onClick={salvarModulos} disabled={salvando} className={COR_SALVAR}>
            {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar módulos
          </Button>
        </div>
      )}
    </div>
  );
}

function TemaEmpresa({ empresa, salvando, onSalvar }: { empresa: EmpresaDetalhe; salvando: boolean; onSalvar: (c: Record<string, unknown>) => void }) {
  const [corPrimaria, setCorPrimaria] = React.useState(empresa.tema.corPrimaria ?? "");
  const [corSecundaria, setCorSecundaria] = React.useState(empresa.tema.corSecundaria ?? "");
  const [nomeExibicao, setNomeExibicao] = React.useState(empresa.tema.nomeExibicao ?? "");
  const [logoUrl, setLogoUrl] = React.useState(empresa.tema.logoUrl ?? "");
  const [mensagemSplash, setMensagemSplash] = React.useState(empresa.textos.mensagemSplash ?? "");

  const alterado = corPrimaria !== (empresa.tema.corPrimaria ?? "") ||
    corSecundaria !== (empresa.tema.corSecundaria ?? "") ||
    nomeExibicao !== (empresa.tema.nomeExibicao ?? "") ||
    logoUrl !== (empresa.tema.logoUrl ?? "") ||
    mensagemSplash !== (empresa.textos.mensagemSplash ?? "");

  function salvarTema() {
    const dados: Record<string, unknown> = {};
    const tema: Record<string, string> = {};
    if (corPrimaria !== (empresa.tema.corPrimaria ?? "")) tema.corPrimaria = corPrimaria;
    if (corSecundaria !== (empresa.tema.corSecundaria ?? "")) tema.corSecundaria = corSecundaria;
    if (nomeExibicao !== (empresa.tema.nomeExibicao ?? "")) tema.nomeExibicao = nomeExibicao;
    if (logoUrl !== (empresa.tema.logoUrl ?? "")) tema.logoUrl = logoUrl;
    if (Object.keys(tema).length > 0) dados.tema = tema;
    if (mensagemSplash !== (empresa.textos.mensagemSplash ?? "")) {
      dados.textos = { ...empresa.textos, mensagemSplash };
    }
    onSalvar(dados);
  }

  return (
    <div className="flex flex-col gap-4">
      <SecaoCard titulo="Identidade Visual">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nome de exibição">
            <Input value={nomeExibicao} onChange={(e) => setNomeExibicao(e.target.value)} placeholder={empresa.nome} />
          </Field>
          <Field label="URL do Logo">
            <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." />
          </Field>
          <Field label="Cor Primária">
            <div className="flex items-center gap-2">
              <input type="color" value={corPrimaria || "#f97316"} onChange={(e) => setCorPrimaria(e.target.value)} className="h-10 w-10 cursor-pointer rounded border" />
              <Input value={corPrimaria} onChange={(e) => setCorPrimaria(e.target.value)} placeholder="#f97316" />
            </div>
          </Field>
          <Field label="Cor Secundária">
            <div className="flex items-center gap-2">
              <input type="color" value={corSecundaria || "#fb923c"} onChange={(e) => setCorSecundaria(e.target.value)} className="h-10 w-10 cursor-pointer rounded border" />
              <Input value={corSecundaria} onChange={(e) => setCorSecundaria(e.target.value)} placeholder="#fb923c" />
            </div>
          </Field>
        </div>
        {logoUrl && (
          <div className="mt-3 flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Preview:</span>
            <img src={logoUrl} alt="Logo" className="h-12 w-12 rounded object-cover" />
          </div>
        )}
        <div className="mt-3 flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Preview cores:</span>
          <div className="h-8 w-24 rounded" style={{ backgroundColor: corPrimaria || "#f97316" }} />
          <div className="h-8 w-24 rounded" style={{ backgroundColor: corSecundaria || "#fb923c" }} />
        </div>
      </SecaoCard>

      <SecaoCard titulo="Mensagem de Splash Screen">
        <Input value={mensagemSplash} onChange={(e) => setMensagemSplash(e.target.value)} placeholder="Mensagem exibida na tela de abertura..." />
        <p className="mt-1 text-xs text-muted-foreground">Texto exibido abaixo do logo na tela de carregamento.</p>
      </SecaoCard>

      {alterado && (
        <div className="flex justify-end">
          <Button onClick={salvarTema} disabled={salvando} className={COR_SALVAR}>
            {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar tema
          </Button>
        </div>
      )}
    </div>
  );
}

function UsuariosEmpresa({ empresa, onRecarregar }: { empresa: EmpresaDetalhe; onRecarregar: () => void }) {
  const [dialogUsuario, setDialogUsuario] = React.useState(false);
  const [editando, setEditando] = React.useState<{ id: string; nome: string; email: string; papel: string } | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{empresa.usuarios.length} usuário(s) cadastrado(s)</p>
        <Button size="sm" onClick={() => { setEditando(null); setDialogUsuario(true); }}>
          <UserPlus className="mr-1 h-4 w-4" /> Novo usuário
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {empresa.usuarios.map((u) => (
              <div key={u.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold">
                    {u.nome.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{u.nome}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={u.papel === "ADMINISTRADOR" ? "free" : "outline"}>
                    {ROTULO_PAPEL[u.papel] ?? u.papel}
                  </Badge>
                  <span className={`h-2 w-2 rounded-full ${u.ativo ? "bg-emerald-500" : "bg-red-500"}`} title={u.ativo ? "Ativo" : "Inativo"} />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setEditando(u); setDialogUsuario(true); }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {empresa.usuarios.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhum usuário cadastrado.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <DialogUsuario
        open={dialogUsuario}
        onOpenChange={setDialogUsuario}
        editando={editando}
        empresaId={empresa.id}
        onSalvo={() => { setDialogUsuario(false); onRecarregar(); }}
      />
    </div>
  );
}

function DialogUsuario({ open, onOpenChange, editando, empresaId, onSalvo }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editando: { id: string; nome: string; email: string; papel: string } | null;
  empresaId: string;
  onSalvo: () => void;
}) {
  const [nome, setNome] = React.useState(editando?.nome ?? "");
  const [email, setEmail] = React.useState(editando?.email ?? "");
  const [senha, setSenha] = React.useState("");
  const [papel, setPapel] = React.useState(editando?.papel ?? "CAIXA");
  const [enviando, setEnviando] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setNome(editando?.nome ?? "");
      setEmail(editando?.email ?? "");
      setSenha("");
      setPapel(editando?.papel ?? "CAIXA");
    }
  }, [open, editando]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      if (editando) {
        await chamar(`/api/superadmin/empresas/${empresaId}/usuarios`, {
          method: "PATCH",
          body: JSON.stringify({ usuarioId: editando.id, nome, email, papel }),
        });
        toast.success("Usuário atualizado.");
      } else {
        await chamar(`/api/superadmin/empresas/${empresaId}/usuarios`, {
          method: "POST",
          body: JSON.stringify({ nome, email, senha, papel }),
        });
        toast.success("Usuário criado.");
      }
      onSalvo();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao salvar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editando ? "Editar usuário" : "Novo usuário"}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={enviar}>
          <Field label="Nome">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} required />
          </Field>
          <Field label="E-mail">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          {!editando && (
            <Field label="Senha">
              <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} minLength={8} required />
            </Field>
          )}
          <Field label="Papel">
            <Select value={papel} onValueChange={setPapel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAPEIS.map((p) => (
                  <SelectItem key={p} value={p}>{ROTULO_PAPEL[p] ?? p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={enviando}>
              {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editando ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EstatsEmpresa({ empresa, empresaId, onRecarregar }: { empresa: EmpresaDetalhe; empresaId: string; onRecarregar: () => void }) {
  const [pagamentoAberto, setPagamentoAberto] = React.useState(false);
  const [enviandoPagamento, setEnviandoPagamento] = React.useState(false);

  // Estado efetivo de assinatura (carência derivada do calendário, não do
  // status em string) — espelha a lógica de `src/lib/assinatura.ts`.
  const agora = Date.now();
  const venc = empresa.vencimentoEm ? new Date(empresa.vencimentoEm + "T23:59:59.000Z").getTime() : null;
  const carencia = empresa.carenciaAte ? new Date(empresa.carenciaAte + "T23:59:59.000Z").getTime() : null;
  let estadoAssinatura: { rotulo: string; cor: "free" | "waiting" | "bill"; detalhe: string } | null = null;
  if (venc === null) {
    estadoAssinatura = null; // sem vencimento cadastrado
  } else if (venc > agora) {
    estadoAssinatura = { rotulo: "Em dia", cor: "free", detalhe: "Assinatura vigente." };
  } else {
    const fimCarencia = carencia ?? venc + 7 * 24 * 60 * 60 * 1000;
    if (fimCarencia >= agora) {
      const dias = Math.max(0, Math.ceil((fimCarencia - agora) / (24 * 60 * 60 * 1000)));
      estadoAssinatura = { rotulo: "EM CARÊNCIA", cor: "waiting", detalhe: `Vencido — ${dias} dia(s) para regularizar antes da suspensão automática.` };
    } else {
      estadoAssinatura = { rotulo: "VENCIDA", cor: "bill", detalhe: "Carência esgotada — uso normal bloqueado até regularizar." };
    }
  }

  async function registrarPagamento(formulario: { valor: string; forma: string; cicloDias: string; observacoes: string }) {
    if (!Number(formulario.valor) || Number(formulario.valor) <= 0) {
      toast.error("Informe um valor válido.");
      return;
    }
    setEnviandoPagamento(true);
    try {
      await chamar(`/api/superadmin/empresas/${empresaId}/pagamento-assinatura`, {
        method: "POST",
        body: JSON.stringify({
          valor: Number(formulario.valor),
          forma: formulario.forma,
          cicloDias: Number(formulario.cicloDias) || 30,
          observacoes: formulario.observacoes || undefined,
          idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        }),
      });
      toast.success("Pagamento registrado — assinatura reativada.");
      setPagamentoAberto(false);
      onRecarregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao registrar pagamento.");
    } finally {
      setEnviandoPagamento(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <SecaoCard titulo="Pedidos">
        <p className="text-3xl font-bold">{empresa.totalPedidos.toLocaleString("pt-BR")}</p>
        <p className="text-xs text-muted-foreground">total de pedidos registrados</p>
      </SecaoCard>
      <SecaoCard titulo="Clientes">
        <p className="text-3xl font-bold">{empresa.totalClientes.toLocaleString("pt-BR")}</p>
        <p className="text-xs text-muted-foreground">clientes cadastrados</p>
      </SecaoCard>
      <SecaoCard titulo="Usuários">
        <p className="text-3xl font-bold">{empresa.usuarios.length}</p>
        <p className="text-xs text-muted-foreground">{empresa.usuarios.filter((u) => u.ativo).length} ativos</p>
      </SecaoCard>
      <SecaoCard titulo="Criada em">
        <p className="text-lg font-semibold">{fmtData(empresa.criadoEm)}</p>
      </SecaoCard>
      <SecaoCard titulo="Última Atividade">
        <p className="text-lg font-semibold">{fmtDataHora(empresa.ultimaAtividadeEm)}</p>
      </SecaoCard>
      <SecaoCard titulo="Banco de Dados">
        <p className="text-sm font-medium">{empresa.bancoDedicado ? "Dedicado" : "Compartilhado (schema)"}</p>
        <p className="text-xs text-muted-foreground">{empresa.schemaBanco ?? "public"}</p>
        {empresa.databaseUrlMascarada && (
          <p className="mt-1 text-xs text-muted-foreground font-mono">{empresa.databaseUrlMascarada}</p>
        )}
      </SecaoCard>
      <SecaoCard titulo="Uso de IA">
        <p className="text-lg font-semibold">{empresa.usoIAMesAtual} / {empresa.limiteMensagensIA ?? "∞"}</p>
        <p className="text-xs text-muted-foreground">mensagens este mês</p>
      </SecaoCard>
      <SecaoCard titulo="Assinatura">
        {estadoAssinatura ? (
          <div className="mb-2 flex items-center gap-2">
            <Badge variant={estadoAssinatura.cor}>{estadoAssinatura.rotulo}</Badge>
            <span className="text-xs text-muted-foreground">{estadoAssinatura.detalhe}</span>
          </div>
        ) : (
          <p className="mb-2 text-xs text-muted-foreground">Sem vencimento cadastrado.</p>
        )}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Vencimento:</span>
            <span>{fmtData(empresa.vencimentoEm)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Fim da carência:</span>
            <span>{fmtData(empresa.carenciaAte)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Trial:</span>
            <span>{fmtData(empresa.trialFimEm)}</span>
          </div>
        </div>
        <Button size="sm" className="mt-3 w-full" onClick={() => setPagamentoAberto(true)} disabled={enviandoPagamento}>
          <CreditCard className="mr-2 h-4 w-4" />
          Registrar pagamento da assinatura
        </Button>
      </SecaoCard>

      <Dialog open={pagamentoAberto} onOpenChange={setPagamentoAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar pagamento da assinatura</DialogTitle>
          </DialogHeader>
          <PagamentoAssinaturaForm onConfirmar={registrarPagamento} enviando={enviandoPagamento} vencimentoAtual={empresa.vencimentoEm} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PagamentoAssinaturaForm({ onConfirmar, enviando, vencimentoAtual }: { onConfirmar: (f: { valor: string; forma: string; cicloDias: string; observacoes: string }) => void; enviando: boolean; vencimentoAtual: string | null }) {
  const [valor, setValor] = React.useState("");
  const [forma, setForma] = React.useState("pix");
  const [cicloDias, setCicloDias] = React.useState("30");
  const [observacoes, setObservacoes] = React.useState("");
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onConfirmar({ valor, forma, cicloDias, observacoes });
      }}
    >
      {vencimentoAtual && (
        <p className="text-xs text-muted-foreground">
          Vencimento atual: {fmtData(vencimentoAtual)}. Após o pagamento, o ciclo reinicia para hoje + ciclo.
        </p>
      )}
      <Field label="Valor (R$)">
        <Input type="number" step="0.01" min="0" value={valor} onChange={(e) => setValor(e.target.value)} required />
      </Field>
      <Field label="Forma de pagamento">
        <Select value={forma} onValueChange={setForma}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pix">Pix</SelectItem>
            <SelectItem value="dinheiro">Dinheiro</SelectItem>
            <SelectItem value="cartao">Cartão</SelectItem>
            <SelectItem value="boleto">Boleto</SelectItem>
            <SelectItem value="manual">Manual/outro</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Ciclo contratado (dias)">
        <Select value={cicloDias} onValueChange={setCicloDias}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="30">30 dias (mensal)</SelectItem>
            <SelectItem value="90">90 dias (trimestral)</SelectItem>
            <SelectItem value="180">180 dias</SelectItem>
            <SelectItem value="365">365 dias (anual)</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Observações (opcional)">
        <Input value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Ex.: pagamento confirmado no PIX" />
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={enviando}>
          {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
          Confirmar pagamento
        </Button>
      </DialogFooter>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

const TOMS = {
  simpatico: "Simpático",
  profissional: "Profissional",
  descontraido: "Descontraído",
  formal: "Formal",
} as const;

type TomIA = keyof typeof TOMS;

interface PersonaData {
  nome?: string;
  tom?: string;
  regras?: string;
  horario?: string;
  apresentacao?: string;
}

function previewSaudacaoAtendente(p: PersonaData): string {
  const nome = (p.nome ?? "").trim();
  const apresentacao = nome ? `Aqui é a ${nome}.` : null;
  switch (p.tom) {
    case "formal":
      return `Olá! ${apresentacao ?? "Bem-vindo(a) à nossa pizzaria."} Em que posso ajudar?`;
    case "profissional":
      return `Olá! ${apresentacao ?? "Somos a nossa pizzaria."} Como posso ajudar?`;
    case "descontraido":
      return `Olá! 👋 ${apresentacao ?? "Bora pedir algo?"}`;
    default:
      return `Olá! 😊 ${apresentacao ?? "O que você deseja?"}`;
  }
}

function previewSaudacaoCopiloto(p: PersonaData, empresaNome: string): string {
  const nome = (p.nome ?? "").trim();
  const apelido = nome || "Copiloto";
  switch (p.tom) {
    case "formal":
      return `Bom dia. Sou o ${apelido} da ${empresaNome}. Como posso ajudar?`;
    case "profissional":
      return `Olá! Sou o ${apelido} da ${empresaNome}. Pergunte sobre vendas, pedidos, estoque ou operação.`;
    case "descontraido":
      return `E aí! 👋 Sou o ${apelido} da ${empresaNome}. Manda a dúvida que eu resolvo!`;
    default:
      return `Olá! 😊 Sou o ${apelido} da ${empresaNome}. Pergunte sobre vendas, pedidos, estoque, caixa e entregas.`;
  }
}

function PersonaEditor({ empresaId, tipo, empresaNome }: { empresaId: string; tipo: "atendente" | "copiloto"; empresaNome: string }) {
  const [persona, setPersona] = React.useState<PersonaData>({});
  const [carregou, setCarregou] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);

  React.useEffect(() => {
    if (carregou) return;
    chamar<{ persona: PersonaData }>(`/api/superadmin/empresas/${empresaId}/persona?tipo=${tipo}`)
      .then((r) => { setPersona(r.persona); setCarregou(true); })
      .catch(() => setCarregou(true));
  }, [empresaId, tipo, carregou]);

  const isAtendente = tipo === "atendente";
  const titulo = isAtendente ? "Atendente WhatsApp IA" : "Copiloto da Empresa";
  const descricao = isAtendente
    ? "Quem atende os clientes no WhatsApp — nome, tom de voz, regras e horário."
    : "O assistente IA que o dono/admin conversa dentro do painel — nome, tom e apresentação.";

  function atualizar<K extends keyof PersonaData>(chave: K, valor: PersonaData[K]) {
    setPersona((p) => ({ ...p, [chave]: valor }));
  }

  async function salvar() {
    setSalvando(true);
    try {
      await chamar(`/api/superadmin/empresas/${empresaId}/persona`, {
        method: "PUT",
        body: JSON.stringify({ tipo, ...persona }),
      });
      toast.success(`${titulo} salvo.`);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  if (!carregou) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SecaoCard titulo={titulo}>
        <p className="mb-3 text-sm text-muted-foreground">{descricao}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={isAtendente ? "Nome da atendente" : "Nome do copiloto"}>
            <Input
              value={persona.nome ?? ""}
              onChange={(e) => atualizar("nome", e.target.value)}
              placeholder={isAtendente ? "Ex.: Ana, Atendente Rozeno" : "Ex.: Copiloto Rozeno"}
              maxLength={80}
            />
          </Field>
          <Field label="Tom de voz">
            <Select value={persona.tom ?? "simpatico"} onValueChange={(v) => atualizar("tom", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TOMS).map(([valor, rotulo]) => (
                  <SelectItem key={valor} value={valor}>{rotulo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        {isAtendente && (
          <div className="mt-3 grid grid-cols-1 gap-3">
            <Field label="Horário de funcionamento">
              <Input
                value={persona.horario ?? ""}
                onChange={(e) => atualizar("horario", e.target.value)}
                placeholder="Ex.: todos os dias, das 18h às 23h"
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground">Vazio = usa o horário cadastrado na config da empresa.</p>
            </Field>
          </div>
        )}
      </SecaoCard>

      {isAtendente ? (
        <SecaoCard titulo="Regras de Negócio">
          <Textarea
            value={persona.regras ?? ""}
            onChange={(e) => atualizar("regras", e.target.value)}
            placeholder={"Ex.:\n- Pedido mínimo R$ 20\n- Não entregamos em bairro X\n- Aceitamos Pix, cartão e dinheiro\n- Trocas só em até 30 min"}
            maxLength={4000}
            className="min-h-32"
          />
          <p className="mt-1 text-xs text-muted-foreground">Uma regra por linha. A atendente usa isso para responder perguntas do cliente.</p>
        </SecaoCard>
      ) : (
        <SecaoCard titulo="Apresentação Personalizada">
          <Textarea
            value={persona.apresentacao ?? ""}
            onChange={(e) => atualizar("apresentacao", e.target.value)}
            placeholder={`Olá, {usuario}! Sou o Copiloto da {empresa}. Pergunte sobre vendas, pedidos, estoque — ou dê comandos do dia a dia, que eu proponho e você confirma.`}
            maxLength={1000}
            className="min-h-24"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Use {"{usuario}"} para o nome do usuário, {"{empresa}"} para o nome da empresa, {"{copiloto}"} para o nome do copiloto. Vazio = saudação padrão.
          </p>
          <div className="mt-3">
            <Field label="Regras de comportamento">
              <Textarea
                value={persona.regras ?? ""}
                onChange={(e) => atualizar("regras", e.target.value)}
                placeholder="Ex.:\n- Sempre seja direto e responda em no máximo 3 linhas\n- Nunca invente dados, sempre cite a fonte\n- Se não souber, diga que vai verificar"
                maxLength={4000}
                className="min-h-24"
              />
            </Field>
          </div>
        </SecaoCard>
      )}

      <div className="rounded-2xl border bg-muted/40 p-4">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          Prévia da saudação
        </p>
        <div className="rounded-xl bg-card p-4 text-sm text-foreground">
          <p className="italic">
            &quot;{isAtendente
              ? previewSaudacaoAtendente(persona)
              : previewSaudacaoCopiloto(persona, empresaNome)}&quot;
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={salvar} disabled={salvando} className={COR_SALVAR}>
          {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar {isAtendente ? "atendente" : "copiloto"}
        </Button>
      </div>
    </div>
  );
}

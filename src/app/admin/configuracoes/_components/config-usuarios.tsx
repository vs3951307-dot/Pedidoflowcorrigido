"use client";

import * as React from "react";
import { toast } from "sonner";
import { KeyRound, Pencil, UserPlus, Users, X } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { api, useApi } from "@/lib/api-cliente";
import { PAPEIS, ROTULOS_PAPEL, RECURSOS, recursosDoPapel } from "@/lib/permissao";

type Papel = (typeof PAPEIS)[number];

interface UsuarioApi {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
  ultimoAcesso: string | null;
  permissaos: { recurso: string; permitido: boolean }[];
}

const PAPEL_CONFIG: Record<Papel, { label: string; classes: string }> = {
  ADMINISTRADOR: {
    label: "Administrador",
    classes: "bg-status-free-bg text-status-free border-status-free-border",
  },
  CAIXA: {
    label: "Caixa",
    classes: "bg-status-sent-bg text-status-sent border-status-sent-border",
  },
  GARCOM: {
    label: "Garçom",
    classes: "bg-status-waiting-bg text-status-waiting border-status-waiting-border",
  },
  COZINHA: {
    label: "Cozinha",
    classes: "bg-status-bill-bg text-status-bill border-status-bill-border",
  },
  ENTREGADOR: {
    label: "Entregador",
    classes: "bg-status-occupied-bg text-status-occupied border-status-occupied-border",
  },
};

const RECURSO_ROTULO: Record<string, string> = {
  pdv: "PDV — vendas",
  salao: "Salão e mesas",
  retirada: "Pedidos de retirada",
  pagamentos: "Receber pagamentos",
  caixa: "Caixa",
  catalogo: "Consultar cardápio",
  catalogo_editar: "Editar cardápio",
  clientes: "Clientes",
  kds: "Cozinha (produção)",
  entregas: "Entregas",
  pagamentos_entrega: "Pagamento na entrega",
  admin: "Dashboard e relatórios",
  estoque: "Estoque",
  notas_fiscais: "Notas fiscais",
  configuracoes: "Configurações",
  usuarios: "Usuários e permissões",
  auditoria: "Auditoria",
  backups: "Backups",
};

const iniciais = (nome: string) =>
  nome
    .split(" ")
    .map((parte) => parte.charAt(0))
    .slice(0, 2)
    .join("");

function formatarUltimoAcesso(valor: string | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  if (!Number.isNaN(data.getTime())) {
    const dia = data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const hora = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return `${dia} · ${hora}`;
  }
  return valor;
}

interface FormUsuario {
  nome: string;
  email: string;
  senha: string;
  papel: Papel;
}

/**
 * Usuários (PEDIDO 14): cria/edita usuários, define papel, ativa e
 * desativa (revoga sessões), redefine senha e configura permissões por
 * usuário (overrides sobre o padrão do papel). Tudo persistido na API.
 */
export function ConfigUsuarios() {
  const { dados, recarregar } = useApi<{ usuarios: UsuarioApi[] }>("/api/usuarios", {
    usuarios: [],
  });

  const [dialogAberto, setDialogAberto] = React.useState(false);
  const [editandoId, setEditandoId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<FormUsuario>({
    nome: "",
    email: "",
    senha: "",
    papel: "CAIXA",
  });
  const [salvando, setSalvando] = React.useState(false);
  const [painelPermissoes, setPainelPermissoes] = React.useState<string | null>(null);
  const [definindoSenha, setDefinindoSenha] = React.useState<UsuarioApi | null>(null);
  const [novaSenha, setNovaSenha] = React.useState("");

  const usuarios = dados.usuarios;
  const ativos = usuarios.filter((u) => u.ativo).length;

  function abrirNovo() {
    setEditandoId(null);
    setForm({ nome: "", email: "", senha: "", papel: "CAIXA" });
    setDialogAberto(true);
  }

  function abrirEdicao(usuario: UsuarioApi) {
    setEditandoId(usuario.id);
    setForm({ nome: usuario.nome, email: usuario.email, senha: "", papel: usuario.papel });
    setDialogAberto(true);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim() || !/^\S+@\S+\.\S+$/.test(form.email)) {
      toast.error("Informe nome e e-mail válidos.");
      return;
    }
    setSalvando(true);
    try {
      if (editandoId) {
        await api(`/api/usuarios/${editandoId}`, {
          method: "PATCH",
          body: JSON.stringify({ nome: form.nome, email: form.email, papel: form.papel }),
        });
        toast.success("Usuário atualizado.");
      } else {
        await api("/api/usuarios", {
          method: "POST",
          body: JSON.stringify(form),
        });
        toast.success("Usuário criado.");
      }
      setDialogAberto(false);
      recarregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar o usuário.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(usuario: UsuarioApi) {
    try {
      await api(`/api/usuarios/${usuario.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ativo: !usuario.ativo }),
      });
      toast.success(usuario.ativo ? "Usuário desativado." : "Usuário ativado.");
      recarregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível alterar o status.");
    }
  }

  async function confirmarSenha() {
    if (!definindoSenha) return;
    if (novaSenha.length < 8) {
      toast.error("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }
    try {
      await api(`/api/usuarios/${definindoSenha.id}`, {
        method: "PATCH",
        body: JSON.stringify({ senha: novaSenha }),
      });
      toast.success("Senha redefinida (sessões do usuário foram revogadas).");
      setDefinindoSenha(null);
      setNovaSenha("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível redefinir a senha.");
    }
  }

  async function alternarPermissao(usuario: UsuarioApi, recurso: string) {
    const atual = usuario.permissaos.find((p) => p.recurso === recurso);
    const proximo = atual ? !atual.permitido : false;
    try {
      await api(`/api/usuarios/${usuario.id}/permissao`, {
        method: "PATCH",
        body: JSON.stringify({ recurso, permitido: proximo }),
      });
      recarregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível alterar a permissão.");
    }
  }

  function permissaoEfetiva(usuario: UsuarioApi, recurso: string): boolean {
    const override = usuario.permissaos.find((p) => p.recurso === recurso);
    if (override) return override.permitido;
    return (recursosDoPapel(usuario.papel) as readonly string[]).includes(recurso);
  }

  const emEdicao = usuarios.find((u) => u.id === painelPermissoes) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {ativos} de {usuarios.length} usuários ativos — cada papel tem suas permissões;
          o administrador pode ajustá-las individualmente.
        </p>
        <Button onClick={abrirNovo}>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Novo usuário
        </Button>
      </div>

      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Users className="h-5 w-5 text-primary" aria-hidden="true" />
            Equipe
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Quem acessa o sistema, com qual papel e status.
          </p>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead className="text-right">Último acesso</TableHead>
                <TableHead className="text-right">Status</TableHead>
                <TableHead className="w-40 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.map((usuario) => {
                const papel = PAPEL_CONFIG[usuario.papel] ?? PAPEL_CONFIG.CAIXA;
                return (
                  <TableRow key={usuario.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="bg-primary-50 text-primary-700">
                            {iniciais(usuario.nome)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{usuario.nome}</p>
                          <p className="text-sm text-muted-foreground">{usuario.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
                          papel.classes
                        )}
                      >
                        {papel.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular text-muted-foreground">
                      {formatarUltimoAcesso(usuario.ultimoAcesso)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Switch
                          checked={usuario.ativo}
                          onCheckedChange={() => alternarAtivo(usuario)}
                          aria-label={`Ativar ou desativar ${usuario.nome}`}
                        />
                        <span className="text-sm text-muted-foreground">
                          {usuario.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => abrirEdicao(usuario)}>
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setDefinindoSenha(usuario);
                            setNovaSenha("");
                          }}
                        >
                          <KeyRound className="h-4 w-4" aria-hidden="true" />
                          Senha
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setPainelPermissoes(usuario.id)}
                        >
                          Permissões
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Novo / editar usuário */}
      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editandoId ? "Editar usuário" : "Novo usuário"}</DialogTitle>
            <DialogDescription>
              {editandoId
                ? "Altere os dados e o papel do usuário."
                : "Crie a conta com um papel (a senha inicial deve ter 8+ caracteres)."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={salvar} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="u-nome">Nome</Label>
              <Input
                id="u-nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Nome completo"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="u-email">E-mail</Label>
              <Input
                id="u-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="usuario@rozeno.com.br"
              />
            </div>
            {!editandoId && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="u-senha">Senha inicial</Label>
                <Input
                  id="u-senha"
                  type="password"
                  value={form.senha}
                  onChange={(e) => setForm({ ...form, senha: e.target.value })}
                  placeholder="mínimo 8 caracteres"
                />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="u-papel">Papel</Label>
              <Select
                value={form.papel}
                onValueChange={(v) => setForm({ ...form, papel: v as Papel })}
              >
                <SelectTrigger id="u-papel">
                  <SelectValue placeholder="Selecione o papel" />
                </SelectTrigger>
                <SelectContent>
                  {PAPEIS.map((papel) => (
                    <SelectItem key={papel} value={papel}>
                      {ROTULOS_PAPEL[papel]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="mt-2">
              <Button type="button" variant="outline" onClick={() => setDialogAberto(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={salvando}>
                {salvando ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Redefinir senha */}
      <Dialog open={Boolean(definindoSenha)} onOpenChange={(v) => !v && setDefinindoSenha(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir senha — {definindoSenha?.nome}</DialogTitle>
            <DialogDescription>
              As sessões abertas deste usuário serão encerradas após a troca.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="nova-senha">Nova senha</Label>
            <Input
              id="nova-senha"
              type="password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              placeholder="mínimo 8 caracteres"
            />
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setDefinindoSenha(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmarSenha}>Redefinir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permissões por usuário */}
      <Dialog
        open={Boolean(emEdicao)}
        onOpenChange={(v) => !v && setPainelPermissoes(null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Permissões — {emEdicao?.nome}</DialogTitle>
            <DialogDescription>
              {emEdicao
                ? `Papel ${ROTULOS_PAPEL[emEdicao.papel]}: os ajustes abaixo substituem o padrão do papel.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-1.5">
            {RECURSOS.map((recurso) => {
              const efetiva = emEdicao ? permissaoEfetiva(emEdicao, recurso) : false;
              const override = emEdicao?.permissaos.find((p) => p.recurso === recurso);
              return (
                <li key={recurso} className="flex items-center justify-between gap-3 py-1">
                  <span className="text-sm text-foreground">
                    {RECURSO_ROTULO[recurso] ?? recurso}
                    {override ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (ajustado individualmente)
                      </span>
                    ) : null}
                  </span>
                  <Switch
                    checked={efetiva}
                    onCheckedChange={() => emEdicao && alternarPermissao(emEdicao, recurso)}
                  />
                </li>
              );
            })}
          </ul>
          <Button variant="outline" onClick={() => setPainelPermissoes(null)}>
            <X className="h-4 w-4" aria-hidden="true" />
            Fechar
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

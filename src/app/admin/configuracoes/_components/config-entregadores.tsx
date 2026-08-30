"use client";

import * as React from "react";
import { toast } from "sonner";
import { Bike, Link2, Pencil, Plus, Unlink } from "lucide-react";

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
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { EmptyState } from "@/components/patterns/empty-state";
import { cn } from "@/lib/utils";
import { api, useApi } from "@/lib/api-cliente";

interface Entregador {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  ativo: boolean;
  statusHoje: "ativo" | "rota" | "folga";
  usuarioId: string | null;
}

interface UsuarioDisponivel {
  id: string;
  nome: string;
  email: string;
}

interface RespostaEntregadores {
  entregadores: Entregador[];
  usuariosDisponiveis: UsuarioDisponivel[];
}

interface Formulario {
  nome: string;
  email: string;
  telefone: string;
  usuarioId: string;
}

const FORM_VAZIO: Formulario = { nome: "", email: "", telefone: "", usuarioId: "" };

/**
 * Entregadores — cadastro que faltava por completo (não existia
 * NENHUMA forma de criar um entregador pela interface). Sem isto, o
 * fluxo de QR (assumir entrega) é impossível de testar, porque depende
 * de `Entregador.usuarioId` vinculado a uma conta de login com papel
 * Entregador (ver Admin → Configurações → Usuários).
 */
export function ConfigEntregadores() {
  const { dados, recarregar } = useApi<RespostaEntregadores>("/api/entregadores", {
    entregadores: [],
    usuariosDisponiveis: [],
  });

  const [dialogoAberto, setDialogoAberto] = React.useState(false);
  const [editando, setEditando] = React.useState<Entregador | null>(null);
  const [formulario, setFormulario] = React.useState<Formulario>(FORM_VAZIO);
  const [enviando, setEnviando] = React.useState(false);

  function abrirNovo() {
    setEditando(null);
    setFormulario(FORM_VAZIO);
    setDialogoAberto(true);
  }

  function abrirEdicao(e: Entregador) {
    setEditando(e);
    setFormulario({ nome: e.nome, email: e.email ?? "", telefone: e.telefone ?? "", usuarioId: e.usuarioId ?? "" });
    setDialogoAberto(true);
  }

  async function salvar() {
    if (!formulario.nome.trim()) {
      toast.error("Informe o nome do entregador.");
      return;
    }
    setEnviando(true);
    try {
      const corpo = {
        nome: formulario.nome.trim(),
        email: formulario.email.trim() || undefined,
        telefone: formulario.telefone.trim() || undefined,
        usuarioId: formulario.usuarioId || null,
      };
      if (editando) {
        await api(`/api/entregadores/${editando.id}`, { method: "PATCH", body: JSON.stringify(corpo) });
        toast.success(`"${corpo.nome}" atualizado.`);
      } else {
        await api("/api/entregadores", { method: "POST", body: JSON.stringify(corpo) });
        toast.success(`"${corpo.nome}" cadastrado.`);
      }
      setDialogoAberto(false);
      recarregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar o entregador.");
    } finally {
      setEnviando(false);
    }
  }

  async function alternarAtivo(e: Entregador) {
    try {
      await api(`/api/entregadores/${e.id}`, { method: "PATCH", body: JSON.stringify({ ativo: !e.ativo }) });
      toast.success(e.ativo ? `"${e.nome}" desativado.` : `"${e.nome}" ativado.`);
      recarregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível alterar a situação.");
    }
  }

  async function desvincular(e: Entregador) {
    try {
      await api(`/api/entregadores/${e.id}`, { method: "PATCH", body: JSON.stringify({ usuarioId: null }) });
      toast.success(`Login desvinculado de "${e.nome}".`);
      recarregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível desvincular.");
    }
  }

  // Ao editar um entregador JÁ vinculado, ele mesmo precisa continuar
  // aparecendo como opção no seletor (senão "some" da lista por já estar
  // vinculado a si mesmo).
  const usuariosSelecionaveis = editando?.usuarioId
    ? [...dados.usuariosDisponiveis, { id: editando.usuarioId, nome: editando.nome, email: editando.email ?? "" }]
    : dados.usuariosDisponiveis;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {dados.entregadores.filter((e) => e.ativo).length} de {dados.entregadores.length} entregadores ativos.
        </p>
        <Button onClick={abrirNovo}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Novo entregador
        </Button>
      </div>

      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Bike className="h-5 w-5 text-primary" aria-hidden="true" />
            Entregadores
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            O login (conta de acesso) é vinculado separadamente em Usuários — vincule aqui pra
            habilitar o entregador a assumir entregas pelo QR.
          </p>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          {dados.entregadores.length === 0 ? (
            <div className="px-6 py-4 sm:px-7">
              <EmptyState
                icon={Bike}
                title="Nenhum entregador cadastrado"
                description='Clique em "Novo entregador" para começar. Para o fluxo de QR funcionar, crie primeiro o login com papel Entregador em Usuários, depois vincule aqui.'
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Login vinculado</TableHead>
                  <TableHead className="text-right">Situação</TableHead>
                  <TableHead className="w-24 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dados.entregadores.map((e) => (
                  <TableRow key={e.id} className={cn(!e.ativo && "opacity-50")}>
                    <TableCell className="font-medium">{e.nome}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {[e.email, e.telefone].filter(Boolean).join(" · ") || "—"}
                    </TableCell>
                    <TableCell>
                      {e.usuarioId ? (
                        <button
                          type="button"
                          onClick={() => desvincular(e)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-status-free-border bg-status-free-bg px-2.5 py-0.5 text-xs font-semibold text-status-free hover:opacity-80"
                          title="Clique para desvincular"
                        >
                          <Link2 className="h-3 w-3" aria-hidden="true" />
                          Vinculado
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-status-waiting-border bg-status-waiting-bg px-2.5 py-0.5 text-xs font-semibold text-status-waiting">
                          <Unlink className="h-3 w-3" aria-hidden="true" />
                          Sem login
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={() => alternarAtivo(e)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold hover:opacity-80",
                          e.ativo
                            ? "bg-status-free-bg text-status-free border-status-free-border"
                            : "bg-status-occupied-bg text-status-occupied border-status-occupied-border"
                        )}
                      >
                        {e.ativo ? "Ativo" : "Inativo"}
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => abrirEdicao(e)}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogoAberto} onOpenChange={setDialogoAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? `Editar "${editando.nome}"` : "Novo entregador"}</DialogTitle>
            <DialogDescription>
              Vincular um login permite que essa pessoa assuma entregas pelo QR, com o próprio
              usuário (nunca por nome).
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ent-nome">Nome</Label>
              <Input
                id="ent-nome"
                value={formulario.nome}
                onChange={(e) => setFormulario((f) => ({ ...f, nome: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ent-email">E-mail (opcional)</Label>
                <Input
                  id="ent-email"
                  type="email"
                  value={formulario.email}
                  onChange={(e) => setFormulario((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ent-telefone">Telefone (opcional)</Label>
                <Input
                  id="ent-telefone"
                  value={formulario.telefone}
                  onChange={(e) => setFormulario((f) => ({ ...f, telefone: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Login vinculado (opcional)</Label>
              <Select
                value={formulario.usuarioId || "_nenhum"}
                onValueChange={(v) => setFormulario((f) => ({ ...f, usuarioId: v === "_nenhum" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nenhum login vinculado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_nenhum">Nenhum</SelectItem>
                  {usuariosSelecionaveis.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {usuariosSelecionaveis.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhum usuário com papel Entregador disponível ainda — crie um em Usuários primeiro.
                </p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogoAberto(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={enviando}>
              {editando ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

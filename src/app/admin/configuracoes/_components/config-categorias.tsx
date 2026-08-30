"use client";

import * as React from "react";
import { toast } from "sonner";
import { GripVertical, Pencil, Plus, Save, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { cn, formatBRL } from "@/lib/utils";
import { api, useApi } from "@/lib/api-cliente";

interface CategoriaApi {
  id: string;
  nome: string;
  ordem: number;
  ativo: boolean;
}

interface ConfigCategoriasProps {
  className?: string;
}

export function ConfigCategorias({ className }: ConfigCategoriasProps) {
  const { dados: categorias, recarregar } = useApi<CategoriaApi[]>("/api/categorias", []);
  const [dialogoAberto, setDialogoAberto] = React.useState(false);
  const [editando, setEditando] = React.useState<CategoriaApi | null>(null);
  const [nome, setNome] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);
  const [erroRemocao, setErroRemocao] = React.useState<string | null>(null);

  const categoriaAtiva = categorias.filter((c) => c.ativo);
  const categoriaInativa = categorias.filter((c) => !c.ativo);

  function abrirNovo() {
    setEditando(null);
    setNome("");
    setDialogoAberto(true);
  }

  function abrirEdicao(cat: CategoriaApi) {
    setEditando(cat);
    setNome(cat.nome);
    setDialogoAberto(true);
  }

  async function salvar() {
    const nomeTrim = nome.trim();
    if (!nomeTrim) {
      toast.error("Nome da categoria é obrigatório.");
      return;
    }
    if (nomeTrim.length > 60) {
      toast.error("Nome muito longo (máx. 60 caracteres).");
      return;
    }

    const existe = categorias.find(
      (c) => c.nome.toLowerCase() === nomeTrim.toLowerCase() && c.id !== editando?.id
    );
    if (existe) {
      toast.error(`A categoria "${existe.nome}" já existe.`);
      return;
    }

    setSalvando(true);
    try {
      if (editando) {
        await api(`/api/categorias/${editando.id}`, {
          method: "PATCH",
          body: JSON.stringify({ nome: nomeTrim }),
        });
        toast.success(`Categoria "${nomeTrim}" atualizada.`);
      } else {
        await api("/api/categorias", {
          method: "POST",
          body: JSON.stringify({ nome: nomeTrim, ordem: categorias.length }),
        });
        toast.success(`Categoria "${nomeTrim}" criada.`);
      }
      setDialogoAberto(false);
      recarregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(cat: CategoriaApi) {
    try {
      await api(`/api/categorias/${cat.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ativo: !cat.ativo }),
      });
      toast.success(
        cat.ativo
          ? `Categoria "${cat.nome}" desativada.`
          : `Categoria "${cat.nome}" ativada.`
      );
      recarregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível alterar.");
    }
  }

  async function excluir(cat: CategoriaApi) {
    try {
      await api(`/api/categorias/${cat.id}`, { method: "DELETE" });
      toast.success(`Categoria "${cat.nome}" excluída.`);
      recarregar();
      setErroRemocao(null);
    } catch (erro) {
      const msg = erro instanceof Error ? erro.message : "Erro desconhecido";
      setErroRemocao(msg);
      toast.error(msg);
    }
  }

  async function salvarOrdem() {
    try {
      await api("/api/categorias/ordem", {
        method: "PATCH",
        body: JSON.stringify({ ordenacao: categoriaAtiva.map((c, i) => ({ id: c.id, ordem: i })) }),
      });
      toast.success("Ordem das categorias salva.");
      recarregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar a ordem.");
    }
  }

  const podeSalvarOrdem = categoriaAtiva.length > 1;

  return (
    <ErrorBoundary>
      <div className={cn("flex flex-col gap-6", className)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {categoriaAtiva.length} categoria(s) ativa(s) · {categoriaInativa.length} inativa(s).
          </p>
          <Button onClick={abrirNovo}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nova categoria
          </Button>
        </div>

        {erroRemocao && (
          <p className="rounded-xl border border-status-waiting-border bg-status-waiting-bg px-4 py-3 text-sm text-status-waiting">
            Não foi excluir: {erroRemocao}. Mova os produtos para outra categoria ou inative-a.
          </p>
        )}

        <Card>
          <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Plus className="h-5 w-5 text-primary" aria-hidden="true" />
              Categorias ativas
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Ordem de aparição no cardápio do PDV e do Garçom. Arraste para reordenar e salve.
            </p>
          </CardHeader>
          <CardContent className="p-0 sm:p-0">
            {categoriaAtiva.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground sm:px-7">
                Nenhuma categoria criada ainda. Clique em "Nova categoria" para começar.
              </p>
            ) : (
              <ul className="flex flex-col gap-1 p-2">
                {categoriaAtiva.map((cat, index) => (
                  <li
                    key={cat.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold tabular">
                        {index + 1}
                      </span>
                      <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" aria-hidden="true" />
                      <span className="font-medium">{cat.nome}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => abrirEdicao(cat)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Switch
                        checked={cat.ativo}
                        onCheckedChange={() => alternarAtivo(cat)}
                        aria-label={cat.ativo ? "Desativar" : "Ativar"}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {podeSalvarOrdem && (
          <div className="flex justify-end">
            <Button variant="outline" onClick={salvarOrdem}>
              <Save className="h-4 w-4" aria-hidden="true" />
              Salvar ordem
            </Button>
          </div>
        )}

        {categoriaInativa.length > 0 && (
          <Card>
            <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Trash2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                Desativadas
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 sm:p-0">
              <ul className="flex flex-col gap-1 p-2">
                {categoriaInativa.map((cat) => (
                  <li
                    key={cat.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 opacity-60"
                  >
                    <span className="font-medium">{cat.nome}</span>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => abrirEdicao(cat)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Excluir "${cat.nome}"? Esta ação não pode ser desfeita.`)) {
                            void excluir(cat);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Dialog open={dialogoAberto} onOpenChange={setDialogoAberto}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{editando ? `Editar "${editando.nome}"` : "Nova categoria"}</DialogTitle>
              <DialogDescription>
                Nome da categoria que aparecerá no cardápio do PDV e do Garçom. A ordem é
                ajustada arrastando em "Categorias ativas".
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="categoria-nome">Nome</Label>
                <Input
                  id="categoria-nome"
                  placeholder="Ex.: Pizzas Tradicionais"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  maxLength={60}
                  autoFocus
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setDialogoAberto(false)} disabled={salvando}>
                Cancelar
              </Button>
              <Button onClick={salvar} disabled={salvando}>
                {editando ? "Salvar alterações" : "Criar categoria"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ErrorBoundary>
  );
}

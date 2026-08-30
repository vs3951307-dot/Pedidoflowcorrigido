"use client";

import * as React from "react";
import { toast } from "sonner";
import { CircleDollarSign, Pencil, Plus } from "lucide-react";

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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn, formatBRL } from "@/lib/utils";
import { MODULOS, type Modulo } from "@/lib/modulos";

const ROTULOS_MODULO: Record<Modulo, string> = {
  pdv: "PDV",
  mesas: "Mesas / Garçom / QR",
  kds: "Cozinha (KDS)",
  delivery: "Delivery",
  entregador: "Entregador",
  estoque: "Estoque",
  relatorios: "Relatórios",
  whatsapp: "WhatsApp / IA",
  fiscal: "Fiscal (NFC-e)",
  impressao: "Impressão",
  copiloto: "Copiloto",
};

interface Plano {
  id: string;
  nome: string;
  slug: string;
  preco: number;
  descricao: string | null;
  modulosPadrao: Modulo[];
  limiteUsuarios: number | null;
  limiteMensagensIA: number | null;
  limiteProdutos: number | null;
  iaIncluida: boolean;
  ordem: number;
  ativo: boolean;
  empresasVinculadas: number;
}

interface Formulario {
  nome: string;
  slug: string;
  preco: string;
  descricao: string;
  modulosPadrao: Modulo[];
  limiteUsuarios: string; // vazio = ilimitado
  limiteMensagensIA: string;
  limiteProdutos: string;
  iaIncluida: boolean;
  ordem: string;
}

const FORM_VAZIO: Formulario = {
  nome: "",
  slug: "",
  preco: "0",
  descricao: "",
  modulosPadrao: [],
  limiteUsuarios: "",
  limiteMensagensIA: "",
  limiteProdutos: "",
  iaIncluida: true,
  ordem: "0",
};

function slugificar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function paraFormulario(p: Plano): Formulario {
  return {
    nome: p.nome,
    slug: p.slug,
    preco: String(p.preco),
    descricao: p.descricao ?? "",
    modulosPadrao: p.modulosPadrao,
    limiteUsuarios: p.limiteUsuarios === null ? "" : String(p.limiteUsuarios),
    limiteMensagensIA: p.limiteMensagensIA === null ? "" : String(p.limiteMensagensIA),
    limiteProdutos: p.limiteProdutos === null ? "" : String(p.limiteProdutos),
    iaIncluida: p.iaIncluida,
    ordem: String(p.ordem),
  };
}

/** Campo vazio = ilimitado (null); número = limite de verdade. */
function paraLimite(texto: string): number | null {
  const limpo = texto.trim();
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Construtor de planos (PEDIDO 69) — não existia NENHUMA tela para
 * isto: o backend (`/api/superadmin/planos`) já suportava criar/editar
 * plano, preço, módulos e os três limites, mas só era alcançável via
 * chamada de API direta ou pedindo pro Copiloto Supremo. Cada plano
 * pode ter usuários, mensagens de IA e produtos limitados — campo
 * vazio = ilimitado (`null` no banco), nunca precisa digitar "-1".
 */
export function ConstrutorPlanos() {
  const [planos, setPlanos] = React.useState<Plano[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [dialogoAberto, setDialogoAberto] = React.useState(false);
  const [editando, setEditando] = React.useState<Plano | null>(null);
  const [formulario, setFormulario] = React.useState<Formulario>(FORM_VAZIO);
  const [enviando, setEnviando] = React.useState(false);

  const carregar = React.useCallback(() => {
    setCarregando(true);
    fetch("/api/superadmin/planos", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setPlanos(d.planos ?? []))
      .catch(() => toast.error("Não foi possível carregar os planos."))
      .finally(() => setCarregando(false));
  }, []);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  function abrirNovo() {
    setEditando(null);
    setFormulario(FORM_VAZIO);
    setDialogoAberto(true);
  }

  function abrirEdicao(p: Plano) {
    setEditando(p);
    setFormulario(paraFormulario(p));
    setDialogoAberto(true);
  }

  function alternarModulo(m: Modulo) {
    setFormulario((f) => ({
      ...f,
      modulosPadrao: f.modulosPadrao.includes(m) ? f.modulosPadrao.filter((x) => x !== m) : [...f.modulosPadrao, m],
    }));
  }

  async function salvar() {
    if (!formulario.nome.trim()) {
      toast.error("Informe o nome do plano.");
      return;
    }
    const slug = (formulario.slug.trim() || slugificar(formulario.nome)).toLowerCase();
    const preco = Number(formulario.preco.replace(",", "."));
    if (!Number.isFinite(preco) || preco < 0) {
      toast.error("Informe um preço válido.");
      return;
    }

    const corpo = {
      nome: formulario.nome.trim(),
      slug,
      preco,
      descricao: formulario.descricao.trim() || undefined,
      modulosPadrao: formulario.modulosPadrao,
      limiteUsuarios: paraLimite(formulario.limiteUsuarios),
      limiteMensagensIA: paraLimite(formulario.limiteMensagensIA),
      limiteProdutos: paraLimite(formulario.limiteProdutos),
      iaIncluida: formulario.iaIncluida,
      ordem: Number(formulario.ordem) || 0,
    };

    setEnviando(true);
    try {
      const resposta = await fetch(editando ? `/api/superadmin/planos/${editando.id}` : "/api/superadmin/planos", {
        method: editando ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(dados.erro ?? "Falha ao salvar o plano.");
      toast.success(editando ? `"${corpo.nome}" atualizado.` : `"${corpo.nome}" criado.`);
      setDialogoAberto(false);
      carregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar o plano.");
    } finally {
      setEnviando(false);
    }
  }

  async function alternarAtivo(p: Plano) {
    try {
      const resposta = await fetch(`/api/superadmin/planos/${p.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !p.ativo }),
      });
      if (!resposta.ok) throw new Error();
      toast.success(p.ativo ? `"${p.nome}" desativado.` : `"${p.nome}" ativado.`);
      carregar();
    } catch {
      toast.error("Não foi possível alterar a situação do plano.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {carregando ? "Carregando…" : `${planos.length} plano(s) cadastrado(s).`}
        </p>
        <Button onClick={abrirNovo}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Novo plano
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {planos.map((p) => (
          <Card key={p.id} className={cn(!p.ativo && "opacity-60")}>
            <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CircleDollarSign className="h-5 w-5 text-primary" aria-hidden="true" />
                  {p.nome}
                </CardTitle>
                <Badge variant={p.ativo ? "free" : "bill"}>{p.ativo ? "Ativo" : "Inativo"}</Badge>
              </div>
              <p className="text-2xl font-bold tabular">
                {p.preco > 0 ? formatBRL(p.preco) : "Grátis"}
                {p.preco > 0 ? <span className="text-sm font-normal text-muted-foreground">/mês</span> : null}
              </p>
              {p.descricao ? <p className="text-sm text-muted-foreground">{p.descricao}</p> : null}
            </CardHeader>
            <CardContent className="flex flex-col gap-3 p-6 pt-4 sm:p-7 sm:pt-4">
              <div className="flex flex-wrap gap-1.5">
                {p.modulosPadrao.map((m) => (
                  <span key={m} className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs">
                    {ROTULOS_MODULO[m] ?? m}
                  </span>
                ))}
              </div>
              <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                <li>Usuários: {p.limiteUsuarios === null ? "ilimitado" : p.limiteUsuarios}</li>
                <li>Produtos: {p.limiteProdutos === null ? "ilimitado" : p.limiteProdutos}</li>
                <li>Mensagens de IA/mês: {p.limiteMensagensIA === null ? "ilimitado" : p.limiteMensagensIA}</li>
                <li>{p.empresasVinculadas} empresa(s) usando este plano</li>
              </ul>
              <div className="flex gap-2 border-t border-border pt-3">
                <Button size="sm" variant="outline" onClick={() => abrirEdicao(p)}>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Editar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => alternarAtivo(p)}>
                  {p.ativo ? "Desativar" : "Ativar"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogoAberto} onOpenChange={setDialogoAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? `Editar "${editando.nome}"` : "Novo plano"}</DialogTitle>
            <DialogDescription>Deixe um limite em branco para ilimitado.</DialogDescription>
          </DialogHeader>

          <div className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="plano-nome">Nome</Label>
                <Input
                  id="plano-nome"
                  value={formulario.nome}
                  onChange={(e) => setFormulario((f) => ({ ...f, nome: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="plano-preco">Preço (R$/mês)</Label>
                <Input
                  id="plano-preco"
                  inputMode="decimal"
                  value={formulario.preco}
                  onChange={(e) => setFormulario((f) => ({ ...f, preco: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="plano-descricao">Descrição (opcional)</Label>
              <Input
                id="plano-descricao"
                value={formulario.descricao}
                onChange={(e) => setFormulario((f) => ({ ...f, descricao: e.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Módulos incluídos</Label>
              <div className="flex flex-wrap gap-2">
                {MODULOS.map((m) => {
                  const ativo = formulario.modulosPadrao.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => alternarModulo(m)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                        ativo ? "border-primary bg-primary-50 text-primary-700" : "border-border text-muted-foreground hover:bg-secondary"
                      )}
                    >
                      {ROTULOS_MODULO[m]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="plano-limite-usuarios">Limite de usuários</Label>
                <Input
                  id="plano-limite-usuarios"
                  inputMode="numeric"
                  placeholder="Ilimitado"
                  value={formulario.limiteUsuarios}
                  onChange={(e) => setFormulario((f) => ({ ...f, limiteUsuarios: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="plano-limite-produtos">Limite de produtos</Label>
                <Input
                  id="plano-limite-produtos"
                  inputMode="numeric"
                  placeholder="Ilimitado"
                  value={formulario.limiteProdutos}
                  onChange={(e) => setFormulario((f) => ({ ...f, limiteProdutos: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="plano-limite-ia">Mensagens IA/mês</Label>
                <Input
                  id="plano-limite-ia"
                  inputMode="numeric"
                  placeholder="Ilimitado"
                  value={formulario.limiteMensagensIA}
                  onChange={(e) => setFormulario((f) => ({ ...f, limiteMensagensIA: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">IA incluída no plano</p>
                <p className="text-xs text-muted-foreground">Desligue para planos sem Copiloto/atendimento por IA.</p>
              </div>
              <Switch
                checked={formulario.iaIncluida}
                onCheckedChange={(v) => setFormulario((f) => ({ ...f, iaIncluida: v }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogoAberto(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={enviando}>
              {editando ? "Salvar alterações" : "Criar plano"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

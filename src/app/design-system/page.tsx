"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Pizza,
  Plus,
  Printer,
  DollarSign,
  ArrowLeftRight,
  Trash2,
  Bell,
  Settings,
  BarChart3,
  LayoutGrid,
  Clock,
  CircleAlert,
  CheckCircle2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { StatusBadge, type TableStatus } from "@/components/patterns/status-badge";
import { TableCard } from "@/components/patterns/table-card";
import { StatCard } from "@/components/patterns/stat-card";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { formatBRL } from "@/lib/utils";

const COLOR_GROUPS: {
  title: string;
  swatches: { name: string; className: string; hex: string }[];
}[] = [
  {
    title: "Marca — Brasa",
    swatches: [
      { name: "primary-50", className: "bg-primary-50", hex: "#FCF3F1" },
      { name: "primary-200", className: "bg-primary-200", hex: "#EFC2B8" },
      { name: "primary-400", className: "bg-primary-400", hex: "#CD7360" },
      { name: "primary-600 (base)", className: "bg-primary-600", hex: "#953C2A" },
      { name: "primary-800", className: "bg-primary-800", hex: "#5F261A" },
    ],
  },
  {
    title: "Neutros — Tinta",
    swatches: [
      { name: "ink-50", className: "bg-ink-50", hex: "#F7F6F4" },
      { name: "ink-200", className: "bg-ink-200", hex: "#DEDAD3" },
      { name: "ink-400", className: "bg-ink-400", hex: "#9B9388" },
      { name: "ink-700", className: "bg-ink-700", hex: "#453F38" },
      { name: "ink-900", className: "bg-ink-900", hex: "#1C1916" },
    ],
  },
  {
    title: "Status de mesa",
    swatches: [
      { name: "Livre", className: "bg-status-free", hex: "#2E8B57" },
      { name: "Aguardando", className: "bg-status-waiting", hex: "#B8790F" },
      { name: "Pedido enviado", className: "bg-status-sent", hex: "#3459B4" },
      { name: "Pedindo conta", className: "bg-status-bill", hex: "#6E4FA6" },
      { name: "Ocupada", className: "bg-status-occupied", hex: "#B23B2E" },
    ],
  },
];

const DEMO_TABLES: { number: number; status: TableStatus; elapsed?: number }[] = [
  { number: 1, status: "livre" },
  { number: 2, status: "ocupada", elapsed: 18 },
  { number: 3, status: "livre" },
  { number: 4, status: "enviado", elapsed: 10 },
  { number: 5, status: "aguardando", elapsed: 5 },
  { number: 6, status: "livre" },
  { number: 7, status: "conta", elapsed: 3 },
  { number: 8, status: "livre" },
];

export default function DesignSystemPage() {
  const [dialogOpen, setDialogOpen] = React.useState(false);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-background pb-24">
        {/* ---------------------------------------------------------------- */}
        {/* HERO */}
        {/* ---------------------------------------------------------------- */}
        <section className="border-b border-border bg-card">
          <div className="container flex flex-col gap-6 py-14 sm:py-20">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
                <Pizza className="h-7 w-7" />
              </div>
              <span className="text-sm font-semibold uppercase tracking-[0.2em] text-primary-700">
                Design System
              </span>
            </div>
            <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-[-0.02em] sm:text-5xl">
              PedidoFlow — o sistema visual da plataforma
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground sm:text-xl">
              Letras grandes, botões generosos e cores que contam a história do
              status de cada mesa à distância. Elegante como a Apple, direto
              como a Stripe, quente como um forno a lenha.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button size="lg">
                <Plus className="h-5 w-5" />
                Nova mesa
              </Button>
              <Button size="lg" variant="secondary">
                Ver componentes
              </Button>
            </div>
          </div>
        </section>

        <div className="container flex flex-col gap-20 py-16">
          {/* -------------------------------------------------------------- */}
          {/* CORES */}
          {/* -------------------------------------------------------------- */}
          <section id="cores" className="scroll-mt-8">
            <PageHeader
              title="Paleta de cores"
              description="Um vermelho de marca, uma escala neutra quente e cinco cores de status — nada além disso."
            />
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
              {COLOR_GROUPS.map((group) => (
                <Card key={group.title}>
                  <CardHeader>
                    <CardTitle className="text-lg">{group.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    {group.swatches.map((s) => (
                      <div key={s.name} className="flex items-center gap-3">
                        <div
                          className={`h-10 w-10 shrink-0 rounded-lg border border-border ${s.className}`}
                        />
                        <div className="flex flex-1 flex-col leading-tight">
                          <span className="text-sm font-medium">{s.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {s.hex}
                          </span>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* -------------------------------------------------------------- */}
          {/* TIPOGRAFIA */}
          {/* -------------------------------------------------------------- */}
          <section id="tipografia" className="scroll-mt-8">
            <PageHeader
              title="Tipografia"
              description="Geist para toda a interface; Geist Mono só para números — preços, horários, contadores."
            />
            <Card>
              <CardContent className="flex flex-col gap-6 p-7 sm:p-8">
                <div>
                  <p className="text-5xl font-bold tracking-[-0.02em]">Mesa 04</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    text-5xl · font-bold · Título de hero / valor em destaque
                  </p>
                </div>
                <Separator />
                <div>
                  <p className="text-3xl font-bold tracking-[-0.01em]">Boa noite, Sr. Silva!</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    text-3xl · font-bold · Título de página
                  </p>
                </div>
                <Separator />
                <div>
                  <p className="text-xl font-semibold">Pizza Calabresa — Grande</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    text-xl · font-semibold · Título de cartão
                  </p>
                </div>
                <Separator />
                <div>
                  <p className="text-base text-foreground">
                    Corpo de texto padrão, usado em descrições e parágrafos. Contraste
                    alto sobre o fundo papel, sem itálicos decorativos.
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    text-base · font-normal · Corpo
                  </p>
                </div>
                <Separator />
                <div>
                  <p className="font-mono text-2xl tabular">R$ 90,97</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    font-mono · tabular-nums · Preços e totais
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* -------------------------------------------------------------- */}
          {/* BOTÕES */}
          {/* -------------------------------------------------------------- */}
          <section id="botoes" className="scroll-mt-8">
            <PageHeader
              title="Botões"
              description="Alvos de toque grandes (mín. 48px de altura) e hierarquia clara entre ações."
            />
            <Card>
              <CardContent className="flex flex-col gap-8 p-7 sm:p-8">
                <div className="flex flex-wrap items-center gap-4">
                  <Button variant="primary">
                    <Plus className="h-5 w-5" />
                    Nova mesa
                  </Button>
                  <Button variant="secondary">
                    <ArrowLeftRight className="h-5 w-5" />
                    Transferir mesa
                  </Button>
                  <Button variant="outline">
                    <Printer className="h-5 w-5" />
                    Imprimir relatório
                  </Button>
                  <Button variant="ghost">Cancelar</Button>
                  <Button variant="destructive">
                    <Trash2 className="h-5 w-5" />
                    Limpar comanda
                  </Button>
                  <Button variant="link">Ver detalhes</Button>
                </div>
                <Separator />
                <div className="flex flex-wrap items-end gap-4">
                  <Button size="sm">Pequeno (sm)</Button>
                  <Button size="md">Médio (md)</Button>
                  <Button size="lg">Grande (lg) — padrão</Button>
                  <Button size="xl">Extra grande (xl)</Button>
                  <Button size="icon" aria-label="Configurações">
                    <Settings className="h-5 w-5" />
                  </Button>
                </div>
                <Separator />
                <div className="flex flex-wrap items-center gap-4">
                  <Button disabled>Desabilitado</Button>
                  <Button size="xl" className="bg-status-free hover:bg-status-free/90">
                    <DollarSign className="h-6 w-6" />
                    Finalizar / Pagar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* -------------------------------------------------------------- */}
          {/* INPUTS */}
          {/* -------------------------------------------------------------- */}
          <section id="inputs" className="scroll-mt-8">
            <PageHeader
              title="Campos de formulário"
              description="Altos, com foco nítido e rótulos sempre visíveis — nunca só placeholder."
            />
            <Card>
              <CardContent className="grid grid-cols-1 gap-6 p-7 sm:grid-cols-2 sm:p-8">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="nome-produto">Nome do produto</Label>
                  <Input id="nome-produto" placeholder="Ex.: Pizza Calabresa" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="preco">Preço</Label>
                  <Input id="preco" inputMode="decimal" placeholder="R$ 0,00" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="categoria">Categoria</Label>
                  <Select defaultValue="pizzas-tradicionais">
                    <SelectTrigger id="categoria">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pizzas-tradicionais">Pizzas tradicionais</SelectItem>
                      <SelectItem value="pizzas-especiais">Pizzas especiais</SelectItem>
                      <SelectItem value="lanches">Lanches</SelectItem>
                      <SelectItem value="bebidas">Bebidas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-xl border-2 border-border px-4">
                  <div>
                    <p className="text-base font-medium">Disponível no cardápio</p>
                    <p className="text-sm text-muted-foreground">
                      Ocultar itens fora de estoque automaticamente
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <Label htmlFor="obs">Observações</Label>
                  <Textarea id="obs" placeholder="Ex.: sem cebola, borda recheada..." />
                </div>
              </CardContent>
              <CardFooter>
                <Button size="md">Salvar produto</Button>
                <Button size="md" variant="ghost">
                  Cancelar
                </Button>
              </CardFooter>
            </Card>
          </section>

          {/* -------------------------------------------------------------- */}
          {/* CARDS DE MESA (padrão de domínio) */}
          {/* -------------------------------------------------------------- */}
          <section id="mesas" className="scroll-mt-8">
            <PageHeader
              title="Mesas do salão"
              description="StatusBadge + TableCard — o padrão central do produto."
              actions={
                <div className="flex flex-wrap gap-2">
                  {(["livre", "aguardando", "enviado", "conta", "ocupada"] as TableStatus[]).map(
                    (s) => (
                      <StatusBadge key={s} status={s} />
                    )
                  )}
                </div>
              }
            />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
              {DEMO_TABLES.map((t) => (
                <TableCard
                  key={t.number}
                  number={t.number}
                  status={t.status}
                  elapsedMinutes={t.elapsed}
                  onClick={() => toast(`Mesa ${String(t.number).padStart(2, "0")} selecionada`)}
                />
              ))}
            </div>
          </section>

          {/* -------------------------------------------------------------- */}
          {/* CARDS + STATS */}
          {/* -------------------------------------------------------------- */}
          <section id="cards" className="scroll-mt-8">
            <PageHeader title="Cards" description="Superfície base para conteúdo e métricas." />
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <StatCard label="Faturamento hoje" value={formatBRL(3248.9)} hint="42 pedidos" icon={DollarSign} trend={{ value: "12% vs. ontem", positive: true }} />
              <StatCard label="Tempo médio de mesa" value="38 min" hint="Meta: 45 min" icon={Clock} trend={{ value: "6% mais rápido", positive: true }} />
              <StatCard label="Mesas ocupadas" value="6 / 16" icon={LayoutGrid} />
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Pizza Calabresa</CardTitle>
                  <CardDescription>Grande · 8 fatias</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="font-mono text-3xl font-semibold tabular">R$ 49,90</p>
                </CardContent>
                <CardFooter>
                  <Button className="w-full" size="md">
                    <Plus className="h-5 w-5" />
                    Adicionar à comanda
                  </Button>
                </CardFooter>
              </Card>

              <EmptyState
                icon={LayoutGrid}
                title="Nenhuma mesa aberta"
                description="Todas as mesas do salão estão livres neste momento."
                actionLabel="Abrir nova mesa"
                onAction={() => toast.success("Nova mesa aberta")}
              />
            </div>
          </section>

          {/* -------------------------------------------------------------- */}
          {/* TABELA */}
          {/* -------------------------------------------------------------- */}
          <section id="tabelas" className="scroll-mt-8">
            <PageHeader title="Tabelas" description="Linhas altas, números tabulares, cabeçalho discreto." />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mesa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Itens</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { mesa: "04", status: "enviado" as TableStatus, itens: 3, total: 90.97 },
                  { mesa: "02", status: "ocupada" as TableStatus, itens: 5, total: 154.3 },
                  { mesa: "07", status: "conta" as TableStatus, itens: 2, total: 61.8 },
                ].map((row) => (
                  <TableRow key={row.mesa}>
                    <TableCell className="font-mono font-semibold tabular">{row.mesa}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell>{row.itens} itens</TableCell>
                    <TableCell className="text-right font-mono tabular">
                      {formatBRL(row.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>

          {/* -------------------------------------------------------------- */}
          {/* TABS */}
          {/* -------------------------------------------------------------- */}
          <section id="tabs" className="scroll-mt-8">
            <PageHeader title="Categorias (Tabs)" description="Usado no cardápio da comanda." />
            <Tabs defaultValue="pizzas">
              <TabsList>
                <TabsTrigger value="pizzas">Pizzas</TabsTrigger>
                <TabsTrigger value="lanches">Lanches</TabsTrigger>
                <TabsTrigger value="bebidas">Bebidas</TabsTrigger>
              </TabsList>
              <TabsContent value="pizzas" className="text-base text-muted-foreground">
                Pizza Calabresa, Pizza Portuguesa, Pizza 4 Queijos...
              </TabsContent>
              <TabsContent value="lanches" className="text-base text-muted-foreground">
                Lanche X-Burguer, Lanche X-Salada...
              </TabsContent>
              <TabsContent value="bebidas" className="text-base text-muted-foreground">
                Coca-Cola 2L, Guaraná Antarctica 2L...
              </TabsContent>
            </Tabs>
          </section>

          {/* -------------------------------------------------------------- */}
          {/* MODAIS + TOASTS */}
          {/* -------------------------------------------------------------- */}
          <section id="modais" className="scroll-mt-8">
            <PageHeader title="Modais e Toasts" description="Confirmações que interrompem (modal) e que não interrompem (toast)." />
            <div className="flex flex-wrap gap-4">
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash2 className="h-5 w-5" />
                    Fechar mesa
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Fechar a Mesa 04?</DialogTitle>
                    <DialogDescription>
                      A comanda será encerrada e o pagamento será registrado como
                      concluído. Essa ação não pode ser desfeita.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        setDialogOpen(false);
                        toast.success("Mesa 04 fechada");
                      }}
                    >
                      Sim, fechar mesa
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Button variant="secondary" onClick={() => toast("Pedido enviado à cozinha")}>
                Toast simples
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  toast.success("Pagamento confirmado", {
                    description: "Mesa 07 · R$ 61,80",
                  })
                }
              >
                <CheckCircle2 className="h-5 w-5" />
                Toast de sucesso
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  toast.error("Falha ao imprimir", {
                    description: "Verifique a impressora da cozinha",
                  })
                }
              >
                <CircleAlert className="h-5 w-5" />
                Toast de erro
              </Button>
            </div>
          </section>

          {/* -------------------------------------------------------------- */}
          {/* ÍCONES */}
          {/* -------------------------------------------------------------- */}
          <section id="icones" className="scroll-mt-8">
            <PageHeader title="Ícones" description="Biblioteca lucide-react, traço 2px, tamanho mínimo 20px em telas de toque." />
            <Card>
              <CardContent className="grid grid-cols-4 gap-6 p-7 sm:grid-cols-8 sm:p-8">
                {[Pizza, Plus, Printer, DollarSign, ArrowLeftRight, Trash2, Bell, Settings, BarChart3, LayoutGrid, Clock, CircleAlert].map(
                  (Icon, i) => (
                    <Tooltip key={i}>
                      <TooltipTrigger asChild>
                        <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-border bg-secondary/50">
                          <Icon className="h-6 w-6 text-foreground" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>{Icon.displayName || "Ícone"}</TooltipContent>
                    </Tooltip>
                  )
                )}
              </CardContent>
            </Card>
          </section>

          {/* -------------------------------------------------------------- */}
          {/* SIDEBAR + HEADER PREVIEW */}
          {/* -------------------------------------------------------------- */}
          <section id="navegacao" className="scroll-mt-8">
            <PageHeader title="Navegação" description="Sidebar e Header — cascas padrão de qualquer tela (ver AppShell)." />
            <div className="flex flex-col overflow-hidden rounded-2xl border border-border shadow-card lg:flex-row">
              <Sidebar activeHref="/salao" className="lg:h-[520px]" />
              <div className="flex flex-1 flex-col">
                <Header greetingName="Sr. Silva" date="31/07/2026" time="21:30" weekday="Sexta-feira" notificationCount={3} />
                <div className="flex flex-1 items-center justify-center bg-secondary/30 p-10 text-center text-muted-foreground">
                  Conteúdo da página aparece aqui
                </div>
              </div>
            </div>
          </section>

          {/* -------------------------------------------------------------- */}
          {/* AVATAR */}
          {/* -------------------------------------------------------------- */}
          <section id="avatares" className="scroll-mt-8">
            <PageHeader title="Avatares" description="Iniciais sobre fundo de marca — usado para garçons e usuários do sistema." />
            <div className="flex items-center gap-4">
              <Avatar>
                <AvatarFallback>SR</AvatarFallback>
              </Avatar>
              <Avatar className="h-14 w-14">
                <AvatarFallback className="text-lg">JP</AvatarFallback>
              </Avatar>
              <Badge variant="primary">Administrador</Badge>
              <Badge variant="outline">Garçom</Badge>
            </div>
          </section>
        </div>
      </div>
    </TooltipProvider>
  );
}

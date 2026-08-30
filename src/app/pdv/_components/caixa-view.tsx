"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  Landmark,
  LockKeyhole,
  Plus,
  ReceiptText,
  Wallet,
} from "lucide-react";

import { PageHeader } from "@/components/patterns/page-header";
import { StatCard } from "@/components/patterns/stat-card";
import { EmptyState } from "@/components/patterns/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RepassesPendentes } from "@/app/pdv/_components/repasses-pendentes";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn, formatBRL, formatHora } from "@/lib/utils";
import {
  calcularResumoCaixa,
  useCaixa,
  type MovimentacaoCaixa,
  type CaixaResumo,
} from "@/app/pdv/_lib/caixa-context";
import { FORMAS_PAGAMENTO } from "@/app/pdv/_lib/mock-data";

const TIPO_MOVIMENTACAO: Record<
  MovimentacaoCaixa["tipo"],
  { label: string; icon: React.ElementType; sinal: number; cor: string }
> = {
  venda: { label: "Venda", icon: ReceiptText, sinal: 1, cor: "text-status-free" },
  troco: { label: "Troco", icon: Wallet, sinal: -1, cor: "text-status-waiting" },
  sangria: { label: "Sangria", icon: ArrowDownCircle, sinal: -1, cor: "text-destructive" },
  entrada: { label: "Entrada", icon: ArrowUpCircle, sinal: 1, cor: "text-status-free" },
};

/** Lê um valor digitado no padrão brasileiro ("12,50" → 12.5). */
function lerValor(texto: string) {
  return parseFloat(texto.replace(",", ".").replace(/[^0-9.,]/g, "")) || 0;
}

/**
 * CaixaView — caixa do PDV: abertura com saldo inicial, movimentações
 * (vendas, trocos, sangrias e entradas) e fechamento com resumo do dia.
 * Vendas em dinheiro exigem caixa aberto (ver PagamentoDialog).
 */
export function CaixaView() {
  const {
    aberto,
    saldoInicial,
    aberturaEm,
    movimentacoes,
    abrirCaixa,
    registrarSangria,
    registrarEntrada,
    fecharCaixa,
  } = useCaixa();

  const [valorInicial, setValorInicial] = React.useState("");
  const [dialogEntrada, setDialogEntrada] = React.useState(false);
  const [dialogSangria, setDialogSangria] = React.useState(false);
  const [dialogFechar, setDialogFechar] = React.useState(false);
  const [resumoFechamento, setResumoFechamento] = React.useState<CaixaResumo | null>(null);

  // Campos dos diálogos de entrada/sangria
  const [valorMov, setValorMov] = React.useState("");
  const [motivoMov, setMotivoMov] = React.useState("");

  const resumoAtual = React.useMemo(
    () => calcularResumoCaixa(movimentacoes, saldoInicial),
    [movimentacoes, saldoInicial]
  );

  const vendasPorForma = FORMAS_PAGAMENTO.map((forma) => ({
    forma,
    valor: resumoAtual.vendasPorMetodo[forma.value] ?? 0,
  })).filter((linha) => linha.valor > 0);

  function abrirCaixaConfirmar() {
    abrirCaixa(Math.max(0, lerValor(valorInicial)));
    setValorInicial("");
  }

  function confirmarEntrada() {
    const valor = lerValor(valorMov);
    if (valor <= 0) return;
    registrarEntrada(valor, motivoMov.trim());
    setValorMov("");
    setMotivoMov("");
    setDialogEntrada(false);
  }

  function confirmarSangria() {
    const valor = lerValor(valorMov);
    if (valor <= 0) return;
    registrarSangria(valor, motivoMov.trim());
    setValorMov("");
    setMotivoMov("");
    setDialogSangria(false);
  }

  async function confirmarFechamento() {
    setDialogFechar(false);
    const resumo = await fecharCaixa();
    if (resumo) {
      setResumoFechamento(resumo);
      toast.success("Caixa fechado. Até a próxima!");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <RepassesPendentes />
      <PageHeader
        title="Caixa"
        description={
          aberto
            ? `Aberto às ${formatHora(new Date(aberturaEm ?? Date.now()))} · saldo inicial de ${formatBRL(saldoInicial)}.`
            : "Abra o caixa para começar o turno. Vendas em dinheiro exigem caixa aberto."
        }
      />

      {!aberto ? (
        <Card className="mx-auto w-full max-w-md">
          <div className="flex flex-col gap-6 p-6 sm:p-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
              <LockKeyhole className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-semibold">Caixa fechado</h3>
              <p className="mt-1.5 text-base text-muted-foreground">
                Informe o valor inicial em espécie na gaveta para abrir o
                turno.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="valor-inicial">Valor inicial (R$)</Label>
              <Input
                id="valor-inicial"
                inputMode="decimal"
                placeholder="R$ 0,00"
                value={valorInicial}
                onChange={(e) => setValorInicial(e.target.value)}
              />
            </div>

            <Button size="lg" className="w-full" onClick={abrirCaixaConfirmar}>
              <Banknote className="h-5 w-5" />
              Abrir caixa
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {/* Resumo do dia */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Total vendido hoje"
              value={formatBRL(resumoAtual.totalVendas)}
              hint={`Dinheiro ${formatBRL(resumoAtual.vendasDinheiro)} · Outros ${formatBRL(resumoAtual.vendasOutras)}`}
              icon={ReceiptText}
            />
            <StatCard
              label="Dinheiro na gaveta"
              value={formatBRL(resumoAtual.dinheiroEmCaixa)}
              hint="Esperado em espécie (inclui trocos e sangrias)"
              icon={Banknote}
            />
            <StatCard
              label="Movimentações"
              value={String(movimentacoes.length)}
              hint={`${resumoAtual.sangrias} sangrias · ${resumoAtual.trocos} trocos`}
              icon={Wallet}
            />
          </div>

          {vendasPorForma.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {vendasPorForma.map(({ forma, valor }) => (
                <span
                  key={forma.value}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm font-semibold"
                >
                  {forma.label}
                  <span className="tabular text-muted-foreground">{formatBRL(valor)}</span>
                </span>
              ))}
            </div>
          )}

          {/* Ações do caixa */}
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => { setValorMov(""); setMotivoMov(""); setDialogEntrada(true); }}>
              <Plus className="h-5 w-5" />
              Entrada
            </Button>
            <Button variant="outline" onClick={() => { setValorMov(""); setMotivoMov(""); setDialogSangria(true); }}>
              <ArrowDownCircle className="h-5 w-5" />
              Sangria
            </Button>
            <Button variant="destructive" onClick={() => setDialogFechar(true)}>
              <Landmark className="h-5 w-5" />
              Fechar caixa
            </Button>
          </div>

          <Separator />

          {/* Movimentações */}
          <div className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold">Movimentações de hoje</h3>
            {movimentacoes.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="Nenhuma movimentação"
                description="As vendas do PDV aparecem aqui automaticamente."
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {[...movimentacoes].reverse().map((mov) => {
                  const cfg = TIPO_MOVIMENTACAO[mov.tipo];
                  const Icon = cfg.icon;
                  return (
                    <li
                      key={mov.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-secondary", cfg.cor)}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <div className="flex flex-col">
                          <span className="font-semibold leading-tight">{mov.descricao}</span>
                          <span className="text-xs text-muted-foreground tabular">
                            {formatHora(new Date(mov.criadoEm))}
                          </span>
                        </div>
                      </div>
                      <span className={cn("font-bold tabular", cfg.sinal > 0 ? "text-status-free" : "text-destructive")}>
                        {cfg.sinal > 0 ? "+" : "−"}
                        {formatBRL(mov.valor)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}

      {/* Entrada extra */}
      <Dialog open={dialogEntrada} onOpenChange={setDialogEntrada}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Entrada extra</DialogTitle>
            <DialogDescription>
              Registra dinheiro colocado na gaveta além das vendas (ex.:
              troco comprado).
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="valor-entrada">Valor (R$)</Label>
              <Input
                id="valor-entrada"
                inputMode="decimal"
                placeholder="R$ 0,00"
                value={valorMov}
                onChange={(e) => setValorMov(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="motivo-entrada">Motivo (opcional)</Label>
              <Input
                id="motivo-entrada"
                placeholder="Ex.: troco comprado"
                value={motivoMov}
                onChange={(e) => setMotivoMov(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogEntrada(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmarEntrada} disabled={lerValor(valorMov) <= 0}>
              Registrar entrada
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sangria */}
      <Dialog open={dialogSangria} onOpenChange={setDialogSangria}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Sangria</DialogTitle>
            <DialogDescription>
              Retirada de dinheiro da gaveta (ex.: pagamento de fornecedor).
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="valor-sangria">Valor (R$)</Label>
              <Input
                id="valor-sangria"
                inputMode="decimal"
                placeholder="R$ 0,00"
                value={valorMov}
                onChange={(e) => setValorMov(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="motivo-sangria">Motivo (opcional)</Label>
              <Input
                id="motivo-sangria"
                placeholder="Ex.: pagamento de fornecedor"
                value={motivoMov}
                onChange={(e) => setMotivoMov(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogSangria(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmarSangria}
              disabled={lerValor(valorMov) <= 0}
            >
              Registrar sangria
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fechar caixa (com preview) */}
      <Dialog open={dialogFechar} onOpenChange={setDialogFechar}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Fechar caixa?</DialogTitle>
            <DialogDescription>
              Confira o resumo do turno antes de confirmar. O caixa só pode
              ser reaberto depois.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2 rounded-xl border border-border bg-secondary/40 p-4 text-sm">
            <LinhaResumo label="Saldo inicial" valor={formatBRL(resumoAtual.saldoInicial)} />
            <LinhaResumo label="Total vendido" valor={formatBRL(resumoAtual.totalVendas)} />
            <LinhaResumo label="  Dinheiro" valor={formatBRL(resumoAtual.vendasDinheiro)} />
            <LinhaResumo label="  Cartão/Pix" valor={formatBRL(resumoAtual.vendasOutras)} />
            <LinhaResumo label="Trocos dados" valor={`− ${formatBRL(resumoAtual.trocos)}`} />
            <LinhaResumo label="Sangrias" valor={`− ${formatBRL(resumoAtual.sangrias)}`} />
            <LinhaResumo label="Entradas extras" valor={`+ ${formatBRL(resumoAtual.entradas)}`} />
            <Separator className="my-1" />
            <LinhaResumo
              label="Dinheiro em caixa"
              valor={formatBRL(resumoAtual.dinheiroEmCaixa)}
              destaque
            />
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogFechar(false)}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={confirmarFechamento}>
              Fechar caixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resumo final após fechar */}
      <Dialog
        open={resumoFechamento !== null}
        onOpenChange={(open) => !open && setResumoFechamento(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-status-free-bg text-status-free">
              <Banknote className="h-7 w-7" />
            </div>
            <DialogTitle>Caixa fechado</DialogTitle>
            <DialogDescription>Resumo final do turno.</DialogDescription>
          </DialogHeader>

          {resumoFechamento && (
            <div className="flex flex-col gap-2 rounded-xl border border-border bg-secondary/40 p-4 text-sm">
              <LinhaResumo label="Saldo inicial" valor={formatBRL(resumoFechamento.saldoInicial)} />
              <LinhaResumo label="Total vendido" valor={formatBRL(resumoFechamento.totalVendas)} />
              <LinhaResumo label="Trocos dados" valor={`− ${formatBRL(resumoFechamento.trocos)}`} />
              <LinhaResumo label="Sangrias" valor={`− ${formatBRL(resumoFechamento.sangrias)}`} />
              <Separator className="my-1" />
              <LinhaResumo
                label="Dinheiro em caixa"
                valor={formatBRL(resumoFechamento.dinheiroEmCaixa)}
                destaque
              />
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setResumoFechamento(null)}>Concluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LinhaResumo({
  label,
  valor,
  destaque,
}: {
  label: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-2", destaque && "text-base font-bold text-foreground")}>
      <span className={cn(!destaque && "text-muted-foreground")}>{label}</span>
      <span className="tabular">{valor}</span>
    </div>
  );
}

"use client";

import * as React from "react";
import { AlertTriangle, Banknote, CheckCircle2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ToggleButton } from "@/components/ui/toggle-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn, formatBRL } from "@/lib/utils";
import { calcularTotais, type ItemPedido } from "@/lib/catalogo";
import {
  FORMAS_PAGAMENTO,
  type FormaPagamento,
} from "@/app/pdv/_lib/mock-data";

export interface PagamentoConfirmado {
  forma: FormaPagamento;
  /** Valor efetivamente aplicado a esta cobrança (pode ser parcial — conta dividida). */
  valorPago: number;
  valorRecebido?: number;
  troco?: number;
}

interface PagamentoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titulo: string;
  descricao?: string;
  /** De onde vem a cobrança — "Balcão", "Mesa 03", "Retirada — Ana". */
  contexto: string;
  clienteNome?: string;
  itens: ItemPedido[];
  total: number;
  /** Saldo ainda em aberto (conta dividida) — se omitido, é igual a `total`. */
  saldoRestante?: number;
  /** Permite pagar menos que o saldo (conta dividida entre várias pessoas/formas). */
  permitirDividir?: boolean;
  /** Forma já escolhida na tela (ex.: venda do balcão selecionou no resumo). */
  formaInicial?: FormaPagamento | null;
  /** Vendas em dinheiro exigem caixa aberto (regra do PDV). */
  caixaAberto: boolean;
  onConfirmar: (pagamento: PagamentoConfirmado) => void;
}

/**
 * PagamentoDialog — cobrança de um valor (venda do balcão, comanda de mesa
 * ou pedido de retirada). Escolha da forma de pagamento; em dinheiro, o
 * operador informa o valor recebido e o troco é calculado na hora. Vendas
 * em dinheiro ficam bloqueadas com o caixa fechado.
 *
 * Conta dividida (PEDIDO 11): quando `permitirDividir` é true, aparece um
 * campo "Valor a pagar agora" — o operador pode registrar só parte do
 * saldo (ex.: R$ 50 de R$ 200) com uma forma, e repetir a cobrança com
 * outra forma/pessoa até quitar. O saldo restante some sozinho conforme
 * os pagamentos entram (ver `saldoRestante`, atualizado pelo backend).
 */
export function PagamentoDialog({
  open,
  onOpenChange,
  titulo,
  descricao,
  contexto,
  clienteNome,
  itens,
  total,
  saldoRestante,
  permitirDividir = false,
  formaInicial = null,
  caixaAberto,
  onConfirmar,
}: PagamentoDialogProps) {
  const saldo = saldoRestante ?? total;
  const [forma, setForma] = React.useState<FormaPagamento | null>(null);
  const [valorRecebido, setValorRecebido] = React.useState("");
  const [valorAPagarTexto, setValorAPagarTexto] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setForma(formaInicial);
      setValorRecebido("");
      setValorAPagarTexto(saldo.toFixed(2).replace(".", ","));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, formaInicial]);

  // Conta dividida: a cada pagamento parcial confirmado, o saldo cai —
  // atualiza o valor sugerido da próxima parcela para o novo saldo
  // (sem isso, o campo continuaria mostrando o valor anterior).
  React.useEffect(() => {
    if (open) {
      setValorAPagarTexto(saldo.toFixed(2).replace(".", ","));
      setValorRecebido("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saldo]);

  const { totalItens } = calcularTotais(itens);

  const valorAPagar =
    parseFloat(valorAPagarTexto.replace(",", ".").replace(/[^0-9.]/g, "")) || 0;
  const ehParcial = permitirDividir && valorAPagar < saldo - 0.01;

  const recebido =
    parseFloat(valorRecebido.replace(",", ".").replace(/[^0-9.,]/g, "")) || 0;
  const troco =
    forma === "dinheiro" && recebido > 0 && recebido >= valorAPagar ? recebido - valorAPagar : null;

  const dinheiroBloqueado = forma === "dinheiro" && !caixaAberto;
  const valorValido = valorAPagar > 0 && valorAPagar <= saldo + 0.01;
  const podeConfirmar =
    forma !== null &&
    !dinheiroBloqueado &&
    valorValido &&
    (forma !== "dinheiro" || (recebido > 0 && recebido >= valorAPagar));

  function confirmar() {
    if (!forma || !podeConfirmar) return;
    onConfirmar({
      forma,
      valorPago: Math.round(valorAPagar * 100) / 100,
      valorRecebido: forma === "dinheiro" ? recebido : undefined,
      troco: troco ?? undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
            <Banknote className="h-7 w-7" />
          </div>
          <DialogTitle>{titulo}</DialogTitle>
          {descricao && <DialogDescription>{descricao}</DialogDescription>}
        </DialogHeader>

        {/* Resumo da cobrança */}
        <div className="rounded-xl border border-dashed border-border bg-secondary/40 p-4 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-foreground">{contexto}</span>
            <span className="text-muted-foreground">
              {totalItens} {totalItens === 1 ? "item" : "itens"}
            </span>
          </div>
          {clienteNome && (
            <p className="mt-0.5 text-muted-foreground">Cliente: {clienteNome}</p>
          )}
          <Separator className="my-2.5" />
          <div className="flex justify-between text-lg font-bold text-foreground">
            <span>Total</span>
            <span className="tabular">{formatBRL(total)}</span>
          </div>
          {permitirDividir && saldo < total - 0.01 && (
            <div className="mt-1 flex justify-between text-sm font-semibold text-primary">
              <span>Saldo em aberto</span>
              <span className="tabular">{formatBRL(saldo)}</span>
            </div>
          )}
        </div>

        {/* Conta dividida: valor desta parcela (padrão = saldo inteiro) */}
        {permitirDividir && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="valor-a-pagar">Valor a pagar agora</Label>
            <Input
              id="valor-a-pagar"
              inputMode="decimal"
              placeholder="R$ 0,00"
              value={valorAPagarTexto}
              onChange={(e) => setValorAPagarTexto(e.target.value)}
            />
            {ehParcial && (
              <p className="text-xs text-muted-foreground">
                Pagamento parcial — depois desta parcela, faltam{" "}
                {formatBRL(Math.max(0, saldo - valorAPagar))}. Repita a cobrança para a próxima
                pessoa/forma.
              </p>
            )}
          </div>
        )}

        {/* Forma de pagamento */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground/90">Forma de pagamento</span>
          <div className="grid grid-cols-2 gap-2">
            {FORMAS_PAGAMENTO.map((opcao) => (
              <ToggleButton
                key={opcao.value}
                pressed={forma === opcao.value}
                onClick={() => setForma(opcao.value)}
              >
                {opcao.label}
              </ToggleButton>
            ))}
          </div>
        </div>

        {/* Dinheiro: valor recebido + troco */}
        {forma === "dinheiro" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="valor-recebido">Valor recebido (R$)</Label>
              <Input
                id="valor-recebido"
                inputMode="decimal"
                placeholder="R$ 0,00"
                value={valorRecebido}
                onChange={(e) => setValorRecebido(e.target.value)}
              />
            </div>
            {troco !== null && (
              <div className="flex items-center justify-between rounded-xl bg-status-free-bg px-4 py-3 text-sm font-semibold text-status-free">
                <span>Troco</span>
                <span className="tabular">{formatBRL(troco)}</span>
              </div>
            )}
          </div>
        )}

        {dinheiroBloqueado && (
          <div className="flex items-start gap-3 rounded-xl border border-status-waiting-border bg-status-waiting-bg px-4 py-3 text-sm text-status-waiting">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>
              O caixa está fechado. Abra o caixa (módulo Caixa) para receber
              em dinheiro.
            </span>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button onClick={confirmar} disabled={!podeConfirmar}>
            <CheckCircle2 className="h-5 w-5" />
            {ehParcial ? "Confirmar parcela" : "Confirmar pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

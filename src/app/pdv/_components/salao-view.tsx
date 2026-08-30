"use client";

import * as React from "react";
import { toast } from "sonner";
import { Armchair, ArrowLeft, DoorOpen, Plus, Printer, Receipt, ShoppingBag, Users, UtensilsCrossed, Watch } from "lucide-react";

import { PageHeader } from "@/components/patterns/page-header";
import { TableCard } from "@/components/patterns/table-card";
import { EmptyState } from "@/components/patterns/empty-state";
import { ItemPedidoRow } from "@/components/patterns/item-pedido-row";
import { Button } from "@/components/ui/button";
import { StepperButton } from "@/components/ui/stepper-button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmarAcao } from "@/components/patterns/confirmar-acao";
import { Separator } from "@/components/ui/separator";
import { useRelogio } from "@/hooks/use-relogio";
import { formatBRL, formatElapsed } from "@/lib/utils";
import { calcularTotais } from "@/lib/catalogo";
import type { Mesa } from "@/lib/mesas";
import { useSalao, type Comanda } from "@/app/pdv/_lib/salao-context";
import { useCobranca } from "@/app/pdv/_lib/use-cobranca";
import { PagamentoDialog } from "@/app/pdv/_components/pagamento-dialog";
import { NfceDialog } from "@/app/pdv/_components/nfce-dialog";
import { CatalogoProdutos } from "@/app/garcom/_components/catalogo-produtos";
import type { Produto } from "@/lib/catalogo";

function elapsedDeMesa(mesa: Mesa, comanda: Comanda | undefined, agora: Date) {
  const base = comanda?.abertaEm ?? mesa.abertaEm;
  if (base) {
    return Math.max(0, Math.floor((agora.getTime() - base) / 60_000));
  }
  return mesa.elapsedMinutes;
}

export function SalaoView() {
  const { mesas, comandas, abrirMesa, adicionarItem, atualizarQuantidade, removerItem, finalizarMesa, liberarMesa, cobrarComanda, recarregar } = useSalao();
  const agora = useRelogio();
  const cobranca = useCobranca();
  const [mesaSelecionada, setMesaSelecionada] = React.useState<number | null>(null);
  const [mesaParaAbrir, setMesaParaAbrir] = React.useState<Mesa | null>(null);
  const [pessoas, setPessoas] = React.useState(2);
  const [imprimirAberto, setImprimirAberto] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);
  const [imprimindo, setImprimindo] = React.useState(false);
  const [comandaMobileAberta, setComandaMobileAberta] = React.useState(false);

  const comanda = mesaSelecionada !== null ? comandas[mesaSelecionada] : undefined;
  const mesa = mesas.find((m) => m.id === mesaSelecionada);
  const { total, totalItens } = calcularTotais(comanda?.itens ?? []);

  const mesaPulso = mesas.reduce<Mesa | null>((antiga, m) => {
    if (m.status !== "conta") return antiga;
    const elapsed = elapsedDeMesa(m, comandas[m.id], agora) ?? 0;
    const elapsedAntiga = antiga ? elapsedDeMesa(antiga, comandas[antiga.id], agora) ?? 0 : -1;
    return elapsed > elapsedAntiga ? m : antiga;
  }, null);

  const mesasComComanda = Object.keys(comandas).length;

  function handleClickMesa(mesa: Mesa) {
    if (mesa.status === "livre") {
      setPessoas(2);
      setMesaParaAbrir(mesa);
      return;
    }
    setMesaSelecionada(mesa.id);
  }

  async function confirmarAberturaMesa() {
    if (!mesaParaAbrir) return;
    const id = mesaParaAbrir.id;
    try {
      await abrirMesa(id, pessoas);
      toast.success(`Mesa ${String(id).padStart(2, "0")} aberta.`);
      setMesaParaAbrir(null);
      setMesaSelecionada(id);
    } catch (erro) {
      toast.error(`Falha ao abrir mesa: ${erro instanceof Error ? erro.message : "erro desconhecido"}`);
    }
  }

  function handleAdicionarProduto(
    produto: Produto,
    escolha?: { tamanhoId: string; tamanhoNome: string; precoUnit: number; quantidade?: number; sabores: Produto["sabores"]; adicionais: Produto["adicionais"]; observacao?: string }
  ) {
    if (mesaSelecionada === null) return;
    adicionarItem(mesaSelecionada, {
      produtoId: produto.id,
      nome: `${produto.nome}${escolha?.tamanhoNome ? ` ${escolha.tamanhoNome}` : ""}${escolha?.sabores && escolha.sabores.length > 0 ? ` (${escolha.sabores.map((s) => s.nome).join(" + ")})` : ""}${escolha?.adicionais && escolha.adicionais.length > 0 ? ` + ${escolha.adicionais.map((a) => `${(a.quantidade ?? 1) > 1 ? `${a.quantidade}x ` : ""}${a.nome}`).join(", ")}` : ""}`,
      precoUnit: escolha?.precoUnit ?? produto.preco,
      quantidade: Math.max(1, Math.floor(escolha?.quantidade ?? 1)),
      observacao: escolha?.observacao,
      tamanhoId: escolha?.tamanhoId,
      tamanhoNome: escolha?.tamanhoNome,
      sabores: escolha?.sabores,
      adicionais: escolha?.adicionais,
    });
    toast.success(`${produto.nome} adicionado.`, { duration: 1500 });
  }

  function handleFinalizar() {
    if (!comanda) return;
    if (comanda.itens.length === 0) {
      toast.error("Adicione itens antes de finalizar.");
      return;
    }
    void finalizarMesa(comanda.mesaId);
  }

  async function handleSalvar() {
    if (!comanda || salvando) return;
    setSalvando(true);
    try {
      await recarregar();
      toast.success("Comanda salva.");
    } catch (erro) {
      toast.error(`Falha ao salvar: ${erro instanceof Error ? erro.message : "erro desconhecido"}`);
    } finally {
      setSalvando(false);
    }
  }

  async function handleSalvarImprimir() {
    if (!comanda || imprimindo) return;
    setImprimindo(true);
    try {
      await recarregar();
      toast.success("Comanda salva e enviada para impressão.");
      setImprimirAberto(true);
    } catch (erro) {
      toast.error(`Falha ao salvar/imprimir: ${erro instanceof Error ? erro.message : "erro desconhecido"}`);
    } finally {
      setImprimindo(false);
    }
  }

  async function handleLiberarMesa() {
    if (mesaSelecionada === null) return;
    const id = mesaSelecionada;
    try {
      await liberarMesa(id);
      setMesaSelecionada(null);
    } catch (erro) {
      toast.error(`Falha ao liberar mesa: ${erro instanceof Error ? erro.message : "erro desconhecido"}`);
    }
  }

  function handleCobrar() {
    if (!comanda) return;
    if (comanda.itens.length === 0) {
      toast.error("Adicione itens antes de cobrar.");
      return;
    }
    const contexto = `Mesa ${String(comanda.mesaId).padStart(2, "0")}`;
    cobranca.abrirPagamento(
      {
        contexto,
        itens: comanda.itens,
        total,
        canal: "salao",
        pedidoId: comanda.pedidoId,
        mesaId: comanda.mesaId,
      },
      () => {
        cobrarComanda(comanda.mesaId);
        setMesaSelecionada(null);
        toast.success(`Mesa ${String(comanda.mesaId).padStart(2, "0")} cobrada.`);
      }
    );
  }

  // ── Tela de catálogo + comanda lado a lado ──────────────────────
  if (mesaSelecionada !== null && mesa) {
    return (
      <div className="flex flex-col h-full pb-16 lg:pb-0">
        {/* Barra de topo da mesa */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3 bg-background">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Voltar para mesas"
            onClick={() => setMesaSelecionada(null)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex flex-col">
            <h2 className="text-lg font-bold leading-tight">
              Mesa {String(mesa.id).padStart(2, "0")}
            </h2>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {comanda?.pessoas ?? mesa.pessoas ?? 2} pessoas
              </span>
              <span className="flex items-center gap-1">
                <Watch className="h-3 w-3" />
                {formatElapsed(elapsedDeMesa(mesa, comanda, agora) ?? 0)}
              </span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSalvar} disabled={!comanda || salvando}>
              <ShoppingBag className="mr-1 h-4 w-4" />
              {salvando ? "Salvando..." : "Salvar"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleSalvarImprimir} disabled={!comanda || comanda.itens.length === 0 || imprimindo}>
              <Printer className="mr-1 h-4 w-4" />
              {imprimindo ? "Enviando..." : "Imprimir"}
            </Button>
            <ConfirmarAcao
              titulo={`Liberar a mesa ${String(mesa.id).padStart(2, "0")} sem cobrar?`}
              descricao={
                totalItens > 0
                  ? `Esta comanda tem ${totalItens} ${totalItens === 1 ? "item" : "itens"} (${formatBRL(total)}) que NÃO serão cobrados. A mesa volta a ficar livre.`
                  : "A mesa volta a ficar livre. Nenhum consumo foi lançado nela."
              }
              textoConfirmar="Liberar mesa"
              aoConfirmar={() => void handleLiberarMesa()}
              trigger={
                <Button variant="ghost" size="sm">
                  <DoorOpen className="mr-1 h-4 w-4" />
                  Liberar
                </Button>
              }
            />
          </div>
        </div>

        {/* Lado a lado: catálogo + comanda */}
        <div className="flex flex-1 overflow-hidden">
          {/* Catálogo — lado esquerdo */}
          <div className="flex-1 overflow-y-auto bg-muted/30">
            <div className="p-4">
              <CatalogoProdutos onAdicionar={handleAdicionarProduto} />
            </div>
          </div>

          {/* Comanda — lado direito */}
          <div className="w-[380px] border-l border-border bg-background flex flex-col overflow-hidden lg:flex hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="font-semibold text-sm">
                <Receipt className="mr-1.5 inline h-4 w-4" />
                Comanda
              </h3>
              {totalItens > 0 && (
                <span className="text-sm font-bold tabular">{formatBRL(total)}</span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {!comanda || comanda.itens.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Receipt className="mb-3 h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Nenhum item adicionado</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Toque nos produtos ao lado para iniciar</p>
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {comanda.itens.map((item) => (
                    <ItemPedidoRow
                      key={item.uid}
                      item={item}
                      compacto
                      onQuantidade={(uid, q) => atualizarQuantidade(comanda.mesaId, uid, q)}
                      onRemover={(uid) => removerItem(comanda.mesaId, uid)}
                    />
                  ))}
                </ul>
              )}
            </div>

            {/* Rodapé da comanda */}
            <div className="border-t border-border px-4 py-3 flex flex-col gap-2">
              {totalItens > 0 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{totalItens} {totalItens === 1 ? "item" : "itens"}</span>
                  <span className="font-bold text-foreground tabular">{formatBRL(total)}</span>
                </div>
              )}
              <Button
                size="lg"
                className="w-full"
                disabled={totalItens === 0}
                onClick={handleCobrar}
              >
                <Receipt className="h-5 w-5" />
                Cobrar mesa
              </Button>
            </div>
          </div>
        </div>

        {/* Pré-visualização de impressão */}
        <Dialog open={imprimirAberto} onOpenChange={setImprimirAberto}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Comanda — Mesa {String(mesa.id).padStart(2, "0")}</DialogTitle>
              <DialogDescription>
                Pré-visualização do que será enviado para a impressora da cozinha.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-xl border border-dashed border-border bg-secondary/40 p-4 font-mono text-sm">
              <p className="font-semibold">Comanda</p>
              <p className="text-muted-foreground">
                Mesa {String(mesa.id).padStart(2, "0")} · {comanda?.pessoas ?? "-"} pessoas
              </p>
              <Separator className="my-2" />
              <ul className="flex flex-col gap-1.5">
                {comanda?.itens.map((item) => (
                  <li key={item.uid}>
                    <div className="flex justify-between gap-2">
                      <span>{item.quantidade}x {item.nome}</span>
                      <span className="tabular">{formatBRL(item.precoUnit * item.quantidade)}</span>
                    </div>
                    {item.observacao && (
                      <p className="pl-4 text-xs italic text-muted-foreground">obs: {item.observacao}</p>
                    )}
                  </li>
                ))}
              </ul>
              <Separator className="my-2" />
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span className="tabular">{formatBRL(total)}</span>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setImprimirAberto(false)}>
                Fechar
              </Button>
              <Button onClick={() => { window.print(); setImprimirAberto(false); }}>
                <Printer className="h-5 w-5" />
                Imprimir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Fluxo de cobrança */}
        <PagamentoDialog
          open={cobranca.pagamentoAberto}
          onOpenChange={cobranca.setPagamentoAberto}
          titulo="Cobrar mesa"
          descricao="Confira a forma de pagamento, divida se necessário e confirme."
          contexto={cobranca.cobranca?.contexto ?? ""}
          clienteNome={cobranca.cobranca?.clienteNome}
          itens={cobranca.cobranca?.itens ?? []}
          total={cobranca.cobranca?.total ?? 0}
          saldoRestante={cobranca.saldoRestante}
          permitirDividir
          caixaAberto={cobranca.caixaAberto}
          onConfirmar={cobranca.confirmarPagamento}
        />
        <NfceDialog cupom={cobranca.cupom} onConcluir={cobranca.concluir} />

        {/* Barra flutuante mobile — resumo da comanda */}
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background px-4 py-3 lg:hidden">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setComandaMobileAberta(true)}
              className="flex items-center gap-3 text-left"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                {totalItens}
              </div>
              <div>
                <p className="text-sm font-medium">
                  {totalItens === 0 ? "Nenhum item" : `${totalItens} ${totalItens === 1 ? "item" : "itens"}`}
                </p>
                <p className="text-xs text-muted-foreground">Toque para ver a comanda</p>
              </div>
            </button>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tabular">{formatBRL(total)}</span>
              <Button
                size="sm"
                disabled={totalItens === 0}
                onClick={handleCobrar}
              >
                Cobrar
              </Button>
            </div>
          </div>
        </div>

        {/* Comanda mobile — Sheet lateral */}
        <Sheet open={comandaMobileAberta} onOpenChange={setComandaMobileAberta}>
          <SheetContent className="w-full overflow-y-auto sm:max-w-md">
            <div className="mb-4 flex items-center gap-2">
              <SheetTitle>
                Comanda — Mesa {String(mesa.id).padStart(2, "0")}
              </SheetTitle>
            </div>
            <SheetDescription>
              Itens adicionados a esta mesa.
            </SheetDescription>

            <div className="mt-4 flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Users className="h-4 w-4" />
                  {comanda?.pessoas ?? mesa.pessoas ?? 2} pessoas
                </span>
                <span className="flex items-center gap-1.5">
                  <Watch className="h-4 w-4" />
                  {formatElapsed(elapsedDeMesa(mesa, comanda, agora) ?? 0)}
                </span>
              </div>

              <Separator />

              {/* Ações */}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={handleSalvar} disabled={!comanda || salvando}>
                  <ShoppingBag className="mr-1 h-4 w-4" />
                  {salvando ? "Salvando..." : "Salvar"}
                </Button>
                <Button variant="outline" size="sm" onClick={handleSalvarImprimir} disabled={!comanda || comanda.itens.length === 0 || imprimindo}>
                  <Printer className="mr-1 h-4 w-4" />
                  {imprimindo ? "Enviando..." : "Imprimir"}
                </Button>
                <Button variant="outline" size="sm" onClick={handleFinalizar} disabled={totalItens === 0}>
                  <Receipt className="mr-1 h-4 w-4" />
                  Finalizar
                </Button>
                <ConfirmarAcao
                  titulo={`Liberar a mesa ${String(mesa.id).padStart(2, "0")} sem cobrar?`}
                  descricao={
                    totalItens > 0
                      ? `Esta comanda tem ${totalItens} ${totalItens === 1 ? "item" : "itens"} (${formatBRL(total)}) que NÃO serão cobrados.`
                      : "A mesa volta a ficar livre."
                  }
                  textoConfirmar="Liberar mesa"
                  aoConfirmar={() => void handleLiberarMesa()}
                  trigger={
                    <Button variant="ghost" size="sm">
                      <DoorOpen className="mr-1 h-4 w-4" />
                      Liberar
                    </Button>
                  }
                />
              </div>

              <Separator />

              {/* Itens */}
              {!comanda || comanda.itens.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <Receipt className="mb-2 h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Nenhum item ainda</p>
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {comanda.itens.map((item) => (
                    <ItemPedidoRow
                      key={item.uid}
                      item={item}
                      compacto
                      onQuantidade={(uid, q) => atualizarQuantidade(comanda.mesaId, uid, q)}
                      onRemover={(uid) => removerItem(comanda.mesaId, uid)}
                    />
                  ))}
                </ul>
              )}

              {totalItens > 0 && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{totalItens} itens</span>
                    <span className="text-lg font-bold tabular">{formatBRL(total)}</span>
                  </div>
                </>
              )}

              <Button size="lg" className="w-full" disabled={totalItens === 0} onClick={handleCobrar}>
                <Receipt className="h-5 w-5" />
                Cobrar mesa
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        {/* Dialog de abrir mesa */}
        <Dialog
          open={mesaParaAbrir !== null}
          onOpenChange={(open) => !open && setMesaParaAbrir(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Abrir mesa {mesaParaAbrir ? String(mesaParaAbrir.id).padStart(2, "0") : ""}
              </DialogTitle>
              <DialogDescription>
                Informe quantas pessoas vão sentar para abrir a mesa.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center gap-4 py-2">
              <span className="text-sm font-medium text-muted-foreground">Número de pessoas</span>
              <StepperButton value={pessoas} onChange={setPessoas} min={1} max={20} />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setMesaParaAbrir(null)}>Cancelar</Button>
              <Button onClick={() => void confirmarAberturaMesa()}>Abrir mesa</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── Tela de mesas (mapa) ────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Salão"
        description={
          mesasComComanda > 0
            ? `${mesasComComanda} ${mesasComComanda === 1 ? "mesa com comanda" : "mesas com comanda"} para cobrar. Toque numa mesa para ver o pedido.`
            : "Toque numa mesa ocupada para ver a comanda e cobrar."
        }
      />

      {mesas.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title="Nenhuma mesa cadastrada"
          description="Cadastre as mesas do salão em Configurações para começar a usar o mapa de mesas."
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {mesas.map((mesa) => {
            const comandaDaMesa = comandas[mesa.id];
            const valorMesa = comandaDaMesa
              ? comandaDaMesa.itens.reduce((soma, i) => soma + i.precoUnit * i.quantidade, 0)
              : undefined;
            return (
              <TableCard
                key={mesa.id}
                number={mesa.id}
                status={mesa.status}
                elapsedMinutes={elapsedDeMesa(mesa, comandaDaMesa, agora)}
                valor={valorMesa}
                pulse={mesaPulso?.id === mesa.id}
                onClick={() => handleClickMesa(mesa)}
              />
            );
          })}
        </div>
      )}

      {/* Dialog de abrir mesa livre */}
      <Dialog
        open={mesaParaAbrir !== null}
        onOpenChange={(open) => !open && setMesaParaAbrir(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Abrir mesa {mesaParaAbrir ? String(mesaParaAbrir.id).padStart(2, "0") : ""}
            </DialogTitle>
            <DialogDescription>
              Informe quantas pessoas vão sentar para abrir a mesa.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-2">
            <span className="text-sm font-medium text-muted-foreground">Número de pessoas</span>
            <StepperButton value={pessoas} onChange={setPessoas} min={1} max={20} />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMesaParaAbrir(null)}>Cancelar</Button>
            <Button onClick={() => void confirmarAberturaMesa()}>Abrir mesa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

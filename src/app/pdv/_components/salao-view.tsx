"use client";

import * as React from "react";
import { toast } from "sonner";
import { Printer, UtensilsCrossed } from "lucide-react";

import { PageHeader } from "@/components/patterns/page-header";
import { TableCard } from "@/components/patterns/table-card";
import { EmptyState } from "@/components/patterns/empty-state";
import { Button } from "@/components/ui/button";
import { StepperButton } from "@/components/ui/stepper-button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useRelogio } from "@/hooks/use-relogio";
import { formatBRL } from "@/lib/utils";
import { calcularTotais } from "@/lib/catalogo";
import type { Mesa } from "@/lib/mesas";
import type { Produto, CatalogoApi } from "@/lib/catalogo";
import { useApi, api } from "@/lib/api-cliente";
import { useSalao, type Comanda } from "@/app/pdv/_lib/salao-context";
import { useCobranca } from "@/app/pdv/_lib/use-cobranca";
import { PagamentoDialog } from "@/app/pdv/_components/pagamento-dialog";
import { NfceDialog } from "@/app/pdv/_components/nfce-dialog";
import { PizzaPickerDialog } from "@/app/pdv/_components/pizza-picker-dialog";
import MesaPedidoOverlay from "@/app/pdv/_components/mesa-pedido-overlay";

const CATALOGO_FALLBACK: CatalogoApi = {
  categorias: [],
  categoriasDetalhadas: [],
  produtos: [],
  adicionais: [],
  saboresDisponiveis: [],
};

interface ConfigPizza {
  acrescimoPorSaborPremium: number;
  permitirMisturarDoceSalgada?: boolean;
}

const CONFIG_PIZZA_PADRAO: ConfigPizza = {
  acrescimoPorSaborPremium: 10.0,
  permitirMisturarDoceSalgada: true,
};

function elapsedDeMesa(mesa: Mesa, comanda: Comanda | undefined, agora: Date) {
  const base = comanda?.abertaEm ?? mesa.abertaEm;
  if (base) {
    return Math.max(0, Math.floor((agora.getTime() - base) / 60_000));
  }
  return mesa.elapsedMinutes;
}

export function SalaoView() {
  const { mesas, comandas, abrirMesa, adicionarItem, atualizarQuantidade, removerItem, cobrarComanda, recarregar } = useSalao();
  const agora = useRelogio();
  const cobranca = useCobranca();

  const catalogo = useApi<CatalogoApi>("/api/catalogo", CATALOGO_FALLBACK);
  const configPizza = useApi<ConfigPizza>("/api/config/pizza", CONFIG_PIZZA_PADRAO);

  const [mesaSelecionada, setMesaSelecionada] = React.useState<number | null>(null);
  const [mesaParaAbrir, setMesaParaAbrir] = React.useState<Mesa | null>(null);
  const [pessoas, setPessoas] = React.useState(2);
  const [imprimirAberto, setImprimirAberto] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);
  const [pickerProduto, setPickerProduto] = React.useState<Produto | null>(null);

  const comanda = mesaSelecionada !== null ? comandas[mesaSelecionada] : undefined;
  const mesa = mesas.find((m) => m.id === mesaSelecionada);
  const { total } = calcularTotais(comanda?.itens ?? []);

  const produtos = (catalogo.dados.produtos ?? []).filter((p) => p.ativo !== false);
  const adicionais = catalogo.dados.adicionais ?? [];
  const saboresDisponiveis = catalogo.dados.saboresDisponiveis ?? [];

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

  function adicionarProduto(
    produto: Produto,
    escolha?: { tamanhoId?: string; tamanhoNome?: string; precoUnit: number; quantidade?: number; sabores?: Produto["sabores"]; adicionais?: Produto["adicionais"]; observacao?: string }
  ) {
    if (mesaSelecionada === null) return;
    void adicionarItem(mesaSelecionada, {
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

  function onProductSelect(product: { id: string; name: string }) {
    const produto = produtos.find((p) => p.id === product.id);
    if (!produto) return;
    const temOpcoes = (produto.sabores?.length ?? 0) > 0 || (produto.tamanhos?.length ?? 0) > 0;
    if (temOpcoes) {
      setPickerProduto(produto);
      return;
    }
    adicionarProduto(produto);
  }

  function onIncrease(itemId: string) {
    if (mesaSelecionada === null || !comanda) return;
    const item = comanda.itens.find((i) => i.uid === itemId);
    if (!item) return;
    void atualizarQuantidade(mesaSelecionada, itemId, item.quantidade + 1);
  }

  function onDecrease(itemId: string) {
    if (mesaSelecionada === null || !comanda) return;
    const item = comanda.itens.find((i) => i.uid === itemId);
    if (!item) return;
    void atualizarQuantidade(mesaSelecionada, itemId, item.quantidade - 1);
  }

  function onRemove(itemId: string) {
    if (mesaSelecionada === null) return;
    void removerItem(mesaSelecionada, itemId);
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

  async function handleEnviarCozinha() {
    if (!comanda || mesaSelecionada === null || enviando) return;
    if (comanda.itens.length === 0) {
      toast.error("Adicione itens antes de enviar para a cozinha.");
      return;
    }
    setEnviando(true);
    try {
      // A comanda de salão já é o pedido aberto da mesa (gravado ao adicionar
      // itens via /api/mesas/[id]/itens). "Enviar para cozinha" REUTILIZA esse
      // pedido — enfileira a impressão da cozinha para ele, em vez de criar um
      // pedido novo (isso duplicaria a comanda). A fila é a mesma do fluxo
      // real de produção (POST /api/impressao → filaImpressao → agente).
      const pedidos = await api<{ pedidos: Array<{ id: string; numero: number }> }>(
        `/api/pedidos?canal=salao`
      );
      const pedidoDaMesa = pedidos.pedidos.find((p) => p.id === comanda.pedidoId);
      if (!pedidoDaMesa) {
        throw new Error("Comanda da mesa não encontrada no servidor.");
      }
      await api(`/api/impressao`, {
        method: "POST",
        body: JSON.stringify({
          tipo: "pedido-cozinha",
          referencia: `pedido:${pedidoDaMesa.numero}`,
        }),
      });
      toast.success(`Comanda da mesa ${String(mesaSelecionada).padStart(2, "0")} enviada para a cozinha.`);
    } catch (erro) {
      toast.error(`Falha ao enviar para a cozinha: ${erro instanceof Error ? erro.message : "erro desconhecido"}`);
    } finally {
      setEnviando(false);
    }
  }

  function handleImprimir() {
    if (!comanda || comanda.itens.length === 0) return;
    setImprimirAberto(true);
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

  const overlayProducts = produtos.map((p) => ({
    id: p.id,
    name: p.nome,
    price: p.preco,
    image: p.fotoUrl ?? null,
    category: p.categoria,
    requiresConfiguration: (p.sabores?.length ?? 0) > 0 || (p.tamanhos?.length ?? 0) > 0,
  }));

  const overlayItems = (comanda?.itens ?? []).map((i) => ({
    id: i.uid,
    productId: i.produtoId,
    name: i.nome,
    quantity: i.quantidade,
    unitPrice: i.precoUnit,
    description: i.observacao,
  }));

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
          {mesas.map((mesaItem) => {
            const comandaDaMesa = comandas[mesaItem.id];
            const valorMesa = comandaDaMesa
              ? comandaDaMesa.itens.reduce((soma, i) => soma + i.precoUnit * i.quantidade, 0)
              : undefined;
            return (
              <TableCard
                key={mesaItem.id}
                number={mesaItem.id}
                status={mesaItem.status}
                elapsedMinutes={elapsedDeMesa(mesaItem, comandaDaMesa, agora)}
                valor={valorMesa}
                pulse={mesaPulso?.id === mesaItem.id}
                onClick={() => handleClickMesa(mesaItem)}
              />
            );
          })}
        </div>
      )}

      {/* Overlay de atendimento da mesa (catálogo + comanda) */}
      <MesaPedidoOverlay
        open={mesaSelecionada !== null && mesa !== undefined}
        table={{
          id: mesa ? String(mesa.id) : "",
          name: mesa ? `Mesa ${String(mesa.id).padStart(2, "0")}` : "",
          openedAt: comanda?.abertaEm ? new Date(comanda.abertaEm) : undefined,
          commandNumber: comanda?.pedidoId,
        }}
        products={overlayProducts}
        items={overlayItems}
        onClose={() => setMesaSelecionada(null)}
        onProductSelect={onProductSelect}
        onIncrease={onIncrease}
        onDecrease={onDecrease}
        onRemove={onRemove}
        onSave={() => void handleSalvar()}
        onSendKitchen={() => void handleEnviarCozinha()}
        onPrint={handleImprimir}
        onFinalize={handleCobrar}
      />

      {/* Seletor de pizza/porção */}
      <PizzaPickerDialog
        open={pickerProduto !== null}
        onOpenChange={(open) => !open && setPickerProduto(null)}
        produto={pickerProduto}
        adicionais={adicionais}
        acrescimoPorSaborPremium={configPizza.dados.acrescimoPorSaborPremium}
        permitirMisturarDoceSalgada={configPizza.dados.permitirMisturarDoceSalgada}
        saboresDisponiveis={saboresDisponiveis}
        onConfirmar={(escolha) => {
          if (pickerProduto) adicionarProduto(pickerProduto, escolha);
          setPickerProduto(null);
        }}
      />

      {/* Pré-visualização de impressão */}
      <Dialog open={imprimirAberto} onOpenChange={setImprimirAberto}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Comanda — Mesa {mesa ? String(mesa.id).padStart(2, "0") : ""}</DialogTitle>
            <DialogDescription>
              Pré-visualização do que será enviado para a impressora da cozinha.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-dashed border-border bg-secondary/40 p-4 font-mono text-sm">
            <p className="font-semibold">Comanda</p>
            <p className="text-muted-foreground">
              Mesa {mesa ? String(mesa.id).padStart(2, "0") : ""} · {comanda?.pessoas ?? "-"} pessoas
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

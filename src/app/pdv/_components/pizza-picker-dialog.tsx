"use client";

import * as React from "react";
import { Check, Minus, Plus, Search, Trash2, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";

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
import { StepperButton } from "@/components/ui/stepper-button";
import { Input } from "@/components/ui/input";
import { cn, formatBRL } from "@/lib/utils";
import { type Produto, type SaborPizza, type AdicionalPizza, type ItemPedido, MAX_SABORES_PADRAO } from "@/lib/catalogo";
import { calcularPrecoItem } from "@/lib/preco-pizza";

export interface PizzaEscolha {
  produto: Produto;
  quantidade: number;
  tamanhoId: string;
  tamanhoNome: string;
  precoBase: number;
  sabores: SaborPizza[];
  adicionais: AdicionalPizza[];
  observacao?: string;
}

interface PizzaPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  produto: Produto | null;
  adicionais?: AdicionalPizza[];
  /** Acréscimo por sabor premium adicional (vem de /api/config/pizza). */
  acrescimoPorSaborPremium?: number;
  onConfirmar: (escolha: Omit<ItemPedido, "uid">) => void;
}

export function PizzaPickerDialog({
  open,
  onOpenChange,
  produto,
  adicionais = [],
  acrescimoPorSaborPremium = 10.0,
  onConfirmar,
}: PizzaPickerDialogProps) {
  const [quantidade, setQuantidade] = React.useState(1);
  const [tamanhoId, setTamanhoId] = React.useState("");
  const [saboresEscolhidos, setSaboresEscolhidos] = React.useState<SaborPizza[]>([]);
  const [adicionaisEscolhidos, setAdicionaisEscolhidos] = React.useState<Record<string, number>>({});
  const [observacao, setObservacao] = React.useState("");
  const [buscaSabor, setBuscaSabor] = React.useState("");
  const [meioAMeio, setMeioAMeio] = React.useState(false);

  const temSabores = (produto?.sabores?.length ?? 0) > 0;
  const temTamanhos = (produto?.tamanhos?.length ?? 0) > 0;
  const temAdicionais = adicionais.length > 0;

  React.useEffect(() => {
    if (open && produto) {
      setQuantidade(1);
      setTamanhoId(produto.tamanhos?.[0]?.id ?? "");
      setSaboresEscolhidos([]);
      setAdicionaisEscolhidos({});
      setObservacao("");
      setBuscaSabor("");
      setMeioAMeio(false);
    }
  }, [open, produto]);

  const saboresFiltrados = React.useMemo(() => {
    if (!produto) return [];
    const ordenados = [...(produto.sabores ?? [])].sort((a, b) => a.nome.localeCompare(b.nome));
    // Sem termo de busca, mostra apenas uma amostra (evita lista enorme de
    // sabores); ao digitar, filtra pelas correspondências.
    if (!buscaSabor.trim()) return ordenados.slice(0, 12);
    const termo = buscaSabor.toLowerCase();
    return ordenados.filter((s) => s.nome.toLowerCase().includes(termo));
  }, [buscaSabor, produto]);

  if (!produto) return null;

  const tamanho = produto.tamanhos?.find((t) => t.id === tamanhoId);
  const precoBase = tamanho?.preco ?? produto.preco;
  const precoAdicionais = Object.entries(adicionaisEscolhidos).reduce((soma, [id, qtd]) => {
    const add = adicionais.find((a) => a.id === id);
    return soma + (add?.preco ?? 0) * qtd;
  }, 0);

  // Regra de preço configurável: usa a MESMA função pura do servidor para
  // exibir o valor (o servidor recalcula e grava — nunca o cliente).
  const saboresParaCalc = saboresEscolhidos.map((s) => ({
    saborId: s.id,
    tipo: s.tipo ?? "tradicional",
    precoNoTamanho: precoBase,
  }));

  const resultadoPreco = calcularPrecoItem({
    sabores: saboresParaCalc,
    adicionais: adicionaisEscolhidosArray(),
    quantidade,
    acrescimoPorSaborPremium,
    maxSabores: tamanho?.maxSabores ?? MAX_SABORES_PADRAO,
  });
  const precoUnit = "erro" in resultadoPreco ? precoBase + precoAdicionais : resultadoPreco.precoUnitario;
  const total = precoUnit * quantidade;

  const limiteSabores = tamanho?.maxSabores ?? MAX_SABORES_PADRAO;

  function adicionaisEscolhidosArray() {
    return Object.entries(adicionaisEscolhidos)
      .filter(([, qtd]) => qtd > 0)
      .map(([id, qtd]) => ({ preco: adicionais.find((a) => a.id === id)?.preco ?? 0, quantidade: qtd }));
  }

  function toggleSabor(sabor: SaborPizza) {
    setSaboresEscolhidos((prev) => {
      if (prev.some((s) => s.id === sabor.id)) {
        return prev.filter((s) => s.id !== sabor.id);
      }
      // Meio a meio DESLIGADO (e tamanho permite vários): troca o sabor
      // único pelo recém-clicado, em vez de empilhar.
      if (!meioAMeio && limiteSabores > 1) {
        return [sabor];
      }
      if (prev.length >= limiteSabores) {
        return prev;
      }
      return [...prev, sabor];
    });
  }

  function removerSabor(sabor: SaborPizza) {
    setSaboresEscolhidos((prev) => prev.filter((s) => s.id !== sabor.id));
  }

  function toggleAdicional(adicional: AdicionalPizza) {
    setAdicionaisEscolhidos((prev) => {
      const atual = prev[adicional.id] ?? 0;
      if (atual <= 0) return { ...prev, [adicional.id]: 1 };
      const proximo = { ...prev };
      delete proximo[adicional.id];
      return proximo;
    });
  }

  function ajustarAdicional(id: string, delta: number) {
    setAdicionaisEscolhidos((prev) => {
      const atual = prev[id] ?? 0;
      const novo = Math.max(0, atual + delta);
      if (novo === 0) {
        const copia = { ...prev };
        delete copia[id];
        return copia;
      }
      return { ...prev, [id]: novo };
    });
  }

  const podeConfirmar = (!temTamanhos || !!tamanhoId) && (!temSabores || saboresEscolhidos.length >= 1) && quantidade > 0;

  function confirmar() {
    if (!produto || !podeConfirmar) return;
    const nomeSabores = saboresEscolhidos.length > 0 ? ` (${saboresEscolhidos.map((s) => s.nome).join(" + ")})` : "";
    const nomeTamanho = tamanho?.nome ? ` ${tamanho.nome}` : "";
    const nomesAdicionais = Object.entries(adicionaisEscolhidos)
      .filter(([, qtd]) => qtd > 0)
      .map(([id]) => adicionais.find((a) => a.id === id)?.nome)
      .filter(Boolean) as string[];

    onConfirmar({
      produtoId: produto.id,
      nome: `${produto.nome}${nomeTamanho}${nomeSabores}${nomesAdicionais.length > 0 ? ` + ${nomesAdicionais.join(", ")}` : ""}`,
      precoUnit,
      quantidade,
      observacao: observacao || undefined,
      tamanhoId: tamanho?.id,
      tamanhoNome: tamanho?.nome,
      sabores: saboresEscolhidos.length > 0 ? saboresEscolhidos : undefined,
      adicionais: (() => {
        const escolhidos = Object.entries(adicionaisEscolhidos)
          .filter(([, qtd]) => qtd > 0)
          .map(([id, qtd]) => {
            const a = adicionais.find((x) => x.id === id);
            return a ? ({ ...a, quantidade: qtd } as AdicionalPizza) : null;
          })
          .filter((a): a is AdicionalPizza => a !== null);
        return escolhidos.length > 0 ? escolhidos : undefined;
      })(),
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{produto.nome}</DialogTitle>
          <DialogDescription>
            {temSabores
              ? `Escolha o tamanho e os sabores (até ${limiteSabores}).${limiteSabores > 1 ? " Use \"meio a meio\" para sabores diferentes." : ""}`
              : temTamanhos
                ? "Escolha o tamanho."
                : "Adicione ao pedido."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {/* Tamanhos */}
          {temTamanhos && (
            <div className="flex flex-col gap-2.5">
              <span className="text-sm font-medium">Tamanho</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {produto.tamanhos!.map((t) => {
                  const limite = t.maxSabores ?? MAX_SABORES_PADRAO;
                  return (
                    <ToggleButton
                      key={t.id}
                      pressed={tamanhoId === t.id}
                      onClick={() => {
                        setTamanhoId(t.id);
                        if (saboresEscolhidos.length > limite) {
                          setSaboresEscolhidos(saboresEscolhidos.slice(0, limite));
                        }
                      }}
                      className="relative flex-col gap-0.5 py-3"
                    >
                      <span className="block">{t.nome}</span>
                      <span className="block text-xs text-muted-foreground">{formatBRL(t.preco)}</span>
                      {limite > 1 && (
                        <span className="absolute -bottom-1 -right-1 rounded-full border border-border bg-secondary px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                          {limite}s
                        </span>
                      )}
                    </ToggleButton>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sabores com busca (sem lista enorma) */}
          {temSabores && (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm font-medium">
                  Sabores
                  <span className="ml-1 text-muted-foreground">
                    ({saboresEscolhidos.length}/{limiteSabores})
                  </span>
                </span>
                {limiteSabores > 1 && (
                  <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-muted-foreground">
                    <Switch
                      checked={meioAMeio}
                      onCheckedChange={setMeioAMeio}
                      aria-label="Meio a meio / vários sabores"
                    />
                    Meio a meio / vários
                  </label>
                )}
              </div>

              {/* Campo de pesquisa de sabores */}
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder={meioAMeio ? "Buscar 2º / 3º sabor..." : "Buscar sabor..."}
                  value={buscaSabor}
                  onChange={(e) => setBuscaSabor(e.target.value)}
                  className="h-9 pl-7 text-sm"
                />
                {buscaSabor && (
                  <button
                    type="button"
                    onClick={() => setBuscaSabor("")}
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
                    aria-label="Limpar pesquisa"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Sabores selecionados (com ordem) */}
              {saboresEscolhidos.length > 0 && (
                <div className="flex flex-col gap-1 rounded-xl border border-border/50 bg-secondary/20 p-3">
                  <span className="text-xs font-medium text-muted-foreground">
                    {saboresEscolhidos.length === 1
                      ? "Sabor único"
                      : saboresEscolhidos.length === 2
                        ? "Meio a meio"
                        : "Três sabores (terços)"}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {saboresEscolhidos.map((s, idx) => (
                      <span
                        key={s.id}
                        className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-sm text-primary-700"
                      >
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] text-white">
                          {idx + 1}
                        </span>
                        {s.nome}
                        {s.tipo === "especial" && <span className="text-[10px] text-amber-500">★</span>}
                        <button
                          type="button"
                          onClick={() => removerSabor(s)}
                          className="ml-0.5"
                          aria-label={`Remover ${s.nome}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Resultados da busca (lista limitada) */}
              <div className="flex max-h-44 flex-col gap-1.5 overflow-y-auto">
                {saboresFiltrados.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {buscaSabor ? "Nenhum sabor encontrado." : "Digite para buscar um sabor."}
                  </p>
                ) : (
                  saboresFiltrados.map((sabor) => {
                    const selecionado = saboresEscolhidos.some((s) => s.id === sabor.id);
                    const bloqueado =
                      !selecionado && meioAMeio && saboresEscolhidos.length >= limiteSabores;
                    return (
                      <ToggleButton
                        key={sabor.id}
                        pressed={selecionado}
                        disabled={bloqueado}
                        onClick={() => toggleSabor(sabor)}
                        className="justify-between text-left"
                      >
                        <span>
                          {sabor.nome}
                          {sabor.tipo === "especial" && (
                            <span className="ml-1 text-[10px] text-amber-500">★ especial</span>
                          )}
                          {sabor.tipo === "doce" && (
                            <span className="ml-1 text-[10px] text-pink-500">doce</span>
                          )}
                        </span>
                        {selecionado && <Check className="h-4 w-4" />}
                      </ToggleButton>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Adicionais */}
          {temAdicionais && (
            <div className="flex flex-col gap-2.5">
              <span className="text-sm font-medium">Adicionais (+R$)</span>
              <div className="flex flex-col gap-1.5">
                {adicionais.map((adicional) => {
                  const qtd = adicionaisEscolhidos[adicional.id] ?? 0;
                  return (
                    <div
                      key={adicional.id}
                      className="flex items-center justify-between rounded-xl border border-border p-3"
                    >
                      <span className="text-sm">
                        {adicional.nome}
                        <span className="ml-1 text-xs text-muted-foreground">+ {formatBRL(adicional.preco)}</span>
                      </span>
                      <div className="flex items-center gap-2">
                        {qtd > 0 && (
                          <>
                            <button
                              type="button"
                              className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-all duration-150 hover:bg-secondary hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
                              onClick={() => ajustarAdicional(adicional.id, -1)}
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-5 text-center text-sm tabular">{qtd}</span>
                          </>
                        )}
                        <button
                          type="button"
                          className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15",
                            qtd > 0 ? "border-primary bg-primary-50 text-primary" : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                          )}
                          onClick={() => toggleAdicional(adicional)}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Observação */}
          <div className="flex flex-col gap-1.5">
            <LabelObservacao observacao={observacao} onChange={setObservacao} />
          </div>

          {/* Quantidade */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Quantidade</span>
            <StepperButton
              value={quantidade}
              onChange={setQuantidade}
              min={1}
              max={99}
            />
          </div>

          {/* Total */}
          <div className="flex items-center justify-between rounded-xl bg-secondary/40 p-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm text-muted-foreground">
                Base {temSabores && saboresEscolhidos.length > 1 ? `· ${saboresEscolhidos.length} sabores` : ""}
                {saboresEscolhidos.filter((s) => s.tipo !== "tradicional").length >= 2 &&
                  ` · +${formatBRL(acrescimoPorSaborPremium)} especiais`}
              </span>
              <span className="font-medium">Total</span>
            </div>
            <span className="text-xl font-bold tabular">{formatBRL(total)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvandoGlobal}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={!podeConfirmar || salvandoGlobal}>
            <Plus className="h-4 w-4" />
            Adicionar à mesa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const salvandoGlobal = false;

function LabelObservacao({
  observacao,
  onChange,
}: {
  observacao: string;
  onChange: (v: string) => void;
}) {
  return (
    <>
      <span className="text-sm font-medium">Observação</span>
      <Input
        type="text"
        placeholder="Ex.: sem cebola, borda recheada..."
        value={observacao}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm"
      />
    </>
  );
}

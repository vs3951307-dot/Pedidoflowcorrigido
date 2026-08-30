"use client";

import * as React from "react";
import { criarUid, type SelecaoPizza } from "@/lib/catalogo";
import type {
  FormaPagamento,
  ItemPedido,
  Produto,
  TipoPedido,
} from "@/app/pdv/_lib/mock-data";

/**
 * Estado do módulo PDV — carrinho em memória (nome do cliente, itens,
 * observações) até o pagamento ser confirmado.
 *
 * A venda em si é persistida por `use-cobranca.ts` (`POST /api/pedidos` +
 * `POST /api/pedidos/:id/pagamento`) ANTES de `finalizarPedido` ser
 * chamado — este contexto só limpa o carrinho da tela depois que a venda
 * já foi gravada de verdade. Nada aqui fica só em memória "de mentirinha".
 */
interface PdvState {
  itens: ItemPedido[];
  clienteNome: string;
  tipoPedido: TipoPedido;
  formaPagamento: FormaPagamento | null;
  observacao: string;
  adicionarProduto: (produto: Produto, escolha?: SelecaoPizza) => void;
  atualizarQuantidade: (uid: string, quantidade: number) => void;
  removerItem: (uid: string) => void;
  definirClienteNome: (nome: string) => void;
  definirTipoPedido: (tipo: TipoPedido) => void;
  definirFormaPagamento: (forma: FormaPagamento) => void;
  definirObservacao: (texto: string) => void;
  limparPedido: () => void;
  finalizarPedido: () => void;
}

const PdvContext = React.createContext<PdvState | null>(null);

export function PdvProvider({ children }: { children: React.ReactNode }) {
  const [itens, setItens] = React.useState<ItemPedido[]>([]);
  const [clienteNome, setClienteNome] = React.useState("");
  const [tipoPedido, setTipoPedido] = React.useState<TipoPedido>("balcao");
  const [formaPagamento, setFormaPagamento] = React.useState<FormaPagamento | null>(null);
  const [observacao, setObservacao] = React.useState("");

  const adicionarProduto = React.useCallback((produto: Produto, escolha?: SelecaoPizza) => {
    setItens((prev) => {
      const novo: ItemPedido = {
        uid: criarUid(produto.id),
        produtoId: produto.id,
        nome: escolha?.nome ?? produto.nome,
        precoUnit: escolha?.precoUnit ?? produto.preco,
        quantidade: escolha?.quantidade ?? 1,
        observacao: escolha?.observacao,
        tamanhoId: escolha?.tamanhoId,
        tamanhoNome: escolha?.tamanhoNome,
        sabores: escolha?.sabores,
        adicionais: escolha?.adicionais,
      };
      // Mescla só quando é REALMENTE a mesma linha (produto + tamanho +
      // sabores + adicionais + observação + preço). Assim duas pizzas do
      // mesmo tamanho com sabores diferentes viram linhas distintas.
      const chave = (i: ItemPedido) =>
        [
          i.produtoId,
          i.tamanhoNome ?? "",
          i.nome,
          i.precoUnit,
          JSON.stringify(i.sabores ?? null),
          JSON.stringify(i.adicionais ?? null),
          i.observacao ?? "",
        ].join("|");
      const existente = prev.find((i) => chave(i) === chave(novo));
      if (existente) {
        return prev.map((i) =>
          i.uid === existente.uid ? { ...i, quantidade: i.quantidade + novo.quantidade } : i
        );
      }
      return [...prev, novo];
    });
  }, []);

  const atualizarQuantidade = React.useCallback((uid: string, quantidade: number) => {
    setItens((prev) => {
      if (quantidade <= 0) return prev.filter((i) => i.uid !== uid);
      return prev.map((i) => (i.uid === uid ? { ...i, quantidade } : i));
    });
  }, []);

  const removerItem = React.useCallback((uid: string) => {
    setItens((prev) => prev.filter((i) => i.uid !== uid));
  }, []);

  const limparPedido = React.useCallback(() => {
    setItens([]);
    setClienteNome("");
    setTipoPedido("balcao");
    setFormaPagamento(null);
    setObservacao("");
  }, []);

  const finalizarPedido = React.useCallback(() => {
    // A venda (POST /api/pedidos + pagamento) já foi gravada por
    // use-cobranca.ts ANTES desta função ser chamada — isto só limpa o
    // carrinho da tela para o próximo cliente.
    setItens([]);
    setClienteNome("");
    setTipoPedido("balcao");
    setFormaPagamento(null);
    setObservacao("");
  }, []);

  const value = React.useMemo(
    () => ({
      itens,
      clienteNome,
      tipoPedido,
      formaPagamento,
      observacao,
      adicionarProduto,
      atualizarQuantidade,
      removerItem,
      definirClienteNome: setClienteNome,
      definirTipoPedido: setTipoPedido,
      definirFormaPagamento: setFormaPagamento,
      definirObservacao: setObservacao,
      limparPedido,
      finalizarPedido,
    }),
    [
      itens,
      clienteNome,
      tipoPedido,
      formaPagamento,
      observacao,
      adicionarProduto,
      atualizarQuantidade,
      removerItem,
      limparPedido,
      finalizarPedido,
    ]
  );

  return <PdvContext.Provider value={value}>{children}</PdvContext.Provider>;
}

export function usePdv() {
  const ctx = React.useContext(PdvContext);
  if (!ctx) {
    throw new Error("usePdv deve ser usado dentro de <PdvProvider>.");
  }
  return ctx;
}

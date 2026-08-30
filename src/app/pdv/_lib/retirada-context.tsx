"use client";

import * as React from "react";
import { toast } from "sonner";
import type { ItemPedido } from "@/lib/catalogo";
import { api } from "@/lib/api-cliente";
import { useEventosTempoReal } from "@/lib/usar-eventos-tempo-real";

/**
 * Estado do módulo Retirada do PDV (pedidos para o cliente levar).
 *
 * Fonte real: pedidos do banco (GET /api/pedidos?canal=retirada) com
 * persistência de criação, status (pronto/retirado) e cancelamento.
 */

export type StatusRetirada = "pendente" | "pronto" | "retirado";

export interface PedidoRetirada {
  id: string;
  /** Número sequencial do dia, mostrado ao cliente ("Retirada nº 0003"). */
  numero: number;
  clienteNome: string;
  itens: ItemPedido[];
  observacao: string;
  status: StatusRetirada;
  criadoEm: string;
  prontoEm?: string;
  retiradoEm?: string;
}

interface RetiradaState {
  pedidos: PedidoRetirada[];
  /** Adiciona um pedido já persistido no banco (fluxo de cobrança). */
  adicionarPedido: (pedido: {
    id: string;
    numero: number;
    clienteNome: string;
    itens: ItemPedido[];
    observacao: string;
  }) => void;
  marcarPronto: (id: string) => void;
  marcarRetirado: (id: string) => void;
  cancelarPedido: (id: string) => void;
}

const STATUS_BANCO: Record<string, StatusRetirada> = {
  andamento: "pendente",
  pronto: "pronto",
  retirado: "retirado",
};

export function RetiradaProvider({ children }: { children: React.ReactNode }) {
  const [pedidos, setPedidos] = React.useState<PedidoRetirada[]>([]);

  // Carrega os pedidos de retirada de hoje do banco.
  const carregar = React.useCallback(() => {
    api<{
      pedidos: {
        id: string;
        numero: number;
        status: string;
        clienteNome: string | null;
        observacao: string | null;
        criadoEm: string;
        itens: ItemPedido[];
      }[];
    }>("/api/pedidos?canal=retirada&periodo=hoje&limite=100")
      .then((dados) => {
        setPedidos(
          dados.pedidos
            .filter((p) => p.status !== "cancelado")
            .map((p) => ({
              id: p.id,
              numero: p.numero,
              clienteNome: p.clienteNome ?? "Cliente",
              itens: p.itens,
              observacao: p.observacao ?? "",
              status: STATUS_BANCO[p.status] ?? "pendente",
              criadoEm: p.criadoEm,
            }))
        );
      })
      .catch((erro) => {
        toast.error(
          `Não foi possível carregar os pedidos de retirada: ${erro instanceof Error ? erro.message : "falha desconhecida"}`
        );
      });
  }, []);

  React.useEffect(() => carregar(), [carregar]);
  useEventosTempoReal(["pedido"], carregar);

  const adicionarPedido = React.useCallback(
    (pedido: { id: string; numero: number; clienteNome: string; itens: ItemPedido[]; observacao: string }) => {
      const novo: PedidoRetirada = {
        id: pedido.id,
        numero: pedido.numero,
        clienteNome: pedido.clienteNome,
        itens: pedido.itens,
        observacao: pedido.observacao,
        status: "pendente",
        criadoEm: new Date().toISOString(),
      };
      setPedidos((prev) => [novo, ...prev]);
    },
    []
  );

  const marcarPronto = React.useCallback((id: string) => {
    api(`/api/pedidos/${id}`, { method: "PATCH", body: JSON.stringify({ status: "pronto" }) }).catch((erro) => {
      toast.error(`Falha ao marcar como pronto: ${erro instanceof Error ? erro.message : "erro desconhecido"}`);
    });
    setPedidos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: "pronto", prontoEm: new Date().toISOString() } : p))
    );
  }, []);

  const marcarRetirado = React.useCallback((id: string) => {
    api(`/api/pedidos/${id}`, { method: "PATCH", body: JSON.stringify({ status: "retirado" }) }).catch((erro) => {
      toast.error(`Falha ao marcar como retirado: ${erro instanceof Error ? erro.message : "erro desconhecido"}`);
    });
    setPedidos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: "retirado", retiradoEm: new Date().toISOString() } : p))
    );
  }, []);

  const cancelarPedido = React.useCallback((id: string) => {
    api(`/api/pedidos/${id}`, { method: "DELETE" }).catch((erro) => {
      toast.error(`Falha ao cancelar o pedido: ${erro instanceof Error ? erro.message : "erro desconhecido"}`);
    });
    setPedidos((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const value = React.useMemo(
    () => ({
      pedidos,
      adicionarPedido,
      marcarPronto,
      marcarRetirado,
      cancelarPedido,
    }),
    [pedidos, adicionarPedido, marcarPronto, marcarRetirado, cancelarPedido]
  );

  return <RetiradaContext.Provider value={value}>{children}</RetiradaContext.Provider>;
}

const RetiradaContext = React.createContext<RetiradaState | null>(null);

export function useRetirada() {
  const ctx = React.useContext(RetiradaContext);
  if (!ctx) {
    throw new Error("useRetirada deve ser usado dentro de <RetiradaProvider>.");
  }
  return ctx;
}

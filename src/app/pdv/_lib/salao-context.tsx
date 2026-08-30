"use client";

import * as React from "react";
import { toast } from "sonner";
import type { ItemPedido } from "@/lib/catalogo";
import type { Mesa } from "@/lib/mesas";
import { api } from "@/lib/api-cliente";
import { useEventosTempoReal } from "@/lib/usar-eventos-tempo-real";

/**
 * Estado do Salão do PDV: mesas com comanda aberta e a cobrança ao fechar.
 *
 * Fonte real: mesas e comandas vêm do banco (GET /api/mesas — pedidos do
 * dia com status "andamento"), compartilhadas com o app do Garçom. A
 * cobrança persiste via fluxo comum de pagamento e libera a mesa no
 * servidor.
 *
 * Sem dado de exemplo: o estado inicial é vazio até a resposta real do
 * servidor chegar — nunca mostra mesa/comanda fictícia.
 */

export interface Comanda {
  mesaId: number;
  pessoas: number;
  garcom: string;
  abertaEm: number;
  itens: ItemPedido[];
  /** Pedido principal da comanda — usado na cobrança (pagar + concluir). */
  pedidoId?: string;
}

interface ComandaBruta {
  id: string;
  abertaEm: string;
  total: number;
  itens: Array<{
    uid: string;
    produtoId: string;
    nome: string;
    precoUnit: number;
    quantidade: number;
    tamanho: string | null;
    sabores: unknown[];
    adicionais: unknown[];
    observacao: string | null;
  }>;
}

interface SalaoState {
  mesas: Mesa[];
  comandas: Record<number, Comanda>;
  carregando: boolean;
  /** Abre uma mesa livre (Caixa/Administrador operando pelo PDV, sem depender do app Garçom). */
  abrirMesa: (mesaId: number, pessoas: number) => Promise<void>;
  /** Adiciona um produto à comanda da mesa (persistido no pedido aberto). */
  adicionarItem: (mesaId: number, produto: Omit<ItemPedido, "uid">) => Promise<void>;
  /** Atualiza a quantidade de um item na comanda (0 ou menos remove). */
  atualizarQuantidade: (mesaId: number, uid: string, quantidade: number) => Promise<void>;
  /** Remove um item da comanda. */
  removerItem: (mesaId: number, uid: string) => Promise<void>;
  /** Marca a mesa como "conta" (pedindo conta / finalizada). */
  finalizarMesa: (mesaId: number) => Promise<void>;
  /**
   * Libera a mesa SEM cobrar — válvula de escape operacional.
   *
   * Existia um beco sem saída: mesa aberta em que o cliente desistiu (ou
   * mesa que ficou presa em "conta" porque o PATCH de fechamento falhou
   * DEPOIS do pagamento aprovado) não tinha nenhum caminho de volta —
   * "Cobrar" fica desabilitado com 0 itens e não havia ação de liberar.
   * A mesa ficava ocupada para sempre.
   */
  liberarMesa: (mesaId: number) => Promise<void>;
  /** Remove a comanda e libera a mesa. Retorna a comanda cobrada. */
  cobrarComanda: (mesaId: number) => Comanda | undefined;
  /** Recarrega mesas/comandas do servidor. */
  recarregar: () => void;
}

const SalaoContext = React.createContext<SalaoState | null>(null);

export function SalaoProvider({ children }: { children: React.ReactNode }) {
  const [mesas, setMesas] = React.useState<Mesa[]>([]);
  const [comandas, setComandas] = React.useState<Record<number, Comanda>>({});
  const [carregando, setCarregando] = React.useState(true);

  // Carrega mesas e comandas reais do banco (pedidos em andamento do dia).
  const carregar = React.useCallback(() => {
    api<{
      mesas: Mesa[];
      comandas: Record<
        number,
        { id: string; itens: ItemPedido[]; total: number; abertaEm: string }
      >;
    }>("/api/mesas")
      .then((dados) => {
        setMesas(dados.mesas);
        const proximas: Record<number, Comanda> = {};
        for (const mesa of dados.mesas) {
          const bruta = dados.comandas[mesa.id];
          if (!bruta) continue;
          proximas[mesa.id] = {
            mesaId: mesa.id,
            pessoas: mesa.pessoas ?? 2,
            garcom: mesa.garcom ?? "Garçom",
            abertaEm: bruta.abertaEm ? new Date(bruta.abertaEm).getTime() : Date.now(),
            itens: bruta.itens,
            pedidoId: bruta.id,
          };
        }
        setComandas(proximas);
        setCarregando(false);
      })
      .catch((erro) => {
        setCarregando(false);
        toast.error(
          `Não foi possível carregar as mesas do salão: ${erro instanceof Error ? erro.message : "falha desconhecida"}`
        );
      });
  }, []);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  // Sincronização entre dispositivos: quando o Garçom (ou outro PDV)
  // muda uma mesa, este dispositivo recarrega sozinho — sem precisar
  // apertar F5.
  useEventosTempoReal(["mesa", "pedido"], carregar);

  const abrirMesa = React.useCallback(
    async (mesaId: number, pessoas: number) => {
      try {
        await api(`/api/mesas/${mesaId}`, {
          method: "PATCH",
          body: JSON.stringify({ abrir: true, pessoas }),
        });
        carregar();
      } catch (erro) {
        toast.error(`Falha ao abrir a mesa: ${erro instanceof Error ? erro.message : "erro desconhecido"}`);
        throw erro;
      }
    },
    [carregar]
  );

  // Aplica a comanda retornada pelo servidor ao estado local (mantém
  // pessoas/garçom da mesa, atualiza itens reais com os uids do banco).
  const aplicarComanda = React.useCallback(
    (mesaId: number, bruta: ComandaBruta) => {
      setComandas((prev) => {
        const atual = prev[mesaId];
        const mesa = mesas.find((m) => m.id === mesaId);
        const itens: ItemPedido[] = bruta.itens.map((i) => ({
          uid: i.uid,
          produtoId: i.produtoId,
          nome: i.nome,
          precoUnit: i.precoUnit,
          quantidade: i.quantidade,
          observacao: i.observacao ?? undefined,
          tamanhoId: undefined,
          tamanhoNome: i.tamanho ?? undefined,
          sabores: i.sabores as ItemPedido["sabores"],
          adicionais: i.adicionais as ItemPedido["adicionais"],
        }));
        return {
          ...prev,
          [mesaId]: {
            mesaId,
            pessoas: atual?.pessoas ?? mesa?.pessoas ?? 2,
            garcom: atual?.garcom ?? mesa?.garcom ?? "Garçom",
            abertaEm: bruta.abertaEm ? new Date(bruta.abertaEm).getTime() : Date.now(),
            itens,
            pedidoId: bruta.id,
          },
        };
      });
    },
    [mesas]
  );

  const adicionarItem = React.useCallback(
    async (mesaId: number, produto: Omit<ItemPedido, "uid">) => {
      try {
        const dados = await api<{ ok: boolean; comanda: ComandaBruta }>(`/api/mesas/${mesaId}/itens`, {
          method: "POST",
          body: JSON.stringify({
            acao: "adicionar",
            item: {
              produtoId: produto.produtoId,
              nome: produto.nome,
              quantidade: produto.quantidade || 1,
              observacao: produto.observacao ?? null,
              tamanhoNome: produto.tamanhoNome ?? null,
              sabores: produto.sabores ?? [],
              // Só nome + quantidade: o PREÇO do adicional é sempre
              // resolvido no servidor pelo cadastro, nunca aceito do
              // cliente (ver api/mesas/[id]/itens/route.ts).
              adicionais: (produto.adicionais ?? []).map((a) => ({
                nome: a.nome,
                quantidade: Math.max(1, Math.floor(a.quantidade ?? 1)),
              })),
            },
          }),
        });
        aplicarComanda(mesaId, dados.comanda);
      } catch (erro) {
        toast.error(`Falha ao adicionar o item: ${erro instanceof Error ? erro.message : "erro desconhecido"}`);
      }
    },
    [aplicarComanda]
  );

  const atualizarQuantidade = React.useCallback(
    async (mesaId: number, uid: string, quantidade: number) => {
      try {
        const dados = await api<{ ok: boolean; comanda: ComandaBruta }>(`/api/mesas/${mesaId}/itens`, {
          method: "POST",
          body: JSON.stringify({ acao: "atualizar", uid, quantidade }),
        });
        aplicarComanda(mesaId, dados.comanda);
      } catch (erro) {
        toast.error(`Falha ao atualizar o item: ${erro instanceof Error ? erro.message : "erro desconhecido"}`);
      }
    },
    [aplicarComanda]
  );

  const removerItem = React.useCallback(
    async (mesaId: number, uid: string) => {
      try {
        const dados = await api<{ ok: boolean; comanda: ComandaBruta }>(`/api/mesas/${mesaId}/itens`, {
          method: "POST",
          body: JSON.stringify({ acao: "remover", uid }),
        });
        aplicarComanda(mesaId, dados.comanda);
      } catch (erro) {
        toast.error(`Falha ao remover o item: ${erro instanceof Error ? erro.message : "erro desconhecido"}`);
      }
    },
    [aplicarComanda]
  );

  const finalizarMesa = React.useCallback(
    async (mesaId: number) => {
      try {
        await api(`/api/mesas/${mesaId}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "conta" }),
        });
        setMesas((prev) => prev.map((m) => (m.id === mesaId ? { ...m, status: "conta" } : m)));
        toast.success(`Mesa ${String(mesaId).padStart(2, "0")} finalizada — conta solicitada.`);
      } catch (erro) {
        toast.error(`Falha ao finalizar: ${erro instanceof Error ? erro.message : "erro desconhecido"}`);
      }
    },
    []
  );

  const liberarMesa = React.useCallback(
    async (mesaId: number) => {
      try {
        await api(`/api/mesas/${mesaId}`, {
          method: "PATCH",
          body: JSON.stringify({ fechar: true }),
        });
        toast.success(`Mesa ${String(mesaId).padStart(2, "0")} liberada.`);
      } catch (erro) {
        toast.error(`Falha ao liberar a mesa: ${erro instanceof Error ? erro.message : "erro desconhecido"}`);
        throw erro;
      } finally {
        // Sempre recarrega: o estado real é o do servidor, nunca o otimista.
        carregar();
      }
    },
    [carregar]
  );

  const cobrarComanda = React.useCallback(
    (mesaId: number): Comanda | undefined => {
      const comanda = comandas[mesaId];
      if (!comanda) return undefined;
      // Libera a mesa no servidor. Se falhar, a mesa fica com aparência de
      // livre no cliente mas continua ocupada no banco — avisamos e
      // recarregamos para refletir o estado real do servidor.
      api(`/api/mesas/${mesaId}`, {
        method: "PATCH",
        body: JSON.stringify({ fechar: true }),
      }).catch((erro) => {
        toast.error(
          `Falha ao liberar a mesa ${mesaId} no servidor: ${erro instanceof Error ? erro.message : "erro desconhecido"}. Atualizando...`
        );
        carregar();
      });
      setComandas((prev) => {
        const proximas = { ...prev };
        delete proximas[mesaId];
        return proximas;
      });
      setMesas((prev) =>
        prev.map((m) => (m.id === mesaId ? { id: m.id, status: "livre" } : m))
      );
      return comanda;
    },
    [comandas, carregar]
  );

  const value = React.useMemo(
    () => ({ mesas, comandas, carregando, abrirMesa, adicionarItem, atualizarQuantidade, removerItem, finalizarMesa, liberarMesa, cobrarComanda, recarregar: carregar }),
    [mesas, comandas, carregando, abrirMesa, adicionarItem, atualizarQuantidade, removerItem, finalizarMesa, liberarMesa, cobrarComanda, carregar]
  );

  return <SalaoContext.Provider value={value}>{children}</SalaoContext.Provider>;
}

export function useSalao() {
  const ctx = React.useContext(SalaoContext);
  if (!ctx) {
    throw new Error("useSalao deve ser usado dentro de <SalaoProvider>.");
  }
  return ctx;
}

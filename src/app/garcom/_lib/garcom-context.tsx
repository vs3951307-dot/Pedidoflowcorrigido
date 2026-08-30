"use client";

import * as React from "react";
import { toast } from "sonner";
import { criarUid } from "@/lib/catalogo";
import { api } from "@/lib/api-cliente";
import { novaChaveIdempotencia } from "@/lib/idempotencia";
import { type ItemPedido, type Mesa, type Produto } from "@/app/garcom/_lib/mock-data";
import { useEventosTempoReal } from "@/lib/usar-eventos-tempo-real";

/**
 * Estado do módulo Garçom.
 *
 * Ao montar, o provider carrega mesas e comandas do backend
 * (GET /api/mesas e GET /api/pedidos); o fallback em memória só é usado
 * se a busca falhar. Abrir mesa e enviar pedido persistem via API, com o
 * estado local mantido para a UI.
 */
interface GarcomState {
  mesas: Mesa[];
  pedidos: Record<number, ItemPedido[]>;
  observacoesGerais: Record<number, string>;
  abrirMesa: (mesaId: number, pessoas: number) => void;
  adicionarProduto: (mesaId: number, produto: Produto, escolha?: {
    tamanhoId?: string;
    tamanhoNome?: string;
    precoUnit?: number;
    /** Quantidade escolhida no picker (ausente = 1). */
    quantidade?: number;
    sabores?: Produto["sabores"];
    adicionais?: Produto["adicionais"];
    observacao?: string;
  }) => void;
  atualizarQuantidade: (mesaId: number, uid: string, quantidade: number) => void;
  atualizarObservacaoItem: (mesaId: number, uid: string, observacao: string) => void;
  removerItem: (mesaId: number, uid: string) => void;
  definirObservacaoGeral: (mesaId: number, texto: string) => void;
  enviarPedido: (mesaId: number) => void;
}

const GarcomContext = React.createContext<GarcomState | null>(null);

interface ApiMesa {
  id: number;
  status: Mesa["status"];
  abertaEm?: number;
  pessoas?: number;
  garcom?: string;
}

interface ApiPedido {
  id: string;
  status: string;
  mesaId: number | null;
  itens: ItemPedido[];
}

export function GarcomProvider({ children }: { children: React.ReactNode }) {
  const [mesas, setMesas] = React.useState<Mesa[]>([]);
  const [pedidos, setPedidos] = React.useState<Record<number, ItemPedido[]>>({});
  const [observacoesGerais, setObservacoesGerais] = React.useState<Record<number, string>>({});

  const carregar = React.useCallback(() => {
    let ativo = true;
    Promise.all([
      api<{ mesas: ApiMesa[] }>("/api/mesas"),
      api<{ pedidos: ApiPedido[] }>("/api/pedidos?canal=salao&periodo=hoje&limite=100"),
    ])
      .then(([respostaMesas, respostaPedidos]) => {
        if (!ativo) return;
        setMesas(
          respostaMesas.mesas.map((m) => ({
            id: m.id,
            status: m.status,
            abertaEm: m.abertaEm,
            pessoas: m.pessoas,
            garcom: m.garcom,
          }))
        );
        const porMesa: Record<number, ItemPedido[]> = {};
        for (const p of respostaPedidos.pedidos) {
          if (p.mesaId == null) continue;
          if (p.status !== "andamento" && p.status !== "conta") continue;
          porMesa[p.mesaId] = [...(porMesa[p.mesaId] ?? []), ...p.itens];
        }
        setPedidos(porMesa);
      })
      .catch((erro) => {
        toast.error(
          `Não foi possível carregar as mesas: ${erro instanceof Error ? erro.message : "falha desconhecida"}`
        );
      });
    return () => {
      ativo = false;
    };
  }, []);

  React.useEffect(() => carregar(), [carregar]);

  // Sincronização entre dispositivos: outro Garçom ou o PDV mudando uma
  // mesa atualiza este aparelho sozinho.
  useEventosTempoReal(["mesa", "pedido"], carregar);

  const abrirMesa = React.useCallback((mesaId: number, pessoas: number) => {
    // Não envia `garcom`: o servidor usa o nome do usuário autenticado
    // (ver PATCH /api/mesas/[id]) — nunca um nome fixo no cliente.
    api(`/api/mesas/${mesaId}`, {
      method: "PATCH",
      body: JSON.stringify({ abrir: true, pessoas }),
    }).catch((erro) => {
      toast.error(`Falha ao abrir a mesa: ${erro instanceof Error ? erro.message : "erro desconhecido"}`);
    });
    setMesas((prev) =>
      prev.map((m) =>
        m.id === mesaId
          ? {
              ...m,
              status: "aguardando",
              pessoas,
              elapsedMinutes: 0,
              abertaEm: Date.now(),
              garcom: m.garcom,
            }
          : m
      )
    );
  }, []);

  const adicionarProduto = React.useCallback(
    (
      mesaId: number,
      produto: Produto,
      escolha?: {
        tamanhoId?: string;
        tamanhoNome?: string;
        precoUnit?: number;
        quantidade?: number;
        sabores?: Produto["sabores"];
        adicionais?: Produto["adicionais"];
        observacao?: string;
      }
    ) => {
      const quantidadeEscolhida = Math.max(1, Math.floor(escolha?.quantidade ?? 1));
      setPedidos((prev) => {
        const atual = prev[mesaId] ?? [];
        const preco = escolha?.precoUnit ?? produto.preco;
        const nomeSabores = escolha?.sabores && escolha.sabores.length > 0 ? ` (${escolha.sabores.map((s) => s.nome).join(" + ")})` : "";
        const nomeTamanho = escolha?.tamanhoNome ? ` ${escolha.tamanhoNome}` : "";
        const nomesAdicionais = escolha?.adicionais && escolha.adicionais.length > 0
          ? ` + ${escolha.adicionais.map((a) => a.nome).join(", ")}`
          : "";
        const nome = `${produto.nome}${nomeTamanho}${nomeSabores}${nomesAdicionais}`;
        const observacao = escolha?.observacao;
        const existente = atual.find((i) => i.produtoId === produto.id && i.precoUnit === preco && !i.observacao && !observacao);
        if (existente) {
          return {
            ...prev,
            [mesaId]: atual.map((i) =>
              i.uid === existente.uid ? { ...i, quantidade: i.quantidade + quantidadeEscolhida } : i
            ),
          };
        }
        return {
          ...prev,
          [mesaId]: [
            ...atual,
            {
              uid: criarUid(produto.id),
              produtoId: produto.id,
              nome,
              precoUnit: preco,
              quantidade: quantidadeEscolhida,
              observacao,
              tamanhoId: escolha?.tamanhoId,
              tamanhoNome: escolha?.tamanhoNome,
              sabores: escolha?.sabores,
              adicionais: escolha?.adicionais,
            },
          ],
        };
      });
    },
    []
  );

  const atualizarQuantidade = React.useCallback(
    (mesaId: number, uid: string, quantidade: number) => {
      setPedidos((prev) => {
        const atual = prev[mesaId] ?? [];
        if (quantidade <= 0) {
          return { ...prev, [mesaId]: atual.filter((i) => i.uid !== uid) };
        }
        return {
          ...prev,
          [mesaId]: atual.map((i) => (i.uid === uid ? { ...i, quantidade } : i)),
        };
      });
    },
    []
  );

  const atualizarObservacaoItem = React.useCallback(
    (mesaId: number, uid: string, observacao: string) => {
      setPedidos((prev) => {
        const atual = prev[mesaId] ?? [];
        return {
          ...prev,
          [mesaId]: atual.map((i) => (i.uid === uid ? { ...i, observacao } : i)),
        };
      });
    },
    []
  );

  const removerItem = React.useCallback((mesaId: number, uid: string) => {
    setPedidos((prev) => ({
      ...prev,
      [mesaId]: (prev[mesaId] ?? []).filter((i) => i.uid !== uid),
    }));
  }, []);

  /**
   * Chave de idempotência do pedido em aberto de CADA mesa (item 1).
   * `useRef` (e não `useState`) de propósito: precisa ser lida e escrita
   * de forma SÍNCRONA dentro de `enviarPedido`, para que dois toques no
   * mesmo instante enxerguem a mesma chave — um `setState` só valeria no
   * próximo render, tarde demais.
   */
  const chavesPedidoPorMesa = React.useRef<Record<number, string>>({});

  const definirObservacaoGeral = React.useCallback((mesaId: number, texto: string) => {
    setObservacoesGerais((prev) => ({ ...prev, [mesaId]: texto }));
  }, []);

  const enviarPedido = React.useCallback(
    (mesaId: number) => {
      const itensDaMesa = pedidos[mesaId] ?? [];
      const observacaoGeral = observacoesGerais[mesaId] ?? "";
      // Item 1 da auditoria: chave de idempotência POR MESA, criada no
      // primeiro "enviar" e mantida até o pedido daquela mesa ser aceito.
      // No salão, dois toques no celular do garçom (ou reenvio depois de
      // um timeout de rede) mandavam dois pedidos para a cozinha — agora
      // mandam a MESMA chave e o servidor devolve o pedido já criado.
      // A leitura/escrita do ref é síncrona, então dois toques seguidos
      // enxergam a mesma chave mesmo antes de qualquer resposta chegar.
      if (!chavesPedidoPorMesa.current[mesaId]) {
        chavesPedidoPorMesa.current[mesaId] = novaChaveIdempotencia();
      }
      const idempotencyKey = chavesPedidoPorMesa.current[mesaId];
      api<{ ok: boolean; pedido: { id: string; numero: number; total: number } }>(
        "/api/pedidos",
        {
          method: "POST",
          body: JSON.stringify({
            idempotencyKey,
            canal: "salao",
            mesaId,
            itens: itensDaMesa.map(({ produtoId, nome, precoUnit, quantidade, observacao }) => ({
              produtoId,
              nome,
              precoUnit,
              quantidade,
              observacao,
            })),
            observacao: observacaoGeral,
          }),
        }
      )
        .then(() => {
          // Pedido aceito (novo ou recuperado por idempotência): a chave
          // desta mesa cumpriu o papel. O próximo pedido da MESMA mesa
          // precisa de chave nova — senão o servidor devolveria sempre o
          // pedido antigo e a segunda rodada de itens nunca chegaria à
          // cozinha.
          delete chavesPedidoPorMesa.current[mesaId];
          api(`/api/mesas/${mesaId}`, {
            method: "PATCH",
            body: JSON.stringify({ status: "pedido_enviado" }),
          }).catch((erro) => {
            toast.error(
              `Pedido enviado, mas falha ao atualizar o status da mesa: ${erro instanceof Error ? erro.message : "erro desconhecido"}`
            );
          });
          setMesas((prev) =>
            prev.map((m) => (m.id === mesaId ? { ...m, status: "enviado", elapsedMinutes: 0 } : m))
          );
        })
        .catch((e: unknown) => {
          toast.error(e instanceof Error ? e.message : "Falha ao enviar o pedido.");
        });
    },
    [pedidos, observacoesGerais]
  );

  const value = React.useMemo(
    () => ({
      mesas,
      pedidos,
      observacoesGerais,
      abrirMesa,
      adicionarProduto,
      atualizarQuantidade,
      atualizarObservacaoItem,
      removerItem,
      definirObservacaoGeral,
      enviarPedido,
    }),
    [
      mesas,
      pedidos,
      observacoesGerais,
      abrirMesa,
      adicionarProduto,
      atualizarQuantidade,
      atualizarObservacaoItem,
      removerItem,
      definirObservacaoGeral,
      enviarPedido,
    ]
  );

  return <GarcomContext.Provider value={value}>{children}</GarcomContext.Provider>;
}

export function useGarcom() {
  const ctx = React.useContext(GarcomContext);
  if (!ctx) {
    throw new Error("useGarcom deve ser usado dentro de <GarcomProvider>.");
  }
  return ctx;
}

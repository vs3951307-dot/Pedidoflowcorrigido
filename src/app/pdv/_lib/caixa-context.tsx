"use client";

import * as React from "react";
import { toast } from "sonner";
import { criarUid } from "@/lib/catalogo";
import { rotuloFormaPagamento, type FormaPagamento } from "@/lib/pedido";
import { api } from "@/lib/api-cliente";
import { useEventosTempoReal } from "@/lib/usar-eventos-tempo-real";

/**
 * Estado do Caixa do PDV (abertura, vendas, sangrias e fechamento).
 *
 * Persistência real: o estado é sincronizado com o backend (/api/caixa).
 * A abertura, sangrias, entradas e fechamento são registrados no banco; a
 * venda em si é persistida no fluxo de pagamento (/api/pedidos/:id/pagamento)
 * e o resumo desta tela reflete o banco ao recarregar. A regra "dinheiro
 * exige caixa aberto" é validada também no servidor.
 */

export type TipoMovimentacao = "venda" | "troco" | "sangria" | "entrada";

export interface MovimentacaoCaixa {
  id: string;
  tipo: TipoMovimentacao;
  valor: number;
  descricao: string;
  /** Presente em movimentações de venda — identifica o método. */
  metodo?: FormaPagamento;
  criadoEm: string;
}

export interface CaixaResumo {
  saldoInicial: number;
  vendasDinheiro: number;
  vendasOutras: number;
  totalVendas: number;
  vendasPorMetodo: Partial<Record<FormaPagamento, number>>;
  trocos: number;
  sangrias: number;
  entradas: number;
  /** Quanto deveria haver em espécie na gaveta: saldo inicial + vendas em
   * dinheiro − trocos − sangrias + entradas. */
  dinheiroEmCaixa: number;
  movimentacoes: MovimentacaoCaixa[];
}

/** Soma as movimentações em um resumo — pura, usada no fechamento e no
 * preview do fechamento. */
export function calcularResumoCaixa(
  movimentacoes: MovimentacaoCaixa[],
  saldoInicial: number
): CaixaResumo {
  let vendasDinheiro = 0;
  let vendasOutras = 0;
  let trocos = 0;
  let sangrias = 0;
  let entradas = 0;
  const vendasPorMetodo: Partial<Record<FormaPagamento, number>> = {};

  for (const mov of movimentacoes) {
    switch (mov.tipo) {
      case "venda": {
        if (mov.metodo === "dinheiro") {
          vendasDinheiro += mov.valor;
        } else {
          vendasOutras += mov.valor;
        }
        if (mov.metodo) {
          vendasPorMetodo[mov.metodo] = (vendasPorMetodo[mov.metodo] ?? 0) + mov.valor;
        }
        break;
      }
      case "troco":
        trocos += mov.valor;
        break;
      case "sangria":
        sangrias += mov.valor;
        break;
      case "entrada":
        entradas += mov.valor;
        break;
    }
  }

  return {
    saldoInicial,
    vendasDinheiro,
    vendasOutras,
    totalVendas: vendasDinheiro + vendasOutras,
    vendasPorMetodo,
    trocos,
    sangrias,
    entradas,
    dinheiroEmCaixa: saldoInicial + vendasDinheiro - trocos - sangrias + entradas,
    movimentacoes,
  };
}

interface CaixaState {
  aberto: boolean;
  saldoInicial: number;
  aberturaEm: string | null;
  movimentacoes: MovimentacaoCaixa[];
  abrirCaixa: (valorInicial: number) => Promise<void>;
  registrarVenda: (total: number, metodo: FormaPagamento, troco?: number) => void;
  registrarSangria: (valor: number, motivo: string) => Promise<void>;
  registrarEntrada: (valor: number, motivo: string) => Promise<void>;
  fecharCaixa: () => Promise<CaixaResumo | null>;
}

const CaixaContext = React.createContext<CaixaState | null>(null);

export function CaixaProvider({ children }: { children: React.ReactNode }) {
  const [aberto, setAberto] = React.useState(false);
  const [saldoInicial, setSaldoInicial] = React.useState(0);
  const [aberturaEm, setAberturaEm] = React.useState<string | null>(null);
  const [movimentacoes, setMovimentacoes] = React.useState<MovimentacaoCaixa[]>([]);

  // Carrega o caixa do banco (aberto no turno atual ou movimentações do dia).
  const carregarCaixa = React.useCallback(() => {
    api<{
      aberto: boolean;
      saldoInicial: number;
      aberturaEm: string | null;
      movimentacoes: MovimentacaoCaixa[];
    }>("/api/caixa")
      .then((dados) => {
        setAberto(dados.aberto);
        setSaldoInicial(dados.saldoInicial);
        setAberturaEm(dados.aberturaEm);
        setMovimentacoes(dados.movimentacoes);
      })
      .catch((erro) => {
        toast.error(
          `Não foi possível carregar o caixa: ${erro instanceof Error ? erro.message : "falha desconhecida"}`
        );
      });
  }, []);

  React.useEffect(() => carregarCaixa(), [carregarCaixa]);
  // Sincronização entre dispositivos: outro caixa/PDV registrando uma
  // venda/pagamento atualiza este aparelho sozinho.
  useEventosTempoReal(["pedido"], carregarCaixa);

  const abrirCaixa = React.useCallback(async (valorInicial: number) => {
    try {
      await api("/api/caixa/abrir", {
        method: "POST",
        body: JSON.stringify({ saldoInicial: valorInicial }),
      });
      setSaldoInicial(valorInicial);
      setAberturaEm(new Date().toISOString());
      setAberto(true);
      setMovimentacoes([
        {
          id: criarUid("caixa"),
          tipo: "entrada",
          valor: valorInicial,
          descricao: "Abertura de caixa",
          criadoEm: new Date().toISOString(),
        },
      ]);
      toast.success("Caixa aberto. Boas vendas!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível abrir o caixa.");
    }
  }, []);

  const registrarVenda = React.useCallback(
    (total: number, metodo: FormaPagamento, troco?: number) => {
      const agora = new Date().toISOString();
      const rotulo = rotuloFormaPagamento(metodo);
      setMovimentacoes((prev) => {
        const proximas: MovimentacaoCaixa[] = [
          {
            id: criarUid("caixa"),
            tipo: "venda",
            valor: total,
            descricao: `Venda — ${rotulo}`,
            metodo,
            criadoEm: agora,
          },
        ];
        if (troco && troco > 0) {
          proximas.push({
            id: criarUid("caixa"),
            tipo: "troco",
            valor: troco,
            descricao: `Troco — ${rotulo}`,
            criadoEm: agora,
          });
        }
        return [...prev, ...proximas];
      });
    },
    []
  );

  const registrarSangria = React.useCallback(async (valor: number, motivo: string) => {
    try {
      await api("/api/caixa/movimentacoes", {
        method: "POST",
        body: JSON.stringify({ tipo: "sangria", valor, descricao: motivo || "Sangria" }),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível registrar a sangria.");
      return;
    }
    setMovimentacoes((prev) => [
      ...prev,
      {
        id: criarUid("caixa"),
        tipo: "sangria",
        valor,
        descricao: motivo || "Sangria",
        criadoEm: new Date().toISOString(),
      },
    ]);
    toast.success("Sangria registrada.");
  }, []);

  const registrarEntrada = React.useCallback(async (valor: number, motivo: string) => {
    try {
      await api("/api/caixa/movimentacoes", {
        method: "POST",
        body: JSON.stringify({ tipo: "entrada", valor, descricao: motivo || "Entrada extra" }),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível registrar a entrada.");
      return;
    }
    setMovimentacoes((prev) => [
      ...prev,
      {
        id: criarUid("caixa"),
        tipo: "entrada",
        valor,
        descricao: motivo || "Entrada extra",
        criadoEm: new Date().toISOString(),
      },
    ]);
    toast.success("Entrada registrada.");
  }, []);

  const fecharCaixa = React.useCallback(
    async (): Promise<CaixaResumo | null> => {
      if (!aberto) return null;

      const resumo = calcularResumoCaixa(movimentacoes, saldoInicial);

      try {
        await api("/api/caixa/fechar", { method: "POST" });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível fechar o caixa.");
        return null;
      }

      setAberto(false);
      setSaldoInicial(0);
      setAberturaEm(null);
      setMovimentacoes([]);
      return resumo;
    },
    [aberto, movimentacoes, saldoInicial]
  );

  const value = React.useMemo(
    () => ({
      aberto,
      saldoInicial,
      aberturaEm,
      movimentacoes,
      abrirCaixa,
      registrarVenda,
      registrarSangria,
      registrarEntrada,
      fecharCaixa,
    }),
    [
      aberto,
      saldoInicial,
      aberturaEm,
      movimentacoes,
      abrirCaixa,
      registrarVenda,
      registrarSangria,
      registrarEntrada,
      fecharCaixa,
    ]
  );

  return <CaixaContext.Provider value={value}>{children}</CaixaContext.Provider>;
}

export function useCaixa() {
  const ctx = React.useContext(CaixaContext);
  if (!ctx) {
    throw new Error("useCaixa deve ser usado dentro de <CaixaProvider>.");
  }
  return ctx;
}

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React from "react";

/**
 * Repro de DOM (happy-dom) para a exceção de cliente em
 * /admin/configuracoes (aba Produtos).
 *
 * O hook `useApi` é mockado de modo a devolver o `dados` que o backend
 * `/api/catalogo` devolveria. Isso deixa o teste independente de rede e de
 * banco — e permite simular tanto o caso "bom" (categoria como STRING)
 * quanto o caso "quebrado" (categoria como OBJETO, o bug original da rota).
 */
const __catalogo = vi.hoisted(() => ({
  dados: { produtos: [] as unknown[], categorias: [] as unknown[] },
}));

vi.mock("@/lib/api-cliente", () => ({
  useApi: () => ({
    dados: __catalogo.dados,
    carregando: false,
    erro: null,
    recarregar: () => {},
  }),
  api: () => Promise.resolve({}),
}));

vi.mock("sonner", () => ({
  toast: { success: () => {}, error: () => {}, warning: () => {}, info: () => {} },
}));

const { ConfigProdutos } = await import(
  "@/app/admin/configuracoes/_components/config-produtos"
);

function produto(categoria: unknown) {
  return {
    id: "p1",
    nome: "Produto p1",
    categoria,
    preco: 32.9,
    emoji: "🍕",
    ativo: true,
    destaque: false,
    ncm: "1905.90.90",
    cest: null,
    csosn: "102",
    cfop: "5102",
    unidade: "UN",
    fotoUrl: null,
  };
}

describe("ConfigProdutos (mount) — DOM", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza a tabela com categoria string (caso feliz) sem lançar", async () => {
    __catalogo.dados = {
      categorias: ["Bebidas", "Pizzas salgadas"],
      produtos: [produto("Pizzas salgadas"), { ...produto("Bebidas"), id: "p2" }],
    };
    await act(async () => {
      render(<ConfigProdutos />);
    });
    const linhas = screen.getAllByRole("row");
    // 1 cabeçalho + 2 linhas de produto
    expect(linhas).toHaveLength(3);
    expect(screen.queryByText(/não foi possível carregar esta seção/i)).toBeNull();
  });

  it("não quebra (sem fallback de erro) quando categoria vem como objeto", async () => {
    // Sem o flatten defensivo, categoriasConhecida faz
    // Array.from(...).sort((a,b) => a.localeCompare(b,"pt-BR")) e `a` é
    // {nome,id} → "a.localeCompare is not a function" → ErrorBoundary cai.
    __catalogo.dados = {
      categorias: ["Pizzas salgadas"],
      produtos: [produto({ nome: "Pizzas salgadas", id: "x" })],
    };
    await act(async () => {
      render(<ConfigProdutos />);
    });
    // Com o fix defensivo, a tela NÃO cai no fallback:
    expect(screen.queryByText(/não foi possível carregar esta seção/i)).toBeNull();
  });

  it("não quebra no sort de categorias quando categorias[] vem como objeto", async () => {
    // categoriasConhecida faz Array(...).sort((a,b) => a.localeCompare(b,"pt-BR"));
    // se `categorias` vier com objetos, o sort lançava "a.localeCompare is not a function".
    __catalogo.dados = {
      categorias: [{ nome: "Bebidas", id: "y" }],
      produtos: [produto("Bebidas")],
    };
    await act(async () => {
      render(<ConfigProdutos />);
    });
    expect(screen.queryByText(/não foi possível carregar esta seção/i)).toBeNull();
  });
});

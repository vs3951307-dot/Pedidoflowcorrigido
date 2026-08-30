import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ProdutoCard } from "./produto-card";
import { PdvProvider, usePdv } from "@/app/pdv/_lib/pdv-context";
import type { Produto, SelecaoPizza } from "@/lib/catalogo";

// Isola o teste do Radix Dialog (ambiente happy-dom não renderiza portal de
// dialog de forma confiável) — aqui só importa que o card abra o picker.
vi.mock("@/app/pdv/_components/pizza-picker-dialog", () => ({
  PizzaPickerDialog: ({ open, onConfirmar }: any) =>
    open ? (
      <div data-testid="picker">
        <button
          data-testid="picker-confirm"
          onClick={() =>
            onConfirmar({
              produtoId: "p1",
              nome: "Pizza Calabresa Média",
              precoUnit: 50,
              quantidade: 1,
              tamanhoId: "t1",
              tamanhoNome: "Média",
              sabores: [{ id: "s1", nome: "Calabresa", tipo: "tradicional" }],
              adicionais: [],
            } as SelecaoPizza)
          }
        >
          Confirmar
        </button>
      </div>
    ) : null,
}));

const pizza: Produto = {
  id: "p1",
  nome: "Pizza Calabresa",
  descricao: "Saborosa",
  preco: 40,
  categoria: "Pizzas",
  emoji: "🍕",
  sabores: [{ id: "s1", nome: "Calabresa", tipo: "tradicional" }],
  tamanhos: [{ id: "t1", nome: "Média", preco: 40, maxSabores: 2 }],
};

const bebida: Produto = {
  id: "b1",
  nome: "Coca Lata",
  descricao: "350ml",
  preco: 6,
  categoria: "Bebidas",
  emoji: "🥤",
};

describe("ProdutoCard — cliques e adição", () => {
  it("clicar em produto simples adiciona direto à comanda", () => {
    const onAdicionar = vi.fn();
    render(<ProdutoCard produto={bebida} onAdicionar={onAdicionar} />);
    fireEvent.click(screen.getByLabelText("Adicionar Coca Lata"));
    expect(onAdicionar).toHaveBeenCalledTimes(1);
    expect(onAdicionar.mock.calls[0][0].id).toBe("b1");
  });

  it("clicar no card de pizza abre a personalização (não adiciona direto)", () => {
    const onAdicionar = vi.fn();
    render(<ProdutoCard produto={pizza} onAdicionar={onAdicionar} />);
    fireEvent.click(screen.getByLabelText("Adicionar Pizza Calabresa"));
    expect(onAdicionar).not.toHaveBeenCalled();
    expect(screen.getByTestId("picker")).toBeTruthy();
  });

  it("confirmar a personalização repassa a escolha (sabores/tamanho)", () => {
    const onAdicionar = vi.fn();
    render(<ProdutoCard produto={pizza} onAdicionar={onAdicionar} />);
    fireEvent.click(screen.getByLabelText("Adicionar Pizza Calabresa"));
    fireEvent.click(screen.getByTestId("picker-confirm"));
    expect(onAdicionar).toHaveBeenCalledTimes(1);
    const escolha = onAdicionar.mock.calls[0][1];
    expect(escolha).toMatchObject({
      nome: "Pizza Calabresa Média",
      precoUnit: 50,
      tamanhoNome: "Média",
      sabores: [{ id: "s1", nome: "Calabresa" }],
    });
  });
});

describe("PdvContext — item na comanda", () => {
  it("adicionarProduto com escolha monta o ItemPedido com sabores/tamanho", () => {
    let ctxRef: ReturnType<typeof usePdv> | null = null;
    function Captura() {
      ctxRef = usePdv();
      return null;
    }
    render(
      <PdvProvider>
        <Captura />
      </PdvProvider>
    );
    const escolha: SelecaoPizza = {
      produtoId: "p1",
      nome: "Pizza Calabresa Média",
      precoUnit: 50,
      quantidade: 2,
      tamanhoId: "t1",
      tamanhoNome: "Média",
      sabores: [{ id: "s1", nome: "Calabresa", tipo: "tradicional" }],
      adicionais: [],
    };
    act(() => {
      ctxRef!.adicionarProduto(pizza, escolha);
    });
    expect(ctxRef!.itens).toHaveLength(1);
    const item = ctxRef!.itens[0];
    expect(item.produtoId).toBe("p1");
    expect(item.tamanhoNome).toBe("Média");
    expect(item.sabores?.[0].nome).toBe("Calabresa");
    expect(item.quantidade).toBe(2);
    expect(item.precoUnit).toBe(50);
  });

  it("dois sabores diferentes viram linhas distintas (não mescla)", () => {
    let ctxRef: ReturnType<typeof usePdv> | null = null;
    function Captura() {
      ctxRef = usePdv();
      return null;
    }
    render(
      <PdvProvider>
        <Captura />
      </PdvProvider>
    );
    const base = {
      produtoId: "p1",
      nome: "Pizza",
      precoUnit: 50,
      quantidade: 1,
      tamanhoNome: "Média",
      adicionais: [],
    };
    act(() => {
      ctxRef!.adicionarProduto(pizza, {
        ...base,
        sabores: [{ id: "s1", nome: "Calabresa", tipo: "tradicional" }],
      } as SelecaoPizza);
      ctxRef!.adicionarProduto(pizza, {
        ...base,
        sabores: [{ id: "s2", nome: "Mussarela", tipo: "tradicional" }],
      } as SelecaoPizza);
    });
    expect(ctxRef!.itens).toHaveLength(2);
  });
});

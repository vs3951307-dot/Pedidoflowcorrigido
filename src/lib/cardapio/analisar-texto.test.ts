import { describe, it, expect } from "vitest";
import { analisarCardapioTexto, emojiParaCategoria } from "./analisar-texto";

describe("analisarCardapioTexto", () => {
  it("reconhece produtos com preço único", () => {
    const r = analisarCardapioTexto("Coxinha: 6,00\nPizza Portuguesa: 42,90");
    expect(r.itens).toHaveLength(2);
    expect(r.itens[0]).toMatchObject({ nome: "Coxinha", categoria: "Geral" });
    expect(r.itens[0].tamanhos).toEqual([{ nome: "Único", valor: 6 }]);
    expect(r.itens[1].tamanhos[0].valor).toBe(42.9);
  });

  it("reconhece vários tamanhos com | e R$", () => {
    const r = analisarCardapioTexto(
      "Pizza Calabresa | M R$ 32,90 | G R$ 42,90"
    );
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0].tamanhos).toEqual([
      { nome: "M", valor: 32.9 },
      { nome: "G", valor: 42.9 },
    ]);
  });

  it("reconhece tamanho inline (palavra e dígito+unidade)", () => {
    const r = analisarCardapioTexto(
      "Pizza Grande 55,00\nCoca-Cola 2L 8,00"
    );
    expect(r.itens).toHaveLength(2);
    expect(r.itens[0].tamanhos).toEqual([{ nome: "Grande", valor: 55 }]);
    expect(r.itens[1].tamanhos).toEqual([{ nome: "2L", valor: 8 }]);
  });

  it("reconhece tamanho entre parênteses", () => {
    const r = analisarCardapioTexto("Fatia de pizza (M) 8,00");
    expect(r.itens[0].tamanhos).toEqual([{ nome: "M", valor: 8 }]);
  });

  it("respeita cabeçalho de categoria", () => {
    const r = analisarCardapioTexto(
      "Categoria: Pizzas salgadas\nPizza Calabresa: 32,90\nCoxinha: 6,00"
    );
    expect(r.itens.map((i) => i.categoria)).toEqual([
      "Pizzas salgadas",
      "Pizzas salgadas",
    ]);
  });

  it("reconhece cabeçalho de categoria com ':' no fim da linha", () => {
    const r = analisarCardapioTexto(
      "Pizzas salgadas:\nPizza Calabresa: 32,90"
    );
    expect(r.itens[0].categoria).toBe("Pizzas salgadas");
  });

  it("captura sabores e adicionais com preço", () => {
    const r = analisarCardapioTexto(
      "Sabor: Calabresa, Mussarela\nAdicional: Queijo R$ 4,00 | Borda R$ 6,00"
    );
    expect(r.sabores).toEqual(["Calabresa", "Mussarela"]);
    expect(r.adicionais).toEqual([
      { nome: "Queijo", valor: 4 },
      { nome: "Borda", valor: 6 },
    ]);
  });

  it("não confunde 'Pizza 4 Queijos' com preço", () => {
    const r = analisarCardapioTexto("Pizza 4 Queijos: 45,00");
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0].nome).toBe("Pizza 4 Queijos");
    expect(r.itens[0].tamanhos[0].valor).toBe(45);
  });

  it("registra linhas não reconhecidas em erros", () => {
    const r = analisarCardapioTexto("Coxinha de frango (sem preço)");
    expect(r.itens).toHaveLength(0);
    expect(r.erros).toContain("Coxinha de frango (sem preço)");
  });

  it("não cria duplicados de sabor", () => {
    const r = analisarCardapioTexto("Sabor: Calabresa, calabresa");
    expect(r.sabores).toEqual(["Calabresa"]);
  });
});

describe("emojiParaCategoria", () => {
  it("mapeia categorias comuns", () => {
    expect(emojiParaCategoria("Pizzas salgadas")).toBe("🍕");
    expect(emojiParaCategoria("Bebidas")).toBe("🥤");
    expect(emojiParaCategoria("Sobremesas")).toBe("🍰");
    expect(emojiParaCategoria("Lanches")).toBe("🍔");
    expect(emojiParaCategoria("Entradas")).toBe("🍢");
    expect(emojiParaCategoria("Geral")).toBe("🍽️");
  });
});

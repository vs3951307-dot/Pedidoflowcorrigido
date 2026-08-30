import { describe, it, expect } from "vitest";
import { calcularPrecoItem, calcularTotalItens } from "./precificacao";

describe("calcularPrecoItem", () => {
  it("usa o preço base do produto quando não há tamanho", () => {
    expect(calcularPrecoItem({ precoBaseProduto: 35, adicionais: [] })).toBe(35);
  });
  it("usa o valor do tamanho quando informado", () => {
    expect(
      calcularPrecoItem({ precoBaseProduto: 35, tamanho: { nome: "Grande", valor: 50 }, adicionais: [] })
    ).toBe(50);
  });
  it("soma os adicionais ao preço base", () => {
    expect(
      calcularPrecoItem({
        precoBaseProduto: 35,
        adicionais: [{ nome: "Borda", preco: 8 }, { nome: "Bacon", preco: 6 }],
      })
    ).toBe(49);
  });

  // Regressão do bug de cobrança: o cliente mandava `preco * quantidade` e
  // o servidor descartava esse valor (sempre recalcula pelo cadastro), então
  // 3x bacon era cobrado como 1x.
  it("multiplica o adicional pela quantidade pedida", () => {
    expect(
      calcularPrecoItem({
        precoBaseProduto: 35,
        adicionais: [{ nome: "Bacon", preco: 6, quantidade: 3 }],
      })
    ).toBe(53);
  });

  it("trata adicional sem quantidade como 1", () => {
    expect(
      calcularPrecoItem({ precoBaseProduto: 35, adicionais: [{ nome: "Bacon", preco: 6 }] })
    ).toBe(41);
  });

  it("nunca cobra menos de 1x, mesmo com quantidade inválida", () => {
    expect(
      calcularPrecoItem({
        precoBaseProduto: 35,
        adicionais: [{ nome: "Bacon", preco: 6, quantidade: 0 }],
      })
    ).toBe(41);
    expect(
      calcularPrecoItem({
        precoBaseProduto: 35,
        adicionais: [{ nome: "Bacon", preco: 6, quantidade: -2 }],
      })
    ).toBe(41);
  });

  it("combina tamanho e adicionais com quantidade", () => {
    expect(
      calcularPrecoItem({
        precoBaseProduto: 35,
        tamanho: { nome: "Grande", valor: 50 },
        adicionais: [{ nome: "Borda", preco: 8 }, { nome: "Bacon", preco: 6, quantidade: 2 }],
      })
    ).toBe(70);
  });
});

describe("calcularTotalItens", () => {
  it("multiplica preço por quantidade e soma tudo", () => {
    expect(
      calcularTotalItens([{ precoUnit: 10, quantidade: 2 }, { precoUnit: 5, quantidade: 1 }])
    ).toBe(25);
  });
});

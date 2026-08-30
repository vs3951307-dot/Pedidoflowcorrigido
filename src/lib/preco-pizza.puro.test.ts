import { describe, expect, it } from "vitest";
import { calcularPrecoItem, ehSaborPremium, validarMisturaSabores, type SaborPreco } from "./preco-pizza";

/**
 * Testes PUROS da fórmula de preço de pizza — sem banco.
 *
 * POR QUE ESTE ARQUIVO EXISTE (lacuna encontrada na auditoria):
 * `preco-pizza.test.ts` prova a regra contra os PREÇOS REAIS do seed, o
 * que é certo e deve continuar. Só que ele abre conexão com o Postgres
 * já no `beforeAll` — então, sem banco disponível, a suíte inteira falha
 * no import e as 25 asserções da fórmula NÃO rodam. Resultado prático:
 * num ambiente sem Postgres (a máquina de um dev novo, um CI enxuto),
 * dá para quebrar a fórmula de preço e nada acusa.
 *
 * Este arquivo cobre a FÓRMULA com preços fixos passados na entrada. Ele
 * não substitui o teste com banco (que prova que o cadastro casa com a
 * tabela do cardápio) — os dois juntos cobrem coisas diferentes:
 *   - aqui: a matemática está certa?
 *   - lá:   os preços cadastrados são os do cardápio?
 *
 * Os valores seguem o cardápio fechado da Disk Pizza Rozeno:
 * Média 46 (tradicional) / 52 (especial); Grande 56 / 62;
 * Família 66 / 72; acréscimo de R$ 10 por sabor premium ADICIONAL.
 */

const ACRESCIMO = 10;

function tradicional(preco: number): SaborPreco {
  return { saborId: `trad-${preco}`, tipo: "tradicional", precoNoTamanho: preco };
}
function especial(preco: number): SaborPreco {
  return { saborId: `esp-${preco}`, tipo: "especial", precoNoTamanho: preco };
}
function doce(preco: number): SaborPreco {
  return { saborId: `doce-${preco}`, tipo: "doce", precoNoTamanho: preco };
}

function preco(sabores: SaborPreco[], maxSabores: number, quantidade = 1, adicionais: { preco: number; quantidade: number }[] = []) {
  const r = calcularPrecoItem({
    sabores,
    adicionais,
    quantidade,
    acrescimoPorSaborPremium: ACRESCIMO,
    maxSabores,
  });
  if ("erro" in r) throw new Error(`esperava preço, veio erro: ${r.erro}`);
  return r;
}

describe("acréscimo por sabor premium ADICIONAL", () => {
  it("1 sabor tradicional: Média = 46", () => {
    expect(preco([tradicional(46)], 2).precoUnitario).toBe(46);
  });

  it("2 sabores tradicionais NÃO geram acréscimo: Média = 46", () => {
    expect(preco([tradicional(46), tradicional(46)], 2).precoUnitario).toBe(46);
  });

  it("1 sabor especial sozinho NÃO gera acréscimo: Média = 52", () => {
    expect(preco([especial(52)], 2).precoUnitario).toBe(52);
  });

  it("2 sabores especiais geram 1× R$10: Média = 52 + 10 = 62", () => {
    expect(preco([especial(52), especial(52)], 2).precoUnitario).toBe(62);
  });

  it("3 sabores especiais geram 2× R$10: Família = 72 + 20 = 92", () => {
    expect(preco([especial(72), especial(72), especial(72)], 3).precoUnitario).toBe(92);
  });

  it("2 especiais + 1 tradicional na Família = 72 + 10 = 82", () => {
    expect(preco([especial(72), especial(72), tradicional(66)], 3).precoUnitario).toBe(82);
  });

  it("3 tradicionais na Família = 66, sem acréscimo", () => {
    expect(preco([tradicional(66), tradicional(66), tradicional(66)], 3).precoUnitario).toBe(66);
  });

  it("doce conta como faixa premium: 2 doces na Média = 52 + 10 = 62", () => {
    expect(preco([doce(52), doce(52)], 2).precoUnitario).toBe(62);
  });
});

describe("cobra o MAIOR preço entre os sabores", () => {
  it("tradicional escolhido primeiro NÃO define o preço quando há um especial", () => {
    // Este é exatamente o erro que o WhatsApp cometia: cobrava o preço do
    // produto que o cliente citou primeiro.
    expect(preco([tradicional(46), especial(52)], 2).precoUnitario).toBe(52);
  });

  it("a ordem dos sabores não altera o resultado", () => {
    const a = preco([especial(52), tradicional(46)], 2).precoUnitario;
    const b = preco([tradicional(46), especial(52)], 2).precoUnitario;
    expect(a).toBe(b);
  });
});

describe("adicionais e quantidade", () => {
  it("soma adicionais ao preço base: 46 + 6 = 52", () => {
    expect(preco([tradicional(46)], 2, 1, [{ preco: 6, quantidade: 1 }]).precoUnitario).toBe(52);
  });

  it("multiplica o adicional pela quantidade dele: 46 + (6 × 3) = 64", () => {
    expect(preco([tradicional(46)], 2, 1, [{ preco: 6, quantidade: 3 }]).precoUnitario).toBe(64);
  });

  it("total = preço unitário × quantidade do item", () => {
    const r = preco([especial(52), especial(52)], 2, 3);
    expect(r.precoUnitario).toBe(62);
    expect(r.total).toBe(186);
  });

  it("não acumula erro de ponto flutuante", () => {
    const r = preco([tradicional(46.1)], 2, 3, [{ preco: 0.2, quantidade: 1 }]);
    expect(r.precoUnitario).toBe(46.3);
    expect(r.total).toBe(138.9);
  });
});

describe("limite de sabores do tamanho", () => {
  it("recusa 3 sabores num tamanho que aceita 2", () => {
    const r = calcularPrecoItem({
      sabores: [tradicional(46), tradicional(46), tradicional(46)],
      adicionais: [],
      quantidade: 1,
      acrescimoPorSaborPremium: ACRESCIMO,
      maxSabores: 2,
    });
    expect("erro" in r).toBe(true);
  });

  it("aceita exatamente o limite", () => {
    expect(() => preco([tradicional(66), tradicional(66), tradicional(66)], 3)).not.toThrow();
  });
});

describe("classificação de sabor premium", () => {
  it("tradicional não é premium; especial e doce são", () => {
    expect(ehSaborPremium("tradicional")).toBe(false);
    expect(ehSaborPremium("especial")).toBe(true);
    expect(ehSaborPremium("doce")).toBe(true);
  });
});

describe("mistura doce/salgada", () => {
  it("recusa doce + salgada quando a empresa não permite", () => {
    expect(validarMisturaSabores([doce(52), especial(52)], false)).not.toBeNull();
  });

  it("permite só doces mesmo quando a mistura está desativada", () => {
    expect(validarMisturaSabores([doce(52), doce(52)], false)).toBeNull();
  });

  it("permite a mistura quando a empresa habilita", () => {
    expect(validarMisturaSabores([doce(52), tradicional(46)], true)).toBeNull();
  });
});

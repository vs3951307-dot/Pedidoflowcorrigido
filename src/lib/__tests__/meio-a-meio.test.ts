import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardas contra a volta dos bugs de "meio a meio".
 *
 * Os três defeitos que estes testes travam:
 *
 * 1. `GET /api/catalogo` mapeava `pt.tamanho.maxSabores` sem incluir
 *    `maxSabores` no `select` do Prisma. O campo vinha sempre `undefined`,
 *    o front caía no fallback `MAX_SABORES_PADRAO` (2) e a Família nunca
 *    aceitava os 3 sabores que o banco autoriza.
 *
 * 2. O seletor de pizza só oferecia `produto.sabores`. Como "Pizzas
 *    salgadas" e "Pizzas especiais" são produtos distintos no cadastro,
 *    meio a meio tradicional + especial era impossível de montar — apesar
 *    de o servidor sempre ter aceitado (ele resolve sabor por nome em
 *    qualquer produto).
 *
 * 3. O seletor calculava o preço com `precoNoTamanho: precoBase` para
 *    TODOS os sabores. A regra "cobra o maior preço entre os sabores"
 *    virava "cobra o preço do produto aberto": a tela mostrava R$ 56 e a
 *    comanda saía R$ 62.
 *
 * São testes de origem (leem o arquivo) porque rodam sem banco e sem
 * navegador — o custo é quase zero e eles pegam exatamente a regressão.
 */

function fonte(caminho: string): string {
  return readFileSync(join(process.cwd(), caminho), "utf8");
}

/**
 * Fonte SEM comentários. Necessário porque as correções deixaram, de
 * propósito, o trecho antigo citado no comentário ("ANTES: ...") para
 * explicar o bug — e uma asserção de ausência bateria no comentário em vez
 * de no código.
 */
function codigo(caminho: string): string {
  return fonte(caminho)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("GET /api/catalogo entrega os dados que o meio a meio precisa", () => {
  const rota = fonte("src/app/api/catalogo/route.ts");

  it("inclui maxSabores no select do tamanho", () => {
    // Sem isto, `tamanho.maxSabores` chega undefined no front.
    expect(rota).toMatch(/tamanho:\s*\{\s*select:\s*\{[^}]*maxSabores:\s*true/);
  });

  it("expõe saboresDisponiveis (catálogo global de sabores)", () => {
    expect(rota).toMatch(/saboresDisponiveis/);
  });

  it("cada sabor global carrega o preço por tamanho", () => {
    expect(rota).toMatch(/precoPorTamanho/);
  });
});

describe("seletor de pizza calcula o preço como o servidor", () => {
  const picker = codigo("src/app/pdv/_components/pizza-picker-dialog.tsx");

  it("NÃO usa precoBase como preço de todos os sabores", () => {
    expect(picker).not.toMatch(/precoNoTamanho:\s*precoBase\s*,/);
  });

  it("resolve o preço de cada sabor no tamanho escolhido", () => {
    expect(picker).toMatch(/precoNoTamanho:\s*precoDoSabor\(/);
    expect(picker).toMatch(/precoPorTamanho\[nomeTamanho\]/);
  });

  it("aceita o catálogo global de sabores", () => {
    expect(picker).toMatch(/saboresDisponiveis\?:\s*SaborDisponivel\[\]/);
  });

  it("NÃO corta a lista de sabores em 12", () => {
    // Com 19 tradicionais + 9 especiais, o corte escondia a maioria.
    expect(picker).not.toMatch(/ordenados\.slice\(0,\s*12\)/);
  });

  it("bloqueia a confirmação quando a regra recusa o item", () => {
    // Antes o preço caía para uma conta improvisada e o botão seguia
    // habilitado: o erro só aparecia quando o servidor recusava.
    expect(picker).toMatch(/!impedimento/);
    expect(picker).toMatch(/validarMisturaSabores\(/);
  });
});

describe("comanda da mesa não esconde a causa real do erro", () => {
  const rota = fonte("src/app/api/mesas/[id]/itens/route.ts");

  it("recusa tamanho inexistente com mensagem própria", () => {
    // Antes seguia com maxSabores = 1 e a pizza era recusada com
    // "aceita no máximo 1 sabore(s)", que não é a causa.
    expect(rota).toMatch(/não está cadastrado para/);
  });
});

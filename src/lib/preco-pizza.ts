/**
 * Regra de preço de pizza — função PURA (sem acesso a banco), testável
 * direto. É a ÚNICA fonte da fórmula; front e back-end a chamam.
 *
 * Fórmula fechada com o dono do negócio (Disk Pizza Rozeno):
 *
 *   precoUnitario =
 *       MAIOR precoNoTamanho entre os sabores escolhidos
 *     + acrescimoPorSaborPremium × max(0, qtdSaboresPremium − 1)
 *     + soma dos adicionais (preco × quantidade)
 *
 * onde qtdSaboresPremium = sabores com tipo != "tradicional"
 * (ou seja, "especial" e "doce" — a faixa premium).
 *
 * Pontos críticos que esta função garante:
 * - É MAIOR preço entre os sabores, nunca o do primeiro clicado.
 * - O acréscimo é POR sabor premium ADICIONAL e multiplicado (3 sabores
 *   premium = 2× acréscimo), não um valor fixo somado uma vez.
 * - Dois sabores tradicionais não geram acréscimo.
 * - Valida o limite de sabores do tamanho (maxSabores).
 */

export type TipoSabor = "tradicional" | "especial" | "doce" | (string & {});

export interface SaborPreco {
  saborId: string;
  tipo: TipoSabor;
  /** Preço do sabor (produto) no tamanho escolhido. */
  precoNoTamanho: number;
}

export interface AdicionalPreco {
  preco: number;
  quantidade: number;
}

export interface EntradaPrecoPizza {
  sabores: SaborPreco[];
  adicionais: AdicionalPreco[];
  quantidade: number;
  /** Acréscimo por sabor premium adicional (configurável por empresa). */
  acrescimoPorSaborPremium: number;
  /** Limite de sabores do tamanho escolhido (Tamanho.maxSabores). */
  maxSabores: number;
}

export interface ResultadoPrecoPizza {
  precoUnitario: number;
  total: number;
}

export type ResultadoPrecoPizzaOuErro = ResultadoPrecoPizza | { erro: string };

/** Arredonda para 2 casas (centavos) sem viés de ponto flutuante. */
function arredondar(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/** Sabor premium = qualquer tipo que não seja "tradicional" (especial/doce). */
export function ehSaborPremium(tipo: TipoSabor): boolean {
  return tipo !== "tradicional";
}

export function calcularPrecoItem(
  entrada: EntradaPrecoPizza
): ResultadoPrecoPizzaOuErro {
  const sabores = entrada.sabores ?? [];
  const adicionais = entrada.adicionais ?? [];
  const quantidade = Math.max(1, Math.floor(entrada.quantidade ?? 1));
  const maxSabores = Math.max(1, Math.floor(entrada.maxSabores ?? 1));
  const acrescimo = Math.max(0, Number(entrada.acrescimoPorSaborPremium ?? 0));

  if (sabores.length > maxSabores) {
    return {
      erro: `Este tamanho aceita no máximo ${maxSabores} sabore(s). Foram escolhidos ${sabores.length}.`,
    };
  }

  const qtdPremium = sabores.filter((s) => ehSaborPremium(s.tipo)).length;
  const maiorPreco = sabores.reduce(
    (maior, s) => Math.max(maior, Number(s.precoNoTamanho) || 0),
    0
  );

  const totalAdicionais = adicionais.reduce(
    (soma, a) => soma + (Number(a.preco) || 0) * Math.max(1, Math.floor(a.quantidade ?? 1)),
    0
  );

  const acrescimoTotal = acrescimo * Math.max(0, qtdPremium - 1);
  const precoUnitario = arredondar(maiorPreco + acrescimoTotal + totalAdicionais);
  const total = arredondar(precoUnitario * quantidade);

  return { precoUnitario, total };
}

/**
 * Valida a mistura doce/salgada conforme a configuração da empresa.
 * Retorna uma mensagem de erro ou null quando está ok.
 */
export function validarMisturaSabores(
  sabores: SaborPreco[],
  permitirMisturarDoceSalgada: boolean
): string | null {
  if (permitirMisturarDoceSalgada) return null;
  const temDoce = sabores.some((s) => s.tipo === "doce");
  const temSalgada = sabores.some((s) => s.tipo !== "doce");
  if (temDoce && temSalgada) {
    return "Esta empresa não permite misturar sabores doces com salgados no mesmo item.";
  }
  return null;
}

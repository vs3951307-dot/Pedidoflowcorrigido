/**
 * Delivery (PEDIDO 17) — regras de negócio do fluxo de entrega:
 * taxa por bairro configurável, previsão e estados da entrega.
 *
 * A taxa é calculada pelo próprio sistema (regras em `config taxas`,
 * editáveis no admin) — sem geolocalização externa nesta etapa.
 */

import { prisma } from "@/lib/prisma";

export const STATUS_ENTREGA = ["aguardando", "preparo", "rota", "entregue", "cancelada"] as const;

export type StatusEntrega = (typeof STATUS_ENTREGA)[number];

export interface BairroTaxa {
  bairro: string;
  valor: number;
}

/** Regras configuráveis da taxa de entrega (config `taxas` → `taxaEntrega`). */
export interface ConfigTaxaEntrega {
  /** `fixa` = mesmo valor para todos; `bairro` = valor por bairro com fallback. */
  regra: "fixa" | "bairro";
  /** Valor usado na regra `fixa` (e na UI como referência). */
  valorFixo: number;
  /** Bairros não listados, quando a regra é por bairro. */
  valorPadrao: number;
  /** Pedidos com subtotal >= este valor não pagam taxa (0 = nunca grátis). */
  gratisAcima: number;
  bairros: BairroTaxa[];
}

export const TAXA_ENTREGA_PADRAO: ConfigTaxaEntrega = {
  regra: "bairro",
  valorFixo: 5.0,
  valorPadrao: 9.9,
  gratisAcima: 0,
  bairros: [
    { bairro: "Centro", valor: 5.0 },
    { bairro: "Bela Vista", valor: 6.5 },
    { bairro: "Consolação", valor: 7.5 },
    { bairro: "Jardins", valor: 8.5 },
    { bairro: "Itaim Bibi", valor: 9.5 },
    { bairro: "Vila Mariana", valor: 10.5 },
    { bairro: "Paraíso", valor: 8.0 },
  ],
};

/** Normaliza qualquer formato persistido (novo ou legado) para a config atual. */
export function normalizarConfigTaxaEntrega(valor: unknown): ConfigTaxaEntrega {
  if (!valor || typeof valor !== "object") return TAXA_ENTREGA_PADRAO;
  const v = valor as Record<string, unknown>;
  const bairros = Array.isArray(v.bairros)
    ? (v.bairros as Record<string, unknown>[])
        .map((b) => ({
          bairro: String(b.bairro ?? "").trim(),
          valor: Math.max(0, Number(b.valor ?? 0)),
        }))
        .filter((b) => b.bairro)
    : [];
  return {
    regra: v.regra === "bairro" ? "bairro" : "fixa",
    valorFixo: Math.max(0, Number(v.valorFixo ?? 0)),
    valorPadrao: Math.max(0, Number(v.valorPadrao ?? (v as { valorFixo?: number }).valorFixo ?? 0)),
    gratisAcima: Math.max(0, Number(v.gratisAcima ?? 0)),
    bairros,
  };
}

/** Lê a config da taxa de entrega do banco (fallback: padrão). Escopo por empresa. */
export async function lerConfigTaxaEntrega(empresaId: string): Promise<ConfigTaxaEntrega> {
  const registro = await prisma.configuracao.findUnique({
    where: { empresaId_chave: { empresaId, chave: "taxas" } },
  });
  if (!registro) return TAXA_ENTREGA_PADRAO;
  try {
    const valor = JSON.parse(registro.valor) as { taxaEntrega?: unknown };
    return normalizarConfigTaxaEntrega(valor.taxaEntrega);
  } catch {
    return TAXA_ENTREGA_PADRAO;
  }
}

export interface ResultadoTaxaEntrega {
  taxa: number;
  regra: "fixa" | "bairro" | "gratuito";
  gratuito: boolean;
}

/** Calcula a taxa de entrega por regra configurada (bairro + subtotal). */
export function calcularTaxaEntrega(
  config: ConfigTaxaEntrega,
  bairro: string | null | undefined,
  subtotal: number
): ResultadoTaxaEntrega {
  if (config.gratisAcima > 0 && subtotal >= config.gratisAcima) {
    return { taxa: 0, regra: "gratuito", gratuito: true };
  }
  if (config.regra === "bairro" && config.bairros.length > 0 && bairro) {
    const limpo = bairro.trim().toLowerCase();
    const encontrado = config.bairros.find((b) => b.bairro.trim().toLowerCase() === limpo);
    return {
      taxa: Math.round((encontrado?.valor ?? config.valorPadrao) * 100) / 100,
      regra: "bairro",
      gratuito: false,
    };
  }
  return { taxa: Math.round(config.valorFixo * 100) / 100, regra: "fixa", gratuito: false };
}

/** Previsão padrão usada quando o caixa não informa uma previsão. */
export function previsaoEntregaPadrao(): string {
  return "35–45 min";
}

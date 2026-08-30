/**
 * Módulos habilitáveis por empresa (SaaS multiempresa).
 *
 * Cada Empresa tem uma lista de módulos ativos (`Empresa.modulos`, JSON).
 * Um módulo desativado bloqueia tanto o menu (frontend) quanto a API
 * correspondente (backend) — ver `exigirModulo` em `src/lib/acesso.ts`.
 *
 * IMPORTANTE: módulo é diferente de permissão de papel (`Recurso` em
 * `permissao.ts`). Permissão de papel diz "este usuário pode usar X";
 * módulo diz "esta empresa contratou X". As duas checagens são aplicadas
 * em conjunto — ambas precisam passar.
 */

export const MODULOS = [
  "pdv",
  "mesas", // mesas + garçom + QR Code
  "kds", // painel de produção da cozinha
  "delivery",
  "entregador",
  "estoque",
  "relatorios",
  "whatsapp", // atendimento WhatsApp/IA
  "fiscal", // NFC-e
  "impressao", // impressão térmica
  "copiloto", // copiloto interno (IA de relatórios)
] as const;

export type Modulo = (typeof MODULOS)[number];

export function ehModuloValido(valor: unknown): valor is Modulo {
  return typeof valor === "string" && (MODULOS as readonly string[]).includes(valor);
}

/** Módulos padrão de uma empresa nova (plano básico: o essencial). */
export const MODULOS_PADRAO_BASICO: Modulo[] = ["pdv", "estoque", "relatorios", "impressao"];
export const MODULOS_PADRAO_PROFISSIONAL: Modulo[] = [
  "pdv",
  "mesas",
  "kds",
  "delivery",
  "entregador",
  "estoque",
  "relatorios",
  "impressao",
];
export const MODULOS_PADRAO_COMPLETO: Modulo[] = [...MODULOS];

export function modulosPadraoDoPlano(plano: string): Modulo[] {
  if (plano === "completo") return MODULOS_PADRAO_COMPLETO;
  if (plano === "profissional") return MODULOS_PADRAO_PROFISSIONAL;
  return MODULOS_PADRAO_BASICO;
}

export function parseModulos(json: string): Modulo[] {
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.filter(ehModuloValido);
  } catch {
    return [];
  }
}

export function serializarModulos(modulos: Modulo[]): string {
  return JSON.stringify(Array.from(new Set(modulos)));
}

/** Mapa recurso (permissão de papel) → módulo exigido da empresa, quando aplicável. */
export const MODULO_DO_RECURSO: Record<string, Modulo | undefined> = {
  pdv: "pdv",
  salao: "mesas",
  kds: "kds",
  entregas: "entregador",
  pagamentos_entrega: "entregador",
  estoque: "estoque",
  atendimento: "whatsapp",
  fiscal: "fiscal",
  impressao: "impressao",
};

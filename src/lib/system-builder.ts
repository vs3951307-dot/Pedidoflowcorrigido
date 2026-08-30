/**
 * System Builder (PEDIDO 6): módulos, telas, menus, permissões,
 * identidade visual e textos são CONFIGURÁVEIS por empresa — nunca
 * exigem alterar código-fonte para atender um cliente novo.
 *
 * O que já é configurável hoje, por empresa, sem tocar em código:
 * - Módulos habilitados (`Empresa.modulos` — ver `src/lib/modulos.ts`).
 * - Plano/limites (`Empresa.planoId` → `Plano`).
 * - Identidade visual (`Empresa.tema` — cores, nome de exibição, logo).
 * - Textos de tela (`Empresa.textos` — rótulos e mensagens customizáveis).
 * - Itens de menu extras/ocultos (`Empresa.menuConfig`).
 *
 * O que NÃO é (e não deveria ser) configurável por aqui: lógica de
 * negócio nova, telas inteiras novas, integrações novas. Isso continua
 * exigindo desenvolvimento — a IA administrativa (src/lib/ia-admin.ts)
 * é instruída a reconhecer esse limite e AVISAR em vez de inventar.
 */

export interface TemaEmpresa {
  corPrimaria?: string;
  corSecundaria?: string;
  nomeExibicao?: string; // se diferente do nome fantasia
  logoUrl?: string;
  faviconUrl?: string;
  bannerUrl?: string;
  estiloFonte?: "padrao" | "arredondado" | "serifado";
  // Controles do Copiloto Supremo (PEDIDO 5/6 do Copiloto Supremo):
  // ajustes visuais comuns sem precisar editar código.
  raioBordas?: "reto" | "padrao" | "arredondado" | "muito-arredondado";
  tamanhoBotao?: "compacto" | "padrao" | "grande";
  tamanhoFonte?: "compacto" | "padrao" | "grande";
  densidadeMenu?: "compacto" | "padrao" | "confortavel";
}

export const CAMPOS_TEMA = [
  "corPrimaria",
  "corSecundaria",
  "nomeExibicao",
  "logoUrl",
  "faviconUrl",
  "bannerUrl",
  "estiloFonte",
  "raioBordas",
  "tamanhoBotao",
  "tamanhoFonte",
  "densidadeMenu",
] as const;

export interface ItemMenuConfig {
  chave: string; // recurso/módulo relacionado, ex.: "pdv", "relatorios"
  rotulo: string; // texto exibido no menu
  visivel: boolean;
  ordem?: number;
}

export function parseTema(json: string): TemaEmpresa {
  try {
    const v = JSON.parse(json);
    if (typeof v !== "object" || v === null) return {};
    const tema: TemaEmpresa = {};
    for (const campo of CAMPOS_TEMA) {
      const valor = v[campo];
      if (typeof valor === "string") (tema as Record<string, string>)[campo] = valor;
    }
    return tema;
  } catch {
    return {};
  }
}

export function serializarTema(tema: TemaEmpresa): string {
  return JSON.stringify(tema);
}

export function parseTextos(json: string): Record<string, string> {
  try {
    const v = JSON.parse(json);
    if (typeof v !== "object" || v === null) return {};
    const textos: Record<string, string> = {};
    for (const [chave, valor] of Object.entries(v)) {
      if (typeof valor === "string") textos[chave] = valor;
    }
    return textos;
  } catch {
    return {};
  }
}

export function serializarTextos(textos: Record<string, string>): string {
  return JSON.stringify(textos);
}

export function parseMenuConfig(json: string): ItemMenuConfig[] {
  try {
    const v = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    return v
      .filter((i) => i && typeof i.chave === "string" && typeof i.rotulo === "string")
      .map((i) => ({
        chave: String(i.chave),
        rotulo: String(i.rotulo),
        visivel: i.visivel !== false,
        ordem: typeof i.ordem === "number" ? i.ordem : undefined,
      }));
  } catch {
    return [];
  }
}

export function serializarMenuConfig(itens: ItemMenuConfig[]): string {
  return JSON.stringify(itens);
}

/** Textos padrão (fallback) usados quando a empresa não personalizou nada. */
export const TEXTOS_PADRAO: Record<string, string> = {
  boasVindasLogin: "Bem-vindo",
  slogan: "Seu sistema, do seu jeito.",
  rotuloPdv: "PDV",
  rotuloMesas: "Mesas",
  rotuloEntregador: "Entregador",
};

/** Resolve um texto: personalização da empresa > padrão da plataforma > fallback do chamador. */
export function textoResolvido(
  textosEmpresa: Record<string, string>,
  chave: string,
  fallback = ""
): string {
  return textosEmpresa[chave] ?? TEXTOS_PADRAO[chave] ?? fallback;
}

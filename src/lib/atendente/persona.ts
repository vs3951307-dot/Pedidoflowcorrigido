/**
 * Persona do atendente WhatsApp — configuração de "quem é" o robô que
 * atende o número da empresa (PEDIDO 18, evolução).
 *
 * O dono pode definir, pelo painel (Admin → Configurações → Atendente IA):
 * - `nome`: como a atendente se apresenta ("Ana", "Atendente Rozeno"...).
 * - `tom`: estilo da fala (simpático, profissional, descontraído, formal).
 * - `regras`: regras de negócio em texto livre (ex.: "pedido mínimo R$20",
 *   "não entregamos em bairro X", "não aceitamos cheques").
 * - `horario`: horário de funcionamento falado pela atendente (quando
 *   vazio, usa o horário cadastrado em Configurações → Empresa).
 *
 * Fica gravado na tabela `Configuracao` (chave "atendente_ia"), escopado
 * por `empresaId` — cada empresa tem a própria persona. A IA do atendente
 * (normalização) também recebe a persona no prompt para manter nome, tom e
 * regras consistentes.
 */

import { prisma } from "@/lib/prisma";

export const PERSONA_CONFIG_KEY = "atendente_ia";

export const TOMS_ATENDENTE = {
  simpatico: "Simpático",
  profissional: "Profissional",
  descontraido: "Descontraído",
  formal: "Formal",
} as const;

export type TomAtendente = keyof typeof TOMS_ATENDENTE;

export interface PersonaAtendente {
  /** Como a atendente se apresenta (vazio = fala genérica sem nome). */
  nome: string;
  /** Tom de voz nas respostas. */
  tom: TomAtendente;
  /** Regras de negócio em texto livre (uma por linha ou parágrafo). */
  regras: string;
  /** Horário de funcionamento falado (vazio = usa config da empresa). */
  horario: string;
}

export const PERSONA_PADRAO: PersonaAtendente = {
  nome: "",
  tom: "simpatico",
  regras: "",
  horario: "",
};

/** Valida/limpa um objeto vindo da configuração (nunca confia no JSON). */
function normalizarPersona(valor: unknown): PersonaAtendente {
  const v = (typeof valor === "object" && valor !== null ? valor : {}) as Record<string, unknown>;
  const nome = typeof v.nome === "string" ? v.nome.trim().slice(0, 80) : "";
  const tom =
    typeof v.tom === "string" && v.tom in TOMS_ATENDENTE
      ? (v.tom as TomAtendente)
      : PERSONA_PADRAO.tom;
  const regras = typeof v.regras === "string" ? v.regras.trim().slice(0, 4000) : "";
  const horario = typeof v.horario === "string" ? v.horario.trim().slice(0, 200) : "";
  return { nome, tom, regras, horario };
}

/** Carrega a persona DESTA empresa; sem config gravada, devolve o padrão. */
export async function carregarPersonaAtendente(empresaId: string): Promise<PersonaAtendente> {
  const registro = await prisma.configuracao
    .findUnique({ where: { empresaId_chave: { empresaId, chave: PERSONA_CONFIG_KEY } } })
    .catch(() => null);
  if (!registro?.valor) return PERSONA_PADRAO;
  try {
    return normalizarPersona(JSON.parse(registro.valor));
  } catch {
    return PERSONA_PADRAO;
  }
}

/** Grava (ou apaga) a persona DESTA empresa. */
export async function salvarPersonaAtendente(
  empresaId: string,
  persona: PersonaAtendente
): Promise<void> {
  const limpa = normalizarPersona(persona);
  const vazia = !limpa.nome && !limpa.regras && !limpa.horario && limpa.tom === PERSONA_PADRAO.tom;
  if (vazia) {
    await prisma.configuracao.deleteMany({
      where: { empresaId, chave: PERSONA_CONFIG_KEY },
    });
    return;
  }
  await prisma.configuracao.upsert({
    where: { empresaId_chave: { empresaId, chave: PERSONA_CONFIG_KEY } },
    update: { valor: JSON.stringify(limpa), atualizadoEm: new Date() },
    create: { empresaId, chave: PERSONA_CONFIG_KEY, valor: JSON.stringify(limpa) },
  });
}

/**
 * Abertura padrão que ajuda o cliente a saber o que pode fazer.
 *
 * NÃO é mais concatenada à saudação (isso duplicava frases e misturava
 * mensagens antigas com novas). Fica apenas como exposição auxiliar — as
 * respostas usam a saudação única `montarSaudacao` / `saudacaoInicial`.
 */
export const SUGESTAO_INICIAL = `(pode dizer *"pedir"*, *"cardápio"*, *"promoções"* ou *"horário"*)`;

/**
 * FONTE ÚNICA da saudação inicial da atendente.
 *
 * O texto é fixo e amigável: `Olá! 😊 Eu sou a {nome}, atendente da {loja}!
 * 🍕💜 Como posso ajudar você hoje?` — sem concatenar sugestões nem repetir
 * cumprimentos. Sem nome de atendente configurado, cai numa saudação neutra.
 *
 * `loja` é o `nomeFantasia` da empresa (leitura em `catalogo.ts`), nunca
 * inventado. Quando não informado, mantém um rótulo genérico.
 */
export function montarSaudacao(
  persona: PersonaAtendente,
  nomeCliente: string | null,
  loja?: string | null
): string {
  const nome = persona.nome.trim();
  const cliente = nomeCliente ? `Olá, ${nomeCliente}! 😊` : "Olá! 😊";
  if (!nome) {
    return `${cliente} O que você deseja hoje?`;
  }
  const lojaFinal = loja?.trim() || "nossa loja";
  return `${cliente} Eu sou a ${nome}, atendente da ${lojaFinal}! 🍕💜 Como posso ajudar você hoje?`;
}

/** Saudação única usada quando uma conversa realmente começa. */
export function saudacaoInicial(
  persona: PersonaAtendente,
  nomeCliente: string | null,
  loja?: string | null
): string {
  return montarSaudacao(persona, nomeCliente, loja);
}

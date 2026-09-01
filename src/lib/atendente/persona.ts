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
 * Abertura padrão — NÃO é usada mais como sugestão concatenada à saudação.
 * Mantida apenas por compatibilidade; as respostas usam `montarSaudacao`.
 */
export const SUGESTAO_INICIAL = "";

/**
 * FONTE ÚNICA da saudação inicial da atendente.
 *
 * Saudação curta e natural — sem listar comandos, sem "pode dizer pedir",
 * sem menu de opções. Apenas uma conversa humana no WhatsApp.
 *
 * `loja` é o `nomeFantasia` da empresa (leitura em `catalogo.ts`), nunca
 * inventado.
 */
export function montarSaudacao(
  persona: PersonaAtendente,
  nomeCliente: string | null,
  loja?: string | null
): string {
  const nome = persona.nome.trim();
  const cliente = nomeCliente ? `Oi, ${nomeCliente}! 😊` : "Oi! 😊";
  if (!nome) {
    return `${cliente} Tudo bem? Como posso te ajudar?`;
  }
  const lojaFinal = loja?.trim() || "nossa loja";
  return `${cliente} Eu sou a ${nome}, da ${lojaFinal} 🍕 Como posso te ajudar?`;
}

/** Saudação única usada quando uma conversa realmente começa. */
export function saudacaoInicial(
  persona: PersonaAtendente,
  nomeCliente: string | null,
  loja?: string | null
): string {
  return montarSaudacao(persona, nomeCliente, loja);
}

/**
 * Restrições de fluxo do atendente — usadas no prompt do LLM (beautifier)
 * e no guard de permissões. Documenta a ordem OBRIGATÓRIA das etapas:
 *
 * 1. Saudação → 2. Nome (se desconhecido) → 3. Intentação → 4. Produto →
 * 5. Tamanho (se aplicável) → 6. Sabores (se aplicável) → 7. Adicionais →
 * 8. Quantidade → 9. Mais itens? → 10. Entrega/Retirada → 11. Endereço
 * (se entrega) → 12. Pagamento → 13. Resumo → 14. Confirmação
 *
 * NUNCA pular etapas. NUNCA confirmar sem todos os dados coletados.
 */
export const RESTRICOES_FLUXO = `
REGRAS DE FLUXO (OBRIGATÓRIAS — NUNCA QUEBRAR):
- O pedido segue uma ordem fixa: produto → tamanho → sabores → adicionais → quantidade → entrega/retirada → endereço (se entrega) → pagamento → resumo → confirmação.
- NÃO pule etapas. NÃO confirme o pedido sem ter coletado: endereço (se entrega) E forma de pagamento.
- NÃO invente dados. Se faltar informação, PERGUNTE ao cliente.
- Se o cliente quiser trocar ou tirar item, volte para a etapa correta (não confirme com dados incompletos).
- Cancelamento funciona a qualquer momento — sempre respeite.

INTERPRETAÇÃO DE MENSAGENS:
- Palavras genéricas ("pizza", "quero pedir", "pedido", "cardápio", "comida", "lanche") são INTENÇÕES do cliente, nunca nomes de produto.
- NUNCA chame buscar_produto com palavras genéricas. Use listar_cardapio ou responda conduzindo o fluxo de pedido.
- Se o cliente diz "pizza" no contexto de pedido → pergunte sabor/tamanho, não busque "pizza" no cardápio.
- Se o cliente diz "quero pedir" → inicie o fluxo, não busque "quero pedir" como produto.
- Só busque produto quando o cliente der um nome específico (calabresa, margherita, frango, etc.).
- NUNCA responda "Não encontrei esse item" quando o cliente estiver usando palavra genérica ou demonstrando intenção de fazer pedido.
- Se o cliente diz algo vago ("essa", "pode ser", "quero", "sim"), interprete pelo contexto da conversa, não como busca independente.
`.trim();

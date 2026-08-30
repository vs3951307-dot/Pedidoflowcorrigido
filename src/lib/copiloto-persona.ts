/**
 * Persona do Copiloto da Empresa — configuração de "quem é" o assistente
 * IA que o dono/admin conversa dentro do painel.
 *
 * Fica gravado na tabela `Configuracao` (chave "copiloto_empresa"), escopado
 * por `empresaId` — cada empresa define a personalidade do seu copiloto.
 */

import { prisma } from "@/lib/prisma";

export const COPILOTO_PERSONA_CONFIG_KEY = "copiloto_empresa";

export const TOMS_COPILOTO = {
  simpatico: "Simpático",
  profissional: "Profissional",
  descontraido: "Descontraído",
  formal: "Formal",
} as const;

export type TomCopiloto = keyof typeof TOMS_COPILOTO;

export interface PersonaCopiloto {
  /** Nome pelo qual o copiloto se apresenta (vazio = "Copiloto"). */
  nome: string;
  /** Tom de voz nas respostas. */
  tom: TomCopiloto;
  /** Apresentação personalizada — o que o copiloto diz na primeira mensagem. */
  apresentacao: string;
  /** Regras de comportamento em texto livre. */
  regras: string;
}

export const PERSONA_COPILOTO_PADRAO: PersonaCopiloto = {
  nome: "",
  tom: "simpatico",
  apresentacao: "",
  regras: "",
};

function normalizarPersonaCopiloto(valor: unknown): PersonaCopiloto {
  const v = (typeof valor === "object" && valor !== null ? valor : {}) as Record<string, unknown>;
  const nome = typeof v.nome === "string" ? v.nome.trim().slice(0, 80) : "";
  const tom =
    typeof v.tom === "string" && v.tom in TOMS_COPILOTO
      ? (v.tom as TomCopiloto)
      : PERSONA_COPILOTO_PADRAO.tom;
  const apresentacao = typeof v.apresentacao === "string" ? v.apresentacao.trim().slice(0, 1000) : "";
  const regras = typeof v.regras === "string" ? v.regras.trim().slice(0, 4000) : "";
  return { nome, tom, apresentacao, regras };
}

export async function carregarPersonaCopiloto(empresaId: string): Promise<PersonaCopiloto> {
  const registro = await prisma.configuracao
    .findUnique({ where: { empresaId_chave: { empresaId, chave: COPILOTO_PERSONA_CONFIG_KEY } } })
    .catch(() => null);
  if (!registro?.valor) return PERSONA_COPILOTO_PADRAO;
  try {
    return normalizarPersonaCopiloto(JSON.parse(registro.valor));
  } catch {
    return PERSONA_COPILOTO_PADRAO;
  }
}

export async function salvarPersonaCopiloto(
  empresaId: string,
  persona: PersonaCopiloto
): Promise<void> {
  const limpa = normalizarPersonaCopiloto(persona);
  const vazia = !limpa.nome && !limpa.apresentacao && !limpa.regras && limpa.tom === PERSONA_COPILOTO_PADRAO.tom;
  if (vazia) {
    await prisma.configuracao.deleteMany({
      where: { empresaId, chave: COPILOTO_PERSONA_CONFIG_KEY },
    });
    return;
  }
  await prisma.configuracao.upsert({
    where: { empresaId_chave: { empresaId, chave: COPILOTO_PERSONA_CONFIG_KEY } },
    update: { valor: JSON.stringify(limpa), atualizadoEm: new Date() },
    create: { empresaId, chave: COPILOTO_PERSONA_CONFIG_KEY, valor: JSON.stringify(limpa) },
  });
}

/** Monta a mensagem de boas-vindas do copiloto com base na persona. */
export function montarBoasVindasCopiloto(
  persona: PersonaCopiloto,
  nomeUsuario: string,
  empresaNome: string
): string {
  const primeiroNome = nomeUsuario.split(" ")[0];
  const nomeCopiloto = persona.nome.trim();

  if (persona.apresentacao) {
    return persona.apresentacao
      .replace("{usuario}", primeiroNome)
      .replace("{empresa}", empresaNome)
      .replace("{copiloto}", nomeCopiloto || "Copiloto");
  }

  const apelido = nomeCopiloto || "Copiloto";
  switch (persona.tom) {
    case "formal":
      return `Bom dia, ${primeiroNome}. Sou o ${apelido} da ${empresaNome}. Como posso ajudar?`;
    case "profissional":
      return `Olá, ${primeiroNome}! Sou o ${apelido} da ${empresaNome}. Pergunte sobre vendas, pedidos, estoque ou operação do dia a dia.`;
    case "descontraido":
      return `E aí, ${primeiroNome}! 👋 Sou o ${apelido} da ${empresaNome}. Manda a dúvida que eu resolvo!`;
    default:
      return `Olá, ${primeiroNome}! 😊 Sou o ${apelido} da ${empresaNome}. Pergunte sobre vendas, pedidos, estoque, caixa e entregas — ou dê comandos do dia a dia, que eu proponho e você confirma.`;
  }
}

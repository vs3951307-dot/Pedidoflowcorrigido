import { z } from "zod";

const slugRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const empresaCriarSchema = z.object({
  nome: z.string().trim().min(1, "informe o nome da empresa").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "slug muito curto")
    .max(60)
    .regex(slugRegex, "use apenas letras minúsculas, números e hífens"),
  // Legado (rótulo livre) — mantido por compatibilidade. Se `planoId`
  // for informado, ele é a fonte de verdade de preço/limites/módulos.
  plano: z.enum(["basico", "profissional", "completo"]).default("basico"),
  planoId: z.string().trim().min(1).optional(),
  modulos: z.array(z.string()).optional(),
  trialDias: z.coerce.number().int().min(0).max(365).optional(),
  adminNome: z.string().trim().min(1, "informe o nome do administrador").max(80),
  adminEmail: z.string().trim().toLowerCase().email("e-mail inválido").max(120),
  adminSenha: z.string().min(8, "a senha deve ter pelo menos 8 caracteres").max(100),
  // Database-per-tenant "de verdade" (banco fisicamente dedicado) —
  // opcional; deixe vazio para usar o schema dedicado no servidor
  // compartilhado (padrão, recomendado para a maioria dos clientes).
  databaseUrlDedicada: z.string().trim().url().optional(),
});

export const empresaAtualizarSchema = z.object({
  nome: z.string().trim().min(1).max(120).optional(),
  slug: z.string().trim().toLowerCase().min(2).max(60).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).optional(),
  status: z.enum(["ativa", "bloqueada", "suspensa", "teste", "excluida"]).optional(),
  plano: z.enum(["basico", "profissional", "completo"]).optional(),
  planoId: z.string().trim().min(1).nullable().optional(),
  modulos: z.array(z.string()).optional(),
  trialFimEm: z.string().datetime().nullable().optional(),
  vencimentoEm: z.string().datetime().nullable().optional(),
  observacoes: z.string().max(2000).nullable().optional(),
  razaoSocial: z.string().max(160).nullable().optional(),
  cnpj: z.string().max(30).nullable().optional(),
  telefone: z.string().max(30).nullable().optional(),
  email: z.string().max(120).nullable().optional(),
  limiteMensagensIA: z.coerce.number().int().min(0).nullable().optional(),
  // System Builder — identidade visual, textos e menu (ver system-builder.ts)
  tema: z.record(z.string(), z.unknown()).optional(),
  textos: z.record(z.string(), z.string()).optional(),
  menuConfig: z
    .array(z.object({ chave: z.string(), rotulo: z.string(), visivel: z.boolean().default(true) }))
    .optional(),
});

export const planoCriarSchema = z.object({
  nome: z.string().trim().min(1, "informe o nome do plano").max(60),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(60)
    .regex(slugRegex, "use apenas letras minúsculas, números e hífens"),
  preco: z.coerce.number().min(0),
  descricao: z.string().max(500).optional(),
  modulosPadrao: z.array(z.string()).default([]),
  limiteUsuarios: z.coerce.number().int().min(1).nullable().optional(),
  limiteMensagensIA: z.coerce.number().int().min(0).nullable().optional(),
  limiteProdutos: z.coerce.number().int().min(1).nullable().optional(),
  iaIncluida: z.boolean().default(true),
  ordem: z.coerce.number().int().default(0),
});

export const planoAtualizarSchema = planoCriarSchema.partial().extend({
  ativo: z.boolean().optional(),
});

/** Instrução em linguagem natural para a IA administrativa do Super Admin. */
export const iaAdminInstrucaoSchema = z.object({
  empresaId: z.string().trim().min(1, "informe a empresa"),
  instrucao: z.string().trim().min(3, "descreva o que você quer fazer").max(2000),
  // Quando true, aplica de fato a ação já confirmada (ver src/lib/system-builder.ts);
  // quando false/ausente, só retorna a PROPOSTA para confirmação.
  confirmar: z.boolean().optional(),
  // Ações propostas na rodada anterior, ecoadas de volta para aplicar
  // exatamente o que foi mostrado ao usuário (evita "confirmar" reinterpretar
  // a instrução do zero e aplicar algo diferente do que foi exibido).
  acoesPropostas: z.array(z.record(z.string(), z.unknown())).optional(),
});

import { z } from "zod";

/** Todos os campos opcionais: PATCH parcial (edita só o que veio no corpo). */
export const estoqueAtualizarSchema = z.object({
  nome: z.string().trim().min(1).max(120).optional(),
  categoria: z.string().trim().min(1).max(60).optional(),
  unidade: z.string().trim().min(1).max(10).optional(),
  minimo: z.number().min(0).optional(),
  custoUnitario: z.number().min(0).optional(),
  ativo: z.boolean().optional(),
});

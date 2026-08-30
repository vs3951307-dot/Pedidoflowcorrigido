import { z } from "zod";

export const produtoAtualizarSchema = z.object({
  nome: z.string().trim().min(1).max(120).optional(),
  descricao: z.string().max(500).optional(),
  preco: z.number().positive("o preço deve ser maior que zero").max(100000).optional(),
  emoji: z.string().max(8).optional(),
  destaque: z.boolean().optional(),
  ativo: z.boolean().optional(),
  ncm: z.string().max(20).optional(),
  cest: z.string().max(20).optional(),
  csosn: z.string().max(10).optional(),
  cfop: z.string().max(10).optional(),
  unidade: z.string().max(10).optional(),
});

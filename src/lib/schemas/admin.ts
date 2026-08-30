import { z } from "zod";
import { PAPEIS } from "@/lib/permissao";

export const usuarioCriarSchema = z.object({
  nome: z.string().trim().min(1, "informe o nome").max(80),
  email: z.string().trim().toLowerCase().email("e-mail inválido").max(120),
  senha: z.string().min(8, "a senha deve ter pelo menos 8 caracteres").max(100),
  papel: z.enum(PAPEIS).default("CAIXA"),
  ativo: z.boolean().optional(),
});

export const configuracaoSalvarSchema = z.object({
  chave: z.enum([
    "empresa",
    "nfce",
    "impressoras",
    "impressao",
    "taxas",
    "formas_pagamento",
    "contingencia_entregador",
    "atendente_ia",
    "copiloto_empresa",
    "pizza",
  ]),
  valor: z.unknown(),
});

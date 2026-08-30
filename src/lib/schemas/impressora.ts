import { z } from "zod";

export const TIPOS_CONEXAO = ["windows", "usb_agente", "rede_ip", "escpos_agente"] as const;
export const LARGURAS_PAPEL = ["58mm", "80mm"] as const;
export const DESTINOS_VALIDOS = [
  "cozinha",
  "caixa",
  "balcao",
  "retirada",
  "delivery",
  "mesa",
  "fechamento_caixa",
  "cupom_nao_fiscal",
  "outros",
] as const;

export const impressoraCriarSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome da impressora.").max(80),
  modelo: z.string().trim().max(60).optional(),
  fabricante: z.string().trim().max(60).optional(),
  tipoConexao: z.enum(TIPOS_CONEXAO),
  nomeWindows: z.string().trim().max(120).optional(),
  enderecoIp: z.string().trim().max(45).optional(),
  porta: z.string().trim().max(10).optional(),
  larguraPapel: z.enum(LARGURAS_PAPEL).default("80mm"),
  vias: z.number().int().min(1).max(5).default(1),
  impressaoAutomatica: z.boolean().default(true),
  destinos: z.array(z.enum(DESTINOS_VALIDOS)).min(1, "Selecione ao menos um destino."),
  computadorVinculado: z.string().trim().max(120).optional(),
});

export const impressoraAtualizarSchema = impressoraCriarSchema.partial().extend({
  ativa: z.boolean().optional(),
});

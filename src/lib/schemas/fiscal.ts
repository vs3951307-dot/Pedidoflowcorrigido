import { z } from "zod";

/**
 * Dados fiscais que o Administrador cadastra em Configurações → Fiscal
 * (PEDIDO 10): os fornecidos pelo contador, isolados por empresa.
 * Campos de credencial (csc, cscId, tokenProvedor, certificado*) são
 * criptografados antes de ir para o banco — ver src/lib/fiscal/config.ts.
 */
export const fiscalConfigSalvarSchema = z.object({
  // Cadastrais
  cnpj: z.string().trim().max(20).optional(),
  inscricaoEstadual: z.string().trim().max(20).optional(),
  razaoSocial: z.string().trim().max(160).optional(),
  nomeFantasia: z.string().trim().max(160).optional(),
  enderecoFiscal: z.string().trim().max(300).optional(),
  regimeTributario: z.string().trim().max(60).optional(),
  // Operacional
  serie: z.coerce.number().int().min(1).optional(),
  proximoNumero: z.coerce.number().int().min(0).optional(),
  ambiente: z.enum(["homologacao", "producao"]).optional(),
  emitirAutomatico: z.boolean().optional(),
  provedor: z.string().trim().max(60).optional(),
  // Credenciais (deixe em branco para MANTER o valor já salvo — nunca
  // reexige recadastrar tudo a cada edição)
  csc: z.string().trim().max(80).optional(),
  cscId: z.string().trim().max(20).optional(),
  tokenProvedor: z.string().trim().max(500).optional(),
  certificadoBase64: z.string().trim().optional(),
  certificadoSenha: z.string().trim().max(200).optional(),
});

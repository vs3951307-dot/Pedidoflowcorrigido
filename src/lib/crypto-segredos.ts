import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Cofre de segredos por empresa (PEDIDO: "armazenado com segurança",
 * "nunca compartilhe certificado/credenciais entre clientes").
 *
 * Usa AES-256-GCM (autenticado — detecta adulteração) com uma chave
 * mestra derivada de `SECRETS_MASTER_KEY` (variável de ambiente,
 * NUNCA no código). Cada valor criptografado carrega seu próprio IV e
 * tag de autenticação — não há reaproveitamento de nonce entre
 * segredos.
 *
 * O que é criptografado com isto (nunca em texto puro no banco):
 * - Credenciais fiscais por empresa (token do provedor, CSC, senha do
 *   certificado A1) — ver src/lib/fiscal/config.ts.
 * - Access token do WhatsApp Cloud API por empresa — ver
 *   src/lib/atendente/whatsapp-api.ts.
 * - `DATABASE_URL` dedicada de um tenant com banco próprio (database
 *   per tenant real) — ver src/lib/tenant-db.ts.
 *
 * IMPORTANTE: sem `SECRETS_MASTER_KEY` configurada, as funções lançam
 * erro em vez de silenciosamente gravar em texto puro — preferimos
 * falhar alto a vazar segredo.
 */

const ALGORITMO = "aes-256-gcm";
const TAMANHO_IV = 12; // recomendado para GCM

function chaveDerivada(): Buffer {
  const segredo = process.env.SECRETS_MASTER_KEY;
  if (!segredo || segredo.length < 16) {
    throw new Error(
      "SECRETS_MASTER_KEY não configurada (ou muito curta). Defina uma chave forte no .env antes de salvar credenciais sensíveis."
    );
  }
  // scrypt com salt fixo do próprio segredo é aceitável aqui porque a
  // "senha" já é uma chave aleatória de alta entropia (não uma senha de
  // usuário) — o objetivo é só derivar 32 bytes determinísticos.
  return scryptSync(segredo, "pedidoflow-secrets-v1", 32);
}

/** Criptografa um texto; retorna uma string única (iv + tag + dados, em base64). */
export function criptografarSegredo(textoPuro: string): string {
  const chave = chaveDerivada();
  const iv = randomBytes(TAMANHO_IV);
  const cifra = createCipheriv(ALGORITMO, chave, iv);
  const criptografado = Buffer.concat([cifra.update(textoPuro, "utf8"), cifra.final()]);
  const tag = cifra.getAuthTag();
  return Buffer.concat([iv, tag, criptografado]).toString("base64");
}

/** Descriptografa um valor gerado por `criptografarSegredo`. */
export function descriptografarSegredo(valorCriptografado: string): string {
  const chave = chaveDerivada();
  const bruto = Buffer.from(valorCriptografado, "base64");
  const iv = bruto.subarray(0, TAMANHO_IV);
  const tag = bruto.subarray(TAMANHO_IV, TAMANHO_IV + 16);
  const dados = bruto.subarray(TAMANHO_IV + 16);
  const decifra = createDecipheriv(ALGORITMO, chave, iv);
  decifra.setAuthTag(tag);
  return Buffer.concat([decifra.update(dados), decifra.final()]).toString("utf8");
}

/** true se `SECRETS_MASTER_KEY` está configurada (painel pode avisar quando não estiver). */
export function cofreDeSegredosDisponivel(): boolean {
  const segredo = process.env.SECRETS_MASTER_KEY;
  return Boolean(segredo && segredo.length >= 16);
}

/** Mascara um segredo para exibição segura (nunca devolve o valor real ao frontend). */
export function mascararSegredo(valor: string, manter = 4): string | null {
  if (!valor) return null;
  if (valor.length <= manter) return "•".repeat(valor.length);
  return `${"•".repeat(Math.max(3, valor.length - manter))}${valor.slice(-manter)}`;
}

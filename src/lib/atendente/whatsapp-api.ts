/**
 * Cliente da API oficial do WhatsApp Business Cloud (Meta) — PEDIDO 18,
 * adaptado para multiempresa (PEDIDO 7 do SaaS).
 *
 * A integração usa SOMENTE a API oficial (graph.facebook.com). Não há
 * código de bibliotecas não oficiais (Baileys, whatsapp-web.js etc.) —
 * elas violam os Termos do WhatsApp e podem banir o número; este projeto
 * não as usa.
 *
 * MULTIEMPRESA: cada empresa tem sua PRÓPRIA configuração, guardada na
 * tabela `Configuracao` (chave "whatsapp", escopada por `empresaId`).
 * O webhook da Meta não informa a empresa diretamente — ele informa o
 * `phone_number_id` do número que recebeu a mensagem — por isso
 * `encontrarEmpresaPorPhoneNumberId` varre as configurações de WhatsApp
 * cadastradas (normalmente poucas dezenas/centenas de empresas) e resolve
 * a empresa dona daquele número ANTES de qualquer mensagem ser processada.
 * Uma conversa NUNCA é processada pelo motor de outra empresa.
 *
 * Variáveis de ambiente (`WHATSAPP_*`) continuam funcionando como
 * atalho/legado para AMBIENTES DE UMA ÚNICA EMPRESA (ex.: durante a
 * migração inicial da Disk Pizza Rozeno) — servem de fallback apenas
 * quando a empresa ainda não configurou credenciais próprias pelo painel
 * (Admin → Configurações → WhatsApp). Ao operar várias empresas com
 * WhatsApp real, cada uma deve cadastrar suas próprias credenciais.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma, plataformaPrisma } from "@/lib/prisma";
import { descriptografarSegredo } from "@/lib/crypto-segredos";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

export const WHATSAPP_CONFIG_KEY = "whatsapp";

export interface ConfiguracaoWhatsApp {
  verifyToken: string;
  accessToken: string;
  phoneNumberId: string;
  telefone?: string;
  provedor?: string;
  /**
   * App Secret do app da Meta usado para validar a assinatura
   * `X-Hub-Signature-256` dos POSTs do webhook. Por empresa (banco,
   * criptografado) ou fallback `.env` (WHATSAPP_APP_SECRET).
   */
  appSecret?: string;
  /** De onde veio a configuração: .env (legado/1 empresa) ou banco (por empresa). */
  fonte: "env" | "banco";
}

function lerConfiguracaoWhatsAppEnv(): ConfiguracaoWhatsApp | null {
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? "";
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN ?? "";
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
  if (!accessToken || !phoneNumberId) return null;
  return {
    verifyToken,
    accessToken,
    phoneNumberId,
    appSecret: process.env.WHATSAPP_APP_SECRET ?? "",
    fonte: "env",
  };
}

/** Configuração persistida no banco pelo painel (chave "whatsapp"), DESTA empresa. */
export async function lerConfiguracaoWhatsAppBanco(empresaId: string): Promise<ConfiguracaoWhatsApp | null> {
  try {
    const registro = await prisma.configuracao.findUnique({
      where: { empresaId_chave: { empresaId, chave: WHATSAPP_CONFIG_KEY } },
    });
    if (!registro?.valor) return null;
    const valor = JSON.parse(registro.valor) as Partial<ConfiguracaoWhatsApp> & {
      accessTokenCriptografado?: string;
      appSecretCriptografado?: string;
    };
    // Compatibilidade: registros antigos guardavam accessToken em texto
    // puro; novos guardam `accessTokenCriptografado` (AES-256-GCM — ver
    // src/lib/crypto-segredos.ts). Nunca escreve mais em texto puro.
    const accessToken = valor.accessTokenCriptografado
      ? descriptografarSegredo(valor.accessTokenCriptografado)
      : (valor.accessToken ?? "");
    const phoneNumberId = valor.phoneNumberId ?? "";
    if (!accessToken || !phoneNumberId) return null;
    return {
      verifyToken: valor.verifyToken ?? "",
      accessToken,
      phoneNumberId,
      telefone: valor.telefone ?? "",
      provedor: valor.provedor ?? "",
      appSecret: valor.appSecretCriptografado
        ? descriptografarSegredo(valor.appSecretCriptografado)
        : "",
      fonte: "banco",
    };
  } catch {
    return null;
  }
}

/** Configuração efetiva DESTA empresa: banco tem precedência; .env é fallback legado. */
export async function carregarConfiguracaoWhatsApp(empresaId: string): Promise<ConfiguracaoWhatsApp | null> {
  return (await lerConfiguracaoWhatsAppBanco(empresaId)) ?? lerConfiguracaoWhatsAppEnv();
}

export async function whatsappConfiguradoAsync(empresaId: string): Promise<boolean> {
  return (await carregarConfiguracaoWhatsApp(empresaId)) !== null;
}

/**
 * Identifica a EMPRESA dona de um `phone_number_id` recebido no webhook da
 * Meta — passo obrigatório de isolamento ANTES de processar qualquer
 * mensagem. Varre as configurações de WhatsApp cadastradas no banco; se
 * nenhuma bater e o `.env` tiver esse mesmo phoneNumberId, cai para a
 * empresa mais antiga (uso típico: uma única empresa em modo legado/env).
 */
/**
 * CORREÇÃO (PEDIDO 7, mesmo mecanismo do PEDIDO 1): antes consultava
 * `prisma.configuracao` (modelo de TENANT — schema Postgres separado
 * por empresa) tentando "procurar em todas as empresas" pelo
 * `phoneNumberId` — estruturalmente impossível numa única consulta
 * quando cada tenant é um schema diferente, e bloqueado de qualquer
 * forma pelo Proxy de `src/lib/prisma.ts` (nenhum tenant ainda está
 * ativo neste ponto — é justamente isto que está sendo descoberto).
 *
 * Agora consulta `Empresa.whatsappPhoneNumberId` — campo de PLATAFORMA
 * (schema `public`, sempre acessível, `@unique`). O access token de
 * verdade (sensível) continua só no `Configuracao` do tenant.
 */
export async function encontrarEmpresaPorPhoneNumberId(phoneNumberId: string): Promise<string | null> {
  if (!phoneNumberId) return null;
  const empresa = await plataformaPrisma.empresa.findUnique({
    where: { whatsappPhoneNumberId: phoneNumberId },
    select: { id: true },
  });
  if (empresa) return empresa.id;

  const env = lerConfiguracaoWhatsAppEnv();
  if (env && env.phoneNumberId === phoneNumberId) {
    const primeira = await plataformaPrisma.empresa.findFirst({ orderBy: { criadoEm: "asc" } });
    return primeira?.id ?? null;
  }
  return null;
}

/**
 * Valida um `hub.verify_token` recebido no GET do webhook contra os
 * tokens realmente configurados (por empresa + fallback `.env`).
 *
 * CORREÇÃO (mesmo mecanismo acima): consulta `Empresa.whatsappVerifyToken`
 * (plataforma), não mais `Configuracao` (tenant) — pelo mesmo motivo
 * estrutural.
 */
export async function verificarTokenWebhook(token: string): Promise<boolean> {
  if (!token) return false;
  const existe = await plataformaPrisma.empresa.findFirst({
    where: { whatsappVerifyToken: token },
    select: { id: true },
  });
  if (existe) return true;
  const env = lerConfiguracaoWhatsAppEnv();
  if (env?.verifyToken && env.verifyToken === token) return true;
  return false;
}

/**
 * Valida a assinatura `X-Hub-Signature-256` que a Meta envia em TODO POST
 * do webhook: HMAC-SHA256 do CORPO CRU (bytes exatos) com o App Secret do
 * app da Meta. Sem isto, qualquer atacante poderia forjar mensagens como
 * se viessem do WhatsApp real (PEDIDO: auditoria de segurança — CRÍTICO).
 *
 * - Sem assinatura ou sem app secret configurado → `false` (seguro por
 *   padrão: recusa em vez de aceitar).
 * - Comparação em tempo constante (`timingSafeEqual`) — nunca vaza o
 *   hash por timing.
 *
 * O app secret é uma credencial do app da Meta e fica OU no `.env`
 * (`WHATSAPP_APP_SECRET`) OU criptografado por empresa no banco
 * (`appSecretCriptografado`) — nunca exposto ao frontend.
 */
export function verificarAssinaturaWebhook(corpoCru: string, assinatura: string | null, appSecret: string): boolean {
  if (!assinatura || !appSecret || !corpoCru) return false;
  const esperado = createHmac("sha256", appSecret).update(corpoCru, "utf8").digest("hex");
  const prefixo = "sha256=";
  const recebida = assinatura.startsWith(prefixo) ? assinatura.slice(prefixo.length) : assinatura;
  const a = Buffer.from(esperado.toLowerCase());
  const b = Buffer.from(recebida.toLowerCase());
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Envia uma mensagem de texto via API oficial da Meta, usando as
 * credenciais DESTA empresa.
 * Retorna true se enviada com sucesso; false em falha/não configurado.
 */
export async function enviarMensagemWhatsApp(
  empresaId: string,
  telefone: string,
  texto: string
): Promise<boolean> {
  const config = await carregarConfiguracaoWhatsApp(empresaId);
  if (!config) return false;

  const digitos = telefone.replace(/\D/g, "");
  const para = digitos.startsWith("55") ? digitos : `55${digitos}`;
  if (para.length < 12) return false;

  try {
    const controle = new AbortController();
    const timeout = setTimeout(() => controle.abort(), 10000);
    const resposta = await fetch(
      `${GRAPH_BASE}/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: para,
          type: "text",
          text: { body: texto.slice(0, 4096) },
        }),
        signal: controle.signal,
      }
    );
    clearTimeout(timeout);
    if (!resposta.ok) {
      console.error("WhatsApp API erro:", resposta.status, await resposta.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (e) {
    console.error("WhatsApp API falha:", e);
    return false;
  }
}

/**
 * Baixa o binário de uma mídia enviada pelo WhatsApp (imagem, áudio ou
 * documento). A API da Meta entrega em duas etapas:
 *  1. GET /v21.0/{media_id}?fields=mime_type,url  → URL temporária do CDN
 *  2. GET {url}                                  → os bytes reais
 *
 * Retorna `null` se a mídia não puder ser baixada (expirou, permission
 * scope faltando, etc.) — o caller avisa o cliente e segue a conversa.
 */
export async function baixarMidiaWhatsApp(
  empresaId: string,
  mediaId: string
): Promise<{ bytes: Buffer; mime: string; nome: string } | null> {
  const config = await carregarConfiguracaoWhatsApp(empresaId);
  if (!config) return null;

  try {
    const controle = new AbortController();
    const timeout = setTimeout(() => controle.abort(), 15000);

    // 1. URL temporária + mime
    const meta = await fetch(`${GRAPH_BASE}/${mediaId}?fields=mime_type,url&access_token=${config.accessToken}`, {
      signal: controle.signal,
    });
    clearTimeout(timeout);
    if (!meta.ok) {
      console.error("WhatsApp API (metadados) erro:", meta.status, await meta.text().catch(() => ""));
      return null;
    }
    const dados = (await meta.json()) as { mime_type?: string; url?: string; error?: { message?: string } };
    if (dados.error || !dados.url) {
      console.error("WhatsApp API (metadados) erro:", dados.error?.message ?? "URL não retornada");
      return null;
    }
    const mime = dados.mime_type ?? "application/octet-stream";

    // 2. Bytes reais
    const controle2 = new AbortController();
    const timeout2 = setTimeout(() => controle2.abort(), 30000);
    const resposta = await fetch(dados.url, { signal: controle2.signal });
    clearTimeout(timeout2);
    if (!resposta.ok) {
      console.error("WhatsApp API (download) erro:", resposta.status);
      return null;
    }
    const bytes = Buffer.from(await resposta.arrayBuffer());

    // Nome de arquivo compatível (sem espaços/acentos) para o storage.
    const ext = extensaoDeMime(mime);
    const nome = `${mediaId}.${ext}`;
    return { bytes, mime, nome };
  } catch (e) {
    console.error("WhatsApp API download falha:", e);
    return null;
  }
}

function extensaoDeMime(mime: string): string {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime.startsWith("audio/")) {
    if (mime.includes("mpeg")) return "mp3";
    if (mime.includes("ogg")) return "ogg";
    if (mime.includes("wav")) return "wav";
    if (mime.includes("amr")) return "amr";
    if (mime.includes("aac") || mime.includes("m4a")) return "m4a";
    if (mime.includes("opus")) return "opus";
    return "mp3";
  }
  return "bin";
}

/**
 * Valida as credenciais contra a API oficial (sem enviar mensagens):
 * busca os dados do número de telefone vinculado ao phone number id.
 */
export async function testarConexaoWhatsApp(config: ConfiguracaoWhatsApp): Promise<{
  ok: boolean;
  nome?: string;
  numero?: string;
  erro?: string;
}> {
  try {
    const controle = new AbortController();
    const timeout = setTimeout(() => controle.abort(), 15000);
    const resposta = await fetch(
      `${GRAPH_BASE}/${config.phoneNumberId}?fields=display_phone_number,verified_name`,
      {
        headers: { Authorization: `Bearer ${config.accessToken}` },
        signal: controle.signal,
      }
    );
    clearTimeout(timeout);
    if (!resposta.ok) {
      const corpo = await resposta.text().catch(() => "");
      if (resposta.status === 401 || resposta.status === 403) {
        return { ok: false, erro: "Token de acesso inválido ou sem permissão (HTTP " + resposta.status + ")." };
      }
      if (resposta.status === 404) {
        return { ok: false, erro: "Phone number id não encontrado (HTTP 404). Verifique o WHATSAPP_PHONE_NUMBER_ID." };
      }
      return { ok: false, erro: `Falha ao consultar a Meta (HTTP ${resposta.status}): ${corpo.slice(0, 300)}` };
    }
    const dados = (await resposta.json()) as { display_phone_number?: string; verified_name?: string; error?: { message?: string } };
    if (dados.error) {
      return { ok: false, erro: dados.error.message ?? "Erro retornado pela Meta." };
    }
    return { ok: true, nome: dados.verified_name, numero: dados.display_phone_number };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha de rede ao consultar a Meta." };
  }
}

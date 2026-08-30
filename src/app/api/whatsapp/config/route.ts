import { NextRequest, NextResponse } from "next/server";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { prisma, plataformaPrisma } from "@/lib/prisma";
import { autorizar } from "@/lib/acesso";
import { criptografarSegredo } from "@/lib/crypto-segredos";
import {
  lerConfiguracaoWhatsAppBanco,
  WHATSAPP_CONFIG_KEY,
} from "@/lib/atendente/whatsapp-api";

/**
 * Configuração do WhatsApp DESTA empresa (painel admin → Configurações →
 * WhatsApp).
 *
 * - GET    → estado real da conexão (sem segredos).
 * - PUT    → salva no banco (chave "whatsapp", escopada por empresa).
 *   Campos vazios mantêm o valor já gravado (patching) para não reexigir
 *   o token a cada edição.
 * - DELETE → remove a configuração do banco desta empresa.
 *
 * Variáveis de ambiente (WHATSAPP_ACCESS_TOKEN etc.) só valem como
 * fallback legado quando a empresa NÃO tem configuração própria no banco
 * (ver src/lib/atendente/whatsapp-api.ts) — o painel sempre escreve/lê a
 * configuração da própria empresa.
 */

function mascarar(valor: string, manter = 3) {
  if (!valor) return null;
  if (valor.length <= manter) return "•".repeat(valor.length);
  return `${valor.slice(0, manter)}${"•".repeat(Math.max(3, valor.length - manter))}`;
}

function mascararTelefone(valor: string) {
  const digitos = valor.replace(/\D/g, "");
  if (digitos.length < 10) return valor;
  const sufixo = digitos.slice(-4);
  return `****-${sufixo}`;
}

async function GETTenant() {
  const acesso = await autorizar("configuracoes");
  if (!acesso.ok) return acesso.resposta;

  const doBanco = await lerConfiguracaoWhatsAppBanco(acesso.empresaId);
  const temEnv = Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  const config = doBanco;

  const faltando: string[] = [];
  if (!doBanco && !temEnv) {
    faltando.push("Nenhuma credencial definida (painel ou .env)");
  }

  return NextResponse.json({
    configurado: Boolean(config) || temEnv,
    fonte: config?.fonte ?? (temEnv ? "env" : null),
    provedor: config?.provedor ?? "WhatsApp Cloud API (Meta)",
    telefone: mascararTelefone(config?.telefone ?? ""),
    phoneNumberId: mascarar(config?.phoneNumberId ?? ""),
    verifyTokenConfigurado: Boolean(config?.verifyToken),
    // App Secret configurado? É o que valida a assinatura dos POSTs do
    // webhook (X-Hub-Signature-256). Sem ele, o webhook recusa (403).
    assinaturaConfigurada: Boolean(config?.appSecret) || Boolean(process.env.WHATSAPP_APP_SECRET),
    faltando,
    urlWebhook: "/api/whatsapp/webhook",
    urlBase: "https://graph.facebook.com/v21.0",
    metodo: doBanco ? "banco" : temEnv ? "env" : null,
  });
}

async function PUTTenant(req: NextRequest) {
  const acesso = await autorizar("configuracoes");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const corpo = await req.json().catch(() => null);
  if (!corpo) {
    return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  }

  const atual = await lerConfiguracaoWhatsAppBanco(empresaId);
  const base = atual ?? { verifyToken: "", accessToken: "", phoneNumberId: "", telefone: "", provedor: "", appSecret: "" };

  const verificar = (campo: string) =>
    typeof corpo[campo] === "string" ? corpo[campo].trim() : "";
  const verifyToken = verificar("verifyToken") || base.verifyToken;
  const accessToken = verificar("accessToken") || base.accessToken;
  const phoneNumberId = verificar("phoneNumberId") || base.phoneNumberId;
  const telefone = verificar("telefone") || (base.telefone ?? "");
  const provedor = verificar("provedor") || (base.provedor ?? "");
  const appSecret = verificar("appSecret") || (base.appSecret ?? "");

  if (!accessToken || !phoneNumberId) {
    return NextResponse.json(
      { erro: "Informe o token de acesso e o phone number ID (ou não esvazie os campos mantidos)." },
      { status: 400 }
    );
  }

  // phoneNumberId precisa ser único na plataforma (é a chave que o
  // webhook usa para achar a empresa) — outra empresa não pode reutilizar
  // o mesmo número.
  //
  // CORREÇÃO: antes, esta checagem consultava `prisma.configuracao` (modelo
  // de TENANT) com `NOT: { empresaId }` tentando achar OUTRAS empresas —
  // mas o Prisma do tenant ativo só enxerga o schema DESTA empresa; jamais
  // encontraria uma linha de outra (cada tenant é um schema Postgres
  // separado). A checagem nunca detectava conflito de verdade. Agora
  // consulta `Empresa.whatsappPhoneNumberId` (plataforma, `@unique` no
  // banco) — funciona de verdade, e o próprio banco barra duplicata.
  const outraEmpresaComMesmoNumero = await plataformaPrisma.empresa.findFirst({
    where: { whatsappPhoneNumberId: phoneNumberId, NOT: { id: empresaId } },
    select: { id: true },
  });
  if (outraEmpresaComMesmoNumero) {
    return NextResponse.json(
      { erro: "Este phone number ID já está em uso por outra empresa na plataforma." },
      { status: 409 }
    );
  }

  await prisma.configuracao.upsert({
    where: { empresaId_chave: { empresaId, chave: WHATSAPP_CONFIG_KEY } },
    update: {
      valor: JSON.stringify({
        verifyToken,
        accessTokenCriptografado: criptografarSegredo(accessToken),
        phoneNumberId,
        telefone,
        provedor,
        ...(appSecret ? { appSecretCriptografado: criptografarSegredo(appSecret) } : {}),
      }),
    },
    create: {
      empresaId,
      chave: WHATSAPP_CONFIG_KEY,
      valor: JSON.stringify({
        verifyToken,
        accessTokenCriptografado: criptografarSegredo(accessToken),
        phoneNumberId,
        telefone,
        provedor,
        ...(appSecret ? { appSecretCriptografado: criptografarSegredo(appSecret) } : {}),
      }),
    },
  });
  // Sincroniza os identificadores de DESCOBERTA (não o access token, que
  // é sensível e fica só no tenant) em Empresa — é o que permite o
  // webhook achar esta empresa antes de qualquer tenant estar ativo (ver
  // PEDIDO 7 em src/lib/atendente/whatsapp-api.ts).
  await plataformaPrisma.empresa.update({
    where: { id: empresaId },
    data: { whatsappPhoneNumberId: phoneNumberId, whatsappVerifyToken: verifyToken },
  });

  return NextResponse.json({ ok: true, configurado: true, fonte: "banco" });
}

async function DELETETenant() {
  const acesso = await autorizar("configuracoes");
  if (!acesso.ok) return acesso.resposta;

  await prisma.configuracao.deleteMany({ where: { empresaId: acesso.empresaId, chave: WHATSAPP_CONFIG_KEY } });
  // Limpa também os identificadores de descoberta na plataforma — senão
  // o webhook continuaria achando esta empresa por um número que ela já
  // desconfigurou.
  await plataformaPrisma.empresa.update({
    where: { id: acesso.empresaId },
    data: { whatsappPhoneNumberId: null, whatsappVerifyToken: null },
  });
  return NextResponse.json({ ok: true, configurado: false });
}

export const GET = comTratamentoDeErro("whatsapp.config.GET", GETTenant);
export const PUT = comTratamentoDeErro("whatsapp.config.PUT", PUTTenant);
export const DELETE = comTratamentoDeErro("whatsapp.config.DELETE", DELETETenant);

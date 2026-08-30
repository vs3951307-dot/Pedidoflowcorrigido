import { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { plataformaPrisma } from "@/lib/prisma";
import { autorizar, registrarAuditoria } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";

const PREFIXO = "pf_agent_";

/** Só os últimos 4 caracteres visíveis (PEDIDO 5 anterior: "pf_agent_••••••••XXXX"). */
function mascarar(hash: string): string {
  return `${PREFIXO}${"•".repeat(8)}${hash.slice(-4)}`;
}

/**
 * Token do agente de impressão.
 *
 * CORREÇÃO (PEDIDO 1): o hash mora em `Empresa.agenteImpressaoTokenHash`
 * (plataforma, schema `public`) — não mais dentro da Configuracao do
 * tenant. É o que permite `encontrarEmpresaPorTokenAgente()` descobrir a
 * empresa ANTES de qualquer tenant estar ativo (ver src/lib/impressao.ts).
 * Esta rota em si continua exigindo sessão da empresa normalmente
 * (`autorizar("impressao")` já ativa o tenant certo) — só a ESCRITA do
 * hash vai para o campo de plataforma em vez do de tenant.
 */

/** GET — nunca devolve o token nem o hash completo, só se existe e sua máscara. */
export const GET = comTratamentoDeErro("impressao.agenteToken.GET", async () => {
  const acesso = await autorizar("impressao");
  if (!acesso.ok) return acesso.resposta;

  const empresa = await plataformaPrisma.empresa.findUnique({
    where: { id: acesso.empresaId },
    select: { agenteImpressaoTokenHash: true },
  });
  return NextResponse.json({
    configurado: !!empresa?.agenteImpressaoTokenHash,
    mascarado: empresa?.agenteImpressaoTokenHash ? mascarar(empresa.agenteImpressaoTokenHash) : null,
  });
});

/**
 * POST — gera um novo token, grava só o HASH (SHA-256) em
 * `Empresa.agenteImpressaoTokenHash` e devolve o valor em TEXTO PURO só
 * nesta resposta. Depois disso, nem o próprio Admin consegue ver de
 * novo — só regenerar (o que invalida o anterior, por ser `@unique`).
 */
export const POST = comTratamentoDeErro("impressao.agenteToken.POST", async () => {
  const acesso = await autorizar("impressao");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const token = `${PREFIXO}${randomBytes(24).toString("hex")}`;
  const agenteTokenHash = createHash("sha256").update(token).digest("hex");

  await plataformaPrisma.empresa.update({
    where: { id: empresaId },
    data: { agenteImpressaoTokenHash: agenteTokenHash },
  });

  // Auditoria NUNCA registra o token nem o hash em si — só o fato de ter
  // sido gerado (mesmo princípio já usado na recuperação de senha).
  await registrarAuditoria("agente_impressao_token_gerado", undefined, acesso.usuario, undefined, empresaId);

  return NextResponse.json({ token, mascarado: mascarar(agenteTokenHash) });
});

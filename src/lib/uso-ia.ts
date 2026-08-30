import { prisma } from "@/lib/prisma";

/**
 * Consumo de IA por empresa (PEDIDO 8: "quero contabilizar consumo de
 * IA individualmente e poder colocar limites por empresa").
 *
 * A API paga do LLM pode ser central (uma chave só, minha), mas cada
 * empresa tem seu próprio contador mensal e seu próprio limite —
 * verificado ANTES de cada chamada (`limiteIaExcedido`) e incrementado
 * DEPOIS de cada chamada real (`registrarUsoIA`).
 */

const CUSTO_ESTIMADO_POR_1K_TOKENS = 0.0006; // aproximação (gpt-4o-mini-like); só para referência no painel

function mesReferenciaAtual(): string {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
}

/** true se a empresa já bateu o limite mensal de mensagens de IA (atendimento). */
export async function limiteIaExcedido(empresaId: string): Promise<boolean> {
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    include: { planoAtual: true },
  });
  if (!empresa) return false;
  const limite = empresa.limiteMensagensIA ?? empresa.planoAtual?.limiteMensagensIA ?? null;
  if (limite === null) return false; // sem limite configurado

  const mesAtual = mesReferenciaAtual();
  const usoNoMes = empresa.usoIAMesReferencia === mesAtual ? empresa.usoIAMesAtual : 0;
  return usoNoMes >= limite;
}

/**
 * Registra uma chamada de IA (atendimento, copiloto ou administrativa)
 * e incrementa o contador mensal da empresa (resetando automaticamente
 * quando o mês muda). Falhas aqui NUNCA devem derrubar o fluxo de
 * atendimento — sempre `.catch(() => null)` no chamador.
 *
 * CORREÇÃO (PEDIDO 37 — "contador de IA atômico"): antes fazia
 * `ler → +1 → gravar` em duas consultas separadas — duas chamadas de IA
 * simultâneas (comum: duas conversas de WhatsApp ao mesmo tempo)
 * podiam ler o MESMO valor antes de qualquer uma gravar, e a segunda
 * escrita "pisava" na primeira — perdendo uma contagem. Agora é UMA
 * ÚNICA instrução `UPDATE` no Postgres: o `CASE` decide (resetar pro
 * novo mês ou incrementar) usando o valor JÁ ATUALIZADO da própria
 * linha no momento em que o banco processa aquela atualização
 * especificamente — o lock de linha do Postgres durante o UPDATE
 * serializa chamadas concorrentes, nenhuma lê um valor obsoleto.
 */
export async function registrarUsoIA(
  empresaId: string,
  tipo: "atendimento" | "copiloto" | "admin",
  opcoes: { tokensEntrada?: number; tokensSaida?: number } = {}
): Promise<void> {
  const tokensEntrada = opcoes.tokensEntrada ?? 0;
  const tokensSaida = opcoes.tokensSaida ?? 0;
  const custoEstimado = ((tokensEntrada + tokensSaida) / 1000) * CUSTO_ESTIMADO_POR_1K_TOKENS;

  await prisma.usoIa.create({
    data: { empresaId, tipo, tokensEntrada, tokensSaida, custoEstimado },
  });

  const mesAtual = mesReferenciaAtual();
  await prisma.$executeRaw`
    UPDATE "Empresa"
    SET "usoIAMesAtual" = CASE
          WHEN "usoIAMesReferencia" = ${mesAtual} THEN "usoIAMesAtual" + 1
          ELSE 1
        END,
        "usoIAMesReferencia" = ${mesAtual}
    WHERE id = ${empresaId}
  `;
}

/** Estimativa simples de tokens a partir do tamanho do texto (~4 caracteres por token). */
export function estimarTokens(texto: string): number {
  return Math.ceil(texto.length / 4);
}

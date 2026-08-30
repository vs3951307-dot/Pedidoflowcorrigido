import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

/**
 * Porta de entrada dos endpoints de emergência (`/api/emergencia/*`).
 *
 * POR QUE EXISTE ESTE ARQUIVO (falha crítica corrigida):
 * as rotas de emergência aceitavam o token literal `"rozeno-emergencia-2026"`
 * como PADRÃO quando `EMERGENCIA_TOKEN` não estava definida. Esse valor
 * estava no código-fonte — ou seja, qualquer pessoa com o repositório (ou
 * que simplesmente adivinhasse a rota) podia, com um único POST sem login:
 *
 *   - trocar a senha de TODOS os usuários de TODAS as empresas e de TODOS
 *     os Super Admins para um valor escolhido por ela;
 *   - apagar todas as sessões;
 *   - criar um ADMINISTRADOR com senha conhecida dentro de uma empresa.
 *
 * Isso é tomada total da plataforma. As regras agora são:
 *
 * 1. Sem `EMERGENCIA_HABILITADA=1`, as rotas respondem 404 (não existem).
 * 2. Sem `EMERGENCIA_TOKEN` com pelo menos 32 caracteres, respondem 404.
 *    Não há mais valor padrão — falha fechada, nunca aberta.
 * 3. A comparação é timing-safe.
 *
 * Uso pretendido: ligar a variável, rodar a operação, DESLIGAR de novo.
 */

const TAMANHO_MINIMO_TOKEN = 32;

export type ResultadoGuard = { ok: true } | { ok: false; resposta: NextResponse };

function naoExiste(): NextResponse {
  // 404 e não 403: um 403 confirmaria a existência da rota para quem
  // estiver varrendo endpoints.
  return NextResponse.json({ erro: "Não encontrado." }, { status: 404 });
}

function comparacaoSegura(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function autorizarEmergencia(tokenRecebido: unknown): ResultadoGuard {
  if (process.env.EMERGENCIA_HABILITADA !== "1") {
    return { ok: false, resposta: naoExiste() };
  }
  const esperado = process.env.EMERGENCIA_TOKEN ?? "";
  if (esperado.length < TAMANHO_MINIMO_TOKEN) {
    console.error(
      "[emergencia] EMERGENCIA_HABILITADA=1 mas EMERGENCIA_TOKEN está ausente ou curta " +
        `(mínimo ${TAMANHO_MINIMO_TOKEN} caracteres). Rota mantida fechada.`
    );
    return { ok: false, resposta: naoExiste() };
  }
  const recebido = typeof tokenRecebido === "string" ? tokenRecebido : "";
  if (!recebido || !comparacaoSegura(recebido, esperado)) {
    console.warn("[emergencia] tentativa de uso com token inválido.");
    return { ok: false, resposta: naoExiste() };
  }
  return { ok: true };
}

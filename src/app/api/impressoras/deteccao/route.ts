import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizar } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";

const PREFIXO = "impressoras_detectadas:";
/** Mesmo critério de "recente" usado no resto da tela de impressão. */
const RECENTE_MS = 5 * 60_000;

/**
 * GET /api/impressoras/deteccao — computadores que já rodaram o agente
 * nesta empresa e as impressoras que cada um detectou no Windows.
 * Usado pela tela de cadastro para o Admin escolher a partir de uma
 * lista real, em vez de digitar o nome exato da impressora de cabeça
 * (PEDIDO 5: "não usar Microsoft Print to PDF ou impressoras virtuais
 * automaticamente" — o filtro de virtuais fica a cargo do agente, que
 * já as exclui da lista antes de reportar; ver scripts/agente-impressao/).
 */
export const GET = comTratamentoDeErro("impressoras.deteccao.GET", async () => {
  const acesso = await autorizar("impressao");
  if (!acesso.ok) return acesso.resposta;

  const registros = await prisma.configuracao.findMany({
    where: { empresaId: acesso.empresaId, chave: { startsWith: PREFIXO } },
  });

  const computadores = registros.map((r) => {
    const computador = r.chave.slice(PREFIXO.length);
    let impressoras: string[] = [];
    let atualizadoEm: string | null = null;
    try {
      const v = JSON.parse(r.valor);
      impressoras = Array.isArray(v.impressoras) ? v.impressoras : [];
      atualizadoEm = v.atualizadoEm ?? null;
    } catch {
      // ignora registro corrompido
    }
    const recente = !!atualizadoEm && Date.now() - new Date(atualizadoEm).getTime() < RECENTE_MS;
    return { computador, impressoras, atualizadoEm, online: recente };
  });

  return NextResponse.json({ computadores });
});

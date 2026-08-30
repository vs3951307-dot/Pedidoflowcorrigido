import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizarSuperAdmin } from "@/lib/super-admin/auth";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { configuracaoEfetiva } from "@/lib/ai-provider";

/**
 * GET /api/superadmin/central-ia — Central de IA (PEDIDO 10): consumo
 * real por empresa/tipo (dados de `UsoIa`, nunca estimados/inventados)
 * + qual provedor/modelo está configurado para cada uma das 3 IAs da
 * plataforma. NUNCA expõe chaves de API.
 */
export const GET = comTratamentoDeErro("superadmin.centralIa.GET", async () => {
  const acesso = await autorizarSuperAdmin();
  if (!acesso.ok) return acesso.resposta;

  const inicioHoje = new Date();
  inicioHoje.setHours(0, 0, 0, 0);
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  const [empresas, usoHoje, usoMes] = await Promise.all([
    prisma.empresa.findMany({
      select: { id: true, nome: true, limiteMensagensIA: true, usoIAMesAtual: true, planoAtual: { select: { limiteMensagensIA: true } } },
    }),
    prisma.usoIa.groupBy({
      by: ["empresaId", "tipo"],
      where: { criadoEm: { gte: inicioHoje } },
      _count: { _all: true },
      _sum: { tokensEntrada: true, tokensSaida: true, custoEstimado: true },
    }),
    prisma.usoIa.groupBy({
      by: ["empresaId", "tipo"],
      where: { criadoEm: { gte: inicioMes } },
      _count: { _all: true },
      _sum: { tokensEntrada: true, tokensSaida: true, custoEstimado: true },
    }),
  ]);

  function agregarPorEmpresa(linhas: typeof usoHoje) {
    const porEmpresa = new Map<string, { requisicoes: number; tokensEntrada: number; tokensSaida: number; custo: number; porTipo: Record<string, number> }>();
    for (const linha of linhas) {
      const atual = porEmpresa.get(linha.empresaId) ?? { requisicoes: 0, tokensEntrada: 0, tokensSaida: 0, custo: 0, porTipo: {} };
      atual.requisicoes += linha._count._all;
      atual.tokensEntrada += linha._sum.tokensEntrada ?? 0;
      atual.tokensSaida += linha._sum.tokensSaida ?? 0;
      atual.custo += linha._sum.custoEstimado ?? 0;
      atual.porTipo[linha.tipo] = (atual.porTipo[linha.tipo] ?? 0) + linha._count._all;
      porEmpresa.set(linha.empresaId, atual);
    }
    return porEmpresa;
  }

  const hojePorEmpresa = agregarPorEmpresa(usoHoje);
  const mesPorEmpresa = agregarPorEmpresa(usoMes);

  return NextResponse.json({
    provedores: {
      whatsapp: configuracaoEfetiva("whatsapp"),
      copiloto_empresa: configuracaoEfetiva("copiloto_empresa"),
      copiloto_supremo: configuracaoEfetiva("copiloto_supremo"),
    },
    empresas: empresas.map((e) => {
      const limite = e.limiteMensagensIA ?? e.planoAtual?.limiteMensagensIA ?? null;
      const hoje = hojePorEmpresa.get(e.id) ?? { requisicoes: 0, tokensEntrada: 0, tokensSaida: 0, custo: 0, porTipo: {} };
      const mes = mesPorEmpresa.get(e.id) ?? { requisicoes: 0, tokensEntrada: 0, tokensSaida: 0, custo: 0, porTipo: {} };
      return {
        empresaId: e.id,
        empresaNome: e.nome,
        limiteMensal: limite,
        usoMesAtual: e.usoIAMesAtual,
        statusLimite: limite === null ? "sem_limite" : e.usoIAMesAtual >= limite ? "esgotado" : "ok",
        hoje,
        mes,
      };
    }),
  });
});

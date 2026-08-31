import { NextRequest, NextResponse } from "next/server";
import { prisma, plataformaPrisma } from "@/lib/prisma";
import { encontrarEmpresaPorTokenAgente } from "@/lib/impressao";
import { ativarTenant } from "@/lib/tenant-db";
import { situacaoAssinatura } from "@/lib/assinatura";
import { verificarLimite, ipDaRequisicao } from "@/lib/rate-limit";

const DESTINOS = [
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

/**
 * Fila para o AGENTE LOCAL (componente externo de impressão física),
 * multiempresa (PEDIDO 8). Não exige sessão web: o token no header
 * `x-agente-token` identifica DIRETAMENTE a empresa dona do agente (ver
 * `encontrarEmpresaPorTokenAgente`) — um agente nunca enxerga a fila de
 * outra empresa, mesmo que soubesse o token de outra (o token só resolve
 * para a empresa que o cadastrou). Retorna apenas itens `pendente`
 * (os mais antigos primeiro) — o agente confirma com `/concluir`
 * ou reporta erro com `/erro`; nada é concluído automaticamente.
 *
 * CORREÇÃO: com `x-agente-computador` informado, só devolve trabalhos
 * cuja impressora atribuída está VINCULADA a este computador — antes,
 * um agente via TODOS os trabalhos da empresa (filtrados só por destino
 * cozinha/caixa), então um agente rodando no computador errado podia
 * "pegar" trabalhos de uma impressora que fisicamente não está nem
 * conectado a ele.
 */
export async function GET(req: NextRequest) {
  const limite = verificarLimite({ chave: `impressao-fila:${ipDaRequisicao(req)}`, maximo: 30, janelaMs: 60_000 });
  if (!limite.permitido) {
    return NextResponse.json(
      { erro: "Muitas requisições. Aguarde." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limite.reiniciaEm / 1000)) } }
    );
  }

  const token = req.headers.get("x-agente-token") ?? "";
  const empresaId = await encontrarEmpresaPorTokenAgente(token);
  if (!empresaId) {
    return NextResponse.json({ erro: "Token de agente inválido ou não configurado." }, { status: 401 });
  }

  // Ativa o tenant desta empresa ANTES de acessar modelos de tenant
  const empresa = await plataformaPrisma.empresa.findUnique({
    where: { id: empresaId },
    select: { id: true, schemaBanco: true, databaseUrlSecreta: true, slug: true, status: true, vencimentoEm: true, carenciaAte: true },
  });
  if (!empresa) {
    return NextResponse.json({ erro: "Empresa não encontrada." }, { status: 404 });
  }
  // SEGURANÇA (GAP corrigido): uma empresa BLOQUEADA/SUSPENSA/vencida
  // não pode continuar operando o agente de impressão (criar/pegar
  // trabalhos novos). Antes este endpoint não checava status/vencimento.
  // Como a fila pode ter trabalhos já impressos, devolve a fila VAZIA
  // (o agente continua respondendo/renovando heartbeat sem quebra), mas
  // nenhum trabalho novo é servido.
  if (!["ativa", "teste"].includes(empresa.status) || situacaoAssinatura(empresa).estado === "vencida") {
    return NextResponse.json({ ok: true, itens: [], pendentes: 0, bloqueado: true });
  }
  ativarTenant(empresa);

  const destino = req.nextUrl.searchParams.get("destino");
  const destinoValido = destino === null || (DESTINOS as readonly string[]).includes(destino);
  if (!destinoValido) {
    return NextResponse.json({ erro: "Destino inválido." }, { status: 400 });
  }
  // Identifica o COMPUTADOR do agente (PEDIDO 5: "identificar o
  // computador"). Usado para (a) atualizar o heartbeat só das impressoras
  // vinculadas a esta máquina e (b) restringir a fila só aos trabalhos
  // dessas impressoras — ver abaixo.
  const computador = req.headers.get("x-agente-computador")?.trim() || null;

  // Se o agente informou o computador, restringe aos trabalhos cuja
  // impressora atribuída está vinculada A ESTE computador. Sem
  // `computador` informado (agente antigo/não atualizado), mantém o
  // comportamento anterior — filtra só por destino/empresa, sem
  // restringir por impressora (o agente antigo não sabe filtrar por
  // impressora mesmo, então restringir quebraria ele).
  let impressoraIdsPermitidos: string[] | null = null;
  if (computador) {
    const impressorasDoComputador = await prisma.impressora.findMany({
      where: { empresaId, computadorVinculado: computador },
      select: { id: true },
    });
    impressoraIdsPermitidos = impressorasDoComputador.map((i) => i.id);
  }

  // Recupera trabalhos com LEASE EXPIRADO (não mais um timeout cego de
  // 60s — PEDIDO 2): um trabalho em "processando" só volta a poder ser
  // reivindicado quando `leaseAte` já passou de verdade. Enquanto o
  // agente estiver renovando via heartbeat (imprimindo, spooler lento,
  // 2-3 vias), `leaseAte` continua no futuro e o trabalho NÃO aparece
  // aqui — só quando o agente realmente parar de responder.
  const agora = new Date();

  const itens = await prisma.filaImpressao.findMany({
    where: {
      empresaId,
      ...(destino ? { destino } : {}),
      ...(impressoraIdsPermitidos ? { impressoraId: { in: impressoraIdsPermitidos } } : {}),
      OR: [
        { status: "pendente" },
        { status: "processando", leaseAte: { lt: agora } },
        { status: "processando", leaseAte: null }, // trabalho de antes do lease existir — trata como expirado
      ],
    },
    orderBy: { criadoEm: "asc" },
    take: 50,
    select: {
      id: true,
      tipo: true,
      destino: true,
      referencia: true,
      conteudo: true,
      vias: true,
      tentativas: true,
      criadoEm: true,
      impressoraId: true,
      nomeImpressoraWindows: true,
    },
  });

  // Heartbeat: toda consulta bem-sucedida da fila prova que o agente (e,
  // por extensão, as impressoras vinculadas a este computador) está
  // online. Sem `computador` informado (agente antigo/não atualizado),
  // cai no heartbeat geral da empresa — comportamento anterior preservado.
  if (computador) {
    await prisma.impressora.updateMany({
      where: { empresaId, computadorVinculado: computador },
      data: { statusOnline: true, ultimaComunicacaoEm: new Date() },
    });
  }
  await prisma.configuracao.upsert({
    where: { empresaId_chave: { empresaId, chave: "impressao_status" } },
    update: { valor: JSON.stringify({ ultimoContatoEm: new Date().toISOString(), destino: destino ?? "todos", computador }) },
    create: {
      empresaId,
      chave: "impressao_status",
      valor: JSON.stringify({ ultimoContatoEm: new Date().toISOString(), destino: destino ?? "todos", computador }),
    },
  });

  return NextResponse.json({ ok: true, itens, pendentes: itens.length });
}

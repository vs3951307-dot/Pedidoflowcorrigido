import { NextRequest, NextResponse } from "next/server";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { prisma } from "@/lib/prisma";
import { autorizar } from "@/lib/acesso";
import {
  enfileirarImpressao,
  gerarConteudoCupom,
  gerarConteudoFechamentoCaixa,
  gerarConteudoPedido,
  gerarTextoTeste,
  lerImpressoras,
  impressoraDoDestino,
  destinoRealDoTipo,
  DESTINOS_IMPRESSORA,
  TIPOS_PEDIDO,
  type DestinoImpressao,
  type TipoImpressao,
} from "@/lib/impressao";

const STATUS_VALIDOS = ["pendente", "processando", "concluido", "erro", "cancelado"];
const DESTINOS_VALIDOS = DESTINOS_IMPRESSORA.map((d) => d.valor);
/** Papel COZINHA vê tudo que gera produção (comida saindo da cozinha). */
const DESTINOS_GRUPO_COZINHA = ["cozinha", "mesa", "balcao", "retirada", "delivery"];
/** Papel CAIXA vê cupom/fechamento — o que fica fisicamente no caixa. */
const DESTINOS_GRUPO_CAIXA = ["caixa", "cupom_nao_fiscal", "fechamento_caixa", "outros"];

/**
 * Painel da fila de impressão (sessão web, sempre desta empresa):
 * - GET: lista (cozinha vê só o destino cozinha; caixa, só o caixa;
 *   admin vê tudo) com filtros opcionais `?status=` e `?destino=`;
 * - POST: reimpressão manual (`{ tipo, referencia }` — ex.: pedido:1155)
 *   ou teste de impressão (`{ tipo: "teste", destino }`). Reimpressão
 *   gera conteúdo novo e enfileira (sem dedupe — é intencional).
 */
async function GETTenant(req: NextRequest) {
  const acesso = await autorizar("impressao");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const status = req.nextUrl.searchParams.get("status");
  const destino = req.nextUrl.searchParams.get("destino");

  const where: Record<string, unknown> = { empresaId };
  if (status && (STATUS_VALIDOS as readonly string[]).includes(status)) where.status = status;
  if (destino && (DESTINOS_VALIDOS as readonly string[]).includes(destino)) where.destino = destino;

  // Escopo por papel: cada perfil enxerga a fila das funções do seu grupo
  // (correção: antes só existiam "cozinha"/"caixa" — agora balcão,
  // retirada, delivery e mesa também produzem pra cozinha, e cupom/
  // fechamento também são do caixa).
  if (acesso.usuario.papel === "COZINHA") where.destino = { in: DESTINOS_GRUPO_COZINHA };
  else if (acesso.usuario.papel === "CAIXA") where.destino = { in: DESTINOS_GRUPO_CAIXA };

  const itens = await prisma.filaImpressao.findMany({
    where,
    orderBy: { criadoEm: "desc" },
    take: 100,
  });

  return NextResponse.json({
    itens: itens.map((i) => ({
      id: i.id,
      tipo: i.tipo,
      destino: i.destino,
      referencia: i.referencia,
      vias: i.vias,
      status: i.status,
      tentativas: i.tentativas,
      erro: i.erro,
      criadoPor: i.criadoPor,
      criadoEm: i.criadoEm,
      concluidoEm: i.concluidoEm,
      conteudo: i.conteudo,
    })),
  });
}

async function POSTTenant(req: NextRequest) {
  const acesso = await autorizar("impressao");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const corpo = await req.json().catch(() => ({}));

  // Teste de impressão — de uma impressora específica (impressoraId,
  // preferido: é o que a tela Configurações > Impressoras usa) ou por
  // destino/função (comportamento anterior, preservado para quem ainda
  // chama assim).
  if (corpo.tipo === "teste") {
    const impressoraId = corpo.impressoraId ? String(corpo.impressoraId) : null;
    const empresa = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { nome: true } });

    let impressora: Awaited<ReturnType<typeof lerImpressoras>>[number] | null = null;
    let destino: DestinoImpressao;

    if (impressoraId) {
      const todas = await lerImpressoras(empresaId);
      impressora = todas.find((i) => i.id === impressoraId) ?? null;
      if (!impressora) {
        return NextResponse.json({ erro: "Impressora não encontrada." }, { status: 404 });
      }
      destino = impressora.destinos[0] ?? "outros";
    } else {
      const valor = String(corpo.destino ?? "");
      const valido = (["cozinha", "caixa", "balcao", "retirada", "delivery", "mesa", "fechamento_caixa", "cupom_nao_fiscal", "outros"] as const).includes(
        valor as DestinoImpressao
      );
      if (!valido) {
        return NextResponse.json({ erro: "Destino inválido." }, { status: 400 });
      }
      destino = valor as DestinoImpressao;
      const impressoras = await lerImpressoras(empresaId);
      impressora = impressoraDoDestino(impressoras, destino);
    }

    if (!impressora) {
      return NextResponse.json({ erro: "Nenhuma impressora configurada para este destino." }, { status: 404 });
    }

    const conteudo = gerarTextoTeste(destino, impressora.nome, empresa?.nome);
    const resultado = await enfileirarImpressao(
      empresaId,
      {
        tipo: "teste",
        destino,
        referencia: `teste:${impressora.id}:${Date.now()}`,
        conteudo,
        vias: 1,
        criadoPor: acesso.usuario.nome,
        impressoraId: impressora.id,
        nomeImpressoraWindows: impressora.tipoConexao === "windows" ? impressora.nomeWindows : null,
      },
      true
    );
    return NextResponse.json(
      {
        ok: true,
        item: {
          id: resultado.registro.id,
          status: resultado.registro.status,
          conteudo,
          duplicado: resultado.duplicado,
        },
      },
      { status: resultado.duplicado ? 200 : 201 }
    );
  }

  // Reimpressão manual de um pedido (comanda/cupom) ou fechamento de caixa.
  const tipo = String(corpo.tipo ?? "");
  const referencia = String(corpo.referencia ?? "");
  if (!(TIPOS_PEDIDO as readonly string[]).includes(tipo) && tipo !== "cupom" && tipo !== "fechamento-caixa") {
    return NextResponse.json({ erro: "Tipo de impressão inválido." }, { status: 400 });
  }

  let conteudo: string | null = null;
  const impressoras = await lerImpressoras(empresaId);
  let destino: DestinoImpressao;

  if (tipo === "fechamento-caixa") {
    const id = referencia.startsWith("caixa:") ? referencia.slice(6) : referencia;
    conteudo = await gerarConteudoFechamentoCaixa(empresaId, id);
    destino = destinoRealDoTipo("fechamento-caixa", impressoras);
  } else if (tipo === "cupom") {
    const numero = Number(referencia.replace(/^pedido:/, ""));
    if (!Number.isFinite(numero)) {
      return NextResponse.json({ erro: "Referência inválida. Use pedido:<número>." }, { status: 400 });
    }
    conteudo = await gerarConteudoCupom(empresaId, numero);
    destino = destinoRealDoTipo("cupom", impressoras);
  } else {
    const numero = Number(referencia.replace(/^pedido:/, ""));
    if (!Number.isFinite(numero)) {
      return NextResponse.json({ erro: "Referência inválida. Use pedido:<número>." }, { status: 400 });
    }
    conteudo = await gerarConteudoPedido(empresaId, numero, tipo as TipoImpressao);
    destino = destinoRealDoTipo(tipo as TipoImpressao, impressoras);
  }

  if (!conteudo) {
    return NextResponse.json({ erro: "Registro de origem não encontrado." }, { status: 404 });
  }

  const impressoraResolvida = impressoraDoDestino(impressoras, destino);

  const resultado = await enfileirarImpressao(
    empresaId,
    {
      tipo: tipo as TipoImpressao,
      destino,
      referencia,
      conteudo,
      criadoPor: acesso.usuario.nome,
      impressoraId: impressoraResolvida?.id ?? null,
      nomeImpressoraWindows: impressoraResolvida?.tipoConexao === "windows" ? impressoraResolvida.nomeWindows : null,
    },
    false
  );

  return NextResponse.json(
    { ok: true, item: { id: resultado.registro.id, status: resultado.registro.status } },
    { status: 201 }
  );
}

export const GET = comTratamentoDeErro("impressao.GET", GETTenant);
export const POST = comTratamentoDeErro("impressao.POST", POSTTenant);

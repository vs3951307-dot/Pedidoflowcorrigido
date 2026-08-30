import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizar } from "@/lib/acesso";
import { emitirMudancaKds } from "@/lib/kds-eventos";
import {
  enfileirarAutomatica,
  gerarConteudoPedido,
  referenciaPedido,
  tipoParaCanalPedido,
  lerImpressoras,
  destinoRealDoTipo,
} from "@/lib/impressao";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { criarPedido } from "@/lib/pedidos/criar-pedido";

const CANAIS = ["balcao", "salao", "retirada", "delivery"];
const PRODUCAO_VALIDA = ["recebido", "em_preparo", "pronto", "finalizado"];

export const GET = comTratamentoDeErro("pedidos.GET", async (req: NextRequest) => {
  const acesso = await autorizar("pdv", "salao", "kds", "admin");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const params = req.nextUrl.searchParams;
  const canal = params.get("canal");
  const status = params.get("status");
  const producao = params.get("producao");
  const periodo = params.get("periodo") ?? "hoje";
  const limite = Number(params.get("limite") ?? 100);

  const where: Record<string, unknown> = { empresaId };
  if (canal && CANAIS.includes(canal)) where.canal = canal;
  if (status) where.status = status;
  if (producao && PRODUCAO_VALIDA.includes(producao)) where.producao = producao;
  // Cada papel enxerga o recorte da sua função (validação no servidor).
  if (acesso.usuario.papel === "GARCOM" && !canal) {
    where.canal = "salao";
  } else if (acesso.usuario.papel === "COZINHA") {
    // KDS: só os pedidos em produção (o estágio é o campo `producao`).
    where.producao = { in: ["recebido", "em_preparo", "pronto"] };
  }
  if (periodo === "hoje") {
    const inicio = new Date();
    inicio.setHours(0, 0, 0, 0);
    where.criadoEm = { gte: inicio };
  } else if (periodo === "7d") {
    const inicio = new Date();
    inicio.setDate(inicio.getDate() - 7);
    where.criadoEm = { gte: inicio };
  }

  const pedidos = await prisma.pedido.findMany({
    where,
    include: {
      itens: { orderBy: { id: "asc" } },
      pagamentos: true,
      entrega: { include: { entregador: true } },
      mesa: true,
    },
    // Na cozinha, o mais antigo primeiro (quem chegou antes produz antes).
    orderBy: acesso.usuario.papel === "COZINHA" ? { recebidoEm: "asc" } : { criadoEm: "desc" },
    take: limite,
  });

  return NextResponse.json({
    pedidos: pedidos.map((p) => ({
      id: p.id,
      numero: p.numero,
      canal: p.canal,
      status: p.status,
      producao: p.producao,
      recebidoEm: p.recebidoEm.toISOString(),
      preparoIniciadoEm: p.preparoIniciadoEm?.toISOString() ?? null,
      prontoEm: p.prontoEm?.toISOString() ?? null,
      finalizadoEm: p.finalizadoEm?.toISOString() ?? null,
      clienteNome: p.clienteNome,
      mesaId: p.mesaId,
      mesaNumero: p.mesa?.numero,
      observacao: p.observacao,
      total: p.total,
      criadoEm: p.criadoEm.toISOString(),
      itens: p.itens.map((i) => ({
        uid: i.id,
        produtoId: i.produtoId,
        nome: i.nome,
        precoUnit: i.precoUnit,
        quantidade: i.quantidade,
        tamanho: i.tamanho,
        sabores: i.sabores ? JSON.parse(i.sabores) : [],
        adicionais: i.adicionais ? JSON.parse(i.adicionais) : [],
        observacao: i.observacao,
      })),
      pagamentos: p.pagamentos.map((pg) => ({
        id: pg.id,
        forma: pg.forma,
        valor: pg.valor,
        troco: pg.troco,
        status: pg.status,
      })),
      entrega: p.entrega
        ? {
            id: p.entrega.id,
            endereco: p.entrega.endereco,
            bairro: p.entrega.bairro,
            complemento: p.entrega.complemento,
            referencia: p.entrega.referencia,
            telefone: p.entrega.telefone,
            status: p.entrega.status,
            previsao: p.entrega.previsao,
            ocorrencia: p.entrega.ocorrencia,
            iniciadaEm: p.entrega.iniciadaEm?.toISOString() ?? null,
            concluidaEm: p.entrega.concluidaEm?.toISOString() ?? null,
            entregador: p.entrega.entregador?.nome ?? null,
            entregadorId: p.entrega.entregadorId ?? null,
          }
        : null,
      clienteTelefone: p.clienteTelefone,
      previsao: p.previsao,
      taxaEntrega: p.taxaEntrega,
      trocoPara: p.trocoPara,
      formaPagamentoEntrega: p.formaPagamentoEntrega,
    })),
  });
});

export const POST = comTratamentoDeErro("pedidos.POST", async (req: NextRequest) => {
  const acesso = await autorizar("pdv", "salao");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  // Toda a regra de negócio (validação, recálculo de preços, idempotência
  // e persistência) vive em `criarPedido` — função sem HTTP, exercitada
  // direto pelos testes contra um PostgreSQL real
  // (`src/lib/pedidos/__tests__/criar-pedido.test.ts`). Aqui só
  // autorizamos, chamamos e traduzimos o resultado em resposta HTTP.
  const resultado = await criarPedido(empresaId, acesso.usuario, corpo);
  if (!resultado.ok) {
    return NextResponse.json({ erro: resultado.erro }, { status: resultado.status });
  }

  // RETRY IDEMPOTENTE: o pedido já existia (mesma idempotencyKey). Devolve
  // exatamente a mesma resposta da tentativa original, com status 200 (não
  // 201 — nada foi criado agora) e SEM repetir os efeitos colaterais:
  // reimprimir a comanda de um pedido que já está na cozinha duplicaria o
  // trabalho da produção, que é justamente o que a idempotência evita.
  if (resultado.idempotente) {
    return NextResponse.json(
      { ok: true, idempotente: true, pedido: resultado.pedido },
      { status: 200 }
    );
  }

  // Novo pedido entrou na fila de produção → avisa os painéis KDS.
  emitirMudancaKds(empresaId);

  // Impressão automática (PEDIDO 16): a comanda da cozinha sai sempre;
  // balcão/retirada/delivery também imprimem a comanda no caixa.
  // Isolado em try/catch: o pedido JÁ FOI criado no banco acima — uma
  // falha na impressão (geração do texto, fila) nunca pode derrubar a
  // criação do pedido, que já está concluída com sucesso.
  try {
    const numero = resultado.pedido.numero;
    const canal = resultado.pedido.canal;
    const tipoCanal = tipoParaCanalPedido(canal);
    const impressoras = await lerImpressoras(empresaId);
    if (tipoCanal !== "pedido-cozinha") {
      const conteudo = await gerarConteudoPedido(empresaId, numero, tipoCanal);
      if (conteudo) {
        await enfileirarAutomatica(empresaId, {
          tipo: tipoCanal,
          destino: destinoRealDoTipo(tipoCanal, impressoras),
          referencia: referenciaPedido(numero),
          conteudo,
        });
      }
    }
    const conteudoCozinha = await gerarConteudoPedido(empresaId, numero, "pedido-cozinha");
    if (conteudoCozinha) {
      // "mesa ou cozinha, conforme configuração" só se aplica quando a
      // ORIGEM do pedido é de fato salão/mesa — o ticket de produção que
      // sai pra TODO pedido (inclusive balcão/retirada/delivery, pra
      // cozinhar) continua "cozinha" fixo, senão um pedido de balcão
      // iria pra uma impressora de mesa separada por engano.
      const destinoCozinha = canal === "salao" ? destinoRealDoTipo("pedido-cozinha", impressoras) : "cozinha";
      await enfileirarAutomatica(empresaId, {
        tipo: "pedido-cozinha",
        destino: destinoCozinha,
        referencia: referenciaPedido(numero),
        conteudo: conteudoCozinha,
      });
    }
  } catch (erroImpressao) {
    console.warn(`Impressão automática falhou para o pedido ${resultado.pedido.id} (pedido já criado):`, erroImpressao);
  }

  return NextResponse.json({ ok: true, idempotente: false, pedido: resultado.pedido }, { status: 201 });
});

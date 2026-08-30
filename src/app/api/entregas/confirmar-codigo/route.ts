import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizar } from "@/lib/acesso";
import { emitirEventoTempoReal } from "@/lib/eventos-tempo-real";
import { comTratamentoDeErro } from "@/lib/api-erro";

/**
 * POST /api/entregas/confirmar-codigo — o entregador escaneia o QR da
 * comanda para ASSUMIR a entrega (PEDIDO 12).
 *
 * CORREÇÃO DE FUNÇÃO: antes, escanear já CONCLUÍA a entrega e confirmava
 * pagamento — o QR não corresponde a "eu peguei o pedido pra sair", e
 * sim a "esta venda foi paga", o que é errado: o entregador pode nem ter
 * chegado no cliente ainda. Agora escanear só ASSUME a posse da entrega
 * (aguardando → preparo, com o entregador atribuído). "Iniciar rota"
 * (preparo → rota) e "confirmar entrega" (rota → entregue, que aí sim
 * finaliza pagamento) continuam em `PATCH /api/entregas/[id]`, como
 * ações SEPARADAS e explícitas do entregador.
 *
 * CORREÇÃO DE SEGURANÇA (PEDIDO 14): autorização por `usuarioId`
 * (`Entregador.usuarioId`), nunca mais comparando nomes.
 *
 * CORREÇÃO DE FORMATO (PEDIDO 15): o QR real usa
 * `pedidoflow:v1:entrega:<codigoQr>` — um token aleatório gerado na
 * criação da entrega (`Entrega.codigoQr`), não mais o número sequencial
 * do pedido (fácil de adivinhar/incrementar). Dígito manual (sem
 * câmera) continua aceitando o NÚMERO do pedido como reserva — é menos
 * seguro que o QR, mas segue exigindo o claim atômico abaixo, então não
 * pode ser usado pra "roubar" uma entrega já assumida por outro.
 */
function extrairCodigoQr(entrada: string): string | null {
  const texto = String(entrada ?? "").trim();
  const match = texto.match(/^pedidoflow:v1:entrega:([a-f0-9]{16,})$/i);
  return match ? match[1] : null;
}
function extrairNumeroManual(entrada: string): number | null {
  const texto = String(entrada ?? "").trim();
  const match = texto.match(/^#?(\d{1,9})$/);
  return match ? Number(match[1]) : null;
}

export const POST = comTratamentoDeErro("entregas.confirmarCodigo.POST", async (req: NextRequest) => {
  const acesso = await autorizar("entregas");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  // Só ENTREGADOR assume entrega escaneando — admin/pdv atribuem por
  // outra tela (`PATCH /api/entregas/[id]` com `entregadorId` explícito).
  if (acesso.usuario.papel !== "ENTREGADOR") {
    return NextResponse.json({ erro: "Somente entregadores assumem entregas pelo QR." }, { status: 403 });
  }
  const entregadorProprio = await prisma.entregador.findFirst({
    where: { empresaId, usuarioId: acesso.usuario.id, ativo: true },
  });
  if (!entregadorProprio) {
    return NextResponse.json(
      { erro: "Sua conta não está vinculada a um cadastro de entregador ativo. Fale com o Admin." },
      { status: 403 }
    );
  }

  const corpo = await req.json().catch(() => null);
  const bruto = String(corpo?.codigo ?? "");
  const codigoQr = extrairCodigoQr(bruto);
  const numeroManual = codigoQr ? null : extrairNumeroManual(bruto);

  if (!codigoQr && !numeroManual) {
    return NextResponse.json(
      { erro: "Código inválido — escaneie o QR da comanda ou digite o número do pedido." },
      { status: 400 }
    );
  }

  const entrega = await prisma.entrega.findFirst({
    where: codigoQr
      ? { empresaId, codigoQr }
      : { empresaId, pedido: { numero: numeroManual!, empresaId } },
    include: { pedido: { select: { numero: true, clienteNome: true } } },
  });
  if (!entrega) {
    return NextResponse.json({ erro: "Nenhuma entrega encontrada para este código.", codigo: "NOT_FOUND" }, { status: 404 });
  }

  // Reivindicação ATÔMICA (PEDIDO 13): só aplica se ainda estiver
  // "aguardando" e sem entregador — dois entregadores escaneando ao
  // mesmo tempo, só um `updateMany` afeta a linha; o outro recebe
  // `count: 0` e sabe que perdeu a corrida, sem os dois "vencerem".
  const resultado = await prisma.entrega.updateMany({
    where: { id: entrega.id, empresaId, status: "aguardando", entregadorId: null },
    data: { entregadorId: entregadorProprio.id, status: "preparo" },
  });

  if (resultado.count === 0) {
    const atual = await prisma.entrega.findFirst({ where: { id: entrega.id }, select: { status: true, entregadorId: true } });
    if (atual?.entregadorId && atual.entregadorId !== entregadorProprio.id) {
      return NextResponse.json({ erro: "Esta entrega já foi assumida por outro entregador.", codigo: "CONFLICT" }, { status: 409 });
    }
    if (atual?.entregadorId === entregadorProprio.id) {
      // Idempotente: o próprio entregador escaneou de novo (retry de
      // rede) — não é erro, só confirma que já é dele.
      return NextResponse.json({
        ok: true,
        entrega: { id: entrega.id, numero: entrega.pedido.numero, cliente: entrega.pedido.clienteNome ?? "Cliente", status: atual.status, jaAssumida: true },
      });
    }
    return NextResponse.json({ erro: `Esta entrega não está disponível para ser assumida (status: ${atual?.status ?? "desconhecido"}).`, codigo: "INVALID_STATE" }, { status: 409 });
  }

  emitirEventoTempoReal(empresaId, "entrega", { id: entrega.id, status: "preparo", entregadorId: entregadorProprio.id });

  return NextResponse.json({
    ok: true,
    entrega: {
      id: entrega.id,
      numero: entrega.pedido.numero,
      cliente: entrega.pedido.clienteNome ?? "Cliente",
      status: "preparo",
    },
  });
});

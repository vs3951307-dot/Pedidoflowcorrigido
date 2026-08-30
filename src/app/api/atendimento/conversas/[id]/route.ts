import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizar } from "@/lib/acesso";
import { carregarConversaDetalhe } from "@/lib/atendente/motor";
import { enviarMensagemWhatsApp } from "@/lib/atendente/whatsapp-api";
import { comTratamentoDeErro } from "@/lib/api-erro";

/**
 * Detalhe de uma conversa (GET) e ações de atendente humano (PATCH):
 * - { humana: true }      → assume o atendimento humano
 * - { humana: false }     → devolve para o robô
 * - { encerrar: true }    → encerra a conversa
 * - { mensagemHumano }    → responde como humano (e envia no WhatsApp real, se configurado)
 */
export const GET = comTratamentoDeErro("atendimento.conversas.id.GET", async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const acesso = await autorizar("atendimento");
  if (!acesso.ok) return acesso.resposta;
  const { id } = await params;
  const conversa = await carregarConversaDetalhe(acesso.empresaId, id);
  if (!conversa) {
    return NextResponse.json({ erro: "Conversa não encontrada." }, { status: 404 });
  }
  return NextResponse.json({ conversa });
});

export const PATCH = comTratamentoDeErro("atendimento.conversas.id.PATCH", async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const acesso = await autorizar("atendimento");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;
  const { id } = await params;
  const corpo = await req.json().catch(() => ({}));

  const conversa = await prisma.conversaWhatsApp.findFirst({ where: { id, empresaId } });
  if (!conversa) {
    return NextResponse.json({ erro: "Conversa não encontrada." }, { status: 404 });
  }

  const encerrar = corpo.encerrar === true;
  const humana = corpo.humana === true;
  const devolver = corpo.humana === false;
  const mensagemHumano = typeof corpo.mensagemHumano === "string"
    ? corpo.mensagemHumano.trim()
    : "";

  if (encerrar) {
    await prisma.conversaWhatsApp.update({
      where: { id },
      data: { status: "encerrada", etapa: "encerrada", atendimentoHumano: false },
    });
    await prisma.mensagemWhatsApp.create({
      data: {
        conversaId: id,
        de: "sistema",
        texto: "Conversa encerrada pelo atendente. Obrigado pelo contato! 👋",
      },
    });
  } else if (humana && !conversa.atendimentoHumano) {
    await prisma.conversaWhatsApp.update({
      where: { id },
      data: {
        atendimentoHumano: true,
        humanaDesde: new Date(),
        motivoTransferencia: "Atendente assumiu manualmente",
      },
    });
    await prisma.mensagemWhatsApp.create({
      data: {
        conversaId: id,
        de: "sistema",
        texto: "Atendente humano assumiu a conversa. 🙋",
      },
    });
  } else if (devolver && conversa.atendimentoHumano) {
    await prisma.conversaWhatsApp.update({
      where: { id },
      data: { atendimentoHumano: false, humanaDesde: null, motivoTransferencia: null },
    });
    await prisma.mensagemWhatsApp.create({
      data: {
        conversaId: id,
        de: "sistema",
        texto: "Atendimento voltou para o robô (retoma do fluxo atual). 🤖",
      },
    });
  }

  if (mensagemHumano) {
    await prisma.mensagemWhatsApp.create({
      data: { conversaId: id, de: "humano", texto: mensagemHumano },
    });
    if (conversa.origem === "whatsapp") {
      const enviado = await enviarMensagemWhatsApp(empresaId, conversa.telefone, mensagemHumano);
      if (!enviado) {
        console.warn(
          `Mensagem humana registrada, mas WhatsApp real não configurado ou falhou (conversa ${id}).`
        );
      }
    }
  }

  const atualizada = await carregarConversaDetalhe(empresaId, id);
  return NextResponse.json({ conversa: atualizada });
});

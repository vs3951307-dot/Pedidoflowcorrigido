import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizar, registrarAuditoria } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { enviarMensagemWhatsApp } from "@/lib/atendente/whatsapp-api";

interface ConfigContingencia {
  ativa?: boolean;
}

function montarMensagemRota(
  entregadorNome: string,
  entregas: {
    pedido: { numero: number; total: number; observacao: string | null; formaPagamentoEntrega: string | null };
    endereco: string;
    bairro: string;
    complemento: string | null;
    referencia: string | null;
    telefone: string | null;
  }[]
): string {
  const linhas: (string | null)[] = [
    `📦 *Rota de entregas — contingência* (${entregadorNome})`,
    "",
    "⚠️ Este é um envio manual de contingência. Use o app do Entregador sempre que possível.",
    "",
  ];
  entregas.forEach((e, indice) => {
    const enderecoCompleto = [e.endereco, e.bairro, e.complemento, e.referencia].filter(Boolean).join(", ");
    const linkMapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoCompleto)}`;
    linhas.push(
      `*${indice + 1}. Pedido #${e.pedido.numero}*`,
      `📍 ${enderecoCompleto}`,
      `🗺️ ${linkMapa}`,
      e.telefone ? `📞 ${e.telefone}` : null,
      `💳 ${e.pedido.formaPagamentoEntrega ?? "combinar na entrega"} — R$ ${e.pedido.total.toFixed(2).replace(".", ",")}`,
      e.pedido.observacao ? `📝 ${e.pedido.observacao}` : null,
      ""
    );
  });
  return linhas.filter((l) => l !== null).join("\n");
}

/**
 * POST /api/entregas/contingencia-whatsapp — envia a rota de UM
 * entregador para o WhatsApp dele mesmo, como contingência manual
 * (PEDIDO 9/19). Só funciona se a empresa tiver ativado explicitamente
 * essa opção (Configurações → Contingência do Entregador) — por padrão
 * fica desativada e esta rota nunca envia nada nem consome recursos.
 *
 * Body: { entregadorId }
 */
export const POST = comTratamentoDeErro("entregas.contingenciaWhatsapp.POST", async (req: NextRequest) => {
  const acesso = await autorizar("admin", "entregas");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const configRegistro = await prisma.configuracao.findUnique({
    where: { empresaId_chave: { empresaId, chave: "contingencia_entregador" } },
  });
  let config: ConfigContingencia = {};
  if (configRegistro) {
    try {
      config = JSON.parse(configRegistro.valor) as ConfigContingencia;
    } catch {
      config = {};
    }
  }
  if (!config.ativa) {
    return NextResponse.json(
      {
        erro:
          "A contingência via WhatsApp está desativada para esta empresa. Ative em Configurações → Contingência do Entregador antes de usar.",
      },
      { status: 400 }
    );
  }

  const corpo = await req.json().catch(() => ({}));
  const entregadorId = String(corpo.entregadorId ?? "");
  if (!entregadorId) {
    return NextResponse.json({ erro: "Informe o entregador." }, { status: 400 });
  }

  const entregador = await prisma.entregador.findFirst({ where: { id: entregadorId, empresaId } });
  if (!entregador) {
    return NextResponse.json({ erro: "Entregador não encontrado." }, { status: 404 });
  }
  if (!entregador.telefone) {
    return NextResponse.json(
      { erro: "Este entregador não tem telefone cadastrado — cadastre em Entregadores antes de usar a contingência." },
      { status: 400 }
    );
  }

  const entregas = await prisma.entrega.findMany({
    where: { empresaId, entregadorId, status: { in: ["preparo", "rota"] } },
    include: { pedido: { select: { numero: true, total: true, observacao: true, formaPagamentoEntrega: true } } },
    orderBy: { criadoEm: "asc" },
  });

  if (entregas.length === 0) {
    return NextResponse.json({ erro: "Este entregador não tem entregas ativas no momento." }, { status: 400 });
  }

  const mensagem = montarMensagemRota(entregador.nome, entregas);
  const enviado = await enviarMensagemWhatsApp(empresaId, entregador.telefone, mensagem);

  if (!enviado) {
    return NextResponse.json(
      { erro: "Não foi possível enviar pelo WhatsApp (verifique a configuração do WhatsApp da empresa)." },
      { status: 502 }
    );
  }

  await registrarAuditoria(
    "contingencia_whatsapp_enviada",
    `Rota de ${entregador.nome} (${entregas.length} entrega(s)) enviada via WhatsApp`,
    acesso.usuario,
    undefined,
    empresaId
  );

  return NextResponse.json({ ok: true, entregasEnviadas: entregas.length });
});

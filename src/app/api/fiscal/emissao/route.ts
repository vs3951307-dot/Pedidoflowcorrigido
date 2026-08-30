import { NextRequest, NextResponse } from "next/server";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { autorizar, registrarAuditoria } from "@/lib/acesso";
import { emitirNFCeParaPedido, documentoDoPedido } from "@/lib/fiscal/emissao";

/**
 * POST /api/fiscal/emissao — emite (ou re-tenta) a NFC-e de um pedido
 * DESTA empresa. Body: { pedidoId, manual? }. A emissão só é "autorizado"
 * com retorno real do provedor; sem configuração o documento fica
 * "nao_configurado".
 */
async function POSTTenant(req: NextRequest) {
  const acesso = await autorizar("fiscal");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const corpo = await req.json().catch(() => ({}));
  const pedidoId = String(corpo.pedidoId ?? "").trim();
  if (!pedidoId) {
    return NextResponse.json({ erro: "pedidoId é obrigatório." }, { status: 400 });
  }

  const documento = await documentoDoPedido(empresaId, pedidoId).catch(() => null);
  if (!documento) {
    return NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 });
  }

  const { resultado } = await emitirNFCeParaPedido(empresaId, pedidoId, {
    manual: corpo.manual === true,
    usuario: { id: acesso.usuario.id, nome: acesso.usuario.nome },
  });
  await registrarAuditoria(
    "nfce_emissao",
    `Emissão NFC-e do pedido ${pedidoId}: ${resultado.status}${resultado.retorno?.chave ? ` (chave ${resultado.retorno.chave})` : ""}`,
    acesso.usuario,
    undefined,
    empresaId
  );

  const statusHttp = resultado.status === "autorizado" ? 201 : 200;
  return NextResponse.json({ ok: resultado.status === "autorizado", fiscal: resultado }, { status: statusHttp });
}

export const POST = comTratamentoDeErro("fiscal.emissao.POST", POSTTenant);

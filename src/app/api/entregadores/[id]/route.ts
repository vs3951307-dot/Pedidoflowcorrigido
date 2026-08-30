import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizar, registrarAuditoria } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";

export const PATCH = comTratamentoDeErro("entregadores.id.PATCH", async (req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizar("admin");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const existente = await prisma.entregador.findFirst({ where: { id: params.id, empresaId } });
  if (!existente) {
    return NextResponse.json({ erro: "Entregador não encontrado." }, { status: 404 });
  }

  const corpo = await req.json().catch(() => ({}));
  const dados: Record<string, unknown> = {};
  if (typeof corpo.nome === "string" && corpo.nome.trim()) dados.nome = corpo.nome.trim();
  if (typeof corpo.email === "string") dados.email = corpo.email.trim() || null;
  if (typeof corpo.telefone === "string") dados.telefone = corpo.telefone.trim() || null;
  if (typeof corpo.ativo === "boolean") dados.ativo = corpo.ativo;

  // Vincular/desvincular a conta de login (PEDIDO 14 — a relação segura
  // que faz o QR e a autorização por ID funcionarem).
  if ("usuarioId" in corpo) {
    const usuarioId = corpo.usuarioId ? String(corpo.usuarioId) : null;
    if (usuarioId) {
      const usuario = await prisma.usuario.findFirst({ where: { id: usuarioId, empresaId, papel: "ENTREGADOR" } });
      if (!usuario) {
        return NextResponse.json({ erro: "Usuário inválido — precisa ter papel Entregador nesta empresa." }, { status: 400 });
      }
      const jaVinculado = await prisma.entregador.findFirst({ where: { usuarioId, NOT: { id: existente.id } } });
      if (jaVinculado) {
        return NextResponse.json({ erro: "Este usuário já está vinculado a outro cadastro de entregador." }, { status: 409 });
      }
    }
    dados.usuarioId = usuarioId;
  }

  const entregador = await prisma.entregador.update({ where: { id: existente.id }, data: dados });
  await registrarAuditoria("entregador_atualizado", entregador.nome, acesso.usuario, undefined, empresaId);
  return NextResponse.json({ ok: true, entregador });
});

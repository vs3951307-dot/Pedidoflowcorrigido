import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { autorizar, RECURSOS, registrarAuditoria, ROTULOS_PAPEL } from "@/lib/acesso";

/**
 * Override de permissão por usuário (PATCH { recurso, permitido }).
 * Sem override, vale o padrão do papel; com registro, o valor define.
 * Só é possível alterar permissão de um usuário DA MESMA EMPRESA.
 */
async function PATCHTenant(req: NextRequest, { params }: { params: { id: string } }) {
  const acesso = await autorizar("usuarios");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const corpo = await req.json().catch(() => ({}));
  const recurso = String(corpo.recurso ?? "");
  const permitido = corpo.permitido === true;

  if (!(RECURSOS as readonly string[]).includes(recurso)) {
    return NextResponse.json({ erro: "Recurso inválido." }, { status: 400 });
  }

  const alvo = await prisma.usuario.findFirst({ where: { id: params.id, empresaId } });
  if (!alvo) {
    return NextResponse.json({ erro: "Usuário não encontrado." }, { status: 404 });
  }

  const existente = await prisma.permissaoUsuario.findUnique({
    where: { usuarioId_recurso: { usuarioId: alvo.id, recurso } },
  });

  if (existente) {
    await prisma.permissaoUsuario.update({
      where: { id: existente.id },
      data: { permitido },
    });
  } else {
    await prisma.permissaoUsuario.create({
      data: { usuarioId: alvo.id, recurso, permitido },
    });
  }

  await registrarAuditoria(
    "permissao_alterada",
    `${alvo.nome}: ${recurso} ${permitido ? "concedido" : "revogado"}`,
    acesso.usuario,
    undefined,
    empresaId
  );

  return NextResponse.json({
    ok: true,
    permissao: { recurso, permitido },
    papel: ROTULOS_PAPEL[alvo.papel as keyof typeof ROTULOS_PAPEL] ?? alvo.papel,
  });
}

/** Remove o override e volta ao padrão do papel. */
async function DELETETenant(req: NextRequest, { params }: { params: { id: string } }) {
  const acesso = await autorizar("usuarios");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const corpo = await req.json().catch(() => ({}));
  const recurso =
    String(req.nextUrl.searchParams.get("recurso") ?? corpo.recurso ?? "");
  if (!(RECURSOS as readonly string[]).includes(recurso)) {
    return NextResponse.json({ erro: "Recurso inválido." }, { status: 400 });
  }

  const alvo = await prisma.usuario.findFirst({ where: { id: params.id, empresaId } });
  if (!alvo) {
    return NextResponse.json({ erro: "Usuário não encontrado." }, { status: 404 });
  }

  await prisma.permissaoUsuario.deleteMany({
    where: { usuarioId: alvo.id, recurso },
  });

  await registrarAuditoria(
    "permissao_alterada",
    `${alvo.nome}: ${recurso} restaurado ao padrão do papel`,
    acesso.usuario,
    undefined,
    empresaId
  );

  return NextResponse.json({ ok: true });
}

export const PATCH = comTratamentoDeErro("usuarios.permissao.PATCH", PATCHTenant);
export const DELETE = comTratamentoDeErro("usuarios.permissao.DELETE", DELETETenant);

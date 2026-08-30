import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { encerrarSessoesDoUsuario } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/acesso";
import { verificarLimite, ipDaRequisicao } from "@/lib/rate-limit";

/** Redefine a senha com o token de recuperação (uso único, 30 min). */
export async function POST(req: NextRequest) {
  const ip = ipDaRequisicao(req);
  const limite = verificarLimite({ chave: `redefinir:${ip}`, maximo: 5, janelaMs: 60_000 });
  if (!limite.permitido) {
    return NextResponse.json(
      { erro: "Muitas tentativas. Tente novamente em instantes." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limite.reiniciaEm / 1000)) } }
    );
  }

  const corpo = await req.json().catch(() => ({}));
  const token = String(corpo.token ?? "").trim();
  const novaSenha = String(corpo.novaSenha ?? "");

  if (!token) {
    return NextResponse.json({ erro: "Informe o token de recuperação." }, { status: 400 });
  }
  if (novaSenha.length < 8) {
    return NextResponse.json(
      { erro: "A nova senha deve ter pelo menos 8 caracteres." },
      { status: 400 }
    );
  }

  const registro = await prisma.tokenRecuperacao.findUnique({
    where: { tokenHash: createHash("sha256").update(token).digest("hex") },
    include: { usuario: true },
  });

  if (!registro || registro.usadoEm || registro.expiraEm < new Date()) {
    return NextResponse.json(
      { erro: "Token inválido ou expirado. Solicite uma nova recuperação." },
      { status: 400 }
    );
  }

  await prisma.$transaction([
    prisma.usuario.update({
      where: { id: registro.usuarioId },
      data: { senhaHash: bcrypt.hashSync(novaSenha, 12) },
    }),
    prisma.tokenRecuperacao.update({
      where: { id: registro.id },
      data: { usadoEm: new Date() },
    }),
  ]);
  // Todas as sessões do usuário são revogadas após a troca de senha.
  await encerrarSessoesDoUsuario(registro.usuarioId);
  await registrarAuditoria("senha_redefinida", "Senha redefinida via token", registro.usuario, undefined, registro.usuario.empresaId);

  return NextResponse.json({ ok: true, mensagem: "Senha redefinida com sucesso." });
}

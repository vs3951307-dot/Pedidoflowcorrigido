import { NextRequest, NextResponse } from "next/server";

import { encerrarSessao, hashToken } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/acesso";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const token = req.cookies.get("sessao")?.value;
  if (token) {
    const sessao = await prisma.sessao
      .findUnique({
        where: { token: hashToken(token) },
        include: { usuario: true },
      })
      .catch(() => null);
    if (sessao?.usuario) {
      await registrarAuditoria("logout", "Sessão encerrada", sessao.usuario, undefined, sessao.usuario.empresaId);
    }
    await encerrarSessao(token).catch(() => null);
  }
  const resposta = NextResponse.json({ ok: true });
  resposta.cookies.set("sessao", "", { httpOnly: true, path: "/", maxAge: 0 });
  return resposta;
}

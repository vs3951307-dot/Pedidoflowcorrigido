import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  criarSessaoSuperAdmin,
  definirCookieSuperAdmin,
  verificarSenhaSuperAdmin,
  registrarAuditoriaSuperAdmin,
} from "@/lib/super-admin/auth";
import { verificarLimite, ipDaRequisicao } from "@/lib/rate-limit";
import { comTratamentoDeErro } from "@/lib/api-erro";

export const POST = comTratamentoDeErro("superadmin.auth.login.POST", async (req: NextRequest) => {
  const ip = ipDaRequisicao(req);
  const limite = verificarLimite({ chave: `superadmin-login:${ip}`, maximo: 5, janelaMs: 60_000 });
  if (!limite.permitido) {
    return NextResponse.json(
      { erro: "Muitas tentativas. Tente novamente em instantes." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limite.reiniciaEm / 1000)) } }
    );
  }

  const corpo = await req.json().catch(() => ({}));
  const email = String(corpo.email ?? "").trim().toLowerCase();
  const senha = String(corpo.senha ?? "");
  const userAgent = req.headers.get("user-agent") ?? undefined;

  if (!email || !senha) {
    return NextResponse.json({ erro: "Informe e-mail e senha." }, { status: 400 });
  }

  const superAdmin = await prisma.superAdmin.findUnique({ where: { email } });
  const senhaOk = superAdmin ? await verificarSenhaSuperAdmin(senha, superAdmin.senhaHash) : false;

  if (!superAdmin || !senhaOk || !superAdmin.ativo) {
    await registrarAuditoriaSuperAdmin("superadmin_login_falha", `Tentativa falha para ${email}`, superAdmin?.id ?? "desconhecido");
    return NextResponse.json({ erro: "Credenciais inválidas." }, { status: 401 });
  }

  const token = await criarSessaoSuperAdmin(superAdmin.id, userAgent);
  await prisma.superAdmin.update({ where: { id: superAdmin.id }, data: { ultimoAcesso: new Date() } });
  await registrarAuditoriaSuperAdmin("superadmin_login", `Login bem-sucedido: ${email}`, superAdmin.id);

  const resposta = NextResponse.json({ ok: true, superAdmin: { id: superAdmin.id, nome: superAdmin.nome, email: superAdmin.email } });
  definirCookieSuperAdmin(resposta, token);
  return resposta;
});

import { randomBytes, createHash } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";

/**
 * Registra auditoria de ações sensíveis do Super Admin na tabela Auditoria
 * (schema public, tenantId = "superadmin").
 */
export async function registrarAuditoriaSuperAdmin(
  acao: string,
  detalhes: string,
  superAdminId: string
): Promise<void> {
  try {
    await prisma.auditoria.create({
      data: {
        acao,
        detalhe: detalhes,
        usuarioNome: "Super Admin",
        empresaId: null,
        criadoEm: new Date(),
      },
    });
  } catch {
    // Falha de auditoria NÃO deve quebrar a operação principal.
  }
}

/**
 * Autenticação do SUPER ADMIN (dono da plataforma PedidoFlow) —
 * COMPLETAMENTE separada da autenticação de usuários de empresa
 * (`src/lib/auth.ts` / `src/lib/acesso.ts`).
 *
 * Decisões de isolamento deliberadas:
 * - Cookie de sessão próprio (`sessao_superadmin`, nunca `sessao`).
 * - Tabelas próprias (`SuperAdmin`, `SessaoSuperAdmin`) — um SuperAdmin
 *   NUNCA é um `Usuario` de empresa, e vice-versa.
 * - `autorizarSuperAdmin()` nunca reaproveita `autorizar()` de empresa —
 *   elimina qualquer chance de um admin de empresa "virar" super admin
 *   por erro de lógica compartilhada.
 */

const SESSAO_DIAS = 7;
const COOKIE_SUPERADMIN = "sessao_superadmin";

function criarToken() {
  return randomBytes(32).toString("hex");
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function verificarSenhaSuperAdmin(senha: string, hash: string) {
  return bcrypt.compare(senha, hash);
}

export async function criarSessaoSuperAdmin(superAdminId: string, userAgent?: string) {
  const token = criarToken();
  await prisma.sessaoSuperAdmin.create({
    data: {
      token: hashToken(token),
      superAdminId,
      userAgent: userAgent ?? null,
      expiraEm: new Date(Date.now() + SESSAO_DIAS * 24 * 60 * 60 * 1000),
    },
  });
  return token;
}

export async function encerrarSessaoSuperAdmin(token: string) {
  await prisma.sessaoSuperAdmin.deleteMany({ where: { token: hashToken(token) } });
}

async function superAdminDaSessao(token: string | undefined) {
  if (!token) return null;
  const sessao = await prisma.sessaoSuperAdmin.findUnique({
    where: { token: hashToken(token) },
    include: { superAdmin: true },
  });
  if (!sessao) return null;
  if (sessao.expiraEm < new Date()) {
    await prisma.sessaoSuperAdmin.delete({ where: { token: sessao.token } });
    return null;
  }
  if (!sessao.superAdmin.ativo) return null;
  return sessao.superAdmin;
}

export function definirCookieSuperAdmin(resposta: NextResponse, token: string) {
  resposta.cookies.set(COOKIE_SUPERADMIN, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * SESSAO_DIAS,
    path: "/",
  });
}

export function limparCookieSuperAdmin(resposta: NextResponse) {
  resposta.cookies.set(COOKIE_SUPERADMIN, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export type AutorizacaoSuperAdmin =
  | { ok: true; superAdmin: { id: string; nome: string; email: string } }
  | { ok: false; resposta: NextResponse };

/** Guarda de API do painel Super Admin — nunca aceita sessão de empresa. */
export async function autorizarSuperAdmin(): Promise<AutorizacaoSuperAdmin> {
  const token = cookies().get(COOKIE_SUPERADMIN)?.value;
  const superAdmin = await superAdminDaSessao(token);
  if (!superAdmin) {
    return {
      ok: false,
      resposta: NextResponse.json({ erro: "Sessão de Super Admin inválida ou expirada." }, { status: 401 }),
    };
  }
  return { ok: true, superAdmin: { id: superAdmin.id, nome: superAdmin.nome, email: superAdmin.email } };
}

/** Guarda de página do painel Super Admin. */
export async function exigirSuperAdmin() {
  const token = cookies().get(COOKIE_SUPERADMIN)?.value;
  const superAdmin = await superAdminDaSessao(token);
  if (!superAdmin) {
    redirect("/superadmin/login");
  }
  return superAdmin!;
}

export { COOKIE_SUPERADMIN };

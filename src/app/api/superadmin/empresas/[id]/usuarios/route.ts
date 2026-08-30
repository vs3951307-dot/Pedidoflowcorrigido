import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { autorizarSuperAdmin } from "@/lib/super-admin/auth";
import { ehPapelValido } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { invalidarClienteTenant } from "@/lib/tenant-db";

const criarUsuarioSchema = z.object({
  nome: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(120),
  senha: z.string().min(8).max(100),
  papel: z.string().refine(ehPapelValido, "Papel inválido"),
});

const editarUsuarioSchema = z.object({
  usuarioId: z.string().min(1),
  nome: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().email().max(120).optional(),
  papel: z.string().refine(ehPapelValido, "Papel inválido").optional(),
  ativo: z.boolean().optional(),
});

/** GET — lista usuários da empresa */
export const GET = comTratamentoDeErro("superadmin.empresas.id.usuarios.GET", async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizarSuperAdmin();
  if (!acesso.ok) return acesso.resposta;

  const empresa = await prisma.empresa.findUnique({ where: { id: params.id } });
  if (!empresa) return NextResponse.json({ erro: "Empresa não encontrada." }, { status: 404 });

  const usuarios = await prisma.usuario.findMany({
    where: { empresaId: params.id },
    select: { id: true, nome: true, email: true, papel: true, ativo: true, ultimoAcesso: true },
    orderBy: { nome: "asc" },
  });

  return NextResponse.json({ usuarios });
});

/** POST — cria usuário na empresa (bypassa limite de plano — ação de superadmin) */
export const POST = comTratamentoDeErro("superadmin.empresas.id.usuarios.POST", async (req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizarSuperAdmin();
  if (!acesso.ok) return acesso.resposta;

  const empresa = await prisma.empresa.findUnique({ where: { id: params.id } });
  if (!empresa) return NextResponse.json({ erro: "Empresa não encontrada." }, { status: 404 });

  const corpoBruto = await req.json().catch(() => ({}));
  const validado = criarUsuarioSchema.safeParse(corpoBruto);
  if (!validado.success) {
    return NextResponse.json({ erro: validado.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }
  const { nome, email, senha, papel } = validado.data;

  const existente = await prisma.usuario.findUnique({ where: { email } });
  if (existente) {
    return NextResponse.json({ erro: "Já existe um usuário com este e-mail." }, { status: 409 });
  }

  const usuario = await prisma.usuario.create({
    data: {
      empresaId: params.id,
      nome,
      email,
      papel,
      senhaHash: bcrypt.hashSync(senha, 12),
      ativo: true,
    },
    select: { id: true, nome: true, email: true, papel: true, ativo: true },
  });

  return NextResponse.json({ ok: true, usuario });
});

/** PATCH — edita usuário (nome, email, papel, ativo) */
export const PATCH = comTratamentoDeErro("superadmin.empresas.id.usuarios.PATCH", async (req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizarSuperAdmin();
  if (!acesso.ok) return acesso.resposta;

  const empresa = await prisma.empresa.findUnique({ where: { id: params.id } });
  if (!empresa) return NextResponse.json({ erro: "Empresa não encontrada." }, { status: 404 });

  const corpoBruto = await req.json().catch(() => ({}));
  const validado = editarUsuarioSchema.safeParse(corpoBruto);
  if (!validado.success) {
    return NextResponse.json({ erro: validado.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }
  const { usuarioId, ...dados } = validado.data;

  const alvo = await prisma.usuario.findFirst({ where: { id: usuarioId, empresaId: params.id } });
  if (!alvo) return NextResponse.json({ erro: "Usuário não encontrado." }, { status: 404 });

  const atualizacao: Record<string, unknown> = {};
  if (dados.nome !== undefined) atualizacao.nome = dados.nome;
  if (dados.email !== undefined) {
    const outro = await prisma.usuario.findFirst({ where: { email: dados.email, id: { not: usuarioId } } });
    if (outro) return NextResponse.json({ erro: "Já existe um usuário com este e-mail." }, { status: 409 });
    atualizacao.email = dados.email;
  }
  if (dados.papel !== undefined) atualizacao.papel = dados.papel;
  if (dados.ativo !== undefined) {
    atualizacao.ativo = dados.ativo;
    if (!dados.ativo) {
      await prisma.sessao.deleteMany({ where: { usuarioId } });
      await invalidarClienteTenant(params.id).catch(() => null);
    }
  }

  const usuario = await prisma.usuario.update({
    where: { id: usuarioId },
    data: atualizacao,
    select: { id: true, nome: true, email: true, papel: true, ativo: true },
  });

  return NextResponse.json({ ok: true, usuario });
});

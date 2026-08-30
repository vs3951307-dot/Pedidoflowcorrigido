import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { autorizarSuperAdmin } from "@/lib/super-admin/auth";
import { comTratamentoDeErro } from "@/lib/api-erro";

/**
 * POST /api/superadmin/resetar-senhas
 *
 * Reseta as senhas dos usuários de UMA empresa. Recuperação de acesso
 * para um cliente que perdeu o admin.
 *
 * CORREÇÃO (risco crítico): a versão anterior fazia
 *
 *     prisma.usuario.updateMany({ data: { senhaHash } })      // sem where
 *     prisma.superAdmin.updateMany({ data: { senhaHash } })   // sem where
 *     prisma.sessao.deleteMany()                              // sem where
 *
 * ou seja: um clique (ou uma sessão de Super Admin roubada) colocava a
 * MESMA senha conhecida em todos os usuários de TODAS as empresas
 * clientes e em todos os Super Admins. Num SaaS multiempresa isso não é
 * "recuperação de acesso", é comprometimento de todos os clientes de uma
 * vez — e a tela ainda vinha com a senha preenchida por padrão.
 *
 * Agora: `empresaId` é obrigatório, só aquela empresa é afetada, e o
 * Super Admin NÃO é alcançável por aqui (use o script
 * `npm run db:resetar-senha-super-admin`, que roda no servidor).
 *
 * Body: { empresaId: string, senha: string } — senha com 12+ caracteres.
 */
export const POST = comTratamentoDeErro("superadmin.resetar-senhas.POST", async (req) => {
  const acesso = await autorizarSuperAdmin();
  if (!acesso.ok) return acesso.resposta;

  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const empresaId = String(corpo.empresaId ?? "").trim();
  const senha = String(corpo.senha ?? "").trim();

  if (!empresaId) {
    return NextResponse.json(
      { erro: "Informe a empresa. O reset é sempre de uma empresa por vez." },
      { status: 400 }
    );
  }
  if (senha.length < 12) {
    return NextResponse.json({ erro: "A senha deve ter pelo menos 12 caracteres." }, { status: 400 });
  }

  const empresa = await prisma.empresa.findFirst({
    where: { id: empresaId, status: { not: "excluida" } },
    select: { id: true, nome: true },
  });
  if (!empresa) {
    return NextResponse.json({ erro: "Empresa não encontrada." }, { status: 404 });
  }

  const hash = bcrypt.hashSync(senha, 12);

  const usuariosAtualizados = await prisma.usuario.updateMany({
    where: { empresaId: empresa.id },
    data: { senhaHash: hash },
  });
  await prisma.sessao.deleteMany({ where: { usuario: { empresaId: empresa.id } } });

  await prisma.auditoria.create({
    data: {
      empresaId: empresa.id,
      acao: "superadmin.resetar-senhas",
      detalhe: `Senhas de ${usuariosAtualizados.count} usuário(s) redefinidas pelo Super Admin.`,
      usuarioNome: "Super Admin",
    },
  });

  return NextResponse.json({
    ok: true,
    mensagem: `Senhas de ${usuariosAtualizados.count} usuário(s) da empresa "${empresa.nome}" redefinidas. Sessões encerradas.`,
  });
});

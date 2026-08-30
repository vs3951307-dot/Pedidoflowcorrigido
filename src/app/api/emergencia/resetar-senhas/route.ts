import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { autorizarEmergencia } from "@/lib/emergencia-guard";
import { verificarLimite, ipDaRequisicao } from "@/lib/rate-limit";

/**
 * POST /api/emergencia/resetar-senhas
 *
 * Reset de senha de UM usuário, para destravar um acesso perdido.
 * Só existe quando `EMERGENCIA_HABILITADA=1` (ver `lib/emergencia-guard.ts`).
 *
 * MUDANÇAS EM RELAÇÃO À VERSÃO ANTERIOR (correção de falha crítica):
 *
 * - Não há mais token padrão no código. Sem `EMERGENCIA_TOKEN` forte,
 *   a rota responde 404.
 * - O reset era `updateMany` SEM `where`: trocava a senha de TODOS os
 *   usuários de TODAS as empresas e de TODOS os Super Admins de uma vez.
 *   Agora exige o e-mail do usuário e afeta exatamente uma conta.
 * - Super Admin não é mais alcançável por aqui. Para isso existe o script
 *   `npm run db:resetar-senha-super-admin`, que roda no servidor, com
 *   acesso ao banco — não pela internet pública.
 * - Só as sessões DAQUELE usuário são invalidadas.
 *
 * Body: { token: string, email: string, senha: string }
 */
export const POST = comTratamentoDeErro("emergencia.resetar-senhas.POST", async (req: NextRequest) => {
  const limite = verificarLimite({ chave: `emergencia:${ipDaRequisicao(req)}`, maximo: 5, janelaMs: 60 * 60_000 });
  if (!limite.permitido) {
    return NextResponse.json({ erro: "Muitas tentativas." }, { status: 429 });
  }

  const corpo = await req.json().catch(() => ({}) as Record<string, unknown>);
  const guard = autorizarEmergencia((corpo as Record<string, unknown>).token);
  if (!guard.ok) return guard.resposta;

  const email = String((corpo as Record<string, unknown>).email ?? "").trim().toLowerCase();
  const senha = String((corpo as Record<string, unknown>).senha ?? "").trim();

  if (!email) {
    return NextResponse.json({ erro: "Informe o e-mail do usuário a resetar." }, { status: 400 });
  }
  if (senha.length < 12) {
    return NextResponse.json({ erro: "A senha deve ter pelo menos 12 caracteres." }, { status: 400 });
  }

  const usuario = await prisma.usuario.findUnique({ where: { email }, select: { id: true, empresaId: true } });
  if (!usuario) {
    // Resposta idêntica ao sucesso seria mentira; 404 aqui é aceitável
    // porque quem chegou até este ponto já provou posse do token forte.
    return NextResponse.json({ erro: "Usuário não encontrado." }, { status: 404 });
  }

  const hash = bcrypt.hashSync(senha, 12);
  await prisma.usuario.update({ where: { id: usuario.id }, data: { senhaHash: hash } });
  await prisma.sessao.deleteMany({ where: { usuarioId: usuario.id } });

  console.warn("[emergencia] senha resetada", { email, empresaId: usuario.empresaId });

  return NextResponse.json({ ok: true, mensagem: `Senha de ${email} redefinida. Sessões encerradas.` });
});

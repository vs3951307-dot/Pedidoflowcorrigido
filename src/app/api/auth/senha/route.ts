import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessaoValida, verificarSenha, encerrarSessoesDoUsuario, criarSessao } from "@/lib/auth";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { registrarAuditoria } from "@/lib/acesso";
import { verificarLimite } from "@/lib/rate-limit";
import bcrypt from "bcryptjs";

/**
 * PATCH /api/auth/senha — o próprio usuário troca a própria senha
 * (qualquer papel: Administrador, Caixa, Garçom, Cozinha, Entregador).
 * Diferente de `PATCH /api/usuarios/[id]` (que exige a permissão
 * "usuarios" e é usado pelo Administrador para gerenciar a equipe) —
 * esta rota não exige nenhuma permissão especial, só uma sessão válida
 * e a senha ATUAL correta.
 *
 * Por segurança, encerra as demais sessões abertas (outros
 * dispositivos precisam entrar de novo com a senha nova) e já emite uma
 * sessão nova para este dispositivo continuar logado.
 */
export const PATCH = comTratamentoDeErro("auth.senha.PATCH", async (req: NextRequest) => {
  const usuario = await sessaoValida();
  if (!usuario) {
    return NextResponse.json({ erro: "Sessão inválida ou expirada. Entre novamente." }, { status: 401 });
  }

  const limite = verificarLimite({ chave: `senha:${usuario.id}`, maximo: 5, janelaMs: 60_000 });
  if (!limite.permitido) {
    return NextResponse.json(
      { erro: "Muitas tentativas. Tente novamente em instantes." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limite.reiniciaEm / 1000)) } }
    );
  }

  const corpo = await req.json().catch(() => ({}));
  const senhaAtual = String(corpo.senhaAtual ?? "");
  const novaSenha = String(corpo.novaSenha ?? "");

  if (!senhaAtual) {
    return NextResponse.json({ erro: "Informe a senha atual." }, { status: 400 });
  }
  if (novaSenha.length < 8) {
    return NextResponse.json({ erro: "A nova senha deve ter pelo menos 8 caracteres." }, { status: 400 });
  }

  const senhaCorreta = await verificarSenha(senhaAtual, usuario.senhaHash);
  if (!senhaCorreta) {
    return NextResponse.json({ erro: "Senha atual incorreta." }, { status: 401 });
  }

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { senhaHash: bcrypt.hashSync(novaSenha, 12) },
  });
  await registrarAuditoria("senha_alterada_pelo_usuario", usuario.nome, usuario, undefined, usuario.empresaId);

  // Revoga todas as sessões (inclusive esta) e já abre uma nova para
  // este dispositivo continuar sem precisar digitar a senha de novo.
  await encerrarSessoesDoUsuario(usuario.id);
  const novoToken = await criarSessao(usuario.id, req.headers.get("user-agent") ?? undefined);

  const resposta = NextResponse.json({ ok: true });
  resposta.cookies.set("sessao", novoToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return resposta;
});

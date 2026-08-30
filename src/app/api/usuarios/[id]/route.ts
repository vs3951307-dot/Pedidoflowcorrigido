import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { comTratamentoDeErro } from "@/lib/api-erro";
import { prisma } from "@/lib/prisma";
import { encerrarSessoesDoUsuario } from "@/lib/auth";
import { autorizar, ehPapelValido, registrarAuditoria, ROTULOS_PAPEL } from "@/lib/acesso";
import { verificarLimiteUsuarios } from "@/lib/limites-plano";

/**
 * Atualiza usuário: nome, e-mail, papel, ativo (ativar/desativar) e senha.
 * Regras: ninguém pode desativar a si mesmo; desativar revoga as sessões
 * abertas; troca de senha também revoga sessões. Só é possível alterar
 * usuários DA MESMA EMPRESA.
 */
async function PATCHTenant(req: NextRequest, { params }: { params: { id: string } }) {
  const acesso = await autorizar("usuarios");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const corpo = await req.json().catch(() => ({}));
  const alvo = await prisma.usuario.findFirst({ where: { id: params.id, empresaId } });
  if (!alvo) {
    return NextResponse.json({ erro: "Usuário não encontrado." }, { status: 404 });
  }

  const dados: Record<string, unknown> = {};
  if (typeof corpo.nome === "string" && corpo.nome.trim()) dados.nome = corpo.nome.trim();
  if (typeof corpo.email === "string" && corpo.email.trim()) {
    const email = String(corpo.email).trim().toLowerCase();
    // E-mail único na plataforma inteira (ver nota em POST /api/usuarios).
    const outro = await prisma.usuario.findFirst({ where: { email, empresaId: { not: empresaId } } });
    if (outro) {
      return NextResponse.json({ erro: "Já existe um usuário com este e-mail." }, { status: 409 });
    }
    dados.email = email;
  }
  if (typeof corpo.papel === "string") {
    if (!ehPapelValido(corpo.papel)) {
      return NextResponse.json({ erro: "Papel inválido." }, { status: 400 });
    }
    dados.papel = corpo.papel;
  }

  const mudouAtivo = typeof corpo.ativo === "boolean" && corpo.ativo !== alvo.ativo;
  if (typeof corpo.ativo === "boolean") {
    if (corpo.ativo === false && acesso.usuario.id === alvo.id) {
      return NextResponse.json(
        { erro: "Você não pode desativar o próprio usuário." },
        { status: 409 }
      );
    }
    // PEDIDO 35 (mesmo princípio): reativar um usuário desativado
    // também precisa respeitar o limite do plano — senão dava pra
    // furar o limite de criação simplesmente reativando em vez de
    // criar um novo.
    if (corpo.ativo === true && !alvo.ativo) {
      const limite = await verificarLimiteUsuarios(empresaId);
      if (!limite.permitido) {
        return NextResponse.json(
          {
            erro: `Limite de ${limite.limite} usuário(s) do seu plano atingido. Desative outro usuário ou fale com o suporte para ampliar o plano.`,
          },
          { status: 402 }
        );
      }
    }
    dados.ativo = corpo.ativo;
  }

  const novaSenha = typeof corpo.senha === "string" ? corpo.senha.trim() : "";
  if (novaSenha) {
    if (novaSenha.length < 8) {
      return NextResponse.json(
        { erro: "A nova senha deve ter pelo menos 8 caracteres." },
        { status: 400 }
      );
    }
    dados.senhaHash = bcrypt.hashSync(novaSenha, 12);
  }

  const atualizado = await prisma.usuario.update({ where: { id: alvo.id }, data: dados });

  if (mudouAtivo) {
    await encerrarSessoesDoUsuario(alvo.id);
    await registrarAuditoria(
      corpo.ativo === false ? "usuario_desativado" : "usuario_ativado",
      `${alvo.nome} (${alvo.email})`,
      acesso.usuario,
      undefined,
      empresaId
    );
  } else if (novaSenha) {
    await encerrarSessoesDoUsuario(alvo.id);
    await registrarAuditoria("senha_alterada", `Senha de ${alvo.nome} redefinida`, acesso.usuario, undefined, empresaId);
  } else {
    await registrarAuditoria(
      "usuario_atualizado",
      `${alvo.nome}: ${Object.keys(dados).join(", ") || "sem mudanças"}`,
      acesso.usuario,
      undefined,
      empresaId
    );
  }

  return NextResponse.json({
    ok: true,
    usuario: {
      id: atualizado.id,
      nome: atualizado.nome,
      email: atualizado.email,
      papel: atualizado.papel,
      ativo: atualizado.ativo,
    },
  });
}

/** Remove o usuário (as sessões são apagadas em cascata). Só da mesma empresa. */
async function DELETETenant(_req: NextRequest, { params }: { params: { id: string } }) {
  const acesso = await autorizar("usuarios");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  if (acesso.usuario.id === params.id) {
    return NextResponse.json(
      { erro: "Você não pode excluir o próprio usuário." },
      { status: 409 }
    );
  }

  const alvo = await prisma.usuario.findFirst({ where: { id: params.id, empresaId } });
  if (!alvo) {
    return NextResponse.json({ erro: "Usuário não encontrado." }, { status: 404 });
  }

  await prisma.usuario.delete({ where: { id: alvo.id } });
  await registrarAuditoria("usuario_excluido", `${alvo.nome} (${alvo.email})`, acesso.usuario, undefined, empresaId);
  return NextResponse.json({ ok: true });
}

export const PATCH = comTratamentoDeErro("usuarios.id.PATCH", PATCHTenant);
export const DELETE = comTratamentoDeErro("usuarios.id.DELETE", DELETETenant);

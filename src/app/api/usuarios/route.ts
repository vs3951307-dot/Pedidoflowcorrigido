import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { comTratamentoDeErro } from "@/lib/api-erro";
import { prisma } from "@/lib/prisma";
import { autorizar, registrarAuditoria, ROTULOS_PAPEL, usuarioSeguro } from "@/lib/acesso";
import { validarCorpo } from "@/lib/validar";
import { usuarioCriarSchema } from "@/lib/schemas/admin";
import { verificarLimiteUsuarios } from "@/lib/limites-plano";

async function GETTenant() {
  const acesso = await autorizar("usuarios");
  if (!acesso.ok) return acesso.resposta;

  const usuarios = await prisma.usuario.findMany({
    where: { empresaId: acesso.empresaId },
    include: { permissaos: true },
    orderBy: { nome: "asc" },
  });
  return NextResponse.json({
    usuarios: usuarios.map((u) => ({
      ...usuarioSeguro(u),
      ultimoAcesso: u.ultimoAcesso ? u.ultimoAcesso.toISOString() : null,
      permissaos: u.permissaos.map((p) => ({ recurso: p.recurso, permitido: p.permitido })),
    })),
  });
}

async function POSTTenant(req: NextRequest) {
  const acesso = await autorizar("usuarios");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const corpoBruto = await req.json().catch(() => ({}));
  const validado = validarCorpo(usuarioCriarSchema, corpoBruto);
  if (!validado.ok) return validado.resposta;
  const corpo = validado.dados;
  const nome = corpo.nome;
  const email = corpo.email;
  const senha = corpo.senha;
  const papel = corpo.papel;

  // E-mail é único NA PLATAFORMA INTEIRA (decisão de arquitetura: um
  // usuário sempre pertence a uma única empresa, e isso mantém o login
  // simples sem exigir subdomínio/slug da empresa).
  const existente = await prisma.usuario.findUnique({ where: { email } });
  if (existente) {
    return NextResponse.json({ erro: "Já existe um usuário com este e-mail." }, { status: 409 });
  }

  // PEDIDO 35: limite do plano — antes não existia checagem nenhuma
  // aqui, o número cadastrado no plano nunca era de fato aplicado.
  const limite = await verificarLimiteUsuarios(empresaId);
  if (!limite.permitido) {
    return NextResponse.json(
      {
        erro: `Limite de ${limite.limite} usuário(s) do seu plano atingido. Desative um usuário existente ou fale com o suporte para ampliar o plano.`,
      },
      { status: 402 }
    );
  }

  if (!senha || typeof senha !== "string" || senha.length < 8) {
    return NextResponse.json(
      { erro: "A senha deve ter pelo menos 8 caracteres." },
      { status: 400 }
    );
  }

  const usuario = await prisma.usuario.create({
    data: {
      empresaId,
      nome,
      email,
      papel,
      senhaHash: bcrypt.hashSync(senha, 12),
      ativo: corpo.ativo !== false,
    },
  });
  await registrarAuditoria(
    "usuario_criado",
    `Criado ${ROTULOS_PAPEL[papel]} "${nome}" (${email})`,
    acesso.usuario,
    undefined,
    empresaId
  );

  return NextResponse.json(
    {
      ok: true,
      usuario: { ...usuarioSeguro(usuario), ultimoAcesso: null, permissaos: [] },
    },
    { status: 201 }
  );
}

export const GET = comTratamentoDeErro("usuarios.GET", GETTenant);
export const POST = comTratamentoDeErro("usuarios.POST", POSTTenant);

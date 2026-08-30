import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizarSuperAdmin } from "@/lib/super-admin/auth";
import { validarCorpo } from "@/lib/validar";
import { planoAtualizarSchema } from "@/lib/schemas/superadmin";
import { ehModuloValido, serializarModulos } from "@/lib/modulos";
import { comTratamentoDeErro } from "@/lib/api-erro";

export const PATCH = comTratamentoDeErro("superadmin.planos.id.PATCH", async (req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizarSuperAdmin();
  if (!acesso.ok) return acesso.resposta;

  const existente = await prisma.plano.findUnique({ where: { id: params.id } });
  if (!existente) {
    return NextResponse.json({ erro: "Plano não encontrado." }, { status: 404 });
  }

  const corpoBruto = await req.json().catch(() => ({}));
  const validado = validarCorpo(planoAtualizarSchema, corpoBruto);
  if (!validado.ok) return validado.resposta;
  const dados = validado.dados;

  const atualizacao: Record<string, unknown> = {};
  if (dados.nome !== undefined) atualizacao.nome = dados.nome;
  if (dados.preco !== undefined) atualizacao.preco = dados.preco;
  if (dados.descricao !== undefined) atualizacao.descricao = dados.descricao;
  if (dados.modulosPadrao !== undefined) {
    atualizacao.modulosPadrao = serializarModulos(dados.modulosPadrao.filter(ehModuloValido));
  }
  if (dados.limiteUsuarios !== undefined) atualizacao.limiteUsuarios = dados.limiteUsuarios;
  if (dados.limiteMensagensIA !== undefined) atualizacao.limiteMensagensIA = dados.limiteMensagensIA;
  if (dados.limiteProdutos !== undefined) atualizacao.limiteProdutos = dados.limiteProdutos;
  if (dados.iaIncluida !== undefined) atualizacao.iaIncluida = dados.iaIncluida;
  if (dados.ordem !== undefined) atualizacao.ordem = dados.ordem;
  if (dados.ativo !== undefined) atualizacao.ativo = dados.ativo;

  const atualizado = await prisma.plano.update({ where: { id: existente.id }, data: atualizacao });
  return NextResponse.json({ ok: true, plano: { id: atualizado.id, nome: atualizado.nome, ativo: atualizado.ativo } });
});

/** Desativa o plano (soft — empresas já vinculadas continuam funcionando normalmente). */
export const DELETE = comTratamentoDeErro("superadmin.planos.id.DELETE", async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizarSuperAdmin();
  if (!acesso.ok) return acesso.resposta;

  const existente = await prisma.plano.findUnique({ where: { id: params.id } });
  if (!existente) {
    return NextResponse.json({ erro: "Plano não encontrado." }, { status: 404 });
  }
  await prisma.plano.update({ where: { id: existente.id }, data: { ativo: false } });
  return NextResponse.json({ ok: true });
});

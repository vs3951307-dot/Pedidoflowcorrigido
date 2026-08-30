import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizarSuperAdmin } from "@/lib/super-admin/auth";
import { validarCorpo } from "@/lib/validar";
import { planoCriarSchema } from "@/lib/schemas/superadmin";
import { ehModuloValido, parseModulos, serializarModulos } from "@/lib/modulos";
import { comTratamentoDeErro } from "@/lib/api-erro";

/**
 * Planos comerciais da plataforma (PEDIDO 13/1: "preços, nomes e módulos
 * NÃO podem ficar fixos no código... quero editar tudo pelo Super
 * Admin"). Os valores de R$119,90/249,90/399,90 citados no briefing só
 * existem como carga inicial do seed — a partir daqui, tudo é editável
 * por aqui.
 */
export const GET = comTratamentoDeErro("superadmin.planos.GET", async () => {
  const acesso = await autorizarSuperAdmin();
  if (!acesso.ok) return acesso.resposta;

  const planos = await prisma.plano.findMany({
    orderBy: { ordem: "asc" },
    include: { _count: { select: { empresas: true } } },
  });

  return NextResponse.json({
    planos: planos.map((p) => ({
      id: p.id,
      nome: p.nome,
      slug: p.slug,
      preco: p.preco,
      moeda: p.moeda,
      descricao: p.descricao,
      modulosPadrao: parseModulos(p.modulosPadrao),
      limiteUsuarios: p.limiteUsuarios,
      limiteMensagensIA: p.limiteMensagensIA,
      limiteProdutos: p.limiteProdutos,
      iaIncluida: p.iaIncluida,
      ordem: p.ordem,
      ativo: p.ativo,
      empresasVinculadas: p._count.empresas,
    })),
  });
});

export const POST = comTratamentoDeErro("superadmin.planos.POST", async (req: NextRequest) => {
  const acesso = await autorizarSuperAdmin();
  if (!acesso.ok) return acesso.resposta;

  const corpoBruto = await req.json().catch(() => ({}));
  const validado = validarCorpo(planoCriarSchema, corpoBruto);
  if (!validado.ok) return validado.resposta;
  const dados = validado.dados;

  const existente = await prisma.plano.findUnique({ where: { slug: dados.slug } });
  if (existente) {
    return NextResponse.json({ erro: "Já existe um plano com este identificador (slug)." }, { status: 409 });
  }

  const plano = await prisma.plano.create({
    data: {
      nome: dados.nome,
      slug: dados.slug,
      preco: dados.preco,
      descricao: dados.descricao,
      modulosPadrao: serializarModulos(dados.modulosPadrao.filter(ehModuloValido)),
      limiteUsuarios: dados.limiteUsuarios ?? null,
      limiteMensagensIA: dados.limiteMensagensIA ?? null,
      limiteProdutos: dados.limiteProdutos ?? null,
      iaIncluida: dados.iaIncluida,
      ordem: dados.ordem,
    },
  });

  return NextResponse.json({ ok: true, plano: { id: plano.id, nome: plano.nome, slug: plano.slug } }, { status: 201 });
});

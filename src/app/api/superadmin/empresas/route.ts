import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { prisma, plataformaPrisma } from "@/lib/prisma";
import { autorizarSuperAdmin } from "@/lib/super-admin/auth";
import { validarCorpo } from "@/lib/validar";
import { empresaCriarSchema } from "@/lib/schemas/superadmin";
import { ehModuloValido, modulosPadraoDoPlano, serializarModulos, parseModulos } from "@/lib/modulos";
import { nomeSchemaDoSlug } from "@/lib/tenant-db";
import { provisionarSchemaEmpresa } from "@/lib/tenant-provisionamento";
import { criptografarSegredo, mascararSegredo } from "@/lib/crypto-segredos";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { situacaoAssinatura } from "@/lib/assinatura";

/** Lista todas as empresas da plataforma (painel Super Admin). */
export const GET = comTratamentoDeErro("superadmin.empresas.GET", async () => {
  const acesso = await autorizarSuperAdmin();
  if (!acesso.ok) return acesso.resposta;

  const empresas = await prisma.empresa.findMany({
    where: { status: { not: "excluida" } },
    orderBy: { criadoEm: "desc" },
    include: { planoAtual: true, _count: { select: { usuarios: true } } },
  });

  return NextResponse.json({
    empresas: empresas.map((e) => ({
      id: e.id,
      nome: e.nome,
      slug: e.slug,
      status: e.status,
      plano: e.planoAtual?.nome ?? e.plano,
      planoCodigo: e.plano,
      planoId: e.planoId,
      modulos: parseModulos(e.modulos),
      trialFimEm: e.trialFimEm,
      vencimentoEm: e.vencimentoEm,
      carenciaAte: e.carenciaAte,
      situacaoAssinatura: situacaoAssinatura(e).estado,
      diasRestantesCarencia: situacaoAssinatura(e).diasRestantesCarencia,
      ultimaAtividadeEm: e.ultimaAtividadeEm,
      criadoEm: e.criadoEm,
      usuarios: e._count.usuarios,
      schemaBanco: e.schemaBanco,
      bancoDedicado: Boolean(e.databaseUrlSecreta),
      usoIAMesAtual: e.usoIAMesAtual,
      limiteMensagensIA: e.limiteMensagensIA ?? e.planoAtual?.limiteMensagensIA ?? null,
    })),
  });
});

/**
 * Cadastra uma nova empresa (tenant) + seu primeiro Administrador.
 *
 * Isolamento estrutural: antes de criar o registro da empresa, PROVISIONA
 * um schema PostgreSQL dedicado (`tenant_<slug>`) com todas as tabelas de
 * dados operacionais (pedidos, clientes, caixa, estoque, WhatsApp, fiscal
 * etc.) — ver `scripts/provisionar-schema-empresa.ts`. `Empresa` e o
 * primeiro `Usuario` (administrador) continuam no schema da plataforma
 * (`public`) — ver a nota de arquitetura em `src/lib/prisma.ts`.
 */
export const POST = comTratamentoDeErro("superadmin.empresas.POST", async (req: NextRequest) => {
  const acesso = await autorizarSuperAdmin();
  if (!acesso.ok) return acesso.resposta;

  const corpoBruto = await req.json().catch(() => ({}));
  const validado = validarCorpo(empresaCriarSchema, corpoBruto);
  if (!validado.ok) return validado.resposta;
  const dados = validado.dados;

  const slugExistente = await prisma.empresa.findFirst({ where: { slug: dados.slug, status: { not: "excluida" } } });
  if (slugExistente) {
    return NextResponse.json({ erro: "Já existe uma empresa com este identificador (slug)." }, { status: 409 });
  }
  const emailExistente = await prisma.usuario.findUnique({ where: { email: dados.adminEmail } });
  if (emailExistente) {
    return NextResponse.json({ erro: "Já existe um usuário com este e-mail na plataforma." }, { status: 409 });
  }

  let plano = null as Awaited<ReturnType<typeof plataformaPrisma.plano.findUnique>>;
  if (dados.planoId) {
    plano = await prisma.plano.findUnique({ where: { id: dados.planoId } });
    if (!plano || !plano.ativo) {
      return NextResponse.json({ erro: "Plano inválido ou inativo." }, { status: 400 });
    }
  }

  const modulosValidos = (
    dados.modulos ?? (plano ? parseModulos(plano.modulosPadrao) : modulosPadraoDoPlano(dados.plano))
  ).filter(ehModuloValido);
  const trialFimEm =
    dados.trialDias !== undefined ? new Date(Date.now() + dados.trialDias * 24 * 60 * 60 * 1000) : null;

  const schemaBanco = nomeSchemaDoSlug(dados.slug);
  const databaseUrlSecreta = dados.databaseUrlDedicada ? criptografarSegredo(dados.databaseUrlDedicada) : null;

  // 1) Provisiona a estrutura de dados ANTES de criar o registro da
  //    empresa — se falhar aqui, nada foi persistido ainda.
  try {
    // DDL (CREATE SCHEMA/TABLE) prefere a conexão DIRETA quando o
    // provedor usa pooler (Neon/Supabase) — ver DIRECT_URL no .env.
    const urlDestino = dados.databaseUrlDedicada ?? process.env.DIRECT_URL ?? process.env.DATABASE_URL!;
    await provisionarSchemaEmpresa(urlDestino, schemaBanco, { dedicado: Boolean(dados.databaseUrlDedicada) });
  } catch (erro) {
    console.error("Falha ao provisionar schema da nova empresa:", erro);
    return NextResponse.json(
      {
        erro:
          "Não foi possível provisionar o banco de dados da empresa. Nenhum dado foi criado. Verifique a conexão com o PostgreSQL e tente novamente.",
      },
      { status: 500 }
    );
  }

  // 2) Cria Empresa + Administrador (ambos na plataforma) numa única
  //    transação — não toca no schema do tenant recém-provisionado
  //    (a primeira escrita ali acontece no primeiro acesso normal, via
  //    autorizar()/ativarTenant()).
  const resultado = await prisma.$transaction(async (tx) => {
    const empresa = await tx.empresa.create({
      data: {
        nome: dados.nome,
        slug: dados.slug,
        plano: dados.plano,
        planoId: plano?.id,
        modulos: serializarModulos(modulosValidos),
        status: "teste",
        trialFimEm,
        planoInicioEm: new Date(),
        schemaBanco,
        databaseUrlSecreta,
        limiteMensagensIA: plano?.limiteMensagensIA ?? null,
      },
    });
    const administrador = await tx.usuario.create({
      data: {
        empresaId: empresa.id,
        nome: dados.adminNome,
        email: dados.adminEmail,
        papel: "ADMINISTRADOR",
        senhaHash: bcrypt.hashSync(dados.adminSenha, 12),
        ativo: true,
      },
    });
    return { empresa, administrador };
  }, { timeout: 30_000 });

  return NextResponse.json(
    {
      ok: true,
      empresa: {
        id: resultado.empresa.id,
        nome: resultado.empresa.nome,
        slug: resultado.empresa.slug,
        status: resultado.empresa.status,
        plano: resultado.empresa.plano,
        schemaBanco: resultado.empresa.schemaBanco,
        bancoDedicado: Boolean(dados.databaseUrlDedicada),
        databaseUrlMascarada: dados.databaseUrlDedicada ? mascararSegredo(dados.databaseUrlDedicada, 6) : null,
      },
      administrador: { id: resultado.administrador.id, email: resultado.administrador.email },
    },
    { status: 201 }
  );
});

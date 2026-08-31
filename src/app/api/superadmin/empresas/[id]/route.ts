import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizarSuperAdmin, registrarAuditoriaSuperAdmin } from "@/lib/super-admin/auth";
import { validarCorpo } from "@/lib/validar";
import { empresaAtualizarSchema } from "@/lib/schemas/superadmin";
import { ehModuloValido, parseModulos, serializarModulos } from "@/lib/modulos";
import { parseTema, parseTextos, parseMenuConfig, serializarTema, serializarTextos, serializarMenuConfig } from "@/lib/system-builder";
import { invalidarClienteTenant } from "@/lib/tenant-db";
import { gerarBackupCompleto } from "@/lib/backup";
import { mascararSegredo } from "@/lib/crypto-segredos";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { calcularCarenciaAte } from "@/lib/assinatura";

/** Detalhe de uma empresa (painel Super Admin). */
export const GET = comTratamentoDeErro("superadmin.empresas.id.GET", async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizarSuperAdmin();
  if (!acesso.ok) return acesso.resposta;

  const empresa = await prisma.empresa.findUnique({
    where: { id: params.id },
    include: {
      planoAtual: true,
      usuarios: { select: { id: true, nome: true, email: true, papel: true, ativo: true, ultimoAcesso: true } },
      _count: { select: { pedidos: true, clientes: true } },
    },
  });
  if (!empresa) {
    return NextResponse.json({ erro: "Empresa não encontrada." }, { status: 404 });
  }

  return NextResponse.json({
    empresa: {
      id: empresa.id,
      nome: empresa.nome,
      slug: empresa.slug,
      razaoSocial: empresa.razaoSocial,
      cnpj: empresa.cnpj,
      telefone: empresa.telefone,
      email: empresa.email,
      status: empresa.status,
      plano: empresa.plano,
      planoId: empresa.planoId,
      planoNome: empresa.planoAtual?.nome ?? null,
      modulos: parseModulos(empresa.modulos),
      tema: parseTema(empresa.tema),
      textos: parseTextos(empresa.textos),
      menuConfig: parseMenuConfig(empresa.menuConfig),
      trialFimEm: empresa.trialFimEm,
      vencimentoEm: empresa.vencimentoEm,
      carenciaAte: empresa.carenciaAte,
      ultimaAtividadeEm: empresa.ultimaAtividadeEm,
      observacoes: empresa.observacoes,
      criadoEm: empresa.criadoEm,
      usuarios: empresa.usuarios,
      totalPedidos: empresa._count.pedidos,
      totalClientes: empresa._count.clientes,
      schemaBanco: empresa.schemaBanco,
      bancoDedicado: Boolean(empresa.databaseUrlSecreta),
      databaseUrlMascarada: empresa.databaseUrlSecreta ? mascararSegredo(empresa.databaseUrlSecreta, 6) : null,
      limiteMensagensIA: empresa.limiteMensagensIA ?? empresa.planoAtual?.limiteMensagensIA ?? null,
      usoIAMesAtual: empresa.usoIAMesAtual,
    },
  });
});

/**
 * Edita a empresa: dados cadastrais, status (ativar/bloquear/suspender),
 * plano, módulos contratados, período de teste, vencimento e
 * personalização do System Builder (tema/textos/menu).
 */
export const PATCH = comTratamentoDeErro("superadmin.empresas.id.PATCH", async (req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizarSuperAdmin();
  if (!acesso.ok) return acesso.resposta;

  const existente = await prisma.empresa.findUnique({ where: { id: params.id } });
  if (!existente) {
    return NextResponse.json({ erro: "Empresa não encontrada." }, { status: 404 });
  }

  const corpoBruto = await req.json().catch(() => ({}));
  const validado = validarCorpo(empresaAtualizarSchema, corpoBruto);
  if (!validado.ok) return validado.resposta;
  const dados = validado.dados;

  // CORREÇÃO (PEDIDO 71): "excluida" (arquivamento) NUNCA passa por
  // aqui — só pelo `DELETE /api/superadmin/empresas/[id]`, que exige
  // confirmação do nome da empresa E gera um backup automático antes.
  // Antes, esta rota PATCH aceitava `{status: "excluida"}` como
  // qualquer outra mudança de status — um clique num dropdown
  // arquivava a empresa sem confirmação nenhuma e sem backup, driblando
  // toda a proteção que existe no DELETE.
  if (dados.status === "excluida" && existente.status !== "excluida") {
    return NextResponse.json(
      { erro: 'Para arquivar uma empresa, use a ação "Arquivar" (exige confirmação do nome e gera backup automático) — não é permitido pelo PATCH de status.' },
      { status: 400 }
    );
  }

  if (dados.planoId) {
    const plano = await prisma.plano.findUnique({ where: { id: dados.planoId } });
    if (!plano || !plano.ativo) {
      return NextResponse.json({ erro: "Plano inválido ou inativo." }, { status: 400 });
    }
  }

  const atualizacao: Record<string, unknown> = {};
  if (dados.nome !== undefined) atualizacao.nome = dados.nome;
  if (dados.slug !== undefined) {
    const slugExistente = await prisma.empresa.findFirst({ where: { slug: dados.slug, id: { not: existente.id } } });
    if (slugExistente) {
      return NextResponse.json({ erro: `O slug "${dados.slug}" já está em uso por outra empresa.` }, { status: 400 });
    }
    atualizacao.slug = dados.slug;
  }
  if (dados.status !== undefined) atualizacao.status = dados.status;
  if (dados.plano !== undefined) atualizacao.plano = dados.plano;
  if (dados.planoId !== undefined) atualizacao.planoId = dados.planoId;
  if (dados.modulos !== undefined) {
    atualizacao.modulos = serializarModulos(dados.modulos.filter(ehModuloValido));
  }
  if (dados.trialFimEm !== undefined) atualizacao.trialFimEm = dados.trialFimEm ? new Date(dados.trialFimEm + "T23:59:59.000Z") : null;
  if (dados.vencimentoEm !== undefined) atualizacao.vencimentoEm = dados.vencimentoEm ? new Date(dados.vencimentoEm + "T23:59:59.000Z") : null;
  // CARÊNCIA: quando o vencimento muda via painel, recalcula
  // automaticamente a `carenciaAte` (vencimento + 7 dias corr.) a menos
  // que o Super Admin informe um valor explícito. Garante que uma edição
  // de vencimento não deixe a carência dessincronizada.
  if (dados.carenciaAte !== undefined) {
    atualizacao.carenciaAte = dados.carenciaAte ? new Date(dados.carenciaAte + "T23:59:59.000Z") : null;
  } else if (dados.vencimentoEm !== undefined) {
    const novo = dados.vencimentoEm ? new Date(dados.vencimentoEm + "T23:59:59.000Z") : null;
    atualizacao.carenciaAte = calcularCarenciaAte(novo);
  }
  if (dados.observacoes !== undefined) atualizacao.observacoes = dados.observacoes;
  if (dados.razaoSocial !== undefined) atualizacao.razaoSocial = dados.razaoSocial;
  if (dados.cnpj !== undefined) atualizacao.cnpj = dados.cnpj;
  if (dados.telefone !== undefined) atualizacao.telefone = dados.telefone;
  if (dados.email !== undefined) atualizacao.email = dados.email;
  if (dados.limiteMensagensIA !== undefined) atualizacao.limiteMensagensIA = dados.limiteMensagensIA;
  if (dados.tema !== undefined) {
    atualizacao.tema = serializarTema({ ...parseTema(existente.tema), ...dados.tema });
  }
  if (dados.textos !== undefined) {
    atualizacao.textos = serializarTextos({ ...parseTextos(existente.textos), ...dados.textos });
  }
  if (dados.menuConfig !== undefined) {
    atualizacao.menuConfig = serializarMenuConfig(dados.menuConfig);
  }

  const atualizada = await prisma.empresa.update({ where: { id: existente.id }, data: atualizacao });

  // Auditoria com ANTES/DEPOIS para as mudanças de assinatura/status/
  // plano/vencimento — o Super Admin vê exatamente o que mudou.
  const camposSensiveis = ["status", "plano", "planoId", "modulos", "vencimentoEm", "carenciaAte", "trialFimEm", "limiteMensagensIA"];
  const estadoAnterior: Record<string, unknown> = {};
  const estadoNovo: Record<string, unknown> = {};
  for (const campo of camposSensiveis) {
    const antes = (existente as Record<string, unknown>)[campo];
    const depois = (atualizada as Record<string, unknown>)[campo];
    if (JSON.stringify(antes) !== JSON.stringify(depois)) {
      estadoAnterior[campo] = antes ?? null;
      estadoNovo[campo] = depois ?? null;
    }
  }
  await registrarAuditoriaSuperAdmin(
    "empresa_editada",
    `Super Admin ${acesso.superAdmin.nome} editou a empresa "${existente.nome}"`,
    acesso.superAdmin.id,
    { estadoAnterior, estadoNovo, empresaId: existente.id }
  );

  return NextResponse.json({
    ok: true,
    empresa: {
      id: atualizada.id,
      nome: atualizada.nome,
      status: atualizada.status,
      plano: atualizada.plano,
      planoId: atualizada.planoId,
      modulos: parseModulos(atualizada.modulos),
      tema: parseTema(atualizada.tema),
      textos: parseTextos(atualizada.textos),
      menuConfig: parseMenuConfig(atualizada.menuConfig),
    },
  });
});

/**
 * "Exclusão" de empresa: SEMPRE soft-delete (status = "excluida").
 * Nunca apaga os dados de fato (nem o schema do tenant) — evita perda
 * acidental e mantém o histórico para auditoria/recuperação. Bloqueia
 * login imediatamente (ver STATUS_EMPRESA_ATIVOS em src/lib/auth.ts).
 */
/**
 * DELETE /api/superadmin/empresas/[id] — ARQUIVA a empresa (nunca apaga
 * dados de verdade — ver PEDIDO 71: "definir claramente DESATIVAR/
 * ARQUIVAR versus APAGAR DEFINITIVAMENTE. Não deixar schema tenant
 * órfão sem saber."). Este endpoint deliberadamente só implementa o
 * caminho ARQUIVAR (`status: "excluida"`, reversível via PATCH) — uma
 * exclusão física definitiva não foi implementada, por ser irreversível
 * e eu não ter como testar contra um banco real; arquivar é seguro por
 * padrão e cobre o caso de uso real ("parar de cobrar/usar", não
 * "apagar para sempre").
 *
 * CORREÇÃO (PEDIDO 71 — "antes de destruição: backup/export
 * obrigatório ou confirmação forte"): antes, um único clique (sem
 * corpo, sem confirmação) já arquivava a empresa, sem backup nenhum
 * antes. Agora exige:
 *   1) `confirmarNome` no corpo, batendo EXATAMENTE com o nome
 *      cadastrado da empresa (evita arquivar a empresa errada por
 *      clique duplo/engano);
 *   2) gera um backup completo automaticamente ANTES de arquivar — se
 *      o backup falhar, a operação é abortada (nunca arquiva sem ter
 *      uma cópia de segurança recente).
 */
export const DELETE = comTratamentoDeErro("superadmin.empresas.id.DELETE", async (req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizarSuperAdmin();
  if (!acesso.ok) return acesso.resposta;

  const existente = await prisma.empresa.findUnique({ where: { id: params.id } });
  if (!existente) {
    return NextResponse.json({ erro: "Empresa não encontrada." }, { status: 404 });
  }

  const corpo = await req.json().catch(() => ({}));
  const confirmarNome = String(corpo.confirmarNome ?? "").trim();
  if (confirmarNome !== existente.nome) {
    return NextResponse.json(
      { erro: `Confirmação inválida — digite exatamente "${existente.nome}" para arquivar esta empresa.` },
      { status: 400 }
    );
  }

  const backup = await gerarBackupCompleto(existente.id, "automatico");
  if (!backup.ok) {
    return NextResponse.json(
      { erro: `Arquivamento cancelado: não foi possível gerar o backup de segurança antes (${backup.erro}).` },
      { status: 500 }
    );
  }

  await prisma.empresa.update({ where: { id: existente.id }, data: { status: "excluida" } });
  // Revoga todas as sessões ativas da empresa imediatamente.
  await prisma.sessao.deleteMany({ where: { usuario: { empresaId: existente.id } } });
  // Fecha a conexão de banco em cache desta empresa (não deixa
  // conexões penduradas para um tenant desativado).
  await invalidarClienteTenant(existente.id);

  await prisma.auditoria
    .create({
      data: {
        acao: "empresa_arquivada",
        detalhe: `Empresa "${existente.nome}" arquivada por Super Admin ${acesso.superAdmin.nome} — backup ${backup.backupId} gerado antes`,
        empresaId: existente.id,
      },
    })
    .catch(() => {});

  return NextResponse.json({ ok: true, backupId: backup.backupId });
});

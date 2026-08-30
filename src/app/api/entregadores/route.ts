import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizar, registrarAuditoria } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";

/** Entregadores cadastrados DESTA empresa (para atribuição no painel Delivery). */
export const GET = comTratamentoDeErro("entregadores.GET", async () => {
  const acesso = await autorizar("entregas", "pdv", "admin");
  if (!acesso.ok) return acesso.resposta;

  const entregadores = await prisma.entregador.findMany({
    where: { empresaId: acesso.empresaId },
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    select: { id: true, nome: true, email: true, telefone: true, ativo: true, statusHoje: true, usuarioId: true },
  });

  // Usuários com papel ENTREGADOR ainda sem cadastro de entregador
  // vinculado — é a lista que a tela usa pra "escolher a quem ligar",
  // em vez de digitar um ID de cabeça.
  const usuariosVinculados = new Set(entregadores.map((e) => e.usuarioId).filter(Boolean));
  const usuariosEntregador = await prisma.usuario.findMany({
    where: { empresaId: acesso.empresaId, papel: "ENTREGADOR", ativo: true },
    select: { id: true, nome: true, email: true },
  });

  return NextResponse.json({
    entregadores: entregadores.map((e) => ({
      id: e.id,
      nome: e.nome,
      email: e.email,
      telefone: e.telefone,
      ativo: e.ativo,
      statusHoje: e.statusHoje,
      usuarioId: e.usuarioId,
    })),
    usuariosDisponiveis: usuariosEntregador
      .filter((u) => !usuariosVinculados.has(u.id))
      .map((u) => ({ id: u.id, nome: u.nome, email: u.email })),
  });
});

/**
 * POST /api/entregadores — cadastra um entregador. Faltava por
 * completo: não existia NENHUMA forma de criar um entregador (nem tela,
 * nem API) — o que também tornava impossível testar o fluxo de QR
 * (que depende de `Entregador.usuarioId` para autorizar por ID).
 *
 * `usuarioId`, quando informado, precisa ser de um Usuario com papel
 * ENTREGADOR desta empresa e ainda sem outro entregador vinculado
 * (`@unique` no schema já impede vínculo duplicado no banco; validamos
 * aqui também pra devolver uma mensagem clara em vez de erro de banco).
 */
export const POST = comTratamentoDeErro("entregadores.POST", async (req: NextRequest) => {
  const acesso = await autorizar("admin");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const corpo = await req.json().catch(() => ({}));
  const nome = String(corpo.nome ?? "").trim();
  const email = corpo.email ? String(corpo.email).trim() : null;
  const telefone = corpo.telefone ? String(corpo.telefone).trim() : null;
  const usuarioId = corpo.usuarioId ? String(corpo.usuarioId) : null;

  if (!nome) {
    return NextResponse.json({ erro: "Informe o nome do entregador." }, { status: 400 });
  }

  if (usuarioId) {
    const usuario = await prisma.usuario.findFirst({ where: { id: usuarioId, empresaId, papel: "ENTREGADOR" } });
    if (!usuario) {
      return NextResponse.json({ erro: "Usuário inválido — precisa ter papel Entregador nesta empresa." }, { status: 400 });
    }
    const jaVinculado = await prisma.entregador.findFirst({ where: { usuarioId } });
    if (jaVinculado) {
      return NextResponse.json({ erro: "Este usuário já está vinculado a outro cadastro de entregador." }, { status: 409 });
    }
  }

  const entregador = await prisma.entregador.create({
    data: { empresaId, nome, email, telefone, usuarioId },
  });

  await registrarAuditoria("entregador_criado", nome, acesso.usuario, undefined, empresaId);
  return NextResponse.json({ ok: true, entregador }, { status: 201 });
});

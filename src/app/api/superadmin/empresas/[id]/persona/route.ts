import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { autorizarSuperAdmin } from "@/lib/super-admin/auth";
import { comTratamentoDeErro } from "@/lib/api-erro";

/**
 * GET/PUT /api/superadmin/empresas/[id]/persona
 * Gerencia a persona do WhatsApp Atendente IA e do Copiloto da Empresa
 * para qualquer empresa, diretamente do Super Admin.
 *
 * Body PUT: {
 *   tipo: "atendente" | "copiloto",
 *   nome?: string, tom?: string, regras?: string, horario?: string,
 *   apresentacao?: string (só para copiloto)
 * }
 */

const TOMS = ["simpatico", "profissional", "descontraido", "formal"];

const personaSchema = z.object({
  tipo: z.enum(["atendente", "copiloto"]),
  nome: z.string().max(80).optional(),
  tom: z.string().refine((v) => TOMS.includes(v)).optional(),
  regras: z.string().max(4000).optional(),
  horario: z.string().max(200).optional(),
  apresentacao: z.string().max(1000).optional(),
});

function configKey(tipo: string): string {
  return tipo === "atendente" ? "atendente_ia" : "copiloto_empresa";
}

export const GET = comTratamentoDeErro("superadmin.empresas.id.persona.GET", async (req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizarSuperAdmin();
  if (!acesso.ok) return acesso.resposta;

  const empresa = await prisma.empresa.findUnique({ where: { id: params.id } });
  if (!empresa) return NextResponse.json({ erro: "Empresa não encontrada." }, { status: 404 });

  const url = new URL(req.url);
  const tipo = url.searchParams.get("tipo") ?? "atendente";
  const chave = configKey(tipo);

  const config = await prisma.configuracao
    .findUnique({ where: { empresaId_chave: { empresaId: params.id, chave } } })
    .catch(() => null);

  let valor = {};
  if (config?.valor) {
    try { valor = JSON.parse(config.valor); } catch { /* ignore */ }
  }

  return NextResponse.json({ tipo, persona: valor });
});

export const PUT = comTratamentoDeErro("superadmin.empresas.id.persona.PUT", async (req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizarSuperAdmin();
  if (!acesso.ok) return acesso.resposta;

  const empresa = await prisma.empresa.findUnique({ where: { id: params.id } });
  if (!empresa) return NextResponse.json({ erro: "Empresa não encontrada." }, { status: 404 });

  const corpoBruto = await req.json().catch(() => ({}));
  const validado = personaSchema.safeParse(corpoBruto);
  if (!validado.success) {
    return NextResponse.json({ erro: validado.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const { tipo, ...dados } = validado.data;
  const chave = configKey(tipo);

  const atual: Record<string, string> = {};
  const configExistente = await prisma.configuracao
    .findUnique({ where: { empresaId_chave: { empresaId: params.id, chave } } })
    .catch(() => null);
  if (configExistente?.valor) {
    try { Object.assign(atual, JSON.parse(configExistente.valor)); } catch { /* ignore */ }
  }

  if (dados.nome !== undefined) atual.nome = dados.nome;
  if (dados.tom !== undefined) atual.tom = dados.tom;
  if (dados.regras !== undefined) atual.regras = dados.regras;
  if (dados.horario !== undefined) atual.horario = dados.horario;
  if (dados.apresentacao !== undefined) atual.apresentacao = dados.apresentacao;

  const isVazio = !atual.nome && !atual.regras && !atual.horario && !atual.apresentacao &&
    (atual.tom === "simpatico" || !atual.tom);

  if (isVazio) {
    await prisma.configuracao.deleteMany({ where: { empresaId: params.id, chave } }).catch(() => null);
  } else {
    await prisma.configuracao.upsert({
      where: { empresaId_chave: { empresaId: params.id, chave } },
      update: { valor: JSON.stringify(atual), atualizadoEm: new Date() },
      create: { empresaId: params.id, chave, valor: JSON.stringify(atual) },
    });
  }

  return NextResponse.json({ ok: true, persona: atual });
});

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizar } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";

export const GET = comTratamentoDeErro("clientes.GET", async (req: NextRequest) => {
  const acesso = await autorizar("clientes");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;
  const busca = req.nextUrl.searchParams.get("q")?.trim().toLowerCase();
  const clientes = await prisma.cliente.findMany({
    where: {
      empresaId,
      ...(busca
        ? {
            OR: [
              { nome: { contains: busca } },
              { telefone: { contains: busca } },
            ],
          }
        : {}),
    },
    include: { enderecos: true },
    orderBy: { nome: "asc" },
    take: 50,
  });
  return NextResponse.json({
    clientes: clientes.map((c) => ({
      id: c.id,
      nome: c.nome,
      telefone: c.telefone,
      email: c.email,
      criadoEm: c.criadoEm.toISOString(),
      enderecos: c.enderecos.map((e) => ({
        id: e.id,
        rotulo: e.rotulo,
        rua: e.rua,
        bairro: e.bairro,
        cidade: e.cidade,
        cep: e.cep,
        complemento: e.complemento,
        referencia: e.referencia,
      })),
    })),
  });
});

export const POST = comTratamentoDeErro("clientes.POST", async (req: NextRequest) => {
  const acesso = await autorizar("clientes");
  if (!acesso.ok) return acesso.resposta;
  const corpo = await req.json().catch(() => ({}));
  const nome = String(corpo.nome ?? "").trim();
  if (!nome) {
    return NextResponse.json({ erro: "Informe o nome do cliente." }, { status: 400 });
  }

  const enderecos = Array.isArray(corpo.enderecos)
    ? corpo.enderecos.map((e: { rua?: string; bairro?: string; cidade?: string; cep?: string; complemento?: string; referencia?: string; rotulo?: string }) => ({
        rotulo: e.rotulo ? String(e.rotulo) : null,
        rua: String(e.rua ?? ""),
        bairro: String(e.bairro ?? ""),
        cidade: e.cidade ? String(e.cidade) : null,
        cep: e.cep ? String(e.cep) : null,
        complemento: e.complemento ? String(e.complemento) : null,
        referencia: e.referencia ? String(e.referencia) : null,
      }))
    : [];

  const cliente = await prisma.cliente.create({
    data: {
      empresaId: acesso.empresaId,
      nome,
      telefone: corpo.telefone ? String(corpo.telefone) : null,
      email: corpo.email ? String(corpo.email) : null,
      enderecos: enderecos.length ? { create: enderecos } : undefined,
    },
    include: { enderecos: true },
  });
  return NextResponse.json({ ok: true, cliente }, { status: 201 });
});

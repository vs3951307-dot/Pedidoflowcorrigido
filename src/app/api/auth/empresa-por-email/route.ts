import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseTema } from "@/lib/system-builder";
import { verificarLimite, ipDaRequisicao } from "@/lib/rate-limit";

/**
 * Primeira etapa do login em duas etapas (PEDIDO 4):
 * PedidoFlow → e-mail → "Bem-vindo, {empresa}" → senha.
 *
 * Retorna só o NECESSÁRIO para a tela de boas-vindas (nome, logo, cor) —
 * nunca confirma explicitamente se o e-mail existe ou não com uma
 * mensagem diferente (mesma resposta genérica em ambos os casos),
 * para não facilitar enumeração de contas. Ainda assim, a existência
 * de um endpoint assim tem um custo inerente de descoberta (alguém
 * pode tentar e-mails para ver se algum resolve uma empresa) — por
 * isso é limitado por taxa (rate limit) por IP.
 */
export async function POST(req: NextRequest) {
  const limite = verificarLimite({ chave: `login-empresa:${ipDaRequisicao(req)}`, maximo: 20, janelaMs: 60_000 });
  if (!limite.permitido) {
    return NextResponse.json(
      { encontrada: false },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limite.reiniciaEm / 1000)) } }
    );
  }

  const corpo = await req.json().catch(() => ({}));
  const email = String(corpo.email ?? "").trim().toLowerCase();
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ encontrada: false }, { status: 400 });
  }

  const usuario = await prisma.usuario.findUnique({
    where: { email },
    select: { ativo: true, empresa: { select: { nome: true, logoUrl: true, tema: true, status: true } } },
  });

  if (!usuario || !usuario.ativo || !["ativa", "teste"].includes(usuario.empresa.status)) {
    return NextResponse.json({ encontrada: false });
  }

  const tema = parseTema(usuario.empresa.tema);
  return NextResponse.json({
    encontrada: true,
    empresa: {
      nome: tema.nomeExibicao ?? usuario.empresa.nome,
      logoUrl: tema.logoUrl ?? usuario.empresa.logoUrl,
      corPrimaria: tema.corPrimaria ?? null,
    },
  });
}

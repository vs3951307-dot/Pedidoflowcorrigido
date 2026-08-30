import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { autorizarEmergencia } from "@/lib/emergencia-guard";
import { verificarLimite, ipDaRequisicao } from "@/lib/rate-limit";

/**
 * POST /api/emergencia/criar-usuarios
 *
 * Cria UM usuário numa empresa específica, para destravar um acesso.
 * Só existe quando `EMERGENCIA_HABILITADA=1` (ver `lib/emergencia-guard.ts`).
 *
 * MUDANÇAS EM RELAÇÃO À VERSÃO ANTERIOR (correção de falha crítica):
 *
 * - Não há mais token padrão no código-fonte.
 * - A senha `Rozeno@2026` estava FIXA no arquivo: quem conhecesse a rota
 *   entrava como ADMINISTRADOR. Agora a senha vem no corpo e tem mínimo.
 * - A lista de usuários de um cliente específico saiu daqui — isso é
 *   provisionamento, não emergência, e pertence a um script/seed.
 * - O fallback "pega qualquer empresa ativa" foi REMOVIDO: ele podia
 *   criar um administrador dentro da empresa errada. `empresaId` agora é
 *   obrigatório e conferido.
 * - Um usuário existente NUNCA é movido de empresa por esta rota.
 *
 * Body: { token, empresaId, nome, email, senha, papel }
 */
const PAPEIS = ["ADMINISTRADOR", "CAIXA", "GARCOM", "COZINHA", "ENTREGADOR"];

export const POST = comTratamentoDeErro("emergencia.criar-usuarios.POST", async (req: NextRequest) => {
  const limite = verificarLimite({ chave: `emergencia:${ipDaRequisicao(req)}`, maximo: 5, janelaMs: 60 * 60_000 });
  if (!limite.permitido) {
    return NextResponse.json({ erro: "Muitas tentativas." }, { status: 429 });
  }

  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const guard = autorizarEmergencia(corpo.token);
  if (!guard.ok) return guard.resposta;

  const empresaId = String(corpo.empresaId ?? "").trim();
  const nome = String(corpo.nome ?? "").trim();
  const email = String(corpo.email ?? "").trim().toLowerCase();
  const senha = String(corpo.senha ?? "").trim();
  const papel = String(corpo.papel ?? "").trim().toUpperCase();

  if (!empresaId || !nome || !email) {
    return NextResponse.json({ erro: "Informe empresaId, nome e email." }, { status: 400 });
  }
  if (senha.length < 12) {
    return NextResponse.json({ erro: "A senha deve ter pelo menos 12 caracteres." }, { status: 400 });
  }
  if (!PAPEIS.includes(papel)) {
    return NextResponse.json({ erro: `Papel inválido. Use um de: ${PAPEIS.join(", ")}.` }, { status: 400 });
  }

  const empresa = await prisma.empresa.findFirst({
    where: { id: empresaId, status: { not: "excluida" } },
    select: { id: true, nome: true, slug: true },
  });
  if (!empresa) {
    return NextResponse.json({ erro: "Empresa não encontrada." }, { status: 404 });
  }

  const existente = await prisma.usuario.findUnique({ where: { email }, select: { id: true, empresaId: true } });
  if (existente) {
    // Nunca movemos um usuário de empresa por aqui — era exatamente assim
    // que a versão anterior conseguia sequestrar uma conta de outro tenant.
    return NextResponse.json(
      { erro: "Já existe um usuário com este e-mail. Use o reset de senha ou o painel da empresa." },
      { status: 409 }
    );
  }

  const usuario = await prisma.usuario.create({
    data: { empresaId: empresa.id, nome, email, senhaHash: bcrypt.hashSync(senha, 12), papel, ativo: true },
    select: { id: true, email: true, papel: true },
  });

  console.warn("[emergencia] usuário criado", { email, empresaId: empresa.id, papel });

  return NextResponse.json({ ok: true, empresa: { id: empresa.id, nome: empresa.nome }, usuario });
});

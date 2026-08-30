import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";

import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/acesso";
import { verificarLimite, ipDaRequisicao } from "@/lib/rate-limit";
import { emailConfigurado, enviarEmailRecuperacaoSenha, urlBase } from "@/lib/email";

const VALIDADE_MINUTOS = 30;

/**
 * Recuperação de senha (PEDIDO 14, evoluído no PEDIDO "Recuperação de
 * senha por e-mail").
 *
 * Com Resend configurado (`RESEND_API_KEY` + `EMAIL_FROM`), o e-mail é
 * enviado de verdade e o token NUNCA volta na resposta da API, em
 * nenhum ambiente — independe de `DEMO_MODE`.
 *
 * Sem Resend configurado, cai no fluxo de demonstração — MAS só quando
 * EXPLICITAMENTE habilitado (PEDIDO 53 — "seguro por padrão"). Antes,
 * o padrão era mostrar o token A MENOS QUE alguém lembrasse de setar
 * `DEMO_MODE=false` — ou seja, um deploy em produção que esquecesse essa
 * variável vazava o token de redefinição de senha na resposta da API
 * pra QUALQUER UM que soubesse o e-mail de um usuário. Agora é o
 * oposto: o token só aparece com as DUAS condições explícitas:
 *   - `NODE_ENV !== "production"`
 *   - `DEMO_MODE === "true"` (precisa ser exatamente essa string)
 * Esquecer de configurar nunca resulta em vazamento — resulta em
 * "e-mail não configurado, e demonstração desativada", que é seguro
 * (só não mostra a mensagem de teste, não expõe segredo nenhum).
 */
const DEMO_MODE_HABILITADO = process.env.NODE_ENV !== "production" && process.env.DEMO_MODE === "true";
export async function POST(req: NextRequest) {
  const limite = verificarLimite({
    chave: `recuperar:${ipDaRequisicao(req)}`,
    maximo: 3,
    janelaMs: 10 * 60_000,
  });
  if (!limite.permitido) {
    return NextResponse.json(
      { erro: "Muitas tentativas. Tente novamente em instantes." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limite.reiniciaEm / 1000)) } }
    );
  }
  const corpo = await req.json().catch(() => ({}));
  const email = String(corpo.email ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ erro: "Informe seu e-mail." }, { status: 400 });
  }

  const usuario = await prisma.usuario.findUnique({ where: { email }, include: { empresa: true } });
  if (!usuario || usuario.ativo === false) {
    return NextResponse.json({
      ok: true,
      mensagem: "Se o e-mail estiver cadastrado, você receberá as instruções.",
    });
  }

  const token = randomBytes(24).toString("hex");
  // Invalida qualquer token de recuperação anterior não usado deste
  // usuário (PEDIDO 54: "ao gerar nova recuperação, invalidar tokens
  // anteriores não utilizados") — pedir "esqueci minha senha" 3 vezes
  // não deve deixar 3 links válidos simultâneos; só o mais recente
  // funciona.
  await prisma.tokenRecuperacao.updateMany({
    where: { usuarioId: usuario.id, usadoEm: null },
    data: { usadoEm: new Date() },
  });
  await prisma.tokenRecuperacao.create({
    data: {
      tokenHash: createHash("sha256").update(token).digest("hex"),
      usuarioId: usuario.id,
      expiraEm: new Date(Date.now() + VALIDADE_MINUTOS * 60 * 1000),
    },
  });
  // Auditoria NUNCA registra o token em si — só o fato de ter sido gerado.
  await registrarAuditoria("senha_recuperada", `Token gerado para ${email}`, usuario, undefined, usuario.empresaId);

  const linkRedefinir = `${urlBase()}/login/redefinir?token=${token}`;

  if (emailConfigurado()) {
    const resultado = await enviarEmailRecuperacaoSenha({
      para: email,
      nomeUsuario: usuario.nome,
      nomeEmpresa: usuario.empresa.nome,
      linkRedefinir,
      validadeMinutos: VALIDADE_MINUTOS,
    });
    // Mesmo se o provedor falhar, a resposta ao cliente continua genérica
    // (não revela se o e-mail existe) — a falha fica só no log do servidor
    // para o time técnico investigar, nunca visível para quem pediu.
    if (!resultado.enviado) {
      console.error(`[auth/recuperar] e-mail não enviado (motivo: ${resultado.motivo}) para usuário ${usuario.id}`);
    }
    return NextResponse.json({
      ok: true,
      mensagem: "Se o e-mail estiver cadastrado, você receberá as instruções.",
    });
  }

  // Sem Resend configurado: cai no fluxo de demonstração — só quando
  // explicitamente habilitado (ver comentário no topo do arquivo).
  const resposta: Record<string, unknown> = {
    ok: true,
    mensagem: DEMO_MODE_HABILITADO
      ? "Instruções enviadas. (Demonstração: o link é exibido abaixo — configure RESEND_API_KEY para enviar e-mail de verdade.)"
      : "Instruções enviadas.",
  };
  if (DEMO_MODE_HABILITADO) {
    resposta.token = token;
    resposta.link = `/login/redefinir?token=${token}`;
    resposta.expiraEmMinutos = VALIDADE_MINUTOS;
  }
  return NextResponse.json(resposta);
}

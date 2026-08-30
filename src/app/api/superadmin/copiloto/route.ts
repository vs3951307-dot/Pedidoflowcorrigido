import { NextRequest, NextResponse } from "next/server";
import { autorizarSuperAdmin } from "@/lib/super-admin/auth";
import { comTratamentoDeErro } from "@/lib/api-erro";
import {
  interpretarInstrucao,
  criarAcaoPendente,
  confirmarAcaoPendente,
  gerarEspecificacaoTecnica,
} from "@/lib/ia-admin";

/**
 * POST /api/superadmin/copiloto — Copiloto Supremo do Super Admin.
 *
 * Human-in-the-loop de verdade (nunca confia no cliente para reenviar a
 * lista de ações): 1) interpreta e PROPÕE ações — a proposta fica
 * guardada NO SERVIDOR sob um `actionId` de validade curta (10 min),
 * vinculado a quem pediu; 2) só aplica quando o Super Admin confirma
 * `{confirmar: true, actionId}` — o backend executa exatamente o que
 * ele mesmo gravou, nunca o que vier solto no corpo da requisição.
 */
export const POST = comTratamentoDeErro("superadmin.copiloto.POST", async (req: NextRequest) => {
  const acesso = await autorizarSuperAdmin();
  if (!acesso.ok) return acesso.resposta;

  const corpo = await req.json().catch(() => ({}));

  if (corpo.confirmar && typeof corpo.actionId === "string") {
    const resultado = await confirmarAcaoPendente(corpo.actionId, acesso.superAdmin.id, {
      id: acesso.superAdmin.id,
      nome: acesso.superAdmin.nome,
    });
    if (!resultado.ok) {
      return NextResponse.json({ erro: resultado.motivo }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      modo: "aplicado",
      resumo: `${resultado.aplicadas} ação(ões) aplicada(s)${resultado.ignoradas > 0 ? `, ${resultado.ignoradas} fora do escopo (ignorada(s))` : ""}.`,
      historicoId: resultado.historicoId,
      usuariosCriados: resultado.usuariosCriados,
    });
  }

  const instrucao = String(corpo.instrucao ?? "").trim();
  if (!instrucao) {
    return NextResponse.json({ erro: "Descreva o que você quer fazer." }, { status: 400 });
  }

  const interpretacao = await interpretarInstrucao(instrucao);

  if (interpretacao.modo === "resposta") {
    return NextResponse.json({ ok: true, modo: "resposta", resumo: interpretacao.resumo });
  }
  if (interpretacao.modo === "ambiguo") {
    return NextResponse.json({
      ok: true,
      modo: "ambiguo",
      resumo: interpretacao.resumo,
      empresasCandidatas: interpretacao.empresasCandidatas ?? [],
    });
  }

  const foraDoEscopo = interpretacao.acoes.find((a) => a.acao.tipo === "fora_do_escopo");
  const especificacao = foraDoEscopo ? gerarEspecificacaoTecnica(instrucao) : undefined;
  const precisaConfirmacao = !interpretacao.acoes.every((a) => a.acao.tipo === "fora_do_escopo");

  // Guarda a proposta no servidor — o `actionId` é o único jeito de
  // confirmar depois; a lista de ações em si nunca volta a ser
  // aceita vinda do cliente.
  const actionId = precisaConfirmacao
    ? await criarAcaoPendente(
        "supremo",
        acesso.superAdmin.id,
        null,
        instrucao,
        interpretacao.acoes.map((a) => a.acao)
      )
    : null;

  return NextResponse.json({
    ok: true,
    modo: "proposta",
    resumo: interpretacao.resumo,
    actionId,
    // Ecoado só para a TELA saber o que mostrar/preencher (ex.: qual
    // ação precisa de e-mail) — a confirmação em si nunca usa isto,
    // só o `actionId`.
    acoesPropostas: interpretacao.acoes.map((a) => a.acao),
    rotulos: interpretacao.acoes.map((a) => a.rotulo),
    especificacao,
    precisaConfirmacao,
  });
});

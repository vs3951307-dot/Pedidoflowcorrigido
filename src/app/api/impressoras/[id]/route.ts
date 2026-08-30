import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizar, registrarAuditoria } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { validarCorpo } from "@/lib/validar";
import { impressoraAtualizarSchema } from "@/lib/schemas/impressora";

export const PATCH = comTratamentoDeErro("impressoras.id.PATCH", async (req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizar("impressao");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const existente = await prisma.impressora.findFirst({ where: { id: params.id, empresaId } });
  if (!existente) {
    return NextResponse.json({ erro: "Impressora não encontrada." }, { status: 404 });
  }

  const corpoBruto = await req.json().catch(() => ({}));
  const validado = validarCorpo(impressoraAtualizarSchema, corpoBruto);
  if (!validado.ok) return validado.resposta;
  const { destinos, ...resto } = validado.dados;

  const impressora = await prisma.impressora.update({
    where: { id: existente.id },
    data: {
      ...resto,
      ...(destinos ? { destinos: JSON.stringify(destinos) } : {}),
    },
  });

  await registrarAuditoria("impressora_atualizada", impressora.nome, acesso.usuario, undefined, empresaId);
  return NextResponse.json({ ok: true, impressora });
});

/**
 * Exclui a impressora. Diferente de estoque/produto, aqui não há
 * "histórico" que se perderia (a `FilaImpressao` guarda o conteúdo já
 * impresso independente da impressora que o gerou) — exclusão direta é
 * segura. Se preferir manter o cadastro só desativado, use
 * `PATCH { ativa: false }` em vez de excluir.
 */
export const DELETE = comTratamentoDeErro("impressoras.id.DELETE", async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizar("impressao");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const existente = await prisma.impressora.findFirst({ where: { id: params.id, empresaId } });
  if (!existente) {
    return NextResponse.json({ erro: "Impressora não encontrada." }, { status: 404 });
  }

  await prisma.impressora.delete({ where: { id: existente.id } });
  await registrarAuditoria("impressora_excluida", existente.nome, acesso.usuario, undefined, empresaId);
  return NextResponse.json({ ok: true });
});

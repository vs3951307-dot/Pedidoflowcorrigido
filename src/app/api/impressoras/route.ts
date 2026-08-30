import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizar, registrarAuditoria } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { validarCorpo } from "@/lib/validar";
import { impressoraCriarSchema } from "@/lib/schemas/impressora";
import { lerImpressoras } from "@/lib/impressao";

/**
 * GET /api/impressoras — lista as impressoras da empresa (Admin →
 * Configurações → Impressoras). Faltava por completo um CRUD de verdade:
 * antes, a "lista" era um JSON solto sobrescrito inteiro a cada
 * salvamento, sem id individual por impressora, sem status, sem
 * histórico de comunicação.
 */
export const GET = comTratamentoDeErro("impressoras.GET", async () => {
  const acesso = await autorizar("impressao");
  if (!acesso.ok) return acesso.resposta;
  const impressoras = await lerImpressoras(acesso.empresaId);
  return NextResponse.json({ impressoras });
});

export const POST = comTratamentoDeErro("impressoras.POST", async (req: NextRequest) => {
  const acesso = await autorizar("impressao");
  if (!acesso.ok) return acesso.resposta;

  const corpoBruto = await req.json().catch(() => ({}));
  const validado = validarCorpo(impressoraCriarSchema, corpoBruto);
  if (!validado.ok) return validado.resposta;
  const dados = validado.dados;

  const impressora = await prisma.impressora.create({
    data: {
      empresaId: acesso.empresaId,
      nome: dados.nome,
      modelo: dados.modelo ?? null,
      fabricante: dados.fabricante ?? null,
      tipoConexao: dados.tipoConexao,
      nomeWindows: dados.nomeWindows ?? null,
      enderecoIp: dados.enderecoIp ?? null,
      porta: dados.porta ?? null,
      larguraPapel: dados.larguraPapel,
      vias: dados.vias,
      impressaoAutomatica: dados.impressaoAutomatica,
      destinos: JSON.stringify(dados.destinos),
      computadorVinculado: dados.computadorVinculado ?? null,
    },
  });

  await registrarAuditoria("impressora_criada", dados.nome, acesso.usuario, undefined, acesso.empresaId);
  return NextResponse.json({ ok: true, impressora }, { status: 201 });
});

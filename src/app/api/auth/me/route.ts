import { NextResponse } from "next/server";

import { comTratamentoDeErro } from "@/lib/api-erro";
import { sessaoValida } from "@/lib/auth";
import { usuarioSeguro } from "@/lib/acesso";
import { parseModulos } from "@/lib/modulos";

async function GETTenant() {
  const usuario = await sessaoValida();
  if (!usuario) {
    return NextResponse.json({ usuario: null }, { status: 401 });
  }
  return NextResponse.json({
    usuario: usuarioSeguro(usuario),
    permissoes: usuario.permissaos?.map((p) => p.recurso) ?? [],
    empresa: {
      id: usuario.empresa.id,
      nome: usuario.empresa.nome,
      slug: usuario.empresa.slug,
      plano: usuario.empresa.plano,
      modulos: parseModulos(usuario.empresa.modulos),
      // Expostos pra o frontend poder avisar ANTES de vencer (PEDIDO 36:
      // "aviso antes de vencer") — o bloqueio de verdade já acontece em
      // `autorizar()` quando a data passa; isto aqui é só pro aviso.
      status: usuario.empresa.status,
      trialFimEm: usuario.empresa.trialFimEm,
      vencimentoEm: usuario.empresa.vencimentoEm,
      logoUrl: usuario.empresa.logoUrl ?? null,
      tema: (usuario.empresa.tema && typeof usuario.empresa.tema === "object" ? usuario.empresa.tema : null) as Record<string, unknown> | null,
    },
  });
}

export const GET = comTratamentoDeErro("me.GET", GETTenant);

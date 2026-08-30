import { NextResponse } from "next/server";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { autorizar } from "@/lib/acesso";
import { statusConfiguracaoFiscal } from "@/lib/fiscal/config";
import { statusDoProvedor } from "@/lib/fiscal/provedor";

/**
 * POST /api/fiscal/teste — teste de conectividade com o provedor (desta
 * empresa). NÃO emite documento fiscal: só verifica credenciais + serviço.
 */
async function POSTTenant() {
  const acesso = await autorizar("fiscal");
  if (!acesso.ok) return acesso.resposta;

  const config = await statusConfiguracaoFiscal(acesso.empresaId);
  if (!config.configurado) {
    return NextResponse.json({
      ok: false,
      teste: {
        conectado: false,
        ambiente: config.ambiente,
        erro: `Configuração incompleta: ${config.faltando.join("; ")}`,
      },
    });
  }

  const resultado = await statusDoProvedor(acesso.empresaId);
  return NextResponse.json({
    ok: resultado.ok,
    teste: {
      conectado: resultado.ok,
      ambiente: config.ambiente,
      provedor: config.provedor,
      cStat: resultado.cStat,
      xMotivo: resultado.xMotivo,
      erro: resultado.erro,
    },
  });
}

export const POST = comTratamentoDeErro("fiscal.teste.POST", POSTTenant);

import { NextRequest, NextResponse } from "next/server";
import { autorizar } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { BUCKET_DOCUMENTOS } from "@/lib/copiloto/anexos";
import { gerarUrlAssinada, lerArquivoPrivadoBytes, storagePersistenteConfigurado } from "@/lib/storage";

/**
 * Acesso ao documento PRIVADO de uma nota fiscal/anexo do Copiloto.
 *
 * O arquivo NUNCA fica em `public/` e nunca é servido como estático:
 * este endpoint valida sessão + empresa e exige que o caminho pertença
 * à empresa (`copiloto/{empresaId}/...`). Com Supabase configurado,
 * redireciona para uma URL assinada de curta duração; em dev (sem
 * Supabase) lê do disco local e serve com o MIME original.
 */
export const GET = comTratamentoDeErro("copiloto.anexo.GET", async (req: NextRequest) => {
  const acesso = await autorizar("admin");
  if (!acesso.ok) return acesso.resposta;

  const caminho = (req.nextUrl.searchParams.get("caminho") ?? "").trim();
  const prefixoEsperado = `copiloto/${acesso.empresaId}/`;
  if (!caminho.startsWith(prefixoEsperado) || caminho.includes("..")) {
    return NextResponse.json({ erro: "Documento não encontrado." }, { status: 404 });
  }

  if (storagePersistenteConfigurado()) {
    const url = await gerarUrlAssinada(BUCKET_DOCUMENTOS, caminho, 120);
    if (url) return NextResponse.redirect(url, { status: 302 });
    return NextResponse.json({ erro: "Documento não encontrado." }, { status: 404 });
  }

  // Desenvolvimento (fallback local): serve os bytes lidos via endpoint autorizado.
  const bytes = await lerArquivoPrivadoBytes(BUCKET_DOCUMENTOS, caminho);
  if (!bytes) return NextResponse.json({ erro: "Documento não encontrado." }, { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(caminho.split("/").pop() ?? "anexo")}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
});

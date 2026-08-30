import { NextRequest, NextResponse } from "next/server";

import { autorizar } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";

const TAMANHO_MAX_PDF = 10 * 1024 * 1024;

/**
 * POST /api/catalogo/extrair-pdf — extrai o texto real de um PDF de
 * cardápio para a importação em massa (imagens passam por OCR no
 * navegador, sem servidor). PDF escaneado (só imagem) devolve texto vazio
 * com um aviso para o usuário usar a opção de imagem.
 */
export const POST = comTratamentoDeErro("catalogo.extrair-pdf.POST", async (req: NextRequest) => {
  const acesso = await autorizar("catalogo_editar");
  if (!acesso.ok) return acesso.resposta;

  const corpo = await req.json().catch(() => ({}));
  const { arquivoBase64 } = corpo as { arquivoBase64?: unknown };

  if (typeof arquivoBase64 !== "string" || arquivoBase64.length === 0) {
    return NextResponse.json({ erro: "Arquivo não enviado." }, { status: 400 });
  }

  const base64 = arquivoBase64.replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(base64, "base64");
  if (buffer.byteLength === 0) {
    return NextResponse.json({ erro: "Arquivo vazio." }, { status: 400 });
  }
  if (buffer.byteLength > TAMANHO_MAX_PDF) {
    return NextResponse.json(
      { erro: "PDF maior que 10MB — escolha um arquivo menor ou exporte as páginas como imagem." },
      { status: 400 }
    );
  }

  const { pdfParse } = await import("@/lib/cardapio/extrair-pdf");
  const dados = await pdfParse(buffer);
  const texto = (dados.text ?? "").trim();

  return NextResponse.json({
    texto,
    aviso: texto
      ? undefined
      : "Este PDF não tem texto extraível (parece escaneado). Use a opção de imagem para reconhecer o texto (OCR).",
  });
});

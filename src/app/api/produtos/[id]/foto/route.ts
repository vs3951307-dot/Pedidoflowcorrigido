import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizar, registrarAuditoria } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { salvarArquivoPublico, removerArquivoPublico } from "@/lib/storage";
import { validarAssinaturaImagem } from "@/lib/validar-imagem";

/**
 * Upload de foto de produto.
 *
 * CORREÇÃO (PEDIDO 26): antes gravava direto em `public/uploads/` —
 * some no próximo deploy/restart em ambiente de container (Render).
 * Agora usa a abstração de storage (`src/lib/storage.ts`): Supabase
 * Storage quando configurado (produção), disco local só em
 * desenvolvimento. Só o CAMINHO/URL fica no banco (`Produto.fotoUrl`),
 * nunca o binário no Postgres.
 *
 * CORREÇÃO (PEDIDO 27): valida a IMAGEM DE VERDADE pelos primeiros
 * bytes do arquivo (assinatura/magic bytes), não confia no
 * `data:image/...` que o cliente declarou — um arquivo malicioso
 * disfarçado de imagem é rejeitado aqui, não só pelo nome/extensão.
 */
const BUCKET = "produtos";
const TAMANHO_MAXIMO_BYTES = 4 * 1024 * 1024; // 4MB — suficiente para foto de produto, sem pesar a página

export const POST = comTratamentoDeErro("produtos.foto.POST", async (req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizar("catalogo_editar");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const existente = await prisma.produto.findFirst({ where: { id: params.id, empresaId } });
  if (!existente) {
    return NextResponse.json({ erro: "Produto não encontrado." }, { status: 404 });
  }

  const corpo = await req.json().catch(() => ({}));
  const imagemBase64 = String(corpo.imagemBase64 ?? "");
  const casamento = imagemBase64.match(/^data:image\/[a-z]+;base64,(.+)$/);
  if (!casamento) {
    return NextResponse.json({ erro: "Envie a imagem como data URL (JPEG, PNG ou WebP)." }, { status: 400 });
  }
  const bytes = Buffer.from(casamento[1], "base64");

  if (bytes.length > TAMANHO_MAXIMO_BYTES) {
    return NextResponse.json({ erro: "Imagem maior que 4MB — escolha um arquivo menor." }, { status: 413 });
  }
  if (bytes.length === 0) {
    return NextResponse.json({ erro: "Arquivo de imagem vazio." }, { status: 400 });
  }

  // O MIME que o cliente DECLAROU já foi ignorado acima — o que decide
  // o formato de verdade é a assinatura real dos bytes do arquivo.
  const imagemReal = validarAssinaturaImagem(bytes);
  if (!imagemReal) {
    return NextResponse.json(
      { erro: "Arquivo não reconhecido como imagem JPEG, PNG ou WebP válida." },
      { status: 400 }
    );
  }

  let fotoUrl: string;
  try {
    const resultado = await salvarArquivoPublico(BUCKET, `${existente.id}.${imagemReal.extensao}`, bytes, imagemReal.mime);
    fotoUrl = resultado.url;
  } catch (erro) {
    return NextResponse.json(
      { erro: erro instanceof Error ? erro.message : "Não foi possível salvar a imagem." },
      { status: 500 }
    );
  }

  const produto = await prisma.produto.update({
    where: { id: existente.id },
    data: { fotoUrl },
  });

  await registrarAuditoria("produto_foto_atualizada", produto.nome, acesso.usuario, undefined, empresaId);
  return NextResponse.json({ ok: true, fotoUrl });
});

/** Remove a foto do produto (volta a mostrar o emoji). */
export const DELETE = comTratamentoDeErro("produtos.foto.DELETE", async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizar("catalogo_editar");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const existente = await prisma.produto.findFirst({ where: { id: params.id, empresaId } });
  if (!existente) {
    return NextResponse.json({ erro: "Produto não encontrado." }, { status: 404 });
  }

  for (const ext of ["jpg", "png", "webp"]) {
    await removerArquivoPublico(BUCKET, `${existente.id}.${ext}`);
  }

  await prisma.produto.update({ where: { id: existente.id }, data: { fotoUrl: null } });
  await registrarAuditoria("produto_foto_removida", existente.nome, acesso.usuario, undefined, empresaId);
  return NextResponse.json({ ok: true });
});

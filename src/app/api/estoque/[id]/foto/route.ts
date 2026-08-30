import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizar, registrarAuditoria } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { salvarArquivoPublico, removerArquivoPublico } from "@/lib/storage";
import { validarAssinaturaImagem } from "@/lib/validar-imagem";

/**
 * Upload de foto de item de estoque (aba "Fotos") — mesmo mecanismo de
 * `/api/produtos/[id]/foto`: storage abstraído (PEDIDO 26) e validação
 * real da imagem por assinatura de bytes (PEDIDO 27).
 */
const BUCKET = "estoque";
const TAMANHO_MAXIMO_BYTES = 4 * 1024 * 1024;

export const POST = comTratamentoDeErro("estoque.foto.POST", async (req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizar("estoque");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const existente = await prisma.estoqueProduto.findFirst({ where: { id: params.id, empresaId } });
  if (!existente) {
    return NextResponse.json({ erro: "Item de estoque não encontrado." }, { status: 404 });
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

  const produto = await prisma.estoqueProduto.update({
    where: { id: existente.id },
    data: { fotoUrl },
  });

  await registrarAuditoria("estoque_foto_atualizada", produto.nome, acesso.usuario, undefined, empresaId);
  return NextResponse.json({ ok: true, fotoUrl });
});

export const DELETE = comTratamentoDeErro("estoque.foto.DELETE", async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizar("estoque");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const existente = await prisma.estoqueProduto.findFirst({ where: { id: params.id, empresaId } });
  if (!existente) {
    return NextResponse.json({ erro: "Item de estoque não encontrado." }, { status: 404 });
  }

  for (const ext of ["jpg", "png", "webp"]) {
    await removerArquivoPublico(BUCKET, `${existente.id}.${ext}`);
  }

  await prisma.estoqueProduto.update({ where: { id: existente.id }, data: { fotoUrl: null } });
  await registrarAuditoria("estoque_foto_removida", existente.nome, acesso.usuario, undefined, empresaId);
  return NextResponse.json({ ok: true });
});

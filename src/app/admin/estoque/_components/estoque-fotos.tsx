"use client";

import * as React from "react";
import { toast } from "sonner";
import { ImagePlus, Images, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, useApi } from "@/lib/api-cliente";
import { PRODUTOS_ESTOQUE, type ProdutoEstoque } from "@/lib/estoque";

interface RespostaEstoque {
  produtos: ProdutoEstoque[];
}

const TIPOS_ACEITOS = ["image/jpeg", "image/png", "image/webp"];
const TAMANHO_MAXIMO_BYTES = 4 * 1024 * 1024;

function arquivoParaBase64(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    leitor.readAsDataURL(arquivo);
  });
}

/**
 * Aba Fotos — galeria dos itens de estoque, com upload e remoção reais
 * (`POST`/`DELETE /api/estoque/[id]/foto`). Antes mostrava só um "avatar"
 * de letra fingindo ser foto, e os botões de upload avisavam "vai vir com
 * o backend" — nunca vinha.
 */
export function EstoqueFotos() {
  const { dados, recarregar } = useApi<RespostaEstoque>("/api/estoque", { produtos: PRODUTOS_ESTOQUE });
  const [enviandoId, setEnviandoId] = React.useState<string | null>(null);
  const inputsRef = React.useRef<Record<string, HTMLInputElement | null>>({});

  const produtos = dados.produtos;
  const totalComFoto = produtos.filter((p) => p.temFoto).length;

  async function enviarFoto(produto: ProdutoEstoque, arquivo: File) {
    if (!TIPOS_ACEITOS.includes(arquivo.type)) {
      toast.error("Formato não aceito — envie JPEG, PNG ou WebP.");
      return;
    }
    if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
      toast.error("Imagem maior que 4MB — escolha um arquivo menor.");
      return;
    }

    setEnviandoId(produto.id);
    try {
      const imagemBase64 = await arquivoParaBase64(arquivo);
      await api(`/api/estoque/${produto.id}/foto`, {
        method: "POST",
        body: JSON.stringify({ imagemBase64 }),
      });
      toast.success(`Foto de "${produto.nome}" atualizada.`);
      recarregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível enviar a foto.");
    } finally {
      setEnviandoId(null);
    }
  }

  async function removerFoto(produto: ProdutoEstoque) {
    setEnviandoId(produto.id);
    try {
      await api(`/api/estoque/${produto.id}/foto`, { method: "DELETE" });
      toast.success(`Foto de "${produto.nome}" removida.`);
      recarregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível remover a foto.");
    } finally {
      setEnviandoId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Images className="h-5 w-5 text-primary" aria-hidden="true" />
            Fotos dos itens de estoque
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {totalComFoto} de {produtos.length} itens com foto cadastrada.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 p-6 pt-4 sm:grid-cols-2 sm:p-7 sm:pt-4 lg:grid-cols-3 xl:grid-cols-4">
          {produtos.length === 0 ? (
            <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
              Nenhum item de estoque cadastrado ainda.
            </p>
          ) : (
            produtos.map((produto) => (
              <div
                key={produto.id}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3"
              >
                <input
                  ref={(el) => {
                    inputsRef.current[produto.id] = el;
                  }}
                  type="file"
                  accept={TIPOS_ACEITOS.join(",")}
                  className="hidden"
                  onChange={(e) => {
                    const arquivo = e.target.files?.[0];
                    e.target.value = "";
                    if (arquivo) enviarFoto(produto, arquivo);
                  }}
                />
                {produto.fotoUrl ? (
                  <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-secondary">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={produto.fotoUrl}
                      alt={produto.nome}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => inputsRef.current[produto.id]?.click()}
                    className="flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border bg-secondary/40 transition-colors hover:border-primary/50 hover:bg-secondary"
                  >
                    <ImagePlus className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                    <span className="text-xs font-medium text-muted-foreground">Sem foto</span>
                  </button>
                )}
                <div className="flex items-center justify-between gap-2 px-1 pb-1">
                  <span className="truncate text-sm font-semibold">{produto.nome}</span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant={produto.fotoUrl ? "outline" : "primary"}
                      disabled={enviandoId === produto.id}
                      onClick={() => inputsRef.current[produto.id]?.click()}
                    >
                      <ImagePlus className="h-4 w-4" aria-hidden="true" />
                      {produto.fotoUrl ? "Trocar" : "Adicionar"}
                    </Button>
                    {produto.fotoUrl ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={enviandoId === produto.id}
                        onClick={() => removerFoto(produto)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  CircleCheck,
  FileText,
  LoaderCircle,
  Pencil,
  Pizza,
  Plus,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { cn, formatBRL } from "@/lib/utils";
import { api, useApi } from "@/lib/api-cliente";
import { PRODUTOS_CONFIGURACAO, type ProdutoConfiguracao } from "@/lib/configuracoes";
import {
  analisarCardapioTexto,
  emojiParaCategoria,
  type AnaliseCardapio,
  type ItemCardapioImportacao,
} from "@/lib/cardapio/analisar-texto";
import { ErrorBoundary } from "@/components/ui/error-boundary";

interface CatalogoApi {
  produtos: ProdutoConfiguracao[];
  categorias?: string[];
}

/** Estado do formulário — tudo texto (inputs controlados); convertido na hora de enviar. */
interface FormularioProduto {
  nome: string;
  categoria: string;
  preco: string;
  emoji: string;
  descricao: string;
  destaque: boolean;
  ncm: string;
  cest: string;
  csosn: string;
  cfop: string;
  unidade: string;
}

const FORMULARIO_VAZIO: FormularioProduto = {
  nome: "",
  categoria: "",
  preco: "",
  emoji: "🍕",
  descricao: "",
  destaque: false,
  ncm: "",
  cest: "",
  csosn: "102",
  cfop: "5102",
  unidade: "UN",
};

function paraFormulario(produto: ProdutoConfiguracao): FormularioProduto {
  return {
    nome: produto.nome,
    categoria: categoriaTexto(produto.categoria),
    // vírgula decimal na tela (padrão BR), ponto só na hora de enviar.
    preco: produto.preco.toFixed(2).replace(".", ","),
    emoji: produto.emoji,
    descricao: "",
    destaque: !!produto.destaque,
    ncm: produto.ncm ?? "",
    cest: produto.cest ?? "",
    csosn: produto.csosn ?? "102",
    cfop: produto.cfop ?? "5102",
    unidade: produto.unidade ?? "UN",
  };
}

/**
 * Normaliza a categoria para TEXTO: o backend (`/api/catalogo`) achata
 * `categoria` para string, mas caso um dado antigo/objeto chegue aqui,
 * evita o crash "Objects are not valid as a React child" ao renderizar
 * `<td>{produto.categoria}</td` e o "localeCompare is not a function" no
 * sort de categorias conhecidas.
 */
function categoriaTexto(categoria: unknown): string {
  if (typeof categoria === "string") return categoria;
  if (categoria && typeof categoria === "object" && "nome" in categoria) {
    const nome = (categoria as { nome: unknown }).nome;
    return typeof nome === "string" ? nome : "";
  }
  return "";
}

/** "12,50" ou "12.50" → 12.5. `null` quando não dá para interpretar como preço válido. */
function interpretarPreco(texto: string): number | null {
  const normalizado = texto.trim().replace(/\./g, "").replace(",", ".");
  const valor = Number(normalizado);
  if (!Number.isFinite(valor) || valor <= 0) return null;
  return valor;
}

/**
 * Produtos — gestão do cardápio (fonte única `src/lib/catalogo.ts` no servidor,
 * via `/api/catalogo` e `/api/produtos/:id`): criar, editar e ativar/inativar
 * cada item. Sem isto, não existe forma de montar o cardápio pelo navegador —
 * o PDV, o Salão e o Garçom ficam sem o que vender.
 */
export function ConfigProdutos() {
  const { dados, recarregar } = useApi<CatalogoApi>("/api/catalogo", {
    produtos: PRODUTOS_CONFIGURACAO,
  });
  const produtos = dados.produtos;
  const categoriasConhecidas = React.useMemo(() => {
    const nomes = new Set(produtos.map((p) => categoriaTexto(p.categoria)));
    (dados.categorias ?? []).forEach((c) => nomes.add(categoriaTexto(c)));
    return Array.from(nomes).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [produtos, dados.categorias]);
  const ativos = produtos.filter((p) => p.ativo).length;

  const [dialogoAberto, setDialogoAberto] = React.useState(false);
  const [editando, setEditando] = React.useState<ProdutoConfiguracao | null>(null);
  const [formulario, setFormulario] = React.useState<FormularioProduto>(FORMULARIO_VAZIO);
  const [enviando, setEnviando] = React.useState(false);
  const [enviandoFoto, setEnviandoFoto] = React.useState(false);
  const inputFotoRef = React.useRef<HTMLInputElement | null>(null);

  // Importação em massa do cardápio (PDF/imagem → texto → revisão → produtos).
  const [importDialogoAberto, setImportDialogoAberto] = React.useState(false);
  const [importEtapa, setImportEtapa] = React.useState<"arquivo" | "texto" | "revisao">("arquivo");
  const [importProcessando, setImportProcessando] = React.useState(false);
  const [importStatus, setImportStatus] = React.useState("");
  const [importTexto, setImportTexto] = React.useState("");
  const [importArquivo, setImportArquivo] = React.useState<{ nome: string; origem: string } | null>(null);
  const [importAnalise, setImportAnalise] = React.useState<AnaliseCardapio | null>(null);
  const [importItens, setImportItens] = React.useState<ItemCardapioImportacao[]>([]);
  const [importando, setImportando] = React.useState(false);
  const inputCardapioRef = React.useRef<HTMLInputElement | null>(null);

  function abrirNovo() {
    setEditando(null);
    setFormulario(FORMULARIO_VAZIO);
    setDialogoAberto(true);
  }

  function abrirEdicao(produto: ProdutoConfiguracao) {
    setEditando(produto);
    setFormulario(paraFormulario(produto));
    setDialogoAberto(true);
  }

  function arquivoParaBase64(arquivo: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(String(leitor.result));
      leitor.onerror = () => reject(new Error("Falha ao ler o arquivo."));
      leitor.readAsDataURL(arquivo);
    });
  }

  async function enviarFoto(arquivo: File) {
    if (!editando) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(arquivo.type)) {
      toast.error("Formato não aceito — envie JPEG, PNG ou WebP.");
      return;
    }
    if (arquivo.size > 4 * 1024 * 1024) {
      toast.error("Imagem maior que 4MB — escolha um arquivo menor.");
      return;
    }
    setEnviandoFoto(true);
    try {
      const imagemBase64 = await arquivoParaBase64(arquivo);
      const resposta = await api<{ fotoUrl: string }>(`/api/produtos/${editando.id}/foto`, {
        method: "POST",
        body: JSON.stringify({ imagemBase64 }),
      });
      toast.success("Foto atualizada.");
      setEditando((atual) => (atual ? { ...atual, fotoUrl: resposta.fotoUrl } : atual));
      recarregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível enviar a foto.");
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function removerFoto() {
    if (!editando) return;
    setEnviandoFoto(true);
    try {
      await api(`/api/produtos/${editando.id}/foto`, { method: "DELETE" });
      toast.success("Foto removida.");
      setEditando((atual) => (atual ? { ...atual, fotoUrl: null } : atual));
      recarregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível remover a foto.");
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function salvar() {
    const nome = formulario.nome.trim();
    const categoria = formulario.categoria.trim();
    const preco = interpretarPreco(formulario.preco);

    if (!nome) {
      toast.error("Informe o nome do produto.");
      return;
    }
    if (!categoria) {
      toast.error("Informe a categoria do produto.");
      return;
    }
    if (preco === null) {
      toast.error("Informe um preço válido (ex.: 32,90).");
      return;
    }

    setEnviando(true);
    try {
      if (editando) {
        await api(`/api/produtos/${editando.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            nome,
            descricao: formulario.descricao.trim() || undefined,
            preco,
            emoji: formulario.emoji.trim() || "📦",
            destaque: formulario.destaque,
            ncm: formulario.ncm.trim(),
            cest: formulario.cest.trim(),
            csosn: formulario.csosn.trim(),
            cfop: formulario.cfop.trim(),
            unidade: formulario.unidade.trim(),
          }),
        });
        toast.success(`"${nome}" atualizado.`);
      } else {
        await api("/api/catalogo", {
          method: "POST",
          body: JSON.stringify({
            nome,
            descricao: formulario.descricao.trim(),
            preco,
            categoria,
            emoji: formulario.emoji.trim() || "📦",
            destaque: formulario.destaque,
          }),
        });
        toast.success(`"${nome}" adicionado ao cardápio.`);
      }
      setDialogoAberto(false);
      recarregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar o produto.");
    } finally {
      setEnviando(false);
    }
  }

  async function alternarAtivo(produto: ProdutoConfiguracao) {
    // Otimista: a lista já vinha do servidor, então revertemos via
    // `recarregar()` no catch em vez de tentar reconstruir o estado à mão.
    try {
      await api(`/api/produtos/${produto.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ativo: !produto.ativo }),
      });
      toast.success(produto.ativo ? `"${produto.nome}" inativado.` : `"${produto.nome}" ativado.`);
      recarregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível alterar a situação.");
    }
  }

  function abrirImportar() {
    setImportDialogoAberto(true);
    setImportEtapa("arquivo");
    setImportProcessando(false);
    setImportStatus("");
    setImportTexto("");
    setImportArquivo(null);
    setImportAnalise(null);
    setImportItens([]);
  }

  async function ocrImagem(arquivo: File): Promise<string> {
    // OCR no navegador (tesseract.js, carregado sob demanda) — não manda a
    // imagem para o servidor. O idioma "por" cobre cardápios em português.
    const tesseract = await import("tesseract.js");
    const worker = await tesseract.createWorker("por");
    try {
      const resultado = await worker.recognize(arquivo);
      return resultado.data.text ?? "";
    } finally {
      await worker.terminate().catch(() => null);
    }
  }

  async function tratarArquivoCardapio(arquivo: File) {
    const ehPdf = arquivo.type === "application/pdf" || arquivo.name.toLowerCase().endsWith(".pdf");
    const ehImagem = ["image/jpeg", "image/png", "image/webp"].includes(arquivo.type);
    if (!ehPdf && !ehImagem) {
      toast.error("Formato não aceito — envie um PDF, JPEG, PNG ou WebP do cardápio.");
      return;
    }
    if (arquivo.size > 10 * 1024 * 1024) {
      toast.error("Arquivo maior que 10MB — escolha um arquivo menor.");
      return;
    }
    setImportProcessando(true);
    setImportArquivo({ nome: arquivo.name, origem: ehPdf ? "PDF" : "imagem" });
    setImportStatus(
      ehPdf
        ? "Extraindo o texto do PDF..."
        : "Lendo o texto da imagem (OCR) — pode levar alguns segundos..."
    );
    try {
      let texto: string;
      if (ehPdf) {
        const base64 = await arquivoParaBase64(arquivo);
        const resposta = await api<{ texto: string; aviso?: string }>("/api/catalogo/extrair-pdf", {
          method: "POST",
          body: JSON.stringify({ arquivoBase64: base64 }),
        });
        texto = resposta.texto;
        if (resposta.aviso) toast.warning(resposta.aviso);
      } else {
        texto = await ocrImagem(arquivo);
      }
      setImportTexto(texto);
      setImportEtapa("texto");
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível ler o arquivo.");
    } finally {
      setImportProcessando(false);
      setImportStatus("");
    }
  }

  function analisar() {
    const resultado = analisarCardapioTexto(importTexto);
    setImportAnalise(resultado);
    setImportItens(resultado.itens);
    if (resultado.itens.length === 0) {
      toast.error("Nenhum item reconhecido. Confira o texto e o formato abaixo.");
      return;
    }
    setImportEtapa("revisao");
  }

  function removerItemImportacao(indice: number) {
    setImportItens((atual) => atual.filter((_, i) => i !== indice));
  }

  async function importar() {
    if (importItens.length === 0) return;
    setImportando(true);
    try {
      const resposta = await api<{ criados: number; ignorados: string[] }>("/api/catalogo/importar", {
        method: "POST",
        body: JSON.stringify({
          itens: importItens,
          adicionais: importAnalise?.adicionais ?? [],
          sabores: importAnalise?.sabores ?? [],
        }),
      });
      const base = `${resposta.criados} produto(s) adicionado(s) ao cardápio.`;
      toast.success(
        resposta.ignorados.length
          ? `${base} ${resposta.ignorados.length} já existiam e foram ignorados.`
          : base
      );
      setImportDialogoAberto(false);
      recarregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível importar o cardápio.");
    } finally {
      setImportando(false);
    }
  }

  return (
    <ErrorBoundary>
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {ativos} de {produtos.length} produtos ativos no cardápio.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={abrirImportar}>
            <Upload className="h-4 w-4" aria-hidden="true" />
            Importar cardápio
          </Button>
          <Button onClick={abrirNovo}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Novo produto
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Pizza className="h-5 w-5 text-primary" aria-hidden="true" />
            Cardápio
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Itens disponíveis para venda no PDV, no Salão e no Garçom.
          </p>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          {produtos.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground sm:px-7">
              Nenhum produto cadastrado ainda. Clique em “Novo produto” para montar o cardápio.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Preço</TableHead>
                  <TableHead className="text-right">Dados fiscais</TableHead>
                  <TableHead className="text-right">Situação</TableHead>
                  <TableHead className="w-24 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {produtos.map((produto) => (
                  <TableRow key={produto.id}>
                    <TableCell>
                      {produto.fotoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={produto.fotoUrl}
                          alt=""
                          className="mr-2 inline-block h-7 w-7 rounded-md object-cover align-middle"
                        />
                      ) : (
                        <span className="mr-2" aria-hidden="true">
                          {produto.emoji}
                        </span>
                      )}
                      <span className="font-medium">{produto.nome}</span>
                      {produto.destaque && (
                        <span className="ml-2 inline-flex items-center rounded-full border border-status-waiting-border bg-status-waiting-bg px-2.5 py-0.5 text-xs font-semibold text-status-waiting">
                          Destaque
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{categoriaTexto(produto.categoria)}</TableCell>
                    <TableCell className="text-right font-semibold tabular">
                      {formatBRL(produto.preco)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {produto.ncm || produto.cfop || produto.unidade ? (
                        <span className="tabular">
                          {[produto.ncm && `NCM ${produto.ncm}`, produto.cfop && `CFOP ${produto.cfop}`, produto.unidade]
                            .filter(Boolean)
                            .join(" · ")}
                          {produto.csosn ? ` · CSOSN ${produto.csosn}` : ""}
                        </span>
                      ) : (
                        <span className="text-status-waiting">sem dados</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={() => alternarAtivo(produto)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-opacity hover:opacity-80",
                          produto.ativo
                            ? "bg-status-free-bg text-status-free border-status-free-border"
                            : "bg-status-occupied-bg text-status-occupied border-status-occupied-border"
                        )}
                        title={produto.ativo ? "Clique para inativar" : "Clique para ativar"}
                      >
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full",
                            produto.ativo ? "bg-status-free" : "bg-status-occupied"
                          )}
                          aria-hidden="true"
                        />
                        {produto.ativo ? "Ativo" : "Inativo"}
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => abrirEdicao(produto)}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogoAberto} onOpenChange={setDialogoAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? `Editar "${editando.nome}"` : "Novo produto"}</DialogTitle>
            <DialogDescription>
              {editando
                ? "Os dados fiscais valem só para a emissão de NFC-e — deixe em branco se ainda não tiver essa informação."
                : "Depois de criado, os dados fiscais (NCM, CFOP etc.) podem ser preenchidos na edição."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-[4.5rem_1fr] gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="produto-emoji">Emoji</Label>
                <Input
                  id="produto-emoji"
                  value={formulario.emoji}
                  maxLength={4}
                  onChange={(e) => setFormulario((f) => ({ ...f, emoji: e.target.value }))}
                  className="text-center text-lg"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="produto-nome">Nome</Label>
                <Input
                  id="produto-nome"
                  placeholder="Ex.: Pizza Calabresa"
                  value={formulario.nome}
                  onChange={(e) => setFormulario((f) => ({ ...f, nome: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="produto-categoria">Categoria</Label>
                <Input
                  id="produto-categoria"
                  placeholder="Ex.: Pizzas salgadas"
                  list="categorias-conhecidas"
                  value={formulario.categoria}
                  disabled={!!editando}
                  onChange={(e) => setFormulario((f) => ({ ...f, categoria: e.target.value }))}
                />
                <datalist id="categorias-conhecidas">
                  {categoriasConhecidas.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                {editando ? (
                  <p className="text-xs text-muted-foreground">A categoria não muda na edição.</p>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="produto-preco">Preço (R$)</Label>
                <Input
                  id="produto-preco"
                  inputMode="decimal"
                  placeholder="Ex.: 32,90"
                  value={formulario.preco}
                  onChange={(e) => setFormulario((f) => ({ ...f, preco: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="produto-descricao">Descrição (opcional)</Label>
              <Textarea
                id="produto-descricao"
                placeholder="Ex.: Molho, mussarela, calabresa fatiada e cebola."
                value={formulario.descricao}
                onChange={(e) => setFormulario((f) => ({ ...f, descricao: e.target.value }))}
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">Destaque no cardápio</p>
                <p className="text-xs text-muted-foreground">Aparece com selo "Destaque" para o cliente.</p>
              </div>
              <Switch
                checked={formulario.destaque}
                onCheckedChange={(v) => setFormulario((f) => ({ ...f, destaque: v }))}
              />
            </div>

            {editando ? (
              <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
                <p className="text-sm font-medium text-foreground">Foto do produto</p>
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-secondary text-2xl">
                    {editando.fotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={editando.fotoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span aria-hidden="true">{formulario.emoji}</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <input
                      ref={inputFotoRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const arquivo = e.target.files?.[0];
                        e.target.value = "";
                        if (arquivo) enviarFoto(arquivo);
                      }}
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={enviandoFoto}
                        onClick={() => inputFotoRef.current?.click()}
                      >
                        {editando.fotoUrl ? "Trocar foto" : "Enviar foto"}
                      </Button>
                      {editando.fotoUrl ? (
                        <Button type="button" size="sm" variant="ghost" disabled={enviandoFoto} onClick={removerFoto}>
                          Remover
                        </Button>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">JPEG, PNG ou WebP — até 4MB.</p>
                  </div>
                </div>
              </div>
            ) : null}

            {editando ? (
              <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
                <p className="text-sm font-medium text-foreground">Dados fiscais (NFC-e)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="produto-ncm">NCM</Label>
                    <Input
                      id="produto-ncm"
                      placeholder="Ex.: 1905.90.90"
                      value={formulario.ncm}
                      onChange={(e) => setFormulario((f) => ({ ...f, ncm: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="produto-cest">CEST</Label>
                    <Input
                      id="produto-cest"
                      placeholder="Opcional"
                      value={formulario.cest}
                      onChange={(e) => setFormulario((f) => ({ ...f, cest: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="produto-cfop">CFOP</Label>
                    <Input
                      id="produto-cfop"
                      value={formulario.cfop}
                      onChange={(e) => setFormulario((f) => ({ ...f, cfop: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="produto-csosn">CSOSN</Label>
                    <Input
                      id="produto-csosn"
                      value={formulario.csosn}
                      onChange={(e) => setFormulario((f) => ({ ...f, csosn: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="produto-unidade">Unidade</Label>
                    <Input
                      id="produto-unidade"
                      value={formulario.unidade}
                      onChange={(e) => setFormulario((f) => ({ ...f, unidade: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogoAberto(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={enviando}>
              {editando ? "Salvar alterações" : "Adicionar ao cardápio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ErrorBoundary>
      <Dialog
        open={importDialogoAberto}
        onOpenChange={(aberto) => {
          if (!importando) setImportDialogoAberto(aberto);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar cardápio</DialogTitle>
            <DialogDescription>
              Envie o PDF ou uma foto do cardápio e o texto vira produto. Revise antes de importar.
            </DialogDescription>
          </DialogHeader>

          {importEtapa === "arquivo" ? (
            <div className="flex flex-col gap-4 py-2">
              <input
                ref={inputCardapioRef}
                type="file"
                accept=".pdf,application/pdf,image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const arquivo = e.target.files?.[0];
                  e.target.value = "";
                  if (arquivo) tratarArquivoCardapio(arquivo);
                }}
              />
              <button
                type="button"
                onClick={() => inputCardapioRef.current?.click()}
                disabled={importProcessando}
                className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-card px-6 py-10 text-center transition-colors hover:border-primary/40 hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10 disabled:opacity-60"
              >
                <Upload className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-foreground">
                    Clique para escolher o arquivo do cardápio
                  </span>
                  <span className="text-xs text-muted-foreground">
                    PDF, JPEG, PNG ou WebP — até 10MB.
                  </span>
                </div>
              </button>

              {importProcessando ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {importStatus}
                </p>
              ) : null}

              <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
                ou
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
              </div>

              <Button variant="outline" onClick={() => setImportEtapa("texto")}>
                <FileText className="h-4 w-4" aria-hidden="true" />
                Digitar / colar o texto do cardápio
              </Button>

              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  PDF com texto real é lido direto. Imagem passa por reconhecimento de texto (OCR) e
                  pode conter erros — o resultado fica editável antes de importar.
                </span>
              </p>
            </div>
          ) : importEtapa === "texto" ? (
            <div className="flex flex-col gap-4 py-2">
              {importArquivo ? (
                <p className="text-sm text-muted-foreground">
                  Lido de{" "}
                  <span className="font-medium text-foreground">{importArquivo.nome}</span> (
                  {importArquivo.origem}). Confira e ajuste o texto abaixo.
                </p>
              ) : null}
              <Textarea
                value={importTexto}
                onChange={(e) => setImportTexto(e.target.value)}
                className="min-h-[240px] font-mono text-sm"
                placeholder={
                  "Categoria: Pizzas salgadas\nPizza Calabresa | M R$ 32,90 | G R$ 42,90\nPizza Portuguesa: 42,90\nCoxinha: 6,00\nAdicional: Queijo R$ 4,00"
                }
              />
              <p className="text-xs text-muted-foreground">
                Formato reconhecido: <code>Nome: 12,90</code> ·{" "}
                <code>Nome | M 12,90 | G 15,90</code> · <code>Nome (M) 8,00</code> ·{" "}
                <code>Categoria: Pizzas</code>. Cada linha é um produto.
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setImportEtapa("arquivo")}
                  disabled={importProcessando}
                >
                  Trocar arquivo
                </Button>
                <Button onClick={analisar} disabled={importTexto.trim().length === 0}>
                  Analisar texto
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 py-2">
              {importAnalise && importAnalise.erros.length > 0 ? (
                <p className="flex items-start gap-2 rounded-xl border border-status-waiting-border bg-status-waiting-bg px-4 py-3 text-xs text-status-waiting">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    {importAnalise.erros.length}{" "}
                    {importAnalise.erros.length === 1 ? "linha não reconhecida" : "linhas não reconhecidas"}
                    : “{importAnalise.erros.slice(0, 3).join("” · “")}”. Clique em “Voltar ao texto”
                    para ajustar.
                  </span>
                </p>
              ) : null}

              <p className="text-sm font-medium text-foreground">
                {importItens.length}{" "}
                {importItens.length === 1 ? "item será importado" : "itens serão importados"} — revise
                e remova o que não quiser:
              </p>

              <ul className="flex max-h-[40vh] flex-col gap-2 overflow-y-auto pr-1">
                {importItens.map((item, indice) => (
                  <li
                    key={`${item.nome}-${indice}`}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
                  >
                    <span className="text-xl" aria-hidden="true">
                      {emojiParaCategoria(item.categoria)}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <p className="truncate text-sm font-medium text-foreground">{item.nome}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.categoria} · {item.tamanhos.map((t) => `${t.nome} ${formatBRL(t.valor)}`).join(" · ")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="shrink-0"
                      onClick={() => removerItemImportacao(indice)}
                      aria-label={`Remover ${item.nome}`}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>

              {importAnalise &&
              (importAnalise.adicionais.length > 0 || importAnalise.sabores.length > 0) ? (
                <div className="flex flex-wrap gap-2 text-xs">
                  {importAnalise.adicionais.length > 0 ? (
                    <span className="rounded-full border border-border bg-secondary px-3 py-1 text-muted-foreground">
                      {importAnalise.adicionais.length}{" "}
                      {importAnalise.adicionais.length === 1 ? "adicional" : "adicionais"} serão
                      criados
                    </span>
                  ) : null}
                  {importAnalise.sabores.length > 0 ? (
                    <span className="rounded-full border border-border bg-secondary px-3 py-1 text-muted-foreground">
                      {importAnalise.sabores.length}{" "}
                      {importAnalise.sabores.length === 1 ? "sabor" : "sabores"} vinculados às pizzas
                    </span>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={() => setImportEtapa("texto")} disabled={importando}>
                  Voltar ao texto
                </Button>
                <Button onClick={importar} disabled={importando || importItens.length === 0}>
                  {importando ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <CircleCheck className="h-4 w-4" aria-hidden="true" />
                  )}
                  Importar {importItens.length}{" "}
                  {importItens.length === 1 ? "produto" : "produtos"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      </ErrorBoundary>
    </div>
    </ErrorBoundary>
  );
}

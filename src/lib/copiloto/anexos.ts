/**
 * Anexos multimídia do Copiloto da Empresa (foto, áudio, PDF/nota fiscal).
 *
 * Fluxo de segurança (mesma regra do restante do Copiloto — ver
 * `src/lib/copiloto/acoes.ts`): o arquivo é SEMPRE salvo no bucket PRIVADO
 * (`documentos/copiloto/{empresaId}/...`) ANTES de qualquer interpretação;
 * a interpretação (IA ou heurística) só monta uma PRÉVIA que o usuário
 * confirma — nenhum dado sai do arquivo direto pro banco sem confirmação.
 *
 * Sem IA configurada (ver `src/lib/ai-provider.ts`), o caminho é
 * determinístico: PDF tenta extração por heurística do texto; imagem/áudio
 * são guardados e avisamos que a interpretação por IA exige chave.
 */

import { prisma } from "@/lib/prisma";
import { pdfParse } from "@/lib/cardapio/extrair-pdf";
import { salvarArquivoPrivadoBytes } from "@/lib/storage";
import { chamarIA, chamarIAVisao, transcreverAudio } from "@/lib/ai-provider";
import { registrarUsoIA, limiteIaExcedido } from "@/lib/uso-ia";

export type TipoAnexo = "imagem" | "audio" | "pdf" | "documento";

export interface AnexoRecebido {
  nome: string;
  tipo: string; // MIME
  bytes: Buffer;
}

export interface ItemNotaFiscal {
  nome: string;
  quantidade: number;
  valorTotal: number;
}

export interface DadosNotaFiscal {
  numero: string;
  serie?: string;
  fornecedor: string;
  emissao: string; // ISO
  itens: ItemNotaFiscal[];
  valor: number;
}

export const BUCKET_DOCUMENTOS = "documentos";

export function classificarAnexo(mime: string): TipoAnexo {
  if (mime.startsWith("image/")) return "imagem";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  return "documento";
}

function extensaoDeMime(mime: string): string {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime.startsWith("image/")) return "img";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("amr")) return "amr";
  if (mime.includes("aac")) return "aac";
  if (mime.includes("m4a")) return "m4a";
  if (mime.includes("opus")) return "opus";
  return "doc";
}

/** Caminho relativo no bucket privado — sempre escopado pela empresa. */
export function caminhoDoAnexo(empresaId: string, anexo: AnexoRecebido): string {
  const sufixo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensaoDeMime(anexo.tipo)}`;
  return `copiloto/${empresaId}/${sufixo}`;
}

/** Salva o arquivo no bucket PRIVADO e devolve o caminho relativo. */
export async function guardarAnexo(empresaId: string, anexo: AnexoRecebido): Promise<string> {
  const caminho = caminhoDoAnexo(empresaId, anexo);
  await salvarArquivoPrivadoBytes(BUCKET_DOCUMENTOS, caminho, anexo.bytes, anexo.tipo);
  return caminho;
}

/* --------------------------- Extração de número --------------------------- */

function extrairNumero(texto: string): string | null {
  const m =
    /(?:nf[.\s-]?e?|n[úu]mero|numero|nota\s*fiscal|no\.?)\s*(?:n[úu]mero|numero)?[.:\s]*"?(\d{1,12})/i.exec(texto);
  return m ? m[1] : null;
}

function extrairValorTotal(texto: string): number | null {
  const m = /(?:valor\s*)?total(?:\s*(?:da\s*)?nota)?[:\s]*r?\$?\s*([\d.,]+)/i.exec(texto);
  if (!m) return null;
  const numero = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

function extrairFornecedor(texto: string): string | null {
  // Procura a linha que rotula o emitente/fornecedor e pega a linha seguinte
  // (no texto do DANFE, o nome do emitente costuma vir na linha seguinte).
  const linhas = texto.split("\n");
  for (let i = 0; i < linhas.length; i++) {
    if (/(emitente|emitida?|fornecedor|destinat[aá]rio|prestador)/i.test(linhas[i])) {
      const proxima = (linhas[i + 1] ?? "").trim();
      if (proxima && proxima.length > 2 && !/^\d+$/.test(proxima)) {
        return proxima.slice(0, 200).replace(/\s{2,}/g, " ").trim();
      }
    }
  }
  return null;
}

function extrairEmissao(texto: string): string | null {
  const m = /\b(\d{2}\/\d{2}\/\d{4})\b/.exec(texto);
  if (!m) return null;
  const [d, mes, a] = m[1].split("/").map(Number);
  const data = new Date(a, mes - 1, d);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

/**
 * Linhas de itens do DANFE/NF-e em PDF costumam começar com `+`
 * (ex.: `+ 000001 COCA COLA 2L ... UN 10 5,00 50,00`). Heurística:
 * código (1º token), descrição (meio), e os 4 últimos tokens são
 * unidade, quantidade, valor unitário e valor total.
 */
function extrairItens(texto: string): ItemNotaFiscal[] {
  const itens: ItemNotaFiscal[] = [];
  for (const linha of texto.split("\n")) {
    const limpa = linha.trim();
    if (!limpa.startsWith("+")) continue;
    const tokens = limpa.split(/\s+/).filter(Boolean);
    if (tokens.length < 6) continue;
    const valorTotal = parseFloat((tokens[tokens.length - 1] ?? "").replace(",", "."));
    const quantidade = parseFloat((tokens[tokens.length - 3] ?? "").replace(",", "."));
    if (!Number.isFinite(valorTotal) || !Number.isFinite(quantidade) || quantidade <= 0) continue;
    const nome = tokens.slice(2, tokens.length - 3).join(" ").replace(/\s+/g, " ").trim();
    if (nome.length < 2) continue;
    itens.push({ nome, quantidade, valorTotal: Math.round(valorTotal * 100) / 100 });
    if (itens.length >= 60) break;
  }
  return itens;
}

/* ------------------------ Interpretação (IA + fallback) ------------------------ */

const PROMPT_NOTA = `Você recebe o texto extraído de uma nota fiscal (NF-e/DANFE) de entrada (compra de fornecedor). Extraia os dados e responda APENAS um JSON válido no formato:
{"numero": "123456", "serie": "1", "fornecedor": "NOME DO FORNECEDOR", "emissao": "AAAA-MM-DD", "valor": 1234.56, "itens": [{"nome": "PRODUTO", "quantidade": 10, "valorTotal": 123.45}]}
Regras:
- "valor" é o total da nota. "itens" é a lista de produtos comprados (nome, quantidade e valor total de CADA linha). Se não conseguir distinguir os itens, deixe "itens": [].
- Não invente: se um campo não aparecer no texto, use "" para texto e 0 para número.
- Texto da nota:
`;

function validarDadosNota(bruto: unknown): DadosNotaFiscal | null {
  if (!bruto || typeof bruto !== "object") return null;
  const b = bruto as Record<string, unknown>;
  const fornecedor = String(b.fornecedor ?? "").trim();
  const numero = String(b.numero ?? "").trim();
  const valor = Number(b.valor);
  if (!fornecedor || !numero || !Number.isFinite(valor) || valor <= 0) return null;
  const itens = Array.isArray(b.itens)
    ? (b.itens as Record<string, unknown>[])
        .map((i) => ({
          nome: String(i.nome ?? "").trim().slice(0, 200),
          quantidade: Number(i.quantidade),
          valorTotal: Number(i.valorTotal),
        }))
        .filter((i) => i.nome && Number.isFinite(i.quantidade) && Number.isFinite(i.valorTotal))
    : [];
  const emissao = b.emissao ? new Date(String(b.emissao)).toISOString() : new Date().toISOString();
  return {
    numero: numero.slice(0, 20),
    serie: b.serie ? String(b.serie).slice(0, 20) : "1",
    fornecedor: fornecedor.slice(0, 200),
    emissao,
    itens: itens.slice(0, 60),
    valor: Math.round(valor * 100) / 100,
  };
}

function interpretarNotaFiscalSemIa(texto: string): DadosNotaFiscal | null {
  const numero = extrairNumero(texto);
  const fornecedor = extrairFornecedor(texto);
  const valor = extrairValorTotal(texto);
  if (!numero || !fornecedor || !valor) return null;
  const itens = extrairItens(texto);
  return {
    numero,
    serie: "1",
    fornecedor,
    emissao: extrairEmissao(texto) ?? new Date().toISOString(),
    itens,
    valor,
  };
}

/**
 * Interpreta o texto de uma nota fiscal. IA primeiro (quando configurada e
 * dentro do limite mensal); sem IA, heurística determinística (número,
 * fornecedor, valor e itens do DANFE). Retorna `null` se não der para
 * extrair dados confiáveis — quem chama avisa o usuário e guarda o arquivo
 * mesmo assim (nunca perde o documento).
 */
export async function interpretarNotaFiscalPorTexto(empresaId: string, texto: string): Promise<DadosNotaFiscal | null> {
  if (!(await limiteIaExcedido(empresaId).catch(() => false))) {
    const resposta = await chamarIA("copiloto_empresa", {
      prompt: `${PROMPT_NOTA}\n${texto.slice(0, 12000)}`,
      temperatura: 0,
      json: true,
      timeoutMs: 20000,
    });
    if (resposta) {
      registrarUsoIA(empresaId, "copiloto", { tokensEntrada: resposta.tokensEntrada, tokensSaida: resposta.tokensSaida }).catch(() => null);
      const limpo = resposta.texto.replace(/```json|```/g, "").trim();
      try {
        const validado = validarDadosNota(JSON.parse(limpo));
        if (validado) return validado;
      } catch {
        /* JSON inválido → cai para a heurística */
      }
    }
  }
  return interpretarNotaFiscalSemIa(texto);
}

/**
 * Tenta extrair dados de nota fiscal a partir de uma FOTO/IMAGEM da nota
 * (visão). Sem IA configurada não há como interpretar — retorna `null`.
 */
export async function interpretarNotaFiscalPorImagem(empresaId: string, bytes: Buffer, mime: string): Promise<DadosNotaFiscal | null> {
  const resposta = await chamarIAVisao("copiloto_empresa", {
    prompt: `${PROMPT_NOTA}\n(Imagem da nota fiscal)`,
    temperatura: 0,
    json: true,
    timeoutMs: 30000,
    imagens: [{ mime, bytes }],
  });
  if (!resposta) return null;
  registrarUsoIA(empresaId, "copiloto", { tokensEntrada: resposta.tokensEntrada, tokensSaida: resposta.tokensSaida }).catch(() => null);
  const limpo = resposta.texto.replace(/```json|```/g, "").trim();
  try {
    return validarDadosNota(JSON.parse(limpo));
  } catch {
    return null;
  }
}

/** Transcrição de áudio (voz) via IA configurada. `null` sem IA ou em falha. */
export async function transcreverAudioAnexo(empresaId: string, bytes: Buffer, mime: string): Promise<string | null> {
  const resposta = await transcreverAudio("copiloto_empresa", {
    mime,
    bytes,
    prompt: "Transcreva este áudio (áudio de dono de restaurante dando comandos ou perguntas para um assistente).",
    timeoutMs: 30000,
  });
  if (!resposta) return null;
  const texto = resposta.texto.trim();
  return texto.length > 0 ? texto.slice(0, 4000) : null;
}

/** Extrai o texto de um PDF (usa pdf-parse — ver extrair-pdf.ts). */
export async function extrairTextoDoPdf(bytes: Buffer): Promise<string> {
  const resultado = await pdfParse(bytes);
  return resultado.text ?? "";
}

/** Descrição genérica de uma imagem via visão (sem IA → null). */
export async function descreverImagem(empresaId: string, bytes: Buffer, mime: string): Promise<string | null> {
  const resposta = await chamarIAVisao("copiloto_empresa", {
    prompt: "Descreva em 1 parágrafo curto o que aparece nesta imagem (se for nota fiscal/recibo, mencione). Responda em português.",
    temperatura: 0,
    timeoutMs: 30000,
    imagens: [{ mime, bytes }],
  });
  if (!resposta) return null;
  registrarUsoIA(empresaId, "copiloto", { tokensEntrada: resposta.tokensEntrada, tokensSaida: resposta.tokensSaida }).catch(() => null);
  const descricao = resposta.texto.trim();
  return descricao.length > 0 ? descricao.slice(0, 600) : null;
}

/* ----------------------- Monta a proposta da nota fiscal ----------------------- */

function normalizarNome(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Cruza os itens da nota com os produtos cadastrados no estoque da empresa
 * e monta as ações da PRÉVIA: primeiro `registrar_nota_fiscal` (carrega o
 * documento salvo no bucket privado) e, para cada item que BATE com um
 * produto de estoque, uma `entrada_estoque` vinculada à nota. Itens sem
 * correspondência NÃO geram entrada — voltam como `aviso` para o usuário
 * decidir (nada é criado sem confirmação explícita).
 */
export async function montarPropostaNotaFiscal(
  empresaId: string,
  dados: DadosNotaFiscal,
  documento: { caminho: string; mime: string; nome: string }
): Promise<{ acoes: import("@/lib/copiloto/acoes").AcaoOperacional[]; itensSemEstoque: string[] }> {
  const produtos = await prisma.estoqueProduto.findMany({
    where: { empresaId, ativo: true },
    select: { id: true, nome: true },
  });
  const normalizados = new Map(produtos.map((p) => [normalizarNome(p.nome), p.nome]));

  const acoes: import("@/lib/copiloto/acoes").AcaoOperacional[] = [
    {
      tipo: "registrar_nota_fiscal",
      nota: {
        numero: dados.numero,
        serie: dados.serie ?? "1",
        fornecedor: dados.fornecedor,
        emissao: dados.emissao,
        itens: dados.itens.length,
        valor: dados.valor,
      },
      documento,
    },
  ];

  const itensSemEstoque: string[] = [];
  for (const item of dados.itens) {
    const chave = normalizarNome(item.nome);
    const produto = normalizados.get(chave)
      ?? (chave.length >= 4 ? normalizados.get([...normalizados.keys()].find((k) => k.includes(chave) || chave.includes(k)) ?? "") : undefined);
    if (produto) {
      acoes.push({
        tipo: "entrada_estoque",
        nomeProduto: produto,
        quantidade: item.quantidade,
        fornecedor: dados.fornecedor,
        valorTotal: item.valorTotal,
        notaRef: true,
      });
    } else {
      itensSemEstoque.push(item.nome);
    }
  }

  return { acoes, itensSemEstoque };
}

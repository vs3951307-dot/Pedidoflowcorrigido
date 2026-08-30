/**
 * Parser do texto extraído de um cardápio (PDF real ou imagem via OCR) para
 * a importação em massa de produtos — usado em Configurações → Produtos
 * ("Importar cardápio").
 *
 * É código CLIENTE puro (não importa Prisma/servidor): roda no navegador
 * para pré-visualizar os itens antes da importação.
 *
 * Formatos aceitos (uma linha por item — o texto vem de OCR/PDF e pode
 * conter erros; a revisão na tela permite conferir antes de importar):
 *
 *   Categoria: Pizzas salgadas
 *   Sabor: Calabresa, Mussarela, Portuguesa
 *   Adicional: Queijo R$ 4,00
 *   Pizza Calabresa: 32,90
 *   Coxinha: 6,00
 *   Fatia de pizza (M) 8,00
 *   Pizza Calabresa: M 32,90 | G 42,90
 *   Pizza Portuguesa | M R$ 32,90 | G R$ 42,90
 *   Coca-Cola 2L 8,00
 */

export interface TamanhoImportacao {
  nome: string;
  valor: number;
}

export interface ItemCardapioImportacao {
  nome: string;
  categoria: string;
  descricao?: string;
  tamanhos: TamanhoImportacao[];
}

export interface AdicionalImportacao {
  nome: string;
  valor: number;
}

export interface AnaliseCardapio {
  itens: ItemCardapioImportacao[];
  adicionais: AdicionalImportacao[];
  sabores: string[];
  erros: string[];
}

const CATEGORIA_PADRAO = "Geral";

/** Tamanhos escritos por extenso/abreviado reconhecidos como "tamanho" (e não parte do nome). */
const TAMANHOS_CONHECIDOS = new Set([
  "p", "m", "g", "pp", "gg", "xl", "xgg", "xxl",
  "mini", "pequeno", "pequena", "media", "média", "medio", "médio",
  "grande", "familia", "família", "brotinho", "fatia", "unidade",
  "unico", "único", "copo", "taca", "taça", "jarra", "pote",
  "caixa", "combo", "casal", "duplo", "dupla", "individual",
]);

function normalizarParaComparar(texto: string): string {
  return texto.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function tamanhoEhConhecido(palavra: string): boolean {
  const chave = normalizarParaComparar(palavra);
  if (TAMANHOS_CONHECIDOS.has(chave)) return true;
  return /^[0-9]{1,3}\s?(cm|ml|l|kg|g)$/i.test(palavra.trim());
}

/** "m" → "M", "média" → "Média" — exibe o tamanho de forma consistente no PDV/WhatsApp. */
function titulo(nome: string): string {
  const t = nome.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Remove marcadores de lista e pontuação residual do começo/fim do nome. */
function limparNome(texto: string): string {
  return texto
    .replace(/^[\s•▪··•\-–—*>]+/, "")
    .replace(/[\s:;|]+$/, "")
    .trim();
}

/** "12,50" | "12.50" | "R$ 8" → 8. `null` quando não é um preço válido. */
function interpretarPreco(texto: string): number | null {
  const t = texto.trim().replace(/\s+/g, "");
  if (!/^[0-9]+([.,][0-9]{1,2})?$/.test(t)) return null;
  let valor: number;
  if (t.includes(",")) {
    valor = Number(t.replace(/\./g, "").replace(",", "."));
  } else if (t.includes(".")) {
    valor = Number(t);
  } else {
    valor = Number(t);
  }
  if (!Number.isFinite(valor) || valor < 0) return null;
  return Math.round(valor * 100) / 100;
}

function montarItem(
  nomeCru: string,
  tamanhos: { nome: string; valor: number | null }[],
  categoria: string
): ItemCardapioImportacao | null {
  const nome = limparNome(nomeCru);
  if (!nome || nome.length > 120) return null;
  const validos = tamanhos.filter((t): t is { nome: string; valor: number } => t.valor !== null);
  if (validos.length === 0) return null;
  return { nome, categoria, tamanhos: validos };
}

/** Linha única (sem "|") → um produto com um tamanho (ou um tamanho explícito + preço). */
function parsearLinhaUnica(linha: string, categoria: string): ItemCardapioImportacao | null {
  // 1) "Fatia (M) 8,00" — tamanho entre parênteses no fim.
  let m = linha.match(/^(.*?)\s*\(([^()]{1,20})\)\s*(?:R\$\s*)?([0-9][0-9.,]*)\s*$/);
  if (m && tamanhoEhConhecido(m[2])) {
    return montarItem(m[1], [{ nome: titulo(m[2]), valor: interpretarPreco(m[3]) }], categoria);
  }

  // 2) "Pizza M 32,90" / "Coca-Cola 2L 8,00" — palavra de tamanho + preço.
  m = linha.match(
    /^(.*?)\s+([0-9]{1,3}\s?(?:cm|ml|l|kg|g)|[^\s]{1,14})\s+(?:R\$\s*)?([0-9][0-9.,]*)\s*$/i
  );
  if (m && tamanhoEhConhecido(m[2])) {
    return montarItem(m[1], [{ nome: titulo(m[2]), valor: interpretarPreco(m[3]) }], categoria);
  }

  // 3) "Pizza Calabresa: 32,90" / "Coxinha - 6,00" — preço no fim da linha.
  m = linha.match(/^(.*?)(?:R\$\s*)?([0-9][0-9.,]*)\s*$/);
  if (m && m[2]) {
    const valor = interpretarPreco(m[2]);
    if (valor !== null) {
      return montarItem(m[1], [{ nome: "Único", valor }], categoria);
    }
  }

  return null;
}

/** Linha com "|" → um produto com vários tamanhos: "Nome | M 32,90 | G 42,90". */
function parsearLinhaMultipla(
  segmentos: string[],
  categoria: string,
  erros: string[]
): ItemCardapioImportacao | null {
  const nome = limparNome(segmentos[0]);
  const tamanhos: { nome: string; valor: number | null }[] = [];
  for (const seg of segmentos.slice(1)) {
    const m = seg.match(/^\s*(.+?)\s*(?:R\$\s*)?([0-9][0-9.,]*)\s*$/);
    if (!m) {
      erros.push(seg.trim());
      continue;
    }
    const nomeTamanho = limparNome(m[1]);
    if (!nomeTamanho) {
      erros.push(seg.trim());
      continue;
    }
    tamanhos.push({ nome: titulo(nomeTamanho), valor: interpretarPreco(m[2]) });
  }
  return montarItem(nome, tamanhos, categoria);
}

/**
 * Converte o texto bruto do cardápio em itens estruturados.
 * Linhas que não parecem produto nem cabeçalho vão para `erros` (revisão).
 */
export function analisarCardapioTexto(texto: string): AnaliseCardapio {
  const itens: ItemCardapioImportacao[] = [];
  const adicionais: AdicionalImportacao[] = [];
  const sabores: string[] = [];
  const erros: string[] = [];
  let categoriaAtual = CATEGORIA_PADRAO;

  for (const linhaCrua of texto.split(/\r?\n/)) {
    const linha = linhaCrua.trim();
    if (!linha) continue;

    // Cabeçalho de categoria — "Categoria: Pizzas" ou "Pizzas salgadas:"
    let m = linha.match(/^categorias?\s*[:=-]\s*(.+)$/i);
    if (m) {
      const nome = m[1].trim().slice(0, 60);
      if (nome) categoriaAtual = nome;
      continue;
    }
    m = linha.match(/^(.+?)\s*:\s*$/);
    if (m && !/[0-9]/.test(m[1])) {
      const nome = m[1].trim().slice(0, 60);
      if (nome) categoriaAtual = nome;
      continue;
    }

    // Lista de sabores — "Sabor: Calabresa, Mussarela"
    m = linha.match(/^sabor(es)?\s*[:=-]\s*(.+)$/i);
    if (m) {
      for (const parte of m[2].split(/[,;|]/)) {
        const nome = limparNome(parte.replace(/\s*R\$\s*[0-9][0-9.,]*\s*$/i, ""));
        const chave = normalizarParaComparar(nome);
        if (
          nome &&
          nome.length <= 60 &&
          !sabores.some((s) => normalizarParaComparar(s) === chave)
        ) {
          sabores.push(nome);
        }
      }
      continue;
    }

    // Adicionais com preço — "Adicional: Queijo R$ 4,00" / "Borda R$ 6,00"
    m = linha.match(/^adiciona(l|is)?\s*[:=-]\s*(.+)$/i);
    if (m) {
      for (const parte of m[2].split(/[,;|]/)) {
        const am = parte.trim().match(/^(.*?)\s*(?:R\$\s*)?([0-9][0-9.,]*)\s*$/);
        if (!am) continue;
        const nome = limparNome(am[1]);
        const valor = interpretarPreco(am[2]);
        if (nome && nome.length <= 60 && valor !== null) {
          adicionais.push({ nome, valor });
        }
      }
      continue;
    }

    // Linha de produto.
    const segmentos = linha.split("|");
    const item =
      segmentos.length > 1
        ? parsearLinhaMultipla(segmentos, categoriaAtual, erros)
        : parsearLinhaUnica(linha, categoriaAtual);
    if (item) {
      itens.push(item);
    } else if (linha.replace(/[^A-Za-zÀ-ú0-9]/g, "").length >= 2) {
      erros.push(linha);
    }
  }

  return { itens, adicionais, sabores, erros };
}

/** Emoji padrão do produto importado, conforme a categoria. */
export function emojiParaCategoria(categoria: string): string {
  const c = normalizarParaComparar(categoria);
  if (c.includes("pizza")) return "🍕";
  if (c.includes("bebida") || c.includes("refrigerante") || c.includes("suco") || c.includes("agua") || c.includes("cerveja")) return "🥤";
  if (c.includes("sobremesa") || c.includes("doce") || c.includes("sorvete")) return "🍰";
  if (c.includes("sanduiche") || c.includes("lanche") || c.includes("burger") || c.includes("hamburguer")) return "🍔";
  if (c.includes("entrada") || c.includes("porcao") || c.includes("petisco")) return "🍢";
  return "🍽️";
}

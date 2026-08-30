/**
 * Ações OPERACIONAIS do Copiloto da Empresa (estoque, disponibilidade)
 * — o fluxo obrigatório é sempre:
 *
 *   instrução (texto/áudio transcrito/foto interpretada)
 *     → PRÉVIA estruturada mostrada ao usuário
 *     → confirmação explícita
 *     → só então executa a Tool
 *
 * Nada extraído de IA (foto, áudio ou texto) altera o banco sem essa
 * confirmação. A proposta fica guardada NO SERVIDOR
 * (`AcaoPendenteCopiloto`), com validade curta e vinculada ao usuário
 * que pediu — a confirmação só manda o `actionId`, nunca a lista de
 * ações (que poderia ser adulterada no cliente).
 *
 * `empresaId` SEMPRE vem de `autorizar()` (sessão do servidor) — nunca
 * do prompt, da foto, do áudio ou do corpo da requisição.
 */

import { prisma } from "@/lib/prisma";
import type { UsuarioComPermissoes } from "@/lib/permissao";
import { parseModulos } from "@/lib/modulos";
import {
  registrarEntradaEstoque,
  ajustarQuantidadeEstoque,
  definirDisponibilidadeProduto,
  type ResultadoTool,
} from "@/lib/copiloto/tools-estoque";

export type AcaoOperacional =
  | { tipo: "entrada_estoque"; nomeProduto: string; quantidade: number; fornecedor?: string; valorTotal?: number; notaRef?: boolean }
  | { tipo: "ajustar_estoque"; nomeProduto: string; novaQuantidade: number }
  | { tipo: "definir_disponibilidade"; nomeProduto: string; disponivel: boolean }
  | {
      tipo: "registrar_nota_fiscal";
      nota: { numero: string; serie?: string; fornecedor: string; emissao: string; itens: number; valor: number };
      /** Documento original vinculado à nota (PDF/foto) — salvo no bucket privado antes da proposta. */
      documento?: { caminho: string; mime: string; nome: string };
    };

export interface PropostaOperacional {
  acoes: AcaoOperacional[];
  rotulos: string[]; // frases prontas para a prévia ("Adicionar 10 un. de Coca-Cola 2L ao estoque")
}

/** Frase legível de uma ação — é o que o usuário vê ANTES de confirmar. */
export function rotuloDaAcao(acao: AcaoOperacional): string {
  switch (acao.tipo) {
    case "entrada_estoque":
      return `Adicionar ${acao.quantidade} de "${acao.nomeProduto}" ao estoque${acao.fornecedor ? ` (fornecedor: ${acao.fornecedor})` : ""}`;
    case "ajustar_estoque":
      return `Definir o estoque de "${acao.nomeProduto}" como ${acao.novaQuantidade}`;
    case "definir_disponibilidade":
      return `Marcar "${acao.nomeProduto}" como ${acao.disponivel ? "DISPONÍVEL" : "INDISPONÍVEL"} no cardápio`;
    case "registrar_nota_fiscal":
      return `Registrar NF-e ${acao.nota.numero} — ${acao.nota.fornecedor} (${acao.nota.itens} itens, R$ ${Number(acao.nota.valor).toFixed(2)})`;
  }
}

/**
 * Interpretador determinístico (sem IA) — cobre as frases mais comuns
 * do dia a dia. Sempre disponível, sem custo e sem depender de API
 * externa. Quando há IA configurada, ela é usada ANTES disto (ver
 * `interpretarComIA` no chamador) e o resultado dela é validado contra
 * este mesmo formato de ação.
 */
export function interpretarOperacaoPorTexto(texto: string): PropostaOperacional {
  const t = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const acoes: AcaoOperacional[] = [];

  // "acabou X" / "tira X do cardapio" / "X indisponivel"
  const acabou = texto.match(/(?:acabou|acabaram|tira[r]?|remove[r]?|sem)\s+(?:a\s+|o\s+|as\s+|os\s+)?([a-zA-ZÀ-ú0-9\s]{2,40}?)(?:\s+(?:hoje|do cardapio|do cardápio|da carta)|[,.]|$)/i);
  if (acabou && /(acabou|acabaram|tira|remove|sem)/.test(t) && !/chegou|chegaram|recebi/.test(t)) {
    acoes.push({ tipo: "definir_disponibilidade", nomeProduto: acabou[1].trim(), disponivel: false });
  }

  // "voltou X" / "coloca X de volta" / "X disponivel"
  const voltou = texto.match(/(?:voltou|volta|reativa[r]?|libera[r]?)\s+(?:a\s+|o\s+)?([a-zA-ZÀ-ú0-9\s]{2,40}?)(?:[,.]|$)/i);
  if (voltou && /(voltou|volta|reativa|libera)/.test(t)) {
    acoes.push({ tipo: "definir_disponibilidade", nomeProduto: voltou[1].trim(), disponivel: true });
  }

  // "chegaram 10 coca-cola" / "recebi 20 caixas de X"
  const chegou = texto.match(/(?:chegou|chegaram|recebi|recebemos|entrou)\s+(\d+[.,]?\d*)\s+(?:un[.]?|unidades?|caixas?|pacotes?|kg|litros?|l|de\s+)?\s*(?:de\s+)?([a-zA-ZÀ-ú0-9\s]{2,40}?)(?:[,.]|$)/i);
  if (chegou) {
    const quantidade = parseFloat(chegou[1].replace(",", "."));
    if (Number.isFinite(quantidade) && quantidade > 0) {
      acoes.push({ tipo: "entrada_estoque", nomeProduto: chegou[2].trim(), quantidade });
    }
  }

  // "coloca X como 30" / "estoque de X e 30"
  const ajuste = texto.match(/estoque\s+d[eo]\s+([a-zA-ZÀ-ú0-9\s]{2,40}?)\s+(?:e|eh|é|para|=)\s+(\d+[.,]?\d*)/i);
  if (ajuste) {
    const novaQuantidade = parseFloat(ajuste[2].replace(",", "."));
    if (Number.isFinite(novaQuantidade) && novaQuantidade >= 0) {
      acoes.push({ tipo: "ajustar_estoque", nomeProduto: ajuste[1].trim(), novaQuantidade });
    }
  }

  return { acoes, rotulos: acoes.map(rotuloDaAcao) };
}

/** Guarda a proposta no servidor e devolve o `actionId` usado para confirmar depois. */
export async function criarPropostaOperacional(
  empresaId: string,
  solicitanteId: string,
  instrucaoOriginal: string,
  acoes: AcaoOperacional[],
  opcoes: { origem?: "empresa" | "whatsapp" } = {}
): Promise<string> {
  const pendente = await prisma.acaoPendenteCopiloto.create({
    data: {
      origem: opcoes.origem ?? "empresa",
      solicitanteId,
      empresaId,
      instrucaoOriginal,
      acoes: JSON.stringify(acoes),
      expiraEm: new Date(Date.now() + 10 * 60 * 1000),
    },
  });
  return pendente.id;
}

/** Onde ações que MEXEM no estoque são executadas (ferramentas). */
const ACAO_MUTA_ESTOQUE: AcaoOperacional["tipo"][] = ["entrada_estoque", "ajustar_estoque", "definir_disponibilidade"];

/**
 * Executa a proposta guardada no servidor (JÁ validada quanto a dono e
 * empresa). `selecionados` (opcional) filtra quais ações aplicar — usado
 * pela prévia com checkboxes; o cliente só envia ÍNDICES, nunca o
 * conteúdo das ações (que viria adulterável). Ação de nota fiscal, se
 * selecionada, é criada ANTES das entradas de estoque para poder
 * vinculá-las via `notaId`.
 */
async function executarProposta(
  pendente: { id: string; acoes: string },
  empresaId: string,
  usuario: UsuarioComPermissoes,
  selecionados?: number[]
): Promise<{ ok: boolean; motivo?: string; resultados?: ResultadoTool[] }> {
  const acoes = JSON.parse(pendente.acoes) as AcaoOperacional[];
  const indices = Array.isArray(selecionados)
    ? [...new Set(selecionados.map((i) => Number(i)).filter((i) => Number.isInteger(i) && i >= 0 && i < acoes.length))]
    : acoes.map((_, i) => i);
  const aExecutar = acoes.filter((_, i) => indices.includes(i));

  if (aExecutar.some((a) => ACAO_MUTA_ESTOQUE.includes(a.tipo))) {
    const empresa = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { modulos: true } });
    const modulosAtivos = parseModulos(empresa?.modulos ?? "[]");
    if (!modulosAtivos.includes("estoque")) {
      return { ok: false, motivo: "O módulo Estoque não está disponível no plano desta empresa." };
    }
  }

  const resultados: ResultadoTool[] = [];

  // Cria a nota fiscal (se selecionada) antes das entradas, para vincular notaId.
  let notaCriada: { id: string } | null = null;
  const acaoNota = aExecutar.find((a): a is Extract<AcaoOperacional, { tipo: "registrar_nota_fiscal" }> => a.tipo === "registrar_nota_fiscal");
  if (acaoNota) {
    try {
      notaCriada = await prisma.notaFiscal.create({
        data: {
          empresaId,
          numero: acaoNota.nota.numero,
          serie: acaoNota.nota.serie ?? "1",
          fornecedor: acaoNota.nota.fornecedor,
          emissao: new Date(acaoNota.nota.emissao),
          itens: Math.max(0, acaoNota.nota.itens),
          valor: Math.max(0, acaoNota.nota.valor),
          status: "conferida",
          documentoCaminho: acaoNota.documento?.caminho ?? null,
          documentoMime: acaoNota.documento?.mime ?? null,
          documentoNome: acaoNota.documento?.nome ?? null,
        },
      });
      resultados.push({
        ok: true,
        mensagem: `Nota fiscal ${acaoNota.nota.numero} (${acaoNota.nota.fornecedor}) registrada com R$ ${Number(acaoNota.nota.valor).toFixed(2)}.`,
      });
    } catch (erro) {
      resultados.push({ ok: false, mensagem: `Falha ao registrar a nota fiscal: ${erro instanceof Error ? erro.message : "erro interno"}` });
    }
  }

  for (const acao of aExecutar) {
    switch (acao.tipo) {
      case "entrada_estoque":
        resultados.push(
          await registrarEntradaEstoque(empresaId, usuario, {
            nomeProduto: acao.nomeProduto,
            quantidade: acao.quantidade,
            fornecedor: acao.fornecedor,
            valorTotal: acao.valorTotal,
            notaId: acao.notaRef && acaoNota ? (notaCriada?.id ?? null) : null,
          })
        );
        break;
      case "ajustar_estoque":
        resultados.push(
          await ajustarQuantidadeEstoque(empresaId, usuario, {
            nomeProduto: acao.nomeProduto,
            novaQuantidade: acao.novaQuantidade,
          })
        );
        break;
      case "definir_disponibilidade":
        resultados.push(
          await definirDisponibilidadeProduto(empresaId, usuario, {
            nomeProduto: acao.nomeProduto,
            disponivel: acao.disponivel,
          })
        );
        break;
      case "registrar_nota_fiscal":
        break; // já executada acima
    }
  }

  await prisma.acaoPendenteCopiloto.update({ where: { id: pendente.id }, data: { resolvida: true } });
  return { ok: true, resultados };
}

/**
 * Confirma e executa uma proposta operacional (painel). Valida três coisas
 * antes de tocar no banco: (1) a proposta existe; (2) foi feita por ESTE
 * usuário; (3) é da MESMA empresa da sessão atual — mesmo que alguém
 * consiga um `actionId` de outra empresa, a execução é recusada.
 * `selecionados` (índices) aplica só as ações marcadas na prévia.
 */
export async function confirmarPropostaOperacional(
  actionId: string,
  empresaId: string,
  usuario: UsuarioComPermissoes,
  selecionados?: number[]
): Promise<{ ok: boolean; motivo?: string; resultados?: ResultadoTool[] }> {
  const pendente = await prisma.acaoPendenteCopiloto.findUnique({ where: { id: actionId } });
  if (!pendente || pendente.solicitanteId !== usuario.id || pendente.empresaId !== empresaId) {
    return { ok: false, motivo: "Proposta não encontrada." };
  }
  if (pendente.resolvida) return { ok: false, motivo: "Esta ação já foi confirmada antes." };
  if (pendente.expiraEm < new Date()) return { ok: false, motivo: "A proposta expirou — peça de novo." };
  return executarProposta(pendente, empresaId, usuario, selecionados);
}

/**
 * Confirma uma proposta vinda do WHATSAPP. A proposta fica vinculada ao
 * telefone que enviou o documento (`solicitanteId = "whatsapp:" + telefone`),
 * então a confirmação é aceita por telefone + empresa — nunca por actionId
 * solto. Executa com um usuário sintético (o WhatsApp não tem sessão), mas
 * com o MESMO executor e as MESMAS validações de módulo da proposta do painel.
 */
export async function confirmarPropostaOperacionalWhatsApp(
  actionId: string,
  empresaId: string,
  telefone: string,
  selecionados?: number[]
): Promise<{ ok: boolean; motivo?: string; resultados?: ResultadoTool[] }> {
  const pendente = await prisma.acaoPendenteCopiloto.findUnique({ where: { id: actionId } });
  const dono = `whatsapp:${telefone.replace(/\D/g, "")}`;
  if (!pendente || pendente.solicitanteId !== dono || pendente.empresaId !== empresaId) {
    return { ok: false, motivo: "Proposta não encontrada." };
  }
  if (pendente.resolvida) return { ok: false, motivo: "Esta ação já foi confirmada antes." };
  if (pendente.expiraEm < new Date()) return { ok: false, motivo: "A proposta expirou — envie o documento de novo." };
  const usuarioSintetico: UsuarioComPermissoes = {
    id: dono,
    nome: "WhatsApp",
    email: "",
    papel: "ADMINISTRADOR",
    ativo: true,
  };
  return executarProposta(pendente, empresaId, usuarioSintetico, selecionados);
}

/** Última proposta WHATSAPP pendente de um telefone (para responder "confirmar"). */
export async function encontrarPropostaWhatsAppPendente(
  empresaId: string,
  telefone: string
): Promise<{ id: string; acoes: string } | null> {
  const dono = `whatsapp:${telefone.replace(/\D/g, "")}`;
  return prisma.acaoPendenteCopiloto.findFirst({
    where: { origem: "whatsapp", empresaId, solicitanteId: dono, resolvida: false, expiraEm: { gt: new Date() } },
    orderBy: { criadaEm: "desc" },
    select: { id: true, acoes: true },
  });
}

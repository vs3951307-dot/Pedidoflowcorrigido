/**
 * Tools do agente WhatsApp (Fase 4).
 *
 * Cada tool é uma ação que o agente pode chamar via tool calling.
 * O LLM decide QUAL tool chamar; o código executa e valida.
 *
 * REGRAS:
 * - NUNCA inventar dados: tudo vem do banco.
 * - Cada tool retorna `{ ok, mensagem, estadoAtualizado? }`.
 * - Falhas viram "Vou chamar um humano" — nunca erro exposto.
 */

import { prisma } from "@/lib/prisma";
import {
  buscarProdutos,
  listarProdutosDisponiveis,
  listarAdicionais,
  listarFormasPagamento,
  nomeFantasia,
} from "@/lib/atendente/catalogo";
import { verificarDisponibilidade } from "@/lib/atendente/disponibilidade";
import { calcularPrecoItem } from "@/lib/precificacao";
import { calcularTaxaEntrega, lerConfigTaxaEntrega } from "@/lib/delivery";
import { criarPedido } from "@/lib/pedidos/criar-pedido";
import { novaChaveIdempotencia } from "@/lib/idempotencia";

/* -------------------------------- Tipos ----------------------------------- */

export interface ResultadoTool {
  ok: boolean;
  mensagem: string;
  /** Estado atualizado que o agente deve persistir (merge parcial). */
  estadoAtualizado?: Record<string, unknown>;
}

export interface ContextoTool {
  empresaId: string;
  telefone: string;
  estado: {
    itens: Array<{
      produtoId: string;
      nome: string;
      precoUnit: number;
      quantidade: number;
      tamanho: string | null;
      sabores: string[];
      adicionais: { nome: string; preco: number }[];
    }>;
    atual?: {
      produtoId: string;
      nome: string;
      precoBase: number;
      temTamanhos: boolean;
      temSabores: boolean;
      sabores: { nome: string; tipo: string }[];
      tamanhos: { nome: string; valor: number }[];
      tamanho?: { nome: string; valor: number };
      saboresEscolhidos: string[];
      saboresFaltando?: number;
      adicionais: { nome: string; preco: number }[];
      quantidade?: number;
    };
    canal?: "entrega" | "retirada";
    endereco?: { rua: string; bairro: string };
    taxa?: number;
    formaPagamento?: string;
    cliente?: { nome: string | null; telefone: string };
    tentativas: number;
    chaveIdempotencia?: string;
    pedidoId?: string;
  };
}

/* -------------------------------- Helpers --------------------------------- */

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function erro(msg: string): ResultadoTool {
  return { ok: false, mensagem: msg };
}

function ok(msg: string, estado?: Record<string, unknown>): ResultadoTool {
  return { ok: true, mensagem: msg, estadoAtualizado: estado };
}

/* ---------------------------------- Tools --------------------------------- */

/** Lista resumo do cardápio (por categoria). */
async function listarCardapio(ctx: ContextoTool): Promise<ResultadoTool> {
  const produtos = await listarProdutosDisponiveis(ctx.empresaId);
  if (produtos.length === 0) return ok("O cardápio está vazio no momento.");

  const porCategoria = new Map<string, string[]>();
  for (const p of produtos) {
    const linha = `${p.emoji} ${p.nome} — ${brl(p.precoBase)}${p.destaque ? " ⭐" : ""}`;
    porCategoria.set(p.categoria, [...(porCategoria.get(p.categoria) ?? []), linha]);
  }
  const texto = [...porCategoria.entries()]
    .map(([cat, linhas]) => `*${cat}*\n${linhas.join("\n")}`)
    .join("\n\n");
  return ok(texto);
}

/** Busca produto por termo (parcial ou exato). */
async function buscarProduto(ctx: ContextoTool, termo: string): Promise<ResultadoTool> {
  if (!termo || termo.length < 2) return erro("Preciso de pelo menos 2 letras para buscar.");

  // Defesa técnica: palavras genéricas NÃO são nomes de produto.
  // Mesmo que o LLM erre e chame buscar_produto("pizza"), a tool redireciona.
  const PALAVRAS_GENERICAS = new Set([
    "pizza", "pizzas", "pedido", "quero pedir", "quero", "cardápio",
    "cardapio", "comida", "lanche", "lanches", "promoção", "promocao",
    "delivery", "retirada", "pedido", "fazer pedido", "ver cardapio",
  ]);
  const termoLimpo = termo.toLowerCase().trim();
  if (PALAVRAS_GENERICAS.has(termoLimpo)) {
    return ok(
      "Claro! Vamos fazer seu pedido. Você quer ver o cardápio ou já sabe qual pizza deseja?"
    );
  }

  const achados = await buscarProdutos(ctx.empresaId, termo, 5);
  if (achados.length === 0) return ok(`Não encontrei "${termo}" no cardápio. 🤔`);
  if (achados.length === 1) {
    const p = achados[0];
    let resp = `*${p.nome}* — a partir de *${brl(p.precoBase)}*`;
    if (p.tamanhos.length > 1) {
      resp += `\nTamanhos: ${p.tamanhos.map((t) => `${t.nome} (${brl(t.valor)})`).join(", ")}`;
    }
    if (p.sabores.length > 0) {
      resp += `\nSabores: ${p.sabores.map((s) => s.nome).join(", ")}`;
    }
    return ok(resp);
  }
  return ok(
    `Encontrei ${achados.length} itens:\n${achados.map((p, i) => `${i + 1}. ${p.nome} — ${brl(p.precoBase)}`).join("\n")}\n*(responda com o número)*`
  );
}

/** Retorna preço de um produto específico. */
async function verPreco(ctx: ContextoTool, produtoId: string): Promise<ResultadoTool> {
  const produto = await prisma.produto.findFirst({
    where: { id: produtoId, empresaId: ctx.empresaId, ativo: true },
    include: { precos: { include: { tamanho: true } } },
  });
  if (!produto) return erro("Produto não encontrado.");

  let resp = `*${produto.nome}* — a partir de *${brl(produto.preco)}*`;
  if (produto.precos.length > 1) {
    resp += `\n\nOpções:\n${produto.precos.map((p) => `• ${p.tamanho.nome} — ${brl(p.valor)}`).join("\n")}`;
  }
  return ok(resp);
}

/** Verifica disponibilidade de um produto (ficha técnica / estoque). */
async function verDisp(ctx: ContextoTool, produtoId: string): Promise<ResultadoTool> {
  const produto = await prisma.produto.findFirst({
    where: { id: produtoId, empresaId: ctx.empresaId, ativo: true },
    select: { id: true, nome: true },
  });
  if (!produto) return erro("Produto não encontrado.");

  const disp = await verificarDisponibilidade(ctx.empresaId, produtoId);
  if (disp.disponivel) {
    return ok(`*${produto.nome}* está disponível! ✅`);
  }
  return ok(`*${produto.nome}* está indisponível agora. ${disp.motivo ?? ""}`);
}

/** Seleciona um produto para pedir (inicia fluxo de montagem). */
async function selecionarProduto(ctx: ContextoTool, produtoId: string): Promise<ResultadoTool> {
  const produto = await prisma.produto.findFirst({
    where: { id: produtoId, empresaId: ctx.empresaId, ativo: true },
    include: {
      precos: { include: { tamanho: true }, orderBy: { tamanho: { fatorPreco: "asc" } } },
      sabores: { include: { sabor: true } },
    },
  });
  if (!produto) return ok("Esse item está indisponível no momento.");

  const disp = await verificarDisponibilidade(ctx.empresaId, produtoId);
  if (!disp.disponivel) {
    return ok(`*${produto.nome}* está indisponível agora. ${disp.motivo ?? ""}`);
  }

  const atual = {
    produtoId: produto.id,
    nome: produto.nome,
    precoBase: produto.preco,
    temTamanhos: produto.precos.length > 1,
    temSabores: produto.sabores.length > 0,
    sabores: produto.sabores.map((ps) => ({ nome: ps.sabor.nome, tipo: ps.sabor.tipo })),
    tamanhos: produto.precos.map((pt) => ({ nome: pt.tamanho.nome, valor: pt.valor })),
    saboresEscolhidos: [] as string[],
    adicionais: [] as { nome: string; preco: number }[],
  };

  let pergunta = "";
  let etapa = "adicionais";
  if (atual.temTamanhos) {
    pergunta = `Qual tamanho de *${atual.nome}*?\n${atual.tamanhos.map((t, i) => `${i + 1}. ${t.nome} — ${brl(t.valor)}`).join("\n")}`;
    etapa = "tamanho";
  } else if (atual.temSabores) {
    pergunta = `*${atual.nome}* tem os sabores:\n${atual.sabores.map((s, i) => `${i + 1}. ${s.nome} (${s.tipo})`).join("\n")}\n\nQuer *1* ou *2* sabores?`;
    etapa = "sabores";
  } else {
    pergunta = "Pode pedir *adicionais*? Responda *0* para nenhum.";
  }

  return ok(pergunta, { atual });
}

/** Escolhe o tamanho de um produto. */
async function escolherTamanho(ctx: ContextoTool, tamanhoIndex: number): Promise<ResultadoTool> {
  if (!ctx.estado.atual) return ok("Qual produto você quer?");
  const tamanhos = ctx.estado.atual.tamanhos;
  if (tamanhoIndex < 0 || tamanhoIndex >= tamanhos.length) {
    return ok(`Escolha um tamanho de 1 a ${tamanhos.length}.`);
  }
  const escolhido = tamanhos[tamanhoIndex];
  const atual = { ...ctx.estado.atual, tamanho: escolhido };

  if (atual.temSabores) {
    const lista = atual.sabores.map((s, i) => `${i + 1}. ${s.nome} (${s.tipo})`).join("\n");
    return ok(`Tamanho *${escolhido.nome}* anotado!\n\nQual sabor de *${atual.nome}*?\n${lista}`, { atual });
  }
  return ok("Pode pedir *adicionais*? Responda *0* para nenhum.", { atual });
}

/** Escolhe o sabor de um produto. */
async function escolherSabor(ctx: ContextoTool, saborIndex: number): Promise<ResultadoTool> {
  if (!ctx.estado.atual) return ok("Qual produto você quer?");
  const opcoes = ctx.estado.atual.sabores.filter((s) => !ctx.estado.atual!.saboresEscolhidos.includes(s.nome));
  if (saborIndex < 0 || saborIndex >= opcoes.length) {
    return ok(`Escolha um sabor de 1 a ${opcoes.length}.`);
  }
  const sabor = opcoes[saborIndex];
  const atual = { ...ctx.estado.atual };
  atual.saboresEscolhidos = [...atual.saboresEscolhidos, sabor.nome];
  atual.saboresFaltando = (atual.saboresFaltando ?? 1) - 1;

  if (atual.saboresFaltando > 0) {
    const restantes = atual.sabores.filter((s) => !atual.saboresEscolhidos.includes(s.nome));
    return ok(
      `Anotado: *${sabor.nome}*! Qual o segundo sabor?\n${restantes.map((s, i) => `${i + 1}. ${s.nome} (${s.tipo})`).join("\n")}`,
      { atual }
    );
  }
  return ok("Pode pedir *adicionais*? Responda *0* para nenhum.", { atual });
}

/** Escolhe um adicional. */
async function escolherAdicional(ctx: ContextoTool, adicionalIndex: number): Promise<ResultadoTool> {
  if (!ctx.estado.atual) return ok("Qual produto você quer?");
  if (adicionalIndex === -1) {
    // -1 = nenhum
    const atual = { ...ctx.estado.atual, adicionais: [] as { nome: string; preco: number }[] };
    return ok(`Quantas unidades de *${atual.nome}*?`, { atual });
  }
  const opcoes = await listarAdicionais(ctx.empresaId);
  if (adicionalIndex < 0 || adicionalIndex >= opcoes.length) {
    return ok(`Escolha um adicional de 1 a ${opcoes.length} ou *0* para nenhum.`);
  }
  const adicionado = opcoes[adicionalIndex];
  const atual = {
    ...ctx.estado.atual,
    adicionais: [...ctx.estado.atual.adicionais, { nome: adicionado.nome, preco: adicionado.preco }],
  };
  return ok(`*${adicionado.nome}* adicionado! Quantas unidades de *${atual.nome}*?`, { atual });
}

/** Define a quantidade de um item. */
async function definirQuantidade(ctx: ContextoTool, quantidade: number): Promise<ResultadoTool> {
  if (!ctx.estado.atual) return ok("Qual produto você quer?");
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 20) {
    return ok("Quantas unidades? (de 1 a 20)");
  }

  const atual = ctx.estado.atual;
  const precoUnit = calcularPrecoItem({
    precoBaseProduto: atual.precoBase,
    tamanho: atual.tamanho ?? null,
    adicionais: atual.adicionais,
  });

  const novoItem = {
    produtoId: atual.produtoId,
    nome: atual.nome,
    precoUnit,
    quantidade,
    tamanho: atual.tamanho?.nome ?? null,
    sabores: atual.saboresEscolhidos,
    adicionais: atual.adicionais,
  };

  const itens = [...ctx.estado.itens, novoItem];
  const subtotal = itens.reduce((acc, i) => acc + i.precoUnit * i.quantidade, 0);
  const chave = ctx.estado.chaveIdempotencia ?? novaChaveIdempotencia();

  return ok(
    `Anotado! *${quantidade}× ${atual.nome}* ${atual.tamanho ? `(${atual.tamanho.nome}) ` : ""}por ${brl(precoUnit)} cada. ✅\n*Subtotal: ${brl(subtotal)}*\n\nQuer mais alguma coisa? *(sim / não)*`,
    { itens, atual: undefined, chaveIdempotencia: chave }
  );
}

/** Escolhe entre entrega ou retirada. */
async function escolherCanal(ctx: ContextoTool, canal: "entrega" | "retirada"): Promise<ResultadoTool> {
  if (canal !== "entrega" && canal !== "retirada") {
    return ok("Será *entrega* ou *retirada*?");
  }
  if (canal === "retirada") {
    return ok("Beleza, *retirada*! Vou preparar seu pedido. 📦", { canal: "retirada" });
  }
  return ok("Qual o endereço de entrega? (rua, número e bairro)", { canal: "entrega" });
}

/** Define o endereço de entrega. */
async function definirEndereco(
  ctx: ContextoTool,
  rua: string,
  bairro: string
): Promise<ResultadoTool> {
  if (!rua || rua.length < 3) return ok("Preciso da rua e número.");
  if (!bairro || bairro.length < 2) return ok("E o *bairro*?");

  const config = await lerConfigTaxaEntrega(ctx.empresaId);
  const { taxa } = calcularTaxaEntrega(config, bairro, 0);
  const taxaFormatada = taxa === 0 ? "grátis" : brl(taxa);

  return ok(
    `📍 Entrega em: ${rua} — ${bairro}\nTaxa: *${taxaFormatada}*\n\nQual a forma de pagamento?\n${(await listarFormasPagamento(ctx.empresaId)).map((f, i) => `${i + 1}. ${f.label}`).join("\n")}`,
    { endereco: { rua, bairro }, taxa: Math.round(taxa * 100) / 100 }
  );
}

/** Escolhe a forma de pagamento. */
async function escolherPagamento(ctx: ContextoTool, forma: string): Promise<ResultadoTool> {
  const formas = await listarFormasPagamento(ctx.empresaId);
  const encontrada = formas.find(
    (f) => f.value.toLowerCase() === forma.toLowerCase() || f.label.toLowerCase() === forma.toLowerCase()
  );
  if (!encontrada) {
    return ok(`Qual forma de pagamento?\n${formas.map((f, i) => `${i + 1}. ${f.label}`).join("\n")}`);
  }

  if (encontrada.value === "dinheiro" && ctx.estado.canal === "entrega") {
    return ok(
      "Beleza, *dinheiro*! 💵 Vai precisar de troco? Se sim, de quanto? *(ex.: 100)*",
      { formaPagamento: encontrada.value }
    );
  }

  // Monta resumo para confirmação
  const subtotal = ctx.estado.itens.reduce((acc, i) => acc + i.precoUnit * i.quantidade, 0);
  const total = ctx.estado.canal === "entrega" ? subtotal + (ctx.estado.taxa ?? 0) : subtotal;
  const resumo = ctx.estado.itens
    .map((i) => `• ${i.quantidade}× ${i.nome}${i.tamanho ? ` (${i.tamanho})` : ""} — ${brl(i.precoUnit * i.quantidade)}`)
    .join("\n");

  return ok(
    `📋 *Resumo do pedido:*\n${resumo}\n\n${ctx.estado.endereco ? `📍 ${ctx.estado.endereco.rua} — ${ctx.estado.endereco.bairro}\n` : ""}💰 Pagamento: *${encontrada.label}*\n${ctx.estado.taxa ? `🛵 Taxa: ${brl(ctx.estado.taxa)}\n` : ""}*Total: ${brl(total)}*\n\nConfirma o pedido? *(sim / não)*`,
    { formaPagamento: encontrada.value }
  );
}

/** Confirma e cria o pedido real. */
async function confirmarPedido(ctx: ContextoTool): Promise<ResultadoTool> {
  if (ctx.estado.itens.length === 0) return ok("Seu carrinho está vazio.");
  if (!ctx.estado.formaPagamento) return ok("Escolha uma forma de pagamento.");
  if (ctx.estado.canal === "entrega" && !ctx.estado.endereco) return ok("Preciso do endereço de entrega.");

  const subtotal = ctx.estado.itens.reduce((acc, i) => acc + i.precoUnit * i.quantidade, 0);
  const total = ctx.estado.canal === "entrega" ? subtotal + (ctx.estado.taxa ?? 0) : subtotal;
  const nomeCliente = ctx.estado.cliente?.nome ?? "Cliente WhatsApp";

  try {
    const resultado = await criarPedido(
      ctx.empresaId,
      { id: "whatsapp-agent", nome: "Atendente IA", papel: "ADMINISTRADOR" },
      {
        canal: ctx.estado.canal === "retirada" ? "retirada" : "delivery",
        clienteNome: nomeCliente,
        clienteTelefone: ctx.telefone,
        itens: ctx.estado.itens.map((i) => ({
          produtoId: i.produtoId,
          nome: i.nome,
          quantidade: i.quantidade,
          precoUnit: i.precoUnit,
          tamanho: i.tamanho,
          sabores: i.sabores,
          adicionais: i.adicionais,
          observacao: null,
        })),
        endereco: ctx.estado.endereco
          ? { rua: ctx.estado.endereco.rua, bairro: ctx.estado.endereco.bairro }
          : undefined,
        formaPagamento: ctx.estado.formaPagamento,
        taxaEntrega: ctx.estado.taxa ?? 0,
        idempotencyKey: ctx.estado.chaveIdempotencia,
      }
    );

    if (!resultado.ok) {
      return ok("Tive um problema ao criar seu pedido. Vou te transferir para um atendente. 🙋");
    }

    return ok(
      `Pedido *Nº ${resultado.pedido.numero}* confirmado! 🎉\n\n*Total: ${brl(total)}*\nForma de pagamento: ${ctx.estado.formaPagamento}\n\nObrigada pela preferência! 😊`,
      { itens: [], formaPagamento: undefined, endereco: undefined, pedidoId: resultado.pedido.id }
    );
  } catch {
    return ok("Tive um problema técnico ao criar seu pedido. Vou te transferir para um atendente. 🙋");
  }
}

/** Mostra o total do carrinho. */
async function verTotal(ctx: ContextoTool): Promise<ResultadoTool> {
  if (ctx.estado.itens.length === 0) return ok("Seu carrinho ainda está vazio. Quer pedir alguma coisa? 🛒");

  const subtotal = ctx.estado.itens.reduce((acc, i) => acc + i.precoUnit * i.quantidade, 0);
  const linhas = ctx.estado.itens
    .map((i) => `• ${i.quantidade}× ${i.nome}${i.tamanho ? ` (${i.tamanho})` : ""} — ${brl(i.precoUnit * i.quantidade)}`)
    .join("\n");
  const taxaInfo = ctx.estado.taxa ? `\nTaxa de entrega: ${brl(ctx.estado.taxa)}` : "";
  const total = ctx.estado.canal === "entrega" ? subtotal + (ctx.estado.taxa ?? 0) : subtotal;

  return ok(
    `🛒 *Seu carrinho:*\n${linhas}${taxaInfo}\n\n*Subtotal: ${brl(subtotal)}*${ctx.estado.canal === "entrega" ? `\n*Total (com entrega): ${brl(total)}*` : ""}\n\nQuer mais alguma coisa? *(sim / não)*`
  );
}

/** Remove um item do carrinho por índice (0-based). */
async function removerItem(ctx: ContextoTool, indice: number): Promise<ResultadoTool> {
  if (ctx.estado.itens.length === 0) return ok("Seu carrinho está vazio.");
  if (indice < 0 || indice >= ctx.estado.itens.length) {
    return ok(`Índice inválido. Itens: ${ctx.estado.itens.map((i, idx) => `${idx + 1}. ${i.nome}`).join(", ")}`);
  }

  const removido = ctx.estado.itens[indice];
  const itens = ctx.estado.itens.filter((_, i) => i !== indice);
  if (itens.length === 0) {
    return ok(`Tirei o *${removido.nome}*. 🗑️ Seu carrinho ficou vazio. Quer pedir mais alguma coisa?`, { itens });
  }

  const subtotal = itens.reduce((acc, i) => acc + i.precoUnit * i.quantidade, 0);
  return ok(
    `Tirei o *${removido.nome}*. 🗑️\n\n*Subtotal: ${brl(subtotal)}*\n\nQuer mais alguma coisa? *(sim / não)*`,
    { itens }
  );
}

/** Ver status do último pedido do cliente. */
async function verStatusPedido(ctx: ContextoTool): Promise<ResultadoTool> {
  const ultimoPedido = await prisma.pedido.findFirst({
    where: {
      empresaId: ctx.empresaId,
      clienteTelefone: ctx.telefone,
      status: { not: "cancelado" },
    },
    orderBy: { criadoEm: "desc" },
    select: { numero: true, status: true, criadoEm: true },
  });

  if (!ultimoPedido) return ok("Não achei pedidos seus no sistema. 🤔 Quer montar um novo?");

  const statusTexto: Record<string, string> = {
    pendente: "📋 Recebido — aguardando confirmação",
    confirmado: "👨‍🍳 Em preparo — a cozinha já começou",
    saiu_entrega: "🛵 Saiu para entrega",
    pronto: "✅ Pronto para retirada",
    entregue: "🎉 Entregue",
  };

  return ok(
    `Seu último pedido (*Nº ${ultimoPedido.numero}*) está: ${statusTexto[ultimoPedido.status] ?? ultimoPedido.status}.\n\nQuer fazer um novo pedido?`
  );
}

/* --------------------------------- Índice --------------------------------- */

export type NomeTool =
  | "listar_cardapio"
  | "buscar_produto"
  | "ver_preco"
  | "ver_disp"
  | "selecionar_produto"
  | "escolher_tamanho"
  | "escolher_sabor"
  | "escolher_adicional"
  | "definir_quantidade"
  | "escolher_canal"
  | "definir_endereco"
  | "escolher_pagamento"
  | "confirmar_pedido"
  | "ver_total"
  | "remover_item"
  | "ver_status_pedido";

/** Descrições das tools para o prompt do LLM (JSON Schema simplificado). */
export const TOOL_DEFINITIONS: Record<NomeTool, { descricao: string; parametros: string }> = {
  listar_cardapio: {
    descricao: "Lista o cardápio completo da pizzaria (produtos, preços, categorias).",
    parametros: "{}",
  },
  buscar_produto: {
    descricao: "Busca um produto por nome no cardápio.",
    parametros: '{"termo": "texto para buscar"}',
  },
  ver_preco: {
    descricao: "Mostra o preço de um produto específico (com opções de tamanho se houver).",
    parametros: '{"produtoId": "id do produto"}',
  },
  ver_disp: {
    descricao: "Verifica se um produto está disponível (estoque de ingredientes).",
    parametros: '{"produtoId": "id do produto"}',
  },
  selecionar_produto: {
    descricao: "Seleciona um produto para pedir (inicia montagem: tamanho → sabores → adicionais → quantidade).",
    parametros: '{"produtoId": "id do produto"}',
  },
  escolher_tamanho: {
    descricao: "Escolhe o tamanho de um produto (índice 0-based da lista de tamanhos).",
    parametros: '{"indice": 0}',
  },
  escolher_sabor: {
    descricao: "Escolhe um sabor de pizza (índice 0-based da lista de sabores disponíveis).",
    parametros: '{"indice": 0}',
  },
  escolher_adicional: {
    descricao: "Escolhe um adicional ou responde 'nenhum' (índice 0-based, ou -1 para nenhum).",
    parametros: '{"indice": 0}',
  },
  definir_quantidade: {
    descricao: "Define a quantidade de unidades do item (1 a 20).",
    parametros: '{"quantidade": 1}',
  },
  escolher_canal: {
    descricao: "Escolhe entre entrega ou retirada.",
    parametros: '{"canal": "entrega" ou "retirada"}',
  },
  definir_endereco: {
    descricao: "Define o endereço de entrega (rua e bairro).",
    parametros: '{"rua": "Rua X, 123", "bairro": "Bairro Y"}',
  },
  escolher_pagamento: {
    descricao: "Escolhe a forma de pagamento (pix, dinheiro, debito, credito).",
    parametros: '{"forma": "pix"}',
  },
  confirmar_pedido: {
    descricao: "Confirma e cria o pedido real no sistema.",
    parametros: "{}",
  },
  ver_total: {
    descricao: "Mostra o carrinho atual com subtotal e total.",
    parametros: "{}",
  },
  remover_item: {
    descricao: "Remove um item do carrinho por índice (0-based).",
    parametros: '{"indice": 0}',
  },
  ver_status_pedido: {
    descricao: "Mostra o status do último pedido do cliente.",
    parametros: "{}",
  },
};

/**
 * Executa uma tool pelo nome com os parâmetros fornecidos.
 * Retorna ResultadoTool com ok/mensagem/estadoAtualizado.
 */
export async function executarTool(
  nome: NomeTool,
  params: Record<string, unknown>,
  ctx: ContextoTool
): Promise<ResultadoTool> {
  try {
    switch (nome) {
      case "listar_cardapio":
        return listarCardapio(ctx);
      case "buscar_produto":
        return buscarProduto(ctx, String(params.termo ?? ""));
      case "ver_preco":
        return verPreco(ctx, String(params.produtoId ?? ""));
      case "ver_disp":
        return verDisp(ctx, String(params.produtoId ?? ""));
      case "selecionar_produto":
        return selecionarProduto(ctx, String(params.produtoId ?? ""));
      case "escolher_tamanho":
        return escolherTamanho(ctx, Number(params.indice ?? 0) - 1);
      case "escolher_sabor":
        return escolherSabor(ctx, Number(params.indice ?? 0) - 1);
      case "escolher_adicional":
        return escolherAdicional(ctx, params.indice === undefined ? -1 : Number(params.indice) - 1);
      case "definir_quantidade":
        return definirQuantidade(ctx, Number(params.quantidade ?? 1));
      case "escolher_canal":
        return escolherCanal(ctx, String(params.canal ?? "") as "entrega" | "retirada");
      case "definir_endereco":
        return definirEndereco(ctx, String(params.rua ?? ""), String(params.bairro ?? ""));
      case "escolher_pagamento":
        return escolherPagamento(ctx, String(params.forma ?? ""));
      case "confirmar_pedido":
        return confirmarPedido(ctx);
      case "ver_total":
        return verTotal(ctx);
      case "remover_item":
        return removerItem(ctx, Number(params.indice ?? 0) - 1);
      case "ver_status_pedido":
        return verStatusPedido(ctx);
      default:
        return erro("Essa ação não existe.");
    }
  } catch {
    return ok("Tive um problema técnico. Vou te transferir para um atendente. 🙋");
  }
}

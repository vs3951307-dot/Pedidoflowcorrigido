/**
 * Consultas REAIS ao banco usadas pelo atendente WhatsApp (PEDIDO 18).
 *
 * Regra de ouro: o atendente (com ou sem IA) NUNCA inventa produto, sabor,
 * preço, tamanho, adicional, taxa, promoção ou disponibilidade — tudo o que
 * aparece na conversa vem destas consultas (ou das regras configuradas em
 * `src/lib/delivery.ts` / `configuracoes`).
 *
 * MULTIEMPRESA: toda função aqui recebe `empresaId` explicitamente — o
 * atendente de uma empresa NUNCA pode ver/oferecer o cardápio, cliente ou
 * configuração de outra.
 */

import { prisma } from "@/lib/prisma";
import { lerConfigTaxaEntrega, calcularTaxaEntrega } from "@/lib/delivery";

export interface ProdutoAtendimento {
  id: string;
  nome: string;
  descricao: string;
  precoBase: number;
  categoria: string;
  emoji: string;
  fotoUrl: string | null;
  destaque: boolean;
  disponivel: boolean;
  temSabores: boolean;
  temTamanhos: boolean;
  tamanhos: { id: string; nome: string; valor: number }[];
  sabores: { nome: string; tipo: string }[];
}

/** Produtos ativos do cardápio da empresa (disponibilidade real = `ativo`). */
export async function listarProdutosDisponiveis(empresaId: string): Promise<ProdutoAtendimento[]> {
  const produtos = await prisma.produto.findMany({
    where: { empresaId, ativo: true },
    include: {
      categoria: true,
      precos: { include: { tamanho: true }, orderBy: { tamanho: { fatorPreco: "asc" } } },
      sabores: { include: { sabor: { select: { nome: true, tipo: true } } } },
    },
    orderBy: [{ categoria: { ordem: "asc" } }, { nome: "asc" }],
  });
  return produtos.map((p) => ({
    id: p.id,
    nome: p.nome,
    descricao: p.descricao,
    precoBase: p.preco,
    categoria: p.categoria.nome,
    emoji: p.emoji,
    fotoUrl: p.fotoUrl ?? null,
    destaque: p.destaque,
    disponivel: p.ativo,
    temSabores: p.sabores.length > 0,
    temTamanhos: p.precos.length > 1,
    tamanhos: p.precos.map((pt) => ({ id: pt.tamanhoId, nome: pt.tamanho.nome, valor: pt.valor })),
    sabores: p.sabores.map((ps) => ({ nome: ps.sabor.nome, tipo: ps.sabor.tipo })),
  }));
}

/** Busca por trecho no nome (case-insensitive) nos produtos disponíveis da empresa. */
export async function buscarProdutos(
  empresaId: string,
  texto: string,
  limite = 5
): Promise<ProdutoAtendimento[]> {
  const termo = texto.trim().toLowerCase();
  if (!termo) return [];
  const todos = await listarProdutosDisponiveis(empresaId);
  const exato = todos.filter((p) => p.nome.toLowerCase() === termo);
  const parcial = todos.filter((p) => p.nome.toLowerCase().includes(termo) && p.nome.toLowerCase() !== termo);
  const unicos = [...exato, ...parcial].filter(
    (p, i, arr) => arr.findIndex((x) => x.id === p.id) === i
  );
  return unicos.slice(0, limite);
}

/** Adicionais ativos da empresa (preço real do cadastro). */
export async function listarAdicionais(empresaId: string) {
  return prisma.adicional.findMany({ where: { empresaId, ativo: true }, orderBy: { nome: "asc" } });
}

/** Formas de pagamento ativas da empresa (config `formas_pagamento`). */
export async function listarFormasPagamento(empresaId: string): Promise<{ value: string; label: string }[]> {
  const registro = await prisma.configuracao.findUnique({
    where: { empresaId_chave: { empresaId, chave: "formas_pagamento" } },
  });
  if (registro) {
    try {
      const lista = JSON.parse(registro.valor) as { value?: string; label?: string; ativo?: boolean }[];
      if (Array.isArray(lista)) {
        const formas = lista
          .filter((f) => f.ativo !== false && f.value)
          .map((f) => ({ value: String(f.value), label: String(f.label ?? f.value) }));
        if (formas.length > 0) return formas;
      }
    } catch {
      /* configuração corrompida → fallback */
    }
  }
  return [
    { value: "dinheiro", label: "Dinheiro" },
    { value: "debito", label: "Débito" },
    { value: "credito", label: "Crédito" },
    { value: "pix", label: "Pix" },
  ];
}

/** Cliente já cadastrado pelo telefone NA MESMA EMPRESA (identificação na conversa). */
export async function clientePorTelefone(empresaId: string, telefone: string) {
  const limpo = normalizarTelefone(telefone);
  if (!limpo) return null;
  const cliente = await prisma.cliente.findFirst({
    where: { empresaId, telefone: { contains: limpo.replace(/\D/g, "").slice(-8) } },
    include: { enderecos: true },
  });
  return cliente;
}

/** Normaliza um telefone livre para exibição ("5511988112233" → "(11) 98811-2233"). */
export function normalizarTelefone(telefone: string): string {
  const digitos = telefone.replace(/\D/g, "");
  if (digitos.length === 13) {
    return `+${digitos.slice(0, 2)} (${digitos.slice(2, 4)}) ${digitos.slice(4, 9)}-${digitos.slice(9)}`;
  }
  if (digitos.length === 11) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  }
  if (digitos.length === 10) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  }
  return telefone.trim();
}

/** Horário de funcionamento informado na config `empresa` (nunca inventado). */
export async function horarioFuncionamento(empresaId: string): Promise<string | null> {
  const registro = await prisma.configuracao.findUnique({
    where: { empresaId_chave: { empresaId, chave: "empresa" } },
  });
  if (!registro) return null;
  try {
    const empresa = JSON.parse(registro.valor) as Record<string, unknown>;
    const horario = empresa.horarioFuncionamento;
    return typeof horario === "string" && horario.trim() ? horario.trim() : null;
  } catch {
    return null;
  }
}

/** Nome fantasia da loja informado na config `empresa` (usado na saudação). */
export async function nomeFantasia(empresaId: string): Promise<string | null> {
  const registro = await prisma.configuracao.findUnique({
    where: { empresaId_chave: { empresaId, chave: "empresa" } },
  });
  if (!registro) return null;
  try {
    const empresa = JSON.parse(registro.valor) as Record<string, unknown>;
    const nome = empresa.nomeFantasia;
    return typeof nome === "string" && nome.trim() ? nome.trim() : null;
  } catch {
    return null;
  }
}

/** Re-export das regras de taxa (mesma fonte do PDV delivery). */
export { lerConfigTaxaEntrega, calcularTaxaEntrega };

/**
 * Endereços salvos do cliente (usado na coleta de endereço de entrega).
 * Retorna os endereços cadastrados pelo cliente NESTA empresa.
 */
export async function buscarEnderecosPorTelefone(empresaId: string, telefone: string) {
  const limpo = normalizarTelefone(telefone);
  if (!limpo) return [];
  const cliente = await prisma.cliente.findFirst({
    where: { empresaId, telefone: { contains: limpo.replace(/\D/g, "").slice(-8) } },
    include: { enderecos: true },
  });
  return cliente?.enderecos ?? [];
}

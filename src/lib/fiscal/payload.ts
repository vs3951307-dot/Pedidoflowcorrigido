/**
 * Montagem do payload da NFC-e (PEDIDO 19) a partir de dados REAIS do
 * banco: pedido, itens, pagamentos e cadastro fiscal da empresa e dos
 * produtos. Nenhum valor é inventado — faltas (produto sem NCM, empresa
 * sem CNPJ) viram erro de validação antes de qualquer envio.
 */

import { prisma } from "@/lib/prisma";
import { lerConfigNfceBanco, ambienteEfetivo } from "@/lib/fiscal/config";
import type { PayloadEmissaoNFCe } from "@/lib/fiscal/tipos";

/** Código tPag da NFC-e por forma de pagamento do sistema. */
export function codigoFormaPagamentoFiscal(forma: string): string {
  switch (forma) {
    case "dinheiro":
      return "01";
    case "credito":
      return "03";
    case "debito":
      return "04";
    case "pix":
      return "15"; // Pix (Forma de Pagamento da NFC-e)
    default:
      return "99"; // Outros
  }
}

function numeroDaDescricao(item: {
  nome: string;
  tamanho?: string | null;
  sabores?: string[] | null;
  adicionais?: { nome: string; preco: number }[] | null;
  observacao?: string | null;
}): string {
  const partes = [item.nome];
  if (item.tamanho) partes.push(`Tam.: ${item.tamanho}`);
  if (item.sabores?.length) partes.push(`Sabores: ${item.sabores.join(", ")}`);
  if (item.adicionais?.length) {
    partes.push(`Adicionais: ${item.adicionais.map((a) => `${a.nome} (+${a.preco.toFixed(2)})`).join(", ")}`);
  }
  if (item.observacao) partes.push(`Obs.: ${item.observacao}`);
  return partes.join(" · ").slice(0, 120);
}

export interface DadosParaPayload {
  pedidoId: string;
  canal: string;
  clienteNome: string | null;
  clienteDocumento?: string | null; // CPF/CNPJ quando o cliente tem cadastro
  observacao: string | null;
  total: number;
  itens: {
    produtoId: string | null;
    nome: string;
    precoUnit: number;
    quantidade: number;
    tamanho: string | null;
    sabores: string[] | null;
    adicionais: { nome: string; preco: number }[] | null;
    observacao: string | null;
  }[];
  pagamentos: { forma: string; valor: number; troco: number }[];
}

export interface ErroValidacaoFiscal {
  campos: string[]; // descrições legíveis do que falta
}

export function ehErroValidacao(v: unknown): v is ErroValidacaoFiscal {
  return (
    typeof v === "object" &&
    v !== null &&
    Array.isArray((v as ErroValidacaoFiscal).campos)
  );
}

function parseSabores(valor: string | null): string[] | null {
  if (!valor) return null;
  try {
    const v: unknown = JSON.parse(valor);
    return Array.isArray(v) ? v.map(String) : null;
  } catch {
    return null;
  }
}

function parseAdicionais(
  valor: string | null
): { nome: string; preco: number }[] | null {
  if (!valor) return null;
  try {
    const v: unknown = JSON.parse(valor);
    if (!Array.isArray(v)) return null;
    return v.map((a) => {
      const b = a as { nome?: unknown; preco?: unknown };
      return { nome: String(b.nome ?? ""), preco: Number(b.preco ?? 0) };
    });
  } catch {
    return null;
  }
}

export async function carregarDadosParaPayload(empresaId: string, pedidoId: string): Promise<DadosParaPayload> {
  const pedido = await prisma.pedido.findFirst({
    where: { id: pedidoId, empresaId },
    include: {
      itens: true,
      pagamentos: { orderBy: { criadoEm: "asc" } },
      cliente: true,
    },
  });
  if (!pedido) {
    throw new Error("Pedido não encontrado para emissão fiscal.");
  }
  return {
    pedidoId: pedido.id,
    canal: pedido.canal,
    clienteNome: pedido.clienteNome,
    clienteDocumento: null, // CPF/CNPJ do consumidor não é coletado no PDV
    observacao: pedido.observacao,
    total: pedido.total,
    itens: pedido.itens.map((i) => ({
      produtoId: i.produtoId,
      nome: i.nome,
      precoUnit: i.precoUnit,
      quantidade: i.quantidade,
      tamanho: i.tamanho,
      sabores: parseSabores(i.sabores),
      adicionais: parseAdicionais(i.adicionais),
      observacao: i.observacao,
    })),
    pagamentos: pedido.pagamentos.map((p) => ({
      forma: p.forma,
      valor: p.valor,
      troco: p.troco,
    })),
  };
}

/**
 * Monta o payload da NFC-e validando os dados fiscais. Lança
 * `ErroValidacaoFiscal` com a lista do que falta (nada é enviado).
 */
export async function montarPayloadNFCe(empresaId: string, pedidoId: string): Promise<PayloadEmissaoNFCe> {
  const [dados, banco, efetivo] = await Promise.all([
    carregarDadosParaPayload(empresaId, pedidoId),
    lerConfigNfceBanco(empresaId),
    ambienteEfetivo(empresaId),
  ]);
  const campos: string[] = [];

  const empresa = await prisma.configuracao.findUnique({
    where: { empresaId_chave: { empresaId, chave: "empresa" } },
  });
  let emitente: PayloadEmissaoNFCe["emitente"] | null = null;
  if (empresa) {
    try {
      const e = JSON.parse(empresa.valor) as Record<string, unknown>;
      emitente = {
        cnpj: String(e.cnpj ?? "").replace(/\D/g, ""),
        razaoSocial: String(e.razaoSocial ?? ""),
        nomeFantasia: String(e.nomeFantasia ?? "") || undefined,
        inscricaoEstadual: String(e.inscricaoEstadual ?? "").replace(/\D/g, "") || undefined,
        endereco: String(e.rua ?? ""),
        municipio: String(e.cidade ?? ""),
        uf: String(e.uf ?? ""),
        cep: String(e.cep ?? "").replace(/\D/g, "") || undefined,
        telefone: String(e.telefone ?? "") || undefined,
        regime: String(e.regime ?? ""),
      };
    } catch {
      emitente = null;
    }
  }
  if (!emitente || !emitente.cnpj || emitente.cnpj.length !== 14) {
    campos.push("CNPJ da empresa (14 dígitos) — cadastrar em Configurações → Empresa");
  }
  if (!emitente || !emitente.razaoSocial) {
    campos.push("Razão social da empresa");
  }
  if (!emitente || !emitente.inscricaoEstadual) {
    campos.push("Inscrição estadual da empresa");
  }
  if (!emitente || !emitente.uf) {
    campos.push("UF da empresa");
  }

  // Produtos com dados fiscais completos (NCM obrigatório; CSOSN/CEST do cadastro).
  const produtoIds = dados.itens
    .map((i) => i.produtoId)
    .filter((id): id is string => Boolean(id));
  const produtos = await prisma.produto.findMany({
    where: { id: { in: produtoIds }, empresaId },
  });
  const produtoPorId = new Map(produtos.map((p) => [p.id, p]));

  const itens: PayloadEmissaoNFCe["itens"] = dados.itens.map((item, idx) => {
    const produto = item.produtoId ? produtoPorId.get(item.produtoId) : undefined;
    const ncm = (produto?.ncm ?? "").replace(/\D/g, "");
    const cfop = (produto?.cfop ?? "5102").replace(/\D/g, "");
    const csosn = (produto?.csosn ?? "102").replace(/\D/g, "");
    const cest = (produto?.cest ?? "").replace(/\D/g, "");
    if (ncm.length !== 8) {
      campos.push(`NCM de 8 dígitos do produto "${item.nome}" (cadastro: ${produto?.ncm ?? "vazio"})`);
    }
    if (cfop.length !== 4) {
      campos.push(`CFOP de 4 dígitos do produto "${item.nome}"`);
    }
    if (!/^\d{3}$/.test(csosn)) {
      campos.push(`CSOSN de 3 dígitos do produto "${item.nome}"`);
    }
    return {
      numero: idx + 1,
      codigo: item.produtoId ?? item.nome,
      descricao: numeroDaDescricao(item),
      quantidade: item.quantidade,
      valorUnitario: item.precoUnit,
      valorTotal: Number((item.precoUnit * item.quantidade).toFixed(2)),
      ncm,
      cfop,
      unidade: (produto?.unidade ?? "UN").toUpperCase().slice(0, 6),
      csosn,
      cest: cest.length > 0 ? cest : undefined,
    };
  });

  const pagamentos: PayloadEmissaoNFCe["pagamentos"] = dados.pagamentos.map((p) => ({
    forma: codigoFormaPagamentoFiscal(p.forma),
    valor: p.valor,
    troco: p.troco > 0 ? p.troco : undefined,
  }));
  const totalProdutos = Number(
    itens.reduce((soma, i) => soma + i.valorTotal, 0).toFixed(2)
  );

  if (pagamentos.length === 0) {
    campos.push("Pagamento confirmado (emita após a confirmação do pagamento)");
  }
  if (totalProdutos <= 0) {
    campos.push("Itens com valor total maior que zero");
  }
  if (campos.length > 0) {
    throw { campos } satisfies ErroValidacaoFiscal;
  }

  return {
    numero: banco.proximoNumero,
    serie: banco.serie,
    ambiente: efetivo.ambiente === "producao" ? "1" : "2",
    naturezaOperacao: "VENDA",
    dataEmissao: new Date().toISOString(),
    emitente: emitente!,
    destinatario: dados.clienteNome
      ? { nome: String(dados.clienteNome).slice(0, 60) }
      : undefined,
    itens,
    totais: {
      produtos: totalProdutos,
      pagamento: Number(
        pagamentos.reduce((soma, p) => soma + p.valor, 0).toFixed(2)
      ),
      troco: dados.pagamentos.reduce((soma, p) => soma + p.troco, 0) || undefined,
    },
    pagamentos,
    informacoesAdicionais: `Pedido #${dados.pedidoId.slice(-6)} · Canal: ${dados.canal}`,
  };
}

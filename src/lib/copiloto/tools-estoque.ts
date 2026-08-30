/**
 * Tools de ESCRITA do Copiloto da Empresa (operações do dia a dia por
 * conversa: estoque, disponibilidade de produto).
 *
 * REGRA DE SEGURANÇA CENTRAL (não negociável): toda função aqui recebe
 * `empresaId` como PRIMEIRO parâmetro, e quem chama SEMPRE o obtém de
 * `autorizar()` (sessão autenticada no servidor) — nunca do corpo da
 * requisição, nunca do prompt, nunca de foto/áudio, nunca da resposta
 * da IA. A IA só escolhe QUAL tool e com quais parâmetros de negócio;
 * a qual empresa isso se aplica é decisão exclusiva do servidor.
 *
 * REGRA DE CONFIRMAÇÃO: nenhuma destas funções deve ser chamada
 * diretamente a partir da interpretação da IA. O fluxo é sempre:
 * interpretar → montar PRÉVIA estruturada → usuário confirma → só
 * então executar (ver `src/lib/copiloto/acoes.ts`).
 *
 * Toda alteração registra auditoria (quem, quando, valores antes/depois).
 */

import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/acesso";
import type { UsuarioComPermissoes } from "@/lib/permissao";

export interface ResultadoTool {
  ok: boolean;
  mensagem: string;
  detalhes?: Record<string, unknown>;
}

/** Entrada de mercadoria: soma ao estoque e registra a movimentação. `notaId` vincula a entrada à nota fiscal que a originou. */
export async function registrarEntradaEstoque(
  empresaId: string,
  usuario: UsuarioComPermissoes,
  params: { nomeProduto: string; quantidade: number; fornecedor?: string; valorTotal?: number; notaId?: string | null }
): Promise<ResultadoTool> {
  const { nomeProduto, quantidade } = params;
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    return { ok: false, mensagem: "Quantidade inválida." };
  }

  const item = await prisma.estoqueProduto.findFirst({
    where: { empresaId, nome: { equals: nomeProduto, mode: "insensitive" } },
  });
  if (!item) {
    return {
      ok: false,
      mensagem: `Não encontrei "${nomeProduto}" no estoque desta empresa. Cadastre o item primeiro em Admin → Estoque.`,
    };
  }

  const quantidadeAnterior = item.quantidade;
  const [atualizado] = await prisma.$transaction([
    prisma.estoqueProduto.update({
      where: { id: item.id },
      data: { quantidade: { increment: quantidade } },
    }),
    prisma.movimentacaoEstoque.create({
      data: {
        empresaId,
        produtoId: item.id,
        tipo: "entrada",
        quantidade,
        fornecedor: params.fornecedor,
        valorTotal: params.valorTotal,
        notaId: params.notaId ?? null,
        responsavel: usuario.nome,
      },
    }),
  ]);

  await registrarAuditoria(
    "copiloto_entrada_estoque",
    `${item.nome}: ${quantidadeAnterior} → ${atualizado.quantidade} ${item.unidade} (+${quantidade})`,
    usuario,
    undefined,
    empresaId
  );

  return {
    ok: true,
    mensagem: `Entrada registrada: ${item.nome} passou de ${quantidadeAnterior} para ${atualizado.quantidade} ${item.unidade}.`,
    detalhes: { produto: item.nome, antes: quantidadeAnterior, depois: atualizado.quantidade },
  };
}

/** Define a quantidade exata em estoque (correção/contagem), registrando a diferença como movimentação. */
export async function ajustarQuantidadeEstoque(
  empresaId: string,
  usuario: UsuarioComPermissoes,
  params: { nomeProduto: string; novaQuantidade: number }
): Promise<ResultadoTool> {
  const { nomeProduto, novaQuantidade } = params;
  if (!Number.isFinite(novaQuantidade) || novaQuantidade < 0) {
    return { ok: false, mensagem: "Quantidade inválida." };
  }

  const item = await prisma.estoqueProduto.findFirst({
    where: { empresaId, nome: { equals: nomeProduto, mode: "insensitive" } },
  });
  if (!item) {
    return { ok: false, mensagem: `Não encontrei "${nomeProduto}" no estoque desta empresa.` };
  }

  const diferenca = novaQuantidade - item.quantidade;
  const operacoes: unknown[] = [
    prisma.estoqueProduto.update({ where: { id: item.id }, data: { quantidade: novaQuantidade } }),
  ];
  if (diferenca !== 0) {
    operacoes.push(
      prisma.movimentacaoEstoque.create({
        data: {
          empresaId,
          produtoId: item.id,
          tipo: diferenca > 0 ? "entrada" : "saida",
          quantidade: Math.abs(diferenca),
          responsavel: usuario.nome,
          fornecedor: "Ajuste pelo Copiloto",
        },
      })
    );
  }
  await prisma.$transaction(operacoes as never);

  await registrarAuditoria(
    "copiloto_ajuste_estoque",
    `${item.nome}: ${item.quantidade} → ${novaQuantidade} ${item.unidade}`,
    usuario,
    undefined,
    empresaId
  );

  return {
    ok: true,
    mensagem: `${item.nome} agora está com ${novaQuantidade} ${item.unidade} (antes: ${item.quantidade}).`,
    detalhes: { produto: item.nome, antes: item.quantidade, depois: novaQuantidade },
  };
}

/** Marca um produto do cardápio como indisponível/disponível (ex.: "acabou calabresa"). */
export async function definirDisponibilidadeProduto(
  empresaId: string,
  usuario: UsuarioComPermissoes,
  params: { nomeProduto: string; disponivel: boolean }
): Promise<ResultadoTool> {
  const { nomeProduto, disponivel } = params;

  const produto = await prisma.produto.findFirst({
    where: { empresaId, nome: { contains: nomeProduto, mode: "insensitive" } },
  });
  if (produto) {
    if (produto.ativo === disponivel) {
      return {
        ok: true,
        mensagem: `${produto.nome} já está ${disponivel ? "disponível" : "indisponível"} — nada mudou.`,
      };
    }
    await prisma.produto.update({ where: { id: produto.id }, data: { ativo: disponivel } });
    await registrarAuditoria(
      "copiloto_disponibilidade_produto",
      `${produto.nome}: ${produto.ativo ? "disponível" : "indisponível"} → ${disponivel ? "disponível" : "indisponível"}`,
      usuario,
      undefined,
      empresaId
    );
    return {
      ok: true,
      mensagem: `${produto.nome} agora está ${disponivel ? "disponível" : "indisponível"} no cardápio.`,
      detalhes: { tipo: "produto", nome: produto.nome, disponivel },
    };
  }

  // Não é produto do cardápio — pode ser um SABOR (ex.: "calabresa").
  const sabor = await prisma.sabor.findFirst({
    where: { empresaId, nome: { contains: nomeProduto, mode: "insensitive" } },
  });
  if (sabor) {
    if (sabor.ativo === disponivel) {
      return { ok: true, mensagem: `O sabor ${sabor.nome} já está ${disponivel ? "disponível" : "indisponível"}.` };
    }
    await prisma.sabor.update({ where: { id: sabor.id }, data: { ativo: disponivel } });
    await registrarAuditoria(
      "copiloto_disponibilidade_sabor",
      `Sabor ${sabor.nome}: ${sabor.ativo ? "disponível" : "indisponível"} → ${disponivel ? "disponível" : "indisponível"}`,
      usuario,
      undefined,
      empresaId
    );
    return {
      ok: true,
      mensagem: `O sabor ${sabor.nome} agora está ${disponivel ? "disponível" : "indisponível"}.`,
      detalhes: { tipo: "sabor", nome: sabor.nome, disponivel },
    };
  }

  return {
    ok: false,
    mensagem: `Não encontrei nenhum produto ou sabor chamado "${nomeProduto}" nesta empresa.`,
  };
}

/** Lista os produtos/sabores atualmente indisponíveis (leitura — não altera nada). */
export async function listarIndisponiveis(empresaId: string): Promise<ResultadoTool> {
  const [produtos, sabores] = await Promise.all([
    prisma.produto.findMany({ where: { empresaId, ativo: false }, select: { nome: true } }),
    prisma.sabor.findMany({ where: { empresaId, ativo: false }, select: { nome: true } }),
  ]);

  if (produtos.length === 0 && sabores.length === 0) {
    return { ok: true, mensagem: "Nenhum produto ou sabor está indisponível no momento." };
  }
  const partes: string[] = [];
  if (produtos.length > 0) partes.push(`Produtos: ${produtos.map((p) => p.nome).join(", ")}`);
  if (sabores.length > 0) partes.push(`Sabores: ${sabores.map((s) => s.nome).join(", ")}`);
  return { ok: true, mensagem: partes.join(" · "), detalhes: { produtos, sabores } };
}

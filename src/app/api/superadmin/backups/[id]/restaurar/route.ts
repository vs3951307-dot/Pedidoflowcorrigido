import { NextRequest, NextResponse } from "next/server";
import { autorizarSuperAdmin } from "@/lib/super-admin/auth";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { prisma, plataformaPrisma } from "@/lib/prisma";
import { ativarTenant } from "@/lib/tenant-db";
import { lerArquivoPrivado } from "@/lib/storage";
import { VERSAO_BACKUP as VERSAO_BACKUP_SUPORTADA } from "@/lib/backup";

/**
 * POST /api/superadmin/backups/[id]/restaurar — restaura um backup
 * (PEDIDO 30: "um backup sem procedimento de restauração não garante
 * recuperação").
 *
 * ⚠️ ESTE É O ENDPOINT MAIS SENSÍVEL DESTA CORREÇÃO — nunca testado
 * contra um banco real (sem ambiente pra isso). Antes de confiar nele
 * pra recuperação de verdade, teste contra uma empresa de teste
 * primeiro. Ver `STATUS-FINAL-PEDIDOFLOW.md`.
 *
 * Segurança/salvaguardas (PEDIDO 30):
 *   - Exige sessão de SUPER ADMIN (nunca sessão de empresa comum).
 *   - `empresaIdConfirmacao` precisa bater EXATAMENTE com a empresa
 *     dona do backup — evita restaurar o backup errado na empresa
 *     errada por engano de clique.
 *   - `versaoFormato` do backup precisa bater com o que este código
 *     sabe interpretar — recusa formatos desconhecidos em vez de tentar
 *     e corromper dados parcialmente.
 *   - DRY RUN por padrão (`confirmar` ausente ou `false`): só mostra o
 *     que SERIA restaurado (contagens por tabela), não escreve nada.
 *     Só com `confirmar: true` explícito é que grava de verdade.
 *   - Idempotente por natureza: usa `upsert` por ID original em vez de
 *     `delete` + `create` — rodar duas vezes não duplica nem apaga o
 *     que já foi restaurado.
 *   - Ordem de dependência entre tabelas (categorias antes de produtos,
 *     pedidos antes de itens/pagamentos etc.) — restaurar fora de ordem
 *     quebraria as foreign keys.
 */
export const POST = comTratamentoDeErro("superadmin.backups.restaurar.POST", async (req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizarSuperAdmin();
  if (!acesso.ok) return acesso.resposta;

  const corpo = await req.json().catch(() => ({}));
  const empresaIdConfirmacao = String(corpo.empresaIdConfirmacao ?? "");
  const confirmar = corpo.confirmar === true;

  if (!empresaIdConfirmacao) {
    return NextResponse.json(
      { erro: "empresaIdConfirmacao é obrigatório — informe a empresa DONA deste backup." },
      { status: 400 }
    );
  }

  // CORREÇÃO (multi-tenant): NUNCA acessa `prisma.backup` (modelo de
  // TENANT — cada empresa tem seu próprio schema Postgres) sem antes
  // descobrir e ativar o tenant certo. O fluxo seguro é:
  //   1) identificar de forma segura a empresa dona do backup → o corpo
  //      da requisição traz `empresaIdConfirmacao` (exigência do
  //      Super Admin no clique), que é comparado com o arquivo e com a
  //      própria confirmação — nunca usamos o id da URL para ativar
  //      um schema arbitrário;
  //   2) carregar essa empresa no schema public (plataforma);
  //   3) ativar o tenant dela;
  //   4) localizar o Backup DENTRO daquele tenant (do contrário, o id
  //      do backup simplesmente não existe ali → 404, sem restauração
  //      cruzada);
  //   5) restaurar somente naquela empresa.
  const empresaPlataforma = await plataformaPrisma.empresa.findUnique({
    where: { id: empresaIdConfirmacao },
    select: { id: true, schemaBanco: true, databaseUrlSecreta: true, slug: true },
  });
  if (!empresaPlataforma) {
    return NextResponse.json(
      { erro: "Empresa da confirmação não encontrada na plataforma — restauração recusada." },
      { status: 404 }
    );
  }
  ativarTenant(empresaPlataforma);

  // Localiza o Backup DENTRO do tenant ativo (schema daquela empresa).
  // Se o backup pertence a outra empresa, esta consulta não encontra
  // nada — isolamento total entre empresas.
  const backup = await prisma.backup.findUnique({ where: { id: params.id } });
  if (!backup) {
    return NextResponse.json({ erro: "Backup não encontrado nesta empresa." }, { status: 404 });
  }
  if (backup.empresaId !== empresaIdConfirmacao) {
    return NextResponse.json(
      { erro: "empresaIdConfirmacao não confere com a empresa dona deste backup — restauração recusada por segurança." },
      { status: 400 }
    );
  }
  if (!backup.caminhoArquivo) {
    return NextResponse.json(
      { erro: "Este backup não tem arquivo associado para restaurar (registro antigo, sem caminho salvo)." },
      { status: 409 }
    );
  }

  let snapshot: Record<string, unknown>;
  try {
    const conteudo = await lerArquivoPrivado("backups", backup.caminhoArquivo);
    snapshot = JSON.parse(conteudo);
  } catch (erro) {
    return NextResponse.json(
      { erro: `Não foi possível ler o arquivo do backup: ${erro instanceof Error ? erro.message : "erro desconhecido"}` },
      { status: 500 }
    );
  }

  const versao = Number(snapshot.versao ?? 0);
  if (versao !== VERSAO_BACKUP_SUPORTADA) {
    return NextResponse.json(
      { erro: `Formato de backup incompatível (versão ${versao}, esperada ${VERSAO_BACKUP_SUPORTADA}). Restauração recusada.` },
      { status: 409 }
    );
  }
  if (snapshot.empresaId !== empresaIdConfirmacao) {
    return NextResponse.json({ erro: "Empresa dentro do arquivo não confere com a empresa da confirmação." }, { status: 409 });
  }

  const empresaId = backup.empresaId;

  const contagens = (arr: unknown) => (Array.isArray(arr) ? arr.length : 0);
  const resumo = {
    categorias: contagens(snapshot.categorias),
    produtos: contagens(snapshot.produtos),
    sabores: contagens(snapshot.sabores),
    tamanhos: contagens(snapshot.tamanhos),
    adicionais: contagens(snapshot.adicionais),
    mesas: contagens(snapshot.mesas),
    clientes: contagens(snapshot.clientes),
    pedidos: contagens(snapshot.pedidos),
    caixas: contagens(snapshot.caixas),
    movimentacoesCaixa: contagens(snapshot.movimentacoesCaixa),
    estoqueProdutos: contagens(snapshot.estoqueProdutos),
    movimentacoesEstoque: contagens(snapshot.movimentacoesEstoque),
    notasFiscais: contagens(snapshot.notasFiscais),
    entregadores: contagens(snapshot.entregadores),
    entregas: contagens(snapshot.entregas),
    configuracoes: contagens(snapshot.configuracoes),
    conversasWhatsApp: contagens(snapshot.conversasWhatsApp),
    mensagensWhatsApp: contagens(snapshot.mensagensWhatsApp),
    impressoras: contagens(snapshot.impressoras),
  };

  if (!confirmar) {
    // DRY RUN: só relatório, nada é escrito.
    return NextResponse.json({
      ok: true,
      dryRun: true,
      geradoEm: snapshot.geradoEm,
      resumo,
      aviso: "Nenhum dado foi alterado. Envie novamente com { confirmar: true } para restaurar de verdade.",
    });
  }

  // Restauração de verdade — upsert em ordem de dependência, dentro de
  // uma única transação (tudo ou nada: se algo falhar no meio, o banco
  // volta ao estado de antes, nunca fica parcialmente restaurado).
  const avisos: string[] = [];
  await prisma.$transaction(
    async (tx) => {
      const categorias = Array.isArray(snapshot.categorias) ? (snapshot.categorias as Record<string, unknown>[]) : [];
      for (const c of categorias) {
        await tx.categoria.upsert({ where: { id: c.id as string }, update: c as never, create: c as never });
      }

      const produtos = Array.isArray(snapshot.produtos) ? (snapshot.produtos as Record<string, unknown>[]) : [];
      for (const p of produtos) {
        const { sabores: saboresDoProduto, ...produtoSemRelacao } = p;
        await tx.produto.upsert({ where: { id: p.id as string }, update: produtoSemRelacao as never, create: produtoSemRelacao as never });
      }

      const sabores = Array.isArray(snapshot.sabores) ? (snapshot.sabores as Record<string, unknown>[]) : [];
      for (const s of sabores) {
        await tx.sabor.upsert({ where: { id: s.id as string }, update: s as never, create: s as never });
      }

      const tamanhos = Array.isArray(snapshot.tamanhos) ? (snapshot.tamanhos as Record<string, unknown>[]) : [];
      for (const t of tamanhos) {
        const { precos, ...tamanhoSemRelacao } = t;
        await tx.tamanho.upsert({ where: { id: t.id as string }, update: tamanhoSemRelacao as never, create: tamanhoSemRelacao as never });
        for (const preco of Array.isArray(precos) ? (precos as Record<string, unknown>[]) : []) {
          // PrecoTamanho não tem campo `id` próprio — chave composta
          // (produtoId, tamanhoId) definida no schema (@@id).
          const { valor: valorPreco, ...semValor } = preco as Record<string, unknown> & { valor: number };
          const precoSemRelacao = { ...semValor, valor: valorPreco };
          await tx.precoTamanho.upsert({
            where: { produtoId_tamanhoId: { produtoId: preco.produtoId as string, tamanhoId: preco.tamanhoId as string } },
            update: precoSemRelacao as never,
            create: precoSemRelacao as never,
          });
        }
      }

      const adicionais = Array.isArray(snapshot.adicionais) ? (snapshot.adicionais as Record<string, unknown>[]) : [];
      for (const a of adicionais) {
        await tx.adicional.upsert({ where: { id: a.id as string }, update: a as never, create: a as never });
      }

      const mesas = Array.isArray(snapshot.mesas) ? (snapshot.mesas as Record<string, unknown>[]) : [];
      for (const m of mesas) {
        await tx.mesa.upsert({ where: { id: m.id as number }, update: m as never, create: m as never });
      }

      const clientes = Array.isArray(snapshot.clientes) ? (snapshot.clientes as Record<string, unknown>[]) : [];
      for (const c of clientes) {
        const { enderecos, ...clienteSemRelacao } = c;
        await tx.cliente.upsert({ where: { id: c.id as string }, update: clienteSemRelacao as never, create: clienteSemRelacao as never });
        for (const end of Array.isArray(enderecos) ? (enderecos as Record<string, unknown>[]) : []) {
          await tx.endereco.upsert({ where: { id: end.id as string }, update: end as never, create: end as never });
        }
      }

      const estoqueProdutos = Array.isArray(snapshot.estoqueProdutos) ? (snapshot.estoqueProdutos as Record<string, unknown>[]) : [];
      for (const e of estoqueProdutos) {
        await tx.estoqueProduto.upsert({ where: { id: e.id as string }, update: e as never, create: e as never });
      }

      const entregadores = Array.isArray(snapshot.entregadores) ? (snapshot.entregadores as Record<string, unknown>[]) : [];
      for (const e of entregadores) {
        await tx.entregador.upsert({ where: { id: e.id as string }, update: e as never, create: e as never });
      }

      const impressoras = Array.isArray(snapshot.impressoras) ? (snapshot.impressoras as Record<string, unknown>[]) : [];
      for (const i of impressoras) {
        await tx.impressora.upsert({ where: { id: i.id as string }, update: i as never, create: i as never });
      }

      const configuracoes = Array.isArray(snapshot.configuracoes) ? (snapshot.configuracoes as Record<string, unknown>[]) : [];
      for (const c of configuracoes) {
        await tx.configuracao.upsert({
          where: { empresaId_chave: { empresaId, chave: c.chave as string } },
          update: c as never,
          create: c as never,
        });
      }

      const pedidos = Array.isArray(snapshot.pedidos) ? (snapshot.pedidos as Record<string, unknown>[]) : [];
      for (const p of pedidos) {
        const { itens, pagamentos, documentoFiscal, ...pedidoSemRelacao } = p;
        await tx.pedido.upsert({ where: { id: p.id as string }, update: pedidoSemRelacao as never, create: pedidoSemRelacao as never });
        for (const item of Array.isArray(itens) ? (itens as Record<string, unknown>[]) : []) {
          await tx.itemPedido.upsert({ where: { id: item.id as string }, update: item as never, create: item as never });
        }
        for (const pg of Array.isArray(pagamentos) ? (pagamentos as Record<string, unknown>[]) : []) {
          await tx.pagamento
            .upsert({ where: { id: pg.id as string }, update: pg as never, create: pg as never })
            .catch(() => {
              avisos.push(`Pagamento ${pg.id} não pôde ser restaurado (possível conflito de chave única).`);
            });
        }
        if (documentoFiscal && typeof documentoFiscal === "object") {
          const df = documentoFiscal as Record<string, unknown>;
          await tx.documentoFiscal
            .upsert({ where: { id: df.id as string }, update: df as never, create: df as never })
            .catch(() => {
              avisos.push(`Documento fiscal do pedido ${p.id} não pôde ser restaurado.`);
            });
        }
      }

      const caixas = Array.isArray(snapshot.caixas) ? (snapshot.caixas as Record<string, unknown>[]) : [];
      for (const c of caixas) {
        await tx.caixa.upsert({ where: { id: c.id as string }, update: c as never, create: c as never });
      }
      const movimentacoesCaixa = Array.isArray(snapshot.movimentacoesCaixa) ? (snapshot.movimentacoesCaixa as Record<string, unknown>[]) : [];
      for (const m of movimentacoesCaixa) {
        await tx.movimentacaoCaixa.upsert({ where: { id: m.id as string }, update: m as never, create: m as never });
      }
      const movimentacoesEstoque = Array.isArray(snapshot.movimentacoesEstoque) ? (snapshot.movimentacoesEstoque as Record<string, unknown>[]) : [];
      for (const m of movimentacoesEstoque) {
        await tx.movimentacaoEstoque.upsert({ where: { id: m.id as string }, update: m as never, create: m as never });
      }
      const notasFiscais = Array.isArray(snapshot.notasFiscais) ? (snapshot.notasFiscais as Record<string, unknown>[]) : [];
      for (const n of notasFiscais) {
        await tx.notaFiscal.upsert({ where: { id: n.id as string }, update: n as never, create: n as never });
      }
      const entregas = Array.isArray(snapshot.entregas) ? (snapshot.entregas as Record<string, unknown>[]) : [];
      for (const e of entregas) {
        await tx.entrega
          .upsert({ where: { id: e.id as string }, update: e as never, create: e as never })
          .catch(() => {
            avisos.push(`Entrega ${e.id} não pôde ser restaurada (possível conflito de código QR único).`);
          });
      }
      const conversas = Array.isArray(snapshot.conversasWhatsApp) ? (snapshot.conversasWhatsApp as Record<string, unknown>[]) : [];
      for (const c of conversas) {
        const { mensagens, ...conversaSemRelacao } = c;
        await tx.conversaWhatsApp.upsert({ where: { id: c.id as string }, update: conversaSemRelacao as never, create: conversaSemRelacao as never });
      }
      const mensagens = Array.isArray(snapshot.mensagensWhatsApp) ? (snapshot.mensagensWhatsApp as Record<string, unknown>[]) : [];
      for (const m of mensagens) {
        await tx.mensagemWhatsApp.upsert({ where: { id: m.id as string }, update: m as never, create: m as never });
      }
    },
    { timeout: 120_000 } // backups grandes podem ter milhares de registros
  );

  await prisma.auditoria
    .create({
      data: {
        acao: "backup_restaurado",
        detalhe: `Backup ${backup.id} restaurado para empresa ${empresaId} por Super Admin ${acesso.superAdmin.nome}`,
        empresaId,
      },
    })
    .catch(() => {});

  return NextResponse.json({ ok: true, dryRun: false, resumo, avisos });
});

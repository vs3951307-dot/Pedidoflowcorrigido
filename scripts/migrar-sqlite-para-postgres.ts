/**
 * Migração de dados: SQLite (dev.db, sistema antigo de uma empresa só)
 * → PostgreSQL (schema novo, multiempresa).
 *
 * Transforma a Disk Pizza Rozeno na PRIMEIRA EMPRESA da plataforma,
 * preservando todos os dados existentes (nunca apaga o dev.db original).
 *
 * COMO USAR:
 *   1. Rode as migrations novas no Postgres (banco vazio):
 *        DATABASE_URL="postgresql://..." npx prisma migrate deploy
 *   2. Rode este script apontando para o dev.db antigo e o Postgres novo:
 *        DATABASE_URL="postgresql://..." \
 *        SQLITE_ORIGEM="./prisma/dev.db" \
 *        npx tsx scripts/migrar-sqlite-para-postgres.ts
 *
 * IMPORTANTE:
 *   - Rode primeiro contra uma cópia do Postgres de HOMOLOGAÇÃO, nunca
 *     direto em produção sem validar os números (pedidos, faturamento).
 *   - O dev.db original NUNCA é alterado (é só lido).
 *   - Idempotente na Empresa: se já existir uma empresa com o slug
 *     "disk-pizza-rozeno", ela é reaproveitada (não duplica).
 *   - Usa `node:sqlite` (nativo do Node 22+) para ler o arquivo antigo
 *     sem precisar reinstalar dependências — se sua versão do Node não
 *     tiver esse módulo, troque por `better-sqlite3` (mesma API de leitura).
 */

import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";

const SQLITE_ORIGEM = process.env.SQLITE_ORIGEM ?? "./prisma/dev.db";
const SLUG_ROZENO = "disk-pizza-rozeno";

const prisma = new PrismaClient();
const origem = new DatabaseSync(SQLITE_ORIGEM, { readOnly: true });

function todasLinhas<T = Record<string, unknown>>(sql: string): T[] {
  return origem.prepare(sql).all() as T[];
}

/** SQLite guarda booleans como 0/1 — normaliza para o Postgres. */
function bool(v: unknown): boolean {
  return v === 1 || v === true;
}
function data(v: unknown): Date | null {
  return v ? new Date(String(v)) : null;
}

async function main() {
  console.log("🏢 Garantindo a empresa Disk Pizza Rozeno (primeiro tenant)…");
  const empresa = await prisma.empresa.upsert({
    where: { slug: SLUG_ROZENO },
    update: {},
    create: {
      nome: "Disk Pizza Rozeno",
      slug: SLUG_ROZENO,
      status: "ativa",
      plano: "completo",
      modulos: JSON.stringify([
        "pdv", "mesas", "kds", "delivery", "entregador", "estoque",
        "relatorios", "whatsapp", "fiscal", "impressao", "copiloto",
      ]),
      planoInicioEm: new Date(),
    },
  });
  const empresaId = empresa.id;
  console.log(`   → empresaId = ${empresaId}`);

  console.log("👤 Usuários…");
  for (const u of todasLinhas<any>("SELECT * FROM Usuario")) {
    await prisma.usuario.upsert({
      where: { email: u.email },
      update: {},
      create: {
        id: u.id,
        empresaId,
        nome: u.nome,
        email: u.email,
        senhaHash: u.senhaHash,
        papel: u.papel,
        ativo: bool(u.ativo),
        ultimoAcesso: data(u.ultimoAcesso),
        criadoEm: data(u.criadoEm) ?? new Date(),
      },
    });
  }

  console.log("📚 Categorias, produtos, sabores, tamanhos, adicionais…");
  for (const c of todasLinhas<any>("SELECT * FROM Categoria")) {
    await prisma.categoria.create({ data: { id: c.id, empresaId, nome: c.nome, ordem: c.ordem } });
  }
  for (const p of todasLinhas<any>("SELECT * FROM Produto")) {
    await prisma.produto.create({
      data: {
        id: p.id,
        empresaId,
        nome: p.nome,
        descricao: p.descricao,
        preco: p.preco,
        categoriaId: p.categoriaId,
        emoji: p.emoji,
        destaque: bool(p.destaque),
        ativo: bool(p.ativo),
        ncm: p.ncm ?? "",
        cest: p.cest ?? "",
        csosn: p.csosn ?? "102",
        cfop: p.cfop ?? "5102",
        unidade: p.unidade ?? "UN",
      },
    });
  }
  for (const s of todasLinhas<any>("SELECT * FROM Sabor")) {
    await prisma.sabor.create({ data: { id: s.id, empresaId, nome: s.nome, tipo: s.tipo } });
  }
  for (const ps of todasLinhas<any>("SELECT * FROM ProdutoSabor")) {
    await prisma.produtoSabor.create({ data: { produtoId: ps.produtoId, saborId: ps.saborId } });
  }
  for (const t of todasLinhas<any>("SELECT * FROM Tamanho")) {
    await prisma.tamanho.create({ data: { id: t.id, empresaId, nome: t.nome, fatorPreco: t.fatorPreco } });
  }
  for (const pt of todasLinhas<any>("SELECT * FROM PrecoTamanho")) {
    await prisma.precoTamanho.create({ data: { produtoId: pt.produtoId, tamanhoId: pt.tamanhoId, valor: pt.valor } });
  }
  for (const a of todasLinhas<any>("SELECT * FROM Adicional")) {
    await prisma.adicional.create({ data: { id: a.id, empresaId, nome: a.nome, preco: a.preco, ativo: bool(a.ativo) } });
  }

  console.log("🪑 Mesas…");
  for (const m of todasLinhas<any>("SELECT * FROM Mesa")) {
    await prisma.mesa.create({
      data: {
        id: m.id,
        empresaId,
        numero: m.numero,
        capacidade: m.capacidade,
        status: m.status,
        garcom: m.garcom,
        pessoas: m.pessoas,
        abertaEm: data(m.abertaEm),
        criadoEm: data(m.criadoEm) ?? new Date(),
      },
    });
  }
  // Realinha a sequência do autoincrement (Postgres) após inserir com id explícito.
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"Mesa"', 'id'), COALESCE((SELECT MAX(id) FROM "Mesa"), 1))`
  );

  console.log("👥 Clientes e endereços…");
  const clienteIds = new Set<string>();
  for (const c of todasLinhas<any>("SELECT * FROM Cliente")) {
    clienteIds.add(c.id);
    await prisma.cliente.create({
      data: { id: c.id, empresaId, nome: c.nome, telefone: c.telefone, email: c.email, criadoEm: data(c.criadoEm) ?? new Date() },
    });
  }
  for (const e of todasLinhas<any>("SELECT * FROM Endereco")) {
    await prisma.endereco.create({
      data: {
        id: e.id,
        clienteId: e.clienteId,
        rotulo: e.rotulo,
        rua: e.rua,
        bairro: e.bairro,
        cidade: e.cidade,
        cep: e.cep,
        complemento: e.complemento,
        referencia: e.referencia,
      },
    });
  }

  console.log("🧾 Pedidos, itens, pagamentos, entregas, documentos fiscais…");
  for (const p of todasLinhas<any>("SELECT * FROM Pedido")) {
    await prisma.pedido.create({
      data: {
        id: p.id,
        empresaId,
        numero: p.numero,
        canal: p.canal,
        status: p.status,
        producao: p.producao,
        recebidoEm: data(p.recebidoEm) ?? new Date(),
        preparoIniciadoEm: data(p.preparoIniciadoEm),
        prontoEm: data(p.prontoEm),
        finalizadoEm: data(p.finalizadoEm),
        clienteNome: p.clienteNome,
        clienteId: p.clienteId,
        clienteTelefone: p.clienteTelefone,
        mesaId: p.mesaId,
        observacao: p.observacao,
        previsao: p.previsao,
        taxaEntrega: p.taxaEntrega ?? 0,
        trocoPara: p.trocoPara ?? 0,
        formaPagamentoEntrega: p.formaPagamentoEntrega,
        origem: p.origem,
        total: p.total ?? 0,
        criadoEm: data(p.criadoEm) ?? new Date(),
        atualizadoEm: data(p.atualizadoEm) ?? new Date(),
      },
    });
  }
  for (const i of todasLinhas<any>("SELECT * FROM ItemPedido")) {
    await prisma.itemPedido.create({
      data: {
        id: i.id,
        pedidoId: i.pedidoId,
        produtoId: i.produtoId,
        nome: i.nome,
        precoUnit: i.precoUnit,
        quantidade: i.quantidade,
        tamanho: i.tamanho,
        observacao: i.observacao,
        sabores: i.sabores,
        adicionais: i.adicionais,
      },
    });
  }
  for (const pg of todasLinhas<any>("SELECT * FROM Pagamento")) {
    await prisma.pagamento.create({
      data: {
        id: pg.id,
        empresaId,
        pedidoId: pg.pedidoId,
        forma: pg.forma,
        valor: pg.valor,
        troco: pg.troco ?? 0,
        status: pg.status,
        criadoEm: data(pg.criadoEm) ?? new Date(),
      },
    });
  }
  for (const e of todasLinhas<any>("SELECT * FROM Entregador")) {
    await prisma.entregador.create({
      data: { id: e.id, empresaId, nome: e.nome, email: e.email, ativo: bool(e.ativo), avaliacao: e.avaliacao, statusHoje: e.statusHoje },
    });
  }
  for (const e of todasLinhas<any>("SELECT * FROM Entrega")) {
    await prisma.entrega.create({
      data: {
        id: e.id,
        empresaId,
        pedidoId: e.pedidoId,
        entregadorId: e.entregadorId,
        endereco: e.endereco,
        bairro: e.bairro,
        complemento: e.complemento,
        referencia: e.referencia,
        telefone: e.telefone,
        status: e.status,
        previsao: e.previsao,
        km: e.km ?? 0,
        gorjeta: e.gorjeta ?? 0,
        tempoMedio: e.tempoMedio,
        ocorrencia: e.ocorrencia,
        iniciadaEm: data(e.iniciadaEm),
        concluidaEm: data(e.concluidaEm),
        criadoEm: data(e.criadoEm) ?? new Date(),
      },
    });
  }
  for (const d of todasLinhas<any>("SELECT * FROM DocumentoFiscal")) {
    await prisma.documentoFiscal.create({
      data: {
        id: d.id,
        empresaId,
        pedidoId: d.pedidoId,
        status: d.status,
        ambiente: d.ambiente,
        provedor: d.provedor,
        numero: d.numero,
        serie: d.serie,
        chave: d.chave,
        protocolo: d.protocolo,
        cStat: d.cStat,
        xMotivo: d.xMotivo,
        xml: d.xml,
        danfeUrl: d.danfeUrl,
        qrcodeUrl: d.qrcodeUrl,
        qrcodeTexto: d.qrcodeTexto,
        erro: d.erro,
        tentativas: d.tentativas ?? 0,
        emitidaEm: data(d.emitidaEm),
        autorizadaEm: data(d.autorizadaEm),
        canceladaEm: data(d.canceladaEm),
        motivoCancelamento: d.motivoCancelamento,
        criadoEm: data(d.criadoEm) ?? new Date(),
        atualizadoEm: data(d.atualizadoEm) ?? new Date(),
      },
    });
  }

  console.log("💰 Caixa, movimentações, estoque, notas fiscais…");
  for (const c of todasLinhas<any>("SELECT * FROM Caixa")) {
    await prisma.caixa.create({
      data: {
        id: c.id,
        empresaId,
        abertoEm: data(c.abertoEm) ?? new Date(),
        fechadoEm: data(c.fechadoEm),
        saldoInicial: c.saldoInicial ?? 0,
        status: c.status,
      },
    });
  }
  for (const m of todasLinhas<any>("SELECT * FROM MovimentacaoCaixa")) {
    await prisma.movimentacaoCaixa.create({
      data: {
        id: m.id,
        empresaId,
        caixaId: m.caixaId,
        tipo: m.tipo,
        valor: m.valor,
        descricao: m.descricao,
        metodo: m.metodo,
        criadoEm: data(m.criadoEm) ?? new Date(),
      },
    });
  }
  for (const e of todasLinhas<any>("SELECT * FROM EstoqueProduto")) {
    await prisma.estoqueProduto.create({
      data: { id: e.id, empresaId, nome: e.nome, categoria: e.categoria, unidade: e.unidade, quantidade: e.quantidade, minimo: e.minimo, custoUnitario: e.custoUnitario },
    });
  }
  for (const m of todasLinhas<any>("SELECT * FROM MovimentacaoEstoque")) {
    await prisma.movimentacaoEstoque.create({
      data: {
        id: m.id,
        empresaId,
        produtoId: m.produtoId,
        tipo: m.tipo,
        quantidade: m.quantidade,
        fornecedor: m.fornecedor,
        valorTotal: m.valorTotal,
        responsavel: m.responsavel,
        notaId: m.notaId,
        criadoEm: data(m.criadoEm) ?? new Date(),
      },
    });
  }
  for (const n of todasLinhas<any>("SELECT * FROM NotaFiscal")) {
    await prisma.notaFiscal.create({
      data: { id: n.id, empresaId, numero: n.numero, serie: n.serie, fornecedor: n.fornecedor, emissao: data(n.emissao) ?? new Date(), itens: n.itens, valor: n.valor, status: n.status },
    });
  }

  console.log("⚙️  Configurações, WhatsApp, impressão, backups, auditoria…");
  for (const c of todasLinhas<any>("SELECT * FROM Configuracao")) {
    await prisma.configuracao.upsert({
      where: { empresaId_chave: { empresaId, chave: c.chave } },
      update: { valor: c.valor },
      create: { empresaId, chave: c.chave, valor: c.valor },
    });
  }
  for (const conv of todasLinhas<any>("SELECT * FROM ConversaWhatsApp")) {
    await prisma.conversaWhatsApp.create({
      data: {
        id: conv.id,
        empresaId,
        telefone: conv.telefone,
        nome: conv.nome,
        status: conv.status,
        etapa: conv.etapa,
        estado: conv.estado,
        atendimentoHumano: bool(conv.atendimentoHumano),
        humanaDesde: data(conv.humanaDesde),
        motivoTransferencia: conv.motivoTransferencia,
        ultimaPergunta: conv.ultimaPergunta,
        origem: conv.origem,
        pedidoId: conv.pedidoId,
        criadoEm: data(conv.criadoEm) ?? new Date(),
        atualizadoEm: data(conv.atualizadoEm) ?? new Date(),
      },
    });
  }
  for (const msg of todasLinhas<any>("SELECT * FROM MensagemWhatsApp")) {
    await prisma.mensagemWhatsApp.create({
      data: { id: msg.id, conversaId: msg.conversaId, de: msg.de, texto: msg.texto, criadoEm: data(msg.criadoEm) ?? new Date() },
    });
  }
  for (const f of todasLinhas<any>("SELECT * FROM FilaImpressao")) {
    await prisma.filaImpressao.create({
      data: {
        id: f.id,
        empresaId,
        tipo: f.tipo,
        destino: f.destino,
        referencia: f.referencia,
        conteudo: f.conteudo,
        vias: f.vias ?? 1,
        status: f.status,
        tentativas: f.tentativas ?? 0,
        erro: f.erro,
        criadoPor: f.criadoPor,
        criadoEm: data(f.criadoEm) ?? new Date(),
        atualizadoEm: data(f.atualizadoEm) ?? new Date(),
        concluidoEm: data(f.concluidoEm),
      },
    });
  }
  for (const b of todasLinhas<any>("SELECT * FROM Backup")) {
    await prisma.backup.create({
      data: { id: b.id, empresaId, data: data(b.data) ?? new Date(), tipo: b.tipo, tamanho: b.tamanho, destino: b.destino, status: b.status },
    });
  }
  for (const a of todasLinhas<any>("SELECT * FROM Auditoria")) {
    await prisma.auditoria.create({
      data: { id: a.id, empresaId, usuarioId: a.usuarioId, usuarioNome: a.usuarioNome, acao: a.acao, detalhe: a.detalhe, ip: a.ip, criadoEm: data(a.criadoEm) ?? new Date() },
    });
  }

  console.log("✅ Migração concluída. Confira os números (pedidos, faturamento) antes de considerar produção.");
}

main()
  .catch((e) => {
    console.error("❌ Falha na migração:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    origem.close();
    await prisma.$disconnect();
  });

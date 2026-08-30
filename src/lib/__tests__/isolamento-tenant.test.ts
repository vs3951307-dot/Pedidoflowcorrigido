import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { Client } from "pg";
import { prisma } from "@/lib/prisma";
import { criarPedido } from "@/lib/pedidos/criar-pedido";
import { registrarPagamento } from "@/lib/pagamentos/registrar-pagamento";
import { confirmarPagamentoEntrega } from "@/lib/pagamentos/confirmar-pagamento-entrega";
import { novaChaveIdempotencia } from "@/lib/idempotencia";
import {
  clientePg,
  comoEmpresa,
  contextoDe,
  empresasDoSeed,
  prismaNoSchema,
  usuarioDeTeste,
  type EmpresaDeTeste,
} from "@/lib/__tests__/ajuda-banco-de-teste";

/**
 * ITEM 8 DA AUDITORIA — isolamento multiempresa/tenant, provado contra
 * um PostgreSQL real, incluindo PEDIDOS e PAGAMENTOS.
 *
 * A suíte que já existia (`isolamento-multiempresa.test.ts`) valida o
 * isolamento LÓGICO — o filtro por `empresaId` nas consultas. Esta aqui
 * valida o isolamento ESTRUTURAL, que é a arquitetura real do
 * PedidoFlow: cada empresa tem um SCHEMA PostgreSQL próprio
 * (`tenant_<slug>`), e o Prisma Client de uma empresa fisicamente não
 * enxerga as tabelas da outra.
 *
 * A diferença importa: o teste lógico continuaria passando mesmo se as
 * duas empresas dividissem a mesma tabela. Aqui a asserção é que o dado
 * de B NÃO EXISTE no espaço de nomes de A — nem por id, nem sem filtro,
 * nem por chave de idempotência, nem por caminho de escrita.
 *
 * "Uma empresa nunca pode visualizar, alterar ou reutilizar dados da
 * outra" é verificado nas três formas: LER, ALTERAR e REUTILIZAR.
 */

let empresaA: EmpresaDeTeste;
let empresaB: EmpresaDeTeste;
let dbA: PrismaClient;
let dbB: PrismaClient;
let pg: Client;
let produtoA: { id: string; nome: string };
let produtoB: { id: string; nome: string };

const lixo: { schema: string; pedidoId: string }[] = [];

async function produtoSimples(db: PrismaClient, empresaId: string) {
  const p = await db.produto.findFirst({
    where: { empresaId, sabores: { none: {} }, ativo: true },
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  });
  if (!p) throw new Error("Seed sem produto simples.");
  return p;
}

async function novoPedido(empresa: EmpresaDeTeste, produto: { id: string; nome: string }) {
  const r = await comoEmpresa(empresa, () =>
    criarPedido(empresa.id, usuarioDeTeste(), {
      canal: "balcao",
      itens: [{ produtoId: produto.id, nome: produto.nome, quantidade: 1 }],
      idempotencyKey: novaChaveIdempotencia(),
    })
  );
  if (!r.ok) throw new Error(`Falha ao preparar pedido: ${r.erro}`);
  lixo.push({ schema: empresa.schemaBanco!, pedidoId: r.pedido.id });
  return r.pedido;
}

beforeAll(async () => {
  const { a, b } = await empresasDoSeed();
  empresaA = a;
  empresaB = b;
  dbA = prismaNoSchema(a.schemaBanco!);
  dbB = prismaNoSchema(b.schemaBanco!);
  pg = await clientePg();
  produtoA = await produtoSimples(dbA, a.id);
  produtoB = await produtoSimples(dbB, b.id);
});

afterEach(async () => {
  for (const { schema, pedidoId } of lixo) {
    const db = schema === empresaA.schemaBanco ? dbA : dbB;
    const pedido = await db.pedido.findUnique({ where: { id: pedidoId }, select: { numero: true } });
    if (pedido) {
      await db.movimentacaoCaixa.deleteMany({ where: { descricao: { contains: `Pedido #${pedido.numero}` } } });
    }
    await db.pagamento.deleteMany({ where: { pedidoId } });
    await db.itemPedido.deleteMany({ where: { pedidoId } });
    await db.pedido.deleteMany({ where: { id: pedidoId } });
  }
  lixo.length = 0;
});

afterAll(async () => {
  await dbA.$disconnect();
  await dbB.$disconnect();
  await pg.end();
});

describe("Fundação: os dois tenants são schemas PostgreSQL distintos", () => {
  it("cada empresa tem seu próprio schema, e os dois existem no banco", async () => {
    expect(empresaA.schemaBanco).toBeTruthy();
    expect(empresaB.schemaBanco).toBeTruthy();
    expect(empresaA.schemaBanco).not.toBe(empresaB.schemaBanco);

    const r = await pg.query<{ nspname: string }>(
      `SELECT nspname FROM pg_namespace WHERE nspname = ANY($1)`,
      [[empresaA.schemaBanco, empresaB.schemaBanco]]
    );
    expect(r.rows.map((x) => x.nspname).sort()).toEqual(
      [empresaA.schemaBanco!, empresaB.schemaBanco!].sort()
    );
  });

  it("a tabela Pedido existe SEPARADAMENTE em cada schema (não é uma tabela compartilhada)", async () => {
    const r = await pg.query<{ table_schema: string }>(
      `SELECT table_schema FROM information_schema.tables
        WHERE table_name = 'Pedido' AND table_schema = ANY($1)`,
      [[empresaA.schemaBanco, empresaB.schemaBanco]]
    );
    expect(r.rows).toHaveLength(2);
  });

  it("o contexto de tenant resolvido aponta para o schema certo de cada empresa", async () => {
    const ctxA = await contextoDe(empresaA);
    const ctxB = await contextoDe(empresaB);
    expect(ctxA.schemaBanco).toBe(empresaA.schemaBanco);
    expect(ctxB.schemaBanco).toBe(empresaB.schemaBanco);
    expect(ctxA.client).not.toBe(ctxB.client);
  });
});

describe("VISUALIZAR: uma empresa nunca enxerga dados da outra", () => {
  it("o PEDIDO da empresa B não existe no schema da empresa A (nem por id)", async () => {
    const pedidoB = await novoPedido(empresaB, produtoB);

    expect(await dbA.pedido.findUnique({ where: { id: pedidoB.id } })).toBeNull();
    expect(await dbA.pedido.count({ where: { id: pedidoB.id } })).toBe(0);
    expect(await dbB.pedido.count({ where: { id: pedidoB.id } })).toBe(1);
  });

  it("uma listagem SEM NENHUM filtro no schema A não traz nada do schema B", async () => {
    // Consulta deliberadamente sem `where` — se houvesse vazamento
    // estrutural, ele apareceria justamente aqui.
    const pedidoB = await novoPedido(empresaB, produtoB);
    const todosDeA = await dbA.pedido.findMany({ select: { id: true, empresaId: true } });
    expect(todosDeA.some((p) => p.id === pedidoB.id)).toBe(false);
    expect(todosDeA.every((p) => p.empresaId === empresaA.id)).toBe(true);
  });

  it("o PAGAMENTO da empresa B não existe no schema da empresa A", async () => {
    const pedidoB = await novoPedido(empresaB, produtoB);
    const rB = await comoEmpresa(empresaB, () =>
      registrarPagamento(empresaB.id, usuarioDeTeste(), pedidoB.id, {
        forma: "pix",
        valor: pedidoB.total,
        idempotencyKey: novaChaveIdempotencia(),
      })
    );
    expect(rB.ok).toBe(true);
    if (!rB.ok) return;

    expect(await dbA.pagamento.findUnique({ where: { id: rB.pagamento.id } })).toBeNull();
    const pagamentosDeA = await dbA.pagamento.findMany({ select: { empresaId: true } });
    expect(pagamentosDeA.every((p) => p.empresaId === empresaA.id)).toBe(true);
  });

  it("clientes, produtos, caixa e mesas de B nunca aparecem em A", async () => {
    for (const tabela of ["cliente", "produto", "caixa", "mesa", "categoria", "entrega"] as const) {
      const delegateA = dbA[tabela] as { findMany: (a: unknown) => Promise<{ empresaId: string }[]> };
      const linhas = await delegateA.findMany({ select: { empresaId: true } });
      const invasores = linhas.filter((l) => l.empresaId !== empresaA.id);
      expect(invasores, `"${tabela}" do schema de A contém linha(s) de outra empresa`).toEqual([]);
    }
  });

  it("buscar um PEDIDO de B pelo caminho de negócio de A devolve 404, não o pedido", async () => {
    const pedidoB = await novoPedido(empresaB, produtoB);
    const r = await comoEmpresa(empresaA, () =>
      registrarPagamento(empresaA.id, usuarioDeTeste(), pedidoB.id, {
        forma: "pix",
        valor: 10,
        idempotencyKey: novaChaveIdempotencia(),
      })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(404);
      expect(r.erro).toContain("não encontrado");
    }
  });
});

describe("ALTERAR: uma empresa nunca modifica dados da outra", () => {
  it("A não consegue alterar o PEDIDO de B (updateMany afeta 0 linhas)", async () => {
    const pedidoB = await novoPedido(empresaB, produtoB);
    const antes = await dbB.pedido.findUniqueOrThrow({ where: { id: pedidoB.id } });

    const resultado = await dbA.pedido.updateMany({
      where: { id: pedidoB.id },
      data: { status: "cancelado", total: 0 },
    });
    expect(resultado.count).toBe(0);

    const depois = await dbB.pedido.findUniqueOrThrow({ where: { id: pedidoB.id } });
    expect(depois.status).toBe(antes.status);
    expect(depois.total).toBe(antes.total);
  });

  it("A não consegue excluir o PEDIDO de B", async () => {
    const pedidoB = await novoPedido(empresaB, produtoB);
    const resultado = await dbA.pedido.deleteMany({ where: { id: pedidoB.id } });
    expect(resultado.count).toBe(0);
    expect(await dbB.pedido.count({ where: { id: pedidoB.id } })).toBe(1);
  });

  it("A não consegue confirmar o PAGAMENTO de entrega de B", async () => {
    const pedidoB = await novoPedido(empresaB, produtoB);
    const pgB = await dbB.pagamento.create({
      data: { empresaId: empresaB.id, pedidoId: pedidoB.id, forma: "pix", valor: pedidoB.total, status: "pendente" },
    });

    const r = await comoEmpresa(empresaA, () =>
      confirmarPagamentoEntrega(empresaA.id, usuarioDeTeste("ADMINISTRADOR"), pgB.id, {})
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);

    // O pagamento de B continua pendente — ninguém de fora o tocou.
    const aindaPendente = await dbB.pagamento.findUniqueOrThrow({ where: { id: pgB.id } });
    expect(aindaPendente.status).toBe("pendente");
  });

  it("A não consegue vender um PRODUTO de B (preço/estoque de outro tenant)", async () => {
    const r = await comoEmpresa(empresaA, () =>
      criarPedido(empresaA.id, usuarioDeTeste(), {
        canal: "balcao",
        itens: [{ produtoId: produtoB.id, nome: produtoB.nome, quantidade: 1 }],
        idempotencyKey: novaChaveIdempotencia(),
      })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.erro).toContain("Produto inexistente");
    }
  });

  it("A não consegue vincular um CLIENTE de B ao próprio pedido", async () => {
    const clienteB = await dbB.cliente.create({
      data: { empresaId: empresaB.id, nome: `Cliente B ${Date.now()}`, telefone: `9${Date.now()}`.slice(0, 11) },
    });
    try {
      const r = await comoEmpresa(empresaA, () =>
        criarPedido(empresaA.id, usuarioDeTeste(), {
          canal: "balcao",
          itens: [{ produtoId: produtoA.id, nome: produtoA.nome, quantidade: 1 }],
          clienteId: clienteB.id,
          idempotencyKey: novaChaveIdempotencia(),
        })
      );
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.status).toBe(400);
        expect(r.erro).toContain("Cliente inexistente");
      }
    } finally {
      await dbB.cliente.deleteMany({ where: { id: clienteB.id } });
    }
  });

  it("um pedido criado sob o contexto de A é gravado NO SCHEMA DE A, nunca no de B", async () => {
    const pedido = await novoPedido(empresaA, produtoA);
    const noSchemaA = await pg.query(
      `SELECT 1 FROM "${empresaA.schemaBanco}"."Pedido" WHERE id = $1`,
      [pedido.id]
    );
    const noSchemaB = await pg.query(
      `SELECT 1 FROM "${empresaB.schemaBanco}"."Pedido" WHERE id = $1`,
      [pedido.id]
    );
    expect(noSchemaA.rowCount).toBe(1);
    expect(noSchemaB.rowCount).toBe(0);
  });
});

describe("REUTILIZAR: identificadores de uma empresa não valem na outra", () => {
  it("a mesma idempotencyKey de PEDIDO nas duas empresas gera dois pedidos independentes", async () => {
    const chave = novaChaveIdempotencia();
    const rA = await comoEmpresa(empresaA, () =>
      criarPedido(empresaA.id, usuarioDeTeste(), {
        canal: "balcao",
        itens: [{ produtoId: produtoA.id, nome: produtoA.nome, quantidade: 1 }],
        idempotencyKey: chave,
      })
    );
    const rB = await comoEmpresa(empresaB, () =>
      criarPedido(empresaB.id, usuarioDeTeste(), {
        canal: "balcao",
        itens: [{ produtoId: produtoB.id, nome: produtoB.nome, quantidade: 1 }],
        idempotencyKey: chave,
      })
    );
    expect(rA.ok && rB.ok).toBe(true);
    if (!rA.ok || !rB.ok) return;
    lixo.push({ schema: empresaA.schemaBanco!, pedidoId: rA.pedido.id });
    lixo.push({ schema: empresaB.schemaBanco!, pedidoId: rB.pedido.id });

    // Nenhuma foi tratada como retry da outra, e nenhuma foi bloqueada.
    expect(rA.idempotente).toBe(false);
    expect(rB.idempotente).toBe(false);
    expect(rA.pedido.id).not.toBe(rB.pedido.id);
  });

  it("o NÚMERO de pedido é sequencial por empresa — os contadores são independentes", async () => {
    const [antesA, antesB] = await Promise.all([
      dbA.pedido.aggregate({ _max: { numero: true } }),
      dbB.pedido.aggregate({ _max: { numero: true } }),
    ]);

    const pA = await novoPedido(empresaA, produtoA);
    const pB = await novoPedido(empresaB, produtoB);

    // Cada empresa avança o PRÓPRIO contador, a partir do próprio máximo.
    expect(pA.numero).toBeGreaterThan(antesA._max.numero ?? 0);
    expect(pB.numero).toBeGreaterThan(antesB._max.numero ?? 0);
    // Criar um pedido em A não pode mexer no contador de B.
    const depoisB = await dbB.contadorPedido.findUnique({ where: { empresaId: empresaB.id } });
    expect(depoisB?.ultimoNumero).toBe(pB.numero);
  });

  it("empresas diferentes podem ter pedidos com o MESMO número, sem conflito", async () => {
    // A unicidade é `(empresaId, numero)` — nunca global. Se fosse
    // global, uma empresa "gastaria" números da outra.
    const numeroCompartilhado = 900000 + Math.floor(Math.random() * 90000);
    const criados: { db: PrismaClient; id: string }[] = [];
    try {
      const a = await dbA.pedido.create({
        data: { empresaId: empresaA.id, numero: numeroCompartilhado, canal: "balcao", total: 1 },
      });
      criados.push({ db: dbA, id: a.id });
      const b = await dbB.pedido.create({
        data: { empresaId: empresaB.id, numero: numeroCompartilhado, canal: "balcao", total: 1 },
      });
      criados.push({ db: dbB, id: b.id });
      expect(a.numero).toBe(b.numero);
      expect(a.id).not.toBe(b.id);
    } finally {
      for (const { db, id } of criados) await db.pedido.deleteMany({ where: { id } });
    }
  });
});

describe("Guarda do proxy: sem tenant ativo, nada de dado de empresa", () => {
  it("acessar um model de tenant SEM contexto ativo lança erro, em vez de cair na plataforma", () => {
    // Uma rota nova que esquecesse de chamar `autorizar()` cairia aqui.
    // O comportamento correto é falhar alto — nunca ler/gravar em silêncio
    // no schema `public` (ou no do último tenant que passou por ali).
    //
    // A guarda dispara já no ACESSO À PROPRIEDADE (`prisma.pedido`), antes
    // de qualquer consulta ser montada — por isso a asserção é de throw
    // síncrono, não de promise rejeitada. Falhar mais cedo é melhor: nem
    // chega a existir uma query para vazar.
    expect(() => prisma.pedido).toThrow(/sem um tenant ativo/i);
    expect(() => prisma.pagamento).toThrow(/sem um tenant ativo/i);
    expect(() => prisma.cliente).toThrow(/sem um tenant ativo/i);
  });

  it("dentro do contexto de A, o mesmo acesso funciona e devolve só dados de A", async () => {
    const pedidos = await comoEmpresa(empresaA, () =>
      prisma.pedido.findMany({ take: 5, select: { empresaId: true } })
    );
    expect(pedidos.every((p) => p.empresaId === empresaA.id)).toBe(true);
  });
});

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { criarPedido } from "@/lib/pedidos/criar-pedido";
import { registrarPagamento } from "@/lib/pagamentos/registrar-pagamento";
import { confirmarPagamentoEntrega } from "@/lib/pagamentos/confirmar-pagamento-entrega";
import { novaChaveIdempotencia } from "@/lib/idempotencia";
import {
  comoEmpresa,
  empresasDoSeed,
  prismaNoSchema,
  usuarioDeTeste,
  type EmpresaDeTeste,
} from "@/lib/__tests__/ajuda-banco-de-teste";

/**
 * ITEM 2 DA AUDITORIA — duplicidade de pagamentos, provada contra um
 * PostgreSQL real.
 *
 * Duas afirmações precisam ser provadas ao mesmo tempo, e elas puxam em
 * direções opostas — por isso a suíte cobre as duas explicitamente:
 *
 *   (A) NÃO PODE DUPLICAR: retry/duplo clique da mesma tentativa cria um
 *       único registro, e o valor entra uma única vez no caixa.
 *   (B) NÃO PODE BLOQUEAR: pagamentos LEGÍTIMOS simultâneos — de outro
 *       cliente, outra mesa, outro pedido, outra empresa, ou duas
 *       parcelas da mesma conta dividida — precisam TODOS passar.
 *
 * A regra removida ("existe outro pagamento confirmado nos últimos 5
 * segundos? então 409") falhava nas duas: bloqueava (B) e não impedia
 * (A). Os testes abaixo falham se ela voltar em qualquer forma.
 */

let empresaA: EmpresaDeTeste;
let empresaB: EmpresaDeTeste;
let dbA: PrismaClient;
let dbB: PrismaClient;
let produtoA: { id: string; nome: string; preco: number };
let produtoB: { id: string; nome: string; preco: number };

const lixo: { schema: string; pedidoId: string }[] = [];

async function produtoSimples(db: PrismaClient, empresaId: string) {
  const p = await db.produto.findFirst({
    where: { empresaId, sabores: { none: {} }, ativo: true },
    select: { id: true, nome: true, preco: true },
    orderBy: { nome: "asc" },
  });
  if (!p) throw new Error("Seed sem produto simples — a suíte precisa de um item de cardápio real.");
  return p;
}

/** Cria um pedido de balcão real e devolve id/numero/total. */
async function novoPedido(empresa: EmpresaDeTeste, produto: { id: string; nome: string }, quantidade = 1) {
  const r = await comoEmpresa(empresa, () =>
    criarPedido(empresa.id, usuarioDeTeste(), {
      canal: "balcao",
      itens: [{ produtoId: produto.id, nome: produto.nome, quantidade }],
      idempotencyKey: novaChaveIdempotencia(),
    })
  );
  if (!r.ok) throw new Error(`Falha ao preparar o pedido de teste: ${r.erro}`);
  lixo.push({ schema: empresa.schemaBanco!, pedidoId: r.pedido.id });
  return r.pedido;
}

beforeAll(async () => {
  const { a, b } = await empresasDoSeed();
  empresaA = a;
  empresaB = b;
  dbA = prismaNoSchema(a.schemaBanco!);
  dbB = prismaNoSchema(b.schemaBanco!);
  produtoA = await produtoSimples(dbA, a.id);
  produtoB = await produtoSimples(dbB, b.id);
});

afterEach(async () => {
  // Movimentações de caixa geradas pelos pagamentos desta suíte saem
  // junto — senão o fechamento de caixa do seed ficaria inflado.
  for (const { schema, pedidoId } of lixo) {
    const db = schema === empresaA.schemaBanco ? dbA : dbB;
    const pedido = await db.pedido.findUnique({ where: { id: pedidoId }, select: { numero: true } });
    if (pedido) {
      await db.movimentacaoCaixa.deleteMany({
        where: { descricao: { contains: `Pedido #${pedido.numero}` } },
      });
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
});

describe("(B) Pagamentos LEGÍTIMOS simultâneos NÃO podem ser bloqueados", () => {
  it("dois pedidos DIFERENTES, pagos no mesmo instante, são AMBOS registrados", async () => {
    // Este é o caso que a regra dos "5 segundos" quebrava: dois clientes
    // distintos pagando ao mesmo tempo, e o segundo levava 409.
    const p1 = await novoPedido(empresaA, produtoA);
    const p2 = await novoPedido(empresaA, produtoA);

    const [r1, r2] = await comoEmpresa(empresaA, () =>
      Promise.all([
        registrarPagamento(empresaA.id, usuarioDeTeste(), p1.id, {
          forma: "pix",
          valor: p1.total,
          idempotencyKey: novaChaveIdempotencia(),
        }),
        registrarPagamento(empresaA.id, usuarioDeTeste(), p2.id, {
          forma: "pix",
          valor: p2.total,
          idempotencyKey: novaChaveIdempotencia(),
        }),
      ])
    );

    expect(r1.ok, r1.ok ? "" : `pedido 1 recusado: ${r1.erro}`).toBe(true);
    expect(r2.ok, r2.ok ? "" : `pedido 2 recusado: ${r2.erro}`).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.quitado).toBe(true);
    expect(r2.quitado).toBe(true);
    expect(r1.pagamento.id).not.toBe(r2.pagamento.id);

    // Os dois valores existem no banco, cada um no seu pedido.
    expect(await dbA.pagamento.count({ where: { pedidoId: p1.id, status: "confirmado" } })).toBe(1);
    expect(await dbA.pagamento.count({ where: { pedidoId: p2.id, status: "confirmado" } })).toBe(1);
  });

  it("dez pagamentos legítimos simultâneos, de dez pedidos diferentes, passam TODOS", async () => {
    const pedidos: Awaited<ReturnType<typeof novoPedido>>[] = [];
    for (let i = 0; i < 10; i++) pedidos.push(await novoPedido(empresaA, produtoA));

    const resultados = await comoEmpresa(empresaA, () =>
      Promise.all(
        pedidos.map((p) =>
          registrarPagamento(empresaA.id, usuarioDeTeste(), p.id, {
            forma: "pix",
            valor: p.total,
            idempotencyKey: novaChaveIdempotencia(),
          })
        )
      )
    );

    const recusados = resultados.filter((r) => !r.ok);
    expect(
      recusados.map((r) => (r.ok ? "" : `${r.status}: ${r.erro}`)),
      "nenhum pagamento legítimo pode ser recusado"
    ).toEqual([]);
    expect(resultados.filter((r) => r.ok).length).toBe(10);
  });

  it("CONTA DIVIDIDA: duas parcelas legítimas do MESMO valor e forma, simultâneas, são as duas registradas", async () => {
    // Duas pessoas pagando metade cada, em dinheiro, no mesmo instante.
    // Uma chave derivada de (pedido+forma+valor) faria a segunda colidir
    // com a primeira e sumir — por isso a chave é por TENTATIVA.
    const pedido = await novoPedido(empresaA, produtoA, 2);
    const metade = Math.round((pedido.total / 2) * 100) / 100;

    const [r1, r2] = await comoEmpresa(empresaA, () =>
      Promise.all([
        registrarPagamento(empresaA.id, usuarioDeTeste(), pedido.id, {
          forma: "pix",
          valor: metade,
          idempotencyKey: novaChaveIdempotencia(),
        }),
        registrarPagamento(empresaA.id, usuarioDeTeste(), pedido.id, {
          forma: "pix",
          valor: metade,
          idempotencyKey: novaChaveIdempotencia(),
        }),
      ])
    );

    expect(r1.ok, r1.ok ? "" : `parcela 1 recusada: ${r1.erro}`).toBe(true);
    expect(r2.ok, r2.ok ? "" : `parcela 2 recusada: ${r2.erro}`).toBe(true);
    if (!r1.ok || !r2.ok) return;

    // DOIS registros distintos (nenhum tratado como retry do outro).
    expect(r1.idempotente).toBe(false);
    expect(r2.idempotente).toBe(false);
    expect(r1.pagamento.id).not.toBe(r2.pagamento.id);

    const pagos = await dbA.pagamento.findMany({ where: { pedidoId: pedido.id, status: "confirmado" } });
    expect(pagos).toHaveLength(2);
    const somaPaga = pagos.reduce((s, p) => s + p.valor, 0);
    expect(somaPaga).toBeCloseTo(pedido.total, 2);

    // Exatamente UMA das duas fechou a conta (a que entrou por último).
    expect([r1.quitado, r2.quitado].filter(Boolean)).toHaveLength(1);
  });

  it("empresas DIFERENTES pagando no mesmo instante, com a MESMA chave, não se bloqueiam", async () => {
    // Antes, o índice único de `idempotencyKey` era GLOBAL: uma chave já
    // usada pela empresa A fazia o INSERT da empresa B falhar (P2002) —
    // literalmente "um pagamento de outro cliente bloqueando uma
    // cobrança legítima".
    const chave = novaChaveIdempotencia();
    const pedA = await novoPedido(empresaA, produtoA);
    const pedB = await novoPedido(empresaB, produtoB);

    const rA = await comoEmpresa(empresaA, () =>
      registrarPagamento(empresaA.id, usuarioDeTeste(), pedA.id, {
        forma: "pix",
        valor: pedA.total,
        idempotencyKey: chave,
      })
    );
    const rB = await comoEmpresa(empresaB, () =>
      registrarPagamento(empresaB.id, usuarioDeTeste(), pedB.id, {
        forma: "pix",
        valor: pedB.total,
        idempotencyKey: chave,
      })
    );

    expect(rA.ok, rA.ok ? "" : `empresa A recusada: ${rA.erro}`).toBe(true);
    expect(rB.ok, rB.ok ? "" : `empresa B recusada: ${rB.erro}`).toBe(true);
    if (!rA.ok || !rB.ok) return;
    expect(rA.idempotente).toBe(false);
    expect(rB.idempotente).toBe(false);
    expect(rA.pagamento.id).not.toBe(rB.pagamento.id);
    // Nenhuma empresa enxerga o pagamento da outra.
    expect(await dbB.pagamento.count({ where: { id: rA.pagamento.id } })).toBe(0);
    expect(await dbA.pagamento.count({ where: { id: rB.pagamento.id } })).toBe(0);
  });

  it("confirmação de ENTREGA de um pedido não bloqueia a de outro no mesmo instante", async () => {
    // Caminho exato onde vivia a regra dos 5 segundos: `PATCH
    // /api/pagamentos/[id]`. Dois entregadores confirmando recebimento
    // ao mesmo tempo precisam passar os dois.
    const ped1 = await novoPedido(empresaA, produtoA);
    const ped2 = await novoPedido(empresaA, produtoA);
    const [pg1, pg2] = await Promise.all([
      dbA.pagamento.create({
        data: { empresaId: empresaA.id, pedidoId: ped1.id, forma: "pix", valor: ped1.total, status: "pendente" },
      }),
      dbA.pagamento.create({
        data: { empresaId: empresaA.id, pedidoId: ped2.id, forma: "pix", valor: ped2.total, status: "pendente" },
      }),
    ]);

    const [r1, r2] = await comoEmpresa(empresaA, () =>
      Promise.all([
        confirmarPagamentoEntrega(empresaA.id, usuarioDeTeste("ADMINISTRADOR"), pg1.id, {}),
        confirmarPagamentoEntrega(empresaA.id, usuarioDeTeste("ADMINISTRADOR"), pg2.id, {}),
      ])
    );

    expect(r1.ok, r1.ok ? "" : `entrega 1 recusada: ${r1.erro}`).toBe(true);
    expect(r2.ok, r2.ok ? "" : `entrega 2 recusada: ${r2.erro}`).toBe(true);
  });
});

describe("(A) A MESMA tentativa NÃO pode ser cobrada duas vezes", () => {
  it("duas requisições simultâneas com a MESMA chave criam 1 pagamento só", async () => {
    const pedido = await novoPedido(empresaA, produtoA);
    const chave = novaChaveIdempotencia();

    const [r1, r2] = await comoEmpresa(empresaA, () =>
      Promise.all([
        registrarPagamento(empresaA.id, usuarioDeTeste(), pedido.id, {
          forma: "pix",
          valor: pedido.total,
          idempotencyKey: chave,
        }),
        registrarPagamento(empresaA.id, usuarioDeTeste(), pedido.id, {
          forma: "pix",
          valor: pedido.total,
          idempotencyKey: chave,
        }),
      ])
    );

    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.pagamento.id).toBe(r2.pagamento.id);

    // A PROVA: uma linha só, e o valor cobrado uma vez só.
    const pagos = await dbA.pagamento.findMany({ where: { pedidoId: pedido.id } });
    expect(pagos).toHaveLength(1);
    expect(pagos[0].valor).toBeCloseTo(pedido.total, 2);
  });

  it("retry sequencial com a mesma chave devolve o pagamento original, sem cobrar de novo", async () => {
    const pedido = await novoPedido(empresaA, produtoA);
    const chave = novaChaveIdempotencia();

    const primeira = await comoEmpresa(empresaA, () =>
      registrarPagamento(empresaA.id, usuarioDeTeste(), pedido.id, {
        forma: "pix",
        valor: pedido.total,
        idempotencyKey: chave,
      })
    );
    const segunda = await comoEmpresa(empresaA, () =>
      registrarPagamento(empresaA.id, usuarioDeTeste(), pedido.id, {
        forma: "pix",
        valor: pedido.total,
        idempotencyKey: chave,
      })
    );

    expect(primeira.ok && !primeira.idempotente).toBe(true);
    expect(segunda.ok && segunda.idempotente).toBe(true);
    if (!primeira.ok || !segunda.ok) return;
    expect(segunda.pagamento.id).toBe(primeira.pagamento.id);
    expect(await dbA.pagamento.count({ where: { pedidoId: pedido.id } })).toBe(1);
  });

  it("dupla confirmação simultânea do MESMO pagamento de entrega: só uma passa", async () => {
    const pedido = await novoPedido(empresaA, produtoA);
    const pg = await dbA.pagamento.create({
      data: { empresaId: empresaA.id, pedidoId: pedido.id, forma: "pix", valor: pedido.total, status: "pendente" },
    });

    const [r1, r2] = await comoEmpresa(empresaA, () =>
      Promise.all([
        confirmarPagamentoEntrega(empresaA.id, usuarioDeTeste("ADMINISTRADOR"), pg.id, {}),
        confirmarPagamentoEntrega(empresaA.id, usuarioDeTeste("ADMINISTRADOR"), pg.id, {}),
      ])
    );

    const aceitos = [r1, r2].filter((r) => r.ok);
    const recusados = [r1, r2].filter((r) => !r.ok);
    expect(aceitos).toHaveLength(1);
    expect(recusados).toHaveLength(1);
    expect(recusados[0].ok === false && recusados[0].status).toBe(409);
    expect(recusados[0].ok === false && recusados[0].codigo).toBe("ALREADY_APPLIED");

    // O valor entrou UMA vez só no caixa (era o efeito colateral que a
    // dupla confirmação duplicava, inflando o fechamento do dia).
    const movimentacoes = await dbA.movimentacaoCaixa.count({
      where: { descricao: `Pedido #${pedido.numero} — pagamento na entrega` },
    });
    expect(movimentacoes).toBe(1);
  });

  it("conta já quitada recusa um pagamento novo (409), sem criar registro", async () => {
    const pedido = await novoPedido(empresaA, produtoA);
    const primeiro = await comoEmpresa(empresaA, () =>
      registrarPagamento(empresaA.id, usuarioDeTeste(), pedido.id, {
        forma: "pix",
        valor: pedido.total,
        idempotencyKey: novaChaveIdempotencia(),
      })
    );
    expect(primeiro.ok).toBe(true);

    const segundo = await comoEmpresa(empresaA, () =>
      registrarPagamento(empresaA.id, usuarioDeTeste(), pedido.id, {
        forma: "pix",
        valor: pedido.total,
        idempotencyKey: novaChaveIdempotencia(),
      })
    );
    expect(segundo.ok).toBe(false);
    if (!segundo.ok) expect(segundo.status).toBe(409);
    expect(await dbA.pagamento.count({ where: { pedidoId: pedido.id } })).toBe(1);
  });

  it("valor acima do saldo restante é recusado (400)", async () => {
    const pedido = await novoPedido(empresaA, produtoA);
    const r = await comoEmpresa(empresaA, () =>
      registrarPagamento(empresaA.id, usuarioDeTeste(), pedido.id, {
        forma: "pix",
        valor: pedido.total + 50,
        idempotencyKey: novaChaveIdempotencia(),
      })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
    expect(await dbA.pagamento.count({ where: { pedidoId: pedido.id } })).toBe(0);
  });

  it("nunca aceita mais dinheiro do que a conta vale, mesmo com 4 parcelas simultâneas", async () => {
    // Sem o `SELECT ... FOR UPDATE` da conta, as quatro leriam o mesmo
    // "saldo restante = total" e o total pago passaria do valor da conta.
    const pedido = await novoPedido(empresaA, produtoA, 4);
    const quarto = Math.floor((pedido.total / 4) * 100) / 100;

    await comoEmpresa(empresaA, () =>
      Promise.all(
        Array.from({ length: 4 }, () =>
          registrarPagamento(empresaA.id, usuarioDeTeste(), pedido.id, {
            forma: "pix",
            valor: quarto,
            idempotencyKey: novaChaveIdempotencia(),
          })
        )
      )
    );

    const pagos = await dbA.pagamento.findMany({ where: { pedidoId: pedido.id, status: "confirmado" } });
    const soma = pagos.reduce((s, p) => s + p.valor, 0);
    expect(soma).toBeLessThanOrEqual(pedido.total + 0.01);
  });
});

describe("Validação da chave de pagamento", () => {
  it("recusa pagamento sem idempotencyKey (400)", async () => {
    const pedido = await novoPedido(empresaA, produtoA);
    const r = await comoEmpresa(empresaA, () =>
      registrarPagamento(empresaA.id, usuarioDeTeste(), pedido.id, { forma: "pix", valor: pedido.total })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it("recusa idempotencyKey que não é UUID v4 (400)", async () => {
    const pedido = await novoPedido(empresaA, produtoA);
    const r = await comoEmpresa(empresaA, () =>
      registrarPagamento(empresaA.id, usuarioDeTeste(), pedido.id, {
        forma: "pix",
        valor: pedido.total,
        idempotencyKey: "clique-1",
      })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });
});

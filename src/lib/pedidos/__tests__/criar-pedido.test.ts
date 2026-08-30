import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { criarPedido } from "@/lib/pedidos/criar-pedido";
import { novaChaveIdempotencia } from "@/lib/idempotencia";
import {
  comoEmpresa,
  empresasDoSeed,
  prismaNoSchema,
  usuarioDeTeste,
  type EmpresaDeTeste,
} from "@/lib/__tests__/ajuda-banco-de-teste";

/**
 * ITEM 1 DA AUDITORIA — idempotência de pedidos, provada contra um
 * PostgreSQL real.
 *
 * A afirmação que precisa ser provada é literal: "duas requisições
 * simultâneas com a mesma chave devem gerar somente 1 pedido". Isso não
 * dá para provar com mock: o que impede o segundo pedido é o índice
 * único `(empresaId, idempotencyKey)` e o bloqueio de INSERT do próprio
 * Postgres. A suíte chama `criarPedido` — a MESMA função que a rota
 * `POST /api/pedidos` usa — e depois CONTA as linhas no banco.
 */

let empresaA: EmpresaDeTeste;
let empresaB: EmpresaDeTeste;
let dbA: PrismaClient;
let dbB: PrismaClient;
let produtoSimplesA: { id: string; nome: string; preco: number };
let produtoSimplesB: { id: string; nome: string; preco: number };

const pedidosCriados: { schema: string; id: string }[] = [];

/** Corpo mínimo válido de pedido de balcão. */
function corpoPedido(produtoId: string, nome: string, extra: Record<string, unknown> = {}) {
  return {
    canal: "balcao",
    itens: [{ produtoId, nome, quantidade: 1 }],
    ...extra,
  };
}

async function produtoSemSabores(db: PrismaClient, empresaId: string) {
  const produto = await db.produto.findFirst({
    where: { empresaId, sabores: { none: {} }, ativo: true },
    select: { id: true, nome: true, preco: true },
    orderBy: { nome: "asc" },
  });
  if (!produto) {
    throw new Error(
      "Nenhum produto simples (sem sabores) encontrado no seed — a suíte precisa de um item de cardápio real."
    );
  }
  return produto;
}

beforeAll(async () => {
  const { a, b } = await empresasDoSeed();
  empresaA = a;
  empresaB = b;
  dbA = prismaNoSchema(a.schemaBanco!);
  dbB = prismaNoSchema(b.schemaBanco!);
  produtoSimplesA = await produtoSemSabores(dbA, a.id);
  produtoSimplesB = await produtoSemSabores(dbB, b.id);
});

afterAll(async () => {
  // Limpa só o que ESTA suíte criou (nunca um TRUNCATE): itens e
  // pagamentos primeiro (FK), depois o pedido.
  for (const { schema, id } of pedidosCriados) {
    const db = schema === empresaA.schemaBanco ? dbA : dbB;
    await db.itemPedido.deleteMany({ where: { pedidoId: id } });
    await db.pagamento.deleteMany({ where: { pedidoId: id } });
    await db.pedido.deleteMany({ where: { id } });
  }
  await dbA.$disconnect();
  await dbB.$disconnect();
});

function registrar(empresa: EmpresaDeTeste, id: string) {
  pedidosCriados.push({ schema: empresa.schemaBanco!, id });
}

describe("Idempotência de pedidos — CONCORRÊNCIA (a prova do item 1)", () => {
  it("duas requisições SIMULTÂNEAS com a mesma chave criam exatamente 1 pedido", async () => {
    const chave = novaChaveIdempotencia();

    const [r1, r2] = await comoEmpresa(empresaA, () =>
      // Sem `await` entre as duas: as transações realmente se sobrepõem
      // no banco. Quem perde a corrida recebe P2002 do índice único e
      // relê o pedido vencedor.
      Promise.all([
        criarPedido(empresaA.id, usuarioDeTeste(), corpoPedido(produtoSimplesA.id, produtoSimplesA.nome, { idempotencyKey: chave })),
        criarPedido(empresaA.id, usuarioDeTeste(), corpoPedido(produtoSimplesA.id, produtoSimplesA.nome, { idempotencyKey: chave })),
      ])
    );

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;

    // As duas respostas apontam para o MESMO pedido.
    expect(r1.pedido.id).toBe(r2.pedido.id);
    expect(r1.pedido.numero).toBe(r2.pedido.numero);
    registrar(empresaA, r1.pedido.id);

    // Uma criou (201) e a outra reconheceu o retry (200) — exatamente uma
    // de cada, nunca duas criações.
    const criacoes = [r1, r2].filter((r) => r.ok && !r.idempotente);
    const replays = [r1, r2].filter((r) => r.ok && r.idempotente);
    expect(criacoes).toHaveLength(1);
    expect(replays).toHaveLength(1);
    expect(criacoes[0].ok && criacoes[0].status).toBe(201);
    expect(replays[0].ok && replays[0].status).toBe(200);

    // A PROVA no banco: exatamente uma linha com aquela chave.
    const linhas = await dbA.pedido.count({ where: { empresaId: empresaA.id, idempotencyKey: chave } });
    expect(linhas).toBe(1);

    // E o item foi criado UMA vez só (nem duplicado, nem perdido no rollback).
    const itens = await dbA.itemPedido.count({ where: { pedidoId: r1.pedido.id } });
    expect(itens).toBe(1);
  });

  it("cinco requisições simultâneas com a mesma chave também criam apenas 1 pedido", async () => {
    const chave = novaChaveIdempotencia();

    const resultados = await comoEmpresa(empresaA, () =>
      Promise.all(
        Array.from({ length: 5 }, () =>
          criarPedido(
            empresaA.id,
            usuarioDeTeste(),
            corpoPedido(produtoSimplesA.id, produtoSimplesA.nome, { idempotencyKey: chave })
          )
        )
      )
    );

    for (const r of resultados) expect(r.ok).toBe(true);
    const ids = new Set(resultados.map((r) => (r.ok ? r.pedido.id : "erro")));
    expect(ids.size).toBe(1);
    registrar(empresaA, [...ids][0]);

    const linhas = await dbA.pedido.count({ where: { empresaId: empresaA.id, idempotencyKey: chave } });
    expect(linhas).toBe(1);
  });

  it("retry SEQUENCIAL (rede caiu, usuário reenviou) devolve o mesmo pedido, sem criar outro", async () => {
    const chave = novaChaveIdempotencia();

    const primeira = await comoEmpresa(empresaA, () =>
      criarPedido(empresaA.id, usuarioDeTeste(), corpoPedido(produtoSimplesA.id, produtoSimplesA.nome, { idempotencyKey: chave }))
    );
    const segunda = await comoEmpresa(empresaA, () =>
      criarPedido(empresaA.id, usuarioDeTeste(), corpoPedido(produtoSimplesA.id, produtoSimplesA.nome, { idempotencyKey: chave }))
    );

    expect(primeira.ok && primeira.idempotente).toBe(false);
    expect(segunda.ok && segunda.idempotente).toBe(true);
    if (!primeira.ok || !segunda.ok) return;
    expect(segunda.pedido.id).toBe(primeira.pedido.id);
    registrar(empresaA, primeira.pedido.id);

    expect(await dbA.pedido.count({ where: { empresaId: empresaA.id, idempotencyKey: chave } })).toBe(1);
  });
});

describe("Idempotência de pedidos — a chave é gravada em coluna própria", () => {
  it("a chave NÃO contamina a observação do pedido (o defeito original)", async () => {
    // A implementação antiga guardava a chave em `Pedido.observacao` — que
    // era sobrescrito logo depois pela observação real. Este teste fixa os
    // dois lados: a observação é a do usuário, e a chave está no campo dela.
    const chave = novaChaveIdempotencia();
    const observacaoReal = "Sem cebola, por favor";

    const r = await comoEmpresa(empresaA, () =>
      criarPedido(
        empresaA.id,
        usuarioDeTeste(),
        corpoPedido(produtoSimplesA.id, produtoSimplesA.nome, { idempotencyKey: chave, observacao: observacaoReal })
      )
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    registrar(empresaA, r.pedido.id);

    const gravado = await dbA.pedido.findUniqueOrThrow({ where: { id: r.pedido.id } });
    expect(gravado.observacao).toBe(observacaoReal);
    expect(gravado.idempotencyKey).toBe(chave);
  });

  it("chaves DIFERENTES criam pedidos diferentes (dois pedidos legítimos iguais não se anulam)", async () => {
    const [r1, r2] = await comoEmpresa(empresaA, async () => [
      await criarPedido(empresaA.id, usuarioDeTeste(), corpoPedido(produtoSimplesA.id, produtoSimplesA.nome, { idempotencyKey: novaChaveIdempotencia() })),
      await criarPedido(empresaA.id, usuarioDeTeste(), corpoPedido(produtoSimplesA.id, produtoSimplesA.nome, { idempotencyKey: novaChaveIdempotencia() })),
    ]);
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    registrar(empresaA, r1.pedido.id);
    registrar(empresaA, r2.pedido.id);
    expect(r1.pedido.id).not.toBe(r2.pedido.id);
    expect(r1.pedido.numero).not.toBe(r2.pedido.numero);
  });

  it("pedido SEM chave continua funcionando (compatibilidade com clientes antigos)", async () => {
    const r = await comoEmpresa(empresaA, () =>
      criarPedido(empresaA.id, usuarioDeTeste(), corpoPedido(produtoSimplesA.id, produtoSimplesA.nome))
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    registrar(empresaA, r.pedido.id);
    const gravado = await dbA.pedido.findUniqueOrThrow({ where: { id: r.pedido.id } });
    expect(gravado.idempotencyKey).toBeNull();
  });

  it("dois pedidos SEM chave convivem (NULLs são distintos no índice único)", async () => {
    const [r1, r2] = await comoEmpresa(empresaA, async () => [
      await criarPedido(empresaA.id, usuarioDeTeste(), corpoPedido(produtoSimplesA.id, produtoSimplesA.nome)),
      await criarPedido(empresaA.id, usuarioDeTeste(), corpoPedido(produtoSimplesA.id, produtoSimplesA.nome)),
    ]);
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    registrar(empresaA, r1.pedido.id);
    registrar(empresaA, r2.pedido.id);
    expect(r1.pedido.id).not.toBe(r2.pedido.id);
  });
});

describe("Idempotência de pedidos — validação do formato UUID v4", () => {
  it("recusa chave que não é UUID v4, em vez de ignorá-la em silêncio", async () => {
    // Ignorar uma chave malformada seria pior que recusar: o cliente
    // acharia que está protegido contra retry e não estaria.
    for (const chaveInvalida of ["123", "nao-e-uuid", "00000000-0000-0000-0000-000000000000", ""]) {
      const r = await comoEmpresa(empresaA, () =>
        criarPedido(
          empresaA.id,
          usuarioDeTeste(),
          corpoPedido(produtoSimplesA.id, produtoSimplesA.nome, { idempotencyKey: chaveInvalida })
        )
      );
      if (chaveInvalida === "") {
        // String vazia = "não enviou chave" → criação normal.
        expect(r.ok).toBe(true);
        if (r.ok) registrar(empresaA, r.pedido.id);
      } else {
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.status).toBe(400);
      }
    }
  });

  it("aceita a chave gerada por novaChaveIdempotencia() (contrato cliente ↔ servidor)", async () => {
    const chave = novaChaveIdempotencia();
    const r = await comoEmpresa(empresaA, () =>
      criarPedido(empresaA.id, usuarioDeTeste(), corpoPedido(produtoSimplesA.id, produtoSimplesA.nome, { idempotencyKey: chave }))
    );
    expect(r.ok).toBe(true);
    if (r.ok) registrar(empresaA, r.pedido.id);
  });
});

describe("Idempotência de pedidos — isolamento entre empresas (item 8)", () => {
  it("a MESMA chave em duas empresas cria dois pedidos independentes, um em cada schema", async () => {
    // Com o índice único GLOBAL que existia antes, a segunda empresa
    // receberia P2002 e sua venda seria bloqueada por uma chave de outro
    // cliente. Com o índice por empresa, cada uma segue seu caminho.
    const chave = novaChaveIdempotencia();

    const rA = await comoEmpresa(empresaA, () =>
      criarPedido(empresaA.id, usuarioDeTeste(), corpoPedido(produtoSimplesA.id, produtoSimplesA.nome, { idempotencyKey: chave }))
    );
    const rB = await comoEmpresa(empresaB, () =>
      criarPedido(empresaB.id, usuarioDeTeste(), corpoPedido(produtoSimplesB.id, produtoSimplesB.nome, { idempotencyKey: chave }))
    );

    expect(rA.ok).toBe(true);
    expect(rB.ok).toBe(true);
    if (!rA.ok || !rB.ok) return;
    registrar(empresaA, rA.pedido.id);
    registrar(empresaB, rB.pedido.id);

    // Nenhuma das duas foi tratada como retry da outra.
    expect(rA.idempotente).toBe(false);
    expect(rB.idempotente).toBe(false);
    expect(rA.pedido.id).not.toBe(rB.pedido.id);

    // Cada pedido vive no schema da SUA empresa — e não aparece no da outra.
    expect(await dbA.pedido.count({ where: { id: rA.pedido.id } })).toBe(1);
    expect(await dbB.pedido.count({ where: { id: rA.pedido.id } })).toBe(0);
    expect(await dbB.pedido.count({ where: { id: rB.pedido.id } })).toBe(1);
    expect(await dbA.pedido.count({ where: { id: rB.pedido.id } })).toBe(0);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { criarPedido } from "@/lib/pedidos/criar-pedido";
import { novaChaveIdempotencia } from "@/lib/idempotencia";
import {
  comoEmpresa,
  empresasDoSeed,
  prismaNoSchema,
  type EmpresaDeTeste,
} from "@/lib/__tests__/ajuda-banco-de-teste";

/**
 * PONTO CEGO DA AUDITORIA (passo 4 de CORRECOES-AUDITORIA.md) — paridade de
 * preço entre os canais PDV e WhatsApp.
 *
 * POR QUE ESTE TESTE EXISTE: o WhatsApp tinha uma SEGUNDA implementação de
 * criação de pedido (`criarPedidoReal` no `motor.ts`) que calculava preço com
 * `lib/precificacao.ts` — que IGNORA sabores — enquanto o PDV usava
 * `lib/preco-pizza.ts` (maior preço entre sabores + acréscimo por sabor
 * premium adicional). Resultado real: uma pizza Família com 3 sabores
 * especiais saía por R$ 72 pelo WhatsApp e R$ 92 pelo PDV. Esse bug viveu
 * tanto tempo porque NENHUM teste comparava os dois canais com o mesmo pedido.
 *
 * A correção fez o WhatsApp delegar ao MESMO `criarPedido()` do PDV (uma
 * única fonte de verdade), mas isso foi guardado por um teste ESTRUTURAL
 * (que lê o arquivo-fonte). Este é o teste de VALOR que faltava: cria o
 * MESMO pedido pelos dois caminhos contra um PostgreSQL real e afirma que
 * os totais batem.
 *
 * O `motor.ts` monta o corpo com `origem:"whatsapp"`, `canal:"retirada"` e
 * usuário de papel SISTEMA (nunca GARCOM, que forçaria canal "salao"); o
 * PDV manda `origem:"pdv"`, `canal:"balcao"` e um usuário CAIXA. Os `itens`
 * são idênticos — só o rótulo muda. Se algum dia um canal voltar a cobrar
 * diferente, este teste acusa.
 *
 * SETUP: a regra de preço de pizza (config `pizza`) NÃO nasce no `seed.ts` —
 * é criada por `scripts/setup-config-pizza.ts` (no boot do Render, agora) ou
 * aqui, no `beforeAll`, para que o caso de 2+ sabores premium não receba 409
 * (`criar-pedido.ts`: "regra de preço de pizza não configurada"). O upsert é
 * idempotente: se já existir, mantém a que está.
 */

const VALOR_PADRAO_PIZZA = {
  acrescimoPorSaborPremium: 10,
  permitirMisturarDoceSalgada: true,
};

let empresa: EmpresaDeTeste;
let db: PrismaClient;

// Produto "base" da pizza (o que o PDV e o WhatsApp enviam em `produtoId`):
// um produto do catálogo que TEM sabores e PRECO de tamanho "Família".
let pizzaBase: { id: string; nome: string };
// Nome dos sabores escolhidos: 3 especiais (Doritos, Tomate Seco, Filé na
// Chapa) + um tradicional (4 Queijos) para o caso meia-a-meia.
let sabores3: string[];

const pedidosCriados: { schema: string; id: string }[] = [];

function registrar(id: string) {
  pedidosCriados.push({ schema: empresa.schemaBanco!, id });
}

async function garantirConfigPizza() {
  const valor = JSON.stringify(VALOR_PADRAO_PIZZA);
  await db.configuracao.upsert({
    where: { empresaId_chave: { empresaId: empresa.id, chave: "pizza" } },
    create: { empresaId: empresa.id, chave: "pizza", valor },
    update: {},
  });
}

beforeAll(async () => {
  const { a } = await empresasDoSeed();
  empresa = a;
  db = prismaNoSchema(a.schemaBanco!);

  await garantirConfigPizza();

  // Encontra um produto que é pizza (tem sabores vinculados) com preço de
  // "Família" no cadastro — sem hardcode de id, para ser robusto a mudanças
  // de seed. Precisa ter ao menos 3 sabores distintos do pool (Família
  // aceita 3) e os sabores especiais compondo o total famoso de R$ 92.
  const pizza = await db.produto.findFirst({
    where: {
      empresaId: empresa.id,
      ativo: true,
      sabores: { some: {} },
      precos: { some: { tamanho: { nome: "Família" }, valor: { gt: 0 } } },
    },
    include: { sabores: { include: { sabor: { select: { nome: true } } } } },
    orderBy: { nome: "asc" },
  });
  if (!pizza) {
    throw new Error(
      "Nenhum produto de pizza com preço de Família encontrado no seed. " +
        "Rode `npx prisma migrate deploy && npx prisma db seed` contra o banco de TESTE."
    );
  }
  pizzaBase = { id: pizza.id, nome: pizza.nome };

  // Sabores disponíveis no cadastro desta empresa (nomes dos Sabor vinculados
  // aos produtos de pizza). A ordem favorece os 3 especiais do caso R$ 92,
  // com 4 Queijos (tradicional) como reserva para o caso meia-a-meia.
  const nomes = await db.produto.findMany({
    where: { empresaId: empresa.id, ativo: true, sabores: { some: {} } },
    select: { preco: true, sabores: { select: { sabor: { select: { nome: true, tipo: true } } } } },
  });
  const pool = new Map<string, string>();
  for (const p of nomes) {
    for (const ps of p.sabores) pool.set(ps.sabor.nome, ps.sabor.tipo);
  }

  const preferidos = ["Doritos", "Tomate Seco", "Filé na Chapa"];
  sabores3 = preferidos.filter((n) => pool.has(n));
  if (sabores3.length < 3) {
    // Fallback genérico: quaisquer 3 sabores, dando prioridade a especiais.
    const especiais = [...pool.entries()]
      .filter(([, tipo]) => tipo !== "tradicional")
      .map(([nome]) => nome);
    sabores3 = [...especiais, ...[...pool.keys()].filter((n) => !especiais.includes(n))].slice(0, 3);
  }
  if (sabores3.length < 3) {
    throw new Error(
      "O seed precisa de ao menos 3 sabores num produto de pizza Família para a paridade. " +
        "Rode o seed do banco de TESTE."
    );
  }
});

afterAll(async () => {
  // Limpa só o que ESTA suíte criou (nunca TRUNCATE): itens e pagamentos
  // primeiro (FK), depois o pedido.
  for (const { id } of pedidosCriados) {
    await db.itemPedido.deleteMany({ where: { pedidoId: id } });
    await db.pagamento.deleteMany({ where: { pedidoId: id } });
    await db.pedido.deleteMany({ where: { id } });
  }
  await db.$disconnect();
});

/** Itens idênticos para os dois canais — pizza Família com os sabores do caso. */
function itensPizza() {
  return [
    {
      produtoId: pizzaBase.id,
      nome: pizzaBase.nome,
      quantidade: 1,
      tamanho: "Família",
      sabores: sabores3,
    },
  ];
}

/**
 * Corpo tal qual o PDV monta (front → `POST /api/pedidos`): canal balcão,
 * origem pdv, usuário de caixa. Sem `precoUnit` — o servidor recalcula tudo.
 */
function corpoPdv() {
  return {
    canal: "balcao",
    origem: "pdv",
    itens: itensPizza(),
    idempotencyKey: novaChaveIdempotencia(),
  };
}

/**
 * Corpo tal qual o `motor.ts` monta (`criarPedidoReal`, linha ~1017):
 * canal retirada (não-entrega), origem whatsapp, usuário de papel SISTEMA
 * (nunca GARCOM). Idem: sem `precoUnit`.
 */
function corpoWhatsApp() {
  return {
    canal: "retirada",
    origem: "whatsapp",
    observacao: "Pedido via WhatsApp",
    itens: itensPizza(),
    idempotencyKey: novaChaveIdempotencia(),
  };
}

describe("Paridade de preço — PDV × WhatsApp (mesmo pedido, mesmo total)", () => {
  it("Família com 3 sabores especiais custa R$ 92 nos DOIS canais (o bug que voltou 72)", async () => {
    const [viaPdv, viaWhats] = await comoEmpresa(empresa, async () => [
      await criarPedido(empresa.id, { id: "usr-pdv", nome: "Caixa", papel: "CAIXA" }, corpoPdv()),
      await criarPedido(
        empresa.id,
        { id: "whatsapp", nome: "Atendente WhatsApp", papel: "SISTEMA" },
        corpoWhatsApp()
      ),
    ]);

    expect(viaPdv.ok).toBe(true);
    expect(viaWhats.ok).toBe(true);
    if (!viaPdv.ok || !viaWhats.ok) return;
    registrar(viaPdv.pedido.id);
    registrar(viaWhats.pedido.id);

    // O pedido realmente saiu pelo canal esperado (rótulo não muda o preço).
    const gravado = await db.pedido.findUniqueOrThrow({ where: { id: viaPdv.pedido.id } });
    expect(gravado.origem).toBe("pdv");
    expect(gravado.canal).toBe("balcao");
    const gravadoW = await db.pedido.findUniqueOrThrow({ where: { id: viaWhats.pedido.id } });
    expect(gravadoW.origem).toBe("whatsapp");
    expect(gravadoW.canal).toBe("retirada");

    // A PARIDADE: o total não pode depender do canal.
    expect(viaWhats.pedido.total).toBe(viaPdv.pedido.total);
    // E o valor conhecido fechado com o dono do negócio (spec §2).
    expect(viaPdv.pedido.total).toBe(92);
    expect(viaWhats.pedido.total).toBe(92);
  });

  it("meia-a-meia tradicional + especial cobra o MAIOR preço, igual nos dois canais, independente da ordem", async () => {
    // Resolve um sabor especial e um tradicional do cadastro para montar o par.
    const especial = sabores3[0];
    const tradRow = await db.produto.findFirst({
      where: { empresaId: empresa.id, ativo: true, sabores: { some: { sabor: { tipo: "tradicional" } } } },
      select: { sabores: { select: { sabor: { select: { nome: true } } } } },
    });
    const tradicional = tradRow?.sabores[0]?.sabor.nome;
    if (!tradicional) throw new Error("Seed sem sabor tradicional para o caso meia-a-meia.");

    const montar = (sabores: string[]) => {
      return {
        canal: "balcao",
        origem: "pdv",
        itens: [{ produtoId: pizzaBase.id, nome: pizzaBase.nome, quantidade: 1, tamanho: "Família", sabores }],
        idempotencyKey: novaChaveIdempotencia(),
      };
    };

    const r1 = await comoEmpresa(empresa, () => criarPedido(empresa.id, { id: "u", nome: "Caixa", papel: "CAIXA" }, montar([tradicional, especial])));
    const r2 = await comoEmpresa(empresa, () => criarPedido(empresa.id, { id: "u", nome: "Caixa", papel: "CAIXA" }, montar([especial, tradicional])));
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    registrar(r1.pedido.id);
    registrar(r2.pedido.id);

    // A ordem de escolha não pode mudar o preço (maior preço, não primeiro).
    expect(r1.pedido.total).toBe(r2.pedido.total);
  });

  it("produto simples (sem sabores) também bate nos dois canais", async () => {
    const simples = await db.produto.findFirst({
      where: { empresaId: empresa.id, ativo: true, sabores: { none: {} } },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    });
    if (!simples) throw new Error("Seed sem produto simples (sem sabores) para o caso de paridade.");

    const montar = (origem: string, canal: string, key: string) => ({
      origem,
      canal,
      itens: [{ produtoId: simples.id, nome: simples.nome, quantidade: 1 }],
      idempotencyKey: key,
    });

    const [viaPdv, viaWhats] = await comoEmpresa(empresa, async () => [
      await criarPedido(empresa.id, { id: "u", nome: "Caixa", papel: "CAIXA" }, montar("pdv", "balcao", novaChaveIdempotencia())),
      await criarPedido(empresa.id, { id: "whatsapp", nome: "Atendente WhatsApp", papel: "SISTEMA" }, montar("whatsapp", "retirada", novaChaveIdempotencia())),
    ]);

    expect(viaPdv.ok).toBe(true);
    expect(viaWhats.ok).toBe(true);
    if (!viaPdv.ok || !viaWhats.ok) return;
    registrar(viaPdv.pedido.id);
    registrar(viaWhats.pedido.id);

    expect(viaWhats.pedido.total).toBe(viaPdv.pedido.total);
  });
});

import { Client } from "pg";
import { PrismaClient } from "@prisma/client";
import { tenantALS, type ContextoTenant } from "@/lib/tenant-context";
import { ativarTenant } from "@/lib/tenant-db";

/**
 * Utilitários das suítes que rodam contra um PostgreSQL REAL.
 *
 * POR QUE BANCO REAL, E NÃO MOCK: o que estas suítes provam é
 * exatamente o comportamento do banco — índices únicos resolvendo
 * corridas (itens 1 e 2), `SELECT ... FOR UPDATE` serializando duas
 * transações, isolamento entre schemas de tenant (item 8), e o
 * `CREATE UNIQUE INDEX` recusado quando há duplicata (item 4). Um mock
 * responderia o que mandássemos responder e esconderia justamente os
 * defeitos que a auditoria pediu para corrigir.
 *
 * REGRA DE SEGURANÇA: nada aqui roda sem `garantirBancoDeTeste()`, que
 * se recusa a tocar num banco que não esteja claramente marcado como de
 * teste. As suítes criam e removem dados; apontar para produção por
 * engano seria destrutivo.
 */

/** `true` quando falta banco — as suítes que dependem dele FALHAM, nunca "passam". */
export function urlDoBanco(): string {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) {
    throw new Error(
      "DATABASE_URL não configurada. Estas suítes exigem um PostgreSQL de TESTE real — " +
        "elas não podem ser puladas nem mockadas sem deixar de provar o que precisam provar. " +
        'Ex.: DATABASE_URL="postgresql://postgres@127.0.0.1:5433/pedidoflow_test?schema=public" npm test'
    );
  }
  return url;
}

/**
 * Recusa-se a rodar contra um banco que não esteja marcado como de
 * teste. Aceita: nome do banco contendo "test", host local, ou a
 * variável `PEDIDOFLOW_TEST_DB=1` (escape hatch explícito e consciente).
 */
export function garantirBancoDeTeste(): string {
  const url = urlDoBanco();
  if (process.env.PEDIDOFLOW_TEST_DB === "1") return url;
  const parsed = new URL(url);
  const nomeBanco = parsed.pathname.replace(/^\//, "");
  const hostLocal = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (/test/i.test(nomeBanco) || hostLocal) return url;
  throw new Error(
    `Recusando rodar os testes de banco contra "${parsed.hostname}/${nomeBanco}": ` +
      `estas suítes CRIAM E APAGAM dados. Aponte DATABASE_URL para um banco de teste ` +
      `(nome contendo "test" ou host local), ou defina PEDIDOFLOW_TEST_DB=1 se tiver certeza.`
  );
}

/** Cliente `pg` cru (para inspecionar o catálogo do Postgres direto). */
export async function clientePg(): Promise<Client> {
  const cliente = new Client({ connectionString: garantirBancoDeTeste() });
  await cliente.connect();
  return cliente;
}

/** URL de conexão apontando para um schema específico. */
export function urlComSchema(schema: string): string {
  const u = new URL(garantirBancoDeTeste());
  u.searchParams.set("schema", schema);
  return u.toString();
}

/** PrismaClient ligado direto num schema (sem passar pelo contexto de tenant). */
export function prismaNoSchema(schema: string): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: urlComSchema(schema) } } });
}

export interface EmpresaDeTeste {
  id: string;
  nome: string;
  slug: string;
  schemaBanco: string | null;
  databaseUrlSecreta: string | null;
}

/**
 * Executa `fn` DENTRO do contexto de tenant de uma empresa — o mesmo
 * caminho que uma requisição real percorre (`comTratamentoDeErro` cria o
 * store, `autorizar()` chama `ativarTenant`). Sem isto, o proxy de
 * `src/lib/prisma.ts` lança "sem tenant ativo no contexto", exatamente
 * como em produção.
 *
 * Usar `tenantALS.run` (e não `enterWith`) é o que permite alternar
 * entre empresa A e empresa B no mesmo teste sem uma vazar na outra.
 */
export function comoEmpresa<T>(empresa: EmpresaDeTeste, fn: () => Promise<T>): Promise<T> {
  return tenantALS.run({ contextoTenant: null }, async () => {
    ativarTenant(empresa);
    return fn();
  });
}

/** Contexto de tenant já resolvido (para inspeção em asserções). */
export function contextoDe(empresa: EmpresaDeTeste): Promise<ContextoTenant> {
  return tenantALS.run({ contextoTenant: null }, async () => ativarTenant(empresa));
}

/** Busca as duas empresas do seed (Disk Pizza Rozeno e Empresa Teste B). */
export async function empresasDoSeed(): Promise<{ a: EmpresaDeTeste; b: EmpresaDeTeste }> {
  const plataforma = new PrismaClient({ datasources: { db: { url: garantirBancoDeTeste() } } });
  try {
    const empresas = await plataforma.empresa.findMany({
      where: { slug: { in: ["disk-pizza-rozeno", "empresa-teste-b"] } },
      select: { id: true, nome: true, slug: true, schemaBanco: true, databaseUrlSecreta: true },
      orderBy: { slug: "asc" },
    });
    const a = empresas.find((e) => e.slug === "disk-pizza-rozeno");
    const b = empresas.find((e) => e.slug === "empresa-teste-b");
    if (!a || !b) {
      throw new Error(
        "As empresas do seed não foram encontradas. Rode `npx prisma migrate deploy && npx prisma db seed` " +
          "contra o banco de TESTE antes destas suítes — elas dependem de dados reais (preços de pizza, " +
          "dois schemas de tenant), não de fixtures inventadas no arquivo de teste."
      );
    }
    return { a, b };
  } finally {
    await plataforma.$disconnect();
  }
}

/** Usuário fictício (só papel/id/nome) para as funções de negócio. */
export function usuarioDeTeste(papel = "CAIXA") {
  return { id: `usuario-teste-${papel}`, nome: `Teste ${papel}`, papel };
}

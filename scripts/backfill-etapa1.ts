/**
 * Backfill da ETAPA 1 — roda DEPOIS de `prisma migrate deploy` +
 * `npm run db:sync-tenants`. Preenche dados que a migration (DDL) não
 * consegue derivar sozinha, de forma idempotente e não destrutiva:
 *
 *  1. Tamanho.maxSabores:
 *       Média = 2, Grande = 2, Família = 3, demais = 1
 *     (só atualiza linhas que ainda não têm o valor alvo)
 *  2. ItemPedido.enviadoCozinhaEm = Pedido.criadoEm (para pedidos já existentes)
 *  3. Categoria.grupoSabores = "pizza" nas categorias que contêm sabores
 *
 * Não apaga nem altera dados de negócio. Roda em `public` (template de
 * novos tenants) e em cada schema de tenant.
 *
 * Uso: npm run db:backfill-etapa1
 */
import { PrismaClient } from "@prisma/client";

const ALVO: Record<string, number> = { Média: 2, Grande: 2, Família: 3 };

async function main() {
  const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL não configurada.");
    process.exit(1);
  }

  const plataforma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const empresas = await plataforma.empresa.findMany({
      select: { id: true, nome: true, schemaBanco: true, databaseUrlSecreta: true },
    });

    // public (template) + cada tenant provisionado neste servidor
    const schemas: { nome: string; schema: string }[] = [{ nome: "public (template)", schema: "public" }];
    for (const e of empresas) {
      if (e.schemaBanco && !e.databaseUrlSecreta) {
        schemas.push({ nome: e.nome, schema: e.schemaBanco });
      }
    }

    for (const { nome, schema } of schemas) {
      const q = (sql: string) => plataforma.$executeRawUnsafe(sql);
      const t = (sql: string) => plataforma.$queryRawUnsafe(sql);

      const tam = await q(`
        UPDATE "${schema}"."Tamanho" SET "maxSabores" = CASE "nome"
          WHEN 'Média' THEN 2 WHEN 'Grande' THEN 2 WHEN 'Família' THEN 3 ELSE 1 END
        WHERE "maxSabores" IS DISTINCT FROM (CASE "nome"
          WHEN 'Média' THEN 2 WHEN 'Grande' THEN 2 WHEN 'Família' THEN 3 ELSE 1 END)`);

      const itens = await q(`
        UPDATE "${schema}"."ItemPedido" ip SET "enviadoCozinhaEm" = p."criadoEm"
        FROM "${schema}"."Pedido" p
        WHERE ip."pedidoId" = p."id" AND ip."enviadoCozinhaEm" IS NULL`);

      const cats = await q(`
        UPDATE "${schema}"."Categoria" SET "grupoSabores" = 'pizza'
        WHERE "grupoSabores" IS NULL AND "id" IN (
          SELECT DISTINCT "categoriaId" FROM "${schema}"."Produto"
          WHERE "id" IN (SELECT "produtoId" FROM "${schema}"."ProdutoSabor"))`);

      const totalTamanhos = (await t(`SELECT count(*)::int AS n FROM "${schema}"."Tamanho"`)) as {
        n: number;
      }[];
      console.log(
        `- ${nome} (${schema}): Tamanho maxSabores ajustados=${tam}, ` +
          `ItemPedido enviadoCozinhaEm=${itens}, Categoria pizza=${cats} ` +
          `(total tamanhos=${totalTamanhos[0]?.n ?? 0})`
      );
    }

    console.log("\nBackfill ETAPA 1 concluído.");
  } finally {
    await plataforma.$disconnect();
  }
}

main().catch((e) => {
  console.error("Falha no backfill ETAPA 1:", e);
  process.exit(1);
});

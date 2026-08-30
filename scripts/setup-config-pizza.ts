import { PrismaClient } from "@prisma/client";
import { Client } from "pg";

/**
 * Garante que a regra de preço de pizza exista em TODAS as empresas.
 *
 * Idempotente e SEGURO para rodar em todo deploy: NÃO sobrescreve uma
 * configuração que a empresa já salvou (create-if-absent). Se a empresa
 * ainda não configurou, cria o padrão (acréscimo 10, permitir misturar)
 * para o PDV não ficar bloqueado. Não interrompe o build se alguma
 * empresa falhar.
 */
const VALOR_PADRAO = { acrescimoPorSaborPremium: 10, permitirMisturarDoceSalgada: true };

function urlComSchema(base: string, schema: string): string {
  const u = new URL(base);
  u.searchParams.set("schema", schema);
  return u.toString();
}

async function main() {
  const pgUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!pgUrl) {
    console.error("setup-config-pizza: DATABASE_URL/DIRECT_URL ausente — pulando.");
    return;
  }
  const pg = new Client(pgUrl);
  await pg.connect();
  const empresas = await pg.query(`select id, "schemaBanco" from public."Empresa" where "schemaBanco" is not null`);
  await pg.end();

  let falhas = 0;
  for (const e of empresas.rows) {
    const client = new PrismaClient({ datasources: { db: { url: urlComSchema(process.env.DATABASE_URL!, e.schemaBanco) } } });
    try {
      const existente = await client.configuracao.findUnique({
        where: { empresaId_chave: { empresaId: e.id, chave: "pizza" } },
      });
      if (existente) {
        console.log(`OK ${e.schemaBanco}: regra pizza já configurada (mantida)`);
        continue;
      }
      await client.configuracao.create({
        data: { empresaId: e.id, chave: "pizza", valor: JSON.stringify(VALOR_PADRAO) },
      });
      console.log(`OK ${e.schemaBanco}: regra pizza criada (padrão)`);
    } catch (err) {
      falhas++;
      console.error(`FALHA ${e.schemaBanco}:`, (err as Error).message);
    } finally {
      await client.$disconnect();
    }
  }
  console.log(falhas ? `setup-config-pizza concluído com ${falhas} falha(s).` : "setup-config-pizza concluído.");
}

main().catch((e) => console.error("setup-config-pizza ERRO GERAL:", e.message));

const bcrypt = require("bcryptjs");
const { Client } = require("pg");

async function main() {
  const client = new Client({
    connectionString:
      "postgresql://postgres.mqtyznchfxxbhxyjcycd:NovaS4nha%40PedidoFlow2026!@aws-0-us-east-2.pooler.supabase.com:5432/postgres?pgbouncer=true",
  });

  await client.connect();

  const hash = bcrypt.hashSync("rozeno2026", 12);

  const result = await client.query(
    'UPDATE "Usuario" SET "senhaHash" = $1 WHERE "email" LIKE $2',
    [hash, "%@rozeno.com.br"]
  );

  console.log("Linhas atualizadas:", result.rowCount);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

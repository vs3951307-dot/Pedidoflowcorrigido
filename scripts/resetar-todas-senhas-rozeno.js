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
    'UPDATE "Usuario" SET "senhaHash" = $1 WHERE "email" = ANY($2)',
    [
      hash,
      [
        "admin@rozeno.com.br",
        "rozeno@rozeno.com.br",
        "ari@gmail.com",
        "cozinha@gmail.com",
        "garcom@gmail.com",
        "marlon@gmail.com",
        "samuel@gmail.com",
      ],
    ]
  );

  console.log("Linhas atualizadas:", result.rowCount);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

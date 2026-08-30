const { Client } = require("pg");

async function main() {
  const client = new Client({
    host: "aws-0-us-east-2.pooler.supabase.com",
    port: 5432,
    user: "postgres.mqtyznchfxxbhxyjcycd",
    password: "NovaS4nha@PedidoFlow2026!",
    database: "postgres",
  });

  await client.connect();

  // Check current state
  const check = await client.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'Produto' AND column_name = 'preco'"
  );
  console.log("Produto.preco:", check.rows);

  // Check migration record
  const migration = await client.query(
    "SELECT * FROM _prisma_migrations WHERE migration_name = '20260808000000_monetario_float_to_decimal'"
  );
  console.log("Migration:", migration.rows);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

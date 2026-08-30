const { Client } = require("pg");
const crypto = require("crypto");

async function main() {
  const client = new Client({
    connectionString:
      "postgresql://postgres.mqtyznchfxxbhxyjcycd:NovaS4nha%40PedidoFlow2026!@aws-0-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true",
  });

  await client.connect();

  // Check if migration record exists
  const existing = await client.query(
    "SELECT * FROM _prisma_migrations WHERE migration_name = '20260808000000_monetario_float_to_decimal'"
  );

  if (existing.rowCount > 0) {
    console.log("Migration ja registrada.");
    await client.end();
    return;
  }

  // Generate checksum
  const checksum = crypto.createHash("sha256").update("manual-migration").digest("hex");

  // Insert migration record
  await client.query(
    `INSERT INTO _prisma_migrations (id, migration_name, checksum, finished_at, logs, rolled_back_at, started_at, applied_steps_count)
     VALUES ($1, $2, $3, NOW(), NULL, NULL, NOW(), 1)`,
    ["20260808000000", "20260808000000_monetario_float_to_decimal", checksum]
  );

  console.log("Migration registrada com sucesso!");

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

const { Client } = require("pg");

async function main() {
  const client = new Client({
    connectionString:
      "postgresql://postgres.mqtyznchfxxbhxyjcycd:NovaS4nha%40PedidoFlow2026!@aws-0-us-east-2.pooler.supabase.com:5432/postgres?pgbouncer=true",
  });

  await client.connect();

  // Check all users
  const result = await client.query(
    'SELECT id, email, nome, papel FROM "Usuario" ORDER BY "email"'
  );

  console.log("Total de usuarios:", result.rowCount);
  result.rows.forEach((r) => console.log(`  ${r.email} (${r.papel}) - ${r.nome}`));

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

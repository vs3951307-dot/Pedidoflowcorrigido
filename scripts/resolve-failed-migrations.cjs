const { Client } = require("pg");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const r = await client.query(
      `UPDATE _prisma_migrations SET rolled_back_at = NOW()
       WHERE migration_name = $1 AND finished_at IS NULL AND rolled_back_at IS NULL`,
      ["20260825190000_sabor_fotoUrl"]
    );
    console.log("Resolved:", r.rowCount, "row(s)");
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

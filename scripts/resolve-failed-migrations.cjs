const { Client } = require("pg");

const FAILED_MIGRATIONS = [
  "20260825190000_sabor_fotoUrl",
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    for (const name of FAILED_MIGRATIONS) {
      const r = await client.query(
        `UPDATE _prisma_migrations
         SET finished_at = NOW(), rolled_back_at = NULL
         WHERE migration_name = $1 AND finished_at IS NULL`,
        [name]
      );
      if (r.rowCount > 0) {
        console.log(`Marked as applied: ${name} (${r.rowCount} row)`);
      } else {
        console.log(`Already resolved: ${name}`);
      }
    }

    const addCol = await client.query(`
      DO $$ BEGIN
        ALTER TABLE "Sabor" ADD COLUMN "fotoUrl" TEXT;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);
    console.log("Ensured fotoUrl column exists on Sabor table");
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

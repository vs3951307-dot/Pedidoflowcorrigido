/**
 * Resolve failed Prisma migrations directly via SQL.
 * Roda ANTES de prisma migrate deploy para desbloquear o banco.
 */
import { PrismaClient } from "@prisma/client";

const MIGRATIONS_TO_RESOLVE = [
  "20260825190000_sabor_fotoUrl",
];

async function main() {
  const prisma = new PrismaClient();
  try {
    for (const name of MIGRATIONS_TO_RESOLVE) {
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE _prisma_migrations SET rolled_back_at = NOW() WHERE migration_name = $1 AND finished_at IS NULL AND rolled_back_at IS NULL`,
          name
        );
        console.log(`Resolved: ${name}`);
      } catch (e) {
        console.log(`Skip ${name}: ${e instanceof Error ? e.message : e}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("resolve-failed-migrations failed:", e);
  process.exit(1);
});

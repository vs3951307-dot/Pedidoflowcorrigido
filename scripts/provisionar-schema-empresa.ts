/**
 * CLI: `npm run db:provisionar-tenant -- <nome_do_schema>`
 * A lógica real está em `src/lib/tenant-provisionamento.ts` (reaproveitada
 * também por `POST /api/superadmin/empresas`).
 */
import { provisionarSchemaEmpresa } from "@/lib/tenant-provisionamento";

const schemaArg = process.argv[2];
if (!schemaArg) {
  console.error("Uso: npm run db:provisionar-tenant -- <nome_do_schema>");
  process.exit(1);
}
// DDL prefere a conexão DIRETA (Neon/Supabase usam pooler para a app).
const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL não configurada.");
  process.exit(1);
}

provisionarSchemaEmpresa(databaseUrl, schemaArg)
  .then((r) => console.log(`Schema "${r.schema}" provisionado com ${r.tabelasCriadas.length} tabelas.`))
  .catch((e) => {
    console.error("Falha ao provisionar schema:", e);
    process.exit(1);
  });

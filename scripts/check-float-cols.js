const { Client } = require("pg");

async function main() {
  const client = new Client({
    connectionString:
      "postgresql://postgres.mqtyznchfxxbhxyjcycd:NovaS4nha%40PedidoFlow2026!@aws-0-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true",
  });

  await client.connect();

  // Find all Float columns that should be Decimal
  const floatCols = await client.query(
    `SELECT table_schema, table_name, column_name, data_type 
     FROM information_schema.columns 
     WHERE data_type = 'real' 
     AND table_schema IN ('public', 'tenant_disk_pizza_rozeno', 'tenant_fabricadebladoelias', 'tenant_breinha', 'tenant_validacao_deploy')
     AND column_name IN ('preco', 'valor', 'total', 'troco', 'saldoInicial', 'taxaEntrega', 'trocoPara', 'precoUnit', 'custoUnitario', 'valorTotal', 'gorjeta')
     ORDER BY table_schema, table_name, column_name`
  );

  console.log("Float columns that should be Decimal:");
  floatCols.rows.forEach((r) => console.log(`  ${r.table_schema}.${r.table_name}.${r.column_name}: ${r.data_type}`));

  // Check if _prisma_migrations has our migration
  const migration = await client.query(
    "SELECT * FROM _prisma_migrations WHERE migration_name = '20260808000000_monetario_float_to_decimal'"
  );
  console.log("\nMigration record:", migration.rows);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

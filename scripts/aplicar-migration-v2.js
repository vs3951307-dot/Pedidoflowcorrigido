const { Client } = require("pg");
const fs = require("fs");

async function main() {
  // Read migration SQL
  const migrationSql = fs.readFileSync(
    "prisma/migrations/20260808000000_monetario_float_to_decimal/migration.sql",
    "utf8"
  );

  const client = new Client({
    connectionString:
      "postgresql://postgres.mqtyznchfxxbhxyjcycd:NovaS4nha%40PedidoFlow2026!@aws-0-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true",
  });

  await client.connect();

  // Check if migration already applied
  const check = await client.query(
    "SELECT migration_name FROM _prisma_migrations WHERE migration_name = '20260808000000_monetario_float_to_decimal'"
  );

  if (check.rowCount > 0) {
    console.log("Migration ja foi aplicada anteriormente.");
    await client.end();
    return;
  }

  // Get all tenant schemas
  const schemas = await client.query(
    "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%'"
  );

  const allStatements = [
    // Public schema
    'ALTER TABLE "Plano" ALTER COLUMN "preco" TYPE DECIMAL(12,2) USING preco::DECIMAL(12,2)',
    'ALTER TABLE "Produto" ALTER COLUMN "preco" TYPE DECIMAL(12,2) USING preco::DECIMAL(12,2)',
    'ALTER TABLE "PrecoTamanho" ALTER COLUMN "valor" TYPE DECIMAL(12,2) USING valor::DECIMAL(12,2)',
    'ALTER TABLE "Adicional" ALTER COLUMN "preco" TYPE DECIMAL(12,2) USING preco::DECIMAL(12,2)',
    'ALTER TABLE "Pedido" ALTER COLUMN "taxaEntrega" TYPE DECIMAL(12,2) USING "taxaEntrega"::DECIMAL(12,2)',
    'ALTER TABLE "Pedido" ALTER COLUMN "trocoPara" TYPE DECIMAL(12,2) USING "trocoPara"::DECIMAL(12,2)',
    'ALTER TABLE "Pedido" ALTER COLUMN "total" TYPE DECIMAL(12,2) USING total::DECIMAL(12,2)',
    'ALTER TABLE "ItemPedido" ALTER COLUMN "precoUnit" TYPE DECIMAL(12,2) USING "precoUnit"::DECIMAL(12,2)',
    'ALTER TABLE "Pagamento" ALTER COLUMN "valor" TYPE DECIMAL(12,2) USING valor::DECIMAL(12,2)',
    'ALTER TABLE "Pagamento" ALTER COLUMN "troco" TYPE DECIMAL(12,2) USING troco::DECIMAL(12,2)',
    'ALTER TABLE "Caixa" ALTER COLUMN "saldoInicial" TYPE DECIMAL(12,2) USING "saldoInicial"::DECIMAL(12,2)',
    'ALTER TABLE "MovimentacaoCaixa" ALTER COLUMN "valor" TYPE DECIMAL(12,2) USING valor::DECIMAL(12,2)',
    'ALTER TABLE "EstoqueProduto" ALTER COLUMN "custoUnitario" TYPE DECIMAL(12,2) USING "custoUnitario"::DECIMAL(12,2)',
    'ALTER TABLE "MovimentacaoEstoque" ALTER COLUMN "valorTotal" TYPE DECIMAL(12,2) USING "valorTotal"::DECIMAL(12,2)',
    'ALTER TABLE "NotaFiscal" ALTER COLUMN "valor" TYPE DECIMAL(12,2) USING valor::DECIMAL(12,2)',
    'ALTER TABLE "Entregador" ALTER COLUMN "gorjeta" TYPE DECIMAL(12,2) USING gorjeta::DECIMAL(12,2)',
  ];

  // Add tenant schema statements
  for (const schema of schemas.rows) {
    const s = schema.schema_name;
    allStatements.push(`ALTER TABLE "${s}"."Produto" ALTER COLUMN "preco" TYPE DECIMAL(12,2) USING preco::DECIMAL(12,2)`);
    allStatements.push(`ALTER TABLE "${s}"."PrecoTamanho" ALTER COLUMN "valor" TYPE DECIMAL(12,2) USING valor::DECIMAL(12,2)`);
    allStatements.push(`ALTER TABLE "${s}"."Adicional" ALTER COLUMN "preco" TYPE DECIMAL(12,2) USING preco::DECIMAL(12,2)`);
    allStatements.push(`ALTER TABLE "${s}"."Pedido" ALTER COLUMN "taxaEntrega" TYPE DECIMAL(12,2) USING "taxaEntrega"::DECIMAL(12,2)`);
    allStatements.push(`ALTER TABLE "${s}"."Pedido" ALTER COLUMN "trocoPara" TYPE DECIMAL(12,2) USING "trocoPara"::DECIMAL(12,2)`);
    allStatements.push(`ALTER TABLE "${s}"."Pedido" ALTER COLUMN "total" TYPE DECIMAL(12,2) USING total::DECIMAL(12,2)`);
    allStatements.push(`ALTER TABLE "${s}"."ItemPedido" ALTER COLUMN "precoUnit" TYPE DECIMAL(12,2) USING "precoUnit"::DECIMAL(12,2)`);
    allStatements.push(`ALTER TABLE "${s}"."Pagamento" ALTER COLUMN "valor" TYPE DECIMAL(12,2) USING valor::DECIMAL(12,2)`);
    allStatements.push(`ALTER TABLE "${s}"."Pagamento" ALTER COLUMN "troco" TYPE DECIMAL(12,2) USING troco::DECIMAL(12,2)`);
    allStatements.push(`ALTER TABLE "${s}"."Caixa" ALTER COLUMN "saldoInicial" TYPE DECIMAL(12,2) USING "saldoInicial"::DECIMAL(12,2)`);
    allStatements.push(`ALTER TABLE "${s}"."MovimentacaoCaixa" ALTER COLUMN "valor" TYPE DECIMAL(12,2) USING valor::DECIMAL(12,2)`);
    allStatements.push(`ALTER TABLE "${s}"."EstoqueProduto" ALTER COLUMN "custoUnitario" TYPE DECIMAL(12,2) USING "custoUnitario"::DECIMAL(12,2)`);
    allStatements.push(`ALTER TABLE "${s}"."MovimentacaoEstoque" ALTER COLUMN "valorTotal" TYPE DECIMAL(12,2) USING "valorTotal"::DECIMAL(12,2)`);
    allStatements.push(`ALTER TABLE "${s}"."NotaFiscal" ALTER COLUMN "valor" TYPE DECIMAL(12,2) USING valor::DECIMAL(12,2)`);
    allStatements.push(`ALTER TABLE "${s}"."Entregador" ALTER COLUMN "gorjeta" TYPE DECIMAL(12,2) USING gorjeta::DECIMAL(12,2)`);
  }

  let success = 0;
  let failed = 0;

  for (const sql of allStatements) {
    try {
      await client.query(sql);
      success++;
    } catch (err) {
      failed++;
      console.log("FALHA:", sql.slice(0, 70) + "...", "-", err.message.slice(0, 80));
    }
  }

  console.log(`\nResultado: ${success} sucesso, ${failed} falha`);

  if (failed === 0) {
    // Record migration
    await client.query(
      "INSERT INTO _prisma_migrations (id, migration_name, checksum, finished_at) VALUES ($1, $2, $3, NOW())",
      ["20260808000000", "20260808000000_monetario_float_to_decimal", "manual"]
    );
    console.log("Migration registrada!");
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

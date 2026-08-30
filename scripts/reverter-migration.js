const { Client } = require("pg");

async function main() {
  const client = new Client({
    connectionString:
      "postgresql://postgres.mqtyznchfxxbhxyjcycd:NovaS4nha%40PedidoFlow2026!@aws-0-us-east-2.pooler.supabase.com:5432/postgres?pgbouncer=true",
  });

  await client.connect();

  // Find the tenant schema
  const schemas = await client.query(
    "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%'"
  );

  console.log("Schemas encontrados:", schemas.rowCount);
  schemas.rows.forEach((r) => console.log("  ", r.schema_name));

  const statements = [
    'ALTER TABLE "Plano" ALTER COLUMN "preco" TYPE FLOAT USING preco::FLOAT',
    'ALTER TABLE "Produto" ALTER COLUMN "preco" TYPE FLOAT USING preco::FLOAT',
    'ALTER TABLE "PrecoTamanho" ALTER COLUMN "valor" TYPE FLOAT USING valor::FLOAT',
    'ALTER TABLE "Adicional" ALTER COLUMN "preco" TYPE FLOAT USING preco::FLOAT',
    'ALTER TABLE "Pedido" ALTER COLUMN "total" TYPE FLOAT USING total::FLOAT',
    'ALTER TABLE "Pagamento" ALTER COLUMN "valor" TYPE FLOAT USING valor::FLOAT',
    'ALTER TABLE "Pagamento" ALTER COLUMN "troco" TYPE FLOAT USING troco::FLOAT',
    'ALTER TABLE "MovimentacaoCaixa" ALTER COLUMN "valor" TYPE FLOAT USING valor::FLOAT',
    'ALTER TABLE "NotaFiscal" ALTER COLUMN "valor" TYPE FLOAT USING valor::FLOAT',
  ];

  for (const sql of statements) {
    try {
      await client.query(sql);
      console.log("Revertido:", sql.slice(0, 60) + "...");
    } catch (err) {
      console.log("OK (talvez ja seja Float):", sql.slice(0, 50) + "...");
    }
  }

  // Also revert tenant schemas
  for (const schema of schemas.rows) {
    const schemaName = schema.schema_name;
    console.log("\nRevertendo schema:", schemaName);

    const tenantStatements = [
      `ALTER TABLE "${schemaName}"."Produto" ALTER COLUMN "preco" TYPE FLOAT USING preco::FLOAT`,
      `ALTER TABLE "${schemaName}"."PrecoTamanho" ALTER COLUMN "valor" TYPE FLOAT USING valor::FLOAT`,
      `ALTER TABLE "${schemaName}"."Adicional" ALTER COLUMN "preco" TYPE FLOAT USING preco::FLOAT`,
      `ALTER TABLE "${schemaName}"."Pedido" ALTER COLUMN "total" TYPE FLOAT USING total::FLOAT`,
      `ALTER TABLE "${schemaName}"."ItemPedido" ALTER COLUMN "precoUnit" TYPE FLOAT USING precoUnit::FLOAT`,
      `ALTER TABLE "${schemaName}"."Pagamento" ALTER COLUMN "valor" TYPE FLOAT USING valor::FLOAT`,
      `ALTER TABLE "${schemaName}"."Pagamento" ALTER COLUMN "troco" TYPE FLOAT USING troco::FLOAT`,
      `ALTER TABLE "${schemaName}"."Caixa" ALTER COLUMN "saldoInicial" TYPE FLOAT USING saldoInicial::FLOAT`,
      `ALTER TABLE "${schemaName}"."MovimentacaoCaixa" ALTER COLUMN "valor" TYPE FLOAT USING valor::FLOAT`,
      `ALTER TABLE "${schemaName}"."EstoqueProduto" ALTER COLUMN "custoUnitario" TYPE FLOAT USING custoUnitario::FLOAT`,
      `ALTER TABLE "${schemaName}"."MovimentacaoEstoque" ALTER COLUMN "valorTotal" TYPE FLOAT USING valorTotal::FLOAT`,
      `ALTER TABLE "${schemaName}"."NotaFiscal" ALTER COLUMN "valor" TYPE FLOAT USING valor::FLOAT`,
      `ALTER TABLE "${schemaName}"."Entregador" ALTER COLUMN "gorjeta" TYPE FLOAT USING gorjeta::FLOAT`,
    ];

    for (const sql of tenantStatements) {
      try {
        await client.query(sql);
        console.log("  Revertido:", sql.slice(0, 70) + "...");
      } catch (err) {
        // Column might not exist in this schema, that's OK
      }
    }
  }

  // Remove migration record
  try {
    await client.query(
      "DELETE FROM _prisma_migrations WHERE migration_name = '20260808000000_monetario_float_to_decimal'"
    );
    console.log("\nRemovido registro da migration.");
  } catch (err) {
    console.log("Registro de migration nao encontrado (OK)");
  }

  console.log("\nRevertido com sucesso!");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

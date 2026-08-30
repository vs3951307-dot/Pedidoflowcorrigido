const { Client } = require("pg");

async function main() {
  const client = new Client({
    connectionString:
      "postgresql://postgres.mqtyznchfxxbhxyjcycd:NovaS4nha%40PedidoFlow2026!@aws-0-us-east-2.pooler.supabase.com:5432/postgres?pgbouncer=true",
  });

  await client.connect();

  // Check if migration has been applied
  const check = await client.query(
    "SELECT migration_name FROM _prisma_migrations WHERE migration_name = '20260808000000_monetario_float_to_decimal'"
  );

  if (check.rowCount > 0) {
    console.log("Migration ja foi aplicada!");
    await client.end();
    return;
  }

  console.log("Aplicando migration...");

  const statements = [
    'ALTER TABLE "Plano" ALTER COLUMN "preco" TYPE DECIMAL(12,2) USING preco::DECIMAL(12,2)',
    'ALTER TABLE "Produto" ALTER COLUMN "preco" TYPE DECIMAL(12,2) USING preco::DECIMAL(12,2)',
    'ALTER TABLE "PrecoTamanho" ALTER COLUMN "valor" TYPE DECIMAL(12,2) USING valor::DECIMAL(12,2)',
    'ALTER TABLE "Adicional" ALTER COLUMN "preco" TYPE DECIMAL(12,2) USING preco::DECIMAL(12,2)',
    'ALTER TABLE "Pedido" ALTER COLUMN "taxaEntrega" TYPE DECIMAL(12,2) USING taxaEntrega::DECIMAL(12,2)',
    'ALTER TABLE "Pedido" ALTER COLUMN "trocoPara" TYPE DECIMAL(12,2) USING trocoPara::DECIMAL(12,2)',
    'ALTER TABLE "Pedido" ALTER COLUMN "total" TYPE DECIMAL(12,2) USING total::DECIMAL(12,2)',
    'ALTER TABLE "ItemPedido" ALTER COLUMN "precoUnit" TYPE DECIMAL(12,2) USING precoUnit::DECIMAL(12,2)',
    'ALTER TABLE "Pagamento" ALTER COLUMN "valor" TYPE DECIMAL(12,2) USING valor::DECIMAL(12,2)',
    'ALTER TABLE "Pagamento" ALTER COLUMN "troco" TYPE DECIMAL(12,2) USING troco::DECIMAL(12,2)',
    'ALTER TABLE "Caixa" ALTER COLUMN "saldoInicial" TYPE DECIMAL(12,2) USING saldoInicial::DECIMAL(12,2)',
    'ALTER TABLE "MovimentacaoCaixa" ALTER COLUMN "valor" TYPE DECIMAL(12,2) USING valor::DECIMAL(12,2)',
    'ALTER TABLE "EstoqueProduto" ALTER COLUMN "custoUnitario" TYPE DECIMAL(12,2) USING custoUnitario::DECIMAL(12,2)',
    'ALTER TABLE "MovimentacaoEstoque" ALTER COLUMN "valorTotal" TYPE DECIMAL(12,2) USING valorTotal::DECIMAL(12,2)',
    'ALTER TABLE "NotaFiscal" ALTER COLUMN "valor" TYPE DECIMAL(12,2) USING valor::DECIMAL(12,2)',
    'ALTER TABLE "Entregador" ALTER COLUMN "gorjeta" TYPE DECIMAL(12,2) USING gorjeta::DECIMAL(12,2)',
  ];

  for (const sql of statements) {
    try {
      await client.query(sql);
      console.log("OK:", sql.slice(0, 60) + "...");
    } catch (err) {
      console.error("ERRO:", sql.slice(0, 60) + "...", err.message);
    }
  }

  // Record migration
  await client.query(
    "INSERT INTO _prisma_migrations (id, migration_name, finished_at) VALUES ($1, $2, NOW())",
    ["20260808000000", "20260808000000_monetario_float_to_decimal"]
  );

  console.log("Migration aplicada com sucesso!");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

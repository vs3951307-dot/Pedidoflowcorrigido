const { Client } = require("pg");

async function main() {
  const client = new Client({
    host: "aws-0-us-east-2.pooler.supabase.com",
    port: 5432,
    user: "postgres.mqtyznchfxxbhxyjcycd",
    password: "NovaS4nha@PedidoFlow2026!",
    database: "postgres",
  });

  await client.connect();

  const statements = [
    'ALTER TABLE "Plano" ALTER COLUMN "preco" TYPE FLOAT USING preco::FLOAT',
    'ALTER TABLE "Produto" ALTER COLUMN "preco" TYPE FLOAT USING preco::FLOAT',
    'ALTER TABLE "PrecoTamanho" ALTER COLUMN "valor" TYPE FLOAT USING valor::FLOAT',
    'ALTER TABLE "Adicional" ALTER COLUMN "preco" TYPE FLOAT USING preco::FLOAT',
    'ALTER TABLE "Pedido" ALTER COLUMN "taxaEntrega" TYPE FLOAT USING "taxaEntrega"::FLOAT',
    'ALTER TABLE "Pedido" ALTER COLUMN "trocoPara" TYPE FLOAT USING "trocoPara"::FLOAT',
    'ALTER TABLE "Pedido" ALTER COLUMN "total" TYPE FLOAT USING total::FLOAT',
    'ALTER TABLE "ItemPedido" ALTER COLUMN "precoUnit" TYPE FLOAT USING "precoUnit"::FLOAT',
    'ALTER TABLE "Pagamento" ALTER COLUMN "valor" TYPE FLOAT USING valor::FLOAT',
    'ALTER TABLE "Pagamento" ALTER COLUMN "troco" TYPE FLOAT USING troco::FLOAT',
    'ALTER TABLE "Caixa" ALTER COLUMN "saldoInicial" TYPE FLOAT USING "saldoInicial"::FLOAT',
    'ALTER TABLE "MovimentacaoCaixa" ALTER COLUMN "valor" TYPE FLOAT USING valor::FLOAT',
    'ALTER TABLE "EstoqueProduto" ALTER COLUMN "custoUnitario" TYPE FLOAT USING "custoUnitario"::FLOAT',
    'ALTER TABLE "MovimentacaoEstoque" ALTER COLUMN "valorTotal" TYPE FLOAT USING "valorTotal"::FLOAT',
    'ALTER TABLE "NotaFiscal" ALTER COLUMN "valor" TYPE FLOAT USING valor::FLOAT',
  ];

  // Tenant schemas
  const tenants = ["tenant_disk_pizza_rozeno", "tenant_fabricadebladoelias", "tenant_breinha", "tenant_validacao_deploy"];

  for (const sql of statements) {
    try {
      await client.query(sql);
      console.log("OK:", sql.slice(0, 60) + "...");
    } catch (err) {
      console.log("ERRO:", sql.slice(0, 50) + "...", err.message.slice(0, 60));
    }
  }

  for (const tenant of tenants) {
    const tenantStatements = [
      `ALTER TABLE "${tenant}"."Produto" ALTER COLUMN "preco" TYPE FLOAT USING preco::FLOAT`,
      `ALTER TABLE "${tenant}"."PrecoTamanho" ALTER COLUMN "valor" TYPE FLOAT USING valor::FLOAT`,
      `ALTER TABLE "${tenant}"."Adicional" ALTER COLUMN "preco" TYPE FLOAT USING preco::FLOAT`,
      `ALTER TABLE "${tenant}"."Pedido" ALTER COLUMN "total" TYPE FLOAT USING total::FLOAT`,
      `ALTER TABLE "${tenant}"."ItemPedido" ALTER COLUMN "precoUnit" TYPE FLOAT USING "precoUnit"::FLOAT`,
      `ALTER TABLE "${tenant}"."Pagamento" ALTER COLUMN "valor" TYPE FLOAT USING valor::FLOAT`,
      `ALTER TABLE "${tenant}"."Pagamento" ALTER COLUMN "troco" TYPE FLOAT USING troco::FLOAT`,
      `ALTER TABLE "${tenant}"."Caixa" ALTER COLUMN "saldoInicial" TYPE FLOAT USING "saldoInicial"::FLOAT`,
      `ALTER TABLE "${tenant}"."MovimentacaoCaixa" ALTER COLUMN "valor" TYPE FLOAT USING valor::FLOAT`,
      `ALTER TABLE "${tenant}"."EstoqueProduto" ALTER COLUMN "custoUnitario" TYPE FLOAT USING "custoUnitario"::FLOAT`,
      `ALTER TABLE "${tenant}"."MovimentacaoEstoque" ALTER COLUMN "valorTotal" TYPE FLOAT USING "valorTotal"::FLOAT`,
      `ALTER TABLE "${tenant}"."NotaFiscal" ALTER COLUMN "valor" TYPE FLOAT USING valor::FLOAT`,
    ];

    for (const sql of tenantStatements) {
      try {
        await client.query(sql);
        console.log("OK:", sql.slice(0, 70) + "...");
      } catch (err) {
        // Column might not exist
      }
    }
  }

  // Remove migration record
  try {
    await client.query("DELETE FROM _prisma_migrations WHERE migration_name = '20260808000000_monetario_float_to_decimal'");
    console.log("Removido registro da migration.");
  } catch (err) {
    console.log("Registro nao encontrado (OK)");
  }

  await client.end();
  console.log("\nRevertido com sucesso!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

-- CreateTable
CREATE TABLE "ProdutoInsumo" (
    "empresaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "estoqueProdutoId" TEXT NOT NULL,
    "quantidadeNecessaria" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ProdutoInsumo_pkey" PRIMARY KEY ("produtoId", "estoqueProdutoId")
);

-- CreateIndex
CREATE INDEX "ProdutoInsumo_empresaId_idx" ON "ProdutoInsumo"("empresaId");

-- CreateIndex
CREATE INDEX "ProdutoInsumo_estoqueProdutoId_idx" ON "ProdutoInsumo"("estoqueProdutoId");

-- AddForeignKey
ALTER TABLE "ProdutoInsumo" ADD CONSTRAINT "ProdutoInsumo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoInsumo" ADD CONSTRAINT "ProdutoInsumo_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoInsumo" ADD CONSTRAINT "ProdutoInsumo_estoqueProdutoId_fkey" FOREIGN KEY ("estoqueProdutoId") REFERENCES "EstoqueProduto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

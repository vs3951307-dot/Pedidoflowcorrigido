-- DropForeignKey
ALTER TABLE "ItemPedido" DROP CONSTRAINT "ItemPedido_pedidoId_fkey";

-- AlterTable
ALTER TABLE "Adicional" ADD COLUMN     "categoriaId" TEXT;

-- AlterTable
ALTER TABLE "Categoria" ADD COLUMN     "grupoSabores" TEXT;

-- AlterTable
ALTER TABLE "ItemPedido" ADD COLUMN     "enviadoCozinhaEm" TIMESTAMP(3),
ADD COLUMN     "meioAMeio" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Tamanho" ADD COLUMN     "maxSabores" INTEGER NOT NULL DEFAULT 1;

-- AddForeignKey
ALTER TABLE "Adicional" ADD CONSTRAINT "Adicional_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPedido" ADD CONSTRAINT "ItemPedido_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

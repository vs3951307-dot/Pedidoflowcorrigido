-- AlterTable
ALTER TABLE "Categoria" ADD COLUMN     "ativo" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "NotaFiscal" ADD COLUMN     "documentoCaminho" TEXT,
ADD COLUMN     "documentoMime" TEXT,
ADD COLUMN     "documentoNome" TEXT;

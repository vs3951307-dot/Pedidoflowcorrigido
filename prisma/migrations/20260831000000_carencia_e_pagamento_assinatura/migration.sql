-- Carência de assinatura (7 dias corridos após o vencimento antes de
-- bloquear): coluna nova em Empresa (plataforma / public).
ALTER TABLE "Empresa" ADD COLUMN "carenciaAte" TIMESTAMP(3);

-- Auditoria do Super Admin com diff ANTES/DEPOIS (empresas editadas).
ALTER TABLE "Auditoria" ADD COLUMN "estadoAnterior" TEXT;
ALTER TABLE "Auditoria" ADD COLUMN "estadoNovo" TEXT;

-- Pagamentos de assinatura da empresa (plataforma / public) — registro
-- mantido pelo Super Admin; ao registrar, a empresa é reativada.
CREATE TABLE "AssinaturaPagamento" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "forma" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "moeda" TEXT NOT NULL DEFAULT 'BRL',
    "pagoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cicloDias" INTEGER NOT NULL DEFAULT 30,
    "idempotencyKey" TEXT,
    "registradoPor" TEXT,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssinaturaPagamento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssinaturaPagamento_empresaId_idempotencyKey_key"
    ON "AssinaturaPagamento"("empresaId", "idempotencyKey");

CREATE INDEX "AssinaturaPagamento_empresaId_idx" ON "AssinaturaPagamento"("empresaId");
CREATE INDEX "AssinaturaPagamento_pagoEm_idx" ON "AssinaturaPagamento"("pagoEm");

-- FK para Empresa (plataforma) — mesmo padrão das outras plataforma tables.
ALTER TABLE "AssinaturaPagamento"
    ADD CONSTRAINT "AssinaturaPagamento_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;